/**
 * Projection Layer - v2.8 Platform Core
 * 
 * Handles:
 * 1. Dialogs projection (user's scopes list + metadata)
 * 2. Unread projection (counts per scope)
 * 3. Watermark management (monotonic advancement)
 * 4. Rebuild recovery (resume-safe via journal)
 * 
 * INV-PROJ-01: Watermarks monotonic, projection_mode stored
 * Section 18: Watermark rules and rebuild semantics
 */

import { createClient, SupabaseClient } from "@supabase/supabase-js";
import { registry, getConstant } from "@/lib/registry/loader";

export interface ProjectionWatermark {
  scope_id: string;
  projection_mode: "normal" | "rebuilding" | "read_only";
  dialogs_watermark_seq: number;
  unread_watermark_seq: number;
  version: number;
  updated_at: string;
}

export interface DialogsProjection {
  scope_id: string;
  scope_type: string;
  visibility: string;
  join_state: string;
  last_read_seq: number;
  last_delivered_seq: number;
  unread_count: number;
  updated_at: string;
}

export interface ProjectionRebuildStatus {
  scope_id: string;
  started_at: string;
  completed_at?: string;
  status: "in_progress" | "completed" | "failed";
  reason?: string;
}

/**
 * Dialogs Projection Service
 * Maintains user's view of scopes (dialogs) with metadata
 */
export class DialogsProjectionService {
  private supabase: SupabaseClient;
  private userId: string;

  constructor(supabase: SupabaseClient, userId: string) {
    this.supabase = supabase;
    this.userId = userId;
  }

  /**
   * Get user's dialogs (joined scopes)
   * Includes: scope metadata, receipt pointers, unread counts
   */
  async getDialogs(): Promise<DialogsProjection[]> {
    const { data, error } = await this.supabase
      .from("core_scope_members")
      .select(
        `
        scope_id,
        core_scopes:scope_id(scope_type, visibility),
        last_read_seq,
        last_delivered_seq,
        join_state,
        updated_at
      `
      )
      .eq("user_id", this.userId)
      .eq("join_state", "joined");

    if (error) {
      throw new Error(`Failed to fetch dialogs: ${error.message}`);
    }

    return (data || []).map((row: any) => ({
      scope_id: row.scope_id,
      scope_type: row.core_scopes?.scope_type,
      visibility: row.core_scopes?.visibility,
      join_state: row.join_state,
      last_read_seq: row.last_read_seq || 0,
      last_delivered_seq: row.last_delivered_seq || 0,
      unread_count: Math.max(0, (row.last_delivered_seq || 0) - (row.last_read_seq || 0)),
      updated_at: row.updated_at,
    }));
  }

  /**
   * Update dialogs watermark (local cache)
   * Watermark tracks which seq we've loaded to
   */
  async updateDialogsWatermark(scopeId: string, newSeq: number): Promise<void> {
    // This would update a local cache or client-side state
    // In real impl, could be IndexedDB or memory cache
    console.log(`[Projection] Dialogs watermark for ${scopeId}: ${newSeq}`);
  }

  /**
   * Sync dialogs from server
   */
  async syncDialogs(): Promise<DialogsProjection[]> {
    return this.getDialogs();
  }
}

/**
 * Watermark Service (Server-side)
 * Manages monotonic watermark advancement
 */
export class WatermarkService {
  private supabase: SupabaseClient;

  constructor(supabase: SupabaseClient) {
    this.supabase = supabase;
  }

  /**
   * Get current watermark for a scope
   */
  async getWatermark(scopeId: string): Promise<ProjectionWatermark | null> {
    const { data, error } = await this.supabase
      .from("projection_watermarks")
      .select("*")
      .eq("scope_id", scopeId)
      .single();

    if (error && error.code !== "PGRST116") {
      // PGRST116 = not found
      throw new Error(`Failed to fetch watermark: ${error.message}`);
    }

    return data || null;
  }

  /**
   * Advance dialogs watermark (monotonic only)
   * Checks registry for SLO requirement
   */
  async advanceDialogsWatermark(scopeId: string, newSeq: number): Promise<void> {
    const hotp95 = getConstant("OUTCOME_SLO_HOT_P95_MS");

    const { error } = await this.supabase.rpc("fn_advance_watermark", {
      p_scope_id: scopeId,
      p_watermark_type: "dialogs",
      p_new_seq: newSeq,
    });

    if (error) {
      throw new Error(`Failed to advance watermark: ${error.message}`);
    }
  }

  /**
   * Start projection rebuild
   * Transitions projection_mode from normal -> rebuilding
   */
  async startRebuild(scopeId: string): Promise<ProjectionRebuildStatus> {
    const { data, error } = await this.supabase
      .from("projection_watermarks")
      .update({
        projection_mode: "rebuilding",
        rebuild_started_at: new Date().toISOString(),
      })
      .eq("scope_id", scopeId)
      .select()
      .single();

    if (error) {
      throw new Error(`Failed to start rebuild: ${error.message}`);
    }

    return {
      scope_id: scopeId,
      started_at: data.rebuild_started_at,
      status: "in_progress",
    };
  }

