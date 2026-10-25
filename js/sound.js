// Sonidos sintetizados con Web Audio (sin archivos): hoja que pasa, "ping" de la cinta y los
// ambientes de cada fondo (chimenea, olas del mar, jazz suave, lluvia y piano en la ciudad).
// Tres volúmenes: general, ambiente y efectos (hojas y cinta).
import { prefs } from './db.js';

let ctx = null;
let master = null;
let ambBus = null;
let fxBus = null;
let reverb = null;
const buffers = {};
const current = { mode: 'off', stop: null };

const readVol = (key, def) => {
  const v = parseFloat(prefs.get(`bib.vol.${key}`));
  return Number.isFinite(v) ? Math.min(1, Math.max(0, v)) : def;
};
const volume = { master: readVol('master', 0.8), ambient: readVol('ambient', 0.7), fx: readVol('fx', 0.8) };

function audio() {
  if (!ctx) {
    const AC = window.AudioContext || window.webkitAudioContext;
    if (!AC) return null;
    ctx = new AC();
    master = ctx.createGain();
    master.gain.value = volume.master;
    master.connect(ctx.destination);
    ambBus = ctx.createGain();
    ambBus.gain.value = volume.ambient;
    ambBus.connect(master);
    fxBus = ctx.createGain();
    fxBus.gain.value = volume.fx;
    fxBus.connect(master);
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

// Reverberación de sala (respuesta al impulso inventada: ruido que se apaga).
function room() {
  if (reverb) return reverb;
  const c = audio();
  const len = Math.floor(c.sampleRate * 2.2);
  const ir = c.createBuffer(2, len, c.sampleRate);
  for (let ch = 0; ch < 2; ch++) {
    const d = ir.getChannelData(ch);
    for (let i = 0; i < len; i++) d[i] = (Math.random() * 2 - 1) * Math.pow(1 - i / len, 3);
  }
  const conv = c.createConvolver();
  conv.buffer = ir;
  const wet = c.createGain();
  wet.gain.value = 0.28;
  conv.connect(wet).connect(ambBus);
  reverb = conv;
  return reverb;
}

const midi = (n) => 440 * Math.pow(2, (n - 69) / 12);

function noiseLoop(out, type, filters, gain) {
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
  g.gain.value = gain;
  node.connect(g).connect(out);
  src.start();
  return { src, g, stop: (t) => src.stop(t) };
}

function burst(out, { at, dur, type = 'white', filter = 'highpass', freq = 2000, q = 0.7, peak = 0.1, attack = 0.003 }) {
  const c = audio();
  const src = c.createBufferSource();
  src.buffer = noise(type, 1);
  const f = c.createBiquadFilter();
  f.type = filter;
  f.frequency.value = freq;
  f.Q.value = q;
  const g = c.createGain();
  g.gain.setValueAtTime(0.0001, at);
  g.gain.exponentialRampToValueAtTime(peak, at + attack);
  g.gain.exponentialRampToValueAtTime(0.0001, at + dur);
  src.connect(f).connect(g).connect(out);
  src.start(at, Math.random() * 0.5);
  src.stop(at + dur + 0.05);
}

// Programa eventos un poco por adelantado (para que el ritmo no tiemble aunque la página esté ocupada).
function scheduler(tick) {
  const id = setInterval(() => tick(audio().currentTime + 0.35), 40);
  return () => clearInterval(id);
}

// Lluvia escuchada desde adentro: el vidrio se come los agudos, así que queda un rumor grave y
// suave, gotas que tocan la ventana, una canaleta que gotea y ráfagas lentas de viento.
function indoorRain(out) {
  const c = audio();
  const glass = c.createBiquadFilter();
  glass.type = 'lowpass';
  glass.frequency.value = 2600;
  const bed = c.createGain();
  bed.gain.value = 0.9;
  bed.connect(glass).connect(out);
  const body = noiseLoop(bed, 'brown', [{ type: 'lowpass', freq: 650 }], 0.34);
  const texture = noiseLoop(bed, 'pink', [{ type: 'bandpass', freq: 1000, q: 0.55 }, { type: 'lowpass', freq: 1700 }], 0.06);
  let alive = true;
  const timers = [];
  const later = (fn, ms) => timers.push(setTimeout(() => alive && fn(), ms));
  const gust = () => {
    const t = c.currentTime;
    bed.gain.cancelScheduledValues(t);
    bed.gain.setValueAtTime(bed.gain.value, t);
    bed.gain.linearRampToValueAtTime(0.72 + Math.random() * 0.36, t + 3 + Math.random() * 4);
    later(gust, 5000 + Math.random() * 4000);
  };
  const drop = () => {
    const t = c.currentTime;
    if (Math.random() < 0.7) {
      burst(glass, { at: t, dur: 0.01 + Math.random() * 0.012, filter: 'bandpass', freq: 1800 + Math.random() * 1800, q: 3.5, peak: 0.008 + Math.random() * 0.022 });
    } else {
      const o = c.createOscillator();
      const f = 650 + Math.random() * 650;
      o.frequency.setValueAtTime(f, t);
      o.frequency.exponentialRampToValueAtTime(f * 0.6, t + 0.04);
      const g = c.createGain();
      g.gain.setValueAtTime(0.0001, t);
      g.gain.exponentialRampToValueAtTime(0.012 + Math.random() * 0.01, t + 0.004);
      g.gain.exponentialRampToValueAtTime(0.0001, t + 0.06);
      o.connect(g).connect(glass);
      o.start(t);
      o.stop(t + 0.08);
    }
    later(drop, 35 + Math.random() * 190);
  };
  const pan = c.createStereoPanner();
  pan.pan.value = 0.55;
  pan.connect(glass);
  const drip = () => {
    const t = c.currentTime;
    const o = c.createOscillator();
    o.frequency.setValueAtTime(540, t);
    o.frequency.exponentialRampToValueAtTime(360, t + 0.05);
    const g = c.createGain();
    g.gain.setValueAtTime(0.0001, t);
    g.gain.exponentialRampToValueAtTime(0.02, t + 0.004);
    g.gain.exponentialRampToValueAtTime(0.0001, t + 0.12);
    o.connect(g).connect(pan);
    o.start(t);
    o.stop(t + 0.14);
    later(drip, 1100 + Math.random() * 600);
  };
  gust();
  drop();
  later(drip, 2000);
  return (t) => {
    alive = false;
    timers.forEach(clearTimeout);
    body.stop(t);
    texture.stop(t);
  };
}

// Trueno lejano que retumba: un golpe grave y varios rodamientos que se apagan de a poco.
function thunderRoll(dest, at, strength = 1) {
  const c = audio();
  const src = c.createBufferSource();
  src.buffer = noise('brown', 4);
  const lp = c.createBiquadFilter();
  lp.type = 'lowpass';
  lp.frequency.setValueAtTime(260, at);
  lp.frequency.exponentialRampToValueAtTime(70, at + 6);
  const g = c.createGain();
  g.gain.setValueAtTime(0.0001, at);
  let t = at;
  let level = 0.85 * strength;
  g.gain.exponentialRampToValueAtTime(level, (t += 0.35));
  for (let i = 0; i < 4; i++) {
    level *= 0.55 + Math.random() * 0.25;
    g.gain.exponentialRampToValueAtTime(Math.max(level * 0.45, 0.001), (t += 0.4 + Math.random() * 0.5));
    g.gain.exponentialRampToValueAtTime(Math.max(level, 0.001), (t += 0.3 + Math.random() * 0.4));
  }
  g.gain.exponentialRampToValueAtTime(0.0001, t + 2.5);
  src.connect(lp).connect(g).connect(dest);
  src.start(at, Math.random() * 0.5);
  src.stop(t + 2.6);
}

// ---------- Ambientes ----------

const GENERATORS = {
  // Lluvia tranquila y, muy de vez en cuando, un trueno lejano.
  rain(out) {
    const stopRain = indoorRain(out);
    let alive = true;
    let timer;
    const rumble = () => {
      if (!alive) return;
      thunderRoll(out, audio().currentTime, 0.45);
      timer = setTimeout(rumble, 50000 + Math.random() * 60000);
    };
    timer = setTimeout(rumble, 25000 + Math.random() * 20000);
    return (t) => {
      alive = false;
      clearTimeout(timer);
      stopRain(t);
    };
  },

  fire(out) {
    const base = noiseLoop(out, 'brown', [{ type: 'lowpass', freq: 520 }], 0.4);
    let alive = true;
    let timer;
    const tick = () => {
      if (!alive) return;
      const c = audio();
      burst(out, { at: c.currentTime, dur: 0.02 + Math.random() * 0.05, freq: 900 + Math.random() * 2500, peak: 0.03 + Math.random() * 0.16 });
      if (Math.random() < 0.3) burst(out, { at: c.currentTime + 0.05, dur: 0.03, freq: 1800, peak: 0.06 });
      timer = setTimeout(tick, 60 + Math.random() * 520);
    };
    tick();
    return (t) => {
      alive = false;
      clearTimeout(timer);
      base.stop(t);
    };
  },

  // Olas que llegan y se retiran, mar de fondo y alguna gaviota lejos.
  ocean(out) {
    const c = audio();
    const rumble = noiseLoop(out, 'brown', [{ type: 'lowpass', freq: 220 }], 0.16);
    const src = c.createBufferSource();
    src.buffer = noise('pink', 4);
    src.loop = true;
    const lp = c.createBiquadFilter();
    lp.type = 'lowpass';
    lp.frequency.value = 400;
    const wave = c.createGain();
    wave.gain.value = 0.05;
    src.connect(lp).connect(wave).connect(out);
    src.start();
    let alive = true;
    let waveTimer, gullTimer;
    const nextWave = () => {
      if (!alive) return;
      const t = c.currentTime + 0.05;
      const period = 6 + Math.random() * 4;
      const peak = 0.35 + Math.random() * 0.25;
      wave.gain.cancelScheduledValues(t);
      wave.gain.setValueAtTime(wave.gain.value, t);
      wave.gain.linearRampToValueAtTime(peak, t + period * 0.35);
      wave.gain.linearRampToValueAtTime(0.06, t + period);
      lp.frequency.cancelScheduledValues(t);
      lp.frequency.setValueAtTime(lp.frequency.value, t);
      lp.frequency.exponentialRampToValueAtTime(1500 + Math.random() * 600, t + period * 0.4);
      lp.frequency.exponentialRampToValueAtTime(380, t + period);
      waveTimer = setTimeout(nextWave, period * 1000);
    };
    const gull = () => {
      if (!alive) return;
      const n = 2 + Math.floor(Math.random() * 2);
      const pan = c.createStereoPanner();
      pan.pan.value = Math.random() * 1.6 - 0.8;
      pan.connect(out);
      for (let i = 0; i < n; i++) {
        const at = c.currentTime + i * 0.38;
        const o = c.createOscillator();
        o.type = 'sine';
        o.frequency.setValueAtTime(2300, at);
        o.frequency.exponentialRampToValueAtTime(1350, at + 0.28);
        const vib = c.createOscillator();
        vib.frequency.value = 28;
        const vibG = c.createGain();
        vibG.gain.value = 60;
        vib.connect(vibG).connect(o.frequency);
        const g = c.createGain();
        g.gain.setValueAtTime(0.0001, at);
        g.gain.exponentialRampToValueAtTime(0.018, at + 0.04);
        g.gain.exponentialRampToValueAtTime(0.0001, at + 0.3);
        o.connect(g).connect(pan);
        o.start(at);
        vib.start(at);
        o.stop(at + 0.32);
        vib.stop(at + 0.32);
      }
      gullTimer = setTimeout(gull, 15000 + Math.random() * 25000);
    };
    nextWave();
    gullTimer = setTimeout(gull, 6000);
    return (t) => {
      alive = false;
      clearTimeout(waveTimer);
      clearTimeout(gullTimer);
      rumble.stop(t);
      src.stop(t);
    };
  },

  // Trío de jazz suave: piano eléctrico, contrabajo caminando, platillo y escobillas, con crujido de vinilo.
  jazz(out) {
    const c = audio();
    const verb = room();
    const send = c.createGain();
    send.gain.value = 0.5;
    send.connect(verb);
    const beat = 60 / 86;
    // [raíz del bajo, tipo, voces del piano]
    const BARS = [
      [43, 'm', [58, 62, 65, 69]], // Gm9
      [36, '7', [58, 64, 69, 74]], // C13
      [41, 'M', [57, 60, 64, 67]], // Fmaj9
      [38, '7', [60, 66, 69, 75]], // D7(b9)
      [43, 'm', [58, 62, 65, 69]], // Gm9
      [36, '7', [58, 64, 67, 72]], // C7
      [45, 'm', [55, 60, 64, 69]], // Am7
      [38, '7', [60, 66, 69, 72]], // D7
    ];
    const SHAPE = { m: [0, 3, 7, 10], 7: [0, 4, 7, 10], M: [0, 4, 7, 11] };
    const COMP = [[1.67, 3], [0, 2.67], [1.67], [0.67, 2.67], [3], [1, 2.67]];
    const RIDE = [[0, 0.03], [1, 0.045], [1.67, 0.025], [2, 0.03], [3, 0.045], [3.67, 0.025]];

    const ep = (note, at, dur, vel) => {
      const f = midi(note);
      const car = c.createOscillator();
      car.type = 'sine';
      car.frequency.value = f;
      const mod = c.createOscillator();
      mod.frequency.value = f;
      const modG = c.createGain();
      modG.gain.setValueAtTime(f * 1.4, at);
      modG.gain.exponentialRampToValueAtTime(f * 0.15, at + 0.7);
      mod.connect(modG).connect(car.frequency);
      const g = c.createGain();
      g.gain.setValueAtTime(0.0001, at);
      g.gain.exponentialRampToValueAtTime(vel, at + 0.006);
      g.gain.exponentialRampToValueAtTime(vel * 0.4, at + 0.5);
      g.gain.exponentialRampToValueAtTime(0.0001, at + dur + 0.4);
      const lp = c.createBiquadFilter();
      lp.type = 'lowpass';
      lp.frequency.value = 2800;
      car.connect(lp).connect(g);
      g.connect(out);
      g.connect(send);
      car.start(at);
      mod.start(at);
      car.stop(at + dur + 0.5);
      mod.stop(at + dur + 0.5);
    };
    const bass = (note, at, dur) => {
      const o = c.createOscillator();
      o.type = 'triangle';
      o.frequency.value = midi(note);
      const lp = c.createBiquadFilter();
      lp.type = 'lowpass';
      lp.frequency.value = 700;
      const g = c.createGain();
      g.gain.setValueAtTime(0.0001, at);
      g.gain.exponentialRampToValueAtTime(0.28, at + 0.012);
      g.gain.exponentialRampToValueAtTime(0.12, at + 0.2);
      g.gain.exponentialRampToValueAtTime(0.0001, at + dur);
      o.connect(lp).connect(g).connect(out);
      o.start(at);
      o.stop(at + dur + 0.05);
    };

    let bar = 0;
    let barAt = c.currentTime + 0.3;
    const stopSched = scheduler((until) => {
      while (barAt < until) {
        const [root, kind, voicing] = BARS[bar % BARS.length];
        const nextRoot = BARS[(bar + 1) % BARS.length][0];
        const shape = SHAPE[kind];
        // contrabajo: tónica, notas del acorde y una nota de paso hacia el siguiente acorde
        const walk = [root, root + shape[1 + Math.floor(Math.random() * 2)], root + (Math.random() < 0.5 ? 7 : 12), nextRoot + (Math.random() < 0.5 ? -1 : 1)];
        walk.forEach((n, i) => bass(n, barAt + i * beat, beat * 0.95));
        // piano: acordes en contratiempo, a veces una nota suelta arriba
        for (const pos of COMP[Math.floor(Math.random() * COMP.length)]) {
          const dur = beat * (0.6 + Math.random() * 0.9);
          voicing.forEach((n, i) => ep(n, barAt + pos * beat + i * 0.008, dur, 0.035));
        }
        if (Math.random() < 0.35) ep(voicing[3] + 12, barAt + 2 * beat + beat * 0.67, beat * 0.8, 0.025);
        // platillo ride, escobillas en 2 y 4
        for (const [pos, v] of RIDE) burst(out, { at: barAt + pos * beat, dur: 0.35, filter: 'highpass', freq: 7000, peak: v });
        for (const pos of [1, 3]) burst(out, { at: barAt + pos * beat, dur: 0.22, type: 'pink', filter: 'bandpass', freq: 2600, q: 0.6, peak: 0.05, attack: 0.025 });
        barAt += 4 * beat;
        bar++;
      }
    });
    // crujido del vinilo
    const hiss = noiseLoop(out, 'pink', [{ type: 'highpass', freq: 2500 }, { type: 'lowpass', freq: 7000 }], 0.012);
    let alive = true;
    let crackleTimer;
    const crackle = () => {
      if (!alive) return;
      burst(out, { at: c.currentTime, dur: 0.008, freq: 3000, peak: 0.02 + Math.random() * 0.04 });
      crackleTimer = setTimeout(crackle, 40 + Math.random() * 400);
    };
    crackle();
    return (t) => {
      alive = false;
      stopSched();
      clearTimeout(crackleTimer);
      hiss.stop(t);
    };
  },

  // Suite del paddock: murmullo de la tribuna detrás del vidrio y el zumbido del aire acondicionado.
  // Los autos (cada 45 s) los dispara la escena con sound.race().
  paddock(out) {
    const c = audio();
    const hum = noiseLoop(out, 'brown', [{ type: 'lowpass', freq: 140 }], 0.08);
    const crowdGain = c.createGain();
    crowdGain.gain.value = 0.7;
    crowdGain.connect(out);
    const crowd = noiseLoop(crowdGain, 'pink', [{ type: 'bandpass', freq: 520, q: 0.5 }, { type: 'lowpass', freq: 1300 }], 0.07);
    let alive = true;
    let timer;
    const swell = () => {
      if (!alive) return;
      const t = c.currentTime;
      crowdGain.gain.cancelScheduledValues(t);
      crowdGain.gain.setValueAtTime(crowdGain.gain.value, t);
      crowdGain.gain.linearRampToValueAtTime(0.5 + Math.random() * 0.5, t + 3 + Math.random() * 3);
      timer = setTimeout(swell, 5000 + Math.random() * 4000);
    };
    swell();
    current.crowd = crowdGain;
    return (t) => {
      alive = false;
      clearTimeout(timer);
      hum.stop(t);
      crowd.stop(t);
    };
  },

  // Lluvia en el ventanal, acordes ambientales largos y notas sueltas de piano.
  city(out) {
    const c = audio();
    const verb = room();
    const send = c.createGain();
    send.gain.value = 0.9;
    send.connect(verb);
    const stopRain = indoorRain(out);
    const CHORDS = [[48, 55, 59, 64], [45, 52, 59, 60], [41, 52, 57, 64], [43, 50, 59, 64]];
    const pad = (notes, at, len) => {
      for (const n of notes) {
        for (const det of [-6, 6]) {
          const o = c.createOscillator();
          o.type = 'triangle';
          o.frequency.value = midi(n);
          o.detune.value = det;
          const lp = c.createBiquadFilter();
          lp.type = 'lowpass';
          lp.frequency.value = 1100;
          const g = c.createGain();
          g.gain.setValueAtTime(0.0001, at);
          g.gain.linearRampToValueAtTime(0.014, at + 3);
          g.gain.setValueAtTime(0.014, at + len - 1);
          g.gain.linearRampToValueAtTime(0.0001, at + len + 3);
          o.connect(lp).connect(g);
          g.connect(out);
          g.connect(send);
          o.start(at);
          o.stop(at + len + 3.1);
        }
      }
    };
    const piano = (n, at) => {
      const o = c.createOscillator();
      o.type = 'sine';
      o.frequency.value = midi(n);
      const o2 = c.createOscillator();
      o2.type = 'sine';
      o2.frequency.value = midi(n) * 2;
      const g = c.createGain();
      g.gain.setValueAtTime(0.0001, at);
      g.gain.exponentialRampToValueAtTime(0.05, at + 0.01);
      g.gain.exponentialRampToValueAtTime(0.0001, at + 3);
      const g2 = c.createGain();
      g2.gain.value = 0.25;
      o.connect(g);
      o2.connect(g2).connect(g);
      g.connect(out);
      g.connect(send);
      o.start(at);
      o2.start(at);
      o.stop(at + 3.1);
      o2.stop(at + 3.1);
    };
    let i = 0;
    let at = c.currentTime + 0.3;
    let nextNote = at + 2;
    const stopSched = scheduler((until) => {
      while (at < until) {
        pad(CHORDS[i % CHORDS.length], at, 8);
        at += 8;
        i++;
      }
      while (nextNote < until) {
        const chord = CHORDS[(i - 1 + CHORDS.length) % CHORDS.length];
        piano(chord[Math.floor(Math.random() * chord.length)] + 24, nextNote);
        nextNote += 1.5 + Math.random() * 3.5;
      }
    });
    return (t) => {
      stopSched();
      stopRain(t);
    };
  },
};

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
    src.connect(bp).connect(g).connect(fxBus);
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
      o.connect(g).connect(fxBus);
      o.start(t);
      o.stop(t + dur + 0.05);
    });
  },

  // Trueno lejano (sólo suena si el ambiente es la lluvia de la ciudad).
  thunder() {
    if (current.mode !== 'city' || !ctx) return;
    thunderRoll(ambBus, audio().currentTime + 0.8 + Math.random() * 1.4, 1);
  },

  // Pasada de autos: `times` son los segundos (desde ahora) en que cada auto cruza frente a la suite.
  // Motor agudo que sube al acercarse y cae al alejarse (efecto Doppler), de izquierda a derecha.
  race(times) {
    if (current.mode !== 'paddock' || !ctx) return;
    const c = audio();
    const now = c.currentTime;
    times.forEach((t, i) => {
      const mid = now + t;
      const at = Math.max(now + 0.02, mid - 1.3);
      const end = mid + 1.6;
      const f = 300 + i * 18 + Math.random() * 30;
      const pan = c.createStereoPanner();
      pan.pan.setValueAtTime(-0.9, at);
      pan.pan.linearRampToValueAtTime(0.9, end);
      const glass = c.createBiquadFilter();
      glass.type = 'lowpass';
      glass.frequency.setValueAtTime(1200, at);
      glass.frequency.linearRampToValueAtTime(2600, mid);
      glass.frequency.linearRampToValueAtTime(900, end);
      const g = c.createGain();
      g.gain.setValueAtTime(0.0001, at);
      g.gain.exponentialRampToValueAtTime(0.2, mid - 0.05);
      g.gain.exponentialRampToValueAtTime(0.06, mid + 0.5);
      g.gain.exponentialRampToValueAtTime(0.0001, end);
      g.connect(glass).connect(pan).connect(ambBus);
      for (const [type, mult, level] of [['sawtooth', 1, 0.6], ['square', 2.01, 0.25], ['sawtooth', 0.5, 0.5]]) {
        const o = c.createOscillator();
        o.type = type;
        o.frequency.setValueAtTime(f * mult * 1.12, at);
        o.frequency.linearRampToValueAtTime(f * mult * 1.2, mid - 0.08);
        o.frequency.exponentialRampToValueAtTime(f * mult * 0.8, mid + 0.12);
        o.frequency.linearRampToValueAtTime(f * mult * 0.74, end);
        const og = c.createGain();
        og.gain.value = level;
        o.connect(og).connect(g);
        o.start(at);
        o.stop(end + 0.05);
      }
      burst(g, { at: mid - 0.4, dur: 1.1, type: 'pink', filter: 'bandpass', freq: 900, q: 0.6, peak: 0.5, attack: 0.35 });
    });
    // la tribuna se entusiasma con la pasada
    const crowd = current.crowd;
    if (crowd) {
      const t0 = Math.max(now, now + times[0] - 0.5);
      crowd.gain.cancelScheduledValues(t0);
      crowd.gain.setValueAtTime(0.7, t0);
      crowd.gain.linearRampToValueAtTime(1.8, t0 + 1);
      crowd.gain.linearRampToValueAtTime(0.7, t0 + 6);
    }
  },

  get ambient() {
    return current.mode;
  },

  // Cambia el ambiente con un fundido cruzado suave.
  setAmbient(mode) {
    const c = audio();
    if (!c || mode === current.mode) return;
    const now = c.currentTime;
    if (current.stop) {
      const { stop, gain } = current;
      gain.gain.cancelScheduledValues(now);
      gain.gain.setValueAtTime(gain.gain.value, now);
      gain.gain.linearRampToValueAtTime(0.0001, now + 1.6);
      stop(now + 1.7);
      setTimeout(() => gain.disconnect(), 1900);
    }
    current.mode = mode;
    current.stop = null;
    current.crowd = null;
    const gen = GENERATORS[mode];
    if (!gen) return;
    const gain = c.createGain();
    gain.gain.setValueAtTime(0.0001, now);
    gain.gain.linearRampToValueAtTime(1, now + 2.5);
    gain.connect(ambBus);
    current.gain = gain;
    current.stop = gen(gain);
  },

  getVolume: (kind) => volume[kind],

  setVolume(kind, v) {
    volume[kind] = Math.min(1, Math.max(0, v));
    prefs.set(`bib.vol.${kind}`, String(volume[kind]));
    const node = { master, ambient: ambBus, fx: fxBus }[kind];
    if (node && ctx) node.gain.setTargetAtTime(volume[kind], ctx.currentTime, 0.05);
  },
};
