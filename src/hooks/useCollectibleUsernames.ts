import { useState, useCallback } from "react";
import { supabase } from "@/integrations/supabase/client";
import { useAuth } from "./useAuth";

// DB types not yet regenerated Ã¢ use `any` until `supabase gen types` runs
const db = supabase as any;

// Ã¢Ã¢Ã¢Ã¢Ã¢Ã¢Ã¢Ã¢Ã¢Ã¢Ã¢Ã¢Ã¢Ã¢Ã¢Ã¢Ã¢Ã¢Ã¢Ã¢Ã¢Ã¢Ã¢Ã¢Ã¢Ã¢Ã¢Ã¢Ã¢Ã¢Ã¢Ã¢Ã¢Ã¢Ã¢Ã¢Ã¢Ã¢Ã¢Ã¢Ã¢Ã¢Ã¢Ã¢Ã¢Ã¢Ã¢Ã¢Ã¢Ã¢Ã¢Ã¢Ã¢Ã¢Ã¢Ã¢Ã¢Ã¢Ã¢Ã¢Ã¢Ã¢Ã¢Ã¢Ã¢Ã¢Ã¢Ã¢Ã¢Ã¢Ã¢Ã¢Ã¢Ã¢Ã¢Ã¢Ã¢
// Domain types
// Ã¢Ã¢Ã¢Ã¢Ã¢Ã¢Ã¢Ã¢Ã¢Ã¢Ã¢Ã¢Ã¢Ã¢Ã¢Ã¢Ã¢Ã¢Ã¢Ã¢Ã¢Ã¢Ã¢Ã¢Ã¢Ã¢Ã¢Ã¢Ã¢Ã¢Ã¢Ã¢Ã¢Ã¢Ã¢Ã¢Ã¢Ã¢Ã¢Ã¢Ã¢Ã¢Ã¢Ã¢Ã¢Ã¢Ã¢Ã¢Ã¢Ã¢Ã¢Ã¢Ã¢Ã¢Ã¢Ã¢Ã¢Ã¢Ã¢Ã¢Ã¢Ã¢Ã¢Ã¢Ã¢Ã¢Ã¢Ã¢Ã¢Ã¢Ã¢Ã¢Ã¢Ã¢Ã¢Ã¢Ã¢

export type UsernameCategory = "standard" | "rare" | "legendary" | "og";

export interface CollectibleUsername {
  id: string;
  username: string;
  owner_id: string | null;
  price_stars: number;
  is_for_sale: boolean;
  category: UsernameCategory;
  purchased_at: string | null;
  listed_at: string | null;
  created_at: string;
}

export interface UsernameTransaction {
  id: string;
  username_id: string;
  seller_id: string | null;
  buyer_id: string;
  price_stars: number;
  transaction_type: "purchase" | "auction_win" | "transfer";
  created_at: string;
  /** Optional: populated from join */
  collectible_usernames?: { username: string };
}

// Ã¢Ã¢Ã¢Ã¢Ã¢Ã¢Ã¢Ã¢Ã¢Ã¢Ã¢Ã¢Ã¢Ã¢Ã¢Ã¢Ã¢Ã¢Ã¢Ã¢Ã¢Ã¢Ã¢Ã¢Ã¢Ã¢Ã¢Ã¢Ã¢Ã¢Ã¢Ã¢Ã¢Ã¢Ã¢Ã¢Ã¢Ã¢Ã¢Ã¢Ã¢Ã¢Ã¢Ã¢Ã¢Ã¢Ã¢Ã¢Ã¢Ã¢Ã¢Ã¢Ã¢Ã¢Ã¢Ã¢Ã¢Ã¢Ã¢Ã¢Ã¢Ã¢Ã¢Ã¢Ã¢Ã¢Ã¢Ã¢Ã¢Ã¢Ã¢Ã¢Ã¢Ã¢Ã¢Ã¢Ã¢
// Hook
// Ã¢Ã¢Ã¢Ã¢Ã¢Ã¢Ã¢Ã¢Ã¢Ã¢Ã¢Ã¢Ã¢Ã¢Ã¢Ã¢Ã¢Ã¢Ã¢Ã¢Ã¢Ã¢Ã¢Ã¢Ã¢Ã¢Ã¢Ã¢Ã¢Ã¢Ã¢Ã¢Ã¢Ã¢Ã¢Ã¢Ã¢Ã¢Ã¢Ã¢Ã¢Ã¢Ã¢Ã¢Ã¢Ã¢Ã¢Ã¢Ã¢Ã¢Ã¢Ã¢Ã¢Ã¢Ã¢Ã¢Ã¢Ã¢Ã¢Ã¢Ã¢Ã¢Ã¢Ã¢Ã¢Ã¢Ã¢Ã¢Ã¢Ã¢Ã¢Ã¢Ã¢Ã¢Ã¢Ã¢Ã¢

