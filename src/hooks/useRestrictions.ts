import { useState, useEffect, useCallback } from "react";
import { supabase } from "@/integrations/supabase/client";
import { useAuth } from "./useAuth";

export function useRestrictions() {
  const { user } = useAuth();
  const [restrictedIds, setRestrictedIds] = useState<Set<string>>(new Set());
  const [loaded, setLoaded] = useState(false);

  useEffect(() => {
    if (!user) return;
    (async () => {
      const { data } = await (supabase as any)
        .from("restricted_users")
        .select("restricted_id")
        .eq("user_id", user.id);
      if (data) {
        setRestrictedIds(new Set(data.map((r: any) => r.restricted_id)));
      }
      setLoaded(true);
    })();
  }, [user]);

  const restrictUser = useCallback(
    async (restrictedId: string) => {
      if (!user) return;
      await (supabase as any)
        .from("restricted_users")
        .insert({ user_id: user.id, restricted_id: restrictedId });
      setRestrictedIds((prev) => new Set([...prev, restrictedId]));
    },
    [user]
  );

  const unrestrictUser = useCallback(
    async (restrictedId: string) => {
      if (!user) return;
      await (supabase as any)
        .from("restricted_users")
        .delete()
        .eq("user_id", user.id)
        .eq("restricted_id", restrictedId);
      setRestrictedIds((prev) => {
        const next = new Set(prev);
        next.delete(restrictedId);
        return next;
      });
    },
    [user]
  );

  const isRestricted = useCallback(
    (userId: string) => restrictedIds.has(userId),
    [restrictedIds]
  );

  const getRestrictedUsers = useCallback(() => Array.from(restrictedIds), [restrictedIds]);

  return { restrictUser, unrestrictUser, isRestricted, getRestrictedUsers, loaded };
}
