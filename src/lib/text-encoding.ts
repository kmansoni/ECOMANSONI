/**
 * Text encoding utilities to prevent Cyrillic corruption
 * Handles UTF-8 verification and mojibake detection/recovery
 */

/**
 * Detects if text appears to be corrupted (mojibake)
 * Checks for patterns like "P$P°C,C<" which indicate UTF-8 bytes misinterpreted as Latin-1
 */
export function isMojibake(text: string): boolean {
  if (!text || typeof text !== 'string') return false;
  
  // Check for suspicious patterns:
  // 1. Cyrillic-range Unicode chars mixed with unusual ASCII chars
  // 2. Too many non-printable or unusual control characters
  
  const cyrillicCodePoints = /[\u0400-\u04FF]/g;
  const suspiciousPatterns = /[$°€]/g;  // Common mojibake indicators
  
  const hasCyrillic = cyrillicCodePoints.test(text);
  const hasSuspicious = suspiciousPatterns.test(text);
  
  // If we have suspicious patterns but no valid Cyrillic, likely mojibake
  if (hasSuspicious && !hasCyrillic) return true;
  
  return false;
}

/**
 * Attempts to recover UTF-8 text that was misinterpreted as Latin-1
 * This handles the case where Cyrillic UTF-8 bytes were read as individual Latin-1 chars
 */
export function recoverFromUTF8toLatin1Corruption(text: string): string {
  if (!text || typeof text !== 'string') return text;
  
  try {
    // Convert string back to bytes assuming it was interpreted as Latin-1
    const latin1Bytes = new Uint8Array(text.length);
    for (let i = 0; i < text.length; i++) {
      latin1Bytes[i] = text.charCodeAt(i) & 0xFF;
    }
    
    // Decode those bytes as proper UTF-8
    const decoder = new TextDecoder('utf-8', { fatal: false });
    const recovered = decoder.decode(latin1Bytes);
    
    // Only return recovery if we got something different and more Cyrillic-looking
    if (recovered !== text && /[\u0400-\u04FF]/.test(recovered)) {
      return recovered;
    }
  } catch {
    // Silently fail if recovery not possible
  }
  
  return text;
}

/**
 * Sanitize and validate text before sending to server
 * Ensures UTF-8 is properly handled
 */
export function sanitizeTextForTransport(text: string): string {
  if (!text || typeof text !== 'string') return '';
  
  // Normalize to NFC form (canonical composition) for consistent UTF-8
  try {
    return text.normalize('NFC');
  } catch {
    return text;
  }
}

/**
 * Recover text received from server
 * Checks for corruption and attempts recovery if needed
 */
export function sanitizeReceivedText(text: string | null | undefined): string {
  if (!text || typeof text !== 'string') return '';
  
  // Normalize form
  let normalized: string;
  try {
    normalized = text.normalize('NFC');
  } catch {
    normalized = text;
  }
  
  // Check for mojibake and attempt recovery
  if (isMojibake(normalized)) {
    const recovered = recoverFromUTF8toLatin1Corruption(normalized);
    if (recovered !== normalized) {
      console.warn('[Text Recovery] Recovered mojibake:', { original: text, recovered });
      return recovered;
    }
  }
  
  return normalized;
}

/**
 * Validate Cyrillic text pattern
 * Used for detecting if received Cyrillic looks authentic
 */
export function isValidCyrillicText(text: string): boolean {
  if (!text || typeof text !== 'string') return false;
  
  // Check if text contains valid Cyrillic or Latin characters (not corrupted)
  const cyrillicPattern = /[\u0400-\u04FF]+/;
  const latinPattern = /[a-zA-Z]+/;
  const digitsPattern = /[\d]+/;
  
  // Allow any combination of Cyrillic, Latin, digits, and common punctuation
  const allowedPattern = /^[a-zA-Z0-9\u0400-\u04FF\s.,!?\-'"():;—–«»""\n\r]+$/;
  
  return allowedPattern.test(text) || cyrillicPattern.test(text) || latinPattern.test(text);
}
