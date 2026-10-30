// Reconocer el texto de un PDF escaneado (OCR), todo dentro del dispositivo con Tesseract.
// El texto de cada página se guarda aparte («idLibro:página») y el lector lo usa como si el PDF lo trajera:
// así se puede buscar, resaltar, escuchar, usar el diccionario y el modo texto en un libro escaneado.
import { local } from './db.js';
import { renderPage } from './pdfdoc.js';

const key = (bookId, p) => `${bookId}:${String(p).padStart(5, '0')}`;

// ¿Es un libro escaneado? Se miran algunas páginas: si casi no tienen texto, son imágenes.
export async function isScanned(pdf) {
  const n = pdf.numPages;
  const pick = [...new Set([Math.min(n, 3), Math.ceil(n / 3), Math.ceil(n / 2), Math.ceil((n * 2) / 3)])].filter((p) => p >= 1);
  let chars = 0;
  for (const p of pick) {
    const tc = await (await pdf.getPage(p)).getTextContent();
    chars += tc.items.reduce((s, it) => s + (it.str || '').trim().length, 0);
  }
  return chars < 30 * pick.length;
}

// Texto reconocido de un libro: Map(página del PDF → renglones [texto, x0, y0, x1, y1] de 0 a 1).
export async function loadOcr(bookId) {
  const rows = await local.byPrefix('ocr', bookId + ':').catch(() => []);
  return new Map(rows.map((r) => [r.page, r.lines]));
}

export const deleteOcr = (bookId) => local.delPrefix('ocr', bookId + ':').catch(() => {});

const OCR_STYLE = { ocr: { fontFamily: 'sans-serif', ascent: 0.8, descent: -0.2, vertical: false } };

// El documento con el texto reconocido en las páginas que no tenían.
export function withOcr(pdf, pages) {
  if (!pages?.size) return pdf;
  const wrapPage = (page, lines) =>
    new Proxy(page, {
      get(t, k) {
        if (k === 'getTextContent') {
          return async (opts) => {
            const tc = await t.getTextContent(opts);
            if (tc.items.some((it) => (it.str || '').trim())) return tc;
            const [x0, , x1, y1] = t.view;
            const W = x1 - x0, H = y1 - t.view[1];
            const items = lines.map(([str, a, b, c, d]) => {
              const h = (d - b) * H;
              return { str, dir: 'ltr', width: (c - a) * W, height: h, transform: [h, 0, 0, h, x0 + a * W, y1 - d * H + h * 0.2], fontName: 'ocr', hasEOL: true };
            });
            return { items, styles: OCR_STYLE };
          };
        }
        const v = t[k];
        return typeof v === 'function' ? v.bind(t) : v;
      },
    });
  return new Proxy(pdf, {
    get(t, k) {
      if (k === 'getPage') return async (n) => (pages.has(n) ? wrapPage(await t.getPage(n), pages.get(n)) : t.getPage(n));
      const v = t[k];
      return typeof v === 'function' ? v.bind(t) : v;
    },
  });
}

// ---------- El motor (se carga sólo cuando hace falta: unos 7 MB) ----------

let workerP = null;
async function engine() {
  workerP ??= (async () => {
    const { default: Tesseract } = await import('../vendor/ocr/tesseract.esm.min.js');
    const base = new URL('vendor/ocr/', document.baseURI).href;
    return Tesseract.createWorker(['spa', 'eng'], 1, {
      workerPath: base + 'worker.min.js',
      corePath: base,
      langPath: base + 'lang',
      gzip: true,
    });
  })().catch((err) => {
    workerP = null;
    throw err;
  });
  return workerP;
}

export async function stopEngine() {
  const w = workerP && (await workerP.catch(() => null));
  workerP = null;
  await w?.terminate?.();
}

// Renglones reconocidos de una imagen de página, con su posición relativa (0 a 1).
async function recognize(canvas) {
  const worker = await engine();
  const { data } = await worker.recognize(canvas);
  const W = canvas.width, H = canvas.height;
  const lines = [];
  for (const block of data.blocks || []) {
    for (const par of block.paragraphs || []) {
      for (const line of par.lines || []) {
        const text = (line.text || '').replace(/\s+/g, ' ').trim();
        if (!text || line.confidence < 35) continue;
        const { x0, y0, x1, y1 } = line.bbox;
        lines.push([text, x0 / W, y0 / H, x1 / W, y1 / H]);
      }
    }
  }
  return lines;
}

// Reconoce las páginas que falten. Avisa el avance con onProgress(hechas, total, mapa) y se puede cancelar.
export async function runOcr({ bookId, pdf, signal, onProgress }) {
  const done = await loadOcr(bookId);
  const total = pdf.numPages;
  let count = 0;
  for (let p = 1; p <= total; p++) {
    if (signal?.aborted) break;
    if (!done.has(p)) {
      const page = await pdf.getPage(p);
      const tc = await page.getTextContent();
      // una página que ya trae texto no hace falta reconocerla
      if (!tc.items.some((it) => (it.str || '').trim())) {
        const canvas = await renderPage(pdf, p, 1700, 2400, 1);
        const lines = await recognize(canvas);
        canvas.width = canvas.height = 0;
        done.set(p, lines);
        await local.put('ocr', { id: key(bookId, p), book: bookId, page: p, lines });
      } else done.set(p, null);
      page.cleanup();
    }
    count++;
    onProgress?.(count, total, done);
  }
  for (const [p, v] of [...done]) if (!v) done.delete(p);
  return done;
}
