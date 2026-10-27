// Museo de campeones (colección F1): una galería elegante detrás de la estantería, con autos de época en
// pedestales y cordones de terciopelo, vitrinas de cascos y trofeos, estandartes y luz cálida de museo.
// Hay vida: el auto del centro gira sobre su plataforma, un guía recorre la sala y, cada tanto, se apagan
// las luces y un foco presenta los autos uno por uno.
import * as THREE from 'three';
import { makeCanvas, seeded, grain, marbleCanvas, woodCanvas } from './textures.js';
import { buildKeeper } from './stadium.js';

const std = (o) => new THREE.MeshStandardMaterial(o);
const SERIF = '"Cormorant Garamond", "EB Garamond", Georgia, serif';
const BACK_Z = -19.5; // pared del fondo
const SIDE_X = 10; // paredes laterales
const HALL_H = 7;
const CENTER = new THREE.Vector3(0, 0, -8); // plataforma giratoria

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

// ---------- Texturas ----------

// Círculo blanco con el número de carrera, como en los autos de época.
function roundelCanvas(number, ring = '#111') {
  const c = makeCanvas(128, 128);
  const g = c.getContext('2d');
  g.fillStyle = '#f4f1e8';
  g.beginPath();
  g.arc(64, 64, 60, 0, Math.PI * 2);
  g.fill();
  g.lineWidth = 5;
  g.strokeStyle = ring;
  g.stroke();
  g.fillStyle = '#111';
  g.font = `700 70px ${SERIF}`;
  g.textAlign = 'center';
  g.textBaseline = 'middle';
  g.fillText(String(number), 64, 70);
  return c;
}

// Atril con la ficha del auto: año y una frase.
function cardCanvas(year, line) {
  const c = makeCanvas(512, 320);
  const g = c.getContext('2d', { willReadFrequently: true });
  g.fillStyle = '#1a1310';
  g.fillRect(0, 0, 512, 320);
  g.strokeStyle = '#c6a15b';
  g.lineWidth = 4;
  g.strokeRect(14, 14, 484, 292);
  g.textAlign = 'center';
  g.fillStyle = '#e2c27c';
  g.font = `600 110px ${SERIF}`;
  g.fillText(String(year), 256, 150);
  g.fillStyle = '#d9cfbd';
  g.font = `italic 500 34px ${SERIF}`;
  g.fillText(line, 256, 240);
  grain(g, 512, 320, 0.05, seeded(year));
  return c;
}

// Letrero dorado de la pared del fondo (se ilumina desde atrás).
function titleCanvas(emissive = false) {
  const W = 2048, H = 280;
  const c = makeCanvas(W, H);
  const g = c.getContext('2d');
  g.fillStyle = emissive ? '#000' : '#1a1411';
  g.fillRect(0, 0, W, H);
  g.textAlign = 'center';
  g.textBaseline = 'middle';
  g.font = `600 150px ${SERIF}`;
  if (emissive) {
    g.shadowColor = 'rgba(255, 200, 120, 0.9)';
    g.shadowBlur = 40;
  }
  g.fillStyle = emissive ? '#ffd490' : '#d9b46a';
  g.fillText('S A L A   D E   C A M P E O N E S', W / 2, 120);
  g.font = `italic 500 64px ${SERIF}`;
  g.fillStyle = emissive ? '#6a4a20' : '#a88a55';
  g.fillText('setenta años de velocidad', W / 2, 225);
  return c;
}

// Fotografía de época enmarcada: un auto antiguo en una curva, en sepia.
function photoCanvas(seed) {
  const W = 420, H = 300;
  const c = makeCanvas(W, H);
  const g = c.getContext('2d', { willReadFrequently: true });
  const rnd = seeded(seed);
  const sky = g.createLinearGradient(0, 0, 0, H);
  sky.addColorStop(0, '#d9c9a6');
  sky.addColorStop(1, '#8a7655');
  g.fillStyle = sky;
  g.fillRect(0, 0, W, H);
  // tribuna y árboles a lo lejos
  g.fillStyle = 'rgba(70, 55, 35, 0.55)';
  for (let x = 0; x < W; x += 6) g.fillRect(x, 120 + Math.sin(x * 0.05 + seed) * 8 - rnd() * 14, 6, 60);
  // pista en curva
  g.fillStyle = '#5e4e36';
  g.beginPath();
  g.moveTo(0, 230);
  g.quadraticCurveTo(W * 0.5, 150 + rnd() * 30, W, 210);
  g.lineTo(W, H);
  g.lineTo(0, H);
  g.fill();
  // el auto: un «cigarro» con ruedas grandes y el piloto
  const cx = 120 + rnd() * 160, cy = 205;
  g.fillStyle = '#2b2116';
  g.beginPath();
  g.ellipse(cx, cy, 62, 13, -0.05, 0, Math.PI * 2);
  g.fill();
  for (const dx of [-40, 38]) {
    g.beginPath();
    g.arc(cx + dx, cy + 12, 14, 0, Math.PI * 2);
    g.fill();
  }
  g.beginPath();
  g.arc(cx - 4, cy - 14, 8, 0, Math.PI * 2);
  g.fill();
  // polvo y estela de velocidad
  g.strokeStyle = 'rgba(240, 225, 195, 0.35)';
  for (let i = 0; i < 8; i++) {
    g.beginPath();
    g.moveTo(cx - 70 - rnd() * 40, cy - 10 + i * 4);
    g.lineTo(cx - 140 - rnd() * 80, cy - 10 + i * 4);
    g.stroke();
  }
  grain(g, W, H, 0.12, rnd);
  const v = g.createRadialGradient(W / 2, H / 2, H * 0.3, W / 2, H / 2, W * 0.7);
  v.addColorStop(0, 'rgba(40,25,10,0)');
  v.addColorStop(1, 'rgba(40,25,10,0.55)');
  g.fillStyle = v;
  g.fillRect(0, 0, W, H);
  return c;
}

// Estandarte colgante de una década.
function bannerCanvas(decade, color) {
  const c = makeCanvas(256, 900);
  const g = c.getContext('2d', { willReadFrequently: true });
  g.fillStyle = color;
  g.fillRect(0, 0, 256, 900);
  g.strokeStyle = '#d9b46a';
  g.lineWidth = 6;
  g.strokeRect(18, 18, 220, 864);
  g.fillStyle = '#e8c98a';
  g.textAlign = 'center';
  g.font = `600 96px ${SERIF}`;
  g.save();
  g.translate(128, 450);
  g.rotate(-Math.PI / 2);
  g.fillText(decade, 0, 32);
  g.restore();
  g.beginPath();
  g.moveTo(18, 860);
  g.lineTo(128, 760);
  g.lineTo(238, 860);
  g.stroke();
  grain(g, 256, 900, 0.06, seeded(decade.length * 7));
  return c;
}

// Pared de la galería: paneles con moldura y la luz cálida de los bañadores de pared, más fuerte abajo.
function wallCanvas() {
  const W = 1024, H = 512;
  const c = makeCanvas(W, H);
  const g = c.getContext('2d', { willReadFrequently: true });
  const grad = g.createLinearGradient(0, 0, 0, H);
  grad.addColorStop(0, '#1c1613');
  grad.addColorStop(0.55, '#4a3a2e');
  grad.addColorStop(1, '#5e4a3a');
  g.fillStyle = grad;
  g.fillRect(0, 0, W, H);
  // pools de luz de cada bañador
  for (let x = 64; x < W; x += 128) {
    const r = g.createRadialGradient(x, H * 0.62, 6, x, H * 0.62, 150);
    r.addColorStop(0, 'rgba(255, 196, 130, 0.22)');
    r.addColorStop(1, 'rgba(255, 196, 130, 0)');
    g.fillStyle = r;
    g.fillRect(x - 160, 0, 320, H);
  }
  // paneles con moldura
  g.strokeStyle = 'rgba(20, 14, 10, 0.55)';
  g.lineWidth = 3;
  for (let x = 16; x < W; x += 128) g.strokeRect(x, H * 0.25, 96, H * 0.62);
  g.strokeStyle = 'rgba(214, 170, 110, 0.12)';
  g.lineWidth = 1;
  for (let x = 18; x < W; x += 128) g.strokeRect(x, H * 0.25 + 2, 96, H * 0.62);
  grain(g, W, H, 0.04, seeded(4));
  return c;
}

// Haz de luz: opaco junto al foco y transparente hacia el piso.
function beamCanvas() {
  const c = makeCanvas(8, 256);
  const g = c.getContext('2d');
  const grad = g.createLinearGradient(0, 0, 0, 256);
  grad.addColorStop(0, 'rgba(255,255,255,0.9)');
  grad.addColorStop(0.5, 'rgba(255,255,255,0.3)');
  grad.addColorStop(1, 'rgba(255,255,255,0)');
  g.fillStyle = grad;
  g.fillRect(0, 0, 8, 256);
  return c;
}

// Sombra de contacto suave bajo cada auto.
function shadowCanvas() {
  const c = makeCanvas(128, 128);
  const g = c.getContext('2d');
  const r = g.createRadialGradient(64, 64, 6, 64, 64, 62);
  r.addColorStop(0, 'rgba(0,0,0,0.75)');
  r.addColorStop(1, 'rgba(0,0,0,0)');
  g.fillStyle = r;
  g.fillRect(0, 0, 128, 128);
  return c;
}

// ---------- Autos de época ----------

// Rueda de rayos (años 50 y 60): neumático angosto, aro cromado y rayos finos.
function wireWheel(mats, r, w) {
  const g = new THREE.Group();
  const tyre = new THREE.Mesh(new THREE.TorusGeometry(r - 0.05, 0.055, 12, 32), mats.rubber);
  tyre.scale.z = w / 0.11;
  const rim = new THREE.Mesh(new THREE.TorusGeometry(r - 0.11, 0.014, 6, 32), mats.chrome);
  const hub = new THREE.Mesh(new THREE.CylinderGeometry(0.055, 0.055, w * 1.3, 12), mats.chrome);
  hub.rotation.x = Math.PI / 2;
  const spin = new THREE.Mesh(new THREE.CylinderGeometry(0.03, 0.06, 0.05, 6), mats.chrome);
  spin.rotation.x = Math.PI / 2;
  spin.position.z = w * 0.7;
  g.add(tyre, rim, hub, spin);
  const spoke = new THREE.CylinderGeometry(0.004, 0.004, r - 0.12, 4);
  for (let i = 0; i < 14; i++) {
    const s = new THREE.Mesh(spoke, mats.chrome);
    const a = (i / 14) * Math.PI * 2;
    s.position.set(Math.cos(a) * (r - 0.12) / 2, Math.sin(a) * (r - 0.12) / 2, (i % 2 ? 1 : -1) * w * 0.2);
    s.rotation.z = a - Math.PI / 2;
    g.add(s);
  }
  return g;
}

// Rueda ancha de llanta lisa (años 70 y 80).
function slickWheel(mats, r, w) {
  const g = new THREE.Group();
  const tyre = new THREE.Mesh(new THREE.CylinderGeometry(r, r, w, 28), mats.rubber);
  tyre.rotation.x = Math.PI / 2;
  const rim = new THREE.Mesh(new THREE.CylinderGeometry(r * 0.62, r * 0.62, w + 0.01, 20), mats.rim);
  rim.rotation.x = Math.PI / 2;
  g.add(tyre, rim);
  return g;
}

// Cuerpo «cigarro» hecho con un torno a lo largo de x (el frente en +x).
function cigarBody(profile, mat) {
  const pts = profile.map(([x, r]) => new THREE.Vector2(r, x));
  const geo = new THREE.LatheGeometry(pts, 32);
  geo.rotateZ(-Math.PI / 2);
  return new THREE.Mesh(geo, mat);
}

function roundel(number, size, x, y, z, side) {
  const m = new THREE.Mesh(new THREE.CircleGeometry(size, 24), std({ map: tex(roundelCanvas(number)), roughness: 0.5 }));
  m.position.set(x, y, z);
  if (side) m.rotation.y = side > 0 ? 0 : Math.PI;
  else m.rotation.x = -Math.PI / 2;
  return m;
}

function driverHead(mats, x, y) {
  const g = new THREE.Group();
  const helmet = new THREE.Mesh(new THREE.SphereGeometry(0.12, 16, 12), mats.leather);
  helmet.scale.set(1, 0.95, 0.95);
  const goggles = new THREE.Mesh(new THREE.TorusGeometry(0.11, 0.014, 6, 20, Math.PI * 0.8), mats.chrome);
  goggles.rotation.set(0, Math.PI / 2, Math.PI * 0.6);
  goggles.position.set(0.02, 0.02, 0);
  g.add(helmet, goggles);
  g.position.set(x, y, 0);
  return g;
}

