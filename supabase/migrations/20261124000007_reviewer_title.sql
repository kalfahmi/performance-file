-- صفة المسؤول المباشر في ملف المدير (مثل: مدير مكتب التعليم). واسمه في principal_name نفسه.
-- في ملفات المعلمين والوكلاء والموجهين يبقى المسؤول مدير المدرسة، فلا يُستخدم هذا الحقل.

begin;

alter table public.profiles add column reviewer_title text not null default '' check (char_length(reviewer_title) <= 150);

commit;
