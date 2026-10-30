// Libros EPUB: se abren (es un ZIP con páginas HTML), se arma el texto en bloques (títulos, párrafos,
// imágenes) y se compagina en páginas de tamaño fijo, como un libro impreso. El resultado se comporta como
// un documento de PDF.js (lo que usa el lector): páginas que se dibujan, con su texto y su índice.
// El tamaño de página y la letra son siempre los mismos, así la numeración no cambia entre dispositivos
// y los resaltados quedan en su lugar.

// Página: 360 × 560 puntos (proporción de un libro de bolsillo) con márgenes de libro.
export const EPUB_PAGE = { w: 360, h: 560 };
const M = { inner: 0.1, outer: 0.075, top: 0.075, bottom: 0.085 };
const FONT = 'BibSerif';
const BODY = 11.5;
const LEAD = 1.42;
const INK = '#1d1610';

// ---------- ZIP ----------

async function unzip(blob) {
  const buf = new Uint8Array(await blob.arrayBuffer());
  const dv = new DataView(buf.buffer, buf.byteOffset, buf.byteLength);
  let eocd = -1;
  for (let i = buf.length - 22; i >= Math.max(0, buf.length - 65558); i--) {
    if (dv.getUint32(i, true) === 0x06054b50) {
      eocd = i;
      break;
    }
  }
  if (eocd < 0) throw new Error('Ese archivo no es un EPUB válido.');
  const count = dv.getUint16(eocd + 10, true);
  let p = dv.getUint32(eocd + 16, true);
  const utf8 = new TextDecoder();
  const entries = new Map();
  for (let n = 0; n < count && dv.getUint32(p, true) === 0x02014b50; n++) {
    const method = dv.getUint16(p + 10, true);
    const csize = dv.getUint32(p + 20, true);
    const nlen = dv.getUint16(p + 28, true), xlen = dv.getUint16(p + 30, true), clen = dv.getUint16(p + 32, true);
    const off = dv.getUint32(p + 42, true);
    const name = utf8.decode(buf.subarray(p + 46, p + 46 + nlen));
    entries.set(name, { method, csize, off });
    p += 46 + nlen + xlen + clen;
  }
  const lower = new Map([...entries.keys()].map((k) => [k.toLowerCase(), k]));
  const find = (name) => entries.get(name) || entries.get(lower.get(name.toLowerCase()));
  async function read(name) {
    const e = find(name);
    if (!e) return null;
    const start = e.off + 30 + dv.getUint16(e.off + 26, true) + dv.getUint16(e.off + 28, true);
    const data = buf.subarray(start, start + e.csize);
    if (e.method === 0) return data.slice();
    if (e.method !== 8) return null;
    const stream = new Blob([data]).stream().pipeThrough(new DecompressionStream('deflate-raw'));
    return new Uint8Array(await new Response(stream).arrayBuffer());
  }
  return {
    read,
    has: (name) => !!find(name),
    text: async (name) => {
      const d = await read(name);
      return d ? utf8.decode(d) : null;
    },
  };
}

// ---------- Rutas y XML ----------

function resolve(base, href) {
  const clean = decodeURIComponent(href.split('#')[0]);
  if (!clean) return base;
  const parts = clean.startsWith('/') ? [] : base.split('/').slice(0, -1);
  for (const seg of clean.split('/')) {
    if (seg === '..') parts.pop();
    else if (seg && seg !== '.') parts.push(seg);
  }
  return parts.join('/');
}

function parse(text, type = 'application/xhtml+xml') {
  let doc = new DOMParser().parseFromString(text, type);
  if (doc.getElementsByTagName('parsererror').length) doc = new DOMParser().parseFromString(text, 'text/html');
  return doc;
}

const byTag = (root, local) => [...root.getElementsByTagNameNS('*', local)];
const first = (root, local) => byTag(root, local)[0] || null;
const plain = (s) => (s || '').replace(/<[^>]+>/g, ' ').replace(/\s+/g, ' ').trim();

// ---------- Del EPUB a bloques de texto ----------

const BLOCK = new Set(['p', 'div', 'h1', 'h2', 'h3', 'h4', 'h5', 'h6', 'blockquote', 'li', 'pre', 'figure', 'figcaption', 'section', 'article', 'header', 'footer', 'aside', 'tr', 'dt', 'dd', 'table', 'ul', 'ol', 'dl', 'body', 'main', 'nav', 'address', 'center', 'caption']);
const SKIP = new Set(['script', 'style', 'head', 'title', 'noscript', 'template', 'rt', 'rp']);
const ITALIC = new Set(['em', 'i', 'cite', 'dfn', 'var']);
const BOLD = new Set(['strong', 'b']);

