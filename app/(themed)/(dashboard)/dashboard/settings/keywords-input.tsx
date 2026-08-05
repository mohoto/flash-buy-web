"use client";

import { useState } from "react";
import { X } from "lucide-react";
import { Input } from "@/components/ui/input";
import { Badge } from "@/components/ui/badge";

// Saisie de mots-clés sous forme de pills : chaque mot ajouté (Entrée ou
// virgule) devient un Badge supprimable, synchronisé avec un champ caché
// (name) soumis comme une chaîne "mot1, mot2" — updateSaleKeywords lit
// toujours sale_keywords de cette façon, un seul submit via le bouton
// "Enregistrer" du formulaire parent (pas de sauvegarde automatique).
export function KeywordsInput({
  id,
  name,
  defaultKeywords,
}: {
  id: string;
  name: string;
  defaultKeywords: string[];
}) {
  const [keywords, setKeywords] = useState<string[]>(defaultKeywords);
  const [draft, setDraft] = useState("");

  const addKeyword = (raw: string) => {
    const value = raw.trim().toLowerCase();
    if (!value) return;
    setKeywords((prev) => (prev.includes(value) ? prev : [...prev, value]));
    setDraft("");
  };

  const removeKeyword = (value: string) => {
    setKeywords((prev) => prev.filter((k) => k !== value));
  };

  return (
    <div className="flex flex-col gap-2">
      <input type="hidden" name={name} value={keywords.join(", ")} />
      <Input
        id={id}
        value={draft}
        onChange={(e) => setDraft(e.target.value)}
        onKeyDown={(e) => {
          if (e.key === "Enter" || e.key === ",") {
            e.preventDefault();
            addKeyword(draft);
          } else if (e.key === "Backspace" && draft === "" && keywords.length > 0) {
            removeKeyword(keywords[keywords.length - 1]);
          }
        }}
        onBlur={() => addKeyword(draft)}
        placeholder="jp"
      />
      {keywords.length > 0 && (
        <div className="flex flex-wrap gap-1.5">
          {keywords.map((keyword) => (
            <Badge key={keyword} variant="secondary" className="gap-1 pe-1">
              {keyword}
              <button
                type="button"
                onClick={() => removeKeyword(keyword)}
                aria-label={`Retirer ${keyword}`}
                className="flex size-3.5 items-center justify-center rounded-full hover:bg-foreground/10"
              >
                <X className="size-2.5" />
              </button>
            </Badge>
          ))}
        </div>
      )}
    </div>
  );
}
