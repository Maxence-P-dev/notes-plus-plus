'use strict';

// Built-in AI: a small language model that runs on the user's computer with
// node-llama-cpp. Downloaded once from Hugging Face, then works offline.

const { app, ipcMain } = require('electron');
const path = require('path');
const fs = require('fs');

const MODELS = {
  standard: {
    id: 'standard',
    label: 'Standard',
    name: 'Llama 3.2 3B',
    size: '2,0 Go',
    hint: 'Meilleure qualité, recommandé',
    uri: 'hf:bartowski/Llama-3.2-3B-Instruct-GGUF:Q4_K_M',
    file: 'Llama-3.2-3B-Instruct-Q4_K_M.gguf',
  },
  light: {
    id: 'light',
    label: 'Léger',
    name: 'Qwen 2.5 1.5B',
    size: '1,0 Go',
    hint: 'Plus rapide, pour les petits PC',
    uri: 'hf:bartowski/Qwen2.5-1.5B-Instruct-GGUF:Q4_K_M',
    file: 'Qwen2.5-1.5B-Instruct-Q4_K_M.gguf',
  },
};

const MODELS_DIR = path.join(app.getPath('userData'), 'models');
const IDLE_UNLOAD = 10 * 60 * 1000;

let win = null;
let lib = null; // node-llama-cpp module (ESM, loaded on demand)
let llama = null;
let loaded = null; // { id, model }
let unloadTimer = null;
let download = null; // { id, downloader, percent }
let queue = Promise.resolve();
const running = new Map(); // request id -> AbortController

class UserError extends Error {
  constructor(code, message) {
    super(message);
    this.code = code;
  }
}

const modelPath = (id) => path.join(MODELS_DIR, MODELS[id].file);
const installed = () => Object.keys(MODELS).filter((id) => fs.existsSync(modelPath(id)));

function chosen() {
  const ids = installed();
  try {
    const pref = JSON.parse(fs.readFileSync(path.join(MODELS_DIR, 'choice.json'), 'utf8')).id;
    if (ids.includes(pref)) return pref;
  } catch {}
  return ids.includes('standard') ? 'standard' : ids[0] || null;
}

function status() {
  return {
    models: Object.values(MODELS).map(({ id, label, name, size, hint }) => ({ id, label, name, size, hint, installed: fs.existsSync(modelPath(id)) })),
    active: chosen(),
    download: download && { id: download.id, percent: download.percent },
    gpu: llama ? llama.gpu || 'cpu' : null,
  };
}

const send = () => win?.webContents.send('llm:status', status());

async function getLib() {
  lib = lib || (await import('node-llama-cpp'));
  return lib;
}

async function getModel() {
  const id = chosen();
  if (!id) throw new UserError('no-model', 'Installe d’abord l’IA de Notes++ dans les Paramètres.');
  clearTimeout(unloadTimer);
  unloadTimer = setTimeout(unload, IDLE_UNLOAD);
  if (loaded?.id === id) return loaded;
  await unload();
  const { getLlama } = await getLib();
  if (!llama) {
    llama = await getLlama({ gpu: 'auto' });
    // Integrated Intel graphics run these models slower than the processor itself.
    const devices = llama.gpu ? await llama.getGpuDeviceNames() : [];
    if (devices.length && devices.every((d) => /intel/i.test(d) && !/arc/i.test(d))) {
      await llama.dispose();
      llama = await getLlama({ gpu: false });
    }
  }
  const model = await llama.loadModel({ modelPath: modelPath(id) });
  // One context kept for the whole session: creating it is the slow part.
  const context = await model.createContext({ contextSize: 4096, sequences: 1 });
  loaded = { id, model, context };
  send();
  return loaded;
}

async function unload() {
  clearTimeout(unloadTimer);
  const m = loaded;
  loaded = null;
  grammars.clear();
  await m?.context.dispose().catch(() => {});
  await m?.model.dispose().catch(() => {});
}

const grammars = new Map(); // schema JSON -> compiled grammar

async function grammarFor(schema) {
  const key = JSON.stringify(schema);
  if (!grammars.has(key)) grammars.set(key, await llama.createGrammarForJsonSchema(schema));
  return grammars.get(key);
}

/**
 * One generation, constrained to a JSON schema. Requests run one at a time.
 * onProgress(n) receives the number of characters produced so far.
 */
