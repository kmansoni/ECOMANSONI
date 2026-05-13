/**
 * Telegram Deep Linking
 * Bot API 10.0 t.me links support
 */

export interface StartAppParams {
  // Parse startapp parameter (JSON or query string)
  startapp?: string;
  // Context from Telegram
  chat_type?: 'private' | 'group' | 'supergroup' | 'channel';
  chat_instance?: string;
  user_id?: number;
}

export interface DeepLinkContext extends StartAppParams {
  // Resolved values
  params: Record<string, string>;
  referral?: string;
  action?: string;
  payload?: string;
}

// Parse t.me links
export function parseTelegramLink(url: string): {
  botUsername?: string;
  startParam?: string;
  startApp?: string;
  attach?: string;
} {
  try {
    const u = new URL(url);
    const pathParts = u.pathname.slice(1).split('/');
    
    return {
      botUsername: pathParts[0],
      startParam: u.searchParams.get('start') || u.searchParams.get('startapp') || undefined,
      startApp: u.searchParams.get('startapp') || undefined,
      attach: u.searchParams.get('startattach') || undefined,
    };
  } catch {
    return {};
  }
}

// Parse startapp parameter (supports JSON or key=value format)
export function parseStartApp(startapp?: string): DeepLinkContext['params'] {
  if (!startapp) return {};
  
  // Try JSON first
  try {
    const parsed = JSON.parse(startapp);
    if (typeof parsed === 'object') return parsed;
  } catch {
    // Not JSON, try query string format
  }
  
  // Parse as query string
  const params: Record<string, string> = {};
  startapp.split('&').forEach(pair => {
    const [key, value] = pair.split('=');
    if (key && value) params[key] = decodeURIComponent(value);
  });
  
  return params;
}

// Build deep link URL
export function buildDeepLink(options: {
  botUsername: string;
  start?: string;
  startapp?: string;
  startattach?: string;
}): string {
  const url = new URL(`https://t.me/${options.botUsername}`);
  
  if (options.start) url.searchParams.set('start', options.start);
  if (options.startapp) url.searchParams.set('startapp', options.startapp);
  if (options.startattach) url.searchParams.set('startattach', options.startattach);
  
  return url.toString();
}

// Track deep link analytics
export async function trackDeepLink(
  params: StartAppParams & { 
    source?: string;
    timestamp?: number;
  }
): Promise<void> {
  // Would be implemented with Supabase RPC
  console.log('Deep link tracked:', params);
}

export default {
  parseTelegramLink,
  parseStartApp,
  buildDeepLink,
  trackDeepLink,
};