// Texturas procedurales dibujadas en canvas: madera, papel, tela, papel marmolado,
// lomos de libro, placa de bronce y pequeños objetos decorativos.

export function makeCanvas(w, h) {
  const c = document.createElement('canvas');
  c.width = w;
  c.height = h;
  return c;
}

export function seeded(seed) {
  let a = seed >>> 0;
  return () => {
    a = (a + 0x6d2b79f5) | 0;
    let t = Math.imul(a ^ (a >>> 15), 1 | a);
    t = (t + Math.imul(t ^ (t >>> 7), 61 | t)) ^ t;
    return ((t ^ (t >>> 14)) >>> 0) / 4294967296;
  };
}

export function hashStr(s) {
  let h = 2166136261;
  for (let i = 0; i < s.length; i++) {
    h ^= s.charCodeAt(i);
    h = Math.imul(h, 16777619);
  }
  return h >>> 0;
}

// ---------- Color ----------

export const clamp = (v, a, b) => Math.max(a, Math.min(b, v));

export function hexToRgb(hex) {
  const n = parseInt(hex.replace('#', ''), 16);
  return [(n >> 16) & 255, (n >> 8) & 255, n & 255];
}

export function rgbToHex(r, g, b) {
  return '#' + [r, g, b].map((v) => clamp(Math.round(v), 0, 255).toString(16).padStart(2, '0')).join('');
}

// f < 0 oscurece, f > 0 aclara (0..1)
export function shade(hex, f) {
  const [r, g, b] = hexToRgb(hex);
  const t = f < 0 ? 0 : 255;
  const p = Math.abs(f);
  return rgbToHex(r + (t - r) * p, g + (t - g) * p, b + (t - b) * p);
}

export function rgbToHsl(r, g, b) {
  r /= 255; g /= 255; b /= 255;
  const max = Math.max(r, g, b), min = Math.min(r, g, b);
  const l = (max + min) / 2;
  if (max === min) return [0, 0, l];
  const d = max - min;
  const s = l > 0.5 ? d / (2 - max - min) : d / (max + min);
  let h;
  if (max === r) h = (g - b) / d + (g < b ? 6 : 0);
  else if (max === g) h = (b - r) / d + 2;
  else h = (r - g) / d + 4;
  return [h / 6, s, l];
}

export function hslToHex(h, s, l) {
  const hue = (p, q, t) => {
    if (t < 0) t += 1;
    if (t > 1) t -= 1;
    if (t < 1 / 6) return p + (q - p) * 6 * t;
    if (t < 1 / 2) return q;
    if (t < 2 / 3) return p + (q - p) * (2 / 3 - t) * 6;
    return p;
  };
  if (s === 0) return rgbToHex(l * 255, l * 255, l * 255);
  const q = l < 0.5 ? l * (1 + s) : l + s - l * s;
  const p = 2 * l - q;
  return rgbToHex(hue(p, q, h + 1 / 3) * 255, hue(p, q, h) * 255, hue(p, q, h - 1 / 3) * 255);
}

// Paleta "old money": borgoña, verde inglés, azul marino, cuero, tabaco.
export const PALETTE = ['#5a1a1f', '#1f3a2c', '#1c2740', '#6b4a2b', '#3b2a1e', '#7a5c2e', '#2b2620', '#4a1c2a', '#24443a', '#8a6f45', '#2d3a4f', '#5b2c1a'];

// ---------- Utilidades de dibujo ----------

function grain(g, w, h, amount, rnd) {
  const img = g.getImageData(0, 0, w, h);
  const d = img.data;
  for (let i = 0; i < d.length; i += 4) {
    const n = (rnd() - 0.5) * amount * 255;
    d[i] += n;
    d[i + 1] += n;
    d[i + 2] += n;
  }
  g.putImageData(img, 0, 0);
}

