-- «صفة صاحب الملف» (owner_type) يغيّرها مسؤول النظام فقط. تُحدَّد عند التسجيل من الخادم (service_role)،
-- أو عند إنشاء الحساب من مسؤول النظام. صاحب الملف لا يغيّرها من «بيانات الملف».

begin;

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
    if new.owner_type is not null then
      raise exception 'صفة صاحب الملف يغيّرها مسؤول النظام فقط';
    end if;
  else
    if new.principal_sig_path is distinct from old.principal_sig_path
       or (new.stamp_path is distinct from old.stamp_path and not own_principal) then
      raise exception 'توقيع المدير والختم يضيفهما مسؤول النظام أو المدير في ملفه';
    end if;
    if new.owner_type is distinct from old.owner_type then
      raise exception 'صفة صاحب الملف يغيّرها مسؤول النظام فقط';
    end if;
  end if;
  return new;
end $$;

commit;
