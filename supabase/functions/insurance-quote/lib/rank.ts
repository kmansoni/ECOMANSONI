import type { AdapterOffer } from "../adapters/types.ts";

type RankedOffer = AdapterOffer & { rank: number };

export function rankOffers(offers: AdapterOffer[]): RankedOffer[] {
  if (!offers.length) return [];

  const sorted = [...offers].sort((a, b) => {
    // реальные выше mock
    if (a.is_mock !== b.is_mock) return a.is_mock ? 1 : -1;
    return a.premium_amount - b.premium_amount;
  });

  const deduped = dedupByCompany(sorted);

  return deduped.map((o, i) => ({ ...o, rank: i + 1 }));
}

// Если 2 оффера от одной компании с разницей ≤5% — оставить дешевле
function dedupByCompany(sorted: AdapterOffer[]): AdapterOffer[] {
  const seen = new Map<string, AdapterOffer>();

  for (const offer of sorted) {
    const key = offer.company_name.toLowerCase();
    const existing = seen.get(key);

    if (!existing) {
      seen.set(key, offer);
      continue;
    }

    const diff = Math.abs(existing.premium_amount - offer.premium_amount);
    const threshold = existing.premium_amount * 0.05;
    if (diff <= threshold) continue; // дубль — скипаем дороже (sorted ASC)

    // разница >5% — разные продукты, оставляем оба
    // используем составной ключ чтобы не потерять
    seen.set(`${key}__${offer.external_offer_id}`, offer);
  }

  return Array.from(seen.values());
}