// Auto de los años 50: motor adelante, parrilla, cola en punta y ruedas de rayos.
function car1950(color, number) {
  const mats = carMats(color);
  const g = new THREE.Group();
  const body = cigarBody([[2.05, 0], [2.0, 0.2], [1.8, 0.33], [1.2, 0.42], [0.2, 0.45], [-0.6, 0.43], [-1.4, 0.34], [-1.95, 0.16], [-2.05, 0]], mats.body);
  body.scale.set(1, 1.15, 0.92);
  body.position.y = 0.55;
  const grille = new THREE.Mesh(new THREE.CircleGeometry(0.17, 24), mats.grille);
  grille.position.set(2.0, 0.55, 0);
  grille.rotation.y = Math.PI / 2;
  const cockpit = new THREE.Mesh(new THREE.TorusGeometry(0.3, 0.04, 8, 24), mats.leather);
  cockpit.rotation.x = Math.PI / 2;
  cockpit.scale.set(1.3, 1, 1);
  cockpit.position.set(-0.4, 1.02, 0);
  const screen = new THREE.Mesh(new THREE.PlaneGeometry(0.42, 0.16), mats.glass);
  screen.position.set(0.05, 1.08, 0);
  screen.rotation.set(0, Math.PI / 2, -0.35);
  const fairing = new THREE.Mesh(new THREE.SphereGeometry(0.2, 14, 10, 0, Math.PI * 2, 0, Math.PI / 2), mats.body);
  fairing.scale.set(1.6, 0.9, 0.7);
  fairing.position.set(-0.95, 0.98, 0);
  g.add(body, grille, cockpit, screen, fairing, driverHead(mats, -0.5, 1.15));
  for (const s of [-1, 1]) {
    const pipe = new THREE.Mesh(new THREE.CylinderGeometry(0.04, 0.05, 1.7, 10), mats.chrome);
    pipe.rotation.z = Math.PI / 2;
    pipe.position.set(-0.3, 0.42, s * 0.47);
    if (s < 0) g.add(pipe);
    g.add(roundel(number, 0.2, 0.6, 0.62, s * 0.44, s));
  }
  for (const [x, z] of [[1.35, 0.68], [1.35, -0.68], [-1.25, 0.66], [-1.25, -0.66]]) {
    const w = wireWheel(mats, 0.36, 0.13);
    w.position.set(x, 0.36, z);
    g.add(w);
  }
  finish(g);
  return g;
}

// Auto de los años 60: motor atrás, muy bajo, con las trompetas del escape a la vista.
function car1960(color, number) {
  const mats = carMats(color);
  const g = new THREE.Group();
  const body = cigarBody([[1.95, 0], [1.88, 0.15], [1.5, 0.3], [0.6, 0.38], [-0.5, 0.38], [-1.3, 0.32], [-1.8, 0.2], [-1.9, 0]], mats.body);
  body.scale.set(1, 1.0, 0.95);
  body.position.y = 0.42;
  const nose = new THREE.Mesh(new THREE.CircleGeometry(0.12, 20), mats.grille);
  nose.position.set(1.9, 0.42, 0);
  nose.rotation.y = Math.PI / 2;
  const screen = new THREE.Mesh(new THREE.PlaneGeometry(0.38, 0.12), mats.glass);
  screen.position.set(0.35, 0.84, 0);
  screen.rotation.set(0, Math.PI / 2, -0.5);
  const engine = new THREE.Mesh(new THREE.BoxGeometry(0.7, 0.18, 0.46), mats.metal);
  engine.position.set(-1.0, 0.78, 0);
  g.add(body, nose, screen, engine, driverHead(mats, -0.05, 0.92));
  for (let i = 0; i < 4; i++) {
    for (const s of [-1, 1]) {
      const t = new THREE.Mesh(new THREE.CylinderGeometry(0.028, 0.04, 0.22, 10), mats.chrome);
      t.position.set(-0.75 - i * 0.16, 0.95, s * 0.13);
      g.add(t);
    }
  }
  g.add(roundel(number, 0.18, 1.05, 0.81, 0, 0));
  for (const s of [-1, 1]) g.add(roundel(number, 0.15, -0.2, 0.47, s * 0.37, s));
  for (const [x, z, r] of [[1.25, 0.64, 0.3], [1.25, -0.64, 0.3], [-1.3, 0.66, 0.32], [-1.3, -0.66, 0.32]]) {
    const w = wireWheel(mats, r, 0.16);
    w.position.set(x, r, z);
    g.add(w);
  }
  finish(g);
  return g;
}

// Auto de los años 70: trompa en cuña, toma de aire alta y alerón grande, con filetes dorados.
function car1970(color, trim, number) {
  const mats = carMats(color, trim);
  const g = new THREE.Group();
  const side = new THREE.Shape();
  side.moveTo(2.3, 0.12);
  side.lineTo(2.3, 0.2);
  side.lineTo(0.6, 0.55);
  side.lineTo(-0.2, 0.62);
  side.lineTo(-1.9, 0.6);
  side.lineTo(-2.0, 0.12);
  side.closePath();
  const geo = new THREE.ExtrudeGeometry(side, { depth: 0.7, bevelEnabled: true, bevelSize: 0.04, bevelThickness: 0.04, bevelSegments: 2 });
  geo.translate(0, 0, -0.35);
  const body = new THREE.Mesh(geo, mats.body);
  const pods = new THREE.Mesh(new THREE.BoxGeometry(1.7, 0.3, 1.5), mats.body);
  pods.position.set(-0.5, 0.3, 0);
  const airbox = new THREE.Mesh(new THREE.BoxGeometry(0.5, 0.45, 0.32), mats.body);
  airbox.position.set(-0.55, 0.95, 0);
  const fwing = new THREE.Mesh(new THREE.BoxGeometry(0.4, 0.04, 1.9), mats.body);
  fwing.position.set(2.1, 0.18, 0);
  const rwing = new THREE.Mesh(new THREE.BoxGeometry(0.55, 0.05, 1.5), mats.body);
  rwing.position.set(-2.05, 1.05, 0);
  const rlip = new THREE.Mesh(new THREE.BoxGeometry(0.06, 0.07, 1.52), mats.trim);
  rlip.position.set(-2.3, 1.06, 0);
  const flip = new THREE.Mesh(new THREE.BoxGeometry(0.06, 0.05, 1.92), mats.trim);
  flip.position.set(2.3, 0.18, 0);
  const abox = new THREE.Mesh(new THREE.BoxGeometry(0.52, 0.06, 0.34), mats.trim);
  abox.position.set(-0.55, 1.18, 0);
  g.add(body, pods, airbox, fwing, rwing, rlip, flip, abox, driverHead(mats, 0.15, 0.78));
  for (const s of [-1, 1]) {
    const plate = new THREE.Mesh(new THREE.BoxGeometry(0.6, 0.5, 0.03), mats.body);
    plate.position.set(-2.05, 0.82, s * 0.76);
    const strut = new THREE.Mesh(new THREE.BoxGeometry(0.06, 0.5, 0.04), mats.metal);
    strut.position.set(-1.9, 0.78, s * 0.2);
    const stripe = new THREE.Mesh(new THREE.BoxGeometry(1.7, 0.04, 0.012), mats.trim);
    stripe.position.set(-0.5, 0.42, s * 0.756);
    const nstripe = new THREE.Mesh(new THREE.BoxGeometry(1.75, 0.02, 0.01), mats.trim);
    nstripe.position.set(1.4, 0.32, s * 0.395);
    nstripe.rotation.z = 0.2;
    g.add(plate, strut, stripe, nstripe, roundel(number, 0.15, -0.5, 0.3, s * 0.76, s));
  }
  for (const [x, z, r, w] of [[1.6, 0.78, 0.3, 0.3], [1.6, -0.78, 0.3, 0.3], [-1.45, 0.8, 0.38, 0.48], [-1.45, -0.8, 0.38, 0.48]]) {
    const wh = slickWheel(mats, r, w);
    wh.position.set(x, r, z);
    g.add(wh);
  }
  finish(g);
  return g;
}

// Auto de los años 80: pontones planos y anchos, trompa fina y alerón trasero bajo.
function car1980(color, accent, number) {
  const mats = carMats(color, accent);
  const g = new THREE.Group();
  const tub = new THREE.Mesh(new THREE.BoxGeometry(2.2, 0.38, 0.6), mats.body);
  tub.position.set(0.4, 0.38, 0);
  const nose = new THREE.Mesh(new THREE.CylinderGeometry(0.08, 0.28, 1.4, 4), mats.body);
  nose.rotation.set(Math.PI / 4, 0, -Math.PI / 2);
  nose.scale.set(1, 1, 0.6);
  nose.position.set(2.1, 0.3, 0);
  const pods = new THREE.Mesh(new THREE.BoxGeometry(2.1, 0.32, 1.6), mats.body);
  pods.position.set(-0.5, 0.3, 0);
  const band = new THREE.Mesh(new THREE.BoxGeometry(2.12, 0.08, 1.62), mats.trim);
  band.position.set(-0.5, 0.36, 0);
  const cover = new THREE.Mesh(new THREE.BoxGeometry(1.4, 0.32, 0.6), mats.body);
  cover.position.set(-1.0, 0.62, 0);
  const fwing = new THREE.Mesh(new THREE.BoxGeometry(0.42, 0.04, 1.8), mats.trim);
  fwing.position.set(2.65, 0.14, 0);
  const rwing = new THREE.Mesh(new THREE.BoxGeometry(0.5, 0.05, 1.1), mats.trim);
  rwing.position.set(-2.0, 0.92, 0);
  const screen = new THREE.Mesh(new THREE.PlaneGeometry(0.3, 0.14), mats.glass);
  screen.position.set(0.9, 0.64, 0);
  screen.rotation.set(0, Math.PI / 2, -0.6);
  g.add(tub, nose, pods, band, cover, fwing, rwing, screen, driverHead(mats, 0.4, 0.72));
  for (const s of [-1, 1]) {
    const plate = new THREE.Mesh(new THREE.BoxGeometry(0.55, 0.45, 0.03), mats.body);
    plate.position.set(-2.0, 0.74, s * 0.55);
    g.add(plate, roundel(number, 0.13, 0.4, 0.4, s * 0.31, s));
  }
  for (const [x, z, r, w] of [[1.7, 0.82, 0.3, 0.32], [1.7, -0.82, 0.3, 0.32], [-1.5, 0.82, 0.34, 0.44], [-1.5, -0.82, 0.34, 0.44]]) {
    const wh = slickWheel(mats, r, w);
    wh.position.set(x, r, z);
    g.add(wh);
  }
  finish(g);
  return g;
}

function carMats(color, trim = 0xd9b46a) {
  return {
    body: std({ color, metalness: 0.45, roughness: 0.22 }),
    trim: std({ color: trim, metalness: 0.7, roughness: 0.3 }),
    chrome: std({ color: 0xe8e8ec, metalness: 1, roughness: 0.15 }),
    rubber: std({ color: 0x121212, roughness: 0.85 }),
    rim: std({ color: 0xb8b8bc, metalness: 0.9, roughness: 0.3 }),
    metal: std({ color: 0x55575c, metalness: 0.8, roughness: 0.35 }),
    leather: std({ color: 0x5a3a22, roughness: 0.6 }),
    grille: std({ color: 0x1a1a1a, metalness: 0.6, roughness: 0.4 }),
    glass: new THREE.MeshPhysicalMaterial({ color: 0xffffff, transparent: true, opacity: 0.3, roughness: 0.05, side: THREE.DoubleSide }),
  };
}

function finish(g) {
  g.traverse((m) => {
    if (m.isMesh) m.castShadow = true;
  });
}

// Casco abierto de época (de cuero o pintado) puesto en un busto de terciopelo negro: casco con orejeras,
// visera corta, antiparras sobre la frente y correa al mentón.
export const HELMET_COLORS = [0xf2efe6, 0xb3121e, 0x174a2c, 0x6a4428, 0x1c3d8f, 0xd9b46a];
export function classicHelmet(color, mats, track = []) {
  const keep = (x) => (track.push(x), x);
  const g = new THREE.Group();
  const shell = keep(std({ color, roughness: 0.3, metalness: 0.05 }));
  const leather = keep(std({ color: 0x3a2414, roughness: 0.7 }));
  const velvet = keep(std({ color: 0x0d0c0c, roughness: 1 }));
  const base = new THREE.Mesh(keep(new THREE.CylinderGeometry(0.075, 0.085, 0.03, 24)), mats.brass);
  base.position.y = 0.015;
  const neck = new THREE.Mesh(keep(new THREE.CylinderGeometry(0.04, 0.05, 0.1, 16)), velvet);
  neck.position.y = 0.08;
  const head = new THREE.Mesh(keep(new THREE.SphereGeometry(0.085, 24, 18)), velvet);
  head.scale.set(0.9, 1.1, 1);
  head.position.y = 0.2;
  const cap = new THREE.Mesh(keep(new THREE.SphereGeometry(0.098, 28, 16, 0, Math.PI * 2, 0, Math.PI * 0.55)), shell);
  cap.scale.set(0.95, 1.12, 1.05);
  cap.position.y = 0.205;
  const brim = new THREE.Mesh(keep(new THREE.CylinderGeometry(0.075, 0.075, 0.008, 20, 1, false, -Math.PI * 0.32, Math.PI * 0.64)), shell);
  brim.position.set(0, 0.22, 0.045);
  brim.rotation.x = 0.18;
  g.add(base, neck, head, cap, brim);
  for (const s of [-1, 1]) {
    const flap = new THREE.Mesh(keep(new THREE.SphereGeometry(0.035, 12, 10)), leather);
    flap.scale.set(0.45, 1.2, 1);
    flap.position.set(s * 0.083, 0.175, -0.005);
    const lens = new THREE.Mesh(keep(new THREE.TorusGeometry(0.022, 0.007, 8, 18)), mats.brass);
    lens.position.set(s * 0.03, 0.283, 0.06);
    lens.rotation.x = -0.75;
    g.add(flap, lens);
  }
  const strap = new THREE.Mesh(keep(new THREE.TorusGeometry(0.1, 0.006, 6, 40)), leather);
  strap.rotation.x = Math.PI / 2 - 0.7;
  strap.position.set(0, 0.27, 0);
  strap.scale.set(0.92, 1, 1);
  const chin = new THREE.Mesh(keep(new THREE.TorusGeometry(0.075, 0.005, 6, 30, Math.PI)), leather);
  chin.rotation.set(0, Math.PI / 2, Math.PI);
  chin.position.set(0, 0.175, 0.01);
  g.add(strap, chin);
  g.traverse((m) => m.isMesh && (m.castShadow = true));
  return g;
}

// Maqueta de un auto de época para la estantería (el modelo grande, a escala 1:18 más o menos).
export const VINTAGE = [
  () => car1950(0xb3121e, 2),
  () => car1960(0x174a2c, 7),
  () => car1970(0x101010, 0xd9b46a, 5),
  () => car1980(0xf2f0ea, 0xc8102e, 1),
];

// Foto de época en marco dorado sobre un caballete pequeño (para la estantería).
export function buildOldPhoto(mats, seed, track = []) {
  const keep = (x) => (track.push(x), x);
  const g = new THREE.Group();
  const W = 0.3, H = 0.22;
  const frame = new THREE.Mesh(keep(new THREE.BoxGeometry(W + 0.04, H + 0.04, 0.02)), mats.gold);
  const photo = new THREE.Mesh(keep(new THREE.PlaneGeometry(W, H)), keep(std({ map: keep(tex(photoCanvas(seed))), roughness: 0.6 })));
  photo.position.z = 0.011;
  const pic = new THREE.Group();
  pic.add(frame, photo);
  pic.position.set(0, H / 2 + 0.04, 0);
  pic.rotation.x = -0.18;
  const foot = new THREE.Mesh(keep(new THREE.BoxGeometry(0.02, 0.2, 0.02)), mats.brass);
  foot.position.set(0, 0.1, -0.06);
  foot.rotation.x = 0.4;
  g.add(pic, foot);
  g.traverse((m) => m.isMesh && (m.castShadow = true));
  return g;
}

// ---------- La sala ----------

// Poste de bronce con cordón de terciopelo entre postes.
function stanchions(group, mats, points, closed) {
  const postGeo = new THREE.CylinderGeometry(0.035, 0.035, 0.9, 12);
  const baseGeo = new THREE.CylinderGeometry(0.16, 0.18, 0.04, 20);
  const knobGeo = new THREE.SphereGeometry(0.06, 14, 10);
  points.forEach(([x, z]) => {
    const post = new THREE.Mesh(postGeo, mats.brass);
    post.position.set(x, 0.45, z);
    const base = new THREE.Mesh(baseGeo, mats.brass);
    base.position.set(x, 0.02, z);
    const knob = new THREE.Mesh(knobGeo, mats.brass);
    knob.position.set(x, 0.92, z);
    group.add(post, base, knob);
  });
  const n = closed ? points.length : points.length - 1;
  for (let i = 0; i < n; i++) {
    const [ax, az] = points[i], [bx, bz] = points[(i + 1) % points.length];
    const mid = new THREE.Vector3((ax + bx) / 2, 0.62, (az + bz) / 2);
    const curve = new THREE.QuadraticBezierCurve3(new THREE.Vector3(ax, 0.86, az), mid, new THREE.Vector3(bx, 0.86, bz));
    const rope = new THREE.Mesh(new THREE.TubeGeometry(curve, 16, 0.022, 8, false), mats.velvet);
    group.add(rope);
  }
}

// Atril bajo con la ficha del auto.
function plaque(group, mats, x, z, rotY, year, line) {
  const g = new THREE.Group();
  const leg = new THREE.Mesh(new THREE.CylinderGeometry(0.03, 0.05, 0.8, 10), mats.brass);
  leg.position.y = 0.4;
  const board = new THREE.Mesh(new THREE.PlaneGeometry(0.5, 0.31), std({ map: tex(cardCanvas(year, line)), roughness: 0.5 }));
  board.position.set(0, 0.86, 0.06);
  board.rotation.x = -0.6;
  const frame = new THREE.Mesh(new THREE.BoxGeometry(0.54, 0.35, 0.02), mats.brass);
  frame.position.set(0, 0.855, 0.05);
  frame.rotation.x = -0.6;
  g.add(leg, frame, board);
  g.position.set(x, 0, z);
  g.rotation.y = rotY;
  group.add(g);
}

// Vitrina de pared con cascos de época y copas doradas, iluminada por dentro.
function wallCase(group, mats, x, z0, z1, side, helmets) {
  const len = Math.abs(z1 - z0), zc = (z0 + z1) / 2, depth = 0.7;
  const cx = x - side * depth / 2;
  const base = new THREE.Mesh(new THREE.BoxGeometry(depth, 0.9, len), mats.walnut);
  base.position.set(cx, 0.45, zc);
  const top = new THREE.Mesh(new THREE.BoxGeometry(depth, 0.12, len), mats.walnut);
  top.position.set(cx, 2.86, zc);
  const glass = new THREE.Mesh(new THREE.BoxGeometry(depth * 0.98, 1.86, len * 0.995), mats.caseGlass);
  glass.position.set(cx, 1.87, zc);
  const back = new THREE.Mesh(new THREE.PlaneGeometry(len, 1.86), mats.caseBack);
  back.position.set(x - side * 0.02, 1.87, zc);
  back.rotation.y = -side * Math.PI / 2;
  const glow = new THREE.Mesh(new THREE.PlaneGeometry(len * 0.98, 0.04), mats.glow);
  glow.position.set(cx, 2.78, zc);
  glow.rotation.x = Math.PI / 2;
  group.add(base, top, glass, back, glow);
  const shelfGeo = new THREE.BoxGeometry(depth * 0.9, 0.03, len * 0.98);
  for (const y of [1.45, 2.15]) {
    const shelf = new THREE.Mesh(shelfGeo, mats.caseGlass);
    shelf.position.set(cx, y, zc);
    group.add(shelf);
  }
  // copas doradas y cascos alternados en dos estantes
  const cupPts = [[0, 0], [0.09, 0], [0.09, 0.03], [0.03, 0.06], [0.025, 0.2], [0.08, 0.26], [0.12, 0.36], [0.13, 0.46], [0.12, 0.47], [0, 0.32]].map(([a, b]) => new THREE.Vector2(a, b));
  const cupGeo = new THREE.LatheGeometry(cupPts, 32);
  const n = Math.max(3, Math.floor(len / 1.4));
  let h = 0;
  for (const y of [0.9, 1.465, 2.165]) {
    for (let i = 0; i < n; i++) {
      const z = z0 + ((i + 0.5) / n) * (z1 - z0);
      const useHelmet = (i + Math.round(y * 10)) % 2 === 0 && helmets[h];
      if (useHelmet) {
        const hm = helmets[h++].clone();
        hm.scale.setScalar(1.45);
        hm.position.set(cx, y, z);
        hm.rotation.y = -side * Math.PI / 2;
        group.add(hm);
      } else {
        const cup = new THREE.Mesh(cupGeo, mats.gold);
        cup.position.set(cx, y, z);
        cup.scale.setScalar(y < 1 ? 1.3 : 0.9);
        group.add(cup);
      }
    }
  }
}

// Plataforma: disco con borde de bronce (la del centro gira).
function platform(mats, radius) {
  const g = new THREE.Group();
  const base = new THREE.Mesh(new THREE.CylinderGeometry(radius, radius + 0.08, 0.22, 64), mats.plinth);
  base.position.y = 0.11;
  const rim = new THREE.Mesh(new THREE.TorusGeometry(radius + 0.02, 0.025, 8, 80), mats.brass);
  rim.rotation.x = Math.PI / 2;
  rim.position.y = 0.22;
  const disc = new THREE.Mesh(new THREE.CylinderGeometry(radius - 0.06, radius - 0.06, 0.02, 64), mats.discTop);
  disc.position.y = 0.23;
  g.add(base, rim, disc);
  return g;
}

function plinth(mats, w, d) {
  const g = new THREE.Group();
  const base = new THREE.Mesh(new THREE.BoxGeometry(w, 0.2, d), mats.plinth);
  base.position.y = 0.1;
  // filete de bronce alrededor del borde (no sobre la tapa)
  const edge = new THREE.Mesh(new THREE.BoxGeometry(w + 0.04, 0.025, d + 0.04), mats.brass);
  edge.position.y = 0.17;
  g.add(base, edge);
  return g;
}

// Foco del techo con su cono de luz suave (sin sombras, salvo el del centro).
function spot(group, mats, from, to, color, intensity, angle, castShadow = false) {
  const light = new THREE.SpotLight(color, intensity, 22, angle, 0.55, 1.2);
  light.position.copy(from);
  light.target.position.copy(to);
  if (castShadow) {
    light.castShadow = true;
    light.shadow.mapSize.set(1024, 1024);
    light.shadow.bias = -0.0005;
  }
  group.add(light, light.target);
  const dir = to.clone().sub(from);
  const len = dir.length();
  const cone = new THREE.Mesh(new THREE.ConeGeometry(Math.tan(angle) * len * 0.8, len, 32, 1, true), mats.beam.clone());
  cone.position.copy(from).addScaledVector(dir, 0.5);
  cone.quaternion.setFromUnitVectors(new THREE.Vector3(0, -1, 0), dir.normalize());
  group.add(cone);
  const can = new THREE.Mesh(new THREE.CylinderGeometry(0.12, 0.16, 0.3, 16), mats.fixture);
  can.position.copy(from);
  can.quaternion.copy(cone.quaternion);
  group.add(can);
  return { light, cone, base: intensity };
}

// ---------- Todo junto ----------

export function buildMuseum(lib, { modernCar }) {
  const root = new THREE.Group();
  lib.room.add(root);
  const env = lib.env;
  const mats = {
    brass: std({ color: 0xd2a95c, metalness: 1, roughness: 0.25, envMap: env, envMapIntensity: 1.2 }),
    gold: std({ color: 0xe6bd5c, metalness: 1, roughness: 0.18, envMap: env, envMapIntensity: 1.6 }),
    velvet: std({ color: 0x7a0f1c, roughness: 0.9 }),
    walnut: std({ map: tex(woodCanvas({ seed: 71, base: '#3a2214', dark: '#1e1008', light: '#55321c' })), roughness: 0.35, envMap: env, envMapIntensity: 0.4 }),
    plinth: std({ color: 0x141112, roughness: 0.3, metalness: 0.2, envMap: env, envMapIntensity: 0.6 }),
    discTop: std({ map: tex(marbleCanvas({ base: '#2a2624', vein: [150, 140, 125], seed: 9 })), roughness: 0.2, envMap: env, envMapIntensity: 0.7 }),
    caseGlass: new THREE.MeshPhysicalMaterial({ color: 0xffffff, transparent: true, opacity: 0.1, roughness: 0.02, metalness: 0.1, envMap: env, envMapIntensity: 0.8, depthWrite: false }),
    caseBack: std({ color: 0x3a0c14, roughness: 0.95 }),
    glow: std({ color: 0xfff1d8, emissive: 0xffe2b0, emissiveIntensity: 2.2 }),
    beam: new THREE.MeshBasicMaterial({ color: 0xffdcae, map: tex(beamCanvas()), transparent: true, opacity: 0.04, blending: THREE.AdditiveBlending, depthWrite: false, side: THREE.DoubleSide, fog: false }),
    fixture: std({ color: 0x1a1a1a, metalness: 0.7, roughness: 0.4 }),
  };

  // piso de mármol oscuro pulido, paredes con zócalo de nogal y techo con vigas
  const floor = new THREE.Mesh(new THREE.PlaneGeometry(2 * SIDE_X, 30), std({ map: tex(marbleCanvas({ base: '#221d1a', vein: [62, 54, 46], seed: 3 }), [5, 7]), roughness: 0.14, metalness: 0.1, envMap: env, envMapIntensity: 0.55 }));
  floor.rotation.x = -Math.PI / 2;
  floor.position.set(0, 0, BACK_Z + 15);
  floor.receiveShadow = true;
  root.add(floor);
  const wallMat = std({ map: tex(wallCanvas(), [3, 1]), roughness: 0.9 });
  const back = new THREE.Mesh(new THREE.PlaneGeometry(2 * SIDE_X, HALL_H), wallMat);
  back.position.set(0, HALL_H / 2, BACK_Z);
  root.add(back);
  for (const s of [-1, 1]) {
    const w = new THREE.Mesh(new THREE.PlaneGeometry(30, HALL_H), wallMat);
    w.position.set(s * SIDE_X, HALL_H / 2, BACK_Z + 15);
    w.rotation.y = -s * Math.PI / 2;
    const wain = new THREE.Mesh(new THREE.BoxGeometry(0.06, 1.1, 30), mats.walnut);
    wain.position.set(s * (SIDE_X - 0.03), 0.55, BACK_Z + 15);
    root.add(w, wain);
  }
  const backWain = new THREE.Mesh(new THREE.BoxGeometry(2 * SIDE_X, 1.1, 0.06), mats.walnut);
  backWain.position.set(0, 0.55, BACK_Z + 0.03);
  root.add(backWain);
  const ceil = new THREE.Mesh(new THREE.PlaneGeometry(2 * SIDE_X, 30), std({ color: 0x15110f, roughness: 1 }));
  ceil.rotation.x = Math.PI / 2;
  ceil.position.set(0, HALL_H, BACK_Z + 15);
  root.add(ceil);
  const beamGeo = new THREE.BoxGeometry(2 * SIDE_X, 0.35, 0.3);
  for (let z = BACK_Z + 2; z < -3; z += 4) {
    const b = new THREE.Mesh(beamGeo, mats.walnut);
    b.position.set(0, HALL_H - 0.18, z);
    root.add(b);
  }

  // letrero dorado y fotos de época en la pared del fondo
  const title = new THREE.Mesh(new THREE.PlaneGeometry(11, 1.5), std({ map: tex(titleCanvas()), emissive: 0xffffff, emissiveMap: tex(titleCanvas(true)), emissiveIntensity: 0.9, roughness: 0.4 }));
  title.position.set(0, 5.0, BACK_Z + 0.05);
  root.add(title);
  const frameGeo = new THREE.BoxGeometry(1.5, 1.1, 0.06);
  const photoGeo = new THREE.PlaneGeometry(1.32, 0.94);
  const lampGeo = new THREE.BoxGeometry(0.8, 0.04, 0.12);
  for (let i = 0; i < 6; i++) {
    const x = -6.25 + i * 2.5;
    const f = new THREE.Mesh(frameGeo, mats.gold);
    f.position.set(x, 2.7, BACK_Z + 0.06);
    const ph = new THREE.Mesh(photoGeo, std({ map: tex(photoCanvas(i * 13 + 5)), roughness: 0.6 }));
    ph.position.set(x, 2.7, BACK_Z + 0.1);
    const lamp = new THREE.Mesh(lampGeo, mats.glow);
    lamp.position.set(x, 3.38, BACK_Z + 0.16);
    root.add(f, ph, lamp);
  }

  // estandartes de las décadas colgando del techo
  const bannerGeo = new THREE.PlaneGeometry(1.0, 3.5, 1, 8);
  bannerGeo.translate(0, -1.75, 0);
  const banners = [['1950', '#5a0f18'], ['1960', '#173d29'], ['1970', '#141414'], ['1980', '#3a0c14']].map(([d, col], i) => {
    const m = new THREE.Mesh(bannerGeo, std({ map: tex(bannerCanvas(d, col)), side: THREE.DoubleSide, roughness: 0.85 }));
    m.position.set([-7.6, -4.6, 4.6, 7.6][i], HALL_H - 0.4, -11.5);
    root.add(m);
    return m;
  });

  // los autos: el del centro en su plataforma giratoria, cuatro más en pedestales con cordón
  const turntable = platform(mats, 2.7);
  turntable.position.copy(CENTER);
  const spinner = new THREE.Group();
  spinner.position.y = 0.24;
  const hero = car1950(0xb3121e, 2);
  hero.scale.setScalar(1.05);
  spinner.add(hero);
  turntable.add(spinner);
  root.add(turntable);
  const ring = [];
  for (let i = 0; i < 10; i++) {
    const a = (i / 10) * Math.PI * 2;
    ring.push([CENTER.x + Math.cos(a) * 3.15, CENTER.z + Math.sin(a) * 3.15]);
  }
  // el cordón deja abierto el frente para no tapar la vista desde la estantería
  stanchions(root, mats, ring.slice(1, 9), false);
  plaque(root, mats, 0, CENTER.z + 3.4, 0, 1951, 'el primer campeonato');

  const shadowMat = new THREE.MeshBasicMaterial({ map: tex(shadowCanvas()), transparent: true, depthWrite: false });
  const placed = [
    { car: car1970(0x101010, 0xd9b46a, 5), x: -6.2, z: -9.5, rot: -1.05, year: 1972, line: 'la era de los alerones' },
    { car: car1980(0xf2f0ea, 0xc8102e, 1), x: 6.2, z: -9.5, rot: -2.09, year: 1988, line: 'turbo y precisión' },
    { car: car1960(0x174a2c, 7), x: -3.8, z: -15, rot: -0.75, year: 1965, line: 'el motor pasa atrás' },
    { car: modernCar(), x: 3.8, z: -15, rot: -2.39, year: 2008, line: 'aerodinámica moderna' },
  ];
  for (const p of placed) {
    const ped = plinth(mats, 6.2, 2.6);
    ped.position.set(p.x, 0, p.z);
    ped.rotation.y = p.rot;
    const sh = new THREE.Mesh(new THREE.PlaneGeometry(5.6, 2.2), shadowMat);
    sh.rotation.x = -Math.PI / 2;
    sh.position.y = 0.2;
    ped.add(sh);
    p.car.position.y = 0.2;
    ped.add(p.car);
    root.add(ped);
    // cordón al frente del pedestal y atril con la ficha
    const fwd = new THREE.Vector3(Math.cos(p.rot), 0, -Math.sin(p.rot));
    const sideV = new THREE.Vector3(-fwd.z, 0, fwd.x);
    const toCam = new THREE.Vector3(-p.x, 0, 4 - p.z).normalize();
    const front = sideV.dot(toCam) > 0 ? sideV : sideV.clone().negate();
    const c = new THREE.Vector3(p.x, 0, p.z).addScaledVector(front, 1.9);
    stanchions(root, mats, [-2.4, -0.8, 0.8, 2.4].map((k) => [c.x + fwd.x * k, c.z + fwd.z * k]), false);
    plaque(root, mats, c.x + front.x * 0.4, c.z + front.z * 0.4, Math.atan2(front.x, front.z), p.year, p.line);
  }
  const heroShadow = new THREE.Mesh(new THREE.PlaneGeometry(5.4, 2.1), shadowMat);
  heroShadow.rotation.x = -Math.PI / 2;
  heroShadow.position.y = 0.012;
  spinner.add(heroShadow);

  // vitrinas de pared con cascos clásicos y copas
  const helmets = HELMET_COLORS.map((c) => classicHelmet(c, mats));
  wallCase(root, mats, -SIDE_X, -3, -16.5, -1, helmets.slice(0, 3));
  wallCase(root, mats, SIDE_X, -3, -16.5, 1, helmets.slice(3));

  // focos: uno por auto, desde el techo
  const spots = [
    spot(root, mats, new THREE.Vector3(0, HALL_H - 0.4, CENTER.z + 2.5), new THREE.Vector3(0, 0.6, CENTER.z), 0xffe2bc, 120, 0.42, true),
    ...placed.map((p) => spot(root, mats, new THREE.Vector3(p.x * 0.8, HALL_H - 0.4, p.z + 2.6), new THREE.Vector3(p.x, 0.5, p.z), 0xffd9aa, 90, 0.4)),
  ];
  const fill = new THREE.HemisphereLight(0xffe6c8, 0x2a1d16, 0.6);
  const amb = new THREE.AmbientLight(0xffd8b0, 0.08);
  root.add(fill, amb);

  // el guía del museo, de traje oscuro, recorre la sala alrededor de la plataforma
  const guide = buildKeeper(0xc49a7c, 0x2a1d14, { shirt: 0x1b1f2a, trim: 0xf2efe6, pants: 0x1b1f2a, shoe: 0x141414, cap: false });
  root.add(guide.root);
  const walk = { s: 0, pause: 0, nextStop: 9 };

  const state = { nextShow: null, show: null };
  return {
    update(t, dt, onShow) {
      // la plataforma gira despacio (más rápido durante la presentación)
      spinner.rotation.y += dt * (state.show ? 0.35 : 0.12);
      for (const [i, b] of banners.entries()) b.rotation.y = Math.sin(t * 0.35 + i * 1.3) * 0.08;
      // guía: camina en círculo alrededor del cordón, a veces se detiene a mirar el auto
      const R = 3.75, speed = 0.55;
      if (walk.pause > 0) walk.pause -= dt;
      else {
        walk.s += speed * dt;
        if (walk.s > walk.nextStop) {
          walk.pause = 3 + Math.random() * 3;
          walk.nextStop = walk.s + 7 + Math.random() * 9;
        }
      }
      const a = walk.s / R + Math.PI * 0.15;
      const gx = CENTER.x + Math.cos(a) * R, gz = CENTER.z + Math.sin(a) * R;
      guide.root.position.set(gx, 0, gz);
      const walking = walk.pause <= 0;
      const facing = walking ? Math.atan2(-Math.sin(a), Math.cos(a)) : Math.atan2(CENTER.x - gx, CENTER.z - gz);
      guide.root.rotation.y = lerpAngle(guide.root.rotation.y, facing, Math.min(1, dt * 4));
      pose(guide.parts, walking ? (walk.s / 1.2) * Math.PI * 2 : 0, walking, t);

      // presentación: cada 50 s se atenúa la sala y un foco recorre los autos
      state.nextShow ??= t + 20;
      if (t > state.nextShow && !state.show) {
        state.show = { start: t };
        state.nextShow = t + 50;
        onShow?.(16);
      }
      let house = 1, focus = -1, k = 0;
      if (state.show) {
        k = t - state.show.start;
        const fade = Math.min(1, k / 1.5, Math.max(0, (16 - k) / 1.5));
        house = 1 - fade * 0.7;
        focus = k > 1.5 && k < 14.5 ? Math.floor((k - 1.5) / 2.6) % spots.length : -1;
        if (k > 16) state.show = null;
      }
      spots.forEach((s, i) => {
        const on = i === focus;
        const target = s.base * (on ? 2.2 : house);
        s.light.intensity += (target - s.light.intensity) * Math.min(1, dt * 4);
        s.cone.material.opacity += ((on ? 0.11 : 0.04 * house) - s.cone.material.opacity) * Math.min(1, dt * 4);
      });
      fill.intensity = 0.6 * house;
      mats.glow.emissiveIntensity = 2.2 * (0.35 + 0.65 * house);
      title.material.emissiveIntensity = 0.9 * (0.5 + 0.5 * house) + (state.show ? 0.4 * Math.sin(k * 2) ** 2 : 0);
    },
  };
}