function fitText(g, text, x, y, maxLen, maxSize, minSize, family, weight = '600') {
  let size = maxSize;
  g.font = `${weight} ${size}px ${family}`;
  while (g.measureText(text).width > maxLen && size > minSize) {
    size -= 1;
    g.font = `${weight} ${size}px ${family}`;
  }
  let t = text;
  while (g.measureText(t).width > maxLen && t.length > 3) t = t.slice(0, -1);
  if (t !== text) t = t.trimEnd() + '…';
  g.fillText(t, x, y);
}

const SERIF = '"Cormorant Garamond", "EB Garamond", Georgia, serif';

// ---------- Madera, paredes, papel ----------

export function woodCanvas({ w = 512, h = 512, base = '#4a2416', dark = '#22100a', light = '#73391f', seed = 7, lines = 260 } = {}) {
  const c = makeCanvas(w, h);
  const g = c.getContext('2d', { willReadFrequently: true });
  const rnd = seeded(seed);
  g.fillStyle = base;
  g.fillRect(0, 0, w, h);
  for (let i = 0; i < lines; i++) {
    const y0 = rnd() * h, amp = 1 + rnd() * 7, f = 0.003 + rnd() * 0.012, ph = rnd() * 6.28;
    g.strokeStyle = rnd() < 0.55 ? dark : light;
    g.globalAlpha = 0.05 + rnd() * 0.16;
    g.lineWidth = 0.6 + rnd() * 2.4;
    g.beginPath();
    for (let x = -8; x <= w + 8; x += 8) {
      const y = y0 + Math.sin(x * f + ph) * amp + Math.sin(x * f * 2.7 + ph * 1.3) * amp * 0.35;
      if (x < 0) g.moveTo(x, y);
      else g.lineTo(x, y);
    }
    g.stroke();
  }
  g.globalAlpha = 1;
  grain(g, w, h, 0.07, rnd);
  return c;
}

export function floorCanvas() {
  const w = 1024, h = 1024;
  const c = makeCanvas(w, h);
  const g = c.getContext('2d');
  const rnd = seeded(21);
  const plankH = 64;
  for (let y = 0; y < h; y += plankH) {
    let x = -rnd() * 400;
    while (x < w) {
      const len = 260 + rnd() * 320;
      const tone = 0.75 + rnd() * 0.4;
      const src = woodCanvas({ w: 256, h: 64, seed: Math.floor(rnd() * 1e6), lines: 40, base: shade('#3a1d10', tone - 1), dark: '#1a0b05', light: '#5a2e18' });
      g.drawImage(src, x, y, len, plankH);
      g.fillStyle = 'rgba(0,0,0,0.55)';
      g.fillRect(x, y, 2, plankH);
      x += len;
    }
    g.fillStyle = 'rgba(0,0,0,0.6)';
    g.fillRect(0, y, w, 2);
  }
  return c;
}

export function wallCanvas() {
  const w = 512, h = 512;
  const c = makeCanvas(w, h);
  const g = c.getContext('2d', { willReadFrequently: true });
  const rnd = seeded(3);
  g.fillStyle = '#1b2a21';
  g.fillRect(0, 0, w, h);
  for (let x = 0; x < w; x += 32) {
    g.fillStyle = x % 64 ? 'rgba(255,255,255,0.02)' : 'rgba(0,0,0,0.06)';
    g.fillRect(x, 0, 16, h);
  }
  g.strokeStyle = 'rgba(205,175,115,0.07)';
  g.lineWidth = 2;
  for (let y = 0; y < h; y += 128) {
    for (let x = 0; x < w; x += 128) {
      const cx = x + ((y / 128) % 2 ? 64 : 0) + 64, cy = y + 64;
      g.beginPath();
      g.ellipse(cx, cy, 16, 32, 0, 0, Math.PI * 2);
      g.moveTo(cx, cy - 46);
      g.lineTo(cx, cy + 46);
      g.moveTo(cx - 26, cy);
      g.quadraticCurveTo(cx, cy - 22, cx + 26, cy);
      g.moveTo(cx - 26, cy);
      g.quadraticCurveTo(cx, cy + 22, cx + 26, cy);
      g.stroke();
    }
  }
  grain(g, w, h, 0.05, rnd);
  return c;
}

