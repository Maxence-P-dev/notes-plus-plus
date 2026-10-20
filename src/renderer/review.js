// Mode révision : les encadrés « Définition » / « À retenir » deviennent des flashcards à répétition espacée.
import { icon } from './icons.js';
import { h, toast } from './ui.js';
import { CARD_KINDS, extractCards, safeFragment } from './cards.js';
import { GRADES, review, isDue, isNew, intervalLabel } from './srs.js';
import { renderMath } from './math.js';

const api = window.notesApp;
const NEW_PER_SESSION = 20;
const KIND_ICON = { definition: 'book', tip: 'sparkle' };

const files = (nodes, out = []) => {
  for (const n of nodes) n.type === 'dir' ? files(n.children, out) : n.type === 'file' && out.push(n);
  return out;
};

/** Toutes les cartes des cours donnés (dédoublonnées : une même question n'apparaît qu'une fois). */
async function loadCards(nodes) {
  const seen = new Map();
  for (const f of files(nodes)) {
    let html;
    try {
      html = await api.read(f.path);
    } catch {
      continue; // fichier supprimé ou illisible entre-temps
    }
    for (const c of extractCards(html, f.path, f.name)) if (!seen.has(c.id)) seen.set(c.id, c);
  }
  return [...seen.values()];
}

/** Nombre de cartes à réviser aujourd'hui, pour le badge de la barre latérale. */
export async function dueCount(tree) {
  const [cards, state] = await Promise.all([loadCards(tree), api.revision.load()]);
  const now = Date.now();
  const due = cards.filter((c) => !isNew(state[c.id]) && isDue(state[c.id], now)).length;
  const fresh = Math.min(NEW_PER_SESSION, cards.filter((c) => isNew(state[c.id])).length);
  return due + fresh;
}

/** File de la séance : cartes en retard d'abord (les plus anciennes en tête), puis les nouvelles. */
function buildQueue(cards, state, now) {
  const due = cards.filter((c) => !isNew(state[c.id]) && isDue(state[c.id], now)).sort((a, b) => state[a.id].due - state[b.id].due);
  const fresh = cards.filter((c) => isNew(state[c.id])).slice(0, NEW_PER_SESSION);
  return { queue: [...due, ...fresh], due: due.length, fresh: fresh.length };
}

let overlay = null;

/**
 * Ouvre la révision. `ctx` = { tree, current, folder, openFile, onClose }
 * — `current` : chemin du cours ouvert, `folder` : dossier sélectionné ou dossier du cours.
 */