function generate(id, { system, prompt, schema, maxTokens = 1200, onProgress }) {
  const run = async () => {
    const controller = new AbortController();
    running.set(id, controller);
    let session = null;
    try {
      const { context } = await getModel();
      const { LlamaChatSession } = await getLib();
      session = new LlamaChatSession({ contextSequence: context.getSequence(), systemPrompt: system });
      const grammar = await grammarFor(schema);
      let produced = 0;
      const text = await session.prompt(prompt, {
        grammar,
        maxTokens,
        temperature: 0.2,
        signal: controller.signal,
        onTextChunk: (chunk) => {
          produced += chunk.length;
          onProgress?.(produced);
        },
      });
      try {
        return grammar.parse(text);
      } catch {
        throw new UserError('format', 'L’IA a produit une réponse incomplète. Réessaie.');
      }
    } catch (err) {
      if (controller.signal.aborted) throw new UserError('aborted', 'Annulé.');
      throw err;
    } finally {
      running.delete(id);
      session?.dispose({ disposeSequence: true }); // frees the sequence for the next request
    }
  };
  const p = queue.then(run, run);
  queue = p.catch(() => {});
  return p;
}

/* ------------------------------------------------------------- prompts */

const DIAGRAM_KINDS = {
  mindmap: 'une carte mentale : "title" est le thème central ; chaque élément de "items" est une branche avec un "title" court et 2 ou 3 sous-idées très courtes dans "children" ; "text" vide. 4 à 6 branches.',
  timeline: 'une frise chronologique : chaque élément est un événement, "title" = la date, "text" = l’événement en quelques mots, "children" vide. 4 à 6 événements dans l’ordre.',
  steps: 'des étapes : chaque élément est une étape, "title" = nom court, "text" = une courte phrase, "children" vide. 3 à 5 étapes dans l’ordre.',
  cycle: 'un cycle : chaque élément est une phase qui mène à la suivante, "title" = nom court, "text" = quelques mots, "children" vide. 3 à 5 phases. "title" général = nom du cycle.',
  comparison: 'une comparaison : 2 ou 3 éléments (les colonnes), "title" = ce qui est comparé, "text" vide, "children" = 3 ou 4 points courts.',
  hierarchy: 'un organigramme : "title" = la racine ; chaque élément est une catégorie avec un "title" court et 1 à 3 sous-éléments dans "children" ; "text" vide. 2 à 4 catégories.',
  cards: 'des fiches de révision : chaque élément est une notion, "title" = la notion, "text" = sa définition en une phrase, "children" vide. 3 à 5 fiches.',
};

const DIAGRAM_SCHEMA = {
  type: 'object',
  properties: {
    title: { type: 'string', maxLength: 60 },
    items: {
      type: 'array',
      minItems: 2,
      maxItems: 6,
      items: {
        type: 'object',
        properties: {
          title: { type: 'string', minLength: 2, maxLength: 50 },
          text: { type: 'string', maxLength: 220 },
          children: { type: 'array', maxItems: 4, items: { type: 'string', maxLength: 60 } },
        },
      },
    },
  },
};

const CORRECTION_SCHEMA = {
  type: 'object',
  properties: {
    corrections: {
      type: 'array',
      maxItems: 12,
      items: {
        type: 'object',
        properties: {
          original: { type: 'string', maxLength: 40 },
          replacement: { type: 'string', maxLength: 40 },
          reason: { type: 'string', maxLength: 45 },
        },
      },
    },
  },
};

const CORRECTION_SYSTEM = `Tu es un correcteur d'orthographe et de grammaire française très prudent.
Tu ne signales que les fautes certaines : orthographe, accords, conjugaison, accents, homophones (a/à, et/est, ces/ses…).
Tu ne changes jamais le style, le sens, les noms propres, les formules ni les mots corrects.
"original" est copié exactement depuis le texte (le mot fautif, avec au plus un mot voisin). "replacement" est la version corrigée. "reason" nomme la règle en 3 à 6 mots.
Si le texte ne contient aucune faute, renvoie une liste vide.

Exemple.
Texte : « Les enfant joue dans le jardin. Il a manger une pomme et il est content. »
Réponse : {"corrections":[{"original":"Les enfant","replacement":"Les enfants","reason":"nom au pluriel après « les »"},{"original":"joue dans","replacement":"jouent dans","reason":"verbe accordé avec un sujet pluriel"},{"original":"a manger","replacement":"a mangé","reason":"participe passé après « avoir »"}]}
(« il est content » est correct : on ne le signale pas.)`;