export function paperEdgeCanvas() {
  const w = 256, h = 32;
  const c = makeCanvas(w, h);
  const g = c.getContext('2d');
  g.fillStyle = '#efe4cc';
  g.fillRect(0, 0, w, h);
  const rnd = seeded(9);
  for (let x = 0; x < w; x += 2) {
    g.fillStyle = `rgba(120,95,60,${0.08 + rnd() * 0.18})`;
    g.fillRect(x, 0, 1, h);
  }
  return c;
}

// Lomo genérico (blanco con nervios) que se tiñe con el color de cada instancia.
export function decorSpineCanvas() {
  const w = 64, h = 256;
  const c = makeCanvas(w, h);
  const g = c.getContext('2d', { willReadFrequently: true });
  g.fillStyle = '#bdb4a8';
  g.fillRect(0, 0, w, h);
  const sh = g.createLinearGradient(0, 0, w, 0);
  sh.addColorStop(0, 'rgba(0,0,0,0.45)');
  sh.addColorStop(0.35, 'rgba(255,255,255,0.12)');
  sh.addColorStop(1, 'rgba(0,0,0,0.5)');
  g.fillStyle = sh;
  g.fillRect(0, 0, w, h);
  g.fillStyle = '#fff3d6';
  for (const f of [0.08, 0.13, 0.88, 0.93]) g.fillRect(0, h * f, w, 2);
  g.fillRect(w * 0.3, h * 0.35, w * 0.4, h * 0.25);
  grain(g, w, h, 0.08, seeded(4));
  return c;
}

// ---------- Lomo real del libro (con título en oro) ----------

export function spineCanvas({ title, author, color, thickness, height, seed = 1 }) {
  const H = 1024;
  const W = Math.max(64, Math.round((H * thickness) / height));
  const c = makeCanvas(W, H);
  const g = c.getContext('2d', { willReadFrequently: true });
  const rnd = seeded(seed);
  g.fillStyle = color;
  g.fillRect(0, 0, W, H);
  grain(g, W, H, 0.07, rnd);

  const sh = g.createLinearGradient(0, 0, W, 0);
  sh.addColorStop(0, 'rgba(0,0,0,0.55)');
  sh.addColorStop(0.18, 'rgba(0,0,0,0.05)');
  sh.addColorStop(0.45, 'rgba(255,240,210,0.12)');
  sh.addColorStop(0.8, 'rgba(0,0,0,0.08)');
  sh.addColorStop(1, 'rgba(0,0,0,0.6)');
  g.fillStyle = sh;
  g.fillRect(0, 0, W, H);

  const gold = '#d6b46e';
  const band = (y) => {
    const hg = g.createLinearGradient(0, y - 12, 0, y + 12);
    hg.addColorStop(0, 'rgba(0,0,0,0.35)');
    hg.addColorStop(0.5, 'rgba(255,230,190,0.2)');
    hg.addColorStop(1, 'rgba(0,0,0,0.35)');
    g.fillStyle = hg;
    g.fillRect(0, y - 12, W, 24);
    g.fillStyle = gold;
    g.fillRect(0, y - 16, W, 3);
    g.fillRect(0, y + 14, W, 3);
  };
  [0.06, 0.14, 0.86, 0.94].forEach((f) => band(H * f));

  g.fillStyle = gold;
  g.textAlign = 'center';
  g.textBaseline = 'middle';
  g.shadowColor = 'rgba(0,0,0,0.65)';
  g.shadowBlur = 2;
  g.shadowOffsetY = 1.5;
  g.letterSpacing = '3px';

  g.save();
  g.translate(W / 2, H * 0.45);
  g.rotate(Math.PI / 2);
  fitText(g, (title || '').toUpperCase(), 0, 0, H * 0.54, Math.min(W * 0.48, 50), 14, SERIF);
  g.restore();

  const last = (author || '').split(/[,;&]/)[0].trim().split(/\s+/).pop() || '';
  if (last) {
    g.save();
    g.translate(W / 2, H * 0.79);
    g.rotate(Math.PI / 2);
    g.letterSpacing = '1px';
    fitText(g, last, 0, 0, H * 0.11, Math.min(W * 0.32, 30), 10, SERIF, 'italic 500');
    g.restore();
  }
  return c;
}

