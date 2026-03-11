import { useState, useCallback } from "react";
import { supabase } from "@/integrations/supabase/client";
import { useAuth } from "./useAuth";

// DB types not yet regenerated â use `any` until `supabase gen types` runs
const db = supabase as any;

// âââââââââââââââââââââââââââââââââââââââââââââââââââââââââââââââââââââââââââââ
// Domain types
// âââââââââââââââââââââââââââââââââââââââââââââââââââââââââââââââââââââââââââââ

export interface ReactionPack {
  id: string;
  name: string;
  description: string | null;
  author_id: string;
  cover_url: string | null;
  is_official: boolean;
  is_public: boolean;
  install_count: number;
  created_at: string;
  updated_at: string;
  /** Populated via join when needed */
  items?: ReactionPackItem[];
  /** True if current user has installed this pack */
  installed?: boolean;
}

export interface ReactionPackItem {
  id: string;
  pack_id: string;
  emoji: string;
  image_url: string | null;
  sort_order: number;
  created_at: string;
}

export interface InstalledReaction {
  emoji: string;
  image_url: string | null;
  pack_id: string;
  pack_name: string;
}

// âââââââââââââââââââââââââââââââââââââââââââââââââââââââââââââââââââââââââââââ
// Hook
// âââââââââââââââââââââââââââââââââââââââââââââââââââââââââââââââââââââââââââââ

