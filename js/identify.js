// Identifica el libro a partir del PDF (metadatos, nombre del archivo o texto de la portada)
// consultando Google Books y Open Library, y obtiene su portada original.
import { clamp, hashStr, hslToHex, rgbToHsl, PALETTE } from './textures.js';

const STOP = new Set('el la los las lo de del y e o u a en un una unos unas por para con sin al se su sus the of and an to in on for with by from at or'.split(' '));

const norm = (s) =>
  (s || '')
    .toLowerCase()
    .normalize('NFD')
    .replace(/[̀-ͯ]/g, '')
    .replace(/[^a-z0-9 ]+/g, ' ')
    .replace(/\s+/g, ' ')
    .trim();

const tokens = (s) => norm(s).split(' ').filter((w) => w.length > 1 && !STOP.has(w));

export function cleanFileName(name) {
  return (name || '')
    .replace(/\.pdf$/i, '')
    .replace(/\((z-?lib(rary)?(\.\w+)?|libgen[^)]*|ebook|pdf|epub|www\.[^)]*)\)/gi, ' ')
    .replace(/z-?library|libgen(\.\w+)?|annas?[- ]archive|\bebook\b|\bepub\b|\bpdf\b|www\.\S+/gi, ' ')
    .replace(/\[[^\]]*\]|\{[^}]*\}/g, ' ')
    .replace(/[_.]+/g, ' ')
    .replace(/\s+/g, ' ')
    .trim();
}

function validMeta(s) {
  if (!s || typeof s !== 'string') return '';
  s = s.trim();
  if (s.length < 3) return '';
  if (/microsoft|word -|untitled|sin t[ií]tulo|^documento?\s*\d*$|\.(docx?|pdf|indd|tex|qxd|rtf)$|adobe|acrobat|^\d+$|^[\w-]+\.\w{2,4}$/i.test(s)) return '';
  return s;
}

async function getJSON(url, ms = 9000) {
  const ctl = new AbortController();
  const t = setTimeout(() => ctl.abort(), ms);
  try {
    const r = await fetch(url, { signal: ctl.signal });
    return r.ok ? await r.json() : null;
  } catch {
    return null;
  } finally {
    clearTimeout(t);
  }
}

async function searchGoogle({ title, author, q }) {
  const query = q || [`intitle:${title}`, author && `inauthor:${author}`].filter(Boolean).join(' ');
  const j = await getJSON(`https://www.googleapis.com/books/v1/volumes?q=${encodeURIComponent(query)}&maxResults=6&printType=books`);
  return (j?.items || []).map((it) => {
    const v = it.volumeInfo || {};
    const ids = v.industryIdentifiers || [];
    const isbn = (ids.find((x) => x.type === 'ISBN_13') || ids.find((x) => x.type === 'ISBN_10'))?.identifier;
    const covers = [];
    if (isbn) covers.push(`https://covers.openlibrary.org/b/isbn/${isbn}-L.jpg?default=false`);
    const links = v.imageLinks || {};
    const img = links.extraLarge || links.large || links.medium || links.small || links.thumbnail;
    if (img) covers.push(img.replace(/^http:/, 'https:').replace(/&edge=curl/, ''));
    return {
      title: v.title || '',
      author: (v.authors || []).join(', '),
      year: (v.publishedDate || '').slice(0, 4),
      subjects: v.categories || [],
      pages: v.pageCount || 0,
      description: v.description || '',
      covers,
    };
  });
}

async function searchOpenLibrary({ title, author, q }) {
  const params = new URLSearchParams({ limit: '6', fields: 'title,author_name,first_publish_year,cover_i,subject,number_of_pages_median' });
  if (q) params.set('q', q);
  else {
    params.set('title', title);
    if (author) params.set('author', author);
  }
  const j = await getJSON(`https://openlibrary.org/search.json?${params}`);
  return (j?.docs || []).map((d) => ({
    title: d.title || '',
    author: (d.author_name || []).slice(0, 2).join(', '),
    year: d.first_publish_year ? String(d.first_publish_year) : '',
    subjects: (d.subject || []).slice(0, 15),
    pages: d.number_of_pages_median || 0,
    description: '',
    covers: d.cover_i ? [`https://covers.openlibrary.org/b/id/${d.cover_i}-L.jpg`] : [],
  }));
}

function score(queryText, c, pageCount) {
  const qt = new Set(tokens(queryText));
  const tt = tokens(c.title);
  if (!tt.length || !qt.size) return 0;
  const at = tokens(c.author);
  const titleHit = tt.filter((t) => qt.has(t)).length / tt.length;
  const all = new Set([...tt, ...at]);
  const coverage = [...qt].filter((t) => all.has(t)).length / qt.size;
  let s = titleHit * 0.55 + coverage * 0.35 + (at.some((t) => qt.has(t)) ? 0.1 : 0);
  if (c.covers.length) s += 0.06;
  if (pageCount && c.pages) {
    const r = c.pages / pageCount;
    if (r > 0.75 && r < 1.35) s += 0.06;
  }
  return s;
}

const sameBook = (a, b) => {
  const ta = tokens(a.title);
  const tb = new Set(tokens(b.title));
  return ta.length > 0 && ta.filter((t) => tb.has(t)).length / ta.length >= 0.7;
};

const prettify = (s) => s.replace(/\s+-\s+/g, ' — ');

