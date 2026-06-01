/**
 * Demo bots — mock users for demo mode.
 */

export interface DemoBotUser {
  id: string;
  display_name: string;
  avatar_url: string | null;
}

export const demoBots: DemoBotUser[] = [];

export function isDemoId(userId: string): boolean {
  return userId.startsWith('demo_bot_');
}

export function getDemoBotsUsersWithStories(): DemoBotUser[] {
  return demoBots;
}