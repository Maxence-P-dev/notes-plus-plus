import { TextSelection } from '@tiptap/pm/state';
import { icon } from './icons.js';
import { h, toast } from './ui.js';
import { DIAGRAM_KINDS, emptyDiagram, insertBlock } from './blocks.js';

const api = window.notesApp;
let openSettingsAt = () => {};
export const setSettingsOpener = (fn) => (openSettingsAt = fn);

/* ------------------------------------------------------------ busy pill */

let busyEl = null;
let busyId = null;

function busy(label, id) {
  busyEl?.remove();
  busyId = id;
  busyEl = h(
    'div',
    { class: 'ai-busy' },
    h('span', { class: 'ai-spin' }),
    h('span', { class: 'ai-busy-label' }, label),
    h('button', { class: 'btn ghost sm', onclick: () => api.ai.cancel(id) }, 'Annuler')
  );
  document.body.append(busyEl);
  requestAnimationFrame(() => busyEl?.classList.add('show'));
}

function idle() {
  const el = busyEl;
  busyEl = null;
  busyId = null;
  if (!el) return;
  el.classList.remove('show');
  setTimeout(() => el.remove(), 200);
}

api.onAiProgress(({ id, n, step, steps, verify, verifies }) => {
  if (id !== busyId || !busyEl) return;
  const label = busyEl.querySelector('.ai-busy-label');
  if (verifies) label.textContent = `L’IA vérifie ses propositions… ${verify} sur ${verifies}`;
  else if (steps) label.textContent = steps > 1 ? `L’IA relit ton cours… partie ${step} sur ${steps}` : 'L’IA relit ton cours…';
  else if (n) label.textContent = `L’IA écrit… ${n} caractères`;
});

let seq = 0;
/** Runs one AI call with the busy indicator; returns the value or null. */
async function run(label, call, ...args) {
  const id = `r${++seq}`;
  busy(label, id);
  try {
    const r = await call(id, ...args);
    if (r.ok) return r.value;
    if (r.error.code === 'no-model') {
      toast(r.error.message, 'error');
      openSettingsAt('ai');
    } else if (r.error.code !== 'aborted') toast(r.error.message, 'error');
    return null;
  } finally {
    idle();
  }
}

/** True when a model is installed; otherwise points to the settings. */
async function ready() {
  const r = await api.ai.status();
  if (r.ok && r.value.active) return true;
  toast('Installe d’abord l’IA de Notes++ (une seule fois)', 'error');
  openSettingsAt('ai');
  return false;
}

/* ------------------------------------------------------------ text map */

// Text of every textblock in [from, to], with a map back to document positions.
function textBlocks(doc, from = 0, to = doc.content.size) {
  const blocks = [];
  doc.nodesBetween(from, to, (node, pos) => {
    if (!node.isTextblock) return true;
    const segs = [];
    let text = '';
    node.forEach((child, offset) => {
      if (!child.isText) return;
      const start = pos + 1 + offset;
      let s = child.text;
      let a = start;
      if (a < from) {
        s = s.slice(from - a);
        a = from;
      }
      if (a + s.length > to) s = s.slice(0, Math.max(0, to - a));
      if (!s) return;
      segs.push({ at: text.length, pos: a, len: s.length });
      text += s;
    });
    if (text.trim()) blocks.push({ text, segs });
    return false;
  });
  return blocks;
}

function locate(blocks, original) {
  for (const b of blocks) {
    const i = b.text.indexOf(original);
    if (i < 0) continue;
    const toPos = (k) => {
      const seg = b.segs.findLast((sg) => sg.at <= k) || b.segs[0];
      return seg.pos + Math.min(k - seg.at, seg.len);
    };
    return { from: toPos(i), to: toPos(i + original.length) };
  }
  return null;
}

export const courseText = (editor) => textBlocks(editor.state.doc).map((b) => b.text).join('\n');

/* ------------------------------------------------------- spell checking */

let panel = null;

function closePanel() {
  panel?.remove();
  panel = null;
}

export async function correct(editor) {
  if (!(await ready())) return;
  const { from, to, empty } = editor.state.selection;
  const blocks = empty ? textBlocks(editor.state.doc) : textBlocks(editor.state.doc, from, to);
  const text = blocks.map((b) => b.text).join('\n');
  if (!text.trim()) return toast('Il n’y a pas encore de texte à corriger', 'error');

  const list = await run(empty ? 'L’IA relit ton cours…' : 'L’IA relit la sélection…', api.ai.correct, text);
  if (!list) return;
  if (!list.length) return toast('Aucune faute trouvée, bravo !');
  showCorrections(editor, list);
}

