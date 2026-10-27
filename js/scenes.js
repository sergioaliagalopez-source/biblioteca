// Los fondos (ambientes) de la biblioteca: materiales, sala, luces y animación de cada uno.
// La estantería principal mantiene siempre las mismas medidas, así los libros se acomodan igual en todos.
import * as THREE from 'three';
import {
  woodCanvas, floorCanvas, wallCanvas, paperEdgeCanvas, globeCanvas, marbleCanvas, concreteCanvas,
  decoWallCanvas, curtainCanvas, vinylCanvas, carbonCanvas, trackCanvas, helmetCanvas, suitCanvas, bannerCanvas,
  PALETTE,
} from './textures.js';
import { seaBackdrop, cityBackdrop, paddockBackdrop } from './backdrops.js';
import { buildStadium } from './stadium.js';
import { buildMuseum, classicHelmet } from './museum.js';
import { buildSilverCup } from './tennis.js';

// Estantería principal (metros). Las filas indican la altura de cada balda.
export const BC = { w: 4.2, h: 3.04, d: 0.42, z: -1.8, rows: [0.72, 1.3, 1.88, 2.46], side: 0.06, shelfT: 0.035, divider: 0.035, base: 0.66 };
export const FRONT_Z = BC.z + BC.d / 2;

export function tex(canvas, repeat) {
  const t = new THREE.CanvasTexture(canvas);
  t.colorSpace = THREE.SRGBColorSpace;
  t.anisotropy = 8;
  if (repeat) {
    t.wrapS = t.wrapT = THREE.RepeatWrapping;
    t.repeat.set(repeat[0], repeat[1]);
  }
  return t;
}

// Tramos (bays) de una estantería de ancho w: [x inicial, x final] de cada uno.
export function computeBays(w) {
  const bays = Math.max(1, Math.round(w / 1.4));
  const innerW = w - 2 * BC.side;
  const bayW = (innerW - (bays - 1) * BC.divider) / bays;
  return Array.from({ length: bays }, (_, i) => {
    const x0 = -innerW / 2 + i * (bayW + BC.divider);
    return [x0, x0 + bayW];
  });
}

const std = (o) => new THREE.MeshStandardMaterial(o);

// Materiales que usan todos los fondos (los objetos decorativos los necesitan); cada fondo cambia los suyos.
function baseMaterials(env) {
  return {
    wood: std({ map: tex(woodCanvas({ seed: 11 })), roughness: 0.48, envMap: env, envMapIntensity: 0.22 }),
    woodDark: std({ map: tex(woodCanvas({ seed: 5, base: '#2a130b', dark: '#140804', light: '#3d1e10' })), roughness: 0.7 }),
    panel: std({ map: tex(woodCanvas({ seed: 19, base: '#542a18', light: '#7c4126' })), roughness: 0.42, envMap: env, envMapIntensity: 0.3 }),
    brass: std({ color: 0xc9a25a, metalness: 1, roughness: 0.3, envMap: env, envMapIntensity: 1.1 }),
    glow: std({ color: 0xffe2b0, emissive: 0xffc77a, emissiveIntensity: 2.4 }),
    candle: std({ color: 0xf1e6cf, roughness: 0.6 }),
    flame: new THREE.MeshBasicMaterial({ color: 0xffd28a }),
    porcelain: std({ color: 0x1d3264, roughness: 0.18, envMap: env, envMapIntensity: 0.8 }),
    globe: std({ map: tex(globeCanvas()), roughness: 0.55, envMap: env, envMapIntensity: 0.3 }),
    stone: std({ map: tex(marbleCanvas({ w: 256, h: 256 })), roughness: 0.25, envMap: env, envMapIntensity: 0.5 }),
    pot: std({ color: 0xece6dc, roughness: 0.5 }),
    leaf: std({ color: 0x2f5a35, roughness: 0.6, side: THREE.DoubleSide }),
    vinyl: std({ map: tex(vinylCanvas()), roughness: 0.25, envMap: env, envMapIntensity: 0.6 }),
  };
}

function plane(w, h, material) {
  return new THREE.Mesh(new THREE.PlaneGeometry(w, h), material);
}

// Con ventanal, el piso termina en el vidrio para que se vea el paisaje (la ciudad queda abajo).
function floor(lib, material, { toWindow = false } = {}) {
  const depth = toWindow ? 10 : 14;
  const f = plane(18, depth, material);
  f.rotation.x = -Math.PI / 2;
  f.position.z = toWindow ? BC.z - 0.8 + depth / 2 : -1;
  f.receiveShadow = true;
  lib.room.add(f);
}

function walls(lib, material, { back = true } = {}) {
  if (back) {
    const b = plane(16, 4.6, material);
    b.position.set(0, 2.3, BC.z - BC.d / 2 - 0.03);
    lib.room.add(b);
  }
  for (const sx of [-1, 1]) {
    const s = plane(14, 4.6, material);
    s.position.set(sx * 6.2, 2.3, 1);
    s.rotation.y = -sx * Math.PI / 2;
    lib.room.add(s);
  }
}

function ceiling(lib, color) {
  const c = plane(18, 14, std({ color, roughness: 1 }));
  c.rotation.x = Math.PI / 2;
  c.position.set(0, 4.6, 0);
  lib.room.add(c);
}

function mainCase(lib, opts) {
  const main = lib.caseStructure(BC.w, true, opts);
  main.position.set(0, 0, BC.z);
  lib.room.add(main);
  lib.mainBays = main.userData.bays;
}

function sideCases(lib, palette) {
  for (const sx of [-1, 1]) {
    const w = 3.2;
    const side = lib.caseStructure(w, false);
    side.position.set(sx * (BC.w / 2 + 0.03 + w / 2), 0, BC.z);
    lib.fillDecorBooks(side, side.userData.bays, sx > 0 ? 101 : 202, palette);
    lib.room.add(side);
  }
}

function brassRail(lib) {
  const rail = new THREE.Mesh(new THREE.CylinderGeometry(0.014, 0.014, 11, 12), lib.mat.brass);
  rail.rotation.z = Math.PI / 2;
  rail.position.set(0, 2.98, FRONT_Z + 0.07);
  lib.room.add(rail);
}

function keyLight(lib, color, intensity, angle = 0.62) {
  const key = new THREE.SpotLight(color, intensity, 13, angle, 0.75, 1.6);
  key.position.set(0.5, 3.9, 1.8);
  key.target.position.set(0, 1.5, BC.z);
  key.castShadow = true;
  key.shadow.mapSize.set(1024, 1024);
  key.shadow.bias = -0.0004;
  key.shadow.normalBias = 0.02;
  lib.room.add(key, key.target);
  return key;
}

function baySpots(lib, color, intensity) {
  for (const [a, b] of lib.mainBays) {
    const x = (a + b) / 2;
    const spot = new THREE.SpotLight(color, intensity, 4.5, 0.8, 0.9, 1.8);
    spot.position.set(x, BC.h - 0.1, FRONT_Z + 0.3);
    spot.target.position.set(x, 1.0, BC.z);
    lib.room.add(spot, spot.target);
  }
}

