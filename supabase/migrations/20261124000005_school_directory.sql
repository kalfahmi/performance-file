-- دليل المدارس: كل مدرسة سجّلها مدير في ملفه، مع اسم المدير وإدارة التعليم.
-- عند اختيار المعلم مدرسةً موجودة في الدليل يُكتب اسم مديرها تلقائيًا (ولا يُعدَّل)، وتُكتب إدارة التعليم.
-- لا يكشف شيئًا غير هذه الحقول الثلاثة.

begin;

create function public.school_directory()
returns table (school text, principal_name text, edu_office text)
language sql stable security definer set search_path = public as $$
  select distinct on (btrim(p.school)) btrim(p.school), u.name, btrim(p.edu_office)
  from public.profiles p
  join public.users u on u.id = p.user_id and u.role = 'principal' and u.active
  where public.my_role() is not null and btrim(p.school) <> ''
  order by btrim(p.school), p.updated_at desc
$$;

revoke all on function public.school_directory() from public;
grant execute on function public.school_directory() to authenticated;

commit;
