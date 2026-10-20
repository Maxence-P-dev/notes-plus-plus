import { EditorState } from '@tiptap/pm/state';
import { icon, LOGO } from './icons.js';
import { $, h, openFloating, closeFloating, isFloatingOpen, menuList, contextMenu, promptModal, confirmModal, toast } from './ui.js';
import { createEditor, CALLOUTS, IMAGE_ALIGNS } from './editor.js';
import { setupUpdates, openAbout } from './update.js';
import { openSettings, applyLook } from './settings.js';
import { correct, diagramDialog, pictoDialog, setSettingsOpener } from './ai-ui.js';
import { DIAGRAM_KINDS, PALETTES, insertBlock } from './blocks.js';
import { openReview, dueCount } from './review.js';
import { openMathEditor, mathForPdf } from './math.js';

const api = window.notesApp;

const S = {
  settings: null,
  root: '',
  tree: [],
  current: null,
  pdf: null, // chemin du PDF affiché (un cours et un PDF ne sont jamais ouverts en même temps)
  selected: null, // { path, type }
  expanded: new Set(),
  lastSaved: '',
  saveTimer: null,
  saving: false,
  query: '',
  zoom: 1,
};

const parentOf = (p) => (p && p.includes('/') ? p.slice(0, p.lastIndexOf('/')) : '');
const baseName = (p) => p.split('/').pop().replace(/\.(cours|pdf)$/i, '');
const within = (p, base) => p === base || p.startsWith(base + '/');

/* ================================================================ theme */

function applyTheme(effective, animate = false) {
  const root = document.documentElement;
  if (animate) {
    root.classList.add('theme-anim');
    setTimeout(() => root.classList.remove('theme-anim'), 350);
  }
  root.dataset.theme = effective;
  $('#btn-theme').innerHTML = icon(effective === 'dark' ? 'moon' : 'sun');
}

async function setTheme(theme) {
  S.settings = await api.setSettings({ theme });
  applyTheme(S.settings.effectiveTheme, true);
}

function openAppSettings(section) {
  openSettings({
    settings: S.settings,
    section,
    root: S.root,
    setSettings: async (patch) => (S.settings = await api.setSettings(patch)),
    setTheme: (t) => setTheme(t),
    getZoom: () => S.zoom,
    setZoom: (z) => setZoom(z),
    chooseRoot,
    openAbout,
  });
}

function toggleTheme() {
  setTheme(document.documentElement.dataset.theme === 'dark' ? 'light' : 'dark');
}

function themeMenu(anchor) {
  const cur = S.settings.theme;
  openFloating(
    menuList([
      { label: 'Clair', icon: 'sun', active: cur === 'light', action: () => setTheme('light') },
      { label: 'Sombre', icon: 'moon', active: cur === 'dark', action: () => setTheme('dark') },
      { label: 'Système', icon: 'monitor', active: cur === 'system', action: () => setTheme('system') },
    ]),
    { anchor }
  );
}

/* ================================================================= tree */

function findNode(path, nodes = S.tree) {
  for (const n of nodes) {
    if (n.path === path) return n;
    if (n.children) {
      const f = findNode(path, n.children);
      if (f) return f;
    }
  }
  return null;
}

function countFiles(node) {
  // Compte les cours seulement (les PDF ne sont pas des cours).
  return node.children.reduce((s, c) => s + (c.type === 'dir' ? countFiles(c) : c.type === 'file' ? 1 : 0), 0);
}

async function refreshTree() {
  const { root, tree } = await api.tree();
  S.root = root;
  S.tree = tree;
  // Forget expanded folders that no longer exist.
  for (const p of S.expanded) if (!findNode(p)) S.expanded.delete(p);
  renderTree();
  renderRootButton();
  refreshReviewBadge();
}

/* ============================================================== révision */

let badgeTimer;
function refreshReviewBadge() {
  clearTimeout(badgeTimer);
  badgeTimer = setTimeout(async () => {
    const n = await dueCount(S.tree).catch(() => 0);
    const badge = $('#btn-review .rv-badge');
    badge.textContent = n > 99 ? '99+' : n;
    badge.hidden = !n;
  }, 400);
}

async function startReview() {
  await flushSave(); // les cartes viennent des fichiers : on enregistre d'abord le cours ouvert
  openReview({ tree: S.tree, current: S.current, folder: targetFolder() || null, openFile, onClose: refreshReviewBadge });
}

function persistExpanded() {
  api.setSettings({ expanded: [...S.expanded] });
}

function renderTree() {
  const tree = $('#tree');
  if (S.query) return renderSearch();
  $('#sb-label-text').textContent = 'Mes cours';
  tree.innerHTML = '';
  if (!S.tree.length) {
    tree.append(
      h(
        'div',
        { class: 'tree-empty' },
        h('div', { html: icon('folderPlus', 28) }),
        h('p', {}, 'Aucun cours pour le moment.'),
        h('button', { class: 'btn soft sm', onclick: () => newFolder() }, 'Créer un dossier')
      )
    );
    return;
  }
  tree.append(renderNodes(S.tree, 0));
}

function renderNodes(nodes, depth) {
  const frag = document.createDocumentFragment();
  for (const n of nodes) {
    const isDir = n.type === 'dir';
    const open = isDir && S.expanded.has(n.path);
    const row = h(
      'div',
      {
        class: `row ${n.type}${n.path === S.current || n.path === S.pdf ? ' active' : ''}${S.selected?.path === n.path ? ' selected' : ''}`,
        'data-path': n.path,
        'data-type': n.type,
        draggable: 'true',
        style: `--depth:${depth}`,
        title: n.name,
      },
      h('span', { class: `chev${open ? ' open' : ''}`, html: isDir ? icon('chevron', 14) : '' }),
      h('span', { class: 'ti', html: icon(isDir ? (open ? 'folderOpen' : 'folder') : 'file', 16) }),
      h('span', { class: 'name' }, n.name),
      isDir ? h('span', { class: 'count' }, String(countFiles(n) || '')) : null,
      isDir
        ? h('button', { class: 'row-add', title: 'Nouveau cours dans ce dossier', 'data-add': n.path, html: icon('plus', 14) })
        : null
    );
    frag.append(row);
    if (isDir && open) {
      const kids = h('div', { class: 'children', style: `--depth:${depth}` });
      if (n.children.length) kids.append(renderNodes(n.children, depth + 1));
      else kids.append(h('div', { class: 'row-empty', style: `--depth:${depth + 1}` }, 'Dossier vide'));
      frag.append(kids);
    }
  }
  return frag;
}

function select(path, type) {
  S.selected = path == null ? null : { path, type };
  document.querySelectorAll('#tree .row.selected').forEach((r) => r.classList.remove('selected'));
  if (path != null) document.querySelector(`#tree .row[data-path="${CSS.escape(path)}"]`)?.classList.add('selected');
}

function toggleFolder(path, force) {
  const open = force ?? !S.expanded.has(path);
  if (open) S.expanded.add(path);
  else S.expanded.delete(path);
  persistExpanded();
  renderTree();
}

function expandTo(path) {
  let p = parentOf(path);
  let changed = false;
  while (p) {
    if (!S.expanded.has(p)) {
      S.expanded.add(p);
      changed = true;
    }
    p = parentOf(p);
  }
  if (changed) persistExpanded();
}