// ---------- Superficies de los otros fondos ----------

// Mármol blanco con vetas grises (piso de la mansión, bases de esculturas).
export function marbleCanvas({ w = 512, h = 512, base = '#f1ede6', vein = [120, 116, 110], seed = 5 } = {}) {
  const c = makeCanvas(w, h);
  const g = c.getContext('2d');
  const img = g.createImageData(w, h);
  const d = img.data;
  const rnd = seeded(seed);
  const fbm = fbmNoise(rnd);
  const b = hexToRgb(base);
  for (let y = 0; y < h; y++) {
    for (let x = 0; x < w; x++) {
      const nx = (x / w) * 4, ny = (y / h) * 4;
      const n = fbm(nx + fbm(nx * 0.7, ny * 0.7) * 2.5, ny);
      const v = Math.abs(Math.sin((nx + ny * 0.6 + n * 3.2) * 2.2));
      const vt = Math.pow(1 - v, 14) * 0.75 + Math.pow(1 - v, 60) * 0.25;
      const shadeN = (fbm(nx * 3, ny * 3) - 0.5) * 10;
      const i = (y * w + x) * 4;
      for (let k = 0; k < 3; k++) d[i + k] = b[k] + (vein[k] - b[k]) * vt + shadeN;
      d[i + 3] = 255;
    }
  }
  g.putImageData(img, 0, 0);
  return c;
}

// Concreto pulido (piso del ático).
export function concreteCanvas({ w = 512, h = 512, base = '#6f6d6a', seed = 3 } = {}) {
  const c = makeCanvas(w, h);
  const g = c.getContext('2d', { willReadFrequently: true });
  const rnd = seeded(seed);
  const fbm = fbmNoise(rnd);
  const img = g.createImageData(w, h);
  const d = img.data;
  const b = hexToRgb(base);
  for (let y = 0; y < h; y++) {
    for (let x = 0; x < w; x++) {
      const n = (fbm((x / w) * 6, (y / h) * 6) - 0.5) * 34 + (rnd() - 0.5) * 8;
      const i = (y * w + x) * 4;
      d[i] = b[0] + n; d[i + 1] = b[1] + n; d[i + 2] = b[2] + n; d[i + 3] = 255;
    }
  }
  g.putImageData(img, 0, 0);
  // juntas de las losas
  g.strokeStyle = 'rgba(0,0,0,0.25)';
  g.lineWidth = 2;
  g.strokeRect(1, 1, w - 2, h - 2);
  return c;
}

// Papel tapiz art déco: abanicos dorados sobre verde azulado profundo (salón de jazz).
export function decoWallCanvas({ base = '#10292a', line = 'rgba(205,170,100,0.55)' } = {}) {
  const w = 512, h = 512;
  const c = makeCanvas(w, h);
  const g = c.getContext('2d', { willReadFrequently: true });
  g.fillStyle = base;
  g.fillRect(0, 0, w, h);
  g.strokeStyle = line;
  g.lineWidth = 2;
  const R = 64;
  for (let row = -1; row < h / (R / 2) + 1; row++) {
    for (let col = -1; col < w / R + 1; col++) {
      const cx = col * R + (row % 2 ? R / 2 : 0);
      const cy = row * (R / 2) + R / 2;
      for (let k = 1; k <= 3; k++) {
        g.beginPath();
        g.arc(cx, cy, (R / 2) * (k / 3), Math.PI, 2 * Math.PI);
        g.stroke();
      }
      for (let a = 0; a <= 6; a++) {
        const ang = Math.PI + (a / 6) * Math.PI;
        g.beginPath();
        g.moveTo(cx, cy);
        g.lineTo(cx + Math.cos(ang) * R * 0.16, cy + Math.sin(ang) * R * 0.16);
        g.stroke();
      }
    }
  }
  grain(g, w, h, 0.05, seeded(9));
  return c;
}

