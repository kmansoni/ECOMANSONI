/**
 * Trust Service
 * 
 * Handles trust profile management, risk event logging, and enforcement decisions.
 * Source of truth: Supabase trust_profiles + risk_events tables
 * 
 * Architecture:
 * 1. Log risk events (idempotent via request_id)
 * 2. Auto-compute trust score + tier from event log
 * 3. Make enforcement decisions based on tier
 * 4. Support manual profile updates
 */

import { createClient } from '@supabase/supabase-js';
import type {
  ActorType,
  RiskTier,
  EnforcementLevel,
  EventType,
  TrustProfile,
  RiskEvent,
  RiskEventResponse,
  EnforcementDecision,
  UpdateProfileRequest,
  TrustServiceConfig,
  TrustContext,
} from './types';

export class TrustService {
  private supabase: any;
  private config: TrustServiceConfig;

  constructor(config: TrustServiceConfig) {
    this.config = config;
    this.supabase = createClient(
      config.supabaseUrl,
      config.supabaseServiceRoleKey,
      {
        auth: { persistSession: false },
      }
    );
  }

  /**
   * Get or create a trust profile for an actor
   */
  async getProfile(
    actorType: ActorType,
    actorId: string
  ): Promise<TrustProfile | null> {
    try {
      const { data, error } = await this.supabase
        .from('trust_profiles')
        .select('*')
        .eq('actor_type', actorType)
        .eq('actor_id', actorId)
        .single();

      if (error) {
        if (error.code === 'PGRST116') {
          // Not found
          return null;
        }
        throw error;
      }

      return data;
    } catch (err) {
      console.error('[TrustService] Error fetching profile:', err);
      throw err;
    }
  }

  /**
   * Log a risk event (idempotent via request_id)
   * 
   * If request_id matches existing event, returns existing event.
   * Otherwise, inserts new event and triggers auto-compute of profile.
   */
  async logRiskEvent(
    actorType: ActorType,
    actorId: string,
    eventType: EventType,
    weight: number,
    meta?: Record<string, any>,
    requestId?: string,
    source: 'server' | 'client' | 'moderation' | 'system' = 'server'
  ): Promise<RiskEventResponse> {
    try {
      const { data, error } = await this.supabase
        .from('risk_events')
        .insert({
          actor_type: actorType,
          actor_id: actorId,
          event_type: eventType,
          weight,
          meta: meta || {},
          request_id: requestId,
          created_at: new Date().toISOString(),
          source,
        })
        .select('*')
        .single();

      if (error) {
        // If UNIQUE constraint violation on request_id, fetch existing
        if (error.code === '23505' && requestId) {
          const { data: existingEvent } = await this.supabase
            .from('risk_events')
            .select('*')
            .eq('request_id', requestId)
            .single();

          if (existingEvent) {
            // Fetch updated profile
            const profile = await this.getProfile(actorType, actorId);
            return {
              event_id: existingEvent.event_id,
              actor_type: existingEvent.actor_type,
              actor_id: existingEvent.actor_id,
              event_type: existingEvent.event_type,
              weight: existingEvent.weight,
              request_id: existingEvent.request_id,
              created_at: existingEvent.created_at,
              profile_updated: false, // Already was updated
              new_tier: profile?.risk_tier,
              new_enforcement_level: profile?.enforcement_level,
            };
          }
        }
        throw error;
      }

      // Fetch updated profile (trigger should have re-computed it)
      const profile = await this.getProfile(actorType, actorId);

      return {
        event_id: data.event_id,
        actor_type: data.actor_type,
        actor_id: data.actor_id,
        event_type: data.event_type,
        weight: data.weight,
        request_id: data.request_id,
        created_at: data.created_at,
        profile_updated: true,
        new_tier: profile?.risk_tier,
        new_enforcement_level: profile?.enforcement_level,
      };
    } catch (err) {
      console.error('[TrustService] Error logging risk event:', err);
      throw err;
    }
  }

  /**
   * Manually update trust profile
   * Useful for appeals, overrides, or administrative actions
   */
  async updateProfile(req: UpdateProfileRequest): Promise<TrustProfile> {
    try {
      const updates: any = {
        updated_at: new Date().toISOString(),
      };

      if (req.trust_score !== undefined) updates.trust_score = req.trust_score;
      if (req.risk_tier !== undefined) updates.risk_tier = req.risk_tier;
      if (req.enforcement_level !== undefined)
        updates.enforcement_level = req.enforcement_level;
      if (req.signals) updates.signals = req.signals;

      const { data, error } = await this.supabase
        .from('trust_profiles')
        .update(updates)
        .eq('actor_type', req.actor_type)
        .eq('actor_id', req.actor_id)
        .select('*')
        .single();

      if (error) {
        throw error;
      }

      if (this.config.enableMonitoring) {
        await this.logMonitoringEvent({
          action: 'profile_updated',
          actor_type: req.actor_type,
          actor_id: req.actor_id,
          new_tier: req.risk_tier,
          new_enforcement_level: req.enforcement_level,
          reason: req.reason,
        });
      }

      return data;
    } catch (err) {
      console.error('[TrustService] Error updating profile:', err);
      throw err;
    }
  }

