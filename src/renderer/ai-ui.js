import { TextSelection } from '@tiptap/pm/state';
import { icon } from './icons.js';
import { h, toast } from './ui.js';
import { DIAGRAM_KINDS, emptyDiagram, insertBlock } from './blocks.js';

const api = window.notesApp;
let openSettingsAt = () => {};
export const setSettingsOpener = (fn) => (openSettingsAt = fn);

/* ------------------------------------------------------------ busy pill */

let busyEl = null;

function busy(label, id) {
  busyEl?.remove();
  busyEl = h(
    'div',
    { class: 'ai-busy' },
    h('span', { class: 'ai-spin' }),
    h('span', {}, label),
    h('button', { class: 'btn ghost sm', onclick: () => api.ai.cancel(id) }, 'Annuler')
  );
  document.body.append(busyEl);
  requestAnimationFrame(() => busyEl?.classList.add('show'));
}

function idle() {
  const el = busyEl;
  busyEl = null;
  if (!el) return;
  el.classList.remove('show');
  setTimeout(() => el.remove(), 200);
}

let seq = 0;
/** Runs one AI call with the busy indicator; returns the value or null. */
async function run(label, call, ...args) {
  const id = `r${++seq}`;
  busy(label, id);
  try {
    const r = await call(id, ...args);
    if (r.ok) return r.value;
    if (r.error.code === 'no-key' || r.error.code === 'auth') {
      toast(r.error.message, 'error');
      openSettingsAt('ai');
    } else if (r.error.code !== 'aborted') toast(r.error.message, 'error');
    return null;
  } finally {
    idle();
  }
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
  const { from, to, empty } = editor.state.selection;
  const scope = empty ? null : { from, to };
  const blocks = textBlocks(editor.state.doc, scope?.from, scope?.to);
  const text = blocks.map((b) => b.text).join('\n');
  if (!text.trim()) return toast('Il n’y a pas encore de texte à corriger', 'error');
  if (text.length > 120000) return toast('Le cours est très long : sélectionne une partie à corriger', 'error');

  const list = await run(scope ? 'Claude relit la sélection…' : 'Claude relit ton cours…', api.ai.correct, text);
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
    const tr = editor.state.tr.setSelection(TextSelection.create(editor.state.doc, r.from, r.to)).scrollIntoView();
    editor.view.dispatch(tr);
    editor.view.focus();
  };

  const listEl = h('div', { class: 'cx-list' });
  const countEl = h('span', { class: 'cx-count' });
  const render = () => {
    const todo = items.filter((c) => c.state === 'todo');
    countEl.textContent = todo.length ? `${todo.length} à revoir` : 'Terminé';
    listEl.innerHTML = '';
    items.forEach((c) => {
      const card = h(
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
      );
      listEl.append(card);
    });
  };

  panel = h(
    'aside',
    { class: 'cx-panel' },
    h(
      'div',
      { class: 'cx-head' },
      h('div', {}, h('b', {}, `${items.length} correction${items.length > 1 ? 's' : ''}`), countEl),
      h('button', { class: 'icon-btn', title: 'Fermer', onclick: closePanel, html: icon('x', 17) })
    ),
    h(
      'div',
      { class: 'cx-bar' },
      h(
        'button',
        {
          class: 'btn primary sm',
          html: icon('check', 15) + '<span>Tout corriger</span>',
          onclick: () => {
            items.filter((c) => c.state === 'todo').forEach(apply);
            render();
            toast('Corrections appliquées');
          },
        }
      )
    ),
    listEl
  );
  document.body.append(panel);
  render();
}

/* ------------------------------------------------------------- dialogs */

function dialog(build) {
  const overlay = h('div', { class: 'overlay' });
  const close = () => {
    overlay.classList.remove('open');
    setTimeout(() => overlay.remove(), 150);
    document.removeEventListener('keydown', onKey, true);
  };
  const onKey = (e) => e.key === 'Escape' && (e.stopPropagation(), close());
  document.addEventListener('keydown', onKey, true);
  overlay.addEventListener('mousedown', (e) => e.target === overlay && close());
  const box = h('div', { class: 'modal ai-dialog' });
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
    const req = h('textarea', { class: 'input area', rows: '3', placeholder: 'Ex. : les causes de la Première Guerre mondiale. Laisse vide pour que Claude se base sur ton cours.' });
    req.value = opts.request || '';
    const insert = (data) => {
      const attrs = { kind, palette: 'iris', title: data.title || '', items: data.items };
      if (opts.replace != null) {
        editor.view.dispatch(editor.state.tr.setNodeMarkup(opts.replace, undefined, { ...editor.state.doc.nodeAt(opts.replace).attrs, ...attrs, kind }));
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
        h(
          'button',
          {
            class: 'btn primary',
            html: icon('sparkle', 16) + '<span>Générer avec l’IA</span>',
            onclick: async () => {
              close();
              const data = await run('Claude dessine ton schéma…', api.ai.diagram, { kind, request: req.value.trim(), context: courseText(editor) });
              if (data?.items?.length) insert(data);
            },
          }
        )
      )
    );
    setTimeout(() => req.focus(), 60);
  });
}

const STYLES = [
  { id: 'flat', label: 'Illustration' },
  { id: 'schema', label: 'Schéma légendé' },
  { id: 'line', label: 'Dessin au trait' },
  { id: 'icon', label: 'Icône' },
];

export function illustrationDialog(editor) {
  let style = 'schema';
  dialog((box, close) => {
    const req = h('textarea', { class: 'input area', rows: '3', placeholder: 'Ex. : le cycle de l’eau avec évaporation, condensation et précipitations' });
    const chips = h(
      'div',
      { class: 'seg' },
      STYLES.map((s) =>
        h(
          'button',
          {
            class: `seg-btn${s.id === style ? ' on' : ''}`,
            onclick: (e) => {
              style = s.id;
              chips.querySelectorAll('.seg-btn').forEach((b) => b.classList.remove('on'));
              e.currentTarget.classList.add('on');
            },
          },
          s.label
        )
      )
    );
    const go = async () => {
      const request = req.value.trim();
      if (!request) return req.focus();
      close();
      const svg = await run('Claude dessine ton illustration… (environ une minute)', api.ai.illustration, { request, style });
      if (!svg) return;
      const src = `data:image/svg+xml;base64,${btoa(unescape(encodeURIComponent(svg)))}`;
      editor.chain().focus().command(({ state, commands }) => insertBlock(state, commands, { type: 'image', attrs: { src, alt: request } })).run();
      toast('Illustration ajoutée : clique dessus pour la placer');
    };
    req.addEventListener('keydown', (e) => e.key === 'Enter' && (e.ctrlKey || e.metaKey) && go());
    box.append(
      h('h3', {}, 'Créer une illustration'),
      h('p', { class: 'modal-text' }, 'Décris ce que tu veux voir. Claude dessine une illustration vectorielle nette, que tu pourras placer et redimensionner comme une image.'),
      req,
      h('label', { class: 'set-help' }, 'Style'),
      chips,
      h('div', { class: 'modal-actions' }, h('button', { class: 'btn ghost', onclick: close }, 'Annuler'), h('button', { class: 'btn primary', html: icon('sparkle', 16) + '<span>Dessiner</span>', onclick: go }))
    );
    setTimeout(() => req.focus(), 60);
  });
}
