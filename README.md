# PS2 GamePass — Catálogo de Discos (versión Supabase)

Sitio para consultar, desde el celular, qué juegos tiene cada disco de tu PS2, con datos
guardados en la nube (Supabase), en tiempo real para todos, y edición protegida por clave.

## Qué cambia respecto a la versión anterior

- Los datos (discos, juegos, estado, carátulas, reseñas, links de descarga) viven en una base
  de datos **Supabase** (Postgres gratis), no en archivos JSON ni en el navegador de cada uno.
- Cualquiera que entre al link **ve** el catálogo (lectura libre, sin clave).
- Para **editar** (cambiar estado, agregar/borrar juegos, agregar discos, poner links de
  descarga) hace falta la **clave de editor principal** — botón "🔒 Editor principal" arriba a
  la derecha. Además existe una **clave de revendedor**, más limitada: solo cambia el nombre de
  la tienda y los precios (ver sección 2).
- Categorías nuevas: no hay que "crearlas" en ningún lado — simplemente escribís el nombre que
  quieras en el campo "Categoría" al agregar o editar un juego, y aparece sola como chip de
  filtro.

## 0. Novedades: multi-plataforma, repetidos y autocompletar carátulas

- **Selector de consola (arriba a la izquierda, al lado del logo):** un desplegable
  con "🕹️ Todas" + cada consola que ya tenga discos cargados (PS2, Xbox, etc.) +
  "➕ Agregar consola...". Elegir una consola filtra las pestañas de disco para
  mostrar solo los de esa consola. "➕ Agregar consola..." abre directamente el
  formulario de disco nuevo — al elegir ahí una plataforma que todavía no usaste
  (por ejemplo "Xbox 360"), esa consola nueva aparece sola en el desplegable en
  cuanto guardás el primer disco. Con "🕹️ Todas" + el disco "Todos" (en las
  pestañas de abajo) ves todos los juegos de todas las consolas y todos los
  discos juntos.
- **Agregar consolas a mano (PS4, PS Vita, Xbox One, etc.):** la lista de
  consolas ya viene con PS2, PS1, PS3, PSP, Xbox, Xbox 360, GameCube, Wii,
  N64, SNES, NES, GBA, Switch, Dreamcast, Mega Drive y PC. Si te falta alguna
  (PS4, PS5, PS Vita, Xbox Series, Atari, etc.), en el formulario de disco
  nuevo/editar, en el campo "Plataforma", elegí la última opción
  **"➕ Otra consola (agregar nueva)..."**. Aparecen dos campos: el **nombre**
  de la consola (ej: "PS4" o "PS Vita") y un **ícono/emoji** opcional (ej: 🎮).
  Al guardar, esa consola queda creada y disponible para siempre, tanto en
  este desplegable como en el selector de consola de arriba — para todos los
  que abran el sitio, no solo en tu celular. Las consolas agregadas así no
  tienen autocompletado de carátulas (tenés que pegar la carátula a mano en
  cada juego).
- **Repetidos:** dos botones nuevos en la barra de herramientas (modo edición):
  - **🔁 Repetidos** — lista los juegos con el mismo nombre (sin importar
    mayúsculas/acentos), agrupados, comparando solo dentro de la misma consola
    (un juego que se llama igual en PS2 y en Xbox no cuenta como repetido).
  - **🗑️ Borrar repetidos** — borra automáticamente los duplicados,
    conservando de cada grupo la copia con más datos cargados. Pide
    confirmación y no se puede deshacer.
- **🖼️ Autocargar carátulas:** busca automáticamente una carátula (repo de
  libretro-thumbnails, según la plataforma de cada disco) para todos los
  juegos que estás viendo en ese momento y que **no tienen carátula cargada
  todavía**. Nunca reemplaza una carátula que ya pusiste a mano. Útil después
  de importar varios juegos de golpe. Solo revisa la vista actual (si querés
  cubrir todo el catálogo, poné el filtro en "Todas" / "Todos" antes de
  apretarlo).
- Si tu proyecto es de antes de este cambio, corré `migracion_plataforma.sql`
  una vez en el SQL Editor de Supabase (agrega la columna "plataforma" sin
  borrar nada).
- Para poder agregar consolas a mano (PS4, PS Vita, etc.) en un proyecto que
  ya tenías creado, corré también `migracion_plataformas_custom.sql` una vez
  en el SQL Editor de Supabase (crea la tabla "plataformas", sin borrar
  nada). Si estás armando el proyecto desde cero, no hace falta: ya está
  incluido en `schema.sql`.

