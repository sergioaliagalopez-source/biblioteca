// Escena 3D: una biblioteca de madera, cálida y silenciosa, con tus libros en la estantería central.
import * as THREE from 'three';
import { RoomEnvironment } from 'three/addons/environments/RoomEnvironment.js';
import { spineCanvas, plaqueCanvas, decorSpineCanvas, paintingCanvas, dustSprite, seeded, hashStr, PALETTE, clamp } from './textures.js';
import {
  BC, FRONT_Z, tex, computeBays, SCENES, sceneMaterials, pagesMaterial, LIVERIES,
  buildF1Car, buildHelmet, buildFramedSuit,
} from './scenes.js';
import { checkerCanvas, wheelScreenCanvas } from './textures.js';
import {
  RACKET_LOOKS, buildRacket, buildSilverCup, buildTrophyCase, buildJumboBall, buildRacketFrame, buildBallCans, buildClayJar, buildPoster,
} from './tennis.js';
import { classicHelmet, HELMET_COLORS, VINTAGE, buildOldPhoto } from './museum.js';
import { mergeStatic } from './batch.js';

const ease = {
  out: (t) => 1 - Math.pow(1 - t, 3),
  inOut: (t) => (t < 0.5 ? 4 * t * t * t : 1 - Math.pow(-2 * t + 2, 3) / 2),
};

export class Library3D {
  constructor(canvas, handlers) {
    this.canvas = canvas;
    this.handlers = handlers;
    this.renderer = new THREE.WebGLRenderer({ canvas, antialias: true, powerPreference: 'high-performance' });
    // Resolución: hasta 1,5× (más no se nota en la estantería y pesa mucho); baja sola si la PC no da abasto.
    this.maxRatio = Math.min(window.devicePixelRatio || 1, 1.5);
    this.ratio = this.maxRatio;
    this.renderer.setPixelRatio(this.ratio);
    this.renderer.toneMapping = THREE.ACESFilmicToneMapping;
    this.renderer.toneMappingExposure = 1.1;
    this.renderer.shadowMap.enabled = true;
    this.renderer.shadowMap.type = THREE.PCFSoftShadowMap;
    // Las sombras se recalculan cuando algo cambia (y unas pocas veces por segundo), no en cada cuadro.
    this.renderer.shadowMap.autoUpdate = false;
    this.shadowDirty = true;
    this.frame = 0;
    this.lastActive = performance.now();
    this.lastFrame = 0;
    this.slowAvg = 0;
    this.fastFrames = 0;

    this.scene = new THREE.Scene();
    this.scene.background = new THREE.Color(0x0b0806);
    this.scene.fog = new THREE.Fog(0x0b0806, 6, 14);
    this.camera = new THREE.PerspectiveCamera(42, 1, 0.05, 40);

    const pmrem = new THREE.PMREMGenerator(this.renderer);
    this.env = pmrem.fromScene(new RoomEnvironment(), 0.04).texture;

    this.mouse = new THREE.Vector2();
    this.ndc = new THREE.Vector2(9, 9);
    this.pointer = { x: 0, y: 0 };
    this.maxDist = 4.1;
    this.minDist = 1.3;
    this.dist = this.targetDist = this.maxDist;
    this.cam = { x: 0, y: 1.66 };
    this.tweens = [];
    this.clock = new THREE.Clock();
    this.userBooks = [];
    this.meshById = new Map();
    this.hovered = null;
    this.raycaster = new THREE.Raycaster();
    this.dynamic = [];
    this.paused = false;
    this.frozen = false;

    this.unitBox = new THREE.BoxGeometry(1, 1, 1);
    this.pagesMat = pagesMaterial();
    this.decorTex = tex(decorSpineCanvas());
    this.spinners = [];

    this.shelf = new THREE.Group();
    this.shelf.position.set(0, 0, BC.z);
    this.scene.add(this.shelf);
    this.buildTheme(handlers.theme || 'clasica');

    this.bindEvents();
    this.resize();
    this.loop = this.loop.bind(this);
    requestAnimationFrame(this.loop);
  }

  // ---------- Fondos (ambientes) ----------

  // Arma la sala del fondo elegido: materiales, muebles, paisaje, luces y partículas.
  buildTheme(id) {
    const def = SCENES[id] ? id : 'clasica';
    this.themeId = def;
    this.theme = SCENES[def];
    this.fx = {};
    this.room = new THREE.Group();
    this.scene.add(this.room);
    this.mat = sceneMaterials(def, this.env);
    // Los libros decorativos son algo más apagados para que los tuyos destaquen.
    this.decorMats = this.theme.palette.map((c) => new THREE.MeshStandardMaterial({ color: new THREE.Color(c).multiplyScalar(this.theme.paletteGain), map: this.decorTex, roughness: 0.8 }));
    this.scene.background = new THREE.Color(this.theme.background);
    this.scene.fog = new THREE.Fog(...this.theme.fog);
    this.renderer.toneMappingExposure = this.theme.exposure;
    // los fondos con paisaje lejano (el estadio) necesitan ver más lejos
    this.camera.far = this.theme.far ?? 40;
    this.camera.updateProjectionMatrix();
    this.theme.build(this);
    // Junta las piezas fijas que comparten material: muchas menos llamadas de dibujo por cuadro.
    mergeStatic(this.room, { keep: new Set([this.unitBox]) });
    this.shadowDirty = true;
    this.buildParticles(this.theme.particles);
  }

  // Cambia de fondo y vuelve a acomodar los libros en la nueva estantería.
  setTheme(id) {
    if (id === this.themeId || this.flying) return;
    this.wake();
    this.disposeTheme();
    this.buildTheme(id);
    if (this.last) this.setBooks(...this.last);
    // Compila los sombreadores del fondo nuevo mientras la cortina está puesta (así no se traba al aparecer).
    this.ready = this.renderer.compileAsync ? this.renderer.compileAsync(this.scene, this.camera).catch(() => {}) : Promise.resolve();
  }

  disposeTheme() {
    this.clearDynamic();
    this.scene.remove(this.room);
    const mats = new Set([...Object.values(this.mat), ...this.decorMats]);
    if (this.plaqueMat) mats.add(this.plaqueMat);
    const geos = new Set();
    this.room.traverse((o) => {
      if (o.isLight) o.dispose(); // libera el mapa de sombras
      if (o.geometry && o.geometry !== this.unitBox) geos.add(o.geometry);
      if (o.material) (Array.isArray(o.material) ? o.material : [o.material]).forEach((m) => mats.add(m));
    });
    geos.forEach((g) => g.dispose());
    for (const m of mats) {
      if (m.userData?.shared) continue;
      for (const key of ['map', 'emissiveMap', 'roughnessMap']) if (m[key] && m[key] !== this.decorTex) m[key].dispose();
      m.dispose();
    }
    this.room = null;
  }

  // Acerca la cámara desde un poco más lejos (al entrar a un fondo nuevo).
  dollyIn() {
    this.dist = this.maxDist * 1.35;
  }

