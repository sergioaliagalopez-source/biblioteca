// Orquesta la app: estantería 3D, categorías, importación de PDF y el lector.
import { db, local, uid, prefs } from './db.js';
import { clamp } from './textures.js';
import { folderSupported, pickFolder, hasPermission, FolderStore } from './cloud.js';
import { Library3D } from './library3d.js';
import { Reader, HL_COLORS } from './reader.js';
import { openPdf, renderCoverFromPdf, guessTitleFromText, pageAspects, loadPdfjs, detectTwoUp, remapBook, frameOf, remapFrame, pageAspectOf } from './pdfdoc.js';
import { identify, fetchCover, suggestCategory, coverPalette, fallbackPalette } from './identify.js';
import { sound } from './sound.js';
import { THEMES, COLLECTIONS, AMBIENTS, themeById, isUnlocked, priceLabel } from './themes.js';
import { devMode, isOwned, paymentsReady, checkoutUrl, redeem, checkDevLink, bundleFor, ORDERS_URL, ownedRecords, mergeOwned } from './store.js';
import { stats, duration, dayKey } from './stats.js';
import { buildBackup, readBackup, saveFile } from './backup.js';
import { define, raeUrl } from './dictionary.js';
import { quoteCard } from './quotecard.js';
import { listVoices, voiceFor, setVoice, voiceLabel, speechRate, setSpeechRate, sample, onVoices, hasGoodVoice } from './voices.js';

