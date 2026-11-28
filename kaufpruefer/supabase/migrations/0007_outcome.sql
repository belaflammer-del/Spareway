-- 0007: Kaufausgang („Gespart“-Zähler) als neues Kaufakte-Modul
alter table public.kaufakte_modules drop constraint if exists kaufakte_modules_kind_check;
alter table public.kaufakte_modules
  add constraint kaufakte_modules_kind_check
  check (kind in ('chat_check','inspection','costs','image_match','snapshot','outcome'));
create index if not exists kaufakte_modules_user_kind_idx
  on public.kaufakte_modules (user_id, kind, created_at desc);
