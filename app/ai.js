'use strict';

// Claude features: spelling correction, diagram generation and SVG illustrations.
// The API key is stored encrypted with the OS (DPAPI on Windows) via safeStorage.

const { app, safeStorage, ipcMain } = require('electron');
const path = require('path');
const fs = require('fs');

const MODEL = 'claude-opus-5-5';
const KEY_FILE = path.join(app.getPath('userData'), 'ai.json');

let Anthropic = null;
let client = null;
const running = new Map(); // request id -> AbortController

/* ------------------------------------------------------------------ key */

function readKey() {
  try {
    const { key } = JSON.parse(fs.readFileSync(KEY_FILE, 'utf8'));
    const buf = Buffer.from(key, 'base64');
    return safeStorage.isEncryptionAvailable() ? safeStorage.decryptString(buf) : buf.toString('utf8');
  } catch {
    return null;
  }
}

function writeKey(key) {
  const buf = safeStorage.isEncryptionAvailable() ? safeStorage.encryptString(key) : Buffer.from(key, 'utf8');
  fs.mkdirSync(path.dirname(KEY_FILE), { recursive: true });
  fs.writeFileSync(KEY_FILE, JSON.stringify({ key: buf.toString('base64') }));
}

function getClient() {
  if (client) return client;
  const key = readKey();
  if (!key) throw new UserError('no-key', 'Ajoute ta clé API Claude pour utiliser l’IA.');
  Anthropic = Anthropic || require('@anthropic-ai/sdk').default;
  client = new Anthropic({ apiKey: key, maxRetries: 2 });
  return client;
}

class UserError extends Error {
  constructor(code, message) {
    super(message);
    this.code = code;
  }
}

function friendly(err) {
  if (err instanceof UserError) return { code: err.code, message: err.message };
  const A = Anthropic || require('@anthropic-ai/sdk').default;
  if (err instanceof A.APIUserAbortError) return { code: 'aborted', message: 'Annulé.' };
  if (err instanceof A.AuthenticationError) return { code: 'auth', message: 'Clé API refusée. Vérifie-la dans les réglages de l’IA.' };
  if (err instanceof A.PermissionDeniedError) return { code: 'auth', message: 'Cette clé n’a pas accès au modèle Claude demandé.' };
  if (err instanceof A.RateLimitError) return { code: 'rate', message: 'Trop de demandes d’un coup. Réessaie dans un instant.' };
  if (err instanceof A.BadRequestError && /credit|billing|balance/i.test(err.message)) {
    return { code: 'billing', message: 'Crédit insuffisant sur ton compte Anthropic (console.anthropic.com → Billing).' };
  }
  if (err instanceof A.APIConnectionError) return { code: 'network', message: 'Pas de connexion Internet.' };
  if (err instanceof A.InternalServerError) return { code: 'server', message: 'Claude est momentanément indisponible. Réessaie plus tard.' };
  if (err instanceof A.APIError) return { code: 'api', message: `Erreur de l’API (${err.status}).` };
  return { code: 'unknown', message: 'Une erreur inattendue est survenue.' };
}

/* ------------------------------------------------------------- requests */

// One streamed request with server-side refusal fallback; returns the final text.
async function ask(id, { system, prompt, schema, effort = 'medium', maxTokens = 16000 }) {
  const controller = new AbortController();
  running.set(id, controller);
  try {
    const output_config = { effort };
    if (schema) output_config.format = { type: 'json_schema', schema };
    const stream = getClient().beta.messages.stream(
      {
        model: MODEL,
        max_tokens: maxTokens,
        betas: ['server-side-fallback-2026-07-01'],
        fallbacks: 'default',
        system,
        output_config,
        messages: [{ role: 'user', content: prompt }],
      },
      { signal: controller.signal }
    );
    const message = await stream.finalMessage();
    if (message.stop_reason === 'refusal') throw new UserError('refusal', 'Claude n’a pas pu traiter cette demande.');
    if (message.stop_reason === 'max_tokens') throw new UserError('too-long', 'La réponse était trop longue. Essaie sur une partie plus courte du cours.');
    const text = message.content
      .filter((b) => b.type === 'text')
      .map((b) => b.text)
      .join('');
    if (!schema) return text;
    try {
      return JSON.parse(text);
    } catch {
      throw new UserError('format', 'La réponse de Claude était illisible. Réessaie.');
    }
  } finally {
    running.delete(id);
  }
}