export function useCollectibleUsernames() {
  const { user } = useAuth();
  const [loading, setLoading] = useState(false);
  const [error, setError] = useState<string | null>(null);

  // Ã¢Ã¢ Marketplace listing Ã¢Ã¢Ã¢Ã¢Ã¢Ã¢Ã¢Ã¢Ã¢Ã¢Ã¢Ã¢Ã¢Ã¢Ã¢Ã¢Ã¢Ã¢Ã¢Ã¢Ã¢Ã¢Ã¢Ã¢Ã¢Ã¢Ã¢Ã¢Ã¢Ã¢Ã¢Ã¢Ã¢Ã¢Ã¢Ã¢Ã¢Ã¢Ã¢Ã¢Ã¢Ã¢Ã¢Ã¢Ã¢Ã¢Ã¢Ã¢Ã¢Ã¢Ã¢

  const getMarketplace = useCallback(
    async (
      category?: UsernameCategory,
      search?: string,
      limit = 50
    ): Promise<CollectibleUsername[]> => {
      setLoading(true);
      setError(null);
      try {
        let query = db
          .from("collectible_usernames")
          .select("*")
          .eq("is_for_sale", true)
          .order("price_stars", { ascending: true })
          .limit(limit);

        if (category) {
          query = query.eq("category", category);
        }

        if (search && search.trim()) {
          query = query.ilike("username", `%${search.trim()}%`);
        }

        const { data, error: qErr } = await query;
        if (qErr) throw qErr;
        return data ?? [];
      } catch (err: any) {
        setError(err?.message ?? "Failed to load marketplace");
        return [];
      } finally {
        setLoading(false);
      }
    },
    []
  );

  // Ã¢Ã¢ My usernames Ã¢Ã¢Ã¢Ã¢Ã¢Ã¢Ã¢Ã¢Ã¢Ã¢Ã¢Ã¢Ã¢Ã¢Ã¢Ã¢Ã¢Ã¢Ã¢Ã¢Ã¢Ã¢Ã¢Ã¢Ã¢Ã¢Ã¢Ã¢Ã¢Ã¢Ã¢Ã¢Ã¢Ã¢Ã¢Ã¢Ã¢Ã¢Ã¢Ã¢Ã¢Ã¢Ã¢Ã¢Ã¢Ã¢Ã¢Ã¢Ã¢Ã¢Ã¢Ã¢Ã¢Ã¢Ã¢Ã¢Ã¢

  const getMyUsernames = useCallback(async (): Promise<
    CollectibleUsername[]
  > => {
    if (!user?.id) return [];
    setLoading(true);
    setError(null);
    try {
      const { data, error: qErr } = await db
        .from("collectible_usernames")
        .select("*")
        .eq("owner_id", user.id)
        .order("created_at", { ascending: false });

      if (qErr) throw qErr;
      return data ?? [];
    } catch (err: any) {
      setError(err?.message ?? "Failed to load my usernames");
      return [];
    } finally {
      setLoading(false);
    }
  }, [user?.id]);

  // Ã¢Ã¢ Purchase username (via Edge Function, never direct DB write) Ã¢Ã¢Ã¢Ã¢Ã¢Ã¢Ã¢Ã¢
  // The Edge Function runs as service_role:
  //   1. Validates buyer has enough Stars
  //   2. Deducts Stars from buyer balance
  //   3. Credits Stars to seller (if any)
  //   4. Sets owner_id = buyer_id, is_for_sale = false, purchased_at = now()
  //   5. Creates username_transactions record
  //   6. Optionally updates the profile username

  const purchaseUsername = useCallback(
    async (
      usernameId: string
    ): Promise<{ success: boolean; error?: string }> => {
      if (!user?.id) return { success: false, error: "Not authenticated" };
      setLoading(true);
      setError(null);
      try {
        const { data, error: fnErr } = await supabase.functions.invoke(
          "purchase-collectible-username",
          {
            body: { username_id: usernameId, buyer_id: user.id },
          }
        );

        if (fnErr) throw fnErr;
        if (data?.error) throw new Error(data.error);

        return { success: true };
      } catch (err: any) {
        const msg = err?.message ?? "Purchase failed";
        setError(msg);
        return { success: false, error: msg };
      } finally {
        setLoading(false);
      }
    },
    [user?.id]
  );

  // Ã¢Ã¢ List for sale Ã¢Ã¢Ã¢Ã¢Ã¢Ã¢Ã¢Ã¢Ã¢Ã¢Ã¢Ã¢Ã¢Ã¢Ã¢Ã¢Ã¢Ã¢Ã¢Ã¢Ã¢Ã¢Ã¢Ã¢Ã¢Ã¢Ã¢Ã¢Ã¢Ã¢Ã¢Ã¢Ã¢Ã¢Ã¢Ã¢Ã¢Ã¢Ã¢Ã¢Ã¢Ã¢Ã¢Ã¢Ã¢Ã¢Ã¢Ã¢Ã¢Ã¢Ã¢Ã¢Ã¢Ã¢Ã¢

  const listForSale = useCallback(
    async (
      usernameId: string,
      priceStars: number
    ): Promise<boolean> => {
      if (!user?.id) return false;
      if (priceStars < 1) {
        setError("Price must be at least 1 Star");
        return false;
      }
      setLoading(true);
      setError(null);
      try {
        const { error: updErr } = await db
          .from("collectible_usernames")
          .update({
            is_for_sale: true,
            price_stars: priceStars,
            listed_at: new Date().toISOString(),
          })
          .eq("id", usernameId)
          .eq("owner_id", user.id); // RLS enforced + extra client guard

        if (updErr) throw updErr;
        return true;
      } catch (err: any) {
        setError(err?.message ?? "Failed to list username");
        return false;
      } finally {
        setLoading(false);
      }
    },
    [user?.id]
  );

  // Ã¢Ã¢ Delist from sale Ã¢Ã¢Ã¢Ã¢Ã¢Ã¢Ã¢Ã¢Ã¢Ã¢Ã¢Ã¢Ã¢Ã¢Ã¢Ã¢Ã¢Ã¢Ã¢Ã¢Ã¢Ã¢Ã¢Ã¢Ã¢Ã¢Ã¢Ã¢Ã¢Ã¢Ã¢Ã¢Ã¢Ã¢Ã¢Ã¢Ã¢Ã¢Ã¢Ã¢Ã¢Ã¢Ã¢Ã¢Ã¢Ã¢Ã¢Ã¢Ã¢Ã¢Ã¢Ã¢

  const delistFromSale = useCallback(
    async (usernameId: string): Promise<boolean> => {
      if (!user?.id) return false;
      setLoading(true);
      setError(null);
      try {
        const { error: updErr } = await db
          .from("collectible_usernames")
          .update({ is_for_sale: false, listed_at: null })
          .eq("id", usernameId)
          .eq("owner_id", user.id);

        if (updErr) throw updErr;
        return true;
      } catch (err: any) {
        setError(err?.message ?? "Failed to delist username");
        return false;
      } finally {
        setLoading(false);
      }
    },
    [user?.id]
  );

  // Ã¢Ã¢ Transaction history Ã¢Ã¢Ã¢Ã¢Ã¢Ã¢Ã¢Ã¢Ã¢Ã¢Ã¢Ã¢Ã¢Ã¢Ã¢Ã¢Ã¢Ã¢Ã¢Ã¢Ã¢Ã¢Ã¢Ã¢Ã¢Ã¢Ã¢Ã¢Ã¢Ã¢Ã¢Ã¢Ã¢Ã¢Ã¢Ã¢Ã¢Ã¢Ã¢Ã¢Ã¢Ã¢Ã¢Ã¢Ã¢Ã¢Ã¢Ã¢Ã¢

  const getTransactionHistory = useCallback(
    async (limit = 30): Promise<UsernameTransaction[]> => {
      if (!user?.id) return [];
      setLoading(true);
      setError(null);
      try {
        const { data, error: qErr } = await db
          .from("username_transactions")
          .select(
            `
            *,
            collectible_usernames ( username )
          `
          )
          .or(`buyer_id.eq.${user.id},seller_id.eq.${user.id}`)
          .order("created_at", { ascending: false })
          .limit(limit);

        if (qErr) throw qErr;
        return data ?? [];
      } catch (err: any) {
        setError(err?.message ?? "Failed to load transaction history");
        return [];
      } finally {
        setLoading(false);
      }
    },
    [user?.id]
  );

  // Ã¢Ã¢ Set active username for profile Ã¢Ã¢Ã¢Ã¢Ã¢Ã¢Ã¢Ã¢Ã¢Ã¢Ã¢Ã¢Ã¢Ã¢Ã¢Ã¢Ã¢Ã¢Ã¢Ã¢Ã¢Ã¢Ã¢Ã¢Ã¢Ã¢Ã¢Ã¢Ã¢Ã¢Ã¢Ã¢Ã¢Ã¢Ã¢Ã¢Ã¢
  // Updates the `profiles` table username field to the owned collectible username.
  // Server-side RLS on profiles ensures only the owner can change their own username.

  const setActiveUsername = useCallback(
    async (usernameId: string): Promise<boolean> => {
      if (!user?.id) return false;
      setLoading(true);
      setError(null);
      try {
        // First verify ownership
        const { data: cu, error: selErr } = await db
          .from("collectible_usernames")
          .select("username")
          .eq("id", usernameId)
          .eq("owner_id", user.id)
          .single();

        if (selErr || !cu) throw selErr ?? new Error("Username not owned");

        // Update the user's profile
        const { error: profErr } = await supabase
          .from("profiles" as any)
          .update({ username: cu.username })
          .eq("id", user.id);

        if (profErr) throw profErr;
        return true;
      } catch (err: any) {
        setError(err?.message ?? "Failed to set active username");
        return false;
      } finally {
        setLoading(false);
      }
    },
    [user?.id]
  );

  return {
    loading,
    error,
    getMarketplace,
    getMyUsernames,
    purchaseUsername,
    listForSale,
    delistFromSale,
    getTransactionHistory,
    setActiveUsername,
  };
}
