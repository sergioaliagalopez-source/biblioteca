// Almacenamiento local (IndexedDB): libros, archivos PDF y categorías.
// Los PDF se guardan aparte para no cargarlos al listar la estantería.
// Si el navegador no deja guardar datos (p. ej. un archivo abierto con doble clic y
// Chrome configurado para bloquear datos de sitios), se usa memoria y `db.persistent` es false.

const DB_NAME = 'biblioteca-old-money';
const VERSION = 2;
const STORES = ['books', 'files', 'categories', 'settings'];
let dbPromise = null;
const memory = Object.fromEntries(STORES.map((s) => [s, new Map()]));

function open() {
  if (dbPromise) return dbPromise;
  dbPromise = new Promise((resolve) => {
    const fail = (err) => {
      console.warn('IndexedDB no disponible; los libros sólo durarán esta sesión.', err);
      db.persistent = false;
      resolve(null);
    };
    const timer = setTimeout(() => fail(new Error('IndexedDB no respondió')), 5000);
    try {
      const req = indexedDB.open(DB_NAME, VERSION);
      req.onupgradeneeded = () => {
        const idb = req.result;
        for (const name of STORES) {
          if (!idb.objectStoreNames.contains(name)) idb.createObjectStore(name, { keyPath: 'id' });
        }
      };
      req.onsuccess = () => {
        clearTimeout(timer);
        resolve(req.result);
      };
      req.onerror = () => {
        clearTimeout(timer);
        fail(req.error);
      };
    } catch (err) {
      clearTimeout(timer);
      fail(err);
    }
  });
  return dbPromise;
}

async function run(store, mode, fn, fallback) {
  const idb = await open();
  if (!idb) return fallback(memory[store]);
  return new Promise((resolve, reject) => {
    const tx = idb.transaction(store, mode);
    const req = fn(tx.objectStore(store));
    tx.oncomplete = () => resolve(req ? req.result : undefined);
    tx.onerror = () => reject(tx.error);
    tx.onabort = () => reject(tx.error);
  });
}

// Base local del navegador. `db` (abajo) la usa salvo que haya una carpeta conectada.
export const local = {
  all: (store) => run(store, 'readonly', (s) => s.getAll(), (m) => [...m.values()]),
  get: (store, id) => run(store, 'readonly', (s) => s.get(id), (m) => m.get(id)),
  put: (store, value) => run(store, 'readwrite', (s) => s.put(value), (m) => void m.set(value.id, value)),
  del: (store, id) => run(store, 'readwrite', (s) => s.delete(id), (m) => void m.delete(id)),
};

// Libros, archivos y categorías van a la carpeta conectada (OneDrive) si la hay;
// los ajustes de esta PC (como qué carpeta usar) siempre quedan en el navegador.
let folder = null;
const target = (store) => (folder && store !== 'settings' ? folder : local);

export const db = {
  persistent: true,
  useFolder(f) {
    folder = f;
  },
  get folder() {
    return folder;
  },
  all: (store) => target(store).all(store),
  get: (store, id) => target(store).get(store, id),
  put: (store, value) => {
    // La fecha decide qué copia gana al unir la biblioteca de esta PC con la de la carpeta.
    if (store === 'books') value.updatedAt = Date.now();
    return target(store).put(store, value);
  },
  del: (store, id) => target(store).del(store, id),
};

// Preferencias pequeñas (pestaña activa, ambiente, modo de página). Si el navegador
// bloquea localStorage, la app sigue funcionando con los valores por defecto.
export const prefs = {
  get(key) {
    try {
      return localStorage.getItem(key);
    } catch {
      return null;
    }
  },
  set(key, value) {
    try {
      localStorage.setItem(key, value);
    } catch {
      /* sin almacenamiento disponible */
    }
  },
};

export const uid = () => Date.now().toString(36) + Math.random().toString(36).slice(2, 8);
