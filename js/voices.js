// Voces para leer en voz alta: las del sistema, ordenadas de la más natural a la más robótica.
// Se recuerda la voz elegida para cada idioma (español e inglés) y la velocidad.
import { prefs } from './db.js';

const LANGS = ['es', 'en'];
const synth = () => window.speechSynthesis;

// Calidad según el nombre o el identificador de la voz: las «Premium», «Mejorada» y «Natural» suenan casi humanas.
export function quality(v) {
  const id = `${v.name} ${v.voiceURI}`.toLowerCase();
  if (/premium/.test(id)) return { rank: 4, label: 'Premium' };
  if (/natural|neural/.test(id)) return { rank: 4, label: 'Natural' };
  if (/enhanced|mejorada/.test(id)) return { rank: 3, label: 'Mejorada' };
  if (/google|online/.test(id)) return { rank: 2, label: '' };
  return { rank: v.localService === false ? 2 : 1, label: '' };
}

const langOf = (v) => v.lang.toLowerCase().slice(0, 2);

// Voces en español e inglés, las mejores primero.
export function listVoices() {
  const all = synth()?.getVoices() || [];
  return all
    .filter((v) => LANGS.includes(langOf(v)))
    .sort((a, b) => LANGS.indexOf(langOf(a)) - LANGS.indexOf(langOf(b)) || quality(b).rank - quality(a).rank || a.name.localeCompare(b.name));
}

// La voz para leer un libro en ese idioma: la elegida, o la mejor que haya.
export function voiceFor(lang) {
  const list = listVoices().filter((v) => langOf(v) === lang);
  const saved = prefs.get(`bib.voice.${lang}`);
  return list.find((v) => v.voiceURI === saved) || list[0] || null;
}

export function setVoice(v) {
  prefs.set(`bib.voice.${langOf(v)}`, v.voiceURI);
}

export const speechRate = () => +prefs.get('bib.rate') || 1;
export const setSpeechRate = (r) => prefs.set('bib.rate', String(r));

// Nombre corto para mostrar: «Mónica · Mejorada» (sin la calidad repetida entre paréntesis).
export function voiceLabel(v) {
  const q = quality(v).label;
  const name = v.name.replace(/\s*\((enhanced|premium|mejorada|natural)\)/i, '').replace(/^Microsoft\s+/i, '').replace(/\s+Online\b/i, '');
  return `${name}${q ? ` · ${q}` : ''}`;
}

// ¿Hay alguna voz de buena calidad instalada para ese idioma?
export const hasGoodVoice = (lang) => listVoices().some((v) => langOf(v) === lang && quality(v).rank >= 3);

export function sample(v) {
  const s = synth();
  if (!s || !v) return;
  s.cancel();
  const u = new SpeechSynthesisUtterance(langOf(v) === 'en' ? 'This is how your books will sound.' : 'Así sonará la lectura de tus libros.');
  u.voice = v;
  u.lang = v.lang;
  u.rate = speechRate();
  s.speak(u);
}

// Las voces llegan un poco después de abrir la app (sobre todo en Chrome y Safari).
export function onVoices(fn) {
  synth()?.addEventListener?.('voiceschanged', fn);
}
