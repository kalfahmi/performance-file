-- ملف الأداء الوظيفي: الجداول وقواعد الصلاحيات (RLS) والتخزين.
-- يُنفَّذ مرة واحدة في محرر SQL في لوحة Supabase، أو عبر `supabase db push`.
-- لا يحتوي هذا الملف أي مفتاح سري.
--
-- الأدوار:
--   teacher   : يقرأ ويكتب ملفه فقط، ويرسله إلى المدير.
--   principal : يرى أسماء المعلمين المسندين إليه، ولا يفتح ملف المعلم إلا بعد إرساله.
--   admin     : يرى كل شيء ويكتب كل شيء.
-- الحساب الموقوف (active = false) لا يقرأ ولا يكتب شيئًا.

begin;

-- ============================================================
-- ١) الجداول
-- ============================================================

-- بيانات الحساب. المعرّف هو نفسه معرّف المستخدم في Supabase Auth.
create table public.users (
  id          uuid primary key references auth.users (id) on delete cascade,
  username    text not null unique check (char_length(username) between 1 and 60 and username !~ '\s'),
  name        text not null check (char_length(name) between 1 and 120),
  role        text not null check (role in ('teacher', 'principal', 'admin')),
  active      boolean not null default true,
  created_at  timestamptz not null default now()
);

-- بيانات الملف (صفحة «بيانات الملف»). مسارات الصور داخل حاوية images.
create table public.profiles (
  user_id             uuid primary key references public.users (id) on delete cascade,
  owner_type          text not null default '',
  owner_name          text not null default '',
  stage               text not null default '',
  subject             text not null default '',
  school              text not null default '',
  principal_name      text not null default '',
  edu_office          text not null default '',
  job_no              text not null default '',
  year                text not null default '',
  term                text not null default '',
  message             text not null default '' check (char_length(message) <= 2000),
  owner_sig_path      text,           -- يرفعه المعلم لنفسه
  principal_sig_path  text,           -- يرفعه مسؤول النظام فقط
  stamp_path          text,           -- يرفعه مسؤول النظام فقط
  updated_at          timestamptz not null default now(),
  -- كل مسار صورة يجب أن يقع داخل مجلد صاحب الملف
  check (owner_sig_path     is null or split_part(owner_sig_path, '/', 1)     = user_id::text),
  check (principal_sig_path is null or split_part(principal_sig_path, '/', 1) = user_id::text),
  check (stamp_path         is null or split_part(stamp_path, '/', 1)         = user_id::text)
);

-- الشواهد. الملف نفسه في حاوية evidence.
create table public.evidence (
  id           uuid primary key default gen_random_uuid(),
  user_id      uuid not null references public.users (id) on delete cascade,
  element      smallint not null check (element between 1 and 11),
  title        text not null check (char_length(title) between 1 and 200),
  description  text not null default '' check (char_length(description) <= 1000),
  file_path    text not null unique,
  file_name    text not null,
  mime         text not null,
  size         integer not null check (size > 0 and size <= 4 * 1024 * 1024),
  uploaded_at  timestamptz not null default now(),
  check (split_part(file_path, '/', 1) = user_id::text)
);
create index evidence_user_element_idx on public.evidence (user_id, element);

-- التقدير الذاتي لكل عنصر (٠ = لم يُقيَّم، ١ إلى ٥).
create table public.ratings (
  user_id     uuid not null references public.users (id) on delete cascade,
  element     smallint not null check (element between 1 and 11),
  rating      smallint not null check (rating between 0 and 5),
  updated_at  timestamptz not null default now(),
  primary key (user_id, element)
);

-- روابط Drive أو Docs لكل عنصر.
create table public.links (
  user_id     uuid not null references public.users (id) on delete cascade,
  element     smallint not null check (element between 1 and 11),
  url         text not null check (char_length(url) <= 300 and url ~ '^https://(drive|docs)\.google\.com/'),
  updated_at  timestamptz not null default now(),
  primary key (user_id, element)
);

-- إسناد المعلمين للمديرين.
create table public.access (
  principal_id  uuid not null references public.users (id) on delete cascade,
  teacher_id    uuid not null references public.users (id) on delete cascade,
  granted_at    timestamptz not null default now(),
  primary key (principal_id, teacher_id)
);
create index access_teacher_idx on public.access (teacher_id);

-- إرسال المعلم ملفه إلى المدير.
create table public.submissions (
  user_id  uuid primary key references public.users (id) on delete cascade,
  sent_at  timestamptz not null default now()
);

-- ============================================================
-- ٢) دوال مساعدة للقواعد
-- SECURITY DEFINER حتى لا تدخل القواعد في حلقة عند قراءة جدول users.
-- ============================================================

create function public.my_role() returns text
language sql stable security definer set search_path = public as $$
  select role from public.users where id = auth.uid() and active
$$;

create function public.is_admin() returns boolean
language sql stable security definer set search_path = public as $$
  select coalesce(public.my_role() = 'admin', false)
$$;

