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

// Una mitad de hoja que se comporta como una página de PDF.js (lo que usa el lector).
function halfPage(page, side, s) {
  const x0 = page.view[0], W0 = page.view[2] - page.view[0];
  return {
    get view() {
      return side === 0 ? [x0, page.view[1], x0 + W0 * s, page.view[3]] : [x0 + W0 * s, page.view[1], page.view[2], page.view[3]];
    },
    getViewport({ scale = 1, offsetX = 0, offsetY = 0 } = {}) {
      const full = page.getViewport({ scale });
      const vp = page.getViewport({ scale, offsetX: offsetX - (side ? full.width * s : 0), offsetY });
      const half = Object.assign(Object.create(Object.getPrototypeOf(vp)), vp);
      half.width = full.width * (side ? 1 - s : s);
      return half;
    },
    async getTextContent(opts) {
      const tc = await page.getTextContent(opts);
      const cut = x0 + W0 * s;
      tc.items = tc.items.filter((it) => (it.transform[4] + (it.width || 0) / 2 < cut) === (side === 0));
      return tc;
    },
    render: (params) => page.render(params),
    cleanup: () => page.cleanup(),
  };
}

// El documento con las hojas divididas: la página v es la mitad izquierda (impar) o derecha (par) de la hoja ⌈v/2⌉.
export function splitDoc(pdf, s) {
  return {
    split: s,
    numPages: pdf.numPages * 2,
    getPage: async (v) => halfPage(await pdf.getPage(Math.ceil(v / 2)), (v - 1) % 2, s),
    getOutline: () => pdf.getOutline(),
    getDestination: (d) => pdf.getDestination(d),
    getPageIndex: async (ref) => (await pdf.getPageIndex(ref)) * 2,
    toVirtual: (i) => i * 2,
    getMetadata: () => pdf.getMetadata(),
    destroy: () => pdf.destroy(),
  };
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