// Cortina de seda con pliegues verticales.
export function curtainCanvas({ base = '#efe2cc' } = {}) {
  const w = 256, h = 64;
  const c = makeCanvas(w, h);
  const g = c.getContext('2d', { willReadFrequently: true });
  const grad = g.createLinearGradient(0, 0, w, 0);
  for (let i = 0; i <= 16; i++) {
    const s = Math.sin((i / 16) * Math.PI * 7);
    grad.addColorStop(i / 16, shade(base, s > 0 ? s * 0.18 : s * 0.22));
  }
  g.fillStyle = grad;
  g.fillRect(0, 0, w, h);
  grain(g, w, h, 0.04, seeded(4));
  return c;
}

// Disco de vinilo con surcos y etiqueta (tocadiscos del salón de jazz).
export function vinylCanvas() {
  const S = 256;
  const c = makeCanvas(S, S);
  const g = c.getContext('2d');
  g.fillStyle = '#0d0d0f';
  g.fillRect(0, 0, S, S);
  for (let r = 40; r < S / 2; r += 2) {
    g.strokeStyle = `rgba(255,255,255,${r % 6 ? 0.03 : 0.07})`;
    g.beginPath();
    g.arc(S / 2, S / 2, r, 0, Math.PI * 2);
    g.stroke();
  }
  // reflejo de luz
  const sheen = g.createConicGradient(0.6, S / 2, S / 2);
  sheen.addColorStop(0, 'rgba(255,255,255,0)');
  sheen.addColorStop(0.08, 'rgba(255,255,255,0.12)');
  sheen.addColorStop(0.16, 'rgba(255,255,255,0)');
  sheen.addColorStop(0.5, 'rgba(255,255,255,0)');
  sheen.addColorStop(0.58, 'rgba(255,255,255,0.1)');
  sheen.addColorStop(0.66, 'rgba(255,255,255,0)');
  g.fillStyle = sheen;
  g.fillRect(0, 0, S, S);
  g.fillStyle = '#8c1d2a';
  g.beginPath();
  g.arc(S / 2, S / 2, 34, 0, Math.PI * 2);
  g.fill();
  g.fillStyle = '#e8d29a';
  g.font = `600 13px ${SERIF}`;
  g.textAlign = 'center';
  g.fillText('JAZZ', S / 2, S / 2 - 10);
  g.fillStyle = '#111';
  g.beginPath();
  g.arc(S / 2, S / 2, 3, 0, Math.PI * 2);
  g.fill();
  return c;
}

// ---------- Placa de bronce grabada ----------

export function plaqueCanvas(text, style = 'brass') {
  if (style === 'black') return blackPlaqueCanvas(text);
  const w = 1024, h = 150;
  const c = makeCanvas(w, h);
  const g = c.getContext('2d');
  const br = g.createLinearGradient(0, 0, 0, h);
  br.addColorStop(0, '#6e5224');
  br.addColorStop(0.2, '#e4cb90');
  br.addColorStop(0.5, '#b08a48');
  br.addColorStop(0.8, '#dcbe7c');
  br.addColorStop(1, '#5d4419');
  g.fillStyle = br;
  g.fillRect(0, 0, w, h);
  const rnd = seeded(77);
  for (let y = 0; y < h; y += 2) {
    g.fillStyle = `rgba(255,255,255,${rnd() * 0.05})`;
    g.fillRect(0, y, w, 1);
  }
  g.strokeStyle = 'rgba(60,40,10,0.75)';
  g.lineWidth = 3;
  g.strokeRect(14, 14, w - 28, h - 28);
  g.strokeStyle = 'rgba(255,240,200,0.5)';
  g.lineWidth = 1;
  g.strokeRect(19, 19, w - 38, h - 38);
  for (const x of [42, w - 42]) {
    const sg = g.createRadialGradient(x - 3, h / 2 - 3, 1, x, h / 2, 10);
    sg.addColorStop(0, '#f5e2b0');
    sg.addColorStop(1, '#6b4f20');
    g.fillStyle = sg;
    g.beginPath();
    g.arc(x, h / 2, 9, 0, Math.PI * 2);
    g.fill();
    g.strokeStyle = 'rgba(50,30,5,0.8)';
    g.beginPath();
    g.moveTo(x - 6, h / 2);
    g.lineTo(x + 6, h / 2);
    g.stroke();
  }
  g.textAlign = 'center';
  g.textBaseline = 'middle';
  g.letterSpacing = '12px';
  const t = text.toUpperCase();
  g.font = `600 58px ${SERIF}`;
  let size = 58;
  while (g.measureText(t).width > w - 160 && size > 24) {
    size -= 2;
    g.font = `600 ${size}px ${SERIF}`;
  }
  g.fillStyle = 'rgba(255,242,205,0.6)';
  g.fillText(t, w / 2 + 6, h / 2 + 3);
  g.fillStyle = '#35250d';
  g.fillText(t, w / 2 + 6, h / 2 + 1);
  return c;
}

