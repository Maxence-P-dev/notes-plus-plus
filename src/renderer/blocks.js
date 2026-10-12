// Rich blocks: editable diagrams and a free-form shape board.
// Both render static HTML (renderHTML) so they survive saving and PDF export,
// and use a node view in the editor to make every text editable in place.
import { Node, mergeAttributes } from '@tiptap/core';
import { DOMSerializer } from '@tiptap/pm/model';

/* ============================================================== diagrams */

// A selected block (image, diagram…) must not be replaced by the new one: insert after it.
export function insertBlock(state, commands, content) {
  const sel = state.selection;
  return sel.node ? commands.insertContentAt(sel.to, content) : commands.insertContent(content);
}

export const DIAGRAM_KINDS = [
  { id: 'mindmap', label: 'Carte mentale', hint: 'Une idée centrale et ses branches' },
  { id: 'timeline', label: 'Frise chronologique', hint: 'Des dates dans l’ordre' },
  { id: 'steps', label: 'Étapes', hint: 'Un processus pas à pas' },
  { id: 'cycle', label: 'Cycle', hint: 'Des phases qui se répètent' },
  { id: 'comparison', label: 'Comparaison', hint: 'Des colonnes côte à côte' },
  { id: 'hierarchy', label: 'Organigramme', hint: 'Une classification en arbre' },
  { id: 'cards', label: 'Fiches', hint: 'Des cartes de révision' },
];

export const PALETTES = {
  iris: ['#6d5dfc', '#2f80ed', '#22a06b', '#f2711c', '#d6409f', '#8e4ec6'],
  ocean: ['#0e7490', '#2563eb', '#0ea5a4', '#4f46e5', '#0284c7', '#14b8a6'],
  sunset: ['#e5484d', '#f2711c', '#e0a100', '#d6409f', '#c2410c', '#be185d'],
  forest: ['#15803d', '#65a30d', '#0f766e', '#a16207', '#22a06b', '#4d7c0f'],
  mono: ['#475569', '#64748b', '#334155', '#525252', '#57534e', '#3f3f46'],
};

const EMPTY = {
  mindmap: { title: 'Idée centrale', items: [1, 2, 3, 4].map((i) => ({ title: `Branche ${i}`, text: '', children: ['Idée', 'Idée'] })) },
  timeline: { title: '', items: [1, 2, 3, 4].map((i) => ({ title: `Date ${i}`, text: 'Événement', children: [] })) },
  steps: { title: '', items: [1, 2, 3, 4].map((i) => ({ title: `Étape ${i}`, text: 'Description', children: [] })) },
  cycle: { title: 'Cycle', items: [1, 2, 3, 4].map((i) => ({ title: `Phase ${i}`, text: '', children: [] })) },
  comparison: { title: '', items: ['A', 'B'].map((l) => ({ title: `Élément ${l}`, text: '', children: ['Point 1', 'Point 2', 'Point 3'] })) },
  hierarchy: { title: 'Racine', items: [1, 2, 3].map((i) => ({ title: `Catégorie ${i}`, text: '', children: ['Élément', 'Élément'] })) },
  cards: { title: '', items: [1, 2, 3].map((i) => ({ title: `Notion ${i}`, text: 'Définition à retenir.', children: [] })) },
};

export const emptyDiagram = (kind) => ({ kind, palette: 'iris', ...structuredClone(EMPTY[kind] || EMPTY.cards) });

const colorOf = (attrs, i) => {
  const p = PALETTES[attrs.palette] || PALETTES.iris;
  return attrs.items[i]?.color || p[i % p.length];
};

// Editable text element: <tag data-edit="path">text</tag>
const field = (tag, path, text, cls, placeholder) => [tag, { 'data-edit': path, class: cls, 'data-ph': placeholder || '' }, text || ''];

function itemBox(attrs, i, { showText = true, showChildren = false, cls = '' } = {}) {
  const it = attrs.items[i];
  const parts = [field('div', `items.${i}.title`, it.title, 'dg-t', 'Titre')];
  if (showText) parts.push(field('div', `items.${i}.text`, it.text, 'dg-x', 'Texte'));
  if (showChildren) parts.push(['ul', { class: 'dg-list' }, ...(it.children || []).map((c, j) => field('li', `items.${i}.children.${j}`, c, '', '…'))]);
  return ['div', { class: `dg-item ${cls}`, style: `--c:${colorOf(attrs, i)}` }, ...parts];
}

