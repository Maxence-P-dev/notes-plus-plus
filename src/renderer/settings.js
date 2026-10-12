import { icon } from './icons.js';
import { h, toast } from './ui.js';

const api = window.notesApp;

export const ACCENTS = [
  { name: 'Violet', value: null, swatch: '#6d5dfc' },
  { name: 'Bleu', value: '#2563eb' },
  { name: 'Turquoise', value: '#0d9488' },
  { name: 'Vert', value: '#16a34a' },
  { name: 'Ambre', value: '#d97706' },
  { name: 'Orange', value: '#ea580c' },
  { name: 'Rouge', value: '#dc2626' },
  { name: 'Rose', value: '#db2777' },
  { name: 'Magenta', value: '#c026d3' },
  { name: 'Graphite', value: '#475569' },
];

export const FONTS = [
  { id: 'modern', label: 'Moderne', sample: 'Segoe UI', css: "'Segoe UI Variable Text','Segoe UI',sans-serif" },
  { id: 'classic', label: 'Classique', sample: 'Cambria', css: 'Cambria, Georgia, serif' },
  { id: 'hand', label: 'Manuscrite', sample: 'Segoe Print', css: "'Segoe Print','Comic Sans MS',cursive" },
];

/** Applies the colour and font chosen in the settings to the whole page. */
export function applyLook({ accent, font }) {
  const root = document.documentElement;
  if (accent) {
    root.dataset.accent = '';
    root.style.setProperty('--accent-base', accent);
  } else {
    delete root.dataset.accent;
    root.style.removeProperty('--accent-base');
  }
  root.dataset.font = font || 'modern';
}

let overlay = null;

/**
 * Settings window. `ctx` gives access to the parts of the app it changes:
 * { settings, setTheme, setSettings, getZoom, setZoom, chooseRoot, openAbout, root, section }
 */