const $ = (s, r = document) => r.querySelector(s);
const pagesLabel = (n) => `${n} ${n === 1 ? 'página' : 'páginas'}`;
const safeColor = (c) => (/^#[0-9a-f]{3,8}$/i.test(c || '') ? c : '#3b2a1e');
const esc = (s) => String(s ?? '').replace(/[&<>"']/g, (c) => ({ '&': '&amp;', '<': '&lt;', '>': '&gt;', '"': '&quot;', "'": '&#39;' })[c]);
const wait = (ms) => new Promise((r) => setTimeout(r, ms));
const DEFAULT_CATEGORIES = ['Novela', 'Clásicos', 'Historia', 'Filosofía', 'Negocios', 'Desarrollo personal', 'Ciencia'];

// Íconos de línea, en blanco y negro (toman el color del texto).
const ICON = {
  speaker: '<svg viewBox="0 0 24 24"><path d="M4 9.5h3.5L12 5.5v13l-4.5-4H4z"/><path d="M15.5 9a4.5 4.5 0 0 1 0 6M18 6.5a8 8 0 0 1 0 11"/></svg>',
  muted: '<svg viewBox="0 0 24 24"><path d="M4 9.5h3.5L12 5.5v13l-4.5-4H4z"/><path d="M16 9.5l5 5M21 9.5l-5 5"/></svg>',
  shelf: '<svg viewBox="0 0 24 24"><path d="M4 3.5v17M20 3.5v17M4 9.5h16M4 15.5h16M3 20.5h18"/><path d="M7 9.5V5.5M9.5 9.5V6M12.5 15.5v-4M15 15.5l1.6-4"/></svg>',
  close: '<svg viewBox="0 0 24 24"><path d="M6 6l12 12M18 6L6 18"/></svg>',
  check: '<svg viewBox="0 0 24 24"><path d="M5 12.5l4.5 4.5L19 7.5"/></svg>',
  lock: '<svg viewBox="0 0 24 24"><rect x="5" y="10.5" width="14" height="10" rx="1.5"/><path d="M8 10.5V7.5a4 4 0 0 1 8 0v3"/></svg>',
  pencil: '<svg viewBox="0 0 24 24"><path d="M15 4.5l4.5 4.5L9 19.5H4.5V15z"/><path d="M12.5 7l4.5 4.5"/></svg>',
  share: '<svg viewBox="0 0 24 24"><path d="M12 15V3.5M7.5 8L12 3.5 16.5 8"/><path d="M5 12.5v7h14v-7"/></svg>',
};

const state = {
  books: [],
  categories: [],
  active: prefs.get('bib.cat') || 'all',
  reading: null,
  coverUrls: new Map(),
  theme: themeById(prefs.get('bib.theme')).id,
  ambientMode: AMBIENTS[prefs.get('bib.ambientMode')] ? prefs.get('bib.ambientMode') : 'theme',
};
let lib;
let reader;

// ---------- Arranque ----------

// Safari no respeta «sin zoom» de la página: se bloquea el pellizco (sus gestos propios y los toques con dos dedos).
for (const t of ['gesturestart', 'gesturechange', 'gestureend']) document.addEventListener(t, (e) => e.preventDefault(), { passive: false });
document.addEventListener('touchmove', (e) => e.touches.length > 1 && e.preventDefault(), { passive: false });

// Safari dibuja el libro 3D del lector por encima de las ventanas: ahí se oculta mientras hay una abierta.
const ua = navigator.userAgent;
const ios = /iP(hone|ad|od)/.test(ua) || (/Macintosh/.test(ua) && navigator.maxTouchPoints > 1);
if (ios || (/AppleWebKit/.test(ua) && !/Chrome|Chromium|Edg/.test(ua))) document.documentElement.classList.add('webkit');

async function boot() {
  await Promise.all([
    document.fonts.load('600 40px "Cormorant Garamond"'),
    document.fonts.load('italic 500 30px "Cormorant Garamond"'),
    document.fonts.load('400 16px "EB Garamond"'),
  ]).catch(() => {});
  navigator.storage?.persist?.().catch(() => {});
  const devMsg = await checkDevLink();
  // Si el fondo guardado ya no está disponible (p. ej. se apagó el modo desarrollador), se vuelve al clásico.
  if (!isUnlocked(themeById(state.theme))) state.theme = 'clasica';

  await restoreFolder();
  await loadLibrary();

  reader = new Reader({
    onClose: closeReader,
    onSave: (book) => db.put('books', book),
    onEdit: (book) => editBook(book.id),
    onAmbient: () => toggleSoundPanel($('#rSound')),
    onHighlights: showHighlights,
    onToc: showToc,
    onNote: editNote,
    onFinish: finishBook,
    onFocus: showFocusStart,
    onFocusEnd: showFocusSummary,
    onShare: shareQuote,
    onDefine: showDefinition,
  });
  reader.toast = toast;

  try {
    lib = new Library3D($('#scene'), {
      theme: state.theme,
      onThunder: () => sound.thunder(),
      onRace: (times) => sound.race(times),
      onSprinkler: (seconds) => sound.sprinkler(seconds),
      onShow: (seconds) => sound.museumShow(seconds),
      onHover: showTooltip,
      onOpen: openBook,
      onContext: bookMenu,
      onReady: () => setTimeout(() => $('#loader').classList.add('done'), 300),
      onBay: renderBayDots,
    });
  } catch (err) {
    err.reason = 'webgl';
    throw err;
  }
  refreshShelf();
  bindUI();
  // Con ?debug en la dirección, deja la escena a mano desde la consola (para probar).
  if (new URLSearchParams(location.search).has('debug')) window.biblioteca = { lib, state, reader, sound };
  updateThemeButton();
  updateSoundIcons();
  updateCloud();
  updateDevBadge();
  updateGoal();
  if (devMsg) setTimeout(() => toast(devMsg, 4500), 1200);
  window.addEventListener('hashchange', async () => {
    const m = await checkDevLink();
    if (!m) return;
    toast(m, 4500);
    updateDevBadge();
    if (!isUnlocked(themeById(state.theme))) chooseTheme('clasica');
  });
  registerServiceWorker();
  window.addEventListener('bib-save-failed', () => toast('No pude guardar el último cambio. Si sigue pasando, cierra y vuelve a abrir la app.', 6000));
  // PDF.js se prepara en un rato libre, para que abrir el primer libro no espere.
  const idle = window.requestIdleCallback || ((fn) => setTimeout(fn, 2500));
  idle(() => loadPdfjs().catch(() => {}), { timeout: 6000 });
  // La app instalada desde la PC (localhost) sin el servidor abierto muestra la última copia guardada.
  if (['localhost', '127.0.0.1'].includes(location.hostname)) {
    fetch('sw.js', { cache: 'no-store' }).catch(() =>
      setTimeout(() => toast('Estás viendo la copia guardada: el servidor de la PC está cerrado. Abre «Abrir Biblioteca.bat» para ver la última versión, o instala la app desde su dirección publicada.', 10000), 1500)
    );
  }
  if (!db.persistent && !db.folder) {
    const warn = () => toast('Este navegador no deja guardar datos aquí: tus libros sólo durarán hasta cerrar la pestaña. Abre la app con «Abrir Biblioteca.bat».', 9000);
    setTimeout(warn, 1500);
  }
}

async function loadLibrary() {
  state.categories = await db.all('categories');
  const seeded = db.folder ? db.folder.data.seeded : prefs.get('bib.seeded') && db.persistent;
  if (!state.categories.length && !seeded) {
    for (const [i, name] of DEFAULT_CATEGORIES.entries()) {
      const c = { id: uid() + i, name, order: i };
      await db.put('categories', c);
      state.categories.push(c);
    }
    if (db.folder) db.folder.data.seeded = true;
    else prefs.set('bib.seeded', '1');
  }
  state.books = await db.all('books');
  if (state.active !== 'all' && state.active !== 'done' && !state.categories.some((c) => c.id === state.active)) state.active = 'all';
}

async function reloadLibrary() {
  await loadLibrary();
  refreshShelf();
}

// ---------- Guardado en la nube (carpeta de OneDrive) ----------

const cloud = { status: 'off', savedHandle: null };

async function attachFolder(handle, { merge = false } = {}) {
  const store = new FolderStore(handle, {
    onSaving: () => updateCloud('saving'),
    onSaved: () => {
      updateCloud('saved');
      // se sumaron cambios hechos en otra PC: la estantería se actualiza (al cerrar el libro, si hay uno abierto)
      if (store.remoteMerged && !state.reading) {
        store.remoteMerged = false;
        reloadLibrary();
      }
    },
    onError: (err) => {
      console.error(err);
      updateCloud('error');
      toast('No pude guardar en la carpeta de OneDrive. Revisa que siga existiendo.', 6000);
    },
  });
  await store.load();
  if (merge) await store.mergeFrom(db.folder || local);
  db.useFolder(store);
  prefs.set('bib.localDirty', '0');
  cloud.savedHandle = handle;
  await local.put('settings', { id: 'folder', handle }).catch(() => {});
  updateCloud('saved');
}

// Al arrancar: si esta PC ya usa una carpeta, la vuelve a abrir (Chrome puede pedir un clic de permiso).
async function restoreFolder() {
  if (!folderSupported) return;
  const saved = await local.get('settings', 'folder').catch(() => null);
  if (!saved?.handle) return;
  cloud.savedHandle = saved.handle;
  try {
    if (!(await hasPermission(saved.handle)) && !(await askOnLoader(saved.handle))) {
      updateCloud('paused');
      return;
    }
    await attachFolder(saved.handle, { merge: prefs.get('bib.localDirty') === '1' });
  } catch (err) {
    console.error(err);
    updateCloud('paused');
    setTimeout(() => toast('No encontré la carpeta de tu biblioteca. Usa el botón de la nube para elegirla de nuevo.', 7000), 1500);
  }
}

function askOnLoader(handle) {
  const loader = $('#loader');
  const p = $('#loader p');
  const actions = $('#loaderActions');
  loader.classList.add('asking');
  p.textContent = `Tu biblioteca está guardada en la carpeta «${handle.name}».`;
  actions.hidden = false;
  return new Promise((resolve) => {
    const done = async (ok) => {
      const granted = ok && (await hasPermission(handle, true).catch(() => false));
      actions.hidden = true;
      loader.classList.remove('asking');
      p.textContent = 'Encendiendo las lámparas…';
      resolve(granted);
    };
    $('#reconnectBtn').onclick = () => done(true);
    $('#skipReconnect').onclick = () => done(false);
  });
}

async function connectFolder() {
  const ok = await confirmBox(
    'Guarda tu biblioteca en OneDrive',
    'Elige o crea una carpeta dentro de tu OneDrive, por ejemplo «OneDrive › Biblioteca». Ahí guardaré tus libros, categorías y cintas, y OneDrive los subirá a la nube. En tus otras PC abre la app y elige la misma carpeta: estará todo como lo dejaste.',
    'Elegir carpeta'
  );
  if (!ok) return;
  let handle;
  try {
    handle = await pickFolder();
  } catch {
    return; // canceló el selector
  }
  if (!(await hasPermission(handle, true).catch(() => false))) return toast('Sin permiso para guardar en esa carpeta.');
  const work = working(`Guardando tu biblioteca en «${esc(handle.name)}»…`, 'Copio tus libros a la carpeta; puede tardar un poco.');
  try {
    await attachFolder(handle, { merge: true });
    await reloadLibrary();
    work.close();
    toast(`Listo: tu biblioteca se guarda en «${handle.name}»`, 4000);
  } catch (err) {
    console.error(err);
    work.close();
    toast('No pude usar esa carpeta. Prueba con otra.', 5000);
  }
}

async function reconnectFolder() {
  const h = cloud.savedHandle;
  if (!h || !(await hasPermission(h, true).catch(() => false))) return connectFolder();
  try {
    await attachFolder(h, { merge: true });
    await reloadLibrary();
    toast(`Conectado a «${h.name}»`);
  } catch (err) {
    console.error(err);
    connectFolder();
  }
}

async function disconnectFolder() {
  const ok = await confirmBox(
    `¿Dejar de usar «${db.folder.name}»?`,
    'Esta PC volverá a la biblioteca guardada sólo en el navegador, que puede no tener lo último. Tus archivos en OneDrive no se borran.',
    'Dejar de usar'
  );
  if (!ok) return;
  await db.folder.flush();
  db.useFolder(null);
  cloud.savedHandle = null;
  await local.del('settings', 'folder').catch(() => {});
  updateCloud('off');
  await reloadLibrary();
}

function updateCloud(status) {
  if (status) cloud.status = status;
  const btn = $('#cloudBtn');
  if (!btn) return;
  btn.hidden = !folderSupported;
  const name = db.folder?.name || cloud.savedHandle?.name || '';
  const labels = {
    off: ['Guardar en la nube', 'Guarda tu biblioteca en una carpeta de OneDrive'],
    paused: ['Reconectar', `Volver a abrir la biblioteca de «${name}»`],
    saving: ['Guardando…', `Guardando en «${name}»`],
    saved: [name, `Guardado en «${name}». OneDrive lo sube a la nube.`],
    error: ['Sin guardar', 'No se pudo guardar en la carpeta'],
  };
  const [label, title] = labels[cloud.status];
  btn.dataset.status = cloud.status;
  btn.title = title;
  btn.innerHTML = `<svg viewBox="0 0 24 24"><path d="M7 18h10a4 4 0 0 0 .6-7.95A6 6 0 0 0 6.1 9.5 4.3 4.3 0 0 0 7 18z"/></svg><span>${esc(label)}</span>`;
}

function cloudClick(e) {
  if (!db.folder) return cloud.savedHandle ? reconnectFolder() : connectFolder();
  const r = e.currentTarget.getBoundingClientRect();
  showMenu(r.left, r.bottom + 6, [
    { header: `Carpeta: ${db.folder.name}` },
    { label: 'Cambiar de carpeta…', action: connectFolder },
    { label: 'Dejar de usar esta carpeta', danger: true, action: disconnectFolder },
  ]);
}

// Si la carpeta cambió desde otra PC (OneDrive la sincronizó), recarga la estantería.
let checking = false;
async function checkRemote() {
  if (!db.folder || state.reading || checking || document.querySelector('.modal-backdrop')) return;
  checking = true;
  try {
    if (await db.folder.changedElsewhere()) {
      await db.folder.load();
      await reloadLibrary();
      toast('Biblioteca actualizada con lo último de tu otra PC');
    }
  } catch (err) {
    console.warn(err);
  } finally {
    checking = false;
  }
}

// ---------- Estantería y categorías ----------

function coverURL(book) {
  if (!book.coverBlob) return '';
  const cached = state.coverUrls.get(book.id);
  if (cached && cached.blob === book.coverBlob) return cached.url;
  if (cached) URL.revokeObjectURL(cached.url);
  const url = URL.createObjectURL(book.coverBlob);
  state.coverUrls.set(book.id, { blob: book.coverBlob, url });
  return url;
}

const sortedCategories = () => [...state.categories].sort((a, b) => (a.order ?? 0) - (b.order ?? 0));
const categoryName = (id) => state.categories.find((c) => c.id === id)?.name;

function refreshShelf() {
  const done = state.active === 'done';
  if (done && !state.books.some((b) => b.finishedAt)) state.active = 'all';
  const pick = { all: () => state.books, done: () => state.books.filter((b) => b.finishedAt) }[state.active] || (() => state.books.filter((b) => b.categoryId === state.active));
  const list = pick().sort((a, b) => (state.active === 'done' ? a.finishedAt - b.finishedAt : a.addedAt - b.addedAt));
  const label = state.active === 'all' ? 'Biblioteca' : state.active === 'done' ? 'Terminados' : categoryName(state.active) || 'Biblioteca';
  lib.setBooks(list.map((b) => ({ id: b.id, title: b.title, author: b.author, color: b.color, aspect: b.aspect, pageCount: b.pageCount, coverUrl: coverURL(b) })), label);
  $('#empty').classList.toggle('show', list.length === 0);
  $('#emptyText').textContent = state.books.length === 0 ? 'Tu biblioteca espera su primer libro.' : `Aún no hay libros en «${label}».`;
  renderTabs();
}

function renderTabs() {
  const counts = {};
  state.books.forEach((b) => (counts[b.categoryId] = (counts[b.categoryId] || 0) + 1));
  const finished = state.books.filter((b) => b.finishedAt).length;
  const tabs = [
    { id: 'all', name: 'Todos', n: state.books.length },
    ...(finished ? [{ id: 'done', name: 'Terminados', n: finished }] : []),
    ...sortedCategories().map((c) => ({ id: c.id, name: c.name, n: counts[c.id] || 0 })),
  ];
  $('#tabs').innerHTML =
    tabs.map((t) => `<button class="tab ${t.id === state.active ? 'active' : ''}" data-id="${esc(t.id)}">${esc(t.name)}<sup>${t.n || ''}</sup></button>`).join('') +
    `<button class="tab add" data-add title="Nueva categoría" aria-label="Nueva categoría"><svg viewBox="0 0 24 24"><path d="M12 5v14M5 12h14"/></svg></button>`;
}

function setActive(id) {
  state.active = id;
  prefs.set('bib.cat', id);
  refreshShelf();
}

async function createCategory() {
  const name = await promptText('Nueva categoría', '', 'Por ejemplo: Poesía, Arte, Viajes…');
  if (!name) return null;
  const existing = state.categories.find((c) => c.name.toLowerCase() === name.toLowerCase());
  if (existing) return existing;
  const c = { id: uid(), name, order: Math.max(0, ...state.categories.map((x) => x.order ?? 0)) + 1 };
  await db.put('categories', c);
  state.categories.push(c);
  renderTabs();
  return c;
}

async function renameCategory(id) {
  const c = state.categories.find((x) => x.id === id);
  const name = await promptText('Renombrar categoría', c.name);
  if (!name || name === c.name) return;
  c.name = name;
  await db.put('categories', c);
  refreshShelf();
}

async function deleteCategory(id) {
  const c = state.categories.find((x) => x.id === id);
  const n = state.books.filter((b) => b.categoryId === id).length;
  const ok = await confirmBox(`¿Eliminar «${c.name}»?`, n ? (n === 1 ? 'Su libro seguirá en tu biblioteca, sin categoría.' : `Sus ${n} libros seguirán en tu biblioteca, sin categoría.`) : 'La categoría está vacía.', 'Eliminar');
  if (!ok) return;
  for (const b of state.books.filter((x) => x.categoryId === id)) {
    b.categoryId = '';
    await db.put('books', b);
  }
  await db.del('categories', id);
  state.categories = state.categories.filter((x) => x.id !== id);
  if (state.active === id) state.active = 'all';
  refreshShelf();
}

// ---------- Tooltip y menú contextual ----------

function showTooltip(id, x, y) {
  const tip = $('#tooltip');
  const book = id && state.books.find((b) => b.id === id);
  if (!book) {
    tip.classList.remove('show');
    return;
  }
  const v = `${book.bookmark ?? ''}/${book.lastPage}/${book.finishedAt || ''}/${book.updatedAt || ''}`;
  if (tip.dataset.id !== id || tip.dataset.v !== v) {
    tip.dataset.id = id;
    tip.dataset.v = v;
    const url = coverURL(book);
    const pct = percentRead(book);
    const prog = book.finishedAt
      ? 'Terminado'
      : book.bookmark
        ? `<svg width="10" height="14" viewBox="0 0 10 14"><path d="M0 0h10v14l-5-4-5 4z" fill="#8a2232"/></svg> Cinta en la página ${book.bookmark} de ${book.pageCount} · ${pct} %`
        : (book.lastPage || 1) > 1 ? `Página ${book.lastPage} de ${book.pageCount} · ${pct} % leído` : `${pagesLabel(book.pageCount)} · sin empezar`;
    tip.innerHTML = `
      <div class="thumb" style="${url ? `background-image:url('${url}')` : `background-color:${safeColor(book.color)}`}"></div>
      <div>
        <h4>${esc(book.title)}</h4>
        <div class="by">${esc(book.author || 'Autor desconocido')}${book.year ? ` · ${esc(book.year)}` : ''}</div>
        <div class="prog">${prog}</div>
        <div class="bar"><i style="width:${pct}%"></i></div>
      </div>`;
  }
  const w = 280, h = tip.offsetHeight || 110;
  tip.style.left = `${Math.min(x + 18, innerWidth - w - 10)}px`;
  tip.style.top = `${Math.min(y + 18, innerHeight - h - 10)}px`;
  tip.classList.add('show');
}

function showMenu(x, y, items) {
  const m = $('#ctxmenu');
  m.innerHTML = items
    .map((it, i) => (it.sep ? '<hr>' : it.header ? `<div class="mh">${esc(it.header)}</div>` : `<button data-i="${i}" class="${it.danger ? 'danger' : ''} ${it.checked ? 'checked' : ''}">${esc(it.label)}</button>`))
    .join('');
  m.classList.add('show');
  m.style.left = `${Math.min(x, innerWidth - m.offsetWidth - 8)}px`;
  m.style.top = `${Math.min(y, innerHeight - m.offsetHeight - 8)}px`;
  m.onclick = (e) => {
    const b = e.target.closest('button');
    if (!b) return;
    hideMenu();
    items[+b.dataset.i].action();
  };
  $('#tooltip').classList.remove('show');
}

const hideMenu = () => $('#ctxmenu').classList.remove('show');

// En el teléfono se ve un tramo de la estantería a la vez: flechas y puntos para cambiar de tramo.
function renderBayDots(bay, n) {
  const nav = $('#bayDots');
  if (bay == null) {
    nav.innerHTML = '';
    return;
  }
  nav.innerHTML =
    `<button data-bay="${bay - 1}" ${bay === 0 ? 'disabled' : ''} aria-label="Tramo anterior">‹</button>` +
    Array.from({ length: n }, (_, i) => `<button class="dot ${i === bay ? 'on' : ''}" data-bay="${i}" aria-label="Tramo ${i + 1}"></button>`).join('') +
    `<button data-bay="${bay + 1}" ${bay === n - 1 ? 'disabled' : ''} aria-label="Tramo siguiente">›</button>`;
  nav.onclick = (e) => {
    const b = e.target.closest('[data-bay]');
    if (b) lib.setBay(+b.dataset.bay);
  };
}

function bookMenu(id, x, y) {
  const b = state.books.find((k) => k.id === id);
  if (!b) return;
  showMenu(x, y, [
    { label: 'Abrir', action: () => openBook(id) },
    { label: 'Editar detalles…', action: () => editBook(id) },
    { label: b.finishedAt ? 'Marcar como no terminado' : 'Marcar como terminado', action: () => toggleFinished(id) },
    { sep: true },
    { header: 'Mover a' },
    { label: 'Sin categoría', checked: !b.categoryId, action: () => moveBook(id, '') },
    ...sortedCategories().map((c) => ({ label: c.name, checked: c.id === b.categoryId, action: () => moveBook(id, c.id) })),
    { label: 'Nueva categoría…', action: async () => { const c = await createCategory(); if (c) moveBook(id, c.id); } },
    { sep: true },
    { label: 'Eliminar de la biblioteca', danger: true, action: () => deleteBook(id) },
  ]);
}

async function toggleFinished(id) {
  const b = state.books.find((k) => k.id === id);
  if (b.finishedAt) delete b.finishedAt;
  else b.finishedAt = Date.now();
  await db.put('books', b);
  refreshShelf();
  toast(b.finishedAt ? `«${b.title}» está en tus terminados` : `«${b.title}» volvió a «leyendo»`);
}

async function moveBook(id, categoryId) {
  const b = state.books.find((k) => k.id === id);
  b.categoryId = categoryId;
  await db.put('books', b);
  refreshShelf();
  toast(categoryId ? `Movido a «${categoryName(categoryId)}»` : 'Ahora está sin categoría');
}

async function deleteBook(id, skipConfirm = false) {
  const b = state.books.find((k) => k.id === id);
  if (!b) return;
  if (!skipConfirm && !(await confirmBox(`¿Quitar «${b.title}»?`, 'Se borrará de esta biblioteca junto con su cinta. Tu archivo PDF original no se toca.', 'Quitar'))) return;
  await db.del('books', id);
  await db.del('files', id);
  state.books = state.books.filter((k) => k.id !== id);
  const cover = state.coverUrls.get(id);
  if (cover) URL.revokeObjectURL(cover.url);
  state.coverUrls.delete(id);
  refreshShelf();
  toast('Libro retirado de la estantería');
}

// ---------- Buscador ----------

const fold = (s) => (s || '').normalize('NFC').toLowerCase().normalize('NFD').replace(/[̀-ͯ]/g, '');
const search = { results: [], sel: 0 };

function openSearch() {
  if (state.reading || document.querySelector('.modal-backdrop')) return;
  hideMenu();
  $('#tooltip').classList.remove('show');
  $('#search').hidden = false;
  document.body.classList.add('searching');
  const input = $('#searchInput');
  input.value = '';
  renderSearch('');
  requestAnimationFrame(() => input.focus());
}

function closeSearch() {
  $('#search').hidden = true;
  document.body.classList.remove('searching');
}

// Busca en título, autor y categoría; el título que empieza con lo escrito va primero.
function findBooks(query) {
  const words = fold(query).split(/\s+/).filter(Boolean);
  if (!words.length) {
    return [...state.books].filter((b) => b.lastOpenedAt).sort((a, b) => b.lastOpenedAt - a.lastOpenedAt).slice(0, 6);
  }
  const scored = [];
  for (const b of state.books) {
    const title = fold(b.title), author = fold(b.author), cat = fold(categoryName(b.categoryId));
    const hay = `${title} ${author} ${cat}`;
    if (!words.every((w) => hay.includes(w))) continue;
    const q = words.join(' ');
    const score = (title.startsWith(q) ? 4 : 0) + (title.includes(q) ? 2 : 0) + (author.includes(q) ? 1 : 0) + words.filter((w) => title.includes(w)).length * 0.5;
    scored.push({ b, score });
  }
  return scored.sort((x, y) => y.score - x.score || x.b.title.localeCompare(y.b.title)).slice(0, 8).map((x) => x.b);
}

// Resalta en el texto las palabras buscadas.
function highlight(text, query) {
  const t = (text || '').normalize('NFC');
  const f = fold(t);
  const marks = new Array(t.length).fill(false);
  for (const w of fold(query).split(/\s+/).filter(Boolean)) {
    let i = f.indexOf(w);
    while (i >= 0) {
      for (let k = i; k < i + w.length; k++) marks[k] = true;
      i = f.indexOf(w, i + w.length);
    }
  }
  let out = '', open = false;
  for (let i = 0; i < t.length; i++) {
    if (marks[i] !== open) {
      out += marks[i] ? '<mark>' : '</mark>';
      open = marks[i];
    }
    out += esc(t[i]);
  }
  return out + (open ? '</mark>' : '');
}

function renderSearch(query) {
  search.results = findBooks(query);
  search.sel = 0;
  const box = $('#searchResults');
  if (!state.books.length) {
    box.innerHTML = `<p class="search-empty">Todavía no hay libros en tu biblioteca.</p>`;
    return;
  }
  if (!search.results.length) {
    box.innerHTML = query.trim()
      ? `<p class="search-empty">Ningún libro coincide con «${esc(query.trim())}».</p>`
      : `<p class="search-empty">Escribe el título, el autor o la categoría.</p>`;
    return;
  }
  const head = query.trim() ? '' : '<div class="search-head">Leídos recientemente</div>';
  box.innerHTML =
    head +
    search.results
      .map((b, i) => {
        const url = coverURL(b);
        const cat = categoryName(b.categoryId);
        const where = b.finishedAt ? 'Terminado' : b.bookmark ? `Cinta en la pág. ${b.bookmark} · ${percentRead(b)} %` : (b.lastPage || 1) > 1 ? `Pág. ${b.lastPage} · ${percentRead(b)} %` : pagesLabel(b.pageCount);
        return `<button class="search-item ${i === 0 ? 'sel' : ''}" data-i="${i}">
          <span class="thumb" style="${url ? `background-image:url('${url}')` : `background-color:${safeColor(b.color)}`}"></span>
          <span class="info">
            <span class="t">${highlight(b.title, query)}</span>
            <span class="a">${highlight(b.author || 'Autor desconocido', query)}${cat ? ` · ${highlight(cat, query)}` : ''}</span>
          </span>
          <span class="where">${where}</span>
        </button>`;
      })
      .join('');
}

function moveSelection(d) {
  if (!search.results.length) return;
  search.sel = (search.sel + d + search.results.length) % search.results.length;
  document.querySelectorAll('.search-item').forEach((el, i) => el.classList.toggle('sel', i === search.sel));
  document.querySelector('.search-item.sel')?.scrollIntoView({ block: 'nearest' });
}

// Abre un resultado: si el libro no está en la estantería que se ve, cambia a la suya primero.
function openFromSearch(i) {
  const b = search.results[i];
  if (!b) return;
  closeSearch();
  if (state.active !== 'all' && b.categoryId !== state.active) setActive(b.categoryId || 'all');
  requestAnimationFrame(() => openBook(b.id));
}

function bindSearch() {
  const input = $('#searchInput');
  $('#searchBtn').addEventListener('click', openSearch);
  input.addEventListener('input', () => renderSearch(input.value));
  input.addEventListener('keydown', (e) => {
    if (e.key === 'ArrowDown') moveSelection(1);
    else if (e.key === 'ArrowUp') moveSelection(-1);
    else if (e.key === 'Enter') openFromSearch(search.sel);
    else if (e.key === 'Escape') closeSearch();
    else return;
    e.preventDefault();
  });
  $('#searchResults').addEventListener('click', (e) => {
    const item = e.target.closest('.search-item');
    if (item) openFromSearch(+item.dataset.i);
  });
  $('#search').addEventListener('pointerdown', (e) => {
    if (e.target.id === 'search') closeSearch();
  });
  // Ctrl+K o la tecla «/» abren el buscador.
  document.addEventListener('keydown', (e) => {
    if (e.key === 'Escape' && !$('#search').hidden) return closeSearch();
    const typing = /INPUT|SELECT|TEXTAREA/.test(document.activeElement?.tagName || '');
    if (((e.ctrlKey || e.metaKey) && e.key.toLowerCase() === 'k') || (e.key === '/' && !typing)) {
      e.preventDefault();
      if ($('#search').hidden) openSearch();
      else closeSearch();
    }
  });
}

// ---------- Resaltados del libro abierto ----------

function showHighlights(book) {
  const list = () => [...(book.highlights || [])].sort((a, b) => a.page - b.page || a.createdAt - b.createdAt);
  const item = (h) => `
    <div class="hl-item" role="button" tabindex="0" data-id="${esc(h.id)}" data-page="${+h.page}" title="Ir a la página ${+h.page}">
      <span class="sw" style="background:${(HL_COLORS[h.color] || HL_COLORS.yellow).dot}"></span>
      <span class="body"><span class="pg">Página ${h.page}</span><q>${esc(h.text.length > 280 ? h.text.slice(0, 280) + '…' : h.text)}</q>${h.note ? `<span class="note">${esc(h.note)}</span>` : ''}</span>
      <button class="x note-btn" data-note="${esc(h.id)}" title="${h.note ? 'Editar la nota' : 'Escribir una nota'}">${ICON.pencil}</button>
      <button class="x note-btn" data-share="${esc(h.id)}" title="Crear una tarjeta con esta cita">${ICON.share}</button>
      <button class="x" data-del="${esc(h.id)}" title="Quitar este resaltado">×</button>
    </div>`;
  const body = () =>
    list().length
      ? `<div class="hl-list">${list().map(item).join('')}</div>`
      : '<p class="sub">Aún no resaltaste nada en este libro. Activa «Resaltar» y selecciona un texto.</p>';
  modal(
    `<div class="ornament">❦</div><h2>Mis resaltados</h2>
     <p class="sub">${esc(book.title)}</p>
     <div class="hl-wrap">${body()}</div>
     <div class="actions"><button class="btn-ghost" data-act="export" ${list().length ? '' : 'hidden'}>Exportar a texto</button><span class="grow"></span><button class="btn-dark" data-act="ok">Cerrar</button></div>`,
    {
      wide: true,
      onMount(card, close) {
        const rerender = () => {
          card.querySelector('.hl-wrap').innerHTML = body();
          card.querySelector('[data-act=export]').hidden = !list().length;
        };
        card.addEventListener('click', async (e) => {
          const del = e.target.closest('[data-del]');
          if (del) {
            reader.removeHighlight(del.dataset.del);
            rerender();
            return;
          }
          const share = e.target.closest('[data-share]');
          if (share) return shareQuote((book.highlights || []).find((h) => h.id === share.dataset.share));
          const note = e.target.closest('[data-note]');
          if (note) {
            if (await editNote((book.highlights || []).find((h) => h.id === note.dataset.note))) rerender();
            return;
          }
          const act = e.target.closest('[data-act]')?.dataset.act;
          if (act === 'export') return exportHighlights(book);
          if (act === 'ok') return close(null);
          const it = e.target.closest('.hl-item');
          if (it) {
            close(null);
            reader.goToPage(+it.dataset.page);
          }
        });
        card.addEventListener('keydown', (e) => {
          const it = e.target.closest?.('.hl-item');
          if (!it || e.target !== it || (e.key !== 'Enter' && e.key !== ' ')) return;
          e.preventDefault();
          close(null);
          reader.goToPage(+it.dataset.page);
        });
      },
    }
  );
}

// ---------- Índice, notas y libros terminados ----------

// Porcentaje leído según la última página abierta (un libro terminado es 100 %).
const percentRead = (b) => (b.finishedAt ? 100 : Math.round((((b.lastPage || 1) - 1) / Math.max(1, (b.pageCount || 1) - 1)) * 100));

async function showToc() {
  const book = state.reading;
  if (!book || !reader.isOpen) return;
  const items = await reader.outline();
  const { page, N } = reader.position();
  let cur = -1;
  items.forEach((it, i) => {
    if (it.page <= page) cur = i;
  });
  const pct = (p) => Math.round(((p - 1) / Math.max(1, N - 1)) * 100);
  modal(
    `<div class="ornament">❦</div><h2>Índice</h2><p class="sub">${esc(book.title)}</p>
     <div class="toc-go">
       <div class="toc-where">Página <b data-p>${page}</b> de ${N} · <span data-pct>${pct(page)}</span> % del libro</div>
       <input type="range" class="gold-range" min="1" max="${N}" value="${page}" aria-label="Elegir una página">
       <button class="btn-ghost" data-act="go">Ir a esta página</button>
     </div>
     ${
       items.length
         ? `<div class="toc-list">${items.map((it, i) => `<button class="toc-item ${i === cur ? 'on' : ''}" data-page="${it.page}" style="--d:${it.depth}"><span>${esc(it.title)}</span><em>${it.page}</em></button>`).join('')}</div>`
         : '<p class="sub">Este PDF no trae índice de capítulos: usa la barra para ir a cualquier página.</p>'
     }
     <div class="actions"><span class="grow"></span><button class="btn-dark" data-act="ok">Cerrar</button></div>`,
    {
      wide: true,
      onMount(card, close) {
        const r = card.querySelector('.gold-range');
        const paint = () => {
          r.style.setProperty('--p', `${((r.value - 1) / Math.max(1, N - 1)) * 100}%`);
          card.querySelector('[data-p]').textContent = r.value;
          card.querySelector('[data-pct]').textContent = pct(+r.value);
        };
        paint();
        r.addEventListener('input', paint);
        card.addEventListener('click', (e) => {
          const it = e.target.closest('.toc-item');
          const act = e.target.closest('[data-act]')?.dataset.act;
          if (it) {
            close(null);
            reader.goToPage(+it.dataset.page);
          } else if (act === 'go') {
            close(null);
            reader.goToPage(+r.value);
          } else if (act === 'ok') close(null);
        });
        card.querySelector('.toc-item.on')?.scrollIntoView({ block: 'center' });
      },
    }
  );
}

// Nota sobre un resaltado. Devuelve true si cambió.
async function editNote(h) {
  if (!h) return false;
  const quote = h.text.length > 220 ? h.text.slice(0, 220) + '…' : h.text;
  const res = await modal(
    `<div class="ornament">❦</div><h2>Nota</h2>
     <blockquote class="note-quote">${esc(quote)}</blockquote>
     <textarea class="note-input" rows="5" placeholder="Lo que te hizo pensar este pasaje…">${esc(h.note || '')}</textarea>
     <div class="actions">${h.note ? '<button class="btn-text danger" data-act="clear">Borrar nota</button>' : ''}<span class="grow"></span>
       <button class="btn-ghost" data-act="cancel">Cancelar</button><button class="btn-dark" data-act="ok">Guardar</button></div>`,
    {
      onMount(card, close) {
        const ta = card.querySelector('textarea');
        setTimeout(() => ta.focus(), 60);
        card.querySelector('[data-act=ok]').onclick = () => close({ note: ta.value.trim() });
        card.querySelector('[data-act=cancel]').onclick = () => close(null);
        card.querySelector('[data-act=clear]')?.addEventListener('click', () => close({ note: '' }));
      },
    }
  );
  if (!res || res.note === (h.note || '')) return false;
  if (res.note) h.note = res.note;
  else delete h.note;
  reader.highlightsChanged();
  toast(res.note ? 'Nota guardada' : 'Nota borrada');
  return true;
}

// Todos los resaltados y notas del libro en un archivo de texto.
function exportHighlights(book) {
  const list = [...(book.highlights || [])].sort((a, b) => a.page - b.page || a.createdAt - b.createdAt);
  const lines = [`${book.title}${book.author ? ` — ${book.author}` : ''}`, `Resaltados y notas · ${new Date().toLocaleDateString('es')}`, ''];
  for (const h of list) {
    lines.push(`Página ${h.page}`, `«${h.text}»`);
    if (h.note) lines.push(`Nota: ${h.note}`);
    lines.push('');
  }
  const name = `${book.title.replace(/[\\/:*?"<>|]+/g, '').slice(0, 60).trim() || 'Libro'} - resaltados.txt`;
  saveFile(new Blob([lines.join('\n')], { type: 'text/plain;charset=utf-8' }), name, `Resaltados de ${book.title}`);
}

function finishBook(book) {
  if (book.finishedAt) return;
  book.finishedAt = Date.now();
  db.put('books', book);
  const n = state.books.filter((b) => b.finishedAt).length;
  toast(`¡Terminaste «${book.title}»! ${n === 1 ? 'Es tu primer libro terminado.' : `Ya llevas ${n} libros terminados.`}`, 5000);
  renderTabs();
}

// ---------- Estadísticas de lectura ----------

// Cuenta el tiempo sólo con un libro abierto, la app a la vista y alguna señal de vida en los últimos 5 minutos.
let lastTick = Date.now();
function trackReading() {
  const now = Date.now();
  const sec = Math.min(30, (now - lastTick) / 1000);
  lastTick = now;
  if (!state.reading || !reader.isOpen || document.hidden || now - reader.lastActivity > 5 * 60e3) return;
  const before = stats.summary([]).today;
  stats.addSeconds(sec);
  state.reading.readSeconds = Math.round((state.reading.readSeconds || 0) + sec);
  if (reader.focus) reader.focus.seconds += sec;
  const goal = goalMinutes() * 60;
  if (before < goal && before + sec >= goal) {
    sound.ping();
    toast(`¡Cumpliste tu meta de hoy: ${goalMinutes()} minutos de lectura!`, 5000);
  }
  updateGoal();
}

// Meta diaria de lectura (minutos), con un anillo arriba que se va llenando.
const goalMinutes = () => +prefs.get('bib.goal') || 20;

function updateGoal() {
  const btn = $('#goalBtn');
  if (!btn) return;
  const today = stats.summary([]).today;
  const k = Math.min(1, today / (goalMinutes() * 60));
  const len = 2 * Math.PI * 14;
  const fill = btn.querySelector('.fill');
  fill.style.strokeDasharray = `${len}`;
  fill.style.strokeDashoffset = `${len * (1 - k)}`;
  btn.classList.toggle('done', k >= 1);
  btn.querySelector('span').textContent = Math.round(today / 60);
  btn.title = `Meta de hoy: ${Math.round(today / 60)} de ${goalMinutes()} minutos`;
}

// ---------- Modo enfoque ----------

const FOCUS_TIMES = ['5', '10', '15', '30', '60'];

function showFocusStart() {
  if (reader.focus) return;
  const custom = prefs.get('bib.focusCustom') || '45';
  let min = prefs.get('bib.focusMin') || '30';
  let isCustom = !FOCUS_TIMES.includes(min);
  modal(
    `<div class="ornament">❦</div><h2>Modo enfoque</h2>
     <p class="sub">Sólo el libro: pasar hojas, la cinta, resaltar y escuchar. Para salir, mantén apretado el candado dos segundos.</p>
     <div class="focus-times">
       ${FOCUS_TIMES.map((v) => `<button class="chip ${!isCustom && v === min ? 'on' : ''}" data-min="${v}">${v} min</button>`).join('')}
       <button class="chip ${isCustom ? 'on' : ''}" data-custom title="Elegir otro tiempo" aria-label="Elegir otro tiempo"><svg viewBox="0 0 24 24"><path d="M12 5v14M5 12h14"/></svg></button>
     </div>
     <div class="focus-custom" ${isCustom ? '' : 'hidden'}>
       <button class="chip" data-step="-5" aria-label="Cinco minutos menos">−</button>
       <label><input type="number" min="1" max="600" inputmode="numeric" value="${isCustom ? min : custom}" aria-label="Minutos"><span>minutos</span></label>
       <button class="chip" data-step="5" aria-label="Cinco minutos más">+</button>
     </div>
     <p class="focus-tip">Para que el teléfono no te interrumpa, activa también el modo <b>Concentración</b> (en el iPhone: Centro de control › Concentración).</p>
     <div class="actions"><span class="grow"></span><button class="btn-ghost" data-act="cancel">Cancelar</button><button class="btn-dark" data-act="start">Empezar</button></div>`,
    {
      onMount(card, close) {
        const box = card.querySelector('.focus-custom');
        const input = box.querySelector('input');
        const value = () => String(clamp(Math.round(+input.value || 0), 1, 600));
        const select = (el) => card.querySelectorAll('.focus-times .chip').forEach((c) => c.classList.toggle('on', c === el));
        card.addEventListener('click', (e) => {
          const chip = e.target.closest('[data-min]');
          if (chip) {
            min = chip.dataset.min;
            isCustom = false;
            box.hidden = true;
            return select(chip);
          }
          if (e.target.closest('[data-custom]')) {
            isCustom = true;
            box.hidden = false;
            select(e.target.closest('[data-custom]'));
            return input.focus();
          }
          const step = e.target.closest('[data-step]');
          if (step) {
            input.value = clamp((+input.value || 0) + +step.dataset.step, 1, 600);
            return;
          }
          const act = e.target.closest('[data-act]')?.dataset.act;
          if (act === 'cancel') close(null);
          else if (act === 'start') {
            if (isCustom) {
              min = value();
              prefs.set('bib.focusCustom', min);
            }
            prefs.set('bib.focusMin', min);
            close(null);
            reader.startFocus(+min);
            toast(`Enfoque por ${min} minutos. ¡Buena lectura!`, 3000);
          }
        });
        input.addEventListener('keydown', (e) => e.key === 'Enter' && card.querySelector('[data-act=start]').click());
      },
    }
  );
}

function showFocusSummary({ reason, seconds, pages, minutes }) {
  const today = stats.summary([]).today;
  const goal = goalMinutes();
  const read = Math.max(minutes, Math.round(seconds / 60));
  modal(
    `<div class="ornament">❦</div><h2>${reason === 'time' ? '¡Sesión cumplida!' : 'Sesión terminada'}</h2>
     <p class="sub">Leíste ${read ? `${read} minuto${read === 1 ? '' : 's'}` : 'un ratito'} y ${pages} página${pages === 1 ? '' : 's'} sin distracciones.</p>
     <div class="focus-goal ${today >= goal * 60 ? 'done' : ''}">Hoy llevas ${Math.round(today / 60)} de ${goal} minutos de tu meta${today >= goal * 60 ? ' ✓' : ''}</div>
     <div class="actions"><span class="grow"></span><button class="btn-dark" data-act="ok">Seguir leyendo</button></div>`,
    {
      onMount(card, close) {
        card.querySelector('[data-act=ok]').onclick = () => close(null);
      },
    }
  );
}

// ---------- Tarjetas de citas ----------

async function shareQuote(h) {
  const book = state.reading;
  if (!h || !book) return;
  reader.hidePop();
  const blob = await quoteCard({ text: h.text, title: book.title, author: book.author, page: h.page, color: book.color, coverUrl: coverURL(book) });
  const url = URL.createObjectURL(blob);
  const name = `Cita - ${book.title.replace(/[\\/:*?"<>|]+/g, '').slice(0, 50).trim()}.png`;
  await modal(
    `<div class="ornament">❦</div><h2>Tu cita</h2>
     <img class="quote-img" src="${url}" alt="Tarjeta con la cita">
     <div class="actions"><span class="grow"></span><button class="btn-ghost" data-act="cancel">Cerrar</button><button class="btn-dark" data-act="save">Compartir</button></div>`,
    {
      onMount(card, close) {
        card.querySelector('[data-act=cancel]').onclick = () => close(null);
        card.querySelector('[data-act=save]').onclick = () => saveFile(blob, name, `Una cita de ${book.title}`).then((ok) => ok && close(null));
      },
    }
  );
  URL.revokeObjectURL(url);
}

// ---------- Diccionario ----------

async function showDefinition(word) {
  const body = (r) => {
    if (!r) return `<p class="sub">No encontré «${esc(word)}» en el diccionario.</p>`;
    let kind = '';
    const items = r.defs
      .map((d) => {
        const head = d.kind !== kind ? `<div class="dict-kind">${esc((kind = d.kind))}</div>` : '';
        return `${head}<li>${d.area ? `<em>${esc(d.area)}.</em> ` : ''}${esc(d.text)}</li>`;
      })
      .join('');
    return `${r.from ? `<p class="dict-from">«${esc(r.from)}» es una forma de «${esc(r.word)}»</p>` : ''}<ol class="dict-list">${items}</ol>`;
  };
  modal(
    `<div class="ornament">❦</div><h2>${esc(word)}</h2>
     <div class="dict-body"><p class="sub">Buscando en el diccionario…</p></div>
     <p class="dict-src">Fuente: Wikcionario · <a href="${raeUrl(word)}" target="_blank" rel="noopener">Ver en el diccionario de la RAE</a></p>
     <div class="actions"><span class="grow"></span><button class="btn-dark" data-act="ok">Cerrar</button></div>`,
    {
      onMount(card, close) {
        card.querySelector('[data-act=ok]').onclick = () => close(null);
        define(word)
          .catch(() => null)
          .then((r) => {
            card.querySelector('.dict-body').innerHTML = navigator.onLine === false ? '<p class="sub">Sin conexión: el diccionario necesita internet.</p>' : body(r);
            if (r?.lang === 'en') card.querySelector('.dict-src').firstChild.textContent = 'Fuente: Wiktionary (inglés) · ';
          });
      },
    }
  );
}

function showStats() {
  const s = stats.summary(state.books);
  const max = Math.max(600, ...s.last.map((x) => x.sec));
  const initials = ['D', 'L', 'M', 'M', 'J', 'V', 'S'];
  const bars = s.last
    .map((x) => `<div class="st-bar ${x.sec >= 60 ? 'on' : ''}" title="${x.day.toLocaleDateString('es', { weekday: 'long', day: 'numeric', month: 'long' })}: ${duration(x.sec)}"><i style="height:${Math.max(x.sec ? 4 : 0, Math.round((x.sec / max) * 100))}%"></i><span>${initials[x.day.getDay()]}</span></div>`)
    .join('');
  const reading = state.books
    .filter((b) => !b.finishedAt && (b.lastPage || 1) > 1)
    .sort((a, b) => (b.lastOpenedAt || 0) - (a.lastOpenedAt || 0))
    .slice(0, 3);
  const days = (n) => `${n} ${n === 1 ? 'día' : 'días'}`;
  const goal = goalMinutes();
  const k = Math.min(1, s.today / (goal * 60));
  const len = 2 * Math.PI * 40;
  modal(
    `<div class="ornament">❦</div><h2>Tu lectura</h2>
     <div class="goal-big ${k >= 1 ? 'done' : ''}">
       <svg viewBox="0 0 100 100"><circle cx="50" cy="50" r="40"/><circle class="fill" cx="50" cy="50" r="40" style="stroke-dasharray:${len};stroke-dashoffset:${len * (1 - k)}"/></svg>
       <div><b>${Math.round(s.today / 60)} / ${goal} min</b><span>${k >= 1 ? '¡Meta de hoy cumplida!' : 'Meta de hoy'}</span></div>
     </div>
     <div class="goal-pick"><span>Mi meta diaria:</span>${[10, 20, 30, 45, 60].map((m) => `<button class="chip ${m === goal ? 'on' : ''}" data-goal="${m}">${m} min</button>`).join('')}</div>
     <p class="sub">${s.streak ? `Llevas ${days(s.streak)} seguidos leyendo. ¡Sigue así!` : 'Lee un rato hoy para empezar una racha de días seguidos.'}</p>
     <div class="st-grid">
       <div><b>${duration(s.today)}</b><span>Hoy</span></div>
       <div><b>${days(s.streak)}</b><span>Racha · la mejor: ${days(s.best)}</span></div>
       <div><b>${duration(s.week)}</b><span>Últimos 7 días</span></div>
       <div><b>${s.finished}</b><span>${s.finished === 1 ? 'Libro terminado' : 'Libros terminados'}</span></div>
     </div>
     <div class="st-label">Últimas dos semanas</div>
     <div class="st-bars">${bars}</div>
     ${
       reading.length
         ? `<div class="st-label">Leyendo ahora</div><div class="st-books">${reading
             .map((b) => `<div class="st-book"><span class="t">${esc(b.title)}</span><span class="bar"><i style="width:${percentRead(b)}%"></i></span><span class="n">${percentRead(b)} %${b.readSeconds ? ` · ${duration(b.readSeconds)}` : ''}</span></div>`)
             .join('')}</div>`
         : ''
     }
     <p class="st-total">En total: ${duration(s.total)} de lectura</p>
     <div class="actions"><span class="grow"></span><button class="btn-dark" data-act="ok">Cerrar</button></div>`,
    {
      wide: true,
      onMount(card, close) {
        card.querySelector('[data-act=ok]').onclick = () => close(null);
        card.querySelector('.goal-pick').addEventListener('click', (e) => {
          const chip = e.target.closest('[data-goal]');
          if (!chip) return;
          prefs.set('bib.goal', chip.dataset.goal);
          updateGoal();
          close(null);
          showStats();
        });
      },
    }
  );
}

// ---------- Copia de seguridad ----------

async function showData() {
  // Pedirlo de nuevo con un toque del usuario ayuda a que el navegador lo conceda.
  const persisted = (await navigator.storage?.persist?.().catch(() => false)) || (await navigator.storage?.persisted?.().catch(() => false));
  const est = await navigator.storage?.estimate?.().catch(() => null);
  const used = est?.usage ? `${Math.max(1, Math.round(est.usage / 1048576))} MB usados` : '';
  const last = +prefs.get('bib.lastBackup') || 0;
  const n = state.books.length;
  const safe = !!(db.folder || persisted);
  const status = db.folder
    ? `Tu biblioteca se guarda en la carpeta «${db.folder.name}» de OneDrive.`
    : persisted
      ? 'Almacenamiento protegido: el sistema no borrará tus libros para hacer espacio.'
      : 'Este navegador no garantiza guardar tus libros para siempre: haz una copia de vez en cuando.';
  modal(
    `<div class="ornament">❦</div><h2>Copia de seguridad</h2>
     <p class="sub">Guarda en un solo archivo ${n === 0 ? 'tus libros' : n === 1 ? 'tu libro' : `tus ${n} libros`} con sus cintas, resaltados y notas, tus compras y tus estadísticas. Ábrelo en otro dispositivo para tener todo igual.</p>
     <div class="data-status ${safe ? 'ok' : 'warn'}">${safe ? ICON.check : ICON.lock}<span>${esc(status)}${used ? ` <em>${used}</em>` : ''}</span></div>
     <p class="data-last">${last ? `Última copia: ${new Date(last).toLocaleDateString('es', { day: 'numeric', month: 'long', year: 'numeric' })}` : 'Todavía no hiciste ninguna copia.'}</p>
     <div class="actions"><button class="btn-ghost" data-act="import">Restaurar desde un archivo…</button><span class="grow"></span>
       <button class="btn-dark" data-act="export" ${n ? '' : 'disabled'}>Crear copia</button></div>`,
    {
      wide: true,
      onMount(card, close) {
        card.addEventListener('click', (e) => {
          const act = e.target.closest('[data-act]')?.dataset.act;
          if (act === 'export') {
            close(null);
            exportBackup();
          } else if (act === 'import') {
            close(null);
            $('#backupInput').click();
          }
        });
      },
    }
  );
}

async function exportBackup() {
  const work = working('Preparando la copia de seguridad…');
  let blob;
  try {
    blob = await buildBackup({
      books: state.books,
      categories: state.categories,
      extra: { owned: ownedRecords(), stats: stats.raw() },
      onProgress: (i, n) => work.set('Preparando la copia de seguridad…', `Libro ${i + 1} de ${n}`),
    });
  } catch (err) {
    console.error(err);
    work.close();
    return toast('No pude preparar la copia.', 5000);
  }
  work.close();
  const name = `Biblioteca ${dayKey()}.biblioteca`;
  const size = blob.size >= 1048576 ? `${Math.round(blob.size / 1048576)} MB` : `${Math.max(1, Math.round(blob.size / 1024))} KB`;
  // Guardar necesita un toque propio (el teléfono no deja compartir después de una espera larga).
  const saved = await modal(
    `<div class="ornament">❦</div><h2>Copia lista</h2>
     <p class="sub">«${esc(name)}» · ${size}. Guárdala en Archivos, iCloud Drive, OneDrive o donde prefieras.</p>
     <div class="actions"><span class="grow"></span><button class="btn-ghost" data-act="cancel">Cancelar</button><button class="btn-dark" data-act="save">Guardar copia</button></div>`,
    {
      onMount(card, close) {
        card.querySelector('[data-act=cancel]').onclick = () => close(false);
        card.querySelector('[data-act=save]').onclick = () => saveFile(blob, name, 'Copia de Biblioteca').then((ok) => ok && close(true));
      },
    }
  );
  if (!saved) return;
  prefs.set('bib.lastBackup', String(Date.now()));
  toast('Copia de seguridad guardada', 3500);
}

async function importBackup(file) {
  let data;
  try {
    data = await readBackup(file);
  } catch (err) {
    return toast(err.message || 'No pude leer ese archivo.', 5000);
  }
  const n = data.books.length;
  const when = new Date(data.createdAt).toLocaleDateString('es', { day: 'numeric', month: 'long', year: 'numeric' });
  const ok = await confirmBox(
    '¿Restaurar esta copia?',
    `Es del ${when} y tiene ${n} libro${n === 1 ? '' : 's'}. Se suma a tu biblioteca sin borrar nada; si un libro está en los dos lados, queda la versión más reciente.`,
    'Restaurar'
  );
  if (!ok) return;
  const work = working('Restaurando tu biblioteca…');
  try {
    // Las categorías se reconocen por su nombre (cada dispositivo crea las suyas).
    const map = {};
    for (const c of data.categories || []) {
      const same = state.categories.find((x) => x.id === c.id) || state.categories.find((x) => x.name.toLowerCase() === String(c.name).toLowerCase());
      if (same) {
        map[c.id] = same.id;
        continue;
      }
      const nc = { id: c.id, name: c.name, order: Math.max(0, ...state.categories.map((x) => x.order ?? 0)) + 1 };
      await db.put('categories', nc);
      state.categories.push(nc);
      map[c.id] = nc.id;
    }
    let added = 0, updated = 0;
    for (const [i, { book, pdf }] of data.books.entries()) {
      work.set('Restaurando tu biblioteca…', `Libro ${i + 1} de ${n}`);
      book.categoryId = book.categoryId ? (map[book.categoryId] ?? '') : '';
      const cur = state.books.find((b) => b.id === book.id);
      if (cur) {
        if (pdf && !(await db.get('files', book.id))) await db.put('files', { id: book.id, blob: pdf });
        if ((book.updatedAt || 0) > (cur.updatedAt || 0)) {
          Object.assign(cur, book, { coverBlob: book.coverBlob || cur.coverBlob });
          await db.put('books', cur);
          updated++;
        }
      } else if (pdf) {
        await db.put('files', { id: book.id, blob: pdf });
        state.books.push(book);
        await db.put('books', book);
        added++;
      }
    }
    const bought = mergeOwned(data.owned);
    stats.merge(data.stats);
    work.close();
    refreshShelf();
    navigator.storage?.persist?.().catch(() => {});
    const parts = [
      added && `${added} libro${added === 1 ? '' : 's'} nuevo${added === 1 ? '' : 's'}`,
      updated && `${updated} actualizado${updated === 1 ? '' : 's'}`,
      bought && `${bought} fondo${bought === 1 ? '' : 's'} comprado${bought === 1 ? '' : 's'}`,
    ].filter(Boolean);
    toast(parts.length ? `Copia restaurada: ${parts.join(', ')}` : 'Copia restaurada: ya tenías todo lo que trae', 5000);
  } catch (err) {
    console.error(err);
    work.close();
    toast('No pude terminar de restaurar la copia.', 5000);
  }
}

function moreMenu(e) {
  const r = e.currentTarget.getBoundingClientRect();
  showMenu(r.right - 230, r.bottom + 6, [
    { label: 'Estadísticas de lectura', action: showStats },
    { label: 'Copia de seguridad…', action: showData },
    { label: 'Restaurar compras…', action: showRestore },
  ]);
}

// ---------- Leer ----------

async function openBook(id) {
  if (state.reading) return;
  const book = state.books.find((b) => b.id === id);
  if (!book) return;
  state.reading = book;
  $('#tooltip').classList.remove('show');
  hideMenu();
  startAmbientIfNeeded();
  const filePromise = db.get('files', id);
  document.body.classList.add('flying');
  await lib.flyOut(id, reader.closedFraction(book));
  const file = await filePromise;
  if (!file) {
    toast('No encuentro el archivo PDF de este libro.');
    await lib.returnBook();
    state.reading = null;
    return;
  }
  document.body.classList.add('reading');
  book.lastOpenedAt = Date.now();
  lastTick = Date.now();
  db.put('books', book);
  try {
    const opening = reader.open(book, file.blob, coverURL(book));
    setTimeout(() => {
      lib.hideFlying();
      lib.setPaused(true);
    }, 700);
    await opening;
  } catch (err) {
    console.error(err);
    toast('No pude abrir este PDF.');
    reader.el.classList.remove('open', 'visible');
    closeReader();
  }
}

function closeReader() {
  if (trialPending) setTimeout(() => endTrial(trialPending), 1800);
  if (pendingReload) setTimeout(() => location.reload(), 1800);
  if (db.folder?.remoteMerged) {
    db.folder.remoteMerged = false;
    setTimeout(reloadLibrary, 1500);
  }
  document.body.classList.remove('reading');
  lib.returnBook().then(() => {
    state.reading = null;
    document.body.classList.remove('flying');
  });
}

// ---------- Añadir libros ----------

async function importFiles(fileList) {
  const files = [...fileList].filter((f) => f.type === 'application/pdf' || /\.pdf$/i.test(f.name));
  if (!files.length) return toast('Solo puedo leer archivos PDF.');
  for (const file of files) {
    const work = working(`Abriendo «${esc(file.name)}»…`);
    try {
      const pdf = await openPdf(file);
      // Si cada hoja trae dos páginas (libro abierto), se cuentan y se muestran como páginas separadas.
      const split = await detectTwoUp(pdf).catch(() => false);
      const pageCount = pdf.numPages * (split ? 2 : 1);
      const aspects = await pageAspects(pdf);
      const coverAspect = aspects.coverAspect;
      // encuadre de libro: márgenes parejos y espejados, como en un libro impreso
      const frame = await frameOf(pdf, split).catch(() => null);
      const v1 = (await pdf.getPage(1)).getViewport({ scale: 1 });
      const sheet = { w: v1.width, h: v1.height };
      const pageAspect = pageAspectOf({ frame, split, sheet });
      const meta = (await pdf.getMetadata().catch(() => null))?.info || {};
      const pdfCover = await renderCoverFromPdf(pdf).catch(() => null);
      const textGuess = await guessTitleFromText(pdf).catch(() => '');
      await pdf.destroy();

      work.set('Buscando tu libro en los catálogos…', 'Google Books · Open Library');
      const info = await identify({ meta, fileName: file.name, textGuess, pageCount });
      const online = info.covers.length ? await fetchCover(info.covers) : null;
      work.close();

      const draft = {
        id: uid(), title: info.title, author: info.author, year: info.year, description: info.description,
        categoryId: suggestCategory(info.subjects, state.categories),
        pageCount, aspect: coverAspect, pageAspect, fileName: file.name, split, frame, sheet,
        addedAt: Date.now(), bookmark: null, lastPage: 1,
      };
      // Si la primera página del PDF parece una portada, es la edición exacta: la preferimos.
      const pick = pdfCover?.likelyCover ? 'pdf' : online ? 'online' : pdfCover ? 'pdf' : null;
      const result = await bookDialog(draft, { mode: 'new', found: info.found, covers: { pdf: pdfCover?.blob || null, online: online?.blob || null }, pick });
      if (!result) continue;
      if (result.split !== split || result.noFrame) {
        // cambió cómo leer las hojas al importar: el encuadre se vuelve a medir al abrir el libro
        remapBook(result, split, result.split);
        result.frame = undefined;
        result.pageAspect = pageAspectOf(result);
      }
      await db.put('files', { id: result.id, blob: file });
      await saveBook(result);
      if (state.active !== 'all' && result.categoryId !== state.active) state.active = result.categoryId || 'all';
      refreshShelf();
      toast(`«${result.title}» ya está en tu estantería`);
    } catch (err) {
      console.error(err);
      work.close();
      toast(`No pude abrir «${file.name}»`);
    }
  }
}

async function saveBook(book) {
  const existing = state.books.find((b) => b.id === book.id);
  // Se modifica el mismo objeto para que el lector (si está abierto) vea los cambios.
  if (existing) Object.assign(existing, book);
  else state.books.push(book);
  await db.put('books', existing || book);
  return existing || book;
}

async function editBook(id) {
  const book = state.books.find((b) => b.id === id);
  if (!book) return;
  const result = await bookDialog({ ...book }, { mode: 'edit', found: true, covers: { current: book.coverBlob || null }, pick: book.coverBlob ? 'current' : null });
  if (!result) return;
  if (result.deleted) {
    if (state.reading?.id === id) await reader.close();
    return deleteBook(id, true);
  }
  // Cambió cómo se leen las hojas (una o dos páginas por hoja): se pasa todo a la nueva numeración.
  if (result.split !== book.split || !!result.noFrame !== !!book.noFrame) {
    // los resaltados vuelven a la hoja original, se pasa a la nueva división y el encuadre se mide de nuevo
    remapFrame(result, book.noFrame ? null : book.frame, null);
    if (result.split !== book.split) remapBook(result, book.split || false, result.split);
    result.frame = undefined;
    result.pageAspect = pageAspectOf(result);
  }
  await saveBook(result);
  refreshShelf();
  if (state.reading?.id === id) reader.refreshBook(coverURL(book));
  toast('Cambios guardados');
}

// Ficha para confirmar o editar los datos del libro.
function bookDialog(draft, { mode, found, covers, pick }) {
  const title = mode === 'new' ? (found ? 'Encontramos tu libro' : 'Un libro nuevo para tu estantería') : 'Detalles del libro';
  const sub =
    mode === 'new'
      ? found
        ? 'Revisa que los datos sean correctos antes de colocarlo en la estantería.'
        : 'No lo encontramos en los catálogos. Puedes completar los datos tú mismo o buscar de nuevo.'
      : 'Edita sus datos, su portada o su categoría.';
  const html = `
    <div class="ornament">❦</div>
    <h2>${title}</h2>
    <p class="sub">${sub}</p>
    <div class="book-form">
      <div class="cover-col">
        <div class="cover-preview"><img alt=""><div class="none"></div></div>
        <div class="cover-choices">
          <button class="chip" data-c="pdf" title="Usar la primera página del PDF">Del PDF</button>
          <button class="chip" data-c="online" title="Portada encontrada en los catálogos">Catálogo</button>
          <button class="chip" data-c="custom" title="Subir una imagen">Subir imagen…</button>
        </div>
        <input type="file" accept="image/*" hidden data-file>
      </div>
      <div class="fields">
        <label><span>Título</span><input name="title" type="text" value="${esc(draft.title)}"></label>
        <label><span>Autor</span><input name="author" type="text" value="${esc(draft.author)}"></label>
        <div class="row2">
          <label><span>Año</span><input name="year" type="text" inputmode="numeric" value="${esc(draft.year)}"></label>
          <label><span>Categoría</span><select name="cat"></select></label>
        </div>
        <label><span>Hojas del PDF</span><select name="split" ${state.reading?.id === draft.id ? 'disabled title="Cierra el libro para cambiar esto"' : ''}>
          <option value="0" ${draft.split ? '' : 'selected'}>Una página por hoja</option>
          <option value="1" ${draft.split ? 'selected' : ''}>Dos páginas por hoja (libro abierto)</option>
        </select></label>
        <label><span>Encuadre de las páginas</span><select name="frame" ${state.reading?.id === draft.id ? 'disabled title="Cierra el libro para cambiar esto"' : ''}>
          <option value="1" ${draft.noFrame ? '' : 'selected'}>Márgenes de libro (automático)</option>
          <option value="0" ${draft.noFrame ? 'selected' : ''}>Original del PDF</option>
        </select></label>
        <button class="link-btn" data-act="search">Buscar de nuevo con estos datos</button>
        <p class="desc"></p>
      </div>
    </div>
    <div class="actions">
      ${mode === 'edit' ? '<button class="btn-text danger" data-act="delete">Quitar de la biblioteca</button>' : ''}
      <span class="grow"></span>
      <button class="btn-ghost" data-act="cancel">Cancelar</button>
      <button class="btn-dark" data-act="save">${mode === 'new' ? 'Colocar en la estantería' : 'Guardar'}</button>
    </div>`;

  return modal(html, {
    wide: true,
    onMount(card, close) {
      const f = (n) => card.querySelector(`[name=${n}]`);
      const img = card.querySelector('.cover-preview img');
      const none = card.querySelector('.cover-preview .none');
      const desc = card.querySelector('.desc');
      let selected = pick;
      let previewUrl = null;
      const blobFor = (k) => covers[k] || null;

      const renderCover = () => {
        const blob = blobFor(selected);
        if (previewUrl) URL.revokeObjectURL(previewUrl);
        previewUrl = blob ? URL.createObjectURL(blob) : null;
        img.style.display = blob ? 'block' : 'none';
        if (blob) img.src = previewUrl;
        none.textContent = blob ? '' : f('title').value || 'Sin portada';
        card.querySelectorAll('.chip').forEach((c) => {
          c.classList.toggle('on', c.dataset.c === selected);
          if (c.dataset.c === 'online') c.disabled = !covers.online && mode === 'new' && !found;
        });
      };
      const renderCats = (sel) => {
        f('cat').innerHTML =
          `<option value="">Sin categoría</option>` +
          sortedCategories().map((c) => `<option value="${esc(c.id)}" ${c.id === sel ? 'selected' : ''}>${esc(c.name)}</option>`).join('') +
          `<option value="__new">+ Nueva categoría…</option>`;
      };
      renderCats(draft.categoryId);
      desc.textContent = (draft.description || '').replace(/<[^>]+>/g, '');
      renderCover();

      f('cat').addEventListener('change', async (e) => {
        if (e.target.value !== '__new') return;
        const c = await createCategory();
        renderCats(c ? c.id : draft.categoryId);
      });

      const searchOnline = async (btn) => {
        const t = f('title').value.trim();
        if (!t) return;
        const label = btn?.textContent;
        if (btn) btn.textContent = 'Buscando…';
        let info, online;
        try {
          info = await identify({ override: { title: t, author: f('author').value.trim() }, pageCount: draft.pageCount });
          online = info.found && info.covers.length ? await fetchCover(info.covers) : null;
        } catch {
          info = { found: false };
        } finally {
          if (btn) btn.textContent = label;
        }
        if (!info.found) {
          toast('No encontré coincidencias en los catálogos');
          return false;
        }
        f('title').value = info.title;
        f('author').value = info.author;
        if (info.year) f('year').value = info.year;
        if (info.description) desc.textContent = info.description.replace(/<[^>]+>/g, '');
        const sug = suggestCategory(info.subjects, state.categories);
        if (sug && !f('cat').value) renderCats(sug);
        if (online) {
          covers.online = online.blob;
          selected = 'online';
        } else toast('Lo encontré, pero sin portada disponible');
        renderCover();
        return true;
      };

      card.querySelector('[data-file]').addEventListener('change', (e) => {
        const file = e.target.files[0];
        if (!file) return;
        covers.custom = file;
        selected = 'custom';
        renderCover();
      });

      card.addEventListener('click', async (e) => {
        const chip = e.target.closest('.chip');
        if (chip) {
          const k = chip.dataset.c;
          if (k === 'custom') return card.querySelector('[data-file]').click();
          if (k === 'pdf' && !covers.pdf && mode === 'edit') {
            chip.textContent = 'Cargando…';
            try {
              const file = await db.get('files', draft.id);
              if (file) {
                const pdf = await openPdf(file.blob);
                covers.pdf = (await renderCoverFromPdf(pdf)).blob;
                pdf.destroy();
              }
            } catch {
              toast('No pude leer la portada del PDF');
            }
            chip.textContent = 'Del PDF';
          }
          if (k === 'online' && !covers.online) {
            await searchOnline(chip);
            return;
          }
          if (blobFor(k)) {
            selected = k;
            renderCover();
          }
          return;
        }
        const act = e.target.closest('[data-act]')?.dataset.act;
        if (act === 'search') searchOnline(e.target.closest('[data-act]'));
        else if (act === 'cancel') close(null);
        else if (act === 'delete') {
          if (await confirmBox(`¿Quitar «${draft.title}»?`, 'Se borrará de esta biblioteca junto con su cinta. Tu archivo PDF original no se toca.', 'Quitar')) close({ deleted: true });
        } else if (act === 'save') {
          const btn = e.target.closest('[data-act]');
          btn.disabled = true;
          const coverBlob = blobFor(selected);
          const out = {
            ...draft,
            title: f('title').value.trim() || 'Sin título',
            author: f('author').value.trim(),
            year: f('year').value.trim(),
            categoryId: f('cat').value === '__new' ? '' : f('cat').value,
            // sin tocar en un libro aún no revisado, queda sin decidir (el lector lo detecta al abrirlo)
            noFrame: f('frame').disabled ? draft.noFrame : f('frame').value === '0',
            split: f('split').disabled ? draft.split : f('split').value === '1' ? draft.split || 0.5 : draft.split === undefined ? undefined : false,
            description: desc.textContent,
            coverBlob,
          };
          const pal = coverBlob ? await coverPalette(coverBlob).catch(() => fallbackPalette(out.title)) : fallbackPalette(out.title);
          out.color = pal.color;
          out.ribbon = pal.ribbon;
          if (coverBlob) {
            const bmp = await createImageBitmap(coverBlob).catch(() => null);
            if (bmp) {
              out.aspect = bmp.width / bmp.height;
              bmp.close?.();
            }
          }
          if (previewUrl) URL.revokeObjectURL(previewUrl);
          close(out);
        }
      });
      f('title').addEventListener('input', () => !blobFor(selected) && renderCover());
    },
  });
}

// ---------- Ventanas, avisos y ambiente ----------

function modal(html, { onMount, wide } = {}) {
  return new Promise((resolve) => {
    const bd = document.createElement('div');
    bd.className = 'modal-backdrop';
    document.body.classList.add('modal-open');
    bd.innerHTML = `<div class="card ${wide ? 'wide' : ''}" role="dialog" aria-modal="true">${html}</div>`;
    $('#modal-root').appendChild(bd);
    requestAnimationFrame(() => bd.classList.add('in'));
    let done = false;
    const onKey = (e) => {
      if (e.key === 'Escape' && bd === $('#modal-root').lastElementChild) {
        e.stopPropagation();
        close(null);
      }
    };
    const close = (v) => {
      if (done) return;
      done = true;
      bd.classList.remove('in');
      setTimeout(() => {
        bd.remove();
        if (!$('#modal-root').children.length) document.body.classList.remove('modal-open');
      }, 250);
      document.removeEventListener('keydown', onKey, true);
      resolve(v);
    };
    document.addEventListener('keydown', onKey, true);
    bd.addEventListener('pointerdown', (e) => {
      if (e.target === bd) close(null);
    });
    onMount?.(bd.firstElementChild, close);
    if (!matchMedia('(pointer: coarse)').matches) bd.querySelector('input:not([type=file])')?.focus();
  });
}

function promptText(title, value = '', placeholder = '') {
  return modal(
    `<div class="ornament">❦</div><h2>${esc(title)}</h2>
     <label style="margin-top:18px"><input type="text" value="${esc(value)}" placeholder="${esc(placeholder)}"></label>
     <div class="actions"><span class="grow"></span><button class="btn-ghost" data-act="cancel">Cancelar</button><button class="btn-dark" data-act="ok">Aceptar</button></div>`,
    {
      onMount(card, close) {
        const input = card.querySelector('input');
        const ok = () => close(input.value.trim() || null);
        input.addEventListener('keydown', (e) => e.key === 'Enter' && ok());
        card.querySelector('[data-act=ok]').onclick = ok;
        card.querySelector('[data-act=cancel]').onclick = () => close(null);
        setTimeout(() => input.select(), 30);
      },
    }
  );
}

function confirmBox(title, text, okLabel = 'Aceptar') {
  return modal(
    `<div class="ornament">❦</div><h2>${esc(title)}</h2><p class="sub">${esc(text)}</p>
     <div class="actions"><span class="grow"></span><button class="btn-ghost" data-act="cancel">Cancelar</button><button class="btn-dark" data-act="ok">${esc(okLabel)}</button></div>`,
    {
      onMount(card, close) {
        card.querySelector('[data-act=ok]').onclick = () => close(true);
        card.querySelector('[data-act=cancel]').onclick = () => close(false);
      },
    }
  );
}

function working(text, small = '') {
  const render = (t, s) => `<div class="working"><div class="ornament">❦</div><p>${t}</p>${s ? `<small>${esc(s)}</small>` : ''}</div>`;
  const api = {
    card: null,
    closeFn: null,
    set(t, s) {
      if (api.card) api.card.innerHTML = render(esc(t), s);
    },
    close() {
      api.closeFn?.(null);
    },
  };
  modal(render(text, small), {
    onMount(card, close) {
      api.card = card;
      api.closeFn = close;
    },
  });
  return api;
}

function toast(text, ms = 2600) {
  const t = document.createElement('div');
  t.className = 'toast';
  t.textContent = text;
  $('#toasts').appendChild(t);
  setTimeout(() => {
    t.classList.add('out');
    setTimeout(() => t.remove(), 400);
  }, ms);
}

let pendingReload = false;

// Hace la app instalable y usable sin internet (sólo cuando se sirve por http/https).
function registerServiceWorker() {
  if (!('serviceWorker' in navigator) || !location.protocol.startsWith('http')) return;
  // Si se publicó una versión nueva mientras la app estaba abierta, se recarga una vez para usarla
  // entera (salvo que estés leyendo: se aplicará la próxima vez que la abras).
  const hadController = !!navigator.serviceWorker.controller;
  let reloading = false;
  navigator.serviceWorker.addEventListener('controllerchange', () => {
    if (!hadController || reloading) return;
    if (state.reading || document.querySelector('.modal-backdrop')) {
      pendingReload = true;
      return;
    }
    reloading = true;
    location.reload();
  });
  navigator.serviceWorker.register('sw.js', { updateViaCache: 'none' }).catch((err) => console.warn('Sin modo sin conexión:', err));
}

// ---------- Fondos ----------

function updateThemeButton() {
  document.body.dataset.theme = state.theme;
  $('#themeBtn').innerHTML = `${ICON.shelf}<span>${esc(themeById(state.theme).name)}</span>`;
}

let themeCol = 'incluidos';

// Panel de fondos: pestañas de colección (Incluidos, F1, Deportes) y las tarjetas de la elegida.
function renderThemeCards(animate = false) {
  const price = (t) => {
    if (t.price === 0) return '<span class="tc-price">Incluido</span>';
    if (isOwned(t.id)) return '<span class="tc-price">Comprado</span>';
    if (devMode()) return `<span class="tc-price">${priceLabel(t)} <em>Desarrollador</em></span>`;
    return `<span class="tc-price buy">${ICON.lock}${priceLabel(t)}</span>`;
  };
  const current = themeById(state.theme).collection;
  $('#themeCols').innerHTML = COLLECTIONS.map((c) => {
    const n = THEMES.filter((t) => t.collection === c.id).length;
    return `<button class="tcol ${c.id === themeCol ? 'on' : ''}" role="tab" aria-selected="${c.id === themeCol}" data-col="${c.id}">
      ${c.id === 'incluidos' ? ICON.shelf : ''}<span>${esc(c.name)}</span><sup>${n}</sup>${c.id === current ? '<i class="tcol-cur" title="Tu fondo actual está aquí"></i>' : ''}
    </button>`;
  }).join('');
  const col = COLLECTIONS.find((c) => c.id === themeCol);
  const list = THEMES.filter((t) => t.collection === themeCol);
  $('#themeColIntro').textContent = `${col.mood} · ${list.length} ${list.length === 1 ? 'fondo' : 'fondos'}`;
  const cards = list.map(
    (t) => `
    <button class="theme-card ${t.id === state.theme ? 'on' : ''} ${isUnlocked(t) ? '' : 'locked'}" data-id="${t.id}">
      <span class="tc-img" style="background-image:url('${t.preview}')"><span class="tc-check">${ICON.check}</span><span class="tc-lock">${ICON.lock}</span></span>
      <span class="tc-body">
        <span class="tc-name">${esc(t.name)}</span>
        <span class="tc-mood">${esc(t.mood)}</span>
        <span class="tc-meta"><span class="tc-sound">${ICON.speaker}${esc(AMBIENTS[t.sound])}</span>${price(t)}</span>
      </span>
    </button>`
  );
  // En las colecciones que van a crecer, una tarjeta avisa que vienen más.
  if (themeCol !== 'incluidos') {
    cards.push(`
    <div class="theme-card soon" aria-hidden="true">
      <span class="tc-img soon-img"><svg viewBox="0 0 24 24"><circle cx="12" cy="12" r="9"/><path d="M12 8v8M8 12h8"/></svg></span>
      <span class="tc-body">
        <span class="tc-name">Próximamente</span>
        <span class="tc-mood">Más fondos de ${esc(col.name)} en camino</span>
      </span>
    </div>`);
  }
  const box = $('#themeCards');
  box.innerHTML = cards.join('');
  box.scrollLeft = 0;
  if (animate) {
    box.classList.remove('swap');
    void box.offsetWidth;
    box.classList.add('swap');
  }
}

function openThemes() {
  if (state.reading || switchingTheme) return;
  closeSoundPanel();
  // Siempre abre en los fondos incluidos; las otras colecciones están en sus pestañas.
  themeCol = 'incluidos';
  renderThemeCards();
  $('#themes').hidden = false;
  requestAnimationFrame(() => $('#themes').classList.add('in'));
  $('#themeCards .on')?.scrollIntoView({ inline: 'center', block: 'nearest' });
}

function closeThemes() {
  const el = $('#themes');
  el.classList.remove('in');
  setTimeout(() => (el.hidden = true), 320);
}

// Cambio de fondo: la sala se oscurece, aparece el nombre del nuevo fondo, y la cámara entra
// al nuevo ambiente mientras el sonido cambia con un fundido.
let switchingTheme = false;
async function chooseTheme(id, { preview = false } = {}) {
  const t = themeById(id);
  closeThemes();
  if (id === state.theme && !preview) {
    // ya está puesto (por ejemplo, se compró durante la prueba): se guarda y la prueba termina
    endPreview();
    prefs.set('bib.theme', id);
    return;
  }
  if (id === state.theme || switchingTheme || state.reading) return;
  if (!isUnlocked(t) && !preview) return showPurchase(t);
  if (!preview) endPreview();
  switchingTheme = true;
  const curtain = $('#curtain');
  curtain.querySelector('h2').textContent = t.name;
  curtain.querySelector('p').textContent = t.mood;
  curtain.classList.add('show');
  await wait(800);
  lib.setTheme(id);
  state.theme = id;
  // Una prueba gratuita no queda guardada: al volver a abrir la app se usa el último fondo propio.
  if (!preview) prefs.set('bib.theme', id);
  lib.dollyIn();
  applyAmbient();
  updateThemeButton();
  await Promise.all([wait(700), Promise.race([lib.ready, wait(4000)])]);
  await wait(250); // un par de cuadros para que el fondo ya esté dibujado
  curtain.classList.remove('show');
  await wait(900);
  switchingTheme = false;
}

// ---------- Compra de fondos ----------

function updateDevBadge() {
  $('#devBadge').hidden = !devMode();
}


// Ficha de un fondo pago: comprar, ingresar el código recibido por email o probarlo 30 segundos.
function showPurchase(t) {
  const pack = bundleFor(t.id);
  modal(
    `<div class="purchase">
       <div class="pu-img" style="background-image:url('${t.preview}')"></div>
       <h2>${esc(t.name)}</h2>
       <p class="sub">${esc(t.mood)} · Sonido: ${esc(AMBIENTS[t.sound])}</p>
       <div class="pu-actions">
         <button class="btn-dark" data-act="buy">Comprar por ${priceLabel(t)}</button>
         ${pack ? `<button class="btn-dark pack" data-act="pack">${esc(pack.name)} por ${priceLabel(pack)}</button>` : ''}
         <button class="btn-ghost" data-act="try">Probar 30 segundos</button>
       </div>
       <div class="pu-code">
         <label><span>¿Ya lo compraste? Pega el código que te llegó por email</span>
         <input type="text" placeholder="XXXXXXXX-XXXX-XXXX-XXXX-XXXXXXXXXXXX" autocomplete="off" spellcheck="false"></label>
         <button class="btn-ghost" data-act="redeem">Activar</button>
         <p class="pu-msg" aria-live="polite"></p>
       </div>
     </div>`,
    {
      wide: true,
      onMount(card, close) {
        const msg = card.querySelector('.pu-msg');
        const input = card.querySelector('.pu-code input');
        card.addEventListener('click', async (e) => {
          const act = e.target.closest('[data-act]')?.dataset.act;
          if (act === 'buy') {
            if (!paymentsReady(t.id)) {
              msg.textContent = 'Los pagos todavía no están habilitados en esta versión. ¡Muy pronto!';
              return;
            }
            window.open(checkoutUrl(t.id), '_blank', 'noopener');
            msg.textContent = 'Al terminar el pago te llega un email con tu código: pégalo aquí abajo.';
          } else if (act === 'pack') {
            window.open(pack.checkout, '_blank', 'noopener');
            msg.textContent = 'Al terminar el pago te llega un email con tu código: pégalo aquí abajo y se abren los dos fondos.';
          } else if (act === 'try') {
            close(null);
            previewTheme(t);
          } else if (act === 'redeem') {
            const btn = e.target.closest('[data-act]');
            btn.disabled = true;
            msg.textContent = 'Comprobando el código…';
            try {
              const ids = await redeem(input.value);
              close(null);
              thank(ids);
              chooseTheme(ids.includes(t.id) ? t.id : ids[0]);
            } catch (err) {
              msg.textContent = err.message;
            } finally {
              btn.disabled = false;
            }
          }
        });
        input.addEventListener('keydown', (e) => e.key === 'Enter' && card.querySelector('[data-act=redeem]').click());
      },
    }
  );
}

const thank = (ids) => toast(`¡Gracias! ${ids.map((id) => `«${themeById(id).name}»`).join(' y ')} ${ids.length > 1 ? 'ya son tuyos' : 'ya es tuyo'}`, 4500);

// Recuperar compras en un dispositivo nuevo (o después de borrar los datos): se vuelve a activar el código.
function showRestore() {
  const paid = THEMES.filter((t) => t.price > 0);
  const status = (t) => (isOwned(t.id) ? 'Comprado en este dispositivo' : devMode() ? 'Abierto en modo desarrollador' : 'Sin comprar en este dispositivo');
  modal(
    `<div class="ornament">❦</div><h2>Restaurar compras</h2>
     <p class="sub">¿Cambiaste de teléfono o se borraron los datos? Pega el código que te llegó por email al comprar. Cada código sirve en hasta 5 dispositivos.</p>
     <div class="rs-list">${paid.map((t) => `<div class="rs-item"><span>${esc(t.name)}</span><em>${status(t)}</em></div>`).join('')}</div>
     <div class="pu-code">
       <label><span>Tu código</span><input type="text" placeholder="XXXXXXXX-XXXX-XXXX-XXXX-XXXXXXXXXXXX" autocomplete="off" spellcheck="false"></label>
       <button class="btn-dark" data-act="redeem">Restaurar</button>
       <p class="pu-msg" aria-live="polite"></p>
       <p class="rs-help">¿No encuentras el email? <a href="${ORDERS_URL}" target="_blank" rel="noopener">Busca tus pedidos y códigos en Lemon Squeezy</a> con el mismo email con que compraste.</p>
     </div>
     <div class="actions"><span class="grow"></span><button class="btn-ghost" data-act="ok">Cerrar</button></div>`,
    {
      wide: true,
      onMount(card, close) {
        const msg = card.querySelector('.pu-msg');
        const input = card.querySelector('.pu-code input');
        card.addEventListener('click', async (e) => {
          const btn = e.target.closest('[data-act]');
          if (btn?.dataset.act === 'ok') return close(null);
          if (btn?.dataset.act !== 'redeem') return;
          btn.disabled = true;
          msg.textContent = 'Comprobando el código…';
          try {
            const ids = await redeem(input.value);
            close(null);
            thank(ids);
          } catch (err) {
            msg.textContent = err.message;
          } finally {
            btn.disabled = false;
          }
        });
        input.addEventListener('keydown', (e) => e.key === 'Enter' && card.querySelector('[data-act=redeem]').click());
      },
    }
  );
}

// Prueba gratuita: 30 segundos en el fondo y después vuelve al que estabas usando.
let previewTimer = null;
let trialPending = null;
let previewReturn = null;
async function previewTheme(t) {
  previewReturn ??= state.theme;
  clearTimeout(previewTimer);
  await chooseTheme(t.id, { preview: true });
  toast(`Probando «${t.name}» por 30 segundos`, 3500);
  previewTimer = setTimeout(() => endTrial(t), 30000);
}

// Fin de la prueba gratuita: vuelve al fondo de antes (si hay un libro abierto, al cerrarlo).
function endTrial(t) {
  if (state.theme !== t.id || isUnlocked(t)) return endPreview();
  if (state.reading) {
    trialPending = t;
    return;
  }
  const back = previewReturn;
  previewReturn = null;
  trialPending = null;
  toast('Terminó la prueba. Puedes comprarlo desde «Fondos».', 4500);
  chooseTheme(back || 'clasica');
}

function endPreview() {
  clearTimeout(previewTimer);
  previewReturn = null;
  trialPending = null;
}

// ---------- Sonido ----------

const effectiveAmbient = () => (state.ambientMode === 'theme' ? themeById(state.theme).sound : state.ambientMode);

function applyAmbient() {
  sound.setAmbient(effectiveAmbient());
  updateSoundIcons();
}

// El navegador sólo permite sonar después de una interacción del usuario.
function startAmbientIfNeeded() {
  if (sound.ambient !== effectiveAmbient()) applyAmbient();
}

function updateSoundIcons() {
  const silent = sound.getVolume('master') === 0 || effectiveAmbient() === 'off';
  // Sólo si cambia: reemplazar el ícono en medio de un toque hace que el navegador pierda el clic.
  for (const id of ['#soundBtn', '#rSound']) {
    const icon = silent ? 'muted' : 'speaker';
    if ($(id).dataset.icon === icon) continue;
    $(id).dataset.icon = icon;
    $(id).innerHTML = ICON[icon];
  }
}

function renderSoundPanel() {
  const themeSound = AMBIENTS[themeById(state.theme).sound];
  const chip = ([id, label]) =>
    `<button class="sp-chip ${id === state.ambientMode ? 'on' : ''}" data-amb="${id}">${id === 'theme' ? `${label} · ${esc(themeSound)}` : esc(label)}</button>`;
  const slider = (kind, label) =>
    `<label class="sp-row"><span>${label}</span><input type="range" class="gold-range" min="0" max="100" value="${Math.round(sound.getVolume(kind) * 100)}" data-vol="${kind}"></label>`;
  $('#soundPanel').innerHTML = `
    <div class="sp-head">${ICON.speaker}<span>Sonido</span></div>
    <div class="sp-label">Ambiente</div>
    <div class="sp-chips">${Object.entries(AMBIENTS).map(chip).join('')}</div>
    ${slider('master', 'Volumen general')}
    ${slider('ambient', 'Ambiente')}
    ${slider('fx', 'Hojas y cinta')}
    ${voiceSection()}`;
  $('#soundPanel').querySelectorAll('.gold-range').forEach(paintRange);
}

// Voz para «Escuchar»: una por idioma (la elegida o la más natural que haya) y la velocidad.
function voiceSection() {
  const voices = listVoices();
  if (!('speechSynthesis' in window)) return '';
  const groups = [['es', 'Español'], ['en', 'Inglés']]
    .map(([lang, name]) => {
      const list = voices.filter((v) => v.lang.toLowerCase().startsWith(lang));
      if (!list.length) return '';
      const cur = voiceFor(lang);
      return `<label class="sp-row"><span>Voz en ${name.toLowerCase()}</span>
        <select class="sp-select" data-voice="${lang}">${list.map((v) => `<option value="${esc(v.voiceURI)}" ${v === cur ? 'selected' : ''}>${esc(voiceLabel(v))}</option>`).join('')}</select></label>`;
    })
    .join('');
  const rate = speechRate();
  // Con un libro abierto: en qué idioma leerlo (automático detecta el idioma del texto).
  const book = state.reading;
  const cur = book?.speechLang || 'auto';
  const langRow = book
    ? `<div class="sp-row"><span>Idioma de este libro</span><div class="sp-chips sp-lang">${[['auto', 'Automático'], ['es', 'Español'], ['en', 'Inglés']]
        .map(([v, l]) => `<button class="sp-chip ${v === cur ? 'on' : ''}" data-slang="${v}">${l}</button>`)
        .join('')}</div></div>`
    : '';
  return `
    <div class="sp-label">Voz de lectura</div>
    ${langRow}
    ${groups || '<p class="sp-note">Todavía no cargan las voces del sistema…</p>'}
    <label class="sp-row"><span>Velocidad <b data-ratev>${rate.toFixed(2).replace('.', ',')}×</b></span>
      <input type="range" class="gold-range" min="70" max="150" step="5" value="${Math.round(rate * 100)}" data-rate></label>
    <div class="sp-voice">
      <button class="sp-chip" data-try>Probar la voz</button>
      <button class="link-light" data-voicehelp>Voces más naturales</button>
    </div>`;
}

function showVoiceHelp() {
  const good = hasGoodVoice('es');
  modal(
    `<div class="ornament">❦</div><h2>Voces más naturales</h2>
     <p class="sub">${good ? 'Ya tienes una voz de buena calidad: elígela en Sonido › Voz de lectura.' : 'Las voces que trae el sistema de fábrica suenan robóticas. Puedes descargar gratis voces mucho más naturales:'}</p>
     <div class="vh">
       <h4>iPhone y iPad</h4>
       <ol>
         <li>Abre <b>Ajustes › Accesibilidad › Contenido leído › Voces</b>.</li>
         <li>Entra en <b>Español</b> y elige una variante (España o México).</li>
         <li>Toca una voz que diga <b>«Mejorada»</b> o <b>«Premium»</b> (por ejemplo Mónica, Paulina o Jorge) y descárgala. Pesa entre 100 y 400 MB: mejor con wifi.</li>
         <li>Cierra y vuelve a abrir Biblioteca, y elige la voz en <b>Sonido › Voz de lectura</b>.</li>
       </ol>
       <p class="vh-note">Las voces de Siri no están disponibles para las apps web.</p>
       <h4>Computadora</h4>
       <ul>
         <li><b>Windows:</b> abre la app en <b>Microsoft Edge</b>: trae voces «Natural» que suenan casi humanas (necesitan internet).</li>
         <li><b>Mac:</b> Ajustes del Sistema › Accesibilidad › Contenido leído › Voz del sistema › Gestionar voces, y descarga una «Mejorada» o «Premium».</li>
       </ul>
       <h4>Android</h4>
       <ul><li>Ajustes › Sistema › Idiomas › Salida de texto a voz: usa el motor de Google y descarga los datos de voz en español.</li></ul>
     </div>
     <div class="actions"><span class="grow"></span><button class="btn-dark" data-act="ok">Entendido</button></div>`,
    {
      wide: true,
      onMount(card, close) {
        card.querySelector('[data-act=ok]').onclick = () => close(null);
      },
    }
  );
}

function paintRange(r) {
  const min = +r.min || 0, max = +r.max || 100;
  r.style.setProperty('--p', `${((r.value - min) / (max - min)) * 100}%`);
}

function toggleSoundPanel(anchor) {
  const panel = $('#soundPanel');
  if (!panel.hidden) return closeSoundPanel();
  renderSoundPanel();
  panel.hidden = false;
  const r = anchor.getBoundingClientRect();
  const w = panel.offsetWidth, h = panel.offsetHeight;
  const below = r.bottom + h + 12 < innerHeight;
  panel.style.left = `${Math.min(Math.max(8, r.right - w), innerWidth - w - 8)}px`;
  panel.style.top = `${below ? r.bottom + 10 : Math.max(8, r.top - h - 10)}px`;
  startAmbientIfNeeded();
}

function closeSoundPanel() {
  $('#soundPanel').hidden = true;
}

// ---------- Eventos ----------

function bindUI() {
  const input = $('#fileInput');
  const pick = () => input.click();
  $('#addBook').addEventListener('click', pick);
  $('#emptyAdd').addEventListener('click', pick);
  input.addEventListener('change', () => {
    if (input.files.length) importFiles(input.files);
    input.value = '';
  });

  let suppressTabClick = false;
  $('#tabs').addEventListener('click', async (e) => {
    if (suppressTabClick) {
      suppressTabClick = false;
      return;
    }
    const t = e.target.closest('.tab');
    if (!t) return;
    if (t.hasAttribute('data-add')) {
      const c = await createCategory();
      if (c) setActive(c.id);
    } else setActive(t.dataset.id);
  });
  const tabMenu = (t, x, y) => {
    if (!t || !t.dataset.id || t.dataset.id === 'all' || t.dataset.id === 'done') return false;
    const id = t.dataset.id;
    showMenu(x, y, [
      { label: 'Renombrar…', action: () => renameCategory(id) },
      { label: 'Eliminar categoría', danger: true, action: () => deleteCategory(id) },
    ]);
    return true;
  };
  $('#tabs').addEventListener('contextmenu', (e) => {
    if (tabMenu(e.target.closest('.tab'), e.clientX, e.clientY)) e.preventDefault();
  });
  let tabHold = null;
  $('#tabs').addEventListener('pointerdown', (e) => {
    if (e.pointerType === 'mouse') return;
    const t = e.target.closest('.tab');
    const r = t?.getBoundingClientRect();
    clearTimeout(tabHold);
    tabHold = setTimeout(() => {
      if (tabMenu(t, r.left, r.bottom + 6)) suppressTabClick = true;
    }, 550);
  });
  for (const ev of ['pointerup', 'pointercancel', 'pointerleave']) $('#tabs').addEventListener(ev, () => clearTimeout(tabHold));
  $('#tabs').addEventListener('scroll', () => clearTimeout(tabHold), { passive: true });

  $('#themeBtn').addEventListener('click', openThemes);
  $('#themes').addEventListener('click', (e) => {
    const col = e.target.closest('[data-col]');
    if (col) {
      if (col.dataset.col !== themeCol) {
        themeCol = col.dataset.col;
        renderThemeCards(true);
      }
      return;
    }
    if (e.target.closest('[data-restore]')) {
      closeThemes();
      return showRestore();
    }
    const card = e.target.closest('.theme-card');
    if (card) chooseTheme(card.dataset.id);
    else if (e.target.closest('[data-close]') || e.target.id === 'themes') closeThemes();
  });
  $('#soundBtn').addEventListener('click', (e) => toggleSoundPanel(e.currentTarget));
  $('#soundPanel').addEventListener('change', (e) => {
    const sel = e.target.closest('[data-voice]');
    if (sel) {
      const v = listVoices().find((x) => x.voiceURI === sel.value);
      if (v) {
        setVoice(v);
        sample(v);
        reader.restartSpeech();
      }
    } else if (e.target.closest('[data-rate]')) reader.restartSpeech();
  });
  $('#soundPanel').addEventListener('click', (e) => {
    if (e.target.closest('[data-try]')) {
      reader.stopSpeaking();
      const lang = ['es', 'en'].includes(state.reading?.speechLang) ? state.reading.speechLang : prefs.get('bib.lastLang') || 'es';
      return sample(voiceFor(lang) || listVoices()[0]);
    }
    const slang = e.target.closest('[data-slang]');
    if (slang && state.reading) {
      const book = state.reading;
      if (slang.dataset.slang === 'auto') delete book.speechLang;
      else book.speechLang = slang.dataset.slang;
      db.put('books', book);
      renderSoundPanel();
      if (reader.speaking) reader.restartSpeech();
      else if (book.speechLang) sample(voiceFor(book.speechLang));
      return;
    }
    if (e.target.closest('[data-voicehelp]')) {
      closeSoundPanel();
      return showVoiceHelp();
    }
    const chip = e.target.closest('[data-amb]');
    if (!chip) return;
    state.ambientMode = chip.dataset.amb;
    prefs.set('bib.ambientMode', state.ambientMode);
    applyAmbient();
    renderSoundPanel();
  });
  $('#soundPanel').addEventListener('input', (e) => {
    const rate = e.target.closest('[data-rate]');
    if (rate) {
      setSpeechRate(rate.value / 100);
      rate.closest('.sp-row').querySelector('[data-ratev]').textContent = `${(rate.value / 100).toFixed(2).replace('.', ',')}×`;
      paintRange(rate);
      return;
    }
    const r = e.target.closest('[data-vol]');
    if (!r) return;
    sound.setVolume(r.dataset.vol, r.value / 100);
    paintRange(r);
    updateSoundIcons();
  });
  document.addEventListener('pointerdown', (e) => {
    if (!e.target.closest('#soundPanel, #soundBtn, #rSound')) closeSoundPanel();
  });
  document.addEventListener('keydown', (e) => {
    if (e.key !== 'Escape') return;
    if (!$('#themes').hidden) closeThemes();
    closeSoundPanel();
  });
  $('#cloudBtn').addEventListener('click', cloudClick);
  $('#moreBtn').addEventListener('click', moreMenu);
  $('#goalBtn').addEventListener('click', showStats);
  // Las voces del sistema llegan tarde: si el panel de sonido está abierto, se vuelve a dibujar.
  onVoices(() => !$('#soundPanel').hidden && renderSoundPanel());
  // La primera vez que se escucha con una voz robótica, se sugiere bajar una mejor.
  $('#rListen').addEventListener('click', () => {
    // Dice en qué idioma lee y dónde cambiarlo (las primeras veces).
    const tips = +prefs.get('bib.langTips') || 0;
    if (reader.speaking && tips < 3) {
      prefs.set('bib.langTips', String(tips + 1));
      setTimeout(() => {
        const lang = prefs.get('bib.lastLang') === 'en' ? 'inglés' : 'español';
        toast(`Leyendo en ${lang}. Para cambiar el idioma o la voz: botón de sonido › Idioma de este libro.`, 6000);
      }, 1200);
    }
    if (!reader.speaking || prefs.get('bib.voiceTip') || hasGoodVoice('es')) return;
    prefs.set('bib.voiceTip', '1');
    setTimeout(() => toast('Consejo: para una voz más natural, descarga una voz «Mejorada» o «Premium». Mira cómo en Sonido › Voces más naturales.', 8000), 1500);
  });
  $('#backupInput').addEventListener('change', (e) => {
    const file = e.target.files[0];
    e.target.value = '';
    if (file) importBackup(file);
  });
  setInterval(trackReading, 15000);
  document.addEventListener('visibilitychange', () => (lastTick = Date.now()));
  bindSearch();
  window.addEventListener('focus', checkRemote);
  document.addEventListener('visibilitychange', () => document.visibilityState === 'visible' && checkRemote());
  setInterval(checkRemote, 30000);
  // Al cerrar la pestaña, guarda enseguida lo que estaba por guardarse.
  window.addEventListener('pagehide', () => db.folder?.saveTimer && db.folder.flush());
  document.addEventListener('pointerdown', (e) => {
    if (!e.target.closest('#ctxmenu')) hideMenu();
    startAmbientIfNeeded();
  });

  let depth = 0;
  const dz = $('#dropzone');
  const hasFiles = (e) => [...(e.dataTransfer?.types || [])].includes('Files');
  window.addEventListener('dragenter', (e) => {
    if (!hasFiles(e)) return;
    e.preventDefault();
    depth++;
    if (!state.reading) dz.classList.add('show');
  });
  window.addEventListener('dragleave', (e) => {
    if (!hasFiles(e)) return;
    depth = Math.max(0, depth - 1);
    if (!depth) dz.classList.remove('show');
  });
  window.addEventListener('dragover', (e) => hasFiles(e) && e.preventDefault());
  window.addEventListener('drop', (e) => {
    if (!hasFiles(e)) return;
    e.preventDefault();
    depth = 0;
    dz.classList.remove('show');
    if (state.reading) return toast('Cierra el libro para añadir otros');
    if (document.querySelector('.modal-backdrop')) return toast('Termina lo que estás haciendo y vuelve a soltar el archivo');
    importFiles(e.dataTransfer.files);
  });
}

boot().catch((err) => {
  console.error(err);
  const p = $('#loader p');
  p.textContent =
    err?.reason === 'webgl'
      ? 'Tu navegador tiene desactivado el 3D (WebGL). En Chrome: Configuración → Sistema → activa «Usar aceleración de gráficos cuando esté disponible» y reinicia el navegador.'
      : 'No se pudo iniciar la biblioteca. Revisa tu conexión a internet y recarga la página.';
  const detail = document.createElement('small');
  detail.className = 'boot-error';
  detail.textContent = `Detalle técnico: ${err?.message || err}`;
  p.after(detail);
});
