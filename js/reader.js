// Lector: un libro de tapa dura en CSS 3D, con hojas que pasan, guardas marmoladas
// y una cinta de seda que marca dónde dejaste de leer.
import { openEpub } from './epub.js';
import { TextMode } from './textmode.js';
import { loadOcr, withOcr, isScanned } from './ocr.js';
import { openPdf, renderPage, detectTwoUp, bookDoc, remapBook, frameOf, remapFrame, pageAspectOf, readingFrame, boxFor } from './pdfdoc.js';
import { prefs } from './db.js';
import { sound } from './sound.js';
import { voiceFor, speechRate } from './voices.js';
import { marbleDataURL, clothDataURL, paperDataURL, deskDataURL, shade, hashStr, clamp } from './textures.js';

// Zoom del lector: «página entera», «al ancho de la pantalla» (si cabe), «al texto» (los márgenes quedan fuera
// y el bloque de texto llena el ancho) y dos pasos más grandes.
const ZOOM_STEPS = [1.6, 2];
// Colores del resaltador (se mezclan con el papel en modo "multiplicar").
export const HL_COLORS = {
  yellow: { name: 'Amarillo', fill: 'rgba(250, 214, 80, 0.62)', dot: '#f2cf55' },
  green: { name: 'Verde', fill: 'rgba(150, 215, 140, 0.6)', dot: '#93cf8b' },
  pink: { name: 'Rosa', fill: 'rgba(245, 150, 180, 0.55)', dot: '#f19ab5' },
  blue: { name: 'Azul', fill: 'rgba(140, 190, 240, 0.6)', dot: '#8dbbea' },
  orange: { name: 'Naranja', fill: 'rgba(245, 170, 95, 0.6)', dot: '#f2aa62' },
};
const FLIP_MS = 720;
const FLAT_ICON = {
  full: '<svg viewBox="0 0 24 24"><path d="M4 9V4h5M15 4h5v5M20 15v5h-5M9 20H4v-5"/></svg>',
  book: '<svg viewBox="0 0 24 24"><path d="M12 6.5C10 5 7 4.5 3.5 5v13c3.5-.5 6.5 0 8.5 1.5 2-1.5 5-2 8.5-1.5V5C17 4.5 14 5 12 6.5z"/><path d="M12 6.5v13"/></svg>',
};
const CLOSED_SCALE = 0.92;
const $ = (s) => document.querySelector(s);
const wait = (ms) => new Promise((r) => setTimeout(r, ms));
const frame = () => new Promise((r) => requestAnimationFrame(() => requestAnimationFrame(r)));

export class Reader {
  constructor({ onClose, onSave, onEdit, onAmbient, onHighlights, onToc, onNote, onFinish, onFocus, onFocusEnd, onShare, onDefine, onScanned }) {
    Object.assign(this, { onClose, onSave, onEdit, onAmbient, onHighlights, onToc, onNote, onFinish, onFocus, onFocusEnd, onShare, onDefine, onScanned });
    this.el = $('#reader');
    this.stage = $('#stage');
    this.bk = $('#book3d');
    this.pageL = $('#pageL');
    this.pageR = $('#pageR');
    this.leaf = $('#leaf');
    this.leafFront = $('#leafFront');
    this.leafBack = $('#leafBack');
    this.cover = $('#cover');
    this.coverPage = $('#coverPage');
    this.ribbon = $('#ribbon');
    this.ribbonBody = $('#ribbon .body');
    this.tail = $('#ribbonTail');
    this.cache = new Map();
    this.paperState = {};
    this.zoomIdx = 0;
    this.mode = prefs.get('bib.mode') || 'auto';
    this.isOpen = false;
    this.busy = false;
    this.lastActivity = 0;
    this.setPaper(prefs.get('bib.paper') || 'day');
    // Hoja completa: sin el libro 3D, la página ocupa toda la pantalla, como un lector electrónico.
    this.flat = prefs.get('bib.flat') === '1';
    this.el.classList.toggle('flat', this.flat);
    document.documentElement.style.setProperty('--paperTex', `url(${paperDataURL()})`);
    document.documentElement.style.setProperty('--deskTex', `url(${deskDataURL()})`);
    this.bind();
  }

  // ---------- Geometría ----------

  get minS() {
    return this.double ? 0 : 1;
  }
  get maxS() {
    return this.double ? Math.floor(this.N / 2) : this.N;
  }
  spreadOf(p) {
    return this.double ? Math.floor(p / 2) : clamp(p, 1, this.N);
  }
  // Páginas visibles de un pliego. 0 y N+1 son las guardas; null es papel en blanco.
  vis(s) {
    return this.double ? { left: 2 * s, right: 2 * s + 1 } : { left: null, right: s };
  }
  realPages(s) {
    const v = this.vis(s);
    return [v.left, v.right].filter((p) => p != null && p >= 1 && p <= this.N);
  }

  measure(aspect, N, flat = this.flat) {
    const vw = innerWidth, vh = innerHeight;
    const double = this.mode === 'double' || (this.mode === 'auto' && vw >= 860 && vw / vh > 1.05);
    if (flat) {
      // la hoja llena el alto de la pantalla (o el ancho, si no entra); sin tapas ni cantos
      let ph = vh, pw = ph * aspect;
      const totalW = (double ? 2 : 1) * pw;
      if (totalW > vw) {
        ph *= vw / totalW;
        pw *= vw / totalW;
      }
      const fitW = vw / ((double ? 2 : 1) * pw);
      const width = fitW > 1.08 ? fitW : null;
      this.zoomLevels = [1, ...(width ? [width] : []), ...ZOOM_STEPS.map((k) => k * (width || 1)).filter((z) => z <= 3.05)];
      this.zoomWidth = width;
      const z = this.zoomLevels[clamp(this.zoomIdx, 0, this.zoomLevels.length - 1)];
      return { double, pw: Math.round(pw * z), ph: Math.round(ph * z), bd: 0, T: 0 };
    }
    const bdK = 0.026;
    // Deja aire arriba para el título y abajo para la cola de la cinta.
    let ph = (vh - 160) / (1 + 2 * bdK);
    let pw = ph * aspect;
    let totalW = (double ? 2 : 1) * pw + 2 * ph * bdK + 24;
    if (totalW > vw - 40) {
      const k = (vw - 40) / totalW;
      ph *= k;
      pw *= k;
      totalW = vw - 40;
    }
    // Niveles para esta pantalla: entera (1), al ancho (si agranda de verdad), al texto y pasos desde ahí.
    const fitW = (vw - 16) / totalW;
    const width = fitW > 1.08 ? fitW : null;
    // parte del ancho que ocupa el texto: en doble página quedan fuera los dos márgenes exteriores
    const textFrac = double ? 0.925 : 0.84;
    const text = (width || 1) / textFrac;
    this.zoomLevels = [1, ...(width ? [width] : []), text, ...ZOOM_STEPS.map((k) => k * (width || 1)).filter((z) => z > text * 1.12 && z <= 3.05)];
    this.zoomWidth = width;
    this.zoomText = text;
    const z = this.zoomLevels[clamp(this.zoomIdx, 0, this.zoomLevels.length - 1)];
    ph = Math.round(ph * z);
    pw = Math.round(pw * z);
    const bd = Math.round(clamp(ph * bdK, 7, 30));
    const T = Math.round(clamp(N * 0.07, 10, 42) * (ph / 800));
    return { double, pw, ph, bd, T };
  }

  // Fracción de la altura de pantalla que ocupa el libro cerrado (para empalmar con la escena 3D).
  closedFraction(book) {
    const zoom = this.zoomIdx;
    this.zoomIdx = 0;
    const { ph, bd } = this.measure(book.pageAspect || book.aspect || 0.66, book.pageCount || 200, false);
    this.zoomIdx = zoom;
    return ((ph + 2 * bd) * CLOSED_SCALE) / innerHeight;
  }

  layout() {
    const { double, pw, ph, bd, T } = this.measure(this.aspect, this.N);
    this.zoomIdx = clamp(this.zoomIdx, 0, this.zoomLevels.length - 1);
    this.double = double;
    this.bk.classList.toggle('single', !double);
    const halfW = double ? pw + bd : pw + 2 * bd;
    const spineX = double ? pw + bd : 0;
    const rightX = double ? pw + bd : bd;
    const bookW = double ? 2 * pw + 2 * bd : pw + 2 * bd;
    const bookH = ph + 2 * bd;
    const changed = pw !== this.pw || ph !== this.ph;
    Object.assign(this, { pw, ph, bd, T, halfW, spineX, rightX, bookW, bookH });
    const vars = {
      '--pw': pw, '--ph': ph, '--bd': bd, '--T': T, '--halfW': halfW, '--spineX': spineX, '--rightX': rightX,
      '--bookW': bookW, '--bookH': bookH, '--closedShift': double ? -halfW / 2 : 0,
      '--tailLen': Math.round(clamp(ph * 0.075, 34, 80)), '--rw': Math.round(clamp(pw * 0.042, 12, 24)),
    };
    for (const [k, v] of Object.entries(vars)) this.bk.style.setProperty(k, v + 'px');
    if (changed) this.cache.clear();
    this.updateEdges();
    return changed;
  }

