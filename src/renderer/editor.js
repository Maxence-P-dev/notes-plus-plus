import { Editor, Node, Extension, mergeAttributes } from '@tiptap/core';
import StarterKit from '@tiptap/starter-kit';
import { TextStyle, Color } from '@tiptap/extension-text-style';
import Highlight from '@tiptap/extension-highlight';
import TextAlign from '@tiptap/extension-text-align';
import { Table, TableRow, TableCell, TableHeader } from '@tiptap/extension-table';
import { TaskList, TaskItem } from '@tiptap/extension-list';
import Image from '@tiptap/extension-image';
import { Placeholder, CharacterCount } from '@tiptap/extensions';
import { Plugin, PluginKey } from '@tiptap/pm/state';
import { icon } from './icons.js';
import { h } from './ui.js';

export const CALLOUTS = [
  { id: 'info', label: 'Info', icon: 'info' },
  { id: 'definition', label: 'Définition', icon: 'book' },
  { id: 'warning', label: 'Attention', icon: 'warning' },
  { id: 'tip', label: 'À retenir', icon: 'sparkle' },
];

const Callout = Node.create({
  name: 'callout',
  group: 'block',
  content: 'block+',
  defining: true,

  addAttributes() {
    return {
      variant: {
        default: 'info',
        parseHTML: (el) => el.getAttribute('data-callout') || 'info',
        renderHTML: (attrs) => ({ 'data-callout': attrs.variant }),
      },
    };
  },

  parseHTML() {
    return [{ tag: 'div[data-callout]' }];
  },

  renderHTML({ HTMLAttributes }) {
    return ['div', mergeAttributes(HTMLAttributes, { class: 'callout' }), 0];
  },

  addCommands() {
    return {
      setCallout:
        (variant = 'info') =>
        ({ editor, commands }) => {
          if (editor.isActive('callout')) return commands.updateAttributes('callout', { variant });
          return commands.wrapIn(this.name, { variant });
        },
      unsetCallout:
        () =>
        ({ commands }) =>
          commands.lift(this.name),
    };
  },
});

export const IMAGE_ALIGNS = [
  { id: 'left', label: 'Aligner à gauche', icon: 'alignLeft' },
  { id: 'center', label: 'Centrer', icon: 'alignCenter' },
  { id: 'right', label: 'Aligner à droite', icon: 'alignRight' },
  { id: 'wrap-left', label: 'Image à gauche, texte à droite', icon: 'wrapLeft' },
  { id: 'wrap-right', label: 'Image à droite, texte à gauche', icon: 'wrapRight' },
];

// Image with a placement: aligned on its own line, or floating with the text flowing beside it.
const PlacedImage = Image.extend({
  addAttributes() {
    return {
      ...this.parent?.(),
      align: {
        default: 'center',
        parseHTML: (el) => el.getAttribute('data-align') || 'center',
        renderHTML: (attrs) => ({ 'data-align': attrs.align }),
      },
    };
  },

  addNodeView() {
    const create = this.parent?.();
    if (!create) return null;
    return (props) => {
      const view = create(props);
      // Lets the image be dragged to another place in the course.
      view.dom.draggable = true;
      return view;
    };
  },
});

/* ------------------------------------------------------------ slash menu */

const norm = (s) => s.normalize('NFD').replace(/[̀-ͯ]/g, '').toLowerCase();

