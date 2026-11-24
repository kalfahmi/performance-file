import { PGlite } from '@electric-sql/pglite';
import fs from 'node:fs';

// يُطبَّق كل ملف في مجلد migrations بترتيب اسمه، كما في Supabase.
const dir = process.argv[2];
const migrations = fs.readdirSync(dir).filter(f => f.endsWith('.sql')).sort()
  .map(f => fs.readFileSync(dir + '/' + f, 'utf8'));
const db = new PGlite();

// بديل مبسّط لما توفره Supabase: الأدوار، auth.uid()، وجداول التخزين.
// مثل مشاريع Supabase الجديدة: لا صلاحيات تلقائية على الجداول، ولا تنفيذ تلقائي للدوال.
await db.exec(`
  create role anon nologin; create role authenticated nologin; create role service_role nologin bypassrls;
  alter default privileges revoke execute on functions from public;
  create schema auth; create schema storage;
  create table auth.users (id uuid primary key);
  create function auth.uid() returns uuid language sql stable as
    $$ select nullif(current_setting('request.jwt.claim.sub', true), '')::uuid $$;
  create table storage.buckets (id text primary key, name text, public boolean, file_size_limit bigint, allowed_mime_types text[]);
  create table storage.objects (id uuid primary key default gen_random_uuid(), bucket_id text references storage.buckets(id), name text, unique (bucket_id, name));
  alter table storage.objects enable row level security;
  grant usage on schema auth, storage to authenticated, anon, service_role;
  grant execute on function auth.uid() to authenticated, anon, service_role;
  grant usage on schema public to authenticated, anon, service_role;
  grant select, insert, update, delete on storage.objects to authenticated, service_role;
`);
for (const m of migrations) await db.exec(m);

const U = {
  A:  '00000000-0000-0000-0000-00000000000a',
  P:  '00000000-0000-0000-0000-00000000000b',
  P2: '00000000-0000-0000-0000-00000000000c',
  T1: '00000000-0000-0000-0000-000000000001',
  T2: '00000000-0000-0000-0000-000000000002',
  T3: '00000000-0000-0000-0000-000000000003',
};
await db.exec(`
  insert into auth.users values ${Object.values(U).map(id => `('${id}')`).join(',')};
  insert into public.users (id, username, name, role, active) values
    ('${U.A}','admin','مسؤول','admin',true), ('${U.P}','principal','مدير','principal',true),
    ('${U.P2}','principal2','مدير ٢','principal',true),
    ('${U.T1}','t1','معلم ١','teacher',true), ('${U.T2}','t2','معلم ٢','teacher',true),
    ('${U.T3}','t3','معلم موقوف','teacher',false);
  insert into public.access values ('${U.P}','${U.T1}', now());
  insert into public.profiles (user_id, owner_name) values ('${U.T1}','معلم ١'), ('${U.T2}','معلم ٢'), ('${U.T3}','معلم ٣');
  insert into public.evidence (user_id, element, title, file_path, file_name, mime, size) values
    ('${U.T1}',1,'شاهد','${U.T1}/a.pdf','a.pdf','application/pdf',100);
  insert into storage.objects (bucket_id, name) values ('evidence','${U.T1}/a.pdf');
`);

async function as(who, sql) {
  await db.exec('begin');
  try {
    if (who === 'anon') await db.exec(`set local role anon`);
    else if (who === 'service') await db.exec(`set local role service_role`);
    else await db.exec(`set local role authenticated; select set_config('request.jwt.claim.sub', '${U[who]}', true);`);
    const r = await db.query(sql);
    await db.exec('commit');
    return { rows: r.rows, affected: r.affectedRows };
  } catch (e) {
    await db.exec('rollback');
    return { error: e.message };
  }
}

let pass = 0, fail = 0;
async function expect(name, who, sql, check) {
  const r = await as(who, sql);
  const ok = check(r);
  ok ? pass++ : fail++;
  console.log(`${ok ? 'PASS' : 'FAIL'}  ${name}${ok ? '' : '  -> ' + JSON.stringify(r)}`);
}
const count = n => r => !r.error && Number(r.rows[0].n) === n;
const denied = r => !!r.error;
const none = r => !r.error && r.affected === 0;