  updateEdges() {
    const max = clamp(this.N * 0.025, 3, 12) * (this.ph / 800);
    const first = this.realPages(this.s ?? this.minS)[0] ?? 1;
    const prog = this.N > 1 ? clamp((first - 1) / (this.N - 1), 0, 1) : 0;
    this.bk.style.setProperty('--edgeL', (prog > 0 ? Math.max(1.5, max * prog) : 0) + 'px');
    this.bk.style.setProperty('--edgeR', (prog < 1 ? Math.max(1.5, max * (1 - prog)) : 0) + 'px');
  }

  applyTheme() {
    const b = this.book;
    const st = this.bk.style;
    st.setProperty('--cloth', b.color);
    st.setProperty('--clothTex', `url(${clothDataURL(b.color)})`);
    const rib = b.ribbon || '#7d1d2a';
    st.setProperty('--ribbon', rib);
    st.setProperty('--ribbonDark', shade(rib, -0.45));
    st.setProperty('--ribbonLight', shade(rib, 0.3));
    st.setProperty('--marble', `url(${marbleDataURL(b.color, hashStr(b.id))})`);
    st.setProperty('--coverImg', this.coverUrl ? `url("${this.coverUrl}")` : 'none');
    $('#spineTitle').textContent = b.title;
    $('#coverFallback').innerHTML = this.coverUrl ? '' : `<span>${escapeHTML(b.title)}</span><em>${escapeHTML(b.author || '')}</em>`;
    $('#rTitle').textContent = b.title;
    $('#rAuthor').textContent = b.author || '';
  }

  // ---------- Páginas ----------

  getCanvas(p) {
    // las guardas (0 y N+1) y el papel en blanco no son páginas del PDF
    if (p == null || p < 1 || p > this.N) return Promise.resolve(null);
    const key = `${p}@${this.pw}x${this.ph}`;
    let pr = this.cache.get(key);
    if (pr) {
      this.cache.delete(key);
      this.cache.set(key, pr);
      return pr;
    }
    pr = renderPage(this.pdf, p, this.pw, this.ph, undefined, { paper: this.paperState }).catch((err) => {
      // una página que falló no se guarda: la próxima vez se intenta de nuevo
      if (this.cache.get(key) === pr) this.cache.delete(key);
      if (err?.name !== 'RenderingCancelledException') console.warn('No se pudo dibujar la página', p, err);
      const c = document.createElement('canvas');
      c.width = c.height = 2;
      return c;
    });
    this.cache.set(key, pr);
    // Con zoom cada página pesa mucho más: se guardan menos (unos 40 millones de píxeles en total).
    const px = this.pw * this.ph * Math.min(window.devicePixelRatio || 1, 2) ** 2;
    const keep = clamp(Math.floor(4e7 / px), 6, 28);
    while (this.cache.size > keep) {
      const k = this.cache.keys().next().value;
      this.cache.get(k).then(freeCanvas, () => {});
      this.cache.delete(k);
    }
    return pr;
  }

  async paint(holder, p) {
    const tok = (holder._tok = (holder._tok || 0) + 1);
    const content = holder.querySelector('.content');
    const blank = p == null;
    const end = !blank && (p < 1 || p > this.N);
    holder.classList.toggle('blank', blank);
    holder.classList.toggle('endpaper', end);
    if (blank || end) {
      content.replaceChildren();
      holder._key = null;
      return;
    }
    const key = `${p}@${this.ph}#${this.hlRev}`;
    if (holder._key === key && content.firstChild) return;
    const src = await this.getCanvas(p);
    if (holder._tok !== tok) return;
    let cv = content.firstChild;
    if (!cv) {
      cv = document.createElement('canvas');
      content.appendChild(cv);
    }
    cv.width = src.width;
    cv.height = src.height;
    const ctx = cv.getContext('2d');
    ctx.drawImage(src, 0, 0);
    this.drawHighlights(ctx, p, cv.width, cv.height);
    holder._key = key;
  }

  // ---------- Resaltados ----------

  drawHighlights(ctx, p, W, H) {
    const list = (this.book.highlights || []).filter((h) => h.page === p);
    if (!list.length) return;
    ctx.save();
    ctx.globalCompositeOperation = 'multiply';
    for (const h of list) {
      ctx.fillStyle = (HL_COLORS[h.color] || HL_COLORS.yellow).fill;
      for (const r of h.rects) {
        const [x, y, w, hh] = this.hlRect(p, r);
        ctx.fillRect(x * W, y * H, w * W, hh * H);
      }
    }
    ctx.restore();
  }

  // Zona del holder donde realmente está dibujada la página (el lienzo se ajusta sin deformar).
  drawnArea(holder) {
    const cv = holder.querySelector('.content canvas');
    if (!cv) return null;
    const s = Math.min(this.pw / cv.width, this.ph / cv.height);
    const w = cv.width * s, h = cv.height * s;
    return { x: (this.pw - w) / 2, y: (this.ph - h) / 2, w, h };
  }

  async getText(p) {
    this.textCache ??= new Map();
    if (!this.textCache.has(p)) this.textCache.set(p, this.pdf.getPage(p).then((page) => page.getTextContent().then((tc) => ({ page, tc }))));
    return this.textCache.get(p);
  }

  // Capa invisible con el texto de la página, colocada encima del dibujo, para poder seleccionarlo.
  async buildTextLayer(holder, p) {
    const tok = (holder._tlTok = (holder._tlTok || 0) + 1);
    holder.querySelector('.text-layer')?.remove();
    if (p == null || p < 1 || p > this.N) return 0;
    await this.paint(holder, p);
    const area = this.drawnArea(holder);
    if (!area) return 0;
    const { page, tc } = await this.getText(p);
    const base = page.getViewport({ scale: 1 });
    const vp = page.getViewport({ scale: area.w / base.width });
    const layer = document.createElement('div');
    layer.className = 'text-layer';
    layer.dataset.page = p;
    Object.assign(layer.style, { left: `${area.x}px`, top: `${area.y}px`, width: `${area.w}px`, height: `${area.h}px` });
    const measure = (this.measureCtx ??= document.createElement('canvas').getContext('2d'));
    let count = 0;
    for (const it of tc.items) {
      if (!it.str || !it.str.trim()) continue;
      const tx = mul(vp.transform, it.transform);
      const fontH = Math.hypot(tx[2], tx[3]);
      if (fontH < 1) continue;
      const angle = Math.atan2(tx[1], tx[0]);
      const style = tc.styles[it.fontName] || {};
      const ascent = (style.ascent ? style.ascent : style.descent ? 1 + style.descent : 0.8) * fontH;
      const span = document.createElement('span');
      span.textContent = it.str;
      const family = style.fontFamily || 'sans-serif';
      span.style.left = `${tx[4] + ascent * Math.sin(angle)}px`;
      span.style.top = `${tx[5] - ascent * Math.cos(angle)}px`;
      span.style.fontSize = `${fontH}px`;
      span.style.fontFamily = family;
      measure.font = `${fontH}px ${family}`;
      const natural = measure.measureText(it.str).width;
      const target = (style.vertical ? it.height : it.width) * vp.scale;
      const sx = natural > 0 && target > 0 ? target / natural : 1;
      span.style.transform = `rotate(${angle}rad) scaleX(${sx})`;
      layer.append(span);
      count++;
    }
    // Si mientras tanto se pasó de página o se salió del modo, esta capa ya no sirve.
    if (holder._tlTok !== tok || !this.hlMode) return 0;
    holder.querySelector('.text-layer')?.remove();
    holder.appendChild(layer);
    return count;
  }

  async buildTextLayers() {
    const v = this.vis(this.s);
    const counts = await Promise.all([this.double ? this.buildTextLayer(this.pageL, v.left) : 0, this.buildTextLayer(this.pageR, v.right)]);
    return counts.reduce((a, b) => a + b, 0);
  }

  clearTextLayers() {
    for (const h of [this.pageL, this.pageR]) h._tlTok = (h._tlTok || 0) + 1;
    this.bk.querySelectorAll('.text-layer').forEach((n) => n.remove());
  }

  async setHighlightMode(on) {
    if (!this.isOpen || (on && (this.flat || this.busy))) return;
    this.hlMode = on;
    this.el.classList.toggle('hl-mode', on);
    $('#rHighlight').classList.toggle('active', on);
    this.hidePop();
    window.getSelection()?.removeAllRanges();
    if (!on) return this.clearTextLayers();
    this.renderHlBar();
    this.showUI();
    const n = await this.buildTextLayers();
    if (!n && this.realPages(this.s).length && this.hlMode) this.toast?.('Estas páginas son imágenes escaneadas: no tienen texto para resaltar.', 4500);
  }

  renderHlBar() {
    const color = prefs.get('bib.hlColor') || 'yellow';
    document.querySelectorAll('#hlBar .hl-dot').forEach((d) => d.classList.toggle('on', d.dataset.color === color));
    $('#hlCount').textContent = (this.book.highlights || []).length || '';
  }

