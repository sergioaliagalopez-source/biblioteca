// Idioma de la app: español o inglés (según el dispositivo, o el que se elija en el menú).
// Los textos están escritos en español en el código; en inglés se traducen al aparecer en pantalla con el
// diccionario de i18n-en.js. Las partes variables ({}) —un título, un número— se conservan. Lo que es del
// lector (el texto de los libros, títulos, notas) no se toca.
import EN from './i18n-en.js';
import { prefs } from './db.js';

export const LANG = (() => {
  const p = prefs.get('bib.lang');
  if (p === 'es' || p === 'en') return p;
  return /^es\b/i.test(navigator.language || '') || (navigator.languages || []).slice(0, 1).some((l) => /^es\b/i.test(l)) ? 'es' : 'en';
})();
export const LOCALE = LANG === 'es' ? 'es' : 'en-US';

export function setLang(lang) {
  prefs.set('bib.lang', lang);
  location.reload();
}

const exact = new Map();
const patterns = [];
const clean = (s) => s.replace(/\s+/g, ' ').trim();
if (LANG === 'en') {
  for (const [es, en] of Object.entries(EN)) {
    if (!es.includes('{}')) {
      exact.set(es, en);
      continue;
    }
    // «{} ya está en tu estantería» → /^«(.+?)» ya está en tu estantería$/
    const re = new RegExp('^' + es.split('{}').map((p) => p.replace(/[.*+?^${}()|[\]\\]/g, '\\$&')).join('([\\s\\S]+?)') + '$');
    const n = es.split('{}').length - 1;
    let k = 0;
    const out = en.replace(/\{(\d*)\}/g, (_, d) => `$${d || ++k}`);
    patterns.push({ re, out, n, len: es.length });
  }
  // los más largos primero: así una frase gana a un trozo suelto
  patterns.sort((a, b) => b.len - a.len);
}

// Traduce un texto completo de la interfaz (si no está en el diccionario, queda igual).
export function tr(text) {
  if (LANG === 'es' || !text) return text;
  const key = clean(text);
  if (!key) return text;
  let out = exact.get(key);
  if (out == null) {
    for (const p of patterns) {
      if (p.re.test(key)) {
        // las partes variables también pueden ser textos de la interfaz («Mover a {}»)
        out = key.replace(p.re, (...m) => p.out.replace(/\$(\d+)/g, (_, i) => tr(m[+i]) ?? ''));
        break;
      }
    }
  }
  // frases armadas con « · » («Según el fondo · Chimenea»): cada parte por separado
  if (out == null && key.includes(' · ')) {
    const parts = key.split(' · ');
    const done = parts.map((p) => tr(p));
    if (done.some((p, i) => p !== parts[i])) out = done.join(' · ');
  }
  if (out == null) return text;
  const [, lead, , trail] = text.match(/^(\s*)([\s\S]*?)(\s*)$/);
  return lead + out + trail;
}

// Para el código: t('Página {} de {}', 3, 10) → en el idioma de la app, con los valores puestos.
export function t(text, ...vals) {
  let k = 0;
  const filled = text.replace(/\{\}/g, () => String(vals[k++] ?? ''));
  return LANG === 'es' ? filled : tr(filled);
}

// ---------- Traducción de la pantalla ----------

// lo que es del lector: el texto de los libros, títulos, notas, citas, definiciones e índices
const SKIP = '.text-layer, .tm-flow, .tm-title, #rTitle, #rAuthor, [data-noi18n], script, style, textarea, .hl-item q, .hl-item .note, .dict-list, .toc-item, .st-book .t, .tip h4, .tip .by';
const ATTRS = ['title', 'aria-label', 'placeholder', 'alt'];

function translateNode(node) {
  if (node.nodeType === 3) {
    const parent = node.parentElement;
    if (!parent || parent.closest(SKIP)) return;
    const v = node.data;
    if (!/\p{L}/u.test(v)) return;
    const out = tr(v);
    if (out !== v) node.data = out;
    return;
  }
  if (node.nodeType !== 1 || node.closest(SKIP)) return;
  translateAttrs(node);
  const walker = document.createTreeWalker(node, NodeFilter.SHOW_TEXT | NodeFilter.SHOW_ELEMENT, {
    acceptNode: (n) => (n.nodeType === 1 && n.matches(SKIP) ? NodeFilter.FILTER_REJECT : NodeFilter.FILTER_ACCEPT),
  });
  let n;
  while ((n = walker.nextNode())) {
    if (n.nodeType === 1) translateAttrs(n);
    else translateNode(n);
  }
}

function translateAttrs(el) {
  for (const a of ATTRS) {
    const v = el.getAttribute(a);
    if (v && /\p{L}/u.test(v)) {
      const out = tr(v);
      if (out !== v) el.setAttribute(a, out);
    }
  }
}

// Traduce lo que ya está y todo lo que vaya apareciendo (ventanas, avisos, menús…).
export function startTranslation() {
  document.documentElement.lang = LANG;
  if (LANG === 'es') return;
  translateNode(document.body);
  new MutationObserver((list) => {
    for (const m of list) {
      if (m.type === 'childList') m.addedNodes.forEach(translateNode);
      else if (m.type === 'characterData') translateNode(m.target);
      else if (m.type === 'attributes' && m.target.nodeType === 1 && !m.target.closest(SKIP)) {
        const v = m.target.getAttribute(m.attributeName);
        if (v) {
          const out = tr(v);
          if (out !== v) m.target.setAttribute(m.attributeName, out);
        }
      }
    }
  }).observe(document.body, { subtree: true, childList: true, characterData: true, attributes: true, attributeFilter: ATTRS });
}
