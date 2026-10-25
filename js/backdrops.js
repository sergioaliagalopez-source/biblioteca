// Paisajes animados que se ven por los ventanales (shaders sin luz propia, siempre en movimiento).
import * as THREE from 'three';

const NOISE = /* glsl */ `
  float hash(vec2 p) { return fract(sin(dot(p, vec2(127.1, 311.7))) * 43758.5453); }
  float noise(vec2 p) {
    vec2 i = floor(p), f = fract(p);
    vec2 u = f * f * (3.0 - 2.0 * f);
    return mix(mix(hash(i), hash(i + vec2(1.0, 0.0)), u.x), mix(hash(i + vec2(0.0, 1.0)), hash(i + vec2(1.0, 1.0)), u.x), u.y);
  }
  float fbm(vec2 p) {
    float s = 0.0, a = 0.5;
    for (int i = 0; i < 5; i++) { s += a * noise(p); p *= 2.03; a *= 0.5; }
    return s;
  }
`;

const VERT = /* glsl */ `
  varying vec2 vUv;
  void main() { vUv = uv; gl_Position = projectionMatrix * modelViewMatrix * vec4(position, 1.0); }
`;

// Océano al atardecer: cielo dorado y rosa, nubes que avanzan, sol que se refleja en el agua y olas que brillan.
const SEA = /* glsl */ `
  uniform float uTime;
  varying vec2 vUv;
  ${NOISE}
  void main() {
    vec2 uv = vUv;
    float horizon = 0.42;
    vec2 sun = vec2(0.6, horizon + 0.1);
    vec3 col;
    if (uv.y > horizon) {
      float t = (uv.y - horizon) / (1.0 - horizon);
      vec3 low = vec3(1.0, 0.80, 0.55), mid = vec3(0.96, 0.58, 0.45), top = vec3(0.30, 0.36, 0.58);
      col = mix(low, mid, smoothstep(0.0, 0.32, t));
      col = mix(col, top, smoothstep(0.28, 1.0, t));
      float c = fbm(vec2(uv.x * 2.6 + uTime * 0.006, uv.y * 7.0 - uTime * 0.002));
      float cloud = smoothstep(0.52, 0.82, c) * (1.0 - smoothstep(0.7, 1.0, t));
      col = mix(col, vec3(1.0, 0.72, 0.62), cloud * 0.55);
      float d = length((uv - sun) * vec2(2.0, 1.0));
      col += vec3(1.0, 0.72, 0.38) * exp(-d * 14.0) * 0.9;
      col = mix(col, vec3(1.0, 0.93, 0.78), smoothstep(0.034, 0.028, d));
      // islas a lo lejos
      float isl = horizon + 0.028 * fbm(vec2(uv.x * 9.0, 2.0)) * smoothstep(0.05, 0.15, uv.x) * (1.0 - smoothstep(0.3, 0.42, uv.x));
      col = mix(col, vec3(0.42, 0.33, 0.40), step(uv.y, isl) * 0.85);
    } else {
      float t = (horizon - uv.y) / horizon;
      vec3 deep = vec3(0.10, 0.22, 0.34), near = vec3(0.07, 0.28, 0.38);
      col = mix(vec3(0.78, 0.58, 0.50), deep, smoothstep(0.0, 0.18, t));
      col = mix(col, near, t);
      float persp = 1.0 / (t + 0.06);
      float w = noise(vec2(uv.x * 30.0 * (0.4 + t * 1.6) + uTime * 0.25, persp * 1.6 - uTime * 0.55));
      float w2 = noise(vec2(uv.x * 60.0 * (0.4 + t) - uTime * 0.18, persp * 3.2 - uTime * 0.9));
      float path = exp(-pow((uv.x - sun.x) * (5.0 + 14.0 * (1.0 - t)), 2.0));
      float glint = smoothstep(0.62, 0.92, w * 0.6 + w2 * 0.4);
      col += vec3(1.0, 0.78, 0.48) * glint * path * 1.5;
      col += vec3(1.0, 0.7, 0.45) * path * 0.12 * (1.0 - t);
      col += smoothstep(0.78, 0.98, w2) * 0.05 * t;
      // espuma suave cerca de la costa
      col = mix(col, vec3(0.92, 0.90, 0.86), smoothstep(0.93, 0.99, t) * smoothstep(0.5, 0.75, noise(vec2(uv.x * 14.0 + uTime * 0.4, uTime * 0.3))) * 0.6);
    }
    gl_FragColor = vec4(col, 1.0);
  }
`;

