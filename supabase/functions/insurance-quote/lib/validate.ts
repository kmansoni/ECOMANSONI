const CATEGORIES = [
  "osago", "kasko", "dms", "travel",
  "property", "mortgage", "life",
] as const;

type Category = typeof CATEGORIES[number];

export function isValidCategory(cat: string): cat is Category {
  return (CATEGORIES as readonly string[]).includes(cat);
}

type ParsedRequest = {
  category: string;
  params: Record<string, unknown>;
  preferred_providers?: string[];
};

export function parseQuoteBody(
  raw: unknown,
): ParsedRequest | { error: string } {
  if (!raw || typeof raw !== "object") {
    return { error: "Тело запроса должно быть JSON-объектом" };
  }

  const body = raw as Record<string, unknown>;

  if (typeof body.category !== "string" || !body.category) {
    return { error: "Не указана категория страхования" };
  }
  if (!isValidCategory(body.category)) {
    return { error: `Неизвестная категория: ${body.category}` };
  }

  if (!body.params || typeof body.params !== "object") {
    return { error: "Параметры (params) обязательны" };
  }

  const result: ParsedRequest = {
    category: body.category,
    params: body.params as Record<string, unknown>,
  };

  if (Array.isArray(body.preferred_providers)) {
    const filtered = body.preferred_providers
      .filter((p): p is string => typeof p === "string" && p.length > 0);
    if (filtered.length) result.preferred_providers = filtered;
  }

  return result;
}