export async function identify({ meta, fileName, textGuess, pageCount, override }) {
  const mt = validMeta(meta?.Title);
  const ma = validMeta(meta?.Author);
  const fn = cleanFileName(fileName);
  const attempts = [];
  if (override) {
    const text = `${override.title} ${override.author || ''}`.trim();
    attempts.push({ title: override.title, author: override.author, text }, { q: text, text });
  } else {
    if (mt) attempts.push({ title: mt, author: ma, text: `${mt} ${ma}` });
    if (fn) attempts.push({ q: fn, text: fn });
    if (textGuess && textGuess !== fn) attempts.push({ q: textGuess, text: textGuess });
  }

  for (const a of attempts) {
    const [g, o] = await Promise.all([searchGoogle(a), searchOpenLibrary(a)]);
    const ranked = [...g, ...o].map((c) => ({ c, s: score(a.text, c, pageCount) })).sort((x, y) => y.s - x.s);
    if (!ranked.length || ranked[0].s < 0.5) continue;
    const best = ranked[0].c;
    const twins = ranked.map((r) => r.c).filter((c) => c === best || sameBook(c, best));
    // Las portadas de Open Library son de mayor resolución: van primero.
    const covers = [...new Set(twins.flatMap((c) => c.covers))].sort((x, y) => (y.includes('openlibrary') ? 1 : 0) - (x.includes('openlibrary') ? 1 : 0));
    const years = twins.map((c) => parseInt(c.year, 10)).filter((y) => y > 0);
    return {
      found: true,
      title: best.title,
      author: best.author || twins.find((c) => c.author)?.author || ma,
      year: years.length ? String(Math.min(...years)) : '',
      subjects: [...new Set(twins.flatMap((c) => c.subjects))],
      description: twins.find((c) => c.description)?.description || '',
      covers,
    };
  }

  return {
    found: false,
    title: override?.title || mt || prettify(fn) || textGuess || 'Sin título',
    author: override?.author || ma || '',
    year: '',
    subjects: [],
    description: '',
    covers: [],
  };
}

export async function fetchCover(urls) {
  for (const u of urls) {
    const ctl = new AbortController();
    const t = setTimeout(() => ctl.abort(), 10000);
    try {
      const r = await fetch(u, { mode: 'cors', signal: ctl.signal });
      if (!r.ok) continue;
      const blob = await r.blob();
      if (!blob.type.startsWith('image/') || blob.size < 3000) continue;
      const bmp = await createImageBitmap(blob);
      if (bmp.width < 80 || bmp.height < 100) continue;
      return { blob, w: bmp.width, h: bmp.height };
    } catch {
      /* siguiente candidato */
    } finally {
      clearTimeout(t);
    }
  }
  return null;
}

const CATEGORY_HINTS = [
  [/classic|cl[aá]sic/i, 'Clásicos'],
  [/business|econom|financ|negocio|management|gesti[oó]n|invest|inversi|marketing|empresa|money|dinero|leadership|liderazgo/i, 'Negocios'],
  [/philosoph|filosof|ethic|[ée]tica|stoic|estoic|metaphys/i, 'Filosofía'],
  [/self-help|autoayuda|psycholog|psicolog|habit|h[aá]bito|motivat|crecimiento personal|success|[ée]xito|personal development|desarrollo personal/i, 'Desarrollo personal'],
  [/histor|biograph|biograf|memoir|memorias|\bwar\b|guerra/i, 'Historia'],
  [/science|ciencia|physic|f[ií]sica|biolog|chemis|qu[ií]mica|mathemat|matem|astronom/i, 'Ciencia'],
  [/novel|fiction|ficci|novela|cuento|relato|literatura|literary|romance|thriller|mystery|fantas/i, 'Novela'],
];

export function suggestCategory(subjects, categories) {
  const text = subjects.join(' | ');
  if (!text) return '';
  for (const [re, name] of CATEGORY_HINTS) {
    if (!re.test(text)) continue;
    const cat = categories.find((c) => norm(c.name) === norm(name));
    if (cat) return cat.id;
  }
  const nt = norm(text);
  return categories.find((c) => nt.includes(norm(c.name)))?.id || '';
}

// Color de la tela de la tapa (tono profundo sacado de la portada) y de la cinta.
export async function coverPalette(blob) {
  const bmp = await createImageBitmap(blob);
  const c = document.createElement('canvas');
  c.width = 24;
  c.height = 36;
  const g = c.getContext('2d', { willReadFrequently: true });
  g.drawImage(bmp, 0, 0, 24, 36);
  const d = g.getImageData(0, 0, 24, 36).data;
  let r = 0, gg = 0, b = 0, w = 0;
  for (let i = 0; i < d.length; i += 4) {
    const [, s, l] = rgbToHsl(d[i], d[i + 1], d[i + 2]);
    const wt = 0.08 + s * s * 2 * (l > 0.08 && l < 0.92 ? 1 : 0.1);
    r += d[i] * wt;
    gg += d[i + 1] * wt;
    b += d[i + 2] * wt;
    w += wt;
  }
  let [h, s, l] = rgbToHsl(r / w, gg / w, b / w);
  s = clamp(s * 1.05, 0.14, 0.55);
  l = clamp(l * 0.5, 0.13, 0.26);
  const reddish = (h < 0.07 || h > 0.9) && s > 0.25;
  return { color: hslToHex(h, s, l), ribbon: reddish ? '#b08a3e' : '#7d1d2a' };
}

export function fallbackPalette(title) {
  const color = PALETTE[hashStr(title || '') % PALETTE.length];
  return { color, ribbon: color === '#5a1a1f' || color === '#4a1c2a' ? '#b08a3e' : '#7d1d2a' };
}