export async function openReview(ctx) {
  if (overlay) return;
  const scopes = [{ id: 'all', label: 'Tous les cours', nodes: ctx.tree }];
  const folderNode = ctx.folder && findDir(ctx.tree, ctx.folder);
  if (folderNode) scopes.push({ id: 'folder', label: folderNode.name, nodes: folderNode.children });
  if (ctx.current) scopes.push({ id: 'course', label: 'Ce cours', nodes: [{ type: 'file', path: ctx.current, name: ctx.current.split('/').pop().replace(/\.cours$/i, '') }] });

  overlay = h('div', { class: 'overlay review-overlay' });
  const box = h('div', { class: 'modal review', role: 'dialog', 'aria-modal': 'true', 'aria-label': 'Révision' });
  const body = h('div', { class: 'rv-body' });
  const seg = h('div', { class: 'seg rv-scope' });
  const stats = h('div', { class: 'rv-stats' });
  const bar = h('div', { class: 'rv-progress' }, h('span'));
  box.append(
    h(
      'div',
      { class: 'set-head rv-head' },
      h('div', { class: 'rv-title' }, h('span', { html: icon('cards', 20) }), h('h3', {}, 'Révision')),
      seg,
      h('button', { class: 'icon-btn', title: 'Fermer (Échap)', html: icon('x'), onclick: () => close() })
    ),
    bar,
    body
  );
  overlay.append(box);
  overlay.addEventListener('mousedown', (e) => e.target === overlay && close());
  document.body.append(overlay);
  requestAnimationFrame(() => overlay.classList.add('open'));

  let state = await api.revision.load();
  let session = null; // { queue, done, total, card, revealed }

  const save = () => api.revision.save(state).catch(() => toast('Impossible d’enregistrer la progression', 'error'));

  function close() {
    if (!overlay) return;
    overlay.classList.remove('open');
    const el = overlay;
    setTimeout(() => el.remove(), 150);
    document.removeEventListener('keydown', onKey, true);
    overlay = null;
    ctx.onClose?.();
  }

  async function start(scopeId) {
    seg.querySelectorAll('.seg-btn').forEach((b) => b.classList.toggle('on', b.dataset.id === scopeId));
    body.replaceChildren(h('div', { class: 'rv-loading' }, 'Préparation des cartes…'));
    const cards = await loadCards(scopes.find((s) => s.id === scopeId).nodes);
    const q = buildQueue(cards, state, Date.now());
    stats.textContent = `${q.due} à revoir · ${q.fresh} nouvelle${q.fresh > 1 ? 's' : ''} · ${cards.length} carte${cards.length > 1 ? 's' : ''} en tout`;
    session = { queue: q.queue, done: 0, total: q.queue.length, cards };
    next();
  }

  function setProgress() {
    bar.firstChild.style.width = session.total ? `${(session.done / session.total) * 100}%` : '0';
  }

  function next() {
    setProgress();
    session.card = session.queue.shift();
    session.revealed = false;
    if (!session.card) return session.total ? finished() : empty();
    const c = session.card;
    const answer = h('div', { class: 'prose rv-answer' });
    answer.append(safeFragment(c.back));
    renderMath(answer);
    const st = state[c.id];
    const grades = h(
      'div',
      { class: 'rv-grades' },
      GRADES.map((g) =>
        h(
          'button',
          { class: `rv-grade g${g.id}`, onclick: () => grade(g.id) },
          h('span', { class: 'rv-grade-label' }, g.label),
          h('span', { class: 'rv-grade-int' }, intervalLabel(st, g.id, Date.now())),
          h('span', { class: 'kbd' }, g.key)
        )
      )
    );
    const showBtn = h('button', { class: 'btn primary rv-show', onclick: reveal }, 'Afficher la réponse', h('span', { class: 'kbd' }, 'Espace'));
    const card = h(
      'div',
      { class: `rv-card kind-${c.kind}` },
      h(
        'div',
        { class: 'rv-card-top' },
        h('span', { class: 'rv-kind', html: icon(KIND_ICON[c.kind], 14) + `<span>${CARD_KINDS[c.kind]}</span>` }),
        isNew(st) ? h('span', { class: 'rv-new' }, 'Nouvelle') : null,
        h('button', { class: 'rv-source', title: 'Ouvrir le cours', onclick: () => (close(), ctx.openFile(c.path)) }, c.course, h('span', { html: icon('external', 13) }))
      ),
      h('div', { class: 'rv-front' }, c.recall ? 'Restitue le contenu de cet encadré.' : c.front),
      c.recall ? h('div', { class: 'rv-hint' }, c.front) : null,
      answer
    );
    body.replaceChildren(stats, card, h('div', { class: 'rv-actions' }, showBtn, grades));
    showBtn.focus();
  }

  function reveal() {
    if (!session?.card || session.revealed) return;
    session.revealed = true;
    body.querySelector('.rv-card').classList.add('revealed');
    body.querySelector('.rv-actions').classList.add('revealed');
  }

  function grade(g) {
    if (!session?.card || !session.revealed) return;
    const c = session.card;
    state = { ...state, [c.id]: review(state[c.id], g, Date.now()) };
    save();
    // « À revoir » : la carte revient en fin de séance, sans compter deux fois dans la progression.
    if (g === 0) session.queue.push(c);
    else session.done++;
    next();
  }

  function finished() {
    const now = Date.now();
    const tomorrow = now + 86400000;
    const soon = session.cards.filter((c) => !isNew(state[c.id]) && isDue(state[c.id], tomorrow) && !isDue(state[c.id], now)).length;
    body.replaceChildren(
      h(
        'div',
        { class: 'rv-end' },
        h('div', { class: 'rv-end-ic', html: icon('checkCircle', 34) }),
        h('h2', {}, 'Séance terminée !'),
        h('p', {}, `${session.total} carte${session.total > 1 ? 's' : ''} révisée${session.total > 1 ? 's' : ''}. ${soon ? `${soon} à revoir demain.` : 'Rien de prévu pour demain.'}`),
        h('button', { class: 'btn primary', onclick: () => close() }, 'Terminer')
      )
    );
  }

  function empty() {
    const any = session.cards.length > 0;
    body.replaceChildren(
      h(
        'div',
        { class: 'rv-end' },
        h('div', { class: 'rv-end-ic', html: icon(any ? 'checkCircle' : 'cards', 34) }),
        h('h2', {}, any ? 'Tout est à jour' : 'Aucune carte pour l’instant'),
        h(
          'p',
          {},
          any
            ? 'Aucune carte à réviser aujourd’hui dans cette sélection. Reviens demain !'
            : 'Les encadrés « Définition » et « À retenir » de tes cours deviennent automatiquement des cartes. Astuce : commence l’encadré par le terme en gras, par exemple « Dérivée : … ».'
        ),
        h('button', { class: 'btn soft', onclick: () => close() }, 'Fermer')
      )
    );
  }

  function onKey(e) {
    if (e.key === 'Escape') return e.stopPropagation(), close();
    if (!session?.card) return;
    if ((e.key === ' ' || e.key === 'Enter') && !session.revealed) return e.preventDefault(), reveal();
    const g = GRADES.find((x) => x.key === e.key);
    if (g && session.revealed) return e.preventDefault(), grade(g.id);
  }
  document.addEventListener('keydown', onKey, true);

  for (const s of scopes) seg.append(h('button', { class: 'seg-btn', 'data-id': s.id, title: s.label, onclick: () => start(s.id) }, s.label));
  start('all');
}

function findDir(nodes, path) {
  for (const n of nodes) {
    if (n.type !== 'dir') continue;
    if (n.path === path) return n;
    const f = findDir(n.children, path);
    if (f) return f;
  }
  return null;
}