// Un capítulo (un archivo del EPUB) en bloques: { type, level, runs: [{ t, i, b }], center, src, anchors }.
function blocksOf(doc, file, imageOf) {
  const out = [];
  let cur = null;
  const style = { i: 0, b: 0 };
  const flush = () => {
    if (cur && cur.runs.some((r) => r.t.trim())) {
      // espacios sobrantes al principio y al final del bloque
      cur.runs[0].t = cur.runs[0].t.replace(/^\s+/, '');
      const last = cur.runs.at(-1);
      last.t = last.t.replace(/\s+$/, '');
      out.push(cur);
    } else if (cur?.anchors.length && out.length) out.at(-1).anchors.push(...cur.anchors);
    cur = null;
  };
  const open = (type, extra = {}) => {
    flush();
    cur = { type, runs: [], anchors: [], file, ...extra };
  };
  const ensure = () => cur || open('p');
  const centered = (el) => /center/i.test(el.getAttribute?.('class') || '') || /text-align:\s*center/i.test(el.getAttribute?.('style') || '') || el.localName === 'center';
  function walk(node, pre) {
    for (const n of node.childNodes) {
      if (n.nodeType === 3) {
        const t = pre ? n.data : n.data.replace(/\s+/g, ' ');
        if (!t) continue;
        if (!cur && !t.trim()) continue;
        ensure();
        const prev = cur.runs.at(-1);
        if (prev && prev.i === !!style.i && prev.b === !!style.b) prev.t += t;
        else cur.runs.push({ t, i: !!style.i, b: !!style.b });
        continue;
      }
      if (n.nodeType !== 1) continue;
      const tag = n.localName.toLowerCase();
      if (SKIP.has(tag)) continue;
      if (n.getAttribute('hidden') != null || /display:\s*none/i.test(n.getAttribute('style') || '')) continue;
      const id = n.getAttribute('id');
      if (tag === 'img' || tag === 'image') {
        const src = n.getAttribute('src') || n.getAttribute('href') || n.getAttributeNS('http://www.w3.org/1999/xlink', 'href');
        const img = src && imageOf(resolve(file, src));
        if (img) {
          flush();
          out.push({ type: 'img', src: img, alt: n.getAttribute('alt') || '', anchors: id ? [id] : [], file, runs: [] });
        }
        continue;
      }
      if (tag === 'br') {
        if (cur) cur.runs.push({ t: '\n', i: false, b: false });
        continue;
      }
      if (tag === 'hr') {
        flush();
        out.push({ type: 'hr', anchors: id ? [id] : [], file, runs: [] });
        continue;
      }
      if (tag === 'svg') {
        walk(n, pre);
        continue;
      }
      if (BLOCK.has(tag)) {
        const h = /^h([1-6])$/.exec(tag);
        if (h) open('h', { level: +h[1], center: true });
        else if (tag === 'blockquote') open('quote', { center: centered(n) });
        else if (tag === 'li') open('li', { center: false });
        else if (tag === 'pre') open('pre', { center: false });
        else open('p', { center: centered(n) });
        if (id) cur.anchors.push(id);
        walk(n, pre || tag === 'pre');
        flush();
        continue;
      }
      // en línea
      if (id) ensure().anchors.push(id);
      const it = ITALIC.has(tag), bo = BOLD.has(tag);
      if (it) style.i++;
      if (bo) style.b++;
      walk(n, pre);
      if (it) style.i--;
      if (bo) style.b--;
    }
  }
  const body = first(doc, 'body') || doc.documentElement;
  walk(body, false);
  flush();
  return out;
}

