// Répétition espacée façon Anki (SM-2 simplifié). Pur : aucune dépendance au DOM ni à l'heure système.

const DAY = 86400000;
export const GRADES = [
  { id: 0, label: 'À revoir', key: '1' },
  { id: 1, label: 'Difficile', key: '2' },
  { id: 2, label: 'Bien', key: '3' },
  { id: 3, label: 'Facile', key: '4' },
];

const startOfDay = (t) => {
  const d = new Date(t);
  d.setHours(0, 0, 0, 0);
  return d.getTime();
};

export const isNew = (st) => !st || !st.reps;

/** La carte est à réviser aujourd'hui (une carte jamais vue l'est toujours). */
export function isDue(st, now) {
  return isNew(st) || st.due <= startOfDay(now) + DAY - 1;
}

/** Nouvel état après une réponse. `interval` est en jours ; 0 = à revoir dans cette séance. */
export function review(st, grade, now) {
  const prev = st?.interval || 0;
  let ease = st?.ease || 2.5;
  let interval;
  if (grade === 0) {
    interval = 0;
    ease -= 0.2;
  } else if (grade === 1) {
    interval = Math.max(1, Math.round(prev * 1.2));
    ease -= 0.15;
  } else if (grade === 2) {
    interval = prev === 0 ? 1 : prev === 1 ? 3 : Math.round(prev * ease);
  } else {
    interval = prev === 0 ? 4 : Math.round(prev * ease * 1.3);
    ease += 0.15;
  }
  ease = Math.min(3, Math.max(1.3, ease));
  return {
    interval,
    ease: Math.round(ease * 100) / 100,
    reps: (st?.reps || 0) + 1,
    lapses: (st?.lapses || 0) + (grade === 0 && st?.reps ? 1 : 0),
    due: startOfDay(now) + interval * DAY,
    last: now,
  };
}

/** Libellé court de l'intervalle obtenu avec cette note (« 3 j », « 2 mois »). */
export function intervalLabel(st, grade, now) {
  const d = review(st, grade, now).interval;
  if (d === 0) return 'Maintenant';
  if (d < 30) return `${d} j`;
  if (d < 365) return `${Math.round(d / 30)} mois`;
  return `${Math.round((d / 365) * 10) / 10} an${d >= 730 ? 's' : ''}`;
}