-- هل يرى المستخدم الحالي اسم الحساب target؟
-- نفسه، أو مسؤول النظام، أو مدير أُسند إليه هذا المعلم.
create function public.can_see_user(target uuid) returns boolean
language sql stable security definer set search_path = public as $$
  select case public.my_role()
    when 'admin' then true
    when 'teacher' then target = auth.uid()
    when 'principal' then target = auth.uid() or exists (
      select 1 from public.access a where a.principal_id = auth.uid() and a.teacher_id = target)
    else false
  end
$$;

-- هل يفتح المستخدم الحالي ملف target؟
-- نفسه، أو مسؤول النظام، أو مدير أُسند إليه المعلم وأرسل المعلم ملفه.
create function public.can_view_file(target uuid) returns boolean
language sql stable security definer set search_path = public as $$
  select case public.my_role()
    when 'admin' then true
    when 'teacher' then target = auth.uid()
    when 'principal' then exists (
      select 1 from public.access a
      join public.submissions s on s.user_id = a.teacher_id
      where a.principal_id = auth.uid() and a.teacher_id = target)
    else false
  end
$$;

-- هل يكتب المستخدم الحالي في ملف target؟ صاحب الملف المعلم، أو مسؤول النظام.
create function public.can_edit_file(target uuid) returns boolean
language sql stable security definer set search_path = public as $$
  select case public.my_role()
    when 'admin' then true
    when 'teacher' then target = auth.uid()
    else false
  end
$$;

revoke all on function public.my_role(), public.is_admin(), public.can_see_user(uuid),
  public.can_view_file(uuid), public.can_edit_file(uuid) from public;
grant execute on function public.my_role(), public.is_admin(), public.can_see_user(uuid),
  public.can_view_file(uuid), public.can_edit_file(uuid) to authenticated;

-- ============================================================
-- ٣) قيود لا تعبّر عنها القواعد وحدها
-- ============================================================

-- توقيع المدير والختم: مسؤول النظام فقط يغيّرهما.
create function public.guard_profile_admin_fields() returns trigger
language plpgsql set search_path = public as $$
begin
  if public.is_admin() or auth.uid() is null then
    return new;  -- مسؤول النظام، أو تنفيذ من الخادم بمفتاح service_role
  end if;
  if tg_op = 'INSERT' then
    if new.principal_sig_path is not null or new.stamp_path is not null then
      raise exception 'توقيع المدير والختم يضيفهما مسؤول النظام فقط';
    end if;
  elsif new.principal_sig_path is distinct from old.principal_sig_path
     or new.stamp_path is distinct from old.stamp_path then
    raise exception 'توقيع المدير والختم يضيفهما مسؤول النظام فقط';
  end if;
  return new;
end $$;

create trigger profiles_guard_admin_fields
  before insert or update on public.profiles
  for each row execute function public.guard_profile_admin_fields();

-- الإسناد يكون من مدير إلى معلم فقط.
create function public.check_access_roles() returns trigger
language plpgsql security definer set search_path = public as $$
begin
  if (select role from public.users where id = new.principal_id) is distinct from 'principal'
     or (select role from public.users where id = new.teacher_id) is distinct from 'teacher' then
    raise exception 'الإسناد يكون من حساب مدير إلى حساب معلم';
  end if;
  return new;
end $$;

create trigger access_check_roles
  before insert or update on public.access
  for each row execute function public.check_access_roles();

-- updated_at يُحدَّث تلقائيًا.
create function public.touch_updated_at() returns trigger
language plpgsql as $$
begin
  new.updated_at := now();
  return new;
end $$;

create trigger profiles_touch before update on public.profiles for each row execute function public.touch_updated_at();
create trigger ratings_touch  before update on public.ratings  for each row execute function public.touch_updated_at();
create trigger links_touch    before update on public.links    for each row execute function public.touch_updated_at();

-- ============================================================
-- ٤) تفعيل RLS والقواعد
-- ============================================================

alter table public.users       enable row level security;
alter table public.profiles    enable row level security;
alter table public.evidence    enable row level security;
alter table public.ratings     enable row level security;
alter table public.links       enable row level security;
alter table public.access      enable row level security;
alter table public.submissions enable row level security;

-- الزوار غير المسجلين لا يصلون إلى شيء.
revoke all on all tables in schema public from anon;

-- users: القراءة حسب can_see_user. التعديل لمسؤول النظام فقط.
-- إنشاء الحسابات وحذفها وتغيير كلمات المرور تتم عبر Edge Function بمفتاح service_role.
create policy users_select on public.users for select to authenticated
  using (public.can_see_user(id));
create policy users_admin_update on public.users for update to authenticated
  using (public.is_admin()) with check (public.is_admin());

-- profiles
create policy profiles_select on public.profiles for select to authenticated
  using (public.can_view_file(user_id));
create policy profiles_insert on public.profiles for insert to authenticated
  with check (public.can_edit_file(user_id));
create policy profiles_update on public.profiles for update to authenticated
  using (public.can_edit_file(user_id)) with check (public.can_edit_file(user_id));

-- evidence
create policy evidence_select on public.evidence for select to authenticated
  using (public.can_view_file(user_id));
create policy evidence_insert on public.evidence for insert to authenticated
  with check (public.can_edit_file(user_id));
