"use client";

import { useEffect, useState } from "react";
import { AnimatePresence, motion } from "motion/react";
import { createClient } from "@/lib/supabase/client";
import { Avatar, AvatarImage, AvatarFallback } from "@/components/ui/avatar";

type Commenter = {
  id: string;
  tiktok_user_id: string;
  tiktok_username: string;
  nickname: string | null;
  profile_picture_url: string | null;
};

const listItemMotion = {
  initial: { scale: 0.9, opacity: 0 },
  animate: { scale: 1, opacity: 1 },
  exit: { scale: 0.9, opacity: 0 },
  transition: { type: "spring" as const, stiffness: 350, damping: 40 },
};

export function LiveViewersPanel({
  liveId,
  initialCommenters,
  initialViewerCount,
}: {
  liveId: string;
  initialCommenters: Commenter[];
  initialViewerCount: number | null;
}) {
  const [commenters, setCommenters] = useState(initialCommenters);
  const [viewerCount, setViewerCount] = useState(initialViewerCount);

  useEffect(() => {
    const supabase = createClient();

    const refetchCommenters = async () => {
      const { data } = await supabase
        .from("live_viewers")
        .select("id, tiktok_user_id, tiktok_username, nickname, profile_picture_url")
        .eq("live_id", liveId)
        .order("last_comment_at", { ascending: false });

      if (data) setCommenters(data);
    };

    const channel = supabase
      .channel(`live-viewers-${liveId}`)
      .on(
        "postgres_changes",
        { event: "*", schema: "public", table: "live_viewers", filter: `live_id=eq.${liveId}` },
        refetchCommenters
      )
      .on(
        "postgres_changes",
        { event: "UPDATE", schema: "public", table: "lives", filter: `id=eq.${liveId}` },
        (payload) => {
          const next = (payload.new as { viewer_count: number | null }).viewer_count;
          setViewerCount(next);
        }
      )
      .subscribe();

    return () => {
      supabase.removeChannel(channel);
    };
  }, [liveId]);

  return (
    <div className="flex flex-col gap-3">
      <div className="flex items-center justify-between">
        <p className="text-sm font-medium text-foreground">Spectateurs</p>
        <span className="text-xs tabular-nums text-muted-foreground">
          {viewerCount !== null ? `${viewerCount} présents` : "—"}
        </span>
      </div>

      <div>
        <p className="text-xs font-medium uppercase tracking-wide text-muted-foreground">
          Actifs ({commenters.length})
        </p>
        {commenters.length === 0 ? (
          <p className="mt-2 text-sm text-muted-foreground">
            Personne n&apos;a encore commenté.
          </p>
        ) : (
          <ul className="mt-2 flex flex-col gap-2">
            <AnimatePresence initial={false}>
              {commenters.map((commenter) => (
                <motion.li
                  key={commenter.id}
                  layout
                  {...listItemMotion}
                  className="flex items-center gap-2 list-none"
                >
                  <Avatar>
                    <AvatarImage
                      src={commenter.profile_picture_url ?? undefined}
                      alt={commenter.tiktok_username}
                    />
                    <AvatarFallback>
                      {commenter.tiktok_username.slice(0, 2).toUpperCase()}
                    </AvatarFallback>
                  </Avatar>
                  <div className="min-w-0">
                    <p className="truncate text-sm text-foreground">
                      {commenter.nickname || commenter.tiktok_username}
                    </p>
                    <p className="truncate text-xs text-muted-foreground">
                      @{commenter.tiktok_username}
                    </p>
                  </div>
                </motion.li>
              ))}
            </AnimatePresence>
          </ul>
        )}
      </div>
    </div>
  );
}
