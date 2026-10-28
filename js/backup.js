// Copia de seguridad: toda la biblioteca (libros, PDF, portadas, categorías, cintas, resaltados y notas),
// las compras y las estadísticas en un solo archivo .biblioteca, para guardarlo o pasarlo a otro dispositivo.
// Formato: «BIBLIO01», 4 bytes con el largo del índice (JSON) y después los archivos uno tras otro.
import { db } from './db.js';

const MAGIC = 'BIBLIO01';

export async function buildBackup({ books, categories, extra = {}, onProgress }) {
  const parts = [];
  let offset = 0;
  const add = (blob) => {
    const at = offset;
    parts.push(blob);
    offset += blob.size;
    return { at, size: blob.size, type: blob.type };
  };
  const out = [];
  for (const [i, b] of books.entries()) {
    onProgress?.(i, books.length);
    const { coverBlob, ...meta } = b;
    const file = await db.get('files', b.id).catch(() => null);
    out.push({ ...meta, cover: coverBlob ? add(coverBlob) : null, pdf: file?.blob ? add(file.blob) : null });
  }
  const index = new TextEncoder().encode(JSON.stringify({ version: 1, createdAt: Date.now(), books: out, categories, ...extra }));
  const head = new Uint8Array(12);
  head.set(new TextEncoder().encode(MAGIC));
  new DataView(head.buffer).setUint32(8, index.length);
  return new Blob([head, index, ...parts], { type: 'application/octet-stream' });
}

// Lee el índice y devuelve cada libro con su portada y su PDF como trozos del archivo (sin cargarlo entero).
export async function readBackup(file) {
  const head = new Uint8Array(await file.slice(0, 12).arrayBuffer());
  if (head.length < 12 || new TextDecoder().decode(head.slice(0, 8)) !== MAGIC) throw new Error('Ese archivo no es una copia de seguridad de Biblioteca.');
  const len = new DataView(head.buffer).getUint32(8);
  let index;
  try {
    index = JSON.parse(await file.slice(12, 12 + len).text());
  } catch {
    throw new Error('La copia de seguridad está incompleta o dañada.');
  }
  const base = 12 + len;
  const part = (r, type) => (r && r.size > 0 && base + r.at + r.size <= file.size ? file.slice(base + r.at, base + r.at + r.size, r.type || type) : null);
  // Lo que falte se completa con valores razonables; lo que no tiene identificador se descarta.
  const str = (v, d = '') => (typeof v === 'string' ? v : d);
  index.createdAt = Number.isFinite(index.createdAt) ? index.createdAt : file.lastModified || Date.now();
  index.categories = (Array.isArray(index.categories) ? index.categories : []).filter((c) => c && typeof c.id === 'string' && c.id).map((c) => ({ ...c, name: str(c.name, 'Sin nombre') }));
  index.books = (Array.isArray(index.books) ? index.books : [])
    .filter((b) => b && typeof b.id === 'string' && b.id)
    .map(({ cover, pdf, ...b }) => ({
      book: {
        ...b,
        title: str(b.title, 'Sin título'),
        author: str(b.author),
        pageCount: Number.isFinite(b.pageCount) ? b.pageCount : 1,
        addedAt: Number.isFinite(b.addedAt) ? b.addedAt : Date.now(),
        highlights: Array.isArray(b.highlights) ? b.highlights.filter((h) => h && Array.isArray(h.rects)) : [],
        coverBlob: part(cover, 'image/jpeg'),
      },
      pdf: part(pdf, 'application/pdf'),
    }));
  return index;
}

// Entrega un archivo al usuario: en el teléfono con la hoja de compartir (Guardar en Archivos, iCloud…),
// en la computadora como descarga. Tiene que llamarse desde un toque o clic.
export async function saveFile(blob, name, title) {
  const file = new File([blob], name, { type: blob.type || 'application/octet-stream' });
  if (matchMedia('(pointer: coarse)').matches && navigator.canShare?.({ files: [file] })) {
    try {
      await navigator.share({ files: [file], title });
      return true;
    } catch (err) {
      if (err.name === 'AbortError') return false;
    }
  }
  const url = URL.createObjectURL(blob);
  const a = document.createElement('a');
  a.href = url;
  a.download = name;
  document.body.appendChild(a);
  a.click();
  a.remove();
  setTimeout(() => URL.revokeObjectURL(url), 60000);
  return true;
}
