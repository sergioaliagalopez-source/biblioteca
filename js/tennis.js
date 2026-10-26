// Objetos de tenis para la estantería del fondo «Tennis»: copas de plata en su vitrina, raquetas enmarcadas,
// pelotas gigantes firmadas, tubos de pelotas, un frasco con arcilla de la cancha y afiches de época.
// Cada función anota en `track` lo que crea (geometrías, materiales y texturas propias) para liberarlo después;
// los materiales del fondo (plata, bronce, madera) vienen en `mats` y no se anotan.
import * as THREE from 'three';
import { makeCanvas, seeded, grain } from './textures.js';

const std = (o) => new THREE.MeshStandardMaterial(o);
const SERIF = '"Cormorant Garamond", "EB Garamond", Georgia, serif';

function tex(canvas) {
  const t = new THREE.CanvasTexture(canvas);
  t.colorSpace = THREE.SRGBColorSpace;
  t.anisotropy = 8;
  return t;
}

const tracker = (track) => (x) => (track.push(x), x);
const shadows = (g) => g.traverse((m) => m.isMesh && (m.castShadow = true));

// ---------- Texturas ----------

// Fieltro amarillo con su costura blanca; las pelotas gigantes llevan además firmas con marcador.
function feltCanvas(seed, signed) {
  const w = 512, h = 256;
  const c = makeCanvas(w, h);
  const g = c.getContext('2d', { willReadFrequently: true });
  const rnd = seeded(seed);
  g.fillStyle = '#d6e83c';
  g.fillRect(0, 0, w, h);
  for (let i = 0; i < 2500; i++) {
    g.fillStyle = `rgba(${rnd() < 0.5 ? '250,255,170' : '150,170,20'},${0.15 + rnd() * 0.2})`;
    g.fillRect(rnd() * w, rnd() * h, 1 + rnd() * 2, 1 + rnd() * 2);
  }
  grain(g, w, h, 0.1, rnd);
  g.strokeStyle = '#f6f6ee';
  g.lineWidth = signed ? 9 : 12;
  g.beginPath();
  for (let x = 0; x <= w; x += 4) {
    const y = h / 2 + Math.sin((x / w) * Math.PI * 4) * h * 0.26;
    if (x === 0) g.moveTo(x, y);
    else g.lineTo(x, y);
  }
  g.stroke();
  if (signed) {
    g.lineCap = 'round';
    g.lineJoin = 'round';
    const inks = ['rgba(18,18,28,0.9)', 'rgba(20,40,120,0.85)', 'rgba(18,18,28,0.9)', 'rgba(30,30,30,0.85)', 'rgba(20,40,120,0.85)'];
    for (let s = 0; s < 5; s++) {
      g.strokeStyle = inks[s];
      g.lineWidth = 2.4 + rnd();
      let x = 20 + rnd() * (w - 190), y = 50 + rnd() * (h - 100);
      g.beginPath();
      g.moveTo(x, y);
      // un trazo con lazos, como una firma rápida
      for (let i = 0; i < 12; i++) {
        const nx = x + 6 + rnd() * 12;
        g.bezierCurveTo(x + 2, y - 18 * rnd(), nx - 2, y + 18 * rnd(), nx, y + (rnd() - 0.5) * 10);
        x = nx;
      }
      g.stroke();
      g.beginPath();
      g.moveTo(x - 120 * rnd(), y + 14);
      g.lineTo(x + 10, y + 10 + rnd() * 6);
      g.stroke();
    }
  }
  return c;
}

function stringsCanvas() {
  const S = 256;
  const c = makeCanvas(S, S);
  const g = c.getContext('2d');
  g.clearRect(0, 0, S, S);
  g.strokeStyle = 'rgba(244,244,236,0.95)';
  g.lineWidth = 2;
  for (let i = 6; i < S; i += 14) {
    g.beginPath(); g.moveTo(i, 0); g.lineTo(i, S); g.stroke();
  }
  for (let i = 6; i < S; i += 12) {
    g.beginPath(); g.moveTo(0, i); g.lineTo(S, i); g.stroke();
  }
  return c;
}

