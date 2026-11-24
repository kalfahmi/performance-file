-- «ملفات سابقة»: عند تغيير صفة صاحب الملف (مثل ترقية معلم إلى وكيل) يحفظ مسؤول النظام الملف الحالي في أرشيف،
-- ويبدأ ملف جديد فارغ بعناصر الصفة الجديدة. الأرشيف للقراءة والطباعة فقط.
-- الشواهد المؤرشفة تبقى في جدول evidence وملفاتها في مكانها، ويربطها بالأرشيف العمود archive_id.
-- الملف الحالي = الشواهد التي archive_id فيها فارغ.

begin;

create table public.archives (
  id uuid primary key default gen_random_uuid(),
  user_id uuid not null references public.users (id) on delete cascade,
  owner_type text not null default '',
  profile jsonb not null default '{}'::jsonb,   -- نسخة من بيانات الملف وقت الأرشفة
  ratings jsonb not null default '[]'::jsonb,   -- [{element, rating}]
  links jsonb not null default '[]'::jsonb,     -- [{element, url}]
  created_at timestamptz not null default now()
);
create index archives_user_idx on public.archives (user_id);
alter table public.archives enable row level security;
grant select, insert, delete on public.archives to authenticated;
grant all on public.archives to service_role;

-- يقرؤه من يقرأ الملف، ويضيفه ويحذفه مسؤول النظام فقط.
create policy archives_select on public.archives for select to authenticated
  using (public.can_view_file(user_id));
create policy archives_admin_insert on public.archives for insert to authenticated
  with check (public.is_admin());
create policy archives_admin_delete on public.archives for delete to authenticated
  using (public.is_admin());

alter table public.evidence add column archive_id uuid references public.archives (id) on delete cascade;
create index evidence_archive_idx on public.evidence (archive_id);

-- الشواهد المؤرشفة للقراءة فقط (إلا لمسؤول النظام).
drop policy evidence_insert on public.evidence;
drop policy evidence_update on public.evidence;
drop policy evidence_delete on public.evidence;
create policy evidence_insert on public.evidence for insert to authenticated
  with check (public.can_edit_file(user_id) and (archive_id is null or public.is_admin()));
create policy evidence_update on public.evidence for update to authenticated
  using (public.can_edit_file(user_id) and (archive_id is null or public.is_admin()))
  with check (public.can_edit_file(user_id) and (archive_id is null or public.is_admin()));
create policy evidence_delete on public.evidence for delete to authenticated
  using (public.can_edit_file(user_id) and (archive_id is null or public.is_admin()));

-- الملخصات تعدّ شواهد الملف الحالي فقط.
create or replace function public.file_summaries()
returns table (user_id uuid, owner_type text, element smallint, evidence_count integer, rating smallint)
language sql stable security definer set search_path = public as $$
  select u.id, coalesce(p.owner_type, ''), e.no::smallint,
    (select count(*)::int from public.evidence ev where ev.user_id = u.id and ev.element = e.no and ev.archive_id is null),
    coalesce((select r.rating from public.ratings r where r.user_id = u.id and r.element = e.no), 0)::smallint
  from public.users u
  left join public.profiles p on p.user_id = u.id
  cross join lateral generate_series(1, public.element_count(p.owner_type)) as e(no)
  where u.role = 'teacher' and public.can_see_user(u.id)
$$;

-- يؤرشف الملف الحالي (الشواهد والتقديرات والروابط وبيانات الملف)، ثم يغيّر الصفة إن أُعطيت.
create function public.archive_file(target uuid, new_type text default null) returns uuid
language plpgsql security definer set search_path = public as $$
declare
  aid uuid;
  p public.profiles;
  r text;
begin
  if not public.is_admin() then
    raise exception 'أرشفة الملف لمسؤول النظام فقط';
  end if;
  select * into p from public.profiles where user_id = target;
  if not found then
    raise exception 'الملف غير موجود';
  end if;
  select role into r from public.users where id = target;
  insert into public.archives (user_id, owner_type, profile, ratings, links)
  values (
    target,
    coalesce(nullif(p.owner_type, ''), case when r = 'principal' then 'مدير مدرسة' else 'معلم' end),
    to_jsonb(p),
    coalesce((select jsonb_agg(jsonb_build_object('element', x.element, 'rating', x.rating)) from public.ratings x where x.user_id = target), '[]'::jsonb),
    coalesce((select jsonb_agg(jsonb_build_object('element', x.element, 'url', x.url)) from public.links x where x.user_id = target), '[]'::jsonb)
  )
  returning id into aid;
  update public.evidence set archive_id = aid where user_id = target and archive_id is null;
  delete from public.ratings where user_id = target;
  delete from public.links where user_id = target;
  if new_type is not null then
    update public.profiles set owner_type = new_type where user_id = target;
  end if;
  return aid;
end $$;
revoke all on function public.archive_file(uuid, text) from public;
grant execute on function public.archive_file(uuid, text) to authenticated;

commit;
