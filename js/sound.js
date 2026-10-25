// Sonidos sintetizados con Web Audio (sin archivos): hoja que pasa, "ping" de la cinta
// y ambientes tranquilos (lluvia en la ventana o chimenea).

let ctx = null;
let master = null;
const buffers = {};
const ambient = { mode: 'off', nodes: [], timer: null };

function audio() {
  if (!ctx) {
    const AC = window.AudioContext || window.webkitAudioContext;
    if (!AC) return null;
    ctx = new AC();
    master = ctx.createGain();
    master.gain.value = 0.8;
    master.connect(ctx.destination);
  }
  if (ctx.state === 'suspended') ctx.resume();
  return ctx;
}

function noise(type, seconds) {
  const key = type + seconds;
  if (buffers[key]) return buffers[key];
  const c = audio();
  const len = Math.floor(c.sampleRate * seconds);
  const buf = c.createBuffer(1, len, c.sampleRate);
  const d = buf.getChannelData(0);
  let last = 0, b0 = 0, b1 = 0, b2 = 0;
  for (let i = 0; i < len; i++) {
    const w = Math.random() * 2 - 1;
    if (type === 'brown') {
      last = (last + 0.02 * w) / 1.02;
      d[i] = last * 3.5;
    } else if (type === 'pink') {
      b0 = 0.99765 * b0 + w * 0.099046;
      b1 = 0.963 * b1 + w * 0.2965164;
      b2 = 0.57 * b2 + w * 1.0526913;
      d[i] = (b0 + b1 + b2 + w * 0.1848) * 0.18;
    } else d[i] = w;
  }
  buffers[key] = buf;
  return buf;
}

function loop(type, filters, gain) {
  const c = audio();
  const src = c.createBufferSource();
  src.buffer = noise(type, 4);
  src.loop = true;
  let node = src;
  for (const f of filters) {
    const bq = c.createBiquadFilter();
    bq.type = f.type;
    bq.frequency.value = f.freq;
    if (f.q) bq.Q.value = f.q;
    node.connect(bq);
    node = bq;
  }
  const g = c.createGain();
  g.gain.setValueAtTime(0.0001, c.currentTime);
  g.gain.exponentialRampToValueAtTime(gain, c.currentTime + 2.5);
  node.connect(g).connect(master);
  src.start();
  return { src, g };
}

function crackle() {
  const c = audio();
  const t = c.currentTime;
  const src = c.createBufferSource();
  src.buffer = noise('white', 0.1);
  const hp = c.createBiquadFilter();
  hp.type = 'highpass';
  hp.frequency.value = 900 + Math.random() * 2500;
  const g = c.createGain();
  const peak = 0.03 + Math.random() * 0.16;
  g.gain.setValueAtTime(peak, t);
  g.gain.exponentialRampToValueAtTime(0.0001, t + 0.015 + Math.random() * 0.05);
  src.connect(hp).connect(g).connect(master);
  src.start(t);
  src.stop(t + 0.1);
}

export const sound = {
  flip(heavy = false) {
    const c = audio();
    if (!c) return;
    const t = c.currentTime;
    const src = c.createBufferSource();
    src.buffer = noise('white', 0.6);
    const bp = c.createBiquadFilter();
    bp.type = 'bandpass';
    bp.Q.value = 0.7;
    bp.frequency.setValueAtTime(heavy ? 1400 : 3200, t);
    bp.frequency.exponentialRampToValueAtTime(heavy ? 260 : 650, t + (heavy ? 0.5 : 0.36));
    const g = c.createGain();
    const peak = heavy ? 0.3 : 0.17;
    g.gain.setValueAtTime(0.0001, t);
    g.gain.exponentialRampToValueAtTime(peak, t + 0.05);
    g.gain.exponentialRampToValueAtTime(peak * 0.25, t + 0.2);
    g.gain.exponentialRampToValueAtTime(0.0001, t + (heavy ? 0.6 : 0.45));
    src.connect(bp).connect(g).connect(master);
    src.start(t);
    src.stop(t + 0.6);
  },

  // Campanita suave cuando la cinta cae sobre la página.
  ping() {
    const c = audio();
    if (!c) return;
    const t = c.currentTime;
    [[1568, 0.16, 1.4], [3136, 0.05, 0.6], [4704, 0.025, 0.35]].forEach(([f, a, dur]) => {
      const o = c.createOscillator();
      o.type = 'sine';
      o.frequency.value = f;
      const g = c.createGain();
      g.gain.setValueAtTime(0.0001, t);
      g.gain.exponentialRampToValueAtTime(a, t + 0.008);
      g.gain.exponentialRampToValueAtTime(0.0001, t + dur);
      o.connect(g).connect(master);
      o.start(t);
      o.stop(t + dur + 0.05);
    });
  },

  get ambient() {
    return ambient.mode;
  },

  setAmbient(mode) {
    const c = audio();
    if (!c) return;
    ambient.nodes.forEach(({ src, g }) => {
      g.gain.cancelScheduledValues(c.currentTime);
      g.gain.setTargetAtTime(0.0001, c.currentTime, 0.4);
      src.stop(c.currentTime + 2);
    });
    ambient.nodes = [];
    clearTimeout(ambient.timer);
    ambient.mode = mode;
    if (mode === 'rain') {
      ambient.nodes.push(loop('pink', [{ type: 'highpass', freq: 500 }, { type: 'lowpass', freq: 5200 }], 0.2));
      ambient.nodes.push(loop('brown', [{ type: 'lowpass', freq: 300 }], 0.12));
    } else if (mode === 'fire') {
      ambient.nodes.push(loop('brown', [{ type: 'lowpass', freq: 520 }], 0.4));
      const tick = () => {
        if (ambient.mode !== 'fire') return;
        crackle();
        if (Math.random() < 0.3) setTimeout(crackle, 30 + Math.random() * 60);
        ambient.timer = setTimeout(tick, 60 + Math.random() * 520);
      };
      tick();
    }
  },
};
