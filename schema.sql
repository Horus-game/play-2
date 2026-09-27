-- ====== PS2 GamePass · Esquema Supabase ======
-- Pegar y ejecutar en: Supabase → SQL Editor → New query → Run.
-- Después correr seed.sql para cargar los discos/juegos actuales.

create table if not exists discos (
  id text primary key,
  nombre text not null,
  subtitulo text,
  color text,
  plataforma text not null default 'ps2',   -- ps2, ps1, xbox, wii, switch, pc, etc. (ver PLATFORMS en script.js)
  whatsapp text                              -- número de WhatsApp de ese disco/tienda (solo dígitos, sin +)
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
  link_descarga text,     -- URL de descarga del juego (ISO, etc.)
  precio numeric,         -- precio mostrado en el catálogo (lo puede subir el revendedor)
  precio_base numeric,    -- precio "de página principal" que fija el editor: piso mínimo,
                           -- el revendedor nunca puede poner "precio" por debajo de este valor
  en_stock boolean not null default true  -- true = En stock, false = Sin stock (solo lo cambia el editor)
);

create table if not exists config (
  id int primary key default 1 check (id = 1),  -- fila única
  link_descarga_general text
);

-- Cuentas de revendedor individuales. Cada fila conecta un usuario de
-- Supabase Auth (creado desde la propia página, ver script.js) con un nombre
-- para identificarlo y un interruptor para activar/desactivar su acceso sin
-- tener que borrar la cuenta ni entrar a Supabase. Los discos siguen siendo
-- discos (no "pertenecen" a un revendedor): cualquier revendedor activo
-- puede tocar el nombre de tienda y el precio en cualquier disco, igual que
-- antes.
create table if not exists revendedores_cuentas (
  id uuid primary key default gen_random_uuid(),
  user_id uuid not null unique,
  email text not null,
  nombre text not null,
  slug text,          -- para armar su link público (?rev=slug); único
  activo boolean not null default true,
  creado_en timestamptz not null default now(),
  -- Marca propia: cómo se ve su tienda para sus clientes (nunca toca el
  -- catálogo "original"). Si están en null/vacío, se usa el valor de siempre.
  marca_nombre text,
  marca_logo_url text,
  marca_logo_alto integer,
  marca_color1 text,
  marca_color2 text
);

-- Por si la tabla ya había quedado creada (a medias) por un intento anterior:
-- aseguramos que tenga todas las columnas, sin tocar nada de lo que ya tenga.
alter table revendedores_cuentas add column if not exists user_id uuid;
alter table revendedores_cuentas add column if not exists email text;
alter table revendedores_cuentas add column if not exists nombre text;
alter table revendedores_cuentas add column if not exists slug text;
alter table revendedores_cuentas add column if not exists activo boolean not null default true;
alter table revendedores_cuentas add column if not exists creado_en timestamptz not null default now();
alter table revendedores_cuentas add column if not exists marca_nombre text;
alter table revendedores_cuentas add column if not exists marca_logo_url text;
alter table revendedores_cuentas add column if not exists marca_logo_alto integer;
alter table revendedores_cuentas add column if not exists marca_color1 text;
alter table revendedores_cuentas add column if not exists marca_color2 text;
update revendedores_cuentas set slug = lower(regexp_replace(split_part(email, '@', 1), '[^a-z0-9._-]', '', 'g'))
  where slug is null;
do $$ begin
  if not exists (select 1 from pg_constraint where conname = 'revendedores_cuentas_user_id_key') then
    alter table revendedores_cuentas add constraint revendedores_cuentas_user_id_key unique (user_id);
  end if;
  if not exists (select 1 from pg_constraint where conname = 'revendedores_cuentas_slug_key') then
    alter table revendedores_cuentas add constraint revendedores_cuentas_slug_key unique (slug);
  end if;
end $$;

-- Precio propio de cada revendedor por juego: independiente del de los demás
-- revendedores y del precio general de la página (juegos.precio). Si un
-- revendedor no cargó su propio precio para un juego, se usa como respaldo
-- el precio general (o el precio_base si tampoco hay precio general) — ver
-- effectivePrice() en script.js.
create table if not exists precios_revendedor_cuentas (
  id uuid primary key default gen_random_uuid(),
  revendedor_id uuid not null references revendedores_cuentas(id) on delete cascade,
  juego_id text not null references juegos(id) on delete cascade,
  precio numeric not null,
  actualizado_en timestamptz not null default now(),
  unique (revendedor_id, juego_id)
);
alter table precios_revendedor_cuentas enable row level security;


