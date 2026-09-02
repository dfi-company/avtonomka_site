-- Автономка: вмикання/вимикання віртуальних товарів (адмінка).
-- Виконати ОДИН РАЗ у Supabase Dashboard -> SQL Editor -> New query -> Run.
-- Безпечно виконати повторно.
--
-- Додає active (за замовчуванням true - усі 209 наявних товарів лишаються
-- видимими, як і були). Публічний сайт (anon) відтепер бачить лише
-- active = true - вимкнений товар зникає з каталогу/сторінки товару/
-- sitemap.xml одразу після наступного перегенерування статичних сторінок
-- (щоденний автозапуск або ручний gh workflow run update.yml). Адмінка
-- (authenticated) бачить і керує всіма товарами, включно з вимкненими -
-- для цього додана окрема SELECT-політика, якої раніше не було.

alter table public.virtual_products add column if not exists active boolean not null default true;

drop policy if exists "anon can read virtual_products" on public.virtual_products;
create policy "anon can read virtual_products"
  on public.virtual_products for select
  to anon
  using (active = true);

drop policy if exists "authenticated can read virtual_products" on public.virtual_products;
create policy "authenticated can read virtual_products"
  on public.virtual_products for select
  to authenticated
  using (true);