const strictObject = (properties) => ({ type: 'object', properties, required: Object.keys(properties), additionalProperties: false });

const CORRECTION_SCHEMA = strictObject({
  corrections: {
    type: 'array',
    items: strictObject({
      original: { type: 'string' },
      replacement: { type: 'string' },
      reason: { type: 'string' },
    }),
  },
});

const CORRECTION_SYSTEM = `Tu es un correcteur professionnel de la langue française qui relit les cours d'un étudiant.
Repère uniquement les vraies fautes : orthographe, grammaire, accords, conjugaison, homophones, ponctuation et typographie française (espaces avant ; : ! ?, majuscules, apostrophes).
Ne reformule pas le style, ne change pas le sens, ne touche pas aux formules, au code, aux noms propres ni aux abréviations volontaires.
Pour chaque faute, "original" doit être un extrait copié EXACTEMENT du texte (mêmes caractères, mêmes espaces), le plus court possible tout en restant unique : ajoute un ou deux mots voisins si le mot fautif apparaît plusieurs fois.
"replacement" est ce même extrait corrigé. "reason" explique la règle en quelques mots, en français, en tutoyant (ex. « accord du participe passé avec avoir »).
S'il n'y a aucune faute, renvoie une liste vide.`;

const DIAGRAM_KINDS = {
  mindmap: 'carte mentale : "title" est le thème central, chaque item est une branche (title), avec 2 à 4 sous-idées très courtes dans "children" ; "text" peut rester vide. 4 à 6 branches.',
  timeline: 'frise chronologique : chaque item est un événement, "title" = date ou période courte, "text" = l’événement en une phrase courte ; "children" vide. 4 à 7 items dans l’ordre chronologique.',
  steps: 'suite d’étapes : chaque item est une étape, "title" = nom court de l’étape, "text" = une phrase ; "children" vide. 3 à 6 étapes.',
  cycle: 'cycle : chaque item est une phase qui mène à la suivante puis revient au début, "title" = nom court, "text" = quelques mots ; "children" vide. 3 à 6 phases.',
  comparison: 'comparaison : chaque item est une colonne (2 ou 3), "title" = ce qui est comparé, "text" vide, "children" = 3 à 5 points courts et parallèles entre colonnes.',
  hierarchy: 'organigramme / classification : "title" = la racine, chaque item est une catégorie (title), "children" = 1 à 4 sous-éléments courts ; "text" vide. 2 à 5 catégories.',
  cards: 'fiche de révision en cartes : chaque item est une notion clé, "title" = la notion, "text" = définition ou point à retenir en une à deux phrases ; "children" vide. 3 à 6 cartes.',
};

const DIAGRAM_SCHEMA = strictObject({
  title: { type: 'string' },
  items: {
    type: 'array',
    items: strictObject({
      title: { type: 'string' },
      text: { type: 'string' },
      children: { type: 'array', items: { type: 'string' } },
    }),
  },
});

const ILLUSTRATION_SYSTEM = `Tu es un illustrateur qui dessine en SVG pour des cours d'étudiants.
Réponds uniquement avec un document SVG complet, sans texte autour ni bloc de code.
Contraintes : <svg xmlns="http://www.w3.org/2000/svg" viewBox="0 0 800 520">, aucune image externe, aucun script, aucune police externe, pas de <foreignObject>.
Style : illustration plate et soignée, formes simples, couleurs harmonieuses, fond clair.
Les éventuelles légendes sont en français, en font-family="Segoe UI, Arial, sans-serif", lisibles (taille 18 ou plus) et sans faute.`;