// Placa minimalista: negro mate con letras blancas espaciadas (ático moderno).
function blackPlaqueCanvas(text) {
  const w = 1024, h = 150;
  const c = makeCanvas(w, h);
  const g = c.getContext('2d');
  g.fillStyle = '#141414';
  g.fillRect(0, 0, w, h);
  g.fillStyle = '#f2efe9';
  g.textAlign = 'center';
  g.textBaseline = 'middle';
  g.letterSpacing = '22px';
  const t = text.toUpperCase();
  let size = 48;
  g.font = `400 ${size}px "Helvetica Neue", Arial, sans-serif`;
  while (g.measureText(t).width > w - 140 && size > 20) {
    size -= 2;
    g.font = `400 ${size}px "Helvetica Neue", Arial, sans-serif`;
  }
  g.fillText(t, w / 2 + 11, h / 2 + 2);
  return c;
}

// ---------- Decoración ----------

export function globeCanvas() {
  const w = 512, h = 256;
  const c = makeCanvas(w, h);
  const g = c.getContext('2d', { willReadFrequently: true });
  const rnd = seeded(12);
  const sea = g.createLinearGradient(0, 0, 0, h);
  sea.addColorStop(0, '#b9a274');
  sea.addColorStop(0.5, '#d2bd8c');
  sea.addColorStop(1, '#b39c6c');
  g.fillStyle = sea;
  g.fillRect(0, 0, w, h);
  for (let k = 0; k < 9; k++) {
    const cx = rnd() * w, cy = 40 + rnd() * (h - 80), r = 18 + rnd() * 42;
    g.beginPath();
    for (let i = 0; i <= 18; i++) {
      const a = (i / 18) * Math.PI * 2;
      const rr = r * (0.6 + rnd() * 0.6);
      const x = cx + Math.cos(a) * rr * 1.4, y = cy + Math.sin(a) * rr;
      if (i === 0) g.moveTo(x, y);
      else g.lineTo(x, y);
    }
    g.closePath();
    g.fillStyle = rnd() < 0.5 ? '#7c6b3e' : '#8c5e3c';
    g.fill();
    g.strokeStyle = 'rgba(60,40,20,0.6)';
    g.stroke();
  }
  g.strokeStyle = 'rgba(80,55,25,0.35)';
  g.lineWidth = 1;
  for (let x = 0; x < w; x += 32) { g.beginPath(); g.moveTo(x, 0); g.lineTo(x, h); g.stroke(); }
  for (let y = 0; y < h; y += 32) { g.beginPath(); g.moveTo(0, y); g.lineTo(w, y); g.stroke(); }
  grain(g, w, h, 0.08, rnd);
  return c;
}