export async function openSettings(ctx) {
  if (overlay) return;
  let s = { ...ctx.settings };
  overlay = h('div', { class: 'overlay' });
  const close = () => {
    overlay.classList.remove('open');
    const el = overlay;
    setTimeout(() => el.remove(), 150);
    document.removeEventListener('keydown', onKey, true);
    overlay = null;
  };
  const onKey = (e) => e.key === 'Escape' && (e.stopPropagation(), close());
  document.addEventListener('keydown', onKey, true);
  overlay.addEventListener('mousedown', (e) => e.target === overlay && close());

  const save = async (patch) => {
    s = { ...s, ...(await ctx.setSettings(patch)) };
    applyLook(s);
    ctx.onChange?.(s);
  };

  const section = (id, title, ic, ...body) => h('section', { class: 'set-sec', id: `set-${id}` }, h('h4', {}, h('span', { html: icon(ic, 16) }), title), ...body);
  const row = (label, hint, control) => h('div', { class: 'set-row' }, h('div', { class: 'set-lbl' }, h('b', {}, label), hint ? h('span', {}, hint) : null), control);
  const seg = (options, current, onPick) => {
    const box = h('div', { class: 'seg' });
    options.forEach((o) => {
      box.append(
        h('button', {
          class: `seg-btn${o.id === current ? ' on' : ''}`,
          html: (o.icon ? icon(o.icon, 15) : '') + `<span>${o.label}</span>`,
          onclick: () => {
            box.querySelectorAll('.seg-btn').forEach((b) => b.classList.remove('on'));
            box.children[options.indexOf(o)].classList.add('on');
            onPick(o.id);
          },
        })
      );
    });
    return box;
  };

  /* --- couleur */
  const swatches = h('div', { class: 'accent-grid' });
  const custom = h('input', { type: 'color', class: 'accent-custom', title: 'Couleur personnalisée' });
  const paintSwatches = () => {
    swatches.querySelectorAll('.accent-sw').forEach((b) => b.classList.toggle('on', (b.dataset.v || null) === (s.accent || null)));
    const isCustom = s.accent && !ACCENTS.some((a) => a.value === s.accent);
    custom.parentElement?.classList.toggle('on', !!isCustom);
    custom.value = s.accent || '#6d5dfc';
  };
  ACCENTS.forEach((a) =>
    swatches.append(
      h('button', {
        class: 'accent-sw',
        title: a.name,
        'data-v': a.value || '',
        style: `--sw:${a.value || a.swatch}`,
        html: icon('check', 15),
        onclick: async () => {
          await save({ accent: a.value });
          paintSwatches();
        },
      })
    )
  );
  const customWrap = h('label', { class: 'accent-sw custom', title: 'Couleur personnalisée', html: icon('palette', 16) }, custom);
  custom.addEventListener('input', () => applyLook({ ...s, accent: custom.value }));
  custom.addEventListener('change', async () => {
    await save({ accent: custom.value });
    paintSwatches();
  });
  swatches.append(customWrap);

  /* --- zoom */
  const zoomOut = h('span', { class: 'zoom-val' });
  const zoom = h('input', { type: 'range', min: '80', max: '160', step: '10', class: 'range' });
  zoom.value = Math.round(ctx.getZoom() * 100);
  const paintZoom = () => (zoomOut.textContent = `${zoom.value} %`);
  zoom.addEventListener('input', () => {
    ctx.setZoom(zoom.value / 100);
    paintZoom();
  });
  paintZoom();

  /* --- IA */
  const aiBox = h('div', { class: 'ai-key' });
  const renderAi = async () => {
    const st = await api.ai.status();
    const configured = st.ok && st.value.configured;
    aiBox.innerHTML = '';
    if (configured) {
      aiBox.append(
        h('div', { class: 'ai-ok' }, h('span', { html: icon('checkCircle', 18) }), h('div', {}, h('b', {}, 'IA activée'), h('span', {}, `Modèle : Claude Opus 5.5 · ta clé est chiffrée sur cet ordinateur`))),
        h(
          'button',
          {
            class: 'btn ghost sm',
            onclick: async () => {
              await api.ai.clearKey();
              toast('Clé supprimée');
              renderAi();
            },
          },
          'Retirer la clé'
        )
      );
      return;
    }
    const input = h('input', { class: 'input', type: 'password', placeholder: 'sk-ant-…', spellcheck: 'false', autocomplete: 'off' });
    const msg = h('div', { class: 'ai-msg' });
    const saveBtn = h('button', { class: 'btn primary sm', html: icon('key', 15) + '<span>Activer</span>' });
    const submit = async () => {
      saveBtn.disabled = true;
      msg.className = 'ai-msg';
      msg.textContent = 'Vérification de la clé…';
      const r = await api.ai.setKey(input.value);
      saveBtn.disabled = false;
      if (r.ok) {
        toast('IA activée');
        renderAi();
      } else {
        msg.className = 'ai-msg err';
        msg.textContent = r.error.message;
      }
    };
    saveBtn.addEventListener('click', submit);
    input.addEventListener('keydown', (e) => e.key === 'Enter' && submit());
    aiBox.append(
      h(
        'p',
        { class: 'set-help' },
        'Notes++ utilise Claude, l’IA d’Anthropic. Crée une clé API sur ',
        h('a', { href: 'https://console.anthropic.com/settings/keys', target: '_blank' }, 'console.anthropic.com'),
        ', ajoute un peu de crédit, puis colle la clé ici. Une correction coûte en général quelques centimes.'
      ),
      h('div', { class: 'ai-input' }, input, saveBtn),
      msg
    );
    setTimeout(() => ctx.section === 'ai' && input.focus(), 60);
  };

  const box = h(
    'div',
    { class: 'modal settings' },
    h('div', { class: 'set-head' }, h('h3', {}, 'Paramètres'), h('button', { class: 'icon-btn', title: 'Fermer', onclick: close, html: icon('x', 18) })),
    h(
      'div',
      { class: 'set-body' },
      section(
        'look',
        'Apparence',
        'palette',
        row(
          'Thème',
          null,
          seg(
            [
              { id: 'light', label: 'Clair', icon: 'sun' },
              { id: 'dark', label: 'Sombre', icon: 'moon' },
              { id: 'system', label: 'Système', icon: 'monitor' },
            ],
            s.theme,
            (t) => ctx.setTheme(t)
          )
        ),
        row('Couleur principale', 'Boutons, titres, sélection et logo', swatches)
      ),
      section(
        'text',
        'Texte des cours',
        'type',
        row(
          'Police',
          null,
          h(
            'div',
            { class: 'font-grid' },
            FONTS.map((f) =>
              h(
                'button',
                {
                  class: `font-card${(s.font || 'modern') === f.id ? ' on' : ''}`,
                  style: `font-family:${f.css}`,
                  onclick: async (e) => {
                    e.currentTarget.parentElement.querySelectorAll('.font-card').forEach((b) => b.classList.remove('on'));
                    e.currentTarget.classList.add('on');
                    await save({ font: f.id });
                  },
                },
                h('b', {}, 'Aa'),
                h('span', {}, f.label)
              )
            )
          )
        ),
        row('Taille du texte', 'Aussi avec Ctrl + / Ctrl −', h('div', { class: 'zoom-row' }, zoom, zoomOut))
      ),
      section('ai', 'Intelligence artificielle', 'sparkle', aiBox),
      section(
        'files',
        'Dossier et mises à jour',
        'folder',
        row('Dossier des cours', ctx.root, h('button', { class: 'btn soft sm', onclick: () => (close(), ctx.chooseRoot()) }, 'Changer…')),
        row('Version', null, h('button', { class: 'btn soft sm', onclick: () => (close(), ctx.openAbout()) }, 'À propos et mises à jour'))
      )
    )
  );
  overlay.append(box);
  document.body.append(overlay);
  paintSwatches();
  renderAi();
  requestAnimationFrame(() => {
    overlay.classList.add('open');
    if (ctx.section) box.querySelector(`#set-${ctx.section}`)?.scrollIntoView({ block: 'start' });
  });
}