  // Convierte la selección del usuario en resaltados (uno por página tocada).
  captureSelection(saved) {
    const sel = window.getSelection();
    const range = saved || (sel && !sel.isCollapsed && sel.rangeCount ? sel.getRangeAt(0) : null);
    $('#selBar').hidden = true;
    if (!range || range.collapsed) return false;
    const rects = [...range.getClientRects()].filter((r) => r.width > 1 && r.height > 1);
    const text = selectedText(this.bk, range); // para saber si hay algo; cada página guarda el suyo
    sel?.removeAllRanges();
    if (!rects.length || !text) return false;
    const color = prefs.get('bib.hlColor') || 'yellow';
    let made = 0;
    for (const layer of this.bk.querySelectorAll('.text-layer')) {
      const L = layer.getBoundingClientRect();
      const mine = rects
        .filter((r) => {
          const cx = r.left + r.width / 2, cy = r.top + r.height / 2;
          return cx >= L.left && cx <= L.right && cy >= L.top && cy <= L.bottom;
        })
        .map((r) => [r.left - L.left, r.top - L.top, r.width, r.height]);
      if (!mine.length) continue;
      const merged = mergeLines(mine).map(([x, y, w, h]) => [x / L.width, y / L.height, w / L.width, h / L.height].map((v) => Math.round(v * 10000) / 10000));
      // Volver a resaltar lo mismo reemplaza lo anterior en vez de apilar colores.
      const page = +layer.dataset.page;
      this.book.highlights = (this.book.highlights || []).filter((h) => h.page !== page || !overlaps(h.rects, merged));
      this.book.highlights.push({ id: Date.now().toString(36) + Math.random().toString(36).slice(2, 6), page, color, rects: merged, text: selectedText(layer, range) || text, createdAt: Date.now() });
      made++;
    }
    if (made) this.highlightsChanged();
    return made > 0;
  }

  highlightsChanged() {
    this.hlRev = (this.hlRev || 0) + 1;
    this.paintSpread();
    this.renderHlBar();
    this.flushSave();
  }

  removeHighlight(id) {
    this.book.highlights = (this.book.highlights || []).filter((h) => h.id !== id);
    this.highlightsChanged();
  }

  recolorHighlight(id, color) {
    const h = (this.book.highlights || []).find((x) => x.id === id);
    if (!h) return;
    h.color = color;
    this.highlightsChanged();
  }

  // Clic sobre la página en modo resaltar: si cae sobre un resaltado, muestra sus opciones.
  hitHighlight(e, holder) {
    const layer = holder.querySelector('.text-layer');
    if (!layer) return;
    const L = layer.getBoundingClientRect();
    const x = (e.clientX - L.left) / L.width, y = (e.clientY - L.top) / L.height;
    const page = +layer.dataset.page;
    const hit = (this.book.highlights || []).find((h) => h.page === page && h.rects.some(([rx, ry, rw, rh]) => x >= rx && x <= rx + rw && y >= ry - 0.004 && y <= ry + rh + 0.004));
    if (hit) this.showPop(hit, e.clientX, e.clientY);
    else this.hidePop();
  }

  showPop(h, x, y) {
    const pop = $('#hlPop');
    pop.dataset.id = h.id;
    pop.querySelectorAll('.hl-dot').forEach((d) => d.classList.toggle('on', d.dataset.color === h.color));
    pop.hidden = false;
    const w = pop.offsetWidth, hh = pop.offsetHeight;
    pop.style.left = `${clamp(x - w / 2, 8, innerWidth - w - 8)}px`;
    pop.style.top = `${clamp(y - hh - 14, 8, innerHeight - hh - 8)}px`;
  }

  hidePop() {
    const pop = $('#hlPop');
    if (pop) pop.hidden = true;
  }

  async paintSpread() {
    const v = this.vis(this.s);
    await Promise.all([this.paint(this.pageL, v.left), this.paint(this.pageR, v.right)]);
  }

  prefetch() {
    for (const s of [this.s + 1, this.s - 1, this.s + 2]) {
      if (s < this.minS || s > this.maxS) continue;
      for (const p of this.realPages(s)) this.getCanvas(p);
    }
  }

  // ---------- Abrir / cerrar ----------

  async open(book, blob, coverUrl) {
    this.book = book;
    this.coverUrl = coverUrl;
    const raw = book.format === 'epub' ? await openEpub(blob) : await openPdf(blob);
    // Libros que todavía no se revisaron: ¿cada hoja trae dos páginas? Si es así, se dividen y se pasan
    // la página, la cinta y los resaltados guardados a la nueva numeración.
    let changed = false;
    if (!book.sheet) {
      const v = (await raw.getPage(1)).getViewport({ scale: 1 });
      book.sheet = { w: v.width, h: v.height };
      changed = true;
    }
    if (book.split === undefined) {
      const s = await detectTwoUp(raw).catch(() => false);
      remapBook(book, false, s);
      book.split = s;
      changed = true;
    }
    // Encuadre de libro: se mide una vez por libro (salvo que se haya pedido el original del PDF).
    if (book.frame === undefined && !book.noFrame) {
      const f = await frameOf(raw, book.split).catch(() => null);
      remapFrame(book, null, f);
      book.frame = f || null;
      changed = true;
    }
    if (changed) {
      book.pageAspect = pageAspectOf(book);
      this.onSave?.(book);
    }
    this.raw = raw;
    // texto reconocido (OCR) de las páginas escaneadas, si ya se hizo
    this.ocr = book.format === 'epub' ? new Map() : await loadOcr(book.id);
    this.paperState = {}; // tono del papel de este PDF, igual para todas sus páginas
    this.useDoc();
    this.N = this.pdf.numPages;
    this.aspect = this.flatAspect() || book.pageAspect || book.aspect || 0.66;
    this.zoomIdx = 0;
    this.cache.clear();
    this.textCache = new Map();
    this.outlineP = null;
    this.lastActivity = Date.now();
    this.hlRev = (this.hlRev || 0) + 1;
    this.applyTheme();
    this.layout();
    const start = book.bookmark ?? book.lastPage ?? 1;
    this.s = clamp(this.spreadOf(start), this.minS, this.maxS);
    this.updateEdges();

    this.bk.classList.add('no-anim');
    this.bk.classList.toggle('closed', !this.flat);
    this.bk.classList.toggle('opened', this.flat);
    this.cover.getAnimations().forEach((a) => a.cancel());
    this.cover.style.display = this.flat ? 'none' : 'block';
    this.ribbon.style.display = 'none';
    this.updateRibbon(false);
    this.updateUI();
    this.updateFlatButton();
    this.el.classList.add('open');
    this.stage.scrollTo(0, 0);
    await frame();
    this.bk.classList.remove('no-anim');
    this.el.classList.add('visible');
    this.isOpen = true;
    this.busy = true;

    const v = this.vis(this.s);
    if (this.flat) {
      await this.paintSpread();
      this.flatEnter(true);
      this.showFlatExit(5000);
    } else {
      await Promise.all([this.paintSpread(), this.paint(this.coverPage, this.double ? v.left : null)]);
      await wait(380);
      await this.openCover();
    }
    this.busy = false;
    this.updateRibbon(false);
    this.prefetch();
    this.showUI();
    // un libro de una sola hoja (o abierto ya en la última) también cuenta como terminado
    if (this.s >= this.maxS) this.onFinish?.(this.book);
    this.runPendingRelayout();
    // ¿libro escaneado? (se revisa una vez por libro) Se ofrece reconocer el texto.
    if (book.format !== 'epub' && !this.ocr.size && book.scanned === undefined) {
      isScanned(raw)
        .then((s) => {
          book.scanned = s;
          this.onSave?.(book);
          if (s && this.book === book) this.onScanned?.(book);
        })
        .catch(() => {});
    }
  }

  // Llegó texto reconocido (OCR) para el libro abierto: se usa enseguida.
  applyOcr(bookId, pages) {
    if (!this.isOpen || this.book?.id !== bookId || this.book.format === 'epub') return;
    this.ocr = new Map(pages);
    this.useDoc();
    this.textCache = new Map();
    if (this.hlMode) this.buildTextLayers();
  }

  // La opacidad se anima en las caras y no en el contenedor: en Chrome, animar la opacidad
  // de un elemento con preserve-3d lo aplana y deja ver el reverso de las caras.
  fadeFaces(el, keyframes, opts) {
    return [...el.children].map((face) => face.animate(keyframes, opts));
  }

  async openCover() {
    const T = this.T;
    this.bk.classList.remove('closed');
    sound.flip(true);
    const opts = { duration: 1250, easing: 'cubic-bezier(.45,.05,.3,1)', fill: 'forwards' };
    const a = this.cover.animate(
      [
        { transform: `translateZ(${T}px) rotateY(0deg)` },
        { transform: `translateZ(${T * 0.6 + 24}px) rotateY(-95deg)`, offset: 0.5 },
        { transform: `translateZ(1px) rotateY(-180deg)` },
      ],
      opts
    );
    const fades = this.double ? [] : this.fadeFaces(this.cover, [{ opacity: 1 }, { opacity: 1, offset: 0.6 }, { opacity: 0 }], opts);
    setTimeout(() => this.bk.classList.add('opened'), 600);
    await a.finished;
    this.cover.style.display = 'none';
    [a, ...fades].forEach((x) => x.cancel());
  }

