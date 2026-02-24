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
  graphql_public: {
    Tables: {
      [_ in never]: never
    }
    Views: {
      [_ in never]: never
    }
    Functions: {
      graphql: {
        Args: {
          extensions?: Json
          operationName?: string
          query?: string
          variables?: Json
        }
        Returns: Json
      }
    }
    Enums: {
      [_ in never]: never
    }
    CompositeTypes: {
      [_ in never]: never
    }
  }
  public: {
    Tables: {
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
          referral_code: string | null
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
          referral_code?: string | null
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
          referral_code?: string | null
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
      calls: {
        Row: {
          answered_at: string | null
          call_type: string
          callee_id: string
          caller_id: string
          conversation_id: string | null
          created_at: string
          end_reason: string | null
          ended_at: string | null
          expires_at: string
          id: string
          signaling_data: Json | null
          started_at: string | null
          state: string
          updated_at: string | null
        }
        Insert: {
          answered_at?: string | null
          call_type: string
          callee_id: string
          caller_id: string
          conversation_id?: string | null
          created_at?: string
          end_reason?: string | null
          ended_at?: string | null
          expires_at?: string
          id?: string
          signaling_data?: Json | null
          started_at?: string | null
          state?: string
          updated_at?: string | null
        }
        Update: {
          answered_at?: string | null
          call_type?: string
          callee_id?: string
          caller_id?: string
          conversation_id?: string | null
          created_at?: string
          end_reason?: string | null
          ended_at?: string | null
          expires_at?: string
          id?: string
          signaling_data?: Json | null
          started_at?: string | null
          state?: string
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
          max_uses: number | null
          token: string
          updated_at: string
          used_count: number
        }
        Insert: {
          channel_id: string
          created_at?: string
          created_by?: string
          expires_at?: string | null
          id?: string
          is_active?: boolean
          max_uses?: number | null
          token: string
          updated_at?: string
          used_count?: number
        }
        Update: {
          channel_id?: string
          created_at?: string
          created_by?: string
          expires_at?: string | null
          id?: string
          is_active?: boolean
          max_uses?: number | null
          token?: string
          updated_at?: string
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
      channel_members: {
        Row: {
          channel_id: string
          id: string
          joined_at: string
          role: string
          user_id: string
        }
        Insert: {
          channel_id: string
          id?: string
          joined_at?: string
          role?: string
          user_id: string
        }
        Update: {
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
      channel_messages: {
        Row: {
          channel_id: string
          content: string
          created_at: string
          duration_seconds: number | null
          expires_at: string | null
          id: string
          media_type: string | null
          media_url: string | null
          sender_id: string
          shared_post_id: string | null
          shared_reel_id: string | null
          silent: boolean
        }
        Insert: {
          channel_id: string
          content: string
          created_at?: string
          duration_seconds?: number | null
          expires_at?: string | null
          id?: string
          media_type?: string | null
          media_url?: string | null
          sender_id: string
          shared_post_id?: string | null
          shared_reel_id?: string | null
          silent?: boolean
        }
        Update: {
          channel_id?: string
          content?: string
          created_at?: string
          duration_seconds?: number | null
          expires_at?: string | null
          id?: string
          media_type?: string | null
          media_url?: string | null
          sender_id?: string
          shared_post_id?: string | null
          shared_reel_id?: string | null
          silent?: boolean
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
          description: string | null
          id: string
          is_public: boolean
          member_count: number
          name: string
          owner_id: string
          updated_at: string
        }
        Insert: {
          auto_delete_seconds?: number
          avatar_url?: string | null
          created_at?: string
          description?: string | null
          id?: string
          is_public?: boolean
          member_count?: number
          name: string
          owner_id: string
          updated_at?: string
        }
        Update: {
          auto_delete_seconds?: number
          avatar_url?: string | null
          created_at?: string
          description?: string | null
          id?: string
          is_public?: boolean
          member_count?: number
          name?: string
          owner_id?: string
          updated_at?: string
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
          user_id: string
        }
        Insert: {
          conversation_id: string
          id?: string
          joined_at?: string
          last_read_at?: string | null
          user_id: string
        }
        Update: {
          conversation_id?: string
          id?: string
          joined_at?: string
          last_read_at?: string | null
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
          id: string
          last_message_seq: number
          server_seq: number
          updated_at: string
        }
        Insert: {
          created_at?: string
          id?: string
          last_message_seq?: number
          server_seq?: number
          updated_at?: string
        }
        Update: {
          created_at?: string
          id?: string
          last_message_seq?: number
          server_seq?: number
          updated_at?: string
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
      group_chats: {
        Row: {
          avatar_url: string | null
          created_at: string | null
          description: string | null
          id: string
          member_count: number | null
          name: string
          owner_id: string
          updated_at: string | null
        }
        Insert: {
          avatar_url?: string | null
          created_at?: string | null
          description?: string | null
          id?: string
          member_count?: number | null
          name: string
          owner_id: string
          updated_at?: string | null
        }
        Update: {
          avatar_url?: string | null
          created_at?: string | null
          description?: string | null
          id?: string
          member_count?: number | null
          name?: string
          owner_id?: string
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
          expires_at: string | null
          id: string
          input_data: Json
          product_type: string
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
          expires_at?: string | null
          id?: string
          input_data: Json
          product_type: string
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
          expires_at?: string | null
          id?: string
          input_data?: Json
          product_type?: string
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
          claim_amount: number | null
          claim_number: string
          created_at: string
          description: string
          id: string
          policy_id: string
          resolved_at: string | null
          status: string
          submitted_at: string
          user_id: string
        }
        Insert: {
          claim_amount?: number | null
          claim_number: string
          created_at?: string
          description: string
          id?: string
          policy_id: string
          resolved_at?: string | null
          status?: string
          submitted_at?: string
          user_id: string
        }
        Update: {
          claim_amount?: number | null
          claim_number?: string
          created_at?: string
          description?: string
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
          api_enabled: boolean | null
          commission_rate: number | null
          created_at: string
          description: string | null
          id: string
          is_verified: boolean | null
          logo_url: string | null
          name: string
          phone: string | null
          priority: number | null
          rating: number | null
          regions: string[] | null
          supported_products: string[] | null
          website: string | null
        }
        Insert: {
          api_enabled?: boolean | null
          commission_rate?: number | null
          created_at?: string
          description?: string | null
          id?: string
          is_verified?: boolean | null
          logo_url?: string | null
          name: string
          phone?: string | null
          priority?: number | null
          rating?: number | null
          regions?: string[] | null
          supported_products?: string[] | null
          website?: string | null
        }
        Update: {
          api_enabled?: boolean | null
          commission_rate?: number | null
          created_at?: string
          description?: string | null
          id?: string
          is_verified?: boolean | null
          logo_url?: string | null
          name?: string
          phone?: string | null
          priority?: number | null
          rating?: number | null
          regions?: string[] | null
          supported_products?: string[] | null
          website?: string | null
        }
        Relationships: []
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
          created_at: string
          document_url: string | null
          end_date: string
          id: string
          insured_email: string | null
          insured_name: string
          insured_phone: string | null
          paid_at: string | null
          policy_number: string
          premium_amount: number
          product_id: string
          property_data: Json | null
          source: string | null
          start_date: string
          status: Database["public"]["Enums"]["policy_status"]
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
          created_at?: string
          document_url?: string | null
          end_date: string
          id?: string
          insured_email?: string | null
          insured_name: string
          insured_phone?: string | null
          paid_at?: string | null
          policy_number: string
          premium_amount: number
          product_id: string
          property_data?: Json | null
          source?: string | null
          start_date: string
          status?: Database["public"]["Enums"]["policy_status"]
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
          created_at?: string
          document_url?: string | null
          end_date?: string
          id?: string
          insured_email?: string | null
          insured_name?: string
          insured_phone?: string | null
          paid_at?: string | null
          policy_number?: string
          premium_amount?: number
          product_id?: string
          property_data?: Json | null
          source?: string | null
          start_date?: string
          status?: Database["public"]["Enums"]["policy_status"]
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
          created_at: string
          description: string | null
          documents_required: string[] | null
          features: Json | null
          id: string
          is_active: boolean | null
          is_popular: boolean | null
          max_term_days: number | null
          min_term_days: number | null
          name: string
          price_from: number
          terms_url: string | null
          updated_at: string
        }
        Insert: {
          badge?: string | null
          calculation_params?: Json | null
          category: Database["public"]["Enums"]["insurance_category"]
          company_id: string
          coverage_amount?: number | null
          created_at?: string
          description?: string | null
          documents_required?: string[] | null
          features?: Json | null
          id?: string
          is_active?: boolean | null
          is_popular?: boolean | null
          max_term_days?: number | null
          min_term_days?: number | null
          name: string
          price_from: number
          terms_url?: string | null
          updated_at?: string
        }
        Update: {
          badge?: string | null
          calculation_params?: Json | null
          category?: Database["public"]["Enums"]["insurance_category"]
          company_id?: string
          coverage_amount?: number | null
          created_at?: string
          description?: string | null
          documents_required?: string[] | null
          features?: Json | null
          id?: string
          is_active?: boolean | null
          is_popular?: boolean | null
          max_term_days?: number | null
          min_term_days?: number | null
          name?: string
          price_from?: number
          terms_url?: string | null
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
      live_sessions: {
        Row: {
          author_id: string
          created_at: string
          draft_id: string | null
          ended_at: string | null
          id: string
          ingest_protocol: string
          replay_asset_id: string | null
          started_at: string | null
          state: string
          stream_key_hash: string
        }
        Insert: {
          author_id: string
          created_at?: string
          draft_id?: string | null
          ended_at?: string | null
          id?: string
          ingest_protocol: string
          replay_asset_id?: string | null
          started_at?: string | null
          state: string
          stream_key_hash: string
        }
        Update: {
          author_id?: string
          created_at?: string
          draft_id?: string | null
          ended_at?: string | null
          id?: string
          ingest_protocol?: string
          replay_asset_id?: string | null
          started_at?: string | null
          state?: string
          stream_key_hash?: string
        }
        Relationships: [
          {
            foreignKeyName: "live_sessions_draft_id_fkey"
            columns: ["draft_id"]
            isOneToOne: false
            referencedRelation: "drafts"
            referencedColumns: ["id"]
          },
          {
            foreignKeyName: "live_sessions_replay_asset_id_fkey"
            columns: ["replay_asset_id"]
            isOneToOne: false
            referencedRelation: "assets"
            referencedColumns: ["id"]
          },
        ]
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
          client_msg_id: string | null
          content: string
          conversation_id: string
          created_at: string
          duration_seconds: number | null
          id: string
          is_read: boolean | null
          media_type: string | null
          media_url: string | null
          sender_id: string
          seq: number
          shared_post_id: string | null
          shared_reel_id: string | null
          updated_at: string | null
        }
        Insert: {
          client_msg_id?: string | null
          content: string
          conversation_id: string
          created_at?: string
          duration_seconds?: number | null
          id?: string
          is_read?: boolean | null
          media_type?: string | null
          media_url?: string | null
          sender_id: string
          seq: number
          shared_post_id?: string | null
          shared_reel_id?: string | null
          updated_at?: string | null
        }
        Update: {
          client_msg_id?: string | null
          content?: string
          conversation_id?: string
          created_at?: string
          duration_seconds?: number | null
          id?: string
          is_read?: boolean | null
          media_type?: string | null
          media_url?: string | null
          sender_id?: string
          seq?: number
          shared_post_id?: string | null
          shared_reel_id?: string | null
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
          id: string
          media_type: string
          media_url: string
          post_id: string
          sort_order: number
        }
        Insert: {
          created_at?: string
          id?: string
          media_type?: string
          media_url: string
          post_id: string
          sort_order?: number
        }
        Update: {
          created_at?: string
          id?: string
          media_type?: string
          media_url?: string
          post_id?: string
          sort_order?: number
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
          author_id: string
          comments_count: number
          content: string | null
          created_at: string
          draft_id: string | null
          id: string
          is_published: boolean
          likes_count: number
          publish_state: string | null
          shares_count: number
          updated_at: string
          views_count: number
          visibility: string | null
        }
        Insert: {
          author_id: string
          comments_count?: number
          content?: string | null
          created_at?: string
          draft_id?: string | null
          id?: string
          is_published?: boolean
          likes_count?: number
          publish_state?: string | null
          shares_count?: number
          updated_at?: string
          views_count?: number
          visibility?: string | null
        }
        Update: {
          author_id?: string
          comments_count?: number
          content?: string | null
          created_at?: string
          draft_id?: string | null
          id?: string
          is_published?: boolean
          likes_count?: number
          publish_state?: string | null
          shares_count?: number
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
      profiles: {
        Row: {
          age: number | null
          avatar_url: string | null
          bio: string | null
          birth_date: string | null
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
          last_name: string | null
          last_seen_at: string | null
          phone: string | null
          professions: string[] | null
          status_emoji: string | null
          status_sticker_url: string | null
          updated_at: string
          user_id: string
          username: string | null
          verified: boolean | null
          website: string | null
        }
        Insert: {
          age?: number | null
          avatar_url?: string | null
          bio?: string | null
          birth_date?: string | null
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
          last_name?: string | null
          last_seen_at?: string | null
          phone?: string | null
          professions?: string[] | null
          status_emoji?: string | null
          status_sticker_url?: string | null
          updated_at?: string
          user_id: string
          username?: string | null
          verified?: boolean | null
          website?: string | null
        }
        Update: {
          age?: number | null
          avatar_url?: string | null
          bio?: string | null
          birth_date?: string | null
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
          last_name?: string | null
          last_seen_at?: string | null
          phone?: string | null
          professions?: string[] | null
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
          author_id: string
          channel_id: string | null
          client_publish_id: string | null
          comments_count: number | null
          created_at: string | null
          description: string | null
          draft_id: string | null
          id: string
          is_graphic_violence: boolean
          is_nsfw: boolean
          is_political_extremism: boolean
          likes_count: number | null
          moderated_at: string | null
          moderated_by: string | null
          moderation_notes: string | null
          moderation_status: string
          music_title: string | null
          publish_state: string | null
          reposts_count: number | null
          saves_count: number | null
          shares_count: number | null
          thumbnail_url: string | null
          video_url: string
          views_count: number | null
          visibility: string | null
        }
        Insert: {
          author_id: string
          channel_id?: string | null
          client_publish_id?: string | null
          comments_count?: number | null
          created_at?: string | null
          description?: string | null
          draft_id?: string | null
          id?: string
          is_graphic_violence?: boolean
          is_nsfw?: boolean
          is_political_extremism?: boolean
          likes_count?: number | null
          moderated_at?: string | null
          moderated_by?: string | null
          moderation_notes?: string | null
          moderation_status?: string
          music_title?: string | null
          publish_state?: string | null
          reposts_count?: number | null
          saves_count?: number | null
          shares_count?: number | null
          thumbnail_url?: string | null
          video_url: string
          views_count?: number | null
          visibility?: string | null
        }
        Update: {
          author_id?: string
          channel_id?: string | null
          client_publish_id?: string | null
          comments_count?: number | null
          created_at?: string | null
          description?: string | null
          draft_id?: string | null
          id?: string
          is_graphic_violence?: boolean
          is_nsfw?: boolean
          is_political_extremism?: boolean
          likes_count?: number | null
          moderated_at?: string | null
          moderated_by?: string | null
          moderation_notes?: string | null
          moderation_status?: string
          music_title?: string | null
          publish_state?: string | null
          reposts_count?: number | null
          saves_count?: number | null
          shares_count?: number | null
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
          cover_asset_path: string | null
          created_at: string
          id: string
          is_active: boolean
          is_animated: boolean
          is_business: boolean
          is_premium: boolean
          item_count: number
          owner_user_id: string | null
          slug: string | null
          sort_order: number
          source_type: string
          title: string
          updated_at: string
          visibility_status: string
        }
        Insert: {
          cover_asset_path?: string | null
          created_at?: string
          id?: string
          is_active?: boolean
          is_animated?: boolean
          is_business?: boolean
          is_premium?: boolean
          item_count?: number
          owner_user_id?: string | null
          slug?: string | null
          sort_order?: number
          source_type?: string
          title: string
          updated_at?: string
          visibility_status?: string
        }
        Update: {
          cover_asset_path?: string | null
          created_at?: string
          id?: string
          is_active?: boolean
          is_animated?: boolean
          is_business?: boolean
          is_premium?: boolean
          item_count?: number
          owner_user_id?: string | null
          slug?: string | null
          sort_order?: number
          source_type?: string
          title?: string
          updated_at?: string
          visibility_status?: string
        }
        Relationships: []
      }
      stories: {
        Row: {
          author_id: string
          caption: string | null
          created_at: string
          expires_at: string
          id: string
          media_type: string
          media_url: string
        }
        Insert: {
          author_id: string
          caption?: string | null
          created_at?: string
          expires_at?: string
          id?: string
          media_type?: string
          media_url: string
        }
        Update: {
          author_id?: string
          caption?: string | null
          created_at?: string
          expires_at?: string
          id?: string
          media_type?: string
          media_url?: string
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
            referencedRelation: "video_calls"
            referencedColumns: ["id"]
          },
        ]
      }
      video_calls: {
        Row: {
          call_type: string
          callee_id: string
          caller_id: string
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
      reason_code_stats_v1: {
        Row: {
          avg_value: number | null
          boost_name: string | null
          max_value: number | null
          usage_count: number | null
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
    }
    Functions: {
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
      channel_has_capability: {
        Args: { _capability_key: string; _channel_id: string; _user_id: string }
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
      create_reel_metrics_snapshot_v1: {
        Args: { p_reel_id: string; p_snapshot_date?: string }
        Returns: boolean
      }
      create_reel_v1: {
        Args: {
          p_client_publish_id: string
          p_description?: string
          p_music_title?: string
          p_thumbnail_url?: string
          p_video_url: string
        }
        Returns: {
          author_id: string
          channel_id: string | null
          client_publish_id: string | null
          comments_count: number | null
          created_at: string | null
          description: string | null
          draft_id: string | null
          id: string
          is_graphic_violence: boolean
          is_nsfw: boolean
          is_political_extremism: boolean
          likes_count: number | null
          moderated_at: string | null
          moderated_by: string | null
          moderation_notes: string | null
          moderation_status: string
          music_title: string | null
          publish_state: string | null
          reposts_count: number | null
          saves_count: number | null
          shares_count: number | null
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
      encrypt_service_key_v1: { Args: { p_plaintext: string }; Returns: string }
      end_explore_session_v1: {
        Args: { p_session_id: string }
        Returns: boolean
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
      get_audio_boost_score: { Args: { p_reel_id: string }; Returns: number }
      get_author_fatigue_penalty_v1: {
        Args: {
          p_author_id: string
          p_user_id: string
          p_window_hours?: number
        }
        Returns: number
      }
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
      has_role: {
        Args: {
          _role: Database["public"]["Enums"]["app_role"]
          _user_id: string
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
      is_blocked: {
        Args: { checker_id: string; target_id: string }
        Returns: boolean
      }
      is_channel_admin: {
        Args: { _channel_id: string; _user_id: string }
        Returns: boolean
      }
      is_channel_member: {
        Args: { _channel_id: string; _user_id: string }
        Returns: boolean
      }
      is_feature_enabled_for_user_v1: {
        Args: { p_flag_name: string; p_user_id: string }
        Returns: boolean
      }
      is_group_member: {
        Args: { _group_id: string; _user_id: string }
        Returns: boolean
      }
      is_reel_discoverable_v1: { Args: { p_reel_id: string }; Returns: boolean }
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
      message_restore_v1: { Args: { p_message_id: string }; Returns: Json }
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
      next_edit_seq_v1: { Args: { p_conversation_id: string }; Returns: number }
      normalize_audio_key: { Args: { p_title: string }; Returns: string }
      publish_call_event: {
        Args: { p_call_id: string; p_event_type: string; p_payload: Json }
        Returns: undefined
      }
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
      record_reel_impression_v2: {
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
      record_reel_skip: {
        Args: {
          p_reel_duration_seconds: number
          p_reel_id: string
          p_session_id?: string
          p_skipped_at_second: number
        }
        Returns: undefined
      }
      record_reel_view: {
        Args: { p_reel_id: string; p_session_id?: string }
        Returns: boolean
      }
      record_reel_viewed: {
        Args: { p_reel_id: string; p_session_id?: string }
        Returns: undefined
      }
      record_reel_watched: {
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
      send_message_v1: {
        Args: { body: string; client_msg_id: string; conversation_id: string }
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
      verification_type: "owner" | "verified" | "professional" | "business"
    }
    CompositeTypes: {
      [_ in never]: never
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
  graphql_public: {
    Enums: {},
  },
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
      verification_type: ["owner", "verified", "professional", "business"],
    },
  },
} as const