// Grip enrollado en diagonal.
function gripCanvas(base, line) {
  const c = makeCanvas(64, 256);
  const g = c.getContext('2d');
  g.fillStyle = base;
  g.fillRect(0, 0, 64, 256);
  g.strokeStyle = line;
  g.lineWidth = 3;
  for (let y = -64; y < 320; y += 22) {
    g.beginPath();
    g.moveTo(0, y);
    g.lineTo(64, y + 26);
    g.stroke();
  }
  return c;
}

function plateCanvas(top, bottom) {
  const c = makeCanvas(256, 80);
  const g = c.getContext('2d');
  const grad = g.createLinearGradient(0, 0, 0, 80);
  grad.addColorStop(0, '#e2c27c');
  grad.addColorStop(1, '#a8823e');
  g.fillStyle = grad;
  g.fillRect(0, 0, 256, 80);
  g.strokeStyle = 'rgba(70,45,10,0.6)';
  g.lineWidth = 3;
  g.strokeRect(5, 5, 246, 70);
  g.fillStyle = '#2b1d08';
  g.textAlign = 'center';
  g.textBaseline = 'middle';
  if (bottom) {
    g.font = `600 22px ${SERIF}`;
    g.fillText(top, 128, 28);
    g.font = `600 30px ${SERIF}`;
    g.fillText(bottom, 128, 56);
  } else {
    g.font = `600 42px ${SERIF}`;
    g.fillText(top, 128, 42);
  }
  return c;
}

// Etiqueta que da la vuelta a un tubo o frasco.
function labelCanvas(bg, fg, title, sub) {
  const c = makeCanvas(512, 128);
  const g = c.getContext('2d');
  g.fillStyle = bg;
  g.fillRect(0, 0, 512, 128);
  g.fillStyle = fg;
  g.fillRect(0, 8, 512, 3);
  g.fillRect(0, 117, 512, 3);
  g.textAlign = 'center';
  g.textBaseline = 'middle';
  for (const x of [128, 384]) {
    g.font = `700 34px ${SERIF}`;
    g.fillText(title, x, 54);
    g.font = `italic 500 22px ${SERIF}`;
    g.fillText(sub, x, 90);
  }
  return c;
}