export function paintingCanvas(seed = 5) {
  const w = 160, h = 200;
  const c = makeCanvas(w, h);
  const g = c.getContext('2d', { willReadFrequently: true });
  const rnd = seeded(seed);
  const sky = g.createLinearGradient(0, 0, 0, h);
  sky.addColorStop(0, '#5b5236');
  sky.addColorStop(0.5, '#b39a62');
  sky.addColorStop(1, '#3e3420');
  g.fillStyle = sky;
  g.fillRect(0, 0, w, h);
  for (let layer = 0; layer < 3; layer++) {
    g.fillStyle = ['#4a4a2c', '#33361f', '#1f2214'][layer];
    g.beginPath();
    g.moveTo(0, h);
    const base = h * (0.55 + layer * 0.12);
    for (let x = 0; x <= w; x += 10) g.lineTo(x, base - Math.sin(x * 0.03 + layer * 2 + rnd()) * 14 - rnd() * 6);
    g.lineTo(w, h);
    g.fill();
  }
  const v = g.createRadialGradient(w / 2, h / 2, 20, w / 2, h / 2, 120);
  v.addColorStop(0, 'rgba(0,0,0,0)');
  v.addColorStop(1, 'rgba(0,0,0,0.55)');
  g.fillStyle = v;
  g.fillRect(0, 0, w, h);
  grain(g, w, h, 0.1, rnd);
  return c;
}

export function dustSprite() {
  const c = makeCanvas(32, 32);
  const g = c.getContext('2d');
  const r = g.createRadialGradient(16, 16, 0, 16, 16, 16);
  r.addColorStop(0, 'rgba(255,240,210,1)');
  r.addColorStop(0.4, 'rgba(255,220,170,0.35)');
  r.addColorStop(1, 'rgba(255,220,170,0)');
  g.fillStyle = r;
  g.fillRect(0, 0, 32, 32);
  return c;
}

// ---------- Texturas CSS para el lector ----------

const urlCache = new Map();

export function paperDataURL() {
  if (urlCache.has('paper')) return urlCache.get('paper');
  const w = 256, h = 256;
  const c = makeCanvas(w, h);
  const g = c.getContext('2d', { willReadFrequently: true });
  const rnd = seeded(31);
  g.fillStyle = '#f4ecda';
  g.fillRect(0, 0, w, h);
  grain(g, w, h, 0.05, rnd);
  for (let i = 0; i < 70; i++) {
    g.strokeStyle = `rgba(150,120,80,${0.04 + rnd() * 0.06})`;
    g.lineWidth = 0.6;
    g.beginPath();
    const x = rnd() * w, y = rnd() * h, a = rnd() * Math.PI;
    g.moveTo(x, y);
    g.quadraticCurveTo(x + Math.cos(a) * 6, y + Math.sin(a) * 6 + 3, x + Math.cos(a) * 12, y + Math.sin(a) * 12);
    g.stroke();
  }
  const url = c.toDataURL('image/png');
  urlCache.set('paper', url);
  return url;
}

export function clothDataURL(color) {
  const key = 'cloth' + color;
  if (urlCache.has(key)) return urlCache.get(key);
  const w = 96, h = 96;
  const c = makeCanvas(w, h);
  const g = c.getContext('2d', { willReadFrequently: true });
  g.fillStyle = color;
  g.fillRect(0, 0, w, h);
  for (let y = 0; y < h; y += 2) {
    g.fillStyle = y % 4 ? 'rgba(255,255,255,0.035)' : 'rgba(0,0,0,0.07)';
    g.fillRect(0, y, w, 1);
  }
  for (let x = 0; x < w; x += 2) {
    g.fillStyle = x % 4 ? 'rgba(255,255,255,0.03)' : 'rgba(0,0,0,0.06)';
    g.fillRect(x, 0, 1, h);
  }
  grain(g, w, h, 0.06, seeded(2));
  const url = c.toDataURL('image/png');
  urlCache.set(key, url);
  return url;
}