// Abre el EPUB: metadatos, portada, bloques de todos los capítulos e índice.
export async function readEpub(blob) {
  const z = await unzip(blob);
  const container = await z.text('META-INF/container.xml');
  const opfPath = container && first(parse(container, 'application/xml'), 'rootfile')?.getAttribute('full-path');
  const opfText = opfPath && (await z.text(opfPath));
  if (!opfText) throw new Error('Ese archivo no es un EPUB válido.');
  const opf = parse(opfText, 'application/xml');
  const meta = (local) => plain(first(opf, local)?.textContent);
  const manifest = new Map();
  for (const it of byTag(opf, 'item')) {
    manifest.set(it.getAttribute('id'), { href: resolve(opfPath, it.getAttribute('href') || ''), type: it.getAttribute('media-type') || '', props: it.getAttribute('properties') || '' });
  }
  const byHref = new Map([...manifest.values()].map((m) => [m.href, m]));

  // imágenes: se guardan como blob con su tamaño (hace falta para compaginar)
  const images = new Map();
  const imageOf = (path) => {
    const m = byHref.get(path);
    if (!m && !z.has(path)) return null;
    if (!images.has(path)) images.set(path, { path, type: m?.type || (/\.png$/i.test(path) ? 'image/png' : 'image/jpeg') });
    return images.get(path);
  };

  // portada
  let coverItem = [...manifest.values()].find((m) => /\bcover-image\b/.test(m.props));
  if (!coverItem) {
    const id = byTag(opf, 'meta').find((m) => m.getAttribute('name') === 'cover')?.getAttribute('content');
    coverItem = (id && manifest.get(id)) || [...manifest.values()].find((m) => m.type.startsWith('image/') && /cover/i.test(m.href));
  }
  let cover = null;
  if (coverItem?.type.startsWith('image/')) {
    const data = await z.read(coverItem.href);
    if (data) cover = new Blob([data], { type: coverItem.type });
  }

  // capítulos en el orden de lectura
  const spine = byTag(opf, 'itemref').map((r) => manifest.get(r.getAttribute('idref'))).filter((m) => m && /html|xml/.test(m.type));
  const blocks = [];
  const anchors = new Map();
  for (const item of spine) {
    const text = await z.text(item.href);
    if (!text) continue;
    const list = blocksOf(parse(text), item.href, imageOf);
    if (!list.length) continue;
    list[0].chapter = true;
    anchors.set(item.href, blocks.length);
    for (const b of list) {
      for (const a of b.anchors) anchors.set(`${item.href}#${a}`, blocks.length);
      blocks.push(b);
    }
  }
  // tamaño de cada imagen (y las diminutas, decorativas, se quitan)
  for (const img of images.values()) {
    const data = await z.read(img.path);
    if (!data) continue;
    img.blob = new Blob([data], { type: img.type });
    const bmp = await createImageBitmap(img.blob).catch(() => null);
    if (bmp) {
      img.w = bmp.width;
      img.h = bmp.height;
      bmp.close?.();
    }
  }
  const usable = blocks.filter((b) => b.type !== 'img' || (b.src.blob && b.src.w > 24 && b.src.h > 24));

  // índice: EPUB 3 (nav) o EPUB 2 (NCX)
  const toc = [];
  const target = (base, href) => {
    const path = resolve(base, href);
    const frag = href.includes('#') ? href.split('#')[1] : '';
    return anchors.get(frag ? `${path}#${frag}` : path) ?? anchors.get(path) ?? null;
  };
  const navItem = [...manifest.values()].find((m) => /\bnav\b/.test(m.props));
  if (navItem) {
    const nav = parse((await z.text(navItem.href)) || '<html/>');
    const tocNav = byTag(nav, 'nav').find((n) => /toc/.test(n.getAttribute('epub:type') || n.getAttributeNS('http://www.idpf.org/2007/ops', 'type') || '')) || first(nav, 'nav');
    const walkOl = (ol, into) => {
      for (const li of [...ol.children].filter((c) => c.localName === 'li')) {
        const a = [...li.children].find((c) => c.localName === 'a' || c.localName === 'span');
        const node = { title: plain(a?.textContent), block: a?.getAttribute('href') ? target(navItem.href, a.getAttribute('href')) : null, items: [] };
        const sub = [...li.children].find((c) => c.localName === 'ol');
        if (sub) walkOl(sub, node.items);
        if (node.title) into.push(node);
      }
    };
    const ol = tocNav && [...tocNav.children].find((c) => c.localName === 'ol');
    if (ol) walkOl(ol, toc);
  }
  if (!toc.length) {
    const ncxId = first(opf, 'spine')?.getAttribute('toc');
    const ncxItem = (ncxId && manifest.get(ncxId)) || [...manifest.values()].find((m) => /ncx/.test(m.type));
    const ncxText = ncxItem && (await z.text(ncxItem.href));
    if (ncxText) {
      const ncx = parse(ncxText, 'application/xml');
      const walkNp = (parent, into) => {
        for (const np of [...parent.children].filter((c) => c.localName === 'navPoint')) {
          const label = plain(first(np, 'text')?.textContent);
          const src = first(np, 'content')?.getAttribute('src');
          const node = { title: label, block: src ? target(ncxItem.href, src) : null, items: [] };
          walkNp(np, node.items);
          if (label) into.push(node);
        }
      };
      const map = first(ncx, 'navMap');
      if (map) walkNp(map, toc);
    }
  }
  return {
    title: meta('title'),
    author: byTag(opf, 'creator').map((c) => plain(c.textContent)).filter(Boolean).join(', '),
    language: meta('language'),
    description: meta('description'),
    year: (meta('date').match(/\d{4}/) || [])[0] || '',
    cover,
    blocks: usable,
    toc,
  };
}