  caseStructure(w, isMain, { back = true } = {}) {
    const g = new THREE.Group();
    const { h, d, side, shelfT, rows, divider, base } = BC;
    const box = (sx, sy, sz, x, y, z, m = this.mat.wood) => {
      const mesh = new THREE.Mesh(this.unitBox, m);
      mesh.scale.set(sx, sy, sz);
      mesh.position.set(x, y, z);
      mesh.receiveShadow = isMain;
      g.add(mesh);
      return mesh;
    };
    box(side, h, d, -w / 2 + side / 2, h / 2, 0);
    box(side, h, d, w / 2 - side / 2, h / 2, 0);
    // Sin fondo, la estantería deja ver el ventanal de atrás (mansión).
    if (back) box(w, h, 0.02, 0, h / 2, -d / 2 + 0.01, this.mat.woodDark);
    box(w, base, d, 0, base / 2, 0);
    box(w + 0.04, 0.08, d + 0.04, 0, 0.04, 0.01, back ? this.mat.woodDark : this.mat.panel);
    box(w, 0.04, d, 0, h - 0.02, 0);
    box(w + 0.12, 0.14, d + 0.06, 0, h + 0.07, 0.02);
    box(w + 0.2, 0.04, d + 0.1, 0, h + 0.16, 0.03);

    const innerW = w - 2 * side;
    const bayList = computeBays(w);
    for (const [i, [x0, x1]] of bayList.entries()) {
      const bayW = x1 - x0;
      if (i > 0) box(divider, h - base, d - 0.02, x0 - divider / 2, base + (h - base) / 2, 0.005);
      // Puertas del mueble bajo, con pomo de bronce.
      const cx = x0 + bayW / 2;
      box(bayW - 0.1, 0.4, 0.016, cx, 0.3, d / 2 + 0.008, this.mat.panel);
      const knob = new THREE.Mesh(new THREE.SphereGeometry(0.016, 12, 10), this.mat.brass);
      knob.position.set(cx, 0.3, d / 2 + 0.03);
      g.add(knob);
    }
    for (const y of rows) {
      box(innerW, shelfT, d - 0.02, 0, y - shelfT / 2, 0.01);
      box(innerW, 0.03, 0.014, 0, y - 0.014, d / 2 + 0.005);
    }
    g.userData.bays = bayList;

    if (isMain) {
      // Placa de bronce con el nombre de la categoría.
      this.plaqueMat = new THREE.MeshStandardMaterial({ roughness: 0.32, metalness: 0.6, envMap: this.env, envMapIntensity: 0.6 });
      const plaque = new THREE.Mesh(new THREE.PlaneGeometry(0.95, 0.139), this.plaqueMat);
      plaque.position.set(0, 0.585, d / 2 + 0.003);
      g.add(plaque);
      // Lámparas de cuadro sobre cada tramo.
      for (const [a, b] of bayList) {
        const x = (a + b) / 2;
        const bar = new THREE.Mesh(new THREE.CylinderGeometry(0.028, 0.028, 0.62, 16), this.mat.brass);
        bar.rotation.z = Math.PI / 2;
        bar.position.set(x, h - 0.06, d / 2 + 0.12);
        g.add(bar);
        const glow = new THREE.Mesh(new THREE.BoxGeometry(0.58, 0.008, 0.03), this.mat.glow);
        glow.position.set(x, h - 0.088, d / 2 + 0.12);
        g.add(glow);
        const arm = new THREE.Mesh(new THREE.CylinderGeometry(0.008, 0.008, 0.13, 8), this.mat.brass);
        arm.rotation.x = Math.PI / 2;
        arm.position.set(x, h - 0.04, d / 2 + 0.06);
        g.add(arm);
      }
    }
    return g;
  }

  fillDecorBooks(group, bays, seed, palette = PALETTE) {
    const rnd = seeded(seed);
    const mat = new THREE.MeshStandardMaterial({ map: this.decorTex, roughness: 0.75 });
    const inst = new THREE.InstancedMesh(this.unitBox, mat, 600);
    const m4 = new THREE.Matrix4(), q = new THREE.Quaternion(), p = new THREE.Vector3(), s = new THREE.Vector3(), col = new THREE.Color();
    let i = 0;
    for (const [x0, x1] of bays) {
      for (const y of BC.rows) {
        let x = x0 + 0.01;
        while (i < 600) {
          const t = 0.035 + rnd() * 0.065, hh = 0.34 + rnd() * 0.15, dd = 0.27 + rnd() * 0.08;
          if (x + t > x1 - 0.01) break;
          if (rnd() < 0.035) { x += 0.06 + rnd() * 0.14; continue; }
          p.set(x + t / 2, y + hh / 2, BC.d / 2 - 0.03 - dd / 2);
          s.set(t, hh, dd);
          m4.compose(p, q, s);
          inst.setMatrixAt(i, m4);
          col.set(palette[Math.floor(rnd() * palette.length)]).multiplyScalar(0.55 + rnd() * 0.35);
          inst.setColorAt(i, col);
          i++;
          x += t + 0.002;
        }
      }
    }
    inst.count = i;
    group.add(inst);
  }

  buildLadder(x) {
    const g = new THREE.Group();
    const bottom = new THREE.Vector3(0, 0, FRONT_Z + 0.78);
    const top = new THREE.Vector3(0, 2.98, FRONT_Z + 0.08);
    const dir = top.clone().sub(bottom);
    const len = dir.length();
    const ang = Math.atan2(dir.z, dir.y);
    for (const ox of [-0.21, 0.21]) {
      const rail = new THREE.Mesh(new THREE.BoxGeometry(0.045, len, 0.07), this.mat.panel);
      rail.position.copy(bottom).add(top).multiplyScalar(0.5);
      rail.position.x = ox;
      rail.rotation.x = ang;
      rail.castShadow = true;
      g.add(rail);
      const hook = new THREE.Mesh(new THREE.TorusGeometry(0.03, 0.008, 8, 16, Math.PI), this.mat.brass);
      hook.position.set(ox, 2.99, FRONT_Z + 0.07);
      hook.rotation.y = Math.PI / 2;
      g.add(hook);
      const wheel = new THREE.Mesh(new THREE.CylinderGeometry(0.035, 0.035, 0.02, 16), this.mat.brass);
      wheel.rotation.z = Math.PI / 2;
      wheel.position.set(ox, 0.035, bottom.z);
      g.add(wheel);
    }
    for (let k = 1; k < 11; k++) {
      const p = bottom.clone().lerp(top, k / 11);
      const rung = new THREE.Mesh(new THREE.CylinderGeometry(0.014, 0.014, 0.42, 10), this.mat.brass);
      rung.rotation.z = Math.PI / 2;
      rung.position.copy(p);
      g.add(rung);
    }
    g.position.x = x;
    this.room.add(g);
  }

  // Partículas en el aire: polvo dorado en la luz o, en el salón de jazz, humo que sube lento.
  buildParticles(cfg) {
    this.dust = null;
    if (!cfg) return;
    const n = cfg.count;
    const pos = new Float32Array(n * 3);
    this.dustSeed = new Float32Array(n);
    const rnd = seeded(8);
    for (let i = 0; i < n; i++) {
      pos[i * 3] = (rnd() - 0.5) * 5;
      pos[i * 3 + 1] = 0.2 + rnd() * 3.2;
      pos[i * 3 + 2] = FRONT_Z + 0.1 + rnd() * 3.6;
      this.dustSeed[i] = rnd() * 100;
    }
    const geo = new THREE.BufferGeometry();
    geo.setAttribute('position', new THREE.BufferAttribute(pos, 3));
    const mat = new THREE.PointsMaterial({
      size: cfg.size, map: tex(dustSprite()), transparent: true, depthWrite: false,
      blending: cfg.smoke ? THREE.NormalBlending : THREE.AdditiveBlending, color: cfg.color, opacity: cfg.opacity,
    });
    this.dust = new THREE.Points(geo, mat);
    this.dust.userData.rise = cfg.rise;
    this.room.add(this.dust);
  }

  // ---------- Libros del usuario ----------