// Marco de ventanal: postes verticales y travesaños, entre la estantería y el paisaje.
function windowFrame(lib, material, { step, thick, z }) {
  const add = (sx, sy, x, y) => {
    const m = new THREE.Mesh(lib.unitBox, material);
    m.scale.set(sx, sy, thick * 1.4);
    m.position.set(x, y, z);
    lib.room.add(m);
  };
  for (let x = -7.2; x <= 7.2 + 0.01; x += step) add(thick, 4.7, x, 2.35);
  add(15, thick, 0, 3.75);
  add(15, thick * 2, 0, 0.03);
  add(15, 0.3, 0, 4.5);
}

// ---------- Objetos de ambiente ----------

function palm(lib, x, z) {
  const g = new THREE.Group();
  const pts = [[0, 0], [0.16, 0], [0.2, 0.05], [0.22, 0.38], [0.24, 0.42], [0, 0.42]].map(([a, b]) => new THREE.Vector2(a, b));
  const pot = new THREE.Mesh(new THREE.LatheGeometry(pts, 32), lib.mat.pot);
  const rim = new THREE.Mesh(new THREE.TorusGeometry(0.235, 0.012, 8, 40), lib.mat.brass);
  rim.rotation.x = Math.PI / 2;
  rim.position.y = 0.42;
  g.add(pot, rim);
  const fronds = [];
  for (let i = 0; i < 11; i++) {
    const a = (i / 11) * Math.PI * 2;
    const frond = new THREE.Group();
    const len = 0.9 + (i % 3) * 0.25;
    const leaf = new THREE.Mesh(new THREE.PlaneGeometry(0.26, len, 1, 6), lib.mat.leaf);
    // curva la hoja hacia afuera
    const p = leaf.geometry.attributes.position;
    for (let k = 0; k < p.count; k++) {
      const y = p.getY(k) + len / 2;
      p.setZ(k, -Math.pow(y / len, 2) * 0.45);
      p.setX(k, p.getX(k) * (1 - (y / len) * 0.75));
    }
    leaf.geometry.computeVertexNormals();
    leaf.position.y = len / 2;
    frond.add(leaf);
    frond.position.y = 0.4 + (i % 4) * 0.12;
    frond.rotation.y = a;
    frond.rotation.x = -0.5 - (i % 3) * 0.18;
    frond.userData.base = frond.rotation.x;
    frond.userData.seed = i * 1.7;
    g.add(frond);
    fronds.push(frond);
  }
  g.position.set(x, 0, z);
  g.scale.setScalar(1.25);
  lib.room.add(g);
  return fronds;
}

function curtains(lib, xs, z) {
  const mat = std({ map: tex(curtainCanvas(), [2, 1]), roughness: 0.75, side: THREE.DoubleSide });
  return xs.map((x, i) => {
    const c = new THREE.Mesh(new THREE.PlaneGeometry(1.4, 4.5, 16, 1), mat);
    c.position.set(x, 2.3, z);
    c.userData.seed = i * 2.1;
    c.userData.x = x;
    c.userData.dynamic = true;
    lib.room.add(c);
    return c;
  });
}

function arcLamp(lib, x, z) {
  const g = new THREE.Group();
  const base = new THREE.Mesh(new THREE.CylinderGeometry(0.18, 0.2, 0.06, 32), lib.mat.stone);
  base.position.y = 0.03;
  const black = lib.mat.brass;
  const pole = new THREE.Mesh(new THREE.CylinderGeometry(0.014, 0.014, 1.73, 10), black);
  pole.position.y = 0.865;
  // Medio arco desde la punta del poste hasta encima de la pantalla.
  const arc = new THREE.Mesh(new THREE.TorusGeometry(0.75, 0.014, 8, 48, Math.PI), black);
  arc.position.set(0.75, 1.73, 0);
  const shade = new THREE.Mesh(new THREE.SphereGeometry(0.2, 32, 16, 0, Math.PI * 2, 0, Math.PI / 2), black);
  shade.position.set(1.5, 1.6, 0);
  const bulb = new THREE.Mesh(new THREE.CircleGeometry(0.17, 32), lib.mat.glow);
  bulb.rotation.x = Math.PI / 2;
  bulb.position.set(1.5, 1.6, 0);
  g.add(base, pole, arc, shade, bulb);
  g.position.set(x, 0, z);
  lib.room.add(g);
  const light = new THREE.PointLight(0xffd9a8, 2.4, 4.5, 2);
  light.position.set(x + 1.5, 1.45, z);
  lib.room.add(light);
}

function bigPlant(lib, x, z) {
  const g = new THREE.Group();
  const pot = new THREE.Mesh(new THREE.CylinderGeometry(0.24, 0.2, 0.5, 32), lib.mat.woodDark);
  pot.position.y = 0.25;
  g.add(pot);
  const leaves = [];
  for (let i = 0; i < 14; i++) {
    const a = (i / 14) * Math.PI * 2 + (i % 2) * 0.3;
    const stem = new THREE.Group();
    const leaf = new THREE.Mesh(new THREE.SphereGeometry(1, 14, 8), lib.mat.leaf);
    leaf.scale.set(0.2, 0.012, 0.28);
    const h = 0.55 + (i % 5) * 0.22;
    leaf.position.set(0, h, 0.22);
    leaf.rotation.x = 0.35;
    stem.add(leaf);
    stem.rotation.y = a;
    stem.position.y = 0.45;
    stem.userData.seed = i;
    g.add(stem);
    leaves.push(stem);
  }
  g.position.set(x, 0, z);
  lib.room.add(g);
  return leaves;
}

// Estantería moderna: repisas de roble, estructura fina de metal negro y tiras LED bajo cada repisa.
function modernCase(lib) {
  const g = new THREE.Group();
  const { w, h, d, rows, base, side } = { ...BC, w: BC.w };
  const box = (sx, sy, sz, x, y, z, m) => {
    const mesh = new THREE.Mesh(lib.unitBox, m);
    mesh.scale.set(sx, sy, sz);
    mesh.position.set(x, y, z);
    mesh.receiveShadow = true;
    g.add(mesh);
    return mesh;
  };
  const bays = computeBays(w);
  const innerW = w - 2 * side;
  // aparador bajo negro con frentes de roble
  box(w, base - 0.06, d, 0, base / 2 + 0.03, 0, lib.mat.woodDark);
  for (const [a, b] of bays) {
    const cx = (a + b) / 2;
    box(b - a - 0.04, 0.42, 0.012, cx, 0.32, d / 2 + 0.006, lib.mat.wood);
    box(0.24, 0.012, 0.016, cx, 0.5, d / 2 + 0.018, lib.mat.brass);
  }
  // postes de metal
  const posts = [-w / 2 + 0.012, ...bays.slice(1).map(([a]) => a - BC.divider / 2), w / 2 - 0.012];
  for (const x of posts) {
    for (const z of [d / 2 - 0.012, -d / 2 + 0.012]) box(0.022, h - base + 0.04, 0.022, x, base + (h - base) / 2, z, lib.mat.brass);
  }
  // repisas y LED
  const shelfYs = [...rows, h];
  for (const y of shelfYs) box(innerW + 0.06, 0.035, d - 0.03, 0, y - 0.0175, 0, lib.mat.wood);
  for (const y of shelfYs.slice(1)) box(innerW, 0.006, 0.014, 0, y - 0.04, d / 2 - 0.035, lib.mat.glow);
  lib.plaqueMat = new THREE.MeshStandardMaterial({ roughness: 0.6, metalness: 0.2 });
  const plaque = new THREE.Mesh(new THREE.PlaneGeometry(0.8, 0.117), lib.plaqueMat);
  plaque.position.set(0, 0.585, d / 2 + 0.014);
  g.add(plaque);
  g.userData.bays = bays;
  g.position.set(0, 0, BC.z);
  lib.room.add(g);
  lib.mainBays = bays;
}

