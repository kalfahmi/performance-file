-- عناصر الأداء حسب صفة صاحب الملف: المعلم ١١ عنصرًا، والموجه الطلابي ١٣، والوكيل والمدير ١٩.
-- القوائم نفسها في lists.js. هنا يُرفع حد رقم العنصر إلى ١٩، وتعيد الملخصات عدد عناصر كل ملف حسب صفته.

begin;

alter table public.evidence drop constraint evidence_element_check;
alter table public.evidence add constraint evidence_element_check check (element between 1 and 19);
alter table public.ratings drop constraint ratings_element_check;
alter table public.ratings add constraint ratings_element_check check (element between 1 and 19);
alter table public.links drop constraint links_element_check;
alter table public.links add constraint links_element_check check (element between 1 and 19);

-- عدد العناصر حسب الصفة (يطابق ELEMENT_SETS في lists.js).
create function public.element_count(owner_type text) returns int
language sql immutable as $$
  select case owner_type
    when 'وكيل مدرسة' then 19
    when 'مدير مدرسة' then 19
    when 'موجه طلابي' then 13
    else 11
  end
$$;
grant execute on function public.element_count(text) to authenticated, service_role;

-- الملخصات تعيد صفة صاحب الملف، وعناصره بعددها الصحيح.
drop function public.file_summaries();
create function public.file_summaries()
returns table (user_id uuid, owner_type text, element smallint, evidence_count integer, rating smallint)
language sql stable security definer set search_path = public as $$
  select u.id, coalesce(p.owner_type, ''), e.no::smallint,
    (select count(*)::int from public.evidence ev where ev.user_id = u.id and ev.element = e.no),
    coalesce((select r.rating from public.ratings r where r.user_id = u.id and r.element = e.no), 0)::smallint
  from public.users u
  left join public.profiles p on p.user_id = u.id
  cross join lateral generate_series(1, public.element_count(p.owner_type)) as e(no)
  where u.role = 'teacher' and public.can_see_user(u.id)
$$;
revoke all on function public.file_summaries() from public;
grant execute on function public.file_summaries() to authenticated;

commit;