// رؤية الحسابات
await expect('المعلم يرى حسابه فقط', 'T1', 'select count(*) n from users', count(1));
await expect('المدير يرى نفسه والمعلم المسند', 'P', 'select count(*) n from users', count(2));
await expect('مدير آخر لا يرى المعلم', 'P2', `select count(*) n from users where id='${U.T1}'`, count(0));
await expect('مسؤول النظام يرى الجميع', 'A', 'select count(*) n from users', count(6));
await expect('الحساب الموقوف لا يرى شيئًا', 'T3', 'select count(*) n from users', count(0));
await expect('الحساب الموقوف لا يقرأ ملفه', 'T3', 'select count(*) n from profiles', count(0));
await expect('الزائر غير المسجل ممنوع', 'anon', 'select count(*) n from users', denied);

// المدير قبل الإرسال وبعده
await expect('المدير لا يفتح الملف قبل الإرسال', 'P', `select count(*) n from profiles where user_id='${U.T1}'`, count(0));
await expect('المدير لا يرى الشواهد قبل الإرسال', 'P', `select count(*) n from evidence`, count(0));
await expect('المدير لا يرسل ملفًا', 'P', `insert into submissions (user_id) values ('${U.P}')`, denied);
await expect('المعلم لا يرسل ملف غيره', 'T1', `insert into submissions (user_id) values ('${U.T2}')`, denied);
await expect('المعلم يرسل ملفه', 'T1', `insert into submissions (user_id) values ('${U.T1}')`, r => !r.error);
await expect('المدير يرى الإرسال', 'P', `select count(*) n from submissions`, count(1));
await expect('المدير يفتح الملف بعد الإرسال', 'P', `select count(*) n from profiles where user_id='${U.T1}'`, count(1));
await expect('المدير يرى الشواهد بعد الإرسال', 'P', `select count(*) n from evidence`, count(1));
await expect('المدير يرى ملف الشاهد بعد الإرسال', 'P', `select count(*) n from storage.objects`, count(1));
await expect('مدير آخر لا يفتح الملف بعد الإرسال', 'P2', `select count(*) n from profiles`, count(0));
await expect('المدير لا يعدّل ملف المعلم', 'P', `update profiles set owner_name='x' where user_id='${U.T1}'`, none);
await expect('المدير لا يرى ملف معلم غير مسند', 'P', `select count(*) n from profiles where user_id='${U.T2}'`, count(0));

// المعلم وملفه
await expect('المعلم يعدّل بياناته', 'T1', `update profiles set owner_name='جديد' where user_id='${U.T1}'`, r => r.affected === 1);
await expect('المعلم لا يعدّل ملف غيره', 'T1', `update profiles set owner_name='x' where user_id='${U.T2}'`, none);
await expect('المعلم لا يرى ملف غيره', 'T2', `select count(*) n from evidence`, count(0));
await expect('المعلم لا يضع توقيع المدير', 'T1', `update profiles set principal_sig_path='${U.T1}/principal_sig.png' where user_id='${U.T1}'`, denied);
await expect('المعلم لا يضع الختم', 'T1', `update profiles set stamp_path='${U.T1}/stamp.png' where user_id='${U.T1}'`, denied);
await expect('المعلم يضع توقيعه', 'T1', `update profiles set owner_sig_path='${U.T1}/owner_sig.png' where user_id='${U.T1}'`, r => r.affected === 1);
await expect('مسؤول النظام يضع توقيع المدير والختم', 'A', `update profiles set principal_sig_path='${U.T1}/principal_sig.png', stamp_path='${U.T1}/stamp.png' where user_id='${U.T1}'`, r => r.affected === 1);
await expect('المعلم لا يضيف شاهدًا لغيره', 'T1', `insert into evidence (user_id, element, title, file_path, file_name, mime, size) values ('${U.T2}',1,'x','${U.T2}/x','x','a',1)`, denied);
await expect('المعلم لا يربط شاهده بملف غيره', 'T1', `insert into evidence (user_id, element, title, file_path, file_name, mime, size) values ('${U.T1}',1,'x','${U.T2}/x','x','a',1)`, denied);
await expect('حجم الشاهد لا يتجاوز 4 MB', 'T1', `insert into evidence (user_id, element, title, file_path, file_name, mime, size) values ('${U.T1}',1,'x','${U.T1}/big','x','a',5000000)`, denied);
await expect('المعلم يقيّم نفسه', 'T1', `insert into ratings (user_id, element, rating) values ('${U.T1}',3,4)`, r => !r.error);
await expect('التقدير خارج المدى مرفوض', 'T1', `insert into ratings (user_id, element, rating) values ('${U.T1}',4,9)`, denied);
await expect('رابط غير Drive مرفوض', 'T1', `insert into links (user_id, element, url) values ('${U.T1}',1,'https://evil.example.com/x')`, denied);
await expect('رابط Drive مقبول', 'T1', `insert into links (user_id, element, url) values ('${U.T1}',1,'https://drive.google.com/drive/folders/abc')`, r => !r.error);

