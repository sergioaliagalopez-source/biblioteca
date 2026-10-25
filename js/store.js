// Compras de fondos (con Lemon Squeezy) y modo desarrollador.
//
// Cómo funciona una compra: el botón «Comprar» abre la página de pago de Lemon Squeezy; al pagar,
// el cliente recibe por email un código de licencia; lo pega en la app y se valida contra la API de
// licencias de Lemon Squeezy (no hace falta servidor propio). El fondo queda desbloqueado en ese
// dispositivo; en otro dispositivo se usa el mismo código (hasta el límite de activaciones del producto).
import { prefs } from './db.js';

// Datos de tu tienda en Lemon Squeezy. Completar cuando estén creados los productos
// (ver LEEME.md, «Cobrar los fondos»). Mientras falten, el botón «Comprar» avisa que aún no está listo.
export const PAYMENTS = {
  storeId: null, // número de la tienda (Settings → Stores)
  products: {
    paddock: { checkout: '', productId: null },
    tierra: { checkout: '', productId: null },
  },
};

// ---------- Modo desarrollador ----------
// Todo desbloqueado para probar: automático en la PC (localhost, «Abrir Biblioteca.bat») y, en cualquier
// dispositivo, abriendo una vez la dirección con #dev=TU-CÓDIGO al final (#dev=off lo apaga).
const DEV_HASH = 'c8385a40e7590ff660ec9b1f2a3e9a97c6637f86c2e621974e07c7d1d5370576';

export const devMode = () => ['localhost', '127.0.0.1'].includes(location.hostname) || prefs.get('bib.dev') === '1';

async function sha256(text) {
  const buf = await crypto.subtle.digest('SHA-256', new TextEncoder().encode(text));
  return [...new Uint8Array(buf)].map((b) => b.toString(16).padStart(2, '0')).join('');
}

// Lee #dev=... de la dirección, activa o apaga el modo y lo quita de la barra. Devuelve un mensaje o null.
export async function checkDevLink() {
  const m = location.hash.match(/^#dev=(.+)$/);
  if (!m) return null;
  history.replaceState(null, '', location.pathname + location.search);
  const code = decodeURIComponent(m[1]).trim().toUpperCase();
  if (code === 'OFF') {
    prefs.set('bib.dev', '0');
    return 'Modo desarrollador desactivado';
  }
  if (!crypto?.subtle) return null;
  if ((await sha256(code)) !== DEV_HASH) return 'Código de desarrollador incorrecto';
  prefs.set('bib.dev', '1');
  return 'Modo desarrollador activado: todos los fondos desbloqueados';
}

// ---------- Compras ----------

const readOwned = () => {
  try {
    return JSON.parse(prefs.get('bib.owned') || '{}');
  } catch {
    return {};
  }
};

export const isOwned = (themeId) => !!readOwned()[themeId];

export const paymentsReady = (themeId) => {
  const p = PAYMENTS.products[themeId];
  return !!(PAYMENTS.storeId && p?.checkout && p?.productId);
};

export function checkoutUrl(themeId) {
  return PAYMENTS.products[themeId]?.checkout || '';
}

// Activa un código de licencia. Devuelve el id del fondo desbloqueado o lanza un Error con el motivo.
export async function redeem(rawKey) {
  const key = rawKey.trim();
  if (key.length < 8) throw new Error('Ese código parece incompleto.');
  if (!PAYMENTS.storeId) throw new Error('Los pagos todavía no están configurados en esta versión.');
  const body = new URLSearchParams({ license_key: key, instance_name: `Biblioteca · ${navigator.platform || 'dispositivo'}` });
  let res;
  try {
    const r = await fetch('https://api.lemonsqueezy.com/v1/licenses/activate', { method: 'POST', headers: { Accept: 'application/json' }, body });
    res = await r.json();
  } catch {
    throw new Error('No hay conexión. Prueba de nuevo con internet.');
  }
  if (!res.activated) {
    if (/limit/i.test(res.error || '')) throw new Error('Este código ya se usó en el máximo de dispositivos.');
    throw new Error('Ese código no es válido.');
  }
  const meta = res.meta || {};
  if (String(meta.store_id) !== String(PAYMENTS.storeId)) throw new Error('Ese código no es de esta tienda.');
  const themeId = Object.keys(PAYMENTS.products).find((id) => String(PAYMENTS.products[id].productId) === String(meta.product_id));
  if (!themeId) throw new Error('Ese código no corresponde a ningún fondo.');
  const owned = readOwned();
  owned[themeId] = { key, instance: res.instance?.id || null, at: Date.now() };
  prefs.set('bib.owned', JSON.stringify(owned));
  return themeId;
}
