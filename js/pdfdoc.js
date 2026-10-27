// Lectura y renderizado de PDF con PDF.js.
// PDF.js pesa bastante: se carga recién la primera vez que hace falta (o en un rato libre después de abrir).
// Las librerías van incluidas en la carpeta vendor/ para que la app funcione sin internet;
// las tablas de fuentes (sólo para algunos PDF) se piden al CDN cuando hacen falta.
const PDFJS = 'https://cdn.jsdelivr.net/npm/pdfjs-dist@4.4.168';
let loading = null;
export let pdfUtil = null;

export function loadPdfjs() {
  loading ??= import('pdfjs-dist').then((lib) => {
    lib.GlobalWorkerOptions.workerSrc = new URL('vendor/pdf.worker.min.mjs', document.baseURI).href;
    pdfUtil = lib.Util;
    return lib;
  });
  return loading;
}

export async function openPdf(blob) {
  const [pdfjsLib, buf] = await Promise.all([loadPdfjs(), blob.arrayBuffer()]);
  const data = new Uint8Array(buf);
  return pdfjsLib.getDocument({
    data,
    cMapUrl: `${PDFJS}/cmaps/`,
    cMapPacked: true,
    standardFontDataUrl: `${PDFJS}/standard_fonts/`,
    isEvalSupported: false,
  }).promise;
}

// Renderiza la página n para que quepa en una caja de boxW x boxH píxeles CSS.
export async function renderPage(pdf, n, boxW, boxH, dpr = Math.min(window.devicePixelRatio || 1, 2)) {
  const page = await pdf.getPage(n);
  const base = page.getViewport({ scale: 1 });
  const scale = Math.min(boxW / base.width, boxH / base.height) * dpr;
  const vp = page.getViewport({ scale });
  const c = document.createElement('canvas');
  c.width = Math.max(1, Math.floor(vp.width));
  c.height = Math.max(1, Math.floor(vp.height));
  const ctx = c.getContext('2d', { alpha: false });
  ctx.fillStyle = '#fff';
  ctx.fillRect(0, 0, c.width, c.height);
  await page.render({ canvasContext: ctx, viewport: vp }).promise;
  page.cleanup();
  return c;
}

// Proporción de la portada (pág. 1) y de una página típica del interior.
export async function pageAspects(pdf) {
  const aspectOf = async (n) => {
    const v = (await pdf.getPage(n)).getViewport({ scale: 1 });
    return v.width / v.height;
  };
  const coverAspect = await aspectOf(1);
  const pageAspect = pdf.numPages >= 3 ? await aspectOf(3) : coverAspect;
  return { coverAspect, pageAspect };
}

// Primera página como imagen; si no es casi toda blanca, probablemente sea la portada original.
export async function renderCoverFromPdf(pdf) {
  const c = await renderPage(pdf, 1, 640, 960, 1);
  const s = document.createElement('canvas');
  s.width = 40;
  s.height = 56;
  const g = s.getContext('2d', { willReadFrequently: true });
  g.drawImage(c, 0, 0, 40, 56);
  const d = g.getImageData(0, 0, 40, 56).data;
  let white = 0;
  for (let i = 0; i < d.length; i += 4) if (d[i] > 232 && d[i + 1] > 232 && d[i + 2] > 232) white++;
  const blob = await new Promise((r) => c.toBlob(r, 'image/jpeg', 0.9));
  return { blob, likelyCover: white / (d.length / 4) < 0.55 };
}

// Busca el texto de mayor tamaño en las primeras páginas: suele ser el título.
export async function guessTitleFromText(pdf) {
  for (let n = 1; n <= Math.min(3, pdf.numPages); n++) {
    const tc = await (await pdf.getPage(n)).getTextContent();
    const items = tc.items
      .filter((it) => it.str && it.str.trim().length > 1)
      .map((it) => ({ s: it.str.trim(), size: Math.hypot(it.transform[2], it.transform[3]) || it.height || 0 }));
    if (items.length < 2) continue;
    const max = Math.max(...items.map((i) => i.size));
    const title = items
      .filter((i) => i.size >= max * 0.92)
      .map((i) => i.s)
      .join(' ')
      .replace(/\s+/g, ' ')
      .trim();
    if (title.length >= 3 && title.length <= 120) return title;
  }
  return '';
}

