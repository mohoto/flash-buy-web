"use client";

import { useEffect, useState } from "react";
import { AnimatePresence, motion } from "motion/react";
import { createClient } from "@/lib/supabase/client";
import { Card, CardContent } from "@/components/ui/card";

type Viewer = {
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
  initialViewers,
}: {
  liveId: string;
  initialViewers: Viewer[];
}) {
  const [viewers, setViewers] = useState(initialViewers);

  useEffect(() => {
    const supabase = createClient();

    const refetch = async () => {
      const { data } = await supabase
        .from("live_viewers")
        .select("id, tiktok_user_id, tiktok_username, nickname, profile_picture_url")
        .eq("live_id", liveId)
        .order("joined_at", { ascending: false });

      if (data) setViewers(data);
    };

    const channel = supabase
      .channel(`live-viewers-${liveId}`)
      .on(
        "postgres_changes",
        { event: "*", schema: "public", table: "live_viewers", filter: `live_id=eq.${liveId}` },
        refetch
      )
      .subscribe();

    return () => {
      supabase.removeChannel(channel);
    };
  }, [liveId]);

  return (
    <Card>
      <CardContent className="flex flex-col gap-3">
        <div className="flex items-center justify-between">
          <p className="text-sm font-medium text-foreground">Spectateurs en direct</p>
          <span className="text-xs text-muted-foreground">{viewers.length}</span>
        </div>

        {viewers.length === 0 ? (
          <p className="text-sm text-muted-foreground">Aucun spectateur détecté pour l&apos;instant.</p>
        ) : (
          <ul className="flex flex-col gap-2">
            <AnimatePresence initial={false}>
              {viewers.map((viewer) => (
                <motion.li
                  key={viewer.id}
                  layout
                  {...listItemMotion}
                  className="flex items-center gap-2 list-none"
                >
                  {viewer.profile_picture_url ? (
                    // eslint-disable-next-line @next/next/no-img-element -- avatars TikTok externes, non optimisables par next/image
                    <img
                      src={viewer.profile_picture_url}
                      alt={viewer.tiktok_username}
                      className="size-8 shrink-0 rounded-full object-cover"
                    />
                  ) : (
                    <div className="flex size-8 shrink-0 items-center justify-center rounded-full bg-muted text-xs text-muted-foreground">
                      {viewer.tiktok_username.slice(0, 2).toUpperCase()}
                    </div>
                  )}
                  <div className="min-w-0">
                    <p className="truncate text-sm text-foreground">
                      {viewer.nickname || viewer.tiktok_username}
                    </p>
                    <p className="truncate text-xs text-muted-foreground">@{viewer.tiktok_username}</p>
                  </div>
                </motion.li>
              ))}
            </AnimatePresence>
          </ul>
        )}
      </CardContent>
    </Card>
  );
}