create policy evidence_update on public.evidence for update to authenticated
  using (public.can_edit_file(user_id)) with check (public.can_edit_file(user_id));
create policy evidence_delete on public.evidence for delete to authenticated
  using (public.can_edit_file(user_id));

-- ratings
create policy ratings_select on public.ratings for select to authenticated
  using (public.can_view_file(user_id));
create policy ratings_insert on public.ratings for insert to authenticated
  with check (public.can_edit_file(user_id));
create policy ratings_update on public.ratings for update to authenticated
  using (public.can_edit_file(user_id)) with check (public.can_edit_file(user_id));

-- links
create policy links_select on public.links for select to authenticated
  using (public.can_view_file(user_id));
create policy links_insert on public.links for insert to authenticated
  with check (public.can_edit_file(user_id));
create policy links_update on public.links for update to authenticated
  using (public.can_edit_file(user_id)) with check (public.can_edit_file(user_id));
create policy links_delete on public.links for delete to authenticated
  using (public.can_edit_file(user_id));

-- access: المدير يرى إسناداته، ومسؤول النظام يديرها كلها.
create policy access_select on public.access for select to authenticated
  using (public.is_admin() or (public.my_role() = 'principal' and principal_id = auth.uid()));
create policy access_admin_insert on public.access for insert to authenticated
  with check (public.is_admin());
create policy access_admin_delete on public.access for delete to authenticated
  using (public.is_admin());

-- submissions: المعلم يرسل ملفه فقط. المدير يرى إرسال معلميه المسندين حتى يُفعَّل زر «فتح الملف».
create policy submissions_select on public.submissions for select to authenticated
  using (public.can_see_user(user_id));
create policy submissions_insert on public.submissions for insert to authenticated
  with check (public.my_role() = 'teacher' and user_id = auth.uid());
create policy submissions_update on public.submissions for update to authenticated
  using (public.my_role() = 'teacher' and user_id = auth.uid())
  with check (public.my_role() = 'teacher' and user_id = auth.uid());
create policy submissions_admin_delete on public.submissions for delete to authenticated
  using (public.is_admin());

-- ============================================================
-- ٥) التخزين (Supabase Storage)
-- evidence : ملفات الشواهد، حتى 4 MB.       المسار: <user_id>/<uuid>-<اسم الملف>
-- images   : التوقيعات والختم، حتى 1 MB.     المسار: <user_id>/owner_sig.<ext> | principal_sig.<ext> | stamp.<ext>
-- كلا الحاويتين خاصة، والقراءة بروابط موقّعة.
-- ============================================================

insert into storage.buckets (id, name, public, file_size_limit, allowed_mime_types) values
  ('evidence', 'evidence', false, 4 * 1024 * 1024, null),
  ('images',   'images',   false, 1024 * 1024, array['image/png', 'image/jpeg', 'image/webp'])
on conflict (id) do nothing;

-- يُرجع صاحب الملف من أول جزء في المسار، أو null إن لم يكن معرّفًا صالحًا.
create function public.path_owner(object_name text) returns uuid
language plpgsql immutable as $$
begin
  return split_part(object_name, '/', 1)::uuid;
exception when others then
  return null;
end $$;

create policy evidence_files_select on storage.objects for select to authenticated
  using (bucket_id = 'evidence' and public.can_view_file(public.path_owner(name)));
create policy evidence_files_insert on storage.objects for insert to authenticated
  with check (bucket_id = 'evidence' and public.can_edit_file(public.path_owner(name)));
create policy evidence_files_delete on storage.objects for delete to authenticated
  using (bucket_id = 'evidence' and public.can_edit_file(public.path_owner(name)));

create policy images_select on storage.objects for select to authenticated
  using (bucket_id = 'images' and public.can_view_file(public.path_owner(name)));
-- توقيع المعلم: المعلم لنفسه. توقيع المدير والختم: مسؤول النظام فقط.
create policy images_insert on storage.objects for insert to authenticated
  with check (bucket_id = 'images' and (
    public.is_admin()
    or (public.my_role() = 'teacher' and public.path_owner(name) = auth.uid()
        and split_part(name, '/', 2) ~ '^owner_sig\.(png|jpe?g|webp)$')));
create policy images_update on storage.objects for update to authenticated
  using (bucket_id = 'images' and (
    public.is_admin()
    or (public.my_role() = 'teacher' and public.path_owner(name) = auth.uid()
        and split_part(name, '/', 2) ~ '^owner_sig\.(png|jpe?g|webp)$')))
  with check (bucket_id = 'images' and (
    public.is_admin()
    or (public.my_role() = 'teacher' and public.path_owner(name) = auth.uid()
        and split_part(name, '/', 2) ~ '^owner_sig\.(png|jpe?g|webp)$')));
create policy images_delete on storage.objects for delete to authenticated
  using (bucket_id = 'images' and (
    public.is_admin()
    or (public.my_role() = 'teacher' and public.path_owner(name) = auth.uid()
        and split_part(name, '/', 2) ~ '^owner_sig\.(png|jpe?g|webp)$')));

commit;