  /**
   * Make an enforcement decision for an actor
   * Determines if action is allowed based on tier and enforcement level
   */
  async makeEnforcementDecision(
    actorType: ActorType,
    actorId: string,
    context?: TrustContext
  ): Promise<EnforcementDecision> {
    try {
      let profile = await this.getProfile(actorType, actorId);

      // If no profile, create default one
      if (!profile) {
        const defaultTier = this.config.defaultTier || 'B';
        profile = {
          actor_type: actorType,
          actor_id: actorId,
          trust_score: 50,
          risk_tier: defaultTier,
          enforcement_level: 'E0',
          signals: {},
          version: 1,
        };

        // Attempt to insert (may race with other request)
        try {
          await this.supabase.from('trust_profiles').insert([profile]);
        } catch {
          // Race condition, refetch
          profile = (await this.getProfile(actorType, actorId)) || profile;
        }
      }

      // Determine if enforced based on tier/enforcement level
      const allowed =
        profile.risk_tier !== 'E' &&
        profile.enforcement_level !== 'E5' &&
        profile.enforcement_level !== 'E4';

      const reason = (() => {
        if (profile.risk_tier === 'E') return 'Account blocked (tier E)';
        if (profile.enforcement_level === 'E5') return 'Account fully restricted';
        if (profile.enforcement_level === 'E4')
          return 'Account restricted by policy';
        return undefined;
      })();

      if (this.config.enableMonitoring) {
        await this.logMonitoringEvent({
          action: 'enforcement_check',
          actor_type: actorType,
          actor_id: actorId,
          tier: profile.risk_tier,
          enforcement_level: profile.enforcement_level,
          allowed,
          context,
        });
      }

      return {
        allowed,
        tier: profile.risk_tier,
        enforced_at: new Date().toISOString(),
        reason,
      };
    } catch (err) {
      console.error('[TrustService] Error making enforcement decision:', err);
      // Fail open on error
      return {
        allowed: true,
        tier: 'B',
        enforced_at: new Date().toISOString(),
        reason: 'Error checking profile, allowing access',
      };
    }
  }

  /**
   * Get trust profiles for multiple actors
   * Useful for reporting and analytics
   */
  async getProfiles(
    actorType: ActorType,
    actorIds: string[]
  ): Promise<TrustProfile[]> {
    try {
      const { data, error } = await this.supabase
        .from('trust_profiles')
        .select('*')
        .eq('actor_type', actorType)
        .in('actor_id', actorIds);

      if (error) {
        throw error;
      }

      return data || [];
    } catch (err) {
      console.error('[TrustService] Error fetching profiles:', err);
      return [];
    }
  }

  /**
   * Get recent risk events for an actor
   */
  async getRecentRiskEvents(
    actorType: ActorType,
    actorId: string,
    limDays: number = 30
  ): Promise<RiskEvent[]> {
    try {
      const sincDate = new Date();
      sincDate.setDate(sincDate.getDate() - limDays);

      const { data, error } = await this.supabase
        .from('risk_events')
        .select('*')
        .eq('actor_type', actorType)
        .eq('actor_id', actorId)
        .gte('created_at', sincDate.toISOString())
        .order('created_at', { ascending: false });

      if (error) {
        throw error;
      }

      return data || [];
    } catch (err) {
      console.error('[TrustService] Error fetching risk events:', err);
      return [];
    }
  }

  /**
   * Log internal monitoring event (optional)
   */
  private async logMonitoringEvent(event: Record<string, any>) {
    if (!this.config.enableMonitoring) return;

    try {
      const tableName = this.config.monitoringTableName || 'trust_monitoring_log';
      await this.supabase.from(tableName).insert({
        ...event,
        logged_at: new Date().toISOString(),
      });
    } catch (err) {
      console.error('[TrustService] Error logging monitoring event:', err);
      // Don't fail the operation for monitoring errors
    }
  }
}

/**
 * Singleton instance
 * Lazily initialized on first use
 */
let trustServiceInstance: TrustService | null = null;

export function getTrustService(): TrustService {
  if (!trustServiceInstance) {
    const config = {
      supabaseUrl: process.env.VITE_SUPABASE_URL || '',
      supabaseServiceRoleKey: process.env.SUPABASE_SERVICE_ROLE_KEY || '',
      enableMonitoring: process.env.TRUST_SERVICE_MONITORING === 'true',
      defaultTier: 'B' as RiskTier,
    };

    if (!config.supabaseUrl || !config.supabaseServiceRoleKey) {
      throw new Error('Missing Supabase credentials for TrustService');
    }

    trustServiceInstance = new TrustService(config);
  }

  return trustServiceInstance;
}
