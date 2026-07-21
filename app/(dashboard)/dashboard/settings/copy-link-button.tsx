"use client";

import { useState } from "react";

export function CopyLinkButton({ link }: { link: string }) {
  const [copied, setCopied] = useState(false);

  return (
    <button
      type="button"
      onClick={async () => {
        await navigator.clipboard.writeText(link);
        setCopied(true);
        setTimeout(() => setCopied(false), 2000);
      }}
      className="rounded-md bg-zinc-100 px-3 py-2 text-sm font-medium text-zinc-950 hover:bg-zinc-200 dark:bg-zinc-800 dark:text-zinc-50"
    >
      {copied ? "Copié !" : "Copier"}
    </button>
  );
}
