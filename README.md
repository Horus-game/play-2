# PS2 GamePass — Catálogo de Discos (versión Supabase)

Sitio para consultar, desde el celular, qué juegos tiene cada disco de tu PS2, con datos
guardados en la nube (Supabase), en tiempo real para todos, y edición protegida por clave.

## Qué cambia respecto a la versión anterior

- Los datos (discos, juegos, estado, carátulas, reseñas, links de descarga) viven en una base
  de datos **Supabase** (Postgres gratis), no en archivos JSON ni en el navegador de cada uno.
- Cualquiera que entre al link **ve** el catálogo (lectura libre, sin clave).
- Para **editar** (cambiar estado, agregar/borrar juegos, agregar discos, poner links de
  descarga) hace falta la **clave de edición** compartida — botón "🔒 Desbloquear edición"
  arriba a la derecha.
- Categorías nuevas: no hay que "crearlas" en ningún lado — simplemente escribís el nombre que
  quieras en el campo "Categoría" al agregar o editar un juego, y aparece sola como chip de
  filtro.

## 1. Crear el proyecto en Supabase (una sola vez, ~5 minutos)

1. Andá a **[supabase.com](https://supabase.com)** → creá una cuenta (gratis) → **New project**.
   Ponele un nombre, una contraseña de base de datos (guardala, no es "la clave" del sitio,
   es aparte) y esperá ~1 minuto a que se cree.
2. En el menú lateral: **SQL Editor → New query**. Pegá **todo** el contenido de `schema.sql`
   (de esta carpeta) y hacé clic en **Run**. Esto crea las tablas y las reglas de seguridad.
3. Repetí el paso con `seed.sql`: pegalo en una nueva query y **Run**. Esto carga tus 3 discos
   y 257 juegos actuales.
4. **Crear el usuario "editor"** (es lo que se transforma en "la clave" del sitio):
   Menú lateral → **Authentication → Users → Add user → Create new user**.
   - Email: `editor@ps2gamepass.local` (tiene que ser EXACTAMENTE igual al que está en
     `supabase-config.js`, campo `EDITOR_EMAIL` — si querés cambiarlo, cambialo en los dos
     lugares).
   - Password: la clave que van a compartir entre ustedes para editar.
   - Marcá "Auto Confirm User" si aparece la opción.
5. **Conectar el sitio:** Menú lateral → ⚙️ **Project Settings → API**. Copiá:
   - **Project URL** → pegalo en `supabase-config.js`, campo `url`.
   - **anon public** key → pegalo en `supabase-config.js`, campo `anonKey`.
6. Subí toda esta carpeta (incluido `supabase-config.js` ya completado) a tu repo de GitHub
   Pages, como antes: `Settings → Pages → Source: main / (root)`.

Con eso el sitio ya lee y escribe en tu base de datos, compartido para todos.

## 2. Cómo funciona la clave de edición

- Botón **"🔒 Desbloquear edición"** (arriba a la derecha) → pide la clave → si es correcta,
  aparecen los botones de edición: agregar juego, agregar disco, editar/borrar cada juego, y
  poner el link de descarga general.
- Técnicamente la clave inicia sesión contra el usuario `editor` que creaste en Supabase
  Authentication. Nadie puede escribir sin esa clave, aunque mire el código del sitio: la base
  de datos lo rechaza del lado del servidor (reglas RLS en `schema.sql`), no es una restricción
  que se pueda saltear editando el HTML.
- Para "salir" del modo edición, tocá el mismo botón (ahora dice "🔓 Modo edición activo").
- Si en algún momento querés cambiar la clave: Authentication → Users → click en el usuario →
  "Reset password" (o borralo y creá uno nuevo).

## 3. Botones de descarga

- **Por juego:** en el formulario de edición de cada juego hay un campo "URL de descarga del
  juego" (pegás el link a donde tengas alojado el archivo — Drive, Mega, etc.). Aparece un
  botón "⬇️ Descargar" en la tarjeta y en el detalle del juego.
- **General:** arriba del catálogo, botón "+ Agregar link general de descarga" (solo visible
  en modo edición) para poner un link único que aplica a toda la página (por ejemplo, un link
  a una carpeta con todos los ISOs).

## 4. Carátulas — mismo sistema que antes

El campo "URL de carátula personalizada" sigue sin almacenar ningún archivo: solo guarda el
link de texto y el navegador de cada visitante carga la imagen en vivo desde donde esté. Si un
juego no trae carátula automática (busca por nombre en el repo público
`libretro-thumbnails/Sony_-_PlayStation_2`), pegá ahí un link a una imagen que hayas
encontrado.

## 5. Agregar juegos, discos y categorías

- **Juego nuevo:** botón "+ Agregar juego" (toolbar, en modo edición) → completá el formulario
  → Guardar. El disco al que pertenece se elige en un desplegable.
- **Disco nuevo:** botón "+ Disco" al final de las pestañas de arriba (modo edición) → te pide
  ID, nombre, subtítulo y color por unos cuadros de diálogo simples. Aparece al toque como
  pestaña nueva.
- **Categoría nueva:** no es una tabla aparte — escribí lo que quieras en el campo "Categoría"
  del formulario de un juego (propio o nuevo) y listo, aparece como chip de filtro.
- **Eliminar un juego:** dentro del detalle del juego (modo edición), botón "🗑️ Eliminar
  juego".

## 6. Estructura de archivos

```
index.html            → App principal (grilla, filtros, modal, formularios de edición)
script.js              → Lógica: lectura/escritura en Supabase, auth, tiempo real
supabase-config.js     → Tus credenciales de Supabase (completar, ver sección 1)
schema.sql             → Definición de tablas + reglas de seguridad (correr una vez)
seed.sql                → Carga inicial de tus 3 discos y 257 juegos (correr una vez)
generar_qrs.html        → Generador de QR por disco (sin cambios)
build_data.py           → Script original que generó los datos (ya no se usa en producción,
                           queda como referencia histórica)
```

## 7. Generar los QR de cada disco

Igual que antes: abrí `generar_qrs.html`, pegá la URL de tu `index.html` publicado, y descargá
un QR por disco (`?disco=1`, `?disco=3`, `?disco=C`, o el que hayas creado).

## 9. Sincronización en vivo entre pantallas (opcional)

El sitio intenta escuchar cambios en tiempo real (si vos editás desde el celu, que se actualice
solo en la PC de al lado sin recargar). Para que esto funcione, en Supabase andá a
**Database → Replication** y activá "Realtime" para las tablas `discos`, `juegos` y `config`.
Si no lo activás, el sitio funciona igual — simplemente cada quien ve los cambios de otros
recién al recargar la página.


- Ahora mismo cualquiera con la clave puede editar todo. Si más adelante querés que cada
  persona tenga su propio usuario (para saber "quién editó qué"), se puede armar con Supabase
  Auth normal — avisame.
- Agregar disco usa cuadros de diálogo simples (`prompt`) para no complicar el formulario
  principal; si querés un formulario más prolijo para eso también, pedímelo.
