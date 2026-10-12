'use strict';

// French spell checker (Hunspell dictionary), run in an Electron utility process
// because building the dictionary takes a few seconds of CPU.

const fs = require('fs');
const path = require('path');
const nspell = require('nspell');

const dir = path.join(__dirname, '..', 'node_modules', 'dictionary-fr');
const spell = nspell(fs.readFileSync(path.join(dir, 'index.aff')), fs.readFileSync(path.join(dir, 'index.dic')));

const known = (w) => spell.correct(w) || spell.correct(w.toLowerCase());

process.parentPort.on('message', ({ data }) => {
  const { id, words, suggest } = data;
  const result = {};
  for (const w of words) {
    if (known(w)) result[w] = true;
    else result[w] = suggest ? spell.suggest(w.toLowerCase())[0] || null : false;
  }
  process.parentPort.postMessage({ id, result });
});

process.parentPort.postMessage({ ready: true });