// Ciudad de noche bajo la lluvia: edificios con ventanas que se encienden y apagan,
// gotas que resbalan por el vidrio y algún relámpago lejano (uFlash).
const CITY = /* glsl */ `
  uniform float uTime;
  uniform float uFlash;
  varying vec2 vUv;
  ${NOISE}
  float skyline(float x, float scale, float base, float amp, float seed) {
    float id = floor(x * scale);
    return base + amp * hash(vec2(id, seed)) * (0.55 + 0.45 * sin(id * 0.37 + seed));
  }
  void main() {
    vec2 uv = vUv;
    vec3 col = mix(vec3(0.16, 0.11, 0.20), vec3(0.02, 0.03, 0.07), smoothstep(0.45, 0.85, uv.y));
    col += vec3(0.5, 0.55, 0.75) * uFlash * smoothstep(0.3, 1.0, uv.y);
    // edificios lejanos
    float h2 = skyline(uv.x, 90.0, 0.42, 0.22, 3.0);
    if (uv.y < h2) col = vec3(0.07, 0.07, 0.12) + uFlash * 0.12;
    // edificios cercanos con ventanas
    float x1 = uv.x * 44.0;
    float h1 = skyline(uv.x, 44.0, 0.3, 0.34, 7.0);
    if (uv.y < h1) {
      col = vec3(0.035, 0.04, 0.07) + uFlash * 0.08;
      vec2 cell = vec2(floor(fract(x1) * 6.0), floor(uv.y * 150.0));
      vec2 cid = vec2(floor(x1), 0.0) * 31.0 + cell;
      float lit = step(0.45, hash(cid));
      float flick = step(0.985, hash(cid + floor(uTime * 0.25)));
      vec2 inCell = vec2(fract(fract(x1) * 6.0), fract(uv.y * 150.0));
      float win = step(0.2, inCell.x) * step(inCell.x, 0.8) * step(0.25, inCell.y) * step(inCell.y, 0.78);
      vec3 warm = mix(vec3(1.0, 0.78, 0.45), vec3(0.85, 0.9, 1.0), hash(cid + 4.0));
      col += warm * win * max(lit - flick, 0.0) * 0.9;
    }
    // luces rojas en lo alto de algunas torres, que parpadean despacio
    float tower = floor(x1);
    if (hash(vec2(tower, 9.0)) > 0.7) {
      vec2 top = vec2((tower + 0.5) / 44.0, h1 + 0.004);
      float blink = step(0.5, fract(uTime * 0.5 + hash(vec2(tower, 5.0))));
      col += vec3(1.0, 0.15, 0.1) * smoothstep(0.0025, 0.0, length((uv - top) * vec2(2.0, 1.0))) * blink * 1.5;
    }
    // bruma de la ciudad
    col += vec3(0.25, 0.16, 0.22) * smoothstep(0.45, 0.2, uv.y) * 0.3;
    // lluvia sobre el vidrio: hilos que caen y gotas quietas
    vec2 r = vec2(uv.x * 140.0, uv.y * 3.0);
    float colId = floor(r.x);
    float speed = 0.25 + hash(vec2(colId, 1.0)) * 0.5;
    float y = fract(r.y + uTime * speed + hash(vec2(colId, 2.0)));
    float streak = smoothstep(0.0, 0.02, y) * smoothstep(0.12, 0.0, y) * step(0.7, hash(vec2(colId, 3.0)));
    streak *= smoothstep(0.5, 0.0, abs(fract(r.x) - 0.5));
    col += vec3(0.55, 0.6, 0.7) * streak * 0.35;
    vec2 dropUv = uv * vec2(320.0, 160.0);
    vec2 dropId = floor(dropUv);
    float dr = length(fract(dropUv) - 0.5);
    col += vec3(0.6, 0.65, 0.75) * smoothstep(0.22, 0.08, dr) * step(0.93, hash(dropId)) * 0.18;
    gl_FragColor = vec4(col, 1.0);
  }
`;

