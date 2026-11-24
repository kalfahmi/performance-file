-- منح صلاحيات الجداول والدوال لأدوار Supabase.
-- المشاريع الجديدة في Supabase لا تمنح هذه الصلاحيات تلقائيًا للجداول المنشأة من محرر SQL،
-- فبدونها يرفض الخادم كل طلب من الواجهة ومن دوال الخادم.
-- الحماية الفعلية تبقى في قواعد RLS: هذا الملف يفتح الباب، والقواعد تحدد من يمر.

begin;

-- authenticated: المستخدم المسجل. القواعد تحدد الصفوف والعمليات المسموحة.
grant select, insert, update, delete on all tables in schema public to authenticated;

-- service_role: دوال الخادم (Edge Functions). يتجاوز RLS أصلًا.
grant select, insert, update, delete on all tables in schema public to service_role;

-- anon: الزائر غير المسجل لا يصل إلى أي جدول.
revoke all on all tables in schema public from anon;

-- الدوال المساعدة تُستدعى داخل القواعد والمشغّلات، فيحتاج الدوران تنفيذها.
grant execute on function public.my_role(), public.is_admin(), public.can_see_user(uuid),
  public.can_view_file(uuid), public.can_edit_file(uuid), public.path_owner(text)
  to authenticated, service_role;

commit;