// ---------- PDF con dos páginas por hoja ----------
// Muchos PDF escaneados o maquetados traen el libro abierto: cada hoja apaisada tiene dos páginas una al lado
// de la otra. Se detecta mirando dónde está el texto (o, si es una imagen, dónde hay tinta) y se divide cada hoja
// en dos páginas «virtuales»: el lector las muestra como un libro normal, página por página.

// Busca un pasillo vertical sin texto cerca del centro. Devuelve su posición (0..1 del ancho) o null.
async function gutterOf(page) {
  const vp = page.getViewport({ scale: 1 });
  const W = vp.width, H = vp.height;
  if (W < H * 1.15) return null; // sólo hojas apaisadas
  const tc = await page.getTextContent();
  const x0 = page.view[0];
  const cover = new Uint8Array(Math.ceil(W) + 1);
  let left = 0, right = 0;
  for (const it of tc.items) {
    const s = it.str.trim();
    if (!s) continue;
    const a = Math.max(0, Math.floor(it.transform[4] - x0)), b = Math.min(cover.length - 1, Math.ceil(it.transform[4] - x0 + it.width));
    for (let x = a; x <= b; x++) cover[x] = 1;
    if ((a + b) / 2 < W / 2) left += s.length;
    else right += s.length;
  }
  if (left + right >= 120) {
    if (Math.min(left, right) < (left + right) * 0.12) return null;
    return emptyRun(cover, W, (x) => !cover[x], 0.012);
  }
  // Sin texto (escaneo): se busca la franja con menos tinta en una versión chica de la hoja.
  const c = document.createElement('canvas');
  const k = 300 / W;
  c.width = 300;
  c.height = Math.round(H * k);
  const ctx = c.getContext('2d', { willReadFrequently: true });
  ctx.fillStyle = '#fff';
  ctx.fillRect(0, 0, c.width, c.height);
  await page.render({ canvasContext: ctx, viewport: page.getViewport({ scale: k }) }).promise;
  const d = ctx.getImageData(0, Math.round(c.height * 0.1), c.width, Math.round(c.height * 0.8)).data;
  const ink = new Float32Array(c.width);
  for (let i = 0; i < d.length; i += 4) ink[(i / 4) % c.width] += 255 - (d[i] + d[i + 1] + d[i + 2]) / 3;
  const rows = d.length / 4 / c.width;
  const avg = ink.reduce((a, v) => a + v, 0) / c.width;
  if (avg / rows < 4) return null; // casi en blanco
  return emptyRun(ink, c.width, (x) => ink[x] < avg * 0.18, 0.015);
}

function emptyRun(arr, W, isEmpty, minFrac) {
  const n = arr.length;
  let best = null, start = -1;
  for (let x = Math.floor(n * 0.36); x <= Math.ceil(n * 0.64); x++) {
    if (x < n && isEmpty(x)) {
      if (start < 0) start = x;
    } else if (start >= 0) {
      if (!best || x - start > best.len) best = { len: x - start, mid: (start + x) / 2 };
      start = -1;
    }
  }
  return best && best.len >= n * minFrac ? best.mid / n : null;
}

// Mira hasta 10 hojas repartidas por el libro. Devuelve la posición del corte (0..1) o false.
export async function detectTwoUp(pdf) {
  const n = pdf.numPages;
  const picks = [...new Set(Array.from({ length: Math.min(10, n) }, (_, i) => Math.round(1 + ((i + 0.5) / Math.min(10, n)) * (n - 1))))];
  const found = [];
  for (const i of picks) found.push(await gutterOf(await pdf.getPage(i)).catch(() => null));
  const hits = found.filter((g) => g != null).sort((a, b) => a - b);
  if (hits.length < Math.max(1, Math.ceil(picks.length * 0.6))) return false;
  return Math.round(hits[Math.floor(hits.length / 2)] * 1000) / 1000;
}

// ---------- Encuadre de libro ----------
// Cada PDF trae sus propios márgenes (a veces el texto pegado a un borde, o corrido de una página a otra).
// Se mide dónde está el bloque de texto en varias páginas y se vuelve a componer cada página con márgenes de
// libro de tapa dura: el bloque igual en todas, más margen hacia el lomo que hacia afuera, y espejado entre
// las páginas izquierdas (pares) y las derechas (impares).

