// Estadio de tenis del fondo «Tennis»: la cancha de arcilla vista desde un palco alto, detrás de la línea de fondo.
// El estadio se arma como si la cámara mirara hacia abajo y después se inclina entero hacia la cámara real
// (que mira derecho a la estantería): así la cancha se ve desde arriba, a lo largo, sin mover la cámara.
// Tiene vida: dos cuidadores pasan la alfombra (cada uno en su mitad, sin cruzar la red ni las paredes),
// aspersores, cámara aérea colgada de cables, pájaros, banderas al viento y el reloj del marcador.
import * as THREE from 'three';
import { makeCanvas, seeded, grain } from './textures.js';
import { tennisSky } from './backdrops.js';

const PITCH = THREE.MathUtils.degToRad(12); // cuánto mira hacia abajo el palco
const EYE = new THREE.Vector3(0, 1.71, 2.51); // dónde suele estar la cámara
const EYE_H = 15.2; // altura del palco sobre la arcilla
const EYE_D = 39.6; // distancia horizontal hasta la línea de fondo cercana
const HW = 9.2, HL = 18.3; // media anchura y media longitud de la arcilla (m)
const CORNER = 3; // radio de las esquinas de la tribuna
const NEAR_Z = 62; // las tribunas laterales siguen hasta detrás del palco

const std = (o) => new THREE.MeshStandardMaterial(o);

function tex(canvas, repeat) {
  const t = new THREE.CanvasTexture(canvas);
  t.colorSpace = THREE.SRGBColorSpace;
  t.anisotropy = 8;
  if (repeat) {
    t.wrapS = t.wrapT = THREE.RepeatWrapping;
    t.repeat.set(repeat[0], repeat[1]);
  }
  return t;
}

const roundRect = (g, x, y, w, h, r) => {
  g.beginPath();
  g.moveTo(x + r, y);
  g.arcTo(x + w, y, x + w, y + h, r);
  g.arcTo(x + w, y + h, x, y + h, r);
  g.arcTo(x, y + h, x, y, r);
  g.arcTo(x, y, x + w, y, r);
  g.closePath();
};

// ---------- Texturas ----------

// Una fila de butacas vista desde arriba (6 m a lo ancho; abajo del lienzo es el borde que da a la cancha).
function seatTopCanvas(seat) {
  const W = 512, H = 64, ppm = W / 6;
  const c = makeCanvas(W, H);
  const g = c.getContext('2d', { willReadFrequently: true });
  const rnd = seeded(7);
  g.fillStyle = '#a9a49b';
  g.fillRect(0, 0, W, H);
  g.fillStyle = '#8f8a82';
  g.fillRect(0, 0, W, H * 0.58);
  for (let x = 0; x + 0.5 * ppm <= W + 1; x += 0.5 * ppm) {
    const k = 0.92 + rnd() * 0.12;
    g.fillStyle = 'rgba(0,0,0,0.35)';
    roundRect(g, x + 3, 7, 0.5 * ppm - 5, H * 0.5, 5);
    g.fill();
    g.fillStyle = `rgb(${seat.map((v) => Math.min(255, v * k)).join(',')})`;
    roundRect(g, x + 2, 4, 0.5 * ppm - 5, H * 0.48, 5);
    g.fill();
  }
  grain(g, W, H, 0.05, rnd);
  return c;
}

// El frente de cada escalón: los respaldos de la fila de abajo (abajo del lienzo es el piso de esa fila).
function seatBackCanvas(seat) {
  const W = 512, H = 64, ppm = W / 6;
  const c = makeCanvas(W, H);
  const g = c.getContext('2d', { willReadFrequently: true });
  const rnd = seeded(9);
  g.fillStyle = '#3a3935';
  g.fillRect(0, 0, W, H);
  for (let x = 0; x + 0.5 * ppm <= W + 1; x += 0.5 * ppm) {
    const k = 0.9 + rnd() * 0.14;
    const grad = g.createLinearGradient(0, 6, 0, H - 6);
    grad.addColorStop(0, `rgb(${seat.map((v) => Math.min(255, v * k * 1.18)).join(',')})`);
    grad.addColorStop(1, `rgb(${seat.map((v) => v * k * 0.78).join(',')})`);
    g.fillStyle = grad;
    roundRect(g, x + 3, 6, 0.5 * ppm - 7, H * 0.72, 7);
    g.fill();
    g.fillStyle = `rgb(${seat.map((v) => v * k * 0.62).join(',')})`;
    g.fillRect(x + 4, H - 9, 0.5 * ppm - 9, 5);
  }
  grain(g, W, H, 0.05, rnd);
  return c;
}

// Vidrios de los palcos entre los dos anillos (6 m a lo ancho, 3 m de alto), con luces cálidas adentro.
function logeGlassCanvas(emissive = false) {
  const W = 512, H = 128;
  const c = makeCanvas(W, H);
  const g = c.getContext('2d');
  const rnd = seeded(41);
  const grad = g.createLinearGradient(0, 0, 0, H);
  grad.addColorStop(0, emissive ? '#000' : '#203433');
  grad.addColorStop(1, emissive ? '#000' : '#0f1c1c');
  g.fillStyle = grad;
  g.fillRect(0, 0, W, H);
  for (let i = 0; i < 4; i++) {
    const x = i * 128;
    if (rnd() < 0.55) {
      const lg = g.createRadialGradient(x + 64, 70, 4, x + 64, 70, 70);
      lg.addColorStop(0, emissive ? 'rgba(255,214,150,0.9)' : 'rgba(255,214,150,0.45)');
      lg.addColorStop(1, 'rgba(255,214,150,0)');
      g.fillStyle = lg;
      g.fillRect(x, 10, 128, H - 20);
    }
    if (!emissive) {
      g.fillStyle = 'rgba(255,255,255,0.06)';
      g.beginPath();
      g.moveTo(x + 20, 12); g.lineTo(x + 60, 12); g.lineTo(x + 30, H - 12); g.lineTo(x - 10, H - 12);
      g.fill();
    }
  }
  if (!emissive) {
    g.fillStyle = '#2b2f2e';
    for (let x = 0; x <= W; x += 128) g.fillRect(x - 3, 0, 6, H);
    g.fillStyle = '#e9e6de';
    g.fillRect(0, 0, W, 9);
    g.fillRect(0, H - 9, W, 9);
  }
  return c;
}

