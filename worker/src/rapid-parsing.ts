import { norm, isInt } from "./text-normalize.js";
import { SIZE_DICTIONARY, COLOR_DICTIONARY } from "./rapid-dictionary.js";

export type ActiveRapidProduct = {
  id: string;
  name: string;
  priceCents: number;
  internalRef: string;
  hasColor: boolean;
  hasSize: boolean;
};

export type RapidParseResult = {
  quantity: number;
  colorToken: string | null;
  sizeToken: string | null;
  ignoredNameToken: string | null;
  state: "auto" | "needs_correction";
  reason?:
    | "missing_size"
    | "missing_color"
    | "unrecognized_token"
    | "color_not_expected"
    | "ambiguous_numeric_size"
    | "no_active_product";
};

// Voie rapide (regex + dictionnaire), synchrone et gratuite : couvre la
// grande majorité des "jp" sans jamais appeler de LLM. Résout les tokens
// contre les DIMENSIONS DU PRODUIT ACTIF (has_color/has_size), ce qui lève
// la plupart des ambiguïtés (cf. tableau de référence côté produit) :
// "jp L" sur un produit sans couleur => L est forcément une taille ; "jp
// choco" sur un produit sans taille => choco est forcément la couleur.
export function parseRapidComment(
  text: string,
  activeProduct: ActiveRapidProduct | null,
  jpKeywords: string[]
): RapidParseResult | null {
  const normalized = norm(text);
  const keywords = jpKeywords.length > 0 ? jpKeywords : ["jp"];
  const normalizedKeywords = keywords.map(norm);

  const words = normalized.split(" ").filter(Boolean);
  const kwIndex = words.findIndex((w) => normalizedKeywords.some((k) => w.endsWith(k)));
  if (kwIndex === -1) return null;

  const tokens = words.slice(kwIndex + 1);

  if (!activeProduct) {
    return {
      quantity: 1,
      colorToken: null,
      sizeToken: null,
      ignoredNameToken: null,
      state: "needs_correction",
      reason: "no_active_product",
    };
  }

  let quantity: number | null = null;
  let sizeToken: string | null = null;
  let colorToken: string | null = null;
  let ignoredNameToken: string | null = null;
  let unrecognizedToken = false;
  let ambiguousNumericSize = false;

  for (const token of tokens) {
    if (isInt(token)) {
      // Un seul nombre entier attendu par commentaire = la quantité (voir
      // note ci-dessous pour les tailles chiffrées, jamais déduites ici).
      if (quantity === null) {
        quantity = Math.max(1, Number.parseInt(token, 10));
      } else {
        // Deuxième nombre : impossible à trancher sans hypothèse
        // supplémentaire (pourrait être une taille chiffrée, ex. pointure) —
        // signalé plutôt que silencieusement écrasé.
        ambiguousNumericSize = true;
      }
      continue;
    }

    if (SIZE_DICTIONARY.has(token)) {
      sizeToken = token.toUpperCase();
      continue;
    }

    if (COLOR_DICTIONARY.has(token)) {
      colorToken = COLOR_DICTIONARY.get(token)!;
      continue;
    }

    // Ni nombre, ni taille, ni couleur connue : probablement le nom du
    // produit dans le commentaire ("jp robe 2 rouge L") — jamais utilisé
    // pour chercher un AUTRE produit (il n'y a qu'un produit actif en mode
    // rapid), seulement affiché à titre de confirmation. Un seul token de ce
    // type est attendu ; un deuxième déclenche needs_correction.
    if (ignoredNameToken === null) {
      ignoredNameToken = token;
    } else {
      unrecognizedToken = true;
    }
  }

  const result: RapidParseResult = {
    quantity: quantity ?? 1,
    colorToken,
    sizeToken,
    ignoredNameToken,
    state: "auto",
  };

  // Tailles chiffrées (pointures…) : ambiguës avec la quantité, toujours
  // envoyées en correction manuelle pour cette version (cf. plan — pas de
  // size_kind sur live_products, on garde la barre de création simple).
  if (ambiguousNumericSize) {
    return { ...result, state: "needs_correction", reason: "ambiguous_numeric_size" };
  }

  if (unrecognizedToken) {
    return { ...result, state: "needs_correction", reason: "unrecognized_token" };
  }

  if (colorToken && !activeProduct.hasColor) {
    // Couleur reconnue sur un produit qui n'en a pas : peut viser un autre
    // produit (retiré) — signalé plutôt que silencieusement ignoré.
    return { ...result, state: "needs_correction", reason: "color_not_expected" };
  }

  if (activeProduct.hasColor && !colorToken) {
    return { ...result, state: "needs_correction", reason: "missing_color" };
  }

  if (activeProduct.hasSize && !sizeToken) {
    return { ...result, state: "needs_correction", reason: "missing_size" };
  }

  return result;
}

// Voie lente (LLM, par lots, jamais par commentaire) : seam pour un futur
// appel réel (Claude Haiku / GPT-4o mini). Pour cette passe, ne résout
// jamais rien — tout ce que la voie rapide ne peut pas trancher part donc en
// "à corriger", jamais en "ia" (cf. plan section "Extraction jp — deux
// vitesses"). Brancher un vrai appel ici suffira à activer l'état "IA" côté
// UI, sans changement de schéma.
export type AmbiguousRapidComment = {
  id: string;
  sourceComment: string;
  activeProduct: ActiveRapidProduct | null;
};

export type RapidResolution = {
  id: string;
  resolved: false;
};

export async function resolveAmbiguousComments(
  batch: AmbiguousRapidComment[]
): Promise<RapidResolution[]> {
  return batch.map((item) => ({ id: item.id, resolved: false }));
}