const MARGIN = { inner: 0.1, outer: 0.075, top: 0.075, bottom: 0.085 };

// Caja del contenido (en unidades del PDF, desde arriba a la izquierda), dentro de la franja [cx0, cx1].
async function contentBox(page, cx0, cx1) {
  const [vx0, , , vy1] = page.view;
  const tc = await page.getTextContent();
  let x0 = Infinity, y0 = Infinity, x1 = -Infinity, y1 = -Infinity, chars = 0;
  for (const it of tc.items) {
    const s = it.str.trim();
    if (!s) continue;
    const x = it.transform[4] - vx0, w = it.width || 0;
    if (x + w / 2 < cx0 || x + w / 2 > cx1) continue;
    const h = it.height || Math.hypot(it.transform[2], it.transform[3]) || 8;
    const base = vy1 - it.transform[5];
    x0 = Math.min(x0, x);
    x1 = Math.max(x1, x + w);
    y0 = Math.min(y0, base - h);
    y1 = Math.max(y1, base + h * 0.25);
    chars += s.length;
  }
  if (chars >= 40) return { x0, y0, x1, y1 };
  // Escaneo sin texto: la caja de la tinta en una versión chica de la página.
  const vp1 = page.getViewport({ scale: 1 });
  const k = 360 / vp1.width;
  const c = document.createElement('canvas');
  c.width = 360;
  c.height = Math.round(vp1.height * k);
  const ctx = c.getContext('2d', { willReadFrequently: true });
  ctx.fillStyle = '#fff';
  ctx.fillRect(0, 0, c.width, c.height);
  await page.render({ canvasContext: ctx, viewport: page.getViewport({ scale: k }) }).promise;
  const d = ctx.getImageData(0, 0, c.width, c.height).data;
  const a = Math.floor(cx0 * k), b = Math.min(c.width, Math.ceil(cx1 * k));
  // se ignora un borde fino (sombras del escaneo en los cantos)
  const pad = Math.round(c.width * 0.015);
  let bx0 = Infinity, by0 = Infinity, bx1 = -Infinity, by1 = -Infinity, ink = 0;
  for (let y = pad; y < c.height - pad; y++) {
    for (let x = Math.max(a, pad); x < Math.min(b, c.width - pad); x++) {
      const i = (y * c.width + x) * 4;
      if (d[i] + d[i + 1] + d[i + 2] < 330) {
        ink++;
        if (x < bx0) bx0 = x;
        if (x > bx1) bx1 = x;
        if (y < by0) by0 = y;
        if (y > by1) by1 = y;
      }
    }
  }
  if (ink < 200) return null;
  return { x0: bx0 / k, y0: by0 / k, x1: (bx1 + 1) / k, y1: (by1 + 1) / k };
}

const pct = (arr, p) => {
  const s = [...arr].sort((a, b) => a - b);
  return s[Math.min(s.length - 1, Math.max(0, Math.round((s.length - 1) * p)))];
};

// Mide hasta 16 páginas y devuelve el encuadre { w, h, odd: [x, y, ancho, alto], even: [...] } o null.
export async function frameOf(pdf, split) {
  const n = pdf.numPages;
  const first = await pdf.getPage(1);
  const v1 = first.getViewport({ scale: 1 });
  const W = v1.width, H = v1.height;
  const from = n > 3 ? 2 : 1;
  const count = Math.min(16, n - from + 1);
  const picks = [...new Set(Array.from({ length: count }, (_, i) => Math.round(from + ((i + 0.5) / count) * (n - from))))];
  const boxes = { odd: [], even: [] };
  for (const i of picks) {
    const page = await pdf.getPage(i);
    const vp = page.getViewport({ scale: 1 });
    if (Math.abs(vp.width - W) > 2 || Math.abs(vp.height - H) > 2) continue; // hojas de otro tamaño
    const parts = split ? [['odd', 0, W * split], ['even', W * split, W]] : [[i % 2 ? 'odd' : 'even', 0, W]];
    for (const [key, a, b] of parts) {
      const box = await contentBox(page, a, b).catch(() => null);
      // cajas casi vacías (páginas en blanco o con una sola línea) no sirven para medir
      if (box && box.x1 - box.x0 > (b - a) * 0.3 && box.y1 - box.y0 > H * 0.3) boxes[key].push(box);
    }
  }
  if (boxes.odd.length + boxes.even.length < 3) return null;
  // sin muestras de un lado, se usa el otro
  if (!boxes.odd.length) boxes.odd = boxes.even;
  if (!boxes.even.length) boxes.even = boxes.odd;
  const agg = (list) => ({ x0: pct(list.map((b) => b.x0), 0.15), y0: pct(list.map((b) => b.y0), 0.15), x1: pct(list.map((b) => b.x1), 0.85), y1: pct(list.map((b) => b.y1), 0.85) });
  const o = agg(boxes.odd), e = agg(boxes.even);
  // el mismo tamaño de bloque en las dos clases de página
  const cw = Math.max(o.x1 - o.x0, e.x1 - e.x0), ch = Math.max(o.y1 - o.y0, e.y1 - e.y0);
  const pw = cw / (1 - MARGIN.inner - MARGIN.outer), ph = ch / (1 - MARGIN.top - MARGIN.bottom);
  const r = (v) => Math.round(v * 10) / 10;
  return {
    v: 1, w: W, h: H,
    // impar = página derecha (el lomo a su izquierda); par = página izquierda (el lomo a su derecha)
    odd: [r(o.x0 - pw * MARGIN.inner), r(o.y0 - ph * MARGIN.top), r(pw), r(ph)],
    even: [r(e.x0 - pw * MARGIN.outer), r(e.y0 - ph * MARGIN.top), r(pw), r(ph)],
  };
}