function slashItems(pickImage) {
  return [
    { label: 'Texte', hint: 'Paragraphe simple', icon: 'pilcrow', k: 'texte paragraphe p', run: (c) => c.setParagraph() },
    { label: 'Titre 1', hint: 'Grand titre de section', badge: 'H1', k: 'titre h1 heading', run: (c) => c.setHeading({ level: 1 }) },
    { label: 'Titre 2', hint: 'Titre moyen', badge: 'H2', k: 'titre h2 heading sous', run: (c) => c.setHeading({ level: 2 }) },
    { label: 'Titre 3', hint: 'Petit titre', badge: 'H3', k: 'titre h3 heading', run: (c) => c.setHeading({ level: 3 }) },
    { label: 'Liste à puces', hint: 'Liste simple', icon: 'list', k: 'liste puces bullet ul', run: (c) => c.toggleBulletList() },
    { label: 'Liste numérotée', hint: '1. 2. 3.', icon: 'listOrdered', k: 'liste numerotee ordered ol nombre', run: (c) => c.toggleOrderedList() },
    { label: 'Liste de tâches', hint: 'Cases à cocher', icon: 'checklist', k: 'liste taches todo cases cocher check', run: (c) => c.toggleTaskList() },
    ...CALLOUTS.map((v) => ({
      label: `Encadré ${v.label}`,
      hint: 'Mettre une notion en valeur',
      icon: v.icon,
      cls: `sw-${v.id}`,
      k: `encadre callout ${norm(v.label)} ${v.id}`,
      run: (c) => c.setCallout(v.id),
    })),
    { label: 'Citation', hint: 'Bloc de citation', icon: 'quote', k: 'citation quote', run: (c) => c.toggleBlockquote() },
    { label: 'Code', hint: 'Bloc de code', icon: 'codeBlock', k: 'code bloc programme', run: (c) => c.toggleCodeBlock() },
    { label: 'Tableau', hint: '3 × 3 avec en-tête', icon: 'table', k: 'tableau table grille', run: (c) => c.insertTable({ rows: 3, cols: 3, withHeaderRow: true }) },
    { label: 'Image', hint: 'Depuis ton ordinateur', icon: 'image', k: 'image photo picture', run: (c) => (pickImage(), c) },
    { label: 'Séparateur', hint: 'Ligne horizontale', icon: 'minus', k: 'separateur ligne hr divider', run: (c) => c.setHorizontalRule() },
  ];
}

function createSlash(getEditor, pickImage) {
  const items = slashItems(pickImage);
  const state = { open: false, range: null, list: [], index: 0, dismissed: null };
  const el = h('div', { class: 'floating slash' });
  el.addEventListener('mousedown', (e) => e.preventDefault());
  document.body.append(el);

  function close() {
    state.open = false;
    el.classList.remove('open');
  }

  function run(item) {
    const editor = getEditor();
    const chain = editor.chain().focus().deleteRange(state.range);
    item.run(chain).run();
    close();
  }

  function render() {
    el.innerHTML = '';
    if (!state.list.length) {
      el.append(h('div', { class: 'slash-empty' }, 'Aucun résultat'));
      return;
    }
    state.list.forEach((it, i) => {
      const row = h(
        'button',
        { class: `slash-item${i === state.index ? ' active' : ''}`, onclick: () => run(it), onmousemove: () => i !== state.index && select(i) },
        h('span', { class: `slash-ic ${it.cls || ''}`, html: it.badge ? `<b>${it.badge}</b>` : icon(it.icon, 18) }),
        h('span', { class: 'slash-txt' }, h('span', { class: 'slash-label' }, it.label), h('span', { class: 'slash-hint' }, it.hint))
      );
      el.append(row);
    });
  }

  function select(i) {
    state.index = (i + state.list.length) % state.list.length;
    [...el.children].forEach((c, j) => c.classList.toggle('active', j === state.index));
    el.children[state.index]?.scrollIntoView({ block: 'nearest' });
  }

  function update(editor) {
    const { selection } = editor.state;
    const { $from, empty } = selection;
    if (!empty || !editor.isFocused || $from.parent.type.name === 'codeBlock') return close();
    const before = $from.parent.textBetween(0, $from.parentOffset, undefined, '￼');
    const m = before.match(/(?:^|\s)\/((?:[^\s/][^/]{0,23})?)$/);
    if (!m) {
      state.dismissed = null;
      return close();
    }
    const from = $from.pos - m[1].length - 1;
    if (state.dismissed === from) return close();
    const words = norm(m[1]).split(/\s+/).filter(Boolean);
    const list = items.filter((it) => {
      const hay = `${norm(it.label)} ${it.k}`.split(/\s+/);
      return words.every((w) => hay.some((x) => x.startsWith(w)));
    });
    if (!list.length && m[1].length > 3) return close();
    const wasOpen = state.open && state.range?.from === from;
    state.range = { from, to: $from.pos };
    state.list = list;
    if (!wasOpen || state.index >= list.length) state.index = 0;
    state.open = true;
    render();
    const coords = editor.view.coordsAtPos(from);
    const r = el.getBoundingClientRect();
    let top = coords.bottom + 6;
    if (top + Math.max(r.height, 320) > window.innerHeight - 8) top = Math.max(8, coords.top - Math.max(r.height, 320) - 6);
    el.style.left = `${Math.min(coords.left, window.innerWidth - 300)}px`;
    el.style.top = `${top}px`;
    el.classList.add('open');
  }

  const extension = Extension.create({
    name: 'slashMenu',
    addProseMirrorPlugins() {
      return [
        new Plugin({
          key: new PluginKey('slashMenu'),
          props: {
            handleKeyDown(_view, e) {
              if (!state.open) return false;
              if (e.key === 'ArrowDown') return select(state.index + 1), true;
              if (e.key === 'ArrowUp') return select(state.index - 1), true;
              if (e.key === 'Enter' || e.key === 'Tab') {
                if (!state.list.length) return false;
                run(state.list[state.index]);
                return true;
              }
              if (e.key === 'Escape') {
                state.dismissed = state.range.from;
                close();
                return true;
              }
              return false;
            },
          },
        }),
      ];
    },
  });

  return { extension, update, close, isOpen: () => state.open };
}