// Muro verde que rodea la arcilla (8 m a lo ancho), con su filo blanco y polvo de arcilla abajo.
function courtWallCanvas() {
  const W = 512, H = 80;
  const c = makeCanvas(W, H);
  const g = c.getContext('2d', { willReadFrequently: true });
  const rnd = seeded(12);
  g.fillStyle = '#16503a';
  g.fillRect(0, 0, W, H);
  g.fillStyle = 'rgba(0,0,0,0.25)';
  for (let x = 0; x < W; x += 128) g.fillRect(x, 0, 2, H);
  const dust = g.createLinearGradient(0, H, 0, H * 0.6);
  dust.addColorStop(0, 'rgba(170,80,45,0.55)');
  dust.addColorStop(1, 'rgba(170,80,45,0)');
  g.fillStyle = dust;
  g.fillRect(0, H * 0.6, W, H * 0.4);
  g.fillStyle = '#f1eee6';
  g.fillRect(0, 0, W, 5);
  grain(g, W, H, 0.05, rnd);
  return c;
}

// Parte de abajo del techo (6 m), con los reflectores encendidos.
function rimUnderCanvas(emissive = false) {
  const W = 256, H = 64;
  const c = makeCanvas(W, H);
  const g = c.getContext('2d');
  g.fillStyle = emissive ? '#000' : '#4a4d50';
  g.fillRect(0, 0, W, H);
  for (let i = 0; i < 3; i++) {
    g.fillStyle = emissive ? '#fff7e6' : '#f4f1ea';
    g.fillRect(18 + i * 82, 6, 50, 10);
  }
  if (!emissive) {
    g.fillStyle = 'rgba(0,0,0,0.25)';
    for (let x = 0; x < W; x += 64) g.fillRect(x, 0, 2, H);
  }
  return c;
}

// La arcilla de la cancha a lo largo: 18,4 m (x) por 36,6 m (z), con las líneas, marcas de la alfombra y pisadas.
function clayCanvas() {
  const ppm = 36;
  const W = Math.round(2 * HW * ppm), H = Math.round(2 * HL * ppm);
  const c = makeCanvas(W, H);
  const g = c.getContext('2d', { willReadFrequently: true });
  const rnd = seeded(31);
  g.fillStyle = '#c4643a';
  g.fillRect(0, 0, W, H);
  const X = (m) => W / 2 + m * ppm;
  const Y = (m) => H / 2 + m * ppm;
  // vetas de la alfombra en óvalos, como queda la arcilla recién pasada
  for (const cz of [-9.1, 9.1]) {
    for (let k = 0; k < 9; k++) {
      g.strokeStyle = `rgba(${k % 2 ? '235,150,105' : '140,55,25'},0.07)`;
      g.lineWidth = 0.9 * ppm;
      g.beginPath();
      g.ellipse(X(0), Y(cz), (2.2 + k * 0.62) * ppm, (2.0 + k * 0.6) * ppm, 0, 0, Math.PI * 2);
      g.stroke();
    }
  }
  for (let i = 0; i < 1600; i++) {
    g.fillStyle = `rgba(${rnd() < 0.5 ? '125,45,20' : '235,150,105'},${0.04 + rnd() * 0.07})`;
    g.fillRect(rnd() * W, rnd() * H, 2 + rnd() * 10, 2 + rnd() * 10);
  }
  // desgaste detrás de las líneas de fondo y junto a la red
  for (const z of [-12.6, 12.6]) {
    const wear = g.createRadialGradient(X(0), Y(z), 10, X(0), Y(z), 4.5 * ppm);
    wear.addColorStop(0, 'rgba(150,60,30,0.35)');
    wear.addColorStop(1, 'rgba(150,60,30,0)');
    g.fillStyle = wear;
    g.fillRect(X(-6), Y(z) - 4.5 * ppm, 12 * ppm, 9 * ppm);
  }
  grain(g, W, H, 0.06, rnd);
  // líneas (cinta blanca algo empolvada)
  g.strokeStyle = 'rgba(248,244,236,0.95)';
  g.lineWidth = 0.06 * ppm;
  g.strokeRect(X(-5.485), Y(-11.885), 10.97 * ppm, 23.77 * ppm); // dobles
  g.beginPath();
  for (const s of [-4.115, 4.115]) { g.moveTo(X(s), Y(-11.885)); g.lineTo(X(s), Y(11.885)); } // individuales
  for (const z of [-6.4, 6.4]) { g.moveTo(X(-4.115), Y(z)); g.lineTo(X(4.115), Y(z)); } // líneas de saque
  g.moveTo(X(0), Y(-6.4)); g.lineTo(X(0), Y(6.4)); // línea central de saque
  for (const z of [-11.885, 11.885]) { g.moveTo(X(0), Y(z)); g.lineTo(X(0), Y(z - Math.sign(z) * 0.12)); }
  g.stroke();
  // polvo de arcilla sobre las líneas
  for (let i = 0; i < 900; i++) {
    g.fillStyle = 'rgba(196,100,58,0.35)';
    g.fillRect(rnd() * W, rnd() * H, 1.5, 1.5);
  }
  return c;
}

function flagCanvas(kind) {
  const c = makeCanvas(96, 64);
  const g = c.getContext('2d');
  if (kind === 'fr') {
    ['#24408e', '#f4f4f0', '#d52b2b'].forEach((col, i) => { g.fillStyle = col; g.fillRect(i * 32, 0, 32, 64); });
  } else {
    g.fillStyle = '#1b5a3c';
    g.fillRect(0, 0, 96, 64);
    g.fillStyle = '#f1eee6';
    g.fillRect(0, 26, 96, 4);
    g.fillRect(0, 34, 96, 4);
  }
  return c;
}

// Red de la alfombra de arrastre (malla verde oscura con huecos).
function dragMatCanvas() {
  const c = makeCanvas(128, 64);
  const g = c.getContext('2d');
  g.clearRect(0, 0, 128, 64);
  g.strokeStyle = 'rgba(30,62,44,1)';
  g.lineWidth = 2;
  for (let x = 0; x <= 128; x += 6) { g.beginPath(); g.moveTo(x, 0); g.lineTo(x, 64); g.stroke(); }
  for (let y = 0; y <= 64; y += 6) { g.beginPath(); g.moveTo(0, y); g.lineTo(128, y); g.stroke(); }
  return c;
}

function netCanvas() {
  const c = makeCanvas(512, 48);
  const g = c.getContext('2d');
  g.clearRect(0, 0, 512, 48);
  g.strokeStyle = 'rgba(18,22,20,0.9)';
  g.lineWidth = 1;
  for (let x = 0; x < 512; x += 4) { g.beginPath(); g.moveTo(x, 5); g.lineTo(x, 48); g.stroke(); }
  for (let y = 5; y < 48; y += 4) { g.beginPath(); g.moveTo(0, y); g.lineTo(512, y); g.stroke(); }
  g.fillStyle = '#f5f5ee';
  g.fillRect(0, 0, 512, 6);
  g.fillRect(0, 44, 512, 4);
  return c;
}