  bookDims(book) {
    const r = seeded(hashStr(book.id));
    const h = 0.43 + r() * 0.06;
    const d = clamp(h * (book.aspect || 0.66), 0.24, 0.37);
    const t = clamp(0.035 + (book.pageCount || 200) * 0.00028, 0.045, 0.16);
    return { t, h, d };
  }

  makeBookMesh(book, dims) {
    const spineTex = tex(spineCanvas({ title: book.title, author: book.author, color: book.color, thickness: dims.t, height: dims.h, seed: hashStr(book.id) }));
    const spine = new THREE.MeshStandardMaterial({ map: spineTex, roughness: 0.55, envMap: this.env, envMapIntensity: 0.25 });
    const cloth = new THREE.MeshStandardMaterial({ color: book.color, roughness: 0.75 });
    const cover = new THREE.MeshStandardMaterial({ color: book.coverUrl ? 0xffffff : book.color, roughness: 0.5, envMap: this.env, envMapIntensity: 0.2 });
    const geo = new THREE.BoxGeometry(dims.t, dims.h, dims.d);
    // Caras: +x tapa, -x contratapa, +y/-y cantos, +z lomo, -z canto delantero.
    const mesh = new THREE.Mesh(geo, [cover, cloth, this.pagesMat, this.pagesMat, spine, this.pagesMat]);
    mesh.castShadow = true;
    mesh.receiveShadow = true;
    this.dynamic.push(geo, spine, cloth, cover, spineTex);
    if (book.coverUrl) {
      new THREE.TextureLoader().load(book.coverUrl, (t) => {
        t.colorSpace = THREE.SRGBColorSpace;
        t.anisotropy = 8;
        cover.map = t;
        cover.needsUpdate = true;
        this.dynamic.push(t);
      });
    }
    return mesh;
  }

  setBooks(books, label) {
    if (this.flying) {
      this.pending = [books, label];
      return;
    }
    this.last = [books, label];
    this.clearDynamic();
    const group = new THREE.Group();
    this.dynamicGroup = group;
    this.shelf.add(group);

    // Primero la balda a la altura de los ojos, luego la de abajo, la de arriba y la más baja;
    // en cada una, el tramo central (el mejor iluminado) antes que los laterales.
    // En el teléfono se ve un tramo a la vez, así que se llena el central entero antes de pasar a otro.
    const mid = Math.floor(this.mainBays.length / 2);
    const bayOrder = [this.mainBays[mid], ...this.mainBays.filter((_, i) => i !== mid)];
    const rowOrder = [BC.rows[2], BC.rows[1], BC.rows[3], BC.rows[0]];
    const segments = [];
    const seg = (y, [a, b]) => segments.push({ y, x0: a + 0.015, x1: b - 0.015 });
    if (this.phone) for (const bay of bayOrder) for (const y of rowOrder) seg(y, bay);
    else for (const y of rowOrder) for (const bay of bayOrder) seg(y, bay);
    this.decorUsed = {};
    let si = 0;
    let x = segments[0].x0;
    for (const book of books) {
      const dims = this.bookDims(book);
      while (si < segments.length && x + dims.t > segments[si].x1) {
        si++;
        if (si < segments.length) x = segments[si].x0;
      }
      if (si >= segments.length) break;
      const mesh = this.makeBookMesh(book, dims);
      mesh.position.set(x + dims.t / 2, segments[si].y + dims.h / 2, BC.d / 2 - 0.025 - dims.d / 2);
      mesh.userData = { book, base: mesh.position.clone(), pull: 0 };
      group.add(mesh);
      this.userBooks.push(mesh);
      this.meshById.set(book.id, mesh);
      x += dims.t + 0.003;
    }

    const rnd = seeded(hashStr(label) + books.length * 7);
    if (books.length && si < segments.length && x + 0.08 < segments[si].x1) {
      this.addItem(this.bookend(), x + 0.03, segments[si].y);
      x += 0.1;
    }
    for (let k = si; k < segments.length; k++) {
      const seg = segments[k];
      const start = k === si && books.length ? x + 0.04 : seg.x0;
      this.decorate(seg, start, rnd);
    }
    this.setPlaque(label);
    mergeStatic(group, {
      skip: (o) => o.userData.book || this.spinners.includes(o),
      keep: new Set([this.unitBox]),
      track: this.dynamic,
    });
    this.shadowDirty = true;
  }

  clearDynamic() {
    if (this.dynamicGroup) this.shelf.remove(this.dynamicGroup);
    this.dynamic.forEach((r) => r.dispose());
    this.dynamic = [];
    this.userBooks = [];
    this.meshById.clear();
    this.hovered = null;
    this.spinners = [];
  }

  setPlaque(label) {
    const t = tex(plaqueCanvas(label, this.theme.plaque));
    if (this.plaqueMat.map) this.plaqueMat.map.dispose();
    this.plaqueMat.map = t;
    this.plaqueMat.needsUpdate = true;
  }

  // ---------- Decoración de los huecos ----------

  addItem(obj, x, y) {
    obj.position.x = x;
    obj.position.y = y;
    obj.position.z = obj.position.z || 0.02;
    this.dynamicGroup.add(obj);
  }

  decorate(seg, start, rnd) {
    const avail = seg.x1 - start;
    if (avail < 0.26) return;
    // Cada fondo tiene sus objetos; sobre todo libros, y los objetos aparecen pocas veces para no recargar.
    // Algunos fondos tienen una pieza protagonista que va en el primer hueco (el tocadiscos del jazz).
    const { kinds, caps, first } = this.theme.decor;
    const pick = () => {
      if (first && !this.decorUsed[first] && avail > 0.5) {
        this.decorUsed[first] = 1;
        return first;
      }
      const k = kinds[Math.floor(rnd() * kinds.length)];
      if ((this.decorUsed[k] || 0) >= (caps[k] ?? 99)) return 'old';
      this.decorUsed[k] = (this.decorUsed[k] || 0) + 1;
      return k;
    };
    const items = [];
    let used = 0;
    const count = avail > 0.95 ? 2 : 1;
    for (let i = 0; i < count; i++) {
      const it = this.makeDecor(pick(), rnd, avail / count - 0.06);
      if (!it) continue;
      items.push(it);
      used += it.userData.w;
    }
    if (!items.length) return;
    const gap = (avail - used) / (items.length + 1);
    let x = start + gap;
    for (const it of items) {
      this.addItem(it, x + it.userData.w / 2, seg.y);
      x += it.userData.w + gap;
    }
  }

