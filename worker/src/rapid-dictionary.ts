// Mode "rapid" : vocabulaire taille/couleur pour résoudre un "jp" contre le
// produit actif sans jamais appeler de LLM pour les cas courants (cf.
// worker/src/rapid-parsing.ts). Volontairement généreux et incluant les
// abréviations/surnoms courants côté vente en live (mode, chaussures,
// gourmandises) — étendre cette liste ne change aucun autre fichier.

export const SIZE_DICTIONARY = new Set([
  "xs", "s", "m", "l", "xl", "xxl", "xxxl", "unique", "u",
]);

// clé = forme normalisée détectée dans le commentaire, valeur = couleur canonique affichée.
export const COLOR_DICTIONARY = new Map<string, string>([
  ["noir", "noir"],
  ["blanc", "blanc"],
  ["gris", "gris"],
  ["rouge", "rouge"],
  ["bordeaux", "bordeaux"],
  ["rose", "rose"],
  ["fuchsia", "fuchsia"],
  ["orange", "orange"],
  ["jaune", "jaune"],
  ["moutarde", "moutarde"],
  ["vert", "vert"],
  ["kaki", "kaki"],
  ["bleu", "bleu"],
  ["marine", "marine"],
  ["turquoise", "turquoise"],
  ["violet", "violet"],
  ["mauve", "mauve"],
  ["marron", "marron"],
  ["camel", "camel"],
  ["taupe", "taupe"],
  ["beige", "beige"],
  ["bcg", "beige"],
  ["nude", "nude"],
  ["chocolat", "chocolat"],
  ["choco", "chocolat"],
  ["creme", "crème"],
  ["ivoire", "ivoire"],
  ["dore", "doré"],
  ["or", "doré"],
  ["argente", "argenté"],
  ["argent", "argenté"],
  ["abricot", "abricot"],
  ["pomme", "pomme"],
  ["framboise", "framboise"],
  ["lavande", "lavande"],
  ["corail", "corail"],
]);