// ---------- Carreras: autos, cascos y trajes ----------

// Pinturas de los equipos (colores y números, sin logos ni marcas).
export const LIVERIES = [
  { body: 0xc8102e, accent: 0x161616, helmet: '#f4d000', number: '16', stripe: '#ffffff' },
  { body: 0xc8102e, accent: 0xf2f2f2, helmet: '#c8102e', number: '55', stripe: '#f4d000' },
  { body: 0xb9bcc2, accent: 0x111111, helmet: '#7a00d4', number: '44', stripe: '#00d2be' },
  { body: 0xff8000, accent: 0x1c3d8f, helmet: '#ffd200', number: '4', stripe: '#1c3d8f' },
  { body: 0x0b1f5c, accent: 0xd8102e, helmet: '#0b1f5c', number: '1', stripe: '#ffd200' },
];

// Auto de F1 de ~5,4 m mirando hacia +x, apoyado en y = 0. `track` junta lo que hay que liberar.
export function buildF1Car(livery, track = []) {
  const keep = (x) => (track.push(x), x);
  const body = keep(std({ color: livery.body, metalness: 0.35, roughness: 0.32 }));
  const accent = keep(std({ color: livery.accent, metalness: 0.25, roughness: 0.4 }));
  const carbon = keep(std({ color: 0x17171a, roughness: 0.45, metalness: 0.3 }));
  const rubber = keep(std({ color: 0x0c0c0c, roughness: 0.9 }));
  const rim = keep(std({ color: 0x8e9096, metalness: 0.9, roughness: 0.3 }));
  const helmetMat = keep(std({ color: new THREE.Color(livery.helmet), roughness: 0.25, metalness: 0.2 }));
  const g = new THREE.Group();
  const box = (sx, sy, sz, x, y, z, mat) => {
    const mesh = new THREE.Mesh(keep(new THREE.BoxGeometry(sx, sy, sz)), mat);
    mesh.position.set(x, y, z);
    mesh.castShadow = true;
    g.add(mesh);
    return mesh;
  };
  box(4.4, 0.04, 1.5, -0.1, 0.06, 0, carbon); // fondo plano
  box(1.8, 0.42, 0.72, 0.55, 0.32, 0, body); // monocasco
  const nose = new THREE.Mesh(keep(new THREE.CylinderGeometry(0.09, 0.24, 1.6, 14)), body);
  nose.rotation.z = -Math.PI / 2;
  nose.scale.z = 0.75;
  nose.position.set(2.2, 0.24, 0);
  g.add(nose);
  box(0.46, 0.04, 2.0, 2.86, 0.1, 0, accent); // alerón delantero
  box(0.5, 0.18, 0.03, 2.86, 0.16, 0.99, body);
  box(0.5, 0.18, 0.03, 2.86, 0.16, -0.99, body);
  box(1.5, 0.36, 0.42, -0.05, 0.3, 0.55, body); // pontones
  box(1.5, 0.36, 0.42, -0.05, 0.3, -0.55, body);
  box(1.6, 0.4, 0.5, -0.8, 0.5, 0, body); // cubierta del motor
  box(0.32, 0.3, 0.28, 0.02, 0.78, 0, carbon); // toma de aire
  box(0.42, 0.05, 1.0, -2.2, 0.94, 0, accent); // alerón trasero
  box(0.36, 0.05, 1.0, -2.24, 0.8, 0, carbon);
  box(0.6, 0.55, 0.03, -2.2, 0.68, 0.5, body);
  box(0.6, 0.55, 0.03, -2.2, 0.68, -0.5, body);
  const halo = new THREE.Mesh(keep(new THREE.TorusGeometry(0.3, 0.03, 8, 20, Math.PI)), carbon);
  halo.rotation.set(Math.PI / 2, 0, -Math.PI / 2);
  halo.position.set(0.32, 0.72, 0);
  g.add(halo);
  const helmet = new THREE.Mesh(keep(new THREE.SphereGeometry(0.13, 16, 12)), helmetMat);
  helmet.position.set(0.18, 0.66, 0);
  g.add(helmet);
  const tyreGeo = keep(new THREE.CylinderGeometry(0.36, 0.36, 0.38, 24));
  const rimGeo = keep(new THREE.CylinderGeometry(0.22, 0.22, 0.39, 16));
  for (const x of [1.65, -1.6]) {
    for (const z of [0.82, -0.82]) {
      const tyre = new THREE.Mesh(tyreGeo, rubber);
      const wheelRim = new THREE.Mesh(rimGeo, rim);
      for (const m of [tyre, wheelRim]) {
        m.rotation.x = Math.PI / 2;
        m.position.set(x, 0.36, z * (x > 0 ? 1 : 1.04));
        g.add(m);
      }
    }
  }
  return g;
}

// Casco de colección sobre su soporte (mirando hacia +z).
export function buildHelmet(livery, track = [], env) {
  const keep = (x) => (track.push(x), x);
  const g = new THREE.Group();
  const paint = keep(tex(helmetCanvas({ base: '#' + new THREE.Color(livery.body).getHexString(), stripe: livery.helmet, accent: livery.stripe, number: livery.number })));
  const shellMat = keep(std({ map: paint, roughness: 0.18, metalness: 0.1, envMap: env, envMapIntensity: 0.9 }));
  const visorMat = keep(std({ color: 0x15161a, roughness: 0.05, metalness: 0.6, envMap: env, envMapIntensity: 1.4 }));
  const shell = new THREE.Mesh(keep(new THREE.SphereGeometry(0.12, 40, 28)), shellMat);
  shell.scale.set(1, 0.95, 1.12);
  shell.rotation.y = -Math.PI / 2;
  // visera: una franja de esfera un poco más grande, al frente
  // (phi = π/2 es el frente, hacia +z)
  const visor = new THREE.Mesh(keep(new THREE.SphereGeometry(0.123, 32, 12, Math.PI * 0.18, Math.PI * 0.64, Math.PI * 0.36, Math.PI * 0.2)), visorMat);
  visor.scale.copy(shell.scale);
  const chin = new THREE.Mesh(keep(new THREE.TorusGeometry(0.1, 0.022, 10, 24, Math.PI)), shellMat);
  chin.rotation.set(Math.PI / 2 + 0.5, 0, 0);
  chin.position.set(0, -0.06, 0.03);
  const head = new THREE.Group();
  head.add(shell, visor, chin);
  head.position.y = 0.14;
  const stand = new THREE.Mesh(keep(new THREE.CylinderGeometry(0.035, 0.06, 0.04, 20)), keep(std({ color: 0x1a1a1a, roughness: 0.4, metalness: 0.5 })));
  stand.position.y = 0.02;
  g.add(stand, head);
  head.traverse((m) => (m.castShadow = true));
  return g;
}

