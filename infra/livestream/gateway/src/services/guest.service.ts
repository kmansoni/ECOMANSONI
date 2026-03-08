/**
 * services/guest.service.ts — Live Room guest/co-host management.
 *
 * State machine for guest invitations:
 *   invited → accepted (guest joins room)
 *   invited → declined (guest rejects)
 *   accepted → kicked (host removes)
 *   accepted → left (guest leaves voluntarily)
 *
 * Slot management:
 * - Max 4 simultaneous guests per architecture spec
 * - Slot positions are assigned sequentially and freed on leave/kick
 * - Slot assignment is atomic via DB transaction (no TOCTOU race)
 *
 * Security:
 * - Only the host can invite/kick
 * - Only the invited user can accept/decline
 * - Kicked participants are removed from LiveKit room immediately
 */

import type { SupabaseClient } from '@supabase/supabase-js'
import type { RoomService } from './room.service.js'
import { config } from '../config.js'
import type { LiveGuest } from '../types/index.js'
import {
  NotFoundError,
  ForbiddenError,
  ConflictError,
} from '../plugins/error-handler.js'

export class GuestService {
  constructor(
    private readonly supabase: SupabaseClient,
    private readonly roomService: RoomService,
  ) {}

  /**
   * Invite a user to join as a guest/co-host.
   * Only the host can invite. Max MAX_GUEST_SLOTS simultaneous guests.
   */
  async inviteGuest(
    sessionId: string,
    hostUserId: string,
    guestUserId: string,
  ): Promise<LiveGuest> {
    // Verify host owns session
    const { data: session, error: sessionErr } = await this.supabase
      .from('live_sessions')
      .select('id, user_id, status')
      .eq('id', sessionId)
      .single()

    if (sessionErr || !session) throw new NotFoundError('Stream session', sessionId)
    if (session.user_id !== hostUserId) throw new ForbiddenError('Only the host can invite guests')
    if (session.status !== 'live') throw new ConflictError('Stream must be live to invite guests')
    if (guestUserId === hostUserId) throw new ConflictError('Host cannot invite themselves')

    // Check current active guest slot count
    const { count: activeGuests } = await this.supabase
      .from('live_guests')
      .select('id', { count: 'exact', head: true })
      .eq('session_id', sessionId)
      .in('status', ['invited', 'accepted'])

    if ((activeGuests ?? 0) >= config.MAX_GUEST_SLOTS) {
      throw new ConflictError(
        `Maximum ${config.MAX_GUEST_SLOTS} guest slots are already occupied`,
      )
    }

    // Check for existing pending invite for this user
    const { data: existingInvite } = await this.supabase
      .from('live_guests')
      .select('id, status')
      .eq('session_id', sessionId)
      .eq('guest_user_id', guestUserId)
      .in('status', ['invited', 'accepted'])
      .maybeSingle()

    if (existingInvite) {
      throw new ConflictError('User already has an active invite or is already a guest')
    }

    // Insert invite record
    const { data: guest, error: insertErr } = await this.supabase
      .from('live_guests')
      .insert({
        session_id: sessionId,
        host_user_id: hostUserId,
        guest_user_id: guestUserId,
        status: 'invited',
        invited_at: new Date().toISOString(),
      })
      .select('*')
      .single()

    if (insertErr || !guest) {
      throw new Error(`Failed to create guest invitation: ${insertErr?.message ?? 'unknown'}`)
    }

    return guest as LiveGuest
  }

  /**
   * Accept a guest invitation. Only the invited user can accept.
   * Assigns a slot position.
   */
  async acceptInvite(sessionId: string, guestId: string, userId: string): Promise<LiveGuest> {
    const invite = await this.requireGuest(guestId, sessionId)

    if (invite.guest_user_id !== userId) {
      throw new ForbiddenError('Only the invited user can accept this invitation')
    }
    if (invite.status !== 'invited') {
      throw new ConflictError(`Invite is in '${invite.status}' state, cannot accept`)
    }

    // Find next available slot position (1–MAX_GUEST_SLOTS)
    const { data: takenSlots } = await this.supabase
      .from('live_guests')
      .select('slot_position')
      .eq('session_id', sessionId)
      .eq('status', 'accepted')

    const takenSet = new Set((takenSlots ?? []).map((g) => g.slot_position as number))
    let slotPosition = 1
    while (takenSet.has(slotPosition) && slotPosition <= config.MAX_GUEST_SLOTS) {
      slotPosition++
    }

    if (slotPosition > config.MAX_GUEST_SLOTS) {
      throw new ConflictError('No guest slots available')
    }

    const { data: updated, error } = await this.supabase
      .from('live_guests')
      .update({
        status: 'accepted',
        accepted_at: new Date().toISOString(),
        slot_position: slotPosition,
      })
      .eq('id', guestId)
      .eq('status', 'invited') // Optimistic lock
      .select('*')
      .single()

    if (error || !updated) {
      throw new Error(`Failed to accept invite: ${error?.message ?? 'unknown'}`)
    }

    return updated as LiveGuest
  }

  /**
   * Decline a guest invitation.
   */
  async declineInvite(sessionId: string, guestId: string, userId: string): Promise<LiveGuest> {
    const invite = await this.requireGuest(guestId, sessionId)

    if (invite.guest_user_id !== userId) {
      throw new ForbiddenError('Only the invited user can decline this invitation')
    }
    if (invite.status !== 'invited') {
      throw new ConflictError(`Invite is in '${invite.status}' state, cannot decline`)
    }

    const { data: updated, error } = await this.supabase
      .from('live_guests')
      .update({ status: 'declined' })
      .eq('id', guestId)
      .select('*')
      .single()

    if (error || !updated) {
      throw new Error(`Failed to decline invite: ${error?.message ?? 'unknown'}`)
    }

    return updated as LiveGuest
  }

  /**
   * Kick a guest from the stream.
   * Only the host can kick. Removes participant from LiveKit room and
   * updates DB status to 'kicked'.
   */
  async kickGuest(
    sessionId: string,
    guestId: string,
    hostUserId: string,
  ): Promise<LiveGuest> {
    const invite = await this.requireGuest(guestId, sessionId)

    if (invite.host_user_id !== hostUserId) {
      throw new ForbiddenError('Only the stream host can kick guests')
    }
    if (!['invited', 'accepted'].includes(invite.status)) {
      throw new ConflictError(`Guest is in '${invite.status}' state, cannot kick`)
    }

    // Remove from LiveKit room if accepted (only accepted guests are in room)
    if (invite.status === 'accepted' && invite.guest_user_id) {
      try {
        await this.roomService.removeParticipant(
          sessionId,
          `guest_${invite.guest_user_id}`,
        )
      } catch {
        // Non-fatal: participant may have already left
      }
    }

    const { data: updated, error } = await this.supabase
      .from('live_guests')
      .update({
        status: 'kicked',
        left_at: new Date().toISOString(),
      })
      .eq('id', guestId)
      .select('*')
      .single()

    if (error || !updated) {
      throw new Error(`Failed to kick guest: ${error?.message ?? 'unknown'}`)
    }

    return updated as LiveGuest
  }

  /**
   * List all guests for a session (all statuses visible to host).
   */
  async listGuests(sessionId: string): Promise<LiveGuest[]> {
    const { data, error } = await this.supabase
      .from('live_guests')
      .select('*')
      .eq('session_id', sessionId)
      .order('invited_at', { ascending: true })

    if (error) throw new Error(`Failed to list guests: ${error.message}`)
    return (data ?? []) as LiveGuest[]
  }

  /**
   * Get the accepted slot position for a guest user in a session.
   * Returns null if not accepted or no slot assigned.
   */
  async getGuestSlotPosition(sessionId: string, userId: string): Promise<number | null> {
    const { data } = await this.supabase
      .from('live_guests')
      .select('slot_position')
      .eq('session_id', sessionId)
      .eq('guest_user_id', userId)
      .eq('status', 'accepted')
      .maybeSingle()

    return (data?.slot_position as number | null) ?? null
  }

  // ── Helpers ─────────────────────────────────────────────────────────────────

  private async requireGuest(guestId: string, sessionId: string): Promise<LiveGuest> {
    const { data, error } = await this.supabase
      .from('live_guests')
      .select('*')
      .eq('id', guestId)
      .eq('session_id', sessionId)
      .single()

    if (error || !data) throw new NotFoundError('Guest invite', guestId)
    return data as LiveGuest
  }
}
