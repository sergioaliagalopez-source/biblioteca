// Biblioteca guardada en una carpeta del disco (pensada para OneDrive, que la sube a la nube
// y la sincroniza con tus otras PC). Usa la File System Access API de Chrome/Edge.
//
// Contenido de la carpeta:
//   biblioteca.json     libros (sin imágenes), categorías y fecha de la última modificación
//   libros/<id>.pdf     los PDF
//   portadas/<id>.jpg   las portadas

const INDEX = 'biblioteca.json';

export const folderSupported = typeof window.showDirectoryPicker === 'function';

export function pickFolder() {
  return window.showDirectoryPicker({ id: 'biblioteca', mode: 'readwrite', startIn: 'documents' });
}

// Devuelve true si hay permiso de lectura y escritura. Con `ask`, lo pide (requiere un clic del usuario).
export async function hasPermission(handle, ask = false) {
  const opts = { mode: 'readwrite' };
  if (!handle.queryPermission) return true;
  if ((await handle.queryPermission(opts)) === 'granted') return true;
  return ask && (await handle.requestPermission(opts)) === 'granted';
}

export class FolderStore {
  constructor(handle, { onSaving, onSaved, onError } = {}) {
    this.handle = handle;
    this.name = handle.name;
    Object.assign(this, { onSaving, onSaved, onError });
    this.data = { version: 1, updatedAt: 0, books: [], categories: [] };
    this.covers = new Map();
    this.lastSeen = 0;
    this.pending = Promise.resolve();
  }

  // ---------- Archivos ----------

  async dir(name) {
    return name ? this.handle.getDirectoryHandle(name, { create: true }) : this.handle;
  }

  async readFile(dirName, name) {
    try {
      const fh = await (await this.dir(dirName)).getFileHandle(name);
      return await fh.getFile();
    } catch (err) {
      if (err.name === 'NotFoundError') return null;
      throw err;
    }
  }

  async writeFile(dirName, name, blob) {
    const fh = await (await this.dir(dirName)).getFileHandle(name, { create: true });
    const w = await fh.createWritable();
    await w.write(blob);
    await w.close();
    return fh;
  }

  async removeFile(dirName, name) {
    try {
      await (await this.dir(dirName)).removeEntry(name);
    } catch (err) {
      if (err.name !== 'NotFoundError') throw err;
    }
  }

  // ---------- Índice ----------

  async load() {
    const file = await this.readFile('', INDEX);
    if (file) {
      const parsed = JSON.parse(await file.text());
      this.data = { version: 1, updatedAt: 0, books: [], categories: [], ...parsed };
      this.lastSeen = file.lastModified;
    }
    this.covers.clear();
    await Promise.all(
      this.data.books.map(async (b) => {
        const f = await this.readFile('portadas', `${b.id}.jpg`).catch(() => null);
        if (f) this.covers.set(b.id, f);
      })
    );
  }

  // ¿Alguien (otra PC vía OneDrive) cambió la carpeta desde la última vez que la leímos?
  async changedElsewhere() {
    const file = await this.readFile('', INDEX).catch(() => null);
    return !!file && file.lastModified > this.lastSeen + 1000 && !this.saveTimer;
  }

  scheduleSave() {
    this.onSaving?.();
    clearTimeout(this.saveTimer);
    this.saveTimer = setTimeout(() => this.flush(), 400);
  }

  flush() {
    clearTimeout(this.saveTimer);
    this.saveTimer = null;
    this.data.updatedAt = Date.now();
    const json = new Blob([JSON.stringify(this.data, null, 2)], { type: 'application/json' });
    this.pending = this.pending
      .then(() => this.writeFile('', INDEX, json))
      .then(async (fh) => {
        this.lastSeen = (await fh.getFile()).lastModified;
        this.onSaved?.();
      })
      .catch((err) => this.onError?.(err));
    return this.pending;
  }

  track(promise) {
    this.onSaving?.();
    const p = promise.catch((err) => {
      this.onError?.(err);
      throw err;
    });
    this.pending = this.pending.then(() => p.catch(() => {}));
    return p;
  }

  // ---------- Misma interfaz que la base local ----------

  async all(store) {
    if (store === 'books') return this.data.books.map((b) => ({ ...b, coverBlob: this.covers.get(b.id) || null }));
    if (store === 'categories') return this.data.categories.map((c) => ({ ...c }));
    return [];
  }

  async get(store, id) {
    if (store === 'files') {
      const blob = await this.readFile('libros', `${id}.pdf`);
      return blob ? { id, blob } : undefined;
    }
    return (await this.all(store)).find((x) => x.id === id);
  }

  async put(store, value) {
    if (store === 'files') {
      await this.track(this.writeFile('libros', `${value.id}.pdf`, value.blob));
      return this.onSaved?.();
    }
    if (store === 'books') {
      const { coverBlob, ...meta } = value;
      meta.updatedAt = Date.now();
      if (coverBlob && coverBlob !== this.covers.get(meta.id)) {
        this.covers.set(meta.id, coverBlob);
        this.track(this.writeFile('portadas', `${meta.id}.jpg`, coverBlob));
      } else if (!coverBlob && this.covers.has(meta.id)) {
        this.covers.delete(meta.id);
        this.track(this.removeFile('portadas', `${meta.id}.jpg`));
      }
      upsert(this.data.books, meta);
    } else if (store === 'categories') {
      upsert(this.data.categories, { ...value });
    }
    this.scheduleSave();
  }

  async del(store, id) {
    if (store === 'files') return this.track(this.removeFile('libros', `${id}.pdf`));
    if (store === 'books') {
      this.data.books = this.data.books.filter((b) => b.id !== id);
      this.covers.delete(id);
      this.track(this.removeFile('portadas', `${id}.jpg`));
    } else if (store === 'categories') {
      this.data.categories = this.data.categories.filter((c) => c.id !== id);
    }
    this.scheduleSave();
  }

  // ---------- Primera conexión: sumar lo que había en esta PC ----------

  // Copia a la carpeta los libros y categorías locales que todavía no estén allí.
  // Las categorías con el mismo nombre se unen; si un libro existe en ambos lados gana el más reciente.
  async mergeFrom(local, onProgress) {
    const catMap = new Map();
    for (const c of await local.all('categories')) {
      const same = this.data.categories.find((x) => x.id === c.id || x.name.toLowerCase() === c.name.toLowerCase());
      if (same) catMap.set(c.id, same.id);
      else {
        this.data.categories.push({ ...c });
        catMap.set(c.id, c.id);
      }
    }
    const books = await local.all('books');
    let i = 0;
    for (const b of books) {
      onProgress?.(++i, books.length);
      const book = { ...b, categoryId: catMap.get(b.categoryId) ?? b.categoryId ?? '' };
      const there = this.data.books.find((x) => x.id === b.id);
      if (there && (there.updatedAt || 0) >= (b.updatedAt || 0)) continue;
      if (!there) {
        const file = await local.get('files', b.id);
        if (!file) continue;
        await this.writeFile('libros', `${b.id}.pdf`, file.blob);
      }
      await this.put('books', book);
    }
    this.data.seeded = this.data.seeded || this.data.categories.length > 0;
    await this.pending;
    await this.flush();
  }
}

function upsert(list, item) {
  const i = list.findIndex((x) => x.id === item.id);
  if (i >= 0) list[i] = item;
  else list.push(item);
}