// Afiches de época del torneo (diseños propios, sin logos): tres estilos.
function posterCanvas(style, year) {
  const W = 512, H = 716;
  const c = makeCanvas(W, H);
  const g = c.getContext('2d', { willReadFrequently: true });
  const rnd = seeded(year);
  const title = (text, y, size, color, weight = 700) => {
    g.fillStyle = color;
    g.font = `${weight} ${size}px ${SERIF}`;
    g.textAlign = 'center';
    g.textBaseline = 'middle';
    g.fillText(text, W / 2, y);
  };
  if (style === 0) {
    // cancha de arcilla en perspectiva bajo un gran sol-pelota
    g.fillStyle = '#efe4cc';
    g.fillRect(0, 0, W, H);
    g.fillStyle = '#1d5236';
    g.fillRect(0, 0, W, 120);
    title('PARIS', 66, 92, '#efe4cc');
    const sun = g.createRadialGradient(W / 2, 250, 10, W / 2, 250, 120);
    sun.addColorStop(0, '#f2f06a');
    sun.addColorStop(1, '#d4d93a');
    g.fillStyle = sun;
    g.beginPath(); g.arc(W / 2, 250, 108, 0, Math.PI * 2); g.fill();
    g.strokeStyle = '#fbfbf2';
    g.lineWidth = 8;
    g.beginPath(); g.arc(W / 2 - 150, 250, 120, -0.6, 0.6); g.stroke();
    g.beginPath(); g.arc(W / 2 + 150, 250, 120, Math.PI - 0.6, Math.PI + 0.6); g.stroke();
    g.fillStyle = '#c4643a';
    g.beginPath(); g.moveTo(170, 360); g.lineTo(342, 360); g.lineTo(470, 600); g.lineTo(42, 600); g.closePath(); g.fill();
    g.strokeStyle = '#f7f1e6';
    g.lineWidth = 3;
    g.beginPath(); g.moveTo(178, 365); g.lineTo(334, 365); g.lineTo(450, 592); g.lineTo(62, 592); g.closePath(); g.stroke();
    g.beginPath(); g.moveTo(256, 400); g.lineTo(256, 545); g.moveTo(205, 400); g.lineTo(307, 400); g.moveTo(150, 545); g.lineTo(362, 545); g.stroke();
    g.fillStyle = '#16402b';
    g.fillRect(110, 462, 292, 12);
    title('TERRE BATTUE', 640, 40, '#1d5236');
    title(String(year), 682, 30, '#8a3a1e', 600);
  } else if (style === 1) {
    // silueta de un jugador sacando, art déco
    const bg = g.createLinearGradient(0, 0, 0, H);
    bg.addColorStop(0, '#d0703f');
    bg.addColorStop(1, '#9c4220');
    g.fillStyle = bg;
    g.fillRect(0, 0, W, H);
    g.strokeStyle = 'rgba(255,230,200,0.12)';
    g.lineWidth = 18;
    for (let i = -H; i < W; i += 48) { g.beginPath(); g.moveTo(i, H); g.lineTo(i + H, 0); g.stroke(); }
    g.fillStyle = '#f4ecdc';
    g.beginPath(); g.ellipse(250, 250, 26, 30, 0, 0, Math.PI * 2); g.fill();
    g.beginPath();
    g.moveTo(232, 285); g.quadraticCurveTo(200, 360, 222, 450); g.lineTo(190, 590); g.lineTo(214, 596); g.lineTo(256, 470);
    g.lineTo(300, 590); g.lineTo(324, 584); g.lineTo(282, 440); g.quadraticCurveTo(300, 360, 270, 285); g.closePath(); g.fill();
    g.lineCap = 'round';
    g.strokeStyle = '#f4ecdc';
    g.lineWidth = 16;
    g.beginPath(); g.moveTo(268, 300); g.quadraticCurveTo(320, 250, 330, 170); g.stroke();
    g.beginPath(); g.moveTo(236, 305); g.quadraticCurveTo(190, 300, 170, 230); g.stroke();
    g.lineWidth = 7;
    g.beginPath(); g.moveTo(330, 170); g.lineTo(338, 120); g.stroke();
    g.beginPath(); g.ellipse(344, 82, 28, 40, 0.15, 0, Math.PI * 2); g.stroke();
    g.fillStyle = '#e9ec4a';
    g.beginPath(); g.arc(166, 140, 15, 0, Math.PI * 2); g.fill();
    g.strokeStyle = '#1d5236';
    g.lineWidth = 22;
    g.strokeRect(11, 11, W - 22, H - 22);
    title('TOURNOI DE PARIS', 640, 38, '#f4ecdc');
    title(String(year), 682, 30, '#f4ecdc', 600);
  } else {
    // composición geométrica: costura de pelota y raqueta
    g.fillStyle = '#183f2b';
    g.fillRect(0, 0, W, H);
    g.lineWidth = 34;
    [['#c4643a', 300], ['#efe4cc', 250], ['#d6e83c', 200]].forEach(([col, r], i) => {
      g.strokeStyle = col;
      g.beginPath(); g.arc(i % 2 ? 90 : 420, 330 + i * 30, r, 0, Math.PI * 2); g.stroke();
    });
    g.strokeStyle = '#efe4cc';
    g.lineWidth = 10;
    g.beginPath(); g.ellipse(256, 300, 92, 124, 0, 0, Math.PI * 2); g.stroke();
    g.beginPath(); g.moveTo(240, 420); g.lineTo(248, 560); g.moveTo(272, 420); g.lineTo(264, 560); g.stroke();
    g.lineWidth = 2;
    for (let x = 180; x <= 332; x += 16) { g.beginPath(); g.moveTo(x, 190); g.lineTo(x, 410); g.stroke(); }
    for (let y = 190; y <= 410; y += 16) { g.beginPath(); g.moveTo(170, y); g.lineTo(342, y); g.stroke(); }
    g.fillStyle = '#183f2b';
    g.fillRect(0, 0, W, 110);
    g.fillRect(0, 600, W, 116);
    title('JEU · SET · MATCH', 62, 40, '#e2c27c');
    title('PARIS', 640, 64, '#efe4cc');
    title(String(year), 690, 26, '#e2c27c', 600);
  }
  grain(g, W, H, 0.07, rnd);
  // papel envejecido en los bordes
  const v = g.createRadialGradient(W / 2, H / 2, H * 0.3, W / 2, H / 2, H * 0.75);
  v.addColorStop(0, 'rgba(90,60,20,0)');
  v.addColorStop(1, 'rgba(90,60,20,0.35)');
  g.fillStyle = v;
  g.fillRect(0, 0, W, H);
  return c;
}

// ---------- Objetos ----------

export const RACKET_LOOKS = [
  { frame: 0x161616, accent: 0xd8582a, grip: ['#f4f2ec', '#c9c5ba'] },
  { frame: 0xf2f1ec, accent: 0x1d5a3b, grip: ['#1d1d1d', '#3a3a3a'] },
  { frame: 0x1c3f7a, accent: 0xf2f1ec, grip: ['#f4f2ec', '#c9c5ba'] },
  { frame: 0x7a4a26, accent: 0xe4d2a8, grip: ['#6b3d1e', '#4a2812'] }, // de madera, de época
];

// Raqueta de 0,69 m: aro ovalado, garganta abierta, encordado, mango octogonal con grip y tapa.
export function buildRacket(look, track = []) {
  const keep = tracker(track);
  const g = new THREE.Group();
  const frameMat = keep(std({ color: look.frame, roughness: 0.28, metalness: 0.2 }));
  const accentMat = keep(std({ color: look.accent, roughness: 0.32, metalness: 0.15 }));
  const pts = [];
  for (let i = 0; i < 48; i++) {
    const a = (i / 48) * Math.PI * 2;
    pts.push(new THREE.Vector3(Math.sin(a) * 0.125 * (1 + 0.06 * Math.cos(a)), Math.cos(a) * 0.16, 0));
  }
  const head = new THREE.Mesh(keep(new THREE.TubeGeometry(new THREE.CatmullRomCurve3(pts, true), 96, 0.0105, 8, true)), frameMat);
  head.position.y = 0.53;
  head.scale.z = 1.4;
  // franja de color en la parte de arriba del aro
  const topPts = [];
  for (let i = -6; i <= 6; i++) {
    const a = (i / 48) * Math.PI * 2;
    topPts.push(new THREE.Vector3(Math.sin(a) * 0.125 * (1 + 0.06 * Math.cos(a)), Math.cos(a) * 0.16, 0));
  }
  const bumper = new THREE.Mesh(keep(new THREE.TubeGeometry(new THREE.CatmullRomCurve3(topPts), 24, 0.0112, 8, false)), accentMat);
  bumper.position.y = 0.53;
  bumper.scale.z = 1.4;
  const strings = new THREE.Mesh(
    keep(new THREE.CircleGeometry(1, 48)),
    keep(std({ map: keep(tex(stringsCanvas())), transparent: true, alphaTest: 0.35, side: THREE.DoubleSide, roughness: 0.5 })),
  );
  strings.scale.set(0.118, 0.152, 1);
  strings.position.y = 0.53;
  g.add(head, bumper, strings);
  for (const s of [-1, 1]) {
    const c = new THREE.CatmullRomCurve3([[s * 0.064, 0.395], [s * 0.046, 0.31], [s * 0.017, 0.235], [s * 0.014, 0.2]].map(([x, y]) => new THREE.Vector3(x, y, 0)));
    const arm = new THREE.Mesh(keep(new THREE.TubeGeometry(c, 20, 0.0098, 8, false)), accentMat);
    arm.scale.z = 1.3;
    g.add(arm);
  }
  const gripMat = keep(std({ map: keep(tex(gripCanvas(...look.grip))), roughness: 0.85 }));
  const handle = new THREE.Mesh(keep(new THREE.CylinderGeometry(0.0165, 0.0175, 0.2, 8)), gripMat);
  handle.position.y = 0.1;
  const collar = new THREE.Mesh(keep(new THREE.CylinderGeometry(0.0185, 0.017, 0.016, 8)), accentMat);
  collar.position.y = 0.205;
  const butt = new THREE.Mesh(keep(new THREE.CylinderGeometry(0.019, 0.019, 0.014, 8)), frameMat);
  butt.position.y = 0.007;
  g.add(handle, collar, butt);
  shadows(g);
  return g;
}

// Copa de plata de campeón, con tapa y remate, sobre plinto octogonal verde con banda de plata y placa.
// style 0: copa ancha con grandes asas en S; style 1: urna alta con asas pequeñas.
export function buildSilverCup(mats, year, track = [], scale = 1, style = 0) {
  const keep = tracker(track);
  const g = new THREE.Group();
  const plinth = new THREE.Mesh(keep(new THREE.CylinderGeometry(0.082, 0.094, 0.07, 8)), mats.woodDark);
  plinth.position.y = 0.035;
  plinth.rotation.y = Math.PI / 8;
  const band = new THREE.Mesh(keep(new THREE.CylinderGeometry(0.0835, 0.0835, 0.01, 8)), mats.silver);
  band.position.y = 0.064;
  band.rotation.y = Math.PI / 8;
  const plate = new THREE.Mesh(keep(new THREE.PlaneGeometry(0.06, 0.02)), keep(std({ map: keep(tex(plateCanvas(String(year)))), metalness: 0.5, roughness: 0.35 })));
  plate.position.set(0, 0.033, 0.083);
  plate.rotation.x = -0.17;
  const P = style === 0
    ? [[0, 0], [0.062, 0], [0.064, 0.008], [0.046, 0.018], [0.02, 0.032], [0.015, 0.06], [0.027, 0.072], [0.015, 0.086], [0.02, 0.1], [0.052, 0.13], [0.088, 0.17], [0.106, 0.22], [0.112, 0.26], [0.118, 0.27], [0.108, 0.278], [0.1, 0.282], [0.086, 0.3], [0.052, 0.322], [0.022, 0.333], [0.012, 0.343], [0.022, 0.357], [0.018, 0.372], [0, 0.382]]
    : [[0, 0], [0.05, 0], [0.052, 0.01], [0.03, 0.022], [0.014, 0.05], [0.022, 0.07], [0.012, 0.085], [0.03, 0.12], [0.066, 0.18], [0.078, 0.25], [0.07, 0.31], [0.058, 0.335], [0.07, 0.345], [0.066, 0.355], [0.05, 0.37], [0.03, 0.395], [0.012, 0.405], [0.018, 0.425], [0.012, 0.44], [0, 0.45]];
  const cup = new THREE.Mesh(keep(new THREE.LatheGeometry(P.map(([a, b]) => new THREE.Vector2(a, b)), 56)), mats.silver);
  cup.position.y = 0.07;
  g.add(plinth, band, plate, cup);
  for (const s of [-1, 1]) {
    const pts = style === 0
      ? [[0.1, 0.24], [0.15, 0.265], [0.178, 0.225], [0.16, 0.175], [0.12, 0.155], [0.09, 0.165]]
      : [[0.072, 0.28], [0.105, 0.29], [0.112, 0.255], [0.09, 0.225], [0.07, 0.22]];
    const c = new THREE.CatmullRomCurve3(pts.map(([x, y]) => new THREE.Vector3(s * x, y + 0.07, 0)));
    g.add(new THREE.Mesh(keep(new THREE.TubeGeometry(c, 32, style === 0 ? 0.0085 : 0.0065, 8, false)), mats.silver));
  }
  shadows(g);
  g.scale.setScalar(scale);
  return g;
}

// Vitrina de vidrio con aristas de bronce, sobre peana verde, con la copa adentro y su placa de campeón.
export function buildTrophyCase(mats, year, track = []) {
  const keep = tracker(track);
  const g = new THREE.Group();
  const W = 0.34, D = 0.26, H = 0.44;
  const base = new THREE.Mesh(keep(new THREE.BoxGeometry(W + 0.04, 0.05, D + 0.04)), mats.woodDark);
  base.position.y = 0.025;
  const plate = new THREE.Mesh(keep(new THREE.PlaneGeometry(0.15, 0.036)), keep(std({ map: keep(tex(plateCanvas('CHAMPION', String(year)))), metalness: 0.5, roughness: 0.35 })));
  plate.position.set(0, 0.026, D / 2 + 0.0205);
  const glass = new THREE.Mesh(keep(new THREE.BoxGeometry(W, H, D)), keep(new THREE.MeshPhysicalMaterial({ color: 0xffffff, transparent: true, opacity: 0.08, roughness: 0.02, metalness: 0.1, depthWrite: false })));
  glass.position.y = 0.05 + H / 2;
  g.add(base, plate, glass);
  const edge = keep(new THREE.BoxGeometry(0.008, 1, 0.008));
  for (const [x, z] of [[-1, -1], [1, -1], [-1, 1], [1, 1]]) {
    const e = new THREE.Mesh(edge, mats.brass);
    e.scale.y = H;
    e.position.set((x * W) / 2, 0.05 + H / 2, (z * D) / 2);
    g.add(e);
  }
  for (const z of [-1, 1]) {
    for (const y of [0.05, 0.05 + H]) {
      const e = new THREE.Mesh(edge, mats.brass);
      e.scale.y = W;
      e.rotation.z = Math.PI / 2;
      e.position.set(0, y, (z * D) / 2);
      g.add(e);
    }
  }
  for (const x of [-1, 1]) {
    const e = new THREE.Mesh(edge, mats.brass);
    e.scale.y = D;
    e.rotation.x = Math.PI / 2;
    e.position.set((x * W) / 2, 0.05 + H, 0);
    g.add(e);
  }
  const cup = buildSilverCup(mats, year, track, 0.92, 0);
  cup.position.y = 0.05;
  g.add(cup);
  shadows(g);
  glass.castShadow = false;
  return g;
}

// Pelota gigante firmada, sobre un pie de nogal con aro de bronce.
export function buildJumboBall(mats, seed, track = []) {
  const keep = tracker(track);
  const g = new THREE.Group();
  const foot = new THREE.Mesh(keep(new THREE.CylinderGeometry(0.06, 0.07, 0.035, 32)), mats.woodDark);
  foot.position.y = 0.0175;
  const ring = new THREE.Mesh(keep(new THREE.TorusGeometry(0.05, 0.007, 10, 40)), mats.brass);
  ring.rotation.x = Math.PI / 2;
  ring.position.y = 0.04;
  const ball = new THREE.Mesh(keep(new THREE.SphereGeometry(0.11, 48, 32)), keep(std({ map: keep(tex(feltCanvas(seed, true))), roughness: 1 })));
  ball.position.y = 0.035 + 0.1;
  ball.rotation.set(0.15, -0.5 + (seed % 7) * 0.08, 0.05);
  g.add(foot, ring, ball);
  shadows(g);
  return g;
}