  async close() {
    if (!this.isOpen || this.closing) return;
    // En modo enfoque no se sale del libro sin soltar el candado.
    if (this.focus) return this.toast?.('Mantén apretado el candado para salir del modo enfoque', 3000);
    this.closing = true;
    this.stopSpeaking();
    while (this.busy) await wait(50);
    if (this.hlMode) await this.setHighlightMode(false);
    this.hideUI(true);
    this.flushSave();
    if (document.fullscreenElement) document.exitFullscreen?.().catch(() => {});
    if (this.flat) {
      // en hoja completa no hay tapa que cerrar: la página se desvanece y vuelve la biblioteca
      this.el.classList.remove('visible');
      this.onClose?.();
      await wait(500);
      this.el.classList.remove('open');
      this.release();
      return;
    }
    const v = this.vis(this.s);
    await this.paint(this.coverPage, this.double ? v.left : null);
    this.ribbon.style.display = 'none';
    this.cover.style.display = 'block';
    const T = this.T;
    const opts = { duration: 1050, easing: 'cubic-bezier(.45,.05,.3,1)', fill: 'forwards' };
    const a = this.cover.animate(
      [
        { transform: `translateZ(1px) rotateY(-180deg)` },
        { transform: `translateZ(${T * 0.6 + 24}px) rotateY(-85deg)`, offset: 0.5 },
        { transform: `translateZ(${T}px) rotateY(0deg)` },
      ],
      opts
    );
    const fades = this.double ? [] : this.fadeFaces(this.cover, [{ opacity: 0 }, { opacity: 1, offset: 0.4 }, { opacity: 1 }], opts);
    this.stage.scrollTo({ left: 0, top: 0, behavior: 'smooth' });
    setTimeout(() => this.bk.classList.remove('opened'), 520);
    this.bk.classList.add('closed');
    sound.flip(true);
    await a.finished;
    this.updateRibbon(false);
    await wait(250);
    this.el.classList.remove('visible');
    this.onClose?.();
    await wait(500);
    this.el.classList.remove('open');
    [a, ...fades].forEach((x) => x.cancel());
    this.cover.style.display = 'none';
    this.release();
  }

  // Libera el documento, las páginas dibujadas y el texto (al cerrar el libro).
  release() {
    this.textMode?.close({ silent: true });
    this.pdf?.destroy();
    this.pdf = null;
    this.raw = null;
    for (const pr of this.cache.values()) pr.then(freeCanvas, () => {});
    this.cache.clear();
    this.textCache = new Map();
    for (const h of [this.pageL, this.pageR, this.leafFront, this.leafBack, this.coverPage]) {
      freeCanvas(h.querySelector('.content canvas'));
      h._key = null;
    }
    this.isOpen = false;
    this.closing = false;
  }

  // Datos del libro editados mientras está abierto.
  refreshBook(coverUrl) {
    this.coverUrl = coverUrl;
    this.applyTheme();
    this.updateRibbon(false);
  }

  // ---------- Pasar hojas ----------

  async go(target) {
    if (!this.isOpen || this.busy || this.closing) return;
    target = clamp(target, this.minS, this.maxS);
    if (target === this.s) return;
    const dir = target > this.s ? 1 : -1;
    if (this.flat) return this.flatGo(target, dir);
    this.busy = true;
    const cur = this.vis(this.s);
    const nxt = this.vis(target);
    const leaf = this.leaf;
    const front = this.leafFront;
    const back = this.leafBack;
    const side = (el, s) => {
      el.classList.toggle('as-left', s === 'left');
      el.classList.toggle('as-right', s === 'right');
    };
    this.ribbon.style.display = 'none';
    this.tail.classList.add('hidden');
    this.clearTextLayers();
    this.hidePop();

    let under, landing, deg, opacity = null;
    if (this.double) {
      if (dir > 0) {
        leaf.className = 'leaf on-right';
        side(front, 'right');
        side(back, 'left');
        await Promise.all([this.paint(front, cur.right), this.paint(back, nxt.left), this.getCanvas(nxt.right)]);
        leaf.style.display = 'block';
        await this.paint(this.pageR, nxt.right);
        under = this.pageR;
        landing = this.pageL;
        deg = -180;
      } else {
        leaf.className = 'leaf on-left';
        side(front, 'left');
        side(back, 'right');
        await Promise.all([this.paint(front, cur.left), this.paint(back, nxt.right), this.getCanvas(nxt.left)]);
        leaf.style.display = 'block';
        await this.paint(this.pageL, nxt.left);
        under = this.pageL;
        landing = this.pageR;
        deg = 180;
      }
    } else {
      leaf.className = 'leaf on-right';
      side(front, 'right');
      side(back, 'left');
      if (dir > 0) {
        await Promise.all([this.paint(front, cur.right), this.paint(back, null), this.getCanvas(nxt.right)]);
        leaf.style.display = 'block';
        await this.paint(this.pageR, nxt.right);
        deg = -180;
        opacity = [1, 1, 0];
      } else {
        await Promise.all([this.paint(front, nxt.right), this.paint(back, null)]);
        leaf.style.display = 'block';
        deg = 180;
        opacity = [0, 1, 1];
      }
      under = this.pageR;
    }

    const lift = Math.min(70, this.pw * 0.09);
    const from = !this.double && dir < 0 ? -180 : 0;
    const to = !this.double && dir < 0 ? 0 : deg;
    const kf = [
      { transform: `translateZ(1px) rotateY(${from}deg)` },
      { transform: `translateZ(${lift}px) rotateY(${(from + to) / 2}deg)`, offset: 0.5 },
      { transform: `translateZ(1px) rotateY(${to}deg)` },
    ];
    const opts = { duration: FLIP_MS, easing: 'cubic-bezier(.4,.1,.3,1)', fill: 'forwards' };
    const anims = [
      leaf.animate(kf, opts),
      ...(opacity ? this.fadeFaces(leaf, opacity.map((o, i) => ({ opacity: o, offset: [0, 0.5, 1][i] })), opts) : []),
      front.querySelector('.shade').animate([{ opacity: 0 }, { opacity: 0.45, offset: 0.5 }, { opacity: 0.45 }], opts),
      back.querySelector('.shade').animate([{ opacity: 0.45 }, { opacity: 0.45, offset: 0.5 }, { opacity: 0 }], opts),
      under.querySelector('.cast').animate([{ opacity: 0.55 }, { opacity: 0 }], opts),
    ];
    if (landing) anims.push(landing.querySelector('.cast').animate([{ opacity: 0 }, { opacity: 0, offset: 0.5 }, { opacity: 0.4, offset: 0.88 }, { opacity: 0 }], opts));
    sound.flip();
    await anims[0].finished;

    if (this.double) {
      if (dir > 0) await this.paint(this.pageL, nxt.left);
      else await this.paint(this.pageR, nxt.right);
    } else if (dir < 0) {
      await this.paint(this.pageR, nxt.right);
    }
    leaf.style.display = 'none';
    anims.forEach((a) => a.cancel());
    this.s = target;
    this.busy = false;
    this.afterMove();
    this.runPendingRelayout();
  }

  // Hoja completa: la página nueva entra deslizándose un poco desde el lado hacia el que se avanza.
  async flatGo(target, dir) {
    this.busy = true;
    this.clearTextLayers();
    this.hidePop();
    const nxt = this.vis(target);
    await Promise.all(this.realPages(target).map((p) => this.getCanvas(p)));
    await Promise.all([this.paint(this.pageL, nxt.left), this.paint(this.pageR, nxt.right)]);
    sound.flip();
    const kf = [{ opacity: 0.35, transform: `translateX(${dir * 28}px)` }, { opacity: 1, transform: 'none' }];
    const opts = { duration: 260, easing: 'cubic-bezier(.2,.7,.3,1)' };
    const anims = [this.pageL, this.pageR].map((h) => h.querySelector('.content').animate(kf, opts));
    this.s = target;
    await anims[1].finished.catch(() => {});
    this.busy = false;
    this.afterMove();
    this.runPendingRelayout();
  }

  flatEnter(animate) {
    if (!animate) return;
    const kf = [{ opacity: 0, transform: 'scale(0.985)' }, { opacity: 1, transform: 'none' }];
    for (const h of [this.pageL, this.pageR]) h.animate(kf, { duration: 450, easing: 'ease-out' });
  }

  // El documento según el modo: en hoja completa, con el encuadre de lectura (casi sin márgenes).
  useDoc() {
    const b = this.book;
    const frame = b.noFrame ? null : b.frame;
    this.readFrame = this.flat && frame ? readingFrame(frame) : null;
    this.pdf = bookDoc(b.format === 'epub' ? this.raw : withOcr(this.raw, this.ocr), { split: b.split, frame: this.readFrame || frame });
    this.N = this.pdf.numPages;
  }

  flatAspect() {
    const f = this.flat && !this.book.noFrame && this.book.frame && readingFrame(this.book.frame);
    return f ? f.odd[2] / f.odd[3] : 0;
  }

  // Los resaltados se guardan respecto de la página del libro; en hoja completa se pasan al encuadre de lectura.
  hlRect(p, r) {
    if (!this.readFrame || !this.book.sheet) return r;
    const { w: W, h: H } = this.book.sheet;
    const a = boxFor(p, this.book.split, this.book.frame, W, H), b = boxFor(p, this.book.split, this.readFrame, W, H);
    const [x, y, w, h] = r;
    return [(a[0] + x * a[2] - b[0]) / b[2], (a[1] + y * a[3] - b[1]) / b[3], (w * a[2]) / b[2], (h * a[3]) / b[3]];
  }

