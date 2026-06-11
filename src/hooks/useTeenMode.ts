import { useMemo } from 'react';
import { useAgeVerification } from './useAgeVerification';

export const useTeenMode = () => {
  const { profile } = useAgeVerification();

  const isTeen = useMemo(() => {
    return profile?.age_tier === 'teen';
  }, [profile?.age_tier]);

  const isChild = useMemo(() => {
    return profile?.age_tier === 'child_supervised';
  }, [profile?.age_tier]);

  const isAdult = useMemo(() => {
    return profile?.age_tier === 'adult';
  }, [profile?.age_tier]);

  const parentalSettings = useMemo(() => {
    if (!profile) return null;
    return {
      strictLimitedContent: profile.strict_limited_content || false,
      contentRatingLimit: profile.content_rating_limit || 'G',
      parentalGuardianId: profile.parental_guardian_id,
      teenModeEnforcedBy: profile.teen_mode_enforced_by,
      isLocked: profile.is_teen_mode_locked || false,
    };
  }, [profile]);

  const effectiveRatingLimit = useMemo(() => {
    if (!profile) return 'G';
    // If parent overrides, use parent's limit
    if (profile.parental_guardian_id) {
      // This would require fetching parent's profile
      return profile.content_rating_limit;
    }
    return profile.content_rating_limit || 'G';
  }, [profile]);

  const contentFilter = useMemo(() => ({
    maxRating: effectiveRatingLimit,
    strictMode: parentalSettings?.strictLimitedContent ?? false,
  }), [effectiveRatingLimit, parentalSettings?.strictLimitedContent]);

  return {
    isTeen,
    isChild,
    isAdult,
    parentalSettings,
    effectiveRatingLimit,
    contentFilter,
    profile,
  };
};
