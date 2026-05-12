import React, { createContext, useContext, useEffect, useState } from 'react';
import { supabase } from '@/lib/supabase';
import { useProfileStore } from '@/stores/profileStore';
import { useTeenMode } from '@/hooks/useTeenMode';

interface ContentFilter {
  maxRating: 'G' | 'PG' | 'PG-13' | 'T' | 'MA';
  blockProfanity: boolean;
  blockSubstance: boolean;
  blockViolence: boolean;
  blockRiskyStunts: boolean;
  strictMode: boolean;
}

interface SafetyContextType {
  contentFilter: ContentFilter;
  setContentFilter: React.Dispatch<React.SetStateAction<ContentFilter>>;
  ageTier: 'adult' | 'teen' | 'child_supervised' | null;
  isAgeVerified: boolean;
  refreshSafetySettings: () => Promise<void>;
}

const SafetyContext = createContext<SafetyContextType | null>(null);

export const SafetyProvider: React.FC<{ children: React.ReactNode }> = ({ children }) => {
  const { profile, refreshProfile } = useProfileStore();
  const { parentalSettings } = useTeenMode();

  const [contentFilter, setContentFilter] = useState<ContentFilter>({
    maxRating: 'PG-13',
    blockProfanity: true,
    blockSubstance: true,
    blockViolence: true,
    blockRiskyStunts: true,
    strictMode: false,
  });

  const ageTier = profile?.age_tier || null;
  const isAgeVerified = !!profile?.age_verified_at;

  // Sync filter from profile on mount and when profile changes
  useEffect(() => {
    if (profile?.content_rating_limit) {
      setContentFilter((prev) => ({
        ...prev,
        maxRating: profile.content_rating_limit as any,
        strictMode: profile.strict_limited_content || false,
      }));
    }
  }, [profile?.content_rating_limit, profile?.strict_limited_content]);

  // Listen to parental overrides via Realtime
  useEffect(() => {
    const channel = supabase
      .channel('safety-settings')
      .on(
        'postgres_changes',
        {
          event: 'UPDATE',
          schema: 'public',
          table: 'profiles',
          filter: `id=eq.${profile?.id}`,
        },
        (payload) => {
          if (payload.new) {
            setContentFilter((prev) => ({
              ...prev,
              maxRating: payload.new.content_rating_limit || prev.maxRating,
              strictMode: payload.new.strict_limited_content || false,
            }));
          }
        }
      )
      .subscribe();

    return () => {
      supabase.removeChannel(channel);
    };
  }, [profile?.id]);

  const refreshSafetySettings = async () => {
    await refreshProfile();
  };

  return (
    <SafetyContext.Provider
      value={{
        contentFilter,
        setContentFilter,
        ageTier,
        isAgeVerified,
        refreshSafetySettings,
      }}
    >
      {children}
    </SafetyContext.Provider>
  );
};

export const useSafety = () => {
  const context = useContext(SafetyContext);
  if (!context) {
    throw new Error('useSafety must be used within SafetyProvider');
  }
  return context;
};