// Circuito de día: cielo con nubes, colinas, la tribuna principal llena de público que se mueve
// (mucho rojo), banderas que flamean en el techo, flashes de cámaras y un helicóptero de TV.
const PADDOCK = /* glsl */ `
  uniform float uTime;
  uniform float uAspect;
  varying vec2 vUv;
  ${NOISE}
  void main() {
    vec2 uv = vUv;
    vec3 col = mix(vec3(0.66, 0.80, 0.95), vec3(0.27, 0.50, 0.86), smoothstep(0.45, 1.0, uv.y));
    float c = fbm(vec2(uv.x * 3.0 + uTime * 0.008, uv.y * 6.0));
    col = mix(col, vec3(1.0), smoothstep(0.55, 0.85, c) * 0.75 * smoothstep(0.5, 0.66, uv.y));
    float hills = 0.36 + 0.025 * fbm(vec2(uv.x * 8.0, 3.0));
    if (uv.y < hills) col = mix(vec3(0.30, 0.44, 0.26), vec3(0.20, 0.32, 0.19), fbm(uv * 40.0));
    float standBot = 0.16, standTop = 0.32;
    if (uv.y > standBot && uv.y < standTop) {
      float ty = (uv.y - standBot) * 100.0;
      vec2 seat = vec2(floor(uv.x * 900.0), floor(ty));
      float h = hash(seat);
      vec3 crowd = h < 0.45 ? vec3(0.80, 0.06, 0.08) : h < 0.58 ? vec3(0.96, 0.84, 0.18) : h < 0.74 ? vec3(0.95) : h < 0.88 ? vec3(0.10, 0.10, 0.12) : vec3(0.20, 0.30, 0.72);
      // la gente se mueve, y cada tanto pasa una "ola"
      float bob = 0.6 + 0.4 * (0.5 + 0.5 * sin(uTime * 3.0 + seat.x * 0.7 + seat.y * 1.3));
      float ola = exp(-pow((fract(uv.x * 0.6 - uTime * 0.04) - 0.5) * 18.0, 2.0));
      crowd = mix(vec3(0.42, 0.12, 0.12), crowd, 0.55) * (bob + ola * 0.5);
      col = mix(vec3(0.24, 0.24, 0.27), crowd, step(0.3, fract(ty)));
      col *= 0.62 + 0.38 * (1.0 - (uv.y - standBot) / (standTop - standBot));
      col += step(0.9988, hash(seat + floor(uTime * 9.0))) * 1.6;
    }
    if (uv.y >= standTop && uv.y < standTop + 0.022) col = vec3(0.86, 0.87, 0.9) - 0.1 * step(0.5, fract(uv.x * 40.0));
    // banderas sobre el techo
    float fid = floor(uv.x * 26.0);
    float fx = fract(uv.x * 26.0);
    if (abs(fx - 0.5) < 0.006 && uv.y > standTop + 0.022 && uv.y < standTop + 0.075) col = vec3(0.88);
    vec2 fuv = vec2((fx - 0.5) / 0.2, (uv.y - (standTop + 0.05)) / 0.022);
    if (fuv.x > 0.0 && fuv.x < 1.0) {
      float wav = sin(fuv.x * 6.0 - uTime * 5.0 + fid) * 0.18 * fuv.x;
      float yy = fuv.y + wav;
      if (yy > 0.0 && yy < 1.0) {
        float k = mod(fid, 3.0);
        vec3 fc = k < 1.0 ? vec3(0.86, 0.05, 0.07) : k < 2.0 ? vec3(0.96, 0.82, 0.1) : vec3(0.96);
        col = fc * (0.78 + 0.22 * sin(fuv.x * 6.0 - uTime * 5.0 + fid));
      }
    }
    // muro y reja de contención bajo la tribuna
    if (uv.y <= standBot) {
      col = uv.y < 0.12 ? vec3(0.58, 0.58, 0.6) : vec3(0.32, 0.46, 0.29);
      col = mix(col, vec3(0.18), step(0.96, fract(uv.x * 220.0)) * step(0.12, uv.y));
    }
    // helicóptero de TV cruzando el cielo
    vec2 hp = vec2(fract(uTime * 0.012) * 1.4 - 0.2, 0.5 + 0.015 * sin(uTime * 0.3));
    vec2 d = (uv - hp) * vec2(uAspect, 1.0);
    if (length(d * vec2(1.0, 2.2)) < 0.012) col = vec3(0.12);
    if (abs(d.y - 0.009) < 0.0012 && abs(d.x) < 0.03) col = vec3(0.2);
    col += vec3(1.0, 0.1, 0.1) * step(length(d - vec2(0.014, 0.0)), 0.003) * step(0.5, fract(uTime * 1.5));
    gl_FragColor = vec4(col, 1.0);
  }
`;

