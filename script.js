// ====== PS2 GamePass - lógica principal (Supabase) ======
import { createClient } from "https://esm.sh/@supabase/supabase-js@2";

const LIBRETRO_BASE = "https://raw.githubusercontent.com/libretro-thumbnails/Sony_-_PlayStation_2/master";
const FOLDERS = { box: "Named_Boxarts", snap: "Named_Snaps", title: "Named_Titles" };
const STATUS_LABELS = { no_jugado: "No Jugado", en_curso: "En Curso", finalizado: "Finalizado" };

let sb = null;
let DISCOS = [];
let JUEGOS = [];
let CONFIG = { link_descarga_general: null };
let currentDisc = null;
let currentCategory = "Todas";
let currentStatus = "Todos";
let currentSort = "alpha";
let currentSearch = "";
let currentModalGameId = null;
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

// --- Normalización de nombre a la convención libretro (best-effort) ---
function libretroBase(name) {
  return name.replace(/:\s*/g, " - ").replace(/[*?"<>|]/g, "_").replace(/\//g, "_").trim();
}
function coverUrl(name, folder) {
  return `${LIBRETRO_BASE}/${folder}/${encodeURIComponent(name + ".png")}`;
}
const REGIONS = ["(USA)", "(Europe)", "(Europe, Australia)", "(Japan)", ""];
function nameVariants(name) {
  const base = libretroBase(name);
  const bases = new Set([base, base.replace(/ - .*/, "").trim(), base.replace(/\(.*?\)/, "").trim(), name.replace(/\(.*?\)/, "").trim()]);
  const variants = [];
  bases.forEach(b => { if (b) REGIONS.forEach(r => variants.push(r ? `${b} ${r}` : b)); });
  return Array.from(new Set(variants));
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
function hashColor(str) {
  let h = 0;
  for (let i = 0; i < str.length; i++) h = str.charCodeAt(i) + ((h << 5) - h);
  return `hsl(${Math.abs(h) % 360}, 55%, 30%)`;
}
function slugify(s) {
  return s.toLowerCase().normalize("NFD").replace(/[\u0300-\u036f]/g, "")
    .replace(/[^a-z0-9]+/g, "-").replace(/(^-|-$)/g, "");
}

function getParam(name) { return new URLSearchParams(window.location.search).get(name); }
function setDiscInUrl(discId) {
  const url = new URL(window.location);
  url.searchParams.set("disco", discId);
  window.history.replaceState({}, "", url);
}

// ---------- Render ----------
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
  const addBtn = document.createElement("button");
  addBtn.className = "disc-tab admin-only add-disc-tab";
  addBtn.textContent = "+ Disco";
  addBtn.onclick = addDisco;
  tabs.appendChild(addBtn);
}

function renderBanner() {
  const d = DISCOS.find(x => x.id == currentDisc);
  if (!d) { $("#discBanner").innerHTML = ""; return; }
  const count = JUEGOS.filter(g => g.disco == currentDisc).length;
  $("#discBanner").style.background = `linear-gradient(135deg, ${d.color}, #00000055)`;
  $("#discBanner").innerHTML = `
    <h1>${d.nombre} · ${d.subtitulo || ""}</h1>
    <p>Insertá este disco en la PS2 y navegá su catálogo sin adivinar qué contiene.</p>
    <div class="count">${count}</div>
  `;
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

function renderCategoryChips() {
  const cats = ["Todas", ...new Set(JUEGOS.filter(g => g.disco == currentDisc).map(g => g.categoria))]
    .sort((a,b)=> a==="Todas"?-1:a.localeCompare(b));
  const box = $("#categoryChips");
  box.innerHTML = "";
  cats.forEach(c => {
    const chip = document.createElement("div");
    chip.className = "chip" + (c === currentCategory ? " active" : "");
    chip.textContent = c;
    chip.onclick = () => { currentCategory = c; renderCategoryChips(); renderGrid(); };
    box.appendChild(chip);
  });
  const dl = $("#categoriaDatalist");
  if (dl) dl.innerHTML = [...new Set(JUEGOS.map(g => g.categoria))].map(c => `<option value="${c}">`).join("");
}

function renderStatusChips() {
  const box = $("#statusChips");
  box.innerHTML = "";
  [["Todos", null], ["No Jugado", "no_jugado"], ["En Curso", "en_curso"], ["Finalizado", "finalizado"]].forEach(([label, key]) => {
    const chip = document.createElement("div");
    chip.className = "chip status-chip" + (currentStatus === label ? " active" : "");
    if (key) chip.dataset.status = key;
    chip.textContent = label;
    chip.onclick = () => { currentStatus = label; renderStatusChips(); renderGrid(); };
    box.appendChild(chip);
  });
}

function getFiltered() {
  let list = JUEGOS.filter(g => g.disco == currentDisc);
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
    fallback.className = "cover-fallback"; fallback.textContent = g.nombre; fallback.style.display = "none";
    coverWrap.appendChild(fallback);

    if (g.caratula) {
      img.src = g.caratula;
      img.onerror = () => { img.style.display = "none"; fallback.style.display = "flex"; };
    } else {
      setImageWithFallback(img, g.nombre, FOLDERS.box, () => { img.style.display = "none"; fallback.style.display = "flex"; });
    }

    const body = document.createElement("div");
    body.className = "gcard-body";
    body.innerHTML = `
      <div class="gcard-title">${g.nombre}</div>
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
  if (g.caratula) {
    coverImg.src = g.caratula;
    coverImg.onerror = () => { coverImg.src = ""; coverImg.alt = "Sin carátula disponible"; };
  } else {
    setImageWithFallback(coverImg, g.nombre, FOLDERS.box, () => { coverImg.src = ""; coverImg.alt = "Sin carátula disponible"; });
  }

  const s1 = $("#shot1"), s2 = $("#shot2");
  setImageWithFallback(s1, g.nombre, FOLDERS.snap, () => { s1.style.display = "none"; });
  setImageWithFallback(s2, g.nombre, FOLDERS.title, () => { s2.style.display = "none"; });
  s1.style.display = ""; s2.style.display = "";

  $("#deleteGameBtn").style.display = "inline-block";
  $("#modalTitleLabel").textContent = "Editar juego";

  if (!opts.keepForm) {
    $("#editForm").classList.remove("open");
    fillForm(g);
  }
  $("#modalOverlay").classList.add("open");
}

function fillForm(g) {
  $("#inputNombre").value = g.nombre || "";
  $("#inputDisco").innerHTML = DISCOS.map(d => `<option value="${d.id}" ${d.id==g.disco?"selected":""}>${d.nombre}</option>`).join("");
  $("#inputCategoria").value = g.categoria || "";
  $("#inputGenero").value = g.genero_original || "";
  $("#inputDificultad").value = g.dificultad || 3;
  $("#inputJugadores").value = g.jugadores || "1";
  $("#inputCaratula").value = g.caratula || "";
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
  fillForm({ disco: currentDisc, dificultad: 3, jugadores: "1", estado: "no_jugado" });
  $("#editForm").classList.add("open");
  $("#modalOverlay").classList.add("open");
}

function setActiveStatusButton(status) {
  document.querySelectorAll("#statusButtons .status-btn").forEach(btn => {
    btn.classList.toggle("active", btn.dataset.status === status);
  });
}
function closeModal() { $("#modalOverlay").classList.remove("open"); currentModalGameId = null; isCreatingNew = false; }

function selectDisc(id) {
  currentDisc = id;
  currentCategory = "Todas"; currentStatus = "Todos";
  setDiscInUrl(id);
  renderDiscTabs(); renderBanner(); renderCategoryChips(); renderStatusChips(); renderGrid();
  window.scrollTo({top:0, behavior:"smooth"});
}

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

async function addDisco() {
  if (!isEditor) return;
  const id = window.prompt("ID corto del disco (ej: 4, o C2):");
  if (!id) return;
  if (DISCOS.some(d => String(d.id) === id)) { alert("Ya existe un disco con ese ID."); return; }
  const nombre = window.prompt("Nombre del disco:", `Disco ${id}`) || `Disco ${id}`;
  const subtitulo = window.prompt("Subtítulo (ej: Deportes y Carreras):", "") || "";
  const color = window.prompt("Color (código hex, ej: #7c5cff):", "#7c5cff") || "#7c5cff";
  const { error } = await sb.from("discos").insert({ id, nombre, subtitulo, color });
  if (error) { alert("No se pudo crear el disco. ¿Iniciaste sesión con la clave?"); console.error(error); return; }
  await reload();
  selectDisc(id);
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

// ---------- Init ----------
async function init() {
  await initSupabase();
  applyEditorUI();
  await loadData();

  const urlDisc = getParam("disco");
  currentDisc = urlDisc || (DISCOS[0] && DISCOS[0].id);
  if (!DISCOS.some(d => d.id == currentDisc)) currentDisc = DISCOS[0] && DISCOS[0].id;

  renderDiscTabs(); renderBanner(); renderGeneralDownload(); renderCategoryChips(); renderStatusChips(); renderGrid();

  $("#searchInput").addEventListener("input", (e) => { currentSearch = e.target.value; renderGrid(); });
  $("#sortSelect").addEventListener("change", (e) => { currentSort = e.target.value; renderGrid(); });
  $("#closeModal").addEventListener("click", closeModal);
  $("#modalOverlay").addEventListener("click", (e) => { if (e.target.id === "modalOverlay") closeModal(); });
  document.addEventListener("keydown", (e) => { if (e.key === "Escape") closeModal(); });

  $("#unlockBtn").addEventListener("click", unlockEditor);
  $("#addGameBtn").addEventListener("click", openNewGameModal);
  $("#editToggle").addEventListener("click", () => $("#editForm").classList.toggle("open"));
  document.querySelectorAll("#statusButtons .status-btn").forEach(btn => {
    btn.addEventListener("click", () => setActiveStatusButton(btn.dataset.status));
  });
  $("#btnSaveEdit").addEventListener("click", saveGame);
  $("#deleteGameBtn").addEventListener("click", deleteGame);
}

init();
