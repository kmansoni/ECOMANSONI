export type Json =
  | string
  | number
  | boolean
  | null
  | { [key: string]: Json | undefined }
  | Json[]

export type Database = {
  // Allows to automatically instantiate createClient with right options
  // instead of createClient<Database, { PostgrestVersion: 'XX' }>(URL, KEY)
  __InternalSupabase: {
    PostgrestVersion: "14.1"
  }
  public: {
    Tables: {
      ab_assignments: {
        Row: {
          assigned_at: string | null
          experiment_id: string
          user_id: string
          variant: string
        }
        Insert: {
          assigned_at?: string | null
          experiment_id: string
          user_id: string
          variant: string
        }
        Update: {
          assigned_at?: string | null
          experiment_id?: string
          user_id?: string
          variant?: string
        }
        Relationships: [
          {
            foreignKeyName: "ab_assignments_experiment_id_fkey"
            columns: ["experiment_id"]
            isOneToOne: false
            referencedRelation: "ab_experiments"
            referencedColumns: ["id"]
          },
        ]
      }
      ab_experiments: {
        Row: {
          created_at: string | null
          description: string | null
          id: string
          is_active: boolean | null
          name: string
          variants: Json
        }
        Insert: {
          created_at?: string | null
          description?: string | null
          id?: string
          is_active?: boolean | null
          name: string
          variants?: Json
        }
        Update: {
          created_at?: string | null
          description?: string | null
          id?: string
          is_active?: boolean | null
          name?: string
          variants?: Json
        }
        Relationships: []
      }
      achievement_badges: {
        Row: {
          category: string
          created_at: string | null
          criteria: Json
          description: string
          icon_emoji: string
          id: string
          name: string
          slug: string
        }
        Insert: {
          category: string
          created_at?: string | null
          criteria: Json
          description: string
          icon_emoji: string
          id?: string
          name: string
          slug: string
        }
        Update: {
          category?: string
          created_at?: string | null
          criteria?: Json
          description?: string
          icon_emoji?: string
          id?: string
          name?: string
          slug?: string
        }
        Relationships: []
      }
      ad_campaigns: {
        Row: {
          advertiser_id: string
          budget_cents: number
          created_at: string
          daily_budget_cents: number | null
          end_date: string | null
          id: string
          name: string
          objective: string
          spent_cents: number
          start_date: string
          status: string
          targeting: Json
          updated_at: string
        }
        Insert: {
          advertiser_id: string
          budget_cents: number
          created_at?: string
          daily_budget_cents?: number | null
          end_date?: string | null
          id?: string
          name: string
          objective: string
          spent_cents?: number
          start_date: string
          status?: string
          targeting?: Json
          updated_at?: string
        }
        Update: {
          advertiser_id?: string
          budget_cents?: number
          created_at?: string
          daily_budget_cents?: number | null
          end_date?: string | null
          id?: string
          name?: string
          objective?: string
          spent_cents?: number
          start_date?: string
          status?: string
          targeting?: Json
          updated_at?: string
        }
        Relationships: []
      }
      ad_creatives: {
        Row: {
          call_to_action: string
          campaign_id: string
          created_at: string
          description: string | null
          destination_url: string
          headline: string
          id: string
          media_url: string
          type: string
        }
        Insert: {
          call_to_action: string
          campaign_id: string
          created_at?: string
          description?: string | null
          destination_url: string
          headline: string
          id?: string
          media_url: string
          type: string
        }
        Update: {
          call_to_action?: string
          campaign_id?: string
          created_at?: string
          description?: string | null
          destination_url?: string
          headline?: string
          id?: string
          media_url?: string
          type?: string
        }
        Relationships: [
          {
            foreignKeyName: "ad_creatives_campaign_id_fkey"
            columns: ["campaign_id"]
            isOneToOne: false
            referencedRelation: "ad_campaigns"
            referencedColumns: ["id"]
          },
        ]
      }
      ad_impressions: {
        Row: {
          action: string
          created_at: string
          creative_id: string
          id: string
          viewer_id: string | null
        }
        Insert: {
          action: string
          created_at?: string
          creative_id: string
          id?: string
          viewer_id?: string | null
        }
        Update: {
          action?: string
          created_at?: string
          creative_id?: string
          id?: string
          viewer_id?: string | null
        }
        Relationships: [
          {
            foreignKeyName: "ad_impressions_creative_id_fkey"
            columns: ["creative_id"]
            isOneToOne: false
            referencedRelation: "ad_creatives"
            referencedColumns: ["id"]
          },
        ]
      }
      add_yours_chains: {
        Row: {
          created_at: string | null
          creator_id: string
          id: string
          participants_count: number | null
          prompt: string
        }
        Insert: {
          created_at?: string | null
          creator_id: string
          id?: string
          participants_count?: number | null
          prompt: string
        }
        Update: {
          created_at?: string | null
          creator_id?: string
          id?: string
          participants_count?: number | null
          prompt?: string
        }
        Relationships: []
      }
      add_yours_entries: {
        Row: {
          chain_id: string
          created_at: string | null
          story_id: string
          user_id: string
        }
        Insert: {
          chain_id: string
          created_at?: string | null
          story_id: string
          user_id: string
        }
        Update: {
          chain_id?: string
          created_at?: string | null
          story_id?: string
          user_id?: string
        }
        Relationships: [
          {
            foreignKeyName: "add_yours_entries_chain_id_fkey"
            columns: ["chain_id"]
            isOneToOne: false
            referencedRelation: "add_yours_chains"
            referencedColumns: ["id"]
          },
        ]
      }
      admin_action_log: {
        Row: {
          action_details: Json
          action_id: string
          action_type: string
          admin_user_id: string
          created_at: string
          reason_code: string
          reason_text: string | null
          target_scope_id: string | null
          target_user_id: string | null
        }
        Insert: {
          action_details?: Json
          action_id?: string
          action_type: string
          admin_user_id: string
          created_at?: string
          reason_code: string
          reason_text?: string | null
          target_scope_id?: string | null
          target_user_id?: string | null
        }
        Update: {
          action_details?: Json
          action_id?: string
          action_type?: string
          admin_user_id?: string
          created_at?: string
          reason_code?: string
          reason_text?: string | null
          target_scope_id?: string | null
          target_user_id?: string | null
        }
        Relationships: [
          {
            foreignKeyName: "admin_action_log_target_scope_id_fkey"
            columns: ["target_scope_id"]
            isOneToOne: false
            referencedRelation: "core_scopes"
            referencedColumns: ["scope_id"]
          },
        ]
      }
      admin_audit_events: {
        Row: {
          action: string
          actor_id: string | null
          actor_role: string | null
          actor_session_id: string | null
          actor_type: string
          after_state: Json | null
          approval_id: string | null
          before_state: Json | null
          created_at: string
          error_code: string | null
          error_message: string | null
          hash_anchor_id: string | null
          hash_prev: string | null
          hash_self: string
          id: string
          ip_address: unknown
          metadata: Json | null
          reason_code: string | null
          reason_description: string | null
          request_id: string
          resource_id: string | null
          resource_type: string
          sequence_number: number
          severity: string
          status: string
          ticket_id: string | null
          user_agent: string | null
        }
        Insert: {
          action: string
          actor_id?: string | null
          actor_role?: string | null
          actor_session_id?: string | null
          actor_type: string
          after_state?: Json | null
          approval_id?: string | null
          before_state?: Json | null
          created_at?: string
          error_code?: string | null
          error_message?: string | null
          hash_anchor_id?: string | null
          hash_prev?: string | null
          hash_self: string
          id?: string
          ip_address?: unknown
          metadata?: Json | null
          reason_code?: string | null
          reason_description?: string | null
          request_id: string
          resource_id?: string | null
          resource_type: string
          sequence_number?: number
          severity: string
          status: string
          ticket_id?: string | null
          user_agent?: string | null
        }
        Update: {
          action?: string
          actor_id?: string | null
          actor_role?: string | null
          actor_session_id?: string | null
          actor_type?: string
          after_state?: Json | null
          approval_id?: string | null
          before_state?: Json | null
          created_at?: string
          error_code?: string | null
          error_message?: string | null
          hash_anchor_id?: string | null
          hash_prev?: string | null
          hash_self?: string
          id?: string
          ip_address?: unknown
          metadata?: Json | null
          reason_code?: string | null
          reason_description?: string | null
          request_id?: string
          resource_id?: string | null
          resource_type?: string
          sequence_number?: number
          severity?: string
          status?: string
          ticket_id?: string | null
          user_agent?: string | null
        }
        Relationships: []
      }
      admin_kill_switches: {
        Row: {
          enabled: boolean
          key: string
          reason: string | null
          updated_at: string
          updated_by: string | null
        }
        Insert: {
          enabled?: boolean
          key: string
          reason?: string | null
          updated_at?: string
          updated_by?: string | null
        }
        Update: {
          enabled?: boolean
          key?: string
          reason?: string | null
          updated_at?: string
          updated_by?: string | null
        }
        Relationships: [
          {
            foreignKeyName: "admin_kill_switches_updated_by_fkey"
            columns: ["updated_by"]
            isOneToOne: false
            referencedRelation: "admin_users"
            referencedColumns: ["id"]
          },
        ]
      }
      admin_permissions: {
        Row: {
          action: string
          created_at: string
          description: string | null
          id: string
          is_system: boolean | null
          resource: string
          risk_level: string
          scope: string
        }
        Insert: {
          action: string
          created_at?: string
          description?: string | null
          id?: string
          is_system?: boolean | null
          resource: string
          risk_level: string
          scope: string
        }
        Update: {
          action?: string
          created_at?: string
          description?: string | null
          id?: string
          is_system?: boolean | null
          resource?: string
          risk_level?: string
          scope?: string
        }
        Relationships: []
      }
      admin_policies: {
        Row: {
          action: string
          audit_severity: string
          conditions: Json
          created_at: string
          description: string | null
          enabled: boolean | null
          id: string
          max_batch_size: number | null
          name: string
          post_action_review: boolean | null
          rate_limit: string | null
          required_approvers: number | null
          required_permissions: string[]
          required_roles: string[] | null
          requires_approval: boolean | null
          requires_reason: boolean | null
          requires_ticket: boolean | null
          resource: string
          updated_at: string
          updated_by: string | null
        }
        Insert: {
          action: string
          audit_severity: string
          conditions: Json
          created_at?: string
          description?: string | null
          enabled?: boolean | null
          id?: string
          max_batch_size?: number | null
          name: string
          post_action_review?: boolean | null
          rate_limit?: string | null
          required_approvers?: number | null
          required_permissions: string[]
          required_roles?: string[] | null
          requires_approval?: boolean | null
          requires_reason?: boolean | null
          requires_ticket?: boolean | null
          resource: string
          updated_at?: string
          updated_by?: string | null
        }
        Update: {
          action?: string
          audit_severity?: string
          conditions?: Json
          created_at?: string
          description?: string | null
          enabled?: boolean | null
          id?: string
          max_batch_size?: number | null
          name?: string
          post_action_review?: boolean | null
          rate_limit?: string | null
          required_approvers?: number | null
          required_permissions?: string[]
          required_roles?: string[] | null
          requires_approval?: boolean | null
          requires_reason?: boolean | null
          requires_ticket?: boolean | null
          resource?: string
          updated_at?: string
          updated_by?: string | null
        }
        Relationships: [
          {
            foreignKeyName: "admin_policies_updated_by_fkey"
            columns: ["updated_by"]
            isOneToOne: false
            referencedRelation: "admin_users"
            referencedColumns: ["id"]
          },
        ]
      }
      admin_role_permissions: {
        Row: {
          granted_at: string
          granted_by: string | null
          id: string
          permission_id: string
          role_id: string
        }
        Insert: {
          granted_at?: string
          granted_by?: string | null
          id?: string
          permission_id: string
          role_id: string
        }
        Update: {
          granted_at?: string
          granted_by?: string | null
          id?: string
          permission_id?: string
          role_id?: string
        }
        Relationships: [
          {
            foreignKeyName: "admin_role_permissions_granted_by_fkey"
            columns: ["granted_by"]
            isOneToOne: false
            referencedRelation: "admin_users"
            referencedColumns: ["id"]
          },
          {
            foreignKeyName: "admin_role_permissions_permission_id_fkey"
            columns: ["permission_id"]
            isOneToOne: false
            referencedRelation: "admin_permissions"
            referencedColumns: ["id"]
          },
          {
            foreignKeyName: "admin_role_permissions_role_id_fkey"
            columns: ["role_id"]
            isOneToOne: false
            referencedRelation: "admin_roles"
            referencedColumns: ["id"]
          },
        ]
      }
      admin_roles: {
        Row: {
          auto_expire_hours: number | null
          category: string
          created_at: string
          description: string | null
          display_name: string
          id: string
          is_system: boolean | null
          max_holders: number | null
          name: string
          parent_role_id: string | null
          requires_approval: boolean | null
        }
        Insert: {
          auto_expire_hours?: number | null
          category: string
          created_at?: string
          description?: string | null
          display_name: string
          id?: string
          is_system?: boolean | null
          max_holders?: number | null
          name: string
          parent_role_id?: string | null
          requires_approval?: boolean | null
        }
        Update: {
          auto_expire_hours?: number | null
          category?: string
          created_at?: string
          description?: string | null
          display_name?: string
          id?: string
          is_system?: boolean | null
          max_holders?: number | null
          name?: string
          parent_role_id?: string | null
          requires_approval?: boolean | null
        }
        Relationships: [
          {
            foreignKeyName: "admin_roles_parent_role_id_fkey"
            columns: ["parent_role_id"]
            isOneToOne: false
            referencedRelation: "admin_roles"
            referencedColumns: ["id"]
          },
        ]
      }
      admin_sessions: {
        Row: {
          access_token_jti: string
          admin_user_id: string
          created_at: string
          device_fingerprint: string | null
          device_id: string | null
          expires_at: string
          geo_city: string | null
          geo_country: string | null
          id: string
          ip_address: unknown
          last_activity_at: string
          refresh_token_jti: string | null
          revoke_reason: string | null
          revoked: boolean | null
          revoked_at: string | null
          revoked_by: string | null
          user_agent: string | null
        }
        Insert: {
          access_token_jti: string
          admin_user_id: string
          created_at?: string
          device_fingerprint?: string | null
          device_id?: string | null
          expires_at: string
          geo_city?: string | null
          geo_country?: string | null
          id?: string
          ip_address: unknown
          last_activity_at?: string
          refresh_token_jti?: string | null
          revoke_reason?: string | null
          revoked?: boolean | null
          revoked_at?: string | null
          revoked_by?: string | null
          user_agent?: string | null
        }
        Update: {
          access_token_jti?: string
          admin_user_id?: string
          created_at?: string
          device_fingerprint?: string | null
          device_id?: string | null
          expires_at?: string
          geo_city?: string | null
          geo_country?: string | null
          id?: string
          ip_address?: unknown
          last_activity_at?: string
          refresh_token_jti?: string | null
          revoke_reason?: string | null
          revoked?: boolean | null
          revoked_at?: string | null
          revoked_by?: string | null
          user_agent?: string | null
        }
        Relationships: [
          {
            foreignKeyName: "admin_sessions_admin_user_id_fkey"
            columns: ["admin_user_id"]
            isOneToOne: false
            referencedRelation: "admin_users"
            referencedColumns: ["id"]
          },
          {
            foreignKeyName: "admin_sessions_revoked_by_fkey"
            columns: ["revoked_by"]
            isOneToOne: false
            referencedRelation: "admin_users"
            referencedColumns: ["id"]
          },
        ]
      }
      admin_staff_profiles: {
        Row: {
          admin_user_id: string
          can_assign_roles: boolean
          can_manage_verifications: boolean
          can_review_reports: boolean
          created_at: string
          messenger_panel_access: boolean
          notes: string | null
          staff_kind: string
          timezone: string | null
          updated_at: string
          updated_by: string | null
        }
        Insert: {
          admin_user_id: string
          can_assign_roles?: boolean
          can_manage_verifications?: boolean
          can_review_reports?: boolean
          created_at?: string
          messenger_panel_access?: boolean
          notes?: string | null
          staff_kind?: string
          timezone?: string | null
          updated_at?: string
          updated_by?: string | null
        }
        Update: {
          admin_user_id?: string
          can_assign_roles?: boolean
          can_manage_verifications?: boolean
          can_review_reports?: boolean
          created_at?: string
          messenger_panel_access?: boolean
          notes?: string | null
          staff_kind?: string
          timezone?: string | null
          updated_at?: string
          updated_by?: string | null
        }
        Relationships: [
          {
            foreignKeyName: "admin_staff_profiles_admin_user_id_fkey"
            columns: ["admin_user_id"]
            isOneToOne: true
            referencedRelation: "admin_users"
            referencedColumns: ["id"]
          },
          {
            foreignKeyName: "admin_staff_profiles_updated_by_fkey"
            columns: ["updated_by"]
            isOneToOne: false
            referencedRelation: "admin_users"
            referencedColumns: ["id"]
          },
        ]
      }
      admin_user_roles: {
        Row: {
          admin_user_id: string
          allowed_regions: string[] | null
          allowed_tenants: string[] | null
          approval_id: string | null
          assigned_at: string
          assigned_by: string | null
          assignment_reason: string | null
          expires_at: string | null
          id: string
          jit_request_id: string | null
          role_id: string
          ticket_id: string | null
        }
        Insert: {
          admin_user_id: string
          allowed_regions?: string[] | null
          allowed_tenants?: string[] | null
          approval_id?: string | null
          assigned_at?: string
          assigned_by?: string | null
          assignment_reason?: string | null
          expires_at?: string | null
          id?: string
          jit_request_id?: string | null
          role_id: string
          ticket_id?: string | null
        }
        Update: {
          admin_user_id?: string
          allowed_regions?: string[] | null
          allowed_tenants?: string[] | null
          approval_id?: string | null
          assigned_at?: string
          assigned_by?: string | null
          assignment_reason?: string | null
          expires_at?: string | null
          id?: string
          jit_request_id?: string | null
          role_id?: string
          ticket_id?: string | null
        }
        Relationships: [
          {
            foreignKeyName: "admin_user_roles_admin_user_id_fkey"
            columns: ["admin_user_id"]
            isOneToOne: false
            referencedRelation: "admin_users"
            referencedColumns: ["id"]
          },
          {
            foreignKeyName: "admin_user_roles_assigned_by_fkey"
            columns: ["assigned_by"]
            isOneToOne: false
            referencedRelation: "admin_users"
            referencedColumns: ["id"]
          },
          {
            foreignKeyName: "admin_user_roles_jit_request_id_fkey"
            columns: ["jit_request_id"]
            isOneToOne: false
            referencedRelation: "owner_escalation_requests"
            referencedColumns: ["id"]
          },
          {
            foreignKeyName: "admin_user_roles_role_id_fkey"
            columns: ["role_id"]
            isOneToOne: false
            referencedRelation: "admin_roles"
            referencedColumns: ["id"]
          },
        ]
      }
      admin_users: {
        Row: {
          allowed_countries: string[] | null
          allowed_ip_ranges: unknown[] | null
          backup_codes: string[] | null
          created_at: string
          created_by: string | null
          deactivated_at: string | null
          deactivated_by: string | null
          deactivation_reason: string | null
          display_name: string
          email: string
          id: string
          last_login_at: string | null
          last_login_device: string | null
          last_login_ip: unknown
          max_devices: number | null
          registered_devices: Json[] | null
          require_managed_device: boolean | null
          sso_provider: string | null
          sso_subject: string | null
          status: string
          totp_secret: string | null
          updated_at: string
          webauthn_credentials: Json[] | null
        }
        Insert: {
          allowed_countries?: string[] | null
          allowed_ip_ranges?: unknown[] | null
          backup_codes?: string[] | null
          created_at?: string
          created_by?: string | null
          deactivated_at?: string | null
          deactivated_by?: string | null
          deactivation_reason?: string | null
          display_name: string
          email: string
          id?: string
          last_login_at?: string | null
          last_login_device?: string | null
          last_login_ip?: unknown
          max_devices?: number | null
          registered_devices?: Json[] | null
          require_managed_device?: boolean | null
          sso_provider?: string | null
          sso_subject?: string | null
          status?: string
          totp_secret?: string | null
          updated_at?: string
          webauthn_credentials?: Json[] | null
        }
        Update: {
          allowed_countries?: string[] | null
          allowed_ip_ranges?: unknown[] | null
          backup_codes?: string[] | null
          created_at?: string
          created_by?: string | null
          deactivated_at?: string | null
          deactivated_by?: string | null
          deactivation_reason?: string | null
          display_name?: string
          email?: string
          id?: string
          last_login_at?: string | null
          last_login_device?: string | null
          last_login_ip?: unknown
          max_devices?: number | null
          registered_devices?: Json[] | null
          require_managed_device?: boolean | null
          sso_provider?: string | null
          sso_subject?: string | null
          status?: string
          totp_secret?: string | null
          updated_at?: string
          webauthn_credentials?: Json[] | null
        }
        Relationships: [
          {
            foreignKeyName: "admin_users_created_by_fkey"
            columns: ["created_by"]
            isOneToOne: false
            referencedRelation: "admin_users"
            referencedColumns: ["id"]
          },
          {
            foreignKeyName: "admin_users_deactivated_by_fkey"
            columns: ["deactivated_by"]
            isOneToOne: false
            referencedRelation: "admin_users"
            referencedColumns: ["id"]
          },
        ]
      }
      agency_reviews: {
        Row: {
          agency_id: string
          cons: string | null
          created_at: string
          id: string
          pros: string | null
          rating: number
          text: string | null
          user_id: string
        }
        Insert: {
          agency_id: string
          cons?: string | null
          created_at?: string
          id?: string
          pros?: string | null
          rating: number
          text?: string | null
          user_id: string
        }
        Update: {
          agency_id?: string
          cons?: string | null
          created_at?: string
          id?: string
          pros?: string | null
          rating?: number
          text?: string | null
          user_id?: string
        }
        Relationships: []
      }
      agent_profiles: {
        Row: {
          available_balance: number | null
          bank_details: Json | null
          commission_rate: number | null
          company_name: string | null
          created_at: string
          id: string
          inn: string | null
          is_legal_entity: boolean | null
          is_self_employed: boolean | null
          loyalty_level: string | null
          loyalty_updated_at: string | null
          quarterly_premiums: number | null
          referral_code: string | null
          referral_l1_percent: number | null
          referral_l2_percent: number | null
          referral_type: string | null
          referred_by: string | null
          region: string | null
          status: Database["public"]["Enums"]["agent_status"]
          total_earned: number | null
          updated_at: string
          user_id: string
          verified_at: string | null
        }
        Insert: {
          available_balance?: number | null
          bank_details?: Json | null
          commission_rate?: number | null
          company_name?: string | null
          created_at?: string
          id?: string
          inn?: string | null
          is_legal_entity?: boolean | null
          is_self_employed?: boolean | null
          loyalty_level?: string | null
          loyalty_updated_at?: string | null
          quarterly_premiums?: number | null
          referral_code?: string | null
          referral_l1_percent?: number | null
          referral_l2_percent?: number | null
          referral_type?: string | null
          referred_by?: string | null
          region?: string | null
          status?: Database["public"]["Enums"]["agent_status"]
          total_earned?: number | null
          updated_at?: string
          user_id: string
          verified_at?: string | null
        }
        Update: {
          available_balance?: number | null
          bank_details?: Json | null
          commission_rate?: number | null
          company_name?: string | null
          created_at?: string
          id?: string
          inn?: string | null
          is_legal_entity?: boolean | null
          is_self_employed?: boolean | null
          loyalty_level?: string | null
          loyalty_updated_at?: string | null
          quarterly_premiums?: number | null
          referral_code?: string | null
          referral_l1_percent?: number | null
          referral_l2_percent?: number | null
          referral_type?: string | null
          referred_by?: string | null
          region?: string | null
          status?: Database["public"]["Enums"]["agent_status"]
          total_earned?: number | null
          updated_at?: string
          user_id?: string
          verified_at?: string | null
        }
        Relationships: [
          {
            foreignKeyName: "agent_profiles_referred_by_fkey"
            columns: ["referred_by"]
            isOneToOne: false
            referencedRelation: "agent_profiles"
            referencedColumns: ["id"]
          },
        ]
      }
      ai_chat_messages: {
        Row: {
          backend_used: string | null
          content: string
          conversation_id: string | null
          conversation_id_v2: string | null
          created_at: string | null
          id: string
          intent: string | null
          model: string | null
          role: string
          tokens_used: number | null
          user_id: string
        }
        Insert: {
          backend_used?: string | null
          content: string
          conversation_id?: string | null
          conversation_id_v2?: string | null
          created_at?: string | null
          id?: string
          intent?: string | null
          model?: string | null
          role: string
          tokens_used?: number | null
          user_id: string
        }
        Update: {
          backend_used?: string | null
          content?: string
          conversation_id?: string | null
          conversation_id_v2?: string | null
          created_at?: string | null
          id?: string
          intent?: string | null
          model?: string | null
          role?: string
          tokens_used?: number | null
          user_id?: string
        }
        Relationships: []
      }
      ai_feedback: {
        Row: {
          assistant_msg_id: string
          conversation_id: string | null
          created_at: string | null
          id: string
          intent: string | null
          model_used: string | null
          rating: number
          user_id: string
        }
        Insert: {
          assistant_msg_id: string
          conversation_id?: string | null
          created_at?: string | null
          id?: string
          intent?: string | null
          model_used?: string | null
          rating: number
          user_id: string
        }
        Update: {
          assistant_msg_id?: string
          conversation_id?: string | null
          created_at?: string | null
          id?: string
          intent?: string | null
          model_used?: string | null
          rating?: number
          user_id?: string
        }
        Relationships: []
      }
      ai_stickers: {
        Row: {
          created_at: string
          id: string
          image_url: string
          prompt: string
          user_id: string
        }
        Insert: {
          created_at?: string
          id?: string
          image_url: string
          prompt: string
          user_id: string
        }
        Update: {
          created_at?: string
          id?: string
          image_url?: string
          prompt?: string
          user_id?: string
        }
        Relationships: []
      }
      ai_usage_limits: {
        Row: {
          daily_messages_used: number | null
          daily_reset_at: string | null
          is_premium: boolean | null
          total_tokens_used: number | null
          updated_at: string | null
          user_id: string
        }
        Insert: {
          daily_messages_used?: number | null
          daily_reset_at?: string | null
          is_premium?: boolean | null
          total_tokens_used?: number | null
          updated_at?: string | null
          user_id: string
        }
        Update: {
          daily_messages_used?: number | null
          daily_reset_at?: string | null
          is_premium?: boolean | null
          total_tokens_used?: number | null
          updated_at?: string | null
          user_id?: string
        }
        Relationships: []
      }
      algorithm_versions: {
        Row: {
          algorithm_id: string
          author_id: string | null
          change_notes: Json | null
          code_sha: string
          created_at: string
          deprecated_at: string | null
          description: string | null
          id: number
          released_at: string | null
          version_number: string
        }
        Insert: {
          algorithm_id: string
          author_id?: string | null
          change_notes?: Json | null
          code_sha: string
          created_at?: string
          deprecated_at?: string | null
          description?: string | null
          id?: number
          released_at?: string | null
          version_number: string
        }
        Update: {
          algorithm_id?: string
          author_id?: string | null
          change_notes?: Json | null
          code_sha?: string
          created_at?: string
          deprecated_at?: string | null
          description?: string | null
          id?: number
          released_at?: string | null
          version_number?: string
        }
        Relationships: []
      }
      anonymous_admin_actions: {
        Row: {
          action_type: string
          admin_user_id: string
          created_at: string | null
          group_id: string
          id: string
          metadata: Json | null
          target_message_id: string | null
          target_user_id: string | null
        }
        Insert: {
          action_type: string
          admin_user_id: string
          created_at?: string | null
          group_id: string
          id?: string
          metadata?: Json | null
          target_message_id?: string | null
          target_user_id?: string | null
        }
        Update: {
          action_type?: string
          admin_user_id?: string
          created_at?: string | null
          group_id?: string
          id?: string
          metadata?: Json | null
          target_message_id?: string | null
          target_user_id?: string | null
        }
        Relationships: []
      }
      anti_abuse_policies: {
        Row: {
          algorithm_version: string | null
          bot_threshold: number
          coordinated_penalty: number | null
          coordinated_threshold: number
          created_at: string
          created_by: string | null
          default_trust_weight: number
          description: string | null
          enabled: boolean | null
          id: number
          policy_id: string
          policy_name: string
          recent_ban_penalty: number | null
          rollout_percentage: number | null
          segment_id: string | null
          updated_at: string
          version: number
          violation_penalty: number | null
        }
        Insert: {
          algorithm_version?: string | null
          bot_threshold?: number
          coordinated_penalty?: number | null
          coordinated_threshold?: number
          created_at?: string
          created_by?: string | null
          default_trust_weight?: number
          description?: string | null
          enabled?: boolean | null
          id?: number
          policy_id?: string
          policy_name: string
          recent_ban_penalty?: number | null
          rollout_percentage?: number | null
          segment_id?: string | null
          updated_at?: string
          version?: number
          violation_penalty?: number | null
        }
        Update: {
          algorithm_version?: string | null
          bot_threshold?: number
          coordinated_penalty?: number | null
          coordinated_threshold?: number
          created_at?: string
          created_by?: string | null
          default_trust_weight?: number
          description?: string | null
          enabled?: boolean | null
          id?: number
          policy_id?: string
          policy_name?: string
          recent_ban_penalty?: number | null
          rollout_percentage?: number | null
          segment_id?: string | null
          updated_at?: string
          version?: number
          violation_penalty?: number | null
        }
        Relationships: []
      }
      anti_abuse_weights: {
        Row: {
          algorithm_changes: Json | null
          confidence_threshold: number
          created_at: string
          false_positive_tolerance: number
          id: number
          is_active: boolean
          organization_id: string
          policy_id: string
          policy_name: string
          updated_at: string
          valid_from: string | null
          valid_until: string | null
          version_id: string
          weight_bot_account_ratio: number
          weight_engagement_uniformity: number
          weight_ip_concentration: number
          weight_unique_authors: number
          weight_velocity_24h: number
        }
        Insert: {
          algorithm_changes?: Json | null
          confidence_threshold?: number
          created_at?: string
          false_positive_tolerance?: number
          id?: number
          is_active?: boolean
          organization_id?: string
          policy_id?: string
          policy_name: string
          updated_at?: string
          valid_from?: string | null
          valid_until?: string | null
          version_id: string
          weight_bot_account_ratio?: number
          weight_engagement_uniformity?: number
          weight_ip_concentration?: number
          weight_unique_authors?: number
          weight_velocity_24h?: number
        }
        Update: {
          algorithm_changes?: Json | null
          confidence_threshold?: number
          created_at?: string
          false_positive_tolerance?: number
          id?: number
          is_active?: boolean
          organization_id?: string
          policy_id?: string
          policy_name?: string
          updated_at?: string
          valid_from?: string | null
          valid_until?: string | null
          version_id?: string
          weight_bot_account_ratio?: number
          weight_engagement_uniformity?: number
          weight_ip_concentration?: number
          weight_unique_authors?: number
          weight_velocity_24h?: number
        }
        Relationships: []
      }
      app_icon_catalog: {
        Row: {
          created_at: string
          icon_url: string | null
          id: string
          is_active: boolean
          is_premium: boolean
          name: string
          sort_order: number
          updated_at: string
        }
        Insert: {
          created_at?: string
          icon_url?: string | null
          id: string
          is_active?: boolean
          is_premium?: boolean
          name: string
          sort_order?: number
          updated_at?: string
        }
        Update: {
          created_at?: string
          icon_url?: string | null
          id?: string
          is_active?: boolean
          is_premium?: boolean
          name?: string
          sort_order?: number
          updated_at?: string
        }
        Relationships: []
      }
      appeal_rate_limits: {
        Row: {
          appeal_count: number
          created_at: string
          max_appeals: number
          updated_at: string
          user_id: string
          window_end: string
          window_start: string
        }
        Insert: {
          appeal_count?: number
          created_at?: string
          max_appeals?: number
          updated_at?: string
          user_id: string
          window_end: string
          window_start: string
        }
        Update: {
          appeal_count?: number
          created_at?: string
          max_appeals?: number
          updated_at?: string
          user_id?: string
          window_end?: string
          window_start?: string
        }
        Relationships: []
      }
      approval_steps: {
        Row: {
          approval_id: string
          approver_id: string
          approver_role: string
          decided_at: string
          decision: string
          decision_reason: string | null
          id: string
          ip_address: unknown
          signature: string | null
        }
        Insert: {
          approval_id: string
          approver_id: string
          approver_role: string
          decided_at?: string
          decision: string
          decision_reason?: string | null
          id?: string
          ip_address?: unknown
          signature?: string | null
        }
        Update: {
          approval_id?: string
          approver_id?: string
          approver_role?: string
          decided_at?: string
          decision?: string
          decision_reason?: string | null
          id?: string
          ip_address?: unknown
          signature?: string | null
        }
        Relationships: [
          {
            foreignKeyName: "approval_steps_approval_id_fkey"
            columns: ["approval_id"]
            isOneToOne: false
            referencedRelation: "approvals"
            referencedColumns: ["id"]
          },
          {
            foreignKeyName: "approval_steps_approver_id_fkey"
            columns: ["approver_id"]
            isOneToOne: false
            referencedRelation: "admin_users"
            referencedColumns: ["id"]
          },
        ]
      }
      approvals: {
        Row: {
          approver_constraints: Json | null
          approver_roles: string[] | null
          created_at: string
          executed_at: string | null
          executed_by: string | null
          execution_error: string | null
          execution_result: Json | null
          expires_at: string
          id: string
          operation_description: string
          operation_payload: Json
          operation_type: string
          request_reason: string
          requested_at: string
          requested_by: string
          required_approvers: number
          status: string
          ticket_id: string | null
          updated_at: string
        }
        Insert: {
          approver_constraints?: Json | null
          approver_roles?: string[] | null
          created_at?: string
          executed_at?: string | null
          executed_by?: string | null
          execution_error?: string | null
          execution_result?: Json | null
          expires_at?: string
          id?: string
          operation_description: string
          operation_payload: Json
          operation_type: string
          request_reason: string
          requested_at?: string
          requested_by: string
          required_approvers?: number
          status?: string
          ticket_id?: string | null
          updated_at?: string
        }
        Update: {
          approver_constraints?: Json | null
          approver_roles?: string[] | null
          created_at?: string
          executed_at?: string | null
          executed_by?: string | null
          execution_error?: string | null
          execution_result?: Json | null
          expires_at?: string
          id?: string
          operation_description?: string
          operation_payload?: Json
          operation_type?: string
          request_reason?: string
          requested_at?: string
          requested_by?: string
          required_approvers?: number
          status?: string
          ticket_id?: string | null
          updated_at?: string
        }
        Relationships: [
          {
            foreignKeyName: "approvals_executed_by_fkey"
            columns: ["executed_by"]
            isOneToOne: false
            referencedRelation: "admin_users"
            referencedColumns: ["id"]
          },
          {
            foreignKeyName: "approvals_requested_by_fkey"
            columns: ["requested_by"]
            isOneToOne: false
            referencedRelation: "admin_users"
            referencedColumns: ["id"]
          },
        ]
      }
      archived_posts: {
        Row: {
          archived_at: string | null
          post_id: string
          user_id: string
        }
        Insert: {
          archived_at?: string | null
          post_id: string
          user_id: string
        }
        Update: {
          archived_at?: string | null
          post_id?: string
          user_id?: string
        }
        Relationships: [
          {
            foreignKeyName: "archived_posts_post_id_fkey"
            columns: ["post_id"]
            isOneToOne: false
            referencedRelation: "posts"
            referencedColumns: ["id"]
          },
        ]
      }
      archived_stories: {
        Row: {
          archived_at: string | null
          story_id: string
          user_id: string
        }
        Insert: {
          archived_at?: string | null
          story_id: string
          user_id: string
        }
        Update: {
          archived_at?: string | null
          story_id?: string
          user_id?: string
        }
        Relationships: []
      }
      aria_memories: {
        Row: {
          access_count: number | null
          content: string
          created_at: string | null
          embedding: string | null
          id: string
          importance: number | null
          last_accessed_at: string | null
          metadata: Json | null
          topic: string | null
          user_id: string
        }
        Insert: {
          access_count?: number | null
          content: string
          created_at?: string | null
          embedding?: string | null
          id?: string
          importance?: number | null
          last_accessed_at?: string | null
          metadata?: Json | null
          topic?: string | null
          user_id: string
        }
        Update: {
          access_count?: number | null
          content?: string
          created_at?: string | null
          embedding?: string | null
          id?: string
          importance?: number | null
          last_accessed_at?: string | null
          metadata?: Json | null
          topic?: string | null
          user_id?: string
        }
        Relationships: []
      }
      assets: {
        Row: {
          created_at: string
          draft_id: string
          fingerprint_sha256: string | null
          id: string
          kind: string
          metadata: Json
          storage_path: string
          upload_id: string | null
        }
        Insert: {
          created_at?: string
          draft_id: string
          fingerprint_sha256?: string | null
          id?: string
          kind: string
          metadata?: Json
          storage_path: string
          upload_id?: string | null
        }
        Update: {
          created_at?: string
          draft_id?: string
          fingerprint_sha256?: string | null
          id?: string
          kind?: string
          metadata?: Json
          storage_path?: string
          upload_id?: string | null
        }
        Relationships: [
          {
            foreignKeyName: "assets_draft_id_fkey"
            columns: ["draft_id"]
            isOneToOne: false
            referencedRelation: "drafts"
            referencedColumns: ["id"]
          },
          {
            foreignKeyName: "assets_upload_id_fkey"
            columns: ["upload_id"]
            isOneToOne: false
            referencedRelation: "uploads"
            referencedColumns: ["id"]
          },
        ]
      }
      audio_room_participants: {
        Row: {
          id: string
          joined_at: string | null
          left_at: string | null
          role: string | null
          room_id: string
          user_id: string
        }
        Insert: {
          id?: string
          joined_at?: string | null
          left_at?: string | null
          role?: string | null
          room_id: string
          user_id: string
        }
        Update: {
          id?: string
          joined_at?: string | null
          left_at?: string | null
          role?: string | null
          room_id?: string
          user_id?: string
        }
        Relationships: [
          {
            foreignKeyName: "audio_room_participants_room_id_fkey"
            columns: ["room_id"]
            isOneToOne: false
            referencedRelation: "audio_rooms"
            referencedColumns: ["id"]
          },
        ]
      }
      audio_rooms: {
        Row: {
          created_at: string | null
          description: string | null
          ended_at: string | null
          host_id: string
          id: string
          is_recording: boolean | null
          max_speakers: number | null
          scheduled_at: string | null
          started_at: string | null
          status: string | null
          title: string
        }
        Insert: {
          created_at?: string | null
          description?: string | null
          ended_at?: string | null
          host_id: string
          id?: string
          is_recording?: boolean | null
          max_speakers?: number | null
          scheduled_at?: string | null
          started_at?: string | null
          status?: string | null
          title: string
        }
        Update: {
          created_at?: string | null
          description?: string | null
          ended_at?: string | null
          host_id?: string
          id?: string
          is_recording?: boolean | null
          max_speakers?: number | null
          scheduled_at?: string | null
          started_at?: string | null
          status?: string | null
          title?: string
        }
        Relationships: []
      }
      audio_tracks: {
        Row: {
          avg_completion_rate: number
          avg_saves_per_reel: number
          created_at: string
          first_used_at: string
          growth_rate_24h: number
          id: string
          is_trending: boolean
          last_calculated_at: string
          last_used_at: string
          normalized_key: string
          peaked_at: string | null
          reels_count: number
          title: string
          total_views: number
          trend_level: string | null
          usage_count: number
          usage_last_24h: number
          velocity_score: number
        }
        Insert: {
          avg_completion_rate?: number
          avg_saves_per_reel?: number
          created_at?: string
          first_used_at?: string
          growth_rate_24h?: number
          id?: string
          is_trending?: boolean
          last_calculated_at?: string
          last_used_at?: string
          normalized_key: string
          peaked_at?: string | null
          reels_count?: number
          title: string
          total_views?: number
          trend_level?: string | null
          usage_count?: number
          usage_last_24h?: number
          velocity_score?: number
        }
        Update: {
          avg_completion_rate?: number
          avg_saves_per_reel?: number
          created_at?: string
          first_used_at?: string
          growth_rate_24h?: number
          id?: string
          is_trending?: boolean
          last_calculated_at?: string
          last_used_at?: string
          normalized_key?: string
          peaked_at?: string | null
          reels_count?: number
          title?: string
          total_views?: number
          trend_level?: string | null
          usage_count?: number
          usage_last_24h?: number
          velocity_score?: number
        }
        Relationships: []
      }
      audit_hash_anchors: {
        Row: {
          anchor_storage_url: string | null
          created_at: string
          id: string
          root_hash: string
          sequence_from: number
          sequence_to: number
        }
        Insert: {
          anchor_storage_url?: string | null
          created_at?: string
          id?: string
          root_hash: string
          sequence_from: number
          sequence_to: number
        }
        Update: {
          anchor_storage_url?: string | null
          created_at?: string
          id?: string
          root_hash?: string
          sequence_from?: number
          sequence_to?: number
        }
        Relationships: []
      }
      auth_accounts: {
        Row: {
          created_at: string
          email: string | null
          id: string
          is_banned: boolean
          password_hash: string | null
          phone_e164: string | null
        }
        Insert: {
          created_at?: string
          email?: string | null
          id?: string
          is_banned?: boolean
          password_hash?: string | null
          phone_e164?: string | null
        }
        Update: {
          created_at?: string
          email?: string | null
          id?: string
          is_banned?: boolean
          password_hash?: string | null
          phone_e164?: string | null
        }
        Relationships: []
      }
      auth_audit_events: {
        Row: {
          account_id: string | null
          created_at: string
          device_id: string | null
          event_data: Json
          event_type: string
          id: string
          ip: unknown
          session_id: string | null
          user_agent: string | null
        }
        Insert: {
          account_id?: string | null
          created_at?: string
          device_id?: string | null
          event_data?: Json
          event_type: string
          id?: string
          ip?: unknown
          session_id?: string | null
          user_agent?: string | null
        }
        Update: {
          account_id?: string | null
          created_at?: string
          device_id?: string | null
          event_data?: Json
          event_type?: string
          id?: string
          ip?: unknown
          session_id?: string | null
          user_agent?: string | null
        }
        Relationships: [
          {
            foreignKeyName: "auth_audit_events_account_id_fkey"
            columns: ["account_id"]
            isOneToOne: false
            referencedRelation: "auth_accounts"
            referencedColumns: ["id"]
          },
          {
            foreignKeyName: "auth_audit_events_device_id_fkey"
            columns: ["device_id"]
            isOneToOne: false
            referencedRelation: "auth_devices"
            referencedColumns: ["id"]
          },
          {
            foreignKeyName: "auth_audit_events_session_id_fkey"
            columns: ["session_id"]
            isOneToOne: false
            referencedRelation: "auth_sessions"
            referencedColumns: ["id"]
          },
        ]
      }
      auth_devices: {
        Row: {
          app_version: string | null
          created_at: string
          device_model: string | null
          device_secret_hash: string
          device_uid: string
          id: string
          last_ip: unknown
          last_seen_at: string | null
          last_user_agent: string | null
          os_version: string | null
          platform: string
        }
        Insert: {
          app_version?: string | null
          created_at?: string
          device_model?: string | null
          device_secret_hash: string
          device_uid: string
          id?: string
          last_ip?: unknown
          last_seen_at?: string | null
          last_user_agent?: string | null
          os_version?: string | null
          platform: string
        }
        Update: {
          app_version?: string | null
          created_at?: string
          device_model?: string | null
          device_secret_hash?: string
          device_uid?: string
          id?: string
          last_ip?: unknown
          last_seen_at?: string | null
          last_user_agent?: string | null
          os_version?: string | null
          platform?: string
        }
        Relationships: []
      }
      auth_sessions: {
        Row: {
          account_id: string
          created_at: string
          device_id: string
          id: string
          last_access_at: string | null
          last_ip: unknown
          last_user_agent: string | null
          refresh_expires_at: string
          refresh_issued_at: string
          refresh_token_hash: string
          reuse_detected_at: string | null
          status: string
          updated_at: string
        }
        Insert: {
          account_id: string
          created_at?: string
          device_id: string
          id?: string
          last_access_at?: string | null
          last_ip?: unknown
          last_user_agent?: string | null
          refresh_expires_at: string
          refresh_issued_at?: string
          refresh_token_hash: string
          reuse_detected_at?: string | null
          status?: string
          updated_at?: string
        }
        Update: {
          account_id?: string
          created_at?: string
          device_id?: string
          id?: string
          last_access_at?: string | null
          last_ip?: unknown
          last_user_agent?: string | null
          refresh_expires_at?: string
          refresh_issued_at?: string
          refresh_token_hash?: string
          reuse_detected_at?: string | null
          status?: string
          updated_at?: string
        }
        Relationships: [
          {
            foreignKeyName: "auth_sessions_account_id_fkey"
            columns: ["account_id"]
            isOneToOne: false
            referencedRelation: "auth_accounts"
            referencedColumns: ["id"]
          },
          {
            foreignKeyName: "auth_sessions_device_id_fkey"
            columns: ["device_id"]
            isOneToOne: false
            referencedRelation: "auth_devices"
            referencedColumns: ["id"]
          },
        ]
      }
      authorized_sites: {
        Row: {
          browser: string | null
          created_at: string
          domain: string
          id: string
          last_active_at: string
          location_label: string | null
          os: string | null
          revoked_at: string | null
          site_name: string
          user_id: string
        }
        Insert: {
          browser?: string | null
          created_at?: string
          domain: string
          id?: string
          last_active_at?: string
          location_label?: string | null
          os?: string | null
          revoked_at?: string | null
          site_name: string
          user_id: string
        }
        Update: {
          browser?: string | null
          created_at?: string
          domain?: string
          id?: string
          last_active_at?: string
          location_label?: string | null
          os?: string | null
          revoked_at?: string | null
          site_name?: string
          user_id?: string
        }
        Relationships: []
      }
      blocked_users: {
        Row: {
          blocked_id: string
          blocker_id: string
          created_at: string
          id: string
        }
        Insert: {
          blocked_id: string
          blocker_id: string
          created_at?: string
          id?: string
        }
        Update: {
          blocked_id?: string
          blocker_id?: string
          created_at?: string
          id?: string
        }
        Relationships: []
      }
      boosted_posts: {
        Row: {
          actual_reach: number
          budget_cents: number
          created_at: string
          duration_hours: number
          ends_at: string | null
          id: string
          post_id: string
          spent_cents: number
          started_at: string | null
          status: string
          target_reach: number
          user_id: string
        }
        Insert: {
          actual_reach?: number
          budget_cents: number
          created_at?: string
          duration_hours: number
          ends_at?: string | null
          id?: string
          post_id: string
          spent_cents?: number
          started_at?: string | null
          status?: string
          target_reach?: number
          user_id: string
        }
        Update: {
          actual_reach?: number
          budget_cents?: number
          created_at?: string
          duration_hours?: number
          ends_at?: string | null
          id?: string
          post_id?: string
          spent_cents?: number
          started_at?: string | null
          status?: string
          target_reach?: number
          user_id?: string
        }
        Relationships: [
          {
            foreignKeyName: "boosted_posts_post_id_fkey"
            columns: ["post_id"]
            isOneToOne: false
            referencedRelation: "posts"
            referencedColumns: ["id"]
          },
        ]
      }
      bot_analytics: {
        Row: {
          bot_id: string
          created_at: string
          date: string
          id: string
          messages_received: number | null
          messages_sent: number | null
          new_subscriptions: number | null
          total_commands: number | null
          unique_users: number | null
        }
        Insert: {
          bot_id: string
          created_at?: string
          date?: string
          id?: string
          messages_received?: number | null
          messages_sent?: number | null
          new_subscriptions?: number | null
          total_commands?: number | null
          unique_users?: number | null
        }
        Update: {
          bot_id?: string
          created_at?: string
          date?: string
          id?: string
          messages_received?: number | null
          messages_sent?: number | null
          new_subscriptions?: number | null
          total_commands?: number | null
          unique_users?: number | null
        }
        Relationships: [
          {
            foreignKeyName: "bot_analytics_bot_id_fkey"
            columns: ["bot_id"]
            isOneToOne: false
            referencedRelation: "bots"
            referencedColumns: ["id"]
          },
        ]
      }
      bot_chats: {
        Row: {
          bot_id: string
          chat_id: string | null
          created_at: string
          id: string
          last_message_at: string
          message_count: number | null
          updated_at: string
          user_id: string
        }
        Insert: {
          bot_id: string
          chat_id?: string | null
          created_at?: string
          id?: string
          last_message_at?: string
          message_count?: number | null
          updated_at?: string
          user_id: string
        }
        Update: {
          bot_id?: string
          chat_id?: string | null
          created_at?: string
          id?: string
          last_message_at?: string
          message_count?: number | null
          updated_at?: string
          user_id?: string
        }
        Relationships: [
          {
            foreignKeyName: "bot_chats_bot_id_fkey"
            columns: ["bot_id"]
            isOneToOne: false
            referencedRelation: "bots"
            referencedColumns: ["id"]
          },
          {
            foreignKeyName: "bot_chats_chat_id_fkey"
            columns: ["chat_id"]
            isOneToOne: false
            referencedRelation: "conversations"
            referencedColumns: ["id"]
          },
          {
            foreignKeyName: "bot_chats_user_id_fkey"
            columns: ["user_id"]
            isOneToOne: false
            referencedRelation: "profiles"
            referencedColumns: ["id"]
          },
        ]
      }
      bot_commands: {
        Row: {
          bot_id: string
          command: string
          created_at: string
          description: string | null
          id: string
          language_code: string | null
        }
        Insert: {
          bot_id: string
          command: string
          created_at?: string
          description?: string | null
          id?: string
          language_code?: string | null
        }
        Update: {
          bot_id?: string
          command?: string
          created_at?: string
          description?: string | null
          id?: string
          language_code?: string | null
        }
        Relationships: [
          {
            foreignKeyName: "bot_commands_bot_id_fkey"
            columns: ["bot_id"]
            isOneToOne: false
            referencedRelation: "bots"
            referencedColumns: ["id"]
          },
        ]
      }
      bot_conversations: {
        Row: {
          added_at: string | null
          added_by: string
          bot_id: string
          conversation_id: string
          id: string
        }
        Insert: {
          added_at?: string | null
          added_by: string
          bot_id: string
          conversation_id: string
          id?: string
        }
        Update: {
          added_at?: string | null
          added_by?: string
          bot_id?: string
          conversation_id?: string
          id?: string
        }
        Relationships: [
          {
            foreignKeyName: "bot_conversations_bot_id_fkey"
            columns: ["bot_id"]
            isOneToOne: false
            referencedRelation: "bots"
            referencedColumns: ["id"]
          },
        ]
      }
      bot_inline_keyboards: {
        Row: {
          created_at: string | null
          id: string
          keyboard_data: Json
          message_id: string
        }
        Insert: {
          created_at?: string | null
          id?: string
          keyboard_data: Json
          message_id: string
        }
        Update: {
          created_at?: string | null
          id?: string
          keyboard_data?: Json
          message_id?: string
        }
        Relationships: []
      }
      bot_messages: {
        Row: {
          bot_id: string
          chat_id: string
          created_at: string
          direction: string
          id: string
          message_id: string
          processed_at: string | null
          raw_update: Json | null
        }
        Insert: {
          bot_id: string
          chat_id: string
          created_at?: string
          direction: string
          id?: string
          message_id: string
          processed_at?: string | null
          raw_update?: Json | null
        }
        Update: {
          bot_id?: string
          chat_id?: string
          created_at?: string
          direction?: string
          id?: string
          message_id?: string
          processed_at?: string | null
          raw_update?: Json | null
        }
        Relationships: [
          {
            foreignKeyName: "bot_messages_bot_id_fkey"
            columns: ["bot_id"]
            isOneToOne: false
            referencedRelation: "bots"
            referencedColumns: ["id"]
          },
          {
            foreignKeyName: "bot_messages_chat_id_fkey"
            columns: ["chat_id"]
            isOneToOne: false
            referencedRelation: "conversations"
            referencedColumns: ["id"]
          },
          {
            foreignKeyName: "bot_messages_message_id_fkey"
            columns: ["message_id"]
            isOneToOne: false
            referencedRelation: "messages"
            referencedColumns: ["id"]
          },
        ]
      }
      bot_payment_providers: {
        Row: {
          bot_id: string
          created_at: string | null
          id: string
          is_active: boolean | null
          provider_config: Json | null
          provider_type: string
          vault_secret_id: string | null
        }
        Insert: {
          bot_id: string
          created_at?: string | null
          id?: string
          is_active?: boolean | null
          provider_config?: Json | null
          provider_type: string
          vault_secret_id?: string | null
        }
        Update: {
          bot_id?: string
          created_at?: string | null
          id?: string
          is_active?: boolean | null
          provider_config?: Json | null
          provider_type?: string
          vault_secret_id?: string | null
        }
        Relationships: [
          {
            foreignKeyName: "bot_payment_providers_bot_id_fkey"
            columns: ["bot_id"]
            isOneToOne: false
            referencedRelation: "bots"
            referencedColumns: ["id"]
          },
        ]
      }
      bot_tokens: {
        Row: {
          bot_id: string
          created_at: string
          expires_at: string | null
          id: string
          last_used_at: string | null
          name: string | null
          token: string
        }
        Insert: {
          bot_id: string
          created_at?: string
          expires_at?: string | null
          id?: string
          last_used_at?: string | null
          name?: string | null
          token: string
        }
        Update: {
          bot_id?: string
          created_at?: string
          expires_at?: string | null
          id?: string
          last_used_at?: string | null
          name?: string | null
          token?: string
        }
        Relationships: [
          {
            foreignKeyName: "bot_tokens_bot_id_fkey"
            columns: ["bot_id"]
            isOneToOne: false
            referencedRelation: "bots"
            referencedColumns: ["id"]
          },
        ]
      }
      bot_update_events: {
        Row: {
          bot_id: string
          created_at: string
          direction: string
          event_type: string
          id: string
          payload: Json
          processed_at: string
          telegram_chat_id: string | null
          telegram_message_id: string | null
          telegram_user_id: number | null
        }
        Insert: {
          bot_id: string
          created_at?: string
          direction: string
          event_type: string
          id?: string
          payload?: Json
          processed_at?: string
          telegram_chat_id?: string | null
          telegram_message_id?: string | null
          telegram_user_id?: number | null
        }
        Update: {
          bot_id?: string
          created_at?: string
          direction?: string
          event_type?: string
          id?: string
          payload?: Json
          processed_at?: string
          telegram_chat_id?: string | null
          telegram_message_id?: string | null
          telegram_user_id?: number | null
        }
        Relationships: [
          {
            foreignKeyName: "bot_update_events_bot_id_fkey"
            columns: ["bot_id"]
            isOneToOne: false
            referencedRelation: "bots"
            referencedColumns: ["id"]
          },
        ]
      }
      bot_webhooks: {
        Row: {
          bot_id: string
          created_at: string
          id: string
          is_active: boolean | null
          last_error: string | null
          last_triggered_at: string | null
          secret_token: string | null
          updated_at: string
          url: string
        }
        Insert: {
          bot_id: string
          created_at?: string
          id?: string
          is_active?: boolean | null
          last_error?: string | null
          last_triggered_at?: string | null
          secret_token?: string | null
          updated_at?: string
          url: string
        }
        Update: {
          bot_id?: string
          created_at?: string
          id?: string
          is_active?: boolean | null
          last_error?: string | null
          last_triggered_at?: string | null
          secret_token?: string | null
          updated_at?: string
          url?: string
        }
        Relationships: [
          {
            foreignKeyName: "bot_webhooks_bot_id_fkey"
            columns: ["bot_id"]
            isOneToOne: true
            referencedRelation: "bots"
            referencedColumns: ["id"]
          },
        ]
      }
      bots: {
        Row: {
          about: string | null
          api_token: string | null
          avatar_url: string | null
          bot_chat_type: Database["public"]["Enums"]["bot_chat_type"] | null
          can_join_groups: boolean | null
          can_read_all_group_messages: boolean | null
          capabilities: Json | null
          created_at: string
          description: string | null
          display_name: string
          id: string
          is_active: boolean | null
          is_private: boolean | null
          is_verified: boolean | null
          language_code: string | null
          owner_id: string
          status: Database["public"]["Enums"]["bot_status"] | null
          updated_at: string
          username: string
          webhook_url: string | null
        }
        Insert: {
          about?: string | null
          api_token?: string | null
          avatar_url?: string | null
          bot_chat_type?: Database["public"]["Enums"]["bot_chat_type"] | null
          can_join_groups?: boolean | null
          can_read_all_group_messages?: boolean | null
          capabilities?: Json | null
          created_at?: string
          description?: string | null
          display_name: string
          id?: string
          is_active?: boolean | null
          is_private?: boolean | null
          is_verified?: boolean | null
          language_code?: string | null
          owner_id: string
          status?: Database["public"]["Enums"]["bot_status"] | null
          updated_at?: string
          username: string
          webhook_url?: string | null
        }
        Update: {
          about?: string | null
          api_token?: string | null
          avatar_url?: string | null
          bot_chat_type?: Database["public"]["Enums"]["bot_chat_type"] | null
          can_join_groups?: boolean | null
          can_read_all_group_messages?: boolean | null
          capabilities?: Json | null
          created_at?: string
          description?: string | null
          display_name?: string
          id?: string
          is_active?: boolean | null
          is_private?: boolean | null
          is_verified?: boolean | null
          language_code?: string | null
          owner_id?: string
          status?: Database["public"]["Enums"]["bot_status"] | null
          updated_at?: string
          username?: string
          webhook_url?: string | null
        }
        Relationships: [
          {
            foreignKeyName: "bots_owner_id_fkey"
            columns: ["owner_id"]
            isOneToOne: false
            referencedRelation: "profiles"
            referencedColumns: ["id"]
          },
        ]
      }
      branded_content_approved_authors: {
        Row: {
          approved_at: string
          author_user_id: string
          brand_user_id: string
          id: string
        }
        Insert: {
          approved_at?: string
          author_user_id: string
          brand_user_id: string
          id?: string
        }
        Update: {
          approved_at?: string
          author_user_id?: string
          brand_user_id?: string
          id?: string
        }
        Relationships: []
      }
      branded_content_partner_requests: {
        Row: {
          brand_user_id: string
          created_at: string
          decided_at: string | null
          id: string
          message: string | null
          partner_user_id: string
          status: Database["public"]["Enums"]["branded_request_status"]
        }
        Insert: {
          brand_user_id: string
          created_at?: string
          decided_at?: string | null
          id?: string
          message?: string | null
          partner_user_id: string
          status?: Database["public"]["Enums"]["branded_request_status"]
        }
        Update: {
          brand_user_id?: string
          created_at?: string
          decided_at?: string | null
          id?: string
          message?: string | null
          partner_user_id?: string
          status?: Database["public"]["Enums"]["branded_request_status"]
        }
        Relationships: []
      }
      broadcast_channel_members: {
        Row: {
          channel_id: string
          id: string
          joined_at: string
          user_id: string
        }
        Insert: {
          channel_id: string
          id?: string
          joined_at?: string
          user_id: string
        }
        Update: {
          channel_id?: string
          id?: string
          joined_at?: string
          user_id?: string
        }
        Relationships: [
          {
            foreignKeyName: "broadcast_channel_members_channel_id_fkey"
            columns: ["channel_id"]
            isOneToOne: false
            referencedRelation: "broadcast_channels"
            referencedColumns: ["id"]
          },
        ]
      }
      broadcast_channel_messages: {
        Row: {
          channel_id: string
          created_at: string
          id: string
          media_url: string | null
          sender_id: string
          text: string
        }
        Insert: {
          channel_id: string
          created_at?: string
          id?: string
          media_url?: string | null
          sender_id: string
          text: string
        }
        Update: {
          channel_id?: string
          created_at?: string
          id?: string
          media_url?: string | null
          sender_id?: string
          text?: string
        }
        Relationships: [
          {
            foreignKeyName: "broadcast_channel_messages_channel_id_fkey"
            columns: ["channel_id"]
            isOneToOne: false
            referencedRelation: "broadcast_channels"
            referencedColumns: ["id"]
          },
        ]
      }
      broadcast_channels: {
        Row: {
          avatar_url: string | null
          created_at: string
          creator_id: string
          description: string
          id: string
          is_public: boolean
          member_count: number
          name: string
        }
        Insert: {
          avatar_url?: string | null
          created_at?: string
          creator_id: string
          description?: string
          id?: string
          is_public?: boolean
          member_count?: number
          name: string
        }
        Update: {
          avatar_url?: string | null
          created_at?: string
          creator_id?: string
          description?: string
          id?: string
          is_public?: boolean
          member_count?: number
          name?: string
        }
        Relationships: []
      }
      business_accounts: {
        Row: {
          auto_reply_enabled: boolean | null
          away_message: string | null
          business_address: string | null
          business_category: string
          business_description: string | null
          business_email: string | null
          business_hours: Json | null
          business_name: string
          business_phone: string | null
          business_website: string | null
          created_at: string | null
          greeting_message: string | null
          id: string
          is_verified: boolean | null
          labels: Json | null
          quick_replies: Json | null
          updated_at: string | null
          user_id: string
        }
        Insert: {
          auto_reply_enabled?: boolean | null
          away_message?: string | null
          business_address?: string | null
          business_category: string
          business_description?: string | null
          business_email?: string | null
          business_hours?: Json | null
          business_name: string
          business_phone?: string | null
          business_website?: string | null
          created_at?: string | null
          greeting_message?: string | null
          id?: string
          is_verified?: boolean | null
          labels?: Json | null
          quick_replies?: Json | null
          updated_at?: string | null
          user_id: string
        }
        Update: {
          auto_reply_enabled?: boolean | null
          away_message?: string | null
          business_address?: string | null
          business_category?: string
          business_description?: string | null
          business_email?: string | null
          business_hours?: Json | null
          business_name?: string
          business_phone?: string | null
          business_website?: string | null
          created_at?: string | null
          greeting_message?: string | null
          id?: string
          is_verified?: boolean | null
          labels?: Json | null
          quick_replies?: Json | null
          updated_at?: string | null
          user_id?: string
        }
        Relationships: []
      }
      business_chat_labels: {
        Row: {
          business_id: string
          chat_id: string
          color: string | null
          created_at: string | null
          id: string
          label: string
        }
        Insert: {
          business_id: string
          chat_id: string
          color?: string | null
          created_at?: string | null
          id?: string
          label: string
        }
        Update: {
          business_id?: string
          chat_id?: string
          color?: string | null
          created_at?: string | null
          id?: string
          label?: string
        }
        Relationships: [
          {
            foreignKeyName: "business_chat_labels_business_id_fkey"
            columns: ["business_id"]
            isOneToOne: false
            referencedRelation: "business_accounts"
            referencedColumns: ["id"]
          },
        ]
      }
      calls: {
        Row: {
          answered_at: string | null
          call_type: string
          callee_id: string
          caller_id: string
          calls_v2_join_token: string | null
          calls_v2_room_id: string | null
          conversation_id: string | null
          created_at: string
          duration_seconds: number | null
          end_reason: string | null
          ended_at: string | null
          expires_at: string
          ice_restart_count: number
          id: string
          signaling_data: Json | null
          started_at: string | null
          state: string
          updated_at: string
        }
        Insert: {
          answered_at?: string | null
          call_type: string
          callee_id: string
          caller_id: string
          calls_v2_join_token?: string | null
          calls_v2_room_id?: string | null
          conversation_id?: string | null
          created_at?: string
          duration_seconds?: number | null
          end_reason?: string | null
          ended_at?: string | null
          expires_at?: string
          ice_restart_count?: number
          id?: string
          signaling_data?: Json | null
          started_at?: string | null
          state?: string
          updated_at?: string
        }
        Update: {
          answered_at?: string | null
          call_type?: string
          callee_id?: string
          caller_id?: string
          calls_v2_join_token?: string | null
          calls_v2_room_id?: string | null
          conversation_id?: string | null
          created_at?: string
          duration_seconds?: number | null
          end_reason?: string | null
          ended_at?: string | null
          expires_at?: string
          ice_restart_count?: number
          id?: string
          signaling_data?: Json | null
          started_at?: string | null
          state?: string
          updated_at?: string
        }
        Relationships: [
          {
            foreignKeyName: "calls_conversation_id_fkey"
            columns: ["conversation_id"]
            isOneToOne: false
            referencedRelation: "conversations"
            referencedColumns: ["id"]
          },
        ]
      }
      channel_analytics_daily: {
        Row: {
          avg_view_time_seconds: number
          channel_id: string
          comments_count: number
          created_at: string
          date: string
          id: string
          reach_count: number
          reactions_count: number
          shares_count: number
          subscribers_count: number
          subscribers_gained: number
          subscribers_lost: number
          views_count: number
        }
        Insert: {
          avg_view_time_seconds?: number
          channel_id: string
          comments_count?: number
          created_at?: string
          date: string
          id?: string
          reach_count?: number
          reactions_count?: number
          shares_count?: number
          subscribers_count?: number
          subscribers_gained?: number
          subscribers_lost?: number
          views_count?: number
        }
        Update: {
          avg_view_time_seconds?: number
          channel_id?: string
          comments_count?: number
          created_at?: string
          date?: string
          id?: string
          reach_count?: number
          reactions_count?: number
          shares_count?: number
          subscribers_count?: number
          subscribers_gained?: number
          subscribers_lost?: number
          views_count?: number
        }
        Relationships: [
          {
            foreignKeyName: "channel_analytics_daily_channel_id_fkey"
            columns: ["channel_id"]
            isOneToOne: false
            referencedRelation: "channels"
            referencedColumns: ["id"]
          },
        ]
      }
      channel_audit_log: {
        Row: {
          action: string
          actor_id: string
          channel_id: string
          created_at: string
          details: Json | null
          id: string
          target_id: string | null
        }
        Insert: {
          action: string
          actor_id: string
          channel_id: string
          created_at?: string
          details?: Json | null
          id?: string
          target_id?: string | null
        }
        Update: {
          action?: string
          actor_id?: string
          channel_id?: string
          created_at?: string
          details?: Json | null
          id?: string
          target_id?: string | null
        }
        Relationships: [
          {
            foreignKeyName: "channel_audit_log_channel_id_fkey"
            columns: ["channel_id"]
            isOneToOne: false
            referencedRelation: "channels"
            referencedColumns: ["id"]
          },
        ]
      }
      channel_boost_levels: {
        Row: {
          channel_id: string
          current_level: number
          perks: Json
          total_boosts: number
          updated_at: string | null
        }
        Insert: {
          channel_id: string
          current_level?: number
          perks?: Json
          total_boosts?: number
          updated_at?: string | null
        }
        Update: {
          channel_id?: string
          current_level?: number
          perks?: Json
          total_boosts?: number
          updated_at?: string | null
        }
        Relationships: [
          {
            foreignKeyName: "channel_boost_levels_channel_id_fkey"
            columns: ["channel_id"]
            isOneToOne: true
            referencedRelation: "channels"
            referencedColumns: ["id"]
          },
        ]
      }
      channel_boosts: {
        Row: {
          boost_level: number
          channel_id: string
          created_at: string | null
          expires_at: string
          id: string
          stars_spent: number
          user_id: string
        }
        Insert: {
          boost_level?: number
          channel_id: string
          created_at?: string | null
          expires_at: string
          id?: string
          stars_spent: number
          user_id: string
        }
        Update: {
          boost_level?: number
          channel_id?: string
          created_at?: string | null
          expires_at?: string
          id?: string
          stars_spent?: number
          user_id?: string
        }
        Relationships: [
          {
            foreignKeyName: "channel_boosts_channel_id_fkey"
            columns: ["channel_id"]
            isOneToOne: false
            referencedRelation: "channels"
            referencedColumns: ["id"]
          },
        ]
      }
      channel_capability_catalog: {
        Row: {
          created_at: string
          default_params: Json
          description: string | null
          domain: string
          is_active: boolean
          key: string
          title: string
          updated_at: string
        }
        Insert: {
          created_at?: string
          default_params?: Json
          description?: string | null
          domain: string
          is_active?: boolean
          key: string
          title: string
          updated_at?: string
        }
        Update: {
          created_at?: string
          default_params?: Json
          description?: string | null
          domain?: string
          is_active?: boolean
          key?: string
          title?: string
          updated_at?: string
        }
        Relationships: []
      }
      channel_capability_overrides: {
        Row: {
          capability_key: string
          channel_id: string
          created_at: string
          created_by: string
          id: string
          is_enabled: boolean
          params: Json
          updated_at: string
        }
        Insert: {
          capability_key: string
          channel_id: string
          created_at?: string
          created_by?: string
          id?: string
          is_enabled?: boolean
          params?: Json
          updated_at?: string
        }
        Update: {
          capability_key?: string
          channel_id?: string
          created_at?: string
          created_by?: string
          id?: string
          is_enabled?: boolean
          params?: Json
          updated_at?: string
        }
        Relationships: [
          {
            foreignKeyName: "channel_capability_overrides_capability_key_fkey"
            columns: ["capability_key"]
            isOneToOne: false
            referencedRelation: "channel_capability_catalog"
            referencedColumns: ["key"]
          },
          {
            foreignKeyName: "channel_capability_overrides_channel_id_fkey"
            columns: ["channel_id"]
            isOneToOne: false
            referencedRelation: "channels"
            referencedColumns: ["id"]
          },
        ]
      }
      channel_invite_links: {
        Row: {
          channel_id: string
          created_at: string
          created_by: string
          expires_at: string | null
          id: string
          is_active: boolean
          is_permanent: boolean
          is_revoked: boolean
          link_code: string | null
          max_uses: number | null
          requires_approval: boolean
          title: string | null
          token: string
          updated_at: string
          usage_count: number
          usage_limit: number | null
          used_count: number
        }
        Insert: {
          channel_id: string
          created_at?: string
          created_by?: string
          expires_at?: string | null
          id?: string
          is_active?: boolean
          is_permanent?: boolean
          is_revoked?: boolean
          link_code?: string | null
          max_uses?: number | null
          requires_approval?: boolean
          title?: string | null
          token: string
          updated_at?: string
          usage_count?: number
          usage_limit?: number | null
          used_count?: number
        }
        Update: {
          channel_id?: string
          created_at?: string
          created_by?: string
          expires_at?: string | null
          id?: string
          is_active?: boolean
          is_permanent?: boolean
          is_revoked?: boolean
          link_code?: string | null
          max_uses?: number | null
          requires_approval?: boolean
          title?: string | null
          token?: string
          updated_at?: string
          usage_count?: number
          usage_limit?: number | null
          used_count?: number
        }
        Relationships: [
          {
            foreignKeyName: "channel_invite_links_channel_id_fkey"
            columns: ["channel_id"]
            isOneToOne: false
            referencedRelation: "channels"
            referencedColumns: ["id"]
          },
        ]
      }
      channel_join_requests: {
        Row: {
          channel_id: string
          created_at: string
          id: string
          invite_link_id: string | null
          processed_at: string | null
          processed_by: string | null
          status: string
          user_id: string
        }
        Insert: {
          channel_id: string
          created_at?: string
          id?: string
          invite_link_id?: string | null
          processed_at?: string | null
          processed_by?: string | null
          status?: string
          user_id: string
        }
        Update: {
          channel_id?: string
          created_at?: string
          id?: string
          invite_link_id?: string | null
          processed_at?: string | null
          processed_by?: string | null
          status?: string
          user_id?: string
        }
        Relationships: [
          {
            foreignKeyName: "channel_join_requests_channel_id_fkey"
            columns: ["channel_id"]
            isOneToOne: false
            referencedRelation: "channels"
            referencedColumns: ["id"]
          },
          {
            foreignKeyName: "channel_join_requests_invite_link_id_fkey"
            columns: ["invite_link_id"]
            isOneToOne: false
            referencedRelation: "channel_invite_links"
            referencedColumns: ["id"]
          },
        ]
      }
      channel_members: {
        Row: {
          admin_rights: number
          admin_title: string | null
          banned_rights: number
          banned_until: string | null
          channel_id: string
          id: string
          joined_at: string
          role: string
          user_id: string
        }
        Insert: {
          admin_rights?: number
          admin_title?: string | null
          banned_rights?: number
          banned_until?: string | null
          channel_id: string
          id?: string
          joined_at?: string
          role?: string
          user_id: string
        }
        Update: {
          admin_rights?: number
          admin_title?: string | null
          banned_rights?: number
          banned_until?: string | null
          channel_id?: string
          id?: string
          joined_at?: string
          role?: string
          user_id?: string
        }
        Relationships: [
          {
            foreignKeyName: "channel_members_channel_id_fkey"
            columns: ["channel_id"]
            isOneToOne: false
            referencedRelation: "channels"
            referencedColumns: ["id"]
          },
        ]
      }
      channel_message_reactions: {
        Row: {
          created_at: string
          emoji: string
          id: string
          message_id: string
          user_id: string
        }
        Insert: {
          created_at?: string
          emoji: string
          id?: string
          message_id: string
          user_id: string
        }
        Update: {
          created_at?: string
          emoji?: string
          id?: string
          message_id?: string
          user_id?: string
        }
        Relationships: [
          {
            foreignKeyName: "channel_message_reactions_message_id_fkey"
            columns: ["message_id"]
            isOneToOne: false
            referencedRelation: "channel_messages"
            referencedColumns: ["id"]
          },
        ]
      }
      channel_message_views: {
        Row: {
          message_id: string
          user_id: string
          viewed_at: string
        }
        Insert: {
          message_id: string
          user_id: string
          viewed_at?: string
        }
        Update: {
          message_id?: string
          user_id?: string
          viewed_at?: string
        }
        Relationships: [
          {
            foreignKeyName: "channel_message_views_message_id_fkey"
            columns: ["message_id"]
            isOneToOne: false
            referencedRelation: "channel_messages"
            referencedColumns: ["id"]
          },
        ]
      }
      channel_messages: {
        Row: {
          album_id: string | null
          author_signature: string | null
          channel_id: string
          content: string
          created_at: string
          disappear_at: string | null
          disappear_in_seconds: number | null
          disappear_notified: boolean | null
          duration_seconds: number | null
          edited_at: string | null
          expires_at: string | null
          forward_hide_sender: boolean
          forwards_count: number
          id: string
          is_published: boolean
          media_type: string | null
          media_url: string | null
          pinned: boolean
          reply_to_message_id: string | null
          scheduled_at: string | null
          sender_id: string
          shared_post_id: string | null
          shared_reel_id: string | null
          silent: boolean
          views_count: number
        }
        Insert: {
          album_id?: string | null
          author_signature?: string | null
          channel_id: string
          content: string
          created_at?: string
          disappear_at?: string | null
          disappear_in_seconds?: number | null
          disappear_notified?: boolean | null
          duration_seconds?: number | null
          edited_at?: string | null
          expires_at?: string | null
          forward_hide_sender?: boolean
          forwards_count?: number
          id?: string
          is_published?: boolean
          media_type?: string | null
          media_url?: string | null
          pinned?: boolean
          reply_to_message_id?: string | null
          scheduled_at?: string | null
          sender_id: string
          shared_post_id?: string | null
          shared_reel_id?: string | null
          silent?: boolean
          views_count?: number
        }
        Update: {
          album_id?: string | null
          author_signature?: string | null
          channel_id?: string
          content?: string
          created_at?: string
          disappear_at?: string | null
          disappear_in_seconds?: number | null
          disappear_notified?: boolean | null
          duration_seconds?: number | null
          edited_at?: string | null
          expires_at?: string | null
          forward_hide_sender?: boolean
          forwards_count?: number
          id?: string
          is_published?: boolean
          media_type?: string | null
          media_url?: string | null
          pinned?: boolean
          reply_to_message_id?: string | null
          scheduled_at?: string | null
          sender_id?: string
          shared_post_id?: string | null
          shared_reel_id?: string | null
          silent?: boolean
          views_count?: number
        }
        Relationships: [
          {
            foreignKeyName: "channel_messages_channel_id_fkey"
            columns: ["channel_id"]
            isOneToOne: false
            referencedRelation: "channels"
            referencedColumns: ["id"]
          },
          {
            foreignKeyName: "channel_messages_shared_post_id_fkey"
            columns: ["shared_post_id"]
            isOneToOne: false
            referencedRelation: "posts"
            referencedColumns: ["id"]
          },
          {
            foreignKeyName: "channel_messages_shared_reel_id_fkey"
            columns: ["shared_reel_id"]
            isOneToOne: false
            referencedRelation: "reels"
            referencedColumns: ["id"]
          },
        ]
      }
      channel_moderation_log: {
        Row: {
          action: string
          actor_id: string
          channel_id: string
          created_at: string
          details: Json | null
          id: string
          target_user_id: string | null
        }
        Insert: {
          action: string
          actor_id: string
          channel_id: string
          created_at?: string
          details?: Json | null
          id?: string
          target_user_id?: string | null
        }
        Update: {
          action?: string
          actor_id?: string
          channel_id?: string
          created_at?: string
          details?: Json | null
          id?: string
          target_user_id?: string | null
        }
        Relationships: [
          {
            foreignKeyName: "channel_moderation_log_channel_id_fkey"
            columns: ["channel_id"]
            isOneToOne: false
            referencedRelation: "channels"
            referencedColumns: ["id"]
          },
        ]
      }
      channel_pins: {
        Row: {
          channel_id: string
          message_id: string
          pinned_at: string
          pinned_by: string
          silent: boolean
        }
        Insert: {
          channel_id: string
          message_id: string
          pinned_at?: string
          pinned_by: string
          silent?: boolean
        }
        Update: {
          channel_id?: string
          message_id?: string
          pinned_at?: string
          pinned_by?: string
          silent?: boolean
        }
        Relationships: [
          {
            foreignKeyName: "channel_pins_channel_id_fkey"
            columns: ["channel_id"]
            isOneToOne: true
            referencedRelation: "channels"
            referencedColumns: ["id"]
          },
          {
            foreignKeyName: "channel_pins_message_id_fkey"
            columns: ["message_id"]
            isOneToOne: false
            referencedRelation: "channel_messages"
            referencedColumns: ["id"]
          },
        ]
      }
      channel_post_stats: {
        Row: {
          channel_id: string
          comments_count: number
          created_at: string
          forwards: number
          id: string
          post_id: string
          reach: number
          reactions: Json
          views: number
        }
        Insert: {
          channel_id: string
          comments_count?: number
          created_at?: string
          forwards?: number
          id?: string
          post_id: string
          reach?: number
          reactions?: Json
          views?: number
        }
        Update: {
          channel_id?: string
          comments_count?: number
          created_at?: string
          forwards?: number
          id?: string
          post_id?: string
          reach?: number
          reactions?: Json
          views?: number
        }
        Relationships: [
          {
            foreignKeyName: "channel_post_stats_channel_id_fkey"
            columns: ["channel_id"]
            isOneToOne: false
            referencedRelation: "channels"
            referencedColumns: ["id"]
          },
          {
            foreignKeyName: "channel_post_stats_post_id_fkey"
            columns: ["post_id"]
            isOneToOne: true
            referencedRelation: "channel_messages"
            referencedColumns: ["id"]
          },
        ]
      }
      channel_post_view_log: {
        Row: {
          post_id: string
          user_id: string
          viewed_at: string
        }
        Insert: {
          post_id: string
          user_id: string
          viewed_at?: string
        }
        Update: {
          post_id?: string
          user_id?: string
          viewed_at?: string
        }
        Relationships: [
          {
            foreignKeyName: "channel_post_view_log_post_id_fkey"
            columns: ["post_id"]
            isOneToOne: false
            referencedRelation: "channel_messages"
            referencedColumns: ["id"]
          },
        ]
      }
      channel_role_capabilities: {
        Row: {
          capability_key: string
          created_at: string
          id: string
          is_allowed: boolean
          role: string
        }
        Insert: {
          capability_key: string
          created_at?: string
          id?: string
          is_allowed?: boolean
          role: string
        }
        Update: {
          capability_key?: string
          created_at?: string
          id?: string
          is_allowed?: boolean
          role?: string
        }
        Relationships: [
          {
            foreignKeyName: "channel_role_capabilities_capability_key_fkey"
            columns: ["capability_key"]
            isOneToOne: false
            referencedRelation: "channel_capability_catalog"
            referencedColumns: ["key"]
          },
        ]
      }
      channel_user_settings: {
        Row: {
          channel_id: string
          created_at: string
          id: string
          muted_until: string | null
          notifications_enabled: boolean
          updated_at: string
          user_id: string
        }
        Insert: {
          channel_id: string
          created_at?: string
          id?: string
          muted_until?: string | null
          notifications_enabled?: boolean
          updated_at?: string
          user_id: string
        }
        Update: {
          channel_id?: string
          created_at?: string
          id?: string
          muted_until?: string | null
          notifications_enabled?: boolean
          updated_at?: string
          user_id?: string
        }
        Relationships: [
          {
            foreignKeyName: "channel_user_settings_channel_id_fkey"
            columns: ["channel_id"]
            isOneToOne: false
            referencedRelation: "channels"
            referencedColumns: ["id"]
          },
        ]
      }
      channels: {
        Row: {
          auto_delete_seconds: number
          avatar_url: string | null
          created_at: string
          default_disappear_seconds: number | null
          default_reactions: string[] | null
          description: string | null
          id: string
          is_public: boolean
          linked_chat_id: string | null
          member_count: number
          name: string
          owner_id: string
          pinned_message_id: string | null
          protected_content: boolean
          signatures_enabled: boolean
          slow_mode_seconds: number
          updated_at: string
          username: string | null
          verified: boolean
        }
        Insert: {
          auto_delete_seconds?: number
          avatar_url?: string | null
          created_at?: string
          default_disappear_seconds?: number | null
          default_reactions?: string[] | null
          description?: string | null
          id?: string
          is_public?: boolean
          linked_chat_id?: string | null
          member_count?: number
          name: string
          owner_id: string
          pinned_message_id?: string | null
          protected_content?: boolean
          signatures_enabled?: boolean
          slow_mode_seconds?: number
          updated_at?: string
          username?: string | null
          verified?: boolean
        }
        Update: {
          auto_delete_seconds?: number
          avatar_url?: string | null
          created_at?: string
          default_disappear_seconds?: number | null
          default_reactions?: string[] | null
          description?: string | null
          id?: string
          is_public?: boolean
          linked_chat_id?: string | null
          member_count?: number
          name?: string
          owner_id?: string
          pinned_message_id?: string | null
          protected_content?: boolean
          signatures_enabled?: boolean
          slow_mode_seconds?: number
          updated_at?: string
          username?: string | null
          verified?: boolean
        }
        Relationships: []
      }
      chat_client_metrics: {
        Row: {
          actor_id: string | null
          created_at: string
          id: string
          labels: Json
          metric_name: string
          metric_value: number
        }
        Insert: {
          actor_id?: string | null
          created_at?: string
          id?: string
          labels?: Json
          metric_name: string
          metric_value: number
        }
        Update: {
          actor_id?: string | null
          created_at?: string
          id?: string
          labels?: Json
          metric_name?: string
          metric_value?: number
        }
        Relationships: []
      }
      chat_device_subscriptions_v11: {
        Row: {
          device_id: string
          dialog_id: string
          mode: string
          updated_at: string
          user_id: string
        }
        Insert: {
          device_id: string
          dialog_id: string
          mode: string
          updated_at?: string
          user_id: string
        }
        Update: {
          device_id?: string
          dialog_id?: string
          mode?: string
          updated_at?: string
          user_id?: string
        }
        Relationships: [
          {
            foreignKeyName: "chat_device_subscriptions_v11_dialog_id_fkey"
            columns: ["dialog_id"]
            isOneToOne: false
            referencedRelation: "conversations"
            referencedColumns: ["id"]
          },
        ]
      }
      chat_encryption_keys: {
        Row: {
          algorithm: string
          conversation_id: string
          created_at: string
          created_by: string | null
          encrypted_key: string | null
          is_active: boolean
          key_id: string
          key_version: number
          recipient_id: string | null
          revoked_at: string | null
          sender_id: string | null
          sender_public_key_raw: string | null
          wrapped_key: string | null
        }
        Insert: {
          algorithm?: string
          conversation_id: string
          created_at?: string
          created_by?: string | null
          encrypted_key?: string | null
          is_active?: boolean
          key_id?: string
          key_version?: number
          recipient_id?: string | null
          revoked_at?: string | null
          sender_id?: string | null
          sender_public_key_raw?: string | null
          wrapped_key?: string | null
        }
        Update: {
          algorithm?: string
          conversation_id?: string
          created_at?: string
          created_by?: string | null
          encrypted_key?: string | null
          is_active?: boolean
          key_id?: string
          key_version?: number
          recipient_id?: string | null
          revoked_at?: string | null
          sender_id?: string | null
          sender_public_key_raw?: string | null
          wrapped_key?: string | null
        }
        Relationships: [
          {
            foreignKeyName: "chat_encryption_keys_conversation_id_fkey"
            columns: ["conversation_id"]
            isOneToOne: false
            referencedRelation: "conversations"
            referencedColumns: ["id"]
          },
        ]
      }
      chat_events: {
        Row: {
          actor_id: string | null
          caused_by_client_msg_id: string | null
          caused_by_client_write_seq: number | null
          caused_by_device_id: string | null
          created_at: string
          dialog_id: string | null
          event_id: string
          event_seq: number
          event_type: string
          flags_json: Json
          id: string
          partition_key: string
          payload_hash: string
          payload_json: Json
          scope: string
          stream_id: string
        }
        Insert: {
          actor_id?: string | null
          caused_by_client_msg_id?: string | null
          caused_by_client_write_seq?: number | null
          caused_by_device_id?: string | null
          created_at?: string
          dialog_id?: string | null
          event_id?: string
          event_seq: number
          event_type: string
          flags_json?: Json
          id?: string
          partition_key: string
          payload_hash: string
          payload_json?: Json
          scope: string
          stream_id: string
        }
        Update: {
          actor_id?: string | null
          caused_by_client_msg_id?: string | null
          caused_by_client_write_seq?: number | null
          caused_by_device_id?: string | null
          created_at?: string
          dialog_id?: string | null
          event_id?: string
          event_seq?: number
          event_type?: string
          flags_json?: Json
          id?: string
          partition_key?: string
          payload_hash?: string
          payload_json?: Json
          scope?: string
          stream_id?: string
        }
        Relationships: [
          {
            foreignKeyName: "chat_events_dialog_id_fkey"
            columns: ["dialog_id"]
            isOneToOne: false
            referencedRelation: "conversations"
            referencedColumns: ["id"]
          },
        ]
      }
      chat_folder_items: {
        Row: {
          created_at: string
          folder_id: string
          id: string
          item_id: string
          item_kind: string
        }
        Insert: {
          created_at?: string
          folder_id: string
          id?: string
          item_id: string
          item_kind: string
        }
        Update: {
          created_at?: string
          folder_id?: string
          id?: string
          item_id?: string
          item_kind?: string
        }
        Relationships: [
          {
            foreignKeyName: "chat_folder_items_folder_id_fkey"
            columns: ["folder_id"]
            isOneToOne: false
            referencedRelation: "chat_folders"
            referencedColumns: ["id"]
          },
        ]
      }
      chat_folders: {
        Row: {
          created_at: string
          id: string
          is_hidden: boolean
          is_system: boolean
          name: string
          passcode_hash: string | null
          sort_order: number
          system_kind: string | null
          updated_at: string
          user_id: string
        }
        Insert: {
          created_at?: string
          id?: string
          is_hidden?: boolean
          is_system?: boolean
          name: string
          passcode_hash?: string | null
          sort_order?: number
          system_kind?: string | null
          updated_at?: string
          user_id: string
        }
        Update: {
          created_at?: string
          id?: string
          is_hidden?: boolean
          is_system?: boolean
          name?: string
          passcode_hash?: string | null
          sort_order?: number
          system_kind?: string | null
          updated_at?: string
          user_id?: string
        }
        Relationships: []
      }
      chat_inbox_projection: {
        Row: {
          activity_seq: number
          dialog_id: string
          has_draft: boolean
          last_read_seq: number
          muted: boolean
          pinned_rank: number | null
          preview_text: string
          sort_key: string
          unread_count: number
          updated_at: string
          user_id: string
        }
        Insert: {
          activity_seq?: number
          dialog_id: string
          has_draft?: boolean
          last_read_seq?: number
          muted?: boolean
          pinned_rank?: number | null
          preview_text?: string
          sort_key: string
          unread_count?: number
          updated_at?: string
          user_id: string
        }
        Update: {
          activity_seq?: number
          dialog_id?: string
          has_draft?: boolean
          last_read_seq?: number
          muted?: boolean
          pinned_rank?: number | null
          preview_text?: string
          sort_key?: string
          unread_count?: number
          updated_at?: string
          user_id?: string
        }
        Relationships: [
          {
            foreignKeyName: "chat_inbox_projection_dialog_id_fkey"
            columns: ["dialog_id"]
            isOneToOne: false
            referencedRelation: "conversations"
            referencedColumns: ["id"]
          },
        ]
      }
      chat_rate_limits: {
        Row: {
          action: string
          bucket_start: string
          count: number
          updated_at: string
          user_id: string
        }
        Insert: {
          action: string
          bucket_start: string
          count: number
          updated_at?: string
          user_id: string
        }
        Update: {
          action?: string
          bucket_start?: string
          count?: number
          updated_at?: string
          user_id?: string
        }
        Relationships: []
      }
      chat_receipts: {
        Row: {
          client_write_seq: number
          created_at: string
          device_id: string
          id: string
          result_event_seq: number | null
          result_stream_id: string | null
          status: string
          trace_id: string
          user_id: string
        }
        Insert: {
          client_write_seq: number
          created_at?: string
          device_id: string
          id?: string
          result_event_seq?: number | null
          result_stream_id?: string | null
          status: string
          trace_id?: string
          user_id: string
        }
        Update: {
          client_write_seq?: number
          created_at?: string
          device_id?: string
          id?: string
          result_event_seq?: number | null
          result_stream_id?: string | null
          status?: string
          trace_id?: string
          user_id?: string
        }
        Relationships: []
      }
      chat_recovery_throttle: {
        Row: {
          device_id: string
          dialog_id: string
          last_called_at: string
          op_name: string
          user_id: string
        }
        Insert: {
          device_id: string
          dialog_id: string
          last_called_at?: string
          op_name: string
          user_id: string
        }
        Update: {
          device_id?: string
          dialog_id?: string
          last_called_at?: string
          op_name?: string
          user_id?: string
        }
        Relationships: [
          {
            foreignKeyName: "chat_recovery_throttle_dialog_id_fkey"
            columns: ["dialog_id"]
            isOneToOne: false
            referencedRelation: "conversations"
            referencedColumns: ["id"]
          },
        ]
      }
      chat_shortcuts: {
        Row: {
          chat_id: string
          chat_type: string
          created_at: string | null
          icon_url: string | null
          id: string
          label: string
          sort_order: number | null
          user_id: string
        }
        Insert: {
          chat_id: string
          chat_type: string
          created_at?: string | null
          icon_url?: string | null
          id?: string
          label: string
          sort_order?: number | null
          user_id: string
        }
        Update: {
          chat_id?: string
          chat_type?: string
          created_at?: string | null
          icon_url?: string | null
          id?: string
          label?: string
          sort_order?: number | null
          user_id?: string
        }
        Relationships: []
      }
      chat_stream_heads: {
        Row: {
          last_event_seq: number
          stream_id: string
          updated_at: string
        }
        Insert: {
          last_event_seq?: number
          stream_id: string
          updated_at?: string
        }
        Update: {
          last_event_seq?: number
          stream_id?: string
          updated_at?: string
        }
        Relationships: []
      }
      chat_subscription_budget_config_v11: {
        Row: {
          key: string
          updated_at: string
          value: Json
        }
        Insert: {
          key: string
          updated_at?: string
          value: Json
        }
        Update: {
          key?: string
          updated_at?: string
          value?: Json
        }
        Relationships: []
      }
      chat_v11_rollout_control: {
        Row: {
          kill_switch: boolean
          note: string | null
          singleton_id: boolean
          stage: string
          updated_at: string
          updated_by: string | null
        }
        Insert: {
          kill_switch?: boolean
          note?: string | null
          singleton_id?: boolean
          stage?: string
          updated_at?: string
          updated_by?: string | null
        }
        Update: {
          kill_switch?: boolean
          note?: string | null
          singleton_id?: boolean
          stage?: string
          updated_at?: string
          updated_by?: string | null
        }
        Relationships: []
      }
      chat_v11_rollout_journal: {
        Row: {
          changed_at: string
          changed_by: string | null
          id: string
          kill_switch: boolean
          note: string | null
          source: string
          stage: string
        }
        Insert: {
          changed_at?: string
          changed_by?: string | null
          id?: string
          kill_switch: boolean
          note?: string | null
          source?: string
          stage: string
        }
        Update: {
          changed_at?: string
          changed_by?: string | null
          id?: string
          kill_switch?: boolean
          note?: string | null
          source?: string
          stage?: string
        }
        Relationships: []
      }
      chat_write_ledger: {
        Row: {
          actor_id: string
          canonical_dialog_id: string | null
          canonical_last_read_seq: number | null
          canonical_msg_id: string | null
          canonical_msg_seq: number | null
          client_write_seq: number
          created_at: string
          device_id: string
          error_code: string | null
          error_details: Json
          expires_at: string
          id: string
          op_type: string
          status: string
          updated_at: string
        }
        Insert: {
          actor_id: string
          canonical_dialog_id?: string | null
          canonical_last_read_seq?: number | null
          canonical_msg_id?: string | null
          canonical_msg_seq?: number | null
          client_write_seq: number
          created_at?: string
          device_id: string
          error_code?: string | null
          error_details?: Json
          expires_at?: string
          id?: string
          op_type: string
          status: string
          updated_at?: string
        }
        Update: {
          actor_id?: string
          canonical_dialog_id?: string | null
          canonical_last_read_seq?: number | null
          canonical_msg_id?: string | null
          canonical_msg_seq?: number | null
          client_write_seq?: number
          created_at?: string
          device_id?: string
          error_code?: string | null
          error_details?: Json
          expires_at?: string
          id?: string
          op_type?: string
          status?: string
          updated_at?: string
        }
        Relationships: [
          {
            foreignKeyName: "chat_write_ledger_canonical_dialog_id_fkey"
            columns: ["canonical_dialog_id"]
            isOneToOne: false
            referencedRelation: "conversations"
            referencedColumns: ["id"]
          },
          {
            foreignKeyName: "chat_write_ledger_canonical_msg_id_fkey"
            columns: ["canonical_msg_id"]
            isOneToOne: false
            referencedRelation: "messages"
            referencedColumns: ["id"]
          },
        ]
      }
      close_friends: {
        Row: {
          created_at: string
          friend_id: string
          user_id: string
        }
        Insert: {
          created_at?: string
          friend_id: string
          user_id: string
        }
        Update: {
          created_at?: string
          friend_id?: string
          user_id?: string
        }
        Relationships: []
      }
      collectible_usernames: {
        Row: {
          category: string | null
          created_at: string | null
          id: string
          is_for_sale: boolean | null
          listed_at: string | null
          owner_id: string | null
          price_stars: number
          purchased_at: string | null
          username: string
        }
        Insert: {
          category?: string | null
          created_at?: string | null
          id?: string
          is_for_sale?: boolean | null
          listed_at?: string | null
          owner_id?: string | null
          price_stars?: number
          purchased_at?: string | null
          username: string
        }
        Update: {
          category?: string | null
          created_at?: string | null
          id?: string
          is_for_sale?: boolean | null
          listed_at?: string | null
          owner_id?: string | null
          price_stars?: number
          purchased_at?: string | null
          username?: string
        }
        Relationships: []
      }
      comment_likes: {
        Row: {
          comment_id: string
          created_at: string
          id: string
          user_id: string
        }
        Insert: {
          comment_id: string
          created_at?: string
          id?: string
          user_id: string
        }
        Update: {
          comment_id?: string
          created_at?: string
          id?: string
          user_id?: string
        }
        Relationships: [
          {
            foreignKeyName: "comment_likes_comment_id_fkey"
            columns: ["comment_id"]
            isOneToOne: false
            referencedRelation: "comments"
            referencedColumns: ["id"]
          },
        ]
      }
      comments: {
        Row: {
          author_id: string
          content: string
          created_at: string
          id: string
          likes_count: number
          parent_id: string | null
          post_id: string
        }
        Insert: {
          author_id: string
          content: string
          created_at?: string
          id?: string
          likes_count?: number
          parent_id?: string | null
          post_id: string
        }
        Update: {
          author_id?: string
          content?: string
          created_at?: string
          id?: string
          likes_count?: number
          parent_id?: string | null
          post_id?: string
        }
        Relationships: [
          {
            foreignKeyName: "comments_parent_id_fkey"
            columns: ["parent_id"]
            isOneToOne: false
            referencedRelation: "comments"
            referencedColumns: ["id"]
          },
          {
            foreignKeyName: "comments_post_id_fkey"
            columns: ["post_id"]
            isOneToOne: false
            referencedRelation: "posts"
            referencedColumns: ["id"]
          },
        ]
      }
      content_drafts: {
        Row: {
          content: string | null
          created_at: string | null
          id: string
          media: Json | null
          metadata: Json | null
          type: string
          updated_at: string | null
          user_id: string
        }
        Insert: {
          content?: string | null
          created_at?: string | null
          id?: string
          media?: Json | null
          metadata?: Json | null
          type: string
          updated_at?: string | null
          user_id: string
        }
        Update: {
          content?: string | null
          created_at?: string | null
          id?: string
          media?: Json | null
          metadata?: Json | null
          type?: string
          updated_at?: string | null
          user_id?: string
        }
        Relationships: []
      }
      content_filters: {
        Row: {
          created_at: string
          filter_type: string
          id: string
          user_id: string
          value: string
        }
        Insert: {
          created_at?: string
          filter_type: string
          id?: string
          user_id: string
          value: string
        }
        Update: {
          created_at?: string
          filter_type?: string
          id?: string
          user_id?: string
          value?: string
        }
        Relationships: []
      }
      content_flags: {
        Row: {
          confidence: number | null
          content_id: string
          content_type: string
          created_at: string | null
          flag_type: string
          id: string
          source: string | null
          status: string | null
        }
        Insert: {
          confidence?: number | null
          content_id: string
          content_type: string
          created_at?: string | null
          flag_type: string
          id?: string
          source?: string | null
          status?: string | null
        }
        Update: {
          confidence?: number | null
          content_id?: string
          content_type?: string
          created_at?: string | null
          flag_type?: string
          id?: string
          source?: string | null
          status?: string | null
        }
        Relationships: []
      }
      content_moderation_actions: {
        Row: {
          actor_id: string | null
          actor_type: string
          content_id: string
          content_type: string
          created_at: string
          id: string
          new_decision: Database["public"]["Enums"]["moderation_decision"]
          new_distribution_class: Database["public"]["Enums"]["distribution_class"]
          notes: string | null
          previous_decision:
            | Database["public"]["Enums"]["moderation_decision"]
            | null
          previous_distribution_class:
            | Database["public"]["Enums"]["distribution_class"]
            | null
          reason_code: string | null
        }
        Insert: {
          actor_id?: string | null
          actor_type: string
          content_id: string
          content_type: string
          created_at?: string
          id?: string
          new_decision: Database["public"]["Enums"]["moderation_decision"]
          new_distribution_class: Database["public"]["Enums"]["distribution_class"]
          notes?: string | null
          previous_decision?:
            | Database["public"]["Enums"]["moderation_decision"]
            | null
          previous_distribution_class?:
            | Database["public"]["Enums"]["distribution_class"]
            | null
          reason_code?: string | null
        }
        Update: {
          actor_id?: string | null
          actor_type?: string
          content_id?: string
          content_type?: string
          created_at?: string
          id?: string
          new_decision?: Database["public"]["Enums"]["moderation_decision"]
          new_distribution_class?: Database["public"]["Enums"]["distribution_class"]
          notes?: string | null
          previous_decision?:
            | Database["public"]["Enums"]["moderation_decision"]
            | null
          previous_distribution_class?:
            | Database["public"]["Enums"]["distribution_class"]
            | null
          reason_code?: string | null
        }
        Relationships: []
      }
      content_moderation_status: {
        Row: {
          content_id: string
          content_type: string
          created_at: string
          decided_at: string | null
          decided_by: string | null
          decision: Database["public"]["Enums"]["moderation_decision"]
          distribution_class: Database["public"]["Enums"]["distribution_class"]
          notes: string | null
          reason_code: string | null
          source: string
          updated_at: string
        }
        Insert: {
          content_id: string
          content_type: string
          created_at?: string
          decided_at?: string | null
          decided_by?: string | null
          decision?: Database["public"]["Enums"]["moderation_decision"]
          distribution_class?: Database["public"]["Enums"]["distribution_class"]
          notes?: string | null
          reason_code?: string | null
          source?: string
          updated_at?: string
        }
        Update: {
          content_id?: string
          content_type?: string
          created_at?: string
          decided_at?: string | null
          decided_by?: string | null
          decision?: Database["public"]["Enums"]["moderation_decision"]
          distribution_class?: Database["public"]["Enums"]["distribution_class"]
          notes?: string | null
          reason_code?: string | null
          source?: string
          updated_at?: string
        }
        Relationships: []
      }
      content_reports: {
        Row: {
          action: string | null
          content_id: string
          content_type: string
          created_at: string | null
          description: string | null
          id: string
          moderator_id: string | null
          reason: string
          reporter_id: string
          reviewed_at: string | null
          status: string | null
        }
        Insert: {
          action?: string | null
          content_id: string
          content_type: string
          created_at?: string | null
          description?: string | null
          id?: string
          moderator_id?: string | null
          reason: string
          reporter_id: string
          reviewed_at?: string | null
          status?: string | null
        }
        Update: {
          action?: string | null
          content_id?: string
          content_type?: string
          created_at?: string | null
          description?: string | null
          id?: string
          moderator_id?: string | null
          reason?: string
          reporter_id?: string
          reviewed_at?: string | null
          status?: string | null
        }
        Relationships: []
      }
      content_reports_v1: {
        Row: {
          content_id: string
          content_type: string
          created_at: string
          description: string | null
          id: string
          quality_multiplier: number
          report_type: string
          reporter_id: string | null
          trust_score: number | null
          weight: number
        }
        Insert: {
          content_id: string
          content_type: string
          created_at?: string
          description?: string | null
          id?: string
          quality_multiplier?: number
          report_type: string
          reporter_id?: string | null
          trust_score?: number | null
          weight?: number
        }
        Update: {
          content_id?: string
          content_type?: string
          created_at?: string
          description?: string | null
          id?: string
          quality_multiplier?: number
          report_type?: string
          reporter_id?: string | null
          trust_score?: number | null
          weight?: number
        }
        Relationships: []
      }
      controversial_content_flags: {
        Row: {
          engagement_velocity: number
          expires_at: string | null
          flagged_at: string
          hide_rate: number
          hide_threshold: number
          is_controversial: boolean
          needs_review: boolean
          penalty_score: number
          reel_id: string
          report_rate: number
          report_threshold: number
          reviewed_at: string | null
          reviewed_by: string | null
          updated_at: string
          velocity_threshold: number
        }
        Insert: {
          engagement_velocity: number
          expires_at?: string | null
          flagged_at?: string
          hide_rate: number
          hide_threshold: number
          is_controversial?: boolean
          needs_review?: boolean
          penalty_score?: number
          reel_id: string
          report_rate: number
          report_threshold: number
          reviewed_at?: string | null
          reviewed_by?: string | null
          updated_at?: string
          velocity_threshold: number
        }
        Update: {
          engagement_velocity?: number
          expires_at?: string | null
          flagged_at?: string
          hide_rate?: number
          hide_threshold?: number
          is_controversial?: boolean
          needs_review?: boolean
          penalty_score?: number
          reel_id?: string
          report_rate?: number
          report_threshold?: number
          reviewed_at?: string | null
          reviewed_by?: string | null
          updated_at?: string
          velocity_threshold?: number
        }
        Relationships: [
          {
            foreignKeyName: "controversial_content_flags_reel_id_fkey"
            columns: ["reel_id"]
            isOneToOne: true
            referencedRelation: "reels"
            referencedColumns: ["id"]
          },
        ]
      }
      conversation_cursors: {
        Row: {
          conversation_id: string
          delivered_up_to_seq: number
          read_up_to_seq: number
          updated_at: string
          user_id: string
        }
        Insert: {
          conversation_id: string
          delivered_up_to_seq?: number
          read_up_to_seq?: number
          updated_at?: string
          user_id: string
        }
        Update: {
          conversation_id?: string
          delivered_up_to_seq?: number
          read_up_to_seq?: number
          updated_at?: string
          user_id?: string
        }
        Relationships: [
          {
            foreignKeyName: "conversation_cursors_conversation_id_fkey"
            columns: ["conversation_id"]
            isOneToOne: false
            referencedRelation: "conversations"
            referencedColumns: ["id"]
          },
        ]
      }
      conversation_participants: {
        Row: {
          conversation_id: string
          id: string
          joined_at: string
          last_read_at: string | null
          role: string
          user_id: string
        }
        Insert: {
          conversation_id: string
          id?: string
          joined_at?: string
          last_read_at?: string | null
          role?: string
          user_id: string
        }
        Update: {
          conversation_id?: string
          id?: string
          joined_at?: string
          last_read_at?: string | null
          role?: string
          user_id?: string
        }
        Relationships: [
          {
            foreignKeyName: "conversation_participants_conversation_id_fkey"
            columns: ["conversation_id"]
            isOneToOne: false
            referencedRelation: "conversations"
            referencedColumns: ["id"]
          },
        ]
      }
      conversation_pins: {
        Row: {
          conversation_id: string
          message_id: string
          pinned_at: string
          pinned_by: string
          silent: boolean
        }
        Insert: {
          conversation_id: string
          message_id: string
          pinned_at?: string
          pinned_by: string
          silent?: boolean
        }
        Update: {
          conversation_id?: string
          message_id?: string
          pinned_at?: string
          pinned_by?: string
          silent?: boolean
        }
        Relationships: [
          {
            foreignKeyName: "conversation_pins_conversation_id_fkey"
            columns: ["conversation_id"]
            isOneToOne: true
            referencedRelation: "conversations"
            referencedColumns: ["id"]
          },
          {
            foreignKeyName: "conversation_pins_message_id_fkey"
            columns: ["message_id"]
            isOneToOne: false
            referencedRelation: "messages"
            referencedColumns: ["id"]
          },
        ]
      }
      conversation_state: {
        Row: {
          conversation_id: string
          last_created_at: string | null
          last_media_kind: string | null
          last_message_id: string | null
          last_preview_text: string | null
          last_sender_id: string | null
          last_seq: number
          min_seq: number | null
          retention_mode: string | null
          updated_at: string
        }
        Insert: {
          conversation_id: string
          last_created_at?: string | null
          last_media_kind?: string | null
          last_message_id?: string | null
          last_preview_text?: string | null
          last_sender_id?: string | null
          last_seq?: number
          min_seq?: number | null
          retention_mode?: string | null
          updated_at?: string
        }
        Update: {
          conversation_id?: string
          last_created_at?: string | null
          last_media_kind?: string | null
          last_message_id?: string | null
          last_preview_text?: string | null
          last_sender_id?: string | null
          last_seq?: number
          min_seq?: number | null
          retention_mode?: string | null
          updated_at?: string
        }
        Relationships: [
          {
            foreignKeyName: "conversation_state_conversation_id_fkey"
            columns: ["conversation_id"]
            isOneToOne: true
            referencedRelation: "conversations"
            referencedColumns: ["id"]
          },
          {
            foreignKeyName: "conversation_state_last_message_id_fkey"
            columns: ["last_message_id"]
            isOneToOne: false
            referencedRelation: "messages"
            referencedColumns: ["id"]
          },
        ]
      }
      conversations: {
        Row: {
          created_at: string
          default_disappear_seconds: number | null
          default_disappear_timer: number | null
          emoji: string | null
          encryption_enabled: boolean | null
          group_avatar_url: string | null
          group_name: string | null
          id: string
          is_secret: boolean | null
          last_message_seq: number
          server_seq: number
          theme: string | null
          translation_enabled: boolean | null
          updated_at: string
          vanish_mode: boolean | null
          vanish_mode_activated_at: string | null
        }
        Insert: {
          created_at?: string
          default_disappear_seconds?: number | null
          default_disappear_timer?: number | null
          emoji?: string | null
          encryption_enabled?: boolean | null
          group_avatar_url?: string | null
          group_name?: string | null
          id?: string
          is_secret?: boolean | null
          last_message_seq?: number
          server_seq?: number
          theme?: string | null
          translation_enabled?: boolean | null
          updated_at?: string
          vanish_mode?: boolean | null
          vanish_mode_activated_at?: string | null
        }
        Update: {
          created_at?: string
          default_disappear_seconds?: number | null
          default_disappear_timer?: number | null
          emoji?: string | null
          encryption_enabled?: boolean | null
          group_avatar_url?: string | null
          group_name?: string | null
          id?: string
          is_secret?: boolean | null
          last_message_seq?: number
          server_seq?: number
          theme?: string | null
          translation_enabled?: boolean | null
          updated_at?: string
          vanish_mode?: boolean | null
          vanish_mode_activated_at?: string | null
        }
        Relationships: []
      }
      coordinated_behavior_clusters: {
        Row: {
          behavior_pattern: string | null
          cluster_id: string
          confidence: number
          created_at: string
          first_detected_at: string | null
          id: number
          last_updated_at: string | null
          member_user_ids: string[]
          representative_user_id: string
          signal_strength: number | null
          status: string | null
        }
        Insert: {
          behavior_pattern?: string | null
          cluster_id?: string
          confidence: number
          created_at?: string
          first_detected_at?: string | null
          id?: number
          last_updated_at?: string | null
          member_user_ids: string[]
          representative_user_id: string
          signal_strength?: number | null
          status?: string | null
        }
        Update: {
          behavior_pattern?: string | null
          cluster_id?: string
          confidence?: number
          created_at?: string
          first_detected_at?: string | null
          id?: number
          last_updated_at?: string | null
          member_user_ids?: string[]
          representative_user_id?: string
          signal_strength?: number | null
          status?: string | null
        }
        Relationships: []
      }
      core_events: {
        Row: {
          actor_id: string
          client_ts: string | null
          client_version: number | null
          command_type: string
          created_at: string
          device_id: string
          event_id: string
          event_seq: number
          idempotency_key_norm: string
          payload: Json
          payload_hash: string
          scope_id: string
          server_time: string
          trace_id: string
        }
        Insert: {
          actor_id: string
          client_ts?: string | null
          client_version?: number | null
          command_type: string
          created_at?: string
          device_id: string
          event_id?: string
          event_seq: number
          idempotency_key_norm: string
          payload: Json
          payload_hash: string
          scope_id: string
          server_time?: string
          trace_id: string
        }
        Update: {
          actor_id?: string
          client_ts?: string | null
          client_version?: number | null
          command_type?: string
          created_at?: string
          device_id?: string
          event_id?: string
          event_seq?: number
          idempotency_key_norm?: string
          payload?: Json
          payload_hash?: string
          scope_id?: string
          server_time?: string
          trace_id?: string
        }
        Relationships: [
          {
            foreignKeyName: "core_events_scope_id_fkey"
            columns: ["scope_id"]
            isOneToOne: false
            referencedRelation: "core_scopes"
            referencedColumns: ["scope_id"]
          },
        ]
      }
      core_receipts: {
        Row: {
          delivered_at: string | null
          last_delivered_seq: number | null
          last_read_seq: number | null
          read_at: string | null
          scope_id: string
          user_id: string
        }
        Insert: {
          delivered_at?: string | null
          last_delivered_seq?: number | null
          last_read_seq?: number | null
          read_at?: string | null
          scope_id: string
          user_id: string
        }
        Update: {
          delivered_at?: string | null
          last_delivered_seq?: number | null
          last_read_seq?: number | null
          read_at?: string | null
          scope_id?: string
          user_id?: string
        }
        Relationships: [
          {
            foreignKeyName: "core_receipts_scope_id_fkey"
            columns: ["scope_id"]
            isOneToOne: false
            referencedRelation: "core_scopes"
            referencedColumns: ["scope_id"]
          },
        ]
      }
      core_scope_members: {
        Row: {
          join_state: string
          joined_at: string
          last_delivered_seq: number | null
          last_read_seq: number | null
          metadata: Json | null
          removed_at: string | null
          removed_by: string | null
          role: string
          scope_id: string
          updated_at: string
          user_id: string
        }
        Insert: {
          join_state?: string
          joined_at?: string
          last_delivered_seq?: number | null
          last_read_seq?: number | null
          metadata?: Json | null
          removed_at?: string | null
          removed_by?: string | null
          role?: string
          scope_id: string
          updated_at?: string
          user_id: string
        }
        Update: {
          join_state?: string
          joined_at?: string
          last_delivered_seq?: number | null
          last_read_seq?: number | null
          metadata?: Json | null
          removed_at?: string | null
          removed_by?: string | null
          role?: string
          scope_id?: string
          updated_at?: string
          user_id?: string
        }
        Relationships: [
          {
            foreignKeyName: "core_scope_members_scope_id_fkey"
            columns: ["scope_id"]
            isOneToOne: false
            referencedRelation: "core_scopes"
            referencedColumns: ["scope_id"]
          },
        ]
      }
      core_scopes: {
        Row: {
          created_at: string
          created_by: string
          data_classification: string
          delivery_strategy: string
          dm_user_high: string | null
          dm_user_low: string | null
          invite_ttl_hours: number | null
          is_large_channel: boolean | null
          join_mode: string
          metadata: Json | null
          policy_hash: string
          policy_version: number
          projection_mode: string
          scope_id: string
          scope_max_seq: number | null
          scope_type: string
          system_mode: string
          updated_at: string
          visibility: string
        }
        Insert: {
          created_at?: string
          created_by: string
          data_classification?: string
          delivery_strategy: string
          dm_user_high?: string | null
          dm_user_low?: string | null
          invite_ttl_hours?: number | null
          is_large_channel?: boolean | null
          join_mode: string
          metadata?: Json | null
          policy_hash: string
          policy_version?: number
          projection_mode?: string
          scope_id?: string
          scope_max_seq?: number | null
          scope_type: string
          system_mode?: string
          updated_at?: string
          visibility: string
        }
        Update: {
          created_at?: string
          created_by?: string
          data_classification?: string
          delivery_strategy?: string
          dm_user_high?: string | null
          dm_user_low?: string | null
          invite_ttl_hours?: number | null
          is_large_channel?: boolean | null
          join_mode?: string
          metadata?: Json | null
          policy_hash?: string
          policy_version?: number
          projection_mode?: string
          scope_id?: string
          scope_max_seq?: number | null
          scope_type?: string
          system_mode?: string
          updated_at?: string
          visibility?: string
        }
        Relationships: []
      }
      coupon_usages: {
        Row: {
          coupon_id: string
          id: string
          order_id: string | null
          used_at: string | null
          user_id: string
        }
        Insert: {
          coupon_id: string
          id?: string
          order_id?: string | null
          used_at?: string | null
          user_id: string
        }
        Update: {
          coupon_id?: string
          id?: string
          order_id?: string | null
          used_at?: string | null
          user_id?: string
        }
        Relationships: [
          {
            foreignKeyName: "coupon_usages_coupon_id_fkey"
            columns: ["coupon_id"]
            isOneToOne: false
            referencedRelation: "coupons"
            referencedColumns: ["id"]
          },
        ]
      }
      coupons: {
        Row: {
          code: string
          created_at: string | null
          created_by: string | null
          description: string | null
          discount_type: string
          discount_value: number
          id: string
          is_active: boolean | null
          max_uses: number | null
          min_order_amount: number | null
          used_count: number | null
          valid_from: string | null
          valid_until: string | null
        }
        Insert: {
          code: string
          created_at?: string | null
          created_by?: string | null
          description?: string | null
          discount_type: string
          discount_value: number
          id?: string
          is_active?: boolean | null
          max_uses?: number | null
          min_order_amount?: number | null
          used_count?: number | null
          valid_from?: string | null
          valid_until?: string | null
        }
        Update: {
          code?: string
          created_at?: string | null
          created_by?: string | null
          description?: string | null
          discount_type?: string
          discount_value?: number
          id?: string
          is_active?: boolean | null
          max_uses?: number | null
          min_order_amount?: number | null
          used_count?: number | null
          valid_from?: string | null
          valid_until?: string | null
        }
        Relationships: []
      }
      creator_earnings: {
        Row: {
          amount_cents: number
          created_at: string
          creator_id: string
          description: string | null
          id: string
          post_id: string | null
          source: string
          status: string
        }
        Insert: {
          amount_cents: number
          created_at?: string
          creator_id: string
          description?: string | null
          id?: string
          post_id?: string | null
          source: string
          status?: string
        }
        Update: {
          amount_cents?: number
          created_at?: string
          creator_id?: string
          description?: string | null
          id?: string
          post_id?: string | null
          source?: string
          status?: string
        }
        Relationships: [
          {
            foreignKeyName: "creator_earnings_post_id_fkey"
            columns: ["post_id"]
            isOneToOne: false
            referencedRelation: "posts"
            referencedColumns: ["id"]
          },
        ]
      }
      creator_fund_accounts: {
        Row: {
          balance: number | null
          created_at: string
          is_eligible: boolean | null
          joined_at: string | null
          total_earned: number | null
          user_id: string
        }
        Insert: {
          balance?: number | null
          created_at?: string
          is_eligible?: boolean | null
          joined_at?: string | null
          total_earned?: number | null
          user_id: string
        }
        Update: {
          balance?: number | null
          created_at?: string
          is_eligible?: boolean | null
          joined_at?: string | null
          total_earned?: number | null
          user_id?: string
        }
        Relationships: []
      }
      creator_fund_daily_earnings: {
        Row: {
          amount: number | null
          created_at: string | null
          earning_date: string
          engagement_count: number | null
          id: string
          user_id: string
          views_count: number | null
        }
        Insert: {
          amount?: number | null
          created_at?: string | null
          earning_date: string
          engagement_count?: number | null
          id?: string
          user_id: string
          views_count?: number | null
        }
        Update: {
          amount?: number | null
          created_at?: string | null
          earning_date?: string
          engagement_count?: number | null
          id?: string
          user_id?: string
          views_count?: number | null
        }
        Relationships: []
      }
      creator_fund_payouts: {
        Row: {
          amount: number
          created_at: string
          id: string
          payout_method: string | null
          status: string | null
          user_id: string
        }
        Insert: {
          amount: number
          created_at?: string
          id?: string
          payout_method?: string | null
          status?: string | null
          user_id: string
        }
        Update: {
          amount?: number
          created_at?: string
          id?: string
          payout_method?: string | null
          status?: string | null
          user_id?: string
        }
        Relationships: []
      }
      creator_metrics: {
        Row: {
          avg_impressions_per_reel: number
          avg_watch_seconds: number
          avg_watched_rate: number
          created_at: string
          creator_id: string
          followers_growth_30d: number
          followers_growth_7d: number
          last_updated_at: string
          top_reel_id: string | null
          top_reel_impressions: number
          total_comments: number
          total_followers: number
          total_hides: number
          total_impressions: number
          total_likes: number
          total_not_interested: number
          total_reels: number
          total_reports: number
          total_saves: number
          total_shares: number
          total_unique_viewers: number
          total_view_starts: number
          total_watched: number
        }
        Insert: {
          avg_impressions_per_reel?: number
          avg_watch_seconds?: number
          avg_watched_rate?: number
          created_at?: string
          creator_id: string
          followers_growth_30d?: number
          followers_growth_7d?: number
          last_updated_at?: string
          top_reel_id?: string | null
          top_reel_impressions?: number
          total_comments?: number
          total_followers?: number
          total_hides?: number
          total_impressions?: number
          total_likes?: number
          total_not_interested?: number
          total_reels?: number
          total_reports?: number
          total_saves?: number
          total_shares?: number
          total_unique_viewers?: number
          total_view_starts?: number
          total_watched?: number
        }
        Update: {
          avg_impressions_per_reel?: number
          avg_watch_seconds?: number
          avg_watched_rate?: number
          created_at?: string
          creator_id?: string
          followers_growth_30d?: number
          followers_growth_7d?: number
          last_updated_at?: string
          top_reel_id?: string | null
          top_reel_impressions?: number
          total_comments?: number
          total_followers?: number
          total_hides?: number
          total_impressions?: number
          total_likes?: number
          total_not_interested?: number
          total_reels?: number
          total_reports?: number
          total_saves?: number
          total_shares?: number
          total_unique_viewers?: number
          total_view_starts?: number
          total_watched?: number
        }
        Relationships: []
      }
      creator_metrics_snapshots: {
        Row: {
          avg_impressions_per_reel: number
          avg_watch_seconds: number
          avg_watched_rate: number
          created_at: string
          creator_id: string
          snapshot_date: string
          snapshot_id: string
          total_comments: number
          total_followers: number
          total_hides: number
          total_impressions: number
          total_likes: number
          total_not_interested: number
          total_reels: number
          total_reports: number
          total_saves: number
          total_shares: number
          total_unique_viewers: number
          total_view_starts: number
          total_watched: number
        }
        Insert: {
          avg_impressions_per_reel?: number
          avg_watch_seconds?: number
          avg_watched_rate?: number
          created_at?: string
          creator_id: string
          snapshot_date: string
          snapshot_id?: string
          total_comments?: number
          total_followers?: number
          total_hides?: number
          total_impressions?: number
          total_likes?: number
          total_not_interested?: number
          total_reels?: number
          total_reports?: number
          total_saves?: number
          total_shares?: number
          total_unique_viewers?: number
          total_view_starts?: number
          total_watched?: number
        }
        Update: {
          avg_impressions_per_reel?: number
          avg_watch_seconds?: number
          avg_watched_rate?: number
          created_at?: string
          creator_id?: string
          snapshot_date?: string
          snapshot_id?: string
          total_comments?: number
          total_followers?: number
          total_hides?: number
          total_impressions?: number
          total_likes?: number
          total_not_interested?: number
          total_reels?: number
          total_reports?: number
          total_saves?: number
          total_shares?: number
          total_unique_viewers?: number
          total_view_starts?: number
          total_watched?: number
        }
        Relationships: []
      }
      creator_subscriptions: {
        Row: {
          cancelled_at: string | null
          creator_id: string
          currency: string
          expires_at: string | null
          id: string
          price_monthly: number
          started_at: string
          status: string
          subscriber_id: string
          tier_id: string | null
        }
        Insert: {
          cancelled_at?: string | null
          creator_id: string
          currency?: string
          expires_at?: string | null
          id?: string
          price_monthly: number
          started_at?: string
          status?: string
          subscriber_id: string
          tier_id?: string | null
        }
        Update: {
          cancelled_at?: string | null
          creator_id?: string
          currency?: string
          expires_at?: string | null
          id?: string
          price_monthly?: number
          started_at?: string
          status?: string
          subscriber_id?: string
          tier_id?: string | null
        }
        Relationships: []
      }
      custom_emojis: {
        Row: {
          created_at: string
          id: string
          image_url: string
          pack_id: string
          shortcode: string
          sort_order: number | null
        }
        Insert: {
          created_at?: string
          id?: string
          image_url: string
          pack_id: string
          shortcode: string
          sort_order?: number | null
        }
        Update: {
          created_at?: string
          id?: string
          image_url?: string
          pack_id?: string
          shortcode?: string
          sort_order?: number | null
        }
        Relationships: [
          {
            foreignKeyName: "custom_emojis_pack_id_fkey"
            columns: ["pack_id"]
            isOneToOne: false
            referencedRelation: "emoji_packs"
            referencedColumns: ["id"]
          },
        ]
      }
      dating_matches: {
        Row: {
          id: string
          is_active: boolean | null
          matched_at: string | null
          user1_id: string
          user2_id: string
        }
        Insert: {
          id?: string
          is_active?: boolean | null
          matched_at?: string | null
          user1_id: string
          user2_id: string
        }
        Update: {
          id?: string
          is_active?: boolean | null
          matched_at?: string | null
          user1_id?: string
          user2_id?: string
        }
        Relationships: []
      }
      dating_profiles: {
        Row: {
          age: number | null
          bio: string | null
          created_at: string | null
          gender: string | null
          id: string
          interests: string[] | null
          is_active: boolean | null
          last_active: string | null
          looking_for: string[] | null
          max_age: number | null
          max_distance_km: number | null
          min_age: number | null
          photos: Json | null
          user_id: string
        }
        Insert: {
          age?: number | null
          bio?: string | null
          created_at?: string | null
          gender?: string | null
          id?: string
          interests?: string[] | null
          is_active?: boolean | null
          last_active?: string | null
          looking_for?: string[] | null
          max_age?: number | null
          max_distance_km?: number | null
          min_age?: number | null
          photos?: Json | null
          user_id: string
        }
        Update: {
          age?: number | null
          bio?: string | null
          created_at?: string | null
          gender?: string | null
          id?: string
          interests?: string[] | null
          is_active?: boolean | null
          last_active?: string | null
          looking_for?: string[] | null
          max_age?: number | null
          max_distance_km?: number | null
          min_age?: number | null
          photos?: Json | null
          user_id?: string
        }
        Relationships: []
      }
      dating_swipes: {
        Row: {
          created_at: string | null
          direction: string
          id: string
          swiped_id: string
          swiper_id: string
        }
        Insert: {
          created_at?: string | null
          direction: string
          id?: string
          swiped_id: string
          swiper_id: string
        }
        Update: {
          created_at?: string | null
          direction?: string
          id?: string
          swiped_id?: string
          swiper_id?: string
        }
        Relationships: []
      }
      decision_engine_events: {
        Row: {
          actor_id: string | null
          actor_type: string | null
          algorithm_version: string
          created_at: string
          event_id: string
          event_type: string
          execution_context: Json
          id: number
          idempotency_key: string | null
          organization_id: string
          payload: Json
          source_system: string
          subject_id: string
          subject_type: string
        }
        Insert: {
          actor_id?: string | null
          actor_type?: string | null
          algorithm_version: string
          created_at?: string
          event_id?: string
          event_type: string
          execution_context?: Json
          id?: number
          idempotency_key?: string | null
          organization_id?: string
          payload: Json
          source_system: string
          subject_id: string
          subject_type: string
        }
        Update: {
          actor_id?: string | null
          actor_type?: string | null
          algorithm_version?: string
          created_at?: string
          event_id?: string
          event_type?: string
          execution_context?: Json
          id?: number
          idempotency_key?: string | null
          organization_id?: string
          payload?: Json
          source_system?: string
          subject_id?: string
          subject_type?: string
        }
        Relationships: []
      }
      decision_jobs: {
        Row: {
          algorithm_version: string
          assigned_worker_id: string | null
          attempt_count: number
          created_at: string
          error_message: string | null
          error_stack: Json | null
          execution_context: Json
          id: number
          idempotency_key: string | null
          job_id: string
          job_type: string
          max_attempts: number
          organization_id: string
          previous_job_id: string | null
          priority: Database["public"]["Enums"]["decision_job_priority"]
          result_snapshot_id: string | null
          status: Database["public"]["Enums"]["decision_job_status"]
          subject_id: string
          subject_type: string
          updated_at: string
        }
        Insert: {
          algorithm_version: string
          assigned_worker_id?: string | null
          attempt_count?: number
          created_at?: string
          error_message?: string | null
          error_stack?: Json | null
          execution_context?: Json
          id?: number
          idempotency_key?: string | null
          job_id?: string
          job_type: string
          max_attempts?: number
          organization_id?: string
          previous_job_id?: string | null
          priority?: Database["public"]["Enums"]["decision_job_priority"]
          result_snapshot_id?: string | null
          status?: Database["public"]["Enums"]["decision_job_status"]
          subject_id: string
          subject_type: string
          updated_at?: string
        }
        Update: {
          algorithm_version?: string
          assigned_worker_id?: string | null
          attempt_count?: number
          created_at?: string
          error_message?: string | null
          error_stack?: Json | null
          execution_context?: Json
          id?: number
          idempotency_key?: string | null
          job_id?: string
          job_type?: string
          max_attempts?: number
          organization_id?: string
          previous_job_id?: string | null
          priority?: Database["public"]["Enums"]["decision_job_priority"]
          result_snapshot_id?: string | null
          status?: Database["public"]["Enums"]["decision_job_status"]
          subject_id?: string
          subject_type?: string
          updated_at?: string
        }
        Relationships: []
      }
      decision_snapshots: {
        Row: {
          algorithm_version: string
          can_rollback_to_id: string | null
          confidence_score: number
          content_hash: string
          created_at: string
          decision_payload: Json
          decision_type: string
          id: number
          is_provisional: boolean
          organization_id: string
          rollback_reason: string | null
          snapshot_id: string
          snapshot_timestamp: string
          source_events: Json
          subject_id: string
          subject_type: string
          trust_weight: number
          version_number: number
        }
        Insert: {
          algorithm_version: string
          can_rollback_to_id?: string | null
          confidence_score: number
          content_hash: string
          created_at?: string
          decision_payload: Json
          decision_type: string
          id?: number
          is_provisional?: boolean
          organization_id?: string
          rollback_reason?: string | null
          snapshot_id?: string
          snapshot_timestamp: string
          source_events: Json
          subject_id: string
          subject_type: string
          trust_weight?: number
          version_number: number
        }
        Update: {
          algorithm_version?: string
          can_rollback_to_id?: string | null
          confidence_score?: number
          content_hash?: string
          created_at?: string
          decision_payload?: Json
          decision_type?: string
          id?: number
          is_provisional?: boolean
          organization_id?: string
          rollback_reason?: string | null
          snapshot_id?: string
          snapshot_timestamp?: string
          source_events?: Json
          subject_id?: string
          subject_type?: string
          trust_weight?: number
          version_number?: number
        }
        Relationships: []
      }
      delegation_tokens: {
        Row: {
          delegation_id: string
          expires_at: string
          issued_at: string
          jti: string | null
          last_used_at: string | null
          nonce: string | null
          revoked_at: string | null
          service_key_id: string
          tenant_id: string
          token_hash: string
          token_id: string
        }
        Insert: {
          delegation_id: string
          expires_at: string
          issued_at?: string
          jti?: string | null
          last_used_at?: string | null
          nonce?: string | null
          revoked_at?: string | null
          service_key_id: string
          tenant_id: string
          token_hash: string
          token_id?: string
        }
        Update: {
          delegation_id?: string
          expires_at?: string
          issued_at?: string
          jti?: string | null
          last_used_at?: string | null
          nonce?: string | null
          revoked_at?: string | null
          service_key_id?: string
          tenant_id?: string
          token_hash?: string
          token_id?: string
        }
        Relationships: [
          {
            foreignKeyName: "delegation_tokens_delegation_id_fkey"
            columns: ["delegation_id"]
            isOneToOne: false
            referencedRelation: "delegations"
            referencedColumns: ["delegation_id"]
          },
        ]
      }
      delegations: {
        Row: {
          created_at: string
          delegation_id: string
          expires_at: string | null
          revoked_at: string | null
          scopes: string[]
          service_id: string
          tenant_id: string
          updated_at: string
          user_id: string
        }
        Insert: {
          created_at?: string
          delegation_id?: string
          expires_at?: string | null
          revoked_at?: string | null
          scopes?: string[]
          service_id: string
          tenant_id: string
          updated_at?: string
          user_id: string
        }
        Update: {
          created_at?: string
          delegation_id?: string
          expires_at?: string | null
          revoked_at?: string | null
          scopes?: string[]
          service_id?: string
          tenant_id?: string
          updated_at?: string
          user_id?: string
        }
        Relationships: [
          {
            foreignKeyName: "delegations_tenant_id_fkey"
            columns: ["tenant_id"]
            isOneToOne: false
            referencedRelation: "tenants"
            referencedColumns: ["tenant_id"]
          },
          {
            foreignKeyName: "delegations_tenant_id_service_id_fkey"
            columns: ["tenant_id", "service_id"]
            isOneToOne: false
            referencedRelation: "service_identities"
            referencedColumns: ["tenant_id", "service_id"]
          },
        ]
      }
      delivery_outbox: {
        Row: {
          aggregate_id: string
          attempts: number
          created_at: string
          event_type: string
          id: string
          last_error: string | null
          locked_at: string | null
          locked_by: string | null
          next_attempt_at: string
          payload: Json
          state: string
          topic: string
          updated_at: string
        }
        Insert: {
          aggregate_id: string
          attempts?: number
          created_at?: string
          event_type: string
          id?: string
          last_error?: string | null
          locked_at?: string | null
          locked_by?: string | null
          next_attempt_at?: string
          payload: Json
          state?: string
          topic: string
          updated_at?: string
        }
        Update: {
          aggregate_id?: string
          attempts?: number
          created_at?: string
          event_type?: string
          id?: string
          last_error?: string | null
          locked_at?: string | null
          locked_by?: string | null
          next_attempt_at?: string
          payload?: Json
          state?: string
          topic?: string
          updated_at?: string
        }
        Relationships: []
      }
      device_accounts: {
        Row: {
          created_at: string
          device_id: string
          label: string | null
          last_active_at: string
          sort_order: number | null
          user_id: string
        }
        Insert: {
          created_at?: string
          device_id: string
          label?: string | null
          last_active_at?: string
          sort_order?: number | null
          user_id: string
        }
        Update: {
          created_at?: string
          device_id?: string
          label?: string | null
          last_active_at?: string
          sort_order?: number | null
          user_id?: string
        }
        Relationships: []
      }
      device_active_account: {
        Row: {
          account_id: string
          device_id: string
          switched_at: string
        }
        Insert: {
          account_id: string
          device_id: string
          switched_at?: string
        }
        Update: {
          account_id?: string
          device_id?: string
          switched_at?: string
        }
        Relationships: [
          {
            foreignKeyName: "device_active_account_account_id_fkey"
            columns: ["account_id"]
            isOneToOne: false
            referencedRelation: "auth_accounts"
            referencedColumns: ["id"]
          },
          {
            foreignKeyName: "device_active_account_device_id_fkey"
            columns: ["device_id"]
            isOneToOne: true
            referencedRelation: "auth_devices"
            referencedColumns: ["id"]
          },
        ]
      }
      device_tokens: {
        Row: {
          app_build: number | null
          app_version: string | null
          call_push_enabled: boolean
          created_at: string
          device_id: string
          id: string
          is_valid: boolean
          last_seen_at: string | null
          locale: string | null
          platform: string
          provider: string
          push_enabled: boolean
          timezone: string | null
          token: string
          updated_at: string
          user_id: string
        }
        Insert: {
          app_build?: number | null
          app_version?: string | null
          call_push_enabled?: boolean
          created_at?: string
          device_id: string
          id?: string
          is_valid?: boolean
          last_seen_at?: string | null
          locale?: string | null
          platform: string
          provider: string
          push_enabled?: boolean
          timezone?: string | null
          token: string
          updated_at?: string
          user_id: string
        }
        Update: {
          app_build?: number | null
          app_version?: string | null
          call_push_enabled?: boolean
          created_at?: string
          device_id?: string
          id?: string
          is_valid?: boolean
          last_seen_at?: string | null
          locale?: string | null
          platform?: string
          provider?: string
          push_enabled?: boolean
          timezone?: string | null
          token?: string
          updated_at?: string
          user_id?: string
        }
        Relationships: []
      }
      dm_pairs: {
        Row: {
          conversation_id: string
          created_at: string
          user_a: string
          user_b: string
        }
        Insert: {
          conversation_id: string
          created_at?: string
          user_a: string
          user_b: string
        }
        Update: {
          conversation_id?: string
          created_at?: string
          user_a?: string
          user_b?: string
        }
        Relationships: [
          {
            foreignKeyName: "dm_pairs_conversation_id_fkey"
            columns: ["conversation_id"]
            isOneToOne: true
            referencedRelation: "conversations"
            referencedColumns: ["id"]
          },
        ]
      }
      draft_versions: {
        Row: {
          actor_user_id: string
          created_at: string
          draft_id: string
          graph_json: Json
          patch_json: Json
          rev: number
        }
        Insert: {
          actor_user_id: string
          created_at?: string
          draft_id: string
          graph_json: Json
          patch_json?: Json
          rev: number
        }
        Update: {
          actor_user_id?: string
          created_at?: string
          draft_id?: string
          graph_json?: Json
          patch_json?: Json
          rev?: number
        }
        Relationships: [
          {
            foreignKeyName: "draft_versions_draft_id_fkey"
            columns: ["draft_id"]
            isOneToOne: false
            referencedRelation: "drafts"
            referencedColumns: ["id"]
          },
        ]
      }
      drafts: {
        Row: {
          author_id: string
          bounds_json: Json
          created_at: string
          current_rev: number
          graph_json: Json
          id: string
          mode: string
          schema_version: string
          state: string
          timebase_hz: number
          updated_at: string
        }
        Insert: {
          author_id?: string
          bounds_json?: Json
          created_at?: string
          current_rev?: number
          graph_json: Json
          id?: string
          mode: string
          schema_version?: string
          state?: string
          timebase_hz: number
          updated_at?: string
        }
        Update: {
          author_id?: string
          bounds_json?: Json
          created_at?: string
          current_rev?: number
          graph_json?: Json
          id?: string
          mode?: string
          schema_version?: string
          state?: string
          timebase_hz?: number
          updated_at?: string
        }
        Relationships: []
      }
      edge_rate_limits: {
        Row: {
          count: number
          key: string
          window_start: string
        }
        Insert: {
          count?: number
          key: string
          window_start?: string
        }
        Update: {
          count?: number
          key?: string
          window_start?: string
        }
        Relationships: []
      }
      editor_assets: {
        Row: {
          created_at: string
          duration_ms: number | null
          file_size: number
          file_url: string
          height: number | null
          id: string
          metadata: Json
          mime_type: string
          name: string
          project_id: string | null
          thumbnail_url: string | null
          type: string
          user_id: string
          waveform_data: Json | null
          width: number | null
        }
        Insert: {
          created_at?: string
          duration_ms?: number | null
          file_size: number
          file_url: string
          height?: number | null
          id?: string
          metadata?: Json
          mime_type: string
          name: string
          project_id?: string | null
          thumbnail_url?: string | null
          type: string
          user_id: string
          waveform_data?: Json | null
          width?: number | null
        }
        Update: {
          created_at?: string
          duration_ms?: number | null
          file_size?: number
          file_url?: string
          height?: number | null
          id?: string
          metadata?: Json
          mime_type?: string
          name?: string
          project_id?: string | null
          thumbnail_url?: string | null
          type?: string
          user_id?: string
          waveform_data?: Json | null
          width?: number | null
        }
        Relationships: [
          {
            foreignKeyName: "editor_assets_project_id_fkey"
            columns: ["project_id"]
            isOneToOne: false
            referencedRelation: "editor_projects"
            referencedColumns: ["id"]
          },
        ]
      }
      editor_clips: {
        Row: {
          created_at: string
          crop: Json | null
          duration_ms: number
          filters: Json
          id: string
          is_reversed: boolean
          name: string
          project_id: string
          sort_order: number
          source_end_ms: number | null
          source_start_ms: number | null
          source_url: string | null
          speed: number
          speed_ramp: Json | null
          start_ms: number
          sticker_id: string | null
          text_content: string | null
          text_style: Json | null
          track_id: string
          transform: Json
          transition_in: Json | null
          transition_out: Json | null
          type: string
          updated_at: string
          volume: number
        }
        Insert: {
          created_at?: string
          crop?: Json | null
          duration_ms: number
          filters?: Json
          id?: string
          is_reversed?: boolean
          name?: string
          project_id: string
          sort_order?: number
          source_end_ms?: number | null
          source_start_ms?: number | null
          source_url?: string | null
          speed?: number
          speed_ramp?: Json | null
          start_ms?: number
          sticker_id?: string | null
          text_content?: string | null
          text_style?: Json | null
          track_id: string
          transform?: Json
          transition_in?: Json | null
          transition_out?: Json | null
          type: string
          updated_at?: string
          volume?: number
        }
        Update: {
          created_at?: string
          crop?: Json | null
          duration_ms?: number
          filters?: Json
          id?: string
          is_reversed?: boolean
          name?: string
          project_id?: string
          sort_order?: number
          source_end_ms?: number | null
          source_start_ms?: number | null
          source_url?: string | null
          speed?: number
          speed_ramp?: Json | null
          start_ms?: number
          sticker_id?: string | null
          text_content?: string | null
          text_style?: Json | null
          track_id?: string
          transform?: Json
          transition_in?: Json | null
          transition_out?: Json | null
          type?: string
          updated_at?: string
          volume?: number
        }
        Relationships: [
          {
            foreignKeyName: "editor_clips_project_id_fkey"
            columns: ["project_id"]
            isOneToOne: false
            referencedRelation: "editor_projects"
            referencedColumns: ["id"]
          },
          {
            foreignKeyName: "editor_clips_track_id_fkey"
            columns: ["track_id"]
            isOneToOne: false
            referencedRelation: "editor_tracks"
            referencedColumns: ["id"]
          },
        ]
      }
      editor_effects: {
        Row: {
          clip_id: string
          created_at: string
          enabled: boolean
          id: string
          params: Json
          project_id: string
          sort_order: number
          type: string
        }
        Insert: {
          clip_id: string
          created_at?: string
          enabled?: boolean
          id?: string
          params?: Json
          project_id: string
          sort_order?: number
          type: string
        }
        Update: {
          clip_id?: string
          created_at?: string
          enabled?: boolean
          id?: string
          params?: Json
          project_id?: string
          sort_order?: number
          type?: string
        }
        Relationships: [
          {
            foreignKeyName: "editor_effects_clip_id_fkey"
            columns: ["clip_id"]
            isOneToOne: false
            referencedRelation: "editor_clips"
            referencedColumns: ["id"]
          },
          {
            foreignKeyName: "editor_effects_project_id_fkey"
            columns: ["project_id"]
            isOneToOne: false
            referencedRelation: "editor_projects"
            referencedColumns: ["id"]
          },
        ]
      }
      editor_keyframes: {
        Row: {
          bezier_points: Json | null
          clip_id: string
          created_at: string
          easing: string
          id: string
          project_id: string
          property: string
          time_ms: number
          value: number
        }
        Insert: {
          bezier_points?: Json | null
          clip_id: string
          created_at?: string
          easing?: string
          id?: string
          project_id: string
          property: string
          time_ms: number
          value: number
        }
        Update: {
          bezier_points?: Json | null
          clip_id?: string
          created_at?: string
          easing?: string
          id?: string
          project_id?: string
          property?: string
          time_ms?: number
          value?: number
        }
        Relationships: [
          {
            foreignKeyName: "editor_keyframes_clip_id_fkey"
            columns: ["clip_id"]
            isOneToOne: false
            referencedRelation: "editor_clips"
            referencedColumns: ["id"]
          },
          {
            foreignKeyName: "editor_keyframes_project_id_fkey"
            columns: ["project_id"]
            isOneToOne: false
            referencedRelation: "editor_projects"
            referencedColumns: ["id"]
          },
        ]
      }
      editor_projects: {
        Row: {
          aspect_ratio: string
          created_at: string
          description: string | null
          duration_ms: number
          fps: number
          id: string
          output_url: string | null
          resolution_height: number
          resolution_width: number
          settings: Json
          status: string
          thumbnail_url: string | null
          title: string
          updated_at: string
          user_id: string
        }
        Insert: {
          aspect_ratio?: string
          created_at?: string
          description?: string | null
          duration_ms?: number
          fps?: number
          id?: string
          output_url?: string | null
          resolution_height?: number
          resolution_width?: number
          settings?: Json
          status?: string
          thumbnail_url?: string | null
          title?: string
          updated_at?: string
          user_id: string
        }
        Update: {
          aspect_ratio?: string
          created_at?: string
          description?: string | null
          duration_ms?: number
          fps?: number
          id?: string
          output_url?: string | null
          resolution_height?: number
          resolution_width?: number
          settings?: Json
          status?: string
          thumbnail_url?: string | null
          title?: string
          updated_at?: string
          user_id?: string
        }
        Relationships: []
      }
      editor_templates: {
        Row: {
          aspect_ratio: string
          author_id: string | null
          category: string
          created_at: string
          description: string | null
          duration_ms: number
          id: string
          is_premium: boolean
          is_published: boolean
          preview_url: string | null
          project_data: Json
          tags: string[]
          thumbnail_url: string
          title: string
          updated_at: string
          use_count: number
        }
        Insert: {
          aspect_ratio?: string
          author_id?: string | null
          category: string
          created_at?: string
          description?: string | null
          duration_ms: number
          id?: string
          is_premium?: boolean
          is_published?: boolean
          preview_url?: string | null
          project_data: Json
          tags?: string[]
          thumbnail_url: string
          title: string
          updated_at?: string
          use_count?: number
        }
        Update: {
          aspect_ratio?: string
          author_id?: string | null
          category?: string
          created_at?: string
          description?: string | null
          duration_ms?: number
          id?: string
          is_premium?: boolean
          is_published?: boolean
          preview_url?: string | null
          project_data?: Json
          tags?: string[]
          thumbnail_url?: string
          title?: string
          updated_at?: string
          use_count?: number
        }
        Relationships: []
      }
      editor_tracks: {
        Row: {
          blend_mode: string
          created_at: string
          id: string
          is_locked: boolean
          is_visible: boolean
          name: string
          opacity: number
          project_id: string
          sort_order: number
          type: string
          updated_at: string
          volume: number
        }
        Insert: {
          blend_mode?: string
          created_at?: string
          id?: string
          is_locked?: boolean
          is_visible?: boolean
          name?: string
          opacity?: number
          project_id: string
          sort_order?: number
          type: string
          updated_at?: string
          volume?: number
        }
        Update: {
          blend_mode?: string
          created_at?: string
          id?: string
          is_locked?: boolean
          is_visible?: boolean
          name?: string
          opacity?: number
          project_id?: string
          sort_order?: number
          type?: string
          updated_at?: string
          volume?: number
        }
        Relationships: [
          {
            foreignKeyName: "editor_tracks_project_id_fkey"
            columns: ["project_id"]
            isOneToOne: false
            referencedRelation: "editor_projects"
            referencedColumns: ["id"]
          },
        ]
      }
      email_deliveries: {
        Row: {
          created_at: string
          error_message: string | null
          id: string
          outbox_id: string
          provider: string
          provider_message_id: string | null
          provider_response_code: string | null
          status: string
        }
        Insert: {
          created_at?: string
          error_message?: string | null
          id?: string
          outbox_id: string
          provider: string
          provider_message_id?: string | null
          provider_response_code?: string | null
          status: string
        }
        Update: {
          created_at?: string
          error_message?: string | null
          id?: string
          outbox_id?: string
          provider?: string
          provider_message_id?: string | null
          provider_response_code?: string | null
          status?: string
        }
        Relationships: [
          {
            foreignKeyName: "email_deliveries_outbox_id_fkey"
            columns: ["outbox_id"]
            isOneToOne: false
            referencedRelation: "email_outbox"
            referencedColumns: ["id"]
          },
        ]
      }
      email_imap_settings: {
        Row: {
          created_at: string
          id: string
          imap_host: string
          imap_password_enc: string
          imap_port: number
          imap_user: string
          last_error: string | null
          last_synced_at: string | null
          poll_interval_s: number
          sync_folders: string[]
          tls_mode: string
          updated_at: string
          user_id: string
          verified_at: string | null
        }
        Insert: {
          created_at?: string
          id?: string
          imap_host: string
          imap_password_enc: string
          imap_port?: number
          imap_user: string
          last_error?: string | null
          last_synced_at?: string | null
          poll_interval_s?: number
          sync_folders?: string[]
          tls_mode?: string
          updated_at?: string
          user_id: string
          verified_at?: string | null
        }
        Update: {
          created_at?: string
          id?: string
          imap_host?: string
          imap_password_enc?: string
          imap_port?: number
          imap_user?: string
          last_error?: string | null
          last_synced_at?: string | null
          poll_interval_s?: number
          sync_folders?: string[]
          tls_mode?: string
          updated_at?: string
          user_id?: string
          verified_at?: string | null
        }
        Relationships: []
      }
      email_inbox: {
        Row: {
          created_at: string
          folder: string
          from_email: string
          headers: Json
          html_body: string | null
          id: string
          in_reply_to_message_id: string | null
          is_read: boolean
          is_starred: boolean
          message_id: string
          provider: string | null
          read_at: string | null
          received_at: string
          subject: string | null
          text_body: string | null
          thread_id: string | null
          to_email: string
        }
        Insert: {
          created_at?: string
          folder?: string
          from_email: string
          headers?: Json
          html_body?: string | null
          id?: string
          in_reply_to_message_id?: string | null
          is_read?: boolean
          is_starred?: boolean
          message_id: string
          provider?: string | null
          read_at?: string | null
          received_at?: string
          subject?: string | null
          text_body?: string | null
          thread_id?: string | null
          to_email: string
        }
        Update: {
          created_at?: string
          folder?: string
          from_email?: string
          headers?: Json
          html_body?: string | null
          id?: string
          in_reply_to_message_id?: string | null
          is_read?: boolean
          is_starred?: boolean
          message_id?: string
          provider?: string | null
          read_at?: string | null
          received_at?: string
          subject?: string | null
          text_body?: string | null
          thread_id?: string | null
          to_email?: string
        }
        Relationships: [
          {
            foreignKeyName: "email_inbox_thread_id_fkey"
            columns: ["thread_id"]
            isOneToOne: false
            referencedRelation: "email_threads"
            referencedColumns: ["id"]
          },
        ]
      }
      email_otp_codes: {
        Row: {
          attempts: number
          code: string
          created_at: string
          email: string
          expires_at: string
          id: string
        }
        Insert: {
          attempts?: number
          code: string
          created_at?: string
          email: string
          expires_at: string
          id?: string
        }
        Update: {
          attempts?: number
          code?: string
          created_at?: string
          email?: string
          expires_at?: string
          id?: string
        }
        Relationships: []
      }
      email_outbox: {
        Row: {
          attempt_count: number
          bcc_email: string[]
          cc_email: string[]
          created_at: string
          folder: string
          from_email: string | null
          html_body: string | null
          id: string
          idempotency_key: string | null
          is_starred: boolean
          last_error: string | null
          locked_until: string | null
          max_attempts: number
          next_attempt_at: string
          processing_started_at: string | null
          provider: string | null
          provider_message_id: string | null
          reply_to_message_id: string | null
          status: string
          subject: string | null
          template_key: string | null
          template_vars: Json
          text_body: string | null
          thread_id: string | null
          to_email: string
          updated_at: string
        }
        Insert: {
          attempt_count?: number
          bcc_email?: string[]
          cc_email?: string[]
          created_at?: string
          folder?: string
          from_email?: string | null
          html_body?: string | null
          id?: string
          idempotency_key?: string | null
          is_starred?: boolean
          last_error?: string | null
          locked_until?: string | null
          max_attempts?: number
          next_attempt_at?: string
          processing_started_at?: string | null
          provider?: string | null
          provider_message_id?: string | null
          reply_to_message_id?: string | null
          status?: string
          subject?: string | null
          template_key?: string | null
          template_vars?: Json
          text_body?: string | null
          thread_id?: string | null
          to_email: string
          updated_at?: string
        }
        Update: {
          attempt_count?: number
          bcc_email?: string[]
          cc_email?: string[]
          created_at?: string
          folder?: string
          from_email?: string | null
          html_body?: string | null
          id?: string
          idempotency_key?: string | null
          is_starred?: boolean
          last_error?: string | null
          locked_until?: string | null
          max_attempts?: number
          next_attempt_at?: string
          processing_started_at?: string | null
          provider?: string | null
          provider_message_id?: string | null
          reply_to_message_id?: string | null
          status?: string
          subject?: string | null
          template_key?: string | null
          template_vars?: Json
          text_body?: string | null
          thread_id?: string | null
          to_email?: string
          updated_at?: string
        }
        Relationships: [
          {
            foreignKeyName: "email_outbox_template_key_fkey"
            columns: ["template_key"]
            isOneToOne: false
            referencedRelation: "email_templates"
            referencedColumns: ["key"]
          },
          {
            foreignKeyName: "email_outbox_thread_id_fkey"
            columns: ["thread_id"]
            isOneToOne: false
            referencedRelation: "email_threads"
            referencedColumns: ["id"]
          },
        ]
      }
      email_smtp_settings: {
        Row: {
          created_at: string
          from_email: string
          from_name: string | null
          id: string
          last_error: string | null
          message_id_domain: string | null
          reply_to: string | null
          smtp_host: string
          smtp_password_enc: string
          smtp_port: number
          smtp_user: string
          tls_mode: string
          updated_at: string
          user_id: string
          verified_at: string | null
        }
        Insert: {
          created_at?: string
          from_email: string
          from_name?: string | null
          id?: string
          last_error?: string | null
          message_id_domain?: string | null
          reply_to?: string | null
          smtp_host: string
          smtp_password_enc: string
          smtp_port?: number
          smtp_user: string
          tls_mode?: string
          updated_at?: string
          user_id: string
          verified_at?: string | null
        }
        Update: {
          created_at?: string
          from_email?: string
          from_name?: string | null
          id?: string
          last_error?: string | null
          message_id_domain?: string | null
          reply_to?: string | null
          smtp_host?: string
          smtp_password_enc?: string
          smtp_port?: number
          smtp_user?: string
          tls_mode?: string
          updated_at?: string
          user_id?: string
          verified_at?: string | null
        }
        Relationships: []
      }
      email_templates: {
        Row: {
          created_at: string
          html_template: string | null
          is_active: boolean
          key: string
          subject_template: string
          text_template: string | null
          updated_at: string
        }
        Insert: {
          created_at?: string
          html_template?: string | null
          is_active?: boolean
          key: string
          subject_template: string
          text_template?: string | null
          updated_at?: string
        }
        Update: {
          created_at?: string
          html_template?: string | null
          is_active?: boolean
          key?: string
          subject_template?: string
          text_template?: string | null
          updated_at?: string
        }
        Relationships: []
      }
      email_threads: {
        Row: {
          created_at: string
          id: string
          last_message_at: string
          mailbox_email: string
          subject_normalized: string | null
          updated_at: string
        }
        Insert: {
          created_at?: string
          id?: string
          last_message_at?: string
          mailbox_email: string
          subject_normalized?: string | null
          updated_at?: string
        }
        Update: {
          created_at?: string
          id?: string
          last_message_at?: string
          mailbox_email?: string
          subject_normalized?: string | null
          updated_at?: string
        }
        Relationships: []
      }
      emergency_signals: {
        Row: {
          created_at: string
          hop_count: number
          id: string
          is_active: boolean
          latitude: number | null
          level: Database["public"]["Enums"]["emergency_level"]
          longitude: number | null
          message: string
          resolved_at: string | null
          resolved_by: string | null
          route_path: string[]
          sender_name: string
          type: Database["public"]["Enums"]["emergency_signal_type"]
          user_id: string
        }
        Insert: {
          created_at?: string
          hop_count?: number
          id?: string
          is_active?: boolean
          latitude?: number | null
          level: Database["public"]["Enums"]["emergency_level"]
          longitude?: number | null
          message?: string
          resolved_at?: string | null
          resolved_by?: string | null
          route_path?: string[]
          sender_name: string
          type: Database["public"]["Enums"]["emergency_signal_type"]
          user_id: string
        }
        Update: {
          created_at?: string
          hop_count?: number
          id?: string
          is_active?: boolean
          latitude?: number | null
          level?: Database["public"]["Enums"]["emergency_level"]
          longitude?: number | null
          message?: string
          resolved_at?: string | null
          resolved_by?: string | null
          route_path?: string[]
          sender_name?: string
          type?: Database["public"]["Enums"]["emergency_signal_type"]
          user_id?: string
        }
        Relationships: []
      }
      emoji_packs: {
        Row: {
          created_at: string
          creator_id: string
          description: string | null
          id: string
          install_count: number | null
          is_public: boolean | null
          name: string
        }
        Insert: {
          created_at?: string
          creator_id: string
          description?: string | null
          id?: string
          install_count?: number | null
          is_public?: boolean | null
          name: string
        }
        Update: {
          created_at?: string
          creator_id?: string
          description?: string | null
          id?: string
          install_count?: number | null
          is_public?: boolean | null
          name?: string
        }
        Relationships: []
      }
      emoji_sets: {
        Row: {
          created_at: string
          id: string
          is_active: boolean
          is_premium: boolean
          slug: string | null
          sort_order: number
          source_type: string
          title: string
          updated_at: string
        }
        Insert: {
          created_at?: string
          id?: string
          is_active?: boolean
          is_premium?: boolean
          slug?: string | null
          sort_order?: number
          source_type?: string
          title: string
          updated_at?: string
        }
        Update: {
          created_at?: string
          id?: string
          is_active?: boolean
          is_premium?: boolean
          slug?: string | null
          sort_order?: number
          source_type?: string
          title?: string
          updated_at?: string
        }
        Relationships: []
      }
      explore_cache: {
        Row: {
          category: string | null
          content_id: string
          content_type: string
          created_at: string | null
          id: string
          score: number | null
          user_id: string | null
        }
        Insert: {
          category?: string | null
          content_id: string
          content_type: string
          created_at?: string | null
          id?: string
          score?: number | null
          user_id?: string | null
        }
        Update: {
          category?: string | null
          content_id?: string
          content_type?: string
          created_at?: string | null
          id?: string
          score?: number | null
          user_id?: string | null
        }
        Relationships: []
      }
      explore_cache_entries: {
        Row: {
          cache_key: string
          created_at: string
          expires_at: string
          generated_at: string
          payload: Json
          reason_codes: string[]
          segment_id: string
          status: string
          updated_at: string
        }
        Insert: {
          cache_key: string
          created_at?: string
          expires_at: string
          generated_at: string
          payload: Json
          reason_codes?: string[]
          segment_id: string
          status?: string
          updated_at?: string
        }
        Update: {
          cache_key?: string
          created_at?: string
          expires_at?: string
          generated_at?: string
          payload?: Json
          reason_codes?: string[]
          segment_id?: string
          status?: string
          updated_at?: string
        }
        Relationships: []
      }
      explore_section_clicks: {
        Row: {
          algorithm_version: string | null
          click_id: string
          clicked_at: string
          created_at: string
          did_watch: boolean | null
          item_id: string
          item_type: string
          position_in_section: number | null
          section_type: string
          session_id: string | null
          user_id: string | null
          watch_duration_seconds: number | null
        }
        Insert: {
          algorithm_version?: string | null
          click_id?: string
          clicked_at?: string
          created_at?: string
          did_watch?: boolean | null
          item_id: string
          item_type: string
          position_in_section?: number | null
          section_type: string
          session_id?: string | null
          user_id?: string | null
          watch_duration_seconds?: number | null
        }
        Update: {
          algorithm_version?: string | null
          click_id?: string
          clicked_at?: string
          created_at?: string
          did_watch?: boolean | null
          item_id?: string
          item_type?: string
          position_in_section?: number | null
          section_type?: string
          session_id?: string | null
          user_id?: string | null
          watch_duration_seconds?: number | null
        }
        Relationships: [
          {
            foreignKeyName: "explore_section_clicks_session_id_fkey"
            columns: ["session_id"]
            isOneToOne: false
            referencedRelation: "explore_sessions"
            referencedColumns: ["session_id"]
          },
        ]
      }
      explore_sessions: {
        Row: {
          algorithm_version: string | null
          created_at: string
          duration_seconds: number | null
          ended_at: string | null
          sections_clicked: string[]
          sections_viewed: string[]
          session_id: string
          session_key: string
          started_at: string
          total_clicks: number
          total_watches: number
          updated_at: string
          user_id: string | null
        }
        Insert: {
          algorithm_version?: string | null
          created_at?: string
          duration_seconds?: number | null
          ended_at?: string | null
          sections_clicked?: string[]
          sections_viewed?: string[]
          session_id?: string
          session_key: string
          started_at?: string
          total_clicks?: number
          total_watches?: number
          updated_at?: string
          user_id?: string | null
        }
        Update: {
          algorithm_version?: string | null
          created_at?: string
          duration_seconds?: number | null
          ended_at?: string | null
          sections_clicked?: string[]
          sections_viewed?: string[]
          session_id?: string
          session_key?: string
          started_at?: string
          total_clicks?: number
          total_watches?: number
          updated_at?: string
          user_id?: string | null
        }
        Relationships: []
      }
      feature_flags: {
        Row: {
          config: Json | null
          created_at: string
          enabled: boolean
          flag_name: string
          rollout_percentage: number
          updated_at: string
        }
        Insert: {
          config?: Json | null
          created_at?: string
          enabled?: boolean
          flag_name: string
          rollout_percentage?: number
          updated_at?: string
        }
        Update: {
          config?: Json | null
          created_at?: string
          enabled?: boolean
          flag_name?: string
          rollout_percentage?: number
          updated_at?: string
        }
        Relationships: []
      }
      feed_impressions: {
        Row: {
          created_at: string | null
          duration_ms: number | null
          id: string
          impression_type: string | null
          post_id: string
          user_id: string
        }
        Insert: {
          created_at?: string | null
          duration_ms?: number | null
          id?: string
          impression_type?: string | null
          post_id: string
          user_id: string
        }
        Update: {
          created_at?: string | null
          duration_ms?: number | null
          id?: string
          impression_type?: string | null
          post_id?: string
          user_id?: string
        }
        Relationships: []
      }
      feed_quality_metrics: {
        Row: {
          avg_scroll_depth: number | null
          created_at: string | null
          diversity_score: number | null
          id: string
          posts_engaged: number | null
          posts_shown: number | null
          session_date: string
          time_spent_seconds: number | null
          user_id: string
        }
        Insert: {
          avg_scroll_depth?: number | null
          created_at?: string | null
          diversity_score?: number | null
          id?: string
          posts_engaged?: number | null
          posts_shown?: number | null
          session_date: string
          time_spent_seconds?: number | null
          user_id: string
        }
        Update: {
          avg_scroll_depth?: number | null
          created_at?: string | null
          diversity_score?: number | null
          id?: string
          posts_engaged?: number | null
          posts_shown?: number | null
          session_date?: string
          time_spent_seconds?: number | null
          user_id?: string
        }
        Relationships: []
      }
      follow_requests: {
        Row: {
          created_at: string | null
          id: string
          requester_id: string
          status: string | null
          target_id: string
        }
        Insert: {
          created_at?: string | null
          id?: string
          requester_id: string
          status?: string | null
          target_id: string
        }
        Update: {
          created_at?: string | null
          id?: string
          requester_id?: string
          status?: string | null
          target_id?: string
        }
        Relationships: []
      }
      followers: {
        Row: {
          created_at: string
          follower_id: string
          following_id: string
          id: string
        }
        Insert: {
          created_at?: string
          follower_id: string
          following_id: string
          id?: string
        }
        Update: {
          created_at?: string
          follower_id?: string
          following_id?: string
          id?: string
        }
        Relationships: []
      }
      gift_catalog: {
        Row: {
          animation_url: string | null
          category: string
          created_at: string | null
          description: string | null
          emoji: string
          id: string
          is_available: boolean | null
          name: string
          price_stars: number
          rarity: string
          sort_order: number | null
        }
        Insert: {
          animation_url?: string | null
          category?: string
          created_at?: string | null
          description?: string | null
          emoji: string
          id?: string
          is_available?: boolean | null
          name: string
          price_stars: number
          rarity?: string
          sort_order?: number | null
        }
        Update: {
          animation_url?: string | null
          category?: string
          created_at?: string | null
          description?: string | null
          emoji?: string
          id?: string
          is_available?: boolean | null
          name?: string
          price_stars?: number
          rarity?: string
          sort_order?: number | null
        }
        Relationships: []
      }
      group_chat_members: {
        Row: {
          group_id: string
          id: string
          joined_at: string | null
          role: string | null
          user_id: string
        }
        Insert: {
          group_id: string
          id?: string
          joined_at?: string | null
          role?: string | null
          user_id: string
        }
        Update: {
          group_id?: string
          id?: string
          joined_at?: string | null
          role?: string | null
          user_id?: string
        }
        Relationships: [
          {
            foreignKeyName: "group_chat_members_group_id_fkey"
            columns: ["group_id"]
            isOneToOne: false
            referencedRelation: "group_chats"
            referencedColumns: ["id"]
          },
        ]
      }
      group_chat_messages: {
        Row: {
          content: string
          created_at: string | null
          disappear_at: string | null
          disappear_in_seconds: number | null
          disappear_notified: boolean | null
          forward_hide_sender: boolean
          group_id: string
          id: string
          media_type: string | null
          media_url: string | null
          sender_id: string
          shared_post_id: string | null
          shared_reel_id: string | null
        }
        Insert: {
          content: string
          created_at?: string | null
          disappear_at?: string | null
          disappear_in_seconds?: number | null
          disappear_notified?: boolean | null
          forward_hide_sender?: boolean
          group_id: string
          id?: string
          media_type?: string | null
          media_url?: string | null
          sender_id: string
          shared_post_id?: string | null
          shared_reel_id?: string | null
        }
        Update: {
          content?: string
          created_at?: string | null
          disappear_at?: string | null
          disappear_in_seconds?: number | null
          disappear_notified?: boolean | null
          forward_hide_sender?: boolean
          group_id?: string
          id?: string
          media_type?: string | null
          media_url?: string | null
          sender_id?: string
          shared_post_id?: string | null
          shared_reel_id?: string | null
        }
        Relationships: [
          {
            foreignKeyName: "group_chat_messages_group_id_fkey"
            columns: ["group_id"]
            isOneToOne: false
            referencedRelation: "group_chats"
            referencedColumns: ["id"]
          },
          {
            foreignKeyName: "group_chat_messages_shared_post_id_fkey"
            columns: ["shared_post_id"]
            isOneToOne: false
            referencedRelation: "posts"
            referencedColumns: ["id"]
          },
          {
            foreignKeyName: "group_chat_messages_shared_reel_id_fkey"
            columns: ["shared_reel_id"]
            isOneToOne: false
            referencedRelation: "reels"
            referencedColumns: ["id"]
          },
        ]
      }
      group_chat_slow_mode_state: {
        Row: {
          group_id: string
          last_sent_at: string
          updated_at: string
          user_id: string
        }
        Insert: {
          group_id: string
          last_sent_at?: string
          updated_at?: string
          user_id: string
        }
        Update: {
          group_id?: string
          last_sent_at?: string
          updated_at?: string
          user_id?: string
        }
        Relationships: [
          {
            foreignKeyName: "group_chat_slow_mode_state_group_id_fkey"
            columns: ["group_id"]
            isOneToOne: false
            referencedRelation: "group_chats"
            referencedColumns: ["id"]
          },
        ]
      }
      group_chats: {
        Row: {
          avatar_url: string | null
          created_at: string | null
          default_disappear_seconds: number | null
          description: string | null
          id: string
          member_count: number | null
          name: string
          owner_id: string
          slow_mode_seconds: number
          topics_enabled: boolean | null
          updated_at: string | null
        }
        Insert: {
          avatar_url?: string | null
          created_at?: string | null
          default_disappear_seconds?: number | null
          description?: string | null
          id?: string
          member_count?: number | null
          name: string
          owner_id: string
          slow_mode_seconds?: number
          topics_enabled?: boolean | null
          updated_at?: string | null
        }
        Update: {
          avatar_url?: string | null
          created_at?: string | null
          default_disappear_seconds?: number | null
          description?: string | null
          id?: string
          member_count?: number | null
          name?: string
          owner_id?: string
          slow_mode_seconds?: number
          topics_enabled?: boolean | null
          updated_at?: string | null
        }
        Relationships: []
      }
      group_invite_links: {
        Row: {
          created_at: string
          created_by: string
          expires_at: string | null
          group_id: string
          id: string
          is_active: boolean
          max_uses: number | null
          token: string
          updated_at: string
          used_count: number
        }
        Insert: {
          created_at?: string
          created_by?: string
          expires_at?: string | null
          group_id: string
          id?: string
          is_active?: boolean
          max_uses?: number | null
          token: string
          updated_at?: string
          used_count?: number
        }
        Update: {
          created_at?: string
          created_by?: string
          expires_at?: string | null
          group_id?: string
          id?: string
          is_active?: boolean
          max_uses?: number | null
          token?: string
          updated_at?: string
          used_count?: number
        }
        Relationships: [
          {
            foreignKeyName: "group_invite_links_group_id_fkey"
            columns: ["group_id"]
            isOneToOne: false
            referencedRelation: "group_chats"
            referencedColumns: ["id"]
          },
        ]
      }
      group_members: {
        Row: {
          group_id: string
          id: string
          is_anonymous: boolean | null
          joined_at: string | null
          role: string
          user_id: string
        }
        Insert: {
          group_id: string
          id?: string
          is_anonymous?: boolean | null
          joined_at?: string | null
          role?: string
          user_id: string
        }
        Update: {
          group_id?: string
          id?: string
          is_anonymous?: boolean | null
          joined_at?: string | null
          role?: string
          user_id?: string
        }
        Relationships: []
      }
      group_message_reads: {
        Row: {
          message_id: string
          read_at: string
          user_id: string
        }
        Insert: {
          message_id: string
          read_at?: string
          user_id: string
        }
        Update: {
          message_id?: string
          read_at?: string
          user_id?: string
        }
        Relationships: []
      }
      group_topics: {
        Row: {
          created_at: string | null
          created_by: string
          description: string | null
          group_id: string
          icon_color: string | null
          icon_emoji: string | null
          id: string
          is_closed: boolean | null
          is_general: boolean | null
          last_message_at: string | null
          message_count: number | null
          name: string
          sort_order: number | null
        }
        Insert: {
          created_at?: string | null
          created_by: string
          description?: string | null
          group_id: string
          icon_color?: string | null
          icon_emoji?: string | null
          id?: string
          is_closed?: boolean | null
          is_general?: boolean | null
          last_message_at?: string | null
          message_count?: number | null
          name: string
          sort_order?: number | null
        }
        Update: {
          created_at?: string | null
          created_by?: string
          description?: string | null
          group_id?: string
          icon_color?: string | null
          icon_emoji?: string | null
          id?: string
          is_closed?: boolean | null
          is_general?: boolean | null
          last_message_at?: string | null
          message_count?: number | null
          name?: string
          sort_order?: number | null
        }
        Relationships: []
      }
      guardrail_alerts: {
        Row: {
          affected_feature: string | null
          assigned_to: string | null
          created_at: string | null
          current_value: number | null
          id: number
          metric_name: string
          notes: string | null
          recommended_action: string | null
          resolved_at: string | null
          severity: string | null
          status: string | null
          threshold: number | null
        }
        Insert: {
          affected_feature?: string | null
          assigned_to?: string | null
          created_at?: string | null
          current_value?: number | null
          id?: number
          metric_name: string
          notes?: string | null
          recommended_action?: string | null
          resolved_at?: string | null
          severity?: string | null
          status?: string | null
          threshold?: number | null
        }
        Update: {
          affected_feature?: string | null
          assigned_to?: string | null
          created_at?: string | null
          current_value?: number | null
          id?: number
          metric_name?: string
          notes?: string | null
          recommended_action?: string | null
          resolved_at?: string | null
          severity?: string | null
          status?: string | null
          threshold?: number | null
        }
        Relationships: []
      }
      guardrails_config: {
        Row: {
          action: string
          condition: string
          created_at: string
          enabled: boolean
          guardrail_name: string
          id: number
          kill_switch_flag: string | null
          metric_name: string
          severity: string
          threshold_value: number
          updated_at: string
          window_minutes: number
        }
        Insert: {
          action: string
          condition: string
          created_at?: string
          enabled?: boolean
          guardrail_name: string
          id?: number
          kill_switch_flag?: string | null
          metric_name: string
          severity: string
          threshold_value: number
          updated_at?: string
          window_minutes?: number
        }
        Update: {
          action?: string
          condition?: string
          created_at?: string
          enabled?: boolean
          guardrail_name?: string
          id?: number
          kill_switch_flag?: string | null
          metric_name?: string
          severity?: string
          threshold_value?: number
          updated_at?: string
          window_minutes?: number
        }
        Relationships: [
          {
            foreignKeyName: "guardrails_config_metric_name_fkey"
            columns: ["metric_name"]
            isOneToOne: false
            referencedRelation: "metrics_registry"
            referencedColumns: ["metric_name"]
          },
        ]
      }
      guide_items: {
        Row: {
          content_id: string
          content_type: string
          created_at: string | null
          guide_id: string
          id: string
          note: string | null
          position: number | null
        }
        Insert: {
          content_id: string
          content_type: string
          created_at?: string | null
          guide_id: string
          id?: string
          note?: string | null
          position?: number | null
        }
        Update: {
          content_id?: string
          content_type?: string
          created_at?: string | null
          guide_id?: string
          id?: string
          note?: string | null
          position?: number | null
        }
        Relationships: [
          {
            foreignKeyName: "guide_items_guide_id_fkey"
            columns: ["guide_id"]
            isOneToOne: false
            referencedRelation: "guides"
            referencedColumns: ["id"]
          },
        ]
      }
      guides: {
        Row: {
          author_id: string
          cover_url: string | null
          created_at: string | null
          description: string | null
          id: string
          title: string
          type: string | null
          updated_at: string | null
        }
        Insert: {
          author_id: string
          cover_url?: string | null
          created_at?: string | null
          description?: string | null
          id?: string
          title: string
          type?: string | null
          updated_at?: string | null
        }
        Update: {
          author_id?: string
          cover_url?: string | null
          created_at?: string | null
          description?: string | null
          id?: string
          title?: string
          type?: string | null
          updated_at?: string | null
        }
        Relationships: []
      }
      hashtag_categories: {
        Row: {
          category_id: string
          category_name: string
          created_at: string
          display_name_en: string | null
          display_name_ru: string
          icon_name: string | null
          is_active: boolean
          sort_order: number
          updated_at: string
        }
        Insert: {
          category_id?: string
          category_name: string
          created_at?: string
          display_name_en?: string | null
          display_name_ru: string
          icon_name?: string | null
          is_active?: boolean
          sort_order?: number
          updated_at?: string
        }
        Update: {
          category_id?: string
          category_name?: string
          created_at?: string
          display_name_en?: string | null
          display_name_ru?: string
          icon_name?: string | null
          is_active?: boolean
          sort_order?: number
          updated_at?: string
        }
        Relationships: []
      }
      hashtag_category_mapping: {
        Row: {
          category_id: string
          created_at: string
          hashtag_id: string
          mapping_id: string
          relevance_score: number
        }
        Insert: {
          category_id: string
          created_at?: string
          hashtag_id: string
          mapping_id?: string
          relevance_score?: number
        }
        Update: {
          category_id?: string
          created_at?: string
          hashtag_id?: string
          mapping_id?: string
          relevance_score?: number
        }
        Relationships: [
          {
            foreignKeyName: "hashtag_category_mapping_category_id_fkey"
            columns: ["category_id"]
            isOneToOne: false
            referencedRelation: "hashtag_categories"
            referencedColumns: ["category_id"]
          },
          {
            foreignKeyName: "hashtag_category_mapping_hashtag_id_fkey"
            columns: ["hashtag_id"]
            isOneToOne: false
            referencedRelation: "hashtags"
            referencedColumns: ["id"]
          },
        ]
      }
      hashtag_status_changes: {
        Row: {
          actor_id: string | null
          actor_type: string
          change_id: string
          created_at: string
          decided_at: string
          from_status: string
          hashtag_id: string
          notes: string | null
          reason_codes: string[]
          surface_policy: Json
          to_status: string
        }
        Insert: {
          actor_id?: string | null
          actor_type: string
          change_id?: string
          created_at?: string
          decided_at?: string
          from_status: string
          hashtag_id: string
          notes?: string | null
          reason_codes: string[]
          surface_policy: Json
          to_status: string
        }
        Update: {
          actor_id?: string | null
          actor_type?: string
          change_id?: string
          created_at?: string
          decided_at?: string
          from_status?: string
          hashtag_id?: string
          notes?: string | null
          reason_codes?: string[]
          surface_policy?: Json
          to_status?: string
        }
        Relationships: [
          {
            foreignKeyName: "hashtag_status_changes_hashtag_id_fkey"
            columns: ["hashtag_id"]
            isOneToOne: false
            referencedRelation: "hashtags"
            referencedColumns: ["id"]
          },
        ]
      }
      hashtags: {
        Row: {
          avg_completion_rate: number | null
          avg_likes_per_reel: number | null
          avg_saves_per_reel: number | null
          category: string | null
          created_at: string | null
          display_tag: string | null
          first_used_at: string | null
          growth_rate_24h: number | null
          growth_rate_7d: number | null
          id: string
          is_trending: boolean | null
          language: string | null
          last_calculated_at: string | null
          last_used_at: string | null
          moderated_at: string | null
          moderated_by: string | null
          moderation_reason: string | null
          normalized_tag: string
          peaked_at: string | null
          posts_count: number | null
          reels_count: number | null
          status: string
          status_updated_at: string
          tag: string
          total_views: number | null
          trend_level: string | null
          trend_rank: number | null
          usage_count: number | null
          usage_last_24h: number | null
          usage_last_30d: number | null
          usage_last_7d: number | null
          velocity_score: number | null
        }
        Insert: {
          avg_completion_rate?: number | null
          avg_likes_per_reel?: number | null
          avg_saves_per_reel?: number | null
          category?: string | null
          created_at?: string | null
          display_tag?: string | null
          first_used_at?: string | null
          growth_rate_24h?: number | null
          growth_rate_7d?: number | null
          id?: string
          is_trending?: boolean | null
          language?: string | null
          last_calculated_at?: string | null
          last_used_at?: string | null
          moderated_at?: string | null
          moderated_by?: string | null
          moderation_reason?: string | null
          normalized_tag: string
          peaked_at?: string | null
          posts_count?: number | null
          reels_count?: number | null
          status?: string
          status_updated_at?: string
          tag: string
          total_views?: number | null
          trend_level?: string | null
          trend_rank?: number | null
          usage_count?: number | null
          usage_last_24h?: number | null
          usage_last_30d?: number | null
          usage_last_7d?: number | null
          velocity_score?: number | null
        }
        Update: {
          avg_completion_rate?: number | null
          avg_likes_per_reel?: number | null
          avg_saves_per_reel?: number | null
          category?: string | null
          created_at?: string | null
          display_tag?: string | null
          first_used_at?: string | null
          growth_rate_24h?: number | null
          growth_rate_7d?: number | null
          id?: string
          is_trending?: boolean | null
          language?: string | null
          last_calculated_at?: string | null
          last_used_at?: string | null
          moderated_at?: string | null
          moderated_by?: string | null
          moderation_reason?: string | null
          normalized_tag?: string
          peaked_at?: string | null
          posts_count?: number | null
          reels_count?: number | null
          status?: string
          status_updated_at?: string
          tag?: string
          total_views?: number | null
          trend_level?: string | null
          trend_rank?: number | null
          usage_count?: number | null
          usage_last_24h?: number | null
          usage_last_30d?: number | null
          usage_last_7d?: number | null
          velocity_score?: number | null
        }
        Relationships: []
      }
      highlight_stories: {
        Row: {
          added_at: string
          highlight_id: string
          id: string
          position: number
          story_id: string
        }
        Insert: {
          added_at?: string
          highlight_id: string
          id?: string
          position?: number
          story_id: string
        }
        Update: {
          added_at?: string
          highlight_id?: string
          id?: string
          position?: number
          story_id?: string
        }
        Relationships: [
          {
            foreignKeyName: "highlight_stories_highlight_id_fkey"
            columns: ["highlight_id"]
            isOneToOne: false
            referencedRelation: "story_highlights"
            referencedColumns: ["id"]
          },
          {
            foreignKeyName: "highlight_stories_story_id_fkey"
            columns: ["story_id"]
            isOneToOne: false
            referencedRelation: "stories"
            referencedColumns: ["id"]
          },
        ]
      }
      highlights: {
        Row: {
          cover_url: string | null
          created_at: string | null
          id: string
          position: number | null
          title: string
          updated_at: string | null
          user_id: string
        }
        Insert: {
          cover_url?: string | null
          created_at?: string | null
          id?: string
          position?: number | null
          title: string
          updated_at?: string | null
          user_id: string
        }
        Update: {
          cover_url?: string | null
          created_at?: string | null
          id?: string
          position?: number | null
          title?: string
          updated_at?: string | null
          user_id?: string
        }
        Relationships: []
      }
      idempotency_keys: {
        Row: {
          created_at: string
          expires_at: string
          key: string
          request_hash: string
          response_body: Json | null
          response_code: number | null
          scope: string
          status: string
        }
        Insert: {
          created_at?: string
          expires_at?: string
          key: string
          request_hash: string
          response_body?: Json | null
          response_code?: number | null
          scope: string
          status: string
        }
        Update: {
          created_at?: string
          expires_at?: string
          key?: string
          request_hash?: string
          response_body?: Json | null
          response_code?: number | null
          scope?: string
          status?: string
        }
        Relationships: []
      }
      idempotency_locks: {
        Row: {
          actor_id: string
          expires_at: string
          idempotency_key_norm: string
          locked_at: string
          scope_id: string
        }
        Insert: {
          actor_id: string
          expires_at?: string
          idempotency_key_norm: string
          locked_at?: string
          scope_id: string
        }
        Update: {
          actor_id?: string
          expires_at?: string
          idempotency_key_norm?: string
          locked_at?: string
          scope_id?: string
        }
        Relationships: [
          {
            foreignKeyName: "idempotency_locks_scope_id_fkey"
            columns: ["scope_id"]
            isOneToOne: false
            referencedRelation: "core_scopes"
            referencedColumns: ["scope_id"]
          },
        ]
      }
      idempotency_outcomes_archive: {
        Row: {
          actor_id: string
          archived_at: string
          command_type: string
          created_at: string
          idempotency_key_norm: string
          outcome: Json
          outcome_code: string
          outcome_hash: string
          scope_id: string
          state: string
        }
        Insert: {
          actor_id: string
          archived_at?: string
          command_type: string
          created_at?: string
          idempotency_key_norm: string
          outcome: Json
          outcome_code: string
          outcome_hash: string
          scope_id: string
          state: string
        }
        Update: {
          actor_id?: string
          archived_at?: string
          command_type?: string
          created_at?: string
          idempotency_key_norm?: string
          outcome?: Json
          outcome_code?: string
          outcome_hash?: string
          scope_id?: string
          state?: string
        }
        Relationships: [
          {
            foreignKeyName: "idempotency_outcomes_archive_scope_id_fkey"
            columns: ["scope_id"]
            isOneToOne: false
            referencedRelation: "core_scopes"
            referencedColumns: ["scope_id"]
          },
        ]
      }
      idempotency_outcomes_hot: {
        Row: {
          actor_id: string
          command_type: string
          created_at: string
          expires_at: string
          idempotency_key_norm: string
          outcome: Json
          outcome_code: string
          outcome_hash: string
          scope_id: string
          state: string
        }
        Insert: {
          actor_id: string
          command_type: string
          created_at?: string
          expires_at?: string
          idempotency_key_norm: string
          outcome: Json
          outcome_code: string
          outcome_hash: string
          scope_id: string
          state: string
        }
        Update: {
          actor_id?: string
          command_type?: string
          created_at?: string
          expires_at?: string
          idempotency_key_norm?: string
          outcome?: Json
          outcome_code?: string
          outcome_hash?: string
          scope_id?: string
          state?: string
        }
        Relationships: [
          {
            foreignKeyName: "idempotency_outcomes_hot_scope_id_fkey"
            columns: ["scope_id"]
            isOneToOne: false
            referencedRelation: "core_scopes"
            referencedColumns: ["scope_id"]
          },
        ]
      }
      idempotency_register: {
        Row: {
          created_at: string
          expires_at: string
          id: number
          idempotency_key: string
          organization_id: string
          result_payload: Json
          result_status: string
        }
        Insert: {
          created_at?: string
          expires_at?: string
          id?: number
          idempotency_key: string
          organization_id?: string
          result_payload: Json
          result_status: string
        }
        Update: {
          created_at?: string
          expires_at?: string
          id?: number
          idempotency_key?: string
          organization_id?: string
          result_payload?: Json
          result_status?: string
        }
        Relationships: []
      }
      incidents: {
        Row: {
          affected_users: number | null
          created_at: string | null
          description: string | null
          estimated_impact_usd: number | null
          id: number
          post_mortem_url: string | null
          resolution: string | null
          resolved_at: string | null
          root_cause: string | null
          severity: string | null
          started_at: string | null
          status: string | null
          title: string
        }
        Insert: {
          affected_users?: number | null
          created_at?: string | null
          description?: string | null
          estimated_impact_usd?: number | null
          id?: number
          post_mortem_url?: string | null
          resolution?: string | null
          resolved_at?: string | null
          root_cause?: string | null
          severity?: string | null
          started_at?: string | null
          status?: string | null
          title: string
        }
        Update: {
          affected_users?: number | null
          created_at?: string | null
          description?: string | null
          estimated_impact_usd?: number | null
          id?: number
          post_mortem_url?: string | null
          resolution?: string | null
          resolved_at?: string | null
          root_cause?: string | null
          severity?: string | null
          started_at?: string | null
          status?: string | null
          title?: string
        }
        Relationships: []
      }
      insurance_calculations: {
        Row: {
          agent_id: string | null
          client_id: string | null
          commission_amount: number | null
          created_at: string
          draft_id: string | null
          expires_at: string | null
          id: string
          input_data: Json
          product_type: string
          quote_session_id: string | null
          results: Json | null
          selected_company_id: string | null
          selected_price: number | null
          status: Database["public"]["Enums"]["calculation_status"]
          updated_at: string
          user_id: string | null
        }
        Insert: {
          agent_id?: string | null
          client_id?: string | null
          commission_amount?: number | null
          created_at?: string
          draft_id?: string | null
          expires_at?: string | null
          id?: string
          input_data: Json
          product_type: string
          quote_session_id?: string | null
          results?: Json | null
          selected_company_id?: string | null
          selected_price?: number | null
          status?: Database["public"]["Enums"]["calculation_status"]
          updated_at?: string
          user_id?: string | null
        }
        Update: {
          agent_id?: string | null
          client_id?: string | null
          commission_amount?: number | null
          created_at?: string
          draft_id?: string | null
          expires_at?: string | null
          id?: string
          input_data?: Json
          product_type?: string
          quote_session_id?: string | null
          results?: Json | null
          selected_company_id?: string | null
          selected_price?: number | null
          status?: Database["public"]["Enums"]["calculation_status"]
          updated_at?: string
          user_id?: string | null
        }
        Relationships: [
          {
            foreignKeyName: "insurance_calculations_agent_id_fkey"
            columns: ["agent_id"]
            isOneToOne: false
            referencedRelation: "agent_profiles"
            referencedColumns: ["id"]
          },
          {
            foreignKeyName: "insurance_calculations_client_id_fkey"
            columns: ["client_id"]
            isOneToOne: false
            referencedRelation: "insurance_clients"
            referencedColumns: ["id"]
          },
          {
            foreignKeyName: "insurance_calculations_draft_id_fkey"
            columns: ["draft_id"]
            isOneToOne: false
            referencedRelation: "insurance_drafts"
            referencedColumns: ["id"]
          },
          {
            foreignKeyName: "insurance_calculations_quote_session_id_fkey"
            columns: ["quote_session_id"]
            isOneToOne: false
            referencedRelation: "insurance_quote_sessions"
            referencedColumns: ["id"]
          },
          {
            foreignKeyName: "insurance_calculations_selected_company_id_fkey"
            columns: ["selected_company_id"]
            isOneToOne: false
            referencedRelation: "insurance_companies"
            referencedColumns: ["id"]
          },
        ]
      }
      insurance_claims: {
        Row: {
          approved_amount: number | null
          claim_amount: number | null
          claim_number: string
          created_at: string
          description: string
          documents: Json | null
          id: string
          policy_id: string
          resolved_at: string | null
          status: string
          submitted_at: string
          user_id: string
        }
        Insert: {
          approved_amount?: number | null
          claim_amount?: number | null
          claim_number: string
          created_at?: string
          description: string
          documents?: Json | null
          id?: string
          policy_id: string
          resolved_at?: string | null
          status?: string
          submitted_at?: string
          user_id: string
        }
        Update: {
          approved_amount?: number | null
          claim_amount?: number | null
          claim_number?: string
          created_at?: string
          description?: string
          documents?: Json | null
          id?: string
          policy_id?: string
          resolved_at?: string | null
          status?: string
          submitted_at?: string
          user_id?: string
        }
        Relationships: [
          {
            foreignKeyName: "insurance_claims_policy_id_fkey"
            columns: ["policy_id"]
            isOneToOne: false
            referencedRelation: "insurance_policies"
            referencedColumns: ["id"]
          },
        ]
      }
      insurance_clients: {
        Row: {
          address: string | null
          agent_id: string | null
          birth_date: string | null
          created_at: string
          email: string | null
          full_name: string
          id: string
          notes: string | null
          passport_number: string | null
          passport_series: string | null
          phone: string | null
          tags: string[] | null
          updated_at: string
          user_id: string | null
        }
        Insert: {
          address?: string | null
          agent_id?: string | null
          birth_date?: string | null
          created_at?: string
          email?: string | null
          full_name: string
          id?: string
          notes?: string | null
          passport_number?: string | null
          passport_series?: string | null
          phone?: string | null
          tags?: string[] | null
          updated_at?: string
          user_id?: string | null
        }
        Update: {
          address?: string | null
          agent_id?: string | null
          birth_date?: string | null
          created_at?: string
          email?: string | null
          full_name?: string
          id?: string
          notes?: string | null
          passport_number?: string | null
          passport_series?: string | null
          phone?: string | null
          tags?: string[] | null
          updated_at?: string
          user_id?: string | null
        }
        Relationships: [
          {
            foreignKeyName: "insurance_clients_agent_id_fkey"
            columns: ["agent_id"]
            isOneToOne: false
            referencedRelation: "agent_profiles"
            referencedColumns: ["id"]
          },
        ]
      }
      insurance_commissions: {
        Row: {
          agent_id: string
          amount: number
          calculation_id: string | null
          confirmed_at: string | null
          created_at: string
          id: string
          paid_at: string | null
          policy_id: string | null
          rate: number
          status: Database["public"]["Enums"]["commission_status"]
        }
        Insert: {
          agent_id: string
          amount: number
          calculation_id?: string | null
          confirmed_at?: string | null
          created_at?: string
          id?: string
          paid_at?: string | null
          policy_id?: string | null
          rate: number
          status?: Database["public"]["Enums"]["commission_status"]
        }
        Update: {
          agent_id?: string
          amount?: number
          calculation_id?: string | null
          confirmed_at?: string | null
          created_at?: string
          id?: string
          paid_at?: string | null
          policy_id?: string | null
          rate?: number
          status?: Database["public"]["Enums"]["commission_status"]
        }
        Relationships: [
          {
            foreignKeyName: "insurance_commissions_agent_id_fkey"
            columns: ["agent_id"]
            isOneToOne: false
            referencedRelation: "agent_profiles"
            referencedColumns: ["id"]
          },
          {
            foreignKeyName: "insurance_commissions_calculation_id_fkey"
            columns: ["calculation_id"]
            isOneToOne: false
            referencedRelation: "insurance_calculations"
            referencedColumns: ["id"]
          },
          {
            foreignKeyName: "insurance_commissions_policy_id_fkey"
            columns: ["policy_id"]
            isOneToOne: false
            referencedRelation: "insurance_policies"
            referencedColumns: ["id"]
          },
        ]
      }
      insurance_companies: {
        Row: {
          address: string | null
          api_enabled: boolean | null
          avg_claim_days: number | null
          claim_approval_rate: number | null
          commission_rate: number | null
          cons: string[] | null
          created_at: string
          description: string | null
          email: string | null
          founded_year: number | null
          has_mobile_app: boolean | null
          has_online_service: boolean | null
          id: string
          is_active: boolean | null
          is_partner: boolean | null
          is_verified: boolean | null
          license_number: string | null
          logo_url: string | null
          name: string
          phone: string | null
          priority: number | null
          products_count: number | null
          pros: string[] | null
          rating: number | null
          regions: string[] | null
          reviews_count: number | null
          slug: string | null
          supported_products: string[] | null
          website: string | null
        }
        Insert: {
          address?: string | null
          api_enabled?: boolean | null
          avg_claim_days?: number | null
          claim_approval_rate?: number | null
          commission_rate?: number | null
          cons?: string[] | null
          created_at?: string
          description?: string | null
          email?: string | null
          founded_year?: number | null
          has_mobile_app?: boolean | null
          has_online_service?: boolean | null
          id?: string
          is_active?: boolean | null
          is_partner?: boolean | null
          is_verified?: boolean | null
          license_number?: string | null
          logo_url?: string | null
          name: string
          phone?: string | null
          priority?: number | null
          products_count?: number | null
          pros?: string[] | null
          rating?: number | null
          regions?: string[] | null
          reviews_count?: number | null
          slug?: string | null
          supported_products?: string[] | null
          website?: string | null
        }
        Update: {
          address?: string | null
          api_enabled?: boolean | null
          avg_claim_days?: number | null
          claim_approval_rate?: number | null
          commission_rate?: number | null
          cons?: string[] | null
          created_at?: string
          description?: string | null
          email?: string | null
          founded_year?: number | null
          has_mobile_app?: boolean | null
          has_online_service?: boolean | null
          id?: string
          is_active?: boolean | null
          is_partner?: boolean | null
          is_verified?: boolean | null
          license_number?: string | null
          logo_url?: string | null
          name?: string
          phone?: string | null
          priority?: number | null
          products_count?: number | null
          pros?: string[] | null
          rating?: number | null
          regions?: string[] | null
          reviews_count?: number | null
          slug?: string | null
          supported_products?: string[] | null
          website?: string | null
        }
        Relationships: []
      }
      insurance_company_reviews: {
        Row: {
          company_id: string
          cons_text: string | null
          created_at: string
          helpful_count: number | null
          id: string
          pros_text: string | null
          rating: number
          status: string | null
          user_id: string
        }
        Insert: {
          company_id: string
          cons_text?: string | null
          created_at?: string
          helpful_count?: number | null
          id?: string
          pros_text?: string | null
          rating: number
          status?: string | null
          user_id: string
        }
        Update: {
          company_id?: string
          cons_text?: string | null
          created_at?: string
          helpful_count?: number | null
          id?: string
          pros_text?: string | null
          rating?: number
          status?: string | null
          user_id?: string
        }
        Relationships: [
          {
            foreignKeyName: "insurance_company_reviews_company_id_fkey"
            columns: ["company_id"]
            isOneToOne: false
            referencedRelation: "insurance_companies"
            referencedColumns: ["id"]
          },
        ]
      }
      insurance_drafts: {
        Row: {
          created_at: string | null
          form_data: Json
          id: string
          product_type: string
          step: number | null
          title: string | null
          updated_at: string | null
          user_id: string
        }
        Insert: {
          created_at?: string | null
          form_data?: Json
          id?: string
          product_type: string
          step?: number | null
          title?: string | null
          updated_at?: string | null
          user_id: string
        }
        Update: {
          created_at?: string | null
          form_data?: Json
          id?: string
          product_type?: string
          step?: number | null
          title?: string | null
          updated_at?: string | null
          user_id?: string
        }
        Relationships: []
      }
      insurance_kbm_cache: {
        Row: {
          birth_date_hash: string
          created_at: string
          driver_license_hash: string
          expires_at: string
          id: string
          kbm_class: number
          kbm_coefficient: number
          kbm_label: string
          previous_claims_count: number
          source: string
        }
        Insert: {
          birth_date_hash: string
          created_at?: string
          driver_license_hash: string
          expires_at?: string
          id?: string
          kbm_class: number
          kbm_coefficient: number
          kbm_label: string
          previous_claims_count?: number
          source?: string
        }
        Update: {
          birth_date_hash?: string
          created_at?: string
          driver_license_hash?: string
          expires_at?: string
          id?: string
          kbm_class?: number
          kbm_coefficient?: number
          kbm_label?: string
          previous_claims_count?: number
          source?: string
        }
        Relationships: []
      }
      insurance_loyalty_history: {
        Row: {
          agent_id: string
          bonus_percent: number
          calculated_at: string | null
          id: string
          level_after: string
          level_before: string
          premiums_total: number
          quarter: string
        }
        Insert: {
          agent_id: string
          bonus_percent: number
          calculated_at?: string | null
          id?: string
          level_after: string
          level_before: string
          premiums_total: number
          quarter: string
        }
        Update: {
          agent_id?: string
          bonus_percent?: number
          calculated_at?: string | null
          id?: string
          level_after?: string
          level_before?: string
          premiums_total?: number
          quarter?: string
        }
        Relationships: [
          {
            foreignKeyName: "insurance_loyalty_history_agent_id_fkey"
            columns: ["agent_id"]
            isOneToOne: false
            referencedRelation: "agent_profiles"
            referencedColumns: ["id"]
          },
        ]
      }
      insurance_payments: {
        Row: {
          amount: number
          completed_at: string | null
          created_at: string | null
          external_id: string | null
          id: string
          payment_method: string | null
          policy_id: string
          status: string | null
          user_id: string
        }
        Insert: {
          amount: number
          completed_at?: string | null
          created_at?: string | null
          external_id?: string | null
          id?: string
          payment_method?: string | null
          policy_id: string
          status?: string | null
          user_id: string
        }
        Update: {
          amount?: number
          completed_at?: string | null
          created_at?: string | null
          external_id?: string | null
          id?: string
          payment_method?: string | null
          policy_id?: string
          status?: string | null
          user_id?: string
        }
        Relationships: [
          {
            foreignKeyName: "insurance_payments_policy_id_fkey"
            columns: ["policy_id"]
            isOneToOne: false
            referencedRelation: "insurance_policies"
            referencedColumns: ["id"]
          },
        ]
      }
      insurance_payouts: {
        Row: {
          agent_id: string
          amount: number
          created_at: string
          error_message: string | null
          id: string
          payment_details: Json | null
          payment_method: string
          processed_at: string | null
          status: Database["public"]["Enums"]["payout_status"]
        }
        Insert: {
          agent_id: string
          amount: number
          created_at?: string
          error_message?: string | null
          id?: string
          payment_details?: Json | null
          payment_method: string
          processed_at?: string | null
          status?: Database["public"]["Enums"]["payout_status"]
        }
        Update: {
          agent_id?: string
          amount?: number
          created_at?: string
          error_message?: string | null
          id?: string
          payment_details?: Json | null
          payment_method?: string
          processed_at?: string | null
          status?: Database["public"]["Enums"]["payout_status"]
        }
        Relationships: [
          {
            foreignKeyName: "insurance_payouts_agent_id_fkey"
            columns: ["agent_id"]
            isOneToOne: false
            referencedRelation: "agent_profiles"
            referencedColumns: ["id"]
          },
        ]
      }
      insurance_policies: {
        Row: {
          additional_data: Json | null
          agent_id: string | null
          calculation_id: string | null
          client_id: string | null
          commission_amount: number | null
          company_id: string | null
          coverage_amount: number | null
          created_at: string
          document_url: string | null
          documents: Json | null
          end_date: string
          id: string
          insured_email: string | null
          insured_name: string
          insured_object: Json | null
          insured_phone: string | null
          paid_at: string | null
          policy_number: string | null
          premium_amount: number
          product_id: string
          property_data: Json | null
          source: string | null
          start_date: string
          status: Database["public"]["Enums"]["policy_status"]
          type: string | null
          updated_at: string
          user_id: string
          vehicle_data: Json | null
        }
        Insert: {
          additional_data?: Json | null
          agent_id?: string | null
          calculation_id?: string | null
          client_id?: string | null
          commission_amount?: number | null
          company_id?: string | null
          coverage_amount?: number | null
          created_at?: string
          document_url?: string | null
          documents?: Json | null
          end_date: string
          id?: string
          insured_email?: string | null
          insured_name: string
          insured_object?: Json | null
          insured_phone?: string | null
          paid_at?: string | null
          policy_number?: string | null
          premium_amount: number
          product_id: string
          property_data?: Json | null
          source?: string | null
          start_date: string
          status?: Database["public"]["Enums"]["policy_status"]
          type?: string | null
          updated_at?: string
          user_id: string
          vehicle_data?: Json | null
        }
        Update: {
          additional_data?: Json | null
          agent_id?: string | null
          calculation_id?: string | null
          client_id?: string | null
          commission_amount?: number | null
          company_id?: string | null
          coverage_amount?: number | null
          created_at?: string
          document_url?: string | null
          documents?: Json | null
          end_date?: string
          id?: string
          insured_email?: string | null
          insured_name?: string
          insured_object?: Json | null
          insured_phone?: string | null
          paid_at?: string | null
          policy_number?: string | null
          premium_amount?: number
          product_id?: string
          property_data?: Json | null
          source?: string | null
          start_date?: string
          status?: Database["public"]["Enums"]["policy_status"]
          type?: string | null
          updated_at?: string
          user_id?: string
          vehicle_data?: Json | null
        }
        Relationships: [
          {
            foreignKeyName: "insurance_policies_agent_id_fkey"
            columns: ["agent_id"]
            isOneToOne: false
            referencedRelation: "agent_profiles"
            referencedColumns: ["id"]
          },
          {
            foreignKeyName: "insurance_policies_calculation_id_fkey"
            columns: ["calculation_id"]
            isOneToOne: false
            referencedRelation: "insurance_calculations"
            referencedColumns: ["id"]
          },
          {
            foreignKeyName: "insurance_policies_client_id_fkey"
            columns: ["client_id"]
            isOneToOne: false
            referencedRelation: "insurance_clients"
            referencedColumns: ["id"]
          },
          {
            foreignKeyName: "insurance_policies_product_id_fkey"
            columns: ["product_id"]
            isOneToOne: false
            referencedRelation: "insurance_products"
            referencedColumns: ["id"]
          },
        ]
      }
      insurance_products: {
        Row: {
          badge: string | null
          calculation_params: Json | null
          category: Database["public"]["Enums"]["insurance_category"]
          company_id: string
          coverage_amount: number | null
          coverage_details: Json | null
          created_at: string
          description: string | null
          documents_required: string[] | null
          features: Json | null
          id: string
          is_active: boolean | null
          is_popular: boolean | null
          max_premium: number | null
          max_term_days: number | null
          min_premium: number | null
          min_term_days: number | null
          name: string
          price_from: number
          terms_url: string | null
          type: string | null
          updated_at: string
        }
        Insert: {
          badge?: string | null
          calculation_params?: Json | null
          category: Database["public"]["Enums"]["insurance_category"]
          company_id: string
          coverage_amount?: number | null
          coverage_details?: Json | null
          created_at?: string
          description?: string | null
          documents_required?: string[] | null
          features?: Json | null
          id?: string
          is_active?: boolean | null
          is_popular?: boolean | null
          max_premium?: number | null
          max_term_days?: number | null
          min_premium?: number | null
          min_term_days?: number | null
          name: string
          price_from: number
          terms_url?: string | null
          type?: string | null
          updated_at?: string
        }
        Update: {
          badge?: string | null
          calculation_params?: Json | null
          category?: Database["public"]["Enums"]["insurance_category"]
          company_id?: string
          coverage_amount?: number | null
          coverage_details?: Json | null
          created_at?: string
          description?: string | null
          documents_required?: string[] | null
          features?: Json | null
          id?: string
          is_active?: boolean | null
          is_popular?: boolean | null
          max_premium?: number | null
          max_term_days?: number | null
          min_premium?: number | null
          min_term_days?: number | null
          name?: string
          price_from?: number
          terms_url?: string | null
          type?: string | null
          updated_at?: string
        }
        Relationships: [
          {
            foreignKeyName: "insurance_products_company_id_fkey"
            columns: ["company_id"]
            isOneToOne: false
            referencedRelation: "insurance_companies"
            referencedColumns: ["id"]
          },
        ]
      }
      insurance_provider_logs: {
        Row: {
          created_at: string
          error_message: string | null
          http_status: number | null
          id: string
          is_success: boolean
          operation: string
          provider_code: string
          request_category: string | null
          request_meta: Json | null
          response_time_ms: number
        }
        Insert: {
          created_at?: string
          error_message?: string | null
          http_status?: number | null
          id?: string
          is_success: boolean
          operation: string
          provider_code: string
          request_category?: string | null
          request_meta?: Json | null
          response_time_ms: number
        }
        Update: {
          created_at?: string
          error_message?: string | null
          http_status?: number | null
          id?: string
          is_success?: boolean
          operation?: string
          provider_code?: string
          request_category?: string | null
          request_meta?: Json | null
          response_time_ms?: number
        }
        Relationships: []
      }
      insurance_providers: {
        Row: {
          api_key_env: string | null
          base_url: string | null
          code: string
          created_at: string
          id: string
          is_active: boolean
          meta: Json
          name: string
          priority: number
          sandbox_mode: boolean
          supported_categories: string[]
          timeout_ms: number
        }
        Insert: {
          api_key_env?: string | null
          base_url?: string | null
          code: string
          created_at?: string
          id?: string
          is_active?: boolean
          meta?: Json
          name: string
          priority?: number
          sandbox_mode?: boolean
          supported_categories?: string[]
          timeout_ms?: number
        }
        Update: {
          api_key_env?: string | null
          base_url?: string | null
          code?: string
          created_at?: string
          id?: string
          is_active?: boolean
          meta?: Json
          name?: string
          priority?: number
          sandbox_mode?: boolean
          supported_categories?: string[]
          timeout_ms?: number
        }
        Relationships: []
      }
      insurance_quote_offers: {
        Row: {
          company_id: string | null
          company_name: string
          coverage_amount: number
          created_at: string
          deductible_amount: number | null
          details: Json
          documents_required: string[] | null
          exclusions: string[] | null
          external_offer_id: string | null
          features: string[] | null
          id: string
          is_mock: boolean
          premium_amount: number
          premium_monthly: number | null
          provider_code: string
          purchase_available: boolean
          rank: number | null
          session_id: string
          status: string
          valid_until: string
        }
        Insert: {
          company_id?: string | null
          company_name: string
          coverage_amount: number
          created_at?: string
          deductible_amount?: number | null
          details?: Json
          documents_required?: string[] | null
          exclusions?: string[] | null
          external_offer_id?: string | null
          features?: string[] | null
          id?: string
          is_mock?: boolean
          premium_amount: number
          premium_monthly?: number | null
          provider_code: string
          purchase_available?: boolean
          rank?: number | null
          session_id: string
          status?: string
          valid_until: string
        }
        Update: {
          company_id?: string | null
          company_name?: string
          coverage_amount?: number
          created_at?: string
          deductible_amount?: number | null
          details?: Json
          documents_required?: string[] | null
          exclusions?: string[] | null
          external_offer_id?: string | null
          features?: string[] | null
          id?: string
          is_mock?: boolean
          premium_amount?: number
          premium_monthly?: number | null
          provider_code?: string
          purchase_available?: boolean
          rank?: number | null
          session_id?: string
          status?: string
          valid_until?: string
        }
        Relationships: [
          {
            foreignKeyName: "insurance_quote_offers_company_id_fkey"
            columns: ["company_id"]
            isOneToOne: false
            referencedRelation: "insurance_companies"
            referencedColumns: ["id"]
          },
          {
            foreignKeyName: "insurance_quote_offers_session_id_fkey"
            columns: ["session_id"]
            isOneToOne: false
            referencedRelation: "insurance_quote_sessions"
            referencedColumns: ["id"]
          },
        ]
      }
      insurance_quote_sessions: {
        Row: {
          calculation_time_ms: number | null
          category: string
          created_at: string
          expires_at: string
          has_real_quotes: boolean
          id: string
          providers_queried: number
          providers_succeeded: number
          request_params: Json
          status: string
          user_id: string
        }
        Insert: {
          calculation_time_ms?: number | null
          category: string
          created_at?: string
          expires_at?: string
          has_real_quotes?: boolean
          id?: string
          providers_queried?: number
          providers_succeeded?: number
          request_params?: Json
          status?: string
          user_id: string
        }
        Update: {
          calculation_time_ms?: number | null
          category?: string
          created_at?: string
          expires_at?: string
          has_real_quotes?: boolean
          id?: string
          providers_queried?: number
          providers_succeeded?: number
          request_params?: Json
          status?: string
          user_id?: string
        }
        Relationships: []
      }
      insurance_referral_links: {
        Row: {
          activations: number | null
          agent_id: string
          calculations: number | null
          code: string
          created_at: string | null
          id: string
          is_active: boolean | null
          name: string | null
          policies: number | null
          quota_percent: number | null
          revenue: number | null
          type: string
        }
        Insert: {
          activations?: number | null
          agent_id: string
          calculations?: number | null
          code?: string
          created_at?: string | null
          id?: string
          is_active?: boolean | null
          name?: string | null
          policies?: number | null
          quota_percent?: number | null
          revenue?: number | null
          type: string
        }
        Update: {
          activations?: number | null
          agent_id?: string
          calculations?: number | null
          code?: string
          created_at?: string | null
          id?: string
          is_active?: boolean | null
          name?: string | null
          policies?: number | null
          quota_percent?: number | null
          revenue?: number | null
          type?: string
        }
        Relationships: [
          {
            foreignKeyName: "insurance_referral_links_agent_id_fkey"
            columns: ["agent_id"]
            isOneToOne: false
            referencedRelation: "agent_profiles"
            referencedColumns: ["id"]
          },
        ]
      }
      insurance_vehicle_cache: {
        Row: {
          body_type: string | null
          color: string | null
          created_at: string
          engine_power: number | null
          expires_at: string
          id: string
          make: string
          model: string
          plate: string
          plate_normalized: string | null
          source: string
          vehicle_type: string
          vin: string | null
          year: number
        }
        Insert: {
          body_type?: string | null
          color?: string | null
          created_at?: string
          engine_power?: number | null
          expires_at?: string
          id?: string
          make: string
          model: string
          plate: string
          plate_normalized?: string | null
          source?: string
          vehicle_type?: string
          vin?: string | null
          year: number
        }
        Update: {
          body_type?: string | null
          color?: string | null
          created_at?: string
          engine_power?: number | null
          expires_at?: string
          id?: string
          make?: string
          model?: string
          plate?: string
          plate_normalized?: string | null
          source?: string
          vehicle_type?: string
          vin?: string | null
          year?: number
        }
        Relationships: []
      }
      insurance_vehicles: {
        Row: {
          brand: string | null
          client_id: string | null
          created_at: string | null
          doc_date: string | null
          doc_number: string | null
          doc_series: string | null
          doc_type: string | null
          gos_number: string | null
          id: string
          model: string | null
          power: number | null
          user_id: string | null
          vin: string | null
          year: number | null
        }
        Insert: {
          brand?: string | null
          client_id?: string | null
          created_at?: string | null
          doc_date?: string | null
          doc_number?: string | null
          doc_series?: string | null
          doc_type?: string | null
          gos_number?: string | null
          id?: string
          model?: string | null
          power?: number | null
          user_id?: string | null
          vin?: string | null
          year?: number | null
        }
        Update: {
          brand?: string | null
          client_id?: string | null
          created_at?: string | null
          doc_date?: string | null
          doc_number?: string | null
          doc_series?: string | null
          doc_type?: string | null
          gos_number?: string | null
          id?: string
          model?: string | null
          power?: number | null
          user_id?: string | null
          vin?: string | null
          year?: number | null
        }
        Relationships: [
          {
            foreignKeyName: "insurance_vehicles_client_id_fkey"
            columns: ["client_id"]
            isOneToOne: false
            referencedRelation: "insurance_clients"
            referencedColumns: ["id"]
          },
        ]
      }
      integration_webhooks: {
        Row: {
          created_at: string
          direction: string
          events: string[]
          headers: Json
          id: string
          is_active: boolean
          last_error: string | null
          last_invoked_at: string | null
          last_status: string | null
          provider: string
          secret: string | null
          updated_at: string
          url: string
          user_id: string
        }
        Insert: {
          created_at?: string
          direction: string
          events?: string[]
          headers?: Json
          id?: string
          is_active?: boolean
          last_error?: string | null
          last_invoked_at?: string | null
          last_status?: string | null
          provider?: string
          secret?: string | null
          updated_at?: string
          url: string
          user_id: string
        }
        Update: {
          created_at?: string
          direction?: string
          events?: string[]
          headers?: Json
          id?: string
          is_active?: boolean
          last_error?: string | null
          last_invoked_at?: string | null
          last_status?: string | null
          provider?: string
          secret?: string | null
          updated_at?: string
          url?: string
          user_id?: string
        }
        Relationships: []
      }
      integration_workflows: {
        Row: {
          action: Json
          condition: Json
          created_at: string
          id: string
          is_active: boolean
          name: string
          trigger_event: string
          updated_at: string
          user_id: string
        }
        Insert: {
          action?: Json
          condition?: Json
          created_at?: string
          id?: string
          is_active?: boolean
          name: string
          trigger_event: string
          updated_at?: string
          user_id: string
        }
        Update: {
          action?: Json
          condition?: Json
          created_at?: string
          id?: string
          is_active?: boolean
          name?: string
          trigger_event?: string
          updated_at?: string
          user_id?: string
        }
        Relationships: []
      }
      internal_event_dedup: {
        Row: {
          event_id: string
          expires_at_ms: number
          issued_at_ms: number
          payload_hash: string | null
          seen_at: string
          source: string | null
        }
        Insert: {
          event_id: string
          expires_at_ms: number
          issued_at_ms: number
          payload_hash?: string | null
          seen_at?: string
          source?: string | null
        }
        Update: {
          event_id?: string
          expires_at_ms?: number
          issued_at_ms?: number
          payload_hash?: string | null
          seen_at?: string
          source?: string | null
        }
        Relationships: []
      }
      internal_sms_messages: {
        Row: {
          body: string
          created_at: string
          delivered_at: string | null
          id: string
          read_at: string | null
          recipient_id: string
          sender_id: string
        }
        Insert: {
          body: string
          created_at?: string
          delivered_at?: string | null
          id?: string
          read_at?: string | null
          recipient_id: string
          sender_id: string
        }
        Update: {
          body?: string
          created_at?: string
          delivered_at?: string | null
          id?: string
          read_at?: string | null
          recipient_id?: string
          sender_id?: string
        }
        Relationships: []
      }
      join_requests: {
        Row: {
          conversation_id: string
          created_at: string
          id: string
          message: string | null
          reviewed_at: string | null
          reviewed_by: string | null
          status: string
          user_id: string
        }
        Insert: {
          conversation_id: string
          created_at?: string
          id?: string
          message?: string | null
          reviewed_at?: string | null
          reviewed_by?: string | null
          status?: string
          user_id: string
        }
        Update: {
          conversation_id?: string
          created_at?: string
          id?: string
          message?: string | null
          reviewed_at?: string | null
          reviewed_by?: string | null
          status?: string
          user_id?: string
        }
        Relationships: [
          {
            foreignKeyName: "join_requests_conversation_id_fkey"
            columns: ["conversation_id"]
            isOneToOne: false
            referencedRelation: "conversations"
            referencedColumns: ["id"]
          },
        ]
      }
      known_devices: {
        Row: {
          created_at: string
          device_fingerprint: string
          device_name: string | null
          id: string
          last_seen_at: string
          user_id: string
        }
        Insert: {
          created_at?: string
          device_fingerprint: string
          device_name?: string | null
          id?: string
          last_seen_at?: string
          user_id: string
        }
        Update: {
          created_at?: string
          device_fingerprint?: string
          device_name?: string | null
          id?: string
          last_seen_at?: string
          user_id?: string
        }
        Relationships: []
      }
      kpi_daily_snapshots: {
        Row: {
          active_creators_count: number | null
          appeal_response_time_hours: number | null
          avg_session_duration_seconds: number | null
          content_completion_rate: number | null
          created_at: string | null
          creator_return_rate_7d: number | null
          dau: number | null
          feed_latency_p95_ms: number | null
          feed_latency_p99_ms: number | null
          id: number
          mau: number | null
          moderation_queue_age_hours: number | null
          new_creators_count: number | null
          report_rate_per_1k: number | null
          retention_30d: number | null
          retention_7d: number | null
          session_count: number | null
          snapshot_date: string
          wau: number | null
        }
        Insert: {
          active_creators_count?: number | null
          appeal_response_time_hours?: number | null
          avg_session_duration_seconds?: number | null
          content_completion_rate?: number | null
          created_at?: string | null
          creator_return_rate_7d?: number | null
          dau?: number | null
          feed_latency_p95_ms?: number | null
          feed_latency_p99_ms?: number | null
          id?: number
          mau?: number | null
          moderation_queue_age_hours?: number | null
          new_creators_count?: number | null
          report_rate_per_1k?: number | null
          retention_30d?: number | null
          retention_7d?: number | null
          session_count?: number | null
          snapshot_date: string
          wau?: number | null
        }
        Update: {
          active_creators_count?: number | null
          appeal_response_time_hours?: number | null
          avg_session_duration_seconds?: number | null
          content_completion_rate?: number | null
          created_at?: string | null
          creator_return_rate_7d?: number | null
          dau?: number | null
          feed_latency_p95_ms?: number | null
          feed_latency_p99_ms?: number | null
          id?: number
          mau?: number | null
          moderation_queue_age_hours?: number | null
          new_creators_count?: number | null
          report_rate_per_1k?: number | null
          retention_30d?: number | null
          retention_7d?: number | null
          session_count?: number | null
          snapshot_date?: string
          wau?: number | null
        }
        Relationships: []
      }
      link_previews: {
        Row: {
          created_at: string
          description: string | null
          domain: string
          expires_at: string
          favicon: string | null
          fetched_at: string
          image: string | null
          title: string | null
          updated_at: string
          url: string
          url_hash: string
        }
        Insert: {
          created_at?: string
          description?: string | null
          domain: string
          expires_at: string
          favicon?: string | null
          fetched_at?: string
          image?: string | null
          title?: string | null
          updated_at?: string
          url: string
          url_hash: string
        }
        Update: {
          created_at?: string
          description?: string | null
          domain?: string
          expires_at?: string
          favicon?: string | null
          fetched_at?: string
          image?: string | null
          title?: string | null
          updated_at?: string
          url?: string
          url_hash?: string
        }
        Relationships: []
      }
      live_badges: {
        Row: {
          amount_stars: number
          badge_level: number
          created_at: string
          id: string
          live_session_id: string
          message: string | null
          recipient_id: string
          sender_id: string
        }
        Insert: {
          amount_stars: number
          badge_level: number
          created_at?: string
          id?: string
          live_session_id: string
          message?: string | null
          recipient_id: string
          sender_id: string
        }
        Update: {
          amount_stars?: number
          badge_level?: number
          created_at?: string
          id?: string
          live_session_id?: string
          message?: string | null
          recipient_id?: string
          sender_id?: string
        }
        Relationships: []
      }
      live_chat_bans: {
        Row: {
          banned_by: string
          created_at: string
          duration_minutes: number | null
          expires_at: string | null
          id: string
          reason: string | null
          session_id: number
          user_id: string
        }
        Insert: {
          banned_by: string
          created_at?: string
          duration_minutes?: number | null
          expires_at?: string | null
          id?: string
          reason?: string | null
          session_id: number
          user_id: string
        }
        Update: {
          banned_by?: string
          created_at?: string
          duration_minutes?: number | null
          expires_at?: string | null
          id?: string
          reason?: string | null
          session_id?: number
          user_id?: string
        }
        Relationships: [
          {
            foreignKeyName: "live_chat_bans_session_id_fkey"
            columns: ["session_id"]
            isOneToOne: false
            referencedRelation: "live_sessions"
            referencedColumns: ["id"]
          },
        ]
      }
      live_chat_messages: {
        Row: {
          content: string
          created_at: string
          hide_reason: string | null
          id: number
          is_auto_hidden: boolean
          is_creator_message: boolean
          is_hidden_by_creator: boolean
          is_pinned: boolean
          metadata: Json
          pinned_at: string | null
          pinned_by: string | null
          reply_to_id: number | null
          sender_id: string
          session_id: number
          type: string
          updated_at: string
        }
        Insert: {
          content: string
          created_at?: string
          hide_reason?: string | null
          id?: number
          is_auto_hidden?: boolean
          is_creator_message?: boolean
          is_hidden_by_creator?: boolean
          is_pinned?: boolean
          metadata?: Json
          pinned_at?: string | null
          pinned_by?: string | null
          reply_to_id?: number | null
          sender_id: string
          session_id: number
          type?: string
          updated_at?: string
        }
        Update: {
          content?: string
          created_at?: string
          hide_reason?: string | null
          id?: number
          is_auto_hidden?: boolean
          is_creator_message?: boolean
          is_hidden_by_creator?: boolean
          is_pinned?: boolean
          metadata?: Json
          pinned_at?: string | null
          pinned_by?: string | null
          reply_to_id?: number | null
          sender_id?: string
          session_id?: number
          type?: string
          updated_at?: string
        }
        Relationships: [
          {
            foreignKeyName: "live_chat_messages_reply_to_id_fkey"
            columns: ["reply_to_id"]
            isOneToOne: false
            referencedRelation: "live_chat_messages"
            referencedColumns: ["id"]
          },
          {
            foreignKeyName: "live_chat_messages_session_id_fkey"
            columns: ["session_id"]
            isOneToOne: false
            referencedRelation: "live_sessions"
            referencedColumns: ["id"]
          },
        ]
      }
      live_collab_sessions: {
        Row: {
          ended_at: string | null
          guest_id: string | null
          host_id: string
          id: string
          invited_at: string
          live_session_id: string
          started_at: string | null
          status: string
        }
        Insert: {
          ended_at?: string | null
          guest_id?: string | null
          host_id: string
          id?: string
          invited_at?: string
          live_session_id: string
          started_at?: string | null
          status?: string
        }
        Update: {
          ended_at?: string | null
          guest_id?: string | null
          host_id?: string
          id?: string
          invited_at?: string
          live_session_id?: string
          started_at?: string | null
          status?: string
        }
        Relationships: []
      }
      live_donations: {
        Row: {
          amount: number
          created_at: string | null
          currency: string | null
          donor_id: string
          id: string
          message: string | null
          session_id: string
          streamer_id: string
        }
        Insert: {
          amount: number
          created_at?: string | null
          currency?: string | null
          donor_id: string
          id?: string
          message?: string | null
          session_id: string
          streamer_id: string
        }
        Update: {
          amount?: number
          created_at?: string | null
          currency?: string | null
          donor_id?: string
          id?: string
          message?: string | null
          session_id?: string
          streamer_id?: string
        }
        Relationships: []
      }
      live_locations: {
        Row: {
          accuracy_m: number | null
          conversation_id: string
          expires_at: string
          heading_deg: number | null
          id: string
          lat: number
          lng: number
          message_id: string
          sender_id: string
          speed_mps: number | null
          stopped_at: string | null
          updated_at: string
        }
        Insert: {
          accuracy_m?: number | null
          conversation_id: string
          expires_at: string
          heading_deg?: number | null
          id?: string
          lat: number
          lng: number
          message_id: string
          sender_id: string
          speed_mps?: number | null
          stopped_at?: string | null
          updated_at?: string
        }
        Update: {
          accuracy_m?: number | null
          conversation_id?: string
          expires_at?: string
          heading_deg?: number | null
          id?: string
          lat?: number
          lng?: number
          message_id?: string
          sender_id?: string
          speed_mps?: number | null
          stopped_at?: string | null
          updated_at?: string
        }
        Relationships: [
          {
            foreignKeyName: "live_locations_message_id_fkey"
            columns: ["message_id"]
            isOneToOne: false
            referencedRelation: "messages"
            referencedColumns: ["id"]
          },
        ]
      }
      live_moderators: {
        Row: {
          created_at: string
          granted_by: string
          id: string
          permissions: string[]
          session_id: number
          user_id: string
        }
        Insert: {
          created_at?: string
          granted_by: string
          id?: string
          permissions?: string[]
          session_id: number
          user_id: string
        }
        Update: {
          created_at?: string
          granted_by?: string
          id?: string
          permissions?: string[]
          session_id?: number
          user_id?: string
        }
        Relationships: [
          {
            foreignKeyName: "live_moderators_session_id_fkey"
            columns: ["session_id"]
            isOneToOne: false
            referencedRelation: "live_sessions"
            referencedColumns: ["id"]
          },
        ]
      }
      live_questions: {
        Row: {
          created_at: string | null
          id: string
          is_answered: boolean | null
          is_pinned: boolean | null
          question: string
          session_id: string
          user_id: string
        }
        Insert: {
          created_at?: string | null
          id?: string
          is_answered?: boolean | null
          is_pinned?: boolean | null
          question: string
          session_id: string
          user_id: string
        }
        Update: {
          created_at?: string | null
          id?: string
          is_answered?: boolean | null
          is_pinned?: boolean | null
          question?: string
          session_id?: string
          user_id?: string
        }
        Relationships: []
      }
      live_schedule_reminders: {
        Row: {
          created_at: string
          id: string
          notified: boolean
          notify_at: string
          session_id: number
          user_id: string
        }
        Insert: {
          created_at?: string
          id?: string
          notified?: boolean
          notify_at: string
          session_id: number
          user_id: string
        }
        Update: {
          created_at?: string
          id?: string
          notified?: boolean
          notify_at?: string
          session_id?: number
          user_id?: string
        }
        Relationships: [
          {
            foreignKeyName: "live_schedule_reminders_session_id_fkey"
            columns: ["session_id"]
            isOneToOne: false
            referencedRelation: "live_sessions"
            referencedColumns: ["id"]
          },
        ]
      }
      live_session_analytics: {
        Row: {
          avg_watch_duration_sec: number
          chat_activity_curve: Json
          computed_at: string
          device_breakdown: Json
          geo_breakdown: Json
          id: string
          new_followers_during_stream: number
          peak_viewers: number
          session_id: number
          shares_count: number
          top_chatters: Json
          total_chat_messages: number
          total_donations_amount: number
          total_donations_count: number
          total_gifts_count: number
          total_reactions: number
          total_unique_viewers: number
          viewer_retention_curve: Json
        }
        Insert: {
          avg_watch_duration_sec?: number
          chat_activity_curve?: Json
          computed_at?: string
          device_breakdown?: Json
          geo_breakdown?: Json
          id?: string
          new_followers_during_stream?: number
          peak_viewers?: number
          session_id: number
          shares_count?: number
          top_chatters?: Json
          total_chat_messages?: number
          total_donations_amount?: number
          total_donations_count?: number
          total_gifts_count?: number
          total_reactions?: number
          total_unique_viewers?: number
          viewer_retention_curve?: Json
        }
        Update: {
          avg_watch_duration_sec?: number
          chat_activity_curve?: Json
          computed_at?: string
          device_breakdown?: Json
          geo_breakdown?: Json
          id?: string
          new_followers_during_stream?: number
          peak_viewers?: number
          session_id?: number
          shares_count?: number
          top_chatters?: Json
          total_chat_messages?: number
          total_donations_amount?: number
          total_donations_count?: number
          total_gifts_count?: number
          total_reactions?: number
          total_unique_viewers?: number
          viewer_retention_curve?: Json
        }
        Relationships: [
          {
            foreignKeyName: "live_session_analytics_session_id_fkey"
            columns: ["session_id"]
            isOneToOne: true
            referencedRelation: "live_sessions"
            referencedColumns: ["id"]
          },
        ]
      }
      live_sessions: {
        Row: {
          category: string
          created_at: string
          creator_id: string
          description: string | null
          ended_at: string | null
          id: number
          is_followers_only: boolean
          is_public: boolean
          max_guests: number | null
          message_count: number | null
          moderation_decision: string | null
          moderation_restricted_at: string | null
          moderation_status: string
          pinned_comment: string | null
          replay_url: string | null
          report_count: number | null
          scheduled_at: string | null
          started_at: string | null
          status: string
          thumbnail_url: string | null
          title: string
          updated_at: string
          viewer_count_current: number | null
          viewer_count_peak: number | null
        }
        Insert: {
          category?: string
          created_at?: string
          creator_id: string
          description?: string | null
          ended_at?: string | null
          id?: number
          is_followers_only?: boolean
          is_public?: boolean
          max_guests?: number | null
          message_count?: number | null
          moderation_decision?: string | null
          moderation_restricted_at?: string | null
          moderation_status?: string
          pinned_comment?: string | null
          replay_url?: string | null
          report_count?: number | null
          scheduled_at?: string | null
          started_at?: string | null
          status?: string
          thumbnail_url?: string | null
          title: string
          updated_at?: string
          viewer_count_current?: number | null
          viewer_count_peak?: number | null
        }
        Update: {
          category?: string
          created_at?: string
          creator_id?: string
          description?: string | null
          ended_at?: string | null
          id?: number
          is_followers_only?: boolean
          is_public?: boolean
          max_guests?: number | null
          message_count?: number | null
          moderation_decision?: string | null
          moderation_restricted_at?: string | null
          moderation_status?: string
          pinned_comment?: string | null
          replay_url?: string | null
          report_count?: number | null
          scheduled_at?: string | null
          started_at?: string | null
          status?: string
          thumbnail_url?: string | null
          title?: string
          updated_at?: string
          viewer_count_current?: number | null
          viewer_count_peak?: number | null
        }
        Relationships: []
      }
      live_shopping_pins: {
        Row: {
          host_id: string
          id: string
          is_active: boolean
          live_session_id: string
          pinned_at: string
          product_id: string
          unpinned_at: string | null
        }
        Insert: {
          host_id: string
          id?: string
          is_active?: boolean
          live_session_id: string
          pinned_at?: string
          product_id: string
          unpinned_at?: string | null
        }
        Update: {
          host_id?: string
          id?: string
          is_active?: boolean
          live_session_id?: string
          pinned_at?: string
          product_id?: string
          unpinned_at?: string | null
        }
        Relationships: []
      }
      live_shopping_products: {
        Row: {
          clicks_count: number
          created_at: string
          currency: string
          display_order: number
          id: string
          is_featured: boolean
          price: number | null
          product_image_url: string | null
          product_name: string
          product_url: string
          session_id: number
        }
        Insert: {
          clicks_count?: number
          created_at?: string
          currency?: string
          display_order?: number
          id?: string
          is_featured?: boolean
          price?: number | null
          product_image_url?: string | null
          product_name: string
          product_url: string
          session_id: number
        }
        Update: {
          clicks_count?: number
          created_at?: string
          currency?: string
          display_order?: number
          id?: string
          is_featured?: boolean
          price?: number | null
          product_image_url?: string | null
          product_name?: string
          product_url?: string
          session_id?: number
        }
        Relationships: [
          {
            foreignKeyName: "live_shopping_products_session_id_fkey"
            columns: ["session_id"]
            isOneToOne: false
            referencedRelation: "live_sessions"
            referencedColumns: ["id"]
          },
        ]
      }
      live_stream_reports: {
        Row: {
          created_at: string
          description: string | null
          id: number
          report_type: string
          report_weight: number | null
          reporter_id: string
          reporter_quality_score: number | null
          session_id: number
        }
        Insert: {
          created_at?: string
          description?: string | null
          id?: number
          report_type: string
          report_weight?: number | null
          reporter_id: string
          reporter_quality_score?: number | null
          session_id: number
        }
        Update: {
          created_at?: string
          description?: string | null
          id?: number
          report_type?: string
          report_weight?: number | null
          reporter_id?: string
          reporter_quality_score?: number | null
          session_id?: number
        }
        Relationships: [
          {
            foreignKeyName: "live_stream_reports_session_id_fkey"
            columns: ["session_id"]
            isOneToOne: false
            referencedRelation: "live_sessions"
            referencedColumns: ["id"]
          },
        ]
      }
      live_viewers: {
        Row: {
          created_at: string
          id: number
          is_active: boolean
          is_reporter: boolean | null
          joined_at: string
          left_at: string | null
          participant_sid: string | null
          session_id: number
          viewer_id: string
          watch_duration_seconds: number | null
        }
        Insert: {
          created_at?: string
          id?: number
          is_active?: boolean
          is_reporter?: boolean | null
          joined_at?: string
          left_at?: string | null
          participant_sid?: string | null
          session_id: number
          viewer_id: string
          watch_duration_seconds?: number | null
        }
        Update: {
          created_at?: string
          id?: number
          is_active?: boolean
          is_reporter?: boolean | null
          joined_at?: string
          left_at?: string | null
          participant_sid?: string | null
          session_id?: number
          viewer_id?: string
          watch_duration_seconds?: number | null
        }
        Relationships: [
          {
            foreignKeyName: "live_viewers_session_id_fkey"
            columns: ["session_id"]
            isOneToOne: false
            referencedRelation: "live_sessions"
            referencedColumns: ["id"]
          },
        ]
      }
      locations: {
        Row: {
          address: string | null
          category: string | null
          created_at: string | null
          id: string
          lat: number
          lng: number
          name: string
          posts_count: number | null
        }
        Insert: {
          address?: string | null
          category?: string | null
          created_at?: string | null
          id?: string
          lat: number
          lng: number
          name: string
          posts_count?: number | null
        }
        Update: {
          address?: string | null
          category?: string | null
          created_at?: string | null
          id?: string
          lat?: number
          lng?: number
          name?: string
          posts_count?: number | null
        }
        Relationships: []
      }
      login_events: {
        Row: {
          created_at: string
          device_fingerprint: string | null
          id: string
          ip_address: unknown
          is_new_device: boolean
          location_city: string | null
          location_country: string | null
          user_agent: string | null
          user_id: string
        }
        Insert: {
          created_at?: string
          device_fingerprint?: string | null
          id?: string
          ip_address?: unknown
          is_new_device?: boolean
          location_city?: string | null
          location_country?: string | null
          user_agent?: string | null
          user_id: string
        }
        Update: {
          created_at?: string
          device_fingerprint?: string | null
          id?: string
          ip_address?: unknown
          is_new_device?: boolean
          location_city?: string | null
          location_country?: string | null
          user_agent?: string | null
          user_id?: string
        }
        Relationships: []
      }
      media_objects: {
        Row: {
          bucket_name: string
          checksum_sha256: string | null
          created_at: string
          entity_id: string | null
          entity_type: string | null
          id: string
          mime_type: string
          object_path: string
          size_bytes: number
          updated_at: string
          uploaded_at: string
          uploaded_by: string
        }
        Insert: {
          bucket_name?: string
          checksum_sha256?: string | null
          created_at?: string
          entity_id?: string | null
          entity_type?: string | null
          id?: string
          mime_type: string
          object_path: string
          size_bytes: number
          updated_at?: string
          uploaded_at?: string
          uploaded_by: string
        }
        Update: {
          bucket_name?: string
          checksum_sha256?: string | null
          created_at?: string
          entity_id?: string | null
          entity_type?: string | null
          id?: string
          mime_type?: string
          object_path?: string
          size_bytes?: number
          updated_at?: string
          uploaded_at?: string
          uploaded_by?: string
        }
        Relationships: []
      }
      message_edit_history: {
        Row: {
          edit_number: number
          edited_at: string
          editor_id: string | null
          hidden: boolean
          id: string
          message_id: string
          new_content: string
          old_content: string
        }
        Insert: {
          edit_number: number
          edited_at?: string
          editor_id?: string | null
          hidden?: boolean
          id?: string
          message_id: string
          new_content: string
          old_content: string
        }
        Update: {
          edit_number?: number
          edited_at?: string
          editor_id?: string | null
          hidden?: boolean
          id?: string
          message_id?: string
          new_content?: string
          old_content?: string
        }
        Relationships: [
          {
            foreignKeyName: "fk_edit_history_message_id"
            columns: ["message_id"]
            isOneToOne: false
            referencedRelation: "messages"
            referencedColumns: ["id"]
          },
        ]
      }
      message_polls: {
        Row: {
          allows_multiple: boolean | null
          close_date: string | null
          conversation_id: string
          correct_option_index: number | null
          created_at: string | null
          creator_id: string
          id: string
          is_anonymous: boolean | null
          is_closed: boolean | null
          message_id: string | null
          poll_type: string
          question: string
        }
        Insert: {
          allows_multiple?: boolean | null
          close_date?: string | null
          conversation_id: string
          correct_option_index?: number | null
          created_at?: string | null
          creator_id: string
          id?: string
          is_anonymous?: boolean | null
          is_closed?: boolean | null
          message_id?: string | null
          poll_type?: string
          question: string
        }
        Update: {
          allows_multiple?: boolean | null
          close_date?: string | null
          conversation_id?: string
          correct_option_index?: number | null
          created_at?: string | null
          creator_id?: string
          id?: string
          is_anonymous?: boolean | null
          is_closed?: boolean | null
          message_id?: string | null
          poll_type?: string
          question?: string
        }
        Relationships: []
      }
      message_reactions: {
        Row: {
          created_at: string | null
          emoji: string
          message_id: string
          user_id: string
        }
        Insert: {
          created_at?: string | null
          emoji: string
          message_id: string
          user_id: string
        }
        Update: {
          created_at?: string | null
          emoji?: string
          message_id?: string
          user_id?: string
        }
        Relationships: []
      }
      message_read_receipts: {
        Row: {
          message_id: string
          read_at: string
          user_id: string
        }
        Insert: {
          message_id: string
          read_at?: string
          user_id: string
        }
        Update: {
          message_id?: string
          read_at?: string
          user_id?: string
        }
        Relationships: [
          {
            foreignKeyName: "fk_read_receipts_message_id"
            columns: ["message_id"]
            isOneToOne: false
            referencedRelation: "messages"
            referencedColumns: ["id"]
          },
        ]
      }
      message_reminders: {
        Row: {
          completed_at: string | null
          conversation_id: string
          created_at: string
          id: string
          message_id: string
          note: string | null
          remind_at: string
          status: string
          updated_at: string
          user_id: string
        }
        Insert: {
          completed_at?: string | null
          conversation_id: string
          created_at?: string
          id?: string
          message_id: string
          note?: string | null
          remind_at: string
          status?: string
          updated_at?: string
          user_id: string
        }
        Update: {
          completed_at?: string | null
          conversation_id?: string
          created_at?: string
          id?: string
          message_id?: string
          note?: string | null
          remind_at?: string
          status?: string
          updated_at?: string
          user_id?: string
        }
        Relationships: [
          {
            foreignKeyName: "message_reminders_conversation_id_fkey"
            columns: ["conversation_id"]
            isOneToOne: false
            referencedRelation: "conversations"
            referencedColumns: ["id"]
          },
          {
            foreignKeyName: "message_reminders_message_id_fkey"
            columns: ["message_id"]
            isOneToOne: false
            referencedRelation: "messages"
            referencedColumns: ["id"]
          },
        ]
      }
      message_threads: {
        Row: {
          archive_at: string | null
          conversation_id: string
          created_at: string
          id: string
          is_archived: boolean
          is_locked: boolean
          parent_message_id: string
          participant_count: number
          reply_count: number
          title: string | null
          updated_at: string
        }
        Insert: {
          archive_at?: string | null
          conversation_id: string
          created_at?: string
          id?: string
          is_archived?: boolean
          is_locked?: boolean
          parent_message_id: string
          participant_count?: number
          reply_count?: number
          title?: string | null
          updated_at?: string
        }
        Update: {
          archive_at?: string | null
          conversation_id?: string
          created_at?: string
          id?: string
          is_archived?: boolean
          is_locked?: boolean
          parent_message_id?: string
          participant_count?: number
          reply_count?: number
          title?: string | null
          updated_at?: string
        }
        Relationships: [
          {
            foreignKeyName: "message_threads_conversation_id_fkey"
            columns: ["conversation_id"]
            isOneToOne: false
            referencedRelation: "conversations"
            referencedColumns: ["id"]
          },
          {
            foreignKeyName: "message_threads_parent_message_id_fkey"
            columns: ["parent_message_id"]
            isOneToOne: true
            referencedRelation: "messages"
            referencedColumns: ["id"]
          },
        ]
      }
      message_versions: {
        Row: {
          body: string | null
          conversation_id: string
          created_at: string
          edit_seq: number
          edited_at: string
          edited_by: string
          id: string
          message_id: string
          operation: string
        }
        Insert: {
          body?: string | null
          conversation_id: string
          created_at?: string
          edit_seq: number
          edited_at?: string
          edited_by: string
          id?: string
          message_id: string
          operation: string
        }
        Update: {
          body?: string | null
          conversation_id?: string
          created_at?: string
          edit_seq?: number
          edited_at?: string
          edited_by?: string
          id?: string
          message_id?: string
          operation?: string
        }
        Relationships: [
          {
            foreignKeyName: "message_versions_conversation_id_fkey"
            columns: ["conversation_id"]
            isOneToOne: false
            referencedRelation: "conversations"
            referencedColumns: ["id"]
          },
          {
            foreignKeyName: "message_versions_message_id_fkey"
            columns: ["message_id"]
            isOneToOne: false
            referencedRelation: "messages"
            referencedColumns: ["id"]
          },
        ]
      }
      messages: {
        Row: {
          client_local_id: string | null
          client_msg_id: string | null
          content: string
          conversation_id: string
          created_at: string
          delivered_at: string | null
          delivery_status: string | null
          disappear_at: string | null
          disappear_in_seconds: number | null
          disappear_notified: boolean | null
          disappeared: boolean | null
          duration_seconds: number | null
          edit_count: number
          edited_at: string | null
          encryption_iv: string | null
          encryption_key_version: number | null
          forward_hide_sender: boolean
          forwarded_from: string | null
          gift_id: string | null
          id: string
          is_encrypted: boolean | null
          is_read: boolean | null
          is_scheduled: boolean | null
          is_silent: boolean
          is_vanish: boolean | null
          location_accuracy_m: number | null
          location_is_live: boolean
          location_lat: number | null
          location_lng: number | null
          media_type: string | null
          media_url: string | null
          message_effect: string | null
          metadata: Json | null
          poll_id: string | null
          read_at: string | null
          reply_to: string | null
          reply_to_message_id: string | null
          scheduled_for: string | null
          sender_id: string
          seq: number
          shared_post_id: string | null
          shared_reel_id: string | null
          sticker_id: string | null
          thread_root_message_id: string | null
          topic_id: string | null
          transcription_text: string | null
          updated_at: string | null
        }
        Insert: {
          client_local_id?: string | null
          client_msg_id?: string | null
          content: string
          conversation_id: string
          created_at?: string
          delivered_at?: string | null
          delivery_status?: string | null
          disappear_at?: string | null
          disappear_in_seconds?: number | null
          disappear_notified?: boolean | null
          disappeared?: boolean | null
          duration_seconds?: number | null
          edit_count?: number
          edited_at?: string | null
          encryption_iv?: string | null
          encryption_key_version?: number | null
          forward_hide_sender?: boolean
          forwarded_from?: string | null
          gift_id?: string | null
          id?: string
          is_encrypted?: boolean | null
          is_read?: boolean | null
          is_scheduled?: boolean | null
          is_silent?: boolean
          is_vanish?: boolean | null
          location_accuracy_m?: number | null
          location_is_live?: boolean
          location_lat?: number | null
          location_lng?: number | null
          media_type?: string | null
          media_url?: string | null
          message_effect?: string | null
          metadata?: Json | null
          poll_id?: string | null
          read_at?: string | null
          reply_to?: string | null
          reply_to_message_id?: string | null
          scheduled_for?: string | null
          sender_id: string
          seq: number
          shared_post_id?: string | null
          shared_reel_id?: string | null
          sticker_id?: string | null
          thread_root_message_id?: string | null
          topic_id?: string | null
          transcription_text?: string | null
          updated_at?: string | null
        }
        Update: {
          client_local_id?: string | null
          client_msg_id?: string | null
          content?: string
          conversation_id?: string
          created_at?: string
          delivered_at?: string | null
          delivery_status?: string | null
          disappear_at?: string | null
          disappear_in_seconds?: number | null
          disappear_notified?: boolean | null
          disappeared?: boolean | null
          duration_seconds?: number | null
          edit_count?: number
          edited_at?: string | null
          encryption_iv?: string | null
          encryption_key_version?: number | null
          forward_hide_sender?: boolean
          forwarded_from?: string | null
          gift_id?: string | null
          id?: string
          is_encrypted?: boolean | null
          is_read?: boolean | null
          is_scheduled?: boolean | null
          is_silent?: boolean
          is_vanish?: boolean | null
          location_accuracy_m?: number | null
          location_is_live?: boolean
          location_lat?: number | null
          location_lng?: number | null
          media_type?: string | null
          media_url?: string | null
          message_effect?: string | null
          metadata?: Json | null
          poll_id?: string | null
          read_at?: string | null
          reply_to?: string | null
          reply_to_message_id?: string | null
          scheduled_for?: string | null
          sender_id?: string
          seq?: number
          shared_post_id?: string | null
          shared_reel_id?: string | null
          sticker_id?: string | null
          thread_root_message_id?: string | null
          topic_id?: string | null
          transcription_text?: string | null
          updated_at?: string | null
        }
        Relationships: [
          {
            foreignKeyName: "messages_conversation_id_fkey"
            columns: ["conversation_id"]
            isOneToOne: false
            referencedRelation: "conversations"
            referencedColumns: ["id"]
          },
          {
            foreignKeyName: "messages_reply_to_message_id_fkey"
            columns: ["reply_to_message_id"]
            isOneToOne: false
            referencedRelation: "messages"
            referencedColumns: ["id"]
          },
          {
            foreignKeyName: "messages_shared_post_id_fkey"
            columns: ["shared_post_id"]
            isOneToOne: false
            referencedRelation: "posts"
            referencedColumns: ["id"]
          },
          {
            foreignKeyName: "messages_shared_reel_id_fkey"
            columns: ["shared_reel_id"]
            isOneToOne: false
            referencedRelation: "reels"
            referencedColumns: ["id"]
          },
          {
            foreignKeyName: "messages_thread_root_message_id_fkey"
            columns: ["thread_root_message_id"]
            isOneToOne: false
            referencedRelation: "messages"
            referencedColumns: ["id"]
          },
        ]
      }
      metrics_registry: {
        Row: {
          created_at: string
          description: string
          domain: string
          enabled: boolean
          epic: string | null
          id: number
          metric_name: string
          metric_type: string
          phase: string
          slo_target: Json | null
          unit: string | null
          updated_at: string
        }
        Insert: {
          created_at?: string
          description: string
          domain: string
          enabled?: boolean
          epic?: string | null
          id?: number
          metric_name: string
          metric_type: string
          phase: string
          slo_target?: Json | null
          unit?: string | null
          updated_at?: string
        }
        Update: {
          created_at?: string
          description?: string
          domain?: string
          enabled?: boolean
          epic?: string | null
          id?: number
          metric_name?: string
          metric_type?: string
          phase?: string
          slo_target?: Json | null
          unit?: string | null
          updated_at?: string
        }
        Relationships: []
      }
      metrics_samples: {
        Row: {
          aggregation: string | null
          created_at: string
          id: number
          labels: Json
          metric_name: string
          ts: string
          value: number
          window_minutes: number | null
        }
        Insert: {
          aggregation?: string | null
          created_at?: string
          id?: number
          labels?: Json
          metric_name: string
          ts?: string
          value: number
          window_minutes?: number | null
        }
        Update: {
          aggregation?: string | null
          created_at?: string
          id?: number
          labels?: Json
          metric_name?: string
          ts?: string
          value?: number
          window_minutes?: number | null
        }
        Relationships: []
      }
      mini_app_sessions: {
        Row: {
          device_info: Json | null
          duration_seconds: number | null
          ended_at: string | null
          id: string
          mini_app_id: string
          platform: string | null
          started_at: string
          user_id: string
        }
        Insert: {
          device_info?: Json | null
          duration_seconds?: number | null
          ended_at?: string | null
          id?: string
          mini_app_id: string
          platform?: string | null
          started_at?: string
          user_id: string
        }
        Update: {
          device_info?: Json | null
          duration_seconds?: number | null
          ended_at?: string | null
          id?: string
          mini_app_id?: string
          platform?: string | null
          started_at?: string
          user_id?: string
        }
        Relationships: [
          {
            foreignKeyName: "mini_app_sessions_mini_app_id_fkey"
            columns: ["mini_app_id"]
            isOneToOne: false
            referencedRelation: "mini_apps"
            referencedColumns: ["id"]
          },
          {
            foreignKeyName: "mini_app_sessions_user_id_fkey"
            columns: ["user_id"]
            isOneToOne: false
            referencedRelation: "profiles"
            referencedColumns: ["id"]
          },
        ]
      }
      mini_apps: {
        Row: {
          bot_id: string | null
          created_at: string
          description: string | null
          icon_url: string | null
          id: string
          is_active: boolean | null
          owner_id: string
          slug: string
          title: string
          updated_at: string
          url: string
          version: string | null
        }
        Insert: {
          bot_id?: string | null
          created_at?: string
          description?: string | null
          icon_url?: string | null
          id?: string
          is_active?: boolean | null
          owner_id: string
          slug: string
          title: string
          updated_at?: string
          url: string
          version?: string | null
        }
        Update: {
          bot_id?: string | null
          created_at?: string
          description?: string | null
          icon_url?: string | null
          id?: string
          is_active?: boolean | null
          owner_id?: string
          slug?: string
          title?: string
          updated_at?: string
          url?: string
          version?: string | null
        }
        Relationships: [
          {
            foreignKeyName: "mini_apps_bot_id_fkey"
            columns: ["bot_id"]
            isOneToOne: false
            referencedRelation: "bots"
            referencedColumns: ["id"]
          },
          {
            foreignKeyName: "mini_apps_owner_id_fkey"
            columns: ["owner_id"]
            isOneToOne: false
            referencedRelation: "profiles"
            referencedColumns: ["id"]
          },
        ]
      }
      moderation_actions: {
        Row: {
          action_type: string
          actioned_by: string
          active: boolean | null
          approval_id: string | null
          case_id: string | null
          created_at: string
          effective_at: string
          expires_at: string | null
          id: string
          reason_code: string
          reason_description: string
          revoke_reason: string | null
          revoked_at: string | null
          revoked_by: string | null
          target_user_id: string
          ticket_id: string | null
        }
        Insert: {
          action_type: string
          actioned_by: string
          active?: boolean | null
          approval_id?: string | null
          case_id?: string | null
          created_at?: string
          effective_at?: string
          expires_at?: string | null
          id?: string
          reason_code: string
          reason_description: string
          revoke_reason?: string | null
          revoked_at?: string | null
          revoked_by?: string | null
          target_user_id: string
          ticket_id?: string | null
        }
        Update: {
          action_type?: string
          actioned_by?: string
          active?: boolean | null
          approval_id?: string | null
          case_id?: string | null
          created_at?: string
          effective_at?: string
          expires_at?: string | null
          id?: string
          reason_code?: string
          reason_description?: string
          revoke_reason?: string | null
          revoked_at?: string | null
          revoked_by?: string | null
          target_user_id?: string
          ticket_id?: string | null
        }
        Relationships: [
          {
            foreignKeyName: "moderation_actions_actioned_by_fkey"
            columns: ["actioned_by"]
            isOneToOne: false
            referencedRelation: "admin_users"
            referencedColumns: ["id"]
          },
          {
            foreignKeyName: "moderation_actions_approval_id_fkey"
            columns: ["approval_id"]
            isOneToOne: false
            referencedRelation: "approvals"
            referencedColumns: ["id"]
          },
          {
            foreignKeyName: "moderation_actions_case_id_fkey"
            columns: ["case_id"]
            isOneToOne: false
            referencedRelation: "moderation_cases"
            referencedColumns: ["id"]
          },
          {
            foreignKeyName: "moderation_actions_revoked_by_fkey"
            columns: ["revoked_by"]
            isOneToOne: false
            referencedRelation: "admin_users"
            referencedColumns: ["id"]
          },
        ]
      }
      moderation_appeals: {
        Row: {
          author_id: string
          content_id: string
          content_type: string
          created_at: string
          id: string
          moderation_action_id: string | null
          moderator_response: string | null
          new_decision:
            | Database["public"]["Enums"]["moderation_decision"]
            | null
          new_distribution_class:
            | Database["public"]["Enums"]["distribution_class"]
            | null
          original_decision:
            | Database["public"]["Enums"]["moderation_decision"]
            | null
          original_distribution_class:
            | Database["public"]["Enums"]["distribution_class"]
            | null
          public_response: string | null
          reason: Database["public"]["Enums"]["appeal_reason"]
          reviewed_at: string | null
          reviewed_by: string | null
          status: Database["public"]["Enums"]["appeal_status"]
          submitted_at: string
          updated_at: string
          user_explanation: string | null
        }
        Insert: {
          author_id: string
          content_id: string
          content_type: string
          created_at?: string
          id?: string
          moderation_action_id?: string | null
          moderator_response?: string | null
          new_decision?:
            | Database["public"]["Enums"]["moderation_decision"]
            | null
          new_distribution_class?:
            | Database["public"]["Enums"]["distribution_class"]
            | null
          original_decision?:
            | Database["public"]["Enums"]["moderation_decision"]
            | null
          original_distribution_class?:
            | Database["public"]["Enums"]["distribution_class"]
            | null
          public_response?: string | null
          reason: Database["public"]["Enums"]["appeal_reason"]
          reviewed_at?: string | null
          reviewed_by?: string | null
          status?: Database["public"]["Enums"]["appeal_status"]
          submitted_at?: string
          updated_at?: string
          user_explanation?: string | null
        }
        Update: {
          author_id?: string
          content_id?: string
          content_type?: string
          created_at?: string
          id?: string
          moderation_action_id?: string | null
          moderator_response?: string | null
          new_decision?:
            | Database["public"]["Enums"]["moderation_decision"]
            | null
          new_distribution_class?:
            | Database["public"]["Enums"]["distribution_class"]
            | null
          original_decision?:
            | Database["public"]["Enums"]["moderation_decision"]
            | null
          original_distribution_class?:
            | Database["public"]["Enums"]["distribution_class"]
            | null
          public_response?: string | null
          reason?: Database["public"]["Enums"]["appeal_reason"]
          reviewed_at?: string | null
          reviewed_by?: string | null
          status?: Database["public"]["Enums"]["appeal_status"]
          submitted_at?: string
          updated_at?: string
          user_explanation?: string | null
        }
        Relationships: [
          {
            foreignKeyName: "moderation_appeals_moderation_action_id_fkey"
            columns: ["moderation_action_id"]
            isOneToOne: false
            referencedRelation: "content_moderation_actions"
            referencedColumns: ["id"]
          },
          {
            foreignKeyName: "moderation_appeals_reviewed_by_fkey"
            columns: ["reviewed_by"]
            isOneToOne: false
            referencedRelation: "admin_users"
            referencedColumns: ["id"]
          },
        ]
      }
      moderation_cases: {
        Row: {
          appeal_allowed: boolean | null
          appeal_status: string | null
          appealed_at: string | null
          case_number: string
          case_type: string
          closed_at: string | null
          closed_by: string | null
          created_at: string
          enforcement_actions: string[] | null
          evidence: Json[] | null
          final_decision: string | null
          id: string
          lead_investigator: string | null
          related_reports: string[] | null
          severity: string
          status: string
          subject_type: string | null
          subject_user_id: string | null
          team_members: string[] | null
          timeline: Json[] | null
          title: string
          updated_at: string
        }
        Insert: {
          appeal_allowed?: boolean | null
          appeal_status?: string | null
          appealed_at?: string | null
          case_number: string
          case_type: string
          closed_at?: string | null
          closed_by?: string | null
          created_at?: string
          enforcement_actions?: string[] | null
          evidence?: Json[] | null
          final_decision?: string | null
          id?: string
          lead_investigator?: string | null
          related_reports?: string[] | null
          severity: string
          status?: string
          subject_type?: string | null
          subject_user_id?: string | null
          team_members?: string[] | null
          timeline?: Json[] | null
          title: string
          updated_at?: string
        }
        Update: {
          appeal_allowed?: boolean | null
          appeal_status?: string | null
          appealed_at?: string | null
          case_number?: string
          case_type?: string
          closed_at?: string | null
          closed_by?: string | null
          created_at?: string
          enforcement_actions?: string[] | null
          evidence?: Json[] | null
          final_decision?: string | null
          id?: string
          lead_investigator?: string | null
          related_reports?: string[] | null
          severity?: string
          status?: string
          subject_type?: string | null
          subject_user_id?: string | null
          team_members?: string[] | null
          timeline?: Json[] | null
          title?: string
          updated_at?: string
        }
        Relationships: [
          {
            foreignKeyName: "moderation_cases_closed_by_fkey"
            columns: ["closed_by"]
            isOneToOne: false
            referencedRelation: "admin_users"
            referencedColumns: ["id"]
          },
          {
            foreignKeyName: "moderation_cases_lead_investigator_fkey"
            columns: ["lead_investigator"]
            isOneToOne: false
            referencedRelation: "admin_users"
            referencedColumns: ["id"]
          },
        ]
      }
      moderation_decisions: {
        Row: {
          actor_id: string | null
          actor_type: Database["public"]["Enums"]["moderation_actor_type"]
          can_be_rolled_back: boolean
          confidence_score: number | null
          created_at: string
          decision_id: string
          decision_snapshot_id: string | null
          from_status: Database["public"]["Enums"]["moderation_decision_type"]
          id: number
          notes: string | null
          organization_id: string
          parent_decision_id: string | null
          reason_codes: string[]
          rollback_cooldown_until: string | null
          subject_id: string
          subject_type: string
          surface_policy: string
          to_status: Database["public"]["Enums"]["moderation_decision_type"]
        }
        Insert: {
          actor_id?: string | null
          actor_type: Database["public"]["Enums"]["moderation_actor_type"]
          can_be_rolled_back?: boolean
          confidence_score?: number | null
          created_at?: string
          decision_id?: string
          decision_snapshot_id?: string | null
          from_status: Database["public"]["Enums"]["moderation_decision_type"]
          id?: number
          notes?: string | null
          organization_id?: string
          parent_decision_id?: string | null
          reason_codes: string[]
          rollback_cooldown_until?: string | null
          subject_id: string
          subject_type: string
          surface_policy: string
          to_status: Database["public"]["Enums"]["moderation_decision_type"]
        }
        Update: {
          actor_id?: string | null
          actor_type?: Database["public"]["Enums"]["moderation_actor_type"]
          can_be_rolled_back?: boolean
          confidence_score?: number | null
          created_at?: string
          decision_id?: string
          decision_snapshot_id?: string | null
          from_status?: Database["public"]["Enums"]["moderation_decision_type"]
          id?: number
          notes?: string | null
          organization_id?: string
          parent_decision_id?: string | null
          reason_codes?: string[]
          rollback_cooldown_until?: string | null
          subject_id?: string
          subject_type?: string
          surface_policy?: string
          to_status?: Database["public"]["Enums"]["moderation_decision_type"]
        }
        Relationships: [
          {
            foreignKeyName: "moderation_decisions_decision_snapshot_id_fkey"
            columns: ["decision_snapshot_id"]
            isOneToOne: false
            referencedRelation: "decision_snapshots"
            referencedColumns: ["snapshot_id"]
          },
          {
            foreignKeyName: "moderation_decisions_parent_decision_id_fkey"
            columns: ["parent_decision_id"]
            isOneToOne: false
            referencedRelation: "moderation_decisions"
            referencedColumns: ["decision_id"]
          },
        ]
      }
      moderation_events: {
        Row: {
          action_patch: Json | null
          applied_rev: number | null
          created_at: string
          decision: string
          decision_code: string
          draft_id: string
          explain_ref: string | null
          id: string
        }
        Insert: {
          action_patch?: Json | null
          applied_rev?: number | null
          created_at?: string
          decision: string
          decision_code: string
          draft_id: string
          explain_ref?: string | null
          id?: string
        }
        Update: {
          action_patch?: Json | null
          applied_rev?: number | null
          created_at?: string
          decision?: string
          decision_code?: string
          draft_id?: string
          explain_ref?: string | null
          id?: string
        }
        Relationships: [
          {
            foreignKeyName: "moderation_events_draft_id_fkey"
            columns: ["draft_id"]
            isOneToOne: false
            referencedRelation: "drafts"
            referencedColumns: ["id"]
          },
        ]
      }
      moderation_queue_items: {
        Row: {
          assigned_at: string | null
          assigned_to: string | null
          burst_suspected: boolean
          content_id: string
          content_type: string
          created_at: string
          first_reported_at: string
          id: string
          last_reported_at: string
          locale: string | null
          mass_report_attack: boolean
          priority: number
          region: string | null
          report_count: number
          report_weight_sum: number
          resolved_at: string | null
          risk_category: string
          status: string
          updated_at: string
        }
        Insert: {
          assigned_at?: string | null
          assigned_to?: string | null
          burst_suspected?: boolean
          content_id: string
          content_type: string
          created_at?: string
          first_reported_at?: string
          id?: string
          last_reported_at?: string
          locale?: string | null
          mass_report_attack?: boolean
          priority?: number
          region?: string | null
          report_count?: number
          report_weight_sum?: number
          resolved_at?: string | null
          risk_category?: string
          status?: string
          updated_at?: string
        }
        Update: {
          assigned_at?: string | null
          assigned_to?: string | null
          burst_suspected?: boolean
          content_id?: string
          content_type?: string
          created_at?: string
          first_reported_at?: string
          id?: string
          last_reported_at?: string
          locale?: string | null
          mass_report_attack?: boolean
          priority?: number
          region?: string | null
          report_count?: number
          report_weight_sum?: number
          resolved_at?: string | null
          risk_category?: string
          status?: string
          updated_at?: string
        }
        Relationships: []
      }
      moderation_reporter_quality: {
        Row: {
          accepted_reports: number
          last_updated_at: string
          quality_score: number
          rejected_reports: number
          reporter_id: string
          total_reports: number
        }
        Insert: {
          accepted_reports?: number
          last_updated_at?: string
          quality_score?: number
          rejected_reports?: number
          reporter_id: string
          total_reports?: number
        }
        Update: {
          accepted_reports?: number
          last_updated_at?: string
          quality_score?: number
          rejected_reports?: number
          reporter_id?: string
          total_reports?: number
        }
        Relationships: []
      }
      moderation_reports: {
        Row: {
          assigned_at: string | null
          assigned_to: string | null
          created_at: string
          description: string | null
          evidence_urls: string[] | null
          id: string
          priority: string
          report_type: string
          reported_entity_id: string
          reported_entity_type: string
          reported_user_id: string | null
          reporter_id: string | null
          resolution_action: string | null
          resolution_notes: string | null
          resolved_at: string | null
          resolved_by: string | null
          status: string
        }
        Insert: {
          assigned_at?: string | null
          assigned_to?: string | null
          created_at?: string
          description?: string | null
          evidence_urls?: string[] | null
          id?: string
          priority?: string
          report_type: string
          reported_entity_id: string
          reported_entity_type: string
          reported_user_id?: string | null
          reporter_id?: string | null
          resolution_action?: string | null
          resolution_notes?: string | null
          resolved_at?: string | null
          resolved_by?: string | null
          status?: string
        }
        Update: {
          assigned_at?: string | null
          assigned_to?: string | null
          created_at?: string
          description?: string | null
          evidence_urls?: string[] | null
          id?: string
          priority?: string
          report_type?: string
          reported_entity_id?: string
          reported_entity_type?: string
          reported_user_id?: string | null
          reporter_id?: string | null
          resolution_action?: string | null
          resolution_notes?: string | null
          resolved_at?: string | null
          resolved_by?: string | null
          status?: string
        }
        Relationships: [
          {
            foreignKeyName: "moderation_reports_assigned_to_fkey"
            columns: ["assigned_to"]
            isOneToOne: false
            referencedRelation: "admin_users"
            referencedColumns: ["id"]
          },
          {
            foreignKeyName: "moderation_reports_resolved_by_fkey"
            columns: ["resolved_by"]
            isOneToOne: false
            referencedRelation: "admin_users"
            referencedColumns: ["id"]
          },
        ]
      }
      music_library: {
        Row: {
          album: string | null
          artist: string
          bpm: number | null
          cover_url: string | null
          created_at: string
          duration_ms: number
          file_url: string
          genre: string
          id: string
          is_premium: boolean
          license_type: string
          mood: string
          preview_url: string | null
          search_vector: unknown
          title: string
          use_count: number
          waveform_url: string | null
        }
        Insert: {
          album?: string | null
          artist?: string
          bpm?: number | null
          cover_url?: string | null
          created_at?: string
          duration_ms: number
          file_url: string
          genre?: string
          id?: string
          is_premium?: boolean
          license_type?: string
          mood?: string
          preview_url?: string | null
          search_vector?: unknown
          title: string
          use_count?: number
          waveform_url?: string | null
        }
        Update: {
          album?: string | null
          artist?: string
          bpm?: number | null
          cover_url?: string | null
          created_at?: string
          duration_ms?: number
          file_url?: string
          genre?: string
          id?: string
          is_premium?: boolean
          license_type?: string
          mood?: string
          preview_url?: string | null
          search_vector?: unknown
          title?: string
          use_count?: number
          waveform_url?: string | null
        }
        Relationships: []
      }
      music_playlist_tracks: {
        Row: {
          added_at: string | null
          id: string
          playlist_id: string
          position: number | null
          track_id: string
        }
        Insert: {
          added_at?: string | null
          id?: string
          playlist_id: string
          position?: number | null
          track_id: string
        }
        Update: {
          added_at?: string | null
          id?: string
          playlist_id?: string
          position?: number | null
          track_id?: string
        }
        Relationships: [
          {
            foreignKeyName: "music_playlist_tracks_playlist_id_fkey"
            columns: ["playlist_id"]
            isOneToOne: false
            referencedRelation: "music_playlists"
            referencedColumns: ["id"]
          },
          {
            foreignKeyName: "music_playlist_tracks_track_id_fkey"
            columns: ["track_id"]
            isOneToOne: false
            referencedRelation: "music_tracks"
            referencedColumns: ["id"]
          },
        ]
      }
      music_playlists: {
        Row: {
          cover_url: string | null
          created_at: string | null
          created_by: string | null
          description: string | null
          id: string
          is_public: boolean | null
          name: string
        }
        Insert: {
          cover_url?: string | null
          created_at?: string | null
          created_by?: string | null
          description?: string | null
          id?: string
          is_public?: boolean | null
          name: string
        }
        Update: {
          cover_url?: string | null
          created_at?: string | null
          created_by?: string | null
          description?: string | null
          id?: string
          is_public?: boolean | null
          name?: string
        }
        Relationships: []
      }
      music_tracks: {
        Row: {
          album: string | null
          artist: string
          cover_url: string | null
          created_at: string
          duration_seconds: number
          genre: string | null
          id: string
          is_trending: boolean | null
          preview_url: string | null
          title: string
          usage_count: number | null
        }
        Insert: {
          album?: string | null
          artist: string
          cover_url?: string | null
          created_at?: string
          duration_seconds: number
          genre?: string | null
          id?: string
          is_trending?: boolean | null
          preview_url?: string | null
          title: string
          usage_count?: number | null
        }
        Update: {
          album?: string | null
          artist?: string
          cover_url?: string | null
          created_at?: string
          duration_seconds?: number
          genre?: string | null
          id?: string
          is_trending?: boolean | null
          preview_url?: string | null
          title?: string
          usage_count?: number | null
        }
        Relationships: []
      }
      nav_addresses: {
        Row: {
          city: string
          confidence_score: number
          country_code: string
          created_at: string
          fias_id: string | null
          fias_level: number | null
          h3_index_r9: string | null
          house_number: string | null
          id: string
          kladr_id: string | null
          location: unknown
          postal_code: string | null
          region: string | null
          source: string | null
          street: string
          updated_at: string
        }
        Insert: {
          city: string
          confidence_score?: number
          country_code?: string
          created_at?: string
          fias_id?: string | null
          fias_level?: number | null
          h3_index_r9?: string | null
          house_number?: string | null
          id?: string
          kladr_id?: string | null
          location: unknown
          postal_code?: string | null
          region?: string | null
          source?: string | null
          street: string
          updated_at?: string
        }
        Update: {
          city?: string
          confidence_score?: number
          country_code?: string
          created_at?: string
          fias_id?: string | null
          fias_level?: number | null
          h3_index_r9?: string | null
          house_number?: string | null
          id?: string
          kladr_id?: string | null
          location?: unknown
          postal_code?: string | null
          region?: string | null
          source?: string | null
          street?: string
          updated_at?: string
        }
        Relationships: []
      }
      nav_crowdsource_reports: {
        Row: {
          confidence_score: number
          created_at: string
          description: string | null
          direction_deg: number | null
          downvotes: number
          expires_at: string | null
          h3_cell: string | null
          id: string
          location: unknown
          photos: string[] | null
          report_type: string
          reporter_id: string
          road_segment_id: string | null
          status: string
          updated_at: string
          upvotes: number
          verified_at: string | null
        }
        Insert: {
          confidence_score?: number
          created_at?: string
          description?: string | null
          direction_deg?: number | null
          downvotes?: number
          expires_at?: string | null
          h3_cell?: string | null
          id?: string
          location: unknown
          photos?: string[] | null
          report_type: string
          reporter_id: string
          road_segment_id?: string | null
          status?: string
          updated_at?: string
          upvotes?: number
          verified_at?: string | null
        }
        Update: {
          confidence_score?: number
          created_at?: string
          description?: string | null
          direction_deg?: number | null
          downvotes?: number
          expires_at?: string | null
          h3_cell?: string | null
          id?: string
          location?: unknown
          photos?: string[] | null
          report_type?: string
          reporter_id?: string
          road_segment_id?: string | null
          status?: string
          updated_at?: string
          upvotes?: number
          verified_at?: string | null
        }
        Relationships: [
          {
            foreignKeyName: "nav_crowdsource_reports_road_segment_id_fkey"
            columns: ["road_segment_id"]
            isOneToOne: false
            referencedRelation: "nav_road_segments"
            referencedColumns: ["id"]
          },
        ]
      }
      nav_demand_forecast: {
        Row: {
          bucket_duration_m: number
          bucket_start: string
          city_id: string | null
          created_at: string
          demand_p50: number | null
          demand_p90: number | null
          expected_eta_p50: number | null
          h3_cell: string | null
          h3_resolution: number | null
          id: string
          model_version: string
          shortage_probability: number | null
          supply_p50: number | null
        }
        Insert: {
          bucket_duration_m?: number
          bucket_start: string
          city_id?: string | null
          created_at?: string
          demand_p50?: number | null
          demand_p90?: number | null
          expected_eta_p50?: number | null
          h3_cell?: string | null
          h3_resolution?: number | null
          id?: string
          model_version: string
          shortage_probability?: number | null
          supply_p50?: number | null
        }
        Update: {
          bucket_duration_m?: number
          bucket_start?: string
          city_id?: string | null
          created_at?: string
          demand_p50?: number | null
          demand_p90?: number | null
          expected_eta_p50?: number | null
          h3_cell?: string | null
          h3_resolution?: number | null
          id?: string
          model_version?: string
          shortage_probability?: number | null
          supply_p50?: number | null
        }
        Relationships: []
      }
      nav_dispatch_log: {
        Row: {
          candidates_count: number
          created_at: string
          decision: Json
          h3_cells_searched: string[] | null
          id: string
          latency_ms: number | null
          scoring_algorithm: string
          search_radius_m: number | null
          trip_id: string
        }
        Insert: {
          candidates_count?: number
          created_at?: string
          decision?: Json
          h3_cells_searched?: string[] | null
          id?: string
          latency_ms?: number | null
          scoring_algorithm: string
          search_radius_m?: number | null
          trip_id: string
        }
        Update: {
          candidates_count?: number
          created_at?: string
          decision?: Json
          h3_cells_searched?: string[] | null
          id?: string
          latency_ms?: number | null
          scoring_algorithm?: string
          search_radius_m?: number | null
          trip_id?: string
        }
        Relationships: [
          {
            foreignKeyName: "nav_dispatch_log_trip_id_fkey"
            columns: ["trip_id"]
            isOneToOne: false
            referencedRelation: "nav_trips"
            referencedColumns: ["id"]
          },
        ]
      }
      nav_dispatch_offers: {
        Row: {
          driver_id: string
          expires_at: string
          id: string
          metadata: Json
          offered_at: string
          pickup_eta_s: number | null
          rejection_reason: string | null
          responded_at: string | null
          score: number | null
          status: string
          trip_id: string
        }
        Insert: {
          driver_id: string
          expires_at: string
          id?: string
          metadata?: Json
          offered_at?: string
          pickup_eta_s?: number | null
          rejection_reason?: string | null
          responded_at?: string | null
          score?: number | null
          status?: string
          trip_id: string
        }
        Update: {
          driver_id?: string
          expires_at?: string
          id?: string
          metadata?: Json
          offered_at?: string
          pickup_eta_s?: number | null
          rejection_reason?: string | null
          responded_at?: string | null
          score?: number | null
          status?: string
          trip_id?: string
        }
        Relationships: [
          {
            foreignKeyName: "nav_dispatch_offers_trip_id_fkey"
            columns: ["trip_id"]
            isOneToOne: false
            referencedRelation: "nav_trips"
            referencedColumns: ["id"]
          },
        ]
      }
      nav_driver_profiles: {
        Row: {
          acceptance_rate: number
          cancellation_rate: number
          created_at: string
          current_zone_id: string | null
          id: string
          is_active: boolean
          is_verified: boolean
          license_plate: string | null
          max_concurrent_orders: number
          properties: Json
          rating: number
          total_trips: number
          updated_at: string
          vehicle_class: string
          vehicle_model: string | null
          vehicle_type: string
        }
        Insert: {
          acceptance_rate?: number
          cancellation_rate?: number
          created_at?: string
          current_zone_id?: string | null
          id: string
          is_active?: boolean
          is_verified?: boolean
          license_plate?: string | null
          max_concurrent_orders?: number
          properties?: Json
          rating?: number
          total_trips?: number
          updated_at?: string
          vehicle_class: string
          vehicle_model?: string | null
          vehicle_type: string
        }
        Update: {
          acceptance_rate?: number
          cancellation_rate?: number
          created_at?: string
          current_zone_id?: string | null
          id?: string
          is_active?: boolean
          is_verified?: boolean
          license_plate?: string | null
          max_concurrent_orders?: number
          properties?: Json
          rating?: number
          total_trips?: number
          updated_at?: string
          vehicle_class?: string
          vehicle_model?: string | null
          vehicle_type?: string
        }
        Relationships: [
          {
            foreignKeyName: "nav_driver_profiles_current_zone_id_fkey"
            columns: ["current_zone_id"]
            isOneToOne: false
            referencedRelation: "nav_zones"
            referencedColumns: ["id"]
          },
        ]
      }
      nav_enforcement_actions: {
        Row: {
          action_type: string
          actor_id: string
          created_at: string
          expires_at: string | null
          id: string
          metadata: Json
          new_level: string
          performed_by: string | null
          previous_level: string | null
          reason: string
        }
        Insert: {
          action_type: string
          actor_id: string
          created_at?: string
          expires_at?: string | null
          id?: string
          metadata?: Json
          new_level: string
          performed_by?: string | null
          previous_level?: string | null
          reason: string
        }
        Update: {
          action_type?: string
          actor_id?: string
          created_at?: string
          expires_at?: string | null
          id?: string
          metadata?: Json
          new_level?: string
          performed_by?: string | null
          previous_level?: string | null
          reason?: string
        }
        Relationships: []
      }
      nav_geocoding_cache: {
        Row: {
          created_at: string
          expires_at: string | null
          hit_count: number
          id: string
          query_hash: string
          query_text: string | null
          result: Json
          source: string
        }
        Insert: {
          created_at?: string
          expires_at?: string | null
          hit_count?: number
          id?: string
          query_hash: string
          query_text?: string | null
          result: Json
          source?: string
        }
        Update: {
          created_at?: string
          expires_at?: string | null
          hit_count?: number
          id?: string
          query_hash?: string
          query_text?: string | null
          result?: Json
          source?: string
        }
        Relationships: []
      }
      nav_location_history: {
        Row: {
          accuracy_m: number | null
          actor_id: string
          actor_type: string
          altitude_m: number | null
          created_at: string
          device_id: string | null
          h3_index_r9: string | null
          heading_deg: number | null
          id: string
          location: unknown
          recorded_at: string
          session_id: string | null
          speed_mps: number | null
          trip_id: string | null
        }
        Insert: {
          accuracy_m?: number | null
          actor_id: string
          actor_type: string
          altitude_m?: number | null
          created_at?: string
          device_id?: string | null
          h3_index_r9?: string | null
          heading_deg?: number | null
          id?: string
          location: unknown
          recorded_at: string
          session_id?: string | null
          speed_mps?: number | null
          trip_id?: string | null
        }
        Update: {
          accuracy_m?: number | null
          actor_id?: string
          actor_type?: string
          altitude_m?: number | null
          created_at?: string
          device_id?: string | null
          h3_index_r9?: string | null
          heading_deg?: number | null
          id?: string
          location?: unknown
          recorded_at?: string
          session_id?: string | null
          speed_mps?: number | null
          trip_id?: string | null
        }
        Relationships: []
      }
      nav_location_history_2026_03_07: {
        Row: {
          accuracy_m: number | null
          actor_id: string
          actor_type: string
          altitude_m: number | null
          created_at: string
          device_id: string | null
          h3_index_r9: string | null
          heading_deg: number | null
          id: string
          location: unknown
          recorded_at: string
          session_id: string | null
          speed_mps: number | null
          trip_id: string | null
        }
        Insert: {
          accuracy_m?: number | null
          actor_id: string
          actor_type: string
          altitude_m?: number | null
          created_at?: string
          device_id?: string | null
          h3_index_r9?: string | null
          heading_deg?: number | null
          id?: string
          location: unknown
          recorded_at: string
          session_id?: string | null
          speed_mps?: number | null
          trip_id?: string | null
        }
        Update: {
          accuracy_m?: number | null
          actor_id?: string
          actor_type?: string
          altitude_m?: number | null
          created_at?: string
          device_id?: string | null
          h3_index_r9?: string | null
          heading_deg?: number | null
          id?: string
          location?: unknown
          recorded_at?: string
          session_id?: string | null
          speed_mps?: number | null
          trip_id?: string | null
        }
        Relationships: []
      }
      nav_location_history_2026_03_08: {
        Row: {
          accuracy_m: number | null
          actor_id: string
          actor_type: string
          altitude_m: number | null
          created_at: string
          device_id: string | null
          h3_index_r9: string | null
          heading_deg: number | null
          id: string
          location: unknown
          recorded_at: string
          session_id: string | null
          speed_mps: number | null
          trip_id: string | null
        }
        Insert: {
          accuracy_m?: number | null
          actor_id: string
          actor_type: string
          altitude_m?: number | null
          created_at?: string
          device_id?: string | null
          h3_index_r9?: string | null
          heading_deg?: number | null
          id?: string
          location: unknown
          recorded_at: string
          session_id?: string | null
          speed_mps?: number | null
          trip_id?: string | null
        }
        Update: {
          accuracy_m?: number | null
          actor_id?: string
          actor_type?: string
          altitude_m?: number | null
          created_at?: string
          device_id?: string | null
          h3_index_r9?: string | null
          heading_deg?: number | null
          id?: string
          location?: unknown
          recorded_at?: string
          session_id?: string | null
          speed_mps?: number | null
          trip_id?: string | null
        }
        Relationships: []
      }
      nav_location_history_default: {
        Row: {
          accuracy_m: number | null
          actor_id: string
          actor_type: string
          altitude_m: number | null
          created_at: string
          device_id: string | null
          h3_index_r9: string | null
          heading_deg: number | null
          id: string
          location: unknown
          recorded_at: string
          session_id: string | null
          speed_mps: number | null
          trip_id: string | null
        }
        Insert: {
          accuracy_m?: number | null
          actor_id: string
          actor_type: string
          altitude_m?: number | null
          created_at?: string
          device_id?: string | null
          h3_index_r9?: string | null
          heading_deg?: number | null
          id?: string
          location: unknown
          recorded_at: string
          session_id?: string | null
          speed_mps?: number | null
          trip_id?: string | null
        }
        Update: {
          accuracy_m?: number | null
          actor_id?: string
          actor_type?: string
          altitude_m?: number | null
          created_at?: string
          device_id?: string | null
          h3_index_r9?: string | null
          heading_deg?: number | null
          id?: string
          location?: unknown
          recorded_at?: string
          session_id?: string | null
          speed_mps?: number | null
          trip_id?: string | null
        }
        Relationships: []
      }
      nav_location_shares: {
        Row: {
          chat_id: string | null
          created_at: string
          current_location: unknown
          expires_at: string
          id: string
          is_active: boolean
          shared_with: string[] | null
          sharer_id: string
          updated_at: string
        }
        Insert: {
          chat_id?: string | null
          created_at?: string
          current_location?: unknown
          expires_at: string
          id?: string
          is_active?: boolean
          shared_with?: string[] | null
          sharer_id: string
          updated_at?: string
        }
        Update: {
          chat_id?: string | null
          created_at?: string
          current_location?: unknown
          expires_at?: string
          id?: string
          is_active?: boolean
          shared_with?: string[] | null
          sharer_id?: string
          updated_at?: string
        }
        Relationships: []
      }
      nav_map_edits: {
        Row: {
          created_at: string
          edit_type: string
          editor_id: string
          geometry_after: unknown
          geometry_before: unknown
          id: string
          quality_score: number | null
          review_comment: string | null
          reviewer_id: string | null
          status: string
          tags_after: Json | null
          tags_before: Json | null
          updated_at: string
        }
        Insert: {
          created_at?: string
          edit_type: string
          editor_id: string
          geometry_after?: unknown
          geometry_before?: unknown
          id?: string
          quality_score?: number | null
          review_comment?: string | null
          reviewer_id?: string | null
          status?: string
          tags_after?: Json | null
          tags_before?: Json | null
          updated_at?: string
        }
        Update: {
          created_at?: string
          edit_type?: string
          editor_id?: string
          geometry_after?: unknown
          geometry_before?: unknown
          id?: string
          quality_score?: number | null
          review_comment?: string | null
          reviewer_id?: string | null
          status?: string
          tags_after?: Json | null
          tags_before?: Json | null
          updated_at?: string
        }
        Relationships: []
      }
      nav_pois: {
        Row: {
          address: string | null
          category: string
          created_at: string
          fias_address_id: string | null
          h3_index_r9: string | null
          id: string
          inn: string | null
          is_verified: boolean
          location: unknown
          name: string
          ogrn: string | null
          opening_hours: Json | null
          owner_id: string | null
          phone: string | null
          photos: string[] | null
          properties: Json
          rating: number | null
          review_count: number
          source: string
          source_id: string | null
          subcategory: string | null
          updated_at: string
          website: string | null
        }
        Insert: {
          address?: string | null
          category: string
          created_at?: string
          fias_address_id?: string | null
          h3_index_r9?: string | null
          id?: string
          inn?: string | null
          is_verified?: boolean
          location: unknown
          name: string
          ogrn?: string | null
          opening_hours?: Json | null
          owner_id?: string | null
          phone?: string | null
          photos?: string[] | null
          properties?: Json
          rating?: number | null
          review_count?: number
          source?: string
          source_id?: string | null
          subcategory?: string | null
          updated_at?: string
          website?: string | null
        }
        Update: {
          address?: string | null
          category?: string
          created_at?: string
          fias_address_id?: string | null
          h3_index_r9?: string | null
          id?: string
          inn?: string | null
          is_verified?: boolean
          location?: unknown
          name?: string
          ogrn?: string | null
          opening_hours?: Json | null
          owner_id?: string | null
          phone?: string | null
          photos?: string[] | null
          properties?: Json
          rating?: number | null
          review_count?: number
          source?: string
          source_id?: string | null
          subcategory?: string | null
          updated_at?: string
          website?: string | null
        }
        Relationships: []
      }
      nav_report_votes: {
        Row: {
          created_at: string
          id: string
          report_id: string
          vote_type: string
          voter_id: string
        }
        Insert: {
          created_at?: string
          id?: string
          report_id: string
          vote_type: string
          voter_id: string
        }
        Update: {
          created_at?: string
          id?: string
          report_id?: string
          vote_type?: string
          voter_id?: string
        }
        Relationships: [
          {
            foreignKeyName: "nav_report_votes_report_id_fkey"
            columns: ["report_id"]
            isOneToOne: false
            referencedRelation: "nav_crowdsource_reports"
            referencedColumns: ["id"]
          },
        ]
      }
      nav_reporter_reputation: {
        Row: {
          badges: string[]
          created_at: string
          level: number
          rejected_reports: number
          total_reports: number
          trust_score: number
          updated_at: string
          user_id: string
          verified_reports: number
          xp: number
        }
        Insert: {
          badges?: string[]
          created_at?: string
          level?: number
          rejected_reports?: number
          total_reports?: number
          trust_score?: number
          updated_at?: string
          user_id: string
          verified_reports?: number
          xp?: number
        }
        Update: {
          badges?: string[]
          created_at?: string
          level?: number
          rejected_reports?: number
          total_reports?: number
          trust_score?: number
          updated_at?: string
          user_id?: string
          verified_reports?: number
          xp?: number
        }
        Relationships: []
      }
      nav_risk_events: {
        Row: {
          actor_id: string
          created_at: string
          details: Json
          event_type: string
          h3_cell: string | null
          id: string
          location: unknown
          resolved: boolean
          severity: string
        }
        Insert: {
          actor_id: string
          created_at?: string
          details?: Json
          event_type: string
          h3_cell?: string | null
          id?: string
          location?: unknown
          resolved?: boolean
          severity: string
        }
        Update: {
          actor_id?: string
          created_at?: string
          details?: Json
          event_type?: string
          h3_cell?: string | null
          id?: string
          location?: unknown
          resolved?: boolean
          severity?: string
        }
        Relationships: []
      }
      nav_risk_events_2026_03: {
        Row: {
          actor_id: string
          created_at: string
          details: Json
          event_type: string
          h3_cell: string | null
          id: string
          location: unknown
          resolved: boolean
          severity: string
        }
        Insert: {
          actor_id: string
          created_at?: string
          details?: Json
          event_type: string
          h3_cell?: string | null
          id?: string
          location?: unknown
          resolved?: boolean
          severity: string
        }
        Update: {
          actor_id?: string
          created_at?: string
          details?: Json
          event_type?: string
          h3_cell?: string | null
          id?: string
          location?: unknown
          resolved?: boolean
          severity?: string
        }
        Relationships: []
      }
      nav_risk_events_2026_04: {
        Row: {
          actor_id: string
          created_at: string
          details: Json
          event_type: string
          h3_cell: string | null
          id: string
          location: unknown
          resolved: boolean
          severity: string
        }
        Insert: {
          actor_id: string
          created_at?: string
          details?: Json
          event_type: string
          h3_cell?: string | null
          id?: string
          location?: unknown
          resolved?: boolean
          severity: string
        }
        Update: {
          actor_id?: string
          created_at?: string
          details?: Json
          event_type?: string
          h3_cell?: string | null
          id?: string
          location?: unknown
          resolved?: boolean
          severity?: string
        }
        Relationships: []
      }
      nav_risk_events_default: {
        Row: {
          actor_id: string
          created_at: string
          details: Json
          event_type: string
          h3_cell: string | null
          id: string
          location: unknown
          resolved: boolean
          severity: string
        }
        Insert: {
          actor_id: string
          created_at?: string
          details?: Json
          event_type: string
          h3_cell?: string | null
          id?: string
          location?: unknown
          resolved?: boolean
          severity: string
        }
        Update: {
          actor_id?: string
          created_at?: string
          details?: Json
          event_type?: string
          h3_cell?: string | null
          id?: string
          location?: unknown
          resolved?: boolean
          severity?: string
        }
        Relationships: []
      }
      nav_risk_scores: {
        Row: {
          actor_id: string
          actor_type: string
          confidence: number | null
          created_at: string
          enforcement_expires_at: string | null
          enforcement_level: string
          evaluated_at: string
          id: string
          last_signals: Json
          risk_score: number
          risk_types: string[] | null
          updated_at: string
        }
        Insert: {
          actor_id: string
          actor_type: string
          confidence?: number | null
          created_at?: string
          enforcement_expires_at?: string | null
          enforcement_level?: string
          evaluated_at?: string
          id?: string
          last_signals?: Json
          risk_score?: number
          risk_types?: string[] | null
          updated_at?: string
        }
        Update: {
          actor_id?: string
          actor_type?: string
          confidence?: number | null
          created_at?: string
          enforcement_expires_at?: string | null
          enforcement_level?: string
          evaluated_at?: string
          id?: string
          last_signals?: Json
          risk_score?: number
          risk_types?: string[] | null
          updated_at?: string
        }
        Relationships: []
      }
      nav_road_segments: {
        Row: {
          created_at: string
          geometry: unknown
          h3_cells: string[] | null
          id: string
          is_oneway: boolean
          lanes: number | null
          name: string | null
          osm_way_id: number | null
          properties: Json
          road_class: string
          speed_limit_kmh: number | null
          surface: string | null
          updated_at: string
        }
        Insert: {
          created_at?: string
          geometry: unknown
          h3_cells?: string[] | null
          id?: string
          is_oneway?: boolean
          lanes?: number | null
          name?: string | null
          osm_way_id?: number | null
          properties?: Json
          road_class: string
          speed_limit_kmh?: number | null
          surface?: string | null
          updated_at?: string
        }
        Update: {
          created_at?: string
          geometry?: unknown
          h3_cells?: string[] | null
          id?: string
          is_oneway?: boolean
          lanes?: number | null
          name?: string | null
          osm_way_id?: number | null
          properties?: Json
          road_class?: string
          speed_limit_kmh?: number | null
          surface?: string | null
          updated_at?: string
        }
        Relationships: []
      }
      nav_saved_places: {
        Row: {
          address: string | null
          category: string | null
          created_at: string
          custom_name: string | null
          fias_id: string | null
          h3_index_r9: string | null
          icon: string | null
          id: string
          label: string
          location: unknown
          postal_code: string | null
          updated_at: string
          user_id: string
        }
        Insert: {
          address?: string | null
          category?: string | null
          created_at?: string
          custom_name?: string | null
          fias_id?: string | null
          h3_index_r9?: string | null
          icon?: string | null
          id?: string
          label: string
          location: unknown
          postal_code?: string | null
          updated_at?: string
          user_id: string
        }
        Update: {
          address?: string | null
          category?: string | null
          created_at?: string
          custom_name?: string | null
          fias_id?: string | null
          h3_index_r9?: string | null
          icon?: string | null
          id?: string
          label?: string
          location?: unknown
          postal_code?: string | null
          updated_at?: string
          user_id?: string
        }
        Relationships: []
      }
      nav_search_history: {
        Row: {
          created_at: string
          id: string
          query: string
          result_id: string | null
          result_label: string | null
          result_location: unknown
          result_type: string | null
          selected: boolean
          user_id: string
        }
        Insert: {
          created_at?: string
          id?: string
          query: string
          result_id?: string | null
          result_label?: string | null
          result_location?: unknown
          result_type?: string | null
          selected?: boolean
          user_id: string
        }
        Update: {
          created_at?: string
          id?: string
          query?: string
          result_id?: string | null
          result_label?: string | null
          result_location?: unknown
          result_type?: string | null
          selected?: boolean
          user_id?: string
        }
        Relationships: []
      }
      nav_surge_pricing: {
        Row: {
          confidence: number | null
          created_at: string
          effective_from: string
          effective_until: string
          h3_cell: string
          id: string
          imbalance_score: number | null
          multiplier: number
          policy_version: string
          raw_multiplier: number | null
          reason_codes: string[] | null
          zone_id: string | null
        }
        Insert: {
          confidence?: number | null
          created_at?: string
          effective_from: string
          effective_until: string
          h3_cell: string
          id?: string
          imbalance_score?: number | null
          multiplier?: number
          policy_version?: string
          raw_multiplier?: number | null
          reason_codes?: string[] | null
          zone_id?: string | null
        }
        Update: {
          confidence?: number | null
          created_at?: string
          effective_from?: string
          effective_until?: string
          h3_cell?: string
          id?: string
          imbalance_score?: number | null
          multiplier?: number
          policy_version?: string
          raw_multiplier?: number | null
          reason_codes?: string[] | null
          zone_id?: string | null
        }
        Relationships: [
          {
            foreignKeyName: "nav_surge_pricing_zone_id_fkey"
            columns: ["zone_id"]
            isOneToOne: false
            referencedRelation: "nav_zones"
            referencedColumns: ["id"]
          },
        ]
      }
      nav_traffic_segments: {
        Row: {
          confidence: number | null
          congestion_level: string
          created_at: string
          free_flow_speed_kmh: number | null
          h3_cell: string | null
          id: string
          measured_at: string
          road_segment_id: string | null
          sample_count: number
          speed_kmh: number | null
        }
        Insert: {
          confidence?: number | null
          congestion_level: string
          created_at?: string
          free_flow_speed_kmh?: number | null
          h3_cell?: string | null
          id?: string
          measured_at: string
          road_segment_id?: string | null
          sample_count?: number
          speed_kmh?: number | null
        }
        Update: {
          confidence?: number | null
          congestion_level?: string
          created_at?: string
          free_flow_speed_kmh?: number | null
          h3_cell?: string | null
          id?: string
          measured_at?: string
          road_segment_id?: string | null
          sample_count?: number
          speed_kmh?: number | null
        }
        Relationships: [
          {
            foreignKeyName: "nav_traffic_segments_road_segment_id_fkey"
            columns: ["road_segment_id"]
            isOneToOne: false
            referencedRelation: "nav_road_segments"
            referencedColumns: ["id"]
          },
        ]
      }
      nav_traffic_segments_2026_03_07: {
        Row: {
          confidence: number | null
          congestion_level: string
          created_at: string
          free_flow_speed_kmh: number | null
          h3_cell: string | null
          id: string
          measured_at: string
          road_segment_id: string | null
          sample_count: number
          speed_kmh: number | null
        }
        Insert: {
          confidence?: number | null
          congestion_level: string
          created_at?: string
          free_flow_speed_kmh?: number | null
          h3_cell?: string | null
          id?: string
          measured_at: string
          road_segment_id?: string | null
          sample_count?: number
          speed_kmh?: number | null
        }
        Update: {
          confidence?: number | null
          congestion_level?: string
          created_at?: string
          free_flow_speed_kmh?: number | null
          h3_cell?: string | null
          id?: string
          measured_at?: string
          road_segment_id?: string | null
          sample_count?: number
          speed_kmh?: number | null
        }
        Relationships: []
      }
      nav_traffic_segments_2026_03_08: {
        Row: {
          confidence: number | null
          congestion_level: string
          created_at: string
          free_flow_speed_kmh: number | null
          h3_cell: string | null
          id: string
          measured_at: string
          road_segment_id: string | null
          sample_count: number
          speed_kmh: number | null
        }
        Insert: {
          confidence?: number | null
          congestion_level: string
          created_at?: string
          free_flow_speed_kmh?: number | null
          h3_cell?: string | null
          id?: string
          measured_at: string
          road_segment_id?: string | null
          sample_count?: number
          speed_kmh?: number | null
        }
        Update: {
          confidence?: number | null
          congestion_level?: string
          created_at?: string
          free_flow_speed_kmh?: number | null
          h3_cell?: string | null
          id?: string
          measured_at?: string
          road_segment_id?: string | null
          sample_count?: number
          speed_kmh?: number | null
        }
        Relationships: []
      }
      nav_traffic_segments_default: {
        Row: {
          confidence: number | null
          congestion_level: string
          created_at: string
          free_flow_speed_kmh: number | null
          h3_cell: string | null
          id: string
          measured_at: string
          road_segment_id: string | null
          sample_count: number
          speed_kmh: number | null
        }
        Insert: {
          confidence?: number | null
          congestion_level: string
          created_at?: string
          free_flow_speed_kmh?: number | null
          h3_cell?: string | null
          id?: string
          measured_at: string
          road_segment_id?: string | null
          sample_count?: number
          speed_kmh?: number | null
        }
        Update: {
          confidence?: number | null
          congestion_level?: string
          created_at?: string
          free_flow_speed_kmh?: number | null
          h3_cell?: string | null
          id?: string
          measured_at?: string
          road_segment_id?: string | null
          sample_count?: number
          speed_kmh?: number | null
        }
        Relationships: []
      }
      nav_trips: {
        Row: {
          actual_distance_m: number | null
          actual_duration_s: number | null
          actual_price: number | null
          assigned_at: string | null
          cancel_reason: string | null
          cancelled_at: string | null
          cancelled_by: string | null
          completed_at: string | null
          created_at: string
          currency: string
          driver_id: string | null
          dropoff_address: string | null
          dropoff_location: unknown
          estimated_distance_m: number | null
          estimated_duration_s: number | null
          estimated_price: number | null
          id: string
          metadata: Json
          payment_method: string | null
          pickup_address: string | null
          pickup_arrived_at: string | null
          pickup_location: unknown
          rating_by_driver: number | null
          rating_by_rider: number | null
          requested_at: string
          requester_id: string
          route_geometry: unknown
          service_type: string
          started_at: string | null
          status: string
          surge_multiplier: number
          updated_at: string
          waypoints: Json | null
        }
        Insert: {
          actual_distance_m?: number | null
          actual_duration_s?: number | null
          actual_price?: number | null
          assigned_at?: string | null
          cancel_reason?: string | null
          cancelled_at?: string | null
          cancelled_by?: string | null
          completed_at?: string | null
          created_at?: string
          currency?: string
          driver_id?: string | null
          dropoff_address?: string | null
          dropoff_location: unknown
          estimated_distance_m?: number | null
          estimated_duration_s?: number | null
          estimated_price?: number | null
          id?: string
          metadata?: Json
          payment_method?: string | null
          pickup_address?: string | null
          pickup_arrived_at?: string | null
          pickup_location: unknown
          rating_by_driver?: number | null
          rating_by_rider?: number | null
          requested_at?: string
          requester_id: string
          route_geometry?: unknown
          service_type: string
          started_at?: string | null
          status?: string
          surge_multiplier?: number
          updated_at?: string
          waypoints?: Json | null
        }
        Update: {
          actual_distance_m?: number | null
          actual_duration_s?: number | null
          actual_price?: number | null
          assigned_at?: string | null
          cancel_reason?: string | null
          cancelled_at?: string | null
          cancelled_by?: string | null
          completed_at?: string | null
          created_at?: string
          currency?: string
          driver_id?: string | null
          dropoff_address?: string | null
          dropoff_location?: unknown
          estimated_distance_m?: number | null
          estimated_duration_s?: number | null
          estimated_price?: number | null
          id?: string
          metadata?: Json
          payment_method?: string | null
          pickup_address?: string | null
          pickup_arrived_at?: string | null
          pickup_location?: unknown
          rating_by_driver?: number | null
          rating_by_rider?: number | null
          requested_at?: string
          requester_id?: string
          route_geometry?: unknown
          service_type?: string
          started_at?: string | null
          status?: string
          surge_multiplier?: number
          updated_at?: string
          waypoints?: Json | null
        }
        Relationships: []
      }
      nav_zone_market_state: {
        Row: {
          active_drivers: number
          avg_acceptance_rate: number | null
          avg_cancellation_rate: number | null
          created_at: string
          h3_cell: string
          h3_resolution: number
          id: string
          measured_at: string
          median_pickup_eta_s: number | null
          open_requests: number
          shortage_probability: number | null
          trusted_supply: number
          zone_id: string | null
        }
        Insert: {
          active_drivers?: number
          avg_acceptance_rate?: number | null
          avg_cancellation_rate?: number | null
          created_at?: string
          h3_cell: string
          h3_resolution?: number
          id?: string
          measured_at: string
          median_pickup_eta_s?: number | null
          open_requests?: number
          shortage_probability?: number | null
          trusted_supply?: number
          zone_id?: string | null
        }
        Update: {
          active_drivers?: number
          avg_acceptance_rate?: number | null
          avg_cancellation_rate?: number | null
          created_at?: string
          h3_cell?: string
          h3_resolution?: number
          id?: string
          measured_at?: string
          median_pickup_eta_s?: number | null
          open_requests?: number
          shortage_probability?: number | null
          trusted_supply?: number
          zone_id?: string | null
        }
        Relationships: [
          {
            foreignKeyName: "nav_zone_market_state_zone_id_fkey"
            columns: ["zone_id"]
            isOneToOne: false
            referencedRelation: "nav_zones"
            referencedColumns: ["id"]
          },
        ]
      }
      nav_zones: {
        Row: {
          boundary: unknown
          city_id: string
          created_at: string
          h3_resolution: number
          id: string
          is_active: boolean
          name: string
          timezone: string
          updated_at: string
        }
        Insert: {
          boundary?: unknown
          city_id: string
          created_at?: string
          h3_resolution?: number
          id?: string
          is_active?: boolean
          name: string
          timezone?: string
          updated_at?: string
        }
        Update: {
          boundary?: unknown
          city_id?: string
          created_at?: string
          h3_resolution?: number
          id?: string
          is_active?: boolean
          name?: string
          timezone?: string
          updated_at?: string
        }
        Relationships: []
      }
      note_reactions: {
        Row: {
          created_at: string
          emoji: string
          note_owner_id: string
          reactor_id: string
        }
        Insert: {
          created_at?: string
          emoji: string
          note_owner_id: string
          reactor_id: string
        }
        Update: {
          created_at?: string
          emoji?: string
          note_owner_id?: string
          reactor_id?: string
        }
        Relationships: []
      }
      notification_category_settings: {
        Row: {
          category: string
          created_at: string
          id: string
          is_enabled: boolean
          show_sender: boolean | null
          show_text: boolean | null
          sound_id: string | null
          updated_at: string
          user_id: string
          vibrate: boolean | null
        }
        Insert: {
          category: string
          created_at?: string
          id?: string
          is_enabled?: boolean
          show_sender?: boolean | null
          show_text?: boolean | null
          sound_id?: string | null
          updated_at?: string
          user_id: string
          vibrate?: boolean | null
        }
        Update: {
          category?: string
          created_at?: string
          id?: string
          is_enabled?: boolean
          show_sender?: boolean | null
          show_text?: boolean | null
          sound_id?: string | null
          updated_at?: string
          user_id?: string
          vibrate?: boolean | null
        }
        Relationships: []
      }
      notification_deliveries: {
        Row: {
          attempts: number
          created_at: string
          delivery_id: string
          device_id: string
          error_code: string | null
          error_message: string | null
          event_id: string
          provider: string
          provider_message_id: string | null
          status: string
          updated_at: string
        }
        Insert: {
          attempts?: number
          created_at?: string
          delivery_id?: string
          device_id: string
          error_code?: string | null
          error_message?: string | null
          event_id: string
          provider: string
          provider_message_id?: string | null
          status: string
          updated_at?: string
        }
        Update: {
          attempts?: number
          created_at?: string
          delivery_id?: string
          device_id?: string
          error_code?: string | null
          error_message?: string | null
          event_id?: string
          provider?: string
          provider_message_id?: string | null
          status?: string
          updated_at?: string
        }
        Relationships: [
          {
            foreignKeyName: "notification_deliveries_event_id_fkey"
            columns: ["event_id"]
            isOneToOne: false
            referencedRelation: "notification_events"
            referencedColumns: ["event_id"]
          },
        ]
      }
      notification_events: {
        Row: {
          attempts: number
          available_at: string
          collapse_key: string | null
          created_at: string
          dedup_key: string | null
          event_id: string
          last_error: string | null
          max_attempts: number
          payload: Json
          priority: number
          processed_at: string | null
          status: string
          ttl_seconds: number
          type: string
          updated_at: string
          user_id: string
        }
        Insert: {
          attempts?: number
          available_at?: string
          collapse_key?: string | null
          created_at?: string
          dedup_key?: string | null
          event_id?: string
          last_error?: string | null
          max_attempts?: number
          payload: Json
          priority?: number
          processed_at?: string | null
          status?: string
          ttl_seconds?: number
          type: string
          updated_at?: string
          user_id: string
        }
        Update: {
          attempts?: number
          available_at?: string
          collapse_key?: string | null
          created_at?: string
          dedup_key?: string | null
          event_id?: string
          last_error?: string | null
          max_attempts?: number
          payload?: Json
          priority?: number
          processed_at?: string | null
          status?: string
          ttl_seconds?: number
          type?: string
          updated_at?: string
          user_id?: string
        }
        Relationships: []
      }
      notification_exceptions: {
        Row: {
          created_at: string
          id: string
          is_muted: boolean
          item_id: string
          item_kind: string
          show_sender: boolean | null
          show_text: boolean | null
          sound_id: string | null
          updated_at: string
          user_id: string
          vibrate: boolean | null
        }
        Insert: {
          created_at?: string
          id?: string
          is_muted?: boolean
          item_id: string
          item_kind: string
          show_sender?: boolean | null
          show_text?: boolean | null
          sound_id?: string | null
          updated_at?: string
          user_id: string
          vibrate?: boolean | null
        }
        Update: {
          created_at?: string
          id?: string
          is_muted?: boolean
          item_id?: string
          item_kind?: string
          show_sender?: boolean | null
          show_text?: boolean | null
          sound_id?: string | null
          updated_at?: string
          user_id?: string
          vibrate?: boolean | null
        }
        Relationships: []
      }
      notification_schedules: {
        Row: {
          created_at: string
          exceptions: string[]
          id: string
          quiet_days: number[]
          quiet_end: string
          quiet_hours_enabled: boolean
          quiet_start: string
          timezone: string
          updated_at: string
          user_id: string
        }
        Insert: {
          created_at?: string
          exceptions?: string[]
          id?: string
          quiet_days?: number[]
          quiet_end?: string
          quiet_hours_enabled?: boolean
          quiet_start?: string
          timezone?: string
          updated_at?: string
          user_id: string
        }
        Update: {
          created_at?: string
          exceptions?: string[]
          id?: string
          quiet_days?: number[]
          quiet_end?: string
          quiet_hours_enabled?: boolean
          quiet_start?: string
          timezone?: string
          updated_at?: string
          user_id?: string
        }
        Relationships: []
      }
      notification_settings: {
        Row: {
          comments: boolean | null
          dm_notifications: boolean | null
          follows: boolean | null
          likes: boolean | null
          live_notifications: boolean | null
          mentions: boolean | null
          pause_all: boolean | null
          pause_until: string | null
          story_reactions: boolean | null
          user_id: string
        }
        Insert: {
          comments?: boolean | null
          dm_notifications?: boolean | null
          follows?: boolean | null
          likes?: boolean | null
          live_notifications?: boolean | null
          mentions?: boolean | null
          pause_all?: boolean | null
          pause_until?: string | null
          story_reactions?: boolean | null
          user_id: string
        }
        Update: {
          comments?: boolean | null
          dm_notifications?: boolean | null
          follows?: boolean | null
          likes?: boolean | null
          live_notifications?: boolean | null
          mentions?: boolean | null
          pause_all?: boolean | null
          pause_until?: string | null
          story_reactions?: boolean | null
          user_id?: string
        }
        Relationships: []
      }
      notifications: {
        Row: {
          actor_id: string
          comment_id: string | null
          content: string | null
          created_at: string | null
          id: string
          is_read: boolean | null
          post_id: string | null
          type: string
          user_id: string
        }
        Insert: {
          actor_id: string
          comment_id?: string | null
          content?: string | null
          created_at?: string | null
          id?: string
          is_read?: boolean | null
          post_id?: string | null
          type: string
          user_id: string
        }
        Update: {
          actor_id?: string
          comment_id?: string | null
          content?: string | null
          created_at?: string | null
          id?: string
          is_read?: boolean | null
          post_id?: string | null
          type?: string
          user_id?: string
        }
        Relationships: []
      }
      owner_escalation_requests: {
        Row: {
          approval_id: string | null
          approved_at: string | null
          approver_id: string | null
          auto_revoked_at: string | null
          created_at: string
          duration_minutes: number
          expires_at: string
          granted_at: string | null
          id: string
          owner_id: string
          reason: string
          requested_at: string
          requested_by: string | null
          requested_role: string
          requires_approval: boolean | null
          revoked_at: string | null
          role_id: string | null
          status: string
          ticket_id: string
        }
        Insert: {
          approval_id?: string | null
          approved_at?: string | null
          approver_id?: string | null
          auto_revoked_at?: string | null
          created_at?: string
          duration_minutes?: number
          expires_at: string
          granted_at?: string | null
          id?: string
          owner_id: string
          reason: string
          requested_at?: string
          requested_by?: string | null
          requested_role: string
          requires_approval?: boolean | null
          revoked_at?: string | null
          role_id?: string | null
          status?: string
          ticket_id: string
        }
        Update: {
          approval_id?: string | null
          approved_at?: string | null
          approver_id?: string | null
          auto_revoked_at?: string | null
          created_at?: string
          duration_minutes?: number
          expires_at?: string
          granted_at?: string | null
          id?: string
          owner_id?: string
          reason?: string
          requested_at?: string
          requested_by?: string | null
          requested_role?: string
          requires_approval?: boolean | null
          revoked_at?: string | null
          role_id?: string | null
          status?: string
          ticket_id?: string
        }
        Relationships: [
          {
            foreignKeyName: "owner_escalation_requests_approver_id_fkey"
            columns: ["approver_id"]
            isOneToOne: false
            referencedRelation: "admin_users"
            referencedColumns: ["id"]
          },
          {
            foreignKeyName: "owner_escalation_requests_owner_id_fkey"
            columns: ["owner_id"]
            isOneToOne: false
            referencedRelation: "owners"
            referencedColumns: ["id"]
          },
          {
            foreignKeyName: "owner_escalation_requests_requested_by_fkey"
            columns: ["requested_by"]
            isOneToOne: false
            referencedRelation: "admin_users"
            referencedColumns: ["id"]
          },
          {
            foreignKeyName: "owner_escalation_requests_role_id_fkey"
            columns: ["role_id"]
            isOneToOne: false
            referencedRelation: "admin_roles"
            referencedColumns: ["id"]
          },
        ]
      }
      owners: {
        Row: {
          admin_user_id: string
          created_at: string
          emergency_email: string | null
          id: string
          is_primary: boolean
          m_of_n_config: Json | null
          mode: string
          security_paging_channel: string | null
          transferred_at: string | null
          transferred_from: string | null
        }
        Insert: {
          admin_user_id: string
          created_at?: string
          emergency_email?: string | null
          id?: string
          is_primary?: boolean
          m_of_n_config?: Json | null
          mode?: string
          security_paging_channel?: string | null
          transferred_at?: string | null
          transferred_from?: string | null
        }
        Update: {
          admin_user_id?: string
          created_at?: string
          emergency_email?: string | null
          id?: string
          is_primary?: boolean
          m_of_n_config?: Json | null
          mode?: string
          security_paging_channel?: string | null
          transferred_at?: string | null
          transferred_from?: string | null
        }
        Relationships: [
          {
            foreignKeyName: "owners_admin_user_id_fkey"
            columns: ["admin_user_id"]
            isOneToOne: true
            referencedRelation: "admin_users"
            referencedColumns: ["id"]
          },
          {
            foreignKeyName: "owners_transferred_from_fkey"
            columns: ["transferred_from"]
            isOneToOne: false
            referencedRelation: "owners"
            referencedColumns: ["id"]
          },
        ]
      }
      paid_message_transactions: {
        Row: {
          created_at: string | null
          id: string
          message_id: string | null
          recipient_id: string
          sender_id: string
          stars_amount: number
          status: string
        }
        Insert: {
          created_at?: string | null
          id?: string
          message_id?: string | null
          recipient_id: string
          sender_id: string
          stars_amount: number
          status?: string
        }
        Update: {
          created_at?: string | null
          id?: string
          message_id?: string | null
          recipient_id?: string
          sender_id?: string
          stars_amount?: number
          status?: string
        }
        Relationships: []
      }
      payment_invoices: {
        Row: {
          amount: number
          bot_id: string
          chat_id: string
          created_at: string | null
          currency: string
          description: string
          id: string
          idempotency_key: string | null
          paid_at: string | null
          payload: string | null
          photo_url: string | null
          provider_payment_charge_id: string | null
          refunded_at: string | null
          status: string
          title: string
          updated_at: string | null
          user_id: string
        }
        Insert: {
          amount: number
          bot_id: string
          chat_id: string
          created_at?: string | null
          currency?: string
          description: string
          id?: string
          idempotency_key?: string | null
          paid_at?: string | null
          payload?: string | null
          photo_url?: string | null
          provider_payment_charge_id?: string | null
          refunded_at?: string | null
          status?: string
          title: string
          updated_at?: string | null
          user_id: string
        }
        Update: {
          amount?: number
          bot_id?: string
          chat_id?: string
          created_at?: string | null
          currency?: string
          description?: string
          id?: string
          idempotency_key?: string | null
          paid_at?: string | null
          payload?: string | null
          photo_url?: string | null
          provider_payment_charge_id?: string | null
          refunded_at?: string | null
          status?: string
          title?: string
          updated_at?: string | null
          user_id?: string
        }
        Relationships: [
          {
            foreignKeyName: "payment_invoices_bot_id_fkey"
            columns: ["bot_id"]
            isOneToOne: false
            referencedRelation: "bots"
            referencedColumns: ["id"]
          },
        ]
      }
      payment_refunds: {
        Row: {
          amount: number
          created_at: string | null
          id: string
          invoice_id: string
          reason: string | null
        }
        Insert: {
          amount: number
          created_at?: string | null
          id?: string
          invoice_id: string
          reason?: string | null
        }
        Update: {
          amount?: number
          created_at?: string | null
          id?: string
          invoice_id?: string
          reason?: string | null
        }
        Relationships: [
          {
            foreignKeyName: "payment_refunds_invoice_id_fkey"
            columns: ["invoice_id"]
            isOneToOne: false
            referencedRelation: "payment_invoices"
            referencedColumns: ["id"]
          },
        ]
      }
      payout_requests: {
        Row: {
          amount_cents: number
          created_at: string
          creator_id: string
          id: string
          method: string
          payout_details: Json
          status: string
        }
        Insert: {
          amount_cents: number
          created_at?: string
          creator_id: string
          id?: string
          method: string
          payout_details?: Json
          status?: string
        }
        Update: {
          amount_cents?: number
          created_at?: string
          creator_id?: string
          id?: string
          method?: string
          payout_details?: Json
          status?: string
        }
        Relationships: []
      }
      phone_otps: {
        Row: {
          attempts: number
          code: string
          created_at: string
          expires_at: string
          id: string
          phone: string
        }
        Insert: {
          attempts?: number
          code: string
          created_at?: string
          expires_at: string
          id?: string
          phone: string
        }
        Update: {
          attempts?: number
          code?: string
          created_at?: string
          expires_at?: string
          id?: string
          phone?: string
        }
        Relationships: []
      }
      pinned_messages: {
        Row: {
          conversation_id: string
          id: string
          message_id: string
          pin_position: number
          pinned_at: string | null
          pinned_by: string
        }
        Insert: {
          conversation_id: string
          id?: string
          message_id: string
          pin_position?: number
          pinned_at?: string | null
          pinned_by: string
        }
        Update: {
          conversation_id?: string
          id?: string
          message_id?: string
          pin_position?: number
          pinned_at?: string | null
          pinned_by?: string
        }
        Relationships: [
          {
            foreignKeyName: "fk_pinned_messages_conversation_id"
            columns: ["conversation_id"]
            isOneToOne: false
            referencedRelation: "conversations"
            referencedColumns: ["id"]
          },
          {
            foreignKeyName: "fk_pinned_messages_message_id"
            columns: ["message_id"]
            isOneToOne: false
            referencedRelation: "messages"
            referencedColumns: ["id"]
          },
        ]
      }
      pinned_posts: {
        Row: {
          id: string
          pinned_at: string
          position: number
          post_id: string
          user_id: string
        }
        Insert: {
          id?: string
          pinned_at?: string
          position?: number
          post_id: string
          user_id: string
        }
        Update: {
          id?: string
          pinned_at?: string
          position?: number
          post_id?: string
          user_id?: string
        }
        Relationships: []
      }
      policy_renewals: {
        Row: {
          agent_id: string | null
          created_at: string
          days_before: number
          id: string
          is_renewed: boolean | null
          is_sent: boolean | null
          new_policy_id: string | null
          policy_id: string
          reminder_date: string
          sent_at: string | null
        }
        Insert: {
          agent_id?: string | null
          created_at?: string
          days_before: number
          id?: string
          is_renewed?: boolean | null
          is_sent?: boolean | null
          new_policy_id?: string | null
          policy_id: string
          reminder_date: string
          sent_at?: string | null
        }
        Update: {
          agent_id?: string | null
          created_at?: string
          days_before?: number
          id?: string
          is_renewed?: boolean | null
          is_sent?: boolean | null
          new_policy_id?: string | null
          policy_id?: string
          reminder_date?: string
          sent_at?: string | null
        }
        Relationships: [
          {
            foreignKeyName: "policy_renewals_agent_id_fkey"
            columns: ["agent_id"]
            isOneToOne: false
            referencedRelation: "agent_profiles"
            referencedColumns: ["id"]
          },
          {
            foreignKeyName: "policy_renewals_new_policy_id_fkey"
            columns: ["new_policy_id"]
            isOneToOne: false
            referencedRelation: "insurance_policies"
            referencedColumns: ["id"]
          },
          {
            foreignKeyName: "policy_renewals_policy_id_fkey"
            columns: ["policy_id"]
            isOneToOne: false
            referencedRelation: "insurance_policies"
            referencedColumns: ["id"]
          },
        ]
      }
      poll_options: {
        Row: {
          id: string
          option_index: number
          option_text: string
          poll_id: string
          voter_count: number | null
        }
        Insert: {
          id?: string
          option_index: number
          option_text: string
          poll_id: string
          voter_count?: number | null
        }
        Update: {
          id?: string
          option_index?: number
          option_text?: string
          poll_id?: string
          voter_count?: number | null
        }
        Relationships: [
          {
            foreignKeyName: "poll_options_poll_id_fkey"
            columns: ["poll_id"]
            isOneToOne: false
            referencedRelation: "message_polls"
            referencedColumns: ["id"]
          },
        ]
      }
      poll_votes: {
        Row: {
          id: string
          option_id: string
          poll_id: string
          user_id: string
          voted_at: string | null
        }
        Insert: {
          id?: string
          option_id: string
          poll_id: string
          user_id: string
          voted_at?: string | null
        }
        Update: {
          id?: string
          option_id?: string
          poll_id?: string
          user_id?: string
          voted_at?: string | null
        }
        Relationships: [
          {
            foreignKeyName: "poll_votes_option_id_fkey"
            columns: ["option_id"]
            isOneToOne: false
            referencedRelation: "poll_options"
            referencedColumns: ["id"]
          },
          {
            foreignKeyName: "poll_votes_poll_id_fkey"
            columns: ["poll_id"]
            isOneToOne: false
            referencedRelation: "message_polls"
            referencedColumns: ["id"]
          },
        ]
      }
      post_collabs: {
        Row: {
          created_at: string
          id: string
          invitee_id: string
          inviter_id: string
          post_id: string
          responded_at: string | null
          status: string
        }
        Insert: {
          created_at?: string
          id?: string
          invitee_id: string
          inviter_id: string
          post_id: string
          responded_at?: string | null
          status?: string
        }
        Update: {
          created_at?: string
          id?: string
          invitee_id?: string
          inviter_id?: string
          post_id?: string
          responded_at?: string | null
          status?: string
        }
        Relationships: []
      }
      post_comments: {
        Row: {
          author_id: string
          content: string
          created_at: string | null
          id: string
          likes_count: number | null
          parent_id: string | null
          post_id: string
        }
        Insert: {
          author_id: string
          content: string
          created_at?: string | null
          id?: string
          likes_count?: number | null
          parent_id?: string | null
          post_id: string
        }
        Update: {
          author_id?: string
          content?: string
          created_at?: string | null
          id?: string
          likes_count?: number | null
          parent_id?: string | null
          post_id?: string
        }
        Relationships: [
          {
            foreignKeyName: "post_comments_parent_id_fkey"
            columns: ["parent_id"]
            isOneToOne: false
            referencedRelation: "post_comments"
            referencedColumns: ["id"]
          },
          {
            foreignKeyName: "post_comments_post_id_fkey"
            columns: ["post_id"]
            isOneToOne: false
            referencedRelation: "posts"
            referencedColumns: ["id"]
          },
        ]
      }
      post_content_tags: {
        Row: {
          confidence: number | null
          post_id: string
          tag: string
        }
        Insert: {
          confidence?: number | null
          post_id: string
          tag: string
        }
        Update: {
          confidence?: number | null
          post_id?: string
          tag?: string
        }
        Relationships: []
      }
      post_likes: {
        Row: {
          created_at: string
          id: string
          post_id: string
          user_id: string
        }
        Insert: {
          created_at?: string
          id?: string
          post_id: string
          user_id: string
        }
        Update: {
          created_at?: string
          id?: string
          post_id?: string
          user_id?: string
        }
        Relationships: [
          {
            foreignKeyName: "post_likes_post_id_fkey"
            columns: ["post_id"]
            isOneToOne: false
            referencedRelation: "posts"
            referencedColumns: ["id"]
          },
        ]
      }
      post_media: {
        Row: {
          created_at: string
          height: number | null
          id: string
          media_type: string
          media_url: string
          position: number
          post_id: string
          sort_order: number
          thumbnail_url: string | null
          width: number | null
        }
        Insert: {
          created_at?: string
          height?: number | null
          id?: string
          media_type?: string
          media_url: string
          position?: number
          post_id: string
          sort_order?: number
          thumbnail_url?: string | null
          width?: number | null
        }
        Update: {
          created_at?: string
          height?: number | null
          id?: string
          media_type?: string
          media_url?: string
          position?: number
          post_id?: string
          sort_order?: number
          thumbnail_url?: string | null
          width?: number | null
        }
        Relationships: [
          {
            foreignKeyName: "post_media_post_id_fkey"
            columns: ["post_id"]
            isOneToOne: false
            referencedRelation: "posts"
            referencedColumns: ["id"]
          },
        ]
      }
      post_people_tags: {
        Row: {
          created_at: string | null
          id: string
          media_index: number | null
          post_id: string
          user_id: string
          x: number | null
          y: number | null
        }
        Insert: {
          created_at?: string | null
          id?: string
          media_index?: number | null
          post_id: string
          user_id: string
          x?: number | null
          y?: number | null
        }
        Update: {
          created_at?: string | null
          id?: string
          media_index?: number | null
          post_id?: string
          user_id?: string
          x?: number | null
          y?: number | null
        }
        Relationships: []
      }
      post_promotions: {
        Row: {
          budget: number
          clicks: number
          created_at: string
          ends_at: string | null
          id: string
          impressions: number
          latitude: number
          longitude: number
          post_id: string
          radius_km: number
          spent: number
          starts_at: string
          status: string
          updated_at: string
          user_id: string
        }
        Insert: {
          budget?: number
          clicks?: number
          created_at?: string
          ends_at?: string | null
          id?: string
          impressions?: number
          latitude: number
          longitude: number
          post_id: string
          radius_km?: number
          spent?: number
          starts_at?: string
          status?: string
          updated_at?: string
          user_id: string
        }
        Update: {
          budget?: number
          clicks?: number
          created_at?: string
          ends_at?: string | null
          id?: string
          impressions?: number
          latitude?: number
          longitude?: number
          post_id?: string
          radius_km?: number
          spent?: number
          starts_at?: string
          status?: string
          updated_at?: string
          user_id?: string
        }
        Relationships: [
          {
            foreignKeyName: "post_promotions_post_id_fkey"
            columns: ["post_id"]
            isOneToOne: false
            referencedRelation: "posts"
            referencedColumns: ["id"]
          },
        ]
      }
      post_reminders: {
        Row: {
          created_at: string | null
          notified: boolean | null
          post_id: string
          remind_at: string
          user_id: string
        }
        Insert: {
          created_at?: string | null
          notified?: boolean | null
          post_id: string
          remind_at: string
          user_id: string
        }
        Update: {
          created_at?: string | null
          notified?: boolean | null
          post_id?: string
          remind_at?: string
          user_id?: string
        }
        Relationships: [
          {
            foreignKeyName: "post_reminders_post_id_fkey"
            columns: ["post_id"]
            isOneToOne: false
            referencedRelation: "posts"
            referencedColumns: ["id"]
          },
        ]
      }
      post_user_tags: {
        Row: {
          created_at: string | null
          post_id: string
          user_id: string
          x: number | null
          y: number | null
        }
        Insert: {
          created_at?: string | null
          post_id: string
          user_id: string
          x?: number | null
          y?: number | null
        }
        Update: {
          created_at?: string | null
          post_id?: string
          user_id?: string
          x?: number | null
          y?: number | null
        }
        Relationships: []
      }
      post_views: {
        Row: {
          id: string
          post_id: string
          session_id: string | null
          user_id: string | null
          viewed_at: string
        }
        Insert: {
          id?: string
          post_id: string
          session_id?: string | null
          user_id?: string | null
          viewed_at?: string
        }
        Update: {
          id?: string
          post_id?: string
          session_id?: string | null
          user_id?: string | null
          viewed_at?: string
        }
        Relationships: [
          {
            foreignKeyName: "post_views_post_id_fkey"
            columns: ["post_id"]
            isOneToOne: false
            referencedRelation: "posts"
            referencedColumns: ["id"]
          },
        ]
      }
      posts: {
        Row: {
          alt_text: string | null
          author_id: string
          comments_count: number
          comments_disabled: boolean
          comments_policy: string | null
          content: string | null
          created_at: string
          draft_id: string | null
          grid_sort_order: number | null
          hide_likes_count: boolean
          id: string
          is_draft: boolean | null
          is_paid_partnership: boolean | null
          is_published: boolean
          is_trial: boolean | null
          latitude: number | null
          likes_count: number
          location_lat: number | null
          location_lng: number | null
          location_name: string | null
          longitude: number | null
          pin_position: number | null
          publish_state: string | null
          reminder_at: string | null
          saves_count: number | null
          scheduled_at: string | null
          search_vector: unknown
          shares_count: number
          trial_audience_percent: number | null
          trial_ended_at: string | null
          trial_started_at: string | null
          trial_stats: Json | null
          updated_at: string
          views_count: number
          visibility: string | null
        }
        Insert: {
          alt_text?: string | null
          author_id: string
          comments_count?: number
          comments_disabled?: boolean
          comments_policy?: string | null
          content?: string | null
          created_at?: string
          draft_id?: string | null
          grid_sort_order?: number | null
          hide_likes_count?: boolean
          id?: string
          is_draft?: boolean | null
          is_paid_partnership?: boolean | null
          is_published?: boolean
          is_trial?: boolean | null
          latitude?: number | null
          likes_count?: number
          location_lat?: number | null
          location_lng?: number | null
          location_name?: string | null
          longitude?: number | null
          pin_position?: number | null
          publish_state?: string | null
          reminder_at?: string | null
          saves_count?: number | null
          scheduled_at?: string | null
          search_vector?: unknown
          shares_count?: number
          trial_audience_percent?: number | null
          trial_ended_at?: string | null
          trial_started_at?: string | null
          trial_stats?: Json | null
          updated_at?: string
          views_count?: number
          visibility?: string | null
        }
        Update: {
          alt_text?: string | null
          author_id?: string
          comments_count?: number
          comments_disabled?: boolean
          comments_policy?: string | null
          content?: string | null
          created_at?: string
          draft_id?: string | null
          grid_sort_order?: number | null
          hide_likes_count?: boolean
          id?: string
          is_draft?: boolean | null
          is_paid_partnership?: boolean | null
          is_published?: boolean
          is_trial?: boolean | null
          latitude?: number | null
          likes_count?: number
          location_lat?: number | null
          location_lng?: number | null
          location_name?: string | null
          longitude?: number | null
          pin_position?: number | null
          publish_state?: string | null
          reminder_at?: string | null
          saves_count?: number | null
          scheduled_at?: string | null
          search_vector?: unknown
          shares_count?: number
          trial_audience_percent?: number | null
          trial_ended_at?: string | null
          trial_started_at?: string | null
          trial_stats?: Json | null
          updated_at?: string
          views_count?: number
          visibility?: string | null
        }
        Relationships: [
          {
            foreignKeyName: "posts_draft_id_fkey"
            columns: ["draft_id"]
            isOneToOne: false
            referencedRelation: "drafts"
            referencedColumns: ["id"]
          },
        ]
      }
      premium_features: {
        Row: {
          category: string | null
          description: string | null
          enabled: boolean
          id: string
          min_plan: string
          name: string
          slug: string
          sort_order: number | null
        }
        Insert: {
          category?: string | null
          description?: string | null
          enabled?: boolean
          id?: string
          min_plan: string
          name: string
          slug: string
          sort_order?: number | null
        }
        Update: {
          category?: string | null
          description?: string | null
          enabled?: boolean
          id?: string
          min_plan?: string
          name?: string
          slug?: string
          sort_order?: number | null
        }
        Relationships: []
      }
      premium_limits: {
        Row: {
          description: string | null
          id: string
          limit_key: string
          limit_value: number
          plan_slug: string
        }
        Insert: {
          description?: string | null
          id?: string
          limit_key: string
          limit_value: number
          plan_slug: string
        }
        Update: {
          description?: string | null
          id?: string
          limit_key?: string
          limit_value?: number
          plan_slug?: string
        }
        Relationships: []
      }
      premium_payments: {
        Row: {
          amount: number
          completed_at: string | null
          created_at: string
          currency: string
          id: string
          payment_id: string | null
          payment_provider: string | null
          period: string
          plan_slug: string
          status: string
          user_id: string
        }
        Insert: {
          amount: number
          completed_at?: string | null
          created_at?: string
          currency?: string
          id?: string
          payment_id?: string | null
          payment_provider?: string | null
          period: string
          plan_slug: string
          status?: string
          user_id: string
        }
        Update: {
          amount?: number
          completed_at?: string | null
          created_at?: string
          currency?: string
          id?: string
          payment_id?: string | null
          payment_provider?: string | null
          period?: string
          plan_slug?: string
          status?: string
          user_id?: string
        }
        Relationships: []
      }
      premium_plans: {
        Row: {
          created_at: string
          currency: string
          id: string
          is_active: boolean
          name: string
          price_monthly: number
          price_yearly: number | null
          slug: string
          sort_order: number
          updated_at: string
        }
        Insert: {
          created_at?: string
          currency?: string
          id?: string
          is_active?: boolean
          name: string
          price_monthly: number
          price_yearly?: number | null
          slug: string
          sort_order?: number
          updated_at?: string
        }
        Update: {
          created_at?: string
          currency?: string
          id?: string
          is_active?: boolean
          name?: string
          price_monthly?: number
          price_yearly?: number | null
          slug?: string
          sort_order?: number
          updated_at?: string
        }
        Relationships: []
      }
      premium_subscriptions: {
        Row: {
          auto_renew: boolean | null
          cancelled_at: string | null
          created_at: string
          expires_at: string
          id: string
          payment_method: string | null
          period: string | null
          plan: string
          started_at: string
          user_id: string
        }
        Insert: {
          auto_renew?: boolean | null
          cancelled_at?: string | null
          created_at?: string
          expires_at: string
          id?: string
          payment_method?: string | null
          period?: string | null
          plan: string
          started_at?: string
          user_id: string
        }
        Update: {
          auto_renew?: boolean | null
          cancelled_at?: string | null
          created_at?: string
          expires_at?: string
          id?: string
          payment_method?: string | null
          period?: string | null
          plan?: string
          started_at?: string
          user_id?: string
        }
        Relationships: []
      }
      privacy_rule_exceptions: {
        Row: {
          created_at: string
          id: string
          mode: string
          rule_key: string
          target_user_id: string
          user_id: string
        }
        Insert: {
          created_at?: string
          id?: string
          mode: string
          rule_key: string
          target_user_id: string
          user_id: string
        }
        Update: {
          created_at?: string
          id?: string
          mode?: string
          rule_key?: string
          target_user_id?: string
          user_id?: string
        }
        Relationships: []
      }
      privacy_rules: {
        Row: {
          audience: string
          created_at: string
          gift_allow_channels: boolean
          gift_allow_common: boolean
          gift_allow_premium: boolean
          gift_allow_rare: boolean
          gift_allow_unique: boolean
          gift_badge_enabled: boolean
          hide_read_time: boolean
          ios_call_integration: boolean
          p2p_mode: string
          phone_discovery_audience: string
          rule_key: string
          updated_at: string
          user_id: string
        }
        Insert: {
          audience?: string
          created_at?: string
          gift_allow_channels?: boolean
          gift_allow_common?: boolean
          gift_allow_premium?: boolean
          gift_allow_rare?: boolean
          gift_allow_unique?: boolean
          gift_badge_enabled?: boolean
          hide_read_time?: boolean
          ios_call_integration?: boolean
          p2p_mode?: string
          phone_discovery_audience?: string
          rule_key: string
          updated_at?: string
          user_id: string
        }
        Update: {
          audience?: string
          created_at?: string
          gift_allow_channels?: boolean
          gift_allow_common?: boolean
          gift_allow_premium?: boolean
          gift_allow_rare?: boolean
          gift_allow_unique?: boolean
          gift_badge_enabled?: boolean
          hide_read_time?: boolean
          ios_call_integration?: boolean
          p2p_mode?: string
          phone_discovery_audience?: string
          rule_key?: string
          updated_at?: string
          user_id?: string
        }
        Relationships: []
      }
      product_reviews: {
        Row: {
          created_at: string | null
          id: string
          images: Json | null
          moderation_status: string
          product_id: string
          rating: number
          seller_reply: string | null
          seller_reply_at: string | null
          text: string | null
          user_id: string
          video_url: string | null
        }
        Insert: {
          created_at?: string | null
          id?: string
          images?: Json | null
          moderation_status?: string
          product_id: string
          rating: number
          seller_reply?: string | null
          seller_reply_at?: string | null
          text?: string | null
          user_id: string
          video_url?: string | null
        }
        Update: {
          created_at?: string | null
          id?: string
          images?: Json | null
          moderation_status?: string
          product_id?: string
          rating?: number
          seller_reply?: string | null
          seller_reply_at?: string | null
          text?: string | null
          user_id?: string
          video_url?: string | null
        }
        Relationships: [
          {
            foreignKeyName: "product_reviews_product_id_fkey"
            columns: ["product_id"]
            isOneToOne: false
            referencedRelation: "shop_products"
            referencedColumns: ["id"]
          },
        ]
      }
      product_tags: {
        Row: {
          created_at: string
          id: string
          post_id: string
          product_id: string
          x_position: number
          y_position: number
        }
        Insert: {
          created_at?: string
          id?: string
          post_id: string
          product_id: string
          x_position: number
          y_position: number
        }
        Update: {
          created_at?: string
          id?: string
          post_id?: string
          product_id?: string
          x_position?: number
          y_position?: number
        }
        Relationships: [
          {
            foreignKeyName: "product_tags_product_id_fkey"
            columns: ["product_id"]
            isOneToOne: false
            referencedRelation: "shop_products"
            referencedColumns: ["id"]
          },
        ]
      }
      product_variants: {
        Row: {
          attributes: Json | null
          compare_at_price: number | null
          created_at: string | null
          id: string
          is_active: boolean | null
          name: string
          price: number
          product_id: string
          sku: string | null
          stock: number | null
        }
        Insert: {
          attributes?: Json | null
          compare_at_price?: number | null
          created_at?: string | null
          id?: string
          is_active?: boolean | null
          name: string
          price: number
          product_id: string
          sku?: string | null
          stock?: number | null
        }
        Update: {
          attributes?: Json | null
          compare_at_price?: number | null
          created_at?: string | null
          id?: string
          is_active?: boolean | null
          name?: string
          price?: number
          product_id?: string
          sku?: string | null
          stock?: number | null
        }
        Relationships: [
          {
            foreignKeyName: "fk_product_variants_product"
            columns: ["product_id"]
            isOneToOne: false
            referencedRelation: "shop_products"
            referencedColumns: ["id"]
          },
        ]
      }
      profile_links: {
        Row: {
          created_at: string
          id: string
          position: number
          title: string
          url: string
          user_id: string
        }
        Insert: {
          created_at?: string
          id?: string
          position?: number
          title: string
          url: string
          user_id: string
        }
        Update: {
          created_at?: string
          id?: string
          position?: number
          title?: string
          url?: string
          user_id?: string
        }
        Relationships: []
      }
      profile_notes: {
        Row: {
          audience: string
          created_at: string
          expires_at: string
          id: string
          text: string
          user_id: string
        }
        Insert: {
          audience?: string
          created_at?: string
          expires_at?: string
          id?: string
          text: string
          user_id: string
        }
        Update: {
          audience?: string
          created_at?: string
          expires_at?: string
          id?: string
          text?: string
          user_id?: string
        }
        Relationships: []
      }
      profiles: {
        Row: {
          account_type: string | null
          action_address: string | null
          action_email: string | null
          action_phone: string | null
          age: number | null
          avatar_url: string | null
          bio: string | null
          birth_date: string | null
          birthday: string | null
          category: string | null
          contact_email: string | null
          contact_phone: string | null
          contacts_access_granted: boolean | null
          contacts_phones: string[] | null
          created_at: string
          display_name: string | null
          email: string | null
          entity_type: string | null
          first_name: string | null
          full_name: string | null
          gender: string | null
          id: string
          is_private: boolean | null
          last_name: string | null
          last_seen_at: string | null
          name_pronunciation_url: string | null
          paid_message_stars: number | null
          phone: string | null
          professions: string[] | null
          search_vector: unknown
          status_emoji: string | null
          status_sticker_url: string | null
          updated_at: string
          user_id: string
          username: string | null
          verified: boolean | null
          website: string | null
        }
        Insert: {
          account_type?: string | null
          action_address?: string | null
          action_email?: string | null
          action_phone?: string | null
          age?: number | null
          avatar_url?: string | null
          bio?: string | null
          birth_date?: string | null
          birthday?: string | null
          category?: string | null
          contact_email?: string | null
          contact_phone?: string | null
          contacts_access_granted?: boolean | null
          contacts_phones?: string[] | null
          created_at?: string
          display_name?: string | null
          email?: string | null
          entity_type?: string | null
          first_name?: string | null
          full_name?: string | null
          gender?: string | null
          id?: string
          is_private?: boolean | null
          last_name?: string | null
          last_seen_at?: string | null
          name_pronunciation_url?: string | null
          paid_message_stars?: number | null
          phone?: string | null
          professions?: string[] | null
          search_vector?: unknown
          status_emoji?: string | null
          status_sticker_url?: string | null
          updated_at?: string
          user_id: string
          username?: string | null
          verified?: boolean | null
          website?: string | null
        }
        Update: {
          account_type?: string | null
          action_address?: string | null
          action_email?: string | null
          action_phone?: string | null
          age?: number | null
          avatar_url?: string | null
          bio?: string | null
          birth_date?: string | null
          birthday?: string | null
          category?: string | null
          contact_email?: string | null
          contact_phone?: string | null
          contacts_access_granted?: boolean | null
          contacts_phones?: string[] | null
          created_at?: string
          display_name?: string | null
          email?: string | null
          entity_type?: string | null
          first_name?: string | null
          full_name?: string | null
          gender?: string | null
          id?: string
          is_private?: boolean | null
          last_name?: string | null
          last_seen_at?: string | null
          name_pronunciation_url?: string | null
          paid_message_stars?: number | null
          phone?: string | null
          professions?: string[] | null
          search_vector?: unknown
          status_emoji?: string | null
          status_sticker_url?: string | null
          updated_at?: string
          user_id?: string
          username?: string | null
          verified?: boolean | null
          website?: string | null
        }
        Relationships: []
      }
      projection_watermarks: {
        Row: {
          dialogs_watermark_seq: number
          projection_mode: string
          rebuild_completed_at: string | null
          rebuild_started_at: string | null
          scope_id: string
          unread_watermark_seq: number
          updated_at: string
          version: number
        }
        Insert: {
          dialogs_watermark_seq?: number
          projection_mode?: string
          rebuild_completed_at?: string | null
          rebuild_started_at?: string | null
          scope_id: string
          unread_watermark_seq?: number
          updated_at?: string
          version?: number
        }
        Update: {
          dialogs_watermark_seq?: number
          projection_mode?: string
          rebuild_completed_at?: string | null
          rebuild_started_at?: string | null
          scope_id?: string
          unread_watermark_seq?: number
          updated_at?: string
          version?: number
        }
        Relationships: [
          {
            foreignKeyName: "projection_watermarks_scope_id_fkey"
            columns: ["scope_id"]
            isOneToOne: true
            referencedRelation: "core_scopes"
            referencedColumns: ["scope_id"]
          },
        ]
      }
      properties: {
        Row: {
          address: string | null
          area_kitchen: number | null
          area_living: number | null
          area_total: number | null
          city: string
          created_at: string
          currency: string
          deal_type: Database["public"]["Enums"]["deal_type"]
          description: string | null
          district: string | null
          floor: number | null
          has_balcony: boolean | null
          has_furniture: boolean | null
          has_parking: boolean | null
          id: string
          is_from_owner: boolean | null
          is_new_building: boolean | null
          is_verified: boolean | null
          latitude: number | null
          longitude: number | null
          metro_station: string | null
          owner_id: string
          price: number
          property_type: Database["public"]["Enums"]["property_type"]
          rooms: number | null
          status: Database["public"]["Enums"]["property_status"]
          title: string
          total_floors: number | null
          updated_at: string
          views_count: number | null
        }
        Insert: {
          address?: string | null
          area_kitchen?: number | null
          area_living?: number | null
          area_total?: number | null
          city: string
          created_at?: string
          currency?: string
          deal_type: Database["public"]["Enums"]["deal_type"]
          description?: string | null
          district?: string | null
          floor?: number | null
          has_balcony?: boolean | null
          has_furniture?: boolean | null
          has_parking?: boolean | null
          id?: string
          is_from_owner?: boolean | null
          is_new_building?: boolean | null
          is_verified?: boolean | null
          latitude?: number | null
          longitude?: number | null
          metro_station?: string | null
          owner_id: string
          price: number
          property_type: Database["public"]["Enums"]["property_type"]
          rooms?: number | null
          status?: Database["public"]["Enums"]["property_status"]
          title: string
          total_floors?: number | null
          updated_at?: string
          views_count?: number | null
        }
        Update: {
          address?: string | null
          area_kitchen?: number | null
          area_living?: number | null
          area_total?: number | null
          city?: string
          created_at?: string
          currency?: string
          deal_type?: Database["public"]["Enums"]["deal_type"]
          description?: string | null
          district?: string | null
          floor?: number | null
          has_balcony?: boolean | null
          has_furniture?: boolean | null
          has_parking?: boolean | null
          id?: string
          is_from_owner?: boolean | null
          is_new_building?: boolean | null
          is_verified?: boolean | null
          latitude?: number | null
          longitude?: number | null
          metro_station?: string | null
          owner_id?: string
          price?: number
          property_type?: Database["public"]["Enums"]["property_type"]
          rooms?: number | null
          status?: Database["public"]["Enums"]["property_status"]
          title?: string
          total_floors?: number | null
          updated_at?: string
          views_count?: number | null
        }
        Relationships: []
      }
      property_favorites: {
        Row: {
          created_at: string
          id: string
          property_id: string
          user_id: string
        }
        Insert: {
          created_at?: string
          id?: string
          property_id: string
          user_id: string
        }
        Update: {
          created_at?: string
          id?: string
          property_id?: string
          user_id?: string
        }
        Relationships: [
          {
            foreignKeyName: "property_favorites_property_id_fkey"
            columns: ["property_id"]
            isOneToOne: false
            referencedRelation: "properties"
            referencedColumns: ["id"]
          },
        ]
      }
      property_images: {
        Row: {
          created_at: string
          id: string
          image_url: string
          is_primary: boolean | null
          property_id: string
          sort_order: number | null
        }
        Insert: {
          created_at?: string
          id?: string
          image_url: string
          is_primary?: boolean | null
          property_id: string
          sort_order?: number | null
        }
        Update: {
          created_at?: string
          id?: string
          image_url?: string
          is_primary?: boolean | null
          property_id?: string
          sort_order?: number | null
        }
        Relationships: [
          {
            foreignKeyName: "property_images_property_id_fkey"
            columns: ["property_id"]
            isOneToOne: false
            referencedRelation: "properties"
            referencedColumns: ["id"]
          },
        ]
      }
      property_saved_searches: {
        Row: {
          created_at: string
          filters: Json
          id: string
          last_notified_at: string | null
          name: string
          notify_email: boolean | null
          notify_push: boolean | null
          user_id: string
        }
        Insert: {
          created_at?: string
          filters?: Json
          id?: string
          last_notified_at?: string | null
          name: string
          notify_email?: boolean | null
          notify_push?: boolean | null
          user_id: string
        }
        Update: {
          created_at?: string
          filters?: Json
          id?: string
          last_notified_at?: string | null
          name?: string
          notify_email?: boolean | null
          notify_push?: boolean | null
          user_id?: string
        }
        Relationships: []
      }
      property_views: {
        Row: {
          id: string
          property_id: string
          user_id: string | null
          viewed_at: string
        }
        Insert: {
          id?: string
          property_id: string
          user_id?: string | null
          viewed_at?: string
        }
        Update: {
          id?: string
          property_id?: string
          user_id?: string | null
          viewed_at?: string
        }
        Relationships: [
          {
            foreignKeyName: "property_views_property_id_fkey"
            columns: ["property_id"]
            isOneToOne: false
            referencedRelation: "properties"
            referencedColumns: ["id"]
          },
        ]
      }
      publish_events: {
        Row: {
          created_at: string
          draft_id: string
          error_code: string | null
          id: string
          idempotency_key: string
          idempotency_scope: string
          mode: string
          result: string
          trace_id: string
        }
        Insert: {
          created_at?: string
          draft_id: string
          error_code?: string | null
          id?: string
          idempotency_key: string
          idempotency_scope: string
          mode: string
          result: string
          trace_id: string
        }
        Update: {
          created_at?: string
          draft_id?: string
          error_code?: string | null
          id?: string
          idempotency_key?: string
          idempotency_scope?: string
          mode?: string
          result?: string
          trace_id?: string
        }
        Relationships: [
          {
            foreignKeyName: "publish_events_draft_id_fkey"
            columns: ["draft_id"]
            isOneToOne: false
            referencedRelation: "drafts"
            referencedColumns: ["id"]
          },
          {
            foreignKeyName: "publish_events_idempotency_scope_idempotency_key_fkey"
            columns: ["idempotency_scope", "idempotency_key"]
            isOneToOne: false
            referencedRelation: "idempotency_keys"
            referencedColumns: ["scope", "key"]
          },
        ]
      }
      publish_outbox: {
        Row: {
          aggregate_id: string
          attempts: number
          created_at: string
          id: string
          next_attempt_at: string
          payload: Json
          state: string
          topic: string
          updated_at: string
        }
        Insert: {
          aggregate_id: string
          attempts?: number
          created_at?: string
          id?: string
          next_attempt_at?: string
          payload: Json
          state?: string
          topic: string
          updated_at?: string
        }
        Update: {
          aggregate_id?: string
          attempts?: number
          created_at?: string
          id?: string
          next_attempt_at?: string
          payload?: Json
          state?: string
          topic?: string
          updated_at?: string
        }
        Relationships: []
      }
      push_tokens: {
        Row: {
          created_at: string | null
          id: string
          last_used_at: string | null
          platform: string
          token: string
          user_id: string
        }
        Insert: {
          created_at?: string | null
          id?: string
          last_used_at?: string | null
          platform: string
          token: string
          user_id: string
        }
        Update: {
          created_at?: string | null
          id?: string
          last_used_at?: string | null
          platform?: string
          token?: string
          user_id?: string
        }
        Relationships: []
      }
      quick_reaction_catalog: {
        Row: {
          created_at: string
          emoji: string
          is_active: boolean
          sort_order: number
          title: string
          updated_at: string
        }
        Insert: {
          created_at?: string
          emoji: string
          is_active?: boolean
          sort_order?: number
          title: string
          updated_at?: string
        }
        Update: {
          created_at?: string
          emoji?: string
          is_active?: boolean
          sort_order?: number
          title?: string
          updated_at?: string
        }
        Relationships: []
      }
      quick_replies: {
        Row: {
          created_at: string
          id: string
          shortcut: string
          sort_order: number | null
          text: string
          title: string
          user_id: string
        }
        Insert: {
          created_at?: string
          id?: string
          shortcut: string
          sort_order?: number | null
          text: string
          title: string
          user_id: string
        }
        Update: {
          created_at?: string
          id?: string
          shortcut?: string
          sort_order?: number | null
          text?: string
          title?: string
          user_id?: string
        }
        Relationships: []
      }
      ranking_explanations: {
        Row: {
          algorithm_version: string
          base_engagement_score: number
          boosts: Json
          cold_start_segment: string | null
          config_id: string | null
          controversial_penalty_applied: number | null
          created_at: string
          diversity_constraints: Json
          echo_chamber_detected: boolean
          exploration_ratio_applied: number | null
          final_score: number
          id: string
          is_cold_start: boolean
          penalties: Json
          position: number
          reel_id: string
          request_id: string
          session_id: string | null
          source_pool: string
          user_id: string | null
        }
        Insert: {
          algorithm_version: string
          base_engagement_score?: number
          boosts?: Json
          cold_start_segment?: string | null
          config_id?: string | null
          controversial_penalty_applied?: number | null
          created_at?: string
          diversity_constraints?: Json
          echo_chamber_detected?: boolean
          exploration_ratio_applied?: number | null
          final_score: number
          id?: string
          is_cold_start?: boolean
          penalties?: Json
          position: number
          reel_id: string
          request_id: string
          session_id?: string | null
          source_pool: string
          user_id?: string | null
        }
        Update: {
          algorithm_version?: string
          base_engagement_score?: number
          boosts?: Json
          cold_start_segment?: string | null
          config_id?: string | null
          controversial_penalty_applied?: number | null
          created_at?: string
          diversity_constraints?: Json
          echo_chamber_detected?: boolean
          exploration_ratio_applied?: number | null
          final_score?: number
          id?: string
          is_cold_start?: boolean
          penalties?: Json
          position?: number
          reel_id?: string
          request_id?: string
          session_id?: string | null
          source_pool?: string
          user_id?: string | null
        }
        Relationships: [
          {
            foreignKeyName: "ranking_explanations_reel_id_fkey"
            columns: ["reel_id"]
            isOneToOne: false
            referencedRelation: "reels"
            referencedColumns: ["id"]
          },
        ]
      }
      rate_limit_audits: {
        Row: {
          action: string
          actor_id: string
          actor_type: Database["public"]["Enums"]["actor_type"]
          allowed: boolean
          audit_id: number
          context: Json | null
          created_at: string
          request_id: string | null
          tokens_available: number | null
          tokens_consumed: number | null
        }
        Insert: {
          action: string
          actor_id: string
          actor_type: Database["public"]["Enums"]["actor_type"]
          allowed: boolean
          audit_id?: number
          context?: Json | null
          created_at?: string
          request_id?: string | null
          tokens_available?: number | null
          tokens_consumed?: number | null
        }
        Update: {
          action?: string
          actor_id?: string
          actor_type?: Database["public"]["Enums"]["actor_type"]
          allowed?: boolean
          audit_id?: number
          context?: Json | null
          created_at?: string
          request_id?: string | null
          tokens_available?: number | null
          tokens_consumed?: number | null
        }
        Relationships: []
      }
      rate_limit_configs: {
        Row: {
          action: string
          algorithm: string
          burst: number | null
          config_id: number
          cost_per_action: number
          created_at: string
          enabled: boolean
          limit_value: number
          scope: string
          tier: Database["public"]["Enums"]["risk_tier"] | null
          updated_at: string
          window_seconds: number
        }
        Insert: {
          action: string
          algorithm?: string
          burst?: number | null
          config_id?: number
          cost_per_action?: number
          created_at?: string
          enabled?: boolean
          limit_value: number
          scope: string
          tier?: Database["public"]["Enums"]["risk_tier"] | null
          updated_at?: string
          window_seconds: number
        }
        Update: {
          action?: string
          algorithm?: string
          burst?: number | null
          config_id?: number
          cost_per_action?: number
          created_at?: string
          enabled?: boolean
          limit_value?: number
          scope?: string
          tier?: Database["public"]["Enums"]["risk_tier"] | null
          updated_at?: string
          window_seconds?: number
        }
        Relationships: []
      }
      reaction_pack_items: {
        Row: {
          created_at: string | null
          emoji: string
          id: string
          image_url: string | null
          pack_id: string
          sort_order: number | null
        }
        Insert: {
          created_at?: string | null
          emoji: string
          id?: string
          image_url?: string | null
          pack_id: string
          sort_order?: number | null
        }
        Update: {
          created_at?: string | null
          emoji?: string
          id?: string
          image_url?: string | null
          pack_id?: string
          sort_order?: number | null
        }
        Relationships: [
          {
            foreignKeyName: "reaction_pack_items_pack_id_fkey"
            columns: ["pack_id"]
            isOneToOne: false
            referencedRelation: "reaction_packs"
            referencedColumns: ["id"]
          },
        ]
      }
      reaction_packs: {
        Row: {
          author_id: string
          cover_url: string | null
          created_at: string | null
          description: string | null
          id: string
          install_count: number | null
          is_official: boolean | null
          is_public: boolean | null
          name: string
          updated_at: string | null
        }
        Insert: {
          author_id: string
          cover_url?: string | null
          created_at?: string | null
          description?: string | null
          id?: string
          install_count?: number | null
          is_official?: boolean | null
          is_public?: boolean | null
          name: string
          updated_at?: string | null
        }
        Update: {
          author_id?: string
          cover_url?: string | null
          created_at?: string | null
          description?: string | null
          id?: string
          install_count?: number | null
          is_official?: boolean | null
          is_public?: boolean | null
          name?: string
          updated_at?: string | null
        }
        Relationships: []
      }
      recommended_content: {
        Row: {
          content_id: string
          content_type: string
          created_at: string | null
          id: string
          is_served: boolean | null
          reason: string | null
          score: number
          user_id: string
        }
        Insert: {
          content_id: string
          content_type: string
          created_at?: string | null
          id?: string
          is_served?: boolean | null
          reason?: string | null
          score?: number
          user_id: string
        }
        Update: {
          content_id?: string
          content_type?: string
          created_at?: string | null
          id?: string
          is_served?: boolean | null
          reason?: string | null
          score?: number
          user_id?: string
        }
        Relationships: []
      }
      recommended_users: {
        Row: {
          created_at: string
          id: string
          is_active: boolean
          priority: number
          recommended_by: string
          user_id: string
        }
        Insert: {
          created_at?: string
          id?: string
          is_active?: boolean
          priority?: number
          recommended_by?: string
          user_id: string
        }
        Update: {
          created_at?: string
          id?: string
          is_active?: boolean
          priority?: number
          recommended_by?: string
          user_id?: string
        }
        Relationships: []
      }
      recovery_emails: {
        Row: {
          code_expires_at: string | null
          created_at: string | null
          email: string
          updated_at: string | null
          user_id: string
          verification_code: string | null
          verified: boolean | null
        }
        Insert: {
          code_expires_at?: string | null
          created_at?: string | null
          email: string
          updated_at?: string | null
          user_id: string
          verification_code?: string | null
          verified?: boolean | null
        }
        Update: {
          code_expires_at?: string | null
          created_at?: string | null
          email?: string
          updated_at?: string | null
          user_id?: string
          verification_code?: string | null
          verified?: boolean | null
        }
        Relationships: []
      }
      reel_audio_tracks: {
        Row: {
          audio_track_id: string
          created_at: string
          reel_id: string
        }
        Insert: {
          audio_track_id: string
          created_at?: string
          reel_id: string
        }
        Update: {
          audio_track_id?: string
          created_at?: string
          reel_id?: string
        }
        Relationships: [
          {
            foreignKeyName: "reel_audio_tracks_audio_track_id_fkey"
            columns: ["audio_track_id"]
            isOneToOne: false
            referencedRelation: "audio_tracks"
            referencedColumns: ["id"]
          },
          {
            foreignKeyName: "reel_audio_tracks_reel_id_fkey"
            columns: ["reel_id"]
            isOneToOne: true
            referencedRelation: "reels"
            referencedColumns: ["id"]
          },
        ]
      }
      reel_audios: {
        Row: {
          artist: string | null
          audio_url: string
          cover_url: string | null
          created_at: string | null
          duration_seconds: number | null
          id: string
          reels_count: number | null
          title: string
        }
        Insert: {
          artist?: string | null
          audio_url: string
          cover_url?: string | null
          created_at?: string | null
          duration_seconds?: number | null
          id?: string
          reels_count?: number | null
          title: string
        }
        Update: {
          artist?: string | null
          audio_url?: string
          cover_url?: string | null
          created_at?: string | null
          duration_seconds?: number | null
          id?: string
          reels_count?: number | null
          title?: string
        }
        Relationships: []
      }
      reel_collaborators: {
        Row: {
          collaborator_id: string
          created_at: string | null
          id: string
          reel_id: string
          status: string
        }
        Insert: {
          collaborator_id: string
          created_at?: string | null
          id?: string
          reel_id: string
          status?: string
        }
        Update: {
          collaborator_id?: string
          created_at?: string | null
          id?: string
          reel_id?: string
          status?: string
        }
        Relationships: [
          {
            foreignKeyName: "reel_collaborators_reel_id_fkey"
            columns: ["reel_id"]
            isOneToOne: false
            referencedRelation: "posts"
            referencedColumns: ["id"]
          },
        ]
      }
      reel_comment_likes: {
        Row: {
          comment_id: string
          created_at: string
          id: string
          user_id: string
        }
        Insert: {
          comment_id: string
          created_at?: string
          id?: string
          user_id: string
        }
        Update: {
          comment_id?: string
          created_at?: string
          id?: string
          user_id?: string
        }
        Relationships: [
          {
            foreignKeyName: "reel_comment_likes_comment_id_fkey"
            columns: ["comment_id"]
            isOneToOne: false
            referencedRelation: "reel_comments"
            referencedColumns: ["id"]
          },
        ]
      }
      reel_comments: {
        Row: {
          author_id: string
          content: string
          created_at: string
          id: string
          likes_count: number
          parent_id: string | null
          reel_id: string
        }
        Insert: {
          author_id: string
          content: string
          created_at?: string
          id?: string
          likes_count?: number
          parent_id?: string | null
          reel_id: string
        }
        Update: {
          author_id?: string
          content?: string
          created_at?: string
          id?: string
          likes_count?: number
          parent_id?: string | null
          reel_id?: string
        }
        Relationships: [
          {
            foreignKeyName: "reel_comments_parent_id_fkey"
            columns: ["parent_id"]
            isOneToOne: false
            referencedRelation: "reel_comments"
            referencedColumns: ["id"]
          },
          {
            foreignKeyName: "reel_comments_reel_id_fkey"
            columns: ["reel_id"]
            isOneToOne: false
            referencedRelation: "reels"
            referencedColumns: ["id"]
          },
        ]
      }
      reel_content_features: {
        Row: {
          created_at: string | null
          description_tokens: string[] | null
          dominant_colors: string[] | null
          duration_seconds: number | null
          has_faces: boolean | null
          music_genre: string | null
          music_mood: string | null
          reel_id: string
          sentiment_score: number | null
          video_quality: string | null
        }
        Insert: {
          created_at?: string | null
          description_tokens?: string[] | null
          dominant_colors?: string[] | null
          duration_seconds?: number | null
          has_faces?: boolean | null
          music_genre?: string | null
          music_mood?: string | null
          reel_id: string
          sentiment_score?: number | null
          video_quality?: string | null
        }
        Update: {
          created_at?: string | null
          description_tokens?: string[] | null
          dominant_colors?: string[] | null
          duration_seconds?: number | null
          has_faces?: boolean | null
          music_genre?: string | null
          music_mood?: string | null
          reel_id?: string
          sentiment_score?: number | null
          video_quality?: string | null
        }
        Relationships: [
          {
            foreignKeyName: "reel_content_features_reel_id_fkey"
            columns: ["reel_id"]
            isOneToOne: true
            referencedRelation: "reels"
            referencedColumns: ["id"]
          },
        ]
      }
      reel_hashtags: {
        Row: {
          created_at: string | null
          hashtag_id: string
          position: number | null
          reel_id: string
          relevance_score: number | null
        }
        Insert: {
          created_at?: string | null
          hashtag_id: string
          position?: number | null
          reel_id: string
          relevance_score?: number | null
        }
        Update: {
          created_at?: string | null
          hashtag_id?: string
          position?: number | null
          reel_id?: string
          relevance_score?: number | null
        }
        Relationships: [
          {
            foreignKeyName: "reel_hashtags_hashtag_id_fkey"
            columns: ["hashtag_id"]
            isOneToOne: false
            referencedRelation: "hashtags"
            referencedColumns: ["id"]
          },
          {
            foreignKeyName: "reel_hashtags_reel_id_fkey"
            columns: ["reel_id"]
            isOneToOne: false
            referencedRelation: "reels"
            referencedColumns: ["id"]
          },
        ]
      }
      reel_impressions: {
        Row: {
          algorithm_version: string | null
          created_at: string
          id: string
          position: number | null
          reel_id: string
          request_id: string | null
          score: number | null
          session_id: string | null
          source: string | null
          user_id: string | null
        }
        Insert: {
          algorithm_version?: string | null
          created_at?: string
          id?: string
          position?: number | null
          reel_id: string
          request_id?: string | null
          score?: number | null
          session_id?: string | null
          source?: string | null
          user_id?: string | null
        }
        Update: {
          algorithm_version?: string | null
          created_at?: string
          id?: string
          position?: number | null
          reel_id?: string
          request_id?: string | null
          score?: number | null
          session_id?: string | null
          source?: string | null
          user_id?: string | null
        }
        Relationships: [
          {
            foreignKeyName: "reel_impressions_reel_id_fkey"
            columns: ["reel_id"]
            isOneToOne: false
            referencedRelation: "reels"
            referencedColumns: ["id"]
          },
        ]
      }
      reel_likes: {
        Row: {
          created_at: string | null
          id: string
          reel_id: string
          user_id: string
        }
        Insert: {
          created_at?: string | null
          id?: string
          reel_id: string
          user_id: string
        }
        Update: {
          created_at?: string | null
          id?: string
          reel_id?: string
          user_id?: string
        }
        Relationships: [
          {
            foreignKeyName: "reel_likes_reel_id_fkey"
            columns: ["reel_id"]
            isOneToOne: false
            referencedRelation: "reels"
            referencedColumns: ["id"]
          },
        ]
      }
      reel_metrics: {
        Row: {
          author_id: string
          avg_watch_seconds: number
          comments: number
          created_at: string
          distribution_by_reason: Json
          distribution_by_source: Json
          hides: number
          impressions: number
          last_updated_at: string
          likes: number
          not_interested: number
          reel_id: string
          reports: number
          saves: number
          shares: number
          total_watch_seconds: number
          unique_viewers: number
          view_starts: number
          viewed_2s: number
          watched: number
          watched_rate: number
        }
        Insert: {
          author_id: string
          avg_watch_seconds?: number
          comments?: number
          created_at?: string
          distribution_by_reason?: Json
          distribution_by_source?: Json
          hides?: number
          impressions?: number
          last_updated_at?: string
          likes?: number
          not_interested?: number
          reel_id: string
          reports?: number
          saves?: number
          shares?: number
          total_watch_seconds?: number
          unique_viewers?: number
          view_starts?: number
          viewed_2s?: number
          watched?: number
          watched_rate?: number
        }
        Update: {
          author_id?: string
          avg_watch_seconds?: number
          comments?: number
          created_at?: string
          distribution_by_reason?: Json
          distribution_by_source?: Json
          hides?: number
          impressions?: number
          last_updated_at?: string
          likes?: number
          not_interested?: number
          reel_id?: string
          reports?: number
          saves?: number
          shares?: number
          total_watch_seconds?: number
          unique_viewers?: number
          view_starts?: number
          viewed_2s?: number
          watched?: number
          watched_rate?: number
        }
        Relationships: [
          {
            foreignKeyName: "reel_metrics_reel_id_fkey"
            columns: ["reel_id"]
            isOneToOne: true
            referencedRelation: "reels"
            referencedColumns: ["id"]
          },
        ]
      }
      reel_metrics_snapshots: {
        Row: {
          author_id: string
          avg_watch_seconds: number
          comments: number
          created_at: string
          distribution_by_reason: Json
          distribution_by_source: Json
          hides: number
          impressions: number
          likes: number
          not_interested: number
          reel_id: string
          reports: number
          saves: number
          shares: number
          snapshot_date: string
          snapshot_id: string
          total_watch_seconds: number
          unique_viewers: number
          view_starts: number
          viewed_2s: number
          watched: number
          watched_rate: number
        }
        Insert: {
          author_id: string
          avg_watch_seconds?: number
          comments?: number
          created_at?: string
          distribution_by_reason?: Json
          distribution_by_source?: Json
          hides?: number
          impressions?: number
          likes?: number
          not_interested?: number
          reel_id: string
          reports?: number
          saves?: number
          shares?: number
          snapshot_date: string
          snapshot_id?: string
          total_watch_seconds?: number
          unique_viewers?: number
          view_starts?: number
          viewed_2s?: number
          watched?: number
          watched_rate?: number
        }
        Update: {
          author_id?: string
          avg_watch_seconds?: number
          comments?: number
          created_at?: string
          distribution_by_reason?: Json
          distribution_by_source?: Json
          hides?: number
          impressions?: number
          likes?: number
          not_interested?: number
          reel_id?: string
          reports?: number
          saves?: number
          shares?: number
          snapshot_date?: string
          snapshot_id?: string
          total_watch_seconds?: number
          unique_viewers?: number
          view_starts?: number
          viewed_2s?: number
          watched?: number
          watched_rate?: number
        }
        Relationships: [
          {
            foreignKeyName: "reel_metrics_snapshots_reel_id_fkey"
            columns: ["reel_id"]
            isOneToOne: false
            referencedRelation: "reels"
            referencedColumns: ["id"]
          },
        ]
      }
      reel_moderation_audit: {
        Row: {
          created_at: string
          decided_by: string | null
          id: string
          is_graphic_violence: boolean
          is_nsfw: boolean
          is_political_extremism: boolean
          moderation_status: string
          notes: string | null
          reel_id: string
          source: string
        }
        Insert: {
          created_at?: string
          decided_by?: string | null
          id?: string
          is_graphic_violence: boolean
          is_nsfw: boolean
          is_political_extremism: boolean
          moderation_status: string
          notes?: string | null
          reel_id: string
          source?: string
        }
        Update: {
          created_at?: string
          decided_by?: string | null
          id?: string
          is_graphic_violence?: boolean
          is_nsfw?: boolean
          is_political_extremism?: boolean
          moderation_status?: string
          notes?: string | null
          reel_id?: string
          source?: string
        }
        Relationships: [
          {
            foreignKeyName: "reel_moderation_audit_reel_id_fkey"
            columns: ["reel_id"]
            isOneToOne: false
            referencedRelation: "reels"
            referencedColumns: ["id"]
          },
        ]
      }
      reel_remixes: {
        Row: {
          created_at: string
          creator_id: string
          id: string
          original_reel_id: string
          remix_reel_id: string
        }
        Insert: {
          created_at?: string
          creator_id: string
          id?: string
          original_reel_id: string
          remix_reel_id: string
        }
        Update: {
          created_at?: string
          creator_id?: string
          id?: string
          original_reel_id?: string
          remix_reel_id?: string
        }
        Relationships: []
      }
      reel_reposts: {
        Row: {
          created_at: string | null
          id: string
          reel_id: string
          user_id: string
        }
        Insert: {
          created_at?: string | null
          id?: string
          reel_id: string
          user_id: string
        }
        Update: {
          created_at?: string | null
          id?: string
          reel_id?: string
          user_id?: string
        }
        Relationships: [
          {
            foreignKeyName: "reel_reposts_reel_id_fkey"
            columns: ["reel_id"]
            isOneToOne: false
            referencedRelation: "reels"
            referencedColumns: ["id"]
          },
        ]
      }
      reel_saves: {
        Row: {
          created_at: string | null
          id: string
          reel_id: string
          user_id: string
        }
        Insert: {
          created_at?: string | null
          id?: string
          reel_id: string
          user_id: string
        }
        Update: {
          created_at?: string | null
          id?: string
          reel_id?: string
          user_id?: string
        }
        Relationships: [
          {
            foreignKeyName: "reel_saves_reel_id_fkey"
            columns: ["reel_id"]
            isOneToOne: false
            referencedRelation: "reels"
            referencedColumns: ["id"]
          },
        ]
      }
      reel_shares: {
        Row: {
          created_at: string | null
          id: string
          reel_id: string
          target_id: string
          target_type: string
          user_id: string
        }
        Insert: {
          created_at?: string | null
          id?: string
          reel_id: string
          target_id: string
          target_type: string
          user_id: string
        }
        Update: {
          created_at?: string | null
          id?: string
          reel_id?: string
          target_id?: string
          target_type?: string
          user_id?: string
        }
        Relationships: [
          {
            foreignKeyName: "reel_shares_reel_id_fkey"
            columns: ["reel_id"]
            isOneToOne: false
            referencedRelation: "reels"
            referencedColumns: ["id"]
          },
        ]
      }
      reel_templates: {
        Row: {
          audio_title: string | null
          audio_url: string | null
          clip_count: number
          created_at: string
          creator_id: string
          duration_ms: number
          id: string
          is_public: boolean
          preview_url: string | null
          title: string
          use_count: number
        }
        Insert: {
          audio_title?: string | null
          audio_url?: string | null
          clip_count?: number
          created_at?: string
          creator_id: string
          duration_ms?: number
          id?: string
          is_public?: boolean
          preview_url?: string | null
          title: string
          use_count?: number
        }
        Update: {
          audio_title?: string | null
          audio_url?: string | null
          clip_count?: number
          created_at?: string
          creator_id?: string
          duration_ms?: number
          id?: string
          is_public?: boolean
          preview_url?: string | null
          title?: string
          use_count?: number
        }
        Relationships: []
      }
      reel_trending_topics: {
        Row: {
          detected_at: string | null
          reel_id: string
          relevance_score: number | null
          topic_id: string
        }
        Insert: {
          detected_at?: string | null
          reel_id: string
          relevance_score?: number | null
          topic_id: string
        }
        Update: {
          detected_at?: string | null
          reel_id?: string
          relevance_score?: number | null
          topic_id?: string
        }
        Relationships: [
          {
            foreignKeyName: "reel_trending_topics_reel_id_fkey"
            columns: ["reel_id"]
            isOneToOne: false
            referencedRelation: "reels"
            referencedColumns: ["id"]
          },
          {
            foreignKeyName: "reel_trending_topics_topic_id_fkey"
            columns: ["topic_id"]
            isOneToOne: false
            referencedRelation: "trending_topics"
            referencedColumns: ["id"]
          },
        ]
      }
      reel_views: {
        Row: {
          id: string
          reel_id: string
          session_id: string | null
          user_id: string | null
          viewed_at: string | null
        }
        Insert: {
          id?: string
          reel_id: string
          session_id?: string | null
          user_id?: string | null
          viewed_at?: string | null
        }
        Update: {
          id?: string
          reel_id?: string
          session_id?: string | null
          user_id?: string | null
          viewed_at?: string | null
        }
        Relationships: [
          {
            foreignKeyName: "reel_views_reel_id_fkey"
            columns: ["reel_id"]
            isOneToOne: false
            referencedRelation: "reels"
            referencedColumns: ["id"]
          },
        ]
      }
      reel_virality_metrics: {
        Row: {
          engagement_velocity: number | null
          first_hour_likes: number | null
          first_hour_shares: number | null
          first_hour_views: number | null
          is_trending: boolean | null
          last_calculated_at: string | null
          predicted_viral_score: number | null
          reel_id: string
          viral_coefficient: number | null
        }
        Insert: {
          engagement_velocity?: number | null
          first_hour_likes?: number | null
          first_hour_shares?: number | null
          first_hour_views?: number | null
          is_trending?: boolean | null
          last_calculated_at?: string | null
          predicted_viral_score?: number | null
          reel_id: string
          viral_coefficient?: number | null
        }
        Update: {
          engagement_velocity?: number | null
          first_hour_likes?: number | null
          first_hour_shares?: number | null
          first_hour_views?: number | null
          is_trending?: boolean | null
          last_calculated_at?: string | null
          predicted_viral_score?: number | null
          reel_id?: string
          viral_coefficient?: number | null
        }
        Relationships: [
          {
            foreignKeyName: "reel_virality_metrics_reel_id_fkey"
            columns: ["reel_id"]
            isOneToOne: true
            referencedRelation: "reels"
            referencedColumns: ["id"]
          },
        ]
      }
      reels: {
        Row: {
          ai_enhance: boolean
          allow_comments: boolean
          allow_download: boolean | null
          allow_remix: boolean | null
          audio_id: string | null
          author_id: string
          captions: Json | null
          captions_enabled: boolean
          channel_id: string | null
          client_publish_id: string | null
          comments_count: number | null
          created_at: string | null
          description: string | null
          draft_id: string | null
          duration: number | null
          duration_seconds: number | null
          effect_preset: string | null
          face_enhance: boolean
          id: string
          is_graphic_violence: boolean
          is_nsfw: boolean
          is_political_extremism: boolean
          is_time_lapse: boolean
          likes_count: number | null
          location_name: string | null
          max_duration_sec: number | null
          moderated_at: string | null
          moderated_by: string | null
          moderation_notes: string | null
          moderation_status: string
          music_title: string | null
          music_track_id: string | null
          original_fps: number | null
          publish_state: string | null
          remix_of: string | null
          reposts_count: number | null
          saves_count: number | null
          shares_count: number | null
          slow_motion_factor: number | null
          speed: number | null
          tagged_users: string[]
          template_id: string | null
          thumbnail_url: string | null
          video_url: string
          views_count: number | null
          visibility: string | null
        }
        Insert: {
          ai_enhance?: boolean
          allow_comments?: boolean
          allow_download?: boolean | null
          allow_remix?: boolean | null
          audio_id?: string | null
          author_id: string
          captions?: Json | null
          captions_enabled?: boolean
          channel_id?: string | null
          client_publish_id?: string | null
          comments_count?: number | null
          created_at?: string | null
          description?: string | null
          draft_id?: string | null
          duration?: number | null
          duration_seconds?: number | null
          effect_preset?: string | null
          face_enhance?: boolean
          id?: string
          is_graphic_violence?: boolean
          is_nsfw?: boolean
          is_political_extremism?: boolean
          is_time_lapse?: boolean
          likes_count?: number | null
          location_name?: string | null
          max_duration_sec?: number | null
          moderated_at?: string | null
          moderated_by?: string | null
          moderation_notes?: string | null
          moderation_status?: string
          music_title?: string | null
          music_track_id?: string | null
          original_fps?: number | null
          publish_state?: string | null
          remix_of?: string | null
          reposts_count?: number | null
          saves_count?: number | null
          shares_count?: number | null
          slow_motion_factor?: number | null
          speed?: number | null
          tagged_users?: string[]
          template_id?: string | null
          thumbnail_url?: string | null
          video_url: string
          views_count?: number | null
          visibility?: string | null
        }
        Update: {
          ai_enhance?: boolean
          allow_comments?: boolean
          allow_download?: boolean | null
          allow_remix?: boolean | null
          audio_id?: string | null
          author_id?: string
          captions?: Json | null
          captions_enabled?: boolean
          channel_id?: string | null
          client_publish_id?: string | null
          comments_count?: number | null
          created_at?: string | null
          description?: string | null
          draft_id?: string | null
          duration?: number | null
          duration_seconds?: number | null
          effect_preset?: string | null
          face_enhance?: boolean
          id?: string
          is_graphic_violence?: boolean
          is_nsfw?: boolean
          is_political_extremism?: boolean
          is_time_lapse?: boolean
          likes_count?: number | null
          location_name?: string | null
          max_duration_sec?: number | null
          moderated_at?: string | null
          moderated_by?: string | null
          moderation_notes?: string | null
          moderation_status?: string
          music_title?: string | null
          music_track_id?: string | null
          original_fps?: number | null
          publish_state?: string | null
          remix_of?: string | null
          reposts_count?: number | null
          saves_count?: number | null
          shares_count?: number | null
          slow_motion_factor?: number | null
          speed?: number | null
          tagged_users?: string[]
          template_id?: string | null
          thumbnail_url?: string | null
          video_url?: string
          views_count?: number | null
          visibility?: string | null
        }
        Relationships: [
          {
            foreignKeyName: "reels_channel_id_fkey"
            columns: ["channel_id"]
            isOneToOne: false
            referencedRelation: "channels"
            referencedColumns: ["id"]
          },
          {
            foreignKeyName: "reels_draft_id_fkey"
            columns: ["draft_id"]
            isOneToOne: false
            referencedRelation: "drafts"
            referencedColumns: ["id"]
          },
          {
            foreignKeyName: "reels_template_id_fkey"
            columns: ["template_id"]
            isOneToOne: false
            referencedRelation: "reel_templates"
            referencedColumns: ["id"]
          },
        ]
      }
      reels_engine_action_journal: {
        Row: {
          action_type: string
          active_config_version_id: string | null
          actor_role: string | null
          actor_user_id: string | null
          decided_at: string
          decision_source: string | null
          environment: string
          error: string | null
          executed_at: string | null
          id: string
          idempotency_key: string
          is_major: boolean
          payload: Json
          pipeline_is_suppressed_before: boolean
          pipeline_suppressed_at_before: string | null
          pipeline_suppressed_until: string | null
          pipeline_suppressed_until_before: string | null
          pipeline_suppression_reason: string | null
          pipeline_suppression_reason_before: string | null
          priority: number
          reason: string | null
          reason_code: string | null
          segment_key: string
          status: Database["public"]["Enums"]["reels_engine_action_status"]
          suppression_reason: string | null
        }
        Insert: {
          action_type: string
          active_config_version_id?: string | null
          actor_role?: string | null
          actor_user_id?: string | null
          decided_at?: string
          decision_source?: string | null
          environment?: string
          error?: string | null
          executed_at?: string | null
          id?: string
          idempotency_key: string
          is_major?: boolean
          payload?: Json
          pipeline_is_suppressed_before?: boolean
          pipeline_suppressed_at_before?: string | null
          pipeline_suppressed_until?: string | null
          pipeline_suppressed_until_before?: string | null
          pipeline_suppression_reason?: string | null
          pipeline_suppression_reason_before?: string | null
          priority?: number
          reason?: string | null
          reason_code?: string | null
          segment_key: string
          status?: Database["public"]["Enums"]["reels_engine_action_status"]
          suppression_reason?: string | null
        }
        Update: {
          action_type?: string
          active_config_version_id?: string | null
          actor_role?: string | null
          actor_user_id?: string | null
          decided_at?: string
          decision_source?: string | null
          environment?: string
          error?: string | null
          executed_at?: string | null
          id?: string
          idempotency_key?: string
          is_major?: boolean
          payload?: Json
          pipeline_is_suppressed_before?: boolean
          pipeline_suppressed_at_before?: string | null
          pipeline_suppressed_until?: string | null
          pipeline_suppressed_until_before?: string | null
          pipeline_suppression_reason?: string | null
          pipeline_suppression_reason_before?: string | null
          priority?: number
          reason?: string | null
          reason_code?: string | null
          segment_key?: string
          status?: Database["public"]["Enums"]["reels_engine_action_status"]
          suppression_reason?: string | null
        }
        Relationships: []
      }
      reels_engine_config_versions: {
        Row: {
          activated_at: string | null
          activated_by: string | null
          config: Json
          created_at: string
          created_by: string | null
          description: string | null
          environment: string
          id: string
          is_active: boolean
          parent_id: string | null
        }
        Insert: {
          activated_at?: string | null
          activated_by?: string | null
          config: Json
          created_at?: string
          created_by?: string | null
          description?: string | null
          environment?: string
          id?: string
          is_active?: boolean
          parent_id?: string | null
        }
        Update: {
          activated_at?: string | null
          activated_by?: string | null
          config?: Json
          created_at?: string
          created_by?: string | null
          description?: string | null
          environment?: string
          id?: string
          is_active?: boolean
          parent_id?: string | null
        }
        Relationships: [
          {
            foreignKeyName: "reels_engine_config_versions_parent_id_fkey"
            columns: ["parent_id"]
            isOneToOne: false
            referencedRelation: "reels_engine_config_versions"
            referencedColumns: ["id"]
          },
        ]
      }
      reels_engine_segment_state: {
        Row: {
          active_overrides: Json
          cooldown_until: string | null
          environment: string
          last_action_id: string | null
          last_major_action_at: string | null
          mode: Database["public"]["Enums"]["reels_engine_mode"]
          segment_key: string
          suppression: Json
          updated_at: string
        }
        Insert: {
          active_overrides?: Json
          cooldown_until?: string | null
          environment?: string
          last_action_id?: string | null
          last_major_action_at?: string | null
          mode?: Database["public"]["Enums"]["reels_engine_mode"]
          segment_key: string
          suppression?: Json
          updated_at?: string
        }
        Update: {
          active_overrides?: Json
          cooldown_until?: string | null
          environment?: string
          last_action_id?: string | null
          last_major_action_at?: string | null
          mode?: Database["public"]["Enums"]["reels_engine_mode"]
          segment_key?: string
          suppression?: Json
          updated_at?: string
        }
        Relationships: []
      }
      render_job_logs: {
        Row: {
          created_at: string
          id: number
          job_id: string
          level: string
          message: string
          metadata: Json | null
        }
        Insert: {
          created_at?: string
          id?: number
          job_id: string
          level?: string
          message: string
          metadata?: Json | null
        }
        Update: {
          created_at?: string
          id?: number
          job_id?: string
          level?: string
          message?: string
          metadata?: Json | null
        }
        Relationships: [
          {
            foreignKeyName: "render_job_logs_job_id_fkey"
            columns: ["job_id"]
            isOneToOne: false
            referencedRelation: "render_jobs"
            referencedColumns: ["id"]
          },
        ]
      }
      render_jobs: {
        Row: {
          completed_at: string | null
          created_at: string
          error_message: string | null
          estimated_duration_s: number | null
          id: string
          output_bitrate: string
          output_codec: string
          output_format: string
          output_fps: number
          output_resolution: string
          output_size: number | null
          output_url: string | null
          priority: number
          progress: number
          project_id: string
          started_at: string | null
          status: string
          user_id: string
          worker_id: string | null
        }
        Insert: {
          completed_at?: string | null
          created_at?: string
          error_message?: string | null
          estimated_duration_s?: number | null
          id?: string
          output_bitrate?: string
          output_codec?: string
          output_format?: string
          output_fps?: number
          output_resolution?: string
          output_size?: number | null
          output_url?: string | null
          priority?: number
          progress?: number
          project_id: string
          started_at?: string | null
          status?: string
          user_id: string
          worker_id?: string | null
        }
        Update: {
          completed_at?: string | null
          created_at?: string
          error_message?: string | null
          estimated_duration_s?: number | null
          id?: string
          output_bitrate?: string
          output_codec?: string
          output_format?: string
          output_fps?: number
          output_resolution?: string
          output_size?: number | null
          output_url?: string | null
          priority?: number
          progress?: number
          project_id?: string
          started_at?: string | null
          status?: string
          user_id?: string
          worker_id?: string | null
        }
        Relationships: [
          {
            foreignKeyName: "render_jobs_project_id_fkey"
            columns: ["project_id"]
            isOneToOne: false
            referencedRelation: "editor_projects"
            referencedColumns: ["id"]
          },
        ]
      }
      restricted_users: {
        Row: {
          created_at: string | null
          id: string | null
          restricted_id: string
          user_id: string
        }
        Insert: {
          created_at?: string | null
          id?: string | null
          restricted_id: string
          user_id: string
        }
        Update: {
          created_at?: string | null
          id?: string | null
          restricted_id?: string
          user_id?: string
        }
        Relationships: []
      }
      rights_events: {
        Row: {
          action_patch: Json | null
          applied_rev: number | null
          created_at: string
          decision: string
          decision_code: string
          draft_id: string
          explain_ref: string | null
          id: string
        }
        Insert: {
          action_patch?: Json | null
          applied_rev?: number | null
          created_at?: string
          decision: string
          decision_code: string
          draft_id: string
          explain_ref?: string | null
          id?: string
        }
        Update: {
          action_patch?: Json | null
          applied_rev?: number | null
          created_at?: string
          decision?: string
          decision_code?: string
          draft_id?: string
          explain_ref?: string | null
          id?: string
        }
        Relationships: [
          {
            foreignKeyName: "rights_events_draft_id_fkey"
            columns: ["draft_id"]
            isOneToOne: false
            referencedRelation: "drafts"
            referencedColumns: ["id"]
          },
        ]
      }
      risk_events: {
        Row: {
          actor_id: string
          actor_type: Database["public"]["Enums"]["actor_type"]
          created_at: string
          event_id: number
          event_type: string
          meta: Json | null
          request_id: string | null
          weight: number
        }
        Insert: {
          actor_id: string
          actor_type: Database["public"]["Enums"]["actor_type"]
          created_at?: string
          event_id?: number
          event_type: string
          meta?: Json | null
          request_id?: string | null
          weight?: number
        }
        Update: {
          actor_id?: string
          actor_type?: Database["public"]["Enums"]["actor_type"]
          created_at?: string
          event_id?: number
          event_type?: string
          meta?: Json | null
          request_id?: string | null
          weight?: number
        }
        Relationships: []
      }
      rollback_policies: {
        Row: {
          confirmation_quorum_ratio: number | null
          created_at: string
          false_positive_rate_threshold: number
          id: number
          is_active: boolean
          organization_id: string
          policy_id: string
          policy_name: string
          rollback_hysteresis_window_hours: number
          sample_size_min_for_trigger: number
          segment_overrides: Json | null
          updated_at: string
          version_id: string
        }
        Insert: {
          confirmation_quorum_ratio?: number | null
          created_at?: string
          false_positive_rate_threshold?: number
          id?: number
          is_active?: boolean
          organization_id?: string
          policy_id?: string
          policy_name: string
          rollback_hysteresis_window_hours?: number
          sample_size_min_for_trigger?: number
          segment_overrides?: Json | null
          updated_at?: string
          version_id: string
        }
        Update: {
          confirmation_quorum_ratio?: number | null
          created_at?: string
          false_positive_rate_threshold?: number
          id?: number
          is_active?: boolean
          organization_id?: string
          policy_id?: string
          policy_name?: string
          rollback_hysteresis_window_hours?: number
          sample_size_min_for_trigger?: number
          segment_overrides?: Json | null
          updated_at?: string
          version_id?: string
        }
        Relationships: []
      }
      rpc_audit_log: {
        Row: {
          actor_user_id: string | null
          client_msg_id: string | null
          conversation_id: string | null
          error_code: string | null
          event_id: string
          request_id: string | null
          result: string
          rpc_name: string
          ts: string
        }
        Insert: {
          actor_user_id?: string | null
          client_msg_id?: string | null
          conversation_id?: string | null
          error_code?: string | null
          event_id?: string
          request_id?: string | null
          result: string
          rpc_name: string
          ts?: string
        }
        Update: {
          actor_user_id?: string | null
          client_msg_id?: string | null
          conversation_id?: string | null
          error_code?: string | null
          event_id?: string
          request_id?: string | null
          result?: string
          rpc_name?: string
          ts?: string
        }
        Relationships: []
      }
      saved_collection_items: {
        Row: {
          added_at: string | null
          collection_id: string
          post_id: string
        }
        Insert: {
          added_at?: string | null
          collection_id: string
          post_id: string
        }
        Update: {
          added_at?: string | null
          collection_id?: string
          post_id?: string
        }
        Relationships: [
          {
            foreignKeyName: "saved_collection_items_collection_id_fkey"
            columns: ["collection_id"]
            isOneToOne: false
            referencedRelation: "saved_collections"
            referencedColumns: ["id"]
          },
        ]
      }
      saved_collections: {
        Row: {
          cover_url: string | null
          created_at: string | null
          id: string
          name: string
          user_id: string
        }
        Insert: {
          cover_url?: string | null
          created_at?: string | null
          id?: string
          name: string
          user_id: string
        }
        Update: {
          cover_url?: string | null
          created_at?: string | null
          id?: string
          name?: string
          user_id?: string
        }
        Relationships: []
      }
      saved_messages: {
        Row: {
          conversation_id: string
          id: string
          message_id: string
          note: string | null
          saved_at: string
          tags: string[]
          updated_at: string
          user_id: string
        }
        Insert: {
          conversation_id: string
          id?: string
          message_id: string
          note?: string | null
          saved_at?: string
          tags?: string[]
          updated_at?: string
          user_id: string
        }
        Update: {
          conversation_id?: string
          id?: string
          message_id?: string
          note?: string | null
          saved_at?: string
          tags?: string[]
          updated_at?: string
          user_id?: string
        }
        Relationships: [
          {
            foreignKeyName: "saved_messages_conversation_id_fkey"
            columns: ["conversation_id"]
            isOneToOne: false
            referencedRelation: "conversations"
            referencedColumns: ["id"]
          },
          {
            foreignKeyName: "saved_messages_message_id_fkey"
            columns: ["message_id"]
            isOneToOne: false
            referencedRelation: "messages"
            referencedColumns: ["id"]
          },
        ]
      }
      saved_posts: {
        Row: {
          created_at: string
          id: string
          post_id: string
          user_id: string
        }
        Insert: {
          created_at?: string
          id?: string
          post_id: string
          user_id: string
        }
        Update: {
          created_at?: string
          id?: string
          post_id?: string
          user_id?: string
        }
        Relationships: [
          {
            foreignKeyName: "fk_saved_posts_post"
            columns: ["post_id"]
            isOneToOne: false
            referencedRelation: "posts"
            referencedColumns: ["id"]
          },
        ]
      }
      scheduled_messages: {
        Row: {
          attempt_count: number
          content: string
          conversation_id: string
          created_at: string
          duration_seconds: number | null
          id: string
          last_attempt_at: string | null
          last_error: string | null
          media_type: string | null
          media_url: string | null
          reply_to_message_id: string | null
          scheduled_for: string
          sent_message_id: string | null
          status: string
          thread_root_message_id: string | null
          updated_at: string
          user_id: string
        }
        Insert: {
          attempt_count?: number
          content: string
          conversation_id: string
          created_at?: string
          duration_seconds?: number | null
          id?: string
          last_attempt_at?: string | null
          last_error?: string | null
          media_type?: string | null
          media_url?: string | null
          reply_to_message_id?: string | null
          scheduled_for: string
          sent_message_id?: string | null
          status?: string
          thread_root_message_id?: string | null
          updated_at?: string
          user_id: string
        }
        Update: {
          attempt_count?: number
          content?: string
          conversation_id?: string
          created_at?: string
          duration_seconds?: number | null
          id?: string
          last_attempt_at?: string | null
          last_error?: string | null
          media_type?: string | null
          media_url?: string | null
          reply_to_message_id?: string | null
          scheduled_for?: string
          sent_message_id?: string | null
          status?: string
          thread_root_message_id?: string | null
          updated_at?: string
          user_id?: string
        }
        Relationships: [
          {
            foreignKeyName: "scheduled_messages_conversation_id_fkey"
            columns: ["conversation_id"]
            isOneToOne: false
            referencedRelation: "conversations"
            referencedColumns: ["id"]
          },
          {
            foreignKeyName: "scheduled_messages_reply_to_message_id_fkey"
            columns: ["reply_to_message_id"]
            isOneToOne: false
            referencedRelation: "messages"
            referencedColumns: ["id"]
          },
          {
            foreignKeyName: "scheduled_messages_sent_message_id_fkey"
            columns: ["sent_message_id"]
            isOneToOne: false
            referencedRelation: "messages"
            referencedColumns: ["id"]
          },
          {
            foreignKeyName: "scheduled_messages_thread_root_message_id_fkey"
            columns: ["thread_root_message_id"]
            isOneToOne: false
            referencedRelation: "messages"
            referencedColumns: ["id"]
          },
        ]
      }
      scope_definitions: {
        Row: {
          created_at: string
          description: string | null
          is_delegable: boolean
          risk_level: string
          scope: string
        }
        Insert: {
          created_at?: string
          description?: string | null
          is_delegable?: boolean
          risk_level?: string
          scope: string
        }
        Update: {
          created_at?: string
          description?: string | null
          is_delegable?: boolean
          risk_level?: string
          scope?: string
        }
        Relationships: []
      }
      scope_invites: {
        Row: {
          accepted_at: string | null
          accepted_device_id: string | null
          created_at: string
          expires_at: string
          invite_id: string
          invited_by: string
          invited_user: string
          metadata: Json | null
          policy_hash_at_issue: string
          policy_version_at_issue: number
          scope_id: string
          status: string
          updated_at: string
        }
        Insert: {
          accepted_at?: string | null
          accepted_device_id?: string | null
          created_at?: string
          expires_at: string
          invite_id?: string
          invited_by: string
          invited_user: string
          metadata?: Json | null
          policy_hash_at_issue: string
          policy_version_at_issue: number
          scope_id: string
          status?: string
          updated_at?: string
        }
        Update: {
          accepted_at?: string | null
          accepted_device_id?: string | null
          created_at?: string
          expires_at?: string
          invite_id?: string
          invited_by?: string
          invited_user?: string
          metadata?: Json | null
          policy_hash_at_issue?: string
          policy_version_at_issue?: number
          scope_id?: string
          status?: string
          updated_at?: string
        }
        Relationships: [
          {
            foreignKeyName: "scope_invites_scope_id_fkey"
            columns: ["scope_id"]
            isOneToOne: false
            referencedRelation: "core_scopes"
            referencedColumns: ["scope_id"]
          },
        ]
      }
      search_history: {
        Row: {
          created_at: string | null
          id: string
          query: string
          result_id: string | null
          type: string | null
          user_id: string
        }
        Insert: {
          created_at?: string | null
          id?: string
          query: string
          result_id?: string | null
          type?: string | null
          user_id: string
        }
        Update: {
          created_at?: string | null
          id?: string
          query?: string
          result_id?: string | null
          type?: string | null
          user_id?: string
        }
        Relationships: []
      }
      secret_chats: {
        Row: {
          accepted_at: string | null
          closed_at: string | null
          conversation_id: string
          created_at: string | null
          default_ttl_seconds: number | null
          id: string
          initiator_id: string
          initiator_used_one_time_prekey_public: string | null
          participant_id: string
          screenshot_notifications: boolean | null
          status: string
        }
        Insert: {
          accepted_at?: string | null
          closed_at?: string | null
          conversation_id: string
          created_at?: string | null
          default_ttl_seconds?: number | null
          id?: string
          initiator_id: string
          initiator_used_one_time_prekey_public?: string | null
          participant_id: string
          screenshot_notifications?: boolean | null
          status?: string
        }
        Update: {
          accepted_at?: string | null
          closed_at?: string | null
          conversation_id?: string
          created_at?: string | null
          default_ttl_seconds?: number | null
          id?: string
          initiator_id?: string
          initiator_used_one_time_prekey_public?: string | null
          participant_id?: string
          screenshot_notifications?: boolean | null
          status?: string
        }
        Relationships: []
      }
      sent_gifts: {
        Row: {
          conversation_id: string
          created_at: string | null
          gift_id: string
          id: string
          is_opened: boolean | null
          message_id: string | null
          message_text: string | null
          opened_at: string | null
          recipient_id: string
          sender_id: string
          stars_spent: number
        }
        Insert: {
          conversation_id: string
          created_at?: string | null
          gift_id: string
          id?: string
          is_opened?: boolean | null
          message_id?: string | null
          message_text?: string | null
          opened_at?: string | null
          recipient_id: string
          sender_id: string
          stars_spent: number
        }
        Update: {
          conversation_id?: string
          created_at?: string | null
          gift_id?: string
          id?: string
          is_opened?: boolean | null
          message_id?: string | null
          message_text?: string | null
          opened_at?: string | null
          recipient_id?: string
          sender_id?: string
          stars_spent?: number
        }
        Relationships: [
          {
            foreignKeyName: "sent_gifts_gift_id_fkey"
            columns: ["gift_id"]
            isOneToOne: false
            referencedRelation: "gift_catalog"
            referencedColumns: ["id"]
          },
        ]
      }
      service_bugs: {
        Row: {
          checks: string[]
          created_at: string
          id: string
          root_cause: string
          service: string
          slug: string
          sort_order: number
          status: string
          symptoms: string[]
          tech_notes: string[]
          title: string
          updated_at: string
          workaround: string
        }
        Insert: {
          checks?: string[]
          created_at?: string
          id?: string
          root_cause?: string
          service: string
          slug: string
          sort_order?: number
          status?: string
          symptoms?: string[]
          tech_notes?: string[]
          title: string
          updated_at?: string
          workaround?: string
        }
        Update: {
          checks?: string[]
          created_at?: string
          id?: string
          root_cause?: string
          service?: string
          slug?: string
          sort_order?: number
          status?: string
          symptoms?: string[]
          tech_notes?: string[]
          title?: string
          updated_at?: string
          workaround?: string
        }
        Relationships: []
      }
      service_identities: {
        Row: {
          created_at: string
          service_id: string
          status: string
          tenant_id: string
          updated_at: string
        }
        Insert: {
          created_at?: string
          service_id: string
          status?: string
          tenant_id: string
          updated_at?: string
        }
        Update: {
          created_at?: string
          service_id?: string
          status?: string
          tenant_id?: string
          updated_at?: string
        }
        Relationships: [
          {
            foreignKeyName: "service_identities_tenant_id_fkey"
            columns: ["tenant_id"]
            isOneToOne: false
            referencedRelation: "tenants"
            referencedColumns: ["tenant_id"]
          },
        ]
      }
      service_keys: {
        Row: {
          algorithm: string
          created_at: string
          encryption_key_id: string
          expires_at: string | null
          key_format: string
          key_id: string
          key_material_encrypted: string
          key_type: string
          not_before: string | null
          revoked_at: string | null
          service_id: string
          tenant_id: string
        }
        Insert: {
          algorithm: string
          created_at?: string
          encryption_key_id?: string
          expires_at?: string | null
          key_format?: string
          key_id: string
          key_material_encrypted: string
          key_type: string
          not_before?: string | null
          revoked_at?: string | null
          service_id: string
          tenant_id: string
        }
        Update: {
          algorithm?: string
          created_at?: string
          encryption_key_id?: string
          expires_at?: string | null
          key_format?: string
          key_id?: string
          key_material_encrypted?: string
          key_type?: string
          not_before?: string | null
          revoked_at?: string | null
          service_id?: string
          tenant_id?: string
        }
        Relationships: [
          {
            foreignKeyName: "service_keys_tenant_id_service_id_fkey"
            columns: ["tenant_id", "service_id"]
            isOneToOne: false
            referencedRelation: "service_identities"
            referencedColumns: ["tenant_id", "service_id"]
          },
        ]
      }
      settings_change_audit: {
        Row: {
          created_at: string
          id: string
          payload: Json
          scope: string
          user_id: string
        }
        Insert: {
          created_at?: string
          id?: string
          payload?: Json
          scope: string
          user_id: string
        }
        Update: {
          created_at?: string
          id?: string
          payload?: Json
          scope?: string
          user_id?: string
        }
        Relationships: []
      }
      shared_locations: {
        Row: {
          address: string | null
          created_at: string | null
          id: string
          lat: number
          lng: number
          message_id: string
          name: string | null
          sender_id: string
        }
        Insert: {
          address?: string | null
          created_at?: string | null
          id?: string
          lat: number
          lng: number
          message_id: string
          name?: string | null
          sender_id: string
        }
        Update: {
          address?: string | null
          created_at?: string | null
          id?: string
          lat?: number
          lng?: number
          message_id?: string
          name?: string | null
          sender_id?: string
        }
        Relationships: []
      }
      shop_cart_items: {
        Row: {
          created_at: string | null
          id: string
          product_id: string
          quantity: number | null
          user_id: string
        }
        Insert: {
          created_at?: string | null
          id?: string
          product_id: string
          quantity?: number | null
          user_id: string
        }
        Update: {
          created_at?: string | null
          id?: string
          product_id?: string
          quantity?: number | null
          user_id?: string
        }
        Relationships: [
          {
            foreignKeyName: "shop_cart_items_product_id_fkey"
            columns: ["product_id"]
            isOneToOne: false
            referencedRelation: "shop_products"
            referencedColumns: ["id"]
          },
        ]
      }
      shop_collection_items: {
        Row: {
          collection_id: string
          position: number | null
          product_id: string
          sort_order: number | null
        }
        Insert: {
          collection_id: string
          position?: number | null
          product_id: string
          sort_order?: number | null
        }
        Update: {
          collection_id?: string
          position?: number | null
          product_id?: string
          sort_order?: number | null
        }
        Relationships: [
          {
            foreignKeyName: "fk_collection_items_product"
            columns: ["product_id"]
            isOneToOne: false
            referencedRelation: "shop_products"
            referencedColumns: ["id"]
          },
        ]
      }
      shop_collections: {
        Row: {
          cover_url: string | null
          created_at: string | null
          description: string | null
          id: string
          is_active: boolean | null
          name: string
          position: number | null
          shop_id: string
          sort_order: number | null
        }
        Insert: {
          cover_url?: string | null
          created_at?: string | null
          description?: string | null
          id?: string
          is_active?: boolean | null
          name: string
          position?: number | null
          shop_id: string
          sort_order?: number | null
        }
        Update: {
          cover_url?: string | null
          created_at?: string | null
          description?: string | null
          id?: string
          is_active?: boolean | null
          name?: string
          position?: number | null
          shop_id?: string
          sort_order?: number | null
        }
        Relationships: [
          {
            foreignKeyName: "fk_shop_collections_shop"
            columns: ["shop_id"]
            isOneToOne: false
            referencedRelation: "shops"
            referencedColumns: ["id"]
          },
        ]
      }
      shop_order_items: {
        Row: {
          created_at: string | null
          id: string
          order_id: string
          price: number
          product_id: string
          quantity: number | null
        }
        Insert: {
          created_at?: string | null
          id?: string
          order_id: string
          price: number
          product_id: string
          quantity?: number | null
        }
        Update: {
          created_at?: string | null
          id?: string
          order_id?: string
          price?: number
          product_id?: string
          quantity?: number | null
        }
        Relationships: [
          {
            foreignKeyName: "shop_order_items_order_id_fkey"
            columns: ["order_id"]
            isOneToOne: false
            referencedRelation: "shop_orders"
            referencedColumns: ["id"]
          },
          {
            foreignKeyName: "shop_order_items_product_id_fkey"
            columns: ["product_id"]
            isOneToOne: false
            referencedRelation: "shop_products"
            referencedColumns: ["id"]
          },
        ]
      }
      shop_orders: {
        Row: {
          buyer_id: string
          created_at: string | null
          currency: string | null
          id: string
          shipping_address: Json | null
          shop_id: string
          status: string | null
          total_amount: number
          updated_at: string | null
        }
        Insert: {
          buyer_id: string
          created_at?: string | null
          currency?: string | null
          id?: string
          shipping_address?: Json | null
          shop_id: string
          status?: string | null
          total_amount: number
          updated_at?: string | null
        }
        Update: {
          buyer_id?: string
          created_at?: string | null
          currency?: string | null
          id?: string
          shipping_address?: Json | null
          shop_id?: string
          status?: string | null
          total_amount?: number
          updated_at?: string | null
        }
        Relationships: [
          {
            foreignKeyName: "shop_orders_shop_id_fkey"
            columns: ["shop_id"]
            isOneToOne: false
            referencedRelation: "shops"
            referencedColumns: ["id"]
          },
        ]
      }
      shop_products: {
        Row: {
          category: string | null
          created_at: string
          currency: string | null
          description: string | null
          id: string
          images: Json | null
          in_stock: boolean | null
          name: string
          price: number
          shop_id: string
        }
        Insert: {
          category?: string | null
          created_at?: string
          currency?: string | null
          description?: string | null
          id?: string
          images?: Json | null
          in_stock?: boolean | null
          name: string
          price: number
          shop_id: string
        }
        Update: {
          category?: string | null
          created_at?: string
          currency?: string | null
          description?: string | null
          id?: string
          images?: Json | null
          in_stock?: boolean | null
          name?: string
          price?: number
          shop_id?: string
        }
        Relationships: [
          {
            foreignKeyName: "shop_products_shop_id_fkey"
            columns: ["shop_id"]
            isOneToOne: false
            referencedRelation: "shops"
            referencedColumns: ["id"]
          },
        ]
      }
      shops: {
        Row: {
          created_at: string
          description: string | null
          id: string
          is_active: boolean | null
          logo_url: string | null
          name: string
          owner_id: string
        }
        Insert: {
          created_at?: string
          description?: string | null
          id?: string
          is_active?: boolean | null
          logo_url?: string | null
          name: string
          owner_id: string
        }
        Update: {
          created_at?: string
          description?: string | null
          id?: string
          is_active?: boolean | null
          logo_url?: string | null
          name?: string
          owner_id?: string
        }
        Relationships: []
      }
      similar_users: {
        Row: {
          computed_at: string | null
          similar_user_id: string
          similarity_score: number
          user_id: string
        }
        Insert: {
          computed_at?: string | null
          similar_user_id: string
          similarity_score?: number
          user_id: string
        }
        Update: {
          computed_at?: string | null
          similar_user_id?: string
          similarity_score?: number
          user_id?: string
        }
        Relationships: []
      }
      snapshot_content_hashes: {
        Row: {
          algorithm_version: string
          content_hash: string
          created_at: string
          id: number
          input_context_hash: string
          snapshot_id: string
          source_event_ids: string[]
        }
        Insert: {
          algorithm_version: string
          content_hash: string
          created_at?: string
          id?: number
          input_context_hash: string
          snapshot_id: string
          source_event_ids: string[]
        }
        Update: {
          algorithm_version?: string
          content_hash?: string
          created_at?: string
          id?: number
          input_context_hash?: string
          snapshot_id?: string
          source_event_ids?: string[]
        }
        Relationships: [
          {
            foreignKeyName: "snapshot_content_hashes_snapshot_id_fkey"
            columns: ["snapshot_id"]
            isOneToOne: false
            referencedRelation: "decision_snapshots"
            referencedColumns: ["snapshot_id"]
          },
        ]
      }
      spam_indicators: {
        Row: {
          confidence: number
          created_at: string
          evidence: Json
          id: number
          indicator_id: string
          indicator_type: string
          severity: string
          source: string | null
          source_user_id: string | null
          user_id: string
        }
        Insert: {
          confidence: number
          created_at?: string
          evidence: Json
          id?: number
          indicator_id?: string
          indicator_type: string
          severity: string
          source?: string | null
          source_user_id?: string | null
          user_id: string
        }
        Update: {
          confidence?: number
          created_at?: string
          evidence?: Json
          id?: number
          indicator_id?: string
          indicator_type?: string
          severity?: string
          source?: string | null
          source_user_id?: string | null
          user_id?: string
        }
        Relationships: []
      }
      spatial_ref_sys: {
        Row: {
          auth_name: string | null
          auth_srid: number | null
          proj4text: string | null
          srid: number
          srtext: string | null
        }
        Insert: {
          auth_name?: string | null
          auth_srid?: number | null
          proj4text?: string | null
          srid: number
          srtext?: string | null
        }
        Update: {
          auth_name?: string | null
          auth_srid?: number | null
          proj4text?: string | null
          srid?: number
          srtext?: string | null
        }
        Relationships: []
      }
      star_reactions: {
        Row: {
          created_at: string | null
          emoji: string
          id: string
          message_id: string
          stars_amount: number
          user_id: string
        }
        Insert: {
          created_at?: string | null
          emoji?: string
          id?: string
          message_id: string
          stars_amount: number
          user_id: string
        }
        Update: {
          created_at?: string | null
          emoji?: string
          id?: string
          message_id?: string
          stars_amount?: number
          user_id?: string
        }
        Relationships: []
      }
      star_transactions: {
        Row: {
          amount: number
          created_at: string | null
          description: string | null
          id: string
          related_gift_id: string | null
          related_message_id: string | null
          related_user_id: string | null
          type: string
          user_id: string
        }
        Insert: {
          amount: number
          created_at?: string | null
          description?: string | null
          id?: string
          related_gift_id?: string | null
          related_message_id?: string | null
          related_user_id?: string | null
          type: string
          user_id: string
        }
        Update: {
          amount?: number
          created_at?: string | null
          description?: string | null
          id?: string
          related_gift_id?: string | null
          related_message_id?: string | null
          related_user_id?: string | null
          type?: string
          user_id?: string
        }
        Relationships: [
          {
            foreignKeyName: "star_transactions_related_gift_id_fkey"
            columns: ["related_gift_id"]
            isOneToOne: false
            referencedRelation: "gift_catalog"
            referencedColumns: ["id"]
          },
        ]
      }
      sticker_items: {
        Row: {
          asset_path: string
          created_at: string
          emoji_alias: string | null
          id: string
          keywords: string[]
          pack_id: string
          preview_path: string | null
          sort_order: number
          status: string
          updated_at: string
        }
        Insert: {
          asset_path: string
          created_at?: string
          emoji_alias?: string | null
          id?: string
          keywords?: string[]
          pack_id: string
          preview_path?: string | null
          sort_order?: number
          status?: string
          updated_at?: string
        }
        Update: {
          asset_path?: string
          created_at?: string
          emoji_alias?: string | null
          id?: string
          keywords?: string[]
          pack_id?: string
          preview_path?: string | null
          sort_order?: number
          status?: string
          updated_at?: string
        }
        Relationships: [
          {
            foreignKeyName: "sticker_items_pack_id_fkey"
            columns: ["pack_id"]
            isOneToOne: false
            referencedRelation: "sticker_packs"
            referencedColumns: ["id"]
          },
        ]
      }
      sticker_packs: {
        Row: {
          author_id: string | null
          cover_asset_path: string | null
          created_at: string
          id: string
          install_count: number | null
          is_active: boolean
          is_animated: boolean
          is_business: boolean
          is_official: boolean | null
          is_premium: boolean
          item_count: number
          name: string
          owner_user_id: string | null
          slug: string | null
          sort_order: number
          source_type: string
          sticker_count: number | null
          thumbnail_url: string | null
          title: string
          updated_at: string
          visibility_status: string
        }
        Insert: {
          author_id?: string | null
          cover_asset_path?: string | null
          created_at?: string
          id?: string
          install_count?: number | null
          is_active?: boolean
          is_animated?: boolean
          is_business?: boolean
          is_official?: boolean | null
          is_premium?: boolean
          item_count?: number
          name: string
          owner_user_id?: string | null
          slug?: string | null
          sort_order?: number
          source_type?: string
          sticker_count?: number | null
          thumbnail_url?: string | null
          title: string
          updated_at?: string
          visibility_status?: string
        }
        Update: {
          author_id?: string | null
          cover_asset_path?: string | null
          created_at?: string
          id?: string
          install_count?: number | null
          is_active?: boolean
          is_animated?: boolean
          is_business?: boolean
          is_official?: boolean | null
          is_premium?: boolean
          item_count?: number
          name?: string
          owner_user_id?: string | null
          slug?: string | null
          sort_order?: number
          source_type?: string
          sticker_count?: number | null
          thumbnail_url?: string | null
          title?: string
          updated_at?: string
          visibility_status?: string
        }
        Relationships: []
      }
      stickers: {
        Row: {
          created_at: string | null
          emoji: string | null
          file_type: string
          file_url: string
          height: number | null
          id: string
          pack_id: string
          position: number | null
          width: number | null
        }
        Insert: {
          created_at?: string | null
          emoji?: string | null
          file_type?: string
          file_url: string
          height?: number | null
          id?: string
          pack_id: string
          position?: number | null
          width?: number | null
        }
        Update: {
          created_at?: string | null
          emoji?: string | null
          file_type?: string
          file_url?: string
          height?: number | null
          id?: string
          pack_id?: string
          position?: number | null
          width?: number | null
        }
        Relationships: [
          {
            foreignKeyName: "stickers_pack_id_fkey"
            columns: ["pack_id"]
            isOneToOne: false
            referencedRelation: "sticker_packs"
            referencedColumns: ["id"]
          },
        ]
      }
      stories: {
        Row: {
          author_id: string
          caption: string | null
          close_friends_only: boolean
          created_at: string
          expires_at: string
          id: string
          link_text: string | null
          link_url: string | null
          media_type: string
          media_url: string
        }
        Insert: {
          author_id: string
          caption?: string | null
          close_friends_only?: boolean
          created_at?: string
          expires_at?: string
          id?: string
          link_text?: string | null
          link_url?: string | null
          media_type?: string
          media_url: string
        }
        Update: {
          author_id?: string
          caption?: string | null
          close_friends_only?: boolean
          created_at?: string
          expires_at?: string
          id?: string
          link_text?: string | null
          link_url?: string | null
          media_type?: string
          media_url?: string
        }
        Relationships: []
      }
      story_countdown_subscribers: {
        Row: {
          countdown_id: string
          created_at: string
          id: string
          user_id: string
        }
        Insert: {
          countdown_id: string
          created_at?: string
          id?: string
          user_id: string
        }
        Update: {
          countdown_id?: string
          created_at?: string
          id?: string
          user_id?: string
        }
        Relationships: [
          {
            foreignKeyName: "story_countdown_subscribers_countdown_id_fkey"
            columns: ["countdown_id"]
            isOneToOne: false
            referencedRelation: "story_countdowns"
            referencedColumns: ["id"]
          },
        ]
      }
      story_countdowns: {
        Row: {
          created_at: string
          end_time: string
          id: string
          story_id: string
          title: string
        }
        Insert: {
          created_at?: string
          end_time: string
          id?: string
          story_id: string
          title: string
        }
        Update: {
          created_at?: string
          end_time?: string
          id?: string
          story_id?: string
          title?: string
        }
        Relationships: []
      }
      story_emoji_slider_votes: {
        Row: {
          created_at: string | null
          slider_id: string
          user_id: string
          value: number
        }
        Insert: {
          created_at?: string | null
          slider_id: string
          user_id: string
          value?: number
        }
        Update: {
          created_at?: string | null
          slider_id?: string
          user_id?: string
          value?: number
        }
        Relationships: [
          {
            foreignKeyName: "story_emoji_slider_votes_slider_id_fkey"
            columns: ["slider_id"]
            isOneToOne: false
            referencedRelation: "story_emoji_sliders"
            referencedColumns: ["id"]
          },
        ]
      }
      story_emoji_sliders: {
        Row: {
          created_at: string | null
          emoji: string
          id: string
          prompt: string | null
          story_id: string
        }
        Insert: {
          created_at?: string | null
          emoji?: string
          id?: string
          prompt?: string | null
          story_id: string
        }
        Update: {
          created_at?: string | null
          emoji?: string
          id?: string
          prompt?: string | null
          story_id?: string
        }
        Relationships: []
      }
      story_highlights: {
        Row: {
          cover_url: string
          created_at: string
          id: string
          is_visible: boolean
          position: number
          privacy_level: string
          title: string
          updated_at: string
          user_id: string
        }
        Insert: {
          cover_url: string
          created_at?: string
          id?: string
          is_visible?: boolean
          position?: number
          privacy_level?: string
          title: string
          updated_at?: string
          user_id: string
        }
        Update: {
          cover_url?: string
          created_at?: string
          id?: string
          is_visible?: boolean
          position?: number
          privacy_level?: string
          title?: string
          updated_at?: string
          user_id?: string
        }
        Relationships: []
      }
      story_music: {
        Row: {
          created_at: string
          duration_seconds: number | null
          id: string
          start_time_seconds: number | null
          story_id: string
          track_id: string
        }
        Insert: {
          created_at?: string
          duration_seconds?: number | null
          id?: string
          start_time_seconds?: number | null
          story_id: string
          track_id: string
        }
        Update: {
          created_at?: string
          duration_seconds?: number | null
          id?: string
          start_time_seconds?: number | null
          story_id?: string
          track_id?: string
        }
        Relationships: [
          {
            foreignKeyName: "story_music_track_id_fkey"
            columns: ["track_id"]
            isOneToOne: false
            referencedRelation: "music_tracks"
            referencedColumns: ["id"]
          },
        ]
      }
      story_poll_votes: {
        Row: {
          created_at: string
          id: string
          option_index: number
          poll_id: string
          slider_value: number | null
          user_id: string
        }
        Insert: {
          created_at?: string
          id?: string
          option_index: number
          poll_id: string
          slider_value?: number | null
          user_id: string
        }
        Update: {
          created_at?: string
          id?: string
          option_index?: number
          poll_id?: string
          slider_value?: number | null
          user_id?: string
        }
        Relationships: [
          {
            foreignKeyName: "story_poll_votes_poll_id_fkey"
            columns: ["poll_id"]
            isOneToOne: false
            referencedRelation: "story_polls"
            referencedColumns: ["id"]
          },
        ]
      }
      story_polls: {
        Row: {
          allow_multiple: boolean | null
          correct_option_index: number | null
          created_at: string
          id: string
          options: Json
          poll_type: string
          question: string
          story_id: string
        }
        Insert: {
          allow_multiple?: boolean | null
          correct_option_index?: number | null
          created_at?: string
          id?: string
          options?: Json
          poll_type?: string
          question: string
          story_id: string
        }
        Update: {
          allow_multiple?: boolean | null
          correct_option_index?: number | null
          created_at?: string
          id?: string
          options?: Json
          poll_type?: string
          question?: string
          story_id?: string
        }
        Relationships: []
      }
      story_question_answers: {
        Row: {
          answer_text: string
          created_at: string
          id: string
          question_id: string
          user_id: string
        }
        Insert: {
          answer_text: string
          created_at?: string
          id?: string
          question_id: string
          user_id: string
        }
        Update: {
          answer_text?: string
          created_at?: string
          id?: string
          question_id?: string
          user_id?: string
        }
        Relationships: [
          {
            foreignKeyName: "story_question_answers_question_id_fkey"
            columns: ["question_id"]
            isOneToOne: false
            referencedRelation: "story_questions"
            referencedColumns: ["id"]
          },
        ]
      }
      story_questions: {
        Row: {
          created_at: string
          id: string
          is_anonymous: boolean | null
          question_text: string
          story_id: string
        }
        Insert: {
          created_at?: string
          id?: string
          is_anonymous?: boolean | null
          question_text: string
          story_id: string
        }
        Update: {
          created_at?: string
          id?: string
          is_anonymous?: boolean | null
          question_text?: string
          story_id?: string
        }
        Relationships: []
      }
      story_quiz_answers: {
        Row: {
          created_at: string | null
          quiz_id: string
          selected_index: number
          user_id: string
        }
        Insert: {
          created_at?: string | null
          quiz_id: string
          selected_index: number
          user_id: string
        }
        Update: {
          created_at?: string | null
          quiz_id?: string
          selected_index?: number
          user_id?: string
        }
        Relationships: [
          {
            foreignKeyName: "story_quiz_answers_quiz_id_fkey"
            columns: ["quiz_id"]
            isOneToOne: false
            referencedRelation: "story_quizzes"
            referencedColumns: ["id"]
          },
        ]
      }
      story_quizzes: {
        Row: {
          correct_index: number | null
          created_at: string | null
          id: string
          options: Json
          question: string
          story_id: string
        }
        Insert: {
          correct_index?: number | null
          created_at?: string | null
          id?: string
          options?: Json
          question: string
          story_id: string
        }
        Update: {
          correct_index?: number | null
          created_at?: string | null
          id?: string
          options?: Json
          question?: string
          story_id?: string
        }
        Relationships: []
      }
      story_reactions: {
        Row: {
          created_at: string
          id: string
          reaction_type: string
          story_id: string
          user_id: string
        }
        Insert: {
          created_at?: string
          id?: string
          reaction_type?: string
          story_id: string
          user_id: string
        }
        Update: {
          created_at?: string
          id?: string
          reaction_type?: string
          story_id?: string
          user_id?: string
        }
        Relationships: []
      }
      story_replies: {
        Row: {
          created_at: string
          id: string
          message: string
          recipient_id: string
          sender_id: string
          story_id: string
        }
        Insert: {
          created_at?: string
          id?: string
          message: string
          recipient_id: string
          sender_id: string
          story_id: string
        }
        Update: {
          created_at?: string
          id?: string
          message?: string
          recipient_id?: string
          sender_id?: string
          story_id?: string
        }
        Relationships: []
      }
      story_segments: {
        Row: {
          asset_id: string | null
          created_at: string
          end_tick: number
          id: string
          segment_index: number
          start_tick: number
          story_id: string
        }
        Insert: {
          asset_id?: string | null
          created_at?: string
          end_tick: number
          id?: string
          segment_index: number
          start_tick: number
          story_id: string
        }
        Update: {
          asset_id?: string | null
          created_at?: string
          end_tick?: number
          id?: string
          segment_index?: number
          start_tick?: number
          story_id?: string
        }
        Relationships: [
          {
            foreignKeyName: "story_segments_asset_id_fkey"
            columns: ["asset_id"]
            isOneToOne: false
            referencedRelation: "assets"
            referencedColumns: ["id"]
          },
          {
            foreignKeyName: "story_segments_story_id_fkey"
            columns: ["story_id"]
            isOneToOne: false
            referencedRelation: "stories"
            referencedColumns: ["id"]
          },
        ]
      }
      story_stickers: {
        Row: {
          created_at: string | null
          data: Json
          id: string
          position_x: number | null
          position_y: number | null
          rotation: number | null
          scale: number | null
          story_id: string
          type: string
        }
        Insert: {
          created_at?: string | null
          data?: Json
          id?: string
          position_x?: number | null
          position_y?: number | null
          rotation?: number | null
          scale?: number | null
          story_id: string
          type: string
        }
        Update: {
          created_at?: string | null
          data?: Json
          id?: string
          position_x?: number | null
          position_y?: number | null
          rotation?: number | null
          scale?: number | null
          story_id?: string
          type?: string
        }
        Relationships: []
      }
      story_views: {
        Row: {
          id: string
          story_id: string
          viewed_at: string
          viewer_id: string
        }
        Insert: {
          id?: string
          story_id: string
          viewed_at?: string
          viewer_id: string
        }
        Update: {
          id?: string
          story_id?: string
          viewed_at?: string
          viewer_id?: string
        }
        Relationships: [
          {
            foreignKeyName: "story_views_story_id_fkey"
            columns: ["story_id"]
            isOneToOne: false
            referencedRelation: "stories"
            referencedColumns: ["id"]
          },
        ]
      }
      supergroup_member_permissions: {
        Row: {
          can_send_links: boolean
          can_send_media: boolean
          can_send_messages: boolean
          conversation_id: string
          created_at: string
          muted_until: string | null
          updated_at: string
          user_id: string
        }
        Insert: {
          can_send_links?: boolean
          can_send_media?: boolean
          can_send_messages?: boolean
          conversation_id: string
          created_at?: string
          muted_until?: string | null
          updated_at?: string
          user_id: string
        }
        Update: {
          can_send_links?: boolean
          can_send_media?: boolean
          can_send_messages?: boolean
          conversation_id?: string
          created_at?: string
          muted_until?: string | null
          updated_at?: string
          user_id?: string
        }
        Relationships: [
          {
            foreignKeyName: "supergroup_member_permissions_conversation_id_fkey"
            columns: ["conversation_id"]
            isOneToOne: false
            referencedRelation: "conversations"
            referencedColumns: ["id"]
          },
        ]
      }
      supergroup_settings: {
        Row: {
          conversation_id: string
          created_at: string
          default_member_can_send_links: boolean
          default_member_can_send_media: boolean
          default_member_can_send_messages: boolean
          forum_mode: boolean
          history_visible_to_new_members: boolean
          join_by_link: boolean
          join_request_required: boolean
          linked_channel_id: string | null
          max_members: number
          messages_ttl: number
          slow_mode_seconds: number
          updated_at: string
        }
        Insert: {
          conversation_id: string
          created_at?: string
          default_member_can_send_links?: boolean
          default_member_can_send_media?: boolean
          default_member_can_send_messages?: boolean
          forum_mode?: boolean
          history_visible_to_new_members?: boolean
          join_by_link?: boolean
          join_request_required?: boolean
          linked_channel_id?: string | null
          max_members?: number
          messages_ttl?: number
          slow_mode_seconds?: number
          updated_at?: string
        }
        Update: {
          conversation_id?: string
          created_at?: string
          default_member_can_send_links?: boolean
          default_member_can_send_media?: boolean
          default_member_can_send_messages?: boolean
          forum_mode?: boolean
          history_visible_to_new_members?: boolean
          join_by_link?: boolean
          join_request_required?: boolean
          linked_channel_id?: string | null
          max_members?: number
          messages_ttl?: number
          slow_mode_seconds?: number
          updated_at?: string
        }
        Relationships: [
          {
            foreignKeyName: "supergroup_settings_conversation_id_fkey"
            columns: ["conversation_id"]
            isOneToOne: true
            referencedRelation: "conversations"
            referencedColumns: ["id"]
          },
          {
            foreignKeyName: "supergroup_settings_linked_channel_id_fkey"
            columns: ["linked_channel_id"]
            isOneToOne: false
            referencedRelation: "conversations"
            referencedColumns: ["id"]
          },
        ]
      }
      taxi_complaints: {
        Row: {
          created_at: string
          description: string | null
          id: string
          photos: Json | null
          resolution: string | null
          resolved_at: string | null
          ride_id: string
          status: string | null
          type: string
          user_id: string
        }
        Insert: {
          created_at?: string
          description?: string | null
          id?: string
          photos?: Json | null
          resolution?: string | null
          resolved_at?: string | null
          ride_id: string
          status?: string | null
          type: string
          user_id: string
        }
        Update: {
          created_at?: string
          description?: string | null
          id?: string
          photos?: Json | null
          resolution?: string | null
          resolved_at?: string | null
          ride_id?: string
          status?: string | null
          type?: string
          user_id?: string
        }
        Relationships: []
      }
      taxi_driver_locations: {
        Row: {
          driver_id: string
          heading: number
          lat: number
          lng: number
          updated_at: string
        }
        Insert: {
          driver_id: string
          heading?: number
          lat: number
          lng: number
          updated_at?: string
        }
        Update: {
          driver_id?: string
          heading?: number
          lat?: number
          lng?: number
          updated_at?: string
        }
        Relationships: [
          {
            foreignKeyName: "taxi_driver_locations_driver_id_fkey"
            columns: ["driver_id"]
            isOneToOne: true
            referencedRelation: "taxi_drivers"
            referencedColumns: ["id"]
          },
        ]
      }
      taxi_driver_ratings: {
        Row: {
          comment: string | null
          created_at: string
          driver_id: string
          id: string
          order_id: string
          passenger_id: string
          rating: number
        }
        Insert: {
          comment?: string | null
          created_at?: string
          driver_id: string
          id?: string
          order_id: string
          passenger_id: string
          rating: number
        }
        Update: {
          comment?: string | null
          created_at?: string
          driver_id?: string
          id?: string
          order_id?: string
          passenger_id?: string
          rating?: number
        }
        Relationships: [
          {
            foreignKeyName: "taxi_driver_ratings_driver_id_fkey"
            columns: ["driver_id"]
            isOneToOne: false
            referencedRelation: "taxi_drivers"
            referencedColumns: ["id"]
          },
          {
            foreignKeyName: "taxi_driver_ratings_order_id_fkey"
            columns: ["order_id"]
            isOneToOne: false
            referencedRelation: "taxi_rides"
            referencedColumns: ["id"]
          },
        ]
      }
      taxi_drivers: {
        Row: {
          acceptance_rate: number
          car_class: Database["public"]["Enums"]["taxi_vehicle_class"]
          car_color: string
          car_make: string
          car_model: string
          car_plate_number: string
          car_year: number
          created_at: string
          id: string
          name: string
          online_at: string | null
          phone: string
          photo: string | null
          rating: number
          shift_earnings: number
          shift_trips: number
          status: Database["public"]["Enums"]["taxi_driver_status"]
          trips_count: number
          updated_at: string
          user_id: string
          years_on_platform: number
        }
        Insert: {
          acceptance_rate?: number
          car_class: Database["public"]["Enums"]["taxi_vehicle_class"]
          car_color: string
          car_make: string
          car_model: string
          car_plate_number: string
          car_year: number
          created_at?: string
          id?: string
          name: string
          online_at?: string | null
          phone: string
          photo?: string | null
          rating?: number
          shift_earnings?: number
          shift_trips?: number
          status?: Database["public"]["Enums"]["taxi_driver_status"]
          trips_count?: number
          updated_at?: string
          user_id: string
          years_on_platform?: number
        }
        Update: {
          acceptance_rate?: number
          car_class?: Database["public"]["Enums"]["taxi_vehicle_class"]
          car_color?: string
          car_make?: string
          car_model?: string
          car_plate_number?: string
          car_year?: number
          created_at?: string
          id?: string
          name?: string
          online_at?: string | null
          phone?: string
          photo?: string | null
          rating?: number
          shift_earnings?: number
          shift_trips?: number
          status?: Database["public"]["Enums"]["taxi_driver_status"]
          trips_count?: number
          updated_at?: string
          user_id?: string
          years_on_platform?: number
        }
        Relationships: []
      }
      taxi_ratings: {
        Row: {
          comment: string | null
          created_at: string
          id: string
          ratee_id: string
          rater_id: string
          rater_role: string
          rating: number
          ride_id: string
        }
        Insert: {
          comment?: string | null
          created_at?: string
          id?: string
          ratee_id: string
          rater_id: string
          rater_role: string
          rating: number
          ride_id: string
        }
        Update: {
          comment?: string | null
          created_at?: string
          id?: string
          ratee_id?: string
          rater_id?: string
          rater_role?: string
          rating?: number
          ride_id?: string
        }
        Relationships: [
          {
            foreignKeyName: "taxi_ratings_ride_id_fkey"
            columns: ["ride_id"]
            isOneToOne: false
            referencedRelation: "taxi_rides"
            referencedColumns: ["id"]
          },
        ]
      }
      taxi_rides: {
        Row: {
          arrived_at: string | null
          assigned_driver_id: string | null
          cancellation_reason:
            | Database["public"]["Enums"]["taxi_cancellation_reason"]
            | null
          cancelled_at: string | null
          cancelled_by: string | null
          completed_at: string | null
          created_at: string
          destination_address: string
          destination_lat: number
          destination_lng: number
          discount: number | null
          driver_id: string | null
          estimated_distance: number
          estimated_duration: number
          estimated_price: number
          final_price: number | null
          id: string
          last_rejected_driver_id: string | null
          passenger_cancellation_count: number | null
          passenger_id: string
          passenger_name: string | null
          passenger_rating: number | null
          payment_method: Database["public"]["Enums"]["taxi_payment_method"]
          pickup_address: string
          pickup_lat: number
          pickup_lng: number
          pin_code: string
          promo_code: string | null
          status: Database["public"]["Enums"]["taxi_ride_status"]
          tariff: Database["public"]["Enums"]["taxi_vehicle_class"]
          trip_conversation_id: string | null
          trip_started_at: string | null
          waiting_charge: number | null
        }
        Insert: {
          arrived_at?: string | null
          assigned_driver_id?: string | null
          cancellation_reason?:
            | Database["public"]["Enums"]["taxi_cancellation_reason"]
            | null
          cancelled_at?: string | null
          cancelled_by?: string | null
          completed_at?: string | null
          created_at?: string
          destination_address: string
          destination_lat: number
          destination_lng: number
          discount?: number | null
          driver_id?: string | null
          estimated_distance: number
          estimated_duration: number
          estimated_price: number
          final_price?: number | null
          id?: string
          last_rejected_driver_id?: string | null
          passenger_cancellation_count?: number | null
          passenger_id: string
          passenger_name?: string | null
          passenger_rating?: number | null
          payment_method?: Database["public"]["Enums"]["taxi_payment_method"]
          pickup_address: string
          pickup_lat: number
          pickup_lng: number
          pin_code: string
          promo_code?: string | null
          status?: Database["public"]["Enums"]["taxi_ride_status"]
          tariff: Database["public"]["Enums"]["taxi_vehicle_class"]
          trip_conversation_id?: string | null
          trip_started_at?: string | null
          waiting_charge?: number | null
        }
        Update: {
          arrived_at?: string | null
          assigned_driver_id?: string | null
          cancellation_reason?:
            | Database["public"]["Enums"]["taxi_cancellation_reason"]
            | null
          cancelled_at?: string | null
          cancelled_by?: string | null
          completed_at?: string | null
          created_at?: string
          destination_address?: string
          destination_lat?: number
          destination_lng?: number
          discount?: number | null
          driver_id?: string | null
          estimated_distance?: number
          estimated_duration?: number
          estimated_price?: number
          final_price?: number | null
          id?: string
          last_rejected_driver_id?: string | null
          passenger_cancellation_count?: number | null
          passenger_id?: string
          passenger_name?: string | null
          passenger_rating?: number | null
          payment_method?: Database["public"]["Enums"]["taxi_payment_method"]
          pickup_address?: string
          pickup_lat?: number
          pickup_lng?: number
          pin_code?: string
          promo_code?: string | null
          status?: Database["public"]["Enums"]["taxi_ride_status"]
          tariff?: Database["public"]["Enums"]["taxi_vehicle_class"]
          trip_conversation_id?: string | null
          trip_started_at?: string | null
          waiting_charge?: number | null
        }
        Relationships: [
          {
            foreignKeyName: "taxi_rides_assigned_driver_id_fkey"
            columns: ["assigned_driver_id"]
            isOneToOne: false
            referencedRelation: "taxi_drivers"
            referencedColumns: ["id"]
          },
          {
            foreignKeyName: "taxi_rides_driver_id_fkey"
            columns: ["driver_id"]
            isOneToOne: false
            referencedRelation: "taxi_drivers"
            referencedColumns: ["id"]
          },
          {
            foreignKeyName: "taxi_rides_last_rejected_driver_id_fkey"
            columns: ["last_rejected_driver_id"]
            isOneToOne: false
            referencedRelation: "taxi_drivers"
            referencedColumns: ["id"]
          },
        ]
      }
      taxi_scheduled_rides: {
        Row: {
          created_at: string
          destination_address: string
          destination_lat: number
          destination_lng: number
          estimated_price: number
          id: string
          passenger_id: string
          payment_method: Database["public"]["Enums"]["taxi_payment_method"]
          pickup_address: string
          pickup_lat: number
          pickup_lng: number
          ride_id: string | null
          scheduled_at: string
          status: string
          tariff: Database["public"]["Enums"]["taxi_vehicle_class"]
        }
        Insert: {
          created_at?: string
          destination_address: string
          destination_lat: number
          destination_lng: number
          estimated_price: number
          id?: string
          passenger_id: string
          payment_method?: Database["public"]["Enums"]["taxi_payment_method"]
          pickup_address: string
          pickup_lat: number
          pickup_lng: number
          ride_id?: string | null
          scheduled_at: string
          status?: string
          tariff: Database["public"]["Enums"]["taxi_vehicle_class"]
        }
        Update: {
          created_at?: string
          destination_address?: string
          destination_lat?: number
          destination_lng?: number
          estimated_price?: number
          id?: string
          passenger_id?: string
          payment_method?: Database["public"]["Enums"]["taxi_payment_method"]
          pickup_address?: string
          pickup_lat?: number
          pickup_lng?: number
          ride_id?: string | null
          scheduled_at?: string
          status?: string
          tariff?: Database["public"]["Enums"]["taxi_vehicle_class"]
        }
        Relationships: [
          {
            foreignKeyName: "taxi_scheduled_rides_ride_id_fkey"
            columns: ["ride_id"]
            isOneToOne: false
            referencedRelation: "taxi_rides"
            referencedColumns: ["id"]
          },
        ]
      }
      taxi_surge_cache: {
        Row: {
          active_orders: number | null
          available_drivers: number | null
          multiplier: number
          reason: string | null
          updated_at: string
          zone_id: string
        }
        Insert: {
          active_orders?: number | null
          available_drivers?: number | null
          multiplier?: number
          reason?: string | null
          updated_at?: string
          zone_id: string
        }
        Update: {
          active_orders?: number | null
          available_drivers?: number | null
          multiplier?: number
          reason?: string | null
          updated_at?: string
          zone_id?: string
        }
        Relationships: []
      }
      telemetry_events: {
        Row: {
          content_id: string | null
          created_at: string
          dedupe_bucket_date: string
          dedupe_key: string
          event_id: string
          event_name: string
          event_time: string
          payload: Json
          user_id: string | null
        }
        Insert: {
          content_id?: string | null
          created_at?: string
          dedupe_bucket_date: string
          dedupe_key: string
          event_id?: string
          event_name: string
          event_time: string
          payload?: Json
          user_id?: string | null
        }
        Update: {
          content_id?: string | null
          created_at?: string
          dedupe_bucket_date?: string
          dedupe_key?: string
          event_id?: string
          event_name?: string
          event_time?: string
          payload?: Json
          user_id?: string | null
        }
        Relationships: []
      }
      telemetry_events_2026_h1: {
        Row: {
          content_id: string | null
          created_at: string
          dedupe_bucket_date: string
          dedupe_key: string
          event_id: string
          event_name: string
          event_time: string
          payload: Json
          user_id: string | null
        }
        Insert: {
          content_id?: string | null
          created_at?: string
          dedupe_bucket_date: string
          dedupe_key: string
          event_id?: string
          event_name: string
          event_time: string
          payload?: Json
          user_id?: string | null
        }
        Update: {
          content_id?: string | null
          created_at?: string
          dedupe_bucket_date?: string
          dedupe_key?: string
          event_id?: string
          event_name?: string
          event_time?: string
          payload?: Json
          user_id?: string | null
        }
        Relationships: []
      }
      telemetry_events_2026_h2: {
        Row: {
          content_id: string | null
          created_at: string
          dedupe_bucket_date: string
          dedupe_key: string
          event_id: string
          event_name: string
          event_time: string
          payload: Json
          user_id: string | null
        }
        Insert: {
          content_id?: string | null
          created_at?: string
          dedupe_bucket_date: string
          dedupe_key: string
          event_id?: string
          event_name: string
          event_time: string
          payload?: Json
          user_id?: string | null
        }
        Update: {
          content_id?: string | null
          created_at?: string
          dedupe_bucket_date?: string
          dedupe_key?: string
          event_id?: string
          event_name?: string
          event_time?: string
          payload?: Json
          user_id?: string | null
        }
        Relationships: []
      }
      telemetry_events_2027_h1: {
        Row: {
          content_id: string | null
          created_at: string
          dedupe_bucket_date: string
          dedupe_key: string
          event_id: string
          event_name: string
          event_time: string
          payload: Json
          user_id: string | null
        }
        Insert: {
          content_id?: string | null
          created_at?: string
          dedupe_bucket_date: string
          dedupe_key: string
          event_id?: string
          event_name: string
          event_time: string
          payload?: Json
          user_id?: string | null
        }
        Update: {
          content_id?: string | null
          created_at?: string
          dedupe_bucket_date?: string
          dedupe_key?: string
          event_id?: string
          event_name?: string
          event_time?: string
          payload?: Json
          user_id?: string | null
        }
        Relationships: []
      }
      telemetry_events_2027_h2: {
        Row: {
          content_id: string | null
          created_at: string
          dedupe_bucket_date: string
          dedupe_key: string
          event_id: string
          event_name: string
          event_time: string
          payload: Json
          user_id: string | null
        }
        Insert: {
          content_id?: string | null
          created_at?: string
          dedupe_bucket_date: string
          dedupe_key: string
          event_id?: string
          event_name: string
          event_time: string
          payload?: Json
          user_id?: string | null
        }
        Update: {
          content_id?: string | null
          created_at?: string
          dedupe_bucket_date?: string
          dedupe_key?: string
          event_id?: string
          event_name?: string
          event_time?: string
          payload?: Json
          user_id?: string | null
        }
        Relationships: []
      }
      telemetry_events_2028_h1: {
        Row: {
          content_id: string | null
          created_at: string
          dedupe_bucket_date: string
          dedupe_key: string
          event_id: string
          event_name: string
          event_time: string
          payload: Json
          user_id: string | null
        }
        Insert: {
          content_id?: string | null
          created_at?: string
          dedupe_bucket_date: string
          dedupe_key: string
          event_id?: string
          event_name: string
          event_time: string
          payload?: Json
          user_id?: string | null
        }
        Update: {
          content_id?: string | null
          created_at?: string
          dedupe_bucket_date?: string
          dedupe_key?: string
          event_id?: string
          event_name?: string
          event_time?: string
          payload?: Json
          user_id?: string | null
        }
        Relationships: []
      }
      telemetry_events_2028_h2: {
        Row: {
          content_id: string | null
          created_at: string
          dedupe_bucket_date: string
          dedupe_key: string
          event_id: string
          event_name: string
          event_time: string
          payload: Json
          user_id: string | null
        }
        Insert: {
          content_id?: string | null
          created_at?: string
          dedupe_bucket_date: string
          dedupe_key: string
          event_id?: string
          event_name: string
          event_time: string
          payload?: Json
          user_id?: string | null
        }
        Update: {
          content_id?: string | null
          created_at?: string
          dedupe_bucket_date?: string
          dedupe_key?: string
          event_id?: string
          event_name?: string
          event_time?: string
          payload?: Json
          user_id?: string | null
        }
        Relationships: []
      }
      tenant_members: {
        Row: {
          created_at: string
          role: string
          tenant_id: string
          updated_at: string
          user_id: string
        }
        Insert: {
          created_at?: string
          role?: string
          tenant_id: string
          updated_at?: string
          user_id: string
        }
        Update: {
          created_at?: string
          role?: string
          tenant_id?: string
          updated_at?: string
          user_id?: string
        }
        Relationships: [
          {
            foreignKeyName: "tenant_members_tenant_id_fkey"
            columns: ["tenant_id"]
            isOneToOne: false
            referencedRelation: "tenants"
            referencedColumns: ["tenant_id"]
          },
        ]
      }
      tenants: {
        Row: {
          created_at: string
          name: string
          status: string
          tenant_id: string
          updated_at: string
        }
        Insert: {
          created_at?: string
          name: string
          status?: string
          tenant_id?: string
          updated_at?: string
        }
        Update: {
          created_at?: string
          name?: string
          status?: string
          tenant_id?: string
          updated_at?: string
        }
        Relationships: []
      }
      testimonials: {
        Row: {
          author_id: string
          created_at: string | null
          id: string
          is_approved: boolean | null
          target_user_id: string
          text: string
        }
        Insert: {
          author_id: string
          created_at?: string | null
          id?: string
          is_approved?: boolean | null
          target_user_id: string
          text: string
        }
        Update: {
          author_id?: string
          created_at?: string | null
          id?: string
          is_approved?: boolean | null
          target_user_id?: string
          text?: string
        }
        Relationships: []
      }
      thread_read_positions: {
        Row: {
          conversation_id: string
          last_read_at: string
          thread_root_message_id: string
          user_id: string
        }
        Insert: {
          conversation_id: string
          last_read_at?: string
          thread_root_message_id: string
          user_id: string
        }
        Update: {
          conversation_id?: string
          last_read_at?: string
          thread_root_message_id?: string
          user_id?: string
        }
        Relationships: []
      }
      threads_muted: {
        Row: {
          created_at: string
          id: string
          message_id: string
          muted_at: string
          user_id: string
        }
        Insert: {
          created_at?: string
          id?: string
          message_id: string
          muted_at?: string
          user_id: string
        }
        Update: {
          created_at?: string
          id?: string
          message_id?: string
          muted_at?: string
          user_id?: string
        }
        Relationships: [
          {
            foreignKeyName: "threads_muted_message_id_fkey"
            columns: ["message_id"]
            isOneToOne: false
            referencedRelation: "messages"
            referencedColumns: ["id"]
          },
        ]
      }
      transcode_jobs: {
        Row: {
          asset_id: string
          attempts: number
          created_at: string
          error_code: string | null
          id: string
          profile_id: string
          state: string
          updated_at: string
        }
        Insert: {
          asset_id: string
          attempts?: number
          created_at?: string
          error_code?: string | null
          id?: string
          profile_id: string
          state: string
          updated_at?: string
        }
        Update: {
          asset_id?: string
          attempts?: number
          created_at?: string
          error_code?: string | null
          id?: string
          profile_id?: string
          state?: string
          updated_at?: string
        }
        Relationships: [
          {
            foreignKeyName: "transcode_jobs_asset_id_fkey"
            columns: ["asset_id"]
            isOneToOne: false
            referencedRelation: "assets"
            referencedColumns: ["id"]
          },
        ]
      }
      transit_routes: {
        Row: {
          color: string | null
          id: string
          is_active: boolean | null
          name: string
          route_number: string
          route_type: string
          schedule: Json | null
          stops: Json
          updated_at: string
        }
        Insert: {
          color?: string | null
          id?: string
          is_active?: boolean | null
          name: string
          route_number: string
          route_type: string
          schedule?: Json | null
          stops?: Json
          updated_at?: string
        }
        Update: {
          color?: string | null
          id?: string
          is_active?: boolean | null
          name?: string
          route_number?: string
          route_type?: string
          schedule?: Json | null
          stops?: Json
          updated_at?: string
        }
        Relationships: []
      }
      translated_messages: {
        Row: {
          message_id: string
          source_language: string
          target_language: string
          translated_at: string
          translated_text: string
          translation_id: string
        }
        Insert: {
          message_id: string
          source_language: string
          target_language: string
          translated_at?: string
          translated_text: string
          translation_id?: string
        }
        Update: {
          message_id?: string
          source_language?: string
          target_language?: string
          translated_at?: string
          translated_text?: string
          translation_id?: string
        }
        Relationships: [
          {
            foreignKeyName: "translated_messages_message_id_fkey"
            columns: ["message_id"]
            isOneToOne: false
            referencedRelation: "messages"
            referencedColumns: ["id"]
          },
        ]
      }
      trend_runs: {
        Row: {
          algorithm_version: string
          candidate_limit: number
          claim_expires_at: string | null
          claimed_at: string | null
          claimed_by: string | null
          created_at: string
          decision_job_id: string | null
          ended_at: string | null
          idempotency_key: string | null
          inputs: Json | null
          lookback_hours: number
          notes: string | null
          outputs: Json | null
          reason_codes: string[]
          run_id: string
          segment_id: string
          started_at: string
          status: string
          updated_at: string
          window_key: string
        }
        Insert: {
          algorithm_version?: string
          candidate_limit?: number
          claim_expires_at?: string | null
          claimed_at?: string | null
          claimed_by?: string | null
          created_at?: string
          decision_job_id?: string | null
          ended_at?: string | null
          idempotency_key?: string | null
          inputs?: Json | null
          lookback_hours?: number
          notes?: string | null
          outputs?: Json | null
          reason_codes?: string[]
          run_id?: string
          segment_id?: string
          started_at?: string
          status?: string
          updated_at?: string
          window_key?: string
        }
        Update: {
          algorithm_version?: string
          candidate_limit?: number
          claim_expires_at?: string | null
          claimed_at?: string | null
          claimed_by?: string | null
          created_at?: string
          decision_job_id?: string | null
          ended_at?: string | null
          idempotency_key?: string | null
          inputs?: Json | null
          lookback_hours?: number
          notes?: string | null
          outputs?: Json | null
          reason_codes?: string[]
          run_id?: string
          segment_id?: string
          started_at?: string
          status?: string
          updated_at?: string
          window_key?: string
        }
        Relationships: []
      }
      trending_hashtags: {
        Row: {
          growth_rate: number | null
          id: string
          post_count: number | null
          recent_count: number | null
          tag: string
          updated_at: string | null
        }
        Insert: {
          growth_rate?: number | null
          id?: string
          post_count?: number | null
          recent_count?: number | null
          tag: string
          updated_at?: string | null
        }
        Update: {
          growth_rate?: number | null
          id?: string
          post_count?: number | null
          recent_count?: number | null
          tag?: string
          updated_at?: string | null
        }
        Relationships: []
      }
      trending_topics: {
        Row: {
          category: string | null
          created_at: string | null
          detected_by: string | null
          detection_confidence: number | null
          growth_velocity: number | null
          id: string
          is_active: boolean | null
          keywords: string[] | null
          peak_hour: string | null
          reels_count_24h: number | null
          related_hashtags: string[] | null
          topic_name: string
          total_engagement_24h: number | null
          total_views_24h: number | null
          trend_ended_at: string | null
          trend_started_at: string | null
          updated_at: string | null
        }
        Insert: {
          category?: string | null
          created_at?: string | null
          detected_by?: string | null
          detection_confidence?: number | null
          growth_velocity?: number | null
          id?: string
          is_active?: boolean | null
          keywords?: string[] | null
          peak_hour?: string | null
          reels_count_24h?: number | null
          related_hashtags?: string[] | null
          topic_name: string
          total_engagement_24h?: number | null
          total_views_24h?: number | null
          trend_ended_at?: string | null
          trend_started_at?: string | null
          updated_at?: string | null
        }
        Update: {
          category?: string | null
          created_at?: string | null
          detected_by?: string | null
          detection_confidence?: number | null
          growth_velocity?: number | null
          id?: string
          is_active?: boolean | null
          keywords?: string[] | null
          peak_hour?: string | null
          reels_count_24h?: number | null
          related_hashtags?: string[] | null
          topic_name?: string
          total_engagement_24h?: number | null
          total_views_24h?: number | null
          trend_ended_at?: string | null
          trend_started_at?: string | null
          updated_at?: string | null
        }
        Relationships: []
      }
      trust_profiles: {
        Row: {
          actor_id: string
          actor_type: Database["public"]["Enums"]["actor_type"]
          enforcement_level: Database["public"]["Enums"]["enforcement_level"]
          risk_tier: Database["public"]["Enums"]["risk_tier"]
          signals: Json
          trust_score: number
          updated_at: string
          version: number
        }
        Insert: {
          actor_id: string
          actor_type: Database["public"]["Enums"]["actor_type"]
          enforcement_level?: Database["public"]["Enums"]["enforcement_level"]
          risk_tier?: Database["public"]["Enums"]["risk_tier"]
          signals?: Json
          trust_score?: number
          updated_at?: string
          version?: number
        }
        Update: {
          actor_id?: string
          actor_type?: Database["public"]["Enums"]["actor_type"]
          enforcement_level?: Database["public"]["Enums"]["enforcement_level"]
          risk_tier?: Database["public"]["Enums"]["risk_tier"]
          signals?: Json
          trust_score?: number
          updated_at?: string
          version?: number
        }
        Relationships: []
      }
      trust_weight_overrides: {
        Row: {
          created_at: string
          created_by: string | null
          id: number
          override_id: string
          override_trust_weight: number
          reason_code: string | null
          reason_notes: string | null
          user_id: string
          valid_from: string
          valid_until: string | null
        }
        Insert: {
          created_at?: string
          created_by?: string | null
          id?: number
          override_id?: string
          override_trust_weight: number
          reason_code?: string | null
          reason_notes?: string | null
          user_id: string
          valid_from?: string
          valid_until?: string | null
        }
        Update: {
          created_at?: string
          created_by?: string | null
          id?: number
          override_id?: string
          override_trust_weight?: number
          reason_code?: string | null
          reason_notes?: string | null
          user_id?: string
          valid_from?: string
          valid_until?: string | null
        }
        Relationships: []
      }
      turn_issuance_audit: {
        Row: {
          auth_type: string
          created_at: string
          error_code: string | null
          id: number
          ip_hash: string
          latency_ms: number
          outcome: string
          region_hint: string | null
          request_id: string
          status_code: number
          ttl_seconds: number | null
          user_hash: string
        }
        Insert: {
          auth_type: string
          created_at?: string
          error_code?: string | null
          id?: never
          ip_hash: string
          latency_ms: number
          outcome: string
          region_hint?: string | null
          request_id: string
          status_code: number
          ttl_seconds?: number | null
          user_hash: string
        }
        Update: {
          auth_type?: string
          created_at?: string
          error_code?: string | null
          id?: never
          ip_hash?: string
          latency_ms?: number
          outcome?: string
          region_hint?: string | null
          request_id?: string
          status_code?: number
          ttl_seconds?: number | null
          user_hash?: string
        }
        Relationships: []
      }
      turn_issuance_rl: {
        Row: {
          bucket_ts: string
          cnt: number
          ip: string
          user_id: string
        }
        Insert: {
          bucket_ts: string
          cnt?: number
          ip: string
          user_id: string
        }
        Update: {
          bucket_ts?: string
          cnt?: number
          ip?: string
          user_id?: string
        }
        Relationships: []
      }
      turn_replay_guard: {
        Row: {
          created_at: string
          expires_at: string
          nonce_hash: string
          user_scope: string
        }
        Insert: {
          created_at?: string
          expires_at: string
          nonce_hash: string
          user_scope: string
        }
        Update: {
          created_at?: string
          expires_at?: string
          nonce_hash?: string
          user_scope?: string
        }
        Relationships: []
      }
      upload_parts: {
        Row: {
          checksum: string
          committed_at: string
          etag: string | null
          part_no: number
          part_size_bytes: number
          upload_id: string
        }
        Insert: {
          checksum: string
          committed_at?: string
          etag?: string | null
          part_no: number
          part_size_bytes: number
          upload_id: string
        }
        Update: {
          checksum?: string
          committed_at?: string
          etag?: string | null
          part_no?: number
          part_size_bytes?: number
          upload_id?: string
        }
        Relationships: [
          {
            foreignKeyName: "upload_parts_upload_id_fkey"
            columns: ["upload_id"]
            isOneToOne: false
            referencedRelation: "uploads"
            referencedColumns: ["id"]
          },
        ]
      }
      uploads: {
        Row: {
          asset_kind: string
          checksum_algo: string
          created_at: string
          draft_id: string
          id: string
          manifest_checksum: string | null
          part_size_bytes: number
          size_bytes: number
          status: string
          updated_at: string
        }
        Insert: {
          asset_kind: string
          checksum_algo?: string
          created_at?: string
          draft_id: string
          id?: string
          manifest_checksum?: string | null
          part_size_bytes: number
          size_bytes: number
          status?: string
          updated_at?: string
        }
        Update: {
          asset_kind?: string
          checksum_algo?: string
          created_at?: string
          draft_id?: string
          id?: string
          manifest_checksum?: string | null
          part_size_bytes?: number
          size_bytes?: number
          status?: string
          updated_at?: string
        }
        Relationships: [
          {
            foreignKeyName: "uploads_draft_id_fkey"
            columns: ["draft_id"]
            isOneToOne: false
            referencedRelation: "drafts"
            referencedColumns: ["id"]
          },
        ]
      }
      user_app_icon_selection: {
        Row: {
          created_at: string
          icon_id: string
          updated_at: string
          user_id: string
        }
        Insert: {
          created_at?: string
          icon_id: string
          updated_at?: string
          user_id: string
        }
        Update: {
          created_at?: string
          icon_id?: string
          updated_at?: string
          user_id?: string
        }
        Relationships: [
          {
            foreignKeyName: "user_app_icon_selection_icon_id_fkey"
            columns: ["icon_id"]
            isOneToOne: false
            referencedRelation: "app_icon_catalog"
            referencedColumns: ["id"]
          },
        ]
      }
      user_appearance_settings: {
        Row: {
          chat_theme_id: string
          chat_wallpaper_id: string
          created_at: string
          dark_mode_enabled: boolean
          dark_theme: string
          font_scale: number
          media_tap_navigation_enabled: boolean
          message_corner_radius: number
          personal_color_primary: string
          personal_color_secondary: string
          stickers_emoji_animations_enabled: boolean
          ui_animations_enabled: boolean
          updated_at: string
          user_id: string
        }
        Insert: {
          chat_theme_id?: string
          chat_wallpaper_id?: string
          created_at?: string
          dark_mode_enabled?: boolean
          dark_theme?: string
          font_scale?: number
          media_tap_navigation_enabled?: boolean
          message_corner_radius?: number
          personal_color_primary?: string
          personal_color_secondary?: string
          stickers_emoji_animations_enabled?: boolean
          ui_animations_enabled?: boolean
          updated_at?: string
          user_id: string
        }
        Update: {
          chat_theme_id?: string
          chat_wallpaper_id?: string
          created_at?: string
          dark_mode_enabled?: boolean
          dark_theme?: string
          font_scale?: number
          media_tap_navigation_enabled?: boolean
          message_corner_radius?: number
          personal_color_primary?: string
          personal_color_secondary?: string
          stickers_emoji_animations_enabled?: boolean
          ui_animations_enabled?: boolean
          updated_at?: string
          user_id?: string
        }
        Relationships: []
      }
      user_author_affinity: {
        Row: {
          affinity_score: number | null
          author_id: string
          avg_completion_rate: number | null
          avg_watch_duration: number | null
          comments_count: number | null
          first_interaction_at: string | null
          interactions_count: number | null
          last_interaction_at: string | null
          last_score_decay_at: string | null
          last_updated_at: string | null
          likes_count: number | null
          negative_interactions: number | null
          positive_interactions: number | null
          rewatch_count: number | null
          saves_count: number | null
          shares_count: number | null
          total_interactions: number | null
          user_id: string
          views_count: number | null
        }
        Insert: {
          affinity_score?: number | null
          author_id: string
          avg_completion_rate?: number | null
          avg_watch_duration?: number | null
          comments_count?: number | null
          first_interaction_at?: string | null
          interactions_count?: number | null
          last_interaction_at?: string | null
          last_score_decay_at?: string | null
          last_updated_at?: string | null
          likes_count?: number | null
          negative_interactions?: number | null
          positive_interactions?: number | null
          rewatch_count?: number | null
          saves_count?: number | null
          shares_count?: number | null
          total_interactions?: number | null
          user_id: string
          views_count?: number | null
        }
        Update: {
          affinity_score?: number | null
          author_id?: string
          avg_completion_rate?: number | null
          avg_watch_duration?: number | null
          comments_count?: number | null
          first_interaction_at?: string | null
          interactions_count?: number | null
          last_interaction_at?: string | null
          last_score_decay_at?: string | null
          last_updated_at?: string | null
          likes_count?: number | null
          negative_interactions?: number | null
          positive_interactions?: number | null
          rewatch_count?: number | null
          saves_count?: number | null
          shares_count?: number | null
          total_interactions?: number | null
          user_id?: string
          views_count?: number | null
        }
        Relationships: []
      }
      user_badges: {
        Row: {
          badge_id: string
          earned_at: string | null
          id: string
          user_id: string
        }
        Insert: {
          badge_id: string
          earned_at?: string | null
          id?: string
          user_id: string
        }
        Update: {
          badge_id?: string
          earned_at?: string | null
          id?: string
          user_id?: string
        }
        Relationships: [
          {
            foreignKeyName: "user_badges_badge_id_fkey"
            columns: ["badge_id"]
            isOneToOne: false
            referencedRelation: "achievement_badges"
            referencedColumns: ["id"]
          },
        ]
      }
      user_channel_group_settings: {
        Row: {
          allow_channel_invites: boolean
          allow_group_invites: boolean
          auto_join_by_invite: boolean
          created_at: string
          mute_new_communities: boolean
          show_media_preview: boolean
          updated_at: string
          user_id: string
        }
        Insert: {
          allow_channel_invites?: boolean
          allow_group_invites?: boolean
          auto_join_by_invite?: boolean
          created_at?: string
          mute_new_communities?: boolean
          show_media_preview?: boolean
          updated_at?: string
          user_id?: string
        }
        Update: {
          allow_channel_invites?: boolean
          allow_group_invites?: boolean
          auto_join_by_invite?: boolean
          created_at?: string
          mute_new_communities?: boolean
          show_media_preview?: boolean
          updated_at?: string
          user_id?: string
        }
        Relationships: []
      }
      user_chat_settings: {
        Row: {
          archived_at: string | null
          auto_download_media: boolean | null
          bubble_style: string | null
          chat_wallpaper: string | null
          conversation_id: string
          created_at: string | null
          font_size: string | null
          id: string
          is_archived: boolean
          is_pinned: boolean
          muted_until: string | null
          notification_sound: string | null
          notification_vibration: boolean | null
          notifications_enabled: boolean | null
          pin_order: number | null
          send_by_enter: boolean | null
          updated_at: string | null
          user_id: string
        }
        Insert: {
          archived_at?: string | null
          auto_download_media?: boolean | null
          bubble_style?: string | null
          chat_wallpaper?: string | null
          conversation_id: string
          created_at?: string | null
          font_size?: string | null
          id?: string
          is_archived?: boolean
          is_pinned?: boolean
          muted_until?: string | null
          notification_sound?: string | null
          notification_vibration?: boolean | null
          notifications_enabled?: boolean | null
          pin_order?: number | null
          send_by_enter?: boolean | null
          updated_at?: string | null
          user_id: string
        }
        Update: {
          archived_at?: string | null
          auto_download_media?: boolean | null
          bubble_style?: string | null
          chat_wallpaper?: string | null
          conversation_id?: string
          created_at?: string | null
          font_size?: string | null
          id?: string
          is_archived?: boolean
          is_pinned?: boolean
          muted_until?: string | null
          notification_sound?: string | null
          notification_vibration?: boolean | null
          notifications_enabled?: boolean | null
          pin_order?: number | null
          send_by_enter?: boolean | null
          updated_at?: string | null
          user_id?: string
        }
        Relationships: []
      }
      user_consumption_diversity: {
        Row: {
          author_diversity_score: number
          echo_chamber_flagged_at: string | null
          is_echo_chamber: boolean
          last_analyzed_at: string
          recommended_exploration_ratio: number
          recommended_safety_boost: number
          top_author_concentration: number
          top_author_id: string | null
          top_author_impression_count: number
          topic_diversity_score: number
          total_impressions_analyzed: number
          unique_authors_count: number
          unique_topics_count: number
          updated_at: string
          user_id: string
        }
        Insert: {
          author_diversity_score?: number
          echo_chamber_flagged_at?: string | null
          is_echo_chamber?: boolean
          last_analyzed_at?: string
          recommended_exploration_ratio?: number
          recommended_safety_boost?: number
          top_author_concentration?: number
          top_author_id?: string | null
          top_author_impression_count?: number
          topic_diversity_score?: number
          total_impressions_analyzed?: number
          unique_authors_count?: number
          unique_topics_count?: number
          updated_at?: string
          user_id: string
        }
        Update: {
          author_diversity_score?: number
          echo_chamber_flagged_at?: string | null
          is_echo_chamber?: boolean
          last_analyzed_at?: string
          recommended_exploration_ratio?: number
          recommended_safety_boost?: number
          top_author_concentration?: number
          top_author_id?: string | null
          top_author_impression_count?: number
          topic_diversity_score?: number
          total_impressions_analyzed?: number
          unique_authors_count?: number
          unique_topics_count?: number
          updated_at?: string
          user_id?: string
        }
        Relationships: [
          {
            foreignKeyName: "user_consumption_diversity_top_author_id_fkey"
            columns: ["top_author_id"]
            isOneToOne: false
            referencedRelation: "profiles"
            referencedColumns: ["id"]
          },
        ]
      }
      user_dnd_settings: {
        Row: {
          created_at: string
          dnd_allow_calls: boolean
          dnd_auto_reply: string | null
          dnd_enabled: boolean
          dnd_exceptions: string[]
          dnd_until: string | null
          updated_at: string
          user_id: string
        }
        Insert: {
          created_at?: string
          dnd_allow_calls?: boolean
          dnd_auto_reply?: string | null
          dnd_enabled?: boolean
          dnd_exceptions?: string[]
          dnd_until?: string | null
          updated_at?: string
          user_id: string
        }
        Update: {
          created_at?: string
          dnd_allow_calls?: boolean
          dnd_auto_reply?: string | null
          dnd_enabled?: boolean
          dnd_exceptions?: string[]
          dnd_until?: string | null
          updated_at?: string
          user_id?: string
        }
        Relationships: []
      }
      user_embeddings: {
        Row: {
          active_hours: Json | null
          avg_session_minutes: number | null
          content_creators: Json | null
          hashtag_affinities: Json | null
          interests: Json | null
          preferred_content_type: string | null
          updated_at: string | null
          user_id: string
        }
        Insert: {
          active_hours?: Json | null
          avg_session_minutes?: number | null
          content_creators?: Json | null
          hashtag_affinities?: Json | null
          interests?: Json | null
          preferred_content_type?: string | null
          updated_at?: string | null
          user_id: string
        }
        Update: {
          active_hours?: Json | null
          avg_session_minutes?: number | null
          content_creators?: Json | null
          hashtag_affinities?: Json | null
          interests?: Json | null
          preferred_content_type?: string | null
          updated_at?: string | null
          user_id?: string
        }
        Relationships: []
      }
      user_emoji_packs: {
        Row: {
          installed_at: string
          pack_id: string
          user_id: string
        }
        Insert: {
          installed_at?: string
          pack_id: string
          user_id: string
        }
        Update: {
          installed_at?: string
          pack_id?: string
          user_id?: string
        }
        Relationships: [
          {
            foreignKeyName: "user_emoji_packs_pack_id_fkey"
            columns: ["pack_id"]
            isOneToOne: false
            referencedRelation: "emoji_packs"
            referencedColumns: ["id"]
          },
        ]
      }
      user_emoji_preferences: {
        Row: {
          created_at: string
          emoji_suggestions_mode: string
          large_emoji_mode: string
          recents_first: boolean
          updated_at: string
          user_id: string
        }
        Insert: {
          created_at?: string
          emoji_suggestions_mode?: string
          large_emoji_mode?: string
          recents_first?: boolean
          updated_at?: string
          user_id: string
        }
        Update: {
          created_at?: string
          emoji_suggestions_mode?: string
          large_emoji_mode?: string
          recents_first?: boolean
          updated_at?: string
          user_id?: string
        }
        Relationships: []
      }
      user_encryption_keys: {
        Row: {
          conversation_id: string | null
          created_at: string
          encrypted_group_key: string | null
          fingerprint: string | null
          id: string
          key_version: number | null
          public_key_raw: string | null
          updated_at: string
          user_id: string
        }
        Insert: {
          conversation_id?: string | null
          created_at?: string
          encrypted_group_key?: string | null
          fingerprint?: string | null
          id?: string
          key_version?: number | null
          public_key_raw?: string | null
          updated_at?: string
          user_id: string
        }
        Update: {
          conversation_id?: string | null
          created_at?: string
          encrypted_group_key?: string | null
          fingerprint?: string | null
          id?: string
          key_version?: number | null
          public_key_raw?: string | null
          updated_at?: string
          user_id?: string
        }
        Relationships: []
      }
      user_energy_saver_settings: {
        Row: {
          animated_emoji: boolean
          animated_stickers: boolean
          autoplay_gif: boolean
          autoplay_video: boolean
          background_updates: boolean
          battery_threshold_percent: number
          created_at: string
          interface_animations: boolean
          media_preload: boolean
          mode: string
          updated_at: string
          user_id: string
        }
        Insert: {
          animated_emoji?: boolean
          animated_stickers?: boolean
          autoplay_gif?: boolean
          autoplay_video?: boolean
          background_updates?: boolean
          battery_threshold_percent?: number
          created_at?: string
          interface_animations?: boolean
          media_preload?: boolean
          mode?: string
          updated_at?: string
          user_id: string
        }
        Update: {
          animated_emoji?: boolean
          animated_stickers?: boolean
          autoplay_gif?: boolean
          autoplay_video?: boolean
          background_updates?: boolean
          battery_threshold_percent?: number
          created_at?: string
          interface_animations?: boolean
          media_preload?: boolean
          mode?: string
          updated_at?: string
          user_id?: string
        }
        Relationships: []
      }
      user_global_chat_settings: {
        Row: {
          auto_download_mobile: boolean | null
          auto_download_wifi: boolean | null
          auto_play_gifs: boolean | null
          auto_play_videos: boolean | null
          bubble_corners: string | null
          channel_sound: string | null
          chat_text_size: number | null
          default_wallpaper: string | null
          double_tap_reaction: string | null
          group_sound: string | null
          in_app_sounds: boolean | null
          in_app_vibrate: boolean | null
          link_preview_enabled: boolean | null
          message_sound: string | null
          read_receipts_enabled: boolean | null
          show_preview: boolean | null
          swipe_to_reply: boolean | null
          typing_indicator_enabled: boolean | null
          updated_at: string | null
          user_id: string
        }
        Insert: {
          auto_download_mobile?: boolean | null
          auto_download_wifi?: boolean | null
          auto_play_gifs?: boolean | null
          auto_play_videos?: boolean | null
          bubble_corners?: string | null
          channel_sound?: string | null
          chat_text_size?: number | null
          default_wallpaper?: string | null
          double_tap_reaction?: string | null
          group_sound?: string | null
          in_app_sounds?: boolean | null
          in_app_vibrate?: boolean | null
          link_preview_enabled?: boolean | null
          message_sound?: string | null
          read_receipts_enabled?: boolean | null
          show_preview?: boolean | null
          swipe_to_reply?: boolean | null
          typing_indicator_enabled?: boolean | null
          updated_at?: string | null
          user_id: string
        }
        Update: {
          auto_download_mobile?: boolean | null
          auto_download_wifi?: boolean | null
          auto_play_gifs?: boolean | null
          auto_play_videos?: boolean | null
          bubble_corners?: string | null
          channel_sound?: string | null
          chat_text_size?: number | null
          default_wallpaper?: string | null
          double_tap_reaction?: string | null
          group_sound?: string | null
          in_app_sounds?: boolean | null
          in_app_vibrate?: boolean | null
          link_preview_enabled?: boolean | null
          message_sound?: string | null
          read_receipts_enabled?: boolean | null
          show_preview?: boolean | null
          swipe_to_reply?: boolean | null
          typing_indicator_enabled?: boolean | null
          updated_at?: string | null
          user_id?: string
        }
        Relationships: []
      }
      user_hidden_words: {
        Row: {
          created_at: string | null
          id: string
          user_id: string
          word: string
        }
        Insert: {
          created_at?: string | null
          id?: string
          user_id: string
          word: string
        }
        Update: {
          created_at?: string | null
          id?: string
          user_id?: string
          word?: string
        }
        Relationships: []
      }
      user_interactions: {
        Row: {
          content_id: string
          content_type: string
          created_at: string | null
          id: string
          interaction_type: string
          metadata: Json | null
          user_id: string
          value: number | null
        }
        Insert: {
          content_id: string
          content_type: string
          created_at?: string | null
          id?: string
          interaction_type: string
          metadata?: Json | null
          user_id: string
          value?: number | null
        }
        Update: {
          content_id?: string
          content_type?: string
          created_at?: string | null
          id?: string
          interaction_type?: string
          metadata?: Json | null
          user_id?: string
          value?: number | null
        }
        Relationships: []
      }
      user_interests: {
        Row: {
          id: string
          interest_tag: string
          source: string | null
          updated_at: string | null
          user_id: string
          weight: number | null
        }
        Insert: {
          id?: string
          interest_tag: string
          source?: string | null
          updated_at?: string | null
          user_id: string
          weight?: number | null
        }
        Update: {
          id?: string
          interest_tag?: string
          source?: string | null
          updated_at?: string | null
          user_id?: string
          weight?: number | null
        }
        Relationships: []
      }
      user_locations: {
        Row: {
          accuracy_meters: number
          expires_at: string | null
          is_visible: boolean
          last_updated: string
          location: unknown
          user_id: string
        }
        Insert: {
          accuracy_meters?: number
          expires_at?: string | null
          is_visible?: boolean
          last_updated?: string
          location: unknown
          user_id: string
        }
        Update: {
          accuracy_meters?: number
          expires_at?: string | null
          is_visible?: boolean
          last_updated?: string
          location?: unknown
          user_id?: string
        }
        Relationships: []
      }
      user_notes: {
        Row: {
          note: string
          target_id: string
          updated_at: string | null
          user_id: string
        }
        Insert: {
          note: string
          target_id: string
          updated_at?: string | null
          user_id: string
        }
        Update: {
          note?: string
          target_id?: string
          updated_at?: string | null
          user_id?: string
        }
        Relationships: []
      }
      user_prekey_bundles: {
        Row: {
          created_at: string
          identity_key_public: string
          identity_signing_public: string
          one_time_prekeys: string[]
          signed_prekey_created_at: string
          signed_prekey_public: string
          signed_prekey_signature: string
          updated_at: string
          user_id: string
        }
        Insert: {
          created_at?: string
          identity_key_public: string
          identity_signing_public: string
          one_time_prekeys?: string[]
          signed_prekey_created_at?: string
          signed_prekey_public: string
          signed_prekey_signature: string
          updated_at?: string
          user_id: string
        }
        Update: {
          created_at?: string
          identity_key_public?: string
          identity_signing_public?: string
          one_time_prekeys?: string[]
          signed_prekey_created_at?: string
          signed_prekey_public?: string
          signed_prekey_signature?: string
          updated_at?: string
          user_id?: string
        }
        Relationships: []
      }
      user_quick_reaction: {
        Row: {
          created_at: string
          emoji: string
          updated_at: string
          user_id: string
        }
        Insert: {
          created_at?: string
          emoji?: string
          updated_at?: string
          user_id: string
        }
        Update: {
          created_at?: string
          emoji?: string
          updated_at?: string
          user_id?: string
        }
        Relationships: []
      }
      user_quick_reaction_overrides: {
        Row: {
          chat_id: string
          created_at: string
          emoji: string
          updated_at: string
          user_id: string
        }
        Insert: {
          chat_id: string
          created_at?: string
          emoji: string
          updated_at?: string
          user_id: string
        }
        Update: {
          chat_id?: string
          created_at?: string
          emoji?: string
          updated_at?: string
          user_id?: string
        }
        Relationships: []
      }
      user_reaction_packs: {
        Row: {
          installed_at: string | null
          pack_id: string
          sort_order: number | null
          user_id: string
        }
        Insert: {
          installed_at?: string | null
          pack_id: string
          sort_order?: number | null
          user_id: string
        }
        Update: {
          installed_at?: string | null
          pack_id?: string
          sort_order?: number | null
          user_id?: string
        }
        Relationships: [
          {
            foreignKeyName: "user_reaction_packs_pack_id_fkey"
            columns: ["pack_id"]
            isOneToOne: false
            referencedRelation: "reaction_packs"
            referencedColumns: ["id"]
          },
        ]
      }
      user_recent_stickers: {
        Row: {
          id: string
          sticker_id: string
          use_count: number | null
          used_at: string | null
          user_id: string
        }
        Insert: {
          id?: string
          sticker_id: string
          use_count?: number | null
          used_at?: string | null
          user_id: string
        }
        Update: {
          id?: string
          sticker_id?: string
          use_count?: number | null
          used_at?: string | null
          user_id?: string
        }
        Relationships: [
          {
            foreignKeyName: "user_recent_stickers_sticker_id_fkey"
            columns: ["sticker_id"]
            isOneToOne: false
            referencedRelation: "stickers"
            referencedColumns: ["id"]
          },
        ]
      }
      user_reel_feedback: {
        Row: {
          created_at: string
          feedback: string
          id: string
          reel_id: string
          session_id: string | null
          updated_at: string
          user_id: string | null
        }
        Insert: {
          created_at?: string
          feedback: string
          id?: string
          reel_id: string
          session_id?: string | null
          updated_at?: string
          user_id?: string | null
        }
        Update: {
          created_at?: string
          feedback?: string
          id?: string
          reel_id?: string
          session_id?: string | null
          updated_at?: string
          user_id?: string | null
        }
        Relationships: [
          {
            foreignKeyName: "user_reel_feedback_reel_id_fkey"
            columns: ["reel_id"]
            isOneToOne: false
            referencedRelation: "reels"
            referencedColumns: ["id"]
          },
        ]
      }
      user_reel_interactions: {
        Row: {
          commented: boolean | null
          completion_rate: number | null
          first_view_at: string | null
          hidden: boolean | null
          id: string
          last_interaction_at: string | null
          liked: boolean | null
          reel_duration_seconds: number | null
          reel_id: string | null
          report_reason: string | null
          reported: boolean | null
          rewatch_count: number | null
          rewatched: boolean | null
          saved: boolean | null
          session_id: string | null
          shared: boolean | null
          skipped_at_second: number | null
          skipped_quickly: boolean | null
          user_id: string | null
          viewed: boolean | null
          watch_duration_seconds: number | null
        }
        Insert: {
          commented?: boolean | null
          completion_rate?: number | null
          first_view_at?: string | null
          hidden?: boolean | null
          id?: string
          last_interaction_at?: string | null
          liked?: boolean | null
          reel_duration_seconds?: number | null
          reel_id?: string | null
          report_reason?: string | null
          reported?: boolean | null
          rewatch_count?: number | null
          rewatched?: boolean | null
          saved?: boolean | null
          session_id?: string | null
          shared?: boolean | null
          skipped_at_second?: number | null
          skipped_quickly?: boolean | null
          user_id?: string | null
          viewed?: boolean | null
          watch_duration_seconds?: number | null
        }
        Update: {
          commented?: boolean | null
          completion_rate?: number | null
          first_view_at?: string | null
          hidden?: boolean | null
          id?: string
          last_interaction_at?: string | null
          liked?: boolean | null
          reel_duration_seconds?: number | null
          reel_id?: string | null
          report_reason?: string | null
          reported?: boolean | null
          rewatch_count?: number | null
          rewatched?: boolean | null
          saved?: boolean | null
          session_id?: string | null
          shared?: boolean | null
          skipped_at_second?: number | null
          skipped_quickly?: boolean | null
          user_id?: string | null
          viewed?: boolean | null
          watch_duration_seconds?: number | null
        }
        Relationships: [
          {
            foreignKeyName: "user_reel_interactions_reel_id_fkey"
            columns: ["reel_id"]
            isOneToOne: false
            referencedRelation: "reels"
            referencedColumns: ["id"]
          },
        ]
      }
      user_roles: {
        Row: {
          created_at: string
          id: string
          role: Database["public"]["Enums"]["app_role"]
          user_id: string
        }
        Insert: {
          created_at?: string
          id?: string
          role?: Database["public"]["Enums"]["app_role"]
          user_id: string
        }
        Update: {
          created_at?: string
          id?: string
          role?: Database["public"]["Enums"]["app_role"]
          user_id?: string
        }
        Relationships: []
      }
      user_saved_gifs: {
        Row: {
          gif_url: string
          height: number | null
          id: string
          preview_url: string | null
          saved_at: string | null
          source: string | null
          user_id: string
          width: number | null
        }
        Insert: {
          gif_url: string
          height?: number | null
          id?: string
          preview_url?: string | null
          saved_at?: string | null
          source?: string | null
          user_id: string
          width?: number | null
        }
        Update: {
          gif_url?: string
          height?: number | null
          id?: string
          preview_url?: string | null
          saved_at?: string | null
          source?: string | null
          user_id?: string
          width?: number | null
        }
        Relationships: []
      }
      user_saved_tracks: {
        Row: {
          saved_at: string | null
          track_id: string
          user_id: string
        }
        Insert: {
          saved_at?: string | null
          track_id: string
          user_id: string
        }
        Update: {
          saved_at?: string | null
          track_id?: string
          user_id?: string
        }
        Relationships: [
          {
            foreignKeyName: "user_saved_tracks_track_id_fkey"
            columns: ["track_id"]
            isOneToOne: false
            referencedRelation: "music_tracks"
            referencedColumns: ["id"]
          },
        ]
      }
      user_screen_time: {
        Row: {
          created_at: string
          duration_seconds: number
          id: string
          last_ping_at: string
          session_date: string
          user_id: string
        }
        Insert: {
          created_at?: string
          duration_seconds?: number
          id?: string
          last_ping_at?: string
          session_date?: string
          user_id: string
        }
        Update: {
          created_at?: string
          duration_seconds?: number
          id?: string
          last_ping_at?: string
          session_date?: string
          user_id?: string
        }
        Relationships: []
      }
      user_security_settings: {
        Row: {
          app_passcode_hash: string | null
          cloud_password_hash: string | null
          created_at: string
          passkey_enabled: boolean
          updated_at: string
          user_id: string
        }
        Insert: {
          app_passcode_hash?: string | null
          cloud_password_hash?: string | null
          created_at?: string
          passkey_enabled?: boolean
          updated_at?: string
          user_id: string
        }
        Update: {
          app_passcode_hash?: string | null
          cloud_password_hash?: string | null
          created_at?: string
          passkey_enabled?: boolean
          updated_at?: string
          user_id?: string
        }
        Relationships: []
      }
      user_session_context: {
        Row: {
          avg_completion_rate: number | null
          created_at: string | null
          device_type: string | null
          id: string
          platform: string | null
          reels_completed_count: number | null
          reels_liked_count: number | null
          reels_skipped_count: number | null
          reels_viewed_count: number | null
          session_avoided_topics: string[] | null
          session_duration_seconds: number | null
          session_ended_at: string | null
          session_id: string
          session_preferred_authors: string[] | null
          session_preferred_topics: string[] | null
          session_started_at: string | null
          skip_streak: number | null
          time_of_day: string | null
          updated_at: string | null
          user_id: string | null
        }
        Insert: {
          avg_completion_rate?: number | null
          created_at?: string | null
          device_type?: string | null
          id?: string
          platform?: string | null
          reels_completed_count?: number | null
          reels_liked_count?: number | null
          reels_skipped_count?: number | null
          reels_viewed_count?: number | null
          session_avoided_topics?: string[] | null
          session_duration_seconds?: number | null
          session_ended_at?: string | null
          session_id: string
          session_preferred_authors?: string[] | null
          session_preferred_topics?: string[] | null
          session_started_at?: string | null
          skip_streak?: number | null
          time_of_day?: string | null
          updated_at?: string | null
          user_id?: string | null
        }
        Update: {
          avg_completion_rate?: number | null
          created_at?: string | null
          device_type?: string | null
          id?: string
          platform?: string | null
          reels_completed_count?: number | null
          reels_liked_count?: number | null
          reels_skipped_count?: number | null
          reels_viewed_count?: number | null
          session_avoided_topics?: string[] | null
          session_duration_seconds?: number | null
          session_ended_at?: string | null
          session_id?: string
          session_preferred_authors?: string[] | null
          session_preferred_topics?: string[] | null
          session_started_at?: string | null
          skip_streak?: number | null
          time_of_day?: string | null
          updated_at?: string | null
          user_id?: string | null
        }
        Relationships: []
      }
      user_sessions: {
        Row: {
          created_at: string
          device_name: string | null
          id: string
          ip: unknown
          last_seen_at: string
          revoked_at: string | null
          session_key: string
          user_agent: string | null
          user_id: string
        }
        Insert: {
          created_at?: string
          device_name?: string | null
          id?: string
          ip?: unknown
          last_seen_at?: string
          revoked_at?: string | null
          session_key: string
          user_agent?: string | null
          user_id: string
        }
        Update: {
          created_at?: string
          device_name?: string | null
          id?: string
          ip?: unknown
          last_seen_at?: string
          revoked_at?: string | null
          session_key?: string
          user_agent?: string | null
          user_id?: string
        }
        Relationships: []
      }
      user_settings: {
        Row: {
          account_self_destruct_days: number
          branded_content_manual_approval: boolean
          cache_auto_delete_days: number
          cache_max_size_mb: number | null
          calls_noise_suppression: boolean
          calls_p2p_mode: string
          comments_notifications: boolean
          created_at: string
          followers_notifications: boolean
          font_scale: number
          high_contrast: boolean
          language_code: string
          likes_notifications: boolean
          media_auto_download_enabled: boolean
          media_auto_download_files: boolean
          media_auto_download_files_max_mb: number
          media_auto_download_photos: boolean
          media_auto_download_videos: boolean
          mention_notifications: boolean
          messages_auto_delete_seconds: number
          notif_show_sender: boolean
          notif_show_text: boolean
          notif_sound_id: string
          notif_vibrate: boolean
          private_account: boolean
          push_notifications: boolean
          reduce_motion: boolean
          sessions_auto_terminate_days: number
          show_activity_status: boolean
          show_calls_tab: boolean
          theme: string
          updated_at: string
          user_id: string
        }
        Insert: {
          account_self_destruct_days?: number
          branded_content_manual_approval?: boolean
          cache_auto_delete_days?: number
          cache_max_size_mb?: number | null
          calls_noise_suppression?: boolean
          calls_p2p_mode?: string
          comments_notifications?: boolean
          created_at?: string
          followers_notifications?: boolean
          font_scale?: number
          high_contrast?: boolean
          language_code?: string
          likes_notifications?: boolean
          media_auto_download_enabled?: boolean
          media_auto_download_files?: boolean
          media_auto_download_files_max_mb?: number
          media_auto_download_photos?: boolean
          media_auto_download_videos?: boolean
          mention_notifications?: boolean
          messages_auto_delete_seconds?: number
          notif_show_sender?: boolean
          notif_show_text?: boolean
          notif_sound_id?: string
          notif_vibrate?: boolean
          private_account?: boolean
          push_notifications?: boolean
          reduce_motion?: boolean
          sessions_auto_terminate_days?: number
          show_activity_status?: boolean
          show_calls_tab?: boolean
          theme?: string
          updated_at?: string
          user_id: string
        }
        Update: {
          account_self_destruct_days?: number
          branded_content_manual_approval?: boolean
          cache_auto_delete_days?: number
          cache_max_size_mb?: number | null
          calls_noise_suppression?: boolean
          calls_p2p_mode?: string
          comments_notifications?: boolean
          created_at?: string
          followers_notifications?: boolean
          font_scale?: number
          high_contrast?: boolean
          language_code?: string
          likes_notifications?: boolean
          media_auto_download_enabled?: boolean
          media_auto_download_files?: boolean
          media_auto_download_files_max_mb?: number
          media_auto_download_photos?: boolean
          media_auto_download_videos?: boolean
          mention_notifications?: boolean
          messages_auto_delete_seconds?: number
          notif_show_sender?: boolean
          notif_show_text?: boolean
          notif_sound_id?: string
          notif_vibrate?: boolean
          private_account?: boolean
          push_notifications?: boolean
          reduce_motion?: boolean
          sessions_auto_terminate_days?: number
          show_activity_status?: boolean
          show_calls_tab?: boolean
          theme?: string
          updated_at?: string
          user_id?: string
        }
        Relationships: []
      }
      user_similarity_scores: {
        Row: {
          calculated_at: string | null
          common_authors_count: number | null
          common_likes_count: number | null
          similarity_score: number | null
          user_id_a: string
          user_id_b: string
        }
        Insert: {
          calculated_at?: string | null
          common_authors_count?: number | null
          common_likes_count?: number | null
          similarity_score?: number | null
          user_id_a: string
          user_id_b: string
        }
        Update: {
          calculated_at?: string | null
          common_authors_count?: number | null
          common_likes_count?: number | null
          similarity_score?: number | null
          user_id_a?: string
          user_id_b?: string
        }
        Relationships: []
      }
      user_stars: {
        Row: {
          balance: number
          total_earned: number
          total_spent: number
          updated_at: string | null
          user_id: string
        }
        Insert: {
          balance?: number
          total_earned?: number
          total_spent?: number
          updated_at?: string | null
          user_id: string
        }
        Update: {
          balance?: number
          total_earned?: number
          total_spent?: number
          updated_at?: string | null
          user_id?: string
        }
        Relationships: []
      }
      user_status_notes: {
        Row: {
          audience: string | null
          created_at: string | null
          emoji: string | null
          expires_at: string
          id: string | null
          text: string
          user_id: string
        }
        Insert: {
          audience?: string | null
          created_at?: string | null
          emoji?: string | null
          expires_at?: string
          id?: string | null
          text: string
          user_id: string
        }
        Update: {
          audience?: string | null
          created_at?: string | null
          emoji?: string | null
          expires_at?: string
          id?: string | null
          text?: string
          user_id?: string
        }
        Relationships: []
      }
      user_sticker_archive: {
        Row: {
          archived_at: string
          pack_id: string
          updated_at: string
          user_id: string
        }
        Insert: {
          archived_at?: string
          pack_id: string
          updated_at?: string
          user_id: string
        }
        Update: {
          archived_at?: string
          pack_id?: string
          updated_at?: string
          user_id?: string
        }
        Relationships: [
          {
            foreignKeyName: "user_sticker_archive_pack_id_fkey"
            columns: ["pack_id"]
            isOneToOne: false
            referencedRelation: "sticker_packs"
            referencedColumns: ["id"]
          },
        ]
      }
      user_sticker_library: {
        Row: {
          installed_at: string
          pack_id: string
          sort_order: number
          updated_at: string
          user_id: string
        }
        Insert: {
          installed_at?: string
          pack_id: string
          sort_order?: number
          updated_at?: string
          user_id: string
        }
        Update: {
          installed_at?: string
          pack_id?: string
          sort_order?: number
          updated_at?: string
          user_id?: string
        }
        Relationships: [
          {
            foreignKeyName: "user_sticker_library_pack_id_fkey"
            columns: ["pack_id"]
            isOneToOne: false
            referencedRelation: "sticker_packs"
            referencedColumns: ["id"]
          },
        ]
      }
      user_sticker_packs: {
        Row: {
          id: string
          installed_at: string | null
          pack_id: string
          position: number | null
          user_id: string
        }
        Insert: {
          id?: string
          installed_at?: string | null
          pack_id: string
          position?: number | null
          user_id: string
        }
        Update: {
          id?: string
          installed_at?: string | null
          pack_id?: string
          position?: number | null
          user_id?: string
        }
        Relationships: [
          {
            foreignKeyName: "user_sticker_packs_pack_id_fkey"
            columns: ["pack_id"]
            isOneToOne: false
            referencedRelation: "sticker_packs"
            referencedColumns: ["id"]
          },
        ]
      }
      user_story_settings: {
        Row: {
          allow_resharing: boolean
          archive_enabled: boolean
          show_activity: boolean
          updated_at: string
          user_id: string
        }
        Insert: {
          allow_resharing?: boolean
          archive_enabled?: boolean
          show_activity?: boolean
          updated_at?: string
          user_id: string
        }
        Update: {
          allow_resharing?: boolean
          archive_enabled?: boolean
          show_activity?: boolean
          updated_at?: string
          user_id?: string
        }
        Relationships: []
      }
      user_totp_secrets: {
        Row: {
          backup_codes: string[]
          created_at: string
          encrypted_secret: string
          id: string
          is_enabled: boolean
          last_used_counter: number | null
          user_id: string
          verified_at: string | null
        }
        Insert: {
          backup_codes?: string[]
          created_at?: string
          encrypted_secret: string
          id?: string
          is_enabled?: boolean
          last_used_counter?: number | null
          user_id: string
          verified_at?: string | null
        }
        Update: {
          backup_codes?: string[]
          created_at?: string
          encrypted_secret?: string
          id?: string
          is_enabled?: boolean
          last_used_counter?: number | null
          user_id?: string
          verified_at?: string | null
        }
        Relationships: []
      }
      user_verifications: {
        Row: {
          created_at: string | null
          id: string
          is_active: boolean | null
          reason: string | null
          revoked_at: string | null
          revoked_by_admin_id: string | null
          ticket_id: string | null
          updated_at: string | null
          user_id: string
          verification_type: Database["public"]["Enums"]["verification_type"]
          verified_at: string | null
          verified_by_admin_id: string | null
        }
        Insert: {
          created_at?: string | null
          id?: string
          is_active?: boolean | null
          reason?: string | null
          revoked_at?: string | null
          revoked_by_admin_id?: string | null
          ticket_id?: string | null
          updated_at?: string | null
          user_id: string
          verification_type: Database["public"]["Enums"]["verification_type"]
          verified_at?: string | null
          verified_by_admin_id?: string | null
        }
        Update: {
          created_at?: string | null
          id?: string
          is_active?: boolean | null
          reason?: string | null
          revoked_at?: string | null
          revoked_by_admin_id?: string | null
          ticket_id?: string | null
          updated_at?: string | null
          user_id?: string
          verification_type?: Database["public"]["Enums"]["verification_type"]
          verified_at?: string | null
          verified_by_admin_id?: string | null
        }
        Relationships: [
          {
            foreignKeyName: "user_verifications_revoked_by_admin_id_fkey"
            columns: ["revoked_by_admin_id"]
            isOneToOne: false
            referencedRelation: "admin_users"
            referencedColumns: ["id"]
          },
          {
            foreignKeyName: "user_verifications_verified_by_admin_id_fkey"
            columns: ["verified_by_admin_id"]
            isOneToOne: false
            referencedRelation: "admin_users"
            referencedColumns: ["id"]
          },
        ]
      }
      username_transactions: {
        Row: {
          buyer_id: string
          created_at: string | null
          id: string
          price_stars: number
          seller_id: string | null
          transaction_type: string
          username_id: string
        }
        Insert: {
          buyer_id: string
          created_at?: string | null
          id?: string
          price_stars: number
          seller_id?: string | null
          transaction_type: string
          username_id: string
        }
        Update: {
          buyer_id?: string
          created_at?: string | null
          id?: string
          price_stars?: number
          seller_id?: string | null
          transaction_type?: string
          username_id?: string
        }
        Relationships: [
          {
            foreignKeyName: "username_transactions_username_id_fkey"
            columns: ["username_id"]
            isOneToOne: false
            referencedRelation: "collectible_usernames"
            referencedColumns: ["id"]
          },
        ]
      }
      vanish_mode_sessions: {
        Row: {
          activated_at: string | null
          activated_by: string
          conversation_id: string
          deactivated_at: string | null
          id: string
          is_active: boolean | null
        }
        Insert: {
          activated_at?: string | null
          activated_by: string
          conversation_id: string
          deactivated_at?: string | null
          id?: string
          is_active?: boolean | null
        }
        Update: {
          activated_at?: string | null
          activated_by?: string
          conversation_id?: string
          deactivated_at?: string | null
          id?: string
          is_active?: boolean | null
        }
        Relationships: []
      }
      verification_requests: {
        Row: {
          category: string
          category_detail: string | null
          country: string
          created_at: string
          document_url: string | null
          full_name: string
          id: string
          known_as: string | null
          rejection_reason: string | null
          reviewed_at: string | null
          reviewed_by: string | null
          status: string
          user_id: string
        }
        Insert: {
          category: string
          category_detail?: string | null
          country: string
          created_at?: string
          document_url?: string | null
          full_name: string
          id?: string
          known_as?: string | null
          rejection_reason?: string | null
          reviewed_at?: string | null
          reviewed_by?: string | null
          status?: string
          user_id: string
        }
        Update: {
          category?: string
          category_detail?: string | null
          country?: string
          created_at?: string
          document_url?: string | null
          full_name?: string
          id?: string
          known_as?: string | null
          rejection_reason?: string | null
          reviewed_at?: string | null
          reviewed_by?: string | null
          status?: string
          user_id?: string
        }
        Relationships: []
      }
      video_call_signals: {
        Row: {
          call_id: string
          created_at: string
          id: string
          processed: boolean | null
          sender_id: string
          signal_data: Json
          signal_type: string
        }
        Insert: {
          call_id: string
          created_at?: string
          id?: string
          processed?: boolean | null
          sender_id: string
          signal_data: Json
          signal_type: string
        }
        Update: {
          call_id?: string
          created_at?: string
          id?: string
          processed?: boolean | null
          sender_id?: string
          signal_data?: Json
          signal_type?: string
        }
        Relationships: [
          {
            foreignKeyName: "video_call_signals_call_id_fkey"
            columns: ["call_id"]
            isOneToOne: false
            referencedRelation: "calls"
            referencedColumns: ["id"]
          },
          {
            foreignKeyName: "video_call_signals_call_id_fkey"
            columns: ["call_id"]
            isOneToOne: false
            referencedRelation: "video_calls"
            referencedColumns: ["id"]
          },
        ]
      }
      video_calls_legacy: {
        Row: {
          call_type: string
          callee_id: string
          caller_id: string
          calls_v2_join_token: string | null
          calls_v2_room_id: string | null
          conversation_id: string | null
          created_at: string
          duration_seconds: number | null
          ended_at: string | null
          ice_restart_count: number | null
          id: string
          started_at: string | null
          status: string
          updated_at: string
        }
        Insert: {
          call_type?: string
          callee_id: string
          caller_id: string
          calls_v2_join_token?: string | null
          calls_v2_room_id?: string | null
          conversation_id?: string | null
          created_at?: string
          duration_seconds?: number | null
          ended_at?: string | null
          ice_restart_count?: number | null
          id?: string
          started_at?: string | null
          status?: string
          updated_at?: string
        }
        Update: {
          call_type?: string
          callee_id?: string
          caller_id?: string
          calls_v2_join_token?: string | null
          calls_v2_room_id?: string | null
          conversation_id?: string | null
          created_at?: string
          duration_seconds?: number | null
          ended_at?: string | null
          ice_restart_count?: number | null
          id?: string
          started_at?: string | null
          status?: string
          updated_at?: string
        }
        Relationships: [
          {
            foreignKeyName: "video_calls_conversation_id_fkey"
            columns: ["conversation_id"]
            isOneToOne: false
            referencedRelation: "conversations"
            referencedColumns: ["id"]
          },
        ]
      }
      video_messages: {
        Row: {
          conversation_id: string
          created_at: string
          duration_ms: number
          file_size_bytes: number
          id: string
          message_id: string
          sender_id: string
          thumbnail_url: string | null
          video_url: string
          viewed_by: string[]
        }
        Insert: {
          conversation_id: string
          created_at?: string
          duration_ms: number
          file_size_bytes: number
          id?: string
          message_id: string
          sender_id: string
          thumbnail_url?: string | null
          video_url: string
          viewed_by?: string[]
        }
        Update: {
          conversation_id?: string
          created_at?: string
          duration_ms?: number
          file_size_bytes?: number
          id?: string
          message_id?: string
          sender_id?: string
          thumbnail_url?: string | null
          video_url?: string
          viewed_by?: string[]
        }
        Relationships: []
      }
      voice_messages: {
        Row: {
          audio_url: string
          conversation_id: string
          created_at: string | null
          duration_seconds: number
          id: string
          is_listened: boolean | null
          message_id: string
          sender_id: string
          waveform: number[] | null
        }
        Insert: {
          audio_url: string
          conversation_id: string
          created_at?: string | null
          duration_seconds?: number
          id?: string
          is_listened?: boolean | null
          message_id: string
          sender_id: string
          waveform?: number[] | null
        }
        Update: {
          audio_url?: string
          conversation_id?: string
          created_at?: string | null
          duration_seconds?: number
          id?: string
          is_listened?: boolean | null
          message_id?: string
          sender_id?: string
          waveform?: number[] | null
        }
        Relationships: []
      }
      workflow_runs: {
        Row: {
          error: string | null
          event_payload: Json
          finished_at: string | null
          id: string
          queued_at: string
          started_at: string | null
          status: string
          updated_at: string
          user_id: string
          workflow_id: string
        }
        Insert: {
          error?: string | null
          event_payload?: Json
          finished_at?: string | null
          id?: string
          queued_at?: string
          started_at?: string | null
          status?: string
          updated_at?: string
          user_id: string
          workflow_id: string
        }
        Update: {
          error?: string | null
          event_payload?: Json
          finished_at?: string | null
          id?: string
          queued_at?: string
          started_at?: string | null
          status?: string
          updated_at?: string
          user_id?: string
          workflow_id?: string
        }
        Relationships: [
          {
            foreignKeyName: "workflow_runs_workflow_id_fkey"
            columns: ["workflow_id"]
            isOneToOne: false
            referencedRelation: "integration_workflows"
            referencedColumns: ["id"]
          },
        ]
      }
    }
    Views: {
      chat_v11_health_last_15m: {
        Row: {
          ack_without_receipt_10s_count: number | null
          forced_resync_count: number | null
          server_ts: string | null
          write_receipt_latency_p95_ms: number | null
          write_receipt_samples: number | null
        }
        Relationships: []
      }
      chat_v11_metrics_last_15m: {
        Row: {
          avg_value: number | null
          last_seen_at: string | null
          metric_kind: string | null
          metric_name: string | null
          p95_value: number | null
          sample_count: number | null
          sum_value: number | null
        }
        Relationships: []
      }
      geography_columns: {
        Row: {
          coord_dimension: number | null
          f_geography_column: unknown
          f_table_catalog: unknown
          f_table_name: unknown
          f_table_schema: unknown
          srid: number | null
          type: string | null
        }
        Relationships: []
      }
      geometry_columns: {
        Row: {
          coord_dimension: number | null
          f_geometry_column: unknown
          f_table_catalog: string | null
          f_table_name: unknown
          f_table_schema: unknown
          srid: number | null
          type: string | null
        }
        Insert: {
          coord_dimension?: number | null
          f_geometry_column?: unknown
          f_table_catalog?: string | null
          f_table_name?: unknown
          f_table_schema?: unknown
          srid?: number | null
          type?: string | null
        }
        Update: {
          coord_dimension?: number | null
          f_geometry_column?: unknown
          f_table_catalog?: string | null
          f_table_name?: unknown
          f_table_schema?: unknown
          srid?: number | null
          type?: string | null
        }
        Relationships: []
      }
      nav_traffic_segments_tiles: {
        Row: {
          confidence: number | null
          congestion_level: string | null
          created_at: string | null
          free_flow_speed_kmh: number | null
          geometry: unknown
          id: string | null
          measured_at: string | null
          road_segment_id: string | null
          sample_count: number | null
          speed_kmh: number | null
        }
        Relationships: [
          {
            foreignKeyName: "nav_traffic_segments_road_segment_id_fkey"
            columns: ["road_segment_id"]
            isOneToOne: false
            referencedRelation: "nav_road_segments"
            referencedColumns: ["id"]
          },
        ]
      }
      reason_code_stats_v1: {
        Row: {
          avg_value: number | null
          boost_name: string | null
          max_value: number | null
          usage_count: number | null
        }
        Relationships: []
      }
      user_dnd_public: {
        Row: {
          dnd_allow_calls: boolean | null
          dnd_enabled: boolean | null
          dnd_until: string | null
          user_id: string | null
        }
        Insert: {
          dnd_allow_calls?: boolean | null
          dnd_enabled?: boolean | null
          dnd_until?: string | null
          user_id?: string | null
        }
        Update: {
          dnd_allow_calls?: boolean | null
          dnd_enabled?: boolean | null
          dnd_until?: string | null
          user_id?: string | null
        }
        Relationships: []
      }
      v_moderation_decisions_recent: {
        Row: {
          actor_id: string | null
          actor_type: string | null
          algorithm_version: string | null
          confidence: number | null
          created_at: string | null
          event_id: string | null
          from_status: string | null
          hashtag: string | null
          reason_codes: string[] | null
          spam_score: number | null
          surface_policy: string | null
          to_status: string | null
        }
        Relationships: []
      }
      video_calls: {
        Row: {
          call_type: string | null
          callee_id: string | null
          caller_id: string | null
          calls_v2_join_token: string | null
          calls_v2_room_id: string | null
          conversation_id: string | null
          created_at: string | null
          duration_seconds: number | null
          ended_at: string | null
          ice_restart_count: number | null
          id: string | null
          signaling_data: Json | null
          started_at: string | null
          status: string | null
          updated_at: string | null
        }
        Insert: {
          call_type?: string | null
          callee_id?: string | null
          caller_id?: string | null
          calls_v2_join_token?: string | null
          calls_v2_room_id?: string | null
          conversation_id?: string | null
          created_at?: string | null
          duration_seconds?: number | null
          ended_at?: string | null
          ice_restart_count?: number | null
          id?: string | null
          signaling_data?: Json | null
          started_at?: string | null
          status?: string | null
          updated_at?: string | null
        }
        Update: {
          call_type?: string | null
          callee_id?: string | null
          caller_id?: string | null
          calls_v2_join_token?: string | null
          calls_v2_room_id?: string | null
          conversation_id?: string | null
          created_at?: string | null
          duration_seconds?: number | null
          ended_at?: string | null
          ice_restart_count?: number | null
          id?: string | null
          signaling_data?: Json | null
          started_at?: string | null
          status?: string | null
          updated_at?: string | null
        }
        Relationships: [
          {
            foreignKeyName: "calls_conversation_id_fkey"
            columns: ["conversation_id"]
            isOneToOne: false
            referencedRelation: "conversations"
            referencedColumns: ["id"]
          },
        ]
      }
    }
    Functions: {
      _postgis_deprecate: {
        Args: { newname: string; oldname: string; version: string }
        Returns: undefined
      }
      _postgis_index_extent: {
        Args: { col: string; tbl: unknown }
        Returns: unknown
      }
      _postgis_pgsql_version: { Args: never; Returns: string }
      _postgis_scripts_pgsql_version: { Args: never; Returns: string }
      _postgis_selectivity: {
        Args: { att_name: string; geom: unknown; mode?: string; tbl: unknown }
        Returns: number
      }
      _postgis_stats: {
        Args: { ""?: string; att_name: string; tbl: unknown }
        Returns: string
      }
      _st_3dintersects: {
        Args: { geom1: unknown; geom2: unknown }
        Returns: boolean
      }
      _st_contains: {
        Args: { geom1: unknown; geom2: unknown }
        Returns: boolean
      }
      _st_containsproperly: {
        Args: { geom1: unknown; geom2: unknown }
        Returns: boolean
      }
      _st_coveredby:
        | { Args: { geog1: unknown; geog2: unknown }; Returns: boolean }
        | { Args: { geom1: unknown; geom2: unknown }; Returns: boolean }
      _st_covers:
        | { Args: { geog1: unknown; geog2: unknown }; Returns: boolean }
        | { Args: { geom1: unknown; geom2: unknown }; Returns: boolean }
      _st_crosses: {
        Args: { geom1: unknown; geom2: unknown }
        Returns: boolean
      }
      _st_dwithin: {
        Args: {
          geog1: unknown
          geog2: unknown
          tolerance: number
          use_spheroid?: boolean
        }
        Returns: boolean
      }
      _st_equals: { Args: { geom1: unknown; geom2: unknown }; Returns: boolean }
      _st_intersects: {
        Args: { geom1: unknown; geom2: unknown }
        Returns: boolean
      }
      _st_linecrossingdirection: {
        Args: { line1: unknown; line2: unknown }
        Returns: number
      }
      _st_longestline: {
        Args: { geom1: unknown; geom2: unknown }
        Returns: unknown
      }
      _st_maxdistance: {
        Args: { geom1: unknown; geom2: unknown }
        Returns: number
      }
      _st_orderingequals: {
        Args: { geom1: unknown; geom2: unknown }
        Returns: boolean
      }
      _st_overlaps: {
        Args: { geom1: unknown; geom2: unknown }
        Returns: boolean
      }
      _st_sortablehash: { Args: { geom: unknown }; Returns: number }
      _st_touches: {
        Args: { geom1: unknown; geom2: unknown }
        Returns: boolean
      }
      _st_voronoi: {
        Args: {
          clip?: unknown
          g1: unknown
          return_polygons?: boolean
          tolerance?: number
        }
        Returns: unknown
      }
      _st_within: { Args: { geom1: unknown; geom2: unknown }; Returns: boolean }
      accept_invite: {
        Args: { p_device_id: string; p_invite_id: string; p_trace_id: string }
        Returns: {
          error: string
          scope_id: string
          status: string
        }[]
      }
      ack_delivered_v1: {
        Args: { p_conversation_id: string; p_up_to_seq: number }
        Returns: {
          conversation_id: string
          delivered_up_to_seq: number
          read_up_to_seq: number
          server_time: string
          user_id: string
        }[]
      }
      ack_read_v1: {
        Args: { p_conversation_id: string; p_up_to_seq: number }
        Returns: {
          conversation_id: string
          delivered_up_to_seq: number
          read_up_to_seq: number
          server_time: string
          user_id: string
        }[]
      }
      add_hashtags_to_reel: {
        Args: { p_hashtags: string[]; p_reel_id: string }
        Returns: {
          hashtag_id: string
          hashtag_position: number
          tag: string
        }[]
      }
      addauth: { Args: { "": string }; Returns: boolean }
      addgeometrycolumn:
        | {
            Args: {
              catalog_name: string
              column_name: string
              new_dim: number
              new_srid_in: number
              new_type: string
              schema_name: string
              table_name: string
              use_typmod?: boolean
            }
            Returns: string
          }
        | {
            Args: {
              column_name: string
              new_dim: number
              new_srid: number
              new_type: string
              schema_name: string
              table_name: string
              use_typmod?: boolean
            }
            Returns: string
          }
        | {
            Args: {
              column_name: string
              new_dim: number
              new_srid: number
              new_type: string
              table_name: string
              use_typmod?: boolean
            }
            Returns: string
          }
      admin_audit_append: {
        Args: {
          p_action: string
          p_actor_id: string
          p_actor_role: string
          p_actor_session_id: string
          p_actor_type: string
          p_after_state: Json
          p_approval_id: string
          p_before_state: Json
          p_error_code: string
          p_error_message: string
          p_ip_address: unknown
          p_metadata: Json
          p_reason_code: string
          p_reason_description: string
          p_request_id: string
          p_resource_id: string
          p_resource_type: string
          p_severity: string
          p_status: string
          p_ticket_id: string
          p_user_agent: string
        }
        Returns: string
      }
      admin_audit_compute_hash: {
        Args: { payload: Json; prev_hash: string }
        Returns: string
      }
      admin_has_scope_v1: {
        Args: { p_admin_user_id: string; p_scope: string }
        Returns: boolean
      }
      analyze_user_diversity_v1: {
        Args: {
          p_echo_threshold?: number
          p_user_id: string
          p_window_size?: number
        }
        Returns: boolean
      }
      apply_hashtag_moderation_decision_v1: {
        Args: {
          p_actor_id: string
          p_confidence?: number
          p_hashtag: string
          p_notes?: string
          p_reason_codes?: string[]
          p_spam_score?: number
          p_surface_policy?: string
          p_to_status: string
        }
        Returns: {
          cache_invalidation_queued: boolean
          event_recorded: boolean
          hashtag: string
          message: string
          status_changed: boolean
        }[]
      }
      apply_moderation_decision: {
        Args: {
          p_actor_id: string
          p_actor_type: string
          p_confidence_score?: number
          p_from_status: string
          p_idempotency_key?: string
          p_notes?: string
          p_reason_codes: string[]
          p_snapshot_id?: string
          p_subject_id: string
          p_subject_type: string
          p_surface_policy?: string
          p_to_status: string
        }
        Returns: {
          applied_ok: boolean
          created_at: string
          decision_id: string
          previous_decision_id: string
        }[]
      }
      archive_expired_stories_v1: { Args: never; Returns: number }
      assert_actor_context_v1: {
        Args: { p_auth_context: Json }
        Returns: undefined
      }
      assert_service_active_v1: {
        Args: { p_service_id: string; p_tenant_id: string }
        Returns: undefined
      }
      assert_tenant_member_v1: {
        Args: { p_min_role?: string; p_tenant_id: string }
        Returns: undefined
      }
      auth_create_session_v1: {
        Args: {
          p_account_id: string
          p_device_secret: string
          p_device_uid: string
          p_ip: unknown
          p_refresh_expires_at: string
          p_refresh_token_hash: string
          p_user_agent: string
        }
        Returns: {
          session_id: string
        }[]
      }
      auth_register_device_v1: {
        Args: {
          p_app_version: string
          p_device_model: string
          p_device_secret: string
          p_device_uid: string
          p_ip: unknown
          p_os_version: string
          p_platform: string
          p_user_agent: string
        }
        Returns: {
          device_id: string
        }[]
      }
      auth_revoke_session_v1: {
        Args: {
          p_device_secret: string
          p_device_uid: string
          p_ip: unknown
          p_session_id: string
          p_user_agent: string
        }
        Returns: {
          ok: boolean
          reason: string
        }[]
      }
      auth_rotate_refresh_by_device_v1: {
        Args: {
          p_device_secret: string
          p_device_uid: string
          p_ip: unknown
          p_new_refresh_expires_at: string
          p_new_refresh_hash: string
          p_session_id: string
          p_user_agent: string
        }
        Returns: {
          account_id: string
          ok: boolean
          reason: string
        }[]
      }
      auth_rotate_refresh_v1: {
        Args: {
          p_device_secret: string
          p_device_uid: string
          p_ip: unknown
          p_new_refresh_expires_at: string
          p_new_refresh_hash: string
          p_presented_refresh_hash: string
          p_session_id: string
          p_user_agent: string
        }
        Returns: {
          ok: boolean
          reason: string
        }[]
      }
      auth_switch_active_account_v1: {
        Args: {
          p_account_id: string
          p_device_secret: string
          p_device_uid: string
          p_ip: unknown
          p_user_agent: string
        }
        Returns: {
          ok: boolean
          reason: string
        }[]
      }
      auth_upsert_account_v1: {
        Args: { p_email: string; p_phone_e164: string }
        Returns: {
          account_id: string
        }[]
      }
      batch_analyze_diversity_v1: {
        check_recovery_phone_email_v1: {
          Args: { p_phone: string; p_email: string }
          Returns: boolean
        }
        get_email_by_phone_v1: {
          Args: { p_phone: string }
          Returns: string | null
        }
        batch_analyze_diversity_v1: {
          Args: { p_limit?: number }
        Returns: {
          author_diversity_score: number
          is_echo_chamber: boolean
          user_id: string
        }[]
      }
      batch_calculate_creator_metrics_v1: {
        Args: { p_limit?: number }
        Returns: {
          avg_watched_rate: number
          creator_id: string
          total_impressions: number
          total_reels: number
        }[]
      }
      batch_calculate_reel_metrics_v1: {
        Args: { p_limit?: number; p_max_age_hours?: number }
        Returns: {
          author_id: string
          impressions: number
          reel_id: string
          updated_at: string
          watched_rate: number
        }[]
      }
      batch_check_controversial_v1: {
        Args: { p_limit?: number; p_min_impressions?: number }
        Returns: {
          is_controversial: boolean
          needs_review: boolean
          penalty_score: number
          reel_id: string
        }[]
      }
      batch_create_creator_snapshots_v1: {
        Args: { p_limit?: number; p_snapshot_date?: string }
        Returns: {
          creator_id: string
          snapshot_date: string
          total_reels: number
        }[]
      }
      batch_create_reel_snapshots_v1: {
        Args: { p_limit?: number; p_snapshot_date?: string }
        Returns: {
          impressions: number
          reel_id: string
          snapshot_date: string
        }[]
      }
      batch_detect_coordinated_hashtag_attacks_v1: {
        Args: {
          p_limit?: number
          p_similarity_threshold?: number
          p_window_hours?: number
        }
        Returns: {
          hashtag_tag: string
          is_suspicious: boolean
          similar_pattern_count: number
          suspicious_account_count: number
          velocity_spike_detected: boolean
        }[]
      }
      boost_memory_importance: {
        Args: { p_delta?: number; p_memory_ids: string[] }
        Returns: undefined
      }
      broadcast_create_session_v1: {
        Args: {
          p_category?: string
          p_creator_id: string
          p_description?: string
          p_thumbnail_url?: string
          p_title: string
        }
        Returns: {
          error: string
          session_id: number
        }[]
      }
      broadcast_end_session_v1: {
        Args: { p_session_id: number }
        Returns: {
          message: string
          success: boolean
        }[]
      }
      calculate_advanced_engagement_score: {
        Args: {
          p_avg_completion_rate?: number
          p_comments_count: number
          p_likes_count: number
          p_reposts_count?: number
          p_saves_count?: number
          p_shares_count?: number
          p_views_count: number
        }
        Returns: number
      }
      calculate_appeal_sla_v1: {
        Args: { p_window_days?: number }
        Returns: {
          accepted_appeals: number
          avg_turnaround_hours: number
          p50_turnaround_hours: number
          p95_turnaround_hours: number
          pending_appeals: number
          rejected_appeals: number
          sla_breaches: number
          total_appeals: number
        }[]
      }
      calculate_audio_trending: { Args: never; Returns: undefined }
      calculate_creator_metrics_v1: {
        Args: { p_creator_id: string }
        Returns: boolean
      }
      calculate_explore_open_rate_v1: {
        Args: { p_window_days?: number }
        Returns: number
      }
      calculate_explore_section_distribution_v1: {
        Args: { p_window_days?: number }
        Returns: {
          avg_position: number
          click_count: number
          click_percentage: number
          section_type: string
          watch_rate: number
        }[]
      }
      calculate_explore_session_length_v1: {
        Args: { p_window_days?: number }
        Returns: number
      }
      calculate_explore_to_watch_rate_v1: {
        Args: { p_window_days?: number }
        Returns: number
      }
      calculate_hashtag_relevance_v1: {
        Args: { p_hashtag_tag: string; p_reel_id: string }
        Returns: number
      }
      calculate_hashtag_trending: { Args: never; Returns: undefined }
      calculate_hook_insight_v1: { Args: { p_reel_id: string }; Returns: Json }
      calculate_reel_metrics_v1: {
        Args: { p_reel_id: string }
        Returns: boolean
      }
      calculate_report_weight_v1: {
        Args: { p_reporter_id: string }
        Returns: {
          base_weight: number
          final_weight: number
          quality_multiplier: number
          trust_score: number
        }[]
      }
      calculate_retention_insight_v1: {
        Args: { p_reel_id: string }
        Returns: Json
      }
      calculate_safety_insight_v1: {
        Args: { p_reel_id: string }
        Returns: Json
      }
      calculate_trust_score_v1: {
        Args: {
          p_actor_id: string
          p_actor_type: Database["public"]["Enums"]["actor_type"]
        }
        Returns: number
      }
      calculate_user_similarities: {
        Args: { p_top_n?: number; p_user_id: string }
        Returns: undefined
      }
      calculate_virality_score: { Args: { p_reel_id: string }; Returns: number }
      call_accept_v1: {
        Args: { p_call_id: string; p_signaling_data?: Json }
        Returns: Json
      }
      call_cancel_v1: { Args: { p_call_id: string }; Returns: Json }
      call_create_v1: {
        Args: {
          p_call_type: string
          p_callee_id: string
          p_signaling_data?: Json
        }
        Returns: string
      }
      call_decline_v1: { Args: { p_call_id: string }; Returns: Json }
      call_end_v1: {
        Args: { p_call_id: string; p_end_reason?: string }
        Returns: Json
      }
      call_process_timeouts_v1: { Args: never; Returns: number }
      canonicalize_hashtag: { Args: { p_raw_tag: string }; Returns: string }
      channel_ban_member_v1: {
        Args: {
          _banned_rights: number
          _channel_id: string
          _target_user_id: string
          _until: string
        }
        Returns: boolean
      }
      channel_create_invite_link_v1: {
        Args: {
          _channel_id: string
          _expires_at: string
          _requires_approval: boolean
          _title: string
          _usage_limit: number
        }
        Returns: string
      }
      channel_delete_messages_v1: {
        Args: { _channel_id: string; _message_ids: string[] }
        Returns: number
      }
      channel_delete_v1: { Args: { _channel_id: string }; Returns: boolean }
      channel_edit_admin_v1: {
        Args: {
          _admin_rights: number
          _admin_title: string
          _channel_id: string
          _target_user_id: string
        }
        Returns: boolean
      }
      channel_edit_info_v1: {
        Args: {
          _avatar_url: string
          _channel_id: string
          _description: string
          _title: string
        }
        Returns: boolean
      }
      channel_edit_message_v1: {
        Args: {
          _channel_id: string
          _content: string
          _media_type: string
          _media_url: string
          _message_id: string
        }
        Returns: boolean
      }
      channel_forward_message_v1: {
        Args: { _channel_id: string; _message_id: string }
        Returns: boolean
      }
      channel_get_stats_v1: { Args: { _channel_id: string }; Returns: Json }
      channel_has_capability: {
        Args: { _capability_key: string; _channel_id: string; _user_id: string }
        Returns: boolean
      }
      channel_join_v1: { Args: { _channel_id: string }; Returns: boolean }
      channel_join_via_invite_v1: {
        Args: { _link_code: string }
        Returns: string
      }
      channel_leave_v1: { Args: { _channel_id: string }; Returns: boolean }
      channel_pin_message_v1: {
        Args: { _channel_id: string; _message_id: string; _pinned: boolean }
        Returns: boolean
      }
      channel_process_join_request_v1: {
        Args: { _approve: boolean; _channel_id: string; _request_id: string }
        Returns: boolean
      }
      channel_publish_scheduled_v1: {
        Args: { _channel_id: string; _message_id: string }
        Returns: boolean
      }
      channel_record_view_v1: {
        Args: { _channel_id: string; _message_id: string }
        Returns: boolean
      }
      channel_remove_capability_override_v1: {
        Args: { _capability_key: string; _channel_id: string }
        Returns: boolean
      }
      channel_remove_member_v1: {
        Args: { _channel_id: string; _target_user_id: string }
        Returns: boolean
      }
      channel_revoke_invite_link_v1: {
        Args: { _channel_id: string; _link_id: string }
        Returns: boolean
      }
      channel_schedule_message_v1: {
        Args: {
          _channel_id: string
          _content: string
          _media_type: string
          _media_url: string
          _scheduled_at: string
        }
        Returns: string
      }
      channel_send_message_v1: {
        Args: {
          _channel_id: string
          _content: string
          _duration_seconds?: number
          _media_type?: string
          _media_url?: string
          _shared_post_id?: string
          _shared_reel_id?: string
          _silent?: boolean
        }
        Returns: string
      }
      channel_set_auto_delete_seconds_v1: {
        Args: { _channel_id: string; _seconds: number }
        Returns: boolean
      }
      channel_set_capability_override_v1: {
        Args: {
          _capability_key: string
          _channel_id: string
          _is_enabled: boolean
          _params?: Json
        }
        Returns: boolean
      }
      channel_set_username_v1: {
        Args: { _channel_id: string; _username: string }
        Returns: boolean
      }
      channel_toggle_reaction_v1: {
        Args: { _channel_id: string; _emoji: string; _message_id: string }
        Returns: string
      }
      channel_unban_member_v1: {
        Args: { _channel_id: string; _target_user_id: string }
        Returns: boolean
      }
      channel_update_member_role_v1: {
        Args: {
          _channel_id: string
          _next_role: string
          _target_user_id: string
        }
        Returns: boolean
      }
      channel_update_settings_v1: {
        Args: {
          _channel_id: string
          _default_reactions: string[]
          _protected_content: boolean
          _signatures_enabled: boolean
          _slow_mode_seconds: number
        }
        Returns: boolean
      }
      chat_build_sort_key: {
        Args: {
          p_activity_seq: number
          p_dialog_id: string
          p_has_draft: boolean
          p_pinned_rank: number
        }
        Returns: string
      }
      chat_full_state_dialog_v11: {
        Args: {
          p_device_id: string
          p_dialog_id: string
          p_message_limit?: number
        }
        Returns: {
          covers_event_seq_until: number
          head_event_seq: number
          server_ts: string
          snapshot: Json
        }[]
      }
      chat_get_inbox_v11: {
        Args: { p_cursor?: string; p_limit?: number }
        Returns: {
          activity_seq: number
          dialog_id: string
          has_draft: boolean
          last_read_seq: number
          muted: boolean
          next_cursor: string
          pinned_rank: number
          preview: string
          server_ts: string
          sort_key: string
          unread_count: number
        }[]
      }
      chat_get_inbox_v11_with_pointers: {
        Args: { p_cursor?: string; p_limit?: number }
        Returns: {
          activity_seq: number
          dialog_id: string
          has_draft: boolean
          last_read_seq: number
          last_sender_id: string
          muted: boolean
          next_cursor: string
          peer_last_read_seq: number
          pinned_rank: number
          preview: string
          server_ts: string
          sort_key: string
          unread_count: number
        }[]
      }
      chat_get_inbox_v2: {
        Args: { p_cursor_seq?: number; p_limit?: number }
        Returns: {
          conversation_id: string
          last_created_at: string
          last_message_id: string
          last_preview_text: string
          last_sender_id: string
          last_seq: number
          participants: Json
          unread_count: number
          updated_at: string
        }[]
      }
      chat_get_v11_health: {
        Args: never
        Returns: {
          ack_without_receipt_10s_count: number
          forced_resync_count: number
          server_ts: string
          write_receipt_latency_p95_ms: number
          write_receipt_samples: number
        }[]
      }
      chat_get_v11_health_extended: {
        Args: never
        Returns: {
          ack_without_receipt_10s_count: number
          forced_resync_count: number
          recovery_policy_last_labels: Json
          recovery_policy_last_seen_at: string
          recovery_policy_samples_15m: number
          server_ts: string
          write_receipt_latency_p95_ms: number
          write_receipt_samples: number
        }[]
      }
      chat_get_v11_release_gates: {
        Args: {
          p_max_ack_without_receipt_10s_count?: number
          p_max_forced_resync_count?: number
          p_max_write_receipt_latency_p95_ms?: number
          p_min_recovery_policy_samples_15m?: number
        }
        Returns: {
          ack_without_receipt_10s_count: number
          forced_resync_count: number
          gate_p0_ok: boolean
          gate_p1_ok: boolean
          gate_rollout_ok: boolean
          recovery_policy_samples_15m: number
          rollout_decision: string
          server_ts: string
          write_receipt_latency_p95_ms: number
        }[]
      }
      chat_get_v11_rollout_history: {
        Args: { p_limit?: number }
        Returns: {
          changed_at: string
          changed_by: string
          kill_switch: boolean
          note: string
          source: string
          stage: string
        }[]
      }
      chat_get_v11_rollout_state: {
        Args: never
        Returns: {
          gate_p0_ok: boolean
          gate_p1_ok: boolean
          gate_rollout_ok: boolean
          kill_switch: boolean
          note: string
          rollout_decision: string
          stage: string
          updated_at: string
        }[]
      }
      chat_ingest_client_metric_v11: {
        Args: { p_labels?: Json; p_name: string; p_value: number }
        Returns: {
          ok: boolean
          server_ts: string
        }[]
      }
      chat_mark_read_v11: {
        Args: {
          p_client_op_id: string
          p_client_sent_at?: string
          p_client_write_seq: number
          p_device_id: string
          p_dialog_id: string
          p_last_read_seq: number
        }
        Returns: {
          ack_id: string
          ack_status: string
          dialog_id: string
          error_code: string
          last_read_seq_applied: number
          server_ack_cursor: number
          server_ts: string
        }[]
      }
      chat_next_stream_seq: { Args: { p_stream_id: string }; Returns: number }
      chat_rate_limit_check_v1: {
        Args: { p_action: string; p_limit: number; p_window_seconds: number }
        Returns: undefined
      }
      chat_resync_stream_v11: {
        Args: {
          p_limit?: number
          p_since_event_seq?: number
          p_stream_id: string
        }
        Returns: {
          actor_id: string
          created_at: string
          dialog_id: string
          event_id: string
          event_seq: number
          event_type: string
          flags_json: Json
          head_event_seq: number
          payload_hash: string
          payload_json: Json
          retention_min_seq: number
          scope: string
          server_ts: string
          stream_id: string
        }[]
      }
      chat_schema_probe_v1: { Args: never; Returns: Json }
      chat_schema_probe_v2: { Args: never; Returns: Json }
      chat_send_message_v11: {
        Args: {
          p_client_msg_id: string
          p_client_sent_at?: string
          p_client_write_seq: number
          p_content: string
          p_device_id: string
          p_dialog_id: string
        }
        Returns: {
          ack_id: string
          ack_status: string
          dialog_id: string
          error_code: string
          msg_id: string
          msg_seq: number
          server_ack_cursor: number
          server_ts: string
        }[]
      }
      chat_set_subscription_mode_v11: {
        Args: { p_device_id: string; p_dialog_id: string; p_mode: string }
        Returns: {
          active_count: number
          applied_mode: string
          background_count: number
          ok: boolean
          total_count: number
        }[]
      }
      chat_set_v11_rollout_state: {
        Args: { p_kill_switch: boolean; p_note?: string; p_stage: string }
        Returns: {
          kill_switch: boolean
          note: string
          stage: string
          updated_at: string
        }[]
      }
      chat_sha256_hex: { Args: { input: string }; Returns: string }
      chat_status_write_v11: {
        Args: { p_client_write_seq: number; p_device_id: string }
        Returns: {
          dialog_id: string
          last_read_seq_applied: number
          msg_id: string
          msg_seq: number
          server_ts: string
          status: string
        }[]
      }
      chat_subscription_ttl_sweep_v11: {
        Args: { p_user_id?: string }
        Returns: number
      }
      check_chat_ban: {
        Args: { p_session_id: number; p_user_id: string }
        Returns: boolean
      }
      check_controversial_content_v1: {
        Args: {
          p_hide_threshold?: number
          p_reel_id: string
          p_report_threshold?: number
          p_velocity_threshold?: number
        }
        Returns: boolean
      }
      check_guardrails_v1: {
        Args: never
        Returns: {
          alert_created: boolean
          current_value: number
          guardrail_name: string
          severity: string
          threshold: number
          violated: boolean
        }[]
      }
      check_hashtag_search_rate_limit_v1: {
        Args: {
          p_max_searches_per_minute?: number
          p_session_id?: string
          p_user_id?: string
        }
        Returns: boolean
      }
      check_missed_calls: { Args: never; Returns: undefined }
      check_new_device: {
        Args: { p_fingerprint: string; p_user_id: string }
        Returns: boolean
      }
      claim_email_outbox_batch: {
        Args: { p_limit?: number; p_lock_seconds?: number }
        Returns: {
          attempt_count: number
          bcc_email: string[]
          cc_email: string[]
          created_at: string
          folder: string
          from_email: string | null
          html_body: string | null
          id: string
          idempotency_key: string | null
          is_starred: boolean
          last_error: string | null
          locked_until: string | null
          max_attempts: number
          next_attempt_at: string
          processing_started_at: string | null
          provider: string | null
          provider_message_id: string | null
          reply_to_message_id: string | null
          status: string
          subject: string | null
          template_key: string | null
          template_vars: Json
          text_body: string | null
          thread_id: string | null
          to_email: string
          updated_at: string
        }[]
        SetofOptions: {
          from: "*"
          to: "email_outbox"
          isOneToOne: false
          isSetofReturn: true
        }
      }
      claim_notification_events: {
        Args: { p_limit?: number }
        Returns: {
          attempts: number
          available_at: string
          collapse_key: string | null
          created_at: string
          dedup_key: string | null
          event_id: string
          last_error: string | null
          max_attempts: number
          payload: Json
          priority: number
          processed_at: string | null
          status: string
          ttl_seconds: number
          type: string
          updated_at: string
          user_id: string
        }[]
        SetofOptions: {
          from: "*"
          to: "notification_events"
          isOneToOne: false
          isSetofReturn: true
        }
      }
      claim_trend_runs_v1: {
        Args: {
          p_lease_seconds?: number
          p_limit?: number
          p_worker_id?: string
        }
        Returns: {
          run_id: string
          segment_id: string
          started_at: string
          window: string
        }[]
      }
      cleanup_controversial_flags_v1: {
        Args: { p_days_expired?: number }
        Returns: number
      }
      cleanup_expired_email_otps: { Args: never; Returns: number }
      cleanup_expired_insurance_data: { Args: never; Returns: undefined }
      cleanup_expired_otps: { Args: never; Returns: number }
      cleanup_expired_stories: { Args: never; Returns: number }
      cleanup_old_metric_samples_v1: {
        Args: { p_retention_days?: number }
        Returns: Json
      }
      cleanup_phase1_retention_v1: {
        Args: never
        Returns: {
          events_purged: number
          keys_purged: number
          tokens_purged: number
        }[]
      }
      cleanup_ranking_explanations_v1: {
        Args: { p_retention_days?: number }
        Returns: number
      }
      cmd_status: {
        Args: {
          p_actor_id: string
          p_command_type: string
          p_idempotency_key_norm: string
          p_scope_id: string
        }
        Returns: {
          outcome: Json
          outcome_code: string
          outcome_state: string
          source: string
        }[]
      }
      compute_session_analytics: {
        Args: { p_session_id: number }
        Returns: undefined
      }
      compute_trend_snapshot: {
        Args: {
          p_algorithm_version?: string
          p_anti_abuse_policy_id?: string
          p_hashtag: string
          p_lookback_hours?: number
        }
        Returns: {
          breakdown: Json
          confidence_score: number
          content_hash: string
          score: number
          snapshot_id: string
          trust_weight: number
          version_number: number
        }[]
      }
      compute_user_spam_score_v1: {
        Args: {
          p_lookback_days?: number
          p_policy_id?: string
          p_user_id: string
        }
        Returns: {
          bot_likelihood: number
          indicators_count: number
          is_coordinated_member: boolean
          policy_applied: string
          spam_score: number
          trust_weight: number
          user_id: string
        }[]
      }
      consume_backup_code: {
        Args: { p_code_hash: string; p_user_id: string }
        Returns: boolean
      }
      consume_one_time_prekey: {
        Args: { target_user_id: string }
        Returns: string
      }
      convert_group_to_supergroup: {
        Args: { p_conversation_id: string }
        Returns: undefined
      }
      create_channel: {
        Args: {
          p_avatar_url?: string
          p_description?: string
          p_is_public?: boolean
          p_name: string
        }
        Returns: string
      }
      create_channel_invite: {
        Args: { _channel_id: string; _max_uses?: number; _ttl_hours?: number }
        Returns: string
      }
      create_creator_metrics_snapshot_v1: {
        Args: { p_creator_id: string; p_snapshot_date?: string }
        Returns: boolean
      }
      create_group_chat: {
        Args: { p_avatar_url?: string; p_description?: string; p_name: string }
        Returns: string
      }
      create_group_invite: {
        Args: { _group_id: string; _max_uses?: number; _ttl_hours?: number }
        Returns: string
      }
      create_highlight_from_story: {
        Args: {
          p_highlight_cover_url: string
          p_highlight_title: string
          p_story_id: string
        }
        Returns: string
      }
      create_kpi_daily_snapshot_v1: {
        Args: { p_date?: string }
        Returns: {
          message: string
          success: boolean
        }[]
      }
      create_post_v1:
        | {
            Args: { p_content?: string; p_media?: Json; p_visibility?: string }
            Returns: {
              alt_text: string | null
              author_id: string
              comments_count: number
              comments_disabled: boolean
              comments_policy: string | null
              content: string | null
              created_at: string
              draft_id: string | null
              grid_sort_order: number | null
              hide_likes_count: boolean
              id: string
              is_draft: boolean | null
              is_paid_partnership: boolean | null
              is_published: boolean
              is_trial: boolean | null
              latitude: number | null
              likes_count: number
              location_lat: number | null
              location_lng: number | null
              location_name: string | null
              longitude: number | null
              pin_position: number | null
              publish_state: string | null
              reminder_at: string | null
              saves_count: number | null
              scheduled_at: string | null
              search_vector: unknown
              shares_count: number
              trial_audience_percent: number | null
              trial_ended_at: string | null
              trial_started_at: string | null
              trial_stats: Json | null
              updated_at: string
              views_count: number
              visibility: string | null
            }
            SetofOptions: {
              from: "*"
              to: "posts"
              isOneToOne: true
              isSetofReturn: false
            }
          }
        | {
            Args: {
              p_content?: string
              p_latitude?: number
              p_location_name?: string
              p_longitude?: number
              p_media?: Json
              p_visibility?: string
            }
            Returns: {
              alt_text: string | null
              author_id: string
              comments_count: number
              comments_disabled: boolean
              comments_policy: string | null
              content: string | null
              created_at: string
              draft_id: string | null
              grid_sort_order: number | null
              hide_likes_count: boolean
              id: string
              is_draft: boolean | null
              is_paid_partnership: boolean | null
              is_published: boolean
              is_trial: boolean | null
              latitude: number | null
              likes_count: number
              location_lat: number | null
              location_lng: number | null
              location_name: string | null
              longitude: number | null
              pin_position: number | null
              publish_state: string | null
              reminder_at: string | null
              saves_count: number | null
              scheduled_at: string | null
              search_vector: unknown
              shares_count: number
              trial_audience_percent: number | null
              trial_ended_at: string | null
              trial_started_at: string | null
              trial_stats: Json | null
              updated_at: string
              views_count: number
              visibility: string | null
            }
            SetofOptions: {
              from: "*"
              to: "posts"
              isOneToOne: true
              isSetofReturn: false
            }
          }
        | {
            Args: {
              p_comments_disabled?: boolean
              p_content?: string
              p_hide_likes_count?: boolean
              p_latitude?: number
              p_location_name?: string
              p_longitude?: number
              p_media?: Json
              p_visibility?: string
            }
            Returns: {
              alt_text: string | null
              author_id: string
              comments_count: number
              comments_disabled: boolean
              comments_policy: string | null
              content: string | null
              created_at: string
              draft_id: string | null
              grid_sort_order: number | null
              hide_likes_count: boolean
              id: string
              is_draft: boolean | null
              is_paid_partnership: boolean | null
              is_published: boolean
              is_trial: boolean | null
              latitude: number | null
              likes_count: number
              location_lat: number | null
              location_lng: number | null
              location_name: string | null
              longitude: number | null
              pin_position: number | null
              publish_state: string | null
              reminder_at: string | null
              saves_count: number | null
              scheduled_at: string | null
              search_vector: unknown
              shares_count: number
              trial_audience_percent: number | null
              trial_ended_at: string | null
              trial_started_at: string | null
              trial_stats: Json | null
              updated_at: string
              views_count: number
              visibility: string | null
            }
            SetofOptions: {
              from: "*"
              to: "posts"
              isOneToOne: true
              isSetofReturn: false
            }
          }
      create_reel_metrics_snapshot_v1: {
        Args: { p_reel_id: string; p_snapshot_date?: string }
        Returns: boolean
      }
      create_reel_v1:
        | {
            Args: {
              p_client_publish_id: string
              p_description?: string
              p_music_title?: string
              p_thumbnail_url?: string
              p_video_url: string
            }
            Returns: {
              ai_enhance: boolean
              allow_comments: boolean
              allow_download: boolean | null
              allow_remix: boolean | null
              audio_id: string | null
              author_id: string
              captions: Json | null
              captions_enabled: boolean
              channel_id: string | null
              client_publish_id: string | null
              comments_count: number | null
              created_at: string | null
              description: string | null
              draft_id: string | null
              duration: number | null
              duration_seconds: number | null
              effect_preset: string | null
              face_enhance: boolean
              id: string
              is_graphic_violence: boolean
              is_nsfw: boolean
              is_political_extremism: boolean
              is_time_lapse: boolean
              likes_count: number | null
              location_name: string | null
              max_duration_sec: number | null
              moderated_at: string | null
              moderated_by: string | null
              moderation_notes: string | null
              moderation_status: string
              music_title: string | null
              music_track_id: string | null
              original_fps: number | null
              publish_state: string | null
              remix_of: string | null
              reposts_count: number | null
              saves_count: number | null
              shares_count: number | null
              slow_motion_factor: number | null
              speed: number | null
              tagged_users: string[]
              template_id: string | null
              thumbnail_url: string | null
              video_url: string
              views_count: number | null
              visibility: string | null
            }
            SetofOptions: {
              from: "*"
              to: "reels"
              isOneToOne: true
              isSetofReturn: false
            }
          }
        | {
            Args: {
              p_allow_comments?: boolean
              p_allow_remix?: boolean
              p_client_publish_id: string
              p_description?: string
              p_location_name?: string
              p_music_title?: string
              p_tagged_users?: string[]
              p_thumbnail_url?: string
              p_video_url: string
              p_visibility?: string
            }
            Returns: {
              ai_enhance: boolean
              allow_comments: boolean
              allow_download: boolean | null
              allow_remix: boolean | null
              audio_id: string | null
              author_id: string
              captions: Json | null
              captions_enabled: boolean
              channel_id: string | null
              client_publish_id: string | null
              comments_count: number | null
              created_at: string | null
              description: string | null
              draft_id: string | null
              duration: number | null
              duration_seconds: number | null
              effect_preset: string | null
              face_enhance: boolean
              id: string
              is_graphic_violence: boolean
              is_nsfw: boolean
              is_political_extremism: boolean
              is_time_lapse: boolean
              likes_count: number | null
              location_name: string | null
              max_duration_sec: number | null
              moderated_at: string | null
              moderated_by: string | null
              moderation_notes: string | null
              moderation_status: string
              music_title: string | null
              music_track_id: string | null
              original_fps: number | null
              publish_state: string | null
              remix_of: string | null
              reposts_count: number | null
              saves_count: number | null
              shares_count: number | null
              slow_motion_factor: number | null
              speed: number | null
              tagged_users: string[]
              template_id: string | null
              thumbnail_url: string | null
              video_url: string
              views_count: number | null
              visibility: string | null
            }
            SetofOptions: {
              from: "*"
              to: "reels"
              isOneToOne: true
              isSetofReturn: false
            }
          }
        | {
            Args: {
              p_ai_enhance?: boolean
              p_allow_comments?: boolean
              p_allow_remix?: boolean
              p_client_publish_id: string
              p_description?: string
              p_effect_preset?: string
              p_face_enhance?: boolean
              p_location_name?: string
              p_max_duration_sec?: number
              p_music_title?: string
              p_music_track_id?: string
              p_tagged_users?: string[]
              p_thumbnail_url?: string
              p_video_url: string
              p_visibility?: string
            }
            Returns: {
              ai_enhance: boolean
              allow_comments: boolean
              allow_download: boolean | null
              allow_remix: boolean | null
              audio_id: string | null
              author_id: string
              captions: Json | null
              captions_enabled: boolean
              channel_id: string | null
              client_publish_id: string | null
              comments_count: number | null
              created_at: string | null
              description: string | null
              draft_id: string | null
              duration: number | null
              duration_seconds: number | null
              effect_preset: string | null
              face_enhance: boolean
              id: string
              is_graphic_violence: boolean
              is_nsfw: boolean
              is_political_extremism: boolean
              is_time_lapse: boolean
              likes_count: number | null
              location_name: string | null
              max_duration_sec: number | null
              moderated_at: string | null
              moderated_by: string | null
              moderation_notes: string | null
              moderation_status: string
              music_title: string | null
              music_track_id: string | null
              original_fps: number | null
              publish_state: string | null
              remix_of: string | null
              reposts_count: number | null
              saves_count: number | null
              shares_count: number | null
              slow_motion_factor: number | null
              speed: number | null
              tagged_users: string[]
              template_id: string | null
              thumbnail_url: string | null
              video_url: string
              views_count: number | null
              visibility: string | null
            }
            SetofOptions: {
              from: "*"
              to: "reels"
              isOneToOne: true
              isSetofReturn: false
            }
          }
      create_scope: {
        Args: {
          p_dm_user_id?: string
          p_join_mode?: string
          p_policy_hash?: string
          p_policy_version?: number
          p_scope_type: string
          p_visibility?: string
        }
        Returns: {
          error: string
          scope_id: string
          status: string
        }[]
      }
      crm_update_vin_check: {
        Args: { p_checked_at: string; p_vehicle_id: string; p_vin_result: Json }
        Returns: undefined
      }
      decrement_viewer_count: {
        Args: { p_session_id: number }
        Returns: undefined
      }
      decrypt_service_key_v1: { Args: { p_encrypted: string }; Returns: string }
      delivery_claim_batch_v1: {
        Args: { p_limit?: number; p_worker_id: string }
        Returns: {
          aggregate_id: string
          attempts: number
          event_type: string
          id: string
          payload: Json
          topic: string
        }[]
      }
      delivery_mark_done_v1: { Args: { p_id: string }; Returns: undefined }
      delivery_mark_fail_v1: {
        Args: {
          p_backoff_seconds?: number
          p_error: string
          p_id: string
          p_max_attempts?: number
        }
        Returns: undefined
      }
      detect_coordinated_hashtag_attack_v1: {
        Args: {
          p_hashtag_tag: string
          p_similarity_threshold?: number
          p_window_hours?: number
        }
        Returns: {
          is_suspicious: boolean
          similar_pattern_count: number
          suspicious_account_count: number
          velocity_spike_detected: boolean
        }[]
      }
      detect_trending_topics: { Args: never; Returns: undefined }
      dialog_get_snapshot_v1: {
        Args: {
          p_conversation_id: string
          p_page_offset?: number
          p_page_size?: number
        }
        Returns: {
          max_seq: number
          messages: Json
          min_seq: number
          page_offset: number
          page_size: number
          total_messages: number
        }[]
      }
      disable_conversation_encryption: {
        Args: { p_conversation_id: string }
        Returns: Json
      }
      disablelongtransactions: { Args: never; Returns: string }
      dispatch_scheduled_messages: { Args: never; Returns: number }
      dropgeometrycolumn:
        | {
            Args: {
              catalog_name: string
              column_name: string
              schema_name: string
              table_name: string
            }
            Returns: string
          }
        | {
            Args: {
              column_name: string
              schema_name: string
              table_name: string
            }
            Returns: string
          }
        | { Args: { column_name: string; table_name: string }; Returns: string }
      dropgeometrytable:
        | {
            Args: {
              catalog_name: string
              schema_name: string
              table_name: string
            }
            Returns: string
          }
        | { Args: { schema_name: string; table_name: string }; Returns: string }
        | { Args: { table_name: string }; Returns: string }
      duplicate_project: {
        Args: { p_new_user_id: string; p_source_project_id: string }
        Returns: string
      }
      each: { Args: { hs: unknown }; Returns: Record<string, unknown>[] }
      edge_rate_limit_check: {
        Args: { p_key: string; p_max: number; p_window_seconds: number }
        Returns: Json
      }
      editor_user_owns_project: {
        Args: { p_project_id: string }
        Returns: boolean
      }
      emit_decision_event: {
        Args: {
          p_actor_id?: string
          p_actor_type?: string
          p_algorithm_version: string
          p_event_type: string
          p_execution_context?: Json
          p_idempotency_key?: string
          p_payload: Json
          p_source_system: string
          p_subject_id: string
          p_subject_type: string
        }
        Returns: {
          created_at: string
          event_id: string
          stored_ok: boolean
        }[]
      }
      enable_conversation_encryption: {
        Args: { p_conversation_id: string; p_key_version: number }
        Returns: Json
      }
      enablelongtransactions: { Args: never; Returns: string }
      encrypt_service_key_v1: { Args: { p_plaintext: string }; Returns: string }
      end_explore_session_v1: {
        Args: { p_session_id: string }
        Returns: boolean
      }
      enforce_basic_text_moderation_v1: {
        Args: { p_text: string }
        Returns: undefined
      }
      enforce_rate_limit_v1: {
        Args: {
          p_action: string
          p_actor_id: string
          p_actor_type: Database["public"]["Enums"]["actor_type"]
          p_cost?: number
        }
        Returns: boolean
      }
      enqueue_decision_job_v1: {
        Args: {
          p_idempotency_key?: string
          p_job_type: string
          p_payload: Json
          p_priority?: number
          p_subject_id: string
          p_subject_type: string
        }
        Returns: {
          job_id: string
          queued: boolean
          status: string
        }[]
      }
      enqueue_hashtag_cache_rebuild_v1: {
        Args: { p_hashtag?: string; p_rebuild_scope?: string }
        Returns: {
          hashtag: string
          job_queued: boolean
          rebuild_scope: string
        }[]
      }
      enqueue_notification_event: {
        Args: {
          p_collapse_key?: string
          p_dedup_key?: string
          p_max_attempts?: number
          p_payload: Json
          p_priority?: number
          p_ttl_seconds?: number
          p_type: string
          p_user_id: string
        }
        Returns: {
          attempts: number
          available_at: string
          collapse_key: string | null
          created_at: string
          dedup_key: string | null
          event_id: string
          last_error: string | null
          max_attempts: number
          payload: Json
          priority: number
          processed_at: string | null
          status: string
          ttl_seconds: number
          type: string
          updated_at: string
          user_id: string
        }
        SetofOptions: {
          from: "*"
          to: "notification_events"
          isOneToOne: true
          isSetofReturn: false
        }
      }
      equals: { Args: { geom1: unknown; geom2: unknown }; Returns: boolean }
      evaluate_guardrails_v1: {
        Args: { p_labels?: Json; p_metric_name: string; p_value: number }
        Returns: Json
      }
      evaluate_hashtag_rollback_eligibility_v1: {
        Args: { p_hashtag: string }
        Returns: {
          confidence_score: number
          false_positive_likelihood: number
          hashtag: string
          rollback_candidate: boolean
        }[]
      }
      evaluate_rollback: {
        Args: {
          p_lookback_hours?: number
          p_rollback_policy_id?: string
          p_subject_id: string
          p_subject_type: string
        }
        Returns: {
          confidence_score: number
          false_positive_rate: number
          reason: string
          recommended_status: string
          sample_size: number
          should_rollback: boolean
        }[]
      }
      execute_trend_run_v1: {
        Args: { p_run_id: string }
        Returns: {
          ended_at: string
          outputs: Json
          run_id: string
          started_at: string
          status: string
          window: string
        }[]
      }
      expire_live_locations_v1: { Args: never; Returns: number }
      expire_old_emergency_signals: { Args: never; Returns: number }
      extract_hashtags: { Args: { p_text: string }; Returns: string[] }
      fetch_messages_delegated_v1: {
        Args: {
          p_before_seq?: number
          p_conversation_id: string
          p_limit?: number
          p_user_id: string
        }
        Returns: {
          client_msg_id: string
          content: string
          conversation_id: string
          created_at: string
          duration_seconds: number
          id: string
          media_type: string
          media_url: string
          sender_id: string
          seq: number
          shared_post_id: string
          shared_reel_id: string
        }[]
      }
      fetch_messages_v1: {
        Args: {
          p_before_seq?: number
          p_conversation_id: string
          p_limit?: number
        }
        Returns: {
          client_msg_id: string
          content: string
          conversation_id: string
          created_at: string
          duration_seconds: number
          id: string
          media_type: string
          media_url: string
          sender_id: string
          seq: number
          shared_post_id: string
          shared_reel_id: string
        }[]
      }
      find_people_nearby: {
        Args: {
          p_lat: number
          p_limit?: number
          p_lon: number
          p_radius_meters?: number
          p_user_id: string
        }
        Returns: {
          distance_meters: number
          last_updated: string
          user_id: string
        }[]
      }
      fn_cleanup_expired_invites: { Args: never; Returns: number }
      fn_cleanup_idempotency_hot: { Args: never; Returns: number }
      fn_validate_idempotency_identity: {
        Args: {
          p_actor_id: string
          p_command_type: string
          p_idempotency_key_norm: string
          p_payload_hash: string
          p_scope_id: string
        }
        Returns: {
          outcome: Json
          outcome_code: string
          outcome_state: string
        }[]
      }
      fn_validate_maintenance_transition: {
        Args: { p_current_mode: string; p_new_mode: string }
        Returns: boolean
      }
      fn_validate_policy_hash: {
        Args: { p_expected_policy_hash: string; p_policy_json: Json }
        Returns: boolean
      }
      generate_bot_username: {
        Args: { base_name: string; owner_id: string }
        Returns: string
      }
      geometry: { Args: { "": string }; Returns: unknown }
      geometry_above: {
        Args: { geom1: unknown; geom2: unknown }
        Returns: boolean
      }
      geometry_below: {
        Args: { geom1: unknown; geom2: unknown }
        Returns: boolean
      }
      geometry_cmp: {
        Args: { geom1: unknown; geom2: unknown }
        Returns: number
      }
      geometry_contained_3d: {
        Args: { geom1: unknown; geom2: unknown }
        Returns: boolean
      }
      geometry_contains: {
        Args: { geom1: unknown; geom2: unknown }
        Returns: boolean
      }
      geometry_contains_3d: {
        Args: { geom1: unknown; geom2: unknown }
        Returns: boolean
      }
      geometry_distance_box: {
        Args: { geom1: unknown; geom2: unknown }
        Returns: number
      }
      geometry_distance_centroid: {
        Args: { geom1: unknown; geom2: unknown }
        Returns: number
      }
      geometry_eq: {
        Args: { geom1: unknown; geom2: unknown }
        Returns: boolean
      }
      geometry_ge: {
        Args: { geom1: unknown; geom2: unknown }
        Returns: boolean
      }
      geometry_gt: {
        Args: { geom1: unknown; geom2: unknown }
        Returns: boolean
      }
      geometry_le: {
        Args: { geom1: unknown; geom2: unknown }
        Returns: boolean
      }
      geometry_left: {
        Args: { geom1: unknown; geom2: unknown }
        Returns: boolean
      }
      geometry_lt: {
        Args: { geom1: unknown; geom2: unknown }
        Returns: boolean
      }
      geometry_overabove: {
        Args: { geom1: unknown; geom2: unknown }
        Returns: boolean
      }
      geometry_overbelow: {
        Args: { geom1: unknown; geom2: unknown }
        Returns: boolean
      }
      geometry_overlaps: {
        Args: { geom1: unknown; geom2: unknown }
        Returns: boolean
      }
      geometry_overlaps_3d: {
        Args: { geom1: unknown; geom2: unknown }
        Returns: boolean
      }
      geometry_overleft: {
        Args: { geom1: unknown; geom2: unknown }
        Returns: boolean
      }
      geometry_overright: {
        Args: { geom1: unknown; geom2: unknown }
        Returns: boolean
      }
      geometry_right: {
        Args: { geom1: unknown; geom2: unknown }
        Returns: boolean
      }
      geometry_same: {
        Args: { geom1: unknown; geom2: unknown }
        Returns: boolean
      }
      geometry_same_3d: {
        Args: { geom1: unknown; geom2: unknown }
        Returns: boolean
      }
      geometry_within: {
        Args: { geom1: unknown; geom2: unknown }
        Returns: boolean
      }
      geomfromewkt: { Args: { "": string }; Returns: unknown }
      get_active_guardrail_breaches_v1:
        | {
            Args: never
            Returns: {
              affected_feature: string
              created_at: string
              current_value: number
              metric_name: string
              severity: string
              threshold: number
            }[]
          }
        | { Args: { p_lookback_minutes?: number }; Returns: Json }
      get_active_live_sessions_v1: {
        Args: { p_limit?: number }
        Returns: {
          category: string
          creator_id: string
          id: number
          started_at: string
          thumbnail_url: string
          title: string
          viewer_count_current: number
        }[]
      }
      get_active_livestreams: {
        Args: { p_limit?: number; p_offset?: number }
        Returns: {
          category: string
          creator_avatar_url: string
          creator_id: string
          creator_username: string
          description: string
          ingest_protocol: string
          is_mature_content: boolean
          language: string
          session_id: number
          started_at: string
          tags: string[]
          thumbnail_url: string
          title: string
          viewer_count: number
        }[]
      }
      get_audio_boost_score: { Args: { p_reel_id: string }; Returns: number }
      get_author_fatigue_penalty_v1: {
        Args: {
          p_author_id: string
          p_user_id: string
          p_window_hours?: number
        }
        Returns: number
      }
      get_business_stats: { Args: { p_business_id: string }; Returns: Json }
      get_content_distribution_class_v1: {
        Args: { p_content_id: string; p_content_type: string }
        Returns: Database["public"]["Enums"]["distribution_class"]
      }
      get_controversial_penalty_v1: {
        Args: { p_reel_id: string }
        Returns: number
      }
      get_creator_dashboard_v1: {
        Args: { p_creator_id: string }
        Returns: Json
      }
      get_creator_growth_v1: {
        Args: { p_creator_id: string; p_days?: number }
        Returns: {
          avg_watched_rate: number
          snapshot_date: string
          total_followers: number
          total_impressions: number
          total_reels: number
        }[]
      }
      get_creator_insights: { Args: { p_days?: number }; Returns: Json }
      get_creator_metrics_v1: {
        Args: never
        Returns: {
          active_creators_count: number
          avg_reels_per_creator: number
          creator_return_rate_7d: number
          new_creators_count: number
        }[]
      }
      get_creator_recommendations_v1: {
        Args: { p_creator_id: string; p_limit?: number }
        Returns: {
          hint: string
          metrics: Json
          opportunity_type: string
          priority: number
          reel_id: string
        }[]
      }
      get_diversity_config_v1: {
        Args: { p_user_id: string }
        Returns: {
          author_diversity_score: number
          exploration_ratio: number
          is_echo_chamber: boolean
          safety_boost: number
        }[]
      }
      get_engagement_metrics_v1: {
        Args: never
        Returns: {
          avg_session_duration_seconds: number
          content_completion_rate: number
          session_count: number
        }[]
      }
      get_explore_categories_v1: {
        Args: {
          p_limit_categories?: number
          p_limit_reels_per_category?: number
        }
        Returns: {
          category_id: string
          category_name: string
          display_name: string
          icon_name: string
          reels: Json
        }[]
      }
      get_explore_fresh_creators_v1: {
        Args: {
          p_limit?: number
          p_max_age_days?: number
          p_min_reels_count?: number
          p_min_trust_score?: number
        }
        Returns: {
          avatar_url: string
          created_at: string
          display_name: string
          reels_count: number
          trust_score: number
          user_id: string
        }[]
      }
      get_explore_page_v1: {
        Args: {
          p_allow_stale?: boolean
          p_country?: string
          p_force_refresh?: boolean
          p_locale?: string
          p_segment_id?: string
        }
        Returns: Json
      }
      get_explore_page_v2: {
        Args: {
          p_allow_stale?: boolean
          p_country?: string
          p_force_refresh?: boolean
          p_locale?: string
          p_segment_id?: string
          p_user_id?: string
        }
        Returns: Json
      }
      get_feed_explanation_summary_v1: {
        Args: { p_request_id: string }
        Returns: {
          avg_score: number
          cold_start_mode: boolean
          controversial_items_filtered: number
          echo_chamber_mitigation: boolean
          source_pool_distribution: Json
          total_items: number
        }[]
      }
      get_hashtag_boost_score: { Args: { p_reel_id: string }; Returns: number }
      get_hashtag_feed_v1: {
        Args: {
          p_hashtag_tag: string
          p_limit?: number
          p_offset?: number
          p_surface?: string
          p_user_id?: string
        }
        Returns: {
          author_id: string
          created_at: string
          description: string
          likes_count: number
          reel_id: string
          relevance_score: number
          surface: string
          thumbnail_url: string
          video_url: string
          views_count: number
        }[]
      }
      get_hashtag_page_v1: {
        Args: {
          p_hashtag: string
          p_limit?: number
          p_offset?: number
          p_section?: string
        }
        Returns: Json
      }
      get_kpi_dashboard_v1: {
        Args: never
        Returns: {
          active_guardrail_breaches: number
          avg_session_duration_seconds: number
          content_completion_rate: number
          creator_return_rate_7d: number
          dau: number
          kpi_status: string
          moderation_queue_age_hours: number
          report_rate_per_1k: number
          retention_7d: number
          snapshot_date: string
        }[]
      }
      get_live_location_v1: { Args: { p_message_id: string }; Returns: Json }
      get_livestream_stats: { Args: { p_session_id: number }; Returns: Json }
      get_metric_samples_v1: {
        Args: {
          p_limit?: number
          p_lookback_minutes?: number
          p_metric_name: string
        }
        Returns: {
          labels: Json
          ts: string
          value: number
        }[]
      }
      get_ml_personalized_reels_feed: {
        Args: {
          p_exploration_ratio?: number
          p_limit?: number
          p_user_id: string
        }
        Returns: {
          author_id: string
          comments_count: number
          created_at: string
          description: string
          diversity_score: number
          engagement_score: number
          final_score: number
          likes_count: number
          music_title: string
          personalization_score: number
          recency_score: number
          recommendation_reason: string
          reel_id: string
          reposts_count: number
          saves_count: number
          shares_count: number
          thumbnail_url: string
          video_url: string
          views_count: number
          virality_score: number
        }[]
      }
      get_my_appeals_v1: {
        Args: { p_limit?: number }
        Returns: {
          appeal_id: string
          content_id: string
          content_type: string
          public_response: string
          reason: Database["public"]["Enums"]["appeal_reason"]
          reviewed_at: string
          status: Database["public"]["Enums"]["appeal_status"]
          submitted_at: string
        }[]
      }
      get_or_create_dm: { Args: { target_user_id: string }; Returns: string }
      get_or_create_dm_by_display_name: {
        Args: { target_display_name: string }
        Returns: string
      }
      get_or_create_dm_delegated_v1: {
        Args: { p_user_id: string; target_user_id: string }
        Returns: string
      }
      get_or_create_hashtag: { Args: { p_raw_tag: string }; Returns: string }
      get_participant_role: {
        Args: { p_conversation_id: string; p_user_id: string }
        Returns: string
      }
      get_pending_appeals_v1: {
        Args: { p_limit?: number }
        Returns: {
          appeal_id: string
          author_id: string
          content_id: string
          content_type: string
          original_decision: Database["public"]["Enums"]["moderation_decision"]
          reason: Database["public"]["Enums"]["appeal_reason"]
          status: Database["public"]["Enums"]["appeal_status"]
          submitted_at: string
          user_explanation: string
          wait_time_hours: number
        }[]
      }
      get_promoted_posts_nearby: {
        Args: { p_lat: number; p_limit?: number; p_lng: number }
        Returns: {
          distance_km: number
          post_id: string
          promotion_id: string
        }[]
      }
      get_ranked_feed_v2: {
        Args: {
          p_cursor_created_at?: string
          p_cursor_id?: string
          p_mode?: string
          p_page_size?: number
          p_user_id: string
        }
        Returns: Database["public"]["CompositeTypes"]["feed_post_v2"][]
        SetofOptions: {
          from: "*"
          to: "feed_post_v2"
          isOneToOne: false
          isSetofReturn: true
        }
      }
      get_ranking_explanation_v1: {
        Args: { p_reel_id: string; p_request_id: string }
        Returns: {
          base_score: number
          boosts: Json
          final_score: number
          human_readable_reason: string
          penalties: Json
          source_pool: string
          top_boost: string
          top_penalty: string
        }[]
      }
      get_recommended_users_for_new_user: {
        Args: { limit_count?: number; p_user_id: string }
        Returns: {
          avatar_url: string
          display_name: string
          followers_count: number
          is_from_contacts: boolean
          user_id: string
          verified: boolean
        }[]
      }
      get_reel_hashtags: {
        Args: { p_reel_id: string }
        Returns: {
          display_tag: string
          hashtag_id: string
          hashtag_position: number
          relevance_score: number
          status: Database["public"]["Enums"]["hashtag_status"]
          tag: string
        }[]
      }
      get_reel_insights_v1: {
        Args: { p_reel_id: string; p_user_id?: string }
        Returns: Json
      }
      get_reel_metrics_v1: {
        Args: { p_reel_id: string; p_window?: string }
        Returns: Json
      }
      get_reels_feed_v2: {
        Args: {
          p_algorithm_version?: string
          p_exploration_ratio?: number
          p_freq_cap_hours?: number
          p_limit?: number
          p_offset?: number
          p_recency_days?: number
          p_session_id?: string
        }
        Returns: {
          algorithm_version: string
          author_id: string
          comments_count: number
          created_at: string
          description: string
          feed_position: number
          final_score: number
          id: string
          likes_count: number
          music_title: string
          recommendation_reason: string
          reposts_count: number
          request_id: string
          saves_count: number
          shares_count: number
          thumbnail_url: string
          video_url: string
          views_count: number
        }[]
      }
      get_related_hashtags_v1: {
        Args: { p_hashtag_tag: string; p_limit?: number }
        Returns: {
          co_occurrence_count: number
          display_tag: string
          hashtag_id: string
          relevance_score: number
          tag: string
        }[]
      }
      get_reporter_quality_multiplier_v1: {
        Args: { p_reporter_id: string }
        Returns: number
      }
      get_safety_metrics_v1: {
        Args: never
        Returns: {
          appeal_response_time_hours: number
          controversial_items_filtered: number
          moderation_queue_age_hours: number
          moderation_queue_items_pending: number
          report_rate_per_1k: number
        }[]
      }
      get_screen_time_today: { Args: never; Returns: number }
      get_service_key_v1: {
        Args: { p_key_id: string; p_service_id: string; p_tenant_id: string }
        Returns: {
          algorithm: string
          expires_at: string
          key_format: string
          key_material: string
        }[]
      }
      get_slo_status_v1: {
        Args: { p_domain?: string; p_lookback_minutes?: number }
        Returns: Json
      }
      get_topic_boost_score: { Args: { p_reel_id: string }; Returns: number }
      get_trending_audio_tracks: {
        Args: { p_limit?: number }
        Returns: {
          audio_track_id: string
          avg_completion_rate: number
          growth_rate_24h: number
          title: string
          trend_level: string
          usage_24h: number
          usage_count: number
          velocity_score: number
        }[]
      }
      get_trending_hashtags: {
        Args: { p_category?: string; p_limit?: number }
        Returns: {
          avg_completion_rate: number
          growth_rate: number
          hashtag_id: string
          tag: string
          trend_level: string
          usage_24h: number
          usage_count: number
        }[]
      }
      get_trending_hashtags_v1: {
        Args: { p_limit?: number }
        Returns: {
          hashtag: string
          normalized_tag: string
          reels_count: number
          status: string
          usage_last_24h: number
          velocity_score: number
        }[]
      }
      get_trending_reels_simple: {
        Args: { p_hours_window?: number; p_limit?: number }
        Returns: {
          likes_count: number
          reel_id: string
          thumbnail_url: string
          trending_score: number
          video_url: string
          views_count: number
        }[]
      }
      get_user_briefs: {
        Args: { p_user_ids: string[] }
        Returns: {
          avatar_url: string
          display_name: string
          user_id: string
          username: string
        }[]
      }
      get_user_cohorts_v1: {
        Args: { p_window_days?: number }
        Returns: {
          dau: number
          mau: number
          retention_30d: number
          retention_7d: number
          wau: number
        }[]
      }
      get_user_conversation_ids: {
        Args: { user_uuid: string }
        Returns: string[]
      }
      get_user_reels_v1: {
        Args: { p_author_id: string; p_limit?: number; p_offset?: number }
        Returns: {
          author_id: string
          comments_count: number
          created_at: string
          description: string
          id: string
          likes_count: number
          music_title: string
          reposts_count: number
          saves_count: number
          shares_count: number
          thumbnail_url: string
          video_url: string
          views_count: number
        }[]
      }
      get_user_tenant_id_v1: { Args: { p_user_id?: string }; Returns: string }
      get_vault_secret: { Args: { secret_id: string }; Returns: string }
      gettransactionid: { Args: never; Returns: unknown }
      has_role: {
        Args: {
          _role: Database["public"]["Enums"]["app_role"]
          _user_id: string
        }
        Returns: boolean
      }
      hash_secret: { Args: { secret: string }; Returns: string }
      hide_my_location: { Args: never; Returns: undefined }
      increment_music_use_count: {
        Args: { p_music_id: string }
        Returns: undefined
      }
      increment_screen_time: {
        Args: { p_seconds?: number }
        Returns: undefined
      }
      increment_template_use_count: {
        Args: { p_template_id: string }
        Returns: undefined
      }
      increment_viewer_count: {
        Args: { p_session_id: number }
        Returns: undefined
      }
      integration_webhook_create_v1: {
        Args: {
          _direction: string
          _events?: string[]
          _headers?: Json
          _is_active?: boolean
          _provider: string
          _secret?: string
          _url: string
        }
        Returns: string
      }
      integration_webhook_delete_v1: { Args: { _id: string }; Returns: boolean }
      integration_webhook_update_v1: {
        Args: {
          _events?: string[]
          _headers?: Json
          _id: string
          _is_active?: boolean
          _last_error?: string
          _last_status?: string
          _secret?: string
          _url?: string
        }
        Returns: boolean
      }
      internal_can_join_room_v1: {
        Args: { p_room: string; p_user_id: string }
        Returns: boolean
      }
      internal_event_gc_v1: {
        Args: { p_keep_seconds?: number }
        Returns: number
      }
      internal_event_register_v1: {
        Args: {
          p_event_id: string
          p_expires_at_ms: number
          p_issued_at_ms: number
          p_payload_hash?: string
          p_source?: string
        }
        Returns: boolean
      }
      is_admin_user: { Args: { uid: string }; Returns: boolean }
      is_blocked: {
        Args: { checker_id: string; target_id: string }
        Returns: boolean
      }
      is_channel_admin:
        | { Args: { _channel_id: string; _user_id: string }; Returns: boolean }
        | { Args: { p_channel_id: string }; Returns: boolean }
      is_channel_member: {
        Args: { _channel_id: string; _user_id: string }
        Returns: boolean
      }
      is_eligible_for_live_v1: {
        Args: { p_creator_id: string }
        Returns: {
          eligible: boolean
          reason: string
        }[]
      }
      is_feature_enabled_for_user_v1: {
        Args: { p_flag_name: string; p_user_id: string }
        Returns: boolean
      }
      is_group_member: {
        Args: { _group_id: string; _user_id: string }
        Returns: boolean
      }
      is_in_quiet_hours: { Args: { p_user_id: string }; Returns: boolean }
      is_reel_discoverable_v1: { Args: { p_reel_id: string }; Returns: boolean }
      is_user_in_dnd: { Args: { p_user_id: string }; Returns: boolean }
      issue_delegation_token_v1: {
        Args: {
          p_auth_context: Json
          p_expires_minutes?: number
          p_scopes: string[]
          p_service_id: string
        }
        Returns: {
          delegation_id: string
          token_jwt: string
          token_payload: Json
        }[]
      }
      join_channel_by_invite: { Args: { _token: string }; Returns: string }
      join_group_by_invite: { Args: { _token: string }; Returns: string }
      list_device_accounts_for_device: {
        Args: { p_device_id: string }
        Returns: {
          avatar_url: string
          created_at: string
          device_id: string
          display_name: string
          label: string
          last_active_at: string
          sort_order: number
          user_id: string
          username: string
        }[]
      }
      longtransactionsenabled: { Args: never; Returns: boolean }
      map_decision_to_distribution_class_v1: {
        Args: { p_decision: Database["public"]["Enums"]["moderation_decision"] }
        Returns: Database["public"]["Enums"]["distribution_class"]
      }
      media_get_signed_url_v1: {
        Args: { p_expires_in_seconds?: number; p_media_id: string }
        Returns: Json
      }
      media_register_upload_v1: {
        Args: {
          p_checksum_sha256?: string
          p_entity_id?: string
          p_entity_type?: string
          p_mime_type: string
          p_object_path: string
          p_size_bytes: number
        }
        Returns: string
      }
      message_delete_v1: { Args: { p_message_id: string }; Returns: Json }
      message_edit_v1: {
        Args: { p_message_id: string; p_new_body: string }
        Returns: Json
      }
      message_reminder_cancel_v1: {
        Args: { _reminder_id: string }
        Returns: boolean
      }
      message_reminder_complete_v1: {
        Args: { _reminder_id: string }
        Returns: boolean
      }
      message_reminder_create_v1: {
        Args: { _message_id: string; _note?: string; _remind_at: string }
        Returns: string
      }
      message_restore_v1: { Args: { p_message_id: string }; Returns: Json }
      message_save_v1: {
        Args: { _message_id: string; _note?: string; _tags?: string[] }
        Returns: string
      }
      message_unsave_v1: { Args: { _message_id: string }; Returns: boolean }
      message_update_saved_v1: {
        Args: { _note?: string; _saved_id: string; _tags?: string[] }
        Returns: boolean
      }
      moderate_hashtag: {
        Args: {
          p_new_status: Database["public"]["Enums"]["hashtag_status"]
          p_reason?: string
          p_tag: string
        }
        Returns: {
          hashtag_id: string
          new_status: Database["public"]["Enums"]["hashtag_status"]
          old_status: Database["public"]["Enums"]["hashtag_status"]
          tag: string
        }[]
      }
      nav_calculate_h3_index: {
        Args: { p_lat: number; p_lng: number; p_resolution?: number }
        Returns: string
      }
      nav_expire_reports: { Args: never; Returns: number }
      nav_nearby_drivers: {
        Args: {
          p_lat: number
          p_limit?: number
          p_lng: number
          p_radius_m?: number
          p_vehicle_class?: string
        }
        Returns: {
          acceptance_rate: number
          distance_m: number
          driver_id: string
          last_seen_at: string
          lat: number
          lng: number
          rating: number
          total_trips: number
          vehicle_class: string
          vehicle_type: string
        }[]
      }
      nav_nearby_pois: {
        Args: {
          p_category?: string
          p_lat: number
          p_limit?: number
          p_lng: number
          p_radius_m?: number
        }
        Returns: {
          address: string
          category: string
          distance_m: number
          h3_index_r9: string
          id: string
          is_verified: boolean
          lat: number
          lng: number
          name: string
          rating: number
          review_count: number
          subcategory: string
        }[]
      }
      nav_set_driver_availability: {
        Args: { p_availability: string; p_driver_id: string }
        Returns: {
          availability: string
          driver_id: string
          is_active: boolean
        }[]
      }
      nav_trip_state_transition: {
        Args: { p_actor_id?: string; p_new_status: string; p_trip_id: string }
        Returns: {
          error_code: string
          error_msg: string
          new_status: string
          old_status: string
          success: boolean
        }[]
      }
      nav_update_reporter_reputation: {
        Args: { p_user_id: string }
        Returns: undefined
      }
      next_edit_seq_v1: { Args: { p_conversation_id: string }; Returns: number }
      normalize_audio_key: { Args: { p_title: string }; Returns: string }
      pay_invoice_with_stars: {
        Args: { p_invoice_id: string; p_user_id: string }
        Returns: Json
      }
      populate_geometry_columns:
        | { Args: { tbl_oid: unknown; use_typmod?: boolean }; Returns: number }
        | { Args: { use_typmod?: boolean }; Returns: string }
      postgis_constraint_dims: {
        Args: { geomcolumn: string; geomschema: string; geomtable: string }
        Returns: number
      }
      postgis_constraint_srid: {
        Args: { geomcolumn: string; geomschema: string; geomtable: string }
        Returns: number
      }
      postgis_constraint_type: {
        Args: { geomcolumn: string; geomschema: string; geomtable: string }
        Returns: string
      }
      postgis_extensions_upgrade: { Args: never; Returns: string }
      postgis_full_version: { Args: never; Returns: string }
      postgis_geos_version: { Args: never; Returns: string }
      postgis_lib_build_date: { Args: never; Returns: string }
      postgis_lib_revision: { Args: never; Returns: string }
      postgis_lib_version: { Args: never; Returns: string }
      postgis_libjson_version: { Args: never; Returns: string }
      postgis_liblwgeom_version: { Args: never; Returns: string }
      postgis_libprotobuf_version: { Args: never; Returns: string }
      postgis_libxml_version: { Args: never; Returns: string }
      postgis_proj_version: { Args: never; Returns: string }
      postgis_scripts_build_date: { Args: never; Returns: string }
      postgis_scripts_installed: { Args: never; Returns: string }
      postgis_scripts_released: { Args: never; Returns: string }
      postgis_svn_version: { Args: never; Returns: string }
      postgis_type_name: {
        Args: {
          coord_dimension: number
          geomname: string
          use_new_name?: boolean
        }
        Returns: string
      }
      postgis_version: { Args: never; Returns: string }
      postgis_wagyu_version: { Args: never; Returns: string }
      process_disappearing_messages: { Args: never; Returns: number }
      process_scheduled_messages: { Args: never; Returns: number }
      publish_call_event: {
        Args: { p_call_id: string; p_event_type: string; p_payload: Json }
        Returns: undefined
      }
      publish_scheduled_posts: { Args: never; Returns: number }
      purge_delegation_tokens_v1: {
        Args: never
        Returns: {
          purged_count: number
        }[]
      }
      purge_risk_events_v1: {
        Args: never
        Returns: {
          purged_count: number
        }[]
      }
      purge_service_keys_v1: {
        Args: never
        Returns: {
          purged_count: number
        }[]
      }
      recalculate_agent_loyalty: {
        Args: { p_agent_id: string }
        Returns: undefined
      }
      recompute_snapshot: {
        Args: { p_snapshot_id: string }
        Returns: {
          content_hash_matches: boolean
          error_message: string
          matches_previous: boolean
        }[]
      }
      record_hashtag_moderation_v1: {
        Args: {
          p_actor_id: string
          p_confidence?: number
          p_from_status: string
          p_hashtag: string
          p_reason_codes?: string[]
          p_spam_score?: number
          p_surface_policy?: string
          p_to_status: string
        }
        Returns: {
          event_recorded: boolean
          hashtag: string
          info: string
        }[]
      }
      record_post_view: {
        Args: { p_channel_id: string; p_post_id: string }
        Returns: undefined
      }
      record_ranking_explanation_v1: {
        Args: {
          p_algorithm_version?: string
          p_base_score: number
          p_boosts?: Json
          p_cold_start_segment?: string
          p_config_id?: string
          p_controversial_penalty?: number
          p_diversity_constraints?: Json
          p_echo_chamber?: boolean
          p_exploration_ratio?: number
          p_final_score: number
          p_is_cold_start?: boolean
          p_penalties?: Json
          p_position: number
          p_reel_id: string
          p_request_id: string
          p_session_id: string
          p_source_pool: string
          p_user_id: string
        }
        Returns: string
      }
      record_receipt: {
        Args: {
          p_device_id: string
          p_last_delivered_seq: number
          p_last_read_seq: number
          p_scope_id: string
          p_trace_id: string
        }
        Returns: {
          error: string
          status: string
        }[]
      }
      record_reel_impression: {
        Args: {
          p_algorithm_version?: string
          p_position?: number
          p_reel_id: string
          p_request_id?: string
          p_score?: number
          p_session_id?: string
          p_source?: string
        }
        Returns: undefined
      }
      record_reel_impression_v2:
        | {
            Args: {
              p_algorithm_version?: string
              p_position?: number
              p_reel_id: string
              p_request_id?: string
              p_score?: number
              p_session_id?: string
              p_source?: string
            }
            Returns: undefined
          }
        | {
            Args: {
              p_algorithm_version?: string
              p_position?: number
              p_reel_id: string
              p_request_id?: string
              p_score?: number
              p_session_id?: string
              p_source?: string
            }
            Returns: undefined
          }
      record_reel_impressions_batch: {
        Args: { p_impressions: Json }
        Returns: undefined
      }
      record_reel_interaction:
        | {
            Args: {
              p_commented?: boolean
              p_hidden?: boolean
              p_liked?: boolean
              p_reel_duration_seconds?: number
              p_reel_id: string
              p_report_reason?: string
              p_reported?: boolean
              p_saved?: boolean
              p_session_id?: string
              p_shared?: boolean
              p_skipped_at_second?: number
              p_user_id: string
              p_watch_duration_seconds?: number
            }
            Returns: undefined
          }
        | {
            Args: {
              p_completion_rate?: number
              p_liked?: boolean
              p_reel_id: string
              p_saved?: boolean
              p_shared?: boolean
              p_skipped_quickly?: boolean
              p_user_id: string
              p_watch_duration_seconds?: number
              p_watched?: boolean
            }
            Returns: undefined
          }
      record_reel_skip:
        | {
            Args: { p_reel_id: string; p_session_id?: string }
            Returns: undefined
          }
        | {
            Args: {
              p_reel_duration_seconds: number
              p_reel_id: string
              p_session_id?: string
              p_skipped_at_second: number
            }
            Returns: undefined
          }
      record_reel_view:
        | { Args: { p_reel_id: string }; Returns: undefined }
        | {
            Args: { p_reel_id: string; p_session_id?: string }
            Returns: boolean
          }
      record_reel_viewed: {
        Args: { p_reel_id: string; p_session_id?: string }
        Returns: undefined
      }
      record_reel_watched:
        | {
            Args: {
              p_completion?: number
              p_duration?: number
              p_reel_id: string
              p_session_id?: string
            }
            Returns: undefined
          }
        | {
            Args: {
              p_reel_duration_seconds: number
              p_reel_id: string
              p_session_id?: string
              p_watch_duration_seconds: number
            }
            Returns: undefined
          }
      record_spam_indicator_v1: {
        Args: {
          p_confidence: number
          p_evidence: Json
          p_indicator_type: string
          p_severity: string
          p_source?: string
          p_source_user_id?: string
          p_user_id: string
        }
        Returns: {
          action_recommended: string
          indicator_id: string
          spam_score: number
          trust_weight: number
        }[]
      }
      reels_engine_activate_config:
        | { Args: { p_version_id: string }; Returns: undefined }
        | {
            Args: { p_segment_id: string; p_version_id: string }
            Returns: Json
          }
      reels_engine_activate_config_v1: {
        Args: { p_segment_id: string; p_version_id: string }
        Returns: Json
      }
      reels_engine_apply_action: {
        Args: {
          p_action_type: string
          p_environment?: string
          p_idempotency_key: string
          p_is_major?: boolean
          p_payload?: Json
          p_priority?: number
          p_reason?: string
          p_segment_key: string
        }
        Returns: {
          action_id: string
          message: string
          status: Database["public"]["Enums"]["reels_engine_action_status"]
        }[]
      }
      reels_engine_clear_pipeline_suppression: {
        Args: {
          p_environment: string
          p_reason?: string
          p_segment_key: string
        }
        Returns: undefined
      }
      reels_engine_get_active_config: {
        Args: { p_environment?: string }
        Returns: {
          activated_at: string
          config: Json
          description: string
          version_id: string
        }[]
      }
      reels_engine_get_pipeline_suppression: {
        Args: { p_environment: string; p_segment_key: string }
        Returns: {
          is_suppressed: boolean
          reason: string
          suppressed_until: string
        }[]
      }
      reels_engine_get_pipeline_suppression_v2: {
        Args: { p_environment: string; p_segment_key: string }
        Returns: {
          is_suppressed: boolean
          reason: string
          suppressed_at: string
          suppressed_until: string
        }[]
      }
      reels_engine_lock_segment: {
        Args: { p_environment: string; p_segment_key: string }
        Returns: undefined
      }
      reels_engine_monitor_snapshot_v1: {
        Args: { p_window_minutes?: number }
        Returns: Json
      }
      reels_engine_propose_config: {
        Args: {
          p_config: Json
          p_description?: string
          p_environment?: string
          p_parent_id?: string
        }
        Returns: string
      }
      reels_engine_rbac_audit_v1: {
        Args: never
        Returns: {
          anon_exec: boolean
          args: string
          authenticated_exec: boolean
          fn: string
          owner: string
          public_exec: boolean
          violation: boolean
        }[]
      }
      reels_engine_record_decision_v1: {
        Args: {
          p_action_type: string
          p_decision_source?: string
          p_environment?: string
          p_idempotency_key: string
          p_is_major?: boolean
          p_payload?: Json
          p_priority?: number
          p_reason?: string
          p_reason_code?: string
          p_segment_key: string
          p_status?: Database["public"]["Enums"]["reels_engine_action_status"]
        }
        Returns: {
          action_id: string
          message: string
          status: Database["public"]["Enums"]["reels_engine_action_status"]
        }[]
      }
      reels_engine_require_service_role: { Args: never; Returns: undefined }
      reels_engine_set_pipeline_suppression: {
        Args: {
          p_environment: string
          p_reason: string
          p_segment_key: string
          p_suppressed_until: string
        }
        Returns: undefined
      }
      reels_engine_validate_config_v1: {
        Args: { p_config: Json }
        Returns: Json
      }
      reels_engine_validate_config_version_v1: {
        Args: { p_version_id: string }
        Returns: Json
      }
      refund_invoice_stars: {
        Args: { p_amount: number; p_invoice_id: string; p_reason: string }
        Returns: Json
      }
      replenish_one_time_prekeys: {
        Args: { new_keys: string[] }
        Returns: undefined
      }
      report_live_stream_v1: {
        Args: {
          p_description?: string
          p_report_type: string
          p_reporter_id: string
          p_session_id: number
        }
        Returns: {
          message: string
          success: boolean
        }[]
      }
      review_appeal_v1: {
        Args: {
          p_appeal_id: string
          p_decision: string
          p_moderator_admin_id: string
          p_moderator_response?: string
          p_public_response?: string
        }
        Returns: boolean
      }
      review_controversial_content_v1: {
        Args: { p_action: string; p_notes?: string; p_reel_id: string }
        Returns: boolean
      }
      revoke_contacts_access: {
        Args: { p_user_id: string }
        Returns: undefined
      }
      revoke_delegation_v1: {
        Args: { p_auth_context: Json; p_delegation_id: string }
        Returns: boolean
      }
      rotate_stream_key: { Args: { p_user_id: string }; Returns: string }
      rpc_audit_write_v1: {
        Args: {
          p_client_msg_id: string
          p_conversation_id: string
          p_error_code: string
          p_request_id: string
          p_result: string
          p_rpc_name: string
        }
        Returns: undefined
      }
      save_user_contacts: {
        Args: { p_contacts_phones: string[]; p_user_id: string }
        Returns: undefined
      }
      scheduled_message_cancel_v1: {
        Args: { _scheduled_message_id: string }
        Returns: boolean
      }
      scheduled_message_create_v1: {
        Args: {
          _content: string
          _conversation_id: string
          _duration_seconds?: number
          _media_type?: string
          _media_url?: string
          _reply_to_message_id?: string
          _scheduled_for: string
          _thread_root_message_id?: string
        }
        Returns: string
      }
      scheduled_messages_process_due_v1: {
        Args: { _limit?: number; _max_attempts?: number }
        Returns: {
          failed: number
          processed: number
          sent: number
          skipped: number
        }[]
      }
      search_aria_memories: {
        Args: {
          p_embedding: string
          p_limit?: number
          p_threshold?: number
          p_user_id: string
        }
        Returns: {
          content: string
          id: string
          importance: number
          similarity: number
          topic: string
        }[]
      }
      search_hashtags_v1: {
        Args: { p_limit?: number; p_query: string; p_session_id?: string }
        Returns: {
          display_tag: string
          hashtag_id: string
          is_trending: boolean
          tag: string
          usage_count: number
        }[]
      }
      search_music: {
        Args: {
          p_genre?: string
          p_limit?: number
          p_mood?: string
          p_offset?: number
          p_query?: string
        }
        Returns: {
          album: string
          artist: string
          bpm: number
          cover_url: string
          duration_ms: number
          file_url: string
          genre: string
          id: string
          is_premium: boolean
          license_type: string
          mood: string
          preview_url: string
          rank: number
          title: string
          use_count: number
          waveform_url: string
        }[]
      }
      search_user_profiles: {
        Args: { p_limit?: number; p_query: string }
        Returns: {
          avatar_url: string
          bio: string
          display_name: string
          first_name: string
          full_name: string
          last_name: string
          user_id: string
          username: string
          verified: boolean
        }[]
      }
      send_channel_message_v1: {
        Args: {
          p_channel_id: string
          p_content: string
          p_duration_seconds?: number
          p_media_type?: string
          p_media_url?: string
          p_silent?: boolean
        }
        Returns: {
          created_at: string
          message_id: string
        }[]
      }
      send_command: {
        Args: {
          p_command_type: string
          p_device_id: string
          p_idempotency_key_norm: string
          p_payload: Json
          p_scope_id: string
          p_trace_id: string
        }
        Returns: {
          outcome: Json
          outcome_code: string
          outcome_state: string
        }[]
      }
      send_gift_v1: {
        Args: {
          p_conversation_id: string
          p_gift_id: string
          p_message_text?: string
          p_recipient_id: string
          p_sender_id: string
        }
        Returns: Json
      }
      send_group_message_v1: {
        Args: {
          p_content: string
          p_group_id: string
          p_media_type?: string
          p_media_url?: string
        }
        Returns: {
          created_at: string
          message_id: string
        }[]
      }
      send_internal_sms_v1: {
        Args: { p_body: string; p_recipient_id: string }
        Returns: {
          created_at: string
          message_id: string
        }[]
      }
      send_message_delegated_v1: {
        Args: {
          body: string
          client_msg_id: string
          conversation_id: string
          p_user_id: string
        }
        Returns: {
          message_id: string
          seq: number
        }[]
      }
      send_message_v1:
        | {
            Args: {
              body: string
              client_msg_id: string
              conversation_id: string
            }
            Returns: {
              message_id: string
              seq: number
            }[]
          }
        | {
            Args: {
              body: string
              client_msg_id: string
              conversation_id: string
              is_silent?: boolean
            }
            Returns: {
              message_id: string
              seq: number
            }[]
          }
      set_content_moderation_decision_v1: {
        Args: {
          p_actor_id?: string
          p_actor_type?: string
          p_content_id: string
          p_content_type: string
          p_new_decision: Database["public"]["Enums"]["moderation_decision"]
          p_notes?: string
          p_reason_code?: string
        }
        Returns: string
      }
      set_hashtag_status_bulk_v1: {
        Args: {
          p_actor_admin_user_id?: string
          p_hashtags: string[]
          p_notes?: string
          p_reason_codes?: string[]
          p_surface_policy?: Json
          p_to_status: string
        }
        Returns: {
          change_id: string
          from_status: string
          normalized_tag: string
          status_updated_at: string
          to_status: string
        }[]
      }
      set_hashtag_status_v1: {
        Args: {
          p_actor_admin_user_id?: string
          p_hashtag: string
          p_notes?: string
          p_reason_codes?: string[]
          p_surface_policy?: Json
          p_to_status: string
        }
        Returns: {
          change_id: string
          from_status: string
          normalized_tag: string
          status_updated_at: string
          to_status: string
        }[]
      }
      set_my_app_icon_selection: {
        Args: { p_icon_id: string }
        Returns: {
          created_at: string
          icon_id: string
          updated_at: string
          user_id: string
        }
        SetofOptions: {
          from: "*"
          to: "user_app_icon_selection"
          isOneToOne: true
          isSetofReturn: false
        }
      }
      set_reel_feedback: {
        Args: { p_feedback: string; p_reel_id: string; p_session_id?: string }
        Returns: undefined
      }
      set_reel_moderation_labels: {
        Args: {
          p_is_graphic_violence?: boolean
          p_is_nsfw?: boolean
          p_is_political_extremism?: boolean
          p_moderation_status: string
          p_notes?: string
          p_reel_id: string
          p_source?: string
        }
        Returns: undefined
      }
      show_limit: { Args: never; Returns: number }
      show_trgm: { Args: { "": string }; Returns: string[] }
      split_clip: {
        Args: { p_clip_id: string; p_split_at_ms: number }
        Returns: string
      }
      st_3dclosestpoint: {
        Args: { geom1: unknown; geom2: unknown }
        Returns: unknown
      }
      st_3ddistance: {
        Args: { geom1: unknown; geom2: unknown }
        Returns: number
      }
      st_3dintersects: {
        Args: { geom1: unknown; geom2: unknown }
        Returns: boolean
      }
      st_3dlongestline: {
        Args: { geom1: unknown; geom2: unknown }
        Returns: unknown
      }
      st_3dmakebox: {
        Args: { geom1: unknown; geom2: unknown }
        Returns: unknown
      }
      st_3dmaxdistance: {
        Args: { geom1: unknown; geom2: unknown }
        Returns: number
      }
      st_3dshortestline: {
        Args: { geom1: unknown; geom2: unknown }
        Returns: unknown
      }
      st_addpoint: {
        Args: { geom1: unknown; geom2: unknown }
        Returns: unknown
      }
      st_angle:
        | { Args: { line1: unknown; line2: unknown }; Returns: number }
        | {
            Args: { pt1: unknown; pt2: unknown; pt3: unknown; pt4?: unknown }
            Returns: number
          }
      st_area:
        | { Args: { geog: unknown; use_spheroid?: boolean }; Returns: number }
        | { Args: { "": string }; Returns: number }
      st_asencodedpolyline: {
        Args: { geom: unknown; nprecision?: number }
        Returns: string
      }
      st_asewkt: { Args: { "": string }; Returns: string }
      st_asgeojson:
        | {
            Args: { geog: unknown; maxdecimaldigits?: number; options?: number }
            Returns: string
          }
        | {
            Args: { geom: unknown; maxdecimaldigits?: number; options?: number }
            Returns: string
          }
        | {
            Args: {
              geom_column?: string
              maxdecimaldigits?: number
              pretty_bool?: boolean
              r: Record<string, unknown>
            }
            Returns: string
          }
        | { Args: { "": string }; Returns: string }
      st_asgml:
        | {
            Args: {
              geog: unknown
              id?: string
              maxdecimaldigits?: number
              nprefix?: string
              options?: number
            }
            Returns: string
          }
        | {
            Args: { geom: unknown; maxdecimaldigits?: number; options?: number }
            Returns: string
          }
        | { Args: { "": string }; Returns: string }
        | {
            Args: {
              geog: unknown
              id?: string
              maxdecimaldigits?: number
              nprefix?: string
              options?: number
              version: number
            }
            Returns: string
          }
        | {
            Args: {
              geom: unknown
              id?: string
              maxdecimaldigits?: number
              nprefix?: string
              options?: number
              version: number
            }
            Returns: string
          }
      st_askml:
        | {
            Args: { geog: unknown; maxdecimaldigits?: number; nprefix?: string }
            Returns: string
          }
        | {
            Args: { geom: unknown; maxdecimaldigits?: number; nprefix?: string }
            Returns: string
          }
        | { Args: { "": string }; Returns: string }
      st_aslatlontext: {
        Args: { geom: unknown; tmpl?: string }
        Returns: string
      }
      st_asmarc21: { Args: { format?: string; geom: unknown }; Returns: string }
      st_asmvtgeom: {
        Args: {
          bounds: unknown
          buffer?: number
          clip_geom?: boolean
          extent?: number
          geom: unknown
        }
        Returns: unknown
      }
      st_assvg:
        | {
            Args: { geog: unknown; maxdecimaldigits?: number; rel?: number }
            Returns: string
          }
        | {
            Args: { geom: unknown; maxdecimaldigits?: number; rel?: number }
            Returns: string
          }
        | { Args: { "": string }; Returns: string }
      st_astext: { Args: { "": string }; Returns: string }
      st_astwkb:
        | {
            Args: {
              geom: unknown
              prec?: number
              prec_m?: number
              prec_z?: number
              with_boxes?: boolean
              with_sizes?: boolean
            }
            Returns: string
          }
        | {
            Args: {
              geom: unknown[]
              ids: number[]
              prec?: number
              prec_m?: number
              prec_z?: number
              with_boxes?: boolean
              with_sizes?: boolean
            }
            Returns: string
          }
      st_asx3d: {
        Args: { geom: unknown; maxdecimaldigits?: number; options?: number }
        Returns: string
      }
      st_azimuth:
        | { Args: { geog1: unknown; geog2: unknown }; Returns: number }
        | { Args: { geom1: unknown; geom2: unknown }; Returns: number }
      st_boundingdiagonal: {
        Args: { fits?: boolean; geom: unknown }
        Returns: unknown
      }
      st_buffer:
        | {
            Args: { geom: unknown; options?: string; radius: number }
            Returns: unknown
          }
        | {
            Args: { geom: unknown; quadsegs: number; radius: number }
            Returns: unknown
          }
      st_centroid: { Args: { "": string }; Returns: unknown }
      st_clipbybox2d: {
        Args: { box: unknown; geom: unknown }
        Returns: unknown
      }
      st_closestpoint: {
        Args: { geom1: unknown; geom2: unknown }
        Returns: unknown
      }
      st_collect: { Args: { geom1: unknown; geom2: unknown }; Returns: unknown }
      st_concavehull: {
        Args: {
          param_allow_holes?: boolean
          param_geom: unknown
          param_pctconvex: number
        }
        Returns: unknown
      }
      st_contains: {
        Args: { geom1: unknown; geom2: unknown }
        Returns: boolean
      }
      st_containsproperly: {
        Args: { geom1: unknown; geom2: unknown }
        Returns: boolean
      }
      st_coorddim: { Args: { geometry: unknown }; Returns: number }
      st_coveredby:
        | { Args: { geog1: unknown; geog2: unknown }; Returns: boolean }
        | { Args: { geom1: unknown; geom2: unknown }; Returns: boolean }
      st_covers:
        | { Args: { geog1: unknown; geog2: unknown }; Returns: boolean }
        | { Args: { geom1: unknown; geom2: unknown }; Returns: boolean }
      st_crosses: { Args: { geom1: unknown; geom2: unknown }; Returns: boolean }
      st_curvetoline: {
        Args: { flags?: number; geom: unknown; tol?: number; toltype?: number }
        Returns: unknown
      }
      st_delaunaytriangles: {
        Args: { flags?: number; g1: unknown; tolerance?: number }
        Returns: unknown
      }
      st_difference: {
        Args: { geom1: unknown; geom2: unknown; gridsize?: number }
        Returns: unknown
      }
      st_disjoint: {
        Args: { geom1: unknown; geom2: unknown }
        Returns: boolean
      }
      st_distance:
        | {
            Args: { geog1: unknown; geog2: unknown; use_spheroid?: boolean }
            Returns: number
          }
        | { Args: { geom1: unknown; geom2: unknown }; Returns: number }
      st_distancesphere:
        | { Args: { geom1: unknown; geom2: unknown }; Returns: number }
        | {
            Args: { geom1: unknown; geom2: unknown; radius: number }
            Returns: number
          }
      st_distancespheroid: {
        Args: { geom1: unknown; geom2: unknown }
        Returns: number
      }
      st_dwithin: {
        Args: {
          geog1: unknown
          geog2: unknown
          tolerance: number
          use_spheroid?: boolean
        }
        Returns: boolean
      }
      st_equals: { Args: { geom1: unknown; geom2: unknown }; Returns: boolean }
      st_expand:
        | { Args: { box: unknown; dx: number; dy: number }; Returns: unknown }
        | {
            Args: { box: unknown; dx: number; dy: number; dz?: number }
            Returns: unknown
          }
        | {
            Args: {
              dm?: number
              dx: number
              dy: number
              dz?: number
              geom: unknown
            }
            Returns: unknown
          }
      st_force3d: { Args: { geom: unknown; zvalue?: number }; Returns: unknown }
      st_force3dm: {
        Args: { geom: unknown; mvalue?: number }
        Returns: unknown
      }
      st_force3dz: {
        Args: { geom: unknown; zvalue?: number }
        Returns: unknown
      }
      st_force4d: {
        Args: { geom: unknown; mvalue?: number; zvalue?: number }
        Returns: unknown
      }
      st_generatepoints:
        | { Args: { area: unknown; npoints: number }; Returns: unknown }
        | {
            Args: { area: unknown; npoints: number; seed: number }
            Returns: unknown
          }
      st_geogfromtext: { Args: { "": string }; Returns: unknown }
      st_geographyfromtext: { Args: { "": string }; Returns: unknown }
      st_geohash:
        | { Args: { geog: unknown; maxchars?: number }; Returns: string }
        | { Args: { geom: unknown; maxchars?: number }; Returns: string }
      st_geomcollfromtext: { Args: { "": string }; Returns: unknown }
      st_geometricmedian: {
        Args: {
          fail_if_not_converged?: boolean
          g: unknown
          max_iter?: number
          tolerance?: number
        }
        Returns: unknown
      }
      st_geometryfromtext: { Args: { "": string }; Returns: unknown }
      st_geomfromewkt: { Args: { "": string }; Returns: unknown }
      st_geomfromgeojson:
        | { Args: { "": Json }; Returns: unknown }
        | { Args: { "": Json }; Returns: unknown }
        | { Args: { "": string }; Returns: unknown }
      st_geomfromgml: { Args: { "": string }; Returns: unknown }
      st_geomfromkml: { Args: { "": string }; Returns: unknown }
      st_geomfrommarc21: { Args: { marc21xml: string }; Returns: unknown }
      st_geomfromtext: { Args: { "": string }; Returns: unknown }
      st_gmltosql: { Args: { "": string }; Returns: unknown }
      st_hasarc: { Args: { geometry: unknown }; Returns: boolean }
      st_hausdorffdistance: {
        Args: { geom1: unknown; geom2: unknown }
        Returns: number
      }
      st_hexagon: {
        Args: { cell_i: number; cell_j: number; origin?: unknown; size: number }
        Returns: unknown
      }
      st_hexagongrid: {
        Args: { bounds: unknown; size: number }
        Returns: Record<string, unknown>[]
      }
      st_interpolatepoint: {
        Args: { line: unknown; point: unknown }
        Returns: number
      }
      st_intersection: {
        Args: { geom1: unknown; geom2: unknown; gridsize?: number }
        Returns: unknown
      }
      st_intersects:
        | { Args: { geog1: unknown; geog2: unknown }; Returns: boolean }
        | { Args: { geom1: unknown; geom2: unknown }; Returns: boolean }
      st_isvaliddetail: {
        Args: { flags?: number; geom: unknown }
        Returns: Database["public"]["CompositeTypes"]["valid_detail"]
        SetofOptions: {
          from: "*"
          to: "valid_detail"
          isOneToOne: true
          isSetofReturn: false
        }
      }
      st_length:
        | { Args: { geog: unknown; use_spheroid?: boolean }; Returns: number }
        | { Args: { "": string }; Returns: number }
      st_letters: { Args: { font?: Json; letters: string }; Returns: unknown }
      st_linecrossingdirection: {
        Args: { line1: unknown; line2: unknown }
        Returns: number
      }
      st_linefromencodedpolyline: {
        Args: { nprecision?: number; txtin: string }
        Returns: unknown
      }
      st_linefromtext: { Args: { "": string }; Returns: unknown }
      st_linelocatepoint: {
        Args: { geom1: unknown; geom2: unknown }
        Returns: number
      }
      st_linetocurve: { Args: { geometry: unknown }; Returns: unknown }
      st_locatealong: {
        Args: { geometry: unknown; leftrightoffset?: number; measure: number }
        Returns: unknown
      }
      st_locatebetween: {
        Args: {
          frommeasure: number
          geometry: unknown
          leftrightoffset?: number
          tomeasure: number
        }
        Returns: unknown
      }
      st_locatebetweenelevations: {
        Args: { fromelevation: number; geometry: unknown; toelevation: number }
        Returns: unknown
      }
      st_longestline: {
        Args: { geom1: unknown; geom2: unknown }
        Returns: unknown
      }
      st_makebox2d: {
        Args: { geom1: unknown; geom2: unknown }
        Returns: unknown
      }
      st_makeline: {
        Args: { geom1: unknown; geom2: unknown }
        Returns: unknown
      }
      st_makevalid: {
        Args: { geom: unknown; params: string }
        Returns: unknown
      }
      st_maxdistance: {
        Args: { geom1: unknown; geom2: unknown }
        Returns: number
      }
      st_minimumboundingcircle: {
        Args: { inputgeom: unknown; segs_per_quarter?: number }
        Returns: unknown
      }
      st_mlinefromtext: { Args: { "": string }; Returns: unknown }
      st_mpointfromtext: { Args: { "": string }; Returns: unknown }
      st_mpolyfromtext: { Args: { "": string }; Returns: unknown }
      st_multilinestringfromtext: { Args: { "": string }; Returns: unknown }
      st_multipointfromtext: { Args: { "": string }; Returns: unknown }
      st_multipolygonfromtext: { Args: { "": string }; Returns: unknown }
      st_node: { Args: { g: unknown }; Returns: unknown }
      st_normalize: { Args: { geom: unknown }; Returns: unknown }
      st_offsetcurve: {
        Args: { distance: number; line: unknown; params?: string }
        Returns: unknown
      }
      st_orderingequals: {
        Args: { geom1: unknown; geom2: unknown }
        Returns: boolean
      }
      st_overlaps: {
        Args: { geom1: unknown; geom2: unknown }
        Returns: boolean
      }
      st_perimeter: {
        Args: { geog: unknown; use_spheroid?: boolean }
        Returns: number
      }
      st_pointfromtext: { Args: { "": string }; Returns: unknown }
      st_pointm: {
        Args: {
          mcoordinate: number
          srid?: number
          xcoordinate: number
          ycoordinate: number
        }
        Returns: unknown
      }
      st_pointz: {
        Args: {
          srid?: number
          xcoordinate: number
          ycoordinate: number
          zcoordinate: number
        }
        Returns: unknown
      }
      st_pointzm: {
        Args: {
          mcoordinate: number
          srid?: number
          xcoordinate: number
          ycoordinate: number
          zcoordinate: number
        }
        Returns: unknown
      }
      st_polyfromtext: { Args: { "": string }; Returns: unknown }
      st_polygonfromtext: { Args: { "": string }; Returns: unknown }
      st_project: {
        Args: { azimuth: number; distance: number; geog: unknown }
        Returns: unknown
      }
      st_quantizecoordinates: {
        Args: {
          g: unknown
          prec_m?: number
          prec_x: number
          prec_y?: number
          prec_z?: number
        }
        Returns: unknown
      }
      st_reduceprecision: {
        Args: { geom: unknown; gridsize: number }
        Returns: unknown
      }
      st_relate: { Args: { geom1: unknown; geom2: unknown }; Returns: string }
      st_removerepeatedpoints: {
        Args: { geom: unknown; tolerance?: number }
        Returns: unknown
      }
      st_segmentize: {
        Args: { geog: unknown; max_segment_length: number }
        Returns: unknown
      }
      st_setsrid:
        | { Args: { geog: unknown; srid: number }; Returns: unknown }
        | { Args: { geom: unknown; srid: number }; Returns: unknown }
      st_sharedpaths: {
        Args: { geom1: unknown; geom2: unknown }
        Returns: unknown
      }
      st_shortestline: {
        Args: { geom1: unknown; geom2: unknown }
        Returns: unknown
      }
      st_simplifypolygonhull: {
        Args: { geom: unknown; is_outer?: boolean; vertex_fraction: number }
        Returns: unknown
      }
      st_split: { Args: { geom1: unknown; geom2: unknown }; Returns: unknown }
      st_square: {
        Args: { cell_i: number; cell_j: number; origin?: unknown; size: number }
        Returns: unknown
      }
      st_squaregrid: {
        Args: { bounds: unknown; size: number }
        Returns: Record<string, unknown>[]
      }
      st_srid:
        | { Args: { geog: unknown }; Returns: number }
        | { Args: { geom: unknown }; Returns: number }
      st_subdivide: {
        Args: { geom: unknown; gridsize?: number; maxvertices?: number }
        Returns: unknown[]
      }
      st_swapordinates: {
        Args: { geom: unknown; ords: unknown }
        Returns: unknown
      }
      st_symdifference: {
        Args: { geom1: unknown; geom2: unknown; gridsize?: number }
        Returns: unknown
      }
      st_symmetricdifference: {
        Args: { geom1: unknown; geom2: unknown }
        Returns: unknown
      }
      st_tileenvelope: {
        Args: {
          bounds?: unknown
          margin?: number
          x: number
          y: number
          zoom: number
        }
        Returns: unknown
      }
      st_touches: { Args: { geom1: unknown; geom2: unknown }; Returns: boolean }
      st_transform:
        | {
            Args: { from_proj: string; geom: unknown; to_proj: string }
            Returns: unknown
          }
        | {
            Args: { from_proj: string; geom: unknown; to_srid: number }
            Returns: unknown
          }
        | { Args: { geom: unknown; to_proj: string }; Returns: unknown }
      st_triangulatepolygon: { Args: { g1: unknown }; Returns: unknown }
      st_union:
        | { Args: { geom1: unknown; geom2: unknown }; Returns: unknown }
        | {
            Args: { geom1: unknown; geom2: unknown; gridsize: number }
            Returns: unknown
          }
      st_voronoilines: {
        Args: { extend_to?: unknown; g1: unknown; tolerance?: number }
        Returns: unknown
      }
      st_voronoipolygons: {
        Args: { extend_to?: unknown; g1: unknown; tolerance?: number }
        Returns: unknown
      }
      st_within: { Args: { geom1: unknown; geom2: unknown }; Returns: boolean }
      st_wkbtosql: { Args: { wkb: string }; Returns: unknown }
      st_wkttosql: { Args: { "": string }; Returns: unknown }
      st_wrapx: {
        Args: { geom: unknown; move: number; wrap: number }
        Returns: unknown
      }
      start_explore_session_v1: {
        Args: {
          p_algorithm_version?: string
          p_session_key?: string
          p_user_id?: string
        }
        Returns: string
      }
      start_trend_run_v1: {
        Args: {
          p_algorithm_version?: string
          p_candidate_limit?: number
          p_idempotency_key?: string
          p_segment_id?: string
          p_window?: string
        }
        Returns: {
          ended_at: string
          inputs: Json
          notes: string
          outputs: Json
          reason_codes: string[]
          run_id: string
          started_at: string
          status: string
          window: string
        }[]
      }
      stop_live_location_v1: { Args: { p_message_id: string }; Returns: Json }
      submit_appeal_v1: {
        Args: {
          p_content_id?: string
          p_content_type?: string
          p_moderation_action_id?: string
          p_reason?: Database["public"]["Enums"]["appeal_reason"]
          p_user_explanation?: string
        }
        Returns: Json
      }
      submit_content_report_v1: {
        Args: {
          p_content_id: string
          p_content_type: string
          p_description?: string
          p_report_type: string
        }
        Returns: Json
      }
      taxi_assign_order_to_driver: {
        Args: { p_driver_id: string; p_order_id: string }
        Returns: undefined
      }
      taxi_complete_trip: {
        Args: { p_driver_id: string; p_order_id: string }
        Returns: Json
      }
      taxi_confirm_pickup_pin: {
        Args: { p_driver_id: string; p_order_id: string; p_pin: string }
        Returns: undefined
      }
      taxi_driver_accept_order: {
        Args: { p_driver_id: string; p_order_id: string }
        Returns: undefined
      }
      taxi_get_or_create_trip_chat: {
        Args: {
          p_driver_user_id: string
          p_passenger_id: string
          p_ride_id: string
        }
        Returns: string
      }
      thread_set_lifecycle_v1: {
        Args: {
          _conversation_id: string
          _is_archived?: boolean
          _is_locked?: boolean
          _parent_message_id: string
          _title?: string
        }
        Returns: string
      }
      totp_consume_step: {
        Args: { p_step: number; p_user_id: string }
        Returns: boolean
      }
      track_explore_click_v1: {
        Args: {
          p_algorithm_version?: string
          p_item_id: string
          p_item_type: string
          p_position_in_section?: number
          p_section_type: string
          p_session_id: string
          p_user_id?: string
        }
        Returns: string
      }
      turn_issuance_rl_hit_v1: {
        Args: { p_ip: string; p_max: number; p_user_id: string }
        Returns: {
          allowed: boolean
          bucket_ts: string
          cnt: number
        }[]
      }
      turn_replay_guard_hit_v1: {
        Args: {
          p_nonce_hash: string
          p_user_scope: string
          p_window_ms?: number
        }
        Returns: {
          allowed: boolean
          expires_at: string
        }[]
      }
      unaccent: { Args: { "": string }; Returns: string }
      unlockrows: { Args: { "": string }; Returns: number }
      update_author_trust_weight_v1: {
        Args: {
          p_moderation_type?: string
          p_user_id: string
          p_violation_severity?: string
        }
        Returns: {
          new_trust_weight: number
          user_id: string
          violation_count: number
        }[]
      }
      update_explore_watch_v1: {
        Args: { p_click_id: string; p_watch_duration_seconds: number }
        Returns: boolean
      }
      update_live_location_v1: {
        Args: {
          p_accuracy_m?: number
          p_heading_deg?: number
          p_lat: number
          p_lng: number
          p_message_id: string
          p_speed_mps?: number
        }
        Returns: Json
      }
      update_my_appearance_settings: {
        Args: {
          p_chat_theme_id?: string
          p_chat_wallpaper_id?: string
          p_dark_mode_enabled?: boolean
          p_dark_theme?: string
          p_font_scale?: number
          p_media_tap_navigation_enabled?: boolean
          p_message_corner_radius?: number
          p_personal_color_primary?: string
          p_personal_color_secondary?: string
          p_stickers_emoji_animations_enabled?: boolean
          p_ui_animations_enabled?: boolean
        }
        Returns: {
          chat_theme_id: string
          chat_wallpaper_id: string
          created_at: string
          dark_mode_enabled: boolean
          dark_theme: string
          font_scale: number
          media_tap_navigation_enabled: boolean
          message_corner_radius: number
          personal_color_primary: string
          personal_color_secondary: string
          stickers_emoji_animations_enabled: boolean
          ui_animations_enabled: boolean
          updated_at: string
          user_id: string
        }
        SetofOptions: {
          from: "*"
          to: "user_appearance_settings"
          isOneToOne: true
          isSetofReturn: false
        }
      }
      update_my_energy_saver_settings: {
        Args: {
          p_animated_emoji?: boolean
          p_animated_stickers?: boolean
          p_autoplay_gif?: boolean
          p_autoplay_video?: boolean
          p_background_updates?: boolean
          p_battery_threshold_percent?: number
          p_interface_animations?: boolean
          p_media_preload?: boolean
          p_mode?: string
        }
        Returns: {
          animated_emoji: boolean
          animated_stickers: boolean
          autoplay_gif: boolean
          autoplay_video: boolean
          background_updates: boolean
          battery_threshold_percent: number
          created_at: string
          interface_animations: boolean
          media_preload: boolean
          mode: string
          updated_at: string
          user_id: string
        }
        SetofOptions: {
          from: "*"
          to: "user_energy_saver_settings"
          isOneToOne: true
          isSetofReturn: false
        }
      }
      update_my_location: {
        Args: {
          p_accuracy?: number
          p_expires_hours?: number
          p_lat: number
          p_lon: number
          p_visible?: boolean
        }
        Returns: undefined
      }
      update_peak_viewers: {
        Args: { p_current_viewers: number; p_session_id: number }
        Returns: undefined
      }
      updategeometrysrid: {
        Args: {
          catalogn_name: string
          column_name: string
          new_srid_in: number
          schema_name: string
          table_name: string
        }
        Returns: string
      }
      upsert_device_account: {
        Args: { p_device_id: string; p_label?: string }
        Returns: undefined
      }
      upsert_device_token: {
        Args: {
          p_app_build?: number
          p_app_version?: string
          p_device_id: string
          p_locale?: string
          p_platform: string
          p_provider: string
          p_timezone?: string
          p_token: string
        }
        Returns: {
          app_build: number | null
          app_version: string | null
          call_push_enabled: boolean
          created_at: string
          device_id: string
          id: string
          is_valid: boolean
          last_seen_at: string | null
          locale: string | null
          platform: string
          provider: string
          push_enabled: boolean
          timezone: string | null
          token: string
          updated_at: string
          user_id: string
        }
        SetofOptions: {
          from: "*"
          to: "device_tokens"
          isOneToOne: true
          isSetofReturn: false
        }
      }
      upsert_reel_audio_link: {
        Args: { p_music_title: string; p_reel_id: string }
        Returns: undefined
      }
      validate_hashtags_allowed_v1: {
        Args: { p_text: string }
        Returns: undefined
      }
      validate_scopes_v1: { Args: { p_scopes: string[] }; Returns: undefined }
      verify_secret: {
        Args: { secret: string; secret_hash: string }
        Returns: boolean
      }
      vote_poll_v1: {
        Args: { p_option_id: string; p_poll_id: string; p_user_id: string }
        Returns: Json
      }
      workflow_create_v1: {
        Args: {
          _action?: Json
          _condition?: Json
          _is_active?: boolean
          _name: string
          _trigger_event: string
        }
        Returns: string
      }
      workflow_delete_v1: { Args: { _id: string }; Returns: boolean }
      workflow_run_enqueue_v1: {
        Args: { _event_payload?: Json; _workflow_id: string }
        Returns: string
      }
      workflow_toggle_v1: {
        Args: { _id: string; _is_active: boolean }
        Returns: boolean
      }
    }
    Enums: {
      actor_type: "user" | "device" | "ip" | "org" | "service"
      agent_status: "pending" | "active" | "suspended" | "blocked"
      app_role: "admin" | "moderator" | "user"
      appeal_reason:
        | "false_positive"
        | "context_missing"
        | "policy_unclear"
        | "technical_error"
        | "other"
      appeal_status: "submitted" | "in_review" | "accepted" | "rejected"
      bot_chat_type: "private" | "group" | "supergroup" | "channel"
      bot_status: "active" | "disabled" | "archived"
      branded_request_status: "pending" | "approved" | "rejected" | "cancelled"
      calculation_status: "draft" | "sent" | "expired" | "converted"
      commission_status: "pending" | "confirmed" | "paid" | "cancelled"
      deal_type: "sale" | "rent" | "daily"
      decision_job_priority: "low" | "normal" | "high" | "critical"
      decision_job_status:
        | "pending"
        | "processing"
        | "completed"
        | "failed"
        | "deadletter"
      distribution_class: "green" | "borderline" | "red"
      emergency_level: "critical" | "high" | "medium" | "low"
      emergency_signal_type:
        | "sos"
        | "medical"
        | "trapped"
        | "danger"
        | "safe"
        | "need_water"
        | "need_food"
        | "need_shelter"
        | "need_medication"
        | "found_survivor"
      enforcement_level: "E0" | "E1" | "E2" | "E3" | "E4" | "E5"
      hashtag_status: "normal" | "restricted" | "hidden"
      insurance_category:
        | "auto"
        | "health"
        | "property"
        | "travel"
        | "life"
        | "osago"
        | "kasko"
        | "mini_kasko"
        | "mortgage"
        | "dms"
        | "osgop"
      keyboard_type: "reply" | "inline" | "remove"
      message_entity_type:
        | "mention"
        | "hashtag"
        | "bot_command"
        | "url"
        | "email"
        | "bold"
        | "italic"
        | "underline"
        | "strikethrough"
        | "code"
        | "pre"
        | "text_link"
        | "text_mention"
      moderation_actor_type: "system" | "human" | "auto_engine"
      moderation_decision: "allow" | "restrict" | "needs_review" | "block"
      moderation_decision_type:
        | "normal"
        | "restricted"
        | "hidden"
        | "quarantined"
      payout_status: "pending" | "processing" | "completed" | "failed"
      policy_status: "pending" | "active" | "expired" | "cancelled"
      property_status: "active" | "sold" | "rented" | "inactive"
      property_type: "apartment" | "house" | "room" | "commercial" | "land"
      reels_engine_action_status:
        | "accepted"
        | "executed"
        | "suppressed"
        | "rate_limited"
        | "rejected"
        | "failed"
      reels_engine_mode: "steady" | "incident"
      risk_tier: "A" | "B" | "C" | "D"
      taxi_cancellation_reason:
        | "long_wait"
        | "wrong_car"
        | "changed_plans"
        | "driver_not_responding"
        | "found_another"
        | "other"
      taxi_driver_status:
        | "offline"
        | "available"
        | "arriving"
        | "busy"
        | "on_break"
      taxi_payment_method:
        | "card"
        | "cash"
        | "apple_pay"
        | "google_pay"
        | "corporate"
      taxi_ride_status:
        | "searching_driver"
        | "assigned_to_driver"
        | "driver_arriving"
        | "driver_arrived"
        | "in_trip"
        | "completed"
        | "cancelled"
      taxi_vehicle_class:
        | "economy"
        | "comfort"
        | "business"
        | "minivan"
        | "premium"
        | "kids"
        | "green"
      verification_type: "owner" | "verified" | "professional" | "business"
    }
    CompositeTypes: {
      feed_post_v2: {
        id: string | null
        author_id: string | null
        content: string | null
        created_at: string | null
        likes_count: number | null
        comments_count: number | null
        saves_count: number | null
        shares_count: number | null
        views_count: number | null
        score: number | null
        is_liked: boolean | null
        is_saved: boolean | null
        author_display_name: string | null
        author_avatar_url: string | null
        author_is_verified: boolean | null
        media: Json | null
      }
      geometry_dump: {
        path: number[] | null
        geom: unknown
      }
      valid_detail: {
        valid: boolean | null
        reason: string | null
        location: unknown
      }
    }
  }
}

type DatabaseWithoutInternals = Omit<Database, "__InternalSupabase">

type DefaultSchema = DatabaseWithoutInternals[Extract<keyof Database, "public">]

export type Tables<
  DefaultSchemaTableNameOrOptions extends
    | keyof (DefaultSchema["Tables"] & DefaultSchema["Views"])
    | { schema: keyof DatabaseWithoutInternals },
  TableName extends DefaultSchemaTableNameOrOptions extends {
    schema: keyof DatabaseWithoutInternals
  }
    ? keyof (DatabaseWithoutInternals[DefaultSchemaTableNameOrOptions["schema"]]["Tables"] &
        DatabaseWithoutInternals[DefaultSchemaTableNameOrOptions["schema"]]["Views"])
    : never = never,
> = DefaultSchemaTableNameOrOptions extends {
  schema: keyof DatabaseWithoutInternals
}
  ? (DatabaseWithoutInternals[DefaultSchemaTableNameOrOptions["schema"]]["Tables"] &
      DatabaseWithoutInternals[DefaultSchemaTableNameOrOptions["schema"]]["Views"])[TableName] extends {
      Row: infer R
    }
    ? R
    : never
  : DefaultSchemaTableNameOrOptions extends keyof (DefaultSchema["Tables"] &
        DefaultSchema["Views"])
    ? (DefaultSchema["Tables"] &
        DefaultSchema["Views"])[DefaultSchemaTableNameOrOptions] extends {
        Row: infer R
      }
      ? R
      : never
    : never

export type TablesInsert<
  DefaultSchemaTableNameOrOptions extends
    | keyof DefaultSchema["Tables"]
    | { schema: keyof DatabaseWithoutInternals },
  TableName extends DefaultSchemaTableNameOrOptions extends {
    schema: keyof DatabaseWithoutInternals
  }
    ? keyof DatabaseWithoutInternals[DefaultSchemaTableNameOrOptions["schema"]]["Tables"]
    : never = never,
> = DefaultSchemaTableNameOrOptions extends {
  schema: keyof DatabaseWithoutInternals
}
  ? DatabaseWithoutInternals[DefaultSchemaTableNameOrOptions["schema"]]["Tables"][TableName] extends {
      Insert: infer I
    }
    ? I
    : never
  : DefaultSchemaTableNameOrOptions extends keyof DefaultSchema["Tables"]
    ? DefaultSchema["Tables"][DefaultSchemaTableNameOrOptions] extends {
        Insert: infer I
      }
      ? I
      : never
    : never

export type TablesUpdate<
  DefaultSchemaTableNameOrOptions extends
    | keyof DefaultSchema["Tables"]
    | { schema: keyof DatabaseWithoutInternals },
  TableName extends DefaultSchemaTableNameOrOptions extends {
    schema: keyof DatabaseWithoutInternals
  }
    ? keyof DatabaseWithoutInternals[DefaultSchemaTableNameOrOptions["schema"]]["Tables"]
    : never = never,
> = DefaultSchemaTableNameOrOptions extends {
  schema: keyof DatabaseWithoutInternals
}
  ? DatabaseWithoutInternals[DefaultSchemaTableNameOrOptions["schema"]]["Tables"][TableName] extends {
      Update: infer U
    }
    ? U
    : never
  : DefaultSchemaTableNameOrOptions extends keyof DefaultSchema["Tables"]
    ? DefaultSchema["Tables"][DefaultSchemaTableNameOrOptions] extends {
        Update: infer U
      }
      ? U
      : never
    : never

export type Enums<
  DefaultSchemaEnumNameOrOptions extends
    | keyof DefaultSchema["Enums"]
    | { schema: keyof DatabaseWithoutInternals },
  EnumName extends DefaultSchemaEnumNameOrOptions extends {
    schema: keyof DatabaseWithoutInternals
  }
    ? keyof DatabaseWithoutInternals[DefaultSchemaEnumNameOrOptions["schema"]]["Enums"]
    : never = never,
> = DefaultSchemaEnumNameOrOptions extends {
  schema: keyof DatabaseWithoutInternals
}
  ? DatabaseWithoutInternals[DefaultSchemaEnumNameOrOptions["schema"]]["Enums"][EnumName]
  : DefaultSchemaEnumNameOrOptions extends keyof DefaultSchema["Enums"]
    ? DefaultSchema["Enums"][DefaultSchemaEnumNameOrOptions]
    : never

export type CompositeTypes<
  PublicCompositeTypeNameOrOptions extends
    | keyof DefaultSchema["CompositeTypes"]
    | { schema: keyof DatabaseWithoutInternals },
  CompositeTypeName extends PublicCompositeTypeNameOrOptions extends {
    schema: keyof DatabaseWithoutInternals
  }
    ? keyof DatabaseWithoutInternals[PublicCompositeTypeNameOrOptions["schema"]]["CompositeTypes"]
    : never = never,
> = PublicCompositeTypeNameOrOptions extends {
  schema: keyof DatabaseWithoutInternals
}
  ? DatabaseWithoutInternals[PublicCompositeTypeNameOrOptions["schema"]]["CompositeTypes"][CompositeTypeName]
  : PublicCompositeTypeNameOrOptions extends keyof DefaultSchema["CompositeTypes"]
    ? DefaultSchema["CompositeTypes"][PublicCompositeTypeNameOrOptions]
    : never

export const Constants = {
  public: {
    Enums: {
      actor_type: ["user", "device", "ip", "org", "service"],
      agent_status: ["pending", "active", "suspended", "blocked"],
      app_role: ["admin", "moderator", "user"],
      appeal_reason: [
        "false_positive",
        "context_missing",
        "policy_unclear",
        "technical_error",
        "other",
      ],
      appeal_status: ["submitted", "in_review", "accepted", "rejected"],
      bot_chat_type: ["private", "group", "supergroup", "channel"],
      bot_status: ["active", "disabled", "archived"],
      branded_request_status: ["pending", "approved", "rejected", "cancelled"],
      calculation_status: ["draft", "sent", "expired", "converted"],
      commission_status: ["pending", "confirmed", "paid", "cancelled"],
      deal_type: ["sale", "rent", "daily"],
      decision_job_priority: ["low", "normal", "high", "critical"],
      decision_job_status: [
        "pending",
        "processing",
        "completed",
        "failed",
        "deadletter",
      ],
      distribution_class: ["green", "borderline", "red"],
      emergency_level: ["critical", "high", "medium", "low"],
      emergency_signal_type: [
        "sos",
        "medical",
        "trapped",
        "danger",
        "safe",
        "need_water",
        "need_food",
        "need_shelter",
        "need_medication",
        "found_survivor",
      ],
      enforcement_level: ["E0", "E1", "E2", "E3", "E4", "E5"],
      hashtag_status: ["normal", "restricted", "hidden"],
      insurance_category: [
        "auto",
        "health",
        "property",
        "travel",
        "life",
        "osago",
        "kasko",
        "mini_kasko",
        "mortgage",
        "dms",
        "osgop",
      ],
      keyboard_type: ["reply", "inline", "remove"],
      message_entity_type: [
        "mention",
        "hashtag",
        "bot_command",
        "url",
        "email",
        "bold",
        "italic",
        "underline",
        "strikethrough",
        "code",
        "pre",
        "text_link",
        "text_mention",
      ],
      moderation_actor_type: ["system", "human", "auto_engine"],
      moderation_decision: ["allow", "restrict", "needs_review", "block"],
      moderation_decision_type: [
        "normal",
        "restricted",
        "hidden",
        "quarantined",
      ],
      payout_status: ["pending", "processing", "completed", "failed"],
      policy_status: ["pending", "active", "expired", "cancelled"],
      property_status: ["active", "sold", "rented", "inactive"],
      property_type: ["apartment", "house", "room", "commercial", "land"],
      reels_engine_action_status: [
        "accepted",
        "executed",
        "suppressed",
        "rate_limited",
        "rejected",
        "failed",
      ],
      reels_engine_mode: ["steady", "incident"],
      risk_tier: ["A", "B", "C", "D"],
      taxi_cancellation_reason: [
        "long_wait",
        "wrong_car",
        "changed_plans",
        "driver_not_responding",
        "found_another",
        "other",
      ],
      taxi_driver_status: [
        "offline",
        "available",
        "arriving",
        "busy",
        "on_break",
      ],
      taxi_payment_method: [
        "card",
        "cash",
        "apple_pay",
        "google_pay",
        "corporate",
      ],
      taxi_ride_status: [
        "searching_driver",
        "assigned_to_driver",
        "driver_arriving",
        "driver_arrived",
        "in_trip",
        "completed",
        "cancelled",
      ],
      taxi_vehicle_class: [
        "economy",
        "comfort",
        "business",
        "minivan",
        "premium",
        "kids",
        "green",
      ],
      verification_type: ["owner", "verified", "professional", "business"],
    },
  },
} as const