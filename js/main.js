// Orquesta la app: estantería 3D, categorías, importación de PDF y el lector.
import { db, local, uid, prefs } from './db.js';
import { folderSupported, pickFolder, hasPermission, FolderStore } from './cloud.js';
import { Library3D } from './library3d.js';
import { Reader, HL_COLORS } from './reader.js';
import { openPdf, renderCoverFromPdf, guessTitleFromText, pageAspects } from './pdfdoc.js';
import { identify, fetchCover, suggestCategory, coverPalette, fallbackPalette } from './identify.js';
import { sound } from './sound.js';
import { THEMES, AMBIENTS, themeById, isUnlocked } from './themes.js';

const $ = (s, r = document) => r.querySelector(s);
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

async function boot() {
  await Promise.all([
    document.fonts.load('600 40px "Cormorant Garamond"'),
    document.fonts.load('italic 500 30px "Cormorant Garamond"'),
    document.fonts.load('400 16px "EB Garamond"'),
  ]).catch(() => {});
  navigator.storage?.persist?.().catch(() => {});

  await restoreFolder();
  await loadLibrary();

  reader = new Reader({
    onClose: closeReader,
    onSave: (book) => db.put('books', book),
    onEdit: (book) => editBook(book.id),
    onAmbient: () => toggleSoundPanel($('#rSound')),
    onHighlights: showHighlights,
  });
  reader.toast = toast;

  try {
    lib = new Library3D($('#scene'), {
      theme: state.theme,
      onThunder: () => sound.thunder(),
      onRace: (times) => sound.race(times),
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
  registerServiceWorker();
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
  if (state.active !== 'all' && !state.categories.some((c) => c.id === state.active)) state.active = 'all';
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
    onSaved: () => updateCloud('saved'),
    onError: (err) => {
      console.error(err);
      updateCloud('error');
      toast('No pude guardar en la carpeta de OneDrive. Revisa que siga existiendo.', 6000);
    },
  });
  await store.load();
  if (merge) await store.mergeFrom(db.folder || local);
  db.useFolder(store);
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
    await attachFolder(saved.handle);
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
  const list = (state.active === 'all' ? state.books : state.books.filter((b) => b.categoryId === state.active)).sort((a, b) => a.addedAt - b.addedAt);
  const label = state.active === 'all' ? 'Biblioteca' : categoryName(state.active) || 'Biblioteca';
  lib.setBooks(list.map((b) => ({ id: b.id, title: b.title, author: b.author, color: b.color, aspect: b.aspect, pageCount: b.pageCount, coverUrl: coverURL(b) })), label);
  $('#empty').classList.toggle('show', list.length === 0);
  $('#emptyText').textContent = state.books.length === 0 ? 'Tu biblioteca espera su primer libro.' : `Aún no hay libros en «${label}».`;
  renderTabs();
}

function renderTabs() {
  const counts = {};
  state.books.forEach((b) => (counts[b.categoryId] = (counts[b.categoryId] || 0) + 1));
  const tabs = [{ id: 'all', name: 'Todos', n: state.books.length }, ...sortedCategories().map((c) => ({ id: c.id, name: c.name, n: counts[c.id] || 0 }))];
  $('#tabs').innerHTML =
    tabs.map((t) => `<button class="tab ${t.id === state.active ? 'active' : ''}" data-id="${t.id}">${esc(t.name)}<sup>${t.n || ''}</sup></button>`).join('') +
    `<button class="tab add" data-add title="Nueva categoría">+</button>`;
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
  const ok = await confirmBox(`¿Eliminar «${c.name}»?`, n ? `Sus ${n} libro${n > 1 ? 's' : ''} seguirán en tu biblioteca, sin categoría.` : 'La categoría está vacía.', 'Eliminar');
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
  if (tip.dataset.id !== id || tip.dataset.v !== String(book.bookmark ?? '') + book.lastPage) {
    tip.dataset.id = id;
    tip.dataset.v = String(book.bookmark ?? '') + book.lastPage;
    const url = coverURL(book);
    const read = book.bookmark ?? book.lastPage ?? 1;
    const prog = book.bookmark
      ? `<svg width="10" height="14" viewBox="0 0 10 14"><path d="M0 0h10v14l-5-4-5 4z" fill="#8a2232"/></svg> Cinta en la página ${book.bookmark} de ${book.pageCount}`
      : (book.lastPage || 1) > 1 ? `Página ${book.lastPage} de ${book.pageCount}` : `${book.pageCount} páginas · sin empezar`;
    tip.innerHTML = `
      <div class="thumb" style="${url ? `background-image:url('${url}')` : `background-color:${book.color}`}"></div>
      <div>
        <h4>${esc(book.title)}</h4>
        <div class="by">${esc(book.author || 'Autor desconocido')}${book.year ? ` · ${esc(book.year)}` : ''}</div>
        <div class="prog">${prog}</div>
        <div class="bar"><i style="width:${Math.round((read / Math.max(1, book.pageCount)) * 100)}%"></i></div>
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
    { sep: true },
    { header: 'Mover a' },
    { label: 'Sin categoría', checked: !b.categoryId, action: () => moveBook(id, '') },
    ...sortedCategories().map((c) => ({ label: c.name, checked: c.id === b.categoryId, action: () => moveBook(id, c.id) })),
    { label: 'Nueva categoría…', action: async () => { const c = await createCategory(); if (c) moveBook(id, c.id); } },
    { sep: true },
    { label: 'Eliminar de la biblioteca', danger: true, action: () => deleteBook(id) },
  ]);
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
        const where = b.bookmark ? `Cinta en la pág. ${b.bookmark}` : (b.lastPage || 1) > 1 ? `Pág. ${b.lastPage} de ${b.pageCount}` : `${b.pageCount} páginas`;
        return `<button class="search-item ${i === 0 ? 'sel' : ''}" data-i="${i}">
          <span class="thumb" style="${url ? `background-image:url('${url}')` : `background-color:${b.color}`}"></span>
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
  const list = [...(book.highlights || [])].sort((a, b) => a.page - b.page || a.createdAt - b.createdAt);
  const item = (h) => `
    <div class="hl-item" role="button" tabindex="0" data-id="${h.id}" data-page="${h.page}" title="Ir a la página ${h.page}">
      <span class="sw" style="background:${(HL_COLORS[h.color] || HL_COLORS.yellow).dot}"></span>
      <span class="body"><span class="pg">Página ${h.page}</span><q>${esc(h.text.length > 280 ? h.text.slice(0, 280) + '…' : h.text)}</q></span>
      <button class="x" data-del="${h.id}" title="Quitar este resaltado">×</button>
    </div>`;
  modal(
    `<div class="ornament">❦</div><h2>Mis resaltados</h2>
     <p class="sub">${esc(book.title)}</p>
     ${list.length ? `<div class="hl-list">${list.map(item).join('')}</div>` : '<p class="sub">Aún no resaltaste nada en este libro. Activa «Resaltar» y selecciona un texto con el ratón.</p>'}
     <div class="actions"><span class="grow"></span><button class="btn-dark" data-act="ok">Cerrar</button></div>`,
    {
      wide: true,
      onMount(card, close) {
        card.addEventListener('click', (e) => {
          const del = e.target.closest('[data-del]');
          if (del) {
            reader.removeHighlight(del.dataset.del);
            del.closest('.hl-item').remove();
            return;
          }
          const it = e.target.closest('.hl-item');
          if (it) {
            close(null);
            reader.goToPage(+it.dataset.page);
          } else if (e.target.closest('[data-act=ok]')) close(null);
        });
      },
    }
  );
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
      const pageCount = pdf.numPages;
      const { coverAspect, pageAspect } = await pageAspects(pdf);
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
        pageCount, aspect: coverAspect, pageAspect, fileName: file.name,
        addedAt: Date.now(), bookmark: null, lastPage: 1,
      };
      // Si la primera página del PDF parece una portada, es la edición exacta: la preferimos.
      const pick = pdfCover?.likelyCover ? 'pdf' : online ? 'online' : pdfCover ? 'pdf' : null;
      const result = await bookDialog(draft, { mode: 'new', found: info.found, covers: { pdf: pdfCover?.blob || null, online: online?.blob || null }, pick });
      if (!result) continue;
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
          sortedCategories().map((c) => `<option value="${c.id}" ${c.id === sel ? 'selected' : ''}>${esc(c.name)}</option>`).join('') +
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
        const info = await identify({ override: { title: t, author: f('author').value.trim() }, pageCount: draft.pageCount });
        const online = info.found && info.covers.length ? await fetchCover(info.covers) : null;
        if (btn) btn.textContent = label;
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
            const file = await db.get('files', draft.id);
            if (file) {
              const pdf = await openPdf(file.blob);
              covers.pdf = (await renderCoverFromPdf(pdf)).blob;
              pdf.destroy();
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
            description: desc.textContent,
            coverBlob,
          };
          const pal = coverBlob ? await coverPalette(coverBlob).catch(() => fallbackPalette(out.title)) : fallbackPalette(out.title);
          out.color = pal.color;
          out.ribbon = pal.ribbon;
          if (coverBlob) {
            const bmp = await createImageBitmap(coverBlob).catch(() => null);
            if (bmp) out.aspect = bmp.width / bmp.height;
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
      setTimeout(() => bd.remove(), 250);
      document.removeEventListener('keydown', onKey, true);
      resolve(v);
    };
    document.addEventListener('keydown', onKey, true);
    bd.addEventListener('pointerdown', (e) => {
      if (e.target === bd) close(null);
    });
    onMount?.(bd.firstElementChild, close);
    bd.querySelector('input:not([type=file])')?.focus();
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

// Hace la app instalable y usable sin internet (sólo cuando se sirve por http/https).
function registerServiceWorker() {
  if (!('serviceWorker' in navigator) || !location.protocol.startsWith('http')) return;
  // Si se publicó una versión nueva mientras la app estaba abierta, se recarga una vez para usarla
  // entera (salvo que estés leyendo: se aplicará la próxima vez que la abras).
  const hadController = !!navigator.serviceWorker.controller;
  let reloading = false;
  navigator.serviceWorker.addEventListener('controllerchange', () => {
    if (!hadController || reloading || state.reading) return;
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

function renderThemeCards() {
  const price = (t) =>
    t.price === 0
      ? '<span class="tc-price">Incluido</span>'
      : `<span class="tc-price"><s>${t.price.toFixed(2).replace('.', ',')} US$</s>${isUnlocked(t) ? ' <em>Gratis en la prueba</em>' : ''}</span>`;
  $('#themeCards').innerHTML = THEMES.map(
    (t) => `
    <button class="theme-card ${t.id === state.theme ? 'on' : ''}" data-id="${t.id}">
      <span class="tc-img" style="background-image:url('${t.preview}')"><span class="tc-check">${ICON.check}</span></span>
      <span class="tc-body">
        <span class="tc-name">${esc(t.name)}</span>
        <span class="tc-mood">${esc(t.mood)}</span>
        <span class="tc-meta"><span class="tc-sound">${ICON.speaker}${esc(AMBIENTS[t.sound])}</span>${price(t)}</span>
      </span>
    </button>`
  ).join('');
}

function openThemes() {
  if (state.reading || switchingTheme) return;
  closeSoundPanel();
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
async function chooseTheme(id) {
  const t = themeById(id);
  closeThemes();
  if (id === state.theme || switchingTheme || state.reading) return;
  if (!isUnlocked(t)) return toast(`«${t.name}» cuesta ${t.price.toFixed(2).replace('.', ',')} US$`);
  switchingTheme = true;
  const curtain = $('#curtain');
  curtain.querySelector('h2').textContent = t.name;
  curtain.querySelector('p').textContent = t.mood;
  curtain.classList.add('show');
  await wait(800);
  lib.setTheme(id);
  state.theme = id;
  prefs.set('bib.theme', id);
  lib.dollyIn();
  applyAmbient();
  updateThemeButton();
  await wait(1100);
  curtain.classList.remove('show');
  await wait(900);
  switchingTheme = false;
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
  for (const id of ['#soundBtn', '#rSound']) $(id).innerHTML = silent ? ICON.muted : ICON.speaker;
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
    ${slider('fx', 'Hojas y cinta')}`;
  $('#soundPanel').querySelectorAll('.gold-range').forEach(paintRange);
}

function paintRange(r) {
  r.style.setProperty('--p', `${r.value}%`);
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

  $('#tabs').addEventListener('click', async (e) => {
    const t = e.target.closest('.tab');
    if (!t) return;
    if (t.hasAttribute('data-add')) {
      const c = await createCategory();
      if (c) setActive(c.id);
    } else setActive(t.dataset.id);
  });
  $('#tabs').addEventListener('contextmenu', (e) => {
    const t = e.target.closest('.tab');
    if (!t || !t.dataset.id || t.dataset.id === 'all') return;
    e.preventDefault();
    const id = t.dataset.id;
    showMenu(e.clientX, e.clientY, [
      { label: 'Renombrar…', action: () => renameCategory(id) },
      { label: 'Eliminar categoría', danger: true, action: () => deleteCategory(id) },
    ]);
  });

  $('#themeBtn').addEventListener('click', openThemes);
  $('#themes').addEventListener('click', (e) => {
    const card = e.target.closest('.theme-card');
    if (card) chooseTheme(card.dataset.id);
    else if (e.target.closest('[data-close]') || e.target.id === 'themes') closeThemes();
  });
  $('#soundBtn').addEventListener('click', (e) => toggleSoundPanel(e.currentTarget));
  $('#soundPanel').addEventListener('click', (e) => {
    const chip = e.target.closest('[data-amb]');
    if (!chip) return;
    state.ambientMode = chip.dataset.amb;
    prefs.set('bib.ambientMode', state.ambientMode);
    applyAmbient();
    renderSoundPanel();
  });
  $('#soundPanel').addEventListener('input', (e) => {
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