function showCorrections(editor, list) {
  closePanel();
  const items = list.map((c) => ({ ...c, state: 'todo' }));
  // Positions shift after each fix, so every lookup searches the current document again.
  const find = (c) => locate(textBlocks(editor.state.doc), c.original);
  const apply = (c) => {
    const r = find(c);
    if (!r) {
      c.state = 'lost';
      return false;
    }
    editor.view.dispatch(editor.state.tr.insertText(c.replacement, r.from, r.to)); // keeps bold, colour…
    c.state = 'done';
    return true;
  };
  const show = (c) => {
    const r = find(c);
    if (!r) return;
    editor.view.dispatch(editor.state.tr.setSelection(TextSelection.create(editor.state.doc, r.from, r.to)).scrollIntoView());
    editor.view.focus();
  };

  const listEl = h('div', { class: 'cx-list' });
  const countEl = h('span', { class: 'cx-count' });
  const render = () => {
    const todo = items.filter((c) => c.state === 'todo');
    countEl.textContent = todo.length ? `${todo.length} à revoir` : 'Terminé';
    listEl.innerHTML = '';
    items.forEach((c) => {
      listEl.append(
        h(
          'div',
          { class: `cx-item ${c.state}`, onclick: () => c.state === 'todo' && show(c) },
          h('div', { class: 'cx-diff' }, h('del', {}, c.original), h('span', { class: 'cx-arrow', html: icon('chevron', 12) }), h('ins', {}, c.replacement)),
          h('div', { class: 'cx-why' }, c.reason),
          c.state === 'todo'
            ? h(
                'div',
                { class: 'cx-actions' },
                h('button', { class: 'btn primary sm', onclick: (e) => (e.stopPropagation(), apply(c), render()) }, 'Corriger'),
                h('button', { class: 'btn ghost sm', onclick: (e) => (e.stopPropagation(), (c.state = 'skip'), render()) }, 'Ignorer')
              )
            : h('div', { class: 'cx-state' }, c.state === 'done' ? '✓ Corrigé' : c.state === 'skip' ? 'Ignoré' : 'Texte modifié entre-temps')
        )
      );
    });
  };

  panel = h(
    'aside',
    { class: 'cx-panel' },
    h(
      'div',
      { class: 'cx-head' },
      h('div', {}, h('b', {}, `${items.length} correction${items.length > 1 ? 's' : ''} proposée${items.length > 1 ? 's' : ''}`), countEl),
      h('button', { class: 'icon-btn', title: 'Fermer', onclick: closePanel, html: icon('x', 17) })
    ),
    h(
      'div',
      { class: 'cx-bar' },
      h('button', {
        class: 'btn primary sm',
        html: icon('check', 15) + '<span>Tout corriger</span>',
        onclick: () => {
          items.filter((c) => c.state === 'todo').forEach(apply);
          render();
          toast('Corrections appliquées');
        },
      }),
      h('p', { class: 'cx-note' }, 'Vérifie chaque proposition : l’IA peut se tromper.')
    ),
    listEl
  );
  document.body.append(panel);
  render();
}

/* ------------------------------------------------------------- dialogs */

function dialog(build, cls = '') {
  const overlay = h('div', { class: 'overlay' });
  const close = () => {
    overlay.classList.remove('open');
    setTimeout(() => overlay.remove(), 150);
    document.removeEventListener('keydown', onKey, true);
  };
  const onKey = (e) => e.key === 'Escape' && (e.stopPropagation(), close());
  document.addEventListener('keydown', onKey, true);
  overlay.addEventListener('mousedown', (e) => e.target === overlay && close());
  const box = h('div', { class: `modal ai-dialog ${cls}` });
  build(box, close);
  overlay.append(box);
  document.body.append(overlay);
  requestAnimationFrame(() => overlay.classList.add('open'));
}

/** opts.replace = position of an existing diagram to regenerate */
export function diagramDialog(editor, opts = {}) {
  let kind = opts.kind || 'mindmap';
  dialog((box, close) => {
    const grid = h('div', { class: 'kind-grid' });
    DIAGRAM_KINDS.forEach((k) =>
      grid.append(
        h(
          'button',
          {
            class: `kind-card${k.id === kind ? ' on' : ''}`,
            onclick: (e) => {
              kind = k.id;
              grid.querySelectorAll('.kind-card').forEach((b) => b.classList.remove('on'));
              e.currentTarget.classList.add('on');
            },
          },
          h('span', { class: `kind-pic kp-${k.id}` }, ...Array.from({ length: 4 }, () => h('i'))),
          h('b', {}, k.label),
          h('span', {}, k.hint)
        )
      )
    );
    const req = h('textarea', { class: 'input area', rows: '3', placeholder: 'Ex. : les causes de la Première Guerre mondiale. Laisse vide pour que l’IA se base sur ton cours.' });
    req.value = opts.request || '';
    const insert = (data) => {
      const attrs = { kind, palette: 'iris', title: data.title || '', items: data.items };
      if (opts.replace != null) {
        editor.view.dispatch(editor.state.tr.setNodeMarkup(opts.replace, undefined, { ...editor.state.doc.nodeAt(opts.replace).attrs, ...attrs }));
      } else editor.chain().focus().insertDiagram(attrs).run();
    };
    box.append(
      h('h3', {}, opts.replace != null ? 'Régénérer le schéma' : 'Insérer un schéma'),
      h('p', { class: 'modal-text' }, 'Choisis une forme. Tu pourras ensuite cliquer dans chaque case pour écrire et changer les couleurs.'),
      grid,
      h('label', { class: 'set-help' }, 'Que doit montrer le schéma ?'),
      req,
      h(
        'div',
        { class: 'modal-actions' },
        opts.replace != null ? null : h('button', { class: 'btn ghost', onclick: () => (close(), insert(emptyDiagram(kind))) }, 'Vide, à remplir'),
        h('button', {
          class: 'btn primary',
          html: icon('sparkle', 16) + '<span>Générer avec l’IA</span>',
          onclick: async () => {
            if (!(await ready())) return close();
            close();
            const data = await run('L’IA prépare ton schéma…', api.ai.diagram, { kind, request: req.value.trim(), context: courseText(editor) });
            if (data?.items?.length) insert(data);
          },
        })
      )
    );
    setTimeout(() => req.focus(), 60);
  });
}