function diagramBody(attrs) {
  const n = attrs.items.length;
  const all = (opts) => attrs.items.map((_, i) => itemBox(attrs, i, opts));
  switch (attrs.kind) {
    case 'mindmap': {
      const left = [];
      const right = [];
      attrs.items.forEach((_, i) => (i % 2 ? right : left).push(itemBox(attrs, i, { showText: false, showChildren: true })));
      return ['div', { class: 'dg-mm' }, ['div', { class: 'dg-col dg-left' }, ...left], ['div', { class: 'dg-center' }, field('div', 'title', attrs.title, 'dg-core', 'Idée centrale')], ['div', { class: 'dg-col dg-right' }, ...right]];
    }
    case 'timeline':
      return ['div', { class: 'dg-tl' }, ...attrs.items.map((it, i) => ['div', { class: 'dg-ev', style: `--c:${colorOf(attrs, i)}` }, field('div', `items.${i}.title`, it.title, 'dg-date', 'Date'), ['span', { class: 'dg-dot' }], field('div', `items.${i}.text`, it.text, 'dg-x', 'Événement')])];
    case 'steps':
      return ['div', { class: 'dg-steps' }, ...attrs.items.map((_, i) => itemBox(attrs, i, { cls: 'dg-step' }))];
    case 'cycle': {
      const pts = attrs.items.map((_, i) => {
        const a = (i / n) * Math.PI * 2 - Math.PI / 2;
        return [50 + 38 * Math.cos(a), 50 + 38 * Math.sin(a)];
      });
      return [
        'div',
        { class: 'dg-cycle' },
        ['div', { class: 'dg-ring' }],
        field('div', 'title', attrs.title, 'dg-core', 'Cycle'),
        ...attrs.items.map((_, i) => ['div', { class: 'dg-cpos', style: `left:${pts[i][0].toFixed(2)}%;top:${pts[i][1].toFixed(2)}%` }, itemBox(attrs, i, { showText: !!attrs.items[i].text, cls: 'dg-phase' })]),
      ];
    }
    case 'comparison':
      return ['div', { class: 'dg-cmp', style: `--n:${n}` }, ...all({ showText: false, showChildren: true, cls: 'dg-colbox' })];
    case 'hierarchy':
      return ['div', { class: 'dg-tree' }, ['div', { class: 'dg-rootwrap' }, field('div', 'title', attrs.title, 'dg-core', 'Racine')], ['div', { class: 'dg-branches', style: `--n:${n}` }, ...all({ showText: false, showChildren: true, cls: 'dg-node' })]];
    default:
      return ['div', { class: 'dg-cards' }, ...all({ cls: 'dg-card' })];
  }
}

function diagramSpec(attrs, HTMLAttributes = {}) {
  return ['div', mergeAttributes(HTMLAttributes, { 'data-diagram': JSON.stringify(attrs), class: `diagram dg-${attrs.kind}` }), diagramBody(attrs)];
}

function setPath(obj, path, value) {
  const keys = path.split('.');
  let o = obj;
  for (let k = 0; k < keys.length - 1; k++) o = o[keys[k]];
  o[keys[keys.length - 1]] = value;
}

const readText = (el) => el.innerText.replace(/ /g, ' ').replace(/\n+$/, '');

// Shared node-view helpers for contenteditable fields inside an atom node.
function editableView({ node, getPos, editor, render, onCommit }) {
  let current = node;
  const dom = document.createElement('div');
  const paint = () => {
    dom.replaceChildren(render(current));
    if (editor.isEditable) dom.querySelectorAll('[data-edit]').forEach((el) => (el.contentEditable = 'plaintext-only'));
  };
  paint();
  dom.addEventListener('focusout', (e) => {
    if (!e.target.matches?.('[data-edit]')) return;
    onCommit(current, e.target);
  });
  dom.addEventListener('keydown', (e) => {
    if (e.target.matches?.('[data-edit]') && (e.key === 'Escape' || (e.key === 'Enter' && !e.shiftKey))) {
      e.preventDefault();
      e.target.blur();
    }
  });
  return {
    dom,
    paint,
    get node() {
      return current;
    },
    view: {
      dom,
      update(next) {
        if (next.type !== current.type) return false;
        current = next;
        if (!dom.contains(document.activeElement)) paint();
        return true;
      },
      stopEvent: (e) => !!e.target.closest?.('[data-edit], [data-stop]'),
      ignoreMutation: () => true,
    },
  };
}

function commitAttrs(editor, getPos, attrs) {
  const pos = getPos();
  if (typeof pos !== 'number') return;
  editor.view.dispatch(editor.state.tr.setNodeMarkup(pos, undefined, attrs));
}