function targetFolder() {
  if (!S.selected) return S.current ? parentOf(S.current) : '';
  return S.selected.type === 'dir' ? S.selected.path : parentOf(S.selected.path);
}

function startInlineRename(path) {
  const row = document.querySelector(`#tree .row[data-path="${CSS.escape(path)}"]`);
  if (!row) return;
  const nameEl = row.querySelector('.name');
  const original = nameEl.textContent;
  const input = h('input', { class: 'rename-input', value: original, spellcheck: 'false' });
  nameEl.replaceWith(input);
  row.draggable = false;
  input.focus();
  input.select();
  let done = false;
  const finish = async (commit) => {
    if (done) return;
    done = true;
    const value = input.value.trim();
    if (commit && value && value !== original) await renameItem(path, value);
    else renderTree();
  };
  input.addEventListener('keydown', (e) => {
    e.stopPropagation();
    if (e.key === 'Enter') finish(true);
    if (e.key === 'Escape') finish(false);
  });
  input.addEventListener('blur', () => finish(true));
  input.addEventListener('click', (e) => e.stopPropagation());
  input.addEventListener('dblclick', (e) => e.stopPropagation());
}

/* ============================================================== actions */

function remap(oldP, newP) {
  const map = (p) => (p && within(p, oldP) ? newP + p.slice(oldP.length) : p);
  S.current = map(S.current);
  S.pdf = map(S.pdf);
  if (S.selected) S.selected.path = map(S.selected.path);
  S.expanded = new Set([...S.expanded].map(map));
  persistExpanded();
  if (S.current || S.pdf) api.setSettings({ lastFile: S.current || S.pdf });
}

async function renameItem(path, name) {
  try {
    if (S.current && within(S.current, path)) await flushSave();
    const newPath = await api.rename(path, name);
    remap(path, newPath);
    await refreshTree();
    updateDocChrome();
  } catch (err) {
    toast(err.message || 'Impossible de renommer', 'error');
    renderTree();
  }
}

async function moveItem(path, targetDir) {
  if (parentOf(path) === targetDir || within(targetDir, path)) return;
  try {
    if (S.current && within(S.current, path)) await flushSave();
    const newPath = await api.move(path, targetDir);
    remap(path, newPath);
    if (targetDir) S.expanded.add(targetDir);
    persistExpanded();
    await refreshTree();
    updateDocChrome();
  } catch (err) {
    toast(String(err.message || err).replace(/^.*Error: /, ''), 'error');
  }
}

async function deleteItem(path, type) {
  const node = findNode(path);
  const name = node?.name ?? baseName(path);
  const text =
    type === 'dir'
      ? `Le dossier « ${name} » et tout son contenu (${countFiles(node)} cours) seront déplacés dans la corbeille.`
      : `${type === 'pdf' ? 'Le PDF' : 'Le cours'} « ${name} » sera déplacé dans la corbeille.`;
  if (!(await confirmModal({ title: 'Supprimer ?', text, ok: 'Supprimer', danger: true }))) return;
  if (S.current && within(S.current, path)) {
    clearTimeout(S.saveTimer);
    S.saveTimer = null;
    closeDoc();
  }
  if (S.pdf && within(S.pdf, path)) closeDoc();
  try {
    await api.remove(path);
    if (S.selected && within(S.selected.path, path)) S.selected = null;
    await refreshTree();
    toast('Déplacé dans la corbeille');
  } catch (err) {
    toast('Suppression impossible', 'error');
  }
}

async function newFile(parent = targetFolder()) {
  const path = await api.createFile(parent, 'Nouveau cours');
  if (parent) S.expanded.add(parent);
  persistExpanded();
  await refreshTree();
  await openFile(path);
  const t = $('#title');
  t.focus();
  t.select();
}

async function newFolder(parent = targetFolder()) {
  const path = await api.createFolder(parent, 'Nouveau dossier');
  if (parent) S.expanded.add(parent);
  persistExpanded();
  S.selected = { path, type: 'dir' };
  await refreshTree();
  startInlineRename(path);
}

/* ================================================================ search */

let searchTimer;
let searchSeq = 0;

function onSearchInput() {
  clearTimeout(searchTimer);
  searchTimer = setTimeout(async () => {
    S.query = $('#search').value.trim();
    if (!S.query) return renderTree();
    const seq = ++searchSeq;
    const results = await api.search(S.query);
    if (seq === searchSeq && S.query) renderSearch(results);
  }, 140);
}

let lastResults = [];
function renderSearch(results = lastResults) {
  lastResults = results;
  const tree = $('#tree');
  $('#sb-label-text').textContent = `Résultats (${results.length})`;
  tree.innerHTML = '';
  if (!results.length) {
    tree.append(h('div', { class: 'tree-empty' }, h('div', { html: icon('search', 26) }), h('p', {}, 'Aucun résultat')));
    return;
  }
  const q = S.query.toLowerCase();
  const mark = (text) => {
    const span = h('span');
    const i = text.toLowerCase().indexOf(q);
    if (i < 0) span.textContent = text;
    else span.append(text.slice(0, i), h('mark', {}, text.slice(i, i + q.length)), text.slice(i + q.length));
    return span;
  };
  for (const r of results) {
    tree.append(
      h(
        'button',
        { class: `result${r.path === S.current ? ' active' : ''}`, onclick: () => openFile(r.path) },
        h('span', { class: 'result-head' }, h('span', { class: 'ti', html: icon('file', 15) }), h('span', { class: 'result-name' }, mark(r.name))),
        r.folder ? h('span', { class: 'result-folder' }, r.folder.split('/').join(' › ')) : null,
        r.snippet ? h('span', { class: 'result-snippet' }, mark(r.snippet)) : null
      )
    );
  }
}

function clearSearch() {
  $('#search').value = '';
  S.query = '';
  renderTree();
}

/* ============================================================== document */

let ed;
let slash;

async function openFile(path) {
  if (path === S.current) return;
  await flushSave();
  closePdf();
  let content;
  try {
    content = await api.read(path);
  } catch {
    toast('Impossible d’ouvrir ce cours', 'error');
    return refreshTree();
  }
  S.current = path;
  S.selected = { path, type: 'file' };
  ed.commands.setContent(content || '', { emitUpdate: false });
  // Fresh state: undo history must not cross over from the previous file.
  ed.view.updateState(EditorState.create({ doc: ed.state.doc, plugins: ed.state.plugins, schema: ed.state.schema }));
  S.lastSaved = ed.getHTML();
  $('#empty').hidden = true;
  $('#doc').hidden = false;
  $('#scroller').scrollTop = 0;
  expandTo(path);
  api.setSettings({ lastFile: path });
  updateDocChrome();
  updateToolbar();
  updateStatus();
  setSaveState('saved');
  if (S.query) renderSearch();
  else renderTree();
}

/* ------------------------------------------------------------------ PDF */

const openExternalPdf = (path) => api.pdf.openExternal(path).catch(() => toast('Aucune application pour ouvrir ce PDF', 'error'));

