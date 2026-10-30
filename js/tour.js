// Recorrido de bienvenida: ilumina un elemento de la pantalla por vez y explica para qué sirve.
// Cada paso: { el: selector o null (tarjeta centrada), title, text }. Los elementos que no se ven se saltan.

export function runTour(steps, { done = 'Empezar a leer', next = 'Siguiente', skip = 'Saltar' } = {}) {
  return new Promise((resolve) => {
    const list = steps.filter((s) => !s.el || visible(document.querySelector(s.el)));
    if (!list.length) return resolve();
    const root = document.createElement('div');
    root.className = 'tour';
    root.innerHTML = `<div class="tour-hole"></div>
      <div class="tour-card" role="dialog" aria-live="polite">
        <div class="tour-dots"></div>
        <h3></h3><p></p>
        <div class="tour-actions"><button class="link-light tour-skip"></button><button class="btn-gold tour-next"></button></div>
      </div>`;
    document.body.appendChild(root);
    const hole = root.querySelector('.tour-hole');
    const card = root.querySelector('.tour-card');
    const dots = root.querySelector('.tour-dots');
    dots.innerHTML = list.map(() => '<i></i>').join('');
    root.querySelector('.tour-skip').textContent = skip;
    let i = 0;

    const place = () => {
      const step = list[i];
      const el = step.el && document.querySelector(step.el);
      const r = el && visible(el) ? el.getBoundingClientRect() : null;
      root.classList.toggle('centered', !r);
      if (r) {
        const pad = 8;
        Object.assign(hole.style, { left: `${r.left - pad}px`, top: `${r.top - pad}px`, width: `${r.width + pad * 2}px`, height: `${r.height + pad * 2}px` });
        // la tarjeta va debajo del elemento si hay lugar; si no, encima
        const cw = Math.min(340, innerWidth - 32);
        const left = Math.max(16, Math.min(innerWidth - cw - 16, r.left + r.width / 2 - cw / 2));
        card.style.width = `${cw}px`;
        card.style.left = `${left}px`;
        const below = r.bottom + 18;
        const ch = card.offsetHeight || 170;
        if (below + ch < innerHeight - 12) {
          card.style.top = `${below}px`;
          card.style.bottom = '';
        } else {
          card.style.top = '';
          card.style.bottom = `${Math.max(12, innerHeight - r.top + 18)}px`;
        }
      } else {
        Object.assign(hole.style, { left: '50%', top: '50%', width: '0px', height: '0px' });
        Object.assign(card.style, { left: '', top: '', bottom: '', width: '' });
      }
    };
    const show = () => {
      const step = list[i];
      card.querySelector('h3').textContent = step.title;
      card.querySelector('p').textContent = step.text;
      root.querySelector('.tour-next').textContent = i === list.length - 1 ? done : next;
      [...dots.children].forEach((d, k) => d.classList.toggle('on', k === i));
      card.classList.remove('in');
      void card.offsetWidth;
      card.classList.add('in');
      place();
    };
    const finish = () => {
      removeEventListener('resize', place);
      removeEventListener('keydown', onKey);
      root.classList.add('out');
      setTimeout(() => root.remove(), 280);
      resolve();
    };
    const onKey = (e) => {
      if (e.key === 'Escape') finish();
      else if (e.key === 'Enter' || e.key === 'ArrowRight') go();
    };
    const go = () => {
      if (i < list.length - 1) {
        i++;
        show();
      } else finish();
    };
    root.querySelector('.tour-next').addEventListener('click', go);
    root.querySelector('.tour-skip').addEventListener('click', finish);
    addEventListener('resize', place);
    addEventListener('keydown', onKey);
    requestAnimationFrame(() => {
      root.classList.add('on');
      show();
      root.querySelector('.tour-next').focus({ preventScroll: true });
    });
  });
}

function visible(el) {
  if (!el) return false;
  const r = el.getBoundingClientRect();
  return r.width > 0 && r.height > 0 && getComputedStyle(el).visibility !== 'hidden';
}
