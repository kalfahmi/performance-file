// إنشاء حساب كامل: مستخدم في Auth، وصف في users، وصف فارغ في profiles.
import type { SupabaseClient } from 'npm:@supabase/supabase-js@2.45.4';
import { normalizeUsername, usernameToEmail } from './auth-email.ts';
import { HttpError, type Role } from './common.ts';

export async function createAccount(
  db: SupabaseClient,
  input: { name: string; username: string; password: string; role: Role },
): Promise<{ id: string }> {
  const username = normalizeUsername(input.username);
  if (!username || /\s/.test(username) || username.length > 60) {
    throw new HttpError(400, 'اسم المستخدم من ١ إلى ٦٠ حرفًا بلا مسافات');
  }

  const { data: taken } = await db.from('users').select('id').eq('username', username).maybeSingle();
  if (taken) throw new HttpError(409, 'اسم المستخدم مستخدم من قبل');

  const { data, error } = await db.auth.admin.createUser({
    email: await usernameToEmail(username),
    password: input.password,
    email_confirm: true, // لا يُرسل بريد تأكيد
  });
  if (error || !data.user) {
    throw new HttpError(error?.status === 422 ? 409 : 500, 'تعذر إنشاء الحساب');
  }
  const id = data.user.id;

  const { error: e1 } = await db.from('users').insert({ id, username, name: input.name, role: input.role });
  const { error: e2 } = e1 ? { error: null } : await db.from('profiles').insert({ user_id: id, owner_name: input.name });
  if (e1 || e2) {
    await db.auth.admin.deleteUser(id); // يحذف صف users وprofiles تلقائيًا (on delete cascade)
    throw new HttpError(500, 'تعذر حفظ بيانات الحساب');
  }
  return { id };
}
