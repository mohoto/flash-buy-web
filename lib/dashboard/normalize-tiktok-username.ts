// Nettoie un pseudo TikTok saisi librement par le vendeur (ex. collé depuis
// une URL "tiktok.com/@pseudo/live", ou avec un "@" ou un "/" de fin) — sans
// ça, Euler renvoie close_4400 (INVALID_OPTIONS) en boucle, jamais résolu
// par un retry (cf. worker/src/euler.ts normalizeTiktokUsername, dupliqué
// ici car le worker est un package Node séparé, sans dépendance partagée
// avec ce projet Next.js). Garder les deux implémentations alignées si l'une
// change.
export function normalizeTiktokUsername(raw: string): string {
  let value = raw.trim();

  // URL TikTok complète ("https://www.tiktok.com/@pseudo/live" ou variantes)
  // -> ne garde que le segment @pseudo.
  const urlMatch = /tiktok\.com\/@([^/?#]+)/i.exec(value);
  if (urlMatch) {
    value = urlMatch[1];
  }

  return value.replace(/^@+/, "").replace(/\/+$/, "").trim();
}
