import { icon, LOGO } from './icons.js';
import { $, h, toast } from './ui.js';

const api = window.notesApp;

let status = { state: 'idle' };
let panel = null; // open "À propos" overlay
let announced = false;

const fmtDate = (ts) => new Date(ts).toLocaleString('fr', { day: 'numeric', month: 'long', hour: '2-digit', minute: '2-digit' });

function renderPill() {
  const pill = $('#btn-update');
  const { state, version, percent } = status;
  const show = ['available', 'downloading', 'ready'].includes(state);
  pill.hidden = !show;
  if (!show) return;
  pill.dataset.state = state;
  pill.innerHTML =
    state === 'ready'
      ? icon('sparkle', 15) + '<span>Redémarrer pour mettre à jour</span>'
      : state === 'downloading'
        ? `<span class="pill-ring" style="--p:${percent || 0}"></span><span>Téléchargement… ${percent || 0} %</span>`
        : `<span class="pill-dot"></span><span>Mise à jour ${version}</span>`;
  pill.title = state === 'ready' ? `Installer Notes++ ${version}` : `Notes++ ${version} est disponible`;
}

function statusBlock() {
  const { state, version, current, percent, error, checkedAt, canInstall } = status;
  const row = (cls, ic, title, text) =>
    h('div', { class: `up-status ${cls}` }, h('span', { class: 'up-ic', html: icon(ic, 20) }), h('div', {}, h('b', {}, title), text ? h('p', {}, text) : null));

  const btn = (label, cls, onclick, ic) => h('button', { class: `btn ${cls}`, onclick, html: (ic ? icon(ic, 16) : '') + `<span>${label}</span>` });
  const check = () => api.update.check();

  switch (state) {
    case 'checking':
      return [row('busy', 'download', 'Recherche de mises à jour…', 'Connexion à GitHub en cours.'), null];
    case 'latest':
      return [
        row('ok', 'checkCircle', 'Notes++ est à jour', `Tu as la dernière version (${current}).${checkedAt ? ` Vérifié le ${fmtDate(checkedAt)}.` : ''}`),
        btn('Vérifier à nouveau', 'soft', check, 'search'),
      ];
    case 'available':
      return [
        row('new', 'sparkle', `Nouvelle version disponible : ${version}`, error || (canInstall ? 'Elle se télécharge en quelques secondes, puis s’installe au redémarrage. Tes cours ne sont pas touchés.' : (window.notesApp.platform === 'darwin' ? 'Sur Mac, télécharge la nouvelle version depuis GitHub et remplace l’ancienne dans Applications.' : 'Tu utilises la version portable : télécharge la nouvelle version depuis GitHub.'))),
        h(
          'div',
          { class: 'up-actions' },
          btn(canInstall ? 'Mettre à jour' : 'Télécharger', 'primary', () => api.update.download(), 'download'),
          btn('Nouveautés', 'ghost', () => api.update.notes(), 'external')
        ),
      ];
    case 'downloading':
      return [
        row('busy', 'download', `Téléchargement de la version ${version}…`, null),
        h('div', { class: 'up-progress' }, h('div', { class: 'up-track' }, h('div', { class: 'up-bar', style: `width:${percent || 0}%` })), h('span', {}, `${percent || 0} %`)),
      ];
    case 'ready':
      return [
        row('new', 'checkCircle', `La version ${version} est prête`, 'Notes++ va se fermer, s’installer et se rouvrir tout seul. Ton travail est enregistré.'),
        btn('Redémarrer et installer', 'primary', () => api.update.install(), 'sparkle'),
      ];
    case 'error':
      return [row('err', 'warning', 'Impossible de vérifier les mises à jour', error), btn('Réessayer', 'soft', check, 'search')];
    case 'unsupported':
      return [row('muted', 'info', 'Mises à jour désactivées', 'Les mises à jour automatiques fonctionnent dans la version installée de Notes++.'), null];
    default:
      return [row('muted', 'info', 'Mises à jour', 'La vérification démarre dans un instant.'), btn('Vérifier maintenant', 'soft', check, 'search')];
  }
}

function renderPanel() {
  if (!panel) return;
  const body = panel.querySelector('.up-body');
  body.innerHTML = '';
  const [block, action] = statusBlock();
  body.append(block);
  if (action) body.append(action);
}

export function openAbout() {
  if (panel) return;
  const overlay = h('div', { class: 'overlay' });
  const close = () => {
    overlay.classList.remove('open');
    setTimeout(() => overlay.remove(), 150);
    document.removeEventListener('keydown', onKey, true);
    panel = null;
  };
  const onKey = (e) => e.key === 'Escape' && (e.stopPropagation(), close());
  overlay.addEventListener('mousedown', (e) => e.target === overlay && close());
  document.addEventListener('keydown', onKey, true);
  panel = h(
    'div',
    { class: 'modal about' },
    h('button', { class: 'icon-btn about-close', title: 'Fermer', onclick: close, html: icon('x', 18) }),
    h('div', { class: 'about-head' }, h('div', { class: 'about-logo', html: LOGO }), h('div', {}, h('h3', {}, 'Notes++'), h('p', {}, `Version ${status.current || ''}`))),
    h('div', { class: 'up-body' }),
    h(
      'div',
      { class: 'about-foot' },
      h('button', { class: 'link', onclick: () => api.update.notes() }, 'Page du projet sur GitHub'),
      h('span', { title: 'IA : Llama 3.2 (Built with Llama) ou Qwen 2.5 · Pictogrammes : Twemoji (CC-BY 4.0)' }, 'Gratuit · Open source (MIT) · Built with Llama')
    )
  );
  overlay.append(panel);
  document.body.append(overlay);
  renderPanel();
  requestAnimationFrame(() => overlay.classList.add('open'));
  if (['idle', 'error', 'latest'].includes(status.state)) api.update.check();
}

function onStatus(s) {
  const prev = status.state;
  status = s;
  renderPill();
  renderPanel();
  if (s.state === 'available' && prev !== 'available' && !announced) {
    announced = true;
    toast(`Notes++ ${s.version} est disponible`);
  }
  if (s.state === 'ready' && prev !== 'ready') toast('Mise à jour prête : redémarre pour l’installer');
}

export async function setupUpdates() {
  $('#btn-update').addEventListener('click', () => (status.state === 'ready' ? api.update.install() : openAbout()));
  api.onUpdate(onStatus);
  onStatus(await api.update.get());
}