// Estadio de tenis en París, de tarde y vacío: tribunas verdes, techo con banderas, marcador,
// árboles, la torre a lo lejos; en el cielo nubes, bandadas de pájaros, un globo y un avión con su estela.
const TIERRA = /* glsl */ `
  uniform float uTime;
  uniform float uAspect;
  varying vec2 vUv;
  ${NOISE}
  float bird(vec2 p, float t) {
    // una "v" que aletea
    float flap = 0.4 + 0.35 * sin(t * 9.0);
    return smoothstep(0.0028, 0.0012, abs(p.y - abs(p.x) * flap)) * step(abs(p.x), 0.006);
  }
  void main() {
    vec2 uv = vUv;
    vec3 col = mix(vec3(0.78, 0.86, 0.95), vec3(0.42, 0.62, 0.88), smoothstep(0.38, 1.0, uv.y));
    float c = fbm(vec2(uv.x * 2.4 + uTime * 0.006, uv.y * 5.0 - uTime * 0.002));
    col = mix(col, vec3(1.0, 0.99, 0.97), smoothstep(0.52, 0.82, c) * 0.8 * smoothstep(0.4, 0.6, uv.y));
    // avión con su estela, cruzando muy despacio
    float px = fract(uTime * 0.008) * 1.6 - 0.3;
    vec2 pp = vec2(px, 0.78 + px * 0.05);
    float trail = smoothstep(0.0025, 0.0, abs(uv.y - (0.78 + uv.x * 0.05))) * step(uv.x, px) * smoothstep(px - 0.5, px, uv.x);
    col = mix(col, vec3(1.0), trail * 0.7);
    col = mix(col, vec3(0.35), smoothstep(0.004, 0.002, length((uv - pp) * vec2(uAspect, 1.0) * vec2(0.5, 1.0))));
    // globo aerostático que deriva
    vec2 bp = vec2(fract(uTime * 0.004 + 0.3) * 1.3 - 0.15, 0.6 + 0.02 * sin(uTime * 0.2));
    vec2 bd = (uv - bp) * vec2(uAspect, 1.0);
    if (length(bd * vec2(1.0, 0.85)) < 0.03 && bd.y > -0.02) {
      float stripes = step(0.5, fract(atan(bd.x, 0.03) * 3.0));
      col = mix(vec3(0.9, 0.42, 0.18), vec3(0.16, 0.42, 0.28), stripes);
    }
    if (abs(bd.x) < 0.006 && bd.y < -0.032 && bd.y > -0.044) col = vec3(0.35, 0.22, 0.12);
    // bandada de pájaros
    for (int i = 0; i < 5; i++) {
      float fi = float(i);
      vec2 b0 = vec2(fract(uTime * 0.02 + 0.1) * 1.4 - 0.2 - fi * 0.012, 0.66 + abs(fi - 2.0) * 0.008);
      col = mix(col, vec3(0.15), bird((uv - b0) * vec2(uAspect, 1.0), uTime + fi));
    }
    // la torre, lejos, detrás del estadio
    float tx = abs(uv.x - 0.16) * uAspect;
    float ty = (uv.y - 0.33) / 0.2;
    if (ty > 0.0 && ty < 1.0 && tx < 0.03 * pow(1.0 - ty, 2.2) + 0.002) col = mix(col, vec3(0.45, 0.42, 0.42), 0.85);
    // árboles detrás de las tribunas
    float trees = 0.33 + 0.03 * fbm(vec2(uv.x * 14.0, 2.0));
    if (uv.y < trees) col = mix(vec3(0.20, 0.33, 0.19), vec3(0.14, 0.25, 0.14), fbm(uv * 60.0));
    // tribunas vacías: butacas verdes en gradas
    float standBot = 0.14, standTop = 0.3;
    if (uv.y > standBot && uv.y < standTop) {
      float ty2 = (uv.y - standBot) * 110.0;
      float seat = step(0.22, fract(ty2)) * step(0.1, fract(uv.x * 650.0));
      col = mix(vec3(0.16, 0.2, 0.17), vec3(0.08, 0.36, 0.22) * (0.85 + 0.15 * hash(vec2(floor(uv.x * 650.0), floor(ty2)))), seat);
      col = mix(col, vec3(0.86, 0.85, 0.8), step(0.92, fract(ty2 / 4.0)) * 0.6); // escalones blancos cada 4 filas
      col *= 0.7 + 0.3 * (1.0 - (uv.y - standBot) / (standTop - standBot));
      // pasillos
      col = mix(col, vec3(0.86, 0.85, 0.8), step(0.985, fract(uv.x * 9.0)));
      // marcador sobre la tribuna central
      vec2 sb = (uv - vec2(0.5, 0.255)) * vec2(uAspect, 1.0);
      if (abs(sb.x) < 0.09 && abs(sb.y) < 0.022) {
        col = vec3(0.05, 0.2, 0.13);
        float clock = step(0.6, fract(uv.x * 160.0)) * step(abs(sb.y), 0.008) * step(abs(sb.x), 0.05);
        col = mix(col, vec3(0.95, 0.75, 0.2), clock * (0.6 + 0.4 * step(0.5, fract(uTime))));
      }
    }
    if (uv.y >= standTop && uv.y < standTop + 0.02) col = vec3(0.93, 0.92, 0.88) - 0.08 * step(0.5, fract(uv.x * 50.0));
    // banderas en el borde del techo
    float fid = floor(uv.x * 22.0);
    float fx = fract(uv.x * 22.0);
    if (abs(fx - 0.5) < 0.005 && uv.y > standTop + 0.02 && uv.y < standTop + 0.07) col = vec3(0.9);
    vec2 fuv = vec2((fx - 0.5) / 0.2, (uv.y - (standTop + 0.045)) / 0.02);
    if (fuv.x > 0.0 && fuv.x < 1.0) {
      float wav = sin(fuv.x * 6.0 - uTime * 4.0 + fid) * 0.16 * fuv.x;
      float yy = fuv.y + wav;
      if (yy > 0.0 && yy < 1.0) {
        vec3 fc = mod(fid, 2.0) < 1.0 ? (fuv.x < 0.33 ? vec3(0.1, 0.2, 0.55) : fuv.x < 0.66 ? vec3(0.96) : vec3(0.85, 0.1, 0.15)) : vec3(0.08, 0.36, 0.22);
        col = fc * (0.82 + 0.18 * sin(fuv.x * 6.0 - uTime * 4.0 + fid));
      }
    }
    // muro verde al pie de la tribuna
    if (uv.y <= standBot) col = mix(vec3(0.07, 0.3, 0.19), vec3(0.75, 0.38, 0.22), step(uv.y, 0.1));
    gl_FragColor = vec4(col, 1.0);
  }
`;

export function tierraBackdrop(w = 110, h = 40) {
  return backdrop(TIERRA, { uTime: { value: 0 }, uAspect: { value: w / h } }, w, h);
}

export function paddockBackdrop(w = 80, h = 34) {
  return backdrop(PADDOCK, { uTime: { value: 0 }, uAspect: { value: w / h } }, w, h);
}

function backdrop(fragmentShader, uniforms, w, h) {
  const mat = new THREE.ShaderMaterial({ vertexShader: VERT, fragmentShader, uniforms, fog: false, depthWrite: true });
  const mesh = new THREE.Mesh(new THREE.PlaneGeometry(w, h), mat);
  return { mesh, uniforms };
}

export function seaBackdrop(w = 22, h = 11) {
  return backdrop(SEA, { uTime: { value: 0 } }, w, h);
}

export function cityBackdrop(w = 22, h = 11) {
  return backdrop(CITY, { uTime: { value: 0 }, uFlash: { value: 0 } }, w, h);
}