async function openPdf(path) {
  if (path === S.pdf) return;
  await flushSave();
  let url;
  try {
    url = await api.pdf.url(path);
  } catch {
    toast('Impossible d\u2019ouvrir ce PDF', 'error');
    return refreshTree();
  }
  S.current = null;
  S.pdf = path;
  S.selected = { path, type: 'pdf' };
  $('#doc').hidden = true;
  $('#empty').hidden = true;
  $('#pdfview').hidden = false;
  $('#pdf-frame').src = url;
  $('#pdf-bar').replaceChildren(
    h('span', { class: 'pdf-name', html: icon('file', 15) }, baseName(path)),
    h('span', { class: 'pdf-spacer' }),
    h('button', { class: 'btn ghost sm', onclick: () => openExternalPdf(path), html: icon('external', 15) + '<span>Ouvrir dans une autre application</span>' }),
    h('button', { class: 'btn ghost sm', onclick: () => api.reveal(path), html: icon('folderOpen', 15) + '<span>Afficher dans le dossier</span>' })
  );
  expandTo(path);
  api.setSettings({ lastFile: path });
  updateDocChrome();
  if (S.query) renderSearch();
  else renderTree();
}

function closePdf() {
  if (!S.pdf) return;
  S.pdf = null;
  $('#pdfview').hidden = true;
  $('#pdf-frame').src = 'about:blank';
}

/** Importe des PDF dans un dossier : `files` = fichiers glissés, sinon fenêtre de choix. */
async function importPdfs(targetDir, files) {
  try {
    const added = files ? await api.pdf.importFiles(targetDir, files) : await api.pdf.import(targetDir);
    if (!added.length) return files ? toast('Seuls les fichiers PDF peuvent être importés', 'error') : null;
    if (targetDir) S.expanded.add(targetDir);
    persistExpanded();
    await refreshTree();
    toast(added.length > 1 ? `${added.length} PDF importés` : 'PDF importé');
    if (added.length === 1) openPdf(added[0]);
  } catch {
    toast('Import impossible', 'error');
  }
}

function closeDoc() {
  closePdf();
  S.current = null;
  $('#doc').hidden = true;
  $('#empty').hidden = false;
  api.setSettings({ lastFile: null });
  updateDocChrome();
}

function updateDocChrome() {
  const crumbs = $('#crumbs');
  crumbs.innerHTML = '';
  const title = $('#title');
  const cur = S.current || S.pdf;
  if (!cur) {
    document.title = 'Notes++';
    return;
  }
  const parts = cur.split('/');
  const name = baseName(cur);
  document.title = `${name} — Notes++`;
  if (S.current && document.activeElement !== title) title.value = name;
  autosizeTitle();

  const add = (label, path) => {
    if (crumbs.childNodes.length) crumbs.append(h('span', { class: 'crumb-sep', html: icon('chevron', 12) }));
    crumbs.append(
      h(
        'button',
        {
          class: `crumb${path == null ? ' current' : ''}`,
          onclick: () => {
            if (path == null) return;
            if (path) {
              expandTo(path + '/x');
              S.expanded.add(path);
              persistExpanded();
            }
            select(path || null, 'dir');
            clearSearch();
          },
        },
        label
      )
    );
  };
  add('Mes cours', '');
  parts.slice(0, -1).forEach((p, i) => add(p, parts.slice(0, i + 1).join('/')));
  add(name, null);

  const folder = parts.slice(0, -1);
  $('#doc-path').innerHTML = folder.length ? icon('folder', 13) + `<span>${folder.map(escapeHtml).join(' <i>/</i> ')}</span>` : '';
}