  makeDecor(kind, rnd, maxW) {
    const g = new THREE.Group();
    const decorMat = () => this.decorMats[Math.floor(rnd() * this.decorMats.length)];
    if (kind === 'stack' && maxW > 0.42) {
      let y = 0;
      const n = 3 + Math.floor(rnd() * 3);
      for (let i = 0; i < n; i++) {
        const len = 0.3 + rnd() * 0.08, th = 0.035 + rnd() * 0.03;
        const m = new THREE.Mesh(this.unitBox, decorMat());
        m.scale.set(len, th, 0.22 + rnd() * 0.06);
        m.position.set((rnd() - 0.5) * 0.03, y + th / 2, 0);
        m.rotation.y = (rnd() - 0.5) * 0.14;
        m.castShadow = true;
        g.add(m);
        y += th;
      }
      if (rnd() < 0.6) {
        const orb = new THREE.Mesh(new THREE.SphereGeometry(0.035, 20, 16), this.mat.brass);
        orb.position.set(0.05, y + 0.035, 0);
        g.add(orb);
        this.dynamic.push(orb.geometry);
      }
      g.userData.w = 0.4;
      return g;
    }
    if (kind === 'globe' && maxW > 0.32) {
      const base = new THREE.Mesh(new THREE.CylinderGeometry(0.07, 0.09, 0.03, 24), this.mat.brass);
      base.position.y = 0.015;
      const stem = new THREE.Mesh(new THREE.CylinderGeometry(0.01, 0.012, 0.13, 10), this.mat.brass);
      stem.position.y = 0.09;
      const sphere = new THREE.Mesh(new THREE.SphereGeometry(0.12, 40, 28), this.mat.globe);
      sphere.position.y = 0.28;
      sphere.rotation.z = 0.41;
      sphere.castShadow = true;
      const ring = new THREE.Mesh(new THREE.TorusGeometry(0.135, 0.006, 8, 48, Math.PI * 1.2), this.mat.brass);
      ring.position.y = 0.28;
      ring.rotation.z = -Math.PI / 2 + 0.41 - 0.6;
      g.add(base, stem, sphere, ring);
      this.dynamic.push(base.geometry, stem.geometry, sphere.geometry, ring.geometry);
      g.userData.w = 0.3;
      return g;
    }
    if (kind === 'vase' && maxW > 0.2) {
      const pts = [[0, 0], [0.05, 0], [0.07, 0.03], [0.088, 0.1], [0.082, 0.17], [0.05, 0.21], [0.044, 0.225], [0.05, 0.235], [0, 0.245]].map(([a, b]) => new THREE.Vector2(a, b));
      const vase = new THREE.Mesh(new THREE.LatheGeometry(pts, 40), this.mat.porcelain);
      vase.castShadow = true;
      const knob = new THREE.Mesh(new THREE.SphereGeometry(0.014, 12, 10), this.mat.brass);
      knob.position.y = 0.255;
      g.add(vase, knob);
      this.dynamic.push(vase.geometry, knob.geometry);
      g.userData.w = 0.2;
      return g;
    }
    if (kind === 'candles' && maxW > 0.24) {
      for (const ox of [-0.06, 0.06]) {
        const pts = [[0, 0], [0.045, 0], [0.045, 0.01], [0.015, 0.03], [0.012, 0.16], [0.03, 0.18], [0.02, 0.19], [0, 0.19]].map(([a, b]) => new THREE.Vector2(a, b));
        const stick = new THREE.Mesh(new THREE.LatheGeometry(pts, 24), this.mat.brass);
        const h = 0.1 + rnd() * 0.06;
        const candle = new THREE.Mesh(new THREE.CylinderGeometry(0.012, 0.012, h, 12), this.mat.candle);
        candle.position.y = 0.19 + h / 2;
        const flame = new THREE.Mesh(new THREE.SphereGeometry(0.006, 8, 8), this.mat.flame);
        flame.scale.y = 2;
        flame.position.y = 0.19 + h + 0.012;
        const grp = new THREE.Group();
        grp.add(stick, candle, flame);
        grp.position.x = ox;
        g.add(grp);
        this.dynamic.push(stick.geometry, candle.geometry, flame.geometry);
      }
      g.userData.w = 0.24;
      return g;
    }
    if (kind === 'frame' && maxW > 0.26) {
      const frame = new THREE.Mesh(new THREE.BoxGeometry(0.22, 0.28, 0.02), this.mat.brass);
      const ptex = tex(paintingCanvas(Math.floor(rnd() * 1000)));
      const pmat = new THREE.MeshStandardMaterial({ map: ptex, roughness: 0.8 });
      const pic = new THREE.Mesh(new THREE.PlaneGeometry(0.17, 0.23), pmat);
      pic.position.z = 0.0105;
      const fg = new THREE.Group();
      fg.add(frame, pic);
      fg.rotation.x = -0.14;
      fg.position.set(0, 0.14, -0.06);
      g.add(fg);
      this.dynamic.push(frame.geometry, pic.geometry, ptex, pmat);
      g.userData.w = 0.24;
      return g;
    }
    if (kind === 'record' && maxW > 0.44) {
      // Gramófono de nogal: vinilo girando, brazo y una gran bocina de bronce.
      const base = new THREE.Mesh(this.unitBox, this.mat.panel);
      base.scale.set(0.42, 0.08, 0.32);
      base.position.y = 0.04;
      base.castShadow = true;
      const platter = new THREE.Mesh(new THREE.CylinderGeometry(0.135, 0.135, 0.008, 48), [this.mat.woodDark, this.mat.vinyl, this.mat.woodDark]);
      platter.position.set(-0.05, 0.085, 0);
      const spindle = new THREE.Mesh(new THREE.CylinderGeometry(0.004, 0.004, 0.02, 8), this.mat.brass);
      spindle.position.set(-0.05, 0.095, 0);
      const pivot = new THREE.Mesh(new THREE.CylinderGeometry(0.018, 0.022, 0.03, 16), this.mat.brass);
      pivot.position.set(0.15, 0.095, -0.1);
      const arm = new THREE.Mesh(new THREE.CylinderGeometry(0.004, 0.004, 0.24, 8), this.mat.brass);
      arm.rotation.z = Math.PI / 2;
      arm.rotation.y = -0.55;
      arm.position.set(0.05, 0.11, -0.04);
      const knob = new THREE.Mesh(new THREE.SphereGeometry(0.012, 10, 8), this.mat.brass);
      knob.position.set(0.17, 0.085, 0.13);
      // bocina: un cono que se abre como una flor, apoyado en un codo junto al brazo
      const prof = [];
      for (let i = 0; i <= 16; i++) {
        const y = (i / 16) * 0.3;
        prof.push(new THREE.Vector2(0.012 + Math.pow(i / 16, 3.2) * 0.15, y));
      }
      const horn = new THREE.Mesh(new THREE.LatheGeometry(prof, 40), this.mat.brass);
      horn.material.side = THREE.DoubleSide;
      horn.position.set(0.15, 0.11, -0.1);
      horn.rotation.set(0.55, 0, 0.25);
      horn.castShadow = true;
      g.add(base, platter, spindle, pivot, arm, knob, horn);
      this.spinners.push(platter);
      this.dynamic.push(platter.geometry, spindle.geometry, pivot.geometry, arm.geometry, knob.geometry, horn.geometry);
      g.userData.w = 0.44;
      return g;
    }
    // ---- Memorabilia de carreras (Paddock Club) ----
    const livery = () => LIVERIES[(this.decorUsed.livery = ((this.decorUsed.livery ?? -1) + 1) % LIVERIES.length)];
    if (kind === 'helmet' && maxW > 0.24) {
      const h = buildHelmet(livery(), this.dynamic, this.env);
      h.rotation.y = (rnd() - 0.5) * 0.9;
      g.add(h);
      g.userData.w = 0.24;
      return g;
    }
    if (kind === 'modelcar' && maxW > 0.46) {
      // Auto a escala sobre una base, dentro de una vitrina de acrílico.
      const car = buildF1Car(livery(), this.dynamic);
      car.scale.setScalar(0.075);
      car.position.y = 0.035;
      car.rotation.y = 0.5 + (rnd() - 0.5) * 0.3;
      const base = new THREE.Mesh(this.unitBox, this.mat.woodDark);
      base.scale.set(0.44, 0.035, 0.24);
      base.position.y = 0.0175;
      const caseBox = new THREE.Mesh(this.unitBox, this.mat.acrylic);
      caseBox.scale.set(0.44, 0.13, 0.24);
      caseBox.position.y = 0.035 + 0.065;
      g.add(base, car, caseBox);
      g.userData.w = 0.46;
      return g;
    }
    if (kind === 'trophy' && maxW > 0.2) {
      // Copa dorada con asas.
      const pts = [[0, 0], [0.05, 0], [0.05, 0.02], [0.02, 0.04], [0.015, 0.11], [0.04, 0.13], [0.065, 0.17], [0.075, 0.24], [0.07, 0.25], [0, 0.18]].map(([a, b]) => new THREE.Vector2(a, b));
      const cup = new THREE.Mesh(new THREE.LatheGeometry(pts, 40), this.mat.gold);
      cup.position.y = 0.05;
      const base = new THREE.Mesh(this.unitBox, this.mat.woodDark);
      base.scale.set(0.11, 0.05, 0.11);
      base.position.y = 0.025;
      const handleGeo = new THREE.TorusGeometry(0.035, 0.006, 8, 20, Math.PI * 1.2);
      for (const s of [-1, 1]) {
        const handle = new THREE.Mesh(handleGeo, this.mat.gold);
        handle.position.set(s * 0.075, 0.25, 0);
        handle.rotation.z = s > 0 ? -1.1 : Math.PI + 1.1 - Math.PI * 0.2;
        g.add(handle);
      }
      cup.castShadow = true;
      g.add(base, cup);
      this.dynamic.push(cup.geometry, handleGeo);
      g.userData.w = 0.2;
      return g;
    }
    if (kind === 'wheel' && maxW > 0.32) {
      // Volante de carreras en su soporte, con la pantalla encendida.
      const wheel = new THREE.Group();
      const body = new THREE.Mesh(this.unitBox, this.mat.wood);
      body.scale.set(0.24, 0.13, 0.035);
      const gripGeo = new THREE.CylinderGeometry(0.022, 0.022, 0.13, 12);
      for (const s of [-1, 1]) {
        const grip = new THREE.Mesh(gripGeo, this.mat.rubber);
        grip.position.set(s * 0.135, -0.005, 0);
        wheel.add(grip);
      }
      const screenTex = tex(wheelScreenCanvas());
      const screenMat = new THREE.MeshStandardMaterial({ map: screenTex, emissive: 0xffffff, emissiveMap: screenTex, emissiveIntensity: 0.9 });
      const screen = new THREE.Mesh(new THREE.PlaneGeometry(0.11, 0.055), screenMat);
      screen.position.z = 0.019;
      const btnGeo = new THREE.CylinderGeometry(0.009, 0.009, 0.01, 12);
      [[-0.085, 0.035, 0xe33], [0.085, 0.035, 0xf4d000], [-0.085, -0.04, 0x36f], [0.085, -0.04, 0x1ec31e]].forEach(([x, y, col]) => {
        const m = new THREE.MeshStandardMaterial({ color: col, roughness: 0.4 });
        const b = new THREE.Mesh(btnGeo, m);
        b.rotation.x = Math.PI / 2;
        b.position.set(x, y, 0.02);
        wheel.add(b);
        this.dynamic.push(m);
      });
      wheel.add(body, screen);
      wheel.position.set(0, 0.17, 0);
      wheel.rotation.x = -0.25;
      const stand = new THREE.Mesh(this.unitBox, this.mat.brass);
      stand.scale.set(0.02, 0.12, 0.02);
      stand.position.y = 0.06;
      const foot = new THREE.Mesh(this.unitBox, this.mat.woodDark);
      foot.scale.set(0.16, 0.015, 0.1);
      foot.position.y = 0.0075;
      g.add(foot, stand, wheel);
      this.dynamic.push(gripGeo, btnGeo, screen.geometry, screenTex, screenMat);
      g.userData.w = 0.32;
      return g;
    }
    if (kind === 'tyres' && maxW > 0.2) {
      // Neumáticos en miniatura apilados, con su franja de color.
      const tyreGeo = new THREE.CylinderGeometry(0.075, 0.075, 0.06, 28);
      const ringGeo = new THREE.TorusGeometry(0.055, 0.004, 6, 28);
      [this.mat.red, this.mat.gold, this.mat.porcelain].forEach((stripeMat, i) => {
        const t = new THREE.Mesh(tyreGeo, this.mat.rubber);
        t.position.set(i === 2 ? 0.05 : 0, 0.03 + (i === 2 ? 0 : i * 0.061), i === 2 ? 0.02 : 0);
        if (i === 2) t.position.x = 0.09;
        const r = new THREE.Mesh(ringGeo, stripeMat);
        r.rotation.x = Math.PI / 2;
        r.position.copy(t.position).y += 0.0305;
        t.castShadow = true;
        g.add(t, r);
      });
      g.children.forEach((c) => (c.position.x -= 0.045));
      this.dynamic.push(tyreGeo, ringGeo);
      g.userData.w = 0.26;
      return g;
    }
    if (kind === 'suit' && maxW > 0.38) {
      const s = buildFramedSuit(0.32, 0.46, this.dynamic);
      s.position.set(0, 0.23, -0.05);
      s.rotation.x = -0.12;
      g.add(s);
      g.userData.w = 0.38;
      return g;
    }
    if (kind === 'flag' && maxW > 0.24) {
      // Bandera a cuadros en su mástil, con un leve ondeo.
      const ftex = tex(checkerCanvas());
      const fmat = new THREE.MeshStandardMaterial({ map: ftex, roughness: 0.7, side: THREE.DoubleSide });
      const geo = new THREE.PlaneGeometry(0.22, 0.16, 12, 1);
      const p = geo.attributes.position;
      for (let i = 0; i < p.count; i++) p.setZ(i, Math.sin((p.getX(i) + 0.11) * 22) * 0.012);
      geo.computeVertexNormals();
      const flag = new THREE.Mesh(geo, fmat);
      flag.position.set(0.11, 0.36, 0);
      const pole = new THREE.Mesh(new THREE.CylinderGeometry(0.005, 0.005, 0.45, 8), this.mat.brass);
      pole.position.y = 0.225;
      const foot = new THREE.Mesh(new THREE.CylinderGeometry(0.035, 0.04, 0.02, 16), this.mat.woodDark);
      foot.position.y = 0.01;
      g.add(foot, pole, flag);
      g.children.forEach((c) => (c.position.x -= 0.08));
      this.dynamic.push(ftex, fmat, geo, pole.geometry, foot.geometry);
      g.userData.w = 0.26;
      return g;
    }
    // ---- Tenis (fondo «Tennis») ----
    const year = () => [1928, 1946, 1955, 1968, 1975, 1982, 1989, 1994, 2001, 2008, 2013, 2019][Math.floor(rnd() * 12)];
    if (kind === 'trophycase' && maxW > 0.4) {
      g.add(buildTrophyCase(this.mat, year(), this.dynamic));
      g.userData.w = 0.4;
      return g;
    }
    if (kind === 'silvercup' && maxW > 0.26) {
      // alterna la copa ancha de asas grandes y la urna alta
      const style = (this.decorUsed.cupStyle = ((this.decorUsed.cupStyle ?? -1) + 1) % 2);
      g.add(buildSilverCup(this.mat, year(), this.dynamic, 0.95, style));
      g.userData.w = style ? 0.2 : 0.26;
      return g;
    }
    if (kind === 'jumboball' && maxW > 0.24) {
      g.add(buildJumboBall(this.mat, Math.floor(rnd() * 1000), this.dynamic));
      g.userData.w = 0.24;
      return g;
    }
    if (kind === 'racketframe' && maxW > 0.42) {
      const look = RACKET_LOOKS[Math.floor(rnd() * RACKET_LOOKS.length)];
      g.add(buildRacketFrame(this.mat, look, year(), this.dynamic));
      g.userData.w = 0.42;
      return g;
    }
    if (kind === 'rackets' && maxW > 0.4) {
      // dos raquetas cruzadas apoyadas contra el fondo
      [-1, 1].forEach((s, i) => {
        const r = buildRacket(RACKET_LOOKS[(Math.floor(rnd() * 3) + i) % 3], this.dynamic);
        r.scale.setScalar(0.74);
        r.position.set(s * 0.1, 0.005, -0.1 + i * 0.03);
        r.rotation.set(-0.1, 0, s * -0.36);
        g.add(r);
      });
      g.userData.w = 0.4;
      return g;
    }
    if (kind === 'ballcans' && maxW > 0.28) {
      g.add(buildBallCans(Math.floor(rnd() * 1000), this.dynamic));
      g.userData.w = 0.28;
      return g;
    }
    if (kind === 'clayjar' && maxW > 0.16) {
      g.add(buildClayJar(this.dynamic));
      g.userData.w = 0.16;
      return g;
    }
    if (kind === 'poster' && maxW > 0.36) {
      const style = (this.decorUsed.posterStyle = ((this.decorUsed.posterStyle ?? Math.floor(rnd() * 3)) + 1) % 3);
      g.add(buildPoster(this.mat, style, year(), this.dynamic));
      g.userData.w = 0.36;
      return g;
    }
    // ---- Museo de campeones ----
    if (kind === 'classichelmet' && maxW > 0.24) {
      const c = HELMET_COLORS[(this.decorUsed.hcol = ((this.decorUsed.hcol ?? Math.floor(rnd() * 6)) + 1) % HELMET_COLORS.length)];
      const h = classicHelmet(c, this.mat, this.dynamic);
      h.scale.setScalar(1.25);
      h.rotation.y = (rnd() - 0.5) * 0.9;
      g.add(h);
      g.userData.w = 0.24;
      return g;
    }
    if (kind === 'vintagemodel' && maxW > 0.42) {
      // maqueta de un auto de época sobre base de nogal, en caja de acrílico
      const i = (this.decorUsed.vint = ((this.decorUsed.vint ?? -1) + 1) % VINTAGE.length);
      const car = VINTAGE[i]();
      car.scale.setScalar(0.085);
      car.position.y = 0.035;
      car.rotation.y = 0.5 + (rnd() - 0.5) * 0.3;
      car.traverse((m) => {
        if (!m.isMesh) return;
        this.dynamic.push(m.geometry, m.material);
        if (m.material.map) this.dynamic.push(m.material.map);
      });
      const base = new THREE.Mesh(this.unitBox, this.mat.woodDark);
      base.scale.set(0.42, 0.035, 0.22);
      base.position.y = 0.0175;
      const caseBox = new THREE.Mesh(this.unitBox, this.mat.acrylic);
      caseBox.scale.set(0.42, 0.14, 0.22);
      caseBox.position.y = 0.035 + 0.07;
      g.add(base, car, caseBox);
      g.userData.w = 0.44;
      return g;
    }
    if (kind === 'woodwheel' && maxW > 0.3) {
      // volante de madera de época con rayos de bronce, en su atril
      const rim = new THREE.Mesh(new THREE.TorusGeometry(0.11, 0.013, 12, 40), this.mat.panel);
      const hub = new THREE.Mesh(new THREE.CylinderGeometry(0.022, 0.022, 0.02, 16), this.mat.brass);
      hub.rotation.x = Math.PI / 2;
      const wheel = new THREE.Group();
      wheel.add(rim, hub);
      const spokeGeo = new THREE.BoxGeometry(0.1, 0.012, 0.006);
      for (const a of [Math.PI / 2, Math.PI / 2 + 2.1, Math.PI / 2 - 2.1]) {
        const sp = new THREE.Mesh(spokeGeo, this.mat.brass);
        sp.position.set(Math.cos(a) * 0.055, Math.sin(a) * 0.055, 0);
        sp.rotation.z = a;
        wheel.add(sp);
      }
      wheel.position.y = 0.17;
      wheel.rotation.x = -0.3;
      const stand = new THREE.Mesh(this.unitBox, this.mat.brass);
      stand.scale.set(0.012, 0.12, 0.012);
      stand.position.set(0, 0.06, -0.03);
      const foot = new THREE.Mesh(this.unitBox, this.mat.woodDark);
      foot.scale.set(0.14, 0.015, 0.09);
      foot.position.y = 0.0075;
      g.add(foot, stand, wheel);
      this.dynamic.push(rim.geometry, hub.geometry, spokeGeo);
      g.userData.w = 0.3;
      return g;
    }
    if (kind === 'oldphoto' && maxW > 0.36) {
      g.add(buildOldPhoto(this.mat, Math.floor(rnd() * 100), this.dynamic));
      g.userData.w = 0.36;
      return g;
    }
    if (kind === 'sculpture' && maxW > 0.22) {
      // Escultura: base de mármol y un aro con una esfera.
      const base = new THREE.Mesh(this.unitBox, this.mat.stone);
      base.scale.set(0.14, 0.06, 0.14);
      base.position.y = 0.03;
      const ring = new THREE.Mesh(new THREE.TorusGeometry(0.075, 0.011, 12, 48), this.mat.brass);
      ring.position.y = 0.06 + 0.075 + 0.011;
      ring.rotation.y = 0.6;
      const ball = new THREE.Mesh(new THREE.SphereGeometry(0.03, 24, 16), this.mat.porcelain);
      ball.position.y = 0.06 + 0.075 + 0.011;
      ring.castShadow = ball.castShadow = true;
      g.add(base, ring, ball);
      this.dynamic.push(ring.geometry, ball.geometry);
      g.userData.w = 0.22;
      return g;
    }
    if (kind === 'plant' && maxW > 0.22) {
      // Maceta pequeña con hojas.
      const pts = [[0, 0], [0.05, 0], [0.065, 0.11], [0.07, 0.12], [0, 0.12]].map(([a, b]) => new THREE.Vector2(a, b));
      const pot = new THREE.Mesh(new THREE.LatheGeometry(pts, 24), this.mat.pot);
      g.add(pot);
      this.dynamic.push(pot.geometry);
      const leafGeo = new THREE.SphereGeometry(1, 10, 6);
      this.dynamic.push(leafGeo);
      for (let i = 0; i < 8; i++) {
        const leaf = new THREE.Mesh(leafGeo, this.mat.leaf);
        const a = (i / 8) * Math.PI * 2;
        leaf.scale.set(0.025, 0.085, 0.008);
        leaf.position.set(Math.cos(a) * 0.03, 0.18 + (i % 3) * 0.02, Math.sin(a) * 0.03);
        leaf.rotation.set(Math.sin(a) * 0.5, -a, -Math.cos(a) * 0.5);
        g.add(leaf);
      }
      g.userData.w = 0.22;
      return g;
    }
    if (kind === 'old' || maxW > 0.2) {
      const n = Math.max(3, Math.floor((maxW * (0.45 + rnd() * 0.4)) / 0.065));
      let x = 0;
      for (let i = 0; i < n; i++) {
        const t = 0.04 + rnd() * 0.04, h = 0.34 + rnd() * 0.12, d = 0.26 + rnd() * 0.06;
        const m = new THREE.Mesh(this.unitBox, decorMat());
        m.scale.set(t, h, d);
        const last = i === n - 1 && rnd() < 0.7;
        if (last) {
          m.rotation.z = -0.24;
          m.position.set(x + t / 2 + Math.sin(0.24) * h / 2, Math.cos(0.24) * h / 2 + 0.004, 0);
          x += t + Math.sin(0.24) * h;
        } else {
          m.position.set(x + t / 2, h / 2, 0);
          x += t + 0.003;
        }
        m.castShadow = true;
        g.add(m);
      }
      g.children.forEach((c) => (c.position.x -= x / 2));
      g.userData.w = x;
      return g;
    }
    return null;
  }

