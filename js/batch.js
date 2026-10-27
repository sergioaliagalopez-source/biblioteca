// Une las piezas fijas de una escena que comparten material en una sola malla: menos llamadas de dibujo
// (el costo grande en los fondos con muchos objetos) sin cambiar cómo se ve nada.
// No se tocan los objetos que se mueven (marcados con userData.dynamic o indicados en `skip`),
// los transparentes (necesitan ordenarse uno por uno) ni las mallas que ya están solas con su material.
import * as THREE from 'three';

const ATTRS = ['position', 'normal', 'uv'];

export function mergeStatic(root, { skip = () => false, keep = new Set(), track = null } = {}) {
  root.updateMatrixWorld(true);
  const inv = new THREE.Matrix4().copy(root.matrixWorld).invert();
  const groups = new Map();
  const users = new Map(); // cuántas mallas usan cada geometría (para liberar sólo las que quedan sin uso)
  const visit = (o, frozen) => {
    const fixed = frozen || o.userData.dynamic || skip(o);
    if (o.isMesh) users.set(o.geometry, (users.get(o.geometry) || 0) + 1);
    if (!fixed && o.isMesh && !o.isInstancedMesh && !o.isSkinnedMesh && !Array.isArray(o.material) && !o.material.transparent && o.visible && o.geometry.attributes.position) {
      const k = `${o.material.uuid}|${o.castShadow}|${o.receiveShadow}`;
      if (!groups.has(k)) groups.set(k, []);
      groups.get(k).push(o);
    }
    for (const c of o.children) visit(c, fixed);
  };
  for (const c of root.children) visit(c, false);

  let removed = 0;
  for (const list of groups.values()) {
    if (list.length < 2) continue;
    let nv = 0, ni = 0;
    for (const m of list) {
      nv += m.geometry.attributes.position.count;
      ni += m.geometry.index ? m.geometry.index.count : m.geometry.attributes.position.count;
    }
    const pos = new Float32Array(nv * 3), nor = new Float32Array(nv * 3), uv = new Float32Array(nv * 2);
    const idx = nv > 65535 ? new Uint32Array(ni) : new Uint16Array(ni);
    const mtx = new THREE.Matrix4(), nmx = new THREE.Matrix3(), v = new THREE.Vector3();
    let vo = 0, io = 0;
    for (const m of list) {
      const g = m.geometry;
      mtx.multiplyMatrices(inv, m.matrixWorld);
      nmx.getNormalMatrix(mtx);
      const p = g.attributes.position, n = g.attributes.normal, t = g.attributes.uv;
      for (let i = 0; i < p.count; i++) {
        const o3 = (vo + i) * 3;
        v.fromBufferAttribute(p, i).applyMatrix4(mtx);
        pos[o3] = v.x;
        pos[o3 + 1] = v.y;
        pos[o3 + 2] = v.z;
        if (n) {
          v.fromBufferAttribute(n, i).applyMatrix3(nmx).normalize();
          nor[o3] = v.x;
          nor[o3 + 1] = v.y;
          nor[o3 + 2] = v.z;
        }
        if (t) {
          uv[(vo + i) * 2] = t.getX(i);
          uv[(vo + i) * 2 + 1] = t.getY(i);
        }
      }
      // si la pieza está espejada (escala negativa), se invierte el orden de los triángulos
      const flip = mtx.determinant() < 0;
      if (g.index) {
        const a = g.index.array;
        for (let i = 0; i < a.length; i += 3) {
          idx[io++] = a[i] + vo;
          idx[io++] = a[flip ? i + 2 : i + 1] + vo;
          idx[io++] = a[flip ? i + 1 : i + 2] + vo;
        }
      } else {
        for (let i = 0; i < p.count; i += 3) {
          idx[io++] = vo + i;
          idx[io++] = vo + (flip ? i + 2 : i + 1);
          idx[io++] = vo + (flip ? i + 1 : i + 2);
        }
      }
      vo += p.count;
    }
    const geo = new THREE.BufferGeometry();
    geo.setAttribute('position', new THREE.BufferAttribute(pos, 3));
    geo.setAttribute('normal', new THREE.BufferAttribute(nor, 3));
    geo.setAttribute('uv', new THREE.BufferAttribute(uv, 2));
    geo.setIndex(new THREE.BufferAttribute(idx, 1));
    geo.computeBoundingSphere();
    const merged = new THREE.Mesh(geo, list[0].material);
    merged.castShadow = list[0].castShadow;
    merged.receiveShadow = list[0].receiveShadow;
    merged.userData.merged = true;
    root.add(merged);
    track?.push(geo);
    for (const m of list) {
      m.parent.remove(m);
      const left = users.get(m.geometry) - 1;
      users.set(m.geometry, left);
      if (left === 0 && !keep.has(m.geometry)) m.geometry.dispose();
      removed++;
    }
  }
  return removed;
}
