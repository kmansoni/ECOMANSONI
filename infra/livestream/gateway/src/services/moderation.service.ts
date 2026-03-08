/**
 * services/moderation.service.ts — Chat moderation logic.
 *
 * Operations:
 * - Ban/unban users from chat in a session
 * - Delete individual chat messages
 * - Pin messages
 * - Assign/revoke moderators with permission bitmask
 *
 * Authorization model:
 *   - Host: can do everything
 *   - Moderator with permission 'ban_user': can ban/unban
 *   - Moderator with permission 'delete_message': can delete messages
 *   - Moderator with permission 'all': all permissions
 *
 * Security: permission checks happen server-side, never trust client claims.
 */

import type { SupabaseClient } from '@supabase/supabase-js'
import type { ChatBan, ChatModerator, ModeratorPermission } from '../types/index.js'
import {
  NotFoundError,
  ForbiddenError,
} from '../plugins/error-handler.js'

export class ModerationService {
  constructor(private readonly supabase: SupabaseClient) {}

  /**
   * Verify the acting user is the host OR has the required permission.
   * Throws ForbiddenError if neither condition is met.
   */
  private async requireModeratorOrHost(
    sessionId: string,
    actingUserId: string,
    requiredPermission: ModeratorPermission,
  ): Promise<void> {
    // Check if host
    const { data: session } = await this.supabase
      .from('live_sessions')
      .select('user_id')
      .eq('id', sessionId)
      .single()

    if (session?.user_id === actingUserId) return // Host — always allowed

    // Check moderator permissions
    const { data: mod } = await this.supabase
      .from('live_chat_moderators')
      .select('permissions')
      .eq('session_id', sessionId)
      .eq('user_id', actingUserId)
      .maybeSingle()

    if (!mod) {
      throw new ForbiddenError('You are not the host or a moderator of this stream')
    }

    const perms = mod.permissions as ModeratorPermission[]
    if (!perms.includes('all') && !perms.includes(requiredPermission)) {
      throw new ForbiddenError(`Missing required permission: '${requiredPermission}'`)
    }
  }

  /**
   * Ban a user from chat in a session.
   * Optionally time-limited (duration_minutes = null → permanent until unban).
   */
  async banUser(
    sessionId: string,
    actingUserId: string,
    targetUserId: string,
    reason?: string,
    durationMinutes?: number,
  ): Promise<ChatBan> {
    await this.requireModeratorOrHost(sessionId, actingUserId, 'ban_user')

    // Prevent banning the host
    const { data: session } = await this.supabase
      .from('live_sessions')
      .select('user_id')
      .eq('id', sessionId)
      .single()

    if (session?.user_id === targetUserId) {
      throw new ForbiddenError('Cannot ban the stream host')
    }

    const expiresAt = durationMinutes
      ? new Date(Date.now() + durationMinutes * 60 * 1000).toISOString()
      : null

    const { data: ban, error } = await this.supabase
      .from('live_chat_bans')
      .upsert(
        {
          session_id: sessionId,
          banned_user_id: targetUserId,
          banned_by: actingUserId,
          reason: reason ?? null,
          expires_at: expiresAt,
          created_at: new Date().toISOString(),
        },
        { onConflict: 'session_id,banned_user_id' },
      )
      .select('*')
      .single()

    if (error || !ban) {
      throw new Error(`Failed to ban user: ${error?.message ?? 'unknown'}`)
    }

    return ban as ChatBan
  }

  /**
   * Unban a user from chat.
   */
  async unbanUser(
    sessionId: string,
    actingUserId: string,
    targetUserId: string,
  ): Promise<void> {
    await this.requireModeratorOrHost(sessionId, actingUserId, 'ban_user')

    const { error } = await this.supabase
      .from('live_chat_bans')
      .delete()
      .eq('session_id', sessionId)
      .eq('banned_user_id', targetUserId)

    if (error) throw new Error(`Failed to unban user: ${error.message}`)
  }

  /**
   * Delete a chat message.
   */
  async deleteMessage(
    sessionId: string,
    messageId: string,
    actingUserId: string,
  ): Promise<void> {
    await this.requireModeratorOrHost(sessionId, actingUserId, 'delete_message')

    // Verify message belongs to this session
    const { data: msg } = await this.supabase
      .from('live_chat_messages')
      .select('id')
      .eq('id', messageId)
      .eq('session_id', sessionId)
      .single()

    if (!msg) throw new NotFoundError('Chat message', messageId)

    const { error } = await this.supabase
      .from('live_chat_messages')
      .update({ deleted_at: new Date().toISOString(), deleted_by: actingUserId })
      .eq('id', messageId)

    if (error) throw new Error(`Failed to delete message: ${error.message}`)
  }

  /**
   * Pin a chat message. Only host can pin.
   * Unpins any previously pinned message in the session.
   */
  async pinMessage(
    sessionId: string,
    messageId: string,
    actingUserId: string,
  ): Promise<void> {
    // Only host can pin
    const { data: session } = await this.supabase
      .from('live_sessions')
      .select('user_id')
      .eq('id', sessionId)
      .single()

    if (session?.user_id !== actingUserId) {
      throw new ForbiddenError('Only the stream host can pin messages')
    }

    // Verify message exists in session
    const { data: msg } = await this.supabase
      .from('live_chat_messages')
      .select('id')
      .eq('id', messageId)
      .eq('session_id', sessionId)
      .single()

    if (!msg) throw new NotFoundError('Chat message', messageId)

    // Unpin previous (if any)
    await this.supabase
      .from('live_chat_messages')
      .update({ is_pinned: false })
      .eq('session_id', sessionId)
      .eq('is_pinned', true)

    // Pin new message
    const { error } = await this.supabase
      .from('live_chat_messages')
      .update({ is_pinned: true })
      .eq('id', messageId)

    if (error) throw new Error(`Failed to pin message: ${error.message}`)
  }

  /**
   * Assign a moderator for a session. Only host can assign.
   */
  async assignModerator(
    sessionId: string,
    hostUserId: string,
    targetUserId: string,
    permissions: ModeratorPermission[],
  ): Promise<ChatModerator> {
    // Verify host
    const { data: session } = await this.supabase
      .from('live_sessions')
      .select('user_id')
      .eq('id', sessionId)
      .single()

    if (!session) throw new NotFoundError('Stream session', sessionId)
    if (session.user_id !== hostUserId) throw new ForbiddenError('Only the host can assign moderators')

    const { data: mod, error } = await this.supabase
      .from('live_chat_moderators')
      .upsert(
        {
          session_id: sessionId,
          user_id: targetUserId,
          assigned_by: hostUserId,
          permissions,
          created_at: new Date().toISOString(),
        },
        { onConflict: 'session_id,user_id' },
      )
      .select('*')
      .single()

    if (error || !mod) throw new Error(`Failed to assign moderator: ${error?.message ?? 'unknown'}`)

    return mod as ChatModerator
  }

  /**
   * Check if a user is banned in a session.
   * Considers expiry — expired bans are treated as not banned.
   */
  async isBanned(sessionId: string, userId: string): Promise<boolean> {
    const { data: ban } = await this.supabase
      .from('live_chat_bans')
      .select('expires_at')
      .eq('session_id', sessionId)
      .eq('banned_user_id', userId)
      .maybeSingle()

    if (!ban) return false
    if (ban.expires_at === null) return true // Permanent ban
    return new Date(ban.expires_at as string) > new Date()
  }
}