// Ruido de valor suave con 4 octavas, en 0..1.
function fbmNoise(rnd) {
  const perm = new Uint8Array(512);
  const vals = new Float32Array(256);
  for (let i = 0; i < 256; i++) {
    perm[i] = i;
    vals[i] = rnd();
  }
  for (let i = 255; i > 0; i--) {
    const j = Math.floor(rnd() * (i + 1));
    [perm[i], perm[j]] = [perm[j], perm[i]];
  }
  for (let i = 0; i < 256; i++) perm[i + 256] = perm[i];
  const lat = (x, y) => vals[perm[(x & 255) + perm[y & 255]]];
  const sm = (t) => t * t * (3 - 2 * t);
  const noise = (x, y) => {
    const xi = Math.floor(x), yi = Math.floor(y);
    const u = sm(x - xi), v = sm(y - yi);
    const a = lat(xi, yi), b = lat(xi + 1, yi), c = lat(xi, yi + 1), d = lat(xi + 1, yi + 1);
    return a + (b - a) * u + (c - a) * v + (a - b - c + d) * u * v;
  };
  return (x, y) => {
    let s = 0, amp = 0.5, f = 1;
    for (let o = 0; o < 4; o++) {
      s += amp * noise(x * f, y * f);
      f *= 2;
      amp *= 0.5;
    }
    return s / 0.9375;
  };
}

const shade2 = (rgb, f) => rgb.map((c) => c + (255 - c) * f);

// Papel de guarda marmolado (como los libros antiguos) en el tono del libro.
export function marbleDataURL(color, seed = 1) {
  const key = 'marble' + color + seed;
  if (urlCache.has(key)) return urlCache.get(key);
  const w = 320, h = 440;
  const c = makeCanvas(w, h);
  const g = c.getContext('2d');
  const img = g.createImageData(w, h);
  const d = img.data;
  const base = hexToRgb(shade(color, 0.08));
  const deep = hexToRgb(shade(color, -0.45));
  const cream = [232, 220, 192];
  const gold = [182, 146, 82];
  const rnd = seeded(seed);
  const fbm = fbmNoise(rnd);
  const ox = rnd() * 50, oy = rnd() * 50;
  const mix = (a, b, t) => [a[0] + (b[0] - a[0]) * t, a[1] + (b[1] - a[1]) * t, a[2] + (b[2] - a[2]) * t];
  // Mármol "piedra": ruido deformado sobre sí mismo, con vetas finas color crema y oro.
  for (let y = 0; y < h; y++) {
    for (let x = 0; x < w; x++) {
      const nx = (x / w) * 5 + ox, ny = (y / w) * 5 + oy;
      const q = fbm(nx, ny);
      const r = fbm(nx + 4 * q + 1.7, ny + 4 * q + 9.2);
      const v = fbm(nx * 1.4 + 3 * r, ny * 1.4 + 3 * r);
      let col = r < 0.5 ? mix(deep, base, clamp(r * 2, 0, 1)) : mix(base, shade2(base, 0.12), clamp((r - 0.5) * 2, 0, 1));
      const k = Math.abs(Math.sin(v * 46));
      if (k < 0.14) col = mix(col, Math.floor(v * 46 / Math.PI) % 3 === 0 ? gold : cream, (1 - k / 0.14) * 0.85);
      const i = (y * w + x) * 4;
      const n = (rnd() - 0.5) * 14;
      d[i] = col[0] + n;
      d[i + 1] = col[1] + n;
      d[i + 2] = col[2] + n;
      d[i + 3] = 255;
    }
  }
  g.putImageData(img, 0, 0);
  const out = makeCanvas(w, h);
  const og = out.getContext('2d');
  og.filter = 'blur(0.7px)';
  og.drawImage(c, 0, 0);
  const url = out.toDataURL('image/jpeg', 0.88);
  urlCache.set(key, url);
  return url;
}

export function deskDataURL() {
  if (urlCache.has('desk')) return urlCache.get('desk');
  const url = woodCanvas({ w: 1024, h: 512, base: '#3a1a0e', dark: '#170803', light: '#5e2c16', seed: 41, lines: 420 }).toDataURL('image/jpeg', 0.85);
  urlCache.set('desk', url);
  return url;
}