// Recorte de la página v según cómo se lee el libro: el encuadre, la mitad de la hoja o la hoja entera.
// [x, y, ancho, alto] en unidades del PDF desde arriba a la izquierda.
export function boxFor(v, split, frame, W, H) {
  if (frame && (split || v > 1)) return frame[v % 2 ? 'odd' : 'even'];
  if (split) return v % 2 ? [0, 0, W * split, H] : [W * split, 0, W * (1 - split), H];
  return [0, 0, W, H];
}

// Encuadre de lectura a pantalla completa: el bloque de texto con un margen mínimo (sin el aire del libro),
// para que la letra quede lo más grande posible.
export function readingFrame(frame) {
  if (!frame) return null;
  const tight = (box, inner) => {
    const [x, y, w, h] = box;
    const cx = x + w * (inner ? MARGIN.inner : MARGIN.outer), cy = y + h * MARGIN.top;
    const cw = w * (1 - MARGIN.inner - MARGIN.outer), ch = h * (1 - MARGIN.top - MARGIN.bottom);
    const mx = cw * 0.045, my = ch * 0.03;
    return [cx - mx, cy - my, cw + 2 * mx, ch + 2 * my];
  };
  return { ...frame, odd: tight(frame.odd, true), even: tight(frame.even, false) };
}

// Una página recortada que se comporta como una página de PDF.js (lo que usa el lector).
function framedPage(page, box, textRange) {
  const [bx, by, bw, bh] = box;
  return {
    get view() {
      const [vx0, , , vy1] = page.view;
      return [vx0 + bx, vy1 - by - bh, vx0 + bx + bw, vy1 - by];
    },
    getViewport({ scale = 1, offsetX = 0, offsetY = 0 } = {}) {
      const vp = page.getViewport({ scale, offsetX: offsetX - bx * scale, offsetY: offsetY - by * scale });
      const out = Object.assign(Object.create(Object.getPrototypeOf(vp)), vp);
      out.width = bw * scale;
      out.height = bh * scale;
      return out;
    },
    async getTextContent(opts) {
      const tc = await page.getTextContent(opts);
      if (textRange) {
        const x0 = page.view[0];
        tc.items = tc.items.filter((it) => {
          const mid = it.transform[4] - x0 + (it.width || 0) / 2;
          return mid >= textRange[0] && mid < textRange[1];
        });
      }
      return tc;
    },
    render(params) {
      const task = page.render(params);
      if (!textRange) return task;
      // con márgenes amplios el recorte puede asomarse a la otra página de la hoja: eso se tapa con papel
      const W = page.view[2] - page.view[0];
      const k = params.viewport.scale;
      const promise = task.promise.then(() => {
        const ctx = params.canvasContext, cw = ctx.canvas.width, chh = ctx.canvas.height;
        ctx.save();
        ctx.setTransform(1, 0, 0, 1, 0, 0);
        ctx.fillStyle = '#fff';
        const a = (textRange[0] - bx) * k, b = (textRange[1] - bx) * k;
        if (a > 0) ctx.fillRect(0, 0, Math.ceil(a), chh);
        if (b < cw && textRange[1] < W - 0.5) ctx.fillRect(Math.floor(b), 0, cw - Math.floor(b), chh);
        ctx.restore();
      });
      return { promise, cancel: () => task.cancel() };
    },
    cleanup: () => page.cleanup(),
  };
}