## 0.1 Stock (En stock / Sin stock)

- Cada juego tiene una etiqueta de stock, visible para **todos** (también para
  quien solo mira el catálogo, sin clave): "✅ En stock" o "❌ Sin stock",
  como una segunda etiqueta abajo a la izquierda de la carátula (además del
  estado "No Jugado/En Curso/Finalizado" de siempre) y también dentro del
  detalle del juego.
- **Solo quien entró con la clave de edición puede cambiarlo.** Sin la clave,
  la etiqueta se ve igual que siempre pero no se puede tocar — no aparece
  ningún botón para modificarla. Con la clave puesta, tocando la etiqueta en
  la tarjeta, o el botón "📦 Marcar sin stock / Marcar en stock" dentro del
  detalle del juego, cambia el estado al toque.
- Como con todo lo demás, esto lo hace cumplir la base de datos del lado del
  servidor (reglas RLS), no algo que se pueda saltear editando el sitio.
- Si tu proyecto es de antes de este cambio, corré `migracion_stock.sql` una
  vez en el SQL Editor de Supabase (agrega la columna "en_stock", todos los
  juegos existentes quedan en "En stock"). Si armás el proyecto desde cero,
  ya está incluido en `schema.sql`.

## 1. Crear el proyecto en Supabase (una sola vez, ~5 minutos)

1. Andá a **[supabase.com](https://supabase.com)** → creá una cuenta (gratis) → **New project**.
   Ponele un nombre, una contraseña de base de datos (guardala, no es "la clave" del sitio,
   es aparte) y esperá ~1 minuto a que se cree.
2. En el menú lateral: **SQL Editor → New query**. Pegá **todo** el contenido de `schema.sql`
   (de esta carpeta) y hacé clic en **Run**. Esto crea las tablas y las reglas de seguridad.
3. Repetí el paso con `seed.sql`: pegalo en una nueva query y **Run**. Esto carga tus 3 discos
   y 257 juegos actuales.
4. **Crear el usuario "editor" (editor principal)** — es lo que se transforma en "la clave"
   con acceso total: Menú lateral → **Authentication → Users → Add user → Create new user**.
   - Email: `editor@ps2gamepass.local` (tiene que ser EXACTAMENTE igual al que está en
     `supabase-config.js`, campo `EDITOR_EMAIL` — si querés cambiarlo, cambialo en los dos
     lugares).
   - Password: la clave que van a compartir entre ustedes para editar todo.
   - Marcá "Auto Confirm User" si aparece la opción.
4.1. **Crear el usuario "revendedor" (acceso restringido)** — repetí el mismo paso:
   - Email: `revendedor@ps2gamepass.local` (igual al `REVENDEDOR_EMAIL` de `supabase-config.js`).
   - Password: la clave que le vas a dar a tus revendedores (puede ser una sola compartida, o
     vos decidís si más adelante querés una por persona).
   - Marcá "Auto Confirm User" si aparece la opción.
5. **Conectar el sitio:** Menú lateral → ⚙️ **Project Settings → API**. Copiá:
   - **Project URL** → pegalo en `supabase-config.js`, campo `url`.
   - **anon public** key → pegalo en `supabase-config.js`, campo `anonKey`.
6. Subí toda esta carpeta (incluido `supabase-config.js` ya completado) a tu repo de GitHub
   Pages, como antes: `Settings → Pages → Source: main / (root)`.

Con eso el sitio ya lee y escribe en tu base de datos, compartido para todos.

## 2. Los dos niveles de acceso: editor principal y revendedor

### Editor principal — acceso total

- Botón **"🔒 Editor principal"** (arriba a la derecha) → pide la clave → si es correcta,
  aparecen todos los botones de edición: agregar/borrar juegos y discos, editar nombres,
  carátulas, capturas, WhatsApp, consolas, el link de descarga general, y el panel oculto
  **"📋 Revendedores"**.
- Para "salir", tocá el mismo botón (ahora dice "🔓 Editor principal (salir)").

### Modo revendedor — acceso restringido

- Botón **"🏪 Modo revendedor"** → pide la clave de revendedor → si es correcta, esa persona
  puede:
  - Cambiar el **nombre de la tienda** (tocando el lápiz ✏️ junto al título del disco que está
    viendo).
  - Cambiar el **precio** de cualquier juego (lápiz ✏️ junto al precio en cada tarjeta, en el
    detalle del juego, o seleccionando varios juegos con "🧮 Seleccionar juegos" para ponerles
    precio a todos juntos) — pero **nunca por debajo del precio de la página principal**
    (ver la sección siguiente).
- **No puede** cambiar nombres de juegos, imágenes, capturas, el WhatsApp, crear/borrar discos
  o juegos, ni tocar consolas o el link general de descarga — esos botones ni le aparecen, y
  aunque alguien intente forzarlo desde la consola del navegador, la base de datos lo rechaza
  del lado del servidor (ver `migracion_revendedor.sql` / `schema.sql`).

### Piso de precio: el revendedor nunca vende más barato que la página principal

- Cada juego tiene, además del "Precio" que se muestra en el catálogo, un campo
  **"Precio página principal"** (columna `precio_base`) que **solo el editor principal** puede
  cargar o cambiar — desde 🔒 Editor principal, abrí el juego y editalo. Es el precio oficial
  del catálogo.
- Con ese valor cargado, si un revendedor intenta poner un precio menor (edición individual o
  en lote con "🧮 Seleccionar juegos"), el sitio se lo avisa y **la base de datos lo rechaza del
  lado del servidor**, aunque intente saltear la web y llamar a la API a mano.
- El revendedor sí puede **subir** el precio todo lo que quiera por encima de ese piso — ese es
  el precio que ve el cliente cuando el revendedor le pasa el link del catálogo (o el QR de un
  disco) para que lo revise y después lo contacte por WhatsApp para cerrar la compra.
- Todos los discos y juegos son visibles para el revendedor igual que para cualquiera (la
  lectura del catálogo siempre fue pública); lo único restringido es qué puede modificar.
- Si un juego todavía no tiene "Precio página principal" cargado, no hay piso todavía para ese
  juego en particular: conviene que el editor lo cargue para que la protección funcione.
- Si tu proyecto es de antes de este cambio, corré `migracion_precio_base.sql` una vez en el SQL
  Editor de Supabase (agrega la columna y copia el precio actual de cada juego como piso
  inicial, para no dejar ningún precio "sin protección" de golpe). Si armás el proyecto desde
  cero, ya está incluido en `schema.sql`.

### Panel oculto de revendedores (solo para el editor principal)

Con la clave de editor principal activa, aparece el botón **"📋 Revendedores"** en la barra de
herramientas: abre una lista con el nombre de tienda y el WhatsApp de cada disco, para
revisarlos o corregirlos todos juntos sin tener que entrar disco por disco. Ese botón no
aparece nunca en modo revendedor ni para un visitante.

### Cómo funciona técnicamente

Las dos claves inician sesión contra los usuarios `editor` y `revendedor` que creaste en
Supabase Authentication. Nadie puede escribir sin una de las dos claves, aunque mire el código
del sitio o llame a la API a mano: la base de datos lo rechaza del lado del servidor (reglas
RLS + un trigger en `schema.sql`/`migracion_revendedor.sql`), no es una restricción que se
pueda saltear editando el HTML.

**Si tu proyecto de Supabase ya existía antes de este cambio:** además de crear el usuario
`revendedor` (paso 4.1), corré una vez el contenido de `migracion_revendedor.sql` en el SQL
Editor para activar las reglas nuevas.

Si en algún momento querés cambiar cualquiera de las dos claves: Authentication → Users →
click en el usuario → "Reset password" (o borralo y creá uno nuevo).

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
schema.sql             → Definición de tablas + reglas de seguridad (correr una vez, proyecto nuevo)
migracion_shots.sql    → Migración vieja: agrega columnas de capturas (solo si tu proyecto es de antes)
migracion_plataforma.sql → Migración: agrega la columna "plataforma" a discos (solo si tu proyecto es de antes)
migracion_plataformas_custom.sql → Migración: crea la tabla "plataformas" para consolas agregadas a mano (solo si tu proyecto es de antes)
migracion_stock.sql    → Migración: agrega la columna "en_stock" a juegos (solo si tu proyecto es de antes)
migracion_revendedor.sql → Migración: activa el modo revendedor restringido (solo si tu proyecto es de antes)
migracion_precio_base.sql → Migración: agrega el piso de precio "página principal" (solo si tu proyecto es de antes)
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
