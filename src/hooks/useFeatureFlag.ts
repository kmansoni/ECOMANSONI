import { useEffect, useState } from 'react';
import { useAuth } from '@/hooks/useAuth';
import { isEnabled, isEnabledSync, type FeatureFlag } from '@/lib/featureFlags';

export function useFeatureFlag(flag: FeatureFlag): boolean {
  const { user } = useAuth();
  const [enabled, setEnabled] = useState(() => isEnabledSync(flag, user?.id));

  useEffect(() => {
    let cancelled = false;
    isEnabled(flag, user?.id).then((val) => {
      if (!cancelled) setEnabled(val);
    });
    return () => { cancelled = true; };
  }, [flag, user?.id]);

  return enabled;
}

// Для нескольких флагов сразу
export function useFeatureFlags<T extends FeatureFlag>(flags: T[]): Record<T, boolean> {
  const { user } = useAuth();
  const [values, setValues] = useState<Record<T, boolean>>(
    () => Object.fromEntries(flags.map((f) => [f, isEnabledSync(f, user?.id)])) as Record<T, boolean>
  );

  useEffect(() => {
    let cancelled = false;
    Promise.all(flags.map((f) => isEnabled(f, user?.id).then((v) => [f, v] as [T, boolean])))
      .then((entries) => {
        if (!cancelled) setValues(Object.fromEntries(entries) as Record<T, boolean>);
      });
    return () => { cancelled = true; };
  }, [user?.id]);

  return values;
}