// ---------- Compaginar ----------

let measureCtx = null;
const widths = new Map();
const fontOf = (size, i, b) => `${i ? 'italic ' : ''}${b ? 600 : 400} ${size}px ${FONT}`;
function measure(text, font) {
  const key = font + '|' + text;
  let w = widths.get(key);
  if (w === undefined) {
    measureCtx ??= document.createElement('canvas').getContext('2d');
    measureCtx.font = font;
    w = measureCtx.measureText(text).width;
    if (widths.size > 200000) widths.clear();
    widths.set(key, w);
  }
  return w;
}

// La letra de los EPUB va incluida en la app: se espera a que esté lista antes de compaginar.
export async function epubFonts() {
  await Promise.all([fontOf(12, 0, 0), fontOf(12, 1, 0), fontOf(12, 0, 1), fontOf(12, 1, 1)].map((f) => document.fonts.load(f, 'Aá'))).catch(() => {});
}

function blockStyle(b) {
  if (b.type === 'h') {
    const size = [20, 17, 14.5, 13, 12, 12][b.level - 1];
    return { size, lead: 1.25, bold: b.level >= 3, indent: 0, before: size * 1.4, after: size * 0.9, center: true };
  }
  if (b.type === 'quote') return { size: BODY * 0.93, lead: LEAD, indent: 0, side: BODY * 1.6, before: BODY * 0.6, after: BODY * 0.6, center: b.center };
  if (b.type === 'li') return { size: BODY, lead: LEAD, indent: 0, side: BODY * 1.4, bullet: true, before: BODY * 0.15, after: BODY * 0.15 };
  if (b.type === 'pre') return { size: BODY * 0.85, lead: 1.3, indent: 0, side: BODY, before: BODY * 0.5, after: BODY * 0.5, keep: true };
  return { size: BODY, lead: LEAD, indent: b.center ? 0 : BODY * 1.3, before: 0, after: 0, center: b.center };
}

// Palabras de un bloque. Una palabra puede tener partes con distinto estilo («*Quijote*,»): van pegadas.
// Los saltos de línea forzados van como { br: true }.
function wordsOf(b) {
  const out = [];
  let cur = null;
  const end = () => {
    if (cur) out.push(cur);
    cur = null;
  };
  for (const r of b.runs) {
    for (const p of r.t.split(/(\n|\s+)/)) {
      if (!p) continue;
      if (p === '\n') {
        end();
        out.push({ br: true });
      } else if (/^\s+$/.test(p)) end();
      else (cur ??= { parts: [] }).parts.push({ t: p, i: r.i, b: r.b });
    }
  }
  end();
  return out;
}