export const Diagram = Node.create({
  name: 'diagram',
  group: 'block',
  atom: true,
  draggable: true,
  selectable: true,

  addAttributes() {
    return {
      kind: { default: 'cards' },
      title: { default: '' },
      palette: { default: 'iris' },
      items: { default: [] },
    };
  },

  parseHTML() {
    return [
      {
        tag: 'div[data-diagram]',
        getAttrs: (el) => {
          try {
            const d = JSON.parse(el.getAttribute('data-diagram'));
            return { kind: d.kind, title: d.title || '', palette: d.palette || 'iris', items: Array.isArray(d.items) ? d.items : [] };
          } catch {
            return false;
          }
        },
      },
    ];
  },

  renderHTML({ node, HTMLAttributes }) {
    return diagramSpec(node.attrs, { class: HTMLAttributes.class });
  },

  addNodeView() {
    return ({ node, getPos, editor }) => {
      const v = editableView({
        node,
        getPos,
        editor,
        render: (n) => DOMSerializer.renderSpec(document, diagramBody(n.attrs)).dom,
        onCommit: (n, el) => {
          const attrs = structuredClone(n.attrs);
          setPath(attrs, el.dataset.edit, readText(el));
          commitAttrs(editor, getPos, attrs);
        },
      });
      v.dom.className = `diagram dg-${node.attrs.kind}`;
      const update = v.view.update;
      v.view.update = (next) => {
        const ok = update(next);
        if (ok) v.dom.className = `diagram dg-${next.attrs.kind}`;
        return ok;
      };
      return v.view;
    };
  },

  addCommands() {
    return {
      insertDiagram:
        (data) =>
        ({ state, commands }) =>
          insertBlock(state, commands, { type: this.name, attrs: data }),
    };
  },
});

/* =========================================================== shape board */

export const SHAPES = [
  { id: 'rect', label: 'Rectangle' },
  { id: 'round', label: 'Rectangle arrondi' },
  { id: 'ellipse', label: 'Cercle' },
  { id: 'diamond', label: 'Losange' },
  { id: 'bubble', label: 'Bulle' },
  { id: 'arrow', label: 'Flèche' },
  { id: 'triangle', label: 'Triangle' },
  { id: 'star', label: 'Étoile' },
];

export const FILLS = ['#ede9fe', '#dbeafe', '#dcfce7', '#fef3c7', '#ffe4e6', '#f1f5f9', '#6d5dfc', '#2f80ed', '#22a06b', '#f2711c', '#e5484d', '#334155'];

const inkFor = (hex) => {
  const n = parseInt(hex.slice(1), 16);
  const lum = (0.299 * (n >> 16) + 0.587 * ((n >> 8) & 255) + 0.114 * (n & 255)) / 255;
  return lum > 0.62 ? '#1f1f24' : '#ffffff';
};

let seq = 0;
export const newShape = (type, i = 0) => ({
  id: `s${Date.now().toString(36)}${seq++}`,
  type,
  x: 6 + ((i * 7) % 60),
  y: 24 + ((i * 26) % 160),
  w: type === 'arrow' ? 22 : 24,
  h: type === 'ellipse' || type === 'star' || type === 'diamond' ? 120 : 84,
  text: type === 'arrow' ? '' : 'Texte',
  fill: FILLS[(i % 6) + (type === 'arrow' ? 6 : 0)],
});

function shapeSpec(s) {
  const fill = /^#[0-9a-f]{6}$/i.test(s.fill) ? s.fill : FILLS[0];
  return [
    'div',
    { class: `sh sh-${s.type}`, 'data-id': s.id, style: `left:${s.x}%;top:${s.y}px;width:${s.w}%;height:${s.h}px;--fill:${fill};--ink:${inkFor(fill)}` },
    ['div', { class: 'sh-bg' }],
    field('div', `text`, s.text, 'sh-text', ''),
  ];
}