// Pantalla del marcador: la hora de París (la del dispositivo) con los dos puntos titilando.
function drawScoreboard(c, now) {
  const g = c.getContext('2d');
  const W = c.width, H = c.height;
  g.fillStyle = '#0b2418';
  g.fillRect(0, 0, W, H);
  g.strokeStyle = '#c9a25a';
  g.lineWidth = 6;
  g.strokeRect(10, 10, W - 20, H - 20);
  g.fillStyle = '#e9e4d6';
  g.textBaseline = 'middle';
  g.font = '600 46px "Cormorant Garamond", Georgia, serif';
  g.textAlign = 'left';
  g.fillText('PARIS', 48, H * 0.34);
  g.font = 'italic 500 34px "Cormorant Garamond", Georgia, serif';
  g.fillStyle = '#b9cdbf';
  g.fillText('Court central · terre battue', 48, H * 0.68);
  const hh = String(now.getHours()).padStart(2, '0');
  const mm = String(now.getMinutes()).padStart(2, '0');
  g.textAlign = 'right';
  g.fillStyle = '#f4c95d';
  g.font = '600 130px "Cormorant Garamond", Georgia, serif';
  g.fillText(`${hh}${now.getSeconds() % 2 ? ':' : ' '}${mm}`, W - 48, H * 0.54);
}

// ---------- Tribunas ----------

// Recorrido del pie de la tribuna: lateral derecho, esquina, fondo, esquina, lateral izquierdo.
// Cada punto lleva su normal hacia afuera (hacia donde sube la tribuna).
function standPath() {
  const S = [];
  const push = (x, z, nx, nz) => S.push({ x, z, nx, nz });
  const arc = (cx, cz, a0) => {
    for (let i = 1; i < 10; i++) {
      const a = a0 - (i / 10) * (Math.PI / 2);
      push(cx + Math.cos(a) * CORNER, cz + Math.sin(a) * CORNER, Math.cos(a), Math.sin(a));
    }
  };
  for (let z = NEAR_Z; z > -HL + CORNER; z -= 3) push(HW, z, 1, 0);
  push(HW, -HL + CORNER, 1, 0);
  arc(HW - CORNER, -HL + CORNER, 0);
  for (let x = HW - CORNER; x > -HW + CORNER; x -= 2) push(x, -HL, 0, -1);
  push(-HW + CORNER, -HL, 0, -1);
  arc(-HW + CORNER, -HL + CORNER, -Math.PI / 2);
  for (let z = -HL + CORNER; z <= NEAR_Z; z += 3) push(-HW, z, -1, 0);
  return S;
}

// Perfil de la tribuna: [distancia hacia afuera, altura, tipo del tramo que termina en ese punto].
function standProfile() {
  const P = [[0, 0]];
  let d = 0, h = 0;
  const up = (dh, kind) => P.push([d, (h += dh), kind]);
  const out = (dd, kind) => P.push([(d += dd), h, kind]);
  up(1.25, 'wall');
  for (let i = 0; i < 18; i++) {
    const vip = i < 4 ? 'V' : '';
    out(0.8, 'seat' + vip);
    up(0.42, 'back' + vip);
  }
  out(1.6, 'walk');
  up(3.0, 'glass');
  for (let i = 0; i < 10; i++) {
    out(0.85, 'seat');
    up(0.5, 'back');
  }
  out(1.2, 'walk');
  up(2.67, 'top');
  return P;
}

const RIM_PROFILE = [[18, 19.5], [18, 20.9, 'rimFront'], [28.5, 20.9, 'rimTop'], [28.5, 19.5, 'rimBack'], [18, 19.5, 'rimUnder']];

// Barre el perfil a lo largo del recorrido; devuelve una geometría por tipo de tramo (cada uno con su material).
// La coordenada u va en metros a lo largo de cada línea; v va de 0 a 1 a lo ancho del tramo.
function sweep(path, prof, tiles) {
  const groups = {};
  for (let j = 0; j < prof.length - 1; j++) {
    const [d0, h0] = prof[j], [d1, h1, kind] = prof[j + 1];
    const gr = (groups[kind] ??= { pos: [], uv: [], idx: [] });
    const tile = tiles[kind] ?? 6;
    const base = gr.pos.length / 3;
    let u = 0, px = 0, pz = 0;
    path.forEach((s, i) => {
      const ax = s.x + s.nx * d0, az = s.z + s.nz * d0;
      const bx = s.x + s.nx * d1, bz = s.z + s.nz * d1;
      const mx = (ax + bx) / 2, mz = (az + bz) / 2;
      if (i) u += Math.hypot(mx - px, mz - pz);
      px = mx;
      pz = mz;
      gr.pos.push(ax, h0, az, bx, h1, bz);
      gr.uv.push(u / tile, 0, u / tile, 1);
      if (i) {
        const a = base + (i - 1) * 2;
        gr.idx.push(a, a + 1, a + 2, a + 1, a + 3, a + 2);
      }
    });
  }
  const out = {};
  for (const [k, gr] of Object.entries(groups)) {
    const geo = new THREE.BufferGeometry();
    geo.setAttribute('position', new THREE.Float32BufferAttribute(gr.pos, 3));
    geo.setAttribute('uv', new THREE.Float32BufferAttribute(gr.uv, 2));
    geo.setIndex(gr.idx);
    geo.computeVertexNormals();
    out[k] = geo;
  }
  return out;
}

// Punto del recorrido a una distancia d hacia afuera, buscando el más cercano a una posición del eje.
function pathPoint(path, i, d, h) {
  const s = path[i];
  return new THREE.Vector3(s.x + s.nx * d, h, s.z + s.nz * d);
}

