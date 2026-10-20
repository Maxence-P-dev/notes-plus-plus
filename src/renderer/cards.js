// Transforme les encadrés « Définition » et « À retenir » des cours en flashcards.

export const CARD_KINDS = { definition: 'Définition', tip: 'À retenir' };

const clean = (s) => s.replace(/\s+/g, ' ').trim();
const cap = (s) => s.charAt(0).toLocaleUpperCase('fr') + s.slice(1);
// Étiquettes qu'on met souvent en gras en tête d'encadré : ce ne sont pas des termes à apprendre.
const LABELS = /^(définition|à retenir|a retenir|rappel|remarque|astuce|attention|important|note|exemple|propriété|théorème|formule)\s*[:—–-]?\s*/i;

/** Identifiant stable : dépend de la question seulement, pour garder la progression si la réponse ou le cours change. */
export function cardId(kind, front) {
  let h = 2166136261;
  for (const c of `${kind}|${clean(front).toLowerCase()}`) h = Math.imul(h ^ c.codePointAt(0), 16777619);
  return (h >>> 0).toString(36);
}

/**
 * Découpe un encadré en question / réponse. `blocks` = [{ text, html, lead }] où `lead` est le texte
 * en gras au début du bloc. Ordre de préférence :
 *   1. plusieurs blocs → le premier est la question, le reste la réponse ;
 *   2. un début en gras (« **Dérivée** : … ») → le gras est la question ;
 *   3. « terme : explication » ou « terme — explication » → coupe au premier séparateur ;
 *   4. sinon la carte demande de restituer tout l'encadré.
 */
export function splitCard(blocks, kind, courseName) {
  const first = blocks[0];
  if (!first || !clean(blocks.map((b) => b.text).join(' '))) return null;
  if (blocks.length > 1 && clean(first.text)) {
    return { front: clean(first.text), back: blocks.slice(1).map((b) => b.html).join('') };
  }
  // On travaille sur le texte brut pour connaître `skip` : le nombre de caractères occupés par la question,
  // ce qui permet ensuite de découper le HTML (formules, gras, couleurs gardés dans la réponse).
  const raw = first.text;
  let offset = raw.length - raw.trimStart().length;
  let text = raw.slice(offset);
  let lead = clean(first.lead || '').replace(/\s*[:—–-]\s*$/, '');
  if (lead && LABELS.test(lead + ' ') && lead.replace(LABELS, '') === '') {
    const label = text.match(LABELS)?.[0] || '';
    offset += label.length;
    text = text.slice(label.length);
    lead = '';
  }
  const i = lead ? text.indexOf(lead) : -1;
  if (i >= 0 && lead.length < clean(text).length - 2) {
    const after = text.slice(i + lead.length);
    const sep = after.match(/^\s*[:—–-]?\s*/)[0];
    const rest = clean(after.slice(sep.length));
    if (rest) return { front: lead, back: `<p>${escapeHtml(cap(rest))}</p>`, skip: offset + i + lead.length + sep.length };
  }
  const m = text.match(/^(.{2,80}?)\s+[:—–]\s+(.+)$/);
  if (m) return { front: clean(m[1]), back: `<p>${escapeHtml(cap(clean(m[2])))}</p>`, skip: offset + m[0].length - m[2].length };
  return { front: `${CARD_KINDS[kind]} · ${courseName}`, back: first.html, recall: true };
}

/** HTML du bloc privé de ses `n` premiers caractères de texte (une formule compte pour son LaTeX). */
function htmlAfter(block, n) {
  const clone = block.cloneNode(true);
  const drop = (node) => {
    for (const child of [...node.childNodes]) {
      if (n <= 0) return;
      const len = child.textContent.length;
      const atomic = child.nodeType === 1 && /-math$/.test(child.dataset?.type || '');
      if (len <= n) {
        child.remove();
        n -= len;
      } else if (child.nodeType === 3) {
        child.data = child.data.slice(n);
        n = 0;
      } else if (atomic) {
        n = 0; // on ne coupe jamais une formule en deux
      } else {
        drop(child);
      }
    }
  };
  drop(clone);
  // Majuscule au premier mot de la réponse.
  const walker = clone.ownerDocument.createTreeWalker(clone, 4);
  for (let t = walker.nextNode(); t; t = walker.nextNode()) {
    if (t.parentElement?.closest('[data-type$="-math"]')) break;
    if (t.data.trim()) {
      t.data = t.data.replace(/^(\s*)(\S)/, (_m, s, c) => s + c.toLocaleUpperCase('fr'));
      break;
    }
  }
  return clone.outerHTML;
}

export function escapeHtml(s) {
  return s.replace(/[&<>"]/g, (c) => ({ '&': '&amp;', '<': '&lt;', '>': '&gt;', '"': '&quot;' })[c]);
}

/** Extrait les cartes d'un fichier `.cours` (HTML). Le DOM n'est utilisé que pour lire, rien n'est exécuté. */
export function extractCards(html, path, courseName) {
  const doc = new DOMParser().parseFromString(html, 'text/html');
  for (const m of doc.querySelectorAll('[data-type="inline-math"], [data-type="block-math"]')) m.textContent = m.dataset.latex || '';
  const out = [];
  for (const el of doc.querySelectorAll('div[data-callout="definition"], div[data-callout="tip"]')) {
    const kind = el.dataset.callout;
    const blocks = [...el.children].map((b) => {
      // Le bloc commence directement par du gras : c'est le terme défini.
      const boldFirst = b.firstChild && b.firstChild === b.firstElementChild && b.firstElementChild.matches('strong, b');
      return { text: b.textContent, html: b.outerHTML, lead: boldFirst ? b.firstElementChild.textContent : '' };
    });
    const card = splitCard(blocks, kind, courseName);
    if (!card) continue;
    // Réponse découpée dans le vrai HTML : les formules et la mise en forme restent intactes.
    if (card.skip != null) card.back = htmlAfter(el.children[0], card.skip);
    out.push({ ...card, id: cardId(kind, card.recall ? card.back : card.front), kind, path, course: courseName });
  }
  return out;
}

/** Copie de la réponse sans rien d'exécutable (le contenu vient des fichiers de l'utilisateur, on reste prudent). */
export function safeFragment(html) {
  const tpl = document.createElement('template');
  tpl.innerHTML = html;
  for (const el of tpl.content.querySelectorAll('script, iframe, object, embed, link, meta, style')) el.remove();
  for (const el of tpl.content.querySelectorAll('*')) {
    for (const a of [...el.attributes]) {
      if (/^on/i.test(a.name) || /^\s*javascript:/i.test(a.value)) el.removeAttribute(a.name);
    }
  }
  return tpl.content;
}