// Traje de piloto en un marco con vidrio, como trofeo.
export function buildFramedSuit(w, h, track = []) {
  const keep = (x) => (track.push(x), x);
  const g = new THREE.Group();
  const frame = new THREE.Mesh(keep(new THREE.BoxGeometry(w, h, 0.05)), keep(std({ color: 0x111113, roughness: 0.35, metalness: 0.4 })));
  const art = new THREE.Mesh(keep(new THREE.PlaneGeometry(w * 0.86, h * 0.88)), keep(std({ map: keep(tex(suitCanvas())), roughness: 0.7 })));
  art.position.z = 0.026;
  const glass = new THREE.Mesh(keep(new THREE.PlaneGeometry(w * 0.9, h * 0.92)), keep(new THREE.MeshPhysicalMaterial({ color: 0xffffff, transparent: true, opacity: 0.12, roughness: 0.02, metalness: 0 })));
  glass.position.z = 0.03;
  g.add(frame, art, glass);
  return g;
}

// ---------- Los cuatro fondos ----------

export const SCENES = {
  // Biblioteca clásica: caoba, papel verde, chimenea fuera de cuadro y polvo dorado en la luz.
  clasica: {
    background: 0x0b0806,
    fog: [0x0b0806, 6, 14],
    exposure: 1.1,
    palette: PALETTE,
    paletteGain: 0.7,
    plaque: 'brass',
    decor: { kinds: ['old', 'old', 'old', 'old', 'old', 'stack', 'stack', 'candles', 'frame', 'vase', 'globe'], caps: { globe: 1, vase: 2, candles: 2, frame: 2, stack: 3 } },
    particles: { count: 380, size: 0.016, color: 0xffd9a0, opacity: 0.5, rise: 1 },
    materials: () => ({}),
    build(lib) {
      floor(lib, std({ map: tex(floorCanvas(), [5, 4]), roughness: 0.45, envMap: lib.env, envMapIntensity: 0.25 }));
      walls(lib, std({ map: tex(wallCanvas(), [8, 2.4]), roughness: 0.9 }));
      ceiling(lib, 0x120b07);
      mainCase(lib);
      sideCases(lib, PALETTE);
      brassRail(lib);
      lib.buildLadder(-2.48);
      lib.room.add(new THREE.HemisphereLight(0xffe0b8, 0x1a0e07, 0.45), new THREE.AmbientLight(0xffd7a8, 0.12));
      keyLight(lib, 0xffd29a, 34);
      baySpots(lib, 0xffb870, 6);
      lib.fx.fire = new THREE.PointLight(0xff7a2e, 6, 9, 1.6);
      lib.fx.fire.position.set(-4.3, 0.7, 0.9);
      const moon = new THREE.DirectionalLight(0x7d93c4, 0.2);
      moon.position.set(5, 4, 3);
      lib.room.add(lib.fx.fire, moon);
    },
    tick(lib, t) {
      lib.fx.fire.intensity = 5.5 + Math.sin(t * 7.3) * 0.7 + Math.sin(t * 13.1) * 0.5 + (Math.random() - 0.5) * 0.8;
    },
  },

  // Mansión frente al mar: estantería blanca con oro, piso de mármol y el océano al atardecer.
  mansion: {
    background: 0xe8c3a0,
    fog: [0xe2c2a6, 9, 26],
    exposure: 1.0,
    palette: ['#efe6d6', '#d9c7a7', '#1f2f4a', '#c4a46c', '#8fa08c', '#e9dccb', '#a67c52', '#f6f1e8', '#2d4a5a'],
    paletteGain: 0.95,
    plaque: 'brass',
    decor: { kinds: ['old', 'old', 'old', 'stack', 'stack', 'vase', 'vase', 'sculpture', 'sculpture', 'candles', 'plant'], caps: { vase: 3, sculpture: 2, candles: 1, stack: 3, plant: 2 } },
    particles: { count: 260, size: 0.014, color: 0xffe6b8, opacity: 0.4, rise: 0.6 },
    materials: (env) => ({
      wood: std({ map: tex(woodCanvas({ seed: 31, base: '#efe8dc', dark: '#d8cdbb', light: '#ffffff', lines: 60 })), roughness: 0.32, envMap: env, envMapIntensity: 0.55 }),
      woodDark: std({ color: 0xe9e1d3, roughness: 0.4 }),
      panel: std({ map: tex(woodCanvas({ seed: 33, base: '#f4eee4', dark: '#e2d8c8', light: '#ffffff', lines: 40 })), roughness: 0.28, envMap: env, envMapIntensity: 0.6 }),
      brass: std({ color: 0xd8b46a, metalness: 1, roughness: 0.22, envMap: env, envMapIntensity: 1.25 }),
      glow: std({ color: 0xfff1d6, emissive: 0xffe2b0, emissiveIntensity: 1.6 }),
      porcelain: std({ color: 0xf6f2ea, roughness: 0.14, envMap: env, envMapIntensity: 0.9 }),
      leaf: std({ color: 0x4c7a46, roughness: 0.55, side: THREE.DoubleSide }),
    }),
    build(lib) {
      floor(lib, std({ map: tex(marbleCanvas(), [4, 3]), roughness: 0.12, envMap: lib.env, envMapIntensity: 0.7 }), { toWindow: true });
      walls(lib, std({ color: 0xf1e8da, roughness: 0.8 }), { back: false });
      ceiling(lib, 0xf3ece2);
      const sea = seaBackdrop(26, 13);
      sea.mesh.position.set(0, 2.2, BC.z - 2.8);
      lib.room.add(sea.mesh);
      lib.fx.sea = sea.uniforms;
      windowFrame(lib, std({ color: 0xf6f1e9, roughness: 0.35 }), { step: 1.8, thick: 0.09, z: BC.z - 0.8 });
      mainCase(lib, { back: false });
      lib.fx.curtains = curtains(lib, [-(BC.w / 2 + 0.85), BC.w / 2 + 0.85], BC.z - 0.4);
      lib.fx.fronds = palm(lib, 2.85, FRONT_Z + 0.55);
      lib.fx.fronds.forEach((f) => (f.userData.dynamic = true));
      lib.room.add(new THREE.HemisphereLight(0xfff3e4, 0xcdb79c, 1.05), new THREE.AmbientLight(0xffffff, 0.22));
      keyLight(lib, 0xfff1de, 24);
      baySpots(lib, 0xfff0dc, 2.5);
      const sunset = new THREE.DirectionalLight(0xffa860, 1.5);
      sunset.position.set(3, 2.6, BC.z - 5);
      sunset.target.position.set(0, 1.4, BC.z);
      lib.room.add(sunset, sunset.target);
    },
    tick(lib, t) {
      lib.fx.sea.uTime.value = t;
      for (const c of lib.fx.curtains) {
        const s = c.userData.seed;
        c.rotation.y = Math.sin(t * 0.45 + s) * 0.06;
        c.position.x = c.userData.x + Math.sin(t * 0.3 + s) * 0.03;
      }
      for (const f of lib.fx.fronds) f.rotation.x = f.userData.base + Math.sin(t * 0.8 + f.userData.seed) * 0.035;
    },
  },

  // Salón de jazz: nogal lustrado, papel art déco, tocadiscos girando, luz ámbar y humo.
  jazz: {
    background: 0x0a0605,
    fog: [0x120907, 5, 13],
    exposure: 1.25,
    palette: ['#5a1418', '#1d3a2c', '#6b4a24', '#2a2018', '#8a6a2e', '#3a1c2c', '#1c2a40', '#b08a4a', '#4a1c14'],
    paletteGain: 0.7,
    plaque: 'brass',
    decor: { first: 'record', kinds: ['old', 'old', 'old', 'old', 'stack', 'stack', 'candles', 'candles', 'frame', 'globe', 'vase'], caps: { globe: 1, vase: 1, candles: 2, frame: 2, stack: 3 } },
    particles: { count: 70, size: 0.55, color: 0xd6c8b6, opacity: 0.05, rise: 0.35, smoke: true },
    materials: (env) => ({
      wood: std({ map: tex(woodCanvas({ seed: 41, base: '#2e1a10', dark: '#120804', light: '#4a2c18' })), roughness: 0.3, envMap: env, envMapIntensity: 0.35 }),
      woodDark: std({ map: tex(decoWallCanvas({ base: '#1c0d0c', line: 'rgba(200,165,100,0.32)' }), [3, 2]), roughness: 0.85 }),
      panel: std({ map: tex(woodCanvas({ seed: 43, base: '#4a2a18', dark: '#22110a', light: '#7a4a28', lines: 340 })), roughness: 0.28, envMap: env, envMapIntensity: 0.4 }),
      porcelain: std({ color: 0x173a2c, roughness: 0.16, envMap: env, envMapIntensity: 0.8 }),
    }),
    build(lib) {
      floor(lib, std({ map: tex(floorCanvas(), [5, 4]), color: 0x8a6a5a, roughness: 0.35, envMap: lib.env, envMapIntensity: 0.3 }));
      walls(lib, std({ map: tex(decoWallCanvas(), [10, 3]), roughness: 0.85 }));
      ceiling(lib, 0x0d0705);
      mainCase(lib);
      sideCases(lib, SCENES.jazz.palette);
      brassRail(lib);
      lib.buildLadder(-2.48);
      lib.room.add(new THREE.HemisphereLight(0xffc890, 0x100604, 0.28), new THREE.AmbientLight(0xffb070, 0.06));
      keyLight(lib, 0xffb478, 26, 0.5);
      baySpots(lib, 0xffa050, 7.5);
      lib.fx.stage = new THREE.PointLight(0xff4a2a, 3.5, 9, 1.6);
      lib.fx.stage.position.set(-3.8, 1.2, 0.6);
      const rim = new THREE.DirectionalLight(0x4f6fd0, 0.35);
      rim.position.set(5, 3, 2);
      lib.room.add(lib.fx.stage, rim);
    },
    tick(lib, t, dt) {
      lib.fx.stage.intensity = 3.2 + Math.sin(t * 0.7) * 0.8 + Math.sin(t * 2.3) * 0.2;
      for (const s of lib.spinners) s.rotation.y -= dt * 3.5; // 33⅓ rpm
    },
  },

  // Ático moderno: repisas de roble con LED, ventanal a la ciudad de noche, lluvia y relámpagos.
  atico: {
    background: 0x05070c,
    fog: [0x0a0e16, 8, 24],
    exposure: 1.15,
    palette: ['#e8e4dc', '#2b2b2b', '#8c8c8c', '#c9b79c', '#3c4a5a', '#d8cfc0', '#5b6b5a', '#b5462e'],
    paletteGain: 0.85,
    plaque: 'black',
    decor: { kinds: ['stack', 'stack', 'stack', 'old', 'old', 'sculpture', 'sculpture', 'plant', 'plant', 'vase'], caps: { sculpture: 2, plant: 2, vase: 2, stack: 4 } },
    particles: null,
    materials: (env) => ({
      wood: std({ map: tex(woodCanvas({ seed: 51, base: '#c9a77c', dark: '#9c7a52', light: '#e2c9a2', lines: 180 })), roughness: 0.45, envMap: env, envMapIntensity: 0.25 }),
      woodDark: std({ color: 0x161616, roughness: 0.55, metalness: 0.1 }),
      brass: std({ color: 0x1c1c1c, metalness: 0.6, roughness: 0.35, envMap: env, envMapIntensity: 0.6 }),
      glow: std({ color: 0xfff6e8, emissive: 0xfff1dc, emissiveIntensity: 2.6 }),
      porcelain: std({ color: 0xeeebe6, roughness: 0.6 }),
      pot: std({ color: 0x1f1f1f, roughness: 0.7 }),
      leaf: std({ color: 0x2c5a34, roughness: 0.5, side: THREE.DoubleSide }),
      stone: std({ map: tex(marbleCanvas({ w: 256, h: 256, base: '#2a2a2a', vein: [150, 150, 150] })), roughness: 0.3, envMap: env, envMapIntensity: 0.5 }),
    }),
    build(lib) {
      floor(lib, std({ map: tex(concreteCanvas(), [6, 5]), roughness: 0.28, envMap: lib.env, envMapIntensity: 0.6 }), { toWindow: true });
      walls(lib, std({ map: tex(concreteCanvas({ base: '#4a4846', seed: 8 }), [6, 2]), roughness: 0.9 }), { back: false });
      ceiling(lib, 0x1a1a1c);
      const city = cityBackdrop(26, 13);
      city.mesh.position.set(0, 1.2, BC.z - 2.8);
      lib.room.add(city.mesh);
      lib.fx.city = city.uniforms;
      windowFrame(lib, std({ color: 0x141414, roughness: 0.5, metalness: 0.4 }), { step: 2.2, thick: 0.045, z: BC.z - 0.8 });
      modernCase(lib);
      arcLamp(lib, -3.35, FRONT_Z + 0.5);
      lib.fx.leaves = bigPlant(lib, 2.85, FRONT_Z + 0.45);
      lib.fx.leaves.forEach((l) => (l.userData.dynamic = true));
      lib.fx.hemi = new THREE.HemisphereLight(0x9fb4d8, 0x2a2622, 0.5);
      lib.room.add(lib.fx.hemi, new THREE.AmbientLight(0xc8d4ff, 0.1));
      keyLight(lib, 0xffe2c0, 20);
      for (const y of BC.rows) {
        const led = new THREE.PointLight(0xfff0dc, 1.5, 2.6, 2);
        led.position.set(0, y + 0.5, FRONT_Z + 0.12);
        lib.room.add(led);
      }
      lib.fx.flash = 0;
      lib.fx.nextFlash = 8 + Math.random() * 12;
    },
    tick(lib, t, dt) {
      const fx = lib.fx;
      fx.city.uTime.value = t;
      // Relámpago: dos destellos seguidos y, un momento después, el trueno.
      if (t > fx.nextFlash) {
        fx.flashAt = t;
        fx.nextFlash = t + 18 + Math.random() * 30;
        lib.handlers.onThunder?.();
      }
      const since = t - (fx.flashAt ?? -99);
      fx.flash = since < 0.9 ? Math.max(0, Math.exp(-since * 9) + (since > 0.18 ? Math.exp(-(since - 0.18) * 7) * 0.7 : 0)) : 0;
      fx.city.uFlash.value = fx.flash;
      fx.hemi.intensity = 0.5 + fx.flash * 2.2;
      for (const l of fx.leaves) l.rotation.z = Math.sin(t * 0.6 + l.userData.seed) * 0.02;
    },
  },
};

