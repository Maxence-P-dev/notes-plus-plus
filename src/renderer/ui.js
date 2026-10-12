import { icon } from './icons.js';

export const $ = (sel, root = document) => root.querySelector(sel);

export function h(tag, attrs = {}, ...children) {
  const el = document.createElement(tag);
  for (const [k, v] of Object.entries(attrs)) {
    if (v == null || v === false) continue;
    if (k === 'class') el.className = v;
    else if (k === 'html') el.innerHTML = v;
    else if (k.startsWith('on')) el.addEventListener(k.slice(2), v);
    else el.setAttribute(k, v === true ? '' : v);
  }
  for (const c of children.flat()) {
    if (c == null || c === false) continue;
    el.append(c instanceof Node ? c : document.createTextNode(c));
  }
  return el;
}

/* -------------------------------------------------------------- floating */

let floating = null;

export function closeFloating() {
  if (!floating) return;
  const { el, onClose } = floating;
  floating = null;
  el.classList.remove('open');
  setTimeout(() => el.remove(), 120);
  onClose?.();
}

function place(el, { x, y, anchor }) {
  document.body.append(el);
  const r = el.getBoundingClientRect();
  const vw = window.innerWidth;
  const vh = window.innerHeight;
  let left = x;
  let top = y;
  if (anchor) {
    const a = anchor.getBoundingClientRect();
    left = a.left;
    top = a.bottom + 6;
    if (top + r.height > vh - 8) top = a.top - r.height - 6;
  }
  left = Math.max(8, Math.min(left, vw - r.width - 8));
  top = Math.max(8, Math.min(top, vh - r.height - 8));
  el.style.left = `${left}px`;
  el.style.top = `${top}px`;
  requestAnimationFrame(() => el.classList.add('open'));
}

export function openFloating(content, pos, { onClose, cls = '' } = {}) {
  closeFloating();
  const el = h('div', { class: `floating ${cls}` }, content);
  el.addEventListener('mousedown', (e) => e.stopPropagation());
  floating = { el, onClose, anchor: pos.anchor };
  place(el, pos);
  return el;
}

export const isFloatingOpen = () => !!floating;

document.addEventListener('mousedown', (e) => {
  if (floating && !(floating.anchor && floating.anchor.contains(e.target))) closeFloating();
});
window.addEventListener('blur', closeFloating);
window.addEventListener('resize', closeFloating);

/** Menu items: { label, icon, kbd, danger, action } or 'sep'. */
export function menuList(items) {
  return h(
    'div',
    { class: 'menu' },
    items.map((it) =>
      it === 'sep'
        ? h('div', { class: 'menu-sep' })
        : h(
            'button',
            {
              class: `menu-item${it.danger ? ' danger' : ''}${it.active ? ' active' : ''}`,
              onclick: () => {
                closeFloating();
                it.action();
              },
            },
            it.icon ? h('span', { class: 'menu-ic', html: icon(it.icon, 16) }) : null,
            h('span', { class: 'menu-label' }, it.label),
            it.kbd ? h('span', { class: 'kbd' }, it.kbd) : null,
            it.active ? h('span', { class: 'menu-check', html: icon('check', 15) }) : null
          )
    )
  );
}

export function contextMenu(e, items) {
  e.preventDefault();
  openFloating(menuList(items), { x: e.clientX, y: e.clientY }, { cls: 'ctx' });
}

/* ----------------------------------------------------------------- modal */

function modal(build) {
  return new Promise((resolve) => {
    const prevFocus = document.activeElement;
    const overlay = h('div', { class: 'overlay' });
    const box = h('div', { class: 'modal' });
    overlay.append(box);
    const done = (v) => {
      overlay.classList.remove('open');
      setTimeout(() => overlay.remove(), 150);
      document.removeEventListener('keydown', onKey, true);
      prevFocus?.focus?.();
      resolve(v);
    };
    const onKey = (e) => {
      if (e.key === 'Escape') {
        e.stopPropagation();
        done(null);
      }
    };
    document.addEventListener('keydown', onKey, true);
    overlay.addEventListener('mousedown', (e) => e.target === overlay && done(null));
    build(box, done);
    document.body.append(overlay);
    requestAnimationFrame(() => overlay.classList.add('open'));
  });
}

export function promptModal({ title, label = '', value = '', placeholder = '', ok = 'Valider' }) {
  return modal((box, done) => {
    const input = h('input', { class: 'input', value, placeholder, spellcheck: 'false' });
    const submit = () => done(input.value.trim() || null);
    input.addEventListener('keydown', (e) => e.key === 'Enter' && submit());
    box.append(
      h('h3', {}, title),
      label ? h('p', { class: 'modal-text' }, label) : null,
      input,
      h(
        'div',
        { class: 'modal-actions' },
        h('button', { class: 'btn ghost', onclick: () => done(null) }, 'Annuler'),
        h('button', { class: 'btn primary', onclick: submit }, ok)
      )
    );
    setTimeout(() => {
      input.focus();
      input.select();
    }, 30);
  });
}

export function confirmModal({ title, text, ok = 'Confirmer', danger = false }) {
  return modal((box, done) => {
    const okBtn = h('button', { class: `btn ${danger ? 'danger' : 'primary'}`, onclick: () => done(true) }, ok);
    box.append(
      h('h3', {}, title),
      h('p', { class: 'modal-text' }, text),
      h('div', { class: 'modal-actions' }, h('button', { class: 'btn ghost', onclick: () => done(false) }, 'Annuler'), okBtn)
    );
    setTimeout(() => okBtn.focus(), 30);
  }).then((v) => !!v);
}

/* ----------------------------------------------------------------- toast */

let toastTimer;
export function toast(msg, kind = 'info') {
  let el = $('#toast');
  if (!el) {
    el = h('div', { id: 'toast' });
    document.body.append(el);
  }
  el.className = `toast ${kind}`;
  el.innerHTML = icon(kind === 'error' ? 'warning' : 'checkCircle', 16);
  el.append(h('span', {}, msg));
  requestAnimationFrame(() => el.classList.add('show'));
  clearTimeout(toastTimer);
  toastTimer = setTimeout(() => el.classList.remove('show'), 2600);
}
