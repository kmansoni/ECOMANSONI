/**
 * Валидаторы для рекламных креативов.
 *
 * Используются в хуках и компонентах для early validation
 * до отправки запроса на сервер.
 */

export function isValidURL(url: string): boolean {
  try {
    const parsed = new URL(url);
    return parsed.protocol === 'https:';
  } catch {
    return false;
  }
}

export function validateMediaUrl(url: string): { valid: boolean; error?: string } {
  if (!url) {
    return { valid: false, error: 'media_url обязателен' };
  }
  if (!isValidURL(url)) {
    return { valid: false, error: 'media_url должен быть валидным HTTPS URL' };
  }
  if (url.length > 2048) {
    return { valid: false, error: 'media_url слишком длинный (макс. 2048 символов)' };
  }
  return { valid: true };
}

export function validateDestinationUrl(url: string): { valid: boolean; error?: string } {
  if (!url) {
    return { valid: false, error: 'destination_url обязателен' };
  }
  if (!isValidURL(url)) {
    return { valid: false, error: 'destination_url должен быть валидным HTTPS URL' };
  }
  if (url.length > 2048) {
    return { valid: false, error: 'destination_url слишком длинный (макс. 2048 символов)' };
  }
  return { valid: true };
}

export function validateHeadline(headline: string): { valid: boolean; error?: string } {
  const trimmed = headline.trim();
  const len = trimmed.length;
  if (len < 1) {
    return { valid: false, error: 'headline не может быть пустым' };
  }
  if (len > 100) {
    return { valid: false, error: `headline слишком длинный (${len}/100)` };
  }
  return { valid: true };
}

export function validateDescription(description?: string | null): { valid: boolean; error?: string } {
  if (!description) return { valid: true };
  if (description.length > 300) {
    return { valid: false, error: `description слишком длинный (${description.length}/300)` };
  }
  return { valid: true };
}

export function validateCallToAction(cta: string): { valid: boolean; error?: string } {
  const validCTAs = [
    'learn_more', 'shop_now', 'sign_up', 'contact_us', 'download', 'get_quote', 'apply_now'
  ];
  if (!validCTAs.includes(cta as any)) {
    return { valid: false, error: `Недопустимый call_to_action: ${cta}` };
  }
  return { valid: true };
}

export function validateFrequencyCap(cap: number): { valid: boolean; error?: string } {
  if (cap < 1 || cap > 100) {
    return { valid: false, error: 'frequency_cap должен быть от 1 до 100' };
  }
  return { valid: true };
}

/**
 * Комплексная валидация креатива
 */
export function validateCreative(input: {
  type: string;
  media_url: string;
  headline: string;
  description?: string | null;
  call_to_action: string;
  destination_url: string;
  frequency_cap?: number;
}): string[] {
  const errors: string[] = [];

  // type
  const validTypes = ['image', 'video', 'carousel', 'story'];
  if (!validTypes.includes(input.type)) {
    errors.push(`Недопустимый type: ${input.type}`);
  }

  // media_url
  const mediaValidation = validateMediaUrl(input.media_url);
  if (!mediaValidation.valid) errors.push(mediaValidation.error!);

  // headline
  const headlineValidation = validateHeadline(input.headline);
  if (!headlineValidation.valid) errors.push(headlineValidation.error!);

  // description
  const descValidation = validateDescription(input.description);
  if (!descValidation.valid) errors.push(descValidation.error!);

  // call_to_action
  const ctaValidation = validateCallToAction(input.call_to_action);
  if (!ctaValidation.valid) errors.push(ctaValidation.error!);

  // destination_url
  const destValidation = validateDestinationUrl(input.destination_url);
  if (!destValidation.valid) errors.push(destValidation.error!);

  // frequency_cap
  const freqCap = input.frequency_cap ?? 3;
  const freqValidation = validateFrequencyCap(freqCap);
  if (!freqValidation.valid) errors.push(freqValidation.error!);

  return errors;
}

export const validateCreativeInput = validateCreative;

/**
 * Валидация UUID
 */
export function isUUID(id: string): boolean {
  return /^[0-9a-f]{8}-[0-9a-f]{4}-4[0-9a-f]{3}-[89ab][0-9a-f]{3}-[0-9a-f]{12}$/i.test(id);
}

/**
 * Валидация Creative ID (для edge function)
 */
export function isValidCreativeId(id: string): boolean {
  return isUUID(id);
}
