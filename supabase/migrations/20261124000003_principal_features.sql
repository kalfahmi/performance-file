-- ميزات المدير:
--   ١) توقيع المدير وختمه في ملفه هو (owner_sig_path وstamp_path في صفه بجدول profiles)، يرفعهما المدير أو مسؤول النظام،
--      ويُستخدمان لكل معلم مسند إليه. لا يراهما المعلم (لا يملك صلاحية قراءة ملف المدير).
--   ٢) رسائل من المدير (أو مسؤول النظام) إلى المعلم.
--   ٣) الدرجة المستحقة من ٥ يضعها المدير لمعلميه المسندين، ولا يراها المعلم.

begin;

-- ============================================================
-- ١) المدير يقرأ ملفه ويعدّله (لرفع توقيعه وختمه)
-- ============================================================

create or replace function public.can_view_file(target uuid) returns boolean
language sql stable security definer set search_path = public as $$
  select case public.my_role()
    when 'admin' then true
    when 'teacher' then target = auth.uid()
    when 'principal' then target = auth.uid() or exists (
      select 1 from public.access a
      join public.submissions s on s.user_id = a.teacher_id
      where a.principal_id = auth.uid() and a.teacher_id = target)
    else false
  end
$$;

create or replace function public.can_edit_file(target uuid) returns boolean
language sql stable security definer set search_path = public as $$
  select case public.my_role()
    when 'admin' then true
    when 'teacher' then target = auth.uid()
    when 'principal' then target = auth.uid()
    else false
  end
$$;

-- الختم: مسؤول النظام، أو المدير في ملفه هو. توقيع المدير القديم في ملف المعلم (principal_sig_path): مسؤول النظام فقط.
create or replace function public.guard_profile_admin_fields() returns trigger
language plpgsql set search_path = public as $$
declare
  own_principal boolean := public.my_role() = 'principal' and new.user_id = auth.uid();
begin
  if public.is_admin() or auth.uid() is null then
    return new;
  end if;
  if tg_op = 'INSERT' then
    if new.principal_sig_path is not null or (new.stamp_path is not null and not own_principal) then
      raise exception 'توقيع المدير والختم يضيفهما مسؤول النظام أو المدير في ملفه';
    end if;
  elsif new.principal_sig_path is distinct from old.principal_sig_path
     or (new.stamp_path is distinct from old.stamp_path and not own_principal) then
    raise exception 'توقيع المدير والختم يضيفهما مسؤول النظام أو المدير في ملفه';
  end if;
  return new;
end $$;

-- التخزين: المدير يرفع توقيعه وختمه في مجلده.
drop policy images_insert on storage.objects;
drop policy images_update on storage.objects;
drop policy images_delete on storage.objects;

create function public.can_write_image(object_name text) returns boolean
language sql stable security definer set search_path = public as $$
  select public.is_admin()
    or (public.my_role() = 'teacher' and public.path_owner(object_name) = auth.uid()
        and split_part(object_name, '/', 2) ~ '^owner_sig\.(png|jpe?g|webp)$')
    or (public.my_role() = 'principal' and public.path_owner(object_name) = auth.uid()
        and split_part(object_name, '/', 2) ~ '^(owner_sig|stamp)\.(png|jpe?g|webp)$')
$$;
revoke all on function public.can_write_image(text) from public;
grant execute on function public.can_write_image(text) to authenticated, service_role;

create policy images_insert on storage.objects for insert to authenticated
  with check (bucket_id = 'images' and public.can_write_image(name));
create policy images_update on storage.objects for update to authenticated
  using (bucket_id = 'images' and public.can_write_image(name))
  with check (bucket_id = 'images' and public.can_write_image(name));
create policy images_delete on storage.objects for delete to authenticated
  using (bucket_id = 'images' and public.can_write_image(name));

-- المدير المسند للمعلم (لعرض توقيعه وختمه في ملف المعلم عند مسؤول النظام والمدير فقط).
create function public.principal_of(teacher uuid) returns uuid
language sql stable security definer set search_path = public as $$
  select a.principal_id from public.access a
  where a.teacher_id = teacher
    and (public.is_admin() or a.principal_id = auth.uid())
  order by a.granted_at
  limit 1
$$;
revoke all on function public.principal_of(uuid) from public;
grant execute on function public.principal_of(uuid) to authenticated;

-- ============================================================
-- ٢) الرسائل
-- ============================================================

create table public.messages (
  id          uuid primary key default gen_random_uuid(),
  from_id     uuid not null references public.users (id) on delete cascade,
  to_id       uuid not null references public.users (id) on delete cascade,
  body        text not null check (char_length(body) between 1 and 2000),
  created_at  timestamptz not null default now(),
  read_at     timestamptz
);
create index messages_to_idx on public.messages (to_id, created_at desc);
create index messages_from_idx on public.messages (from_id, created_at desc);

create function public.can_message(target uuid) returns boolean
language sql stable security definer set search_path = public as $$
  select public.is_admin() or (public.my_role() = 'principal' and exists (
    select 1 from public.access a where a.principal_id = auth.uid() and a.teacher_id = target))
$$;
revoke all on function public.can_message(uuid) from public;
grant execute on function public.can_message(uuid) to authenticated;

alter table public.messages enable row level security;
create policy messages_select on public.messages for select to authenticated
  using (public.my_role() is not null and (to_id = auth.uid() or from_id = auth.uid() or public.is_admin()));
create policy messages_insert on public.messages for insert to authenticated
  with check (from_id = auth.uid() and public.can_message(to_id));
-- المستلم يعلّم الرسالة مقروءة فقط (الصلاحية على عمود read_at وحده).
create policy messages_mark_read on public.messages for update to authenticated
  using (to_id = auth.uid() and public.my_role() is not null)
  with check (to_id = auth.uid());
create policy messages_delete on public.messages for delete to authenticated
  using (from_id = auth.uid() or public.is_admin());

revoke all on public.messages from authenticated, anon;
grant select, insert, delete on public.messages to authenticated;
grant update (read_at) on public.messages to authenticated;
grant select, insert, update, delete on public.messages to service_role;

-- ============================================================
-- ٣) الدرجة المستحقة من ٥
-- ============================================================

create table public.grades (
  teacher_id   uuid primary key references public.users (id) on delete cascade,
  grade        numeric(3, 2) not null check (grade >= 0 and grade <= 5),
  principal_id uuid not null references public.users (id) on delete cascade,
  updated_at   timestamptz not null default now()
);

alter table public.grades enable row level security;
create policy grades_select on public.grades for select to authenticated
  using (public.can_message(teacher_id));
create policy grades_insert on public.grades for insert to authenticated
  with check (principal_id = auth.uid() and public.can_message(teacher_id));
create policy grades_update on public.grades for update to authenticated
  using (public.can_message(teacher_id))
  with check (principal_id = auth.uid() and public.can_message(teacher_id));
create policy grades_delete on public.grades for delete to authenticated
  using (public.can_message(teacher_id));

create trigger grades_touch before update on public.grades for each row execute function public.touch_updated_at();

revoke all on public.grades from anon;
grant select, insert, update, delete on public.grades to authenticated, service_role;

commit;