function boardHead(attrs, selectedId) {
  const head = document.createElement('div');
  head.className = 'board-head';
  const label = document.createElement('span');
  label.className = 'board-label';
  label.textContent = 'Formes';
  const tools = document.createElement('div');
  tools.className = 'board-tools';
  tools.setAttribute('data-stop', '');
  const btn = (act, arg, html, title, cls = '') => {
    const b = document.createElement('button');
    b.type = 'button';
    b.className = `board-btn ${cls}`;
    b.dataset.act = act;
    if (arg) b.dataset.arg = arg;
    b.title = title;
    b.innerHTML = html;
    return b;
  };
  const sep = () => Object.assign(document.createElement('span'), { className: 'board-sep' });
  const picked = attrs.shapes.find((x) => x.id === selectedId);
  if (!picked) {
    tools.append(Object.assign(document.createElement('span'), { className: 'board-hint', textContent: 'Ajouter :' }));
    SHAPES.forEach((sh) => tools.append(btn('add', sh.id, `<span class="sh-mini sh-${sh.type || sh.id}"></span>`, sh.label)));
  } else {
    FILLS.forEach((f) => tools.append(btn('fill', f, '', 'Couleur', `board-swatch${picked.fill === f ? ' on' : ''}`)));
    tools.querySelectorAll('.board-swatch').forEach((b) => (b.style.background = b.dataset.arg));
    tools.append(sep());
    SHAPES.forEach((sh) => tools.append(btn('type', sh.id, `<span class="sh-mini sh-${sh.id}"></span>`, sh.label, picked.type === sh.id ? 'on' : '')));
    tools.append(sep(), btn('dup', '', 'Dupliquer', 'Dupliquer la forme', 'txt'), btn('front', '', 'Devant', 'Mettre au premier plan', 'txt'), btn('del', '', 'Supprimer', 'Supprimer la forme', 'txt danger'), btn('done', '', 'OK', 'Désélectionner', 'txt'));
  }
  head.append(label, tools);
  return head;
}

function boardBody(attrs) {
  return ['div', { class: 'board-area', style: `height:${attrs.height}px` }, ...attrs.shapes.map(shapeSpec)];
}

