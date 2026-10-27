// Diccionario: significado de una palabra desde Wikcionario (en español; si no está, el inglés).
// Las formas como «dioses» o «tenía» se siguen hasta la palabra base («dios», «tener»).

const clean = (w) => w.normalize('NFC').replace(/^[^\p{L}]+|[^\p{L}]+$/gu, '');

async function spanish(word) {
  const url = `https://es.wiktionary.org/w/api.php?action=query&prop=extracts&explaintext=1&redirects=1&format=json&origin=*&titles=${encodeURIComponent(word)}`;
  const data = await fetch(url).then((r) => r.json());
  const page = Object.values(data?.query?.pages || {})[0];
  const section = (page?.extract || '').split(/\n== /).find((s) => s.startsWith('Español =='));
  if (!section) return null;
  const out = [];
  let kind = '';
  const lines = section.split('\n').map((l) => l.trim());
  for (let i = 0; i < lines.length; i++) {
    const h = lines[i].match(/^={3,4}\s*(.+?)\s*={3,4}$/);
    if (h) {
      kind = /etimolog|traducc|pronunc|véase|informaci|referenc|locucion|refranes|conjugaci/i.test(h[1]) ? '' : h[1].replace(/\s*\d+$/, '');
      continue;
    }
    // «1» o «1 Religión» (número y, a veces, el ámbito), y en la línea siguiente la definición
    const n = lines[i].match(/^\d+(?:\s+(.+))?$/);
    if (kind && n && lines[i + 1]) out.push({ kind, text: lines[i + 1], area: n[1] || '' });
  }
  return out.length ? { word: page.title, defs: out.slice(0, 6) } : null;
}

async function english(word) {
  const data = await fetch(`https://en.wiktionary.org/api/rest_v1/page/definition/${encodeURIComponent(word)}`).then((r) => (r.ok ? r.json() : null));
  const defs = [];
  for (const entry of data?.en || []) {
    for (const d of entry.definitions || []) {
      const text = new DOMParser().parseFromString(d.definition || '', 'text/html').body.textContent.trim();
      if (text) defs.push({ kind: entry.partOfSpeech, text });
    }
  }
  return defs.length ? { word, defs: defs.slice(0, 6), lang: 'en' } : null;
}

// Devuelve { word, defs: [{ kind, text }], lang } o null si no hay nada.
export async function define(raw) {
  const word = clean(raw);
  if (!word) return null;
  for (const w of [word, word.toLowerCase()]) {
    const r = await spanish(w).catch(() => null);
    if (!r) continue;
    // «Forma del plural de dios.», «Primera persona del singular … de tener.» → la palabra base
    const base = r.defs.every((d) => /^(forma|primera|segunda|tercera|participio|gerundio|femenino|plural)\b/i.test(d.text)) && r.defs[0].text.match(/ de ([\p{L}]+)\.?$/u)?.[1];
    if (base && base !== w) {
      const b = await spanish(base).catch(() => null);
      if (b) return { ...b, from: r.word, lang: 'es' };
    }
    return { ...r, lang: 'es' };
  }
  return english(word.toLowerCase()).catch(() => null);
}

export const raeUrl = (word) => `https://dle.rae.es/${encodeURIComponent(clean(word).toLowerCase())}`;