/* ---------------------------------------------------------- pictograms */

let pictos = null;
const norm = (s) => s.normalize('NFD').replace(/[̀-ͯ]/g, '').toLowerCase();

async function loadPictos() {
  if (!pictos) {
    const list = await (await fetch('pictos.json')).json();
    pictos = list.map((p) => ({ ...p, k: norm(`${p.l} ${p.t}`), n: norm(p.l) }));
  }
  return pictos;
}

function searchPictos(query, limit = 60) {
  const words = norm(query).split(/[\s,;']+/).filter((w) => w.length > 1);
  if (!words.length) return [];
  const scored = [];
  for (const p of pictos) {
    let score = 0;
    for (const w of words) {
      if (p.n === w) score += 10;
      else if (p.n.startsWith(w)) score += 6;
      else if (` ${p.k}`.includes(` ${w}`)) score += 3;
      else if (p.k.includes(w)) score += 1;
    }
    if (score) scored.push([score, p]);
  }
  return scored
    .sort((a, b) => b[0] - a[0] || a[1].l.length - b[1].l.length)
    .slice(0, limit)
    .map(([, p]) => p);
}

const SIZES = [
  { id: 96, label: 'Petit' },
  { id: 160, label: 'Moyen' },
  { id: 260, label: 'Grand' },
];

export function pictoDialog(editor) {
  let size = 160;
  dialog((box, close) => {
    const input = h('input', { class: 'input', placeholder: 'Rechercher : plante, soleil, cœur, Terre, livre…', spellcheck: 'false' });
    const grid = h('div', { class: 'picto-grid' });
    const info = h('div', { class: 'picto-info' });
    const insert = (p) => {
      close();
      const svg = p.s.replace('<svg ', `<svg width="${size}" height="${size}" `);
      const src = `data:image/svg+xml;base64,${btoa(unescape(encodeURIComponent(svg)))}`;
      editor
        .chain()
        .focus()
        .command(({ state, commands }) => insertBlock(state, commands, { type: 'image', attrs: { src, alt: p.l, width: size, height: size, align: 'center' } }))
        .run();
    };
    const show = (list, title) => {
      grid.innerHTML = '';
      info.textContent = title;
      list.forEach((p) => grid.append(h('button', { class: 'picto', title: p.l, html: p.s, onclick: () => insert(p) })));
    };
    const doSearch = () => {
      const q = input.value.trim();
      if (!q) return show(pictos.filter((p) => [4, 5, 6, 7].includes(p.g)).slice(0, 60), 'Quelques idées');
      const r = searchPictos(q);
      show(r, r.length ? `${r.length} résultat${r.length > 1 ? 's' : ''}` : 'Aucun résultat. Essaie un autre mot.');
    };
    let t;
    input.addEventListener('input', () => {
      clearTimeout(t);
      t = setTimeout(doSearch, 120);
    });
    const sizes = h(
      'div',
      { class: 'seg' },
      SIZES.map((s) =>
        h(
          'button',
          {
            class: `seg-btn${s.id === size ? ' on' : ''}`,
            onclick: (e) => {
              size = s.id;
              sizes.querySelectorAll('.seg-btn').forEach((b) => b.classList.remove('on'));
              e.currentTarget.classList.add('on');
            },
          },
          s.label
        )
      )
    );
    const suggest = h('button', {
      class: 'btn soft',
      html: icon('sparkle', 15) + '<span>Idées de l’IA</span>',
      onclick: async () => {
        if (!(await ready())) return close();
        const words = await run('L’IA cherche des idées…', api.ai.keywords, { request: input.value.trim(), context: courseText(editor) });
        if (!words?.length) return;
        const seen = new Set();
        const list = words.flatMap((w) => searchPictos(w, 8)).filter((p) => !seen.has(p.l) && seen.add(p.l));
        show(list, `Idées de l’IA : ${words.join(', ')}`);
      },
    });
    box.append(
      h('h3', {}, 'Ajouter un pictogramme'),
      h('div', { class: 'picto-bar' }, input, suggest),
      h('div', { class: 'picto-row' }, info, sizes),
      grid,
      h('p', { class: 'picto-credit' }, 'Dessins Twemoji (CC-BY 4.0). Clique pour l’insérer, puis place-le comme une image.')
    );
    loadPictos().then(doSearch);
    setTimeout(() => input.focus(), 60);
  }, 'picto-dialog');
}