export const ShapeBoard = Node.create({
  name: 'shapeBoard',
  group: 'block',
  atom: true,
  draggable: true,
  selectable: true,

  addAttributes() {
    return { height: { default: 320 }, shapes: { default: [] } };
  },

  parseHTML() {
    return [
      {
        tag: 'div[data-board]',
        getAttrs: (el) => {
          try {
            const d = JSON.parse(el.getAttribute('data-board'));
            return { height: Number(d.height) || 320, shapes: Array.isArray(d.shapes) ? d.shapes : [] };
          } catch {
            return false;
          }
        },
      },
    ];
  },

  renderHTML({ node }) {
    return ['div', { class: 'board', 'data-board': JSON.stringify(node.attrs) }, boardBody(node.attrs)];
  },

  addNodeView() {
    return ({ node, getPos, editor }) => {
      let selectedId = null;
      const save = (attrs) => commitAttrs(editor, getPos, attrs);

      const v = editableView({
        node,
        getPos,
        editor,
        render: (n) => {
          const wrap = document.createElement('div');
          if (editor.isEditable) wrap.append(boardHead(n.attrs, selectedId));
          wrap.append(DOMSerializer.renderSpec(document, boardBody(n.attrs)).dom);
          const area = wrap.lastChild;
          area.setAttribute('data-stop', '');
          area.querySelectorAll('.sh').forEach((el) => {
            el.querySelector('[data-edit]').dataset.edit = `shape:${el.dataset.id}`;
            if (el.dataset.id === selectedId) el.classList.add('picked');
            if (editor.isEditable) {
              const grip = document.createElement('span');
              grip.className = 'sh-resize';
              el.append(grip);
            }
          });
          if (editor.isEditable) {
            const grow = document.createElement('div');
            grow.className = 'board-grow';
            grow.title = 'Glisser pour agrandir la zone';
            area.append(grow);
          }
          return wrap;
        },
        onCommit: (n, el) => {
          const id = el.dataset.edit.slice(6);
          const attrs = structuredClone(n.attrs);
          const s = attrs.shapes.find((x) => x.id === id);
          if (!s || s.text === readText(el)) return;
          s.text = readText(el);
          save(attrs);
        },
      });
      v.dom.className = 'board';
      if (!editor.isEditable) return v.view;

      const pick = (id) => {
        if (selectedId === id) return;
        selectedId = id;
        v.paint();
      };

      // Board toolbar actions.
      v.dom.addEventListener('click', (e) => {
        const btn = e.target.closest('[data-act]');
        if (!btn) return;
        const attrs = structuredClone(v.node.attrs);
        const i = attrs.shapes.findIndex((x) => x.id === selectedId);
        const { act, arg } = btn.dataset;
        if (act === 'add') {
          const sh = newShape(arg, attrs.shapes.length);
          attrs.shapes.push(sh);
          selectedId = sh.id;
        } else if (i >= 0 && act === 'fill') attrs.shapes[i].fill = arg;
        else if (i >= 0 && act === 'type') attrs.shapes[i].type = arg;
        else if (i >= 0 && act === 'dup') {
          const c = { ...attrs.shapes[i], id: newShape('rect').id, x: Math.min(attrs.shapes[i].x + 4, 95 - attrs.shapes[i].w), y: attrs.shapes[i].y + 20 };
          attrs.shapes.push(c);
          selectedId = c.id;
        } else if (i >= 0 && act === 'front') attrs.shapes.push(attrs.shapes.splice(i, 1)[0]);
        else if (i >= 0 && act === 'del') {
          attrs.shapes.splice(i, 1);
          selectedId = null;
        } else if (act === 'done') {
          selectedId = null;
          return v.paint();
        } else return;
        save(attrs);
      });

      // Move, resize, grow — all with pointer events; the document is updated on release.
      v.dom.addEventListener('pointerdown', (e) => {
        let area = v.dom.querySelector('.board-area');
        let shapeEl = e.target.closest('.sh');
        const grow = e.target.closest('.board-grow');
        if (!shapeEl && !grow) {
          if (e.target === area) pick(null);
          return;
        }
        if (e.target.closest('[data-edit]') && e.target.closest('[data-edit]').matches(':focus')) return;
        e.preventDefault();
        const attrs = structuredClone(v.node.attrs);
        const rect = area.getBoundingClientRect();
        const startX = e.clientX;
        const startY = e.clientY;
        let moved = false;

        if (grow) {
          const h0 = attrs.height;
          const move = (ev) => {
            attrs.height = Math.max(140, Math.min(1400, Math.round(h0 + ev.clientY - startY)));
            area.style.height = `${attrs.height}px`;
          };
          const up = () => {
            window.removeEventListener('pointermove', move);
            window.removeEventListener('pointerup', up);
            save(attrs);
          };
          window.addEventListener('pointermove', move);
          window.addEventListener('pointerup', up);
          return;
        }

        const s = attrs.shapes.find((x) => x.id === shapeEl.dataset.id);
        const resizing = !!e.target.closest('.sh-resize');
        const o = { ...s };
        pick(s.id); // may repaint: look the elements up again
        area = v.dom.querySelector('.board-area');
        shapeEl = v.dom.querySelector(`.sh[data-id="${s.id}"]`);
        const move = (ev) => {
          const dx = ((ev.clientX - startX) / rect.width) * 100;
          const dy = ev.clientY - startY;
          if (Math.abs(ev.clientX - startX) + Math.abs(dy) > 3) moved = true;
          if (resizing) {
            s.w = Math.max(5, Math.min(100 - s.x, +(o.w + dx).toFixed(2)));
            s.h = Math.max(30, Math.round(o.h + dy));
            shapeEl.style.width = `${s.w}%`;
            shapeEl.style.height = `${s.h}px`;
          } else {
            s.x = Math.max(0, Math.min(100 - s.w, +(o.x + dx).toFixed(2)));
            s.y = Math.max(0, Math.min(attrs.height - s.h, Math.round(o.y + dy)));
            shapeEl.style.left = `${s.x}%`;
            shapeEl.style.top = `${s.y}px`;
          }
        };
        const up = () => {
          window.removeEventListener('pointermove', move);
          window.removeEventListener('pointerup', up);
          if (moved) save(attrs);
        };
        window.addEventListener('pointermove', move);
        window.addEventListener('pointerup', up);
      });

      v.dom.addEventListener('dblclick', (e) => {
        const t = e.target.closest('.sh')?.querySelector('[data-edit]');
        if (!t) return;
        t.focus();
        const r = document.createRange();
        r.selectNodeContents(t);
        getSelection().removeAllRanges();
        getSelection().addRange(r);
      });

      // The text of a shape is only editable after a double-click, so a single click drags it.
      v.dom.addEventListener('mousedown', (e) => {
        const t = e.target.closest('[data-edit]');
        if (t && e.detail < 2 && !t.matches(':focus')) e.preventDefault();
      });

      return v.view;
    };
  },

  addCommands() {
    return {
      insertShapeBoard:
        () =>
        ({ state, commands }) =>
          insertBlock(state, commands, { type: this.name, attrs: { height: 320, shapes: [newShape('round', 0), newShape('arrow', 1), newShape('ellipse', 2)].map((s, i) => ({ ...s, x: [6, 38, 66][i], y: [110, 130, 100][i] })) } }),
    };
  },
});
