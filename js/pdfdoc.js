// Lectura y renderizado de PDF con PDF.js.
import * as pdfjsLib from 'pdfjs-dist';

// Las librerías van incluidas en la carpeta vendor/ para que la app funcione sin internet;
// las tablas de fuentes (sólo para algunos PDF) se piden al CDN cuando hacen falta.
const PDFJS = 'https://cdn.jsdelivr.net/npm/pdfjs-dist@4.4.168';
pdfjsLib.GlobalWorkerOptions.workerSrc = new URL('vendor/pdf.worker.min.mjs', document.baseURI).href;

export const pdfUtil = pdfjsLib.Util;

export async function openPdf(blob) {
  const data = new Uint8Array(await blob.arrayBuffer());
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