  // Alterna entre el libro 3D y la hoja completa. En la computadora y el iPad también pide la pantalla
  // completa del navegador (el iPhone no la permite; instalada en la pantalla de inicio ya va sin barras).
  async setFlat(on) {
    if (!this.isOpen || this.closing || this.flatSwitching) return;
    // la pantalla completa del navegador se pide enseguida (tiene que ser dentro del toque) y sin esperarla:
    // en algunos navegadores la promesa no termina nunca
    const fs = document.documentElement.requestFullscreen && document.fullscreenEnabled;
    if (on && fs && !document.fullscreenElement) document.documentElement.requestFullscreen({ navigationUI: 'hide' }).catch(() => {});
    if (!on && document.fullscreenElement) document.exitFullscreen().catch(() => {});
    // si justo está pasando una hoja, se espera a que termine (en vez de ignorar el toque)
    this.flatSwitching = true;
    while (this.busy) await wait(40);
    this.flatSwitching = false;
    if (on && this.hlMode) await this.setHighlightMode(false);
    this.flat = on;
    prefs.set('bib.flat', on ? '1' : '0');
    this.el.classList.toggle('flat', on);
    this.updateFlatButton();
    this.hidePop();
    // otro encuadre: el documento, las páginas guardadas y la proporción cambian
    const keep = this.realPages(this.s)[0] ?? 1;
    this.useDoc();
    this.cache.clear();
    this.textCache = new Map();
    this.hlRev = (this.hlRev || 0) + 1;
    this.aspect = this.flatAspect() || this.book.pageAspect || this.book.aspect || 0.66;
    this.s = clamp(this.spreadOf(keep), this.minS, this.maxS);
    this.zoomIdx = 0;
    this.bk.classList.add('no-anim');
    this.bk.classList.remove('closed');
    this.bk.classList.add('opened');
    this.cover.style.display = 'none';
    await this.relayout();
    await frame();
    this.bk.classList.remove('no-anim');
    this.flatEnter(on);
    this.showUI();
    if (on) this.showFlatExit(5000);
    const tips = +prefs.get('bib.flatTips') || 0;
    if (on && tips < 3) prefs.set('bib.flatTips', String(tips + 1));
    if (on && tips < 3) this.toast?.(matchMedia('(pointer: coarse)').matches ? 'Toca el medio de la pantalla para ver las opciones; los bordes pasan de hoja' : 'Tecla F (o mover el ratón y tocar «Salir») para volver al libro', 4000);
  }

  updateFlatButton() {
    const btn = $('#rFlat');
    if (!btn) return;
    btn.classList.toggle('active', this.flat);
    btn.title = this.flat ? 'Volver a ver el libro en 3D (F)' : 'Leer con la hoja a pantalla completa (F)';
    btn.innerHTML = (this.flat ? FLAT_ICON.book : FLAT_ICON.full) + `<span>${this.flat ? 'Libro 3D' : 'Pantalla completa'}</span>`;
  }

  next() {
    this.go(this.s + 1);
  }
  prev() {
    this.go(this.s - 1);
  }
  goToPage(p) {
    this.go(this.spreadOf(clamp(p, 1, this.N)));
  }

  afterMove() {
    this.lastActivity = Date.now();
    if (this.zoomIdx > 0) this.scrollToText();
    if (this.focus) this.realPages(this.s).forEach((p) => this.focus.pages.add(p));
    // Si se pasó de hoja a mano mientras leía en voz alta, sigue leyendo desde la nueva página.
    if (this.speaking && !this.speechTurning) this.speakSpread();
    if (this.s >= this.maxS) this.onFinish?.(this.book);
    if (this.hlMode) this.buildTextLayers();
    this.updateEdges();
    this.updateRibbon(false);
    this.updateUI();
    this.prefetch();
    this.book.lastPage = this.realPages(this.s)[0] ?? (this.s <= this.minS ? 1 : this.N);
    clearTimeout(this.saveT);
    this.saveT = setTimeout(() => this.flushSave(), 700);
  }

  flushSave() {
    clearTimeout(this.saveT);
    if (this.book) this.onSave?.(this.book);
  }

  // Página visible y total, para el índice y el porcentaje leído.
  position() {
    const page = this.realPages(this.s)[0] ?? (this.s <= this.minS ? 1 : this.N);
    return { page, N: this.N };
  }

  // Índice de capítulos que trae el PDF (hasta tres niveles), con la página de cada uno.
  outline() {
    if (!this.pdf) return Promise.resolve([]);
    const pdf = this.pdf;
    this.outlineP ??= (async () => {
      const out = [];
      const walk = async (items, depth) => {
        for (const it of items || []) {
          if (out.length > 500) return;
          let page = null;
          try {
            let dest = it.dest;
            if (typeof dest === 'string') dest = await pdf.getDestination(dest);
            if (Array.isArray(dest) && dest[0] != null) {
              page = typeof dest[0] === 'number' ? (pdf.toVirtual ? pdf.toVirtual(dest[0]) : dest[0]) + 1 : (await pdf.getPageIndex(dest[0])) + 1;
              const left = typeof dest[2] === 'number' ? dest[2] : null;
              if (pdf.split && left != null && this.book.sheet && left > this.book.sheet.w * pdf.split) page += 1;
            }
          } catch {
            /* destino roto: el capítulo queda sin página */
          }
          const title = (it.title || '').replace(/\s+/g, ' ').trim();
          if (title && page) out.push({ title, page, depth });
          if (depth < 2) await walk(it.items, depth + 1);
        }
      };
      await walk(await pdf.getOutline().catch(() => null), 0);
      return out;
    })();
    return this.outlineP;
  }

  // Papel: de día, sepia (más cálido) o de noche (letras claras sobre fondo oscuro).
  // ---------- Modo texto ----------

  openText() {
    if (!this.isOpen || this.busy || this.closing || this.focus) return;
    if (this.speaking) this.stopSpeaking();
    if (this.hlMode) this.setHighlightMode(false);
    this.textMode ??= new TextMode({
      onClose: (p) => {
        this.lastActivity = Date.now();
        if (this.isOpen && p !== this.position().page) this.go(this.spreadOf(clamp(p, 1, this.N)));
      },
      onProgress: (p) => {
        this.lastActivity = Date.now();
        if (!this.book) return;
        this.book.lastPage = p;
        clearTimeout(this.saveT);
        this.saveT = setTimeout(() => this.flushSave(), 900);
        if (p >= this.N) this.onFinish?.(this.book);
      },
      onDefine: (w) => this.onDefine?.(w),
      onPaper: () => this.setPaper({ day: 'sepia', sepia: 'night', night: 'day' }[this.paper]),
      toast: (t) => this.toast?.(t),
    });
    const lang = (this.pdf.book?.language || this.book.lang || '').slice(0, 2) || (navigator.language || 'es').slice(0, 2);
    this.textMode.open({ doc: this.pdf, book: this.book, page: this.position().page, paper: this.paper, lang });
  }

  setPaper(mode) {
    this.paper = ['day', 'sepia', 'night'].includes(mode) ? mode : 'day';
    prefs.set('bib.paper', this.paper);
    this.el.dataset.paper = this.paper;
    this.textMode?.setPaper(this.paper);
    const btn = $('#rPaper');
    if (btn) {
      const label = { day: 'Día', sepia: 'Sepia', night: 'Noche' }[this.paper];
      btn.querySelector('span').textContent = label;
      btn.title = `Papel: ${label} (cambia entre día, sepia y noche)`;
    }
  }

  // ---------- Modo enfoque ----------
  // Sólo el libro: pasar hojas, la cinta, resaltar y escuchar. Para salir hay que mantener apretado el candado
  // dos segundos; si la sesión tiene tiempo, termina sola. Al terminar se avisa con un resumen.

  startFocus(minutes) {
    if (!this.isOpen) return;
    const first = this.realPages(this.s);
    this.focus = { start: Date.now(), end: minutes ? Date.now() + minutes * 60e3 : null, pages: new Set(first), base: first.length, seconds: 0 };
    this.el.classList.add('focus');
    this.tickFocus();
    clearInterval(this.focusT);
    this.focusT = setInterval(() => this.tickFocus(), 1000);
    this.showUI();
  }

  tickFocus() {
    const f = this.focus;
    if (!f) return;
    const now = Date.now();
    const sec = Math.max(0, Math.round(((f.end ?? now) - (f.end ? now : f.start)) / 1000));
    $('#focusTime').textContent = `${Math.floor(sec / 60)}:${String(sec % 60).padStart(2, '0')}`;
    if (f.end && now >= f.end) this.endFocus('time');
  }

  endFocus(reason) {
    const f = this.focus;
    if (!f) return;
    this.focus = null;
    clearInterval(this.focusT);
    this.el.classList.remove('focus');
    this.onFocusEnd?.({ reason, seconds: f.seconds, pages: Math.max(0, f.pages.size - f.base), minutes: Math.round((Date.now() - f.start) / 60e3) });
  }

  // ---------- Leer en voz alta ----------

  // Texto de una página, con los cortes de palabra con guion unidos.
  async pageText(p) {
    const { tc } = await this.getText(p);
    return tc.items
      .map((it) => it.str + (it.hasEOL ? '\n' : ' '))
      .join('')
      .replace(/(\p{L})-\s*\n\s*(\p{L})/gu, '$1$2')
      .replace(/\s+/g, ' ')
      .trim();
  }

  // Idioma del libro: español salvo que el texto sea claramente inglés.
  speechLang(text) {
    const words = text.toLowerCase().split(/\s+/).slice(0, 400);
    const count = (list) => words.filter((w) => list.includes(w)).length;
    const en = count(['the', 'and', 'of', 'to', 'is', 'that', 'with', 'was', 'for', 'it']);
    const es = count(['el', 'la', 'de', 'que', 'y', 'los', 'las', 'en', 'con', 'por', 'una']);
    return en > es * 1.3 ? 'en' : 'es';
  }

  toggleSpeech() {
    if (this.speaking) return this.stopSpeaking();
    if (!('speechSynthesis' in window)) return this.toast?.('Este navegador no puede leer en voz alta.', 4000);
    this.speaking = true;
    $('#rListen').classList.add('active');
    this.speakSpread();
  }

  stopSpeaking() {
    if (!this.speaking) return;
    this.speaking = false;
    this.speakTok = (this.speakTok || 0) + 1;
    window.speechSynthesis?.cancel();
    $('#rListen').classList.remove('active');
  }

  async speakSpread() {
    const tok = (this.speakTok = (this.speakTok || 0) + 1);
    speechSynthesis.cancel();
    let text = '';
    for (const p of this.realPages(this.s)) text += ' ' + (await this.pageText(p).catch(() => ''));
    if (tok !== this.speakTok || !this.speaking) return;
    text = text.trim();
    if (!text) {
      this.emptySpreads = (this.emptySpreads || 0) + 1;
      if (this.emptySpreads >= 2) {
        this.stopSpeaking();
        return this.toast?.('Estas páginas no tienen texto para leer en voz alta (parecen escaneadas).', 4500);
      }
      return this.afterSpoken(tok);
    }
    this.emptySpreads = 0;
    // El idioma elegido para este libro (Sonido › Idioma del libro) o, si no, el que se detecta en el texto.
    const lang = ['es', 'en'].includes(this.book.speechLang) ? this.book.speechLang : this.speechLang(text);
    prefs.set('bib.lastLang', lang);
    const voice = voiceFor(lang);
    // Frases cortas: los teléfonos cortan los textos muy largos.
    const chunks = text.match(/[^.!?;:]+[.!?;:]*\s*/g)?.flatMap((c) => (c.length > 220 ? c.match(/.{1,200}(\s|$)/g) || c.match(/.{1,200}/g) : [c])) || [text];
    chunks.forEach((c, i) => {
      const u = new SpeechSynthesisUtterance(c.trim());
      u.lang = voice?.lang || (lang === 'en' ? 'en-US' : 'es-ES');
      if (voice) u.voice = voice;
      u.rate = speechRate();
      u.onstart = () => (this.lastActivity = Date.now());
      if (i === chunks.length - 1) u.onend = u.onerror = () => this.afterSpoken(tok);
      speechSynthesis.speak(u);
    });
  }

  // Cambió la voz o la velocidad mientras leía: retoma la página con la nueva.
  restartSpeech() {
    if (this.speaking) this.speakSpread();
  }

  async afterSpoken(tok) {
    if (tok !== this.speakTok || !this.speaking) return;
    if (this.s >= this.maxS) return this.stopSpeaking();
    this.speechTurning = true;
    await this.go(this.s + 1);
    this.speechTurning = false;
    if (this.speaking) this.speakSpread();
  }

  // ---------- La cinta ----------

  ribbonHere() {
    const bm = this.book?.bookmark;
    if (bm == null) return null;
    const v = this.vis(this.s);
    if (bm === v.right) return 'right';
    if (bm === v.left) return 'left';
    return null;
  }

  updateRibbon(drop) {
    const where = this.ribbonHere();
    const bm = this.book?.bookmark;
    $('#rRibbon').classList.toggle('active', !!where);
    if (where && this.isOpen && !this.bk.classList.contains('closed')) {
      const rw = parseFloat(this.bk.style.getPropertyValue('--rw')) || 16;
      // Cerca del lomo y apenas inclinada, como queda una cinta real sobre la hoja.
      const x = where === 'right' ? this.rightX + this.pw * 0.012 : this.spineX - this.pw * 0.012 - rw;
      this.ribbon.style.left = `${x}px`;
      this.ribbon.style.transform = `translateZ(3px) rotate(${where === 'right' ? -1.2 : 1.2}deg)`;
      this.ribbon.style.display = 'block';
      this.tail.classList.add('hidden');
      if (drop) {
        this.ribbonBody.animate(
          [
            { transform: 'translateY(-100%)' },
            { transform: 'translateY(2.5%)', offset: 0.68 },
            { transform: 'translateY(-1%)', offset: 0.84 },
            { transform: 'translateY(0)' },
          ],
          { duration: 950, easing: 'cubic-bezier(.3,.7,.4,1)' }
        );
        setTimeout(() => sound.ping(), 600);
      }
    } else {
      this.ribbon.style.display = 'none';
      this.tail.classList.remove('hidden');
      this.tail.classList.toggle('elsewhere', bm != null);
      this.tail.title = bm != null ? `Ir a la cinta (página ${bm})` : 'Marcar esta página con la cinta';
    }
  }

  async toggleRibbon() {
    if (!this.isOpen || this.busy || this.closing) return;
    const where = this.ribbonHere();
    if (where) {
      const a = this.ribbonBody.animate([{ transform: 'translateY(0)' }, { transform: 'translateY(-100%)' }], { duration: 480, easing: 'cubic-bezier(.5,0,.75,0)', fill: 'forwards' });
      await a.finished;
      this.book.bookmark = null;
      this.updateRibbon(false);
      a.cancel();
      this.flushSave();
      this.toast?.('Cinta retirada');
      return;
    }
    const pages = this.realPages(this.s);
    if (!pages.length) return;
    const v = this.vis(this.s);
    this.book.bookmark = pages.includes(v.right) ? v.right : pages[0];
    this.updateRibbon(true);
    this.flushSave();
  }

  tailClick() {
    const bm = this.book?.bookmark;
    if (bm != null && !this.ribbonHere()) this.goToPage(bm);
    else this.toggleRibbon();
  }

  // Barra junto a la selección: «Resaltar», y «Definir» cuando es una sola palabra.
  showSelBar(word) {
    const bar = $('#selBar');
    const r = this.savedRange.getBoundingClientRect();
    $('#hlApply').style.setProperty('--c', (HL_COLORS[prefs.get('bib.hlColor') || 'yellow'] || HL_COLORS.yellow).dot);
    $('#hlDefine').hidden = !word;
    $('#hlDefine').dataset.word = word || '';
    bar.hidden = false;
    const w = bar.offsetWidth, h = bar.offsetHeight;
    // Debajo de la selección para no tapar el menú propio del iPhone, que aparece arriba.
    const below = r.bottom + 14 + h < innerHeight - 80;
    bar.style.left = `${clamp(r.left + r.width / 2 - w / 2, 8, innerWidth - w - 8)}px`;
    bar.style.top = `${below ? r.bottom + 14 : Math.max(8, r.top - h - 54)}px`;
  }

  // ---------- Barra de herramientas ----------

  updateUI() {
    const pages = this.realPages(this.s);
    const first = pages[0] ?? (this.s <= this.minS ? 1 : this.N);
    $('#rPageInput').value = first;
    $('#rPageInput').max = this.N;
    $('#rPageTotal').textContent = pages.length === 2 ? `–${pages[1]} de ${this.N}` : `de ${this.N}`;
    const scrub = $('#rScrub');
    scrub.max = this.N;
    scrub.value = first;
    scrub.style.setProperty('--p', `${((first - 1) / Math.max(1, this.N - 1)) * 100}%`);
    $('#rPrev').disabled = this.s <= this.minS;
    $('#rNext').disabled = this.s >= this.maxS;
    const levels = this.zoomLevels || [1];
    const z = levels[this.zoomIdx] || 1;
    $('#rZoomOut').disabled = this.zoomIdx === 0;
    $('#rZoomIn').disabled = this.zoomIdx === levels.length - 1;
    const label = $('#rZoomLabel');
    label.textContent = this.zoomIdx === 0 ? 'Ajustar' : z === this.zoomWidth ? 'Ancho' : z === this.zoomText ? 'Texto' : `${Math.round(z * 100)} %`;
    label.disabled = this.zoomIdx === 0;
    $('#rMode').textContent = this.double ? 'Doble página' : 'Una página';
    this.bk.classList.toggle('zoomed', this.zoomIdx > 0);
  }