const KEYWORDS_SCHEMA = {
  type: 'object',
  properties: { keywords: { type: 'array', minItems: 3, maxItems: 8, items: { type: 'string', maxLength: 24 } } },
};

/* ------------------------------------------------------- spell checker */

let speller = null;
let spellSeq = 0;
const spellWaiting = new Map();

function getSpeller() {
  if (speller) return speller;
  const { utilityProcess } = require('electron');
  speller = new Promise((resolve) => {
    const child = utilityProcess.fork(path.join(__dirname, 'spell.js'));
    child.on('message', (msg) => {
      if (msg.ready) return resolve(child);
      spellWaiting.get(msg.id)?.(msg.result);
      spellWaiting.delete(msg.id);
    });
    child.on('exit', () => (speller = null));
  });
  return speller;
}

async function checkWords(words, suggest = false) {
  const child = await getSpeller();
  const id = ++spellSeq;
  return new Promise((resolve) => {
    spellWaiting.set(id, resolve);
    child.postMessage({ id, words: [...new Set(words)], suggest });
  });
}

const ELISION = /^(?:l|d|j|m|n|s|t|c|qu|jusqu|lorsqu|puisqu|quoiqu)['’]/i;
const wordsOf = (text) => (text.match(/[\p{L}][\p{L}'’-]*/gu) || []).map((w) => w.replace(ELISION, '')).filter((w) => w.length > 1);

// Words the dictionary does not know, with its best suggestion.
async function spellingFixes(text) {
  const candidates = wordsOf(text).filter((w) => !/[A-Z]/.test(w.slice(1)) && !/^\p{Lu}/u.test(w)); // skip names and acronyms
  const result = await checkWords(candidates, true);
  const fixes = [];
  for (const [w, s] of Object.entries(result)) {
    if (s === true || !s) continue;
    fixes.push({ original: w, replacement: s, reason: 'mot mal orthographié', at: text.indexOf(w) });
  }
  return fixes;
}

// Split the text into chunks of whole lines so a small model stays accurate.
function chunks(text, size = 900) {
  const out = [];
  let cur = '';
  for (const line of text.split('\n')) {
    if (cur && cur.length + line.length > size) {
      out.push(cur);
      cur = '';
    }
    cur += (cur ? '\n' : '') + line;
  }
  if (cur.trim()) out.push(cur);
  return out;
}

function distance(a, b) {
  const d = Array.from({ length: a.length + 1 }, (_, i) => [i]);
  for (let j = 1; j <= b.length; j++) d[0][j] = j;
  for (let i = 1; i <= a.length; i++)
    for (let j = 1; j <= b.length; j++) d[i][j] = Math.min(d[i - 1][j] + 1, d[i][j - 1] + 1, d[i - 1][j - 1] + (a[i - 1] === b[j - 1] ? 0 : 1));
  return d[a.length][b.length];
}

// A real typo fix changes a few letters; anything else is the model rewriting.
function plausible(c, chunk) {
  const o = c.original?.trim();
  const r = c.replacement?.trim();
  if (!o || !r || o === r || !chunk.includes(o)) return false;
  // Word by word: a fix changes an ending or an accent, never a whole word (that would be a synonym).
  const ow = o.split(/\s+/);
  const rw = r.split(/\s+/);
  if (ow.length !== rw.length) return false;
  return ow.every((w, i) => distance(w.toLowerCase(), rw[i].toLowerCase()) <= Math.max(2, Math.ceil(w.length * 0.4)));
}

const VERDICT_SCHEMA = { type: 'object', properties: { answer: { enum: ['A', 'B'] } } };

// Asks the model which of two versions of the sentence is correct French.
async function confirms(id, text, fix, swap) {
  const sentence = text.split(/(?<=[.!?…])\s+/).find((s) => s.includes(fix.original)) || fix.original;
  const fixed = sentence.replace(fix.original, fix.replacement);
  const [a, b] = swap ? [fixed, sentence] : [sentence, fixed];
  const { answer } = await generate(id, {
    system: 'Tu es un professeur de français rigoureux.',
    prompt: `Laquelle de ces deux phrases est correctement écrite en français ?\nA : « ${a} »\nB : « ${b} »\nRéponds A ou B.`,
    schema: VERDICT_SCHEMA,
    maxTokens: 20,
  });
  return answer === (swap ? 'A' : 'B');
}

// Cuts an over-long text at a word boundary instead of mid-word.
function tidy(s, max) {
  s = s.trim();
  if (s.length < max - 1 || /[.!?…)»]$/.test(s)) return s;
  const cut = s.slice(0, s.lastIndexOf(' '));
  return cut.replace(/[,;:\s]+$/, '') + '…';
}

/* ------------------------------------------------------------------ ipc */

function handle(channel, fn) {
  ipcMain.handle(channel, async (e, ...args) => {
    try {
      return { ok: true, value: await fn(e, ...args) };
    } catch (err) {
      if (err instanceof UserError) return { ok: false, error: { code: err.code, message: err.message } };
      console.error('[llm]', err);
      const msg = String(err?.message || err);
      if (/memory|alloc/i.test(msg)) return { ok: false, error: { code: 'memory', message: 'Pas assez de mémoire pour l’IA. Essaie le modèle Léger dans les Paramètres.' } };
      return { ok: false, error: { code: 'unknown', message: 'L’IA a rencontré un problème. Réessaie.' } };
    }
  });
}

function register() {
  const progress = (e, id) => (n) => e.sender.send('llm:progress', { id, n });

  handle('llm:status', () => status());

  handle('llm:install', async (_e, id) => {
    if (!MODELS[id]) throw new UserError('format', 'Modèle inconnu.');
    if (download) throw new UserError('busy', 'Un téléchargement est déjà en cours.');
    fs.mkdirSync(MODELS_DIR, { recursive: true });
    const { createModelDownloader } = await getLib();
    const downloader = await createModelDownloader({
      modelUri: MODELS[id].uri,
      dirPath: MODELS_DIR,
      fileName: MODELS[id].file,
      deleteTempFileOnCancel: false, // a cancelled download resumes later
      onProgress: ({ totalSize, downloadedSize }) => {
        const percent = totalSize ? Math.floor((downloadedSize / totalSize) * 100) : 0;
        if (download && percent !== download.percent) {
          download.percent = percent;
          send();
        }
      },
    });
    download = { id, downloader, percent: 0 };
    send();
    try {
      await downloader.download();
      fs.writeFileSync(path.join(MODELS_DIR, 'choice.json'), JSON.stringify({ id }));
    } catch (err) {
      if (download?.cancelled) throw new UserError('aborted', 'Téléchargement mis en pause.');
      throw new UserError('network', 'Le téléchargement a échoué. Vérifie ta connexion Internet et réessaie : il reprendra où il s’est arrêté.');
    } finally {
      download = null;
      send();
    }
    return status();
  });

  handle('llm:cancelInstall', async () => {
    if (download) {
      download.cancelled = true;
      await download.downloader.cancel({ deleteTempFile: false });
    }
    return true;
  });

  handle('llm:use', (_e, id) => {
    if (!fs.existsSync(modelPath(id))) throw new UserError('no-model', 'Ce modèle n’est pas installé.');
    fs.writeFileSync(path.join(MODELS_DIR, 'choice.json'), JSON.stringify({ id }));
    unload();
    send();
    return status();
  });

  handle('llm:remove', async (_e, id) => {
    if (loaded?.id === id) await unload();
    fs.rmSync(modelPath(id), { force: true });
    send();
    return status();
  });

  handle('llm:cancel', (_e, id) => {
    running.get(id)?.abort();
    return true;
  });

  handle('llm:correct', async (e, id, text) => {
    const spelling = spellingFixes(text); // runs in parallel with the model
    const found = [];
    const parts = chunks(text);
    for (let i = 0; i < parts.length; i++) {
      e.sender.send('llm:progress', { id, step: i + 1, steps: parts.length });
      const { corrections = [] } = await generate(id, {
        system: CORRECTION_SYSTEM,
        prompt: `Texte à relire :\n"""\n${parts[i]}\n"""`,
        schema: CORRECTION_SCHEMA,
        maxTokens: 700,
      });
      for (const c of corrections) {
        if (plausible(c, parts[i]) && !found.some((f) => f.original === c.original.trim())) {
          found.push({ original: c.original.trim(), replacement: c.replacement.trim(), reason: c.reason?.trim() || 'Correction', at: text.indexOf(c.original.trim()) });
        }
      }
    }

    // The model sometimes "fixes" a word into one that does not exist: drop those.
    const verdict = await checkWords(found.flatMap((f) => wordsOf(f.replacement)));
    const real = found.filter((f) => wordsOf(f.replacement).every((w) => verdict[w] === true));

    // Second opinion: the model must pick the corrected sentence over the original one.
    const grammar = [];
    for (let i = 0; i < real.length; i++) {
      const f = real[i];
      e.sender.send('llm:progress', { id, verify: i + 1, verifies: real.length });
      if (await confirms(id, text, f, i % 2 === 1)) grammar.push(f);
    }

    // Dictionary fixes first; a model fix that covers the same word replaces it only if it adds grammar.
    const all = await spelling;
    for (const g of grammar) {
      const overlap = all.findIndex((s) => g.original.includes(s.original));
      if (overlap < 0) all.push(g);
      else if (g.replacement.includes(all[overlap].replacement)) all[overlap] = g;
    }
    return all.sort((a, b) => a.at - b.at).map(({ at, ...c }) => c);
  });

  handle('llm:diagram', async (e, id, { kind, request, context }) => {
    if (!request && !context?.trim()) throw new UserError('empty', 'Écris d’abord ton cours, ou décris le sujet du schéma.');
    const shape = DIAGRAM_KINDS[kind] || DIAGRAM_KINDS.cards;
    const prompt = [
      `Remplis ${shape}`,
      request ? `Sujet demandé : ${request}` : 'Sujet : les idées principales du cours ci-dessous.',
      context ? `Cours :\n"""\n${context.slice(0, 5000)}\n"""` : '',
      'Écris en français, des textes très courts, sans faute.',
      ['mindmap', 'comparison', 'hierarchy'].includes(kind)
        ? 'Exemple de format pour « le système solaire » : {"title":"Système solaire","items":[{"title":"Soleil","text":"","children":["Étoile","Source de lumière"]},{"title":"Planètes","text":"","children":["Terre","Mars"]}]}'
        : '',
    ]
      .filter(Boolean)
      .join('\n\n');
    // Kinds without bullet points get none; forcing them on small models produces noise.
    const schema = structuredClone(DIAGRAM_SCHEMA);
    if (!['mindmap', 'comparison', 'hierarchy'].includes(kind)) schema.properties.items.items.properties.children.maxItems = 0;
    const data = await generate(id, { system: 'Tu crées des schémas de révision clairs pour des élèves.', prompt, schema, onProgress: progress(e, id) });
    data.items = (data.items || []).map((it) => ({ title: it.title || '', text: tidy(it.text || '', 220), children: (it.children || []).map((c) => tidy(c, 60)) }));
    return data;
  });

  handle('llm:keywords', async (e, id, { request, context }) => {
    if (!request && !context?.trim()) throw new UserError('empty', 'Écris un mot dans la recherche, ou commence ton cours, pour que l’IA trouve des idées.');
    const prompt = [
      `Donne 6 objets concrets, faciles à dessiner, qui illustrent ${request ? `« ${request} »` : 'le cours ci-dessous'}. Un seul mot simple par objet, en français, au singulier.`,
      'Exemple : pour « le cycle de l’eau » → {"keywords":["nuage","pluie","soleil","mer","goutte","montagne"]}',
      'Exemple : pour « la Révolution française » → {"keywords":["drapeau","couronne","château","épée","livre","foule"]}',
      context && !request ? `Cours :\n"""\n${context.slice(0, 3000)}\n"""` : '',
    ]
      .filter(Boolean)
      .join('\n');
    const { keywords = [] } = await generate(id, { system: 'Tu aides à illustrer des cours.', prompt, schema: KEYWORDS_SCHEMA, maxTokens: 150, onProgress: progress(e, id) });
    return keywords;
  });
}

// The window receives status pushes (download progress, active model).
const setWindow = (w) => (win = w);

module.exports = { register, setWindow };