const lerpAngle = (a, b, k) => {
  const d = ((b - a + Math.PI * 3) % (Math.PI * 2)) - Math.PI;
  return a + d * k;
};

// Postura del guía: paso tranquilo con las manos atrás, o parado mirando.
function pose(parts, ph, walking, t) {
  const { hips, torso, head, armL, armR, legL, legR } = parts;
  const sw = walking ? 1 : 0;
  hips.position.y = 0.975 + Math.abs(Math.cos(ph)) * 0.02 * sw;
  hips.rotation.y = Math.sin(ph) * 0.05 * sw;
  torso.rotation.x = 0.04;
  torso.rotation.y = -Math.sin(ph) * 0.06 * sw;
  legL.hip.rotation.x = -Math.sin(ph) * 0.38 * sw;
  legR.hip.rotation.x = Math.sin(ph) * 0.38 * sw;
  legL.knee.rotation.x = sw * 0.7 * Math.max(0, Math.sin(ph + 1.7)) + 0.05;
  legR.knee.rotation.x = sw * 0.7 * Math.max(0, Math.sin(ph + 1.7 + Math.PI)) + 0.05;
  legL.ankle.rotation.x = legR.ankle.rotation.x = 0;
  // manos tomadas en la espalda
  for (const [arm, s] of [[armL, 1], [armR, -1]]) {
    arm.shoulder.rotation.set(0.45, 0, s * 0.22);
    arm.elbow.rotation.x = -1.45;
  }
  head.rotation.y = walking ? Math.sin(t * 0.4) * 0.25 : Math.sin(t * 0.6) * 0.15;
  head.rotation.x = walking ? -0.05 : 0.08;
}
