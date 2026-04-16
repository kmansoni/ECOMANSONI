import { useState, useEffect, useCallback } from "react";
import { Plus, Folder, Loader2, X } from "lucide-react";
import { dbLoose } from "@/lib/supabase";
import { useAuth } from "@/hooks/useAuth";
import { toast } from "sonner";
import { motion, AnimatePresence } from "framer-motion";

interface Collection {
  id: string;
  name: string;
  cover_url?: string;
  items_count?: number;
}

interface CollectionPost {
  post_id: string;
  posts?: { image_url?: string };
}

export function SavedCollections() {
  const { user } = useAuth();
  const [collections, setCollections] = useState<Collection[]>([]);
  const [loading, setLoading] = useState(true);
  const [showCreate, setShowCreate] = useState(false);
  const [newName, setNewName] = useState("");
  const [creating, setCreating] = useState(false);
  const [activeCollection, setActiveCollection] = useState<string | null>(null);
  const [collectionPosts, setCollectionPosts] = useState<CollectionPost[]>([]);
  const [postsLoading, setPostsLoading] = useState(false);

  const loadCollections = useCallback(async () => {
    if (!user) return;
    setLoading(true);
    try {
      const { data } = await dbLoose
        .from("saved_collections")
        .select("*")
        .eq("user_id", user.id)
        .order("created_at", { ascending: false });
      setCollections((data ?? []) as Collection[]);
    } finally {
      setLoading(false);
    }
  }, [user]);

  useEffect(() => {
    if (!user) return;
    void loadCollections();
  }, [user, loadCollections]);

  const createCollection = async () => {
    if (!newName.trim() || !user) return;
    setCreating(true);
    try {
      const { data, error } = await dbLoose
        .from("saved_collections")
        .insert({ user_id: user.id, name: newName.trim() })
        .select()
        .single();
      if (error) throw error;
      setCollections(prev => [data as Collection, ...prev]);
      setNewName("");
      setShowCreate(false);
      toast.success("Коллекция создана");
    } catch {
      toast.error("Не удалось создать коллекцию");
    } finally {
      setCreating(false);
    }
  };

  const openCollection = async (collectionId: string) => {
    setActiveCollection(collectionId);
    setPostsLoading(true);
    try {
      const { data } = await dbLoose
        .from("saved_collection_items")
        .select("post_id, posts(image_url)")
        .eq("collection_id", collectionId);
      setCollectionPosts((data ?? []) as unknown as CollectionPost[]);
    } finally {
      setPostsLoading(false);
    }
  };

  if (activeCollection) {
    const coll = collections.find(c => c.id === activeCollection);
    return (
      <div>
        <div className="flex items-center gap-3 px-4 py-3 border-b border-border">
          <button onClick={() => setActiveCollection(null)} className="text-muted-foreground hover:text-foreground">
            ← Назад
          </button>
          <h3 className="font-semibold text-foreground">{coll?.name}</h3>
        </div>
        {postsLoading ? (
          <div className="flex justify-center py-8">
            <Loader2 className="w-6 h-6 animate-spin text-muted-foreground" />
          </div>
        ) : collectionPosts.length === 0 ? (
          <p className="text-muted-foreground text-sm text-center py-8">Коллекция пуста</p>
        ) : (
          <div className="grid grid-cols-3 gap-px">
            {collectionPosts.map(cp => (
              <div key={cp.post_id} className="aspect-square bg-muted">
                {cp.posts?.image_url && (
                  <img loading="lazy" src={cp.posts.image_url} alt="" className="w-full h-full object-cover" />
                )}
              </div>
            ))}
          </div>
        )}
      </div>
    );
  }

  return (
    <div>
      {/* Create button */}
      <div className="px-4 py-3">
        <button
          onClick={() => setShowCreate(true)}
          className="flex items-center gap-2 text-sm text-primary font-medium"
        >
          <Plus className="w-4 h-4" />
          Новая коллекция
        </button>
      </div>

      <AnimatePresence>
        {showCreate && (
          <motion.div
            initial={{ height: 0, opacity: 0 }}
            animate={{ height: "auto", opacity: 1 }}
            exit={{ height: 0, opacity: 0 }}
            className="px-4 pb-3 overflow-hidden"
          >
            <div className="flex gap-2">
              <input
                autoFocus
                value={newName}
                onChange={e => setNewName(e.target.value)}
                onKeyDown={e => e.key === "Enter" && createCollection()}
                placeholder="Название коллекции"
                className="flex-1 bg-muted rounded-xl px-3 py-2 text-sm text-foreground outline-none"
              />
              <button onClick={createCollection} disabled={creating || !newName.trim()} className="px-4 py-2 bg-primary rounded-xl text-sm font-semibold text-primary-foreground disabled:opacity-50">
                {creating ? <Loader2 className="w-4 h-4 animate-spin" /> : "Создать"}
              </button>
              <button onClick={() => setShowCreate(false)} className="text-muted-foreground">
                <X className="w-5 h-5" />
              </button>
            </div>
          </motion.div>
        )}
      </AnimatePresence>

      {loading ? (
        <div className="flex justify-center py-8">
          <Loader2 className="w-6 h-6 animate-spin text-muted-foreground" />
        </div>
      ) : collections.length === 0 ? (
        <p className="text-muted-foreground text-sm text-center py-8">Нет коллекций</p>
      ) : (
        <div className="grid grid-cols-2 gap-3 px-4 pb-4">
          {collections.map(col => (
            <button
              key={col.id}
              onClick={() => openCollection(col.id)}
              className="aspect-square bg-muted rounded-2xl overflow-hidden relative"
            >
              {col.cover_url ? (
                <img loading="lazy" src={col.cover_url} alt={col.name} className="w-full h-full object-cover" />
              ) : (
                <div className="w-full h-full flex items-center justify-center">
                  <Folder className="w-8 h-8 text-muted-foreground" />
                </div>
              )}
              <div className="absolute inset-x-0 bottom-0 bg-gradient-to-t from-black/60 to-transparent p-3">
                <p className="text-white text-sm font-medium truncate">{col.name}</p>
              </div>
            </button>
          ))}
        </div>
      )}
    </div>
  );
}
