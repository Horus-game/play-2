# PS2 GamePass — Catálogo de Discos

Sitio estático (sin backend) para consultar, desde el celular, qué juegos tiene cada disco de tu PS2 Fat escaneando un QR pegado en la funda.

## Estructura

```
index.html         → App principal (grilla, filtros, modal de detalle)
script.js           → Lógica (carga de datos, orden, filtros, carátulas automáticas)
data/discos.json    → Metadatos de cada disco (nombre, color, subtítulo)
data/juegos.json    → Catálogo completo de 257 juegos (parseado de tu PDF)
generar_qrs.html    → Página para generar/descargar el QR de cada disco
build_data.py       → Script que generó juegos.json (para regenerar si agregás juegos)
```

## 1. Publicar en GitHub Pages

1. Creá un repo nuevo (puede ser privado o público), ej: `ps2-gamepass`.
2. Subí **todos** los archivos de esta carpeta a la raíz del repo.
3. En GitHub: `Settings → Pages → Source: main / (root)` → Guardar.
4. En un minuto tu sitio queda en:
   `https://TU_USUARIO.github.io/ps2-gamepass/index.html`

## 2. Generar los QR de cada disco

1. Abrí `generar_qrs.html` (podés abrirlo local o ya subido a GitHub Pages).
2. Pegá la URL de tu `index.html` publicado.
3. Se genera un QR por disco, con link directo a `index.html?disco=1`, `?disco=3` o `?disco=C`.
4. Descargá cada QR e imprimilo (tamaño funda de CD, ~3x3cm anda bien) y pegalo en la carátula del disco físico.

Al escanear, el celular abre el catálogo **ya filtrado en ese disco específico**, y desde ahí podés navegar a los otros discos con las pestañas de arriba.

## 3. Cómo funciona la carátula/capturas automáticas

No usamos ninguna API key: las imágenes se traen en vivo desde el repositorio público
[`libretro-thumbnails/Sony_-_PlayStation_2`](https://github.com/libretro-thumbnails/Sony_-_PlayStation_2),
que tiene carátulas (`Named_Boxarts`), capturas de juego (`Named_Snaps`) y pantallas de título
(`Named_Titles`) para la mayoría de los juegos de PS2, indexadas por nombre exacto.

- El sitio intenta varias variantes del nombre (con subtítulo, sin subtítulo, etc.) antes de rendirse.
- Si ningún nombre matchea, se muestra automáticamente una tarjeta con el nombre del juego sobre
  un color generado a partir del propio título (nunca queda un espacio roto/vacío).
- Si un juego en particular no trae carátula y sabés que existe con otro nombre, editá `data/juegos.json`
  y ajustá el campo `"nombre"` para que coincida con el nombre usado en libretro-thumbnails.

## 4. Categorías, dificultad, jugadores y reseña

Estos datos se generaron automáticamente a partir del género de cada juego (tomado de tu PDF),
con reglas heurísticas razonables (ej: Survival Horror → dificultad alta, 1 jugador; Lucha → 1-2
jugadores, etc.). Son un buen punto de partida, pero **son editables a mano** en cualquier momento:

Abrí `data/juegos.json` y modificá los campos que quieras por juego:

```json
{
  "id": "d1-tekken-5",
  "nombre": "Tekken 5",
  "disco": 1,
  "categoria": "Lucha",
  "genero_original": "Lucha",
  "dificultad": 3,
  "jugadores": "1-2",
  "resena": "Texto libre que aparece en el detalle del juego."
}
```

No hace falta tocar `script.js` para esto — el sitio lee el JSON al vuelo.

## 5. Agregar más discos o juegos

- **Agregar un juego a un disco existente**: copiá un bloque `{...}` dentro de `data/juegos.json`
  y cambiá `id`, `nombre`, `disco`, etc.
- **Agregar un disco nuevo**: agregá una entrada en `data/discos.json` (con `id`, `nombre`,
  `subtitulo`, `color`) y luego usá ese mismo `id` en los juegos de `data/juegos.json` que
  correspondan a ese disco. Aparece automáticamente como pestaña nueva y podés generarle su QR
  en `generar_qrs.html`.
- Si preferís regenerar todo desde cero editando las listas de títulos, `build_data.py` tiene
  las listas de los 3 discos actuales — podés duplicar el patrón para más discos y correr
  `python3 build_data.py` para reescribir los JSON.

## 6. Filtros y orden disponibles en el sitio

- Búsqueda por texto (nombre del juego).
- Filtro por categoría (chips, se arman automáticamente según lo que haya en el disco actual).
- Orden: A-Z, Z-A, dificultad ascendente/descendente, cantidad de jugadores.
- Navegación entre discos sin recargar (pestañas arriba, quedan en la URL `?disco=`).

## 7. Uso sin conexión / mejoras futuras posibles

- El sitio necesita internet para traer las carátulas (GitHub raw) — la data del catálogo (JSON)
  es local y funciona offline si servís los archivos localmente.
- Si más adelante querés carátulas 100% offline, se pueden descargar una vez con un script y
  guardarlas en `/assets/covers/`, apuntando `script.js` a esa carpeta en vez del repo remoto.
- Se puede sumar un campo `"favorito": true/false` y un chip "Favoritos" fácilmente siguiendo
  el mismo patrón que categoría.
