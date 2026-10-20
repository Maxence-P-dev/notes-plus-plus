// Formules mathématiques (LaTeX rendu par KaTeX) : nœuds de l'éditeur, fenêtre d'édition et rendu hors éditeur.
import katex from 'katex';
import { InlineMath, BlockMath } from '@tiptap/extension-mathematics';
import { h, openFloating, closeFloating } from './ui.js';

const KATEX = { throwOnError: false, strict: 'ignore' };
const SELECTOR = '[data-type="inline-math"], [data-type="block-math"]';

// Raccourcis pour les élèves qui ne connaissent pas LaTeX par cœur. `|` = position du curseur après insertion.
const SNIPPETS = [
  { label: 'a/b', tex: '\\frac{|}{}', title: 'Fraction' },
  { label: 'x²', tex: '^{|}', title: 'Puissance' },
  { label: 'xₙ', tex: '_{|}', title: 'Indice' },
  { label: '√', tex: '\\sqrt{|}', title: 'Racine carrée' },
  { label: 'Σ', tex: '\\sum_{i=1}^{n} |', title: 'Somme' },
  { label: '∫', tex: '\\int_{a}^{b} | \\,dx', title: 'Intégrale' },
  { label: 'lim', tex: '\\lim_{x \\to |}', title: 'Limite' },
  { label: 'α', tex: '\\alpha', title: 'Alpha (aussi \\beta, \\pi, \\theta…)' },
  { label: '≤', tex: '\\leq ', title: 'Inférieur ou égal (\\geq pour ≥)' },
  { label: '≠', tex: '\\neq ', title: 'Différent' },
  { label: '→', tex: '\\to ', title: 'Flèche' },
  { label: '∞', tex: '\\infty', title: 'Infini' },
];

/** Nœuds TipTap. `onEdit(kind, latex, pos)` est appelé quand on clique sur une formule. */
export function mathExtensions(onEdit) {
  // Configurés séparément : la formule centrée doit être rendue en mode « affichage » (grande taille).
  return [
    InlineMath.configure({ katexOptions: KATEX, onClick: (node, pos) => onEdit('inline', node.attrs.latex, pos) }),
    BlockMath.configure({ katexOptions: { ...KATEX, displayMode: true }, onClick: (node, pos) => onEdit('block', node.attrs.latex, pos) }),
  ];
}

/** Rend les formules d'un fragment HTML déjà affiché (réponses des flashcards). */
export function renderMath(root) {
  for (const el of root.querySelectorAll(SELECTOR)) {
    katex.render(el.dataset.latex || '', el, { ...KATEX, displayMode: el.dataset.type === 'block-math' });
  }
}

/**
 * Remplace les formules par du MathML pour l'export PDF : Chromium l'affiche nativement,
 * sans police ni feuille de style KaTeX (la fenêtre d'export n'exécute pas de JavaScript).
 */
export function mathForPdf(html) {
  if (!html.includes('-math"')) return html;
  const doc = new DOMParser().parseFromString(`<body>${html}</body>`, 'text/html');
  for (const el of doc.querySelectorAll(SELECTOR)) {
    el.innerHTML = katex.renderToString(el.dataset.latex || '', { ...KATEX, output: 'mathml', displayMode: el.dataset.type === 'block-math' });
  }
  return doc.body.innerHTML;
}

/**
 * Fenêtre d'édition d'une formule : saisie LaTeX, raccourcis et aperçu en direct.
 * `pos` absent = nouvelle formule insérée au curseur.
 */
export function openMathEditor(editor, { kind = 'inline', latex = '', pos = null } = {}) {
  const isNew = pos == null;
  const input = h('textarea', { class: 'input math-input', rows: '2', spellcheck: 'false', placeholder: 'Ex. : \\frac{a}{b}, x^2, \\sqrt{2}' });
  input.value = latex;
  const preview = h('div', { class: 'math-preview' });
  const error = h('div', { class: 'math-error' });

  const refresh = () => {
    const tex = input.value.trim();
    error.textContent = '';
    if (!tex) {
      preview.textContent = 'Aperçu de la formule';
      preview.classList.add('empty');
      return;
    }
    preview.classList.remove('empty');
    try {
      katex.render(tex, preview, { ...KATEX, throwOnError: true, displayMode: kind === 'block' });
    } catch (e) {
      katex.render(tex, preview, { ...KATEX, displayMode: kind === 'block' });
      error.textContent = String(e.message || e).replace(/^KaTeX parse error:\s*/, '');
    }
  };

  const insertSnippet = (tex) => {
    const [before, after = ''] = tex.split('|');
    const { selectionStart: s, selectionEnd: e, value } = input;
    input.value = value.slice(0, s) + before + after + value.slice(e);
    input.selectionStart = input.selectionEnd = s + before.length;
    input.focus();
    refresh();
  };

  const save = () => {
    const tex = input.value.trim();
    closeFloating();
    const c = editor.chain().focus();
    if (!tex) {
      if (!isNew) (kind === 'block' ? c.deleteBlockMath({ pos }) : c.deleteInlineMath({ pos })).run();
      return;
    }
    if (isNew) (kind === 'block' ? c.insertBlockMath({ latex: tex }) : c.insertInlineMath({ latex: tex })).run();
    else (kind === 'block' ? c.updateBlockMath({ latex: tex, pos }) : c.updateInlineMath({ latex: tex, pos })).run();
  };

  const remove = () => {
    closeFloating();
    const c = editor.chain().focus();
    (kind === 'block' ? c.deleteBlockMath({ pos }) : c.deleteInlineMath({ pos })).run();
  };

  input.addEventListener('input', refresh);
  input.addEventListener('keydown', (e) => {
    if (e.key === 'Enter' && !e.shiftKey) return e.preventDefault(), save();
    if (e.key === 'Escape') return e.preventDefault(), closeFloating(), editor.commands.focus();
  });

  const box = h(
    'div',
    { class: 'math-editor' },
    h('div', { class: 'math-head' }, h('span', {}, kind === 'block' ? 'Formule centrée' : 'Formule'), h('span', { class: 'math-help' }, 'LaTeX · Entrée pour valider')),
    h('div', { class: 'math-snippets' }, SNIPPETS.map((s) => h('button', { class: 'math-snippet', title: s.title, onclick: () => insertSnippet(s.tex) }, s.label))),
    input,
    preview,
    error,
    h(
      'div',
      { class: 'math-actions' },
      isNew ? null : h('button', { class: 'btn ghost sm danger-text', onclick: remove }, 'Supprimer'),
      h('span', { class: 'math-spacer' }),
      h('button', { class: 'btn ghost sm', onclick: () => (closeFloating(), editor.commands.focus()) }, 'Annuler'),
      h('button', { class: 'btn primary sm', onclick: save }, isNew ? 'Insérer' : 'Valider')
    )
  );

  // Ancre : la formule cliquée, sinon le curseur dans le texte.
  const at = isNew ? editor.state.selection.from : pos;
  const c = editor.view.coordsAtPos(Math.min(at, editor.state.doc.content.size));
  openFloating(box, { x: c.left, y: c.bottom + 8 }, { cls: 'math-floating' });
  refresh();
  setTimeout(() => input.focus(), 30);
}
