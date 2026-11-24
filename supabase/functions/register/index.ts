// التسجيل الذاتي من شاشة الدخول: ينشئ حساب «معلم» مفعّلًا، ثم تسجّل الواجهة دخوله.
// الطلب: { name, username, password }   الرد: { id } أو { error }
// يُنشر بلا التحقق من الجلسة (Verify JWT = off)، لأن المسجّل لا يملك جلسة بعد.
// الدور ثابت (teacher) ولا يُقبل من الطلب. وعدد الحسابات محدود حتى لا يُستغل الرابط في إغراق النظام.
// ولا يُقبل تسجيل اسم موجود (بعد توحيد كتابته)، حتى لا يسجّل الشخص نفسه مرتين باسمي دخول مختلفين.
import { createAccount } from '../_shared/accounts.ts';
import { adminClient, handleError, HttpError, json, password, readBody, str } from '../_shared/common.ts';
import { normalizeName } from '../_shared/names.ts';

const MAX_ACCOUNTS = 300;

Deno.serve(async (req) => {
  const body = await readBody(req);
  if (body instanceof Response) return body;
  try {
    const db = adminClient();
    const { data: users, error } = await db.from('users').select('name');
    if (error) throw error;
    const count = users?.length ?? 0;
    if (count === 0) throw new HttpError(409, 'النظام لم يُعدّ بعد. يبدأ مسؤول النظام أولًا.');
    if (count >= MAX_ACCOUNTS) throw new HttpError(403, 'اكتمل عدد الحسابات. راجع مسؤول النظام.');

    const name = str(body.name, 'الاسم', 2, 120);
    if (name.split(/\s+/).filter(Boolean).length < 2) throw new HttpError(400, 'اكتب اسمك الكامل (الاسم الأول واسم العائلة على الأقل).');
    const key = normalizeName(name);
    if (users!.some((u) => normalizeName(u.name) === key)) {
      throw new HttpError(409, 'يوجد حساب بهذا الاسم. إن كان حسابك فادخل به، وإن نسيت بياناته فراجع مسؤول النظام.');
    }

    return json(await createAccount(db, {
      name,
      username: str(body.username, 'اسم المستخدم', 3, 60),
      password: password(body.password),
      role: 'teacher',
    }));
  } catch (e) {
    return handleError(e);
  }
});
