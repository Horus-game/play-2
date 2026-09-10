-- ====== Migración: agregar capturas de pantalla manuales ======
-- Pegar y ejecutar en: Supabase → SQL Editor → New query → Run.
-- Esto NO borra nada de lo que ya tenés, solo agrega dos columnas nuevas
-- (si no existen todavía) para poder pegar a mano las capturas de un juego.

alter table juegos add column if not exists shot1 text;
alter table juegos add column if not exists shot2 text;