export function useReactionPacks() {
  const { user } = useAuth();
  const [loading, setLoading] = useState(false);
  const [error, setError] = useState<string | null>(null);

  // ââ Catalogue: all public packs ââââââââââââââââââââââââââââââââââââââââââ

  const getPublicPacks = useCallback(
    async (search?: string, limit = 50): Promise<ReactionPack[]> => {
      setLoading(true);
      setError(null);
      try {
        let query = db
          .from("reaction_packs")
          .select("*")
          .eq("is_public", true)
          .order("install_count", { ascending: false })
          .limit(limit);

        if (search && search.trim()) {
          query = query.ilike("name", `%${search.trim()}%`);
        }

        const { data, error: qErr } = await query;
        if (qErr) throw qErr;

        if (!user?.id) return data ?? [];

        // Mark which packs the current user has installed
        const { data: installed } = await db
          .from("user_reaction_packs")
          .select("pack_id")
          .eq("user_id", user.id);

        const installedSet = new Set<string>(
          (installed ?? []).map((r: { pack_id: string }) => r.pack_id)
        );

        return (data ?? []).map((p: ReactionPack) => ({
          ...p,
          installed: installedSet.has(p.id),
        }));
      } catch (err: any) {
        setError(err?.message ?? "Failed to load packs");
        return [];
      } finally {
        setLoading(false);
      }
    },
    [user?.id]
  );

  // ââ My installed packs âââââââââââââââââââââââââââââââââââââââââââââââââââ

  const getMyPacks = useCallback(async (): Promise<ReactionPack[]> => {
    if (!user?.id) return [];
    setLoading(true);
    setError(null);
    try {
      // JOIN via user_reaction_packs â reaction_packs
      const { data, error: qErr } = await db
        .from("user_reaction_packs")
        .select(
          `
          sort_order,
          installed_at,
          reaction_packs (
            id, name, description, author_id, cover_url,
            is_official, is_public, install_count, created_at, updated_at
          )
        `
        )
        .eq("user_id", user.id)
        .order("sort_order", { ascending: true });

      if (qErr) throw qErr;

      return (data ?? []).map((row: any) => ({
        ...row.reaction_packs,
        installed: true,
      }));
    } catch (err: any) {
      setError(err?.message ?? "Failed to load installed packs");
      return [];
    } finally {
      setLoading(false);
    }
  }, [user?.id]);

  // ââ Items in a pack ââââââââââââââââââââââââââââââââââââââââââââââââââââââ

  const getPackItems = useCallback(
    async (packId: string): Promise<ReactionPackItem[]> => {
      setLoading(true);
      setError(null);
      try {
        const { data, error: qErr } = await db
          .from("reaction_pack_items")
          .select("*")
          .eq("pack_id", packId)
          .order("sort_order", { ascending: true });

        if (qErr) throw qErr;
        return data ?? [];
      } catch (err: any) {
        setError(err?.message ?? "Failed to load pack items");
        return [];
      } finally {
        setLoading(false);
      }
    },
    []
  );

  // ââ Install a pack âââââââââââââââââââââââââââââââââââââââââââââââââââââââ

  const installPack = useCallback(
    async (packId: string): Promise<boolean> => {
      if (!user?.id) return false;
      setLoading(true);
      setError(null);
      try {
        // Determine max sort_order for user
        const { data: existing } = await db
          .from("user_reaction_packs")
          .select("sort_order")
          .eq("user_id", user.id)
          .order("sort_order", { ascending: false })
          .limit(1);

        const nextOrder =
          existing && existing.length > 0 ? existing[0].sort_order + 1 : 0;

        const { error: insertErr } = await db
          .from("user_reaction_packs")
          .insert({ user_id: user.id, pack_id: packId, sort_order: nextOrder });

        if (insertErr) throw insertErr;

        // Increment install_count â idempotent via upsert approach:
        // We do it after successful insert to avoid phantom increments
        await db.rpc("increment_reaction_pack_install", { p_pack_id: packId }).maybeSingle();
        // rpc is best-effort; if it fails we still succeeded in installing

        return true;
      } catch (err: any) {
        // PK violation = already installed, treat as success
        if (err?.code === "23505") return true;
        setError(err?.message ?? "Failed to install pack");
        return false;
      } finally {
        setLoading(false);
      }
    },
    [user?.id]
  );

  // ââ Uninstall a pack âââââââââââââââââââââââââââââââââââââââââââââââââââââ

  const uninstallPack = useCallback(
    async (packId: string): Promise<boolean> => {
      if (!user?.id) return false;
      setLoading(true);
      setError(null);
      try {
        const { error: delErr } = await db
          .from("user_reaction_packs")
          .delete()
          .eq("user_id", user.id)
          .eq("pack_id", packId);

        if (delErr) throw delErr;

        await db.rpc("decrement_reaction_pack_install", { p_pack_id: packId }).maybeSingle();

        return true;
      } catch (err: any) {
        setError(err?.message ?? "Failed to uninstall pack");
        return false;
      } finally {
        setLoading(false);
      }
    },
    [user?.id]
  );

  // ââ Create a new pack ââââââââââââââââââââââââââââââââââââââââââââââââââââ

  const createPack = useCallback(
    async (
      name: string,
      description?: string
    ): Promise<ReactionPack | null> => {
      if (!user?.id) return null;
      setLoading(true);
      setError(null);
      try {
        const { data, error: insErr } = await db
          .from("reaction_packs")
          .insert({
            name: name.trim(),
            description: description?.trim() ?? null,
            author_id: user.id,
            is_public: true,
          })
          .select()
          .single();

        if (insErr) throw insErr;
        return data;
      } catch (err: any) {
        setError(err?.message ?? "Failed to create pack");
        return null;
      } finally {
        setLoading(false);
      }
    },
    [user?.id]
  );

  // ââ Add item to pack âââââââââââââââââââââââââââââââââââââââââââââââââââââ

  const addItemToPack = useCallback(
    async (
      packId: string,
      emoji: string,
      imageUrl?: string
    ): Promise<ReactionPackItem | null> => {
      if (!user?.id) return null;
      setLoading(true);
      setError(null);
      try {
        // Determine max sort_order inside this pack
        const { data: existing } = await db
          .from("reaction_pack_items")
          .select("sort_order")
          .eq("pack_id", packId)
          .order("sort_order", { ascending: false })
          .limit(1);

        const nextOrder =
          existing && existing.length > 0 ? existing[0].sort_order + 1 : 0;

        const { data, error: insErr } = await db
          .from("reaction_pack_items")
          .insert({
            pack_id: packId,
            emoji: emoji.trim(),
            image_url: imageUrl ?? null,
            sort_order: nextOrder,
          })
          .select()
          .single();

        if (insErr) throw insErr;
        return data;
      } catch (err: any) {
        setError(err?.message ?? "Failed to add item");
        return null;
      } finally {
        setLoading(false);
      }
    },
    [user?.id]
  );

  // ââ Remove item from pack âââââââââââââââââââââââââââââââââââââââââââââââââ

  const removeItemFromPack = useCallback(
    async (itemId: string): Promise<boolean> => {
      if (!user?.id) return false;
      setLoading(true);
      setError(null);
      try {
        const { error: delErr } = await db
          .from("reaction_pack_items")
          .delete()
          .eq("id", itemId);

        if (delErr) throw delErr;
        return true;
      } catch (err: any) {
        setError(err?.message ?? "Failed to remove item");
        return false;
      } finally {
        setLoading(false);
      }
    },
    [user?.id]
  );

  // ââ Flat list of all reactions from installed packs âââââââââââââââââââââââ
  // Used by ReactionPicker to show inline emoji options fast.

  const getInstalledReactions = useCallback(async (): Promise<
    InstalledReaction[]
  > => {
    if (!user?.id) return [];
    try {
      const { data, error: qErr } = await db
        .from("user_reaction_packs")
        .select(
          `
          reaction_packs (
            id,
            name,
            reaction_pack_items (
              emoji,
              image_url
            )
          )
        `
        )
        .eq("user_id", user.id)
        .order("sort_order", { ascending: true });

      if (qErr) throw qErr;

      const result: InstalledReaction[] = [];
      for (const row of data ?? []) {
        const pack = row.reaction_packs;
        if (!pack) continue;
        for (const item of pack.reaction_pack_items ?? []) {
          result.push({
            emoji: item.emoji,
            image_url: item.image_url,
            pack_id: pack.id,
            pack_name: pack.name,
          });
        }
      }
      return result;
    } catch {
      return [];
    }
  }, [user?.id]);

  return {
    loading,
    error,
    getPublicPacks,
    getMyPacks,
    getPackItems,
    installPack,
    uninstallPack,
    createPack,
    addItemToPack,
    removeItemFromPack,
    getInstalledReactions,
  };
}
