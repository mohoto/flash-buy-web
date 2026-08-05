"use client";

import { useEffect, useState } from "react";
import { AnimatePresence, motion } from "motion/react";
import { createClient } from "@/lib/supabase/client";
import { Avatar, AvatarImage, AvatarFallback } from "@/components/ui/avatar";
import { Input } from "@/components/ui/input";
import { ScrollArea } from "@/components/ui/scroll-area";
import { Empty, EmptyHeader, EmptyTitle, EmptyDescription } from "@/components/ui/empty";
import { cn } from "@/lib/utils";

type RawComment = {
  id: string;
  username: string;
  nickname: string | null;
  profilePictureUrl: string | null;
  text: string;
  createdAt: string;
};

const MAX_COMMENTS = 200;

const listItemMotion = {
  initial: { scale: 0.96, opacity: 0 },
  animate: { scale: 1, opacity: 1 },
  exit: { scale: 0.96, opacity: 0 },
  transition: { type: "spring" as const, stiffness: 350, damping: 40 },
};

// Palette de pseudos façon TikTok LIVE : chaque pseudo garde toujours la
// même couleur (hash stable), pour repérer un spectateur au fil du flux sans
// avatar ni carte séparée.
const USERNAME_COLORS = [
  "text-rose-400",
  "text-amber-400",
  "text-emerald-400",
  "text-sky-400",
  "text-violet-400",
  "text-pink-400",
  "text-orange-400",
  "text-teal-400",
];

function usernameColor(username: string): string {
  let hash = 0;
  for (let i = 0; i < username.length; i++) {
    hash = (hash * 31 + username.charCodeAt(i)) | 0;
  }
  return USERNAME_COLORS[Math.abs(hash) % USERNAME_COLORS.length];
}

// Flux brut de TOUS les commentaires du live, sans filtre sur le mot-clé de
// vente : diffusé par le worker en Realtime broadcast (worker/src/live-session.ts
// broadcastComment), jamais persisté en base. Purement éphémère : ce composant
// ne voit que ce qui arrive après son montage, rien avant, rien après un
// rechargement de page.
export function LiveCommentsFeed({ liveId }: { liveId: string }) {
  const [comments, setComments] = useState<RawComment[]>([]);
  const [search, setSearch] = useState("");

  useEffect(() => {
    const supabase = createClient();

    const channel = supabase
      .channel(`live-comments-${liveId}`)
      .on("broadcast", { event: "comment" }, ({ payload }) => {
        const raw = payload as Omit<RawComment, "id">;
        const comment: RawComment = {
          id: `${raw.createdAt}-${raw.username}-${Math.random().toString(36).slice(2)}`,
          ...raw,
        };
        setComments((prev) => [comment, ...prev].slice(0, MAX_COMMENTS));
      })
      .subscribe();

    return () => {
      supabase.removeChannel(channel);
    };
  }, [liveId]);

  if (comments.length === 0) {
    return (
      <Empty className="rounded-xl border py-10">
        <EmptyHeader>
          <EmptyTitle>En attente de commentaires</EmptyTitle>
          <EmptyDescription>
            Les commentaires du live s&apos;afficheront ici au fur et à mesure.
          </EmptyDescription>
        </EmptyHeader>
      </Empty>
    );
  }

  // Nombre de spectateurs actifs = pseudos distincts ayant posté depuis le
  // montage de ce composant (même flux éphémère que la liste ci-dessous,
  // rien de persisté).
  const uniqueViewerCount = new Set(comments.map((comment) => comment.username)).size;

  const normalizedSearch = search.trim().toLowerCase();
  const filteredComments = normalizedSearch
    ? comments.filter(
        (comment) =>
          comment.username.toLowerCase().includes(normalizedSearch) ||
          (comment.nickname?.toLowerCase().includes(normalizedSearch) ?? false)
      )
    : comments;

  return (
    <div className="flex h-full flex-col gap-3">
      <Input
        value={search}
        onChange={(e) => setSearch(e.target.value)}
        placeholder="Rechercher un pseudo ou un username…"
        className="w-full shrink-0"
      />

      <p className="shrink-0 text-sm font-medium text-foreground">
        Spectateurs actifs <span className="font-normal text-muted-foreground">· {uniqueViewerCount}</span>
      </p>
      <ScrollArea className="h-full rounded-xl border bg-card" scrollFade>
        <ul className="flex flex-col gap-2.5 px-3 py-3">
          <AnimatePresence initial={false}>
            {filteredComments.map((comment) => (
              <motion.li
                key={comment.id}
                layout
                {...listItemMotion}
                className="flex list-none items-start gap-2"
              >
                <Avatar className="size-6 shrink-0">
                  <AvatarImage src={comment.profilePictureUrl ?? undefined} alt={comment.username} />
                  <AvatarFallback className="text-[10px]">
                    {comment.username.slice(0, 2).toUpperCase()}
                  </AvatarFallback>
                </Avatar>
                <p className="min-w-0 text-[15px] leading-snug text-foreground">
                  <span className={cn("font-medium", usernameColor(comment.username))}>
                    {comment.nickname || comment.username}
                  </span>{" "}
                  {comment.text}
                </p>
              </motion.li>
            ))}
          </AnimatePresence>
        </ul>
      </ScrollArea>
    </div>
  );
}