function buildBowl(court) {
  const path = standPath();
  const seatGrey = [132, 126, 116], seatGreen = [40, 96, 64];
  const mats = {
    wall: std({ map: tex(courtWallCanvas(), [1, 1]), roughness: 0.8 }),
    seat: std({ map: tex(seatTopCanvas(seatGrey)), roughness: 0.85 }),
    back: std({ map: tex(seatBackCanvas(seatGrey)), roughness: 0.7 }),
    seatV: std({ map: tex(seatTopCanvas(seatGreen)), roughness: 0.8 }),
    backV: std({ map: tex(seatBackCanvas(seatGreen)), roughness: 0.6 }),
    walk: std({ color: 0xa9a49a, roughness: 0.9 }),
    glass: std({ map: tex(logeGlassCanvas()), emissive: 0xffffff, emissiveMap: tex(logeGlassCanvas(true)), emissiveIntensity: 0.5, roughness: 0.15, metalness: 0.4 }),
    top: std({ color: 0xd6d2c8, roughness: 0.8 }),
    rimFront: std({ color: 0xf2f0ea, roughness: 0.5, metalness: 0.2 }),
    rimTop: std({ color: 0xdedbd2, roughness: 0.7 }),
    rimBack: std({ color: 0xcfcbc1, roughness: 0.7 }),
    rimUnder: std({ map: tex(rimUnderCanvas()), emissive: 0xffffff, emissiveMap: tex(rimUnderCanvas(true)), emissiveIntensity: 1.4, roughness: 0.6 }),
  };
  for (const m of Object.values(mats)) for (const k of ['map', 'emissiveMap']) if (m[k]) m[k].wrapS = THREE.RepeatWrapping;
  const tiles = { wall: 8, seat: 6, back: 6, seatV: 6, backV: 6, glass: 6, walk: 6, top: 6, rimUnder: 6 };
  const add = (geos) => {
    for (const [k, geo] of Object.entries(geos)) {
      const m = new THREE.Mesh(geo, mats[k]);
      m.castShadow = m.receiveShadow = true;
      court.add(m);
    }
  };
  const prof = standProfile();
  add(sweep(path, prof, tiles));
  add(sweep(path, RIM_PROFILE, tiles));
  buildAisles(court, path, prof);
  // reflectores colgados del frente del techo y banderas sobre el techo, en el fondo y las esquinas
  const lightMat = std({ color: 0xffffff, emissive: 0xfff4dc, emissiveIntensity: 2.2 });
  const lightGeo = new THREE.BoxGeometry(1.6, 0.35, 0.4);
  const flags = [];
  path.forEach((s, i) => {
    const behindEye = s.z > 20;
    if (behindEye) return;
    if (i % 3 === 0) {
      const p = pathPoint(path, i, 18.2, 19.2);
      const l = new THREE.Mesh(lightGeo, lightMat);
      l.position.copy(p);
      l.rotation.y = Math.atan2(s.nx, s.nz);
      court.add(l);
    }
    if (i % 4 === 1 && s.z < 12) flags.push(s);
  });
  return { path, flags };
}

// Escaleras de los pasillos: bajan derecho hacia la cancha por encima de las filas.
function buildAisles(court, path, prof) {
  const spots = [];
  path.forEach((s, i) => {
    const side = s.nz === 0 && Math.abs(s.nx) === 1 && s.z > -15 && s.z < 22;
    if (side && Math.round((NEAR_Z - s.z) / 3) % 3 === 1) spots.push(s);
  });
  for (const x of [-4.2, 4.2]) spots.push({ x, z: -HL, nx: 0, nz: -1 });
  for (const [cx, cz, a] of [[HW - CORNER, -HL + CORNER, -Math.PI / 4], [-HW + CORNER, -HL + CORNER, (-3 * Math.PI) / 4]]) {
    spots.push({ x: cx + Math.cos(a) * CORNER, z: cz + Math.sin(a) * CORNER, nx: Math.cos(a), nz: Math.sin(a) });
  }
  const pos = [];
  const lift = 0.014;
  for (const s of spots) {
    const tx = -s.nz * 0.55, tz = s.nx * 0.55;
    const pt = ([d, h]) => {
      const dd = d - lift;
      return [s.x + s.nx * dd, h + lift, s.z + s.nz * dd];
    };
    for (let j = 1; j < prof.length - 1; j++) {
      const a = pt(prof[j]), b = pt(prof[j + 1]);
      const A0 = [a[0] - tx, a[1], a[2] - tz], A1 = [a[0] + tx, a[1], a[2] + tz];
      const B0 = [b[0] - tx, b[1], b[2] - tz], B1 = [b[0] + tx, b[1], b[2] + tz];
      pos.push(...A0, ...A1, ...B0, ...A1, ...B1, ...B0);
    }
  }
  const geo = new THREE.BufferGeometry();
  geo.setAttribute('position', new THREE.Float32BufferAttribute(pos, 3));
  geo.computeVertexNormals();
  const stairs = new THREE.Mesh(geo, std({ color: 0xcdc8bd, roughness: 0.9, side: THREE.DoubleSide }));
  stairs.receiveShadow = true;
  court.add(stairs);
}

function buildFlags(court, spots) {
  const poleGeo = new THREE.CylinderGeometry(0.06, 0.06, 4, 6);
  const poleMat = std({ color: 0xe6e3dc, roughness: 0.4, metalness: 0.5 });
  const mats = [std({ map: tex(flagCanvas('fr')), side: THREE.DoubleSide, roughness: 0.8 }), std({ map: tex(flagCanvas('green')), side: THREE.DoubleSide, roughness: 0.8 })];
  return spots.map((s, i) => {
    const g = new THREE.Group();
    g.position.set(s.x + s.nx * 19.5, 20.9, s.z + s.nz * 19.5);
    g.rotation.y = Math.atan2(-s.nx, -s.nz);
    const pole = new THREE.Mesh(poleGeo, poleMat);
    pole.position.y = 2;
    const geo = new THREE.PlaneGeometry(2.4, 1.5, 10, 1);
    geo.translate(1.2, 3.2, 0);
    const flag = new THREE.Mesh(geo, mats[i % 2]);
    g.add(pole, flag);
    g.userData.dynamic = true;
    court.add(g);
    return { geo, x: Float32Array.from({ length: geo.attributes.position.count }, (_, k) => geo.attributes.position.getX(k)), phase: i * 1.7 };
  });
}

// ---------- La cancha ----------

