import { create } from 'zustand';
import { supabase } from '@/lib/supabase';
import type { Database } from '@/integrations/supabase/types';

type Profile = Database['public']['Tables']['profiles']['Row'];

interface ExtendedProfile extends Profile {
  age_verified_at?: string | null;
  age_tier?: 'adult' | 'teen' | 'child_supervised' | null;
  strict_limited_content?: boolean | null;
  content_rating_limit?: 'G' | 'PG' | 'PG-13' | 'T' | 'MA' | null;
  parental_guardian_id?: string | null;
  teen_mode_enforced_by?: string | null;
  is_teen_mode_locked?: boolean | null;
}

interface ProfileState {
  profile: ExtendedProfile | null;
  isLoading: boolean;
  error: string | null;
  refreshProfile: () => Promise<void>;
  updateProfile: (updates: Partial<Profile>) => Promise<void>;
}

export const useProfileStore = create<ProfileState>((set, get) => ({
  profile: null,
  isLoading: false,
  error: null,

  refreshProfile: async () => {
    set({ isLoading: true, error: null });
    try {
      const { data: { user } } = await supabase.auth.getUser();
      if (!user) {
        set({ profile: null, isLoading: false });
        return;
      }

      const { data, error } = await supabase
        .from('profiles')
        .select('*')
        .eq('user_id', user.id)
        .single();

      if (error) throw error;
      set({ profile: data, isLoading: false });
    } catch (err: any) {
      set({ error: err.message, isLoading: false });
    }
  },

  updateProfile: async (updates) => {
    const { profile } = get();
    if (!profile) return;

    try {
      const { data, error } = await supabase
        .from('profiles')
        .update(updates)
        .eq('id', profile.id)
        .select()
        .single();

      if (error) throw error;
      set({ profile: data });
    } catch (err: any) {
      set({ error: err.message });
    }
  },
}));

// Initialize profile on mount
supabase.auth.onAuthStateChange((event, session) => {
  if (event === 'SIGNED_IN' || event === 'TOKEN_REFRESHED') {
    useProfileStore.getState().refreshProfile();
  } else if (event === 'SIGNED_OUT') {
    useProfileStore.setState({ profile: null });
  }
});
