-- عند حذف حساب مدير: تبقى رسائله للمعلمين والدرجات التي وضعها لهم، ويُفرَّغ اسم المرسل أو واضع الدرجة
-- (تعرضه الواجهة «مدير محذوف»). كان الحذف يمسحها مع الحساب.
-- رسائل المعلم ودرجته تُحذف مع حسابه كما كانت (to_id وteacher_id بلا تغيير).

begin;

alter table public.messages drop constraint messages_from_id_fkey;
alter table public.messages alter column from_id drop not null;
alter table public.messages add constraint messages_from_id_fkey
  foreign key (from_id) references public.users (id) on delete set null;

alter table public.grades drop constraint grades_principal_id_fkey;
alter table public.grades alter column principal_id drop not null;
alter table public.grades add constraint grades_principal_id_fkey
  foreign key (principal_id) references public.users (id) on delete set null;

commit;
