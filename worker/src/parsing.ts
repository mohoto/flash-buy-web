import Fuse from "fuse.js";

export type CatalogProduct = {
  id: string;
  name: string;
  priceCents: number;
  variants: { id: string; label: string }[];
};

const KEYWORDS = ["sold", "vendu"];
const SIZE_VOCAB = new Set([
  "xs", "s", "m", "l", "xl", "xxl", "xxxl", "unique", "u",
]);

const norm = (s: string) =>
  s
    .toLowerCase()
    .normalize("NFD")
    .replace(/[\u0300-\u036f]/g, "")
    .replace(/[^\p{L}\p{N}\s]/gu, " ")
    .replace(/\s+/g, " ")
    .trim();

const isInt = (t: string) => /^\d+$/.test(t);
const looksLikeSize = (t: string) =>
  SIZE_VOCAB.has(t) || (isInt(t) && +t >= 30 && +t <= 50);

export type ParsedSale = {
  isSale: boolean;
  rawProductText?: string;
  rawSizeText?: string | null;
  quantity: number;
  product?: CatalogProduct;
  variant?: { id: string; label: string };
  matchScore?: number;
  matched: boolean;
};

const MATCH_THRESHOLD = 0.6;

export function parseSaleComment(
  comment: string,
  catalog: CatalogProduct[]
): ParsedSale {
  const text = norm(comment);
  const kw = KEYWORDS.find((k) => text.startsWith(k + " "));
  if (!kw) return { isSale: false, quantity: 1, matched: false };

  const tokens = text.slice(kw.length).trim().split(" ").filter(Boolean);

  // 1) quantité = dernier token entier (absente => 1)
  let quantity = 1;
  if (tokens.length && isInt(tokens[tokens.length - 1])) {
    quantity = Math.max(1, Number.parseInt(tokens.pop()!, 10));
  }

  // 2) taille = token suivant s'il ressemble à une taille connue
  let rawSizeText: string | null = null;
  if (tokens.length && looksLikeSize(tokens[tokens.length - 1])) {
    rawSizeText = tokens.pop()!;
  }

  // 3) reste = nom du produit -> matching flou
  const rawProductText = tokens.join(" ").trim();
  if (!rawProductText) {
    return { isSale: true, quantity, rawSizeText, matched: false };
  }

  if (catalog.length === 0) {
    return { isSale: true, quantity, rawProductText, rawSizeText, matched: false };
  }

  const fuse = new Fuse(catalog, {
    keys: ["name"],
    includeScore: true,
    threshold: 0.4,
  });
  const hit = fuse.search(rawProductText)[0];
  const product = hit?.item;
  const matchScore = hit ? 1 - (hit.score ?? 1) : 0;

  // valide la taille contre les variantes réelles du produit trouvé
  let variant: { id: string; label: string } | undefined;
  let sizeOk = !rawSizeText;
  if (product && rawSizeText) {
    variant = product.variants.find((v) => norm(v.label) === norm(rawSizeText!));
    sizeOk = product.variants.length === 0 || !!variant;
  }

  const matched = !!product && matchScore >= MATCH_THRESHOLD && sizeOk;

  return {
    isSale: true,
    rawProductText,
    rawSizeText,
    quantity,
    product,
    variant,
    matchScore,
    matched,
  };
}
