// Los fondos (ambientes) de la biblioteca: materiales, sala, luces y animación de cada uno.
// La estantería principal mantiene siempre las mismas medidas, así los libros se acomodan igual en todos.
import * as THREE from 'three';
import {
  woodCanvas, floorCanvas, wallCanvas, paperEdgeCanvas, globeCanvas, marbleCanvas, concreteCanvas,
  decoWallCanvas, curtainCanvas, vinylCanvas, PALETTE,
} from './textures.js';
import { seaBackdrop, cityBackdrop } from './backdrops.js';

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
    base[k].map?.dispose();
    base[k].dispose();
  }
  return { ...base, ...own };
}
