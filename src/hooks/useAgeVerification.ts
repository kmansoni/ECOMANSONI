import { useState, useCallback } from 'react';
import { supabase } from '@/lib/supabase';
import { useProfileStore } from '@/stores/profileStore';

export const useAgeVerification = () => {
  const [isVerifying, setIsVerifying] = useState(false);
  const { profile, refreshProfile } = useProfileStore();

  const verifyAge = useCallback(async (dateOfBirth: string): Promise<{ success: boolean; error?: string; account_type?: string }> => {
    setIsVerifying(true);
    try {
      const { data, error } = await supabase.rpc('verify_age_and_enforce_mode', {
        p_user_id: profile?.id,
        p_date_of_birth: dateOfBirth,
        p_ip_address: undefined, // Let backend extract from request
        p_method: 'self_report' as const,
      });

      if (error) {
        console.error('Age verification error:', error);
        return { success: false, error: error.message };
      }

      if (data.success) {
        await refreshProfile();
        return { success: true, account_type: data.age_tier };
      } else {
        return { success: false, error: data.error || 'Unknown error' };
      }
    } catch (err: any) {
      return { success: false, error: err.message };
    } finally {
      setIsVerifying(false);
    }
  }, [profile?.id, refreshProfile]);

  return { verifyAge, isVerifying, profile };
};