  async relayout() {
    if (!this.isOpen) return;
    if (this.busy || this.closing) {
      this.relayoutPending = true;
      return;
    }
    const keepPage = this.realPages(this.s)[0] ?? 1;
    this.layout();
    this.s = clamp(this.spreadOf(keepPage), this.minS, this.maxS);
    this.updateEdges();
    this.clearTextLayers();
    this.hidePop();
    await this.paintSpread();
    if (this.hlMode) this.buildTextLayers();
    this.updateRibbon(false);
    this.updateUI();
    this.prefetch();
  }

  // Cambia el zoom sin perder el lugar: desde «entera» va al principio de la página, centrado;
  // entre otros niveles mantiene en el centro lo que estabas mirando.
  runPendingRelayout() {
    if (!this.relayoutPending) return;
    this.relayoutPending = false;
    this.relayout();
  }

  setZoom(i) {
    if (this.busy) return;
    const next = clamp(i, 0, (this.zoomLevels || [1]).length - 1);
    if (next === this.zoomIdx) return;
    const st = this.stage;
    const from = this.zoomIdx;
    const rx = (st.scrollLeft + st.clientWidth / 2) / st.scrollWidth;
    const ry = (st.scrollTop + st.clientHeight / 2) / st.scrollHeight;
    this.zoomIdx = next;
    this.relayout(); // las medidas nuevas se aplican enseguida; las páginas se redibujan después
    if (next === 0) return st.scrollTo(0, 0);
    const z = this.zoomLevels[next];
    if (z === this.zoomText || z === this.zoomWidth || from === 0) this.scrollToText();
    else {
      st.scrollLeft = rx * st.scrollWidth - st.clientWidth / 2;
      st.scrollTop = ry * st.scrollHeight - st.clientHeight / 2;
    }
    this.showUI();
  }

  // Con zoom: el texto centrado a lo ancho y el principio del bloque de texto arriba de la pantalla.
  scrollToText() {
    const st = this.stage;
    const S = st.getBoundingClientRect();
    const P = (this.double ? this.pageL : this.pageR).getBoundingClientRect();
    const top = P.top - S.top + st.scrollTop;
    st.scrollLeft = (st.scrollWidth - st.clientWidth) / 2;
    st.scrollTop = Math.max(0, top + this.ph * (this.book.frame ? 0.065 : 0.045) - 14);
  }

  cycleMode() {
    if (this.busy) return;
    this.mode = this.double ? 'single' : 'double';
    prefs.set('bib.mode', this.mode);
    this.relayout();
  }

  showUI() {
    // en hoja completa nada aparece solo (ni al pasar de página): las barras están escondidas
    if (this.flat) return this.el.classList.add('ui-hidden');
    this.el.classList.remove('ui-hidden');
    clearTimeout(this.uiT);
    this.uiT = setTimeout(() => {
      // Con el resaltador activo la barra queda a la vista para cambiar de color.
      if (this.hlMode) return;
      if (!this.el.querySelector('.reader-bar:hover, .reader-top:hover, input:focus')) this.el.classList.add('ui-hidden');
    }, 2800);
  }

  // En hoja completa no se muestran las barras: sólo, por un momento, el botón para salir.
  showFlatExit(ms = 4000) {
    this.el.classList.add('ui-hidden');
    const bar = $('#flatExit');
    bar.classList.add('show');
    clearTimeout(this.flatExitT);
    // con el ratón encima no se esconde; con el dedo no se mira :hover (el iPhone lo deja «pegado» tras tocar)
    this.flatExitT = setTimeout(() => (this.lastPointer !== 'mouse' || !bar.matches(':hover')) && bar.classList.remove('show'), ms);
  }

  toggleFlatExit() {
    const bar = $('#flatExit');
    if (bar.classList.contains('show')) {
      clearTimeout(this.flatExitT);
      bar.classList.remove('show');
    } else this.showFlatExit();
  }

  hideUI() {
    clearTimeout(this.uiT);
    this.el.classList.add('ui-hidden');
  }