// الحسابات والإسناد
await expect('المعلم لا يغيّر دوره', 'T1', `update users set role='admin' where id='${U.T1}'`, none);
await expect('المعلم لا يسند نفسه', 'T1', `insert into access values ('${U.P}','${U.T2}', now())`, denied);
await expect('المدير لا يسند لنفسه', 'P', `insert into access values ('${U.P}','${U.T2}', now())`, denied);
await expect('مسؤول النظام يسند معلمًا', 'A', `insert into access values ('${U.P2}','${U.T2}', now())`, r => !r.error);
await expect('الإسناد من معلم إلى معلم مرفوض', 'A', `insert into access values ('${U.T1}','${U.T2}', now())`, denied);
await expect('مسؤول النظام يوقف حسابًا', 'A', `update users set active=false where id='${U.T2}'`, r => r.affected === 1);

// التخزين
await expect('المعلم يرفع توقيعه', 'T1', `insert into storage.objects (bucket_id, name) values ('images','${U.T1}/owner_sig.png')`, r => !r.error);
await expect('المعلم لا يرفع الختم', 'T1', `insert into storage.objects (bucket_id, name) values ('images','${U.T1}/stamp.png')`, denied);
await expect('المعلم لا يرفع توقيع المدير', 'T1', `insert into storage.objects (bucket_id, name) values ('images','${U.T1}/principal_sig.png')`, denied);
await expect('مسؤول النظام يرفع الختم', 'A', `insert into storage.objects (bucket_id, name) values ('images','${U.T1}/stamp.png')`, r => !r.error);
await expect('المعلم لا يرفع في مجلد غيره', 'T1', `insert into storage.objects (bucket_id, name) values ('evidence','${U.T2}/x.pdf')`, denied);
await expect('مسار غير صالح مرفوض', 'T1', `insert into storage.objects (bucket_id, name) values ('evidence','bad/x.pdf')`, denied);
await expect('المعلم يرفع شاهده', 'T1', `insert into storage.objects (bucket_id, name) values ('evidence','${U.T1}/b.pdf')`, r => !r.error);
await expect('مدير غير مسند لا يقرأ ملفات المعلم', 'P2', `select count(*) n from storage.objects`, count(0));
await expect('المدير لا يحذف ملف المعلم', 'P', `delete from storage.objects where name='${U.T1}/a.pdf'`, none);

// ملخصات الملفات (file_summaries)
await expect('المعلم يرى ملخص ملفه فقط', 'T1', `select count(*) n from file_summaries()`, count(11));
await expect('ملخص المعلم يعدّ شواهده', 'T1', `select sum(evidence_count) n from file_summaries()`, count(1));
await expect('المدير يرى ملخص معلمه المسند فقط', 'P', `select count(distinct user_id) n from file_summaries()`, count(1));
await expect('مسؤول النظام يرى ملخصات كل المعلمين', 'A', `select count(distinct user_id) n from file_summaries()`, count(3));
await expect('الحساب الموقوف لا يرى ملخصًا', 'T2', `select count(*) n from file_summaries()`, count(0));
await expect('الزائر لا يستدعي الملخصات', 'anon', `select count(*) n from file_summaries()`, denied);

