-- أسماء المدارس المسجلة في النظام، لقائمة «المدرسة» المنسدلة في بيانات الملف.
-- تعيد الأسماء المختلفة فقط، دون أي بيانات أخرى من ملفات الآخرين.

begin;

create function public.school_names() returns setof text
language sql stable security definer set search_path = public as $$
  select distinct btrim(p.school)
  from public.profiles p
  join public.users u on u.id = p.user_id and u.active
  where public.my_role() is not null and btrim(p.school) <> ''
  order by 1
$$;

revoke all on function public.school_names() from public;
grant execute on function public.school_names() to authenticated;

commit;