// Paddock Club: suite sobre la recta principal. Estantería de fibra de carbono con detalles rojos,
// ventanal al circuito y, cada 45 segundos, semáforo de largada y autos que pasan a toda velocidad.
SCENES.paddock = {
  background: 0xa9c6e8,
  fog: [0xc4d6ea, 30, 90],
  exposure: 1.0,
  palette: ['#c8102e', '#161616', '#f2f2f2', '#9a0d22', '#f4d000', '#3a3a3e', '#d8d8dc', '#7a0a18'],
  paletteGain: 0.85,
  plaque: 'black',
  decor: {
    first: 'suit',
    kinds: ['helmet', 'helmet', 'modelcar', 'modelcar', 'modelcar', 'trophy', 'trophy', 'wheel', 'tyres', 'flag', 'old', 'stack'],
    caps: { helmet: 4, modelcar: 4, trophy: 2, wheel: 1, tyres: 2, flag: 1, stack: 2 },
  },
  particles: null,
  materials: (env) => ({
    wood: std({ map: tex(carbonCanvas(), [6, 1]), roughness: 0.28, metalness: 0.35, envMap: env, envMapIntensity: 0.7 }),
    woodDark: std({ color: 0x0f0f11, roughness: 0.25, metalness: 0.2, envMap: env, envMapIntensity: 0.6 }),
    brass: std({ color: 0xd6d7db, metalness: 1, roughness: 0.18, envMap: env, envMapIntensity: 1.2 }),
    glow: std({ color: 0xfff6ee, emissive: 0xffffff, emissiveIntensity: 2.2 }),
    red: std({ color: 0xc8102e, metalness: 0.4, roughness: 0.25, envMap: env, envMapIntensity: 0.8 }),
    gold: std({ color: 0xe0b44e, metalness: 1, roughness: 0.2, envMap: env, envMapIntensity: 1.3 }),
    rubber: std({ color: 0x101010, roughness: 0.85 }),
    acrylic: new THREE.MeshPhysicalMaterial({ color: 0xffffff, transparent: true, opacity: 0.14, roughness: 0.02, metalness: 0, envMap: env, envMapIntensity: 1 }),
    porcelain: std({ color: 0xf2f2f2, roughness: 0.3 }),
  }),
  build(lib) {
    const fx = lib.fx;
    floor(lib, std({ map: tex(concreteCanvas({ base: '#3a3a3d', seed: 21 }), [6, 5]), roughness: 0.22, envMap: lib.env, envMapIntensity: 0.7 }), { toWindow: true });
    walls(lib, std({ color: 0x2a2a2d, roughness: 0.7 }), { back: false });
    ceiling(lib, 0x1e1e21);
    // la suite está en alto: la pista queda abajo y la tribuna enfrente, más lejos, con el cielo arriba
    const view = paddockBackdrop(110, 40);
    view.mesh.position.set(0, 12.0, BC.z - 28);
    lib.room.add(view.mesh);
    fx.view = view.uniforms;
    // la pista y la calle de boxes, abajo de la suite
    const trackTex = tex(trackCanvas(), [9, 1]);
    const track = plane(140, 15.4, std({ map: trackTex, roughness: 0.8 }));
    track.rotation.x = -Math.PI / 2;
    track.position.set(0, -1.6, BC.z - 0.8 - 7.7);
    track.receiveShadow = true;
    lib.room.add(track);
    const wall = new THREE.Mesh(new THREE.BoxGeometry(140, 0.7, 0.25), std({ map: tex(bannerCanvas(), [18, 1]), roughness: 0.6 }));
    wall.position.set(0, -1.25, -7.95);
    lib.room.add(wall);
    // panel del semáforo de largada junto al muro
    const panel = new THREE.Mesh(new THREE.BoxGeometry(2.8, 0.55, 0.18), lib.mat.woodDark);
    panel.position.set(6.4, 0.9, -8.1);
    const post = new THREE.Mesh(new THREE.BoxGeometry(0.12, 2.6, 0.12), lib.mat.woodDark);
    post.position.set(6.4, -0.6, -8.1);
    lib.room.add(panel, post);
    fx.lamps = [];
    for (let i = 0; i < 5; i++) {
      const m = std({ color: 0x220303, emissive: 0xff1a1a, emissiveIntensity: 0 });
      const lamp = new THREE.Mesh(new THREE.CircleGeometry(0.17, 24), m);
      lamp.position.set(6.4 - 1.08 + i * 0.54, 0.9, -8.0);
      lib.room.add(lamp);
      fx.lamps.push(m);
    }
    windowFrame(lib, std({ color: 0x1b1b1d, roughness: 0.4, metalness: 0.5 }), { step: 2.4, thick: 0.05, z: BC.z - 0.8 });
    modernCase(lib);
    // filete rojo en el frente de cada repisa
    for (const y of BC.rows) {
      const strip = new THREE.Mesh(lib.unitBox, lib.mat.red);
      strip.scale.set(BC.w - 2 * BC.side, 0.008, 0.006);
      strip.position.set(0, y - 0.006, BC.z + BC.d / 2 - 0.012);
      lib.room.add(strip);
    }
    // a los costados: traje enmarcado grande y una pila de neumáticos con un casco encima
    const suit = buildFramedSuit(1.0, 1.45);
    suit.position.set(-3.15, 1.25, FRONT_Z + 0.35);
    suit.rotation.y = 0.35;
    const easel = new THREE.Mesh(new THREE.BoxGeometry(0.06, 1.3, 0.06), lib.mat.woodDark);
    easel.position.set(-3.15, 0.4, FRONT_Z + 0.25);
    lib.room.add(suit, easel);
    const tyreGeo = new THREE.CylinderGeometry(0.34, 0.34, 0.27, 32);
    const stripeGeo = new THREE.TorusGeometry(0.25, 0.012, 8, 40);
    for (let i = 0; i < 3; i++) {
      const tyre = new THREE.Mesh(tyreGeo, lib.mat.rubber);
      tyre.position.set(3.05, 0.135 + i * 0.275, FRONT_Z + 0.45);
      tyre.castShadow = true;
      const stripe = new THREE.Mesh(stripeGeo, i === 1 ? lib.mat.gold : lib.mat.red);
      stripe.rotation.x = Math.PI / 2;
      stripe.position.set(3.05, 0.27 + i * 0.275 + 0.001, FRONT_Z + 0.45);
      lib.room.add(tyre, stripe);
    }
    const bigHelmet = buildHelmet(LIVERIES[0], [], lib.env);
    bigHelmet.scale.setScalar(1.6);
    bigHelmet.position.set(3.05, 0.83, FRONT_Z + 0.45);
    bigHelmet.rotation.y = -0.5;
    lib.room.add(bigHelmet);
    // los autos de la carrera, esperando fuera de cuadro
    fx.cars = LIVERIES.slice(0, 4).map((liv) => {
      const car = buildF1Car(liv);
      car.userData.dynamic = true;
      car.position.set(-200, -1.6, -14.4);
      car.visible = false;
      lib.room.add(car);
      return car;
    });
    fx.nextRace = null; // la primera largada, unos segundos después de entrar al fondo
    // luz de día
    lib.room.add(new THREE.HemisphereLight(0xe2eeff, 0x4a4a4a, 1.0), new THREE.AmbientLight(0xffffff, 0.18));
    keyLight(lib, 0xffffff, 22);
    const sun = new THREE.DirectionalLight(0xfff1d8, 1.7);
    sun.position.set(-6, 12, -22);
    sun.target.position.set(0, -1.6, -14);
    lib.room.add(sun, sun.target);
    for (const y of BC.rows) {
      const led = new THREE.PointLight(0xf4f6ff, 1.3, 2.6, 2);
      led.position.set(0, y + 0.5, FRONT_Z + 0.12);
      lib.room.add(led);
    }
  },
  tick(lib, t, dt) {
    const fx = lib.fx;
    fx.view.uTime.value = t;
    fx.nextRace ??= t + 4;
    // Cada 45 s: se encienden las cinco luces una por una, se apagan... y largan.
    if (t >= fx.nextRace && !fx.race) {
      fx.race = { start: t, cars: fx.cars.map((car, i) => ({ car, x0: -95 - i * (14 + Math.random() * 10), speed: 62 - i * 1.5 })) };
      fx.nextRace = t + 45;
      // momento en que cada auto pasa frente a la cámara (para el sonido)
      lib.handlers.onRace?.(fx.race.cars.map((c) => 4.6 + -c.x0 / c.speed));
    }
    const race = fx.race;
    if (!race) return;
    const k = t - race.start;
    fx.lamps.forEach((m, i) => (m.emissiveIntensity = k > i * 0.8 && k < 4.4 ? 3 : 0));
    let running = false;
    for (const c of race.cars) {
      const x = k < 4.6 ? -999 : c.x0 + (k - 4.6) * c.speed;
      c.car.visible = x > -90 && x < 90;
      c.car.position.x = x;
      if (x < 90) running = true;
    }
    if (!running && k > 5) fx.race = null;
  },
};