// ملف المدير: توقيعه وختمه (migration 0003)
await expect('مسؤول النظام ينشئ ملف المدير', 'A', `insert into profiles (user_id, owner_name) values ('${U.P}','مدير')`, r => !r.error);
await expect('المدير يقرأ ملفه', 'P', `select count(*) n from profiles where user_id='${U.P}'`, count(1));
await expect('المدير يضع توقيعه وختمه في ملفه', 'P', `update profiles set owner_sig_path='${U.P}/owner_sig.png', stamp_path='${U.P}/stamp.png' where user_id='${U.P}'`, r => r.affected === 1);
await expect('المدير لا يضع الختم في ملف المعلم', 'P', `update profiles set stamp_path='${U.T1}/stamp.png' where user_id='${U.T1}'`, none);
await expect('المعلم لا يقرأ ملف المدير', 'T1', `select count(*) n from profiles where user_id='${U.P}'`, count(0));
await expect('المدير يرفع ختمه', 'P', `insert into storage.objects (bucket_id, name) values ('images','${U.P}/stamp.png')`, r => !r.error);
await expect('المدير لا يرفع في مجلد المعلم', 'P', `insert into storage.objects (bucket_id, name) values ('images','${U.T1}/stamp.png')`, denied);
await expect('المعلم لا يرى ختم المدير', 'T1', `select count(*) n from storage.objects where name='${U.P}/stamp.png'`, count(0));
await expect('مسؤول النظام يرفع توقيع معلم', 'A', `insert into storage.objects (bucket_id, name) values ('images','${U.T1}/owner_sig.jpg')`, r => !r.error);
await expect('المدير يعرف أنه مدير معلمه', 'P', `select count(*) n from (select principal_of('${U.T1}') p) x where p='${U.P}'`, count(1));
await expect('المعلم لا يعرف مديره من الدالة', 'T1', `select count(*) n from (select principal_of('${U.T1}') p) x where p is not null`, count(0));

// الرسائل
await expect('المدير يرسل ملاحظة لمعلمه', 'P', `insert into messages (from_id, to_id, body) values ('${U.P}','${U.T1}','أحسنت')`, r => !r.error);
await expect('المدير لا يرسل لمعلم غير مسند', 'P', `insert into messages (from_id, to_id, body) values ('${U.P}','${U.T2}','x')`, denied);
await expect('لا يرسل باسم غيره', 'P', `insert into messages (from_id, to_id, body) values ('${U.A}','${U.T1}','x')`, denied);
await expect('المعلم لا يرسل للمدير', 'T1', `insert into messages (from_id, to_id, body) values ('${U.T1}','${U.P}','x')`, denied);
await expect('المعلم يقرأ رسائله', 'T1', `select count(*) n from messages`, count(1));
await expect('مدير آخر لا يرى الرسالة', 'P2', `select count(*) n from messages`, count(0));
await expect('المعلم يعلّم الرسالة مقروءة', 'T1', `update messages set read_at=now() where to_id='${U.T1}'`, r => r.affected === 1);
await expect('المعلم لا يغيّر نص الرسالة', 'T1', `update messages set body='تعديل' where to_id='${U.T1}'`, denied);
await expect('مسؤول النظام يرسل لأي معلم', 'A', `insert into messages (from_id, to_id, body) values ('${U.A}','${U.T1}','تنبيه')`, r => !r.error);

// الدرجة المستحقة من ٥
await expect('المدير يضع درجة معلمه', 'P', `insert into grades (teacher_id, grade, principal_id) values ('${U.T1}', 4.5, '${U.P}')`, r => !r.error);
await expect('المدير يعدّل الدرجة', 'P', `update grades set grade=4 where teacher_id='${U.T1}'`, r => r.affected === 1);
await expect('الدرجة فوق ٥ مرفوضة', 'P', `update grades set grade=6 where teacher_id='${U.T1}'`, denied);
await expect('المدير لا يضع درجة لمعلم غير مسند', 'P', `insert into grades (teacher_id, grade, principal_id) values ('${U.T2}', 3, '${U.P}')`, denied);
await expect('المعلم لا يرى درجته', 'T1', `select count(*) n from grades`, count(0));
await expect('مدير آخر لا يرى الدرجة', 'P2', `select count(*) n from grades where teacher_id='${U.T1}'`, count(0));
await expect('مسؤول النظام يرى الدرجات', 'A', `select count(*) n from grades`, count(1));

// دوال الخادم (service_role)
await expect('دوال الخادم تعدّ الحسابات', 'service', 'select count(*) n from users', count(6));
await expect('اسم مستخدم مكرر مرفوض', 'service', `insert into users (id, username, name, role) values ('${U.T3}','dup','x','teacher')`, denied);
await expect('دوال الخادم تضع توقيع المدير', 'service', `update profiles set principal_sig_path='${U.T2}/principal_sig.png' where user_id='${U.T2}'`, r => r.affected === 1);
await expect('دوال الخادم تحذف إسنادًا', 'service', `delete from access where principal_id='${U.P2}'`, r => r.affected === 1);

console.log(`\n${pass} نجح، ${fail} فشل`);
process.exit(fail ? 1 : 0);
