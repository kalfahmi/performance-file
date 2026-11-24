// التسجيل الذاتي من شاشة الدخول: ينشئ حسابًا مفعّلًا بالصفة المختارة، ثم تسجّل الواجهة دخوله.
// الطلب: { name, username, password, ownerType }   الرد: { id } أو { error }
// «مدير مدرسة» حسابه بدور principal (يرى المعلمين الذين يسندهم إليه مسؤول النظام فقط)، والبقية teacher.
// يُنشر بلا التحقق من الجلسة (Verify JWT = off)، لأن المسجّل لا يملك جلسة بعد.
// الدور لا يُقبل من الطلب، بل يُستنتج من الصفة. وعدد الحسابات محدود حتى لا يُستغل الرابط في إغراق النظام.
// ولا يُقبل تسجيل اسم موجود (بعد توحيد كتابته)، حتى لا يسجّل الشخص نفسه مرتين باسمي دخول مختلفين.
import { createAccount } from '../_shared/accounts.ts';
import { adminClient, handleError, HttpError, json, password, readBody, str } from '../_shared/common.ts';
import { normalizeName } from '../_shared/names.ts';

const MAX_ACCOUNTS = 300;
const OWNER_TYPES = ['معلم', 'وكيل مدرسة', 'موجه طلابي', 'مدير مدرسة'];

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
    if (users!.some((u: { name: string }) => normalizeName(u.name) === key)) {
      throw new HttpError(409, 'يوجد حساب بهذا الاسم. إن كان حسابك فادخل به، وإن نسيت بياناته فراجع مسؤول النظام.');
    }

    // بلا صفة (واجهة قديمة في ذاكرة المتصفح): معلم.
    const ownerType = body.ownerType === undefined || body.ownerType === '' ? 'معلم' : String(body.ownerType);
    if (!OWNER_TYPES.includes(ownerType)) throw new HttpError(400, 'اختر الصفة.');

    const created = await createAccount(db, {
      name,
      username: str(body.username, 'اسم المستخدم', 3, 60),
      password: password(body.password),
      role: ownerType === 'مدير مدرسة' ? 'principal' : 'teacher',
    });
    const { error: e3 } = await db.from('profiles').update({ owner_type: ownerType }).eq('user_id', created.id);
    if (e3) {
      await db.auth.admin.deleteUser(created.id);
      throw new HttpError(500, 'تعذر حفظ بيانات الحساب');
    }
    return json(created);
  } catch (e) {
    return handleError(e);
  }
});