// El documento tal como se lee: con las hojas divididas (dos páginas por hoja) y/o con encuadre de libro.
export function bookDoc(pdf, { split = false, frame = null } = {}) {
  if (!split && !frame) return pdf;
  return {
    split,
    numPages: pdf.numPages * (split ? 2 : 1),
    async getPage(v) {
      const page = await pdf.getPage(split ? Math.ceil(v / 2) : v);
      const W = page.view[2] - page.view[0], H = page.view[3] - page.view[1];
      const box = boxFor(v, split, frame, W, H);
      const range = split ? (v % 2 ? [0, W * split] : [W * split, W]) : null;
      return framedPage(page, box, range);
    },
    getOutline: () => pdf.getOutline(),
    getDestination: (d) => pdf.getDestination(d),
    getPageIndex: async (ref) => (await pdf.getPageIndex(ref)) * (split ? 2 : 1),
    toVirtual: (i) => i * (split ? 2 : 1),
    getMetadata: () => pdf.getMetadata(),
    destroy: () => pdf.destroy(),
  };
}

// Proporción de la página tal como se ve (para medir el libro).
export function pageAspectOf(book) {
  const f = book.frame;
  if (f) return f.odd[2] / f.odd[3];
  const s = book.sheet;
  if (!s) return book.pageAspect;
  return (s.w * (book.split ? Math.max(book.split, 1 - book.split) : 1)) / s.h;
}

// Los resaltados guardan su lugar relativo a la página que se veía: al cambiar el encuadre se recalculan.
export function remapFrame(book, from, to) {
  if (!book.sheet || from === to) return;
  const { w: W, h: H } = book.sheet;
  for (const hl of book.highlights || []) {
    const a = boxFor(hl.page, book.split, from || null, W, H), b = boxFor(hl.page, book.split, to || null, W, H);
    hl.rects = hl.rects.map(([x, y, w, h]) => {
      const px = a[0] + x * a[2], py = a[1] + y * a[3];
      return [(px - b[0]) / b[2], (py - b[1]) / b[3], (w * a[2]) / b[2], (h * a[3]) / b[3]].map((v) => Math.round(v * 10000) / 10000);
    });
  }
}

// Pasa las posiciones guardadas de un libro (página, cinta, resaltados) entre hojas enteras y divididas.
export function remapBook(book, from, to) {
  if (from === to) return;
  const fwd = (p) => 2 * p - 1;
  const back = (p) => Math.ceil(p / 2);
  if (!from && to) {
    if (book.lastPage) book.lastPage = fwd(book.lastPage);
    if (book.bookmark) book.bookmark = fwd(book.bookmark);
    book.pageCount = (book.pageCount || 0) * 2;
    if (book.pageAspect) book.pageAspect *= Math.max(to, 1 - to);
    for (const h of book.highlights || []) {
      const left = h.rects.every(([x, , w]) => x + w / 2 < to);
      h.page = left ? 2 * h.page - 1 : 2 * h.page;
      h.rects = h.rects.map(([x, y, w, hh]) => (left ? [x / to, y, w / to, hh] : [(x - to) / (1 - to), y, w / (1 - to), hh]));
    }
  } else if (from && !to) {
    if (book.lastPage) book.lastPage = back(book.lastPage);
    if (book.bookmark) book.bookmark = back(book.bookmark);
    book.pageCount = Math.ceil((book.pageCount || 0) / 2);
    if (book.pageAspect) book.pageAspect /= Math.max(from, 1 - from);
    for (const h of book.highlights || []) {
      const left = h.page % 2 === 1;
      h.page = back(h.page);
      h.rects = h.rects.map(([x, y, w, hh]) => (left ? [x * from, y, w * from, hh] : [from + x * (1 - from), y, w * (1 - from), hh]));
    }
  } else {
    remapBook(book, from, false);
    remapBook(book, false, to);
  }
}