function escapeHtml(s) {
  return s.replace(/[&<>"]/g, (c) => ({ '&': '&amp;', '<': '&lt;', '>': '&gt;', '"': '&quot;' })[c]);
}

function autosizeTitle() {
  const t = $('#title');
  t.style.height = 'auto';
  t.style.height = t.scrollHeight + 'px';
}

function setupTitle() {
  const t = $('#title');
  t.addEventListener('input', autosizeTitle);
  t.addEventListener('keydown', (e) => {
    if (e.key === 'Enter' || e.key === 'ArrowDown') {
      e.preventDefault();
      t.blur();
      ed.commands.focus('start');
    } else if (e.key === 'Escape') {
      t.value = baseName(S.current);
      t.blur();
    }
  });
  t.addEventListener('blur', () => {
    if (!S.current) return;
    const v = t.value.trim();
    if (!v) t.value = baseName(S.current);
    else if (v !== baseName(S.current)) renameItem(S.current, v);
    autosizeTitle();
  });
}

/* ------------------------------------------------------------------ save */

function setSaveState(state) {
  const el = $('#st-save');
  el.dataset.state = state;
  el.innerHTML =
    state === 'saving'
      ? '<span class="dot"></span>Enregistrement…'
      : state === 'error'
        ? icon('warning', 14) + 'Erreur d’enregistrement'
        : icon('checkCircle', 14) + 'Enregistré';
}

function scheduleSave() {
  if (!S.current) return;
  setSaveState('saving');
  clearTimeout(S.saveTimer);
  S.saveTimer = setTimeout(save, 450);
}

async function save() {
  clearTimeout(S.saveTimer);
  S.saveTimer = null;
  if (!S.current) return;
  const path = S.current;
  const html = ed.getHTML();
  if (html === S.lastSaved) return setSaveState('saved');
  try {
    await api.write(path, html);
    if (path === S.current) S.lastSaved = html;
    setSaveState('saved');
    if (html.includes('data-callout')) refreshReviewBadge();
  } catch {
    setSaveState('error');
  }
}

async function flushSave() {
  if (S.saveTimer || (S.current && ed.getHTML() !== S.lastSaved)) await save();
}

window.addEventListener('beforeunload', () => {
  if (S.current && ed && ed.getHTML() !== S.lastSaved) api.writeSync(S.current, ed.getHTML());
});

/* ---------------------------------------------------------------- status */

function updateStatus() {
  const words = ed.storage.characterCount.words();
  const chars = ed.storage.characterCount.characters();
  const min = Math.max(1, Math.round(words / 200));
  $('#st-count').textContent = `${words.toLocaleString('fr')} mot${words > 1 ? 's' : ''} · ${chars.toLocaleString('fr')} caractère${chars > 1 ? 's' : ''} · ${min} min de lecture`;
}

function setZoom(z) {
  S.zoom = Math.min(1.6, Math.max(0.8, Math.round(z * 10) / 10));
  document.documentElement.style.setProperty('--zoom', S.zoom);
  $('#st-zoom').textContent = S.zoom === 1 ? '' : `${Math.round(S.zoom * 100)} %`;
  try {
    localStorage.setItem('zoom', String(S.zoom));
  } catch {}
}

/* =============================================================== toolbar */

const TEXT_COLORS = [
  ['Par défaut', null],
  ['Gris', '#8a8f98'],
  ['Rouge', '#e5484d'],
  ['Orange', '#f76b15'],
  ['Jaune', '#d6a100'],
  ['Vert', '#30a46c'],
  ['Bleu', '#2f80ed'],
  ['Violet', '#8e4ec6'],
  ['Rose', '#d6409f'],
  ['Marron', '#a0714f'],
];
const HIGHLIGHTS = [
  ['Aucun', null],
  ['Jaune', 'rgba(255, 212, 0, 0.4)'],
  ['Vert', 'rgba(70, 200, 120, 0.32)'],
  ['Bleu', 'rgba(60, 140, 255, 0.3)'],
  ['Violet', 'rgba(150, 90, 255, 0.3)'],
  ['Rose', 'rgba(255, 80, 160, 0.3)'],
  ['Orange', 'rgba(255, 140, 40, 0.34)'],
  ['Rouge', 'rgba(255, 70, 70, 0.3)'],
];
const BLOCKS = [
  { label: 'Texte', cls: 'bt-p', is: () => ed.isActive('paragraph'), run: (c) => c.setParagraph() },
  { label: 'Titre 1', cls: 'bt-h1', is: () => ed.isActive('heading', { level: 1 }), run: (c) => c.setHeading({ level: 1 }) },
  { label: 'Titre 2', cls: 'bt-h2', is: () => ed.isActive('heading', { level: 2 }), run: (c) => c.setHeading({ level: 2 }) },
  { label: 'Titre 3', cls: 'bt-h3', is: () => ed.isActive('heading', { level: 3 }), run: (c) => c.setHeading({ level: 3 }) },
];
const ALIGNS = [
  ['left', 'alignLeft', 'Aligner à gauche'],
  ['center', 'alignCenter', 'Centrer'],
  ['right', 'alignRight', 'Aligner à droite'],
  ['justify', 'alignJustify', 'Justifier'],
];

const tb = {}; // id -> { el, active?, disabled? }

function chain() {
  return ed.chain().focus();
}

function tbButton(id, { icon: ic, html, title, run, active, disabled, popup }) {
  const el = h('button', {
    class: `tb-btn${popup ? ' has-pop' : ''}`,
    title,
    html: (html ?? icon(ic, 17)) + (popup ? icon('chevronDown', 11, 'tb-caret') : ''),
  });
  el.addEventListener('mousedown', (e) => e.preventDefault()); // keep editor selection
  el.addEventListener('click', () => {
    if (popup) {
      if (el.classList.contains('pop-open')) return closeFloating();
      el.classList.add('pop-open');
      openFloating(popup(), { anchor: el }, { onClose: () => el.classList.remove('pop-open'), cls: 'tb-pop' });
    } else run();
  });
  tb[id] = { el, active, disabled };
  return el;
}

const sep = () => h('span', { class: 'tb-sep' });

function swatches(list, current, apply, kind) {
  return h(
    'div',
    { class: 'swatches' },
    list.map(([name, value]) =>
      h('button', {
        class: `swatch ${kind}${value === current || (!value && !current) ? ' active' : ''}${value ? '' : ' none'}`,
        title: name,
        style: value ? (kind === 'text' ? `color:${value}` : `background:${value}`) : '',
        html: kind === 'text' ? 'A' : value ? '' : icon('x', 13),
        onclick: () => {
          closeFloating();
          apply(value);
        },
      })
    )
  );
}

function tableGrid() {
  const ROWS = 8;
  const COLS = 8;
  const label = h('div', { class: 'grid-label' }, 'Insérer un tableau');
  const grid = h('div', { class: 'grid-pick', style: `--cols:${COLS}` });
  for (let r = 1; r <= ROWS; r++) {
    for (let c = 1; c <= COLS; c++) {
      const cell = h('span', { 'data-r': r, 'data-c': c });
      cell.addEventListener('mouseenter', () => {
        label.textContent = `${r} × ${c}`;
        grid.querySelectorAll('span').forEach((s) => s.classList.toggle('on', +s.dataset.r <= r && +s.dataset.c <= c));
      });
      cell.addEventListener('click', () => {
        closeFloating();
        chain().insertTable({ rows: r, cols: c, withHeaderRow: true }).run();
      });
      grid.append(cell);
    }
  }
  return h('div', { class: 'pop-pad' }, label, grid);
}

function tableMenu() {
  return menuList([
    { label: 'Ligne au-dessus', icon: 'plus', action: () => chain().addRowBefore().run() },
    { label: 'Ligne en dessous', icon: 'plus', action: () => chain().addRowAfter().run() },
    { label: 'Colonne à gauche', icon: 'plus', action: () => chain().addColumnBefore().run() },
    { label: 'Colonne à droite', icon: 'plus', action: () => chain().addColumnAfter().run() },
    'sep',
    { label: 'Ligne d’en-tête', icon: 'table', action: () => chain().toggleHeaderRow().run() },
    { label: 'Fusionner / séparer', icon: 'table', action: () => chain().mergeOrSplit().run() },
    'sep',
    { label: 'Supprimer la ligne', icon: 'minus', action: () => chain().deleteRow().run() },
    { label: 'Supprimer la colonne', icon: 'minus', action: () => chain().deleteColumn().run() },
    { label: 'Supprimer le tableau', icon: 'trash', danger: true, action: () => chain().deleteTable().run() },
  ]);
}

async function editLink() {
  const prev = ed.getAttributes('link').href || '';
  const url = await promptModal({ title: prev ? 'Modifier le lien' : 'Ajouter un lien', value: prev, placeholder: 'https://…', ok: 'Valider' });
  if (!url) return ed.commands.focus();
  const href = /^(https?:|mailto:)/i.test(url) ? url : `https://${url}`;
  if (ed.state.selection.empty && !ed.isActive('link')) {
    chain().insertContent({ type: 'text', text: url, marks: [{ type: 'link', attrs: { href } }] }).run();
  } else {
    chain().extendMarkRange('link').setLink({ href }).run();
  }
}

async function insertImage() {
  const src = await api.pickImage();
  if (src) chain().command(({ state, commands }) => insertBlock(state, commands, { type: 'image', attrs: { src } })).run();
  else ed.commands.focus();
}

function buildToolbar() {
  const bar = $('#toolbar');
  const blockBtn = tbButton('block', {
    html: '<span class="tb-text" id="tb-block-label">Texte</span>',
    title: 'Style du paragraphe',
    popup: () =>
      menuList(
        BLOCKS.map((b) => ({
          label: b.label,
          active: b.is(),
          action: () => b.run(chain()).run(),
        }))
      ),
  });
  blockBtn.classList.add('tb-block');

  bar.append(
    tbButton('undo', { icon: 'undo', title: 'Annuler (Ctrl+Z)', run: () => chain().undo().run(), disabled: () => !ed.can().undo() }),
    tbButton('redo', { icon: 'redo', title: 'Rétablir (Ctrl+Y)', run: () => chain().redo().run(), disabled: () => !ed.can().redo() }),
    sep(),
    blockBtn,
    sep(),
    tbButton('bold', { icon: 'bold', title: 'Gras (Ctrl+B)', run: () => chain().toggleBold().run(), active: () => ed.isActive('bold') }),
    tbButton('italic', { icon: 'italic', title: 'Italique (Ctrl+I)', run: () => chain().toggleItalic().run(), active: () => ed.isActive('italic') }),
    tbButton('underline', { icon: 'underline', title: 'Souligné (Ctrl+U)', run: () => chain().toggleUnderline().run(), active: () => ed.isActive('underline') }),
    tbButton('strike', { icon: 'strike', title: 'Barré (Ctrl+Maj+S)', run: () => chain().toggleStrike().run(), active: () => ed.isActive('strike') }),
    tbButton('code', { icon: 'code', title: 'Code (Ctrl+E)', run: () => chain().toggleCode().run(), active: () => ed.isActive('code') }),
    tbButton('color', {
      html: '<span class="tb-color"><b>A</b><i id="tb-color-bar"></i></span>',
      title: 'Couleur du texte',
      popup: () =>
        h(
          'div',
          { class: 'pop-pad' },
          h('div', { class: 'pop-title' }, 'Couleur du texte'),
          swatches(TEXT_COLORS, ed.getAttributes('textStyle').color || null, (v) => (v ? chain().setColor(v).run() : chain().unsetColor().run()), 'text')
        ),
    }),
    tbButton('highlight', {
      icon: 'highlighter',
      title: 'Surligner',
      active: () => ed.isActive('highlight'),
      popup: () =>
        h(
          'div',
          { class: 'pop-pad' },
          h('div', { class: 'pop-title' }, 'Surlignage'),
          swatches(HIGHLIGHTS, ed.getAttributes('highlight').color || null, (v) => (v ? chain().setHighlight({ color: v }).run() : chain().unsetHighlight().run()), 'bg')
        ),
    }),
    sep(),
    tbButton('bullet', { icon: 'list', title: 'Liste à puces', run: () => chain().toggleBulletList().run(), active: () => ed.isActive('bulletList') }),
    tbButton('ordered', { icon: 'listOrdered', title: 'Liste numérotée', run: () => chain().toggleOrderedList().run(), active: () => ed.isActive('orderedList') }),
    tbButton('task', { icon: 'checklist', title: 'Liste de tâches', run: () => chain().toggleTaskList().run(), active: () => ed.isActive('taskList') }),
    tbButton('align', {
      icon: 'alignLeft',
      title: 'Alignement',
      popup: () =>
        menuList(
          ALIGNS.map(([v, ic, label]) => ({
            label,
            icon: ic,
            active: ed.isActive({ textAlign: v }),
            action: () => chain().setTextAlign(v).run(),
          }))
        ),
    }),
    sep(),
    tbButton('callout', {
      icon: 'callout',
      title: 'Encadré',
      active: () => ed.isActive('callout'),
      popup: () => {
        const cur = ed.isActive('callout') ? ed.getAttributes('callout').variant : null;
        const items = CALLOUTS.map((v) => ({ label: v.label, icon: v.icon, active: cur === v.id, action: () => chain().setCallout(v.id).run() }));
        if (cur) items.push('sep', { label: 'Retirer l’encadré', icon: 'x', action: () => chain().unsetCallout().run() });
        const m = menuList(items);
        m.classList.add('callout-menu');
        return m;
      },
    }),
    tbButton('math', {
      icon: 'sigma',
      title: 'Formule mathématique',
      popup: () =>
        menuList([
          { label: 'Formule dans la ligne', icon: 'sigma', action: () => openMathEditor(ed, { kind: 'inline' }) },
          { label: 'Formule centrée', icon: 'sigma', action: () => openMathEditor(ed, { kind: 'block' }) },
        ]),
    }),
    tbButton('quote', { icon: 'quote', title: 'Citation', run: () => chain().toggleBlockquote().run(), active: () => ed.isActive('blockquote') }),
    tbButton('codeBlock', { icon: 'codeBlock', title: 'Bloc de code', run: () => chain().toggleCodeBlock().run(), active: () => ed.isActive('codeBlock') }),
    tbButton('table', { icon: 'table', title: 'Tableau', active: () => ed.isActive('table'), popup: () => (ed.isActive('table') ? tableMenu() : tableGrid()) }),
    tbButton('image', { icon: 'image', title: 'Insérer une image', run: insertImage }),
    tbButton('link', { icon: 'link', title: 'Lien (Ctrl+K)', active: () => ed.isActive('link'), run: () => linkAction() }),
    sep(),
    tbButton('clear', { icon: 'eraser', title: 'Effacer la mise en forme', run: () => chain().unsetAllMarks().clearNodes().run() }),
    sep(),
    aiButton()
  );
}

function aiButton() {
  const el = tbButton('ai', {
    html: icon('sparkle', 16) + '<span class="tb-text">IA</span>',
    title: 'Intelligence artificielle',
    popup: () =>
      menuList([
        { label: 'Corriger les fautes', icon: 'spell', kbd: 'Ctrl Maj O', action: () => correct(ed) },
        { label: 'Insérer un schéma…', icon: 'diagram', action: () => diagramDialog(ed) },
        { label: 'Ajouter un pictogramme…', icon: 'image', action: () => pictoDialog(ed) },
        { label: 'Zone de formes', icon: 'shapes', action: () => chain().insertShapeBoard().run() },
        'sep',
        { label: 'Installer ou changer l’IA', icon: 'gear', action: () => openAppSettings('ai') },
      ]),
  });
  el.classList.add('tb-ai');
  return el;
}

function linkAction() {
  if (!ed.isActive('link')) return editLink();
  const el = tb.link.el;
  el.classList.add('pop-open');
  openFloating(
    menuList([
      { label: 'Modifier le lien', icon: 'pencil', action: editLink },
      { label: 'Ouvrir le lien', icon: 'external', action: () => window.open(ed.getAttributes('link').href) },
      { label: 'Retirer le lien', icon: 'x', action: () => chain().extendMarkRange('link').unsetLink().run() },
    ]),
    { anchor: el },
    { onClose: () => el.classList.remove('pop-open') }
  );
}

let tbFrame = 0;
function updateToolbar() {
  if (tbFrame) return;
  tbFrame = requestAnimationFrame(() => {
    tbFrame = 0;
    if (!S.current) return;
    for (const { el, active, disabled } of Object.values(tb)) {
      if (active) el.classList.toggle('on', !!active());
      if (disabled) el.disabled = !!disabled();
    }
    const block = BLOCKS.find((b) => b.is());
    $('#tb-block-label').textContent = block ? block.label : ed.isActive('codeBlock') ? 'Code' : 'Texte';
    $('#tb-color-bar').style.background = ed.getAttributes('textStyle').color || 'currentColor';
    const align = ALIGNS.find(([v]) => ed.isActive({ textAlign: v }));
    tb.align.el.firstElementChild.outerHTML = icon(align ? align[1] : 'alignLeft', 17);
    positionImageBubble();
    positionDiagramBubble();
  });
}

/* ---------------------------------------------------------- image bubble */

let imgBubble;

function buildImageBubble() {
  imgBubble = h('div', { class: 'floating img-bubble' });
  imgBubble.addEventListener('mousedown', (e) => e.preventDefault()); // keep the image selected
  for (const a of IMAGE_ALIGNS) {
    imgBubble.append(
      h('button', {
        class: 'tb-btn',
        title: a.label,
        'data-align': a.id,
        html: icon(a.icon, 17),
        onclick: () => ed.chain().focus().updateAttributes('image', { align: a.id }).run(),
      })
    );
  }
  imgBubble.append(
    h('span', { class: 'tb-sep' }),
    h('button', { class: 'tb-btn danger', title: 'Supprimer l’image', html: icon('trash', 17), onclick: () => ed.chain().focus().deleteSelection().run() })
  );
  document.body.append(imgBubble);
  $('#scroller').addEventListener('scroll', positionImageBubble, { passive: true });
  window.addEventListener('resize', positionImageBubble);
}

/* -------------------------------------------------------- diagram bubble */

let dgBubble;

function buildDiagramBubble() {
  const btn = (label, ic, onclick, cls = '') => {
    const b = h('button', { class: 'tb-btn ' + cls, title: label, html: icon(ic, 16) + (cls.includes('txt') ? '<span class="tb-text">' + label + '</span>' : '') });
    b.addEventListener('click', () => onclick(b));
    return b;
  };
  const current = () => {
    const sel = ed.state.selection;
    return sel.node?.type.name === 'diagram' ? { pos: sel.from, node: sel.node } : null;
  };
  const update = (fn) => {
    const c = current();
    if (!c) return;
    const attrs = structuredClone(c.node.attrs);
    fn(attrs);
    ed.view.dispatch(ed.state.tr.setNodeMarkup(c.pos, undefined, attrs));
  };
  const pop = (anchor, content) => openFloating(content, { anchor }, { cls: 'tb-pop' });
  const withPoints = (kind) => ['comparison', 'mindmap', 'hierarchy'].includes(kind);
  const withText = (kind) => ['timeline', 'steps', 'cards'].includes(kind);
  dgBubble = h(
    'div',
    { class: 'floating img-bubble dg-bubble' },
    btn('Type de schéma', 'diagram', (b) =>
      pop(b, menuList(DIAGRAM_KINDS.map((k) => ({ label: k.label, active: current()?.node.attrs.kind === k.id, action: () => update((a) => (a.kind = k.id)) }))))
    ),
    btn('Couleurs', 'palette', (b) =>
      pop(
        b,
        h(
          'div',
          { class: 'pop-pad palettes' },
          h('div', { class: 'pop-title' }, 'Couleurs'),
          Object.entries(PALETTES).map(([id, colors]) =>
            h(
              'button',
              { class: 'pal-row' + (current()?.node.attrs.palette === id ? ' on' : ''), onclick: () => (closeFloating(), update((a) => (a.palette = id))) },
              colors.map((c) => h('i', { style: 'background:' + c }))
            )
          )
        )
      )
    ),
    h('span', { class: 'tb-sep' }),
    btn('Ajouter une case', 'plus', () =>
      update((a) => a.items.push({ title: 'Nouveau', text: withText(a.kind) ? 'Texte' : '', children: withPoints(a.kind) ? ['Point'] : [] }))
    ),
    btn('Retirer la dernière case', 'minus', () => update((a) => a.items.length > 1 && a.items.pop())),
    btn('Ajouter un point à chaque case', 'list', () => update((a) => a.items.forEach((it) => (it.children = [...(it.children || []), 'Point'])))),
    h('span', { class: 'tb-sep' }),
    btn(
      'Régénérer',
      'sparkle',
      () => {
        const c = current();
        if (c) diagramDialog(ed, { kind: c.node.attrs.kind, replace: c.pos, request: c.node.attrs.title });
      },
      'txt'
    ),
    btn('Supprimer le schéma', 'trash', () => ed.chain().focus().deleteSelection().run(), 'danger')
  );
  dgBubble.addEventListener('mousedown', (e) => e.preventDefault());
  document.body.append(dgBubble);
  $('#scroller').addEventListener('scroll', positionDiagramBubble, { passive: true });
}

function positionDiagramBubble() {
  const sel = ed.state.selection;
  const dom = S.current && sel.node?.type.name === 'diagram' ? ed.view.nodeDOM(sel.from) : null;
  if (!dom) return dgBubble.classList.remove('open');
  const r = dom.getBoundingClientRect();
  const area = $('#scroller').getBoundingClientRect();
  const b = dgBubble.getBoundingClientRect();
  if (r.bottom < area.top || r.top > area.bottom) return dgBubble.classList.remove('open');
  dgBubble.style.top = Math.max(area.top + 8, r.top - b.height - 10) + 'px';
  dgBubble.style.left = Math.min(Math.max(8, r.left + r.width / 2 - b.width / 2), window.innerWidth - b.width - 8) + 'px';
  dgBubble.classList.add('open');
}

function positionImageBubble() {
  const sel = ed.state.selection;
  const dom = S.current && sel.node?.type.name === 'image' ? ed.view.nodeDOM(sel.from) : null;
  if (!dom) return imgBubble.classList.remove('open');
  const r = (dom.querySelector?.('img') || dom).getBoundingClientRect();
  const area = $('#scroller').getBoundingClientRect();
  const b = imgBubble.getBoundingClientRect();
  if (r.bottom < area.top || r.top > area.bottom) return imgBubble.classList.remove('open');
  const top = Math.max(area.top + 8, r.top - b.height - 10);
  const left = Math.min(Math.max(8, r.left + r.width / 2 - b.width / 2), window.innerWidth - b.width - 8);
  imgBubble.style.top = `${top}px`;
  imgBubble.style.left = `${left}px`;
  const current = sel.node.attrs.align || 'center';
  imgBubble.querySelectorAll('[data-align]').forEach((btn) => btn.classList.toggle('on', btn.dataset.align === current));
  imgBubble.classList.add('open');
}

/* ================================================================ layout */

function setupSidebar() {
  const sb = $('#sidebar');
  const setW = (w) => document.documentElement.style.setProperty('--sb-w', `${w}px`);
  setW(S.settings.sidebarWidth || 280);

  $('#resizer').addEventListener('pointerdown', (e) => {
    e.preventDefault();
    const startX = e.clientX;
    const startW = sb.getBoundingClientRect().width;
    document.body.classList.add('resizing');
    let w = startW;
    const move = (ev) => {
      w = Math.min(480, Math.max(210, startW + ev.clientX - startX));
      setW(w);
    };
    const up = () => {
      document.body.classList.remove('resizing');
      window.removeEventListener('pointermove', move);
      window.removeEventListener('pointerup', up);
      api.setSettings({ sidebarWidth: Math.round(w) });
    };
    window.addEventListener('pointermove', move);
    window.addEventListener('pointerup', up);
  });
  $('#resizer').addEventListener('dblclick', () => {
    setW(280);
    api.setSettings({ sidebarWidth: 280 });
  });

  const tree = $('#tree');

  tree.addEventListener('click', (e) => {
    const add = e.target.closest('[data-add]');
    if (add) {
      e.stopPropagation();
      return newFile(add.dataset.add);
    }
    const row = e.target.closest('.row');
    if (!row) return select(null);
    const { path, type } = row.dataset;
    if (type === 'dir') {
      select(path, 'dir');
      toggleFolder(path);
    } else if (type === 'pdf') {
      openPdf(path);
    } else {
      openFile(path);
    }
  });

  tree.addEventListener('dblclick', (e) => {
    const row = e.target.closest('.row');
    if (row && row.dataset.type !== 'dir') startInlineRename(row.dataset.path);
  });

  tree.addEventListener('contextmenu', (e) => {
    const row = e.target.closest('.row');
    if (!row) {
      return contextMenu(e, [
        { label: 'Nouveau cours', icon: 'filePlus', kbd: 'Ctrl N', action: () => newFile('') },
        { label: 'Nouveau dossier', icon: 'folderPlus', kbd: 'Ctrl Maj N', action: () => newFolder('') },
        { label: 'Importer un PDF…', icon: 'download', action: () => importPdfs('') },
        'sep',
        { label: 'Ouvrir dans l’explorateur', icon: 'external', action: () => api.reveal('') },
      ]);
    }
    const { path, type } = row.dataset;
    select(path, type);
    if (type === 'dir') {
      contextMenu(e, [
        { label: 'Nouveau cours ici', icon: 'filePlus', action: () => newFile(path) },
        { label: 'Nouveau sous-dossier', icon: 'folderPlus', action: () => newFolder(path) },
        { label: 'Importer un PDF ici…', icon: 'download', action: () => importPdfs(path) },
        'sep',
        { label: 'Renommer', icon: 'pencil', kbd: 'F2', action: () => startInlineRename(path) },
        { label: 'Afficher dans l’explorateur', icon: 'external', action: () => api.reveal(path) },
        'sep',
        { label: 'Supprimer', icon: 'trash', danger: true, kbd: 'Suppr', action: () => deleteItem(path, 'dir') },
      ]);
    } else if (type === 'pdf') {
      contextMenu(e, [
        { label: 'Ouvrir', icon: 'file', action: () => openPdf(path) },
        { label: 'Ouvrir dans une autre application', icon: 'external', action: () => openExternalPdf(path) },
        { label: 'Renommer', icon: 'pencil', kbd: 'F2', action: () => startInlineRename(path) },
        { label: 'Afficher dans l\u2019explorateur', icon: 'folderOpen', action: () => api.reveal(path) },
        'sep',
        { label: 'Supprimer', icon: 'trash', danger: true, kbd: 'Suppr', action: () => deleteItem(path, 'pdf') },
      ]);
    } else {
      contextMenu(e, [
        { label: 'Ouvrir', icon: 'file', action: () => openFile(path) },
        { label: 'Renommer', icon: 'pencil', kbd: 'F2', action: () => startInlineRename(path) },
        { label: 'Exporter en PDF', icon: 'download', action: async () => (await openFile(path), exportPdf()) },
        { label: 'Afficher dans l’explorateur', icon: 'external', action: () => api.reveal(path) },
        'sep',
        { label: 'Supprimer', icon: 'trash', danger: true, kbd: 'Suppr', action: () => deleteItem(path, 'file') },
      ]);
    }
  });

  tree.addEventListener('keydown', (e) => {
    if (!S.selected || e.target !== tree) return;
    if (e.key === 'F2') startInlineRename(S.selected.path);
    if (e.key === 'Delete') deleteItem(S.selected.path, S.selected.type);
  });

  // Drag & drop to move files and folders.
  let dragPath = null;
  const clearDrop = () => tree.querySelectorAll('.drop').forEach((n) => n.classList.remove('drop'));
  const dropTarget = (e) => {
    const row = e.target.closest('.row');
    if (!row) return { el: tree, dir: '' };
    if (row.dataset.type === 'dir') return { el: row, dir: row.dataset.path };
    const parent = parentOf(row.dataset.path);
    return { el: parent ? tree.querySelector(`.row[data-path="${CSS.escape(parent)}"]`) : tree, dir: parent };
  };
  let hoverTimer;
  tree.addEventListener('dragstart', (e) => {
    const row = e.target.closest('.row');
    if (!row) return;
    dragPath = row.dataset.path;
    e.dataTransfer.effectAllowed = 'move';
    e.dataTransfer.setData('text/plain', dragPath);
    requestAnimationFrame(() => row.classList.add('dragging'));
  });
  tree.addEventListener('dragend', () => {
    dragPath = null;
    clearDrop();
    tree.querySelectorAll('.dragging').forEach((n) => n.classList.remove('dragging'));
  });
  const externalFiles = (e) => !dragPath && e.dataTransfer?.types.includes('Files');
  tree.addEventListener('dragover', (e) => {
    if (externalFiles(e)) {
      // PDF glissé depuis l'Explorateur : on montre le dossier qui le recevra.
      e.preventDefault();
      e.dataTransfer.dropEffect = 'copy';
      const t = dropTarget(e);
      if (!t.el?.classList.contains('drop')) {
        clearDrop();
        t.el?.classList.add('drop');
      }
      return;
    }
    if (!dragPath) return;
    const t = dropTarget(e);
    if (within(t.dir, dragPath) && t.dir !== parentOf(dragPath)) return;
    e.preventDefault();
    if (!t.el?.classList.contains('drop')) {
      clearDrop();
      t.el?.classList.add('drop');
      clearTimeout(hoverTimer);
      // Hovering a closed folder opens it.
      if (t.dir && !S.expanded.has(t.dir) && t.el !== tree) {
        hoverTimer = setTimeout(() => dragPath && toggleFolder(t.dir, true), 650);
      }
    }
  });
  tree.addEventListener('dragleave', (e) => {
    if (!tree.contains(e.relatedTarget)) clearDrop();
  });
  tree.addEventListener('drop', (e) => {
    e.preventDefault();
    clearTimeout(hoverTimer);
    clearDrop();
    if (externalFiles(e)) return importPdfs(dropTarget(e).dir, e.dataTransfer.files);
    if (!dragPath) return;
    const t = dropTarget(e);
    const p = dragPath;
    dragPath = null;
    moveItem(p, t.dir);
  });

  $('#new-file').innerHTML = icon('filePlus', 16) + '<span>Cours</span>';
  $('#new-folder').innerHTML = icon('folderPlus', 16) + '<span>Dossier</span>';
  $('#new-file').title = 'Nouveau cours (Ctrl+N)';
  $('#new-folder').title = 'Nouveau dossier (Ctrl+Maj+N)';
  $('#new-file').addEventListener('click', () => newFile());
  $('#new-folder').addEventListener('click', () => newFolder());
  $('#btn-review').innerHTML = icon('cards', 16) + '<span>Réviser</span><span class="rv-badge" hidden></span>';
  $('#btn-review').addEventListener('click', startReview);

  $('#search-ic').innerHTML = icon('search', 15);
  const search = $('#search');
  search.addEventListener('input', onSearchInput);
  search.addEventListener('keydown', (e) => {
    if (e.key === 'Escape') {
      clearSearch();
      search.blur();
    }
    if (e.key === 'Enter' && lastResults[0] && S.query) openFile(lastResults[0].path);
  });

  $('#root-btn').addEventListener('click', (e) => {
    const btn = e.currentTarget;
    openFloating(
      menuList([
        { label: 'Ouvrir dans l’explorateur', icon: 'external', action: () => api.reveal('') },
        { label: 'Changer de dossier…', icon: 'folder', action: chooseRoot },
        'sep',
        { label: 'Paramètres', icon: 'gear', kbd: 'Ctrl ,', action: () => openAppSettings() },
        { label: 'À propos et mises à jour', icon: 'info', action: openAbout },
      ]),
      { anchor: btn }
    );
  });
}

function renderRootButton() {
  const name = S.root.split(/[\\/]/).filter(Boolean).pop() || S.root;
  $('#root-btn').innerHTML = icon('hardDrive', 15) + `<span>${escapeHtml(name)}</span>` + icon('chevronDown', 12);
  $('#root-btn').title = S.root;
}

async function chooseRoot() {
  await flushSave();
  const root = await api.chooseRoot();
  if (!root) return;
  S.expanded.clear();
  S.selected = null;
  closeDoc();
  await refreshTree();
  toast('Dossier changé');
}

function toggleSidebar() {
  document.body.classList.toggle('sb-hidden');
}

function toggleFocus() {
  const on = !document.body.classList.contains('focus-mode');
  document.body.classList.toggle('focus-mode', on);
  api.toggleFullscreen();
}

async function exportPdf() {
  if (!S.current) return toast('Ouvre un cours pour l’exporter', 'error');
  await flushSave();
  setSaveState('saving');
  try {
    const file = await api.exportPdf(baseName(S.current), mathForPdf(ed.getHTML()), { accent: S.settings.accent, font: S.settings.font });
    if (file) toast('PDF exporté');
  } catch {
    toast('Export PDF impossible', 'error');
  }
  setSaveState('saved');
}

function renderEmpty() {
  const kb = (keys, label) => h('div', { class: 'sc' }, h('span', { class: 'sc-label' }, label), h('span', { class: 'sc-keys' }, keys.map((k) => h('kbd', {}, k))));
  $('#empty').append(
    h(
      'div',
      { class: 'empty-card' },
      h('div', { class: 'empty-logo', html: LOGO }),
      h('h1', {}, 'Prêt à travailler ?'),
      h('p', {}, 'Ouvre un cours dans la barre latérale ou crée-en un nouveau.'),
      h(
        'div',
        { class: 'empty-actions' },
        h('button', { class: 'btn primary', onclick: () => newFile(), html: icon('filePlus', 17) + '<span>Nouveau cours</span>' }),
        h('button', { class: 'btn soft', onclick: () => newFolder(), html: icon('folderPlus', 17) + '<span>Nouveau dossier</span>' }),
        h('button', { class: 'btn soft', onclick: () => importPdfs(targetFolder()), html: icon('download', 17) + '<span>Importer un PDF</span>' })
      ),
      h(
        'div',
        { class: 'shortcuts' },
        kb(['Ctrl', 'N'], 'Nouveau cours'),
        kb(['Ctrl', 'Maj', 'N'], 'Nouveau dossier'),
        kb(['Ctrl', 'P'], 'Rechercher'),
        kb(['Ctrl', 'Maj', 'R'], 'Réviser mes cartes'),
        kb(['/'], 'Insérer un bloc'),
        kb(['Ctrl', 'Maj', 'L'], 'Thème clair / sombre'),
        kb(['F11'], 'Mode concentration')
      )
    )
  );
}

/* ============================================================= shortcuts */

function setupShortcuts() {
  document.addEventListener('keydown', (e) => {
    const mod = e.ctrlKey || e.metaKey;
    const k = e.key.toLowerCase();
    if (mod && !e.shiftKey && k === 'n') return e.preventDefault(), newFile();
    if (mod && e.shiftKey && k === 'n') return e.preventDefault(), newFolder();
    if (mod && (k === 'p' || (k === 'f' && e.shiftKey))) {
      e.preventDefault();
      document.body.classList.remove('sb-hidden', 'focus-mode');
      $('#search').focus();
      $('#search').select();
      return;
    }
    if (mod && e.shiftKey && k === 'l') return e.preventDefault(), toggleTheme();
    if (mod && e.key === ',') return e.preventDefault(), openAppSettings();
    if (mod && e.shiftKey && k === 'o' && S.current) return e.preventDefault(), correct(ed);
    if (mod && e.shiftKey && k === 'e') return e.preventDefault(), exportPdf();
    if (mod && e.shiftKey && k === 'r') return e.preventDefault(), startReview();
    if (mod && e.key === '\\') return e.preventDefault(), toggleSidebar();
    if (mod && k === 's') {
      e.preventDefault();
      return flushSave().then(() => toast('Enregistré'));
    }
    if (mod && k === 'k' && S.current) return e.preventDefault(), linkAction();
    if (mod && (e.key === '=' || e.key === '+')) return e.preventDefault(), setZoom(S.zoom + 0.1);
    if (mod && e.key === '-') return e.preventDefault(), setZoom(S.zoom - 0.1);
    if (mod && e.key === '0') return e.preventDefault(), setZoom(1);
    if (e.key === 'F11') return e.preventDefault(), toggleFocus();
    if (e.key === 'Escape' && document.body.classList.contains('focus-mode') && !isFloatingOpen() && !slash.isOpen()) {
      return toggleFocus();
    }
    if (e.key === 'Escape' && isFloatingOpen()) return closeFloating();
  });

  // Ctrl + mouse wheel zooms the page.
  document.addEventListener(
    'wheel',
    (e) => {
      if (!e.ctrlKey || !S.current) return;
      e.preventDefault();
      setZoom(S.zoom + (e.deltaY < 0 ? 0.1 : -0.1));
    },
    { passive: false }
  );
}

/* ================================================================== init */

async function init() {
  document.body.classList.add(`platform-${api.platform}`);
  S.settings = await api.getSettings();
  S.expanded = new Set(S.settings.expanded || []);
  applyTheme(S.settings.effectiveTheme);
  applyLook(S.settings);
  setSettingsOpener((section) => openAppSettings(section));
  api.onSystemTheme((t) => S.settings.theme === 'system' && applyTheme(t, true));
  api.onFullscreen((on) => !on && document.body.classList.remove('focus-mode'));

  try {
    setZoom(parseFloat(localStorage.getItem('zoom')) || 1);
  } catch {
    setZoom(1);
  }

  $('#brand').innerHTML = LOGO + '<span>Notes++</span>';
  $('#brand').addEventListener('click', openAbout);
  setupUpdates();
  $('#btn-sidebar').innerHTML = icon('sidebar');
  $('#btn-focus').innerHTML = icon('focus');
  $('#btn-pdf').innerHTML = icon('download');
  $('#btn-sidebar').addEventListener('click', toggleSidebar);
  $('#btn-focus').addEventListener('click', toggleFocus);
  $('#btn-pdf').addEventListener('click', exportPdf);
  $('#btn-theme').addEventListener('click', (e) => themeMenu(e.currentTarget));
  $('#btn-settings').innerHTML = icon('gear');
  $('#btn-settings').addEventListener('click', () => openAppSettings());

  ({ editor: ed, slash } = createEditor({
    element: $('#editor'),
    actions: {
      pickImage: insertImage,
      diagram: () => diagramDialog(ed),
      illustration: () => pictoDialog(ed),
      correct: () => correct(ed),
      math: (opts) => openMathEditor(ed, opts),
    },
    onUpdate: () => {
      scheduleSave();
      updateStatus();
    },
    onTransaction: updateToolbar,
  }));

  // Clicking the empty space under the text puts the caret at the end.
  $('#scroller').addEventListener('mousedown', (e) => {
    if (e.target === $('#scroller') || e.target.classList.contains('page')) {
      const last = $('#editor').getBoundingClientRect().bottom;
      if (e.clientY > last) {
        e.preventDefault();
        ed.commands.focus('end');
      }
    }
  });

  buildToolbar();
  buildImageBubble();
  buildDiagramBubble();
  setupTitle();
  setupSidebar();
  setupShortcuts();
  renderEmpty();

  await refreshTree();
  const last = (await api.getSettings()).lastFile; // re-read: first launch creates the welcome course
  if (last && findNode(last)) await (/\.pdf$/i.test(last) ? openPdf(last) : openFile(last));
  document.body.classList.add('ready');
}

init();