const ILLUSTRATION_STYLES = {
  flat: 'Style illustration plate et colorée.',
  schema: 'Style schéma pédagogique légendé, comme dans un manuel scolaire, avec flèches et légendes.',
  line: 'Style dessin au trait épuré, peu de couleurs.',
  icon: 'Style grosse icône centrée, très simple, sans légende.',
};

function cleanSvg(text) {
  const m = text.match(/<svg[\s\S]*<\/svg>/i);
  if (!m) throw new UserError('format', 'Claude n’a pas renvoyé d’illustration. Réessaie avec une autre description.');
  return m[0]
    .replace(/<script[\s\S]*?<\/script>/gi, '')
    .replace(/<foreignObject[\s\S]*?<\/foreignObject>/gi, '')
    .replace(/\son\w+\s*=\s*("[^"]*"|'[^']*')/gi, '')
    .replace(/(href\s*=\s*["'])(?!#)[^"']*(["'])/gi, '$1#$2');
}

/* ------------------------------------------------------------------- ipc */

function handle(channel, fn) {
  ipcMain.handle(channel, async (_e, ...args) => {
    try {
      return { ok: true, value: await fn(...args) };
    } catch (err) {
      return { ok: false, error: friendly(err) };
    }
  });
}

function register() {
  handle('ai:status', () => ({ configured: !!readKey(), model: MODEL }));

  handle('ai:setKey', async (key) => {
    key = String(key || '').trim();
    if (!/^sk-ant-/.test(key)) throw new UserError('format', 'Une clé API Claude commence par « sk-ant- ».');
    Anthropic = Anthropic || require('@anthropic-ai/sdk').default;
    const test = new Anthropic({ apiKey: key, maxRetries: 1 });
    await test.models.retrieve(MODEL); // checks the key without spending tokens
    writeKey(key);
    client = null;
    return true;
  });

  handle('ai:clearKey', () => {
    fs.rmSync(KEY_FILE, { force: true });
    client = null;
    return true;
  });

  handle('ai:cancel', (id) => {
    running.get(id)?.abort();
    return true;
  });

  handle('ai:correct', async (id, text) => {
    const { corrections } = await ask(id, {
      system: CORRECTION_SYSTEM,
      prompt: `Voici le texte à relire, entre les balises <texte>.\n<texte>\n${text}\n</texte>`,
      schema: CORRECTION_SCHEMA,
      effort: 'medium',
    });
    // Keep only fixes that really change something and that we can find in the text.
    return corrections.filter((c) => c.original && c.original !== c.replacement && text.includes(c.original));
  });

  handle('ai:diagram', async (id, { kind, request, context }) => {
    const shape = DIAGRAM_KINDS[kind] || DIAGRAM_KINDS.cards;
    const prompt = [
      `Crée le contenu d'un schéma de type ${shape}`,
      request ? `Demande de l'étudiant : ${request}` : 'Base-toi sur les notions les plus importantes du cours.',
      context ? `Cours de l'étudiant, pour le contexte :\n<cours>\n${context.slice(0, 60000)}\n</cours>` : '',
      'Textes en français, courts (un schéma se lit d’un coup d’œil), sans faute, sans markdown ni émoji.',
    ]
      .filter(Boolean)
      .join('\n\n');
    return ask(id, { system: 'Tu conçois des schémas pédagogiques clairs pour les cours d’étudiants.', prompt, schema: DIAGRAM_SCHEMA, effort: 'medium' });
  });

  handle('ai:illustration', async (id, { request, style }) => {
    const text = await ask(id, {
      system: ILLUSTRATION_SYSTEM,
      prompt: `${ILLUSTRATION_STYLES[style] || ILLUSTRATION_STYLES.flat}\nDessine : ${request}`,
      effort: 'high',
      maxTokens: 32000,
    });
    return cleanSvg(text);
  });
}

module.exports = { register };