-- ====== Seguridad (RLS) ======
-- Cualquiera puede LEER (así funciona el catálogo para todos).
-- Solo alguien logueado (con la clave compartida) puede escribir.
alter table discos enable row level security;
alter table juegos enable row level security;
alter table config enable row level security;
alter table plataformas enable row level security;
alter table revendedores_cuentas enable row level security;

create policy "lectura publica discos" on discos for select using (true);
create policy "lectura publica juegos" on juegos for select using (true);
create policy "lectura publica config" on config for select using (true);
create policy "lectura publica plataformas" on plataformas for select using (true);
create policy "lectura publica precios_revendedor_cuentas" on precios_revendedor_cuentas for select using (true);

-- ====== Roles de escritura: editor principal vs revendedor ======
-- El editor principal (usuario "editor@ps2gamepass.local") puede cambiar todo.
-- El revendedor (usuario "revendedor@ps2gamepass.local", ver README) puede
-- actualizar discos y juegos, pero un trigger le bloquea, del lado del
-- servidor, cualquier columna que no sea el nombre del disco o el precio del
-- juego. Ni el revendedor ni nadie sin clave puede crear/borrar discos o
-- juegos, ni tocar consolas o el link general de descarga.

create or replace function es_editor_principal()
returns boolean as $$
  select coalesce(auth.jwt() ->> 'email', '') = 'editor@ps2gamepass.local';
$$ language sql stable;

-- Cualquier cuenta creada desde el panel de revendedores (tabla de arriba)
-- que siga marcada como activa. Esto es lo que reemplaza a "cualquier
-- usuario logueado" en las reglas de escritura: si alguien se registra por su
-- cuenta (o el editor desactiva a alguien), esta función devuelve false y esa
-- persona no puede escribir nada, aunque tenga una sesión válida.
create or replace function es_revendedor_activo()
returns boolean as $$
  select exists (
    select 1 from revendedores_cuentas r
    where r.user_id = auth.uid() and r.activo
  )
  or coalesce(auth.jwt() ->> 'email', '') = 'revendedor@ps2gamepass.local'; -- cuenta compartida de siempre, por compatibilidad
$$ language sql stable security definer set search_path = public;

create or replace function bloquear_cambios_de_revendedor()
returns trigger as $$
begin
  if es_editor_principal() then
    return new;
  end if;
  if TG_TABLE_NAME = 'discos' then
    if new.subtitulo is distinct from old.subtitulo
       or new.color is distinct from old.color
       or new.plataforma is distinct from old.plataforma
       or new.whatsapp is distinct from old.whatsapp then
      raise exception 'Como revendedor, solo podés cambiar el nombre de la tienda.';
    end if;
  elsif TG_TABLE_NAME = 'juegos' then
    if new.nombre is distinct from old.nombre
       or new.disco is distinct from old.disco
       or new.categoria is distinct from old.categoria
       or new.genero_original is distinct from old.genero_original
       or new.dificultad is distinct from old.dificultad
       or new.jugadores is distinct from old.jugadores
       or new.resena is distinct from old.resena
       or new.estado is distinct from old.estado
       or new.caratula is distinct from old.caratula
       or new.shot1 is distinct from old.shot1
       or new.shot2 is distinct from old.shot2
       or new.link_descarga is distinct from old.link_descarga
       or new.en_stock is distinct from old.en_stock
       or new.precio_base is distinct from old.precio_base
       or new.precio is distinct from old.precio then
      raise exception 'Como revendedor, poné tu propio precio desde tu modo revendedor (no se edita acá).';
    end if;
  end if;
  return new;
end;
$$ language plpgsql security definer;

-- Id (uuid) del revendedor activo actualmente logueado, o null si no hay
-- sesión de revendedor válida. Lo usan las políticas de precios_revendedor.
create or replace function revendedor_id_actual()
returns uuid as $$
  select r.id from revendedores_cuentas r where r.user_id = auth.uid() and r.activo limit 1;
$$ language sql stable security definer set search_path = public;

create policy "revendedor administra sus propios precios" on precios_revendedor_cuentas for all
  using (es_editor_principal() or revendedor_id = revendedor_id_actual())
  with check (es_editor_principal() or revendedor_id = revendedor_id_actual());

