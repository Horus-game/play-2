-- ====== Migración: agregar plataforma a los discos/secciones ======
-- Pegar y ejecutar en: Supabase → SQL Editor → New query → Run.
-- Esto NO borra nada de lo que ya tenés. Agrega la columna "plataforma" a la
-- tabla discos (si no existe todavía) y deja los discos actuales marcados
-- como "ps2" (para no romper nada de lo que ya tenías cargado).

alter table discos add column if not exists plataforma text not null default 'ps2';
update discos set plataforma = 'ps2' where plataforma is null;