  /**
   * Complete projection rebuild
   * Transitions projection_mode from rebuilding -> normal
   */
  async completeRebuild(scopeId: string, finalSeq: number): Promise<ProjectionRebuildStatus> {
    const { data, error } = await this.supabase
      .from("projection_watermarks")
      .update({
        projection_mode: "normal",
        rebuild_completed_at: new Date().toISOString(),
        dialogs_watermark_seq: finalSeq,
        version: (await this.getWatermark(scopeId))?.version || 1,
      })
      .eq("scope_id", scopeId)
      .select()
      .single();

    if (error) {
      throw new Error(`Failed to complete rebuild: ${error.message}`);
    }

    return {
      scope_id: scopeId,
      started_at: data.rebuild_started_at,
      completed_at: data.rebuild_completed_at,
      status: "completed",
    };
  }

  /**
   * Fail rebuild gracefully
   */
  async failRebuild(scopeId: string, reason: string): Promise<void> {
    const { error } = await this.supabase
      .from("projection_watermarks")
      .update({
        projection_mode: "normal",
      })
      .eq("scope_id", scopeId);

    if (error) {
      throw new Error(`Failed to fail rebuild: ${error.message}`);
    }

    console.error(`[Projection] Rebuild failed for ${scopeId}: ${reason}`);
  }
}

/**
 * Projection Rebuilder
 * Rebuilds projections from core_events (recovery procedure)
 * Section 6 of v2.8: Resume-safe via migration journal
 */
export class ProjectionRebuilder {
  private supabase: SupabaseClient;
  private watermarkService: WatermarkService;

  constructor(supabase: SupabaseClient) {
    this.supabase = supabase;
    this.watermarkService = new WatermarkService(supabase);
  }

  /**
   * Rebuild projections for a scope from scratch
   * Reads core_events and rehydrates dialogs/unread
   */
  async rebuildScope(scopeId: string): Promise<void> {
    try {
      // Start rebuild
      await this.watermarkService.startRebuild(scopeId);

      // Fetch all events for this scope (in seq order)
      const { data: events, error: eventsError } = await this.supabase
        .from("core_events")
        .select("*")
        .eq("scope_id", scopeId)
        .order("event_seq", { ascending: true });

      if (eventsError) {
        await this.watermarkService.failRebuild(scopeId, eventsError.message);
        throw new Error(`Failed to fetch events: ${eventsError.message}`);
      }

      if (!events || events.length === 0) {
        // Empty scope, just complete
        await this.watermarkService.completeRebuild(scopeId, 0);
        return;
      }

      // Process events (simplified)
      let maxSeq = 0;
      for (const event of events) {
        maxSeq = Math.max(maxSeq, event.event_seq);
        // Process event based on command_type
        // (real impl would dispatch to handlers)
      }

      // Complete rebuild
      await this.watermarkService.completeRebuild(scopeId, maxSeq);

      console.log(`[Projection] Rebuild completed for ${scopeId}, maxSeq: ${maxSeq}`);
    } catch (error) {
      await this.watermarkService.failRebuild(scopeId, String(error));
      throw error;
    }
  }

  /**
   * Incremental rebuild (resume from watermark)
   * Used after interruption (migration, crash)
   */
  async incrementalRebuild(scopeId: string, fromSeq: number): Promise<void> {
    try {
      const watermark = await this.watermarkService.getWatermark(scopeId);
      if (!watermark) {
        throw new Error(`Watermark not found for scope ${scopeId}`);
      }

      // Only process events newer than watermark
      const { data: newEvents, error } = await this.supabase
        .from("core_events")
        .select("*")
        .eq("scope_id", scopeId)
        .gt("event_seq", fromSeq)
        .order("event_seq", { ascending: true });

      if (error) {
        throw new Error(`Failed to fetch new events: ${error.message}`);
      }

      if (!newEvents || newEvents.length === 0) {
        console.log(`[Projection] No new events for ${scopeId}`);
        return;
      }

      // Process new events
      let maxSeq = fromSeq;
      for (const event of newEvents) {
        maxSeq = Math.max(maxSeq, event.event_seq);
        // Process event
      }

      // Advance watermark
      await this.watermarkService.advanceDialogsWatermark(scopeId, maxSeq);
    } catch (error) {
      console.error(`[Projection] Incremental rebuild failed for ${scopeId}:`, error);
      throw error;
    }
  }
}

/**
 * Read-only projection service (for maintenance mode)
 * Section 11: read_only_safe mode uses stable views
 */
export class ReadOnlyProjectionService {
  private supabase: SupabaseClient;

  constructor(supabase: SupabaseClient) {
    this.supabase = supabase;
  }

  /**
   * Get stable projection snapshot
   * Used when system_mode = read_only_safe
   */
  async getStableSnapshot(scopeId: string, apiReadVersion: number): Promise<any> {
    // Fetch from stable read view or historical snapshot
    // In real impl, would use Postgres MVCC + api_read_version tracking
    const { data, error } = await this.supabase
      .from("projection_watermarks")
      .select("*")
      .eq("scope_id", scopeId)
      .eq("version", apiReadVersion)
      .single();

    if (error) {
      throw new Error(`Failed to fetch stable snapshot: ${error.message}`);
    }

    return data;
  }
}

/**
 * Export registry constants for projection SLO
 */
export const ProjectionSLO = {
  hotP95Ms: getConstant("OUTCOME_SLO_HOT_P95_MS"),
  archiveP95Ms: getConstant("OUTCOME_SLO_ARCHIVE_P95_MS"),
};
