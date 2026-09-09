// ====== PS2 GamePass - lógica principal (Supabase) ======
import { createClient } from "https://esm.sh/@supabase/supabase-js@2";

// ---------- Plataformas ----------
// Cada disco/sección pertenece a una plataforma. "libretro" es el nombre exacto
// del repo en https://github.com/libretro-thumbnails/ usado para buscar carátulas
// automáticas; si es null, esa plataforma no tiene carátulas automáticas (se usa
// el póster con iniciales, o la carátula que carguen a mano).
const PLATFORMS = {
  ps2:       { label: "PlayStation 2",          icon: "🎮", libretro: "Sony_-_PlayStation_2" },
  ps1:       { label: "PlayStation 1",          icon: "🎮", libretro: "Sony_-_PlayStation" },
  ps3:       { label: "PlayStation 3",          icon: "🎮", libretro: null },
  psp:       { label: "PSP",                    icon: "🎮", libretro: "Sony_-_PlayStation_Portable" },
  xbox:      { label: "Xbox",                   icon: "🟩", libretro: "Microsoft_-_Xbox" },
  xbox360:   { label: "Xbox 360",                icon: "🟩", libretro: "Microsoft_-_Xbox_360" },
  gamecube:  { label: "GameCube",               icon: "🟪", libretro: "Nintendo_-_GameCube" },
  wii:       { label: "Wii",                     icon: "⚪", libretro: "Nintendo_-_Wii" },
  n64:       { label: "Nintendo 64",             icon: "🕹️", libretro: "Nintendo_-_Nintendo_64" },
  snes:      { label: "Super Nintendo",          icon: "🕹️", libretro: "Nintendo_-_Super_Nintendo_Entertainment_System" },
  nes:       { label: "Nintendo (NES)",          icon: "🕹️", libretro: "Nintendo_-_Nintendo_Entertainment_System" },
  gba:       { label: "Game Boy Advance",        icon: "🎒", libretro: "Nintendo_-_Game_Boy_Advance" },
  switch:    { label: "Nintendo Switch",         icon: "🔴", libretro: null },
  dreamcast: { label: "Dreamcast",               icon: "🌀", libretro: "Sega_-_Dreamcast" },
  megadrive: { label: "Mega Drive / Genesis",    icon: "🔵", libretro: "Sega_-_Mega_Drive_-_Genesis" },
  pc:        { label: "PC",                      icon: "🖥️", libretro: null },
  otro:      { label: "Otra",                    icon: "❓", libretro: null },
};
const LIBRETRO_ROOT = "https://raw.githubusercontent.com/libretro-thumbnails";
const FOLDERS = { box: "Named_Boxarts", snap: "Named_Snaps", title: "Named_Titles" };
const STATUS_LABELS = { no_jugado: "No Jugado", en_curso: "En Curso", finalizado: "Finalizado" };

const ALL_ID = "__all__";
let sb = null;
let DISCOS = [];
let JUEGOS = [];
let CONFIG = { link_descarga_general: null };
let currentConsola = ALL_ID;
let currentDisc = null;
let currentCategory = "Todas";
let currentStatus = "Todos";
let currentSort = "alpha";
let currentSearch = "";
let currentModalGameId = null;
let currentList = [];
let isCreatingNew = false;
let isEditor = false;

const $ = (sel) => document.querySelector(sel);
const grid = $("#grid");

// ---------- Supabase ----------
function configReady() {
  return window.supabaseConfig &&
    window.supabaseConfig.url && !window.supabaseConfig.url.startsWith("PEGA_ACA") &&
    window.supabaseConfig.anonKey && !window.supabaseConfig.anonKey.startsWith("PEGA_ACA");
}

async function initSupabase() {
  if (!configReady()) {
    console.warn("⚠️ Falta completar supabase-config.js — el sitio no puede leer/guardar datos todavía.");
    return;
  }
  sb = createClient(window.supabaseConfig.url, window.supabaseConfig.anonKey);

  const { data: { session } } = await sb.auth.getSession();
  isEditor = !!session;
  sb.auth.onAuthStateChange((_event, session) => {
    isEditor = !!session;
    applyEditorUI();
  });

  // Tiempo real: si otra persona edita/agrega/borra algo, se actualiza solo
  sb.channel("public:juegos").on("postgres_changes", { event: "*", schema: "public", table: "juegos" }, reload).subscribe();
  sb.channel("public:discos").on("postgres_changes", { event: "*", schema: "public", table: "discos" }, reload).subscribe();
  sb.channel("public:config").on("postgres_changes", { event: "*", schema: "public", table: "config" }, reload).subscribe();
}

async function reload() {
  await loadData();
  renderConsolaSelect();
  renderDiscTabs();
  renderBanner();
  renderCategoryChips();
  renderStatusChips();
  renderGrid();
  if (currentModalGameId && $("#modalOverlay").classList.contains("open") && !isCreatingNew) {
    const g = JUEGOS.find(x => x.id === currentModalGameId);
    if (g) openModal(g, { keepForm: true });
  }
}

async function loadData() {
  if (!sb) return;
  const [{ data: discos }, { data: juegos }, { data: config }] = await Promise.all([
    sb.from("discos").select("*").order("id"),
    sb.from("juegos").select("*"),
    sb.from("config").select("*").eq("id", 1).maybeSingle(),
  ]);
  DISCOS = discos || [];
  JUEGOS = juegos || [];
  CONFIG = config || { link_descarga_general: null };
}

// ---------- Auth / modo edición ----------
async function unlockEditor() {
  if (isEditor) {
    await sb.auth.signOut();
    return;
  }
  const pass = window.prompt("Clave de edición:");
  if (!pass) return;
  const { error } = await sb.auth.signInWithPassword({ email: window.EDITOR_EMAIL, password: pass });
  if (error) {
    alert("Clave incorrecta o falta configurar el usuario en Supabase (ver README).");
    console.error(error);
  }
}

function applyEditorUI() {
  document.body.classList.toggle("is-editor", isEditor);
  $("#unlockBtn").textContent = isEditor ? "🔓 Modo edición activo (salir)" : "🔒 Desbloquear edición";
  $("#unlockBtn").classList.toggle("editor-active", isEditor);
}

// --- Plataforma de un disco / juego ---
function platformKeyOf(discId) {
  const d = DISCOS.find(x => x.id == discId);
  const key = d && d.plataforma;
  return key && PLATFORMS[key] ? key : "ps2";
}
function platformOf(discId) {
  return PLATFORMS[platformKeyOf(discId)];
}
// Base del repo de carátulas libretro para la plataforma de ese disco (o null si esa
// plataforma no tiene carátulas automáticas).
function libretroBaseFor(discId) {
  const plat = platformOf(discId);
  return plat.libretro ? `${LIBRETRO_ROOT}/${plat.libretro}/master` : null;
}