function buildCourt(court) {
  const clay = new THREE.Mesh(new THREE.PlaneGeometry(2 * HW, 2 * HL), std({ map: tex(clayCanvas()), roughness: 0.95 }));
  clay.rotation.x = -Math.PI / 2;
  clay.receiveShadow = true;
  court.add(clay);
  // muro de la cabecera cercana (queda casi siempre fuera de cuadro) y el piso de detrás
  const wall = new THREE.Mesh(new THREE.BoxGeometry(2 * HW, 1.25, 0.3), std({ color: 0x16503a, roughness: 0.8 }));
  wall.position.set(0, 0.625, HL + 0.15);
  const deck = new THREE.Mesh(new THREE.PlaneGeometry(2 * HW, 26), std({ color: 0x6b6862, roughness: 0.9 }));
  deck.rotation.x = -Math.PI / 2;
  deck.position.set(0, 1.25, HL + 13);
  court.add(wall, deck);
  // red con su caída hacia el centro, faja blanca y postes
  const netGeo = new THREE.PlaneGeometry(12.8, 1.07, 24, 1);
  const np = netGeo.attributes.position;
  for (let i = 0; i < np.count; i++) {
    const x = np.getX(i), top = np.getY(i) > 0;
    const sag = top ? (1 - (x / 6.4) ** 2) * 0.156 : 0;
    np.setY(i, (top ? 1.07 - sag : 0));
  }
  netGeo.computeVertexNormals();
  const net = new THREE.Mesh(netGeo, std({ map: tex(netCanvas()), transparent: true, alphaTest: 0.2, side: THREE.DoubleSide, roughness: 0.8 }));
  net.castShadow = true;
  court.add(net);
  const darkGreen = std({ color: 0x14432f, roughness: 0.55 });
  const white = std({ color: 0xf1efe8, roughness: 0.5 });
  for (const s of [-1, 1]) {
    const post = new THREE.Mesh(new THREE.CylinderGeometry(0.05, 0.05, 1.1, 12), darkGreen);
    post.position.set(s * 6.4, 0.55, 0);
    post.castShadow = true;
    court.add(post);
  }
  const strap = new THREE.Mesh(new THREE.BoxGeometry(0.05, 0.914, 0.02), white);
  strap.position.set(0, 0.457, 0);
  court.add(strap);
  // silla del juez de silla junto a la red y bancos de los jugadores
  const chair = new THREE.Group();
  const box = (sx, sy, sz, x, y, z, m = darkGreen) => {
    const b = new THREE.Mesh(new THREE.BoxGeometry(sx, sy, sz), m);
    b.position.set(x, y, z);
    b.castShadow = true;
    chair.add(b);
    return b;
  };
  for (const [x, z] of [[-0.32, -0.32], [0.32, -0.32], [-0.32, 0.32], [0.32, 0.32]]) box(0.06, 1.9, 0.06, x, 0.95, z);
  box(0.8, 0.08, 0.8, 0, 1.9, 0);
  box(0.75, 0.5, 0.06, 0, 2.2, -0.37);
  box(0.06, 0.35, 0.7, -0.37, 2.1, 0);
  box(0.06, 0.35, 0.7, 0.37, 2.1, 0);
  box(0.9, 0.05, 0.25, 0, 1.92, 0.48, white);
  for (let k = 0; k < 4; k++) box(0.7, 0.04, 0.12, 0, 0.4 + k * 0.4, 0.42);
  chair.position.set(-7.6, 0, 0);
  chair.rotation.y = Math.PI / 2;
  court.add(chair);
  for (const z of [-2.7, 2.7]) {
    const bench = new THREE.Group();
    const seat = new THREE.Mesh(new THREE.BoxGeometry(0.55, 0.45, 2.0), darkGreen);
    seat.position.y = 0.225;
    const back = new THREE.Mesh(new THREE.BoxGeometry(0.1, 0.55, 2.0), darkGreen);
    back.position.set(-0.25, 0.72, 0);
    const towel = new THREE.Mesh(new THREE.BoxGeometry(0.4, 0.06, 0.5), white);
    towel.position.set(0.02, 0.48, 0.5);
    bench.add(seat, back, towel);
    bench.traverse((m) => (m.castShadow = true));
    bench.position.set(-8.55, 0, z);
    court.add(bench);
  }
  // sillas de los jueces de línea en las esquinas y plataformas de fotógrafos detrás del fondo
  for (const [x, z] of [[-8.5, -15.5], [8.5, 15.5], [8.5, -15.5], [-8.5, 15.5]]) {
    const c = new THREE.Mesh(new THREE.BoxGeometry(0.5, 0.9, 0.5), darkGreen);
    c.position.set(x, 0.45, z);
    c.castShadow = true;
    court.add(c);
  }
  for (const x of [-4, 4]) {
    const pit = new THREE.Mesh(new THREE.BoxGeometry(2.4, 0.6, 1.2), std({ color: 0x0f3324, roughness: 0.7 }));
    pit.position.set(x, 0.3, -HL + 0.7);
    court.add(pit);
  }
}

// ---------- Cuidadores de la cancha ----------

