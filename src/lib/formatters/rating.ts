/**
 * Formats a rating value with one fractional digit.
 * Example: 4.73 -> "4.7"
 */
export function formatRating(rating: number): string {
  return rating.toFixed(1);
}