// --- Normalización de nombre a la convención libretro (best-effort) ---
function libretroBase(name) {
  return name.replace(/:\s*/g, " - ").replace(/[*?"<>|]/g, "_").replace(/\//g, "_").trim();
}
function coverUrl(base, name, folder) {
  return `${base}/${folder}/${encodeURIComponent(name + ".png")}`;
}
const REGIONS = ["(USA)", "(Europe)", "(Europe, Australia)", "(Japan)", ""];
function nameVariants(name) {
  const base = libretroBase(name);
  const bases = new Set([
    base,
    base.replace(/ - .*/, "").trim(),
    base.replace(/\(.*?\)/, "").trim(),
    name.replace(/\(.*?\)/, "").trim(),
  ]);
  // Variantes extra: & <-> and, artículo "The" al final (convención habitual de libretro),
  // y edición/subtítulos comunes que suelen no estar en el nombre del thumbnail.
  const extra = [];
  bases.forEach(b => {
    if (!b) return;
    if (b.includes("&")) extra.push(b.replace(/&/g, "and"));
    if (/\band\b/i.test(b)) extra.push(b.replace(/\band\b/gi, "&"));
    if (/^the\s+/i.test(b)) extra.push(b.replace(/^the\s+/i, "") + ", The");
    extra.push(b.replace(/\s*:\s*/g, " - "));
    extra.push(b.replace(/[’‘]/g, "'"));
  });
  extra.forEach(b => bases.add(b));
  const variants = [];
  bases.forEach(b => { if (b) REGIONS.forEach(r => variants.push(r ? `${b} ${r}` : b)); });
  return Array.from(new Set(variants));
}
function setImageWithFallback(imgEl, gameName, folder, discId, onAllFail) {
  const base = libretroBaseFor(discId);
  if (!base) { onAllFail && onAllFail(); return; } // plataforma sin carátulas automáticas
  const variants = nameVariants(gameName);
  let i = 0;
  function tryNext() {
    if (i >= variants.length) { onAllFail && onAllFail(); return; }
    imgEl.onerror = () => { i++; tryNext(); };
    imgEl.src = coverUrl(base, variants[i], folder);
  }
  tryNext();
}
function hashColor(str) {
  let h = 0;
  for (let i = 0; i < str.length; i++) h = str.charCodeAt(i) + ((h << 5) - h);
  return `hsl(${Math.abs(h) % 360}, 55%, 30%)`;
}
// --- Carátula automática (cuando no se encuentra ninguna imagen real) ---
// Genera un "póster" con gradiente + iniciales del juego, en vez de un cuadro vacío.
function hashGradient(str) {
  let h = 0;
  for (let i = 0; i < str.length; i++) h = str.charCodeAt(i) + ((h << 5) - h);
  const hue = Math.abs(h) % 360;
  return `linear-gradient(150deg, hsl(${hue},55%,24%), hsl(${(hue + 45) % 360},60%,38%))`;
}
function gameInitials(name) {
  const clean = name.replace(/\(.*?\)/g, "").trim();
  const skip = new Set(["the","of","and","a","el","la","los","las","de","y","del"]);
  const words = clean.split(/\s+/).filter(Boolean).filter(w => !skip.has(w.toLowerCase()));
  const source = words.length ? words : clean.split(/\s+/).filter(Boolean);
  const letters = source.slice(0, 3).map(w => w[0]).join("").toUpperCase();
  return letters || clean.slice(0, 2).toUpperCase();
}
function buildAutoCover(fallbackEl, name) {
  fallbackEl.style.background = hashGradient(name);
  fallbackEl.innerHTML = `<div class="auto-cover-initials">${gameInitials(name)}</div><div class="auto-cover-title">${name}</div>`;
}
function slugify(s) {
  return s.toLowerCase().normalize("NFD").replace(/[\u0300-\u036f]/g, "")
    .replace(/[^a-z0-9]+/g, "-").replace(/(^-|-$)/g, "");
}

function getParam(name) { return new URLSearchParams(window.location.search).get(name); }
function setScopeInUrl(consolaKey, discId) {
  const url = new URL(window.location);
  url.searchParams.set("consola", consolaKey);
  url.searchParams.set("disco", discId);
  window.history.replaceState({}, "", url);
}

// Discos que pertenecen a la consola actualmente elegida (todos si currentConsola es ALL_ID).
function discosInScope() {
  if (currentConsola === ALL_ID) return DISCOS;
  return DISCOS.filter(d => platformKeyOf(d.id) === currentConsola);
}
// Consolas que realmente tienen algún disco cargado (en el orden definido en PLATFORMS).
function consolasPresentes() {
  const keys = new Set(DISCOS.map(d => platformKeyOf(d.id)));
  return Object.keys(PLATFORMS).filter(k => keys.has(k));
}

// ---------- Render ----------
function renderConsolaSelect() {
  const sel = $("#consolaSelect");
  if (!sel) return;
  const consolas = consolasPresentes();
  if (currentConsola !== ALL_ID && !consolas.includes(currentConsola)) currentConsola = ALL_ID;
  const options = [`<option value="${ALL_ID}">🎯 Todas</option>`];
  consolas.forEach(key => {
    options.push(`<option value="${key}">${PLATFORMS[key].icon} ${PLATFORMS[key].label}</option>`);
  });
  options.push(`<option value="__add__">➕ Agregar consola...</option>`);
  sel.innerHTML = options.join("");
  sel.value = currentConsola;
}

function renderDiscTabs() {
  const tabs = $("#discTabButtons");
  tabs.innerHTML = "";
  const discos = discosInScope();
  const allBtn = document.createElement("button");
  allBtn.className = "disc-tab" + (currentDisc === ALL_ID ? " active" : "");
  if (currentDisc === ALL_ID) allBtn.style.background = "linear-gradient(135deg,var(--accent),var(--accent2))";
  allBtn.textContent = "Todos";
  allBtn.onclick = () => selectDisc(ALL_ID);
  tabs.appendChild(allBtn);
  discos.forEach(d => {
    const btn = document.createElement("button");
    btn.className = "disc-tab" + (d.id == currentDisc ? " active" : "");
    if (d.id == currentDisc) btn.style.background = d.color;
    btn.textContent = d.nombre;
    btn.title = platformOf(d.id).label;
    btn.onclick = () => selectDisc(d.id);
    tabs.appendChild(btn);
  });
  const addBtn = document.createElement("button");
  addBtn.className = "disc-tab admin-only add-disc-tab";
  addBtn.textContent = "+ Disco";
  addBtn.onclick = () => openDiscModal(null, currentConsola !== ALL_ID ? currentConsola : null);
  tabs.appendChild(addBtn);
}

function updateCurrentDiscLabel() {
  const label = $("#currentDiscLabel");
  if (!label) return;
  if (currentDisc !== ALL_ID) {
    const d = DISCOS.find(x => x.id == currentDisc);
    label.textContent = d ? `Viendo: ${d.nombre}` : "";
    return;
  }
  if (currentConsola !== ALL_ID) { label.textContent = `Viendo: ${PLATFORMS[currentConsola].label} (todos los discos)`; return; }
  label.textContent = "Viendo: Todos los discos";
}

function renderBanner() {
  updateCurrentDiscLabel();
  if (currentDisc === ALL_ID) {
    const scopedGames = gamesInScope();
    if (currentConsola !== ALL_ID) {
      $("#discBanner").style.background = `linear-gradient(135deg, #5ee7c8, #7c5cff)`;
      $("#discBanner").innerHTML = `
        <h1>${PLATFORMS[currentConsola].label}</h1>
        <p>Todos los discos de esta consola.</p>
        <div class="count">${scopedGames.length}</div>
      `;
      return;
    }
    $("#discBanner").style.background = `linear-gradient(135deg, #5ee7c8, #7c5cff)`;
    $("#discBanner").innerHTML = `
      <h1>Todos los discos</h1>
      <p>Todos los juegos de tu colección, sin importar consola o disco.</p>
      <div class="count">${scopedGames.length}</div>
    `;
    return;
  }
  const d = DISCOS.find(x => x.id == currentDisc);
  if (!d) { $("#discBanner").innerHTML = ""; return; }
  const count = JUEGOS.filter(g => g.disco == currentDisc).length;
  const plat = platformOf(d.id);
  $("#discBanner").style.background = `linear-gradient(135deg, ${d.color}, #00000055)`;
  $("#discBanner").innerHTML = `
    <h1>${d.nombre} · ${d.subtitulo || ""} <button class="edit-disc-btn admin-only" id="editDiscBtn" title="Editar nombre del disco">✏️</button><button class="edit-disc-btn admin-only" id="importGamesOpenBtn" title="Importar juegos con IA">📥</button></h1>
    <p>${plat.label} · navegá el catálogo de esta sección sin adivinar qué contiene.</p>
    <div class="count">${count}</div>
  `;
  const editBtn = $("#editDiscBtn");
  if (editBtn) editBtn.onclick = () => openDiscModal(d);
  const importBtn = $("#importGamesOpenBtn");
  if (importBtn) importBtn.onclick = () => openImportModal(d.id);
}

function renderGeneralDownload() {
  const box = $("#generalDownloadBox");
  box.innerHTML = "";
  if (CONFIG.link_descarga_general) {
    const a = document.createElement("a");
    a.href = CONFIG.link_descarga_general;
    a.target = "_blank"; a.rel = "noopener";
    a.className = "btn-download-general";
    a.textContent = "⬇️ Descargar (link general)";
    box.appendChild(a);
  }
  const editBtn = document.createElement("button");
  editBtn.className = "btn-edit-general admin-only";
  editBtn.textContent = CONFIG.link_descarga_general ? "✏️ Editar link general" : "+ Agregar link general de descarga";
  editBtn.onclick = editGeneralDownload;
  box.appendChild(editBtn);
}

// Juegos visibles según consola + disco elegidos (antes de aplicar categoría/estado/búsqueda).
function gamesInScope() {
  if (currentDisc !== ALL_ID) return JUEGOS.filter(g => g.disco == currentDisc);
  const discIds = new Set(discosInScope().map(d => d.id));
  return JUEGOS.filter(g => discIds.has(g.disco));
}

function renderCategoryChips() {
  const base = gamesInScope();
  const cats = ["Todas", ...new Set(base.map(g => g.categoria))]
    .sort((a,b)=> a==="Todas"?-1:a.localeCompare(b));

  const buildInto = (box) => {
    if (!box) return;
    box.innerHTML = "";
    cats.forEach(c => {
      const chip = document.createElement("div");
      chip.className = "chip" + (c === currentCategory ? " active" : "");
      chip.textContent = c;
      chip.onclick = () => { currentCategory = c; renderCategoryChips(); renderGrid(); };
      box.appendChild(chip);
    });
  };
  buildInto($("#categoryChips"));
  buildInto($("#categoryChipsDrawer"));

  const dl = $("#categoriaDatalist");
  if (dl) dl.innerHTML = [...new Set(JUEGOS.map(g => g.categoria))].map(c => `<option value="${c}">`).join("");
}

function renderStatusChips() {
  const buildInto = (box) => {
    if (!box) return;
    box.innerHTML = "";
    [["Todos", null], ["No Jugado", "no_jugado"], ["En Curso", "en_curso"], ["Finalizado", "finalizado"]].forEach(([label, key]) => {
      const chip = document.createElement("div");
      chip.className = "chip status-chip" + (currentStatus === label ? " active" : "");
      if (key) chip.dataset.status = key;
      chip.textContent = label;
      chip.onclick = () => { currentStatus = label; renderStatusChips(); renderGrid(); };
      box.appendChild(chip);
    });
  };
  buildInto($("#statusChips"));
  buildInto($("#statusChipsDrawer"));
}

function getFiltered() {
  let list = gamesInScope();
  if (currentCategory !== "Todas") list = list.filter(g => g.categoria === currentCategory);
  if (currentStatus !== "Todos") {
    const key = { "No Jugado": "no_jugado", "En Curso": "en_curso", "Finalizado": "finalizado" }[currentStatus];
    list = list.filter(g => (g.estado || "no_jugado") === key);
  }
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
    case "estado": {
      const order = { en_curso: 0, no_jugado: 1, finalizado: 2 };
      list.sort((a,b)=> order[a.estado||"no_jugado"] - order[b.estado||"no_jugado"] || a.nombre.localeCompare(b.nombre));
      break;
    }
  }
  return list;
}
function parseJugadores(s) { return Math.max(...String(s).split("-").map(Number)); }

function renderGrid() {
  const list = getFiltered();
  currentList = list;
  $("#statsLine").textContent = `${list.length} juego${list.length===1?"":"s"} encontrados`;
  grid.innerHTML = "";
  $("#emptyState").style.display = list.length ? "none" : "block";

  list.forEach(g => {
    const estado = g.estado || "no_jugado";
    const card = document.createElement("div");
    card.className = "gcard";
    card.onclick = () => openModal(g);

    const coverWrap = document.createElement("div");
    coverWrap.className = "cover-wrap";
    coverWrap.style.background = hashColor(g.nombre);

    const badge = document.createElement("div");
    badge.className = "badge-cat"; badge.textContent = g.categoria;
    coverWrap.appendChild(badge);

    const statusBadge = document.createElement("div");
    statusBadge.className = "badge-status " + estado; statusBadge.textContent = STATUS_LABELS[estado];
    coverWrap.appendChild(statusBadge);

    const img = document.createElement("img");
    img.loading = "lazy"; img.alt = g.nombre;
    coverWrap.appendChild(img);

    const fallback = document.createElement("div");
    fallback.className = "cover-fallback"; fallback.style.display = "none";
    coverWrap.appendChild(fallback);

    const showFallback = () => { img.style.display = "none"; buildAutoCover(fallback, g.nombre); fallback.style.display = "flex"; };
    if (g.caratula) {
      img.src = g.caratula;
      img.onerror = showFallback;
    } else {
      setImageWithFallback(img, g.nombre, FOLDERS.box, g.disco, showFallback);
    }

    const body = document.createElement("div");
    body.className = "gcard-body";
    const discoNombre = currentDisc === ALL_ID ? (DISCOS.find(d => d.id == g.disco)?.nombre || g.disco) : null;
    body.innerHTML = `
      <div class="gcard-title">${g.nombre}</div>
      ${discoNombre ? `<div class="gcard-disc">📀 ${discoNombre}</div>` : ""}
      <div class="gcard-meta">
        <span class="stars">${"★".repeat(g.dificultad)}${"☆".repeat(5-g.dificultad)}</span>
        <span>👥 ${g.jugadores}</span>
      </div>
      ${g.link_descarga ? `<a class="gcard-download" href="${g.link_descarga}" target="_blank" rel="noopener" onclick="event.stopPropagation()">⬇️ Descargar</a>` : ""}
    `;

    card.appendChild(coverWrap);
    card.appendChild(body);
    grid.appendChild(card);
  });
}

function openModal(g, opts = {}) {
  isCreatingNew = false;
  currentModalGameId = g.id;

  $("#modalTitle").textContent = g.nombre;
  $("#modalCat").textContent = g.categoria;
  const d = DISCOS.find(x => x.id == g.disco);
  $("#modalDisc").textContent = d ? d.nombre : g.disco;
  $("#modalResena").textContent = g.resena || "";
  $("#modalDificultad").textContent = "★".repeat(g.dificultad) + "☆".repeat(5-g.dificultad);
  $("#modalJugadores").textContent = g.jugadores;
  $("#modalGenero").textContent = g.genero_original || "";

  const dlBtn = $("#modalDownloadBtn");
  if (g.link_descarga) { dlBtn.href = g.link_descarga; dlBtn.style.display = "inline-block"; }
  else { dlBtn.style.display = "none"; }

  const coverImg = $("#modalCoverImg");
  const modalFallback = $("#modalCoverFallback");
  const showModalFallback = () => { coverImg.style.display = "none"; buildAutoCover(modalFallback, g.nombre); modalFallback.style.display = "flex"; };
  coverImg.style.display = ""; modalFallback.style.display = "none";
  if (g.caratula) {
    coverImg.src = g.caratula;
    coverImg.onerror = showModalFallback;
  } else {
    setImageWithFallback(coverImg, g.nombre, FOLDERS.box, g.disco, showModalFallback);
  }

  const s1 = $("#shot1"), s2 = $("#shot2");
  const showS1Fail = () => { s1.style.display = "none"; };
  const showS2Fail = () => { s2.style.display = "none"; };
  s1.style.display = ""; s2.style.display = "";
  if (g.shot1) { s1.src = g.shot1; s1.onerror = showS1Fail; }
  else { setImageWithFallback(s1, g.nombre, FOLDERS.snap, g.disco, showS1Fail); }
  if (g.shot2) { s2.src = g.shot2; s2.onerror = showS2Fail; }
  else { setImageWithFallback(s2, g.nombre, FOLDERS.title, g.disco, showS2Fail); }

  $("#deleteGameBtn").style.display = "inline-block";
  $("#modalTitleLabel").textContent = "Editar juego";

  if (!opts.keepForm) {
    $("#editForm").classList.remove("open");
    fillForm(g);
  }
  $("#modalOverlay").classList.add("open");
}

function coverSearchUrls(nombre, discId) {
  const plat = platformOf(discId);
  const q = encodeURIComponent(`${nombre} ${plat.label} caratula boxart`);
  const links = [
    { label: "🔎 Google Imágenes", url: `https://www.google.com/search?tbm=isch&q=${q}` },
    { label: "MobyGames", url: `https://www.mobygames.com/search/?q=${encodeURIComponent(nombre)}` },
  ];
  if (plat.libretro) {
    links.splice(1, 0, { label: "TheCoverProject", url: `https://www.thecoverproject.net/index.php?wpage=1&cover_search=${encodeURIComponent(nombre)}` });
  }
  return links;
}
function renderCoverSearchLinks(nombre, discId) {
  const box = $("#coverSearchLinks");
  if (!box) return;
  box.innerHTML = coverSearchUrls(nombre || "", discId).map(l =>
    `<a href="${l.url}" target="_blank" rel="noopener">${l.label} ↗</a>`
  ).join("");
}

function fillForm(g) {
  $("#inputNombre").value = g.nombre || "";
  $("#inputDisco").innerHTML = DISCOS.map(d => `<option value="${d.id}" ${d.id==g.disco?"selected":""}>${d.nombre}</option>`).join("");
  $("#inputCategoria").value = g.categoria || "";
  $("#inputGenero").value = g.genero_original || "";
  $("#inputDificultad").value = g.dificultad || 3;
  $("#inputJugadores").value = g.jugadores || "1";
  $("#inputCaratula").value = g.caratula || "";
  renderCoverSearchLinks(g.nombre, g.disco);
  $("#inputShot1").value = g.shot1 || "";
  $("#inputShot2").value = g.shot2 || "";
  $("#inputDescarga").value = g.link_descarga || "";
  $("#inputResena").value = g.resena || "";
  setActiveStatusButton(g.estado || "no_jugado");
}

function openNewGameModal() {
  isCreatingNew = true;
  currentModalGameId = null;
  $("#modalTitle").textContent = "Nuevo juego";
  $("#modalTitleLabel").textContent = "Nuevo juego";
  $("#modalCat").textContent = ""; $("#modalDisc").textContent = "";
  $("#modalResena").textContent = ""; $("#modalDificultad").textContent = "";
  $("#modalJugadores").textContent = ""; $("#modalGenero").textContent = "";
  $("#modalDownloadBtn").style.display = "none";
  $("#modalCoverImg").src = "";
  $("#shot1").style.display = "none"; $("#shot2").style.display = "none";
  $("#deleteGameBtn").style.display = "none";
  const defaultDisco = currentDisc !== ALL_ID ? currentDisc : (discosInScope()[0] && discosInScope()[0].id) || (DISCOS[0] && DISCOS[0].id);
  fillForm({ disco: defaultDisco, dificultad: 3, jugadores: "1", estado: "no_jugado" });
  $("#editForm").classList.add("open");
  $("#modalOverlay").classList.add("open");
}

function setActiveStatusButton(status) {
  document.querySelectorAll("#statusButtons .status-btn").forEach(btn => {
    btn.classList.toggle("active", btn.dataset.status === status);
  });
}
function closeModal() { $("#modalOverlay").classList.remove("open"); currentModalGameId = null; isCreatingNew = false; }

function navigateModal(delta) {
  if (isCreatingNew || !currentModalGameId || !currentList.length) return;
  const idx = currentList.findIndex(g => g.id === currentModalGameId);
  if (idx === -1) return;
  const newIdx = idx + delta;
  if (newIdx < 0 || newIdx >= currentList.length) return; // no hay más en esa dirección
  openModal(currentList[newIdx]);
}

function selectConsola(key) {
  currentConsola = key;
  currentDisc = ALL_ID;
  currentCategory = "Todas"; currentStatus = "Todos";
  setScopeInUrl(currentConsola, currentDisc);
  renderConsolaSelect(); renderDiscTabs(); renderBanner(); renderCategoryChips(); renderStatusChips(); renderGrid();
  window.scrollTo({top:0, behavior:"smooth"});
}

function selectDisc(id) {
  currentDisc = id;
  if (id !== ALL_ID) {
    const d = DISCOS.find(x => x.id == id);
    if (d) currentConsola = platformKeyOf(d.id); // al elegir un disco puntual, la consola sigue a ese disco
  }
  currentCategory = "Todas"; currentStatus = "Todos";
  setScopeInUrl(currentConsola, id);
  renderConsolaSelect(); renderDiscTabs(); renderBanner(); renderCategoryChips(); renderStatusChips(); renderGrid();
  window.scrollTo({top:0, behavior:"smooth"});
}

function openMobileMenu() { $("#discTabs").classList.add("open"); $("#menuBackdrop").classList.add("open"); }
function closeMobileMenu() { $("#discTabs").classList.remove("open"); $("#menuBackdrop").classList.remove("open"); }
function toggleMobileMenu() { $("#discTabs").classList.contains("open") ? closeMobileMenu() : openMobileMenu(); }

// ---------- Escritura (requiere sesión de editor; RLS lo exige igual del lado servidor) ----------
async function saveGame() {
  const activeBtn = document.querySelector("#statusButtons .status-btn.active");
  const payload = {
    nombre: $("#inputNombre").value.trim(),
    disco: $("#inputDisco").value,
    categoria: $("#inputCategoria").value.trim() || "Sin categoría",
    genero_original: $("#inputGenero").value.trim(),
    dificultad: Number($("#inputDificultad").value),
    jugadores: $("#inputJugadores").value.trim() || "1",
    caratula: $("#inputCaratula").value.trim() || null,
    shot1: $("#inputShot1").value.trim() || null,
    shot2: $("#inputShot2").value.trim() || null,
    link_descarga: $("#inputDescarga").value.trim() || null,
    resena: $("#inputResena").value.trim(),
    estado: activeBtn ? activeBtn.dataset.status : "no_jugado",
  };
  if (!payload.nombre) { alert("Ponele un nombre al juego."); return; }

  if (isCreatingNew) {
    let id = `d${payload.disco}-${slugify(payload.nombre)}`;
    if (JUEGOS.some(g => g.id === id)) id = `${id}-${Date.now()}`;
    const { error } = await sb.from("juegos").insert({ id, ...payload });
    if (error) { alert("No se pudo crear el juego. ¿Iniciaste sesión con la clave?"); console.error(error); return; }
  } else {
    const { error } = await sb.from("juegos").update(payload).eq("id", currentModalGameId);
    if (error) { alert("No se pudo guardar. ¿Iniciaste sesión con la clave?"); console.error(error); return; }
  }
  await reload();
  closeModal();
}

async function deleteGame() {
  if (!currentModalGameId) return;
  if (!confirm("¿Eliminar este juego del catálogo? No se puede deshacer.")) return;
  const { error } = await sb.from("juegos").delete().eq("id", currentModalGameId);
  if (error) { alert("No se pudo eliminar."); console.error(error); return; }
  await reload();
  closeModal();
}

// ---------- Modal de discos (crear / editar / eliminar) ----------
let discEditingId = null; // null = creando disco nuevo

function openDiscModal(d, prefillPlatform) {
  if (!isEditor) return;
  discEditingId = d ? d.id : null;
  $("#discModalTitle").textContent = d ? "Editar disco" : "Nuevo disco";
  $("#discInputNombre").value = d ? d.nombre : "";
  $("#discInputSubtitulo").value = d ? (d.subtitulo || "") : "";
  $("#discInputColor").value = d && d.color ? d.color : "#7c5cff";
  $("#discInputPlataforma").innerHTML = Object.entries(PLATFORMS)
    .map(([key, p]) => `<option value="${key}">${p.icon} ${p.label}</option>`).join("");
  $("#discInputPlataforma").value = (d && d.plataforma && PLATFORMS[d.plataforma]) ? d.plataforma
    : (prefillPlatform && PLATFORMS[prefillPlatform]) ? prefillPlatform : "ps2";

  const otherDiscs = DISCOS.filter(x => !d || x.id !== d.id);
  const moveLabel = $("#discMoveGamesLabel");
  const moveSelect = $("#discMoveGamesSelect");
  const gamesInDisc = d ? JUEGOS.filter(g => g.disco == d.id) : [];
  if (d && gamesInDisc.length && otherDiscs.length) {
    moveLabel.style.display = "flex";
    moveSelect.innerHTML = otherDiscs.map(x => `<option value="${x.id}">${x.nombre}</option>`).join("");
  } else {
    moveLabel.style.display = "none";
  }
  $("#discBtnDelete").style.display = d ? "inline-block" : "none";
  $("#discModalOverlay").classList.add("open");
}
function closeDiscModal() { $("#discModalOverlay").classList.remove("open"); discEditingId = null; }

async function saveDisco() {
  const nombre = $("#discInputNombre").value.trim();
  if (!nombre) { alert("Ponele un nombre al disco."); return; }
  const subtitulo = $("#discInputSubtitulo").value.trim();
  const color = $("#discInputColor").value || "#7c5cff";
  const plataforma = $("#discInputPlataforma").value || "ps2";

  if (discEditingId) {
    const { error } = await sb.from("discos").update({ nombre, subtitulo, color, plataforma }).eq("id", discEditingId);
    if (error) { alert("No se pudo guardar. ¿Iniciaste sesión con la clave?"); console.error(error); return; }
    await reload();
    closeDiscModal();
  } else {
    let id = slugify(nombre) || `disco-${Date.now()}`;
    if (DISCOS.some(d => String(d.id) === id)) id = `${id}-${Date.now()}`;
    const { error } = await sb.from("discos").insert({ id, nombre, subtitulo, color, plataforma });
    if (error) { alert("No se pudo crear el disco. ¿Iniciaste sesión con la clave?"); console.error(error); return; }
    await reload();
    closeDiscModal();
    selectDisc(id);
  }
}

async function deleteDiscoConfirmed() {
  if (!discEditingId) return;
  const d = DISCOS.find(x => x.id === discEditingId);
  if (!d) return;
  const gamesInDisc = JUEGOS.filter(g => g.disco == discEditingId);
  const otherDiscs = DISCOS.filter(x => x.id !== discEditingId);

  if (gamesInDisc.length) {
    if (!otherDiscs.length) {
      if (!confirm(`El disco "${d.nombre}" tiene ${gamesInDisc.length} juego(s) y no hay otro disco disponible para moverlos. Si continuás, esos juegos se eliminarán también. ¿Eliminar de todas formas?`)) return;
    } else {
      const target = $("#discMoveGamesSelect").value;
      const targetName = DISCOS.find(x => x.id === target)?.nombre || target;
      if (!confirm(`Se moverán ${gamesInDisc.length} juego(s) a "${targetName}" y luego se eliminará el disco "${d.nombre}". ¿Continuar?`)) return;
      const { error: moveError } = await sb.from("juegos").update({ disco: target }).eq("disco", discEditingId);
      if (moveError) { alert("No se pudieron mover los juegos. Cancelado."); console.error(moveError); return; }
    }
  } else {
    if (!confirm(`¿Eliminar el disco "${d.nombre}"? No se puede deshacer.`)) return;
  }

  const { error } = await sb.from("discos").delete().eq("id", discEditingId);
  if (error) { alert("No se pudo eliminar el disco. ¿Iniciaste sesión con la clave?"); console.error(error); return; }
  await reload();
  closeDiscModal();
  selectDisc(ALL_ID);
}

// ---------- Autocompletar carátulas (solo busca las que faltan, nunca reemplaza una que ya existe) ----------
function testImageUrl(url) {
  return new Promise(resolve => {
    const img = new Image();
    img.onload = () => resolve(true);
    img.onerror = () => resolve(false);
    img.src = url;
  });
}
async function findCoverForGame(g) {
  const base = libretroBaseFor(g.disco); // null si la plataforma de ese disco no tiene carátulas automáticas
  if (!base) return null;
  const variants = nameVariants(g.nombre);
  for (const v of variants) {
    const url = coverUrl(base, v, FOLDERS.box);
    if (await testImageUrl(url)) return url;
  }
  return null;
}
async function autoFillCovers() {
  if (!isEditor) return;
  // Solo los juegos que se están viendo ahora mismo (respeta consola/disco/categoría/búsqueda) y que no tienen carátula.
  const targets = getFiltered().filter(g => !g.caratula);
  if (!targets.length) { alert("No hay juegos sin carátula en esta vista — los que ya tienen una cargada nunca se tocan."); return; }
  if (!confirm(`Se va a buscar automáticamente una carátula para ${targets.length} juego(s) sin carátula en esta vista (las que ya tenés puestas no se tocan). Puede tardar un rato. ¿Continuar?`)) return;

  const btn = $("#autoCoversBtn");
  const original = btn.textContent;
  btn.disabled = true;
  let found = 0;
  for (let i = 0; i < targets.length; i++) {
    const g = targets[i];
    btn.textContent = `⏳ Buscando… (${i + 1}/${targets.length})`;
    const url = await findCoverForGame(g);
    if (url) {
      const { error } = await sb.from("juegos").update({ caratula: url }).eq("id", g.id);
      if (!error) found++;
    }
  }
  btn.disabled = false;
  btn.textContent = original;
  await reload();
  alert(`Listo: se encontraron carátulas para ${found} de ${targets.length} juego(s). Los que no se encontraron siguen mostrando el póster con iniciales — les podés cargar una a mano cuando quieras.`);
}

// ---------- Repetidos (juegos con el mismo nombre, dentro o entre discos) ----------
function normalizeGameName(name) {
  return String(name || "")
    .normalize("NFD").replace(/[\u0300-\u036f]/g, "") // saca acentos
    .toLowerCase()
    .replace(/\(.*?\)/g, "") // saca "(USA)", "(Disco 1)", etc.
    .replace(/[^a-z0-9]+/g, " ")
    .trim();
}
function findDuplicateGroups() {
  const map = new Map();
  JUEGOS.forEach(g => {
    const nameKey = normalizeGameName(g.nombre);
    if (!nameKey) return;
    const key = platformKeyOf(g.disco) + "::" + nameKey; // mismo nombre en distinta consola no es "repetido"
    if (!map.has(key)) map.set(key, []);
    map.get(key).push(g);
  });
  return [...map.values()]
    .filter(arr => arr.length > 1)
    .sort((a, b) => a[0].nombre.localeCompare(b[0].nombre));
}
// "Más completo" = tiene más campos opcionales cargados (carátula, capturas, reseña, etc).
// Sirve para decidir cuál copia conservar al borrar repetidos.
function completenessScore(g) {
  let s = 0;
  if (g.caratula) s++;
  if (g.shot1) s++;
  if (g.shot2) s++;
  if (g.resena) s++;
  if (g.link_descarga) s++;
  if (g.genero_original) s++;
  return s;
}

function openDuplicatesModal() {
  const groups = findDuplicateGroups();
  $("#duplicatesCount").textContent = groups.length
    ? `${groups.length} nombre(s) repetido(s) — ${groups.reduce((acc, g) => acc + g.length, 0)} juego(s) en total.`
    : "No se encontraron juegos repetidos. 🎉";
  $("#duplicatesList").innerHTML = groups.map(group => {
    const items = group.map(g => {
      const d = DISCOS.find(x => x.id == g.disco);
      const plat = platformOf(g.disco).label;
      return `<li>${g.nombre} <span class="dup-disc">— ${plat} · ${d ? d.nombre : g.disco}${g.categoria ? " · " + g.categoria : ""}</span></li>`;
    }).join("");
    return `<div class="dup-group"><b>${group[0].nombre}</b><span class="dup-n">×${group.length}</span><ul>${items}</ul></div>`;
  }).join("");
  $("#btnConfirmDeleteDuplicates").style.display = groups.length ? "inline-block" : "none";
  $("#duplicatesModalOverlay").classList.add("open");
}
function closeDuplicatesModal() { $("#duplicatesModalOverlay").classList.remove("open"); }

async function deleteDuplicates() {
  const groups = findDuplicateGroups();
  if (!groups.length) { alert("No hay juegos repetidos para borrar."); return; }

  const idsToDelete = [];
  groups.forEach(group => {
    // Conserva el que tenga más datos cargados; si empatan, el de id más chico (más viejo).
    const sorted = [...group].sort((a, b) =>
      completenessScore(b) - completenessScore(a) || String(a.id).localeCompare(String(b.id))
    );
    sorted.slice(1).forEach(g => idsToDelete.push(g.id));
  });

  if (!confirm(`Se van a eliminar ${idsToDelete.length} juego(s) repetido(s), conservando la copia con más datos cargados de cada uno. Esta acción no se puede deshacer. ¿Continuar?`)) return;

  const { error } = await sb.from("juegos").delete().in("id", idsToDelete);
  if (error) { alert("No se pudo eliminar. ¿Iniciaste sesión con la clave?"); console.error(error); return; }
  await reload();
  closeDuplicatesModal();
}

async function editGeneralDownload() {
  if (!isEditor) return;
  const current = CONFIG.link_descarga_general || "";
  const url = window.prompt("Link general de descarga (dejalo vacío para quitarlo):", current);
  if (url === null) return;
  const { error } = await sb.from("config").upsert({ id: 1, link_descarga_general: url.trim() || null });
  if (error) { alert("No se pudo guardar."); console.error(error); return; }
  await reload();
}

// ---------- Importar juegos en lote con ayuda de una IA ----------
function buildImportPrompt(discId) {
  const plat = platformOf(discId);
  return `Necesito que completes datos para un catálogo de juegos de ${plat.label}.
Te voy a pasar una lista de nombres de juegos (uno por línea, puede tener errores de tipeo).
Para cada juego devolveme un objeto con estos campos exactos:

- nombre: nombre correcto y bien escrito del juego
- categoria: 1 o 2 palabras en español (por ejemplo: Arcade, Aventura, Carreras, Deportes, Fiesta, Lucha, Plataformas, RPG, Shooter, Survival Horror)
- genero_original: género más específico en inglés (por ejemplo: "Survival Horror", "Beat 'em up", "Racing", "Platformer")
- dificultad: número del 1 (fácil) al 5 (muy difícil)
- jugadores: cantidad de jugadores como texto (por ejemplo: "1", "1-2", "1-4")
- resena: reseña corta en español, 2 o 3 frases, sobre de qué trata el juego
- estado: siempre el texto "no_jugado"

Respondé ÚNICAMENTE con un array JSON válido. Sin texto antes ni después. Sin bloques de código (sin \`\`\`). Un objeto por juego, con esta forma exacta:

[{"nombre":"God of War","categoria":"Aventura","genero_original":"Hack and slash","dificultad":4,"jugadores":"1","resena":"Kratos busca venganza contra los dioses del Olimpo en esta épica aventura de acción mitológica.","estado":"no_jugado"}]

Esta es la lista de juegos que quiero que completes:
`;
}

let importTargetDisc = null;

function openImportModal(discId) {
  if (!isEditor) return;
  importTargetDisc = discId;
  $("#importJsonInput").value = "";
  $("#importStatusMsg").textContent = "";
  $("#copyImportPromptBtn").textContent = "📋 Copiar prompt para la IA";
  $("#importModalOverlay").classList.add("open");
}
function closeImportModal() { $("#importModalOverlay").classList.remove("open"); importTargetDisc = null; }

async function copyImportPrompt() {
  const prompt = buildImportPrompt(importTargetDisc);
  try {
    await navigator.clipboard.writeText(prompt);
    $("#copyImportPromptBtn").textContent = "✅ Copiado — pegalo en tu IA";
    setTimeout(() => { $("#copyImportPromptBtn").textContent = "📋 Copiar prompt para la IA"; }, 2500);
  } catch (e) {
    window.prompt("No se pudo copiar automáticamente. Copiá este texto a mano (Ctrl+C):", prompt);
  }
}

async function importGamesFromJson() {
  if (!importTargetDisc) return;
  const raw = $("#importJsonInput").value.trim();
  if (!raw) { $("#importStatusMsg").textContent = "Pegá primero la respuesta de la IA."; return; }

  let parsed;
  try {
    const cleaned = raw.replace(/^```json\s*/i, "").replace(/^```\s*/, "").replace(/```\s*$/, "").trim();
    parsed = JSON.parse(cleaned);
  } catch (e) {
    $("#importStatusMsg").textContent = "❌ Eso no es un JSON válido. Revisá que hayas pegado toda la respuesta de la IA, sin texto extra antes o después.";
    return;
  }
  if (!Array.isArray(parsed) || !parsed.length) {
    $("#importStatusMsg").textContent = "❌ Tiene que ser una lista de juegos entre corchetes [ ].";
    return;
  }

  const rows = parsed.map(item => {
    const nombre = String(item.nombre || "").trim();
    if (!nombre) return null;
    return {
      id: `d${importTargetDisc}-${slugify(nombre)}`,
      nombre,
      disco: importTargetDisc,
      categoria: String(item.categoria || "Sin categoría").trim() || "Sin categoría",
      genero_original: String(item.genero_original || "").trim(),
      dificultad: Number(item.dificultad) >= 1 && Number(item.dificultad) <= 5 ? Number(item.dificultad) : 3,
      jugadores: String(item.jugadores || "1").trim() || "1",
      resena: String(item.resena || "").trim(),
      estado: ["no_jugado", "en_curso", "finalizado"].includes(item.estado) ? item.estado : "no_jugado",
    };
  }).filter(Boolean);

  if (!rows.length) { $("#importStatusMsg").textContent = "❌ No se encontró ningún juego válido en ese JSON."; return; }

  // Evitar ids duplicados, ya sea contra juegos existentes o entre sí.
  const usedIds = new Set(JUEGOS.map(g => g.id));
  rows.forEach(r => {
    while (usedIds.has(r.id)) r.id = `${r.id}-${Math.random().toString(36).slice(2, 6)}`;
    usedIds.add(r.id);
  });

  $("#importStatusMsg").textContent = `Importando ${rows.length} juego(s)...`;
  const { error } = await sb.from("juegos").insert(rows);
  if (error) {
    $("#importStatusMsg").textContent = "❌ No se pudo importar. ¿Iniciaste sesión con la clave?";
    console.error(error);
    return;
  }
  await reload();
  closeImportModal();
}

// ---------- Init ----------
async function init() {
  await initSupabase();
  applyEditorUI();
  await loadData();

  const urlConsola = getParam("consola");
  currentConsola = (urlConsola && (urlConsola === ALL_ID || PLATFORMS[urlConsola])) ? urlConsola : ALL_ID;

  const urlDisc = getParam("disco");
  currentDisc = urlDisc || (currentConsola === ALL_ID ? (DISCOS[0] && DISCOS[0].id) : ALL_ID);
  if (currentDisc !== ALL_ID && !DISCOS.some(d => d.id == currentDisc)) currentDisc = DISCOS[0] && DISCOS[0].id;
  if (currentDisc !== ALL_ID) {
    const d = DISCOS.find(x => x.id == currentDisc);
    if (d) currentConsola = platformKeyOf(d.id);
  }

  renderConsolaSelect(); renderDiscTabs(); renderBanner(); renderGeneralDownload(); renderCategoryChips(); renderStatusChips(); renderGrid();

  $("#searchInput").addEventListener("input", (e) => { currentSearch = e.target.value; renderGrid(); });
  $("#sortSelect").addEventListener("change", (e) => { currentSort = e.target.value; renderGrid(); });
  $("#closeModal").addEventListener("click", closeModal);
  $("#modalOverlay").addEventListener("click", (e) => { if (e.target.id === "modalOverlay") closeModal(); });
  $("#modalPrev").addEventListener("click", () => navigateModal(-1));
  $("#modalNext").addEventListener("click", () => navigateModal(1));
  document.addEventListener("keydown", (e) => {
    if (e.key === "Escape") { closeModal(); return; }
    if (!$("#modalOverlay").classList.contains("open")) return;
    const tag = (document.activeElement && document.activeElement.tagName) || "";
    if (tag === "INPUT" || tag === "TEXTAREA" || tag === "SELECT") return; // no interferir mientras se escribe
    if (e.key === "ArrowLeft") navigateModal(-1);
    if (e.key === "ArrowRight") navigateModal(1);
  });

  // Deslizar (swipe) en el celular para pasar de juego
  let touchStartX = null;
  const modalEl = document.querySelector("#modalOverlay .modal");
  modalEl.addEventListener("touchstart", (e) => { touchStartX = e.touches[0].clientX; }, { passive: true });
  modalEl.addEventListener("touchend", (e) => {
    if (touchStartX === null) return;
    const deltaX = e.changedTouches[0].clientX - touchStartX;
    if (Math.abs(deltaX) > 60) navigateModal(deltaX < 0 ? 1 : -1);
    touchStartX = null;
  }, { passive: true });

  $("#unlockBtn").addEventListener("click", unlockEditor);
  $("#consolaSelect").addEventListener("change", (e) => {
    const val = e.target.value;
    if (val === "__add__") {
      e.target.value = currentConsola; // revierte visualmente, la consola se agrega creando su primer disco
      openDiscModal(null);
      return;
    }
    selectConsola(val);
  });
  $("#menuToggleBtn").addEventListener("click", toggleMobileMenu);
  $("#menuBackdrop").addEventListener("click", closeMobileMenu);
  const closeDrawerBtn = $("#closeDrawerBtn");
  if (closeDrawerBtn) closeDrawerBtn.addEventListener("click", closeMobileMenu);
  $("#addGameBtn").addEventListener("click", openNewGameModal);
  $("#autoCoversBtn").addEventListener("click", autoFillCovers);
  $("#duplicatesBtn").addEventListener("click", openDuplicatesModal);
  $("#deleteDuplicatesBtn").addEventListener("click", deleteDuplicates);
  $("#closeDuplicatesModal").addEventListener("click", closeDuplicatesModal);
  $("#duplicatesModalOverlay").addEventListener("click", (e) => { if (e.target.id === "duplicatesModalOverlay") closeDuplicatesModal(); });
  $("#btnConfirmDeleteDuplicates").addEventListener("click", deleteDuplicates);
  $("#inputNombre").addEventListener("input", (e) => renderCoverSearchLinks(e.target.value, $("#inputDisco").value));
  $("#inputDisco").addEventListener("change", () => renderCoverSearchLinks($("#inputNombre").value, $("#inputDisco").value));
  $("#editToggle").addEventListener("click", () => $("#editForm").classList.toggle("open"));
  document.querySelectorAll("#statusButtons .status-btn").forEach(btn => {
    btn.addEventListener("click", () => setActiveStatusButton(btn.dataset.status));
  });
  $("#btnSaveEdit").addEventListener("click", saveGame);
  $("#deleteGameBtn").addEventListener("click", deleteGame);

  $("#closeDiscModal").addEventListener("click", closeDiscModal);
  $("#discModalOverlay").addEventListener("click", (e) => { if (e.target.id === "discModalOverlay") closeDiscModal(); });
  $("#discBtnSave").addEventListener("click", saveDisco);
  $("#discBtnDelete").addEventListener("click", deleteDiscoConfirmed);

  $("#closeImportModal").addEventListener("click", closeImportModal);
  $("#importModalOverlay").addEventListener("click", (e) => { if (e.target.id === "importModalOverlay") closeImportModal(); });
  $("#copyImportPromptBtn").addEventListener("click", copyImportPrompt);
  $("#importGamesBtn").addEventListener("click", importGamesFromJson);
}

init();
