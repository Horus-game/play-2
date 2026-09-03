// ====== PS2 GamePass - lógica principal ======
const LIBRETRO_BASE = "https://raw.githubusercontent.com/libretro-thumbnails/Sony_-_PlayStation_2/master";
// Carpetas del repo libretro-thumbnails para PS2
const FOLDERS = { box: "Named_Boxarts", snap: "Named_Snaps", title: "Named_Titles" };

let DISCOS = [];
let JUEGOS = [];
let currentDisc = null;
let currentCategory = "Todas";
let currentSort = "alpha";
let currentSearch = "";

const $ = (sel) => document.querySelector(sel);
const grid = $("#grid");

// --- Normalización de nombre a la convención libretro (best-effort) ---
function libretroName(name) {
  // libretro-thumbnails usa el nombre "bonito" del juego, reemplazando
  // caracteres problemáticos por "_" y quitando algunos símbolos.
  return name
    .replace(/&/g, "_")
    .replace(/[:*?"<>|]/g, "_")
    .replace(/\//g, "_")
    .trim();
}

function coverUrl(name, folder) {
  const clean = encodeURIComponent(libretroName(name) + ".png").replace(/%20/g, "%20");
  return `${LIBRETRO_BASE}/${folder}/${clean}`;
}

// Variantes a probar si la primera falla (subtítulos, guiones, etc.)
function nameVariants(name) {
  const variants = new Set();
  variants.add(name);
  variants.add(name.replace(/:.*/, "").trim());
  variants.add(name.replace(/\(.*?\)/, "").trim());
  variants.add(name.split(" - ")[0].trim());
  return Array.from(variants).filter(Boolean);
}

function setImageWithFallback(imgEl, gameName, folder, onAllFail) {
  const variants = nameVariants(gameName);
  let i = 0;
  function tryNext() {
    if (i >= variants.length) { onAllFail && onAllFail(); return; }
    imgEl.onerror = () => { i++; tryNext(); };
    imgEl.src = coverUrl(variants[i], folder);
  }
  tryNext();
}

function initials(name) {
  return name.split(/\s+/).slice(0, 2).map(w => w[0]).join("").toUpperCase();
}

function hashColor(str) {
  let h = 0;
  for (let i = 0; i < str.length; i++) h = str.charCodeAt(i) + ((h << 5) - h);
  const hue = Math.abs(h) % 360;
  return `hsl(${hue}, 55%, 30%)`;
}

// --- Carga de datos ---
async function loadData() {
  const [discosRes, juegosRes] = await Promise.all([
    fetch("data/discos.json"), fetch("data/juegos.json")
  ]);
  DISCOS = await discosRes.json();
  JUEGOS = await juegosRes.json();
}

function getParam(name) {
  return new URLSearchParams(window.location.search).get(name);
}

function setDiscInUrl(discId) {
  const url = new URL(window.location);
  url.searchParams.set("disco", discId);
  window.history.replaceState({}, "", url);
}

function renderDiscTabs() {
  const tabs = $("#discTabs");
  tabs.innerHTML = "";
  DISCOS.forEach(d => {
    const btn = document.createElement("button");
    btn.className = "disc-tab" + (d.id == currentDisc ? " active" : "");
    if (d.id == currentDisc) btn.style.background = d.color;
    btn.textContent = d.nombre;
    btn.onclick = () => selectDisc(d.id);
    tabs.appendChild(btn);
  });
}

function renderBanner() {
  const d = DISCOS.find(x => x.id == currentDisc);
  if (!d) return;
  const count = JUEGOS.filter(g => g.disco == currentDisc).length;
  $("#discBanner").style.background = `linear-gradient(135deg, ${d.color}, #00000055)`;
  $("#discBanner").innerHTML = `
    <h1>${d.nombre} · ${d.subtitulo}</h1>
    <p>Insertá este disco en la PS2 y navegá su catálogo sin adivinar qué contiene.</p>
    <div class="count">${count}</div>
  `;
}

function renderCategoryChips() {
  const cats = ["Todas", ...new Set(JUEGOS.filter(g => g.disco == currentDisc).map(g => g.categoria))].sort((a,b)=> a==="Todas"?-1:a.localeCompare(b));
  const box = $("#categoryChips");
  box.innerHTML = "";
  cats.forEach(c => {
    const chip = document.createElement("div");
    chip.className = "chip" + (c === currentCategory ? " active" : "");
    chip.textContent = c;
    chip.onclick = () => { currentCategory = c; renderCategoryChips(); renderGrid(); };
    box.appendChild(chip);
  });
}

function getFiltered() {
  let list = JUEGOS.filter(g => g.disco == currentDisc);
  if (currentCategory !== "Todas") list = list.filter(g => g.categoria === currentCategory);
  if (currentSearch.trim()) {
    const q = currentSearch.toLowerCase();
    list = list.filter(g => g.nombre.toLowerCase().includes(q));
  }
  switch (currentSort) {
    case "alpha": list.sort((a,b)=>a.nombre.localeCompare(b.nombre)); break;
    case "alpha-desc": list.sort((a,b)=>b.nombre.localeCompare(a.nombre)); break;
    case "dificultad-asc": list.sort((a,b)=>a.dificultad-b.dificultad || a.nombre.localeCompare(b.nombre)); break;
    case "dificultad-desc": list.sort((a,b)=>b.dificultad-a.dificultad || a.nombre.localeCompare(b.nombre)); break;
    case "jugadores": list.sort((a,b)=> parseJugadores(b.jugadores) - parseJugadores(a.jugadores) || a.nombre.localeCompare(b.nombre)); break;
  }
  return list;
}

function parseJugadores(s) {
  const parts = s.split("-").map(Number);
  return Math.max(...parts);
}

function renderGrid() {
  const list = getFiltered();
  $("#statsLine").textContent = `${list.length} juego${list.length===1?"":"s"} encontrados`;
  grid.innerHTML = "";
  $("#emptyState").style.display = list.length ? "none" : "block";

  list.forEach(g => {
    const card = document.createElement("div");
    card.className = "gcard";
    card.onclick = () => openModal(g);

    const coverWrap = document.createElement("div");
    coverWrap.className = "cover-wrap";
    coverWrap.style.background = hashColor(g.nombre);

    const badge = document.createElement("div");
    badge.className = "badge-cat";
    badge.textContent = g.categoria;
    coverWrap.appendChild(badge);

    const img = document.createElement("img");
    img.loading = "lazy";
    img.alt = g.nombre;
    coverWrap.appendChild(img);

    const fallback = document.createElement("div");
    fallback.className = "cover-fallback";
    fallback.textContent = g.nombre;
    fallback.style.display = "none";
    coverWrap.appendChild(fallback);

    setImageWithFallback(img, g.nombre, FOLDERS.box, () => {
      img.style.display = "none";
      fallback.style.display = "flex";
    });

    const body = document.createElement("div");
    body.className = "gcard-body";
    body.innerHTML = `
      <div class="gcard-title">${g.nombre}</div>
      <div class="gcard-meta">
        <span class="stars">${"★".repeat(g.dificultad)}${"☆".repeat(5-g.dificultad)}</span>
        <span>👥 ${g.jugadores}</span>
      </div>
    `;

    card.appendChild(coverWrap);
    card.appendChild(body);
    grid.appendChild(card);
  });
}

function openModal(g) {
  $("#modalTitle").textContent = g.nombre;
  $("#modalCat").textContent = g.categoria;
  const d = DISCOS.find(x => x.id == g.disco);
  $("#modalDisc").textContent = d ? d.nombre : g.disco;
  $("#modalResena").textContent = g.resena;
  $("#modalDificultad").textContent = "★".repeat(g.dificultad) + "☆".repeat(5-g.dificultad);
  $("#modalJugadores").textContent = g.jugadores;
  $("#modalGenero").textContent = g.genero_original;

  const coverImg = $("#modalCoverImg");
  setImageWithFallback(coverImg, g.nombre, FOLDERS.box, () => { coverImg.src = ""; coverImg.alt = "Sin carátula disponible"; });

  const s1 = $("#shot1"), s2 = $("#shot2");
  setImageWithFallback(s1, g.nombre, FOLDERS.snap, () => { s1.style.display = "none"; });
  setImageWithFallback(s2, g.nombre, FOLDERS.title, () => { s2.style.display = "none"; });
  s1.style.display = ""; s2.style.display = "";

  $("#modalOverlay").classList.add("open");
}

function closeModal() { $("#modalOverlay").classList.remove("open"); }

function selectDisc(id) {
  currentDisc = id;
  currentCategory = "Todas";
  setDiscInUrl(id);
  renderDiscTabs();
  renderBanner();
  renderCategoryChips();
  renderGrid();
  window.scrollTo({top:0, behavior:"smooth"});
}

async function init() {
  await loadData();
  const urlDisc = getParam("disco");
  currentDisc = urlDisc || DISCOS[0].id;
  // Normalizar tipo (los ids pueden ser number o "C")
  if (!DISCOS.some(d => d.id == currentDisc)) currentDisc = DISCOS[0].id;

  renderDiscTabs();
  renderBanner();
  renderCategoryChips();
  renderGrid();

  $("#searchInput").addEventListener("input", (e) => { currentSearch = e.target.value; renderGrid(); });
  $("#sortSelect").addEventListener("change", (e) => { currentSort = e.target.value; renderGrid(); });
  $("#closeModal").addEventListener("click", closeModal);
  $("#modalOverlay").addEventListener("click", (e) => { if (e.target.id === "modalOverlay") closeModal(); });
  document.addEventListener("keydown", (e) => { if (e.key === "Escape") closeModal(); });
}

init();
