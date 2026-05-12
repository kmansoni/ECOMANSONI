import React from 'react';
import { useSafety } from '@/contexts/SafetyContext';
import { ContentRestrictedBadge } from '@/components/safety/ContentRestrictedBadge';

type Rating = 'G' | 'PG' | 'PG-13' | 'T' | 'MA';

const ratingValues: Record<Rating, number> = {
  G: 1,
  PG: 2,
  'PG-13': 3,
  T: 4,
  MA: 5,
};

interface ContentProps {
  rating?: Rating;
  languageScore?: number;
  substanceScore?: number;
  violenceScore?: number;
  riskyStuntsScore?: number;
  title?: string;
  children?: React.ReactNode;
}

export function withContentFilter<P extends ContentProps>(
  Component: React.ComponentType<P>,
  requiredRating: Rating = 'PG-13'
) {
  return function ContentFilteredComponent(props: P) {
    const { contentFilter } = useSafety();
    const [isRestricted, setIsRestricted] = React.useState(false);
    const [showUnlockDialog, setShowUnlockDialog] = React.useState(false);

    // Determine if content should be shown
    const shouldShow = React.useMemo(() => {
      if (!props.rating) return true;

      // Check rating
      const meetsRating = ratingValues[props.rating] <= ratingValues[contentFilter.maxRating];
      if (!meetsRating) {
        setIsRestricted(true);
        return false;
      }

      // Check strict mode filters
      if (contentFilter.strictMode) {
        if (props.languageScore && props.languageScore >= 50) return false;
        if (props.substanceScore && props.substanceScore >= 30) return false;
        if (props.violenceScore && props.violenceScore >= 50) return false;
        if (props.riskyStuntsScore && props.riskyStuntsScore >= 50) return false;
      }

      return true;
    }, [props, contentFilter]);

    if (isRestricted) {
      return (
        <ContentRestrictedBadge
          requiredAge={ratingValues[requiredRating] * 6 + 6} // approximate mapping
          contentTitle={props.title}
          canUnlock={false}
        />
      );
    }

    return <Component {...props} />;
  };
}
