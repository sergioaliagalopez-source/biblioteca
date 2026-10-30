// Modo texto: el libro como en un lector de libros electrónicos, con la letra del tamaño que quieras.
// En un EPUB se usan sus capítulos tal cual; en un PDF se arma el texto de cada página en párrafos y títulos
// (sin números de página ni encabezados que se repiten). Se lee por partes (un capítulo o unas páginas) y se
// pasa de hoja con toques en los bordes, deslizando o con las flechas. La posición se mantiene con el libro.
import { renderPage } from './pdfdoc.js';
import { prefs } from './db.js';

const PDF_SECTION = 12; // páginas del PDF por parte
const SIZES = [15, 16, 17, 18, 19, 20, 22, 24, 26, 28, 31];
const $ = (s, r = document) => r.querySelector(s);
const esc = (s) => String(s).replace(/[&<>"]/g, (c) => ({ '&': '&amp;', '<': '&lt;', '>': '&gt;', '"': '&quot;' })[c]);

// ---------- Del PDF a párrafos ----------

// Renglones de una página: los trozos de texto agrupados por altura, de izquierda a derecha.
function linesOf(tc) {
  const items = tc.items.filter((it) => it.str && it.str.trim() && Math.abs(it.transform[1]) < 0.01);
  const lines = [];
  for (const it of items.sort((a, b) => b.transform[5] - a.transform[5] || a.transform[4] - b.transform[4])) {
    const size = Math.hypot(it.transform[2], it.transform[3]) || it.height || 10;
    const y = it.transform[5], x = it.transform[4];
    const line = lines.find((l) => Math.abs(l.y - y) < Math.max(l.size, size) * 0.45);
    if (line) {
      line.parts.push({ x, w: it.width, s: it.str });
      line.size = Math.max(line.size, size);
    } else lines.push({ y, size, parts: [{ x, w: it.width, s: it.str }] });
  }
  for (const l of lines) {
    l.parts.sort((a, b) => a.x - b.x);
    let text = '';
    let end = null;
    for (const p of l.parts) {
      // hueco entre trozos: va un espacio si no lo traían
      if (end != null && p.x - end > l.size * 0.18 && !/\s$/.test(text) && !/^\s/.test(p.s)) text += ' ';
      text += p.s;
      end = p.x + p.w;
    }
    l.text = text.replace(/\s+/g, ' ').trim();
    l.x0 = l.parts[0].x;
    l.x1 = end;
  }
  return lines.filter((l) => l.text).sort((a, b) => b.y - a.y);
}

const median = (arr) => {
  if (!arr.length) return 0;
  const s = [...arr].sort((a, b) => a - b);
  return s[s.length >> 1];
};
const norm = (t) => t.toLowerCase().replace(/[\d\s.·•|-]+/g, '');
const ENDS = /[.!?:;…»"”')\]]$/;

// Bloques de las páginas [from, to] del documento (las páginas sin texto van como imagen de la página).
export async function pdfBlocks(doc, from, to) {
  const pages = [];
  for (let p = from; p <= to; p++) {
    const page = await doc.getPage(p);
    const tc = await page.getTextContent();
    pages.push({ p, lines: linesOf(tc) });
  }
  // encabezados y pies que se repiten (título del libro, del capítulo, número de página)
  const edge = new Map();
  for (const pg of pages) {
    for (const l of [pg.lines[0], pg.lines.at(-1)]) {
      if (!l) continue;
      const k = norm(l.text);
      edge.set(k, (edge.get(k) || 0) + 1);
    }
  }
  const isEdge = (l) => /^[\divxlcdm.\s-]+$/i.test(l.text) || (l.text.length < 90 && (edge.get(norm(l.text)) || 0) >= 2 && norm(l.text).length > 0);
  const blocks = [];
  let para = null;
  for (const pg of pages) {
    const lines = [...pg.lines];
    while (lines.length && isEdge(lines[0])) lines.shift();
    while (lines.length && isEdge(lines.at(-1))) lines.pop();
    if (!lines.length) {
      para = null;
      blocks.push({ type: 'page', p: pg.p, runs: [] });
      continue;
    }
    const body = median(lines.map((l) => l.size)) || 10;
    const left = median(lines.filter((l) => Math.abs(l.size - body) < 0.5).map((l) => Math.round(l.x0))) || lines[0].x0;
    const right = median(lines.filter((l) => Math.abs(l.size - body) < 0.5).map((l) => l.x1)) || lines[0].x1;
    const fullW = right - left;
    const gaps = [];
    for (let i = 1; i < lines.length; i++) gaps.push(lines[i - 1].y - lines[i].y);
    const lead = median(gaps.filter((g) => g > 0 && g < body * 3)) || body * 1.3;
    // título en mayúsculas del mismo tamaño que el texto («II. LA TEORÍA DEL AMOR»)
    const caps = (t) => {
      const letters = t.match(/\p{L}/gu) || [];
      return letters.length >= 4 && t.length < 110 && letters.filter((c) => c === c.toUpperCase() && c !== c.toLowerCase()).length / letters.length > 0.85;
    };
    lines.forEach((l, i) => {
      const big = (l.size > body * 1.22 && l.text.length < 140) || caps(l.text);
      const prevL = lines[i - 1];
      const prevShort = para?.lastW != null && para.lastW < fullW * 0.82;
      const afterHeading = para?.type === 'h' && !big;
      const indented = l.x0 > left + body * 0.8 && l.x1 < right + body;
      const gap = prevL ? prevL.y - l.y : 0;
      const centered = Math.abs((l.x0 + l.x1) / 2 - (left + right) / 2) < body * 1.5 && l.x1 - l.x0 < fullW * 0.7;
      let start = !para || afterHeading || (big && para.type !== 'h') || gap > lead * 1.55 || (indented && !centered) || (prevShort && ENDS.test(para.text));
      // al empezar una página: sigue el párrafo de la anterior si quedó sin cerrar
      if (i === 0 && para && para.type === 'p' && !big && !indented && (!ENDS.test(para.text) || /^\p{Ll}/u.test(l.text))) start = false;
      if (start) {
        para = { type: big ? 'h' : 'p', level: big ? (l.size > body * 1.6 ? 2 : 3) : 0, center: big || centered, p: pg.p, text: l.text, lastW: l.x1 - l.x0 };
        blocks.push(para);
      } else {
        // palabra cortada con guion al final del renglón
        if (/[\p{L}]-$/u.test(para.text) && /^\p{Ll}/u.test(l.text)) para.text = para.text.slice(0, -1) + l.text;
        else para.text += ' ' + l.text;
        para.lastW = l.x1 - l.x0;
        if (big && para.type === 'h') para.center = true;
      }
    });
  }
  return blocks.map((b) => (b.type === 'page' ? b : { type: b.type, level: b.level, center: b.center, p: b.p, runs: [{ t: b.text, i: false, b: false }] }));
}

// ---------- Las partes del libro ----------

function sourceOf(doc) {
  if (doc.format === 'epub') {
    const { blocks } = doc.book;
    const page = doc.layout.blockPage;
    const starts = [];
    blocks.forEach((b, i) => (i === 0 || b.chapter) && starts.push(i));
    const parts = starts.map((s, k) => ({ from: s, to: (starts[k + 1] ?? blocks.length) - 1, p0: page[s], p1: page[(starts[k + 1] ?? blocks.length) - 1] }));
    return {
      count: parts.length,
      partOfPage: (p) => Math.max(0, parts.findLastIndex((x) => x.p0 <= p)),
      async get(k) {
        const x = parts[k];
        return blocks.slice(x.from, x.to + 1).map((b, j) => ({ ...b, p: page[x.from + j] }));
      },
    };
  }
  const n = doc.numPages;
  const count = Math.ceil(n / PDF_SECTION);
  const cache = new Map();
  return {
    count,
    partOfPage: (p) => Math.min(count - 1, Math.floor((p - 1) / PDF_SECTION)),
    get(k) {
      if (!cache.has(k)) cache.set(k, pdfBlocks(doc, k * PDF_SECTION + 1, Math.min(n, (k + 1) * PDF_SECTION)).catch((e) => (cache.delete(k), Promise.reject(e))));
      return cache.get(k);
    },
  };
}

// ---------- La vista ----------

export class TextMode {
  constructor({ onClose, onProgress, onDefine, onPaper, toast }) {
    Object.assign(this, { onClose, onProgress, onDefine, onPaper, toast });
    this.el = document.createElement('section');
    this.el.className = 'tm';
    this.el.setAttribute('aria-label', 'Modo texto');
    this.el.hidden = true;
    this.el.innerHTML = `
      <div class="tm-top">
        <button class="tm-btn" data-act="close" title="Volver al libro (Esc)"><svg viewBox="0 0 24 24"><path d="M15 5l-7 7 7 7"/></svg><span>Libro</span></button>
        <div class="tm-title"></div>
        <div class="tm-tools">
          <button class="tm-btn" data-act="smaller" title="Letra más chica" aria-label="Letra más chica"><b class="a-sm">A</b></button>
          <button class="tm-btn" data-act="bigger" title="Letra más grande" aria-label="Letra más grande"><b class="a-lg">A</b></button>
          <button class="tm-btn" data-act="font" title="Cambiar la tipografía"><span class="tm-font"></span></button>
          <button class="tm-btn" data-act="paper" title="Papel"><svg viewBox="0 0 24 24"><path d="M12 3a9 9 0 1 0 0 18z" style="fill: currentColor"/><circle cx="12" cy="12" r="9"/></svg></button>
        </div>
      </div>
      <div class="tm-view"><div class="tm-flow"></div></div>
      <div class="tm-foot"><span class="tm-pos"></span><div class="tm-bar"><i></i></div></div>
      <button class="tm-define" hidden></button>
      <div class="tm-wait" hidden><div class="ornament">❦</div><p>Preparando el texto…</p></div>`;
    document.body.appendChild(this.el);
    this.view = $('.tm-view', this.el);
    this.flow = $('.tm-flow', this.el);
    this.size = +prefs.get('bib.tmSize') || (matchMedia('(pointer: coarse)').matches ? 19 : 20);
    this.font = prefs.get('bib.tmFont') === 'sans' ? 'sans' : 'serif';
    this.urls = [];
    this.bind();
  }

  get isOpen() {
    return !this.el.hidden;
  }

  async open({ doc, book, page, paper, lang }) {
    this.doc = doc;
    this.book = book;
    this.N = doc.numPages;
    this.src = sourceOf(doc);
    this.part = -1;
    this.el.dataset.paper = paper;
    this.flow.lang = lang || 'es';
    $('.tm-title', this.el).textContent = book.title;
    this.applyFont();
    this.el.hidden = false;
    document.body.classList.add('text-mode');
    requestAnimationFrame(() => this.el.classList.add('on'));
    this.showBars(true);
    await this.showPart(this.src.partOfPage(page), { page });
    this.hideBarsSoon();
  }

  close({ silent = false } = {}) {
    if (!this.isOpen) return;
    const p = this.currentPage();
    this.el.classList.remove('on');
    document.body.classList.remove('text-mode');
    this.hideDefine();
    setTimeout(() => {
      this.el.hidden = true;
      this.flow.replaceChildren();
      this.freeUrls();
    }, 260);
    this.doc = null;
    this.tok = (this.tok || 0) + 1;
    if (!silent) this.onClose?.(p);
  }

  setPaper(paper) {
    this.el.dataset.paper = paper;
  }

  freeUrls() {
    this.urls.forEach((u) => URL.revokeObjectURL(u));
    this.urls = [];
  }

  // Arma en HTML una parte del libro y se ubica en la página pedida (o al principio / al final).
  async showPart(k, { page = null, at = 'start' } = {}) {
    k = Math.max(0, Math.min(this.src.count - 1, k));
    const tok = (this.tok = (this.tok || 0) + 1);
    const wait = $('.tm-wait', this.el);
    const slow = setTimeout(() => (wait.hidden = false), 250);
    let blocks;
    try {
      blocks = await this.src.get(k);
    } catch (err) {
      console.error(err);
      clearTimeout(slow);
      wait.hidden = true;
      this.toast?.('No pude preparar el texto de estas páginas.');
      return;
    }
    clearTimeout(slow);
    wait.hidden = true;
    if (tok !== this.tok || !this.doc) return;
    this.freeUrls();
    this.part = k;
    this.blocks = blocks;
    const html = [];
    const runs = (b) => b.runs.map((r) => (r.t === '\n' ? '<br>' : r.i && r.b ? `<b><i>${esc(r.t)}</i></b>` : r.i ? `<i>${esc(r.t)}</i>` : r.b ? `<b>${esc(r.t)}</b>` : esc(r.t))).join('');
    blocks.forEach((b, i) => {
      const at = `data-i="${i}" data-p="${b.p}"`;
      const cls = b.center ? ' class="c"' : '';
      if (b.type === 'h') html.push(`<h${Math.min(4, (b.level || 2) + (b.level === 1 ? 1 : 0))} ${at}>${runs(b)}</h${Math.min(4, (b.level || 2) + (b.level === 1 ? 1 : 0))}>`);
      else if (b.type === 'quote') html.push(`<blockquote ${at}${cls}>${runs(b)}</blockquote>`);
      else if (b.type === 'li') html.push(`<p ${at} class="li">${runs(b)}</p>`);
      else if (b.type === 'pre') html.push(`<pre ${at}>${runs(b)}</pre>`);
      else if (b.type === 'hr') html.push(`<p ${at} class="hr">⁂</p>`);
      else if (b.type === 'img') {
        const url = URL.createObjectURL(b.src.blob);
        this.urls.push(url);
        html.push(`<figure ${at}><img src="${url}" alt="${esc(b.alt || '')}"></figure>`);
      } else if (b.type === 'page') html.push(`<figure ${at} class="pg" data-page="${b.p}"></figure>`);
      else html.push(`<p ${at}${cls}>${runs(b)}</p>`);
    });
    if (!blocks.length) html.push('<p class="c tm-empty">Esta parte no tiene texto.</p>');
    this.flow.innerHTML = html.join('');
    this.layout();
    // páginas sin texto (láminas, escaneos): se muestra la página tal cual
    this.paintPageImages(tok);
    let target = at === 'end' ? this.pages - 1 : 0;
    if (page != null) {
      const el = [...this.flow.children].find((c) => +c.dataset.p >= page) || this.flow.lastElementChild;
      if (el) target = this.pageOfEl(el);
    }
    this.goPage(target, false);
  }

  async paintPageImages(tok) {
    const w = this.colW;
    for (const fig of this.flow.querySelectorAll('figure.pg')) {
      if (tok !== this.tok || !this.doc) return;
      const c = await renderPage(this.doc, +fig.dataset.page, w, this.view.clientHeight - 8, undefined, { paper: true }).catch(() => null);
      if (c && tok === this.tok) {
        c.style.width = '100%';
        fig.replaceChildren(c);
      }
    }
  }

  // Columnas: una por pantalla en el teléfono, dos en una pantalla ancha (como un libro abierto).
  layout() {
    const vw = this.el.clientWidth;
    const n = vw >= 980 ? 2 : 1;
    const max = n === 2 ? 1320 : 760;
    const W = Math.min(vw, max);
    const gap = Math.max(36, Math.min(80, W * 0.07));
    this.cols = n;
    this.W = W;
    this.colW = (W - n * gap) / n;
    Object.assign(this.view.style, { width: `${W}px`, left: `${(vw - W) / 2}px` });
    Object.assign(this.flow.style, { columnWidth: `${this.colW}px`, columnGap: `${gap}px`, padding: `0 ${gap / 2}px`, width: `${W}px` });
    this.flow.style.transition = 'none';
    this.flow.style.transform = 'none';
    this.pages = Math.max(1, Math.round(this.flow.scrollWidth / W));
  }

  pageOfEl(el) {
    return Math.max(0, Math.min(this.pages - 1, Math.floor((el.offsetLeft + 2) / this.W)));
  }

  goPage(i, animate = true) {
    this.page = Math.max(0, Math.min(this.pages - 1, i));
    this.flow.style.transition = animate ? 'transform 0.32s cubic-bezier(.3,.7,.3,1)' : 'none';
    this.flow.style.transform = `translateX(${-this.page * this.W}px)`;
    this.hideDefine();
    this.updatePos();
  }

  // Bloque que está arriba en la pantalla (el último que empieza en esta pantalla o antes).
  anchor() {
    let el = this.flow.firstElementChild;
    for (const e of this.flow.children) {
      if (this.pageOfEl(e) > this.page) break;
      el = e;
    }
    return el;
  }

  // Página del libro que se está leyendo.
  currentPage() {
    if (!this.blocks) return 1;
    return +this.anchor()?.dataset.p || 1;
  }

  updatePos() {
    const p = this.currentPage();
    const pct = Math.round((p / this.N) * 100);
    $('.tm-pos', this.el).textContent = `Página ${p} de ${this.N} · ${pct}%`;
    $('.tm-bar i', this.el).style.width = `${Math.max(1, pct)}%`;
    this.onProgress?.(p);
  }

  async next() {
    if (this.page < this.pages - 1) this.goPage(this.page + 1);
    else if (this.part < this.src.count - 1) await this.showPart(this.part + 1, { at: 'start' });
    else this.toast?.('Llegaste al final del libro');
  }

  async prev() {
    if (this.page > 0) this.goPage(this.page - 1);
    else if (this.part > 0) await this.showPart(this.part - 1, { at: 'end' });
  }

  applyFont() {
    this.el.style.setProperty('--tm-size', `${this.size}px`);
    this.el.dataset.font = this.font;
    $('.tm-font', this.el).textContent = this.font === 'serif' ? 'Serif' : 'Sans';
  }

  // Cambió la letra o el tamaño de la pantalla: se vuelve a paginar sin perder el lugar.
  relayout() {
    if (!this.isOpen || !this.blocks) return;
    const el = this.anchor();
    this.layout();
    this.goPage(el ? this.pageOfEl(el) : 0, false);
  }

  resize(d) {
    const i = SIZES.findIndex((s) => s >= this.size);
    const n = SIZES[Math.max(0, Math.min(SIZES.length - 1, (i < 0 ? SIZES.length - 1 : i) + d))];
    if (n === this.size) return;
    this.size = n;
    prefs.set('bib.tmSize', String(n));
    this.applyFont();
    this.relayout();
  }

  showBars(on) {
    clearTimeout(this.barT);
    this.el.classList.toggle('bars', on);
  }

  hideBarsSoon() {
    clearTimeout(this.barT);
    this.barT = setTimeout(() => this.el.classList.remove('bars'), 2600);
  }

  hideDefine() {
    $('.tm-define', this.el).hidden = true;
  }

  bind() {
    this.el.addEventListener('click', (e) => {
      const btn = e.target.closest('[data-act]');
      if (btn) {
        const act = btn.dataset.act;
        if (act === 'close') this.close();
        else if (act === 'smaller') this.resize(-1);
        else if (act === 'bigger') this.resize(1);
        else if (act === 'font') {
          this.font = this.font === 'serif' ? 'sans' : 'serif';
          prefs.set('bib.tmFont', this.font);
          this.applyFont();
          this.relayout();
        } else if (act === 'paper') this.onPaper?.();
        this.showBars(true);
        this.hideBarsSoon();
        return;
      }
      if (e.target.closest('.tm-define')) {
        const w = $('.tm-define', this.el).dataset.word;
        this.hideDefine();
        getSelection()?.removeAllRanges();
        this.onDefine?.(w);
        return;
      }
      if (!e.target.closest('.tm-view')) return;
      if (String(getSelection() || '').trim()) return;
      const x = e.clientX / innerWidth;
      if (x < 0.28) this.prev();
      else if (x > 0.72) this.next();
      else if (this.el.classList.contains('bars')) this.showBars(false);
      else {
        this.showBars(true);
        this.hideBarsSoon();
      }
    });
    // deslizar el dedo
    let sx = null, sy = 0;
    this.view.addEventListener('touchstart', (e) => {
      if (e.touches.length !== 1) return (sx = null);
      sx = e.touches[0].clientX;
      sy = e.touches[0].clientY;
    }, { passive: true });
    this.view.addEventListener('touchend', (e) => {
      if (sx == null) return;
      const dx = e.changedTouches[0].clientX - sx, dy = e.changedTouches[0].clientY - sy;
      sx = null;
      if (Math.abs(dx) > 45 && Math.abs(dx) > Math.abs(dy) * 1.4 && !String(getSelection() || '').trim()) {
        e.preventDefault();
        dx < 0 ? this.next() : this.prev();
      }
    });
    this.el.addEventListener('wheel', (e) => {
      if (!this.isOpen || Date.now() < (this.wheelLock || 0)) return;
      const d = Math.abs(e.deltaY) > Math.abs(e.deltaX) ? e.deltaY : e.deltaX;
      if (Math.abs(d) < 12) return;
      this.wheelLock = Date.now() + 380;
      d > 0 ? this.next() : this.prev();
    }, { passive: true });
    addEventListener('keydown', (e) => {
      if (!this.isOpen || e.target.closest?.('input, textarea, select') || document.querySelector('.modal-backdrop')) return;
      if (['ArrowRight', 'PageDown', ' '].includes(e.key)) this.next();
      else if (['ArrowLeft', 'PageUp'].includes(e.key)) this.prev();
      else if (e.key === 'Escape') this.close();
      else return;
      e.preventDefault();
      e.stopImmediatePropagation();
    }, true);
    addEventListener('resize', () => {
      clearTimeout(this.rsT);
      this.rsT = setTimeout(() => this.relayout(), 150);
    });
    // una palabra seleccionada: se ofrece el diccionario
    document.addEventListener('selectionchange', () => {
      if (!this.isOpen) return;
      clearTimeout(this.selT);
      this.selT = setTimeout(() => {
        const sel = getSelection();
        const word = sel && sel.rangeCount && this.flow.contains(sel.anchorNode) ? String(sel).trim() : '';
        const btn = $('.tm-define', this.el);
        if (!/^[\p{L}'’-]{2,32}$/u.test(word)) return (btn.hidden = true);
        const r = sel.getRangeAt(0).getBoundingClientRect();
        btn.dataset.word = word;
        btn.textContent = `Definir «${word}»`;
        btn.hidden = false;
        const bw = btn.offsetWidth;
        btn.style.left = `${Math.max(8, Math.min(innerWidth - bw - 8, r.left + r.width / 2 - bw / 2))}px`;
        btn.style.top = `${r.top > 70 ? r.top - 46 : r.bottom + 10}px`;
      }, 350);
    });
  }
}