/* ---------------------------------------------------------------- editor */

function readImage(file) {
  return new Promise((resolve, reject) => {
    const r = new FileReader();
    r.onload = () => resolve(r.result);
    r.onerror = reject;
    r.readAsDataURL(file);
  });
}

export function createEditor({ element, onUpdate, onTransaction, pickImage }) {
  let editor;
  const slash = createSlash(() => editor, pickImage);

  const insertFiles = async (files, pos) => {
    const images = [...files].filter((f) => f.type.startsWith('image/'));
    if (!images.length) return false;
    for (const f of images) {
      const src = await readImage(f);
      const chain = editor.chain().focus();
      (pos != null ? chain.insertContentAt(pos, { type: 'image', attrs: { src } }) : chain.setImage({ src })).run();
    }
    return true;
  };

  editor = new Editor({
    element,
    extensions: [
      StarterKit.configure({
        heading: { levels: [1, 2, 3] },
        link: { openOnClick: true, autolink: true, defaultProtocol: 'https' },
        codeBlock: { HTMLAttributes: { spellcheck: 'false' } },
      }),
      TextStyle,
      Color,
      Highlight.configure({ multicolor: true }),
      TextAlign.configure({ types: ['heading', 'paragraph'] }),
      Table.configure({ resizable: true }),
      TableRow,
      TableHeader,
      TableCell,
      TaskList,
      TaskItem.configure({ nested: true }),
      PlacedImage.configure({
        allowBase64: true,
        resize: { enabled: true, directions: ['bottom-right', 'bottom-left'], minWidth: 60, minHeight: 40, alwaysPreserveAspectRatio: true },
      }),
      Callout,
      Placeholder.configure({
        includeChildren: false,
        placeholder: ({ node, editor: ed }) => {
          if (node.type.name === 'heading') return `Titre ${node.attrs.level}`;
          if (ed.isEmpty) return 'Commence à écrire ton cours… (tape « / » pour insérer un titre, une liste, un tableau…)';
          return 'Tape « / » pour les commandes';
        },
      }),
      CharacterCount,
      slash.extension,
    ],
    editorProps: {
      attributes: { spellcheck: 'true' },
      handlePaste: (_view, e) => {
        const files = e.clipboardData?.files;
        if (files?.length && [...files].some((f) => f.type.startsWith('image/'))) {
          insertFiles(files);
          return true;
        }
        return false;
      },
      handleDrop: (view, e) => {
        const files = e.dataTransfer?.files;
        if (!files?.length || ![...files].some((f) => f.type.startsWith('image/'))) return false;
        const pos = view.posAtCoords({ left: e.clientX, top: e.clientY })?.pos;
        insertFiles(files, pos);
        return true;
      },
    },
    onUpdate: () => onUpdate?.(),
    onTransaction: () => {
      slash.update(editor);
      onTransaction?.();
    },
    onBlur: () => setTimeout(() => !editor.isFocused && slash.close(), 100),
  });

  return { editor, slash };
}