// Raqueta enmarcada en una caja de madera con fondo de paño verde, una pelota y su placa.
export function buildRacketFrame(mats, look, year, track = []) {
  const keep = tracker(track);
  const g = new THREE.Group();
  const W = 0.36, H = 0.5, T = 0.025, D = 0.05;
  const felt = new THREE.Mesh(keep(new THREE.PlaneGeometry(W, H)), keep(std({ color: 0x173d29, roughness: 1 })));
  felt.position.z = -D / 2;
  g.add(felt);
  const bar = (w, h, x, y) => {
    const m = new THREE.Mesh(keep(new THREE.BoxGeometry(w, h, D)), mats.woodDark);
    m.position.set(x, y, 0);
    g.add(m);
  };
  bar(W + 2 * T, T, 0, H / 2 + T / 2);
  bar(W + 2 * T, T, 0, -H / 2 - T / 2);
  bar(T, H, -W / 2 - T / 2, 0);
  bar(T, H, W / 2 + T / 2, 0);
  const inner = (w, h, x, y) => {
    const m = new THREE.Mesh(keep(new THREE.BoxGeometry(w, h, 0.004)), mats.brass);
    m.position.set(x, y, D / 2);
    g.add(m);
  };
  inner(W, 0.006, 0, H / 2 - 0.003);
  inner(W, 0.006, 0, -H / 2 + 0.003);
  inner(0.006, H, -W / 2 + 0.003, 0);
  inner(0.006, H, W / 2 - 0.003, 0);
  const r = buildRacket(look, track);
  r.scale.setScalar(0.64);
  r.rotation.z = -0.42;
  r.position.set(-0.09, -0.22, -D / 2 + 0.02);
  const ball = new THREE.Mesh(keep(new THREE.SphereGeometry(0.033, 24, 16)), keep(std({ map: keep(tex(feltCanvas(year, false))), roughness: 1 })));
  ball.position.set(0.105, -0.15, -D / 2 + 0.035);
  const plate = new THREE.Mesh(keep(new THREE.PlaneGeometry(0.1, 0.03)), keep(std({ map: keep(tex(plateCanvas(String(year)))), metalness: 0.5, roughness: 0.35 })));
  plate.position.set(0.1, -0.205, -D / 2 + 0.002);
  g.add(r, ball, plate);
  shadows(g);
  felt.castShadow = false;
  felt.receiveShadow = true;
  // apoyada contra el fondo, un poco inclinada
  const holder = new THREE.Group();
  g.position.set(0, H / 2 + T + 0.005, 0);
  holder.add(g);
  holder.rotation.x = -0.1;
  holder.position.z = -0.06;
  return holder;
}

// Tubo de pelotas transparente con tres pelotas, tapa y etiqueta; otro acostado y una pelota suelta.
export function buildBallCans(seed, track = []) {
  const keep = tracker(track);
  const g = new THREE.Group();
  const feltMat = keep(std({ map: keep(tex(feltCanvas(seed, false))), roughness: 1 }));
  const ballGeo = keep(new THREE.SphereGeometry(0.033, 24, 16));
  const tubeGeo = keep(new THREE.CylinderGeometry(0.038, 0.038, 0.23, 28, 1, true));
  const tubeMat = keep(new THREE.MeshPhysicalMaterial({ color: 0xf4f8ff, transparent: true, opacity: 0.25, roughness: 0.05, side: THREE.DoubleSide, depthWrite: false }));
  const lidGeo = keep(new THREE.CylinderGeometry(0.041, 0.041, 0.022, 28));
  const lidMat = keep(std({ color: 0xf2f0ea, roughness: 0.4 }));
  const bottomMat = keep(std({ color: 0x1d5a3b, roughness: 0.5 }));
  const labelGeo = keep(new THREE.CylinderGeometry(0.0386, 0.0386, 0.075, 28, 1, true));
  const labelMat = keep(std({ map: keep(tex(labelCanvas('#1d5a3b', '#f2eee2', 'BALLES', 'terre battue · Paris'))), roughness: 0.5 }));
  const can = () => {
    const c = new THREE.Group();
    const tube = new THREE.Mesh(tubeGeo, tubeMat);
    tube.position.y = 0.127;
    const lid = new THREE.Mesh(lidGeo, lidMat);
    lid.position.y = 0.253;
    const bottom = new THREE.Mesh(lidGeo, bottomMat);
    bottom.position.y = 0.011;
    const label = new THREE.Mesh(labelGeo, labelMat);
    label.position.y = 0.065;
    c.add(tube, lid, bottom, label);
    for (let i = 0; i < 3; i++) {
      const b = new THREE.Mesh(ballGeo, feltMat);
      b.position.y = 0.056 + i * 0.068;
      b.rotation.set(i, i * 2, 0);
      c.add(b);
    }
    return c;
  };
  const a = can();
  a.position.x = -0.06;
  const b = can();
  b.rotation.z = Math.PI / 2;
  b.rotation.y = 0.4;
  b.position.set(0.07, 0.041, 0.02);
  b.scale.setScalar(0.98);
  const loose = new THREE.Mesh(ballGeo, feltMat);
  loose.position.set(0.035, 0.033, 0.12);
  g.add(a, b, loose);
  shadows(g);
  return g;
}

// Frasco de vidrio con arcilla de la cancha central, tapón de corcho y etiqueta.
export function buildClayJar(track = []) {
  const keep = tracker(track);
  const g = new THREE.Group();
  const glass = new THREE.Mesh(keep(new THREE.CylinderGeometry(0.055, 0.055, 0.17, 32, 1, true)), keep(new THREE.MeshPhysicalMaterial({ color: 0xf6fbff, transparent: true, opacity: 0.22, roughness: 0.04, side: THREE.DoubleSide, depthWrite: false })));
  glass.position.y = 0.085;
  const bottom = new THREE.Mesh(keep(new THREE.CylinderGeometry(0.055, 0.055, 0.008, 32)), glass.material);
  bottom.position.y = 0.004;
  const clayC = makeCanvas(128, 128);
  const cg = clayC.getContext('2d', { willReadFrequently: true });
  cg.fillStyle = '#c4643a';
  cg.fillRect(0, 0, 128, 128);
  grain(cg, 128, 128, 0.25, seeded(5));
  const clay = new THREE.Mesh(keep(new THREE.CylinderGeometry(0.051, 0.051, 0.115, 32)), keep(std({ map: keep(tex(clayC)), roughness: 1 })));
  clay.position.y = 0.065;
  const cork = new THREE.Mesh(keep(new THREE.CylinderGeometry(0.047, 0.044, 0.035, 24)), keep(std({ color: 0xa57a4f, roughness: 0.95 })));
  cork.position.y = 0.185;
  const label = new THREE.Mesh(keep(new THREE.CylinderGeometry(0.0555, 0.0555, 0.06, 32, 1, true)), keep(std({ map: keep(tex(labelCanvas('#efe4cc', '#1d5236', 'TERRE BATTUE', 'court central · Paris'))), roughness: 0.6 })));
  label.position.y = 0.09;
  label.rotation.y = 0.5;
  g.add(clay, glass, bottom, cork, label);
  shadows(g);
  glass.castShadow = false;
  return g;
}

// Afiche de época enmarcado, apoyado contra el fondo.
export function buildPoster(mats, style, year, track = []) {
  const keep = tracker(track);
  const g = new THREE.Group();
  const W = 0.3, H = 0.42, T = 0.018;
  const art = new THREE.Mesh(keep(new THREE.PlaneGeometry(W, H)), keep(std({ map: keep(tex(posterCanvas(style, year))), roughness: 0.7 })));
  g.add(art);
  const frameMat = style === 1 ? mats.woodDark : mats.brass;
  const bar = (w, h, x, y) => {
    const m = new THREE.Mesh(keep(new THREE.BoxGeometry(w, h, 0.02)), frameMat);
    m.position.set(x, y, 0.004);
    g.add(m);
  };
  bar(W + 2 * T, T, 0, H / 2 + T / 2);
  bar(W + 2 * T, T, 0, -H / 2 - T / 2);
  bar(T, H, -W / 2 - T / 2, 0);
  bar(T, H, W / 2 + T / 2, 0);
  const back = new THREE.Mesh(keep(new THREE.BoxGeometry(W + 2 * T, H + 2 * T, 0.01)), mats.woodDark);
  back.position.z = -0.008;
  g.add(back);
  shadows(g);
  const holder = new THREE.Group();
  g.position.set(0, H / 2 + T, 0);
  holder.add(g);
  holder.rotation.x = -0.12;
  holder.position.z = -0.08;
  return holder;
}