// Tennis: estantería verde lacada con bronce en un palco alto de un estadio de París vacío, detrás de la
// línea de fondo; la cancha de arcilla se ve abajo, a lo largo (ver stadium.js).
SCENES.tierra = {
  background: 0xb8d0ea,
  fog: [0xd5dee8, 90, 520],
  far: 360,
  exposure: 1.02,
  palette: ['#1d5236', '#c2623a', '#f2efe6', '#0f3a26', '#e3d6b8', '#8a3a1e', '#2a2a2a', '#cdb68a'],
  paletteGain: 0.88,
  plaque: 'brass',
  decor: {
    first: 'trophycase',
    kinds: ['jumboball', 'jumboball', 'silvercup', 'silvercup', 'racketframe', 'rackets', 'poster', 'poster', 'ballcans', 'clayjar', 'old', 'stack'],
    caps: { jumboball: 2, silvercup: 2, racketframe: 1, rackets: 1, poster: 2, ballcans: 1, clayjar: 1, stack: 1 },
  },
  particles: { count: 160, size: 0.012, color: 0xfff1d6, opacity: 0.35, rise: 0.5 },
  materials: (env) => ({
    wood: std({ map: tex(woodCanvas({ seed: 61, base: '#1d4a32', dark: '#123222', light: '#2c6646', lines: 60 })), roughness: 0.28, envMap: env, envMapIntensity: 0.5 }),
    woodDark: std({ color: 0x173d29, roughness: 0.35, envMap: env, envMapIntensity: 0.4 }),
    panel: std({ map: tex(woodCanvas({ seed: 63, base: '#225638', dark: '#163b27', light: '#2f6e4a', lines: 40 })), roughness: 0.26, envMap: env, envMapIntensity: 0.55 }),
    // plata pulida: algo de rugosidad para que refleje la sala clara y no se vea negra
    silver: std({ color: 0xf1f2f5, metalness: 0.85, roughness: 0.24, envMap: env, envMapIntensity: 2.4 }),
    clay: std({ color: 0xc2623a, roughness: 0.95 }),
    porcelain: std({ color: 0xf4f1ea, roughness: 0.2, envMap: env, envMapIntensity: 0.8 }),
  }),
  build(lib) {
    const fx = lib.fx;
    floor(lib, std({ map: tex(concreteCanvas({ base: '#2c4a36', seed: 5 }), [8, 6]), roughness: 0.95 }), { toWindow: true });
    walls(lib, std({ color: 0xece6d8, roughness: 0.8 }), { back: false });
    ceiling(lib, 0xf0ebe0);
    // el palco: piso que llega hasta un antepecho bajo con baranda; abajo y adelante, el estadio
    const balcony = plane(18, 0.8, std({ color: 0xe4ded0, roughness: 0.8 }));
    balcony.rotation.x = -Math.PI / 2;
    balcony.position.set(0, 0, BC.z - 1.2);
    const parapet = new THREE.Mesh(new THREE.BoxGeometry(18, 0.55, 0.16), std({ color: 0x173d29, roughness: 0.5, envMap: lib.env, envMapIntensity: 0.4 }));
    parapet.position.set(0, 0.275, BC.z - 1.6);
    const rail = new THREE.Mesh(new THREE.BoxGeometry(18, 0.04, 0.2), lib.mat.brass);
    rail.position.set(0, 0.57, BC.z - 1.6);
    lib.room.add(balcony, parapet, rail);
    fx.stadium = buildStadium(lib);
    mainCase(lib, { back: false });
    // a los costados: copa grande en su vitrina y un canasto de pelotas
    const bigCup = buildSilverCup(lib.mat, 1968, [], 2.1);
    bigCup.position.set(-3.1, 0.62, FRONT_Z + 0.4);
    const pedestal = new THREE.Mesh(new THREE.BoxGeometry(0.62, 0.62, 0.62), lib.mat.panel);
    pedestal.position.set(-3.1, 0.31, FRONT_Z + 0.4);
    const vitrine = new THREE.Mesh(new THREE.BoxGeometry(0.6, 1.15, 0.6), new THREE.MeshPhysicalMaterial({ color: 0xffffff, transparent: true, opacity: 0.1, roughness: 0.02, envMap: lib.env, envMapIntensity: 1 }));
    vitrine.position.set(-3.1, 0.62 + 0.575, FRONT_Z + 0.4);
    lib.room.add(pedestal, bigCup, vitrine);
    const basket = new THREE.Group();
    const wire = new THREE.Mesh(new THREE.CylinderGeometry(0.26, 0.22, 0.6, 20, 4, true), new THREE.MeshStandardMaterial({ color: 0x2a2a2a, wireframe: true }));
    wire.position.y = 0.55;
    const legs = new THREE.Mesh(new THREE.CylinderGeometry(0.02, 0.02, 0.5, 6), lib.mat.woodDark);
    legs.position.y = 0.25;
    basket.add(wire, legs);
    const ballMat = std({ color: 0xd7e43a, roughness: 0.95 });
    const ballGeo = new THREE.SphereGeometry(0.034, 12, 10);
    const rnd = Math.random;
    for (let i = 0; i < 70; i++) {
      const a = rnd() * Math.PI * 2, r = rnd() * 0.2, y = 0.3 + rnd() * 0.55;
      const b = new THREE.Mesh(ballGeo, ballMat);
      b.position.set(Math.cos(a) * r, Math.min(y, 0.82 - r * 0.3), Math.sin(a) * r);
      basket.add(b);
    }
    basket.position.set(3.05, 0, FRONT_Z + 0.45);
    lib.room.add(basket);
    // luz de tarde en el palco
    lib.room.add(new THREE.HemisphereLight(0xeaf2ff, 0x6a5040, 0.9), new THREE.AmbientLight(0xffffff, 0.16));
    keyLight(lib, 0xfff4e6, 22);
    baySpots(lib, 0xffe9cc, 2.5);
  },
  tick(lib, t, dt) {
    lib.fx.stadium.update(t, dt, lib.handlers.onSprinkler);
  },
};

