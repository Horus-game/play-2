-- ====== Migración: consolas personalizadas (PS4, PS Vita, Xbox One, etc.) ======
-- Pegar y ejecutar en: Supabase → SQL Editor → New query → Run.
-- Esto NO borra nada de lo que ya tenés. Crea una tabla nueva "plataformas"
-- donde se guardan las consolas que agregues a mano desde el sitio (las que
-- no están en la lista fija del código, como PS4, PS Vita, Xbox One, Xbox
-- Series, etc.), para que se vean igual en cualquier dispositivo.

create table if not exists plataformas (
  id text primary key,      -- slug único, ej: "ps4", "ps-vita"
  label text not null,      -- nombre a mostrar, ej: "PlayStation 4"
  icon text not null default '🎮'
);

alter table plataformas enable row level security;

drop policy if exists "lectura publica plataformas" on plataformas;
create policy "lectura publica plataformas" on plataformas for select using (true);

drop policy if exists "escritura logueados plataformas" on plataformas;
create policy "escritura logueados plataformas" on plataformas for all
  using (auth.role() = 'authenticated') with check (auth.role() = 'authenticated');
