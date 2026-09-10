-- ====== PS2 GamePass · Esquema Supabase ======
-- Pegar y ejecutar en: Supabase → SQL Editor → New query → Run.
-- Después correr seed.sql para cargar los discos/juegos actuales.

create table if not exists discos (
  id text primary key,
  nombre text not null,
  subtitulo text,
  color text,
  plataforma text not null default 'ps2'   -- ps2, ps1, xbox, wii, switch, pc, etc. (ver PLATFORMS en script.js)
);

-- Consolas agregadas a mano por el usuario (ej: PS4, PS Vita, Xbox One, etc.)
-- que no están en la lista fija PLATFORMS de script.js. Se guardan acá para
-- que se vean iguales en cualquier navegador/dispositivo que abra el sitio.
create table if not exists plataformas (
  id text primary key,      -- slug único, ej: "ps4", "ps-vita"
  label text not null,      -- nombre a mostrar, ej: "PlayStation 4"
  icon text not null default '🎮'
);

create table if not exists juegos (
  id text primary key,
  nombre text not null,
  disco text not null references discos(id) on delete cascade,
  categoria text not null default 'Sin categoría',
  genero_original text,
  dificultad int not null default 3,
  jugadores text not null default '1',
  resena text,
  estado text not null default 'no_jugado' check (estado in ('no_jugado','en_curso','finalizado')),
  caratula text,          -- URL de imagen pegada a mano (no se almacena el archivo, solo el link)
  shot1 text,             -- URL de captura de pantalla 1 pegada a mano (opcional)
  shot2 text,             -- URL de captura de pantalla 2 pegada a mano (opcional)
  link_descarga text      -- URL de descarga del juego (ISO, etc.)
);

create table if not exists config (
  id int primary key default 1 check (id = 1),  -- fila única
  link_descarga_general text
);

-- ====== Seguridad (RLS) ======
-- Cualquiera puede LEER (así funciona el catálogo para todos).
-- Solo alguien logueado (con la clave compartida) puede escribir.
alter table discos enable row level security;
alter table juegos enable row level security;
alter table config enable row level security;
alter table plataformas enable row level security;

create policy "lectura publica discos" on discos for select using (true);
create policy "lectura publica juegos" on juegos for select using (true);
create policy "lectura publica config" on config for select using (true);
create policy "lectura publica plataformas" on plataformas for select using (true);

create policy "escritura logueados discos" on discos for all
  using (auth.role() = 'authenticated') with check (auth.role() = 'authenticated');
create policy "escritura logueados juegos" on juegos for all
  using (auth.role() = 'authenticated') with check (auth.role() = 'authenticated');
create policy "escritura logueados config" on config for all
  using (auth.role() = 'authenticated') with check (auth.role() = 'authenticated');
create policy "escritura logueados plataformas" on plataformas for all
  using (auth.role() = 'authenticated') with check (auth.role() = 'authenticated');
