-- الاستعادة من النسخة الاحتياطية: يحتاج مسؤول النظام أن يعيد سجلات أنشأها غيره
-- (إرسال المعلم ملفه، ورسائل المدير، ودرجاته). القواعد السابقة تبقى كما هي لغير مسؤول النظام.

begin;

create policy submissions_admin_insert on public.submissions for insert to authenticated
  with check (public.is_admin());

drop policy messages_insert on public.messages;
create policy messages_insert on public.messages for insert to authenticated
  with check (public.is_admin() or (from_id = auth.uid() and public.can_message(to_id)));

drop policy grades_insert on public.grades;
create policy grades_insert on public.grades for insert to authenticated
  with check (public.is_admin() or (principal_id = auth.uid() and public.can_message(teacher_id)));

commit;
