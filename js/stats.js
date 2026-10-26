// Estadísticas de lectura: segundos leídos por día (para el total y la racha de días seguidos).
// Los libros terminados y el tiempo de cada libro van en el propio libro (finishedAt, readSeconds).
// Se guardan en este dispositivo y viajan en la copia de seguridad.
import { prefs } from './db.js';

const KEY = 'bib.stats';
const MIN_DAY = 60; // un día cuenta para la racha con al menos un minuto de lectura

const read = () => {
  try {
    return JSON.parse(prefs.get(KEY) || '{}');
  } catch {
    return {};
  }
};
const write = (s) => prefs.set(KEY, JSON.stringify(s));

export const dayKey = (d = new Date()) => `${d.getFullYear()}-${String(d.getMonth() + 1).padStart(2, '0')}-${String(d.getDate()).padStart(2, '0')}`;
const shift = (d, n) => {
  const x = new Date(d);
  x.setDate(x.getDate() + n);
  return x;
};

// «12 min», «1 h 05 min»
export function duration(sec) {
  const m = Math.round(sec / 60);
  if (m < 60) return `${m} min`;
  return `${Math.floor(m / 60)} h ${String(m % 60).padStart(2, '0')} min`;
}

export const stats = {
  raw: read,
  addSeconds(sec) {
    const s = read();
    s.days ??= {};
    const k = dayKey();
    s.days[k] = Math.round((s.days[k] || 0) + sec);
    write(s);
  },
  // Une con las estadísticas de una copia de seguridad: por cada día queda el mayor tiempo.
  merge(other) {
    const s = read();
    s.days ??= {};
    for (const [k, v] of Object.entries(other?.days || {})) s.days[k] = Math.max(s.days[k] || 0, v);
    write(s);
  },
  summary(books) {
    const days = read().days || {};
    const today = new Date();
    // La racha sigue viva si hoy todavía no leíste pero ayer sí.
    let d = (days[dayKey(today)] || 0) >= MIN_DAY ? today : shift(today, -1);
    let streak = 0;
    while ((days[dayKey(d)] || 0) >= MIN_DAY) {
      streak++;
      d = shift(d, -1);
    }
    let best = 0, run = 0, prev = null;
    for (const k of Object.keys(days).filter((k) => days[k] >= MIN_DAY).sort()) {
      run = prev && dayKey(shift(new Date(`${prev}T12:00`), 1)) === k ? run + 1 : 1;
      best = Math.max(best, run);
      prev = k;
    }
    const last = Array.from({ length: 14 }, (_, i) => {
      const day = shift(today, i - 13);
      return { day, sec: days[dayKey(day)] || 0 };
    });
    return {
      today: days[dayKey(today)] || 0,
      week: last.slice(-7).reduce((a, x) => a + x.sec, 0),
      total: Object.values(days).reduce((a, v) => a + v, 0),
      streak,
      best: Math.max(best, streak),
      last,
      finished: books.filter((b) => b.finishedAt).length,
    };
  },
};