  bookend() {
    const g = new THREE.Group();
    const a = new THREE.Mesh(new THREE.BoxGeometry(0.012, 0.17, 0.13), this.mat.brass);
    a.position.y = 0.085;
    const b = new THREE.Mesh(new THREE.BoxGeometry(0.09, 0.008, 0.13), this.mat.brass);
    b.position.set(0.04, 0.004, 0);
    g.add(a, b);
    this.dynamic.push(a.geometry, b.geometry);
    g.userData.w = 0.09;
    return g;
  }

  // ---------- Animación de abrir / devolver un libro ----------

  tween(ms, fn, e = ease.inOut) {
    return new Promise((res) => this.tweens.push({ start: performance.now(), ms, fn, e, res }));
  }

  // Saca el libro de la estantería y lo trae frente a la cámara.
  // `frac` es la fracción de la altura de pantalla que debe ocupar al llegar.
  async flyOut(id, frac = 0.8) {
    const m = this.meshById.get(id);
    if (!m) return;
    this.flying = m;
    this.frozen = true;
    this.hovered = null;
    this.canvas.style.cursor = '';
    this.scene.attach(m);
    const p0 = m.position.clone();
    const q0 = m.quaternion.clone();
    await this.tween(380, (k) => (m.position.z = p0.z + 0.32 * k), ease.out);
    const p1 = m.position.clone();

    const h = m.geometry.parameters.height;
    const dist = h / (2 * Math.tan(THREE.MathUtils.degToRad(this.camera.fov / 2)) * frac);
    const f = new THREE.Vector3();
    this.camera.getWorldDirection(f);
    const up = new THREE.Vector3(0, 1, 0).applyQuaternion(this.camera.quaternion);
    const target = this.camera.position.clone().add(f.clone().multiplyScalar(dist));
    const xAxis = f.clone().negate();
    const zAxis = new THREE.Vector3().crossVectors(xAxis, up);
    const q1 = new THREE.Quaternion().setFromRotationMatrix(new THREE.Matrix4().makeBasis(xAxis, up, zAxis));
    q1.multiply(new THREE.Quaternion().setFromAxisAngle(new THREE.Vector3(0, 1, 0), 0.34));
    q1.multiply(new THREE.Quaternion().setFromAxisAngle(new THREE.Vector3(0, 0, 1), 0.08));

    this.flight = { p0, q0, p1, target, q1 };
    await this.tween(950, (k) => {
      m.position.lerpVectors(p1, target, k);
      m.position.y += Math.sin(k * Math.PI) * 0.12;
      m.quaternion.slerpQuaternions(q0, q1, k);
    });
  }