-- Piso de precio también para la tabla de precios propios: ni el revendedor
-- puede poner, en su propia fila, menos que el precio de página principal.
create or replace function validar_piso_precio_revendedor()
returns trigger as $$
declare piso numeric;
begin
  select precio_base into piso from juegos where id = new.juego_id;
  if piso is not null and new.precio < piso then
    raise exception 'El precio no puede ser menor al precio de la página principal ($%).', piso;
  end if;
  return new;
end;
$$ language plpgsql security definer;

drop trigger if exists trg_piso_precio_revendedor on precios_revendedor_cuentas;
create trigger trg_piso_precio_revendedor
  before insert or update on precios_revendedor_cuentas
  for each row execute function validar_piso_precio_revendedor();

-- Función pública (sin login) para resolver el link de un revendedor: dado
-- su slug, devuelve id y nombre si la cuenta está activa. No expone el email
-- interno ni el user_id — la usa cualquier visitante que abre ?rev=slug.
create or replace function revendedor_publico_por_slug(p_slug text)
returns table(id uuid, nombre text, marca_nombre text, marca_logo_url text, marca_logo_alto integer, marca_color1 text, marca_color2 text) as $$
  select r.id, r.nombre, r.marca_nombre, r.marca_logo_url, r.marca_logo_alto, r.marca_color1, r.marca_color2
  from revendedores_cuentas r
  where r.slug = lower(trim(p_slug)) and r.activo;
$$ language sql stable security definer set search_path = public;

grant execute on function revendedor_publico_por_slug(text) to anon, authenticated;

create trigger trg_bloquear_revendedor_discos
  before update on discos
  for each row execute function bloquear_cambios_de_revendedor();

create trigger trg_bloquear_revendedor_juegos
  before update on juegos
  for each row execute function bloquear_cambios_de_revendedor();

create policy "editor actualiza discos" on discos for update
  using (es_editor_principal() or es_revendedor_activo()) with check (es_editor_principal() or es_revendedor_activo());
create policy "editor crea discos" on discos for insert
  with check (es_editor_principal());
create policy "editor borra discos" on discos for delete
  using (es_editor_principal());

create policy "editor actualiza juegos" on juegos for update
  using (es_editor_principal() or es_revendedor_activo()) with check (es_editor_principal() or es_revendedor_activo());
create policy "editor crea juegos" on juegos for insert
  with check (es_editor_principal());
create policy "editor borra juegos" on juegos for delete
  using (es_editor_principal());

create policy "solo editor principal - config" on config for all
  using (es_editor_principal()) with check (es_editor_principal());
create policy "solo editor principal - plataformas" on plataformas for all
  using (es_editor_principal()) with check (es_editor_principal());

-- Revendedores: el editor principal ve y administra todas las cuentas
-- (crearlas, activarlas/desactivarlas); cada revendedor puede ver únicamente
-- su propia fila (para que el sitio sepa mostrarle su nombre), pero no puede
-- crear, borrar ni activar/desactivar cuentas, ni ver las de los demás.
create policy "editor administra revendedores" on revendedores_cuentas for all
  using (es_editor_principal()) with check (es_editor_principal());
create policy "revendedor ve su propia fila" on revendedores_cuentas for select
  using (auth.uid() = user_id);

-- Cada revendedor puede actualizar SU PROPIA fila, pero un trigger le
-- bloquea, del lado del servidor, todo lo que no sea su marca (no puede
-- cambiar su nombre de cuenta, activarse/desactivarse, etc.).
create policy "revendedor edita su propia marca" on revendedores_cuentas for update
  using (auth.uid() = user_id) with check (auth.uid() = user_id);

create or replace function bloquear_cambios_de_marca_revendedor()
returns trigger as $$
begin
  if es_editor_principal() then
    return new;
  end if;
  if new.nombre is distinct from old.nombre
     or new.user_id is distinct from old.user_id
     or new.email is distinct from old.email
     or new.slug is distinct from old.slug
     or new.activo is distinct from old.activo then
    raise exception 'Solo podés cambiar el nombre, logo y colores de tu marca.';
  end if;
  return new;
end;
$$ language plpgsql security definer;

drop trigger if exists trg_bloquear_marca_revendedor on revendedores_cuentas;
create trigger trg_bloquear_marca_revendedor
  before update on revendedores_cuentas
  for each row execute function bloquear_cambios_de_marca_revendedor();