// Personaje con aire de videojuego animado (hombros anchos, manos y zapatillas grandes), con polo verde,
// pantalón beige y gorra blanca.
// `outfit` cambia la ropa (el guía del museo va de traje oscuro y sin gorra).
export function buildKeeper(skinHex, hairHex, outfit = {}) {
  const o = { shirt: 0x1d5a3b, trim: 0xf2efe6, pants: 0xd6cbb0, shoe: 0xf6f5f0, cap: true, ...outfit };
  const M = (color, roughness = 0.75) => std({ color, roughness });
  const skin = M(skinHex, 0.55), polo = M(o.shirt, 0.8), trim = M(o.trim, 0.7), pants = M(o.pants, 0.85);
  const shoe = M(o.shoe, 0.45), sole = M(0x2e2e2e, 0.8), capM = M(0xf4f1e8, 0.6), brimM = M(o.shirt, 0.6), hairM = M(hairHex, 0.9);
  const dark = M(0x1a1410, 0.4);
  const cap = (r, len, m) => {
    const mesh = new THREE.Mesh(new THREE.CapsuleGeometry(r, len, 4, 12), m);
    mesh.castShadow = true;
    return mesh;
  };
  const root = new THREE.Group();
  const hips = new THREE.Group();
  hips.position.y = 0.975;
  root.add(hips);
  const pelvis = cap(0.135, 0.12, pants);
  pelvis.rotation.z = Math.PI / 2;
  pelvis.scale.set(1, 1, 0.8);
  hips.add(pelvis);
  const torso = new THREE.Group();
  torso.position.y = 0.04;
  hips.add(torso);
  // tronco en V: abdomen más angosto y pecho ancho, como los personajes animados
  const belly = cap(0.16, 0.12, polo);
  belly.position.y = 0.14;
  belly.scale.set(1.05, 1, 0.8);
  const chest = cap(0.19, 0.16, polo);
  chest.position.y = 0.36;
  chest.scale.set(1.22, 1, 0.8);
  const collar = new THREE.Mesh(new THREE.TorusGeometry(0.075, 0.024, 6, 16), trim);
  collar.rotation.x = Math.PI / 2;
  collar.position.y = 0.56;
  const placket = new THREE.Mesh(new THREE.BoxGeometry(0.05, 0.1, 0.02), trim);
  placket.position.set(0, 0.5, 0.15);
  const stripe = new THREE.Mesh(new THREE.CylinderGeometry(0.196, 0.196, 0.045, 18, 1, true), trim);
  stripe.scale.set(1.22, 1, 0.8);
  stripe.position.y = 0.33;
  const belt = new THREE.Mesh(new THREE.CylinderGeometry(0.158, 0.158, 0.055, 18), dark);
  belt.scale.set(1.08, 1, 0.88);
  belt.position.y = 0.02;
  const neck = new THREE.Mesh(new THREE.CylinderGeometry(0.055, 0.06, 0.1, 10), skin);
  neck.position.y = 0.6;
  torso.add(belly, chest, collar, placket, stripe, belt, neck);
  const head = new THREE.Group();
  head.position.y = 0.77;
  torso.add(head);
  const skull = new THREE.Mesh(new THREE.SphereGeometry(0.13, 22, 16), skin);
  skull.scale.set(0.93, 1.08, 1.0);
  skull.castShadow = true;
  const jaw = new THREE.Mesh(new THREE.SphereGeometry(0.09, 14, 10), skin);
  jaw.scale.set(1.05, 0.8, 1.0);
  jaw.position.set(0, -0.06, 0.03);
  const hair = new THREE.Mesh(new THREE.SphereGeometry(0.133, 16, 12, 0, Math.PI * 2, 0, Math.PI * 0.62), hairM);
  hair.rotation.x = -0.9;
  hair.position.set(0, 0.0, -0.015);
  const nose = new THREE.Mesh(new THREE.SphereGeometry(0.024, 8, 6), skin);
  nose.position.set(0, -0.005, 0.128);
  nose.scale.set(0.8, 1, 1.15);
  const eyeGeo = new THREE.SphereGeometry(0.016, 8, 6);
  const browGeo = new THREE.BoxGeometry(0.045, 0.012, 0.012);
  for (const s of [-1, 1]) {
    const eye = new THREE.Mesh(eyeGeo, dark);
    eye.position.set(s * 0.044, 0.03, 0.115);
    const brow = new THREE.Mesh(browGeo, hairM);
    brow.position.set(s * 0.045, 0.062, 0.115);
    brow.rotation.z = s * -0.12;
    const ear = new THREE.Mesh(new THREE.SphereGeometry(0.032, 8, 6), skin);
    ear.scale.set(0.5, 1, 0.8);
    ear.position.set(s * 0.122, 0.0, 0);
    head.add(eye, brow, ear);
  }
  const capTop = new THREE.Mesh(new THREE.SphereGeometry(0.138, 18, 10, 0, Math.PI * 2, 0, Math.PI / 2), capM);
  capTop.position.y = 0.035;
  capTop.scale.set(0.96, 0.72, 1.0);
  const brim = new THREE.Mesh(new THREE.CylinderGeometry(0.12, 0.12, 0.018, 18, 1, false, -Math.PI / 2, Math.PI), brimM);
  brim.position.set(0, 0.035, 0.085);
  brim.scale.set(1.0, 1, 1.25);
  brim.rotation.x = 0.22;
  if (o.cap) head.add(skull, jaw, hair, nose, capTop, brim);
  else {
    // sin gorra: pelo corto peinado arriba
    const top = new THREE.Mesh(new THREE.SphereGeometry(0.136, 18, 10, 0, Math.PI * 2, 0, Math.PI * 0.42), hairM);
    top.position.set(0, 0.02, -0.01);
    top.scale.set(0.97, 0.9, 1.03);
    head.add(skull, jaw, hair, nose, top);
  }
  // brazos: hombro → codo → mano (manos algo grandes)
  const arm = (s) => {
    const shoulder = new THREE.Group();
    shoulder.position.set(s * 0.26, 0.46, 0);
    const sleeve = cap(0.075, 0.08, polo);
    sleeve.position.y = -0.06;
    const cuff = new THREE.Mesh(new THREE.TorusGeometry(0.066, 0.012, 6, 14), trim);
    cuff.rotation.x = Math.PI / 2;
    cuff.position.y = -0.15;
    const upper = cap(0.052, 0.14, skin);
    upper.position.y = -0.17;
    const elbow = new THREE.Group();
    elbow.position.y = -0.3;
    const fore = cap(0.047, 0.16, skin);
    fore.position.y = -0.11;
    const hand = new THREE.Mesh(new THREE.SphereGeometry(0.06, 12, 10), skin);
    hand.scale.set(0.85, 1.1, 0.72);
    hand.position.y = -0.26;
    hand.castShadow = true;
    elbow.add(fore, hand);
    shoulder.add(sleeve, cuff, upper, elbow);
    torso.add(shoulder);
    return { shoulder, elbow, hand };
  };
  // piernas: cadera → rodilla → tobillo, con zapatillas gruesas
  const leg = (s) => {
    const hip = new THREE.Group();
    hip.position.set(s * 0.1, -0.02, 0);
    const thigh = cap(0.09, 0.26, pants);
    thigh.position.y = -0.2;
    const knee = new THREE.Group();
    knee.position.y = -0.42;
    const shin = cap(0.072, 0.28, pants);
    shin.position.y = -0.2;
    const ankle = new THREE.Group();
    ankle.position.y = -0.44;
    const foot = cap(0.066, 0.14, shoe);
    foot.rotation.x = Math.PI / 2;
    foot.scale.set(1.05, 1, 0.78);
    foot.position.set(0, -0.035, 0.055);
    const soleM = cap(0.069, 0.14, sole);
    soleM.rotation.x = Math.PI / 2;
    soleM.scale.set(1.08, 1.02, 0.35);
    soleM.position.set(0, -0.07, 0.055);
    ankle.add(foot, soleM);
    knee.add(shin, ankle);
    hip.add(thigh, knee);
    hips.add(hip);
    return { hip, knee, ankle };
  };
  const parts = { hips, torso, head, armL: arm(-1), armR: arm(1), legL: leg(-1), legR: leg(1) };
  return { root, parts };
}

// Recorrido cerrado de cada cuidador: rectángulo redondeado dentro de su mitad, lejos de la red y de los muros.
function ovalPath(cz, ax, az, r) {
  const sx = ax - r, sz = az - r;
  const segs = [
    { line: [ax, cz + sz, ax, cz - sz] },
    { arc: [sx, cz - sz, 0] },
    { line: [sx, cz - az, -sx, cz - az] },
    { arc: [-sx, cz - sz, -Math.PI / 2] },
    { line: [-ax, cz - sz, -ax, cz + sz] },
    { arc: [-sx, cz + sz, Math.PI] },
    { line: [-sx, cz + az, sx, cz + az] },
    { arc: [sx, cz + sz, Math.PI / 2] },
  ];
  for (const s of segs) s.len = s.line ? Math.hypot(s.line[2] - s.line[0], s.line[3] - s.line[1]) : (Math.PI / 2) * r;
  const total = segs.reduce((a, s) => a + s.len, 0);
  return (dist) => {
    let d = ((dist % total) + total) % total;
    for (const s of segs) {
      if (d > s.len) {
        d -= s.len;
        continue;
      }
      if (s.line) {
        const [x0, z0, x1, z1] = s.line, k = d / s.len;
        return { x: x0 + (x1 - x0) * k, z: z0 + (z1 - z0) * k, tx: (x1 - x0) / s.len, tz: (z1 - z0) / s.len };
      }
      const [cx, cz2, a0] = s.arc, a = a0 - d / r;
      return { x: cx + Math.cos(a) * r, z: cz2 + Math.sin(a) * r, tx: Math.sin(a), tz: -Math.cos(a) };
    }
    return { x: 0, z: cz, tx: 1, tz: 0 };
  };
}

