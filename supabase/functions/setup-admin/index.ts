// إعداد مسؤول النظام الأول. يعمل مرة واحدة فقط: حين لا يوجد أي حساب.
// الطلب: { name, username, password }   الرد: { id } أو { error }
// يُنشر بلا التحقق من الجلسة: supabase functions deploy setup-admin --no-verify-jwt
import { createAccount } from '../_shared/accounts.ts';
import { adminClient, handleError, HttpError, json, password, readBody, str } from '../_shared/common.ts';

Deno.serve(async (req) => {
  const body = await readBody(req);
  if (body instanceof Response) return body;
  try {
    const db = adminClient();
    const { count, error } = await db.from('users').select('id', { count: 'exact', head: true });
    if (error) throw error;
    if ((count ?? 0) > 0) throw new HttpError(409, 'تم إعداد النظام من قبل');

    const result = await createAccount(db, {
      name: str(body.name, 'الاسم', 1, 120),
      username: str(body.username, 'اسم المستخدم', 1, 60),
      password: password(body.password),
      role: 'admin',
    });

    // إن سبق طلبٌ آخر هذا الطلب في اللحظة نفسها، يبقى الحساب الأقدم وحده.
    const { data: admins } = await db.from('users').select('id').order('created_at').order('id');
    if (admins && admins.length > 1 && admins[0].id !== result.id) {
      await db.auth.admin.deleteUser(result.id);
      throw new HttpError(409, 'تم إعداد النظام من قبل');
    }
    return json(result);
  } catch (e) {
    return handleError(e);
  }
});
