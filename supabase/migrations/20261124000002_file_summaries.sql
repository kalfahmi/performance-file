-- ملخص كل ملف (عدد الشواهد والتقدير الذاتي لكل عنصر) للحسابات التي يراها المستخدم.
-- تحتاجه قائمة «المعلمون» لعرض الجاهزية وعدد الشواهد.
-- المدير يرى الأعداد فقط لمعلميه المسندين حتى قبل الإرسال، لا الشواهد نفسها ولا بيانات الملف.

begin;

create function public.file_summaries()
returns table (user_id uuid, element smallint, evidence_count integer, rating smallint)
language sql stable security definer set search_path = public as $$
  select u.id, e.no::smallint,
    (select count(*)::int from public.evidence ev where ev.user_id = u.id and ev.element = e.no),
    coalesce((select r.rating from public.ratings r where r.user_id = u.id and r.element = e.no), 0)::smallint
  from public.users u
  cross join generate_series(1, 11) as e(no)
  where u.role = 'teacher' and public.can_see_user(u.id)
$$;

revoke all on function public.file_summaries() from public;
grant execute on function public.file_summaries() to authenticated;

commit;
