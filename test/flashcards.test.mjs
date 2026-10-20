import { test } from 'node:test';
import assert from 'node:assert/strict';
import { review, isDue, isNew, intervalLabel } from '../src/renderer/srs.js';
import { splitCard, cardId } from '../src/renderer/cards.js';

const NOW = new Date(2026, 9, 20, 15, 0).getTime();
const DAY = 86400000;

test('une carte jamais vue est à réviser', () => {
  assert.ok(isNew(undefined));
  assert.ok(isDue(undefined, NOW));
});

test('les intervalles grandissent avec « Bien »', () => {
  let st = review(undefined, 2, NOW);
  assert.equal(st.interval, 1);
  st = review(st, 2, NOW + DAY);
  assert.equal(st.interval, 3);
  st = review(st, 2, NOW + 4 * DAY);
  assert.equal(st.interval, Math.round(3 * 2.5));
});

test('« À revoir » remet la carte dans la séance et baisse la facilité', () => {
  const learned = review(review(undefined, 2, NOW), 2, NOW);
  const st = review(learned, 0, NOW);
  assert.equal(st.interval, 0);
  assert.equal(st.lapses, 1);
  assert.ok(st.ease < learned.ease);
  assert.ok(isDue(st, NOW));
});

test('« Facile » va plus loin que « Bien », la facilité reste bornée', () => {
  assert.ok(review(undefined, 3, NOW).interval > review(undefined, 2, NOW).interval);
  let st;
  for (let i = 0; i < 20; i++) st = review(st, 0, NOW);
  assert.equal(st.ease, 1.3);
});

test('une carte révisée hier pour dans 3 jours n’est pas à revoir aujourd’hui', () => {
  const st = review(review(undefined, 2, NOW - DAY), 2, NOW - DAY);
  assert.ok(!isDue(st, NOW));
  assert.ok(isDue(st, NOW + 3 * DAY));
});

test('libellés d’intervalle', () => {
  assert.equal(intervalLabel(undefined, 0, NOW), 'Maintenant');
  assert.equal(intervalLabel(undefined, 2, NOW), '1 j');
  assert.equal(intervalLabel({ interval: 60, ease: 2.5, reps: 5 }, 2, NOW), '5 mois');
});

const P = (text, lead = '') => ({ text, html: `<p>${text}</p>`, lead });

test('découpage : plusieurs blocs → premier bloc = question', () => {
  const c = splitCard([P('Dérivée'), P('Limite du taux d’accroissement.')], 'definition', 'Analyse');
  assert.equal(c.front, 'Dérivée');
  assert.equal(c.back, '<p>Limite du taux d’accroissement.</p>');
});

test('découpage : début en gras → le gras est la question', () => {
  const c = splitCard([P('Dérivée : limite du taux.', 'Dérivée :')], 'definition', 'Analyse');
  assert.equal(c.front, 'Dérivée');
  assert.equal(c.back, '<p>Limite du taux.</p>');
});

test('découpage : une étiquette en gras (« Définition : ») n’est pas la question', () => {
  const c = splitCard([P('Définition : Dérivée : limite du taux.', 'Définition :')], 'definition', 'Analyse');
  assert.equal(c.front, 'Dérivée');
  const r = splitCard([P('Rappel : toujours vérifier les unités.', 'Rappel :')], 'tip', 'Physique');
  assert.ok(r.recall);
});

test('découpage : « terme : explication »', () => {
  const c = splitCard([P('Photosynthèse : production de glucose par la lumière.')], 'tip', 'SVT');
  assert.equal(c.front, 'Photosynthèse');
  assert.match(c.back, /Production de glucose/);
});

test('découpage : `skip` pointe exactement sur le début de la réponse (pour garder les formules)', () => {
  const cases = [
    ['Dérivée : limite du taux.', 'Dérivée :'],
    ['Définition : Dérivée : limite du taux.', 'Définition :'],
    ['  Photosynthèse — production de glucose.', ''],
  ];
  for (const [text, lead] of cases) {
    const c = splitCard([P(text, lead)], 'definition', 'X');
    assert.equal(text.slice(c.skip).toLowerCase(), c.back.replace(/<\/?p>/g, '').toLowerCase(), text);
  }
});

test('découpage : sans terme identifiable → carte de restitution', () => {
  const c = splitCard([P('Toujours vérifier les unités avant de conclure.')], 'tip', 'Physique');
  assert.ok(c.recall);
  assert.equal(c.front, 'À retenir · Physique');
});

test('découpage : encadré vide → pas de carte', () => {
  assert.equal(splitCard([P('   ')], 'tip', 'X'), null);
  assert.equal(splitCard([], 'tip', 'X'), null);
});

test('identifiant stable, insensible à la casse et aux espaces', () => {
  assert.equal(cardId('definition', 'Dérivée'), cardId('definition', '  dérivée '));
  assert.notEqual(cardId('definition', 'Dérivée'), cardId('tip', 'Dérivée'));
});

test('le texte de la réponse est échappé', () => {
  const c = splitCard([P('Balise : <script>x</script>')], 'definition', 'Web');
  assert.ok(!c.back.includes('<script>'));
});