  hideFlying() {
    if (this.flying) this.flying.visible = false;
  }

  async returnBook() {
    const m = this.flying;
    this.paused = false;
    if (!m || !this.flight) {
      this.frozen = false;
      return;
    }
    m.visible = true;
    const { p0, q0, p1, target, q1 } = this.flight;
    await this.tween(900, (k) => {
      m.position.lerpVectors(target, p1, k);
      m.position.y += Math.sin(k * Math.PI) * 0.12;
      m.quaternion.slerpQuaternions(q1, q0, k);
    });
    await this.tween(340, (k) => m.position.lerpVectors(p1, p0, k), ease.out);
    if (this.dynamicGroup) this.dynamicGroup.attach(m);
    m.position.copy(m.userData.base);
    m.quaternion.identity();
    this.flying = null;
    this.flight = null;
    this.frozen = false;
    if (this.pending) {
      const [b, l] = this.pending;
      this.pending = null;
      this.setBooks(b, l);
    }
  }

  setPaused(v) {
    this.paused = v;
  }

  // ---------- Interacción ----------

  bindEvents() {
    const c = this.canvas;
    window.addEventListener('resize', () => this.resize());
    c.addEventListener('pointermove', (e) => {
      this.wake();
      this.pointer.x = e.clientX;
      this.pointer.y = e.clientY;
      if (this.downAt && Math.hypot(e.clientX - this.downAt.x, e.clientY - this.downAt.y) > 10) clearTimeout(this.pressTimer);
      // Con el dedo la cámara no sigue al puntero: se cambia de tramo deslizando.
      if (e.pointerType !== 'mouse') return;
      this.touch = false;
      this.mouse.set((e.clientX / innerWidth) * 2 - 1, -(e.clientY / innerHeight) * 2 + 1);
      this.ndc.copy(this.mouse);
      this.needsPick = true;
    });
    c.addEventListener('pointerleave', () => {
      this.ndc.set(9, 9);
      this.needsPick = true;
    });
    c.addEventListener('pointerdown', (e) => {
      this.wake();
      this.downAt = { x: e.clientX, y: e.clientY };
      this.longPressed = false;
      this.touch = e.pointerType !== 'mouse';
      if (e.pointerType !== 'mouse') {
        this.pointer.x = e.clientX;
        this.pointer.y = e.clientY;
        this.ndc.set((e.clientX / innerWidth) * 2 - 1, -(e.clientY / innerHeight) * 2 + 1);
        this.pick();
        // Mantener apretado un libro abre sus opciones (el clic derecho del teléfono).
        clearTimeout(this.pressTimer);
        this.pressTimer = setTimeout(() => {
          if (!this.hovered || this.frozen) return;
          this.longPressed = true;
          navigator.vibrate?.(15);
          this.handlers.onContext?.(this.hovered.userData.book.id, e.clientX, e.clientY);
        }, 550);
      }
    });
    c.addEventListener('pointerup', (e) => {
      clearTimeout(this.pressTimer);
      if (e.pointerType === 'mouse' || !this.downAt) return;
      // Al levantar el dedo se deja de "apuntar" (si fue un toque, el clic vuelve a apuntar enseguida).
      this.ndc.set(9, 9);
      this.pick();
      if (!this.phone) return;
      const dx = e.clientX - this.downAt.x, dy = e.clientY - this.downAt.y;
      if (Math.abs(dx) > 45 && Math.abs(dx) > Math.abs(dy) * 1.2) this.setBay(this.bay + (dx < 0 ? 1 : -1));
    });
    c.addEventListener('pointercancel', () => clearTimeout(this.pressTimer));
    c.addEventListener('click', (e) => {
      if (this.frozen || this.longPressed) return;
      if (this.downAt && Math.hypot(e.clientX - this.downAt.x, e.clientY - this.downAt.y) > 8) return;
      // Se vuelve a apuntar en el momento del clic por si el ratón no se movió desde que volvió el libro.
      this.ndc.set((e.clientX / innerWidth) * 2 - 1, -(e.clientY / innerHeight) * 2 + 1);
      this.pick();
      if (this.hovered) this.handlers.onOpen?.(this.hovered.userData.book.id);
    });
    c.addEventListener('contextmenu', (e) => {
      e.preventDefault();
      this.ndc.set((e.clientX / innerWidth) * 2 - 1, -(e.clientY / innerHeight) * 2 + 1);
      this.pick();
      if (this.hovered && !this.frozen) this.handlers.onContext?.(this.hovered.userData.book.id, e.clientX, e.clientY);
    });
    c.addEventListener('wheel', (e) => {
      this.wake();
      if (this.frozen) return;
      e.preventDefault();
      this.targetDist = clamp(this.targetDist + e.deltaY * 0.0022, this.minDist, this.maxDist);
    }, { passive: false });
  }

