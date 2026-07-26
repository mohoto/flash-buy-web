const COMBINING_DIACRITICS = /[̀-ͯ]/g;

export const norm = (s: string) =>
  s
    .toLowerCase()
    .normalize("NFD")
    .replace(COMBINING_DIACRITICS, "")
    .replace(/[^\p{L}\p{N}\s]/gu, " ")
    .replace(/\s+/g, " ")
    .trim();

export const isInt = (t: string) => /^\d+$/.test(t);
