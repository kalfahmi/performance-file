// عمليات الحسابات التي تحتاج مفتاح service_role. لمسؤول النظام الفعّال فقط.
// الطلب: { action, ... } مع ترويسة Authorization: Bearer <جلسة المستخدم>
//   create          { name, username, password, role }  -> { id }
//   reset_password  { id, password }                     -> { ok }
//   set_active      { id, active }                       -> { ok }
//   delete          { id }                               -> { ok }
// تغيير المستخدم كلمة مروره بنفسه لا يمر من هنا: الواجهة تستدعي supabase.auth.updateUser.
import { createAccount } from '../_shared/accounts.ts';
import { adminClient, handleError, HttpError, json, password, readBody, role, str } from '../_shared/common.ts';

const UUID = /^[0-9a-f]{8}-[0-9a-f]{4}-[0-9a-f]{4}-[0-9a-f]{4}-[0-9a-f]{12}$/i;
// مدة «غير محدودة» لإيقاف الحساب في Auth (نحو ١٠٠ سنة).
const BAN_FOREVER = '876000h';

Deno.serve(async (req) => {
  const body = await readBody(req);
  if (body instanceof Response) return body;
  try {
    const db = adminClient();

    // التحقق من أن المستدعي مسؤول نظام فعّال.
    const jwt = (req.headers.get('Authorization') ?? '').replace(/^Bearer\s+/i, '');
    const { data: auth } = await db.auth.getUser(jwt);
    if (!auth?.user) throw new HttpError(401, 'انتهت الجلسة، سجّل الدخول من جديد');
    const { data: me } = await db.from('users').select('id, role, active').eq('id', auth.user.id).maybeSingle();
    if (!me || me.role !== 'admin' || !me.active) throw new HttpError(403, 'هذه العملية لمسؤول النظام فقط');

    const targetId = (): string => {
      const id = typeof body.id === 'string' ? body.id : '';
      if (!UUID.test(id)) throw new HttpError(400, 'معرّف الحساب غير صحيح');
      if (id === me.id) throw new HttpError(400, 'لا يمكن تنفيذ هذه العملية على حسابك أنت');
      return id;
    };

    switch (body.action) {
      case 'create':
        return json(await createAccount(db, {
          name: str(body.name, 'الاسم', 1, 120),
          username: str(body.username, 'اسم المستخدم', 1, 60),
          password: password(body.password),
          role: role(body.role),
        }));

      case 'reset_password': {
        const id = targetId();
        const { error } = await db.auth.admin.updateUserById(id, { password: password(body.password) });
        if (error) throw new HttpError(404, 'الحساب غير موجود');
        return json({ ok: true });
      }

      case 'set_active': {
        const id = targetId();
        if (typeof body.active !== 'boolean') throw new HttpError(400, 'قيمة التفعيل غير صحيحة');
        const { data: row, error } = await db.from('users').update({ active: body.active }).eq('id', id).select('id').maybeSingle();
        if (error || !row) throw new HttpError(404, 'الحساب غير موجود');
        // الإيقاف في Auth يمنع الدخول وتجديد الجلسة، والقواعد تمنع القراءة حتى قبل انتهاء الجلسة الحالية.
        await db.auth.admin.updateUserById(id, { ban_duration: body.active ? 'none' : BAN_FOREVER });
        return json({ ok: true });
      }

      case 'delete': {
        const id = targetId();
        // يحذف صفوف الحساب كلها (on delete cascade). ملفات التخزين تبقى حتى تُنقل أو تُحذف يدويًا.
        const { error } = await db.auth.admin.deleteUser(id);
        if (error) throw new HttpError(404, 'الحساب غير موجود');
        return json({ ok: true });
      }

      default:
        throw new HttpError(400, 'العملية غير معروفة');
    }
  } catch (e) {
    return handleError(e);
  }
});