function buildKeepers(court) {
  const matMat = std({ map: tex(dragMatCanvas()), transparent: true, alphaTest: 0.3, side: THREE.DoubleSide, roughness: 0.9 });
  const barMat = std({ color: 0x7a5a36, roughness: 0.7 });
  const ropeMat = new THREE.LineBasicMaterial({ color: 0xe8e0cc });
  const looks = [[0xc99b78, 0x2a1d14], [0x8d5a3b, 0x120c08]];
  return [
    { cz: 9.1, speed: 1.0, start: 0 },
    { cz: -9.1, speed: 0.9, start: 17 },
  ].map(({ cz, speed, start }, i) => {
    const k = buildKeeper(...looks[i]);
    k.root.userData.dynamic = true;
    court.add(k.root);
    const mat = new THREE.Group();
    const net = new THREE.Mesh(new THREE.PlaneGeometry(2.2, 1.3), matMat);
    net.rotation.x = -Math.PI / 2;
    net.position.y = 0.03;
    const bar = new THREE.Mesh(new THREE.BoxGeometry(2.3, 0.06, 0.07), barMat);
    bar.position.set(0, 0.05, 0.65);
    bar.castShadow = true;
    mat.add(net, bar);
    mat.userData.dynamic = true;
    court.add(mat);
    const ropeGeo = new THREE.BufferGeometry();
    ropeGeo.setAttribute('position', new THREE.BufferAttribute(new Float32Array(18), 3));
    const rope = new THREE.LineSegments(ropeGeo, ropeMat);
    rope.frustumCulled = false;
    court.add(rope);
    return { ...k, mat, rope, path: ovalPath(cz, 6.9, 6.7, 2.6), speed, s: start, seed: i * 2.3 };
  });
}

const tmpV = new THREE.Vector3();

function updateKeeper(k, court, t, dt) {
  k.s += k.speed * dt;
  const p = k.path(k.s);
  k.root.position.set(p.x, 0, p.z);
  k.root.rotation.y = Math.atan2(p.tx, p.tz);
  const ph = (k.s / 1.35) * Math.PI * 2;
  const { hips, torso, head, armL, armR, legL, legR } = k.parts;
  hips.position.y = 0.975 + Math.abs(Math.cos(ph)) * 0.03;
  hips.rotation.y = Math.sin(ph) * 0.08;
  torso.rotation.x = 0.2;
  torso.rotation.y = -Math.sin(ph) * 0.1;
  legL.hip.rotation.x = -Math.sin(ph) * 0.5;
  legR.hip.rotation.x = Math.sin(ph) * 0.5;
  legL.knee.rotation.x = 0.1 + 0.85 * Math.max(0, Math.sin(ph + 1.7));
  legR.knee.rotation.x = 0.1 + 0.85 * Math.max(0, Math.sin(ph + 1.7 + Math.PI));
  legL.ankle.rotation.x = -0.2 * Math.max(0, Math.sin(ph + 1.7));
  legR.ankle.rotation.x = -0.2 * Math.max(0, Math.sin(ph + 1.7 + Math.PI));
  // la mano derecha tira de la cuerda sobre el hombro; la izquierda acompaña el paso
  armR.shoulder.rotation.set(-0.55, 0, -0.2);
  armR.elbow.rotation.x = -1.7;
  armL.shoulder.rotation.set(Math.sin(ph) * 0.45 - 0.1, 0, 0.12);
  armL.elbow.rotation.x = -0.35 - Math.max(0, Math.sin(ph)) * 0.3;
  head.rotation.y = Math.sin(t * 0.25 + k.seed) * 0.35;
  head.rotation.x = -0.12;
  // la alfombra va detrás, siguiendo el mismo recorrido
  const m = k.path(k.s - 2.5);
  k.mat.position.set(m.x, 0, m.z);
  k.mat.rotation.y = Math.atan2(m.tx, m.tz);
  k.root.updateMatrixWorld(true);
  k.mat.updateMatrixWorld(true);
  k.parts.armR.hand.getWorldPosition(tmpV);
  court.worldToLocal(tmpV);
  const pos = k.rope.geometry.attributes.position;
  const c = Math.cos(k.mat.rotation.y), s = Math.sin(k.mat.rotation.y);
  const local = (x, z) => [m.x + x * c + z * s, 0.06, m.z - x * s + z * c];
  const knot = [m.x * 0.5 + tmpV.x * 0.5, 0.5, m.z * 0.5 + tmpV.z * 0.5];
  const pts = [local(-1.1, 0.65), knot, local(1.1, 0.65), knot, knot, [tmpV.x, tmpV.y, tmpV.z]];
  pts.forEach((v, i) => pos.setXYZ(i, ...v));
  pos.needsUpdate = true;
}

// ---------- Aspersores, cámara aérea y pájaros ----------

function buildSpray(court) {
  const n = 4 * 80;
  const geo = new THREE.BufferGeometry();
  geo.setAttribute('position', new THREE.BufferAttribute(new Float32Array(n * 3), 3));
  const pts = new THREE.Points(geo, new THREE.PointsMaterial({ color: 0xe6f2ff, size: 0.16, transparent: true, opacity: 0.6, depthWrite: false }));
  pts.visible = false;
  pts.frustumCulled = false;
  court.add(pts);
  return { pts, heads: [[-8.6, -17.6], [8.6, -17.6], [-8.6, 17.6], [8.6, 17.6]] };
}

function buildSpidercam(court) {
  const anchors = [[-27, 20.6, -36], [27, 20.6, -36], [-27, 20.6, 40], [27, 20.6, 40]];
  const cam = new THREE.Group();
  const body = new THREE.Mesh(new THREE.BoxGeometry(0.7, 0.4, 0.7), std({ color: 0x1b1d1f, roughness: 0.4, metalness: 0.5 }));
  const lens = new THREE.Mesh(new THREE.SphereGeometry(0.2, 12, 10), std({ color: 0x0c0c0c, roughness: 0.1, metalness: 0.8 }));
  lens.position.y = -0.3;
  const led = new THREE.Mesh(new THREE.SphereGeometry(0.06, 8, 6), std({ color: 0xff3020, emissive: 0xff2010, emissiveIntensity: 3 }));
  led.position.set(0.3, 0.15, 0.3);
  cam.add(body, lens, led);
  cam.userData.dynamic = true;
  court.add(cam);
  const geo = new THREE.BufferGeometry();
  geo.setAttribute('position', new THREE.BufferAttribute(new Float32Array(24), 3));
  const cables = new THREE.LineSegments(geo, new THREE.LineBasicMaterial({ color: 0x2b2b2b, transparent: true, opacity: 0.55 }));
  cables.frustumCulled = false;
  court.add(cables);
  return { cam, cables, anchors, led };
}

