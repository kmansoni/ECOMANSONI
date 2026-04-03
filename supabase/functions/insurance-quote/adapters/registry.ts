import { InsSmartAdapter } from "./inssmart.ts";
import { CherhapaAdapter } from "./cherehapa.ts";
import { MockAdapter } from "./mock.ts";
import type { AdapterConfig, ProviderAdapter } from "./types.ts";

export function createAdapter(code: string): ProviderAdapter | null {
  switch (code) {
    case "inssmart": return new InsSmartAdapter();
    case "cherehapa": return new CherhapaAdapter();
    case "mock": return new MockAdapter();
    default: return null;
  }
}

type ActiveAdapter = { adapter: ProviderAdapter; config: AdapterConfig };

// deno-lint-ignore no-explicit-any
export async function loadActiveAdapters(
  supabase: any,
  category: string,
  preferred?: string[],
): Promise<ActiveAdapter[]> {
  const { data: rows, error } = await supabase
    .from("insurance_providers")
    .select("code, base_url, timeout_ms, sandbox_mode, config, priority")
    .eq("is_active", true)
    .contains("supported_categories", [category])
    .order("priority", { ascending: false })
    .limit(20);

  if (error || !rows?.length) return [];

  const result: ActiveAdapter[] = [];
  for (const row of rows) {
    if (preferred?.length && !preferred.includes(row.code)) continue;

    const adapter = createAdapter(row.code);
    if (!adapter || !adapter.supports(category)) continue;

    result.push({
      adapter,
      config: {
        code: row.code,
        base_url: row.base_url ?? null,
        timeout_ms: row.timeout_ms ?? 10_000,
        sandbox_mode: row.sandbox_mode ?? true,
        meta: row.config ?? {},
      },
    });
  }

  return result;
}