// Reparte los bloques en páginas. Cada página: { ops (lo que se dibuja), items (el texto, como PDF.js), folio }.
export function layoutEpub(book, page = EPUB_PAGE) {
  const { w: W, h: H } = page;
  const pages = [];
  const blockPage = new Array(book.blocks.length).fill(1);
  const top = H * M.top, bottom = H * (1 - M.bottom);
  const textW = W * (1 - M.inner - M.outer);
  const leftOf = (n) => W * (n % 2 === 1 ? M.inner : M.outer);
  let pg = null, y = 0;
  const newPage = () => {
    pg = { ops: [], items: [], folio: pages.length + 1 };
    pages.push(pg);
    y = top;
  };
  newPage();
  const empty = () => !pg.ops.length;
  let prev = null;

  book.blocks.forEach((b, bi) => {
    if (b.chapter && bi > 0 && !empty()) newPage();
    if (b.type === 'img') {
      const k = Math.min(1, textW / b.src.w, (bottom - top) / b.src.h);
      const dw = b.src.w * k, dh = b.src.h * k;
      if (y + dh > bottom + 0.5) newPage();
      blockPage[bi] = pages.length;
      pg.ops.push({ k: 'img', src: b.src, x: leftOf(pages.length) + (textW - dw) / 2, y, w: dw, h: dh });
      y += dh + BODY * 0.6;
      prev = 'img';
      return;
    }
    if (b.type === 'hr') {
      if (y + BODY * 3 > bottom) newPage();
      blockPage[bi] = pages.length;
      const w = measure('⁂', fontOf(BODY, 0, 0));
      pg.ops.push({ k: 't', s: '⁂', x: leftOf(pages.length) + (textW - w) / 2, y: y + BODY * 1.9, z: BODY, i: false, b: false });
      y += BODY * 3;
      prev = 'hr';
      return;
    }
    const st = blockStyle(b);
    const lh = st.size * st.lead;
    const font = (p) => fontOf(st.size, p.i, p.b || st.bold);
    // un título no queda solo al pie de la página
    if (b.type === 'h' && y + st.before + lh * 3 > bottom) newPage();
    if (y > top) y += st.before;
    else if (b.type === 'h' && b.chapter) y += (bottom - top) * 0.12; // los capítulos empiezan más abajo, como en un libro
    blockPage[bi] = pages.length;
    const words = wordsOf(b);
    for (const wd of words) if (!wd.br) wd.w = wd.parts.reduce((s, p) => s + measure(p.t, font(p)), 0);
    const sp = measure(' ', fontOf(st.size, 0, 0));
    const side = st.side || 0;
    let indent = b.type === 'p' && prev === 'p' ? st.indent : 0;
    let firstLine = true;
    let line = [], lineW = 0;
    const avail = () => textW - side * (st.bullet ? 1 : 2) - indent;
    const emit = (last) => {
      if (!line.length) return;
      if (y + lh > bottom + 0.5) newPage();
      const left = leftOf(pages.length) + side + indent;
      const natural = lineW;
      let gap = sp, x = left;
      if (st.center) x = left + (avail() - natural) / 2;
      else if (!last && line.length > 1 && !st.keep) gap = sp + (avail() - natural) / (line.length - 1);
      const base = y + st.size * 0.8;
      if (st.bullet && firstLine) pg.ops.push({ k: 't', s: '•', x: left - st.size * 0.9, y: base, z: st.size, i: false, b: false });
      const x0 = x;
      const text = [];
      line.forEach((wd, k) => {
        let px = x;
        for (const p of wd.parts) {
          pg.ops.push({ k: 't', s: p.t, x: px, y: base, z: st.size, i: p.i, b: p.b || st.bold });
          px += measure(p.t, font(p));
        }
        text.push(wd.parts.map((p) => p.t).join(''));
        x += wd.w + (k < line.length - 1 ? gap : 0);
      });
      const p0 = line[0].parts[0];
      pg.items.push({
        str: text.join(' '),
        dir: 'ltr',
        width: x - x0,
        height: st.size,
        transform: [st.size, 0, 0, st.size, x0, H - base],
        fontName: `bib-${p0.i ? 'i' : 'r'}${p0.b || st.bold ? 'b' : ''}`,
        hasEOL: true,
      });
      y += lh;
      line = [];
      lineW = 0;
      indent = 0;
      firstLine = false;
    };
    for (const wd of words) {
      if (wd.br) {
        emit(true);
        continue;
      }
      // palabra más ancha que la línea (una dirección web larga): se corta en trozos
      while (wd.w > avail() && wd.parts.length === 1 && wd.parts[0].t.length > 1) {
        emit(false);
        const p = wd.parts[0];
        let n = p.t.length - 1;
        while (n > 1 && measure(p.t.slice(0, n), font(p)) > avail()) n--;
        const head = { parts: [{ ...p, t: p.t.slice(0, n) }] };
        head.w = measure(head.parts[0].t, font(p));
        line.push(head);
        lineW = head.w;
        emit(false);
        p.t = p.t.slice(n);
        wd.w = measure(p.t, font(p));
      }
      if (line.length && lineW + sp + wd.w > avail()) emit(false);
      line.push(wd);
      lineW += (line.length > 1 ? sp : 0) + wd.w;
    }
    emit(true);
    y += st.after;
    prev = b.type;
  });
  if (pages.length > 1 && empty()) pages.pop();
  return { pages, blockPage, page };
}