function buildBirds(court) {
  const wing = new THREE.BufferGeometry();
  wing.setAttribute('position', new THREE.Float32BufferAttribute([0, 0, 0.12, 0.42, 0.02, -0.05, 0, 0, -0.14], 3));
  wing.computeVertexNormals();
  const mat = std({ color: 0x3a3a3c, roughness: 0.9, side: THREE.DoubleSide });
  const bodyGeo = new THREE.SphereGeometry(0.08, 8, 6);
  return Array.from({ length: 8 }, (_, i) => {
    const g = new THREE.Group();
    const body = new THREE.Mesh(bodyGeo, mat);
    body.scale.set(0.8, 0.7, 2.0);
    const l = new THREE.Mesh(wing, mat), r = new THREE.Mesh(wing, mat);
    r.scale.x = -1;
    g.add(body, l, r);
    g.userData.dynamic = true;
    court.add(g);
    return { g, l, r, off: i * 0.42, rad: 22 + (i % 3) * 2, h: 14.5 + (i % 4) * 0.7 };
  });
}

// ---------- Todo junto ----------

export function buildStadium(lib) {
  const root = new THREE.Group();
  root.position.copy(EYE);
  root.rotation.x = PITCH;
  const court = new THREE.Group();
  court.position.set(0, -EYE_H, -(EYE_D + 11.885));
  root.add(court);
  lib.room.add(root);

  const sky = tennisSky(620, 140);
  sky.mesh.position.set(0, 140 / 2 - 6, -285);
  root.add(sky.mesh);

  const { flags: flagSpots } = buildBowl(court);
  const flags = buildFlags(court, flagSpots);
  buildCourt(court);
  const keepers = buildKeepers(court);
  const spray = buildSpray(court);
  const spider = buildSpidercam(court);
  const birds = buildBirds(court);

  const boardCanvas = makeCanvas(1024, 300);
  drawScoreboard(boardCanvas, new Date());
  const boardTex = tex(boardCanvas);
  const board = new THREE.Mesh(new THREE.PlaneGeometry(9, 2.64), std({ map: boardTex, emissive: 0xffffff, emissiveMap: boardTex, emissiveIntensity: 0.85, roughness: 0.4 }));
  board.position.set(0, 10.31, -(HL + 16) + 0.06);
  court.add(board);

  // sol de la tarde desde la izquierda: la tribuna lateral da sombra sobre parte de la arcilla
  const coarse = matchMedia('(pointer: coarse)').matches;
  const sun = new THREE.DirectionalLight(0xfff0d8, 2.1);
  sun.position.set(-46, 52, 14);
  sun.target.position.set(0, 0, -4);
  sun.castShadow = true;
  sun.shadow.mapSize.set(coarse ? 1024 : 2048, coarse ? 1024 : 2048);
  Object.assign(sun.shadow.camera, { left: -48, right: 48, top: 48, bottom: -48, near: 10, far: 170 });
  sun.shadow.bias = -0.0006;
  sun.shadow.normalBias = 0.06;
  court.add(sun, sun.target);

  let lastSecond = -1;
  const state = { nextSpray: null, sprayStart: -99 };
  return {
    sky: sky.uniforms,
    keepers,
    update(t, dt, onSprinkler) {
      sky.uniforms.uTime.value = t;
      for (const k of keepers) updateKeeper(k, court, t, dt);
      // cámara aérea paseando sobre la cancha
      const cx = Math.sin(t * 0.05) * 5.5, cz = -3 + Math.sin(t * 0.037 + 1) * 9, cy = 10.5 + Math.sin(t * 0.08) * 1.6;
      spider.cam.position.set(cx, cy, cz);
      spider.cam.rotation.y = Math.sin(t * 0.04) * 0.6;
      spider.led.visible = Math.sin(t * 3) > 0;
      const cp = spider.cables.geometry.attributes.position;
      spider.anchors.forEach((a, i) => {
        cp.setXYZ(i * 2, ...a);
        cp.setXYZ(i * 2 + 1, cx, cy + 0.2, cz);
      });
      cp.needsUpdate = true;
      // pájaros dando vueltas por encima de la cancha
      for (const b of birds) {
        const a = t * 0.07 + b.off;
        b.g.position.set(Math.cos(a) * b.rad, b.h + Math.sin(t * 0.5 + b.off) * 0.6, -6 + Math.sin(a) * b.rad * 1.1);
        b.g.rotation.y = -a;
        const f = Math.sin(t * 9 + b.off * 5) * 0.7;
        b.l.rotation.z = f;
        b.r.rotation.z = -f;
      }
      // banderas al viento
      for (const f of flags) {
        const p = f.geo.attributes.position;
        for (let i = 0; i < p.count; i++) p.setZ(i, Math.sin(f.x[i] * 2.4 - t * 3.6 + f.phase) * 0.22 * (f.x[i] / 2.4));
        p.needsUpdate = true;
      }
      // reloj del marcador
      const sec = Math.floor(Date.now() / 1000);
      if (sec !== lastSecond) {
        lastSecond = sec;
        drawScoreboard(boardCanvas, new Date());
        boardTex.needsUpdate = true;
      }
      // riego: cada 50 s, durante 9 s, cuatro chorros en arco sobre la arcilla
      state.nextSpray ??= t + 12;
      if (t > state.nextSpray) {
        state.sprayStart = t;
        state.nextSpray = t + 50;
        onSprinkler?.(9);
      }
      const s = t - state.sprayStart;
      spray.pts.visible = s >= 0 && s < 9;
      if (spray.pts.visible) {
        const pos = spray.pts.geometry.attributes.position;
        spray.heads.forEach(([hx, hz], j) => {
          const aim = Math.atan2(-hz, -hx) + Math.sin(t * 0.9 + j) * 0.5;
          for (let i = 0; i < 80; i++) {
            const life = (i / 80 + t * 0.9) % 1;
            const d = life * 9;
            pos.setXYZ(j * 80 + i, hx + Math.cos(aim) * d, 0.3 + life * 3.2 - life * life * 3.4, hz + Math.sin(aim) * d);
          }
        });
        pos.needsUpdate = true;
      }
    },
  };
}
