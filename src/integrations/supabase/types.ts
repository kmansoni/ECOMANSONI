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
      calls: {
        Row: {
          call_type: string
          callee_id: string
          caller_id: string
          conversation_id: string | null
          created_at: string
          ended_at: string | null
          id: string
          started_at: string | null
          status: string
        }
        Insert: {
          call_type: string
          callee_id: string
          caller_id: string
          conversation_id?: string | null
          created_at?: string
          ended_at?: string | null
          id?: string
          started_at?: string | null
          status?: string
        }
        Update: {
          call_type?: string
          callee_id?: string
          caller_id?: string
          conversation_id?: string | null
          created_at?: string
          ended_at?: string | null
          id?: string
          started_at?: string | null
          status?: string
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
          id: string
          media_type: string | null
          media_url: string | null
          sender_id: string
          shared_post_id: string | null
          shared_reel_id: string | null
        }
        Insert: {
          channel_id: string
          content: string
          created_at?: string
          id?: string
          media_type?: string | null
          media_url?: string | null
          sender_id: string
          shared_post_id?: string | null
          shared_reel_id?: string | null
        }
        Update: {
          channel_id?: string
          content?: string
          created_at?: string
          id?: string
          media_type?: string | null
          media_url?: string | null
          sender_id?: string
          shared_post_id?: string | null
          shared_reel_id?: string | null
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
      channels: {
        Row: {
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
      conversations: {
        Row: {
          created_at: string
          id: string
          last_message_seq: number
          updated_at: string
        }
        Insert: {
          created_at?: string
          id?: string
          last_message_seq?: number
          updated_at?: string
        }
        Update: {
          created_at?: string
          id?: string
          last_message_seq?: number
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
          seq: number | null
          sender_id: string
          shared_post_id: string | null
          shared_reel_id: string | null
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
          seq?: number | null
          sender_id: string
          shared_post_id?: string | null
          shared_reel_id?: string | null
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
          seq?: number | null
          sender_id?: string
          shared_post_id?: string | null
          shared_reel_id?: string | null
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
          id: string
          is_published: boolean
          likes_count: number
          shares_count: number
          updated_at: string
          views_count: number
        }
        Insert: {
          author_id: string
          comments_count?: number
          content?: string | null
          created_at?: string
          id?: string
          is_published?: boolean
          likes_count?: number
          shares_count?: number
          updated_at?: string
          views_count?: number
        }
        Update: {
          author_id?: string
          comments_count?: number
          content?: string | null
          created_at?: string
          id?: string
          is_published?: boolean
          likes_count?: number
          shares_count?: number
          updated_at?: string
          views_count?: number
        }
        Relationships: []
      }
      profiles: {
        Row: {
          age: number | null
          avatar_url: string | null
          bio: string | null
          birth_date: string | null
          created_at: string
          display_name: string | null
          email: string | null
          entity_type: string | null
          first_name: string | null
          gender: string | null
          id: string
          last_name: string | null
          last_seen_at: string | null
          phone: string | null
          status_emoji: string | null
          status_sticker_url: string | null
          updated_at: string
          user_id: string
          verified: boolean | null
          website: string | null
        }
        Insert: {
          age?: number | null
          avatar_url?: string | null
          bio?: string | null
          birth_date?: string | null
          created_at?: string
          display_name?: string | null
          email?: string | null
          entity_type?: string | null
          first_name?: string | null
          gender?: string | null
          id?: string
          last_name?: string | null
          last_seen_at?: string | null
          phone?: string | null
          status_emoji?: string | null
          status_sticker_url?: string | null
          updated_at?: string
          user_id: string
          verified?: boolean | null
          website?: string | null
        }
        Update: {
          age?: number | null
          avatar_url?: string | null
          bio?: string | null
          birth_date?: string | null
          created_at?: string
          display_name?: string | null
          email?: string | null
          entity_type?: string | null
          first_name?: string | null
          gender?: string | null
          id?: string
          last_name?: string | null
          last_seen_at?: string | null
          phone?: string | null
          status_emoji?: string | null
          status_sticker_url?: string | null
          updated_at?: string
          user_id?: string
          verified?: boolean | null
          website?: string | null
        }
        Relationships: []
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
      reels: {
        Row: {
          author_id: string
          comments_count: number | null
          created_at: string | null
          description: string | null
          id: string
          likes_count: number | null
          music_title: string | null
          thumbnail_url: string | null
          video_url: string
          views_count: number | null
        }
        Insert: {
          author_id: string
          comments_count?: number | null
          created_at?: string | null
          description?: string | null
          id?: string
          likes_count?: number | null
          music_title?: string | null
          thumbnail_url?: string | null
          video_url: string
          views_count?: number | null
        }
        Update: {
          author_id?: string
          comments_count?: number | null
          created_at?: string | null
          description?: string | null
          id?: string
          likes_count?: number | null
          music_title?: string | null
          thumbnail_url?: string | null
          video_url?: string
          views_count?: number | null
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
      },

      chat_folders: {
        Row: {
          id: string
          user_id: string
          name: string
          sort_order: number
          is_system: boolean
          system_kind: string | null
          is_hidden: boolean
          passcode_hash: string | null
          created_at: string
          updated_at: string
        }
        Insert: {
          id?: string
          user_id: string
          name: string
          sort_order?: number
          is_system?: boolean
          system_kind?: string | null
          is_hidden?: boolean
          passcode_hash?: string | null
          created_at?: string
          updated_at?: string
        }
        Update: {
          id?: string
          user_id?: string
          name?: string
          sort_order?: number
          is_system?: boolean
          system_kind?: string | null
          is_hidden?: boolean
          passcode_hash?: string | null
          created_at?: string
          updated_at?: string
        }
        Relationships: []
      },

      chat_folder_items: {
        Row: {
          id: string
          folder_id: string
          item_kind: string
          item_id: string
          created_at: string
        }
        Insert: {
          id?: string
          folder_id: string
          item_kind: string
          item_id: string
          created_at?: string
        }
        Update: {
          id?: string
          folder_id?: string
          item_kind?: string
          item_id?: string
          created_at?: string
        }
        Relationships: []
      },

      user_sessions: {
        Row: {
          id: string
          user_id: string
          session_key: string
          device_name: string | null
          user_agent: string | null
          ip: string | null
          created_at: string
          last_seen_at: string
          revoked_at: string | null
        }
        Insert: {
          id?: string
          user_id: string
          session_key: string
          device_name?: string | null
          user_agent?: string | null
          ip?: string | null
          created_at?: string
          last_seen_at?: string
          revoked_at?: string | null
        }
        Update: {
          id?: string
          user_id?: string
          session_key?: string
          device_name?: string | null
          user_agent?: string | null
          ip?: string | null
          created_at?: string
          last_seen_at?: string
          revoked_at?: string | null
        }
        Relationships: []
      },

      device_accounts: {
        Row: {
          device_id: string
          user_id: string
          created_at: string
          last_active_at: string
        }
        Insert: {
          device_id: string
          user_id: string
          created_at?: string
          last_active_at?: string
        }
        Update: {
          device_id?: string
          user_id?: string
          created_at?: string
          last_active_at?: string
        }
        Relationships: []
      }
    }
    Views: {
      [_ in never]: never
    }
    Functions: {
      check_missed_calls: { Args: never; Returns: undefined }
      cleanup_expired_otps: { Args: never; Returns: number }
      cleanup_expired_stories: { Args: never; Returns: number }
      create_channel: {
        Args: {
          p_avatar_url?: string
          p_description?: string
          p_is_public?: boolean
          p_name: string
        }
        Returns: string
      }
      create_group_chat: {
        Args: { p_avatar_url?: string; p_description?: string; p_name: string }
        Returns: string
      }
      get_or_create_dm: { Args: { target_user_id: string }; Returns: string }
      get_or_create_dm_by_display_name: {
        Args: { target_display_name: string }
        Returns: string
      }
      get_user_conversation_ids: {
        Args: { user_uuid: string }
        Returns: string[]
      }
      has_role: {
        Args: {
          _role: Database["public"]["Enums"]["app_role"]
          _user_id: string
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
      is_group_member: {
        Args: { _group_id: string; _user_id: string }
        Returns: boolean
      }
    }
    Enums: {
      agent_status: "pending" | "active" | "suspended" | "blocked"
      app_role: "admin" | "moderator" | "user"
      calculation_status: "draft" | "sent" | "expired" | "converted"
      commission_status: "pending" | "confirmed" | "paid" | "cancelled"
      deal_type: "sale" | "rent" | "daily"
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
      payout_status: "pending" | "processing" | "completed" | "failed"
      policy_status: "pending" | "active" | "expired" | "cancelled"
      property_status: "active" | "sold" | "rented" | "inactive"
      property_type: "apartment" | "house" | "room" | "commercial" | "land"
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
  public: {
    Enums: {
      agent_status: ["pending", "active", "suspended", "blocked"],
      app_role: ["admin", "moderator", "user"],
      calculation_status: ["draft", "sent", "expired", "converted"],
      commission_status: ["pending", "confirmed", "paid", "cancelled"],
      deal_type: ["sale", "rent", "daily"],
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
      payout_status: ["pending", "processing", "completed", "failed"],
      policy_status: ["pending", "active", "expired", "cancelled"],
      property_status: ["active", "sold", "rented", "inactive"],
      property_type: ["apartment", "house", "room", "commercial", "land"],
    },
  },
} as const
