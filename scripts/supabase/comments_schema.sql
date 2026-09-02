-- Автономка: таблиця коментарів клієнтів під товарами.
-- Виконати ОДИН РАЗ у Supabase Dashboard → SQL Editor → New query → Run.
-- Безпечно запускати повторно (усі команди IF NOT EXISTS / OR REPLACE),
-- окрім create policy — якщо policy вже існує, Supabase скаже про помилку,
-- це нормально, значить схему вже застосовано.

create table if not exists public.comments (
  id           bigint generated always as identity primary key,
  product_id   text        not null,        -- products.json id, напр. "150674"
  author_name  text        not null,
  text         text        not null,
  approved     boolean     not null default false,
  created_at   timestamptz not null default now()
);

create index if not exists comments_product_id_idx
  on public.comments (product_id, approved);

alter table public.comments enable row level security;

-- Будь-хто (анонімний відвідувач сайту) може залишити новий коментар,
-- але лише неопублікований (approved завжди false при вставці клієнтом) —
-- публікує лише адмін через модерацію.
create policy "anon can insert unapproved comments"
  on public.comments for insert
  to anon
  with check (approved = false);

-- Анонімний відвідувач бачить лише вже схвалені коментарі.
create policy "anon can read approved comments"
  on public.comments for select
  to anon
  using (approved = true);

-- Автентифікований адмін (вхід через Supabase Auth в admin.html) бачить усі —
-- і схвалені, і ті, що чекають модерації.
create policy "authenticated can read all comments"
  on public.comments for select
  to authenticated
  using (true);

-- Адмін може схвалювати (UPDATE approved) і видаляти коментарі.
create policy "authenticated can update comments"
  on public.comments for update
  to authenticated
  using (true)
  with check (true);

create policy "authenticated can delete comments"
  on public.comments for delete
  to authenticated
  using (true);
