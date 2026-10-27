// Tarjeta de cita: convierte un resaltado en una imagen elegante (1080 × 1350, formato de redes)
// con la tela del libro de fondo, la cita en un papel color crema, el título, el autor y la portada.
import { shade } from './textures.js';

const SERIF = '"Cormorant Garamond", "EB Garamond", Georgia, serif';
const W = 1080, H = 1350;

function loadImage(url) {
  return new Promise((resolve) => {
    if (!url) return resolve(null);
    const img = new Image();
    img.onload = () => resolve(img);
    img.onerror = () => resolve(null);
    img.src = url;
  });
}

// Corta el texto en renglones que entren en el ancho dado.
function wrap(g, text, maxW) {
  const lines = [];
  let line = '';
  for (const word of text.split(/\s+/)) {
    const test = line ? `${line} ${word}` : word;
    if (g.measureText(test).width > maxW && line) {
      lines.push(line);
      line = word;
    } else line = test;
  }
  if (line) lines.push(line);
  return lines;
}

export async function quoteCard({ text, title, author, page, color = '#3b2a1e', coverUrl }) {
  const c = document.createElement('canvas');
  c.width = W;
  c.height = H;
  const g = c.getContext('2d');
  // fondo: la tela del libro, con un poco de textura
  const bg = g.createLinearGradient(0, 0, W, H);
  bg.addColorStop(0, shade(color, 0.12));
  bg.addColorStop(1, shade(color, -0.45));
  g.fillStyle = bg;
  g.fillRect(0, 0, W, H);
  for (let i = 0; i < 9000; i++) {
    g.fillStyle = `rgba(${Math.random() < 0.5 ? '255,255,255' : '0,0,0'},0.035)`;
    g.fillRect(Math.random() * W, Math.random() * H, 2, 2);
  }
  // papel con filete dorado
  const px = 80, py = 90, pw = W - 2 * px, ph = H - 2 * py - 120;
  g.shadowColor = 'rgba(0,0,0,0.45)';
  g.shadowBlur = 40;
  g.shadowOffsetY = 14;
  g.fillStyle = '#f3ead6';
  g.fillRect(px, py, pw, ph);
  g.shadowColor = 'transparent';
  g.strokeStyle = '#c6a15b';
  g.lineWidth = 2;
  g.strokeRect(px + 22, py + 22, pw - 44, ph - 44);
  // comillas grandes
  g.fillStyle = '#c6a15b';
  g.font = `600 180px ${SERIF}`;
  g.textAlign = 'center';
  g.fillText('“', W / 2, py + 190);
  // la cita, del tamaño más grande que entre
  const quote = text.length > 600 ? text.slice(0, 600).replace(/\s+\S*$/, '') + '…' : text;
  const box = { x: px + 90, w: pw - 180, top: py + 230, bottom: py + ph - 250 };
  let size = 64, lines, lh;
  for (; size >= 30; size -= 2) {
    g.font = `italic 500 ${size}px ${SERIF}`;
    lines = wrap(g, quote, box.w);
    lh = size * 1.32;
    if (lines.length * lh <= box.bottom - box.top) break;
  }
  g.fillStyle = '#2a1d12';
  const y0 = box.top + (box.bottom - box.top - lines.length * lh) / 2 + size;
  lines.forEach((l, i) => g.fillText(l, W / 2, y0 + i * lh));
  // filete y datos del libro
  const fy = py + ph - 200;
  g.strokeStyle = '#c6a15b';
  g.beginPath();
  g.moveTo(W / 2 - 60, fy);
  g.lineTo(W / 2 + 60, fy);
  g.stroke();
  const cover = await loadImage(coverUrl);
  let tx = W / 2;
  if (cover) {
    const ch = 130, cw = Math.min(110, ch * (cover.width / cover.height));
    g.shadowColor = 'rgba(0,0,0,0.3)';
    g.shadowBlur = 12;
    g.drawImage(cover, px + 110, fy + 30, cw, ch);
    g.shadowColor = 'transparent';
    tx = W / 2 + 50;
  }
  g.fillStyle = '#24170d';
  g.font = `600 40px ${SERIF}`;
  const t = wrap(g, title, pw - (cover ? 360 : 200))[0] + (g.measureText(title).width > pw - (cover ? 360 : 200) ? '…' : '');
  g.fillText(t, tx, fy + 75);
  g.fillStyle = '#6b5333';
  g.font = `italic 500 32px ${SERIF}`;
  g.fillText([author, page ? `página ${page}` : ''].filter(Boolean).join(' · '), tx, fy + 125);
  // firma de la app
  g.fillStyle = 'rgba(244,236,219,0.85)';
  g.strokeStyle = 'rgba(244,236,219,0.85)';
  g.lineWidth = 2;
  g.beginPath();
  g.arc(W / 2 - 120, H - 95, 24, 0, Math.PI * 2);
  g.stroke();
  g.font = `italic 600 30px ${SERIF}`;
  g.fillText('B', W / 2 - 120, H - 85);
  g.font = `500 30px ${SERIF}`;
  g.textAlign = 'left';
  const label = 'B I B L I O T E C A';
  g.fillText(label, W / 2 - 80, H - 85);
  return new Promise((resolve) => c.toBlob(resolve, 'image/png'));
}