// Museo de campeones (F1): estantería de nogal lacado con bronce en una galería de autos históricos.
// El auto del centro gira, un guía recorre la sala y cada tanto se presentan los autos con un foco (ver museum.js).
SCENES.museo = {
  background: 0x0e0b09,
  fog: [0x0e0b09, 24, 60],
  far: 70,
  exposure: 1.12,
  palette: ['#5a0f18', '#1d1a18', '#c9a25a', '#173d29', '#e9dfcc', '#7a0a18', '#2b2b2e', '#8a6a3a'],
  paletteGain: 0.8,
  plaque: 'brass',
  decor: {
    first: 'vintagemodel',
    kinds: ['classichelmet', 'classichelmet', 'vintagemodel', 'vintagemodel', 'trophy', 'trophy', 'oldphoto', 'oldphoto', 'woodwheel', 'old', 'stack'],
    caps: { classichelmet: 3, vintagemodel: 3, trophy: 2, oldphoto: 2, woodwheel: 1, stack: 2 },
  },
  particles: { count: 220, size: 0.013, color: 0xffe2b8, opacity: 0.4, rise: 0.4 },
  materials: (env) => ({
    wood: std({ map: tex(woodCanvas({ seed: 73, base: '#2a160d', dark: '#140904', light: '#43230f' })), roughness: 0.22, envMap: env, envMapIntensity: 0.55 }),
    woodDark: std({ color: 0x1a0f0a, roughness: 0.3, envMap: env, envMapIntensity: 0.5 }),
    panel: std({ map: tex(woodCanvas({ seed: 75, base: '#3a1d10', dark: '#1d0d06', light: '#5a2e16', lines: 120 })), roughness: 0.24, envMap: env, envMapIntensity: 0.55 }),
    brass: std({ color: 0xd2a95c, metalness: 1, roughness: 0.24, envMap: env, envMapIntensity: 1.3 }),
    gold: std({ color: 0xe6bd5c, metalness: 1, roughness: 0.18, envMap: env, envMapIntensity: 1.5 }),
    rubber: std({ color: 0x111111, roughness: 0.85 }),
    acrylic: new THREE.MeshPhysicalMaterial({ color: 0xffffff, transparent: true, opacity: 0.12, roughness: 0.02, metalness: 0, envMap: env, envMapIntensity: 1 }),
    glow: std({ color: 0xfff1d8, emissive: 0xffd9a0, emissiveIntensity: 2.0 }),
    porcelain: std({ color: 0x5a0f18, roughness: 0.2, envMap: env, envMapIntensity: 0.8 }),
  }),
  build(lib) {
    const fx = lib.fx;
    fx.museum = buildMuseum(lib, { modernCar: () => buildF1Car(LIVERIES[0]) });
    mainCase(lib, { back: false });
    // filete dorado en el frente de cada repisa
    for (const y of BC.rows) {
      const strip = new THREE.Mesh(lib.unitBox, lib.mat.brass);
      strip.scale.set(BC.w - 2 * BC.side, 0.008, 0.006);
      strip.position.set(0, y - 0.006, BC.z + BC.d / 2 - 0.012);
      lib.room.add(strip);
    }
    // a los costados: una copa dorada grande en su columna y un casco de época en su vitrina
    const column = (x) => {
      const c = new THREE.Mesh(new THREE.CylinderGeometry(0.28, 0.32, 0.95, 32), lib.mat.panel);
      c.position.set(x, 0.475, FRONT_Z + 0.4);
      const cap = new THREE.Mesh(new THREE.CylinderGeometry(0.34, 0.34, 0.05, 32), lib.mat.brass);
      cap.position.set(x, 0.975, FRONT_Z + 0.4);
      lib.room.add(c, cap);
    };
    column(-3.1);
    column(3.1);
    const pts = [[0, 0], [0.15, 0], [0.15, 0.04], [0.06, 0.1], [0.045, 0.32], [0.14, 0.4], [0.22, 0.56], [0.24, 0.72], [0.22, 0.74], [0, 0.54]].map(([a, b]) => new THREE.Vector2(a, b));
    const cup = new THREE.Mesh(new THREE.LatheGeometry(pts, 48), lib.mat.gold);
    cup.position.set(-3.1, 1.0, FRONT_Z + 0.4);
    cup.castShadow = true;
    for (const s of [-1, 1]) {
      const h = new THREE.Mesh(new THREE.TorusGeometry(0.1, 0.014, 10, 28, Math.PI * 1.2), lib.mat.gold);
      h.position.set(-3.1 + s * 0.24, 1.6, FRONT_Z + 0.4);
      h.rotation.z = s > 0 ? -1.1 : Math.PI + 1.1 - Math.PI * 0.2;
      lib.room.add(h);
    }
    const helmet = classicHelmet(0xb3121e, lib.mat);
    helmet.scale.setScalar(2.0);
    helmet.position.set(3.1, 1.0, FRONT_Z + 0.4);
    helmet.rotation.y = -0.4;
    const vitrine = new THREE.Mesh(new THREE.BoxGeometry(0.62, 0.8, 0.62), lib.mat.acrylic);
    vitrine.position.set(3.1, 1.4, FRONT_Z + 0.4);
    lib.room.add(cup, helmet, vitrine);
    keyLight(lib, 0xffe0b8, 26);
    baySpots(lib, 0xffd8a8, 4);
  },
  tick(lib, t, dt) {
    lib.fx.museum.update(t, dt, lib.handlers.onShow);
  },
};

// Material compartido entre fondos (cantos de páginas de los libros).
export function pagesMaterial() {
  const m = std({ map: tex(paperEdgeCanvas()), color: 0xf2e6cb, roughness: 0.9 });
  m.userData.shared = true;
  return m;
}

export function sceneMaterials(id, env) {
  const base = baseMaterials(env);
  const own = SCENES[id].materials(env);
  for (const k of Object.keys(own)) {
    if (!base[k]) continue;
    base[k].map?.dispose();
    base[k].dispose();
  }
  return { ...base, ...own };
}