  pick() {
    this.needsPick = false;
    let m = null;
    if (!this.frozen && this.ndc.x < 2) {
      // Con el dedo, si no se acierta justo al lomo, se prueba un poco a los lados (los lomos son finitos).
      const offsets = this.touch ? [0, -10, 10, -20, 20] : [0];
      for (const px of offsets) {
        this.raycaster.setFromCamera(new THREE.Vector2(this.ndc.x + (px * 2) / innerWidth, this.ndc.y), this.camera);
        m = this.raycaster.intersectObjects(this.userBooks, false)[0]?.object || null;
        if (m) break;
      }
    }
    if (m !== this.hovered) {
      this.hovered = m;
      this.canvas.style.cursor = m ? 'pointer' : '';
    }
    this.handlers.onHover?.(m ? m.userData.book.id : null, this.pointer.x, this.pointer.y);
  }

  setRatio(r) {
    this.ratio = clamp(Math.round(r * 100) / 100, 0.7, this.maxRatio);
    this.renderer.setPixelRatio(this.ratio);
    this.renderer.setSize(innerWidth, innerHeight, false);
    this.slowAvg = 1.2;
    this.fastFrames = 0;
  }

  resize() {
    this.wake();
    const w = innerWidth, h = innerHeight;
    this.renderer.setSize(w, h, false);
    this.camera.aspect = w / h;
    const wasPhone = this.phone;
    // Teléfono en vertical: se ve un tramo de la estantería a la vez, bien de cerca.
    this.phone = w / h < 0.8;
    this.camera.fov = this.phone ? 50 : w / h < 1 ? 58 : 42;
    this.camera.updateProjectionMatrix();
    const halfTan = Math.tan(THREE.MathUtils.degToRad(this.camera.fov / 2));
    if (this.phone) {
      const [a, b] = this.mainBays[0];
      const fitW = ((b - a) / 2 + 0.1) / (halfTan * this.camera.aspect);
      // Alto suficiente para que la placa de bronce quede por encima de los controles de abajo (iPad vertical).
      const fitH = 1.6 / halfTan;
      this.maxDist = Math.max(fitW, fitH);
      this.minDist = this.maxDist * 0.6;
      this.bay ??= Math.floor(this.mainBays.length / 2);
    } else {
      // Que entre el ancho de la estantería y que su copete quede debajo de la barra de arriba
      // (en pantallas anchas la barra tapaba las lámparas y la parte alta).
      const header = (document.getElementById('tabs')?.getBoundingClientRect().bottom || 0) + 6;
      const room = Math.max(0.5, 1 - (2 * header) / h);
      this.maxDist = Math.max(4.1, (BC.w / 2 + 0.25) / (halfTan * this.camera.aspect), (BC.h + 0.45 - 1.71) / (halfTan * room));
      this.minDist = 1.3;
    }
    this.targetDist = clamp(this.targetDist, this.minDist, this.maxDist);
    if (!this.started || wasPhone !== this.phone) this.dist = this.targetDist = this.maxDist;
    if (wasPhone !== undefined && wasPhone !== this.phone && this.last) this.setBooks(...this.last);
    this.handlers.onBay?.(this.phone ? this.bay : null, this.mainBays.length);
  }

