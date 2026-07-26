"use client";

import { useEffect, useState } from "react";
import { AnimatePresence, motion } from "motion/react";
import { createClient } from "@/lib/supabase/client";
import { Avatar, AvatarImage, AvatarFallback } from "@/components/ui/avatar";
import { Card, CardContent } from "@/components/ui/card";
import { ScrollArea } from "@/components/ui/scroll-area";
import { Empty, EmptyHeader, EmptyTitle, EmptyDescription } from "@/components/ui/empty";

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

// Flux brut de TOUS les commentaires du live, sans filtre sur le mot-clé de
// vente : diffusé par le worker en Realtime broadcast (worker/src/live-session.ts
// broadcastComment), jamais persisté en base. Purement éphémère : ce composant
// ne voit que ce qui arrive après son montage, rien avant, rien après un
// rechargement de page.
export function LiveCommentsFeed({ liveId }: { liveId: string }) {
  const [comments, setComments] = useState<RawComment[]>([]);

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

  return (
    <ScrollArea className="h-full" scrollFade>
      <ul className="flex flex-col gap-2 pr-1">
        <AnimatePresence initial={false}>
          {comments.map((comment) => (
            <motion.li key={comment.id} layout {...listItemMotion} className="list-none">
              <Card>
                <CardContent className="flex items-start gap-2 px-3 py-3">
                  <Avatar className="size-6 shrink-0">
                    <AvatarImage
                      src={comment.profilePictureUrl ?? undefined}
                      alt={comment.username}
                    />
                    <AvatarFallback className="text-[10px]">
                      {comment.username.slice(0, 2).toUpperCase()}
                    </AvatarFallback>
                  </Avatar>
                  <p className="min-w-0 text-sm text-muted-foreground">
                    <span className="font-medium text-foreground">
                      {comment.nickname || comment.username}
                    </span>{" "}
                    {comment.text}
                  </p>
                </CardContent>
              </Card>
            </motion.li>
          ))}
        </AnimatePresence>
      </ul>
    </ScrollArea>
  );
}