  bind() {
    const typing = () => /INPUT|SELECT|TEXTAREA/.test(document.activeElement?.tagName || '') && document.activeElement.type !== 'range';
    document.addEventListener('keydown', (e) => {
      if (!this.isOpen || this.closing || document.querySelector('.modal-backdrop') || this.textMode?.isOpen) return;
      if (typing()) return;
      const k = e.key;
      if (k === 'ArrowRight' || k === 'PageDown' || k === ' ') this.next();
      else if (k === 'ArrowLeft' || k === 'PageUp') this.prev();
      else if (k === 'Home') this.go(this.minS);
      else if (k === 'End') this.go(this.maxS);
      else if (k === 'b' || k === 'B' || k === 'm' || k === 'M') this.toggleRibbon();
      else if (k === 'h' || k === 'H') this.setHighlightMode(!this.hlMode);
      else if (k === 'Escape' && this.hlMode) this.setHighlightMode(false);
      else if (k === 'Escape' && this.flat) this.setFlat(false);
      else if (k === 'Escape' && !this.focus) this.close();
      else if (k === 'f' || k === 'F') this.setFlat(!this.flat);
      else if (k === 't' || k === 'T') this.openText();
      else if (k === '+' || k === '=') this.setZoom(this.zoomIdx + 1);
      else if (k === '-') this.setZoom(this.zoomIdx - 1);
      else return;
      e.preventDefault();
      this.lastActivity = Date.now();
      this.showUI();
    });

    // En modo resaltar, un clic en la página no pasa la hoja: selecciona o edita resaltados.
    const hlClick = (e, holder) => {
      // El clic que cierra una selección no debe abrir el menú de un resaltado.
      if (Date.now() - (this.justHighlighted || 0) > 300) this.hitHighlight(e, holder);
    };
    // Hoja completa: los bordes de la pantalla pasan de hoja y el resto muestra u oculta la barrita para salir.
    const flatTap = (e) => {
      if (this.swiped) return true;
      const k = e.clientX / innerWidth;
      if (k < 0.22) this.prev();
      else if (k > 0.78) this.next();
      else this.toggleFlatExit();
      return true;
    };
    this.pageL.addEventListener('click', (e) => {
      if (this.hlMode) return hlClick(e, this.pageL);
      if (this.flat) return flatTap(e);
      if (!this.swiped) this.prev();
    });
    this.pageR.addEventListener('click', (e) => {
      if (this.hlMode) return hlClick(e, this.pageR);
      if (this.swiped) return;
      if (this.flat) return flatTap(e);
      // En modo una página, el tercio izquierdo vuelve atrás.
      if (!this.double && e.offsetX < this.pw / 3) this.prev();
      else this.next();
    });
    this.tail.addEventListener('click', (e) => {
      e.stopPropagation();
      this.tailClick();
    });

    let down = null;
    this.stage.addEventListener('pointerdown', (e) => {
      down = { x: e.clientX, y: e.clientY, t: Date.now() };
      this.swiped = false;
    });
    this.stage.addEventListener('pointerup', (e) => {
      if (this.hlMode) {
        down = null;
        // Con ratón se resalta al soltar; con el dedo, con el botón «Resaltar» (la selección del
        // iPhone se ajusta con las manijas y no termina al levantar el dedo).
        if (e.pointerType === 'mouse') {
          const sel = window.getSelection();
          const word = sel && !sel.isCollapsed ? singleWord(sel.toString()) : null;
          if (word && sel.anchorNode?.parentElement?.closest?.('.text-layer')) {
            this.savedRange = sel.getRangeAt(0).cloneRange();
            this.showSelBar(word);
          } else if (this.captureSelection()) this.justHighlighted = Date.now();
        }
        return;
      }
      if (!down || this.zoomIdx > 0) return;
      const dx = e.clientX - down.x;
      if (Math.abs(dx) > 60 && Math.abs(dx) > Math.abs(e.clientY - down.y) && Date.now() - down.t < 800) {
        this.swiped = true;
        if (dx < 0) this.next();
        else this.prev();
        setTimeout(() => (this.swiped = false), 50);
      }
      down = null;
    });

    let wheelLock = 0;
    this.stage.addEventListener('wheel', (e) => {
      if (e.ctrlKey) {
        e.preventDefault();
        if (this.isOpen && Math.abs(e.deltaY) > 4 && Date.now() > (this.pinchLock || 0)) {
          this.pinchLock = Date.now() + 350;
          this.setZoom(this.zoomIdx + (e.deltaY < 0 ? 1 : -1));
        }
        return;
      }
      if (!this.isOpen || this.zoomIdx > 0) return;
      e.preventDefault();
      const now = Date.now();
      if (now < wheelLock || Math.abs(e.deltaY) < 8) return;
      wheelLock = now + 650;
      if (e.deltaY > 0) this.next();
      else this.prev();
    }, { passive: false });

    this.el.addEventListener('pointermove', (e) => {
      if (!this.isOpen || this.closing) return;
      this.lastActivity = Date.now();
      if (!this.flat) return this.showUI();
      // con el ratón, moverlo muestra un momento el botón para salir
      if (e.pointerType === 'mouse' && Math.hypot(e.movementX || 0, e.movementY || 0) > 2) this.showFlatExit(2600);
    });
    window.addEventListener('resize', () => {
      clearTimeout(this.resizeT);
      this.resizeT = setTimeout(() => this.relayout(), 150);
    });

    $('#rBack').addEventListener('click', () => this.close());
    $('#rInfo').addEventListener('click', () => this.onEdit?.(this.book));
    $('#rToc').addEventListener('click', () => this.onToc?.());
    $('#rFlat').addEventListener('click', () => this.setFlat(!this.flat));
    $('#rText').addEventListener('click', () => this.openText());
    $('#flatExit').addEventListener('click', (e) => {
      e.stopPropagation();
      const act = e.target.closest('[data-flat]')?.dataset.flat;
      if (!act) return;
      $('#flatExit').classList.remove('show');
      if (act === 'exit') this.setFlat(false);
      else this.close();
    });
    // si se sale de la pantalla completa del navegador (Esc), la hoja completa sigue: sólo se reacomoda
    document.addEventListener('fullscreenchange', () => this.isOpen && this.relayout());
    $('#rFocus').addEventListener('click', () => this.onFocus?.());
    $('#rListen').addEventListener('click', () => this.toggleSpeech());
    // Candado: mantener apretado dos segundos para salir del modo enfoque.
    const lock = $('#focusLock');
    let holdT = null;
    const release = () => {
      clearTimeout(holdT);
      holdT = null;
      lock.classList.remove('holding');
    };
    lock.addEventListener('pointerdown', (e) => {
      e.preventDefault();
      lock.classList.add('holding');
      holdT = setTimeout(() => {
        release();
        this.endFocus('manual');
      }, 2000);
    });
    lock.addEventListener('pointerup', () => {
      if (holdT) this.toast?.('Mantén apretado el candado para salir', 2200);
      release();
    });
    lock.addEventListener('pointerleave', release);
    lock.addEventListener('pointercancel', release);
    lock.addEventListener('contextmenu', (e) => e.preventDefault());
    $('#rPaper').addEventListener('click', () => this.setPaper({ day: 'sepia', sepia: 'night', night: 'day' }[this.paper]));
    $('#rPrev').addEventListener('click', () => this.prev());
    $('#rNext').addEventListener('click', () => this.next());
    $('#rRibbon').addEventListener('click', () => this.toggleRibbon());
    $('#rHighlight').addEventListener('click', () => this.setHighlightMode(!this.hlMode));
    $('#hlBar').addEventListener('click', (e) => {
      const dot = e.target.closest('.hl-dot');
      if (dot) {
        prefs.set('bib.hlColor', dot.dataset.color);
        this.renderHlBar();
      } else if (e.target.closest('#hlList')) this.onHighlights?.(this.book);
      else if (e.target.closest('#hlDone')) this.setHighlightMode(false);
    });
    $('#hlPop').addEventListener('click', (e) => {
      const id = $('#hlPop').dataset.id;
      const dot = e.target.closest('.hl-dot');
      if (dot) this.recolorHighlight(id, dot.dataset.color);
      else if (e.target.closest('[data-act=del]')) this.removeHighlight(id);
      else if (e.target.closest('[data-act=note]')) this.onNote?.((this.book.highlights || []).find((h) => h.id === id));
      else if (e.target.closest('[data-act=share]')) this.onShare?.((this.book.highlights || []).find((h) => h.id === id));
      else return;
      this.hidePop();
    });
    document.addEventListener('pointerdown', (e) => {
      this.lastPointer = e.pointerType;
      if (!e.target.closest('#hlPop, .text-layer')) this.hidePop();
    });
    // Con el dedo: mientras haya texto seleccionado en la página, aparece el botón «Resaltar».
    document.addEventListener('selectionchange', () => {
      const bar = $('#selBar');
      const sel = window.getSelection();
      const inLayer = sel?.anchorNode?.parentElement?.closest?.('.text-layer');
      if (!this.hlMode || this.lastPointer === 'mouse' || !sel || sel.isCollapsed || !inLayer) {
        if (!bar.hidden && !this.applying && this.lastPointer !== 'mouse') bar.hidden = true;
        return;
      }
      this.savedRange = sel.getRangeAt(0).cloneRange();
      this.showSelBar(singleWord(sel.toString()));
    });
    const apply = (e) => {
      e.preventDefault();
      this.applying = true;
      if (this.captureSelection(this.savedRange)) this.justHighlighted = Date.now();
      this.savedRange = null;
      this.applying = false;
    };
    $('#hlApply').addEventListener('pointerdown', apply);
    $('#hlDefine').addEventListener('pointerdown', (e) => {
      e.preventDefault();
      const word = $('#hlDefine').dataset.word;
      $('#selBar').hidden = true;
      window.getSelection()?.removeAllRanges();
      this.savedRange = null;
      if (word) this.onDefine?.(word);
    });
    document.addEventListener('pointerdown', (e) => {
      if (this.lastPointer === 'mouse' && !e.target.closest('#selBar')) $('#selBar').hidden = true;
    });
    $('#rZoomIn').addEventListener('click', () => this.setZoom(this.zoomIdx + 1));
    $('#rZoomOut').addEventListener('click', () => this.setZoom(this.zoomIdx - 1));
    $('#rZoomLabel').addEventListener('click', () => this.setZoom(0));
    $('#rMode').addEventListener('click', () => this.cycleMode());
    $('#rSound').addEventListener('click', () => this.onAmbient?.());
    $('#rPageInput').addEventListener('change', (e) => {
      const p = parseInt(e.target.value, 10);
      if (p > 0) this.goToPage(p);
      e.target.blur();
    });
    const scrub = $('#rScrub');
    scrub.addEventListener('input', () => {
      $('#rPageInput').value = scrub.value;
      scrub.style.setProperty('--p', `${((scrub.value - 1) / Math.max(1, this.N - 1)) * 100}%`);
    });
    scrub.addEventListener('change', () => {
      this.goToPage(parseInt(scrub.value, 10));
      scrub.blur();
    });
  }
}

// Producto de dos matrices de transformación [a, b, c, d, e, f] (como Util.transform de PDF.js).
const mul = (m, n) => [m[0] * n[0] + m[2] * n[1], m[1] * n[0] + m[3] * n[1], m[0] * n[2] + m[2] * n[3], m[1] * n[2] + m[3] * n[3], m[0] * n[4] + m[2] * n[5] + m[4], m[1] * n[4] + m[3] * n[5] + m[5]];

// Vacía un lienzo: el navegador libera su memoria enseguida (importante en el iPhone).
function freeCanvas(c) {
  if (c && c.width) {
    c.width = 0;
    c.height = 0;
  }
}

// Una sola palabra (para buscarla en el diccionario), o null.
function singleWord(text) {
  const t = text.trim();
  return /^[\p{L}'’-]{2,32}$/u.test(t) ? t : null;
}

// ¿Dos resaltados cubren casi el mismo texto? (más de la mitad del más chico)
function overlaps(a, b) {
  const area = (rs) => rs.reduce((s, r) => s + r[2] * r[3], 0);
  let inter = 0;
  for (const [ax, ay, aw, ah] of a) {
    for (const [bx, by, bw, bh] of b) {
      const w = Math.min(ax + aw, bx + bw) - Math.max(ax, bx);
      const h = Math.min(ay + ah, by + bh) - Math.max(ay, by);
      if (w > 0 && h > 0) inter += w * h;
    }
  }
  return inter > 0.5 * Math.min(area(a), area(b));
}

// Texto seleccionado, armado trozo a trozo con un espacio entre cada uno
// (los trozos de la capa de texto están sueltos y el texto copiado quedaría pegado).
function selectedText(root, range) {
  const parts = [];
  for (const span of root.querySelectorAll('.text-layer span')) {
    if (!range.intersectsNode(span)) continue;
    const node = span.firstChild;
    const t = span.textContent;
    const s = node === range.startContainer ? range.startOffset : 0;
    const e = node === range.endContainer ? range.endOffset : t.length;
    parts.push(t.slice(s, e));
  }
  return parts.join(' ').replace(/\s+/g, ' ').trim();
}

// Une los trocitos de la selección en un rectángulo por renglón (px relativos a la página),
// para que los solapamientos no se vean más oscuros.
function mergeLines(rects) {
  const lines = [];
  for (const r of [...rects].sort((a, b) => a[1] - b[1] || a[0] - b[0])) {
    const cy = r[1] + r[3] / 2;
    let line = lines.find((l) => Math.abs(l.cy - cy) < Math.max(l.h, r[3]) * 0.5);
    if (!line) lines.push((line = { cy, h: r[3], items: [] }));
    line.items.push(r);
  }
  const out = [];
  for (const l of lines) {
    let cur = null;
    for (const r of l.items.sort((a, b) => a[0] - b[0])) {
      if (cur && r[0] <= cur[0] + cur[2] + l.h * 0.8) {
        const right = Math.max(cur[0] + cur[2], r[0] + r[2]);
        const top = Math.min(cur[1], r[1]);
        const bottom = Math.max(cur[1] + cur[3], r[1] + r[3]);
        cur = [cur[0], top, right - cur[0], bottom - top];
      } else {
        if (cur) out.push(cur);
        cur = [...r];
      }
    }
    if (cur) out.push(cur);
  }
  return out;
}

function escapeHTML(s) {
  return String(s ?? '').replace(/[&<>"']/g, (c) => ({ '&': '&amp;', '<': '&lt;', '>': '&gt;', '"': '&quot;', "'": '&#39;' })[c]);
}