  // Tramo visible en el teléfono (0 = izquierda).
  setBay(i) {
    if (!this.phone) return;
    this.wake();
    const n = this.mainBays.length;
    this.bay = clamp(i, 0, n - 1);
    this.handlers.onBay?.(this.bay, n);
  }

  // Marca que hay interacción: la escena va a 60 cuadros por segundo un rato; en reposo, a 30.
  wake() {
    this.lastActive = performance.now();
  }

  loop(now = performance.now()) {
    requestAnimationFrame(this.loop);
    const busy = this.tweens.length || this.flying || this.hovered || now - this.lastActive < 1500;
    const budget = busy ? 1000 / 60 : 1000 / 30;
    if (now - this.lastFrame < budget - 3) return;
    // Si los cuadros tardan bastante más de lo previsto, se baja la resolución (y se sube cuando sobra).
    const took = now - this.lastFrame;
    this.lastFrame = now;
    if (!this.paused && this.started && took < 200) {
      this.slowAvg = this.slowAvg * 0.95 + (took / budget) * 0.05;
      if (this.slowAvg > 1.45 && this.ratio > 0.7) this.setRatio(this.ratio - 0.15);
      else if (this.slowAvg < 1.08 && this.ratio < this.maxRatio && ++this.fastFrames > 240) this.setRatio(this.ratio + 0.1);
    }
    const dt = Math.min(this.clock.getDelta(), 0.05);
    const t = this.clock.elapsedTime;
    if (this.tweens.length) {
      const now = performance.now();
      this.tweens = this.tweens.filter((tw) => {
        const k = Math.min(1, (now - tw.start) / tw.ms);
        tw.fn(tw.e(k));
        if (k >= 1) tw.res();
        return k < 1;
      });
    }
    if (this.paused) return;

    if (!this.frozen) {
      this.dist += (this.targetDist - this.dist) * Math.min(1, dt * 5);
      const halfH = this.dist * Math.tan(THREE.MathUtils.degToRad(this.camera.fov / 2));
      const halfW = halfH * this.camera.aspect;
      const rangeX = Math.max(0.15, BC.w / 2 + 0.35 - halfW);
      const rangeY = Math.max(0.06, 1.5 - halfH);
      let tx = this.mouse.x * rangeX;
      let ty = 1.66 + this.mouse.y * rangeY;
      if (this.phone) {
        const [a, b] = this.mainBays[this.bay];
        tx = (a + b) / 2;
        ty = 1.85;
      }
      const k = Math.min(1, dt * 2.2);
      this.cam.x += (tx - this.cam.x) * k;
      this.cam.y += (ty - this.cam.y) * k;
      this.camera.position.set(this.cam.x, this.cam.y + 0.05, FRONT_Z + this.dist);
      this.camera.lookAt(this.phone ? this.cam.x : this.cam.x * 0.9, this.cam.y - 0.04, FRONT_Z);
      if (this.needsPick || Math.abs(tx - this.cam.x) > 0.002) this.pick();
    }

    for (const m of this.userBooks) {
      if (m === this.flying) continue;
      const target = m === this.hovered ? 0.085 : 0;
      const ud = m.userData;
      ud.pull += (target - ud.pull) * Math.min(1, dt * 10);
      m.position.z = ud.base.z + ud.pull;
      m.rotation.x = -ud.pull * 0.5;
    }

    this.theme.tick?.(this, t, dt);

    if (this.dust) {
      const pos = this.dust.geometry.attributes.position;
      const rise = this.dust.userData.rise;
      for (let i = 0; i < pos.count; i++) {
        const sd = this.dustSeed[i];
        let y = pos.getY(i) + dt * rise * (0.012 + Math.sin(t * 0.3 + sd) * 0.01);
        if (y > 3.4) y = 0.2;
        pos.setY(i, y);
        pos.setX(i, pos.getX(i) + Math.sin(t * 0.2 + sd) * dt * 0.01);
      }
      pos.needsUpdate = true;
    }

    // Sombras: al cambiar algo, mientras un libro se mueve, y unas 5 veces por segundo por lo que se anima solo.
    if (this.shadowDirty || busy || ++this.frame % 6 === 0) {
      this.renderer.shadowMap.needsUpdate = true;
      this.shadowDirty = false;
    }
    this.renderer.render(this.scene, this.camera);
    if (!this.started) {
      this.started = true;
      this.handlers.onReady?.();
    }
  }
}
