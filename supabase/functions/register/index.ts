// التسجيل الذاتي من شاشة الدخول: ينشئ حساب «معلم» مفعّلًا، ثم تسجّل الواجهة دخوله.
// الطلب: { name, username, password }   الرد: { id } أو { error }
// يُنشر بلا التحقق من الجلسة (Verify JWT = off)، لأن المسجّل لا يملك جلسة بعد.
// الدور ثابت (teacher) ولا يُقبل من الطلب. وعدد الحسابات محدود حتى لا يُستغل الرابط في إغراق النظام.
import { createAccount } from '../_shared/accounts.ts';
import { adminClient, handleError, HttpError, json, password, readBody, str } from '../_shared/common.ts';

const MAX_ACCOUNTS = 300;

Deno.serve(async (req) => {
  const body = await readBody(req);
  if (body instanceof Response) return body;
  try {
    const db = adminClient();
    const { count, error } = await db.from('users').select('id', { count: 'exact', head: true });
    if (error) throw error;
    if ((count ?? 0) === 0) throw new HttpError(409, 'النظام لم يُعدّ بعد. يبدأ مسؤول النظام أولًا.');
    if ((count ?? 0) >= MAX_ACCOUNTS) throw new HttpError(403, 'اكتمل عدد الحسابات. راجع مسؤول النظام.');

    return json(await createAccount(db, {
      name: str(body.name, 'الاسم', 2, 120),
      username: str(body.username, 'اسم المستخدم', 3, 60),
      password: password(body.password),
      role: 'teacher',
    }));
  } catch (e) {
    return handleError(e);
  }
});