// ---------- El documento (como uno de PDF.js) ----------

const STYLES = Object.fromEntries(['r', 'i', 'rb', 'ib'].map((k) => [`bib-${k}`, { fontFamily: FONT, ascent: 0.78, descent: -0.22, vertical: false }]));

export async function openEpub(blob) {
  await epubFonts();
  const book = await readEpub(blob);
  const lay = layoutEpub(book);
  const { w: W, h: H } = lay.page;
  const bitmaps = new Map();
  const bitmap = async (src) => {
    if (!bitmaps.has(src.path)) {
      if (bitmaps.size > 6) {
        const [k, v] = bitmaps.entries().next().value;
        bitmaps.delete(k);
        v.then((b) => b?.close?.());
      }
      bitmaps.set(src.path, createImageBitmap(src.blob).catch(() => null));
    }
    return bitmaps.get(src.path);
  };
  const toPage = (block) => (block == null ? null : lay.blockPage[block] - 1);
  const outline = (nodes) => nodes.map((n) => ({ title: n.title, dest: n.block == null ? null : [toPage(n.block)], items: outline(n.items) }));
  const viewport = ({ scale = 1, offsetX = 0, offsetY = 0 } = {}) => ({
    width: W * scale,
    height: H * scale,
    scale,
    rotation: 0,
    transform: [scale, 0, 0, -scale, offsetX, H * scale + offsetY],
  });
  return {
    format: 'epub',
    book,
    layout: lay,
    numPages: lay.pages.length,
    async getPage(n) {
      const pg = lay.pages[n - 1];
      if (!pg) throw new Error('No existe la página ' + n);
      return {
        view: [0, 0, W, H],
        getViewport: viewport,
        async getTextContent() {
          return { items: pg.items, styles: STYLES };
        },
        render({ canvasContext: ctx, viewport: vp }) {
          let cancelled = false;
          const promise = (async () => {
            const [s, , , , ox, oy] = vp.transform;
            const X = (x) => ox + x * s;
            const Y = (yTop) => oy - (H - yTop) * s;
            ctx.save();
            ctx.textBaseline = 'alphabetic';
            ctx.fillStyle = INK;
            for (const op of pg.ops) {
              if (cancelled) break;
              if (op.k === 't') {
                ctx.font = fontOf(op.z * s, op.i, op.b);
                ctx.fillText(op.s, X(op.x), Y(op.y));
              } else if (op.k === 'img') {
                const bmp = await bitmap(op.src);
                if (bmp && !cancelled) ctx.drawImage(bmp, X(op.x), Y(op.y), op.w * s, op.h * s);
              }
            }
            // número de página al pie
            if (pg.folio > 1) {
              ctx.font = fontOf(8.5 * s, false, false);
              ctx.fillStyle = 'rgba(29, 22, 16, 0.7)';
              const t = String(pg.folio);
              ctx.fillText(t, X(W / 2) - ctx.measureText(t).width / 2, Y(H * (1 - M.bottom * 0.45)));
            }
            ctx.restore();
            if (cancelled) {
              const err = new Error('cancelado');
              err.name = 'RenderingCancelledException';
              throw err;
            }
          })();
          return { promise, cancel: () => (cancelled = true) };
        },
        cleanup() {},
      };
    },
    async getOutline() {
      return outline(book.toc);
    },
    async getDestination() {
      return null;
    },
    async getPageIndex() {
      return 0;
    },
    async getMetadata() {
      return { info: { Title: book.title, Author: book.author } };
    },
    destroy() {
      for (const b of bitmaps.values()) b.then((x) => x?.close?.());
      bitmaps.clear();
    },
  };
}

// Encuadre de un EPUB: la página entera (los márgenes ya son de libro). En hoja completa se recorta al texto.
export const epubFrame = () => ({ v: 1, w: EPUB_PAGE.w, h: EPUB_PAGE.h, odd: [0, 0, EPUB_PAGE.w, EPUB_PAGE.h], even: [0, 0, EPUB_PAGE.w, EPUB_PAGE.h] });
