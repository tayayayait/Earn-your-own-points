export type Json = string | number | boolean | null | { [key: string]: Json | undefined } | Json[];

export type Database = {
  // Allows to automatically instantiate createClient with right options
  // instead of createClient<Database, { PostgrestVersion: 'XX' }>(URL, KEY)
  __InternalSupabase: {
    PostgrestVersion: "14.5";
  };
  graphql_public: {
    Tables: {
      [_ in never]: never;
    };
    Views: {
      [_ in never]: never;
    };
    Functions: {
      graphql: {
        Args: {
          extensions?: Json;
          operationName?: string;
          query?: string;
          variables?: Json;
        };
        Returns: Json;
      };
    };
    Enums: {
      [_ in never]: never;
    };
    CompositeTypes: {
      [_ in never]: never;
    };
  };
  public: {
    Tables: {
      admin_customer_notes: {
        Row: {
          body: string;
          created_at: string;
          created_by: string | null;
          id: string;
          user_id: string;
        };
        Insert: {
          body: string;
          created_at?: string;
          created_by?: string | null;
          id?: string;
          user_id: string;
        };
        Update: {
          body?: string;
          created_at?: string;
          created_by?: string | null;
          id?: string;
          user_id?: string;
        };
        Relationships: [
          {
            foreignKeyName: "admin_customer_notes_created_by_fkey";
            columns: ["created_by"];
            isOneToOne: false;
            referencedRelation: "profiles";
            referencedColumns: ["id"];
          },
          {
            foreignKeyName: "admin_customer_notes_user_id_fkey";
            columns: ["user_id"];
            isOneToOne: false;
            referencedRelation: "profiles";
            referencedColumns: ["id"];
          },
        ];
      };
      admin_invitations: {
        Row: {
          accepted_by: string | null;
          admin_role: Database["public"]["Enums"]["admin_role"];
          created_at: string;
          created_by: string | null;
          email: string;
          expires_at: string;
          id: string;
          status: string;
          token_hash: string;
          token_prefix: string;
          token_suffix: string;
          updated_at: string;
        };
        Insert: {
          accepted_by?: string | null;
          admin_role: Database["public"]["Enums"]["admin_role"];
          created_at?: string;
          created_by?: string | null;
          email: string;
          expires_at: string;
          id?: string;
          status?: string;
          token_hash: string;
          token_prefix: string;
          token_suffix: string;
          updated_at?: string;
        };
        Update: {
          accepted_by?: string | null;
          admin_role?: Database["public"]["Enums"]["admin_role"];
          created_at?: string;
          created_by?: string | null;
          email?: string;
          expires_at?: string;
          id?: string;
          status?: string;
          token_hash?: string;
          token_prefix?: string;
          token_suffix?: string;
          updated_at?: string;
        };
        Relationships: [
          {
            foreignKeyName: "admin_invitations_accepted_by_fkey";
            columns: ["accepted_by"];
            isOneToOne: false;
            referencedRelation: "profiles";
            referencedColumns: ["id"];
          },
          {
            foreignKeyName: "admin_invitations_created_by_fkey";
            columns: ["created_by"];
            isOneToOne: false;
            referencedRelation: "profiles";
            referencedColumns: ["id"];
          },
        ];
      };
      api_keys: {
        Row: {
          created_at: string;
          created_by: string | null;
          id: string;
          key_hash: string;
          key_prefix: string;
          key_suffix: string;
          last_rotated_at: string | null;
          last_used_at: string | null;
          name: string;
          revoked_at: string | null;
          revoked_by: string | null;
          status: string;
          updated_at: string;
        };
        Insert: {
          created_at?: string;
          created_by?: string | null;
          id?: string;
          key_hash: string;
          key_prefix: string;
          key_suffix: string;
          last_rotated_at?: string | null;
          last_used_at?: string | null;
          name: string;
          revoked_at?: string | null;
          revoked_by?: string | null;
          status?: string;
          updated_at?: string;
        };
        Update: {
          created_at?: string;
          created_by?: string | null;
          id?: string;
          key_hash?: string;
          key_prefix?: string;
          key_suffix?: string;
          last_rotated_at?: string | null;
          last_used_at?: string | null;
          name?: string;
          revoked_at?: string | null;
          revoked_by?: string | null;
          status?: string;
          updated_at?: string;
        };
        Relationships: [
          {
            foreignKeyName: "api_keys_created_by_fkey";
            columns: ["created_by"];
            isOneToOne: false;
            referencedRelation: "profiles";
            referencedColumns: ["id"];
          },
          {
            foreignKeyName: "api_keys_revoked_by_fkey";
            columns: ["revoked_by"];
            isOneToOne: false;
            referencedRelation: "profiles";
            referencedColumns: ["id"];
          },
        ];
      };
      audit_logs: {
        Row: {
          action: string;
          actor_id: string | null;
          actor_role: Database["public"]["Enums"]["admin_role"] | null;
          after_data: Json | null;
          before_data: Json | null;
          created_at: string;
          id: string;
          ip_address: unknown;
          reason: string | null;
          target_id: string | null;
          target_table: string;
          user_agent: string | null;
        };
        Insert: {
          action: string;
          actor_id?: string | null;
          actor_role?: Database["public"]["Enums"]["admin_role"] | null;
          after_data?: Json | null;
          before_data?: Json | null;
          created_at?: string;
          id?: string;
          ip_address?: unknown;
          reason?: string | null;
          target_id?: string | null;
          target_table: string;
          user_agent?: string | null;
        };
        Update: {
          action?: string;
          actor_id?: string | null;
          actor_role?: Database["public"]["Enums"]["admin_role"] | null;
          after_data?: Json | null;
          before_data?: Json | null;
          created_at?: string;
          id?: string;
          ip_address?: unknown;
          reason?: string | null;
          target_id?: string | null;
          target_table?: string;
          user_agent?: string | null;
        };
        Relationships: [
          {
            foreignKeyName: "audit_logs_actor_id_fkey";
            columns: ["actor_id"];
            isOneToOne: false;
            referencedRelation: "profiles";
            referencedColumns: ["id"];
          },
        ];
      };
      brand_settings: {
        Row: {
          home_message: string | null;
          id: string;
          logo_url: string | null;
          point_label: string;
          primary_color: string;
          secondary_color: string | null;
          service_name: string;
          updated_at: string;
          updated_by: string | null;
        };
        Insert: {
          home_message?: string | null;
          id?: string;
          logo_url?: string | null;
          point_label?: string;
          primary_color?: string;
          secondary_color?: string | null;
          service_name?: string;
          updated_at?: string;
          updated_by?: string | null;
        };
        Update: {
          home_message?: string | null;
          id?: string;
          logo_url?: string | null;
          point_label?: string;
          primary_color?: string;
          secondary_color?: string | null;
          service_name?: string;
          updated_at?: string;
          updated_by?: string | null;
        };
        Relationships: [
          {
            foreignKeyName: "brand_settings_updated_by_fkey";
            columns: ["updated_by"];
            isOneToOne: false;
            referencedRelation: "profiles";
            referencedColumns: ["id"];
          },
        ];
      };
      customer_tiers: {
        Row: {
          base_earn_rate: number;
          bonus_earn_rate: number;
          created_at: string;
          created_by: string | null;
          id: string;
          min_keep_spend: number;
          min_purchase_count: number;
          min_spend: number;
          name: string;
          qualification_months: number;
          sort_order: number;
          status: Database["public"]["Enums"]["policy_status"];
          updated_at: string;
          updated_by: string | null;
        };
        Insert: {
          base_earn_rate?: number;
          bonus_earn_rate?: number;
          created_at?: string;
          created_by?: string | null;
          id?: string;
          min_keep_spend?: number;
          min_purchase_count?: number;
          min_spend?: number;
          name: string;
          qualification_months?: number;
          sort_order: number;
          status?: Database["public"]["Enums"]["policy_status"];
          updated_at?: string;
          updated_by?: string | null;
        };
        Update: {
          base_earn_rate?: number;
          bonus_earn_rate?: number;
          created_at?: string;
          created_by?: string | null;
          id?: string;
          min_keep_spend?: number;
          min_purchase_count?: number;
          min_spend?: number;
          name?: string;
          qualification_months?: number;
          sort_order?: number;
          status?: Database["public"]["Enums"]["policy_status"];
          updated_at?: string;
          updated_by?: string | null;
        };
        Relationships: [
          {
            foreignKeyName: "customer_tiers_created_by_fkey";
            columns: ["created_by"];
            isOneToOne: false;
            referencedRelation: "profiles";
            referencedColumns: ["id"];
          },
          {
            foreignKeyName: "customer_tiers_updated_by_fkey";
            columns: ["updated_by"];
            isOneToOne: false;
            referencedRelation: "profiles";
            referencedColumns: ["id"];
          },
        ];
      };
      point_events: {
        Row: {
          created_at: string;
          created_by: string | null;
          customer_limit: number | null;
          description: string | null;
          ends_at: string | null;
          id: string;
          name: string;
          priority: number;
          reward_type: string;
          reward_value: number;
          spent_points: number;
          starts_at: string;
          status: Database["public"]["Enums"]["policy_status"];
          target_rules: Json;
          total_budget_points: number | null;
          updated_at: string;
          updated_by: string | null;
        };
        Insert: {
          created_at?: string;
          created_by?: string | null;
          customer_limit?: number | null;
          description?: string | null;
          ends_at?: string | null;
          id?: string;
          name: string;
          priority?: number;
          reward_type: string;
          reward_value: number;
          spent_points?: number;
          starts_at: string;
          status?: Database["public"]["Enums"]["policy_status"];
          target_rules?: Json;
          total_budget_points?: number | null;
          updated_at?: string;
          updated_by?: string | null;
        };
        Update: {
          created_at?: string;
          created_by?: string | null;
          customer_limit?: number | null;
          description?: string | null;
          ends_at?: string | null;
          id?: string;
          name?: string;
          priority?: number;
          reward_type?: string;
          reward_value?: number;
          spent_points?: number;
          starts_at?: string;
          status?: Database["public"]["Enums"]["policy_status"];
          target_rules?: Json;
          total_budget_points?: number | null;
          updated_at?: string;
          updated_by?: string | null;
        };
        Relationships: [
          {
            foreignKeyName: "point_events_created_by_fkey";
            columns: ["created_by"];
            isOneToOne: false;
            referencedRelation: "profiles";
            referencedColumns: ["id"];
          },
          {
            foreignKeyName: "point_events_updated_by_fkey";
            columns: ["updated_by"];
            isOneToOne: false;
            referencedRelation: "profiles";
            referencedColumns: ["id"];
          },
        ];
      };
      point_policies: {
        Row: {
          created_at: string;
          created_by: string | null;
          earn_unit: number;
          earning_rate: number;
          ends_at: string | null;
          excluded_payment_methods: string[];
          id: string;
          max_redeem_ratio: number;
          min_redeem_points: number;
          name: string;
          pending_days: number;
          redeem_unit: number;
          rounding_method: string;
          starts_at: string | null;
          status: Database["public"]["Enums"]["policy_status"];
          updated_at: string;
          updated_by: string | null;
          valid_months: number;
        };
        Insert: {
          created_at?: string;
          created_by?: string | null;
          earn_unit?: number;
          earning_rate?: number;
          ends_at?: string | null;
          excluded_payment_methods?: string[];
          id?: string;
          max_redeem_ratio?: number;
          min_redeem_points?: number;
          name: string;
          pending_days?: number;
          redeem_unit?: number;
          rounding_method?: string;
          starts_at?: string | null;
          status?: Database["public"]["Enums"]["policy_status"];
          updated_at?: string;
          updated_by?: string | null;
          valid_months?: number;
        };
        Update: {
          created_at?: string;
          created_by?: string | null;
          earn_unit?: number;
          earning_rate?: number;
          ends_at?: string | null;
          excluded_payment_methods?: string[];
          id?: string;
          max_redeem_ratio?: number;
          min_redeem_points?: number;
          name?: string;
          pending_days?: number;
          redeem_unit?: number;
          rounding_method?: string;
          starts_at?: string | null;
          status?: Database["public"]["Enums"]["policy_status"];
          updated_at?: string;
          updated_by?: string | null;
          valid_months?: number;
        };
        Relationships: [
          {
            foreignKeyName: "point_policies_created_by_fkey";
            columns: ["created_by"];
            isOneToOne: false;
            referencedRelation: "profiles";
            referencedColumns: ["id"];
          },
          {
            foreignKeyName: "point_policies_updated_by_fkey";
            columns: ["updated_by"];
            isOneToOne: false;
            referencedRelation: "profiles";
            referencedColumns: ["id"];
          },
        ];
      };
      point_transactions: {
        Row: {
          amount: number;
          balance_after: number | null;
          created_at: string;
          created_by: string | null;
          expires_at: string | null;
          external_transaction_id: string | null;
          id: string;
          idempotency_key: string | null;
          memo: string | null;
          original_transaction_id: string | null;
          policy_snapshot: Json;
          reference: string | null;
          status: Database["public"]["Enums"]["tx_status"];
          type: Database["public"]["Enums"]["tx_type"];
          user_id: string;
        };
        Insert: {
          amount: number;
          balance_after?: number | null;
          created_at?: string;
          created_by?: string | null;
          expires_at?: string | null;
          external_transaction_id?: string | null;
          id?: string;
          idempotency_key?: string | null;
          memo?: string | null;
          original_transaction_id?: string | null;
          policy_snapshot?: Json;
          reference?: string | null;
          status?: Database["public"]["Enums"]["tx_status"];
          type: Database["public"]["Enums"]["tx_type"];
          user_id: string;
        };
        Update: {
          amount?: number;
          balance_after?: number | null;
          created_at?: string;
          created_by?: string | null;
          expires_at?: string | null;
          external_transaction_id?: string | null;
          id?: string;
          idempotency_key?: string | null;
          memo?: string | null;
          original_transaction_id?: string | null;
          policy_snapshot?: Json;
          reference?: string | null;
          status?: Database["public"]["Enums"]["tx_status"];
          type?: Database["public"]["Enums"]["tx_type"];
          user_id?: string;
        };
        Relationships: [
          {
            foreignKeyName: "point_transactions_original_transaction_id_fkey";
            columns: ["original_transaction_id"];
            isOneToOne: false;
            referencedRelation: "point_transactions";
            referencedColumns: ["id"];
          },
        ];
      };
      product_point_policies: {
        Row: {
          created_at: string;
          created_by: string | null;
          earning_rate: number;
          ends_at: string | null;
          excluded: boolean;
          id: string;
          name: string;
          priority: number;
          starts_at: string | null;
          status: Database["public"]["Enums"]["policy_status"];
          target_ids: string[];
          target_type: string;
          updated_at: string;
          updated_by: string | null;
        };
        Insert: {
          created_at?: string;
          created_by?: string | null;
          earning_rate?: number;
          ends_at?: string | null;
          excluded?: boolean;
          id?: string;
          name: string;
          priority?: number;
          starts_at?: string | null;
          status?: Database["public"]["Enums"]["policy_status"];
          target_ids?: string[];
          target_type: string;
          updated_at?: string;
          updated_by?: string | null;
        };
        Update: {
          created_at?: string;
          created_by?: string | null;
          earning_rate?: number;
          ends_at?: string | null;
          excluded?: boolean;
          id?: string;
          name?: string;
          priority?: number;
          starts_at?: string | null;
          status?: Database["public"]["Enums"]["policy_status"];
          target_ids?: string[];
          target_type?: string;
          updated_at?: string;
          updated_by?: string | null;
        };
        Relationships: [
          {
            foreignKeyName: "product_point_policies_created_by_fkey";
            columns: ["created_by"];
            isOneToOne: false;
            referencedRelation: "profiles";
            referencedColumns: ["id"];
          },
          {
            foreignKeyName: "product_point_policies_updated_by_fkey";
            columns: ["updated_by"];
            isOneToOne: false;
            referencedRelation: "profiles";
            referencedColumns: ["id"];
          },
        ];
      };
      profiles: {
        Row: {
          admin_role: Database["public"]["Enums"]["admin_role"] | null;
          birth_date: string | null;
          created_at: string;
          customer_code: string | null;
          email: string | null;
          full_name: string | null;
          id: string;
          last_transaction_at: string | null;
          marketing_opt_in: boolean;
          phone: string | null;
          point_earn_notify: boolean;
          point_expiry_notify: boolean;
          status: Database["public"]["Enums"]["user_status"];
          tier_id: string | null;
          updated_at: string;
          withdrawal_requested_at: string | null;
        };
        Insert: {
          admin_role?: Database["public"]["Enums"]["admin_role"] | null;
          birth_date?: string | null;
          created_at?: string;
          customer_code?: string | null;
          email?: string | null;
          full_name?: string | null;
          id: string;
          last_transaction_at?: string | null;
          marketing_opt_in?: boolean;
          phone?: string | null;
          point_earn_notify?: boolean;
          point_expiry_notify?: boolean;
          status?: Database["public"]["Enums"]["user_status"];
          tier_id?: string | null;
          updated_at?: string;
          withdrawal_requested_at?: string | null;
        };
        Update: {
          admin_role?: Database["public"]["Enums"]["admin_role"] | null;
          birth_date?: string | null;
          created_at?: string;
          customer_code?: string | null;
          email?: string | null;
          full_name?: string | null;
          id?: string;
          last_transaction_at?: string | null;
          marketing_opt_in?: boolean;
          phone?: string | null;
          point_earn_notify?: boolean;
          point_expiry_notify?: boolean;
          status?: Database["public"]["Enums"]["user_status"];
          tier_id?: string | null;
          updated_at?: string;
          withdrawal_requested_at?: string | null;
        };
        Relationships: [
          {
            foreignKeyName: "profiles_tier_id_fkey";
            columns: ["tier_id"];
            isOneToOne: false;
            referencedRelation: "customer_tiers";
            referencedColumns: ["id"];
          },
        ];
      };
      report_export_jobs: {
        Row: {
          created_at: string;
          download_url: string | null;
          error_message: string | null;
          filters: Json;
          id: string;
          report_type: string;
          requested_by: string | null;
          row_count: number;
          status: Database["public"]["Enums"]["async_job_status"];
          updated_at: string;
        };
        Insert: {
          created_at?: string;
          download_url?: string | null;
          error_message?: string | null;
          filters?: Json;
          id?: string;
          report_type?: string;
          requested_by?: string | null;
          row_count?: number;
          status?: Database["public"]["Enums"]["async_job_status"];
          updated_at?: string;
        };
        Update: {
          created_at?: string;
          download_url?: string | null;
          error_message?: string | null;
          filters?: Json;
          id?: string;
          report_type?: string;
          requested_by?: string | null;
          row_count?: number;
          status?: Database["public"]["Enums"]["async_job_status"];
          updated_at?: string;
        };
        Relationships: [
          {
            foreignKeyName: "report_export_jobs_requested_by_fkey";
            columns: ["requested_by"];
            isOneToOne: false;
            referencedRelation: "profiles";
            referencedColumns: ["id"];
          },
        ];
      };
      user_roles: {
        Row: {
          created_at: string;
          id: string;
          role: Database["public"]["Enums"]["app_role"];
          user_id: string;
        };
        Insert: {
          created_at?: string;
          id?: string;
          role: Database["public"]["Enums"]["app_role"];
          user_id: string;
        };
        Update: {
          created_at?: string;
          id?: string;
          role?: Database["public"]["Enums"]["app_role"];
          user_id?: string;
        };
        Relationships: [];
      };
      webhook_logs: {
        Row: {
          created_at: string;
          endpoint: string;
          error_code: string | null;
          error_message: string | null;
          event_type: string | null;
          id: string;
          payload: Json;
          request_id: string;
          response_time_ms: number | null;
          retried_at: string | null;
          retry_count: number;
          status_code: number | null;
          webhook_id: string | null;
        };
        Insert: {
          created_at?: string;
          endpoint: string;
          error_code?: string | null;
          error_message?: string | null;
          event_type?: string | null;
          id?: string;
          payload?: Json;
          request_id: string;
          response_time_ms?: number | null;
          retried_at?: string | null;
          retry_count?: number;
          status_code?: number | null;
          webhook_id?: string | null;
        };
        Update: {
          created_at?: string;
          endpoint?: string;
          error_code?: string | null;
          error_message?: string | null;
          event_type?: string | null;
          id?: string;
          payload?: Json;
          request_id?: string;
          response_time_ms?: number | null;
          retried_at?: string | null;
          retry_count?: number;
          status_code?: number | null;
          webhook_id?: string | null;
        };
        Relationships: [
          {
            foreignKeyName: "webhook_logs_webhook_id_fkey";
            columns: ["webhook_id"];
            isOneToOne: false;
            referencedRelation: "webhooks";
            referencedColumns: ["id"];
          },
        ];
      };
      webhooks: {
        Row: {
          created_at: string;
          created_by: string | null;
          event_types: string[];
          id: string;
          last_failure_at: string | null;
          last_success_at: string | null;
          last_tested_at: string | null;
          name: string | null;
          signing_key: string;
          signing_key_prefix: string | null;
          signing_key_suffix: string | null;
          status: string;
          updated_at: string;
          updated_by: string | null;
          url: string;
        };
        Insert: {
          created_at?: string;
          created_by?: string | null;
          event_types: string[];
          id?: string;
          last_failure_at?: string | null;
          last_success_at?: string | null;
          last_tested_at?: string | null;
          name?: string | null;
          signing_key: string;
          signing_key_prefix?: string | null;
          signing_key_suffix?: string | null;
          status?: string;
          updated_at?: string;
          updated_by?: string | null;
          url: string;
        };
        Update: {
          created_at?: string;
          created_by?: string | null;
          event_types?: string[];
          id?: string;
          last_failure_at?: string | null;
          last_success_at?: string | null;
          last_tested_at?: string | null;
          name?: string | null;
          signing_key?: string;
          signing_key_prefix?: string | null;
          signing_key_suffix?: string | null;
          status?: string;
          updated_at?: string;
          updated_by?: string | null;
          url?: string;
        };
        Relationships: [
          {
            foreignKeyName: "webhooks_created_by_fkey";
            columns: ["created_by"];
            isOneToOne: false;
            referencedRelation: "profiles";
            referencedColumns: ["id"];
          },
          {
            foreignKeyName: "webhooks_updated_by_fkey";
            columns: ["updated_by"];
            isOneToOne: false;
            referencedRelation: "profiles";
            referencedColumns: ["id"];
          },
        ];
      };
    };
    Views: {
      [_ in never]: never;
    };
    Functions: {
      add_admin_customer_note: {
        Args: { _body: string; _user_id: string };
        Returns: Json;
      };
      cancel_admin_transaction: {
        Args: {
          _idempotency_key: string;
          _reason: string;
          _transaction_id: string;
        };
        Returns: Json;
      };
      create_admin_api_key: {
        Args: { _name: string; _reason: string };
        Returns: Json;
      };
      create_admin_customer_point_transaction: {
        Args: {
          _amount: number;
          _expires_at?: string;
          _idempotency_key: string;
          _memo: string;
          _type: string;
          _user_id: string;
        };
        Returns: Json;
      };
      create_admin_report_export: {
        Args: {
          _date_from: string;
          _date_to: string;
          _reason?: string;
          _row_count: number;
        };
        Returns: Json;
      };
      disable_admin_base_policy: {
        Args: { _policy_id: string; _reason: string };
        Returns: Json;
      };
      disable_admin_product_policy: {
        Args: { _policy_id: string; _reason: string };
        Returns: Json;
      };
      disable_admin_tier_policy: {
        Args: {
          _reason: string;
          _replacement_tier_id: string;
          _tier_id: string;
        };
        Returns: Json;
      };
      generate_admin_integration_secret: {
        Args: { _prefix: string };
        Returns: string;
      };
      get_admin_admins: { Args: never; Returns: Json };
      get_admin_audit_logs: {
        Args: {
          _action?: string;
          _actor_id?: string;
          _date_from?: string;
          _date_to?: string;
          _page?: number;
          _page_size?: number;
          _target_table?: string;
        };
        Returns: Json;
      };
      get_admin_base_policy: { Args: never; Returns: Json };
      get_admin_brand_settings: { Args: never; Returns: Json };
      get_admin_customer_detail: { Args: { _user_id: string }; Returns: Json };
      get_admin_customers: {
        Args: {
          _joined_from?: string;
          _joined_to?: string;
          _max_points?: number;
          _min_points?: number;
          _page?: number;
          _page_size?: number;
          _query?: string;
          _sort_by?: string;
          _sort_dir?: string;
          _statuses?: string[];
          _tier_ids?: string[];
        };
        Returns: Json;
      };
      get_admin_dashboard_metrics: { Args: { _days?: number }; Returns: Json };
      get_admin_events: { Args: never; Returns: Json };
      get_admin_integrations: { Args: never; Returns: Json };
      get_admin_manual_transaction_context: {
        Args: { _user_id: string };
        Returns: Json;
      };
      get_admin_product_policies: { Args: never; Returns: Json };
      get_admin_reports: {
        Args: { _date_from: string; _date_to: string; _limit?: number };
        Returns: Json;
      };
      get_admin_tier_policies: { Args: never; Returns: Json };
      get_admin_transaction_detail: {
        Args: { _transaction_id: string };
        Returns: Json;
      };
      get_admin_transactions: {
        Args: {
          _customer_id?: string;
          _date_from?: string;
          _date_to?: string;
          _external_transaction_id?: string;
          _page?: number;
          _page_size?: number;
          _status?: string;
          _transaction_id?: string;
          _type?: string;
        };
        Returns: Json;
      };
      get_app_benefits: { Args: never; Returns: Json };
      get_app_home: { Args: never; Returns: Json };
      get_app_profile: { Args: never; Returns: Json };
      get_app_transactions: {
        Args: {
          _date_from?: string;
          _date_to?: string;
          _status?: string;
          _type?: string;
        };
        Returns: Json;
      };
      get_balance: {
        Args: { _user_id: string };
        Returns: {
          available: number;
          pending: number;
          total: number;
        }[];
      };
      get_current_admin_context: { Args: never; Returns: Json };
      has_admin_permission: {
        Args: { _permission_key: string };
        Returns: boolean;
      };
      has_role: {
        Args: {
          _role: Database["public"]["Enums"]["app_role"];
          _user_id: string;
        };
        Returns: boolean;
      };
      invite_admin_user: {
        Args: { _admin_role: string; _email: string; _reason: string };
        Returns: Json;
      };
      percent_change: {
        Args: { current_value: number; previous_value: number };
        Returns: number;
      };
      regenerate_admin_api_key: {
        Args: { _api_key_id: string; _reason: string };
        Returns: Json;
      };
      reorder_admin_tier_policies: {
        Args: { _reason: string; _tier_ids: string[] };
        Returns: Json;
      };
      request_app_withdrawal: { Args: { _reason?: string }; Returns: Json };
      require_admin_permission: {
        Args: { _permission_key: string };
        Returns: undefined;
      };
      retry_admin_transaction: {
        Args: { _reason: string; _transaction_id: string };
        Returns: Json;
      };
      retry_admin_webhook_log: {
        Args: { _log_id: string; _reason: string };
        Returns: Json;
      };
      revoke_admin_api_key: {
        Args: { _api_key_id: string; _reason: string };
        Returns: Json;
      };
      save_admin_base_policy: {
        Args: {
          _apply_mode: string;
          _earn_unit: number;
          _earning_rate: number;
          _excluded_payment_methods: string[];
          _max_redeem_ratio: number;
          _min_redeem_points: number;
          _name: string;
          _pending_days: number;
          _reason: string;
          _redeem_unit: number;
          _rounding_method: string;
          _scheduled_at: string;
          _valid_months: number;
        };
        Returns: Json;
      };
      save_admin_brand_settings: {
        Args: {
          _home_message: string;
          _logo_url: string;
          _point_label: string;
          _primary_color: string;
          _reason: string;
          _secondary_color: string;
          _service_name: string;
        };
        Returns: Json;
      };
      save_admin_event: {
        Args: {
          _customer_limit: number;
          _description: string;
          _ends_at: string;
          _event_id: string;
          _name: string;
          _priority: number;
          _reason: string;
          _reward_type: string;
          _reward_value: number;
          _starts_at: string;
          _status: string;
          _target_rules: Json;
          _total_budget_points: number;
        };
        Returns: Json;
      };
      save_admin_product_policy: {
        Args: {
          _earning_rate: number;
          _ends_at: string;
          _excluded: boolean;
          _name: string;
          _policy_id: string;
          _priority: number;
          _reason: string;
          _starts_at: string;
          _status: string;
          _target_ids: string[];
          _target_type: string;
        };
        Returns: Json;
      };
      save_admin_tier_policy: {
        Args: {
          _base_earn_rate: number;
          _bonus_earn_rate: number;
          _min_keep_spend: number;
          _min_purchase_count: number;
          _min_spend: number;
          _name: string;
          _qualification_months: number;
          _reason: string;
          _sort_order: number;
          _status: string;
          _tier_id: string;
        };
        Returns: Json;
      };
      save_admin_webhook: {
        Args: {
          _event_types: string[];
          _name: string;
          _reason: string;
          _rotate_signing_key: boolean;
          _status: string;
          _url: string;
          _webhook_id: string;
        };
        Returns: Json;
      };
      search_admin_policy_targets: {
        Args: { _limit?: number; _query: string; _target_type: string };
        Returns: Json;
      };
      search_admin_transaction_customers: {
        Args: { _limit?: number; _query?: string };
        Returns: Json;
      };
      test_admin_webhook: {
        Args: { _reason: string; _webhook_id: string };
        Returns: Json;
      };
      update_admin_customer_profile: {
        Args: {
          _birth_date: string;
          _email: string;
          _full_name: string;
          _phone: string;
          _reason: string;
          _user_id: string;
        };
        Returns: Json;
      };
      update_admin_customer_status: {
        Args: { _reason: string; _status: string; _user_id: string };
        Returns: Json;
      };
      update_admin_event_status: {
        Args: { _event_id: string; _reason: string; _status: string };
        Returns: Json;
      };
      update_admin_role: {
        Args: { _admin_role: string; _reason: string; _user_id: string };
        Returns: Json;
      };
      update_app_profile: {
        Args: {
          _email: string;
          _full_name: string;
          _marketing_opt_in: boolean;
          _phone: string;
          _point_earn_notify: boolean;
          _point_expiry_notify: boolean;
        };
        Returns: Json;
      };
    };
    Enums: {
      admin_role: "owner" | "manager" | "operator" | "viewer";
      app_role: "admin" | "customer";
      async_job_status: "queued" | "running" | "succeeded" | "failed" | "retrying";
      policy_status: "draft" | "scheduled" | "active" | "paused" | "ended" | "disabled";
      tx_status:
        "pending" | "completed" | "cancelled" | "confirmed" | "canceled" | "failed" | "expired";
      tx_type:
        | "earn"
        | "redeem"
        | "cancel"
        | "expire"
        | "adjust"
        | "event_earn"
        | "manual_earn"
        | "use"
        | "manual_deduct"
        | "earn_cancel"
        | "use_cancel";
      user_status: "active" | "dormant" | "withdrawn" | "blocked";
    };
    CompositeTypes: {
      [_ in never]: never;
    };
  };
};

type DatabaseWithoutInternals = Omit<Database, "__InternalSupabase">;

type DefaultSchema = DatabaseWithoutInternals[Extract<keyof Database, "public">];

export type Tables<
  DefaultSchemaTableNameOrOptions extends
    | keyof (DefaultSchema["Tables"] & DefaultSchema["Views"])
    | { schema: keyof DatabaseWithoutInternals },
  TableName extends (DefaultSchemaTableNameOrOptions extends {
    schema: keyof DatabaseWithoutInternals;
  }
    ? keyof (DatabaseWithoutInternals[DefaultSchemaTableNameOrOptions["schema"]]["Tables"] &
        DatabaseWithoutInternals[DefaultSchemaTableNameOrOptions["schema"]]["Views"])
    : never) = never,
> = DefaultSchemaTableNameOrOptions extends {
  schema: keyof DatabaseWithoutInternals;
}
  ? (DatabaseWithoutInternals[DefaultSchemaTableNameOrOptions["schema"]]["Tables"] &
      DatabaseWithoutInternals[DefaultSchemaTableNameOrOptions["schema"]]["Views"])[TableName] extends {
      Row: infer R;
    }
    ? R
    : never
  : DefaultSchemaTableNameOrOptions extends keyof (DefaultSchema["Tables"] & DefaultSchema["Views"])
    ? (DefaultSchema["Tables"] & DefaultSchema["Views"])[DefaultSchemaTableNameOrOptions] extends {
        Row: infer R;
      }
      ? R
      : never
    : never;

export type TablesInsert<
  DefaultSchemaTableNameOrOptions extends
    keyof DefaultSchema["Tables"] | { schema: keyof DatabaseWithoutInternals },
  TableName extends (DefaultSchemaTableNameOrOptions extends {
    schema: keyof DatabaseWithoutInternals;
  }
    ? keyof DatabaseWithoutInternals[DefaultSchemaTableNameOrOptions["schema"]]["Tables"]
    : never) = never,
> = DefaultSchemaTableNameOrOptions extends {
  schema: keyof DatabaseWithoutInternals;
}
  ? DatabaseWithoutInternals[DefaultSchemaTableNameOrOptions["schema"]]["Tables"][TableName] extends {
      Insert: infer I;
    }
    ? I
    : never
  : DefaultSchemaTableNameOrOptions extends keyof DefaultSchema["Tables"]
    ? DefaultSchema["Tables"][DefaultSchemaTableNameOrOptions] extends {
        Insert: infer I;
      }
      ? I
      : never
    : never;

export type TablesUpdate<
  DefaultSchemaTableNameOrOptions extends
    keyof DefaultSchema["Tables"] | { schema: keyof DatabaseWithoutInternals },
  TableName extends (DefaultSchemaTableNameOrOptions extends {
    schema: keyof DatabaseWithoutInternals;
  }
    ? keyof DatabaseWithoutInternals[DefaultSchemaTableNameOrOptions["schema"]]["Tables"]
    : never) = never,
> = DefaultSchemaTableNameOrOptions extends {
  schema: keyof DatabaseWithoutInternals;
}
  ? DatabaseWithoutInternals[DefaultSchemaTableNameOrOptions["schema"]]["Tables"][TableName] extends {
      Update: infer U;
    }
    ? U
    : never
  : DefaultSchemaTableNameOrOptions extends keyof DefaultSchema["Tables"]
    ? DefaultSchema["Tables"][DefaultSchemaTableNameOrOptions] extends {
        Update: infer U;
      }
      ? U
      : never
    : never;

export type Enums<
  DefaultSchemaEnumNameOrOptions extends
    keyof DefaultSchema["Enums"] | { schema: keyof DatabaseWithoutInternals },
  EnumName extends (DefaultSchemaEnumNameOrOptions extends {
    schema: keyof DatabaseWithoutInternals;
  }
    ? keyof DatabaseWithoutInternals[DefaultSchemaEnumNameOrOptions["schema"]]["Enums"]
    : never) = never,
> = DefaultSchemaEnumNameOrOptions extends {
  schema: keyof DatabaseWithoutInternals;
}
  ? DatabaseWithoutInternals[DefaultSchemaEnumNameOrOptions["schema"]]["Enums"][EnumName]
  : DefaultSchemaEnumNameOrOptions extends keyof DefaultSchema["Enums"]
    ? DefaultSchema["Enums"][DefaultSchemaEnumNameOrOptions]
    : never;

export type CompositeTypes<
  PublicCompositeTypeNameOrOptions extends
    keyof DefaultSchema["CompositeTypes"] | { schema: keyof DatabaseWithoutInternals },
  CompositeTypeName extends (PublicCompositeTypeNameOrOptions extends {
    schema: keyof DatabaseWithoutInternals;
  }
    ? keyof DatabaseWithoutInternals[PublicCompositeTypeNameOrOptions["schema"]]["CompositeTypes"]
    : never) = never,
> = PublicCompositeTypeNameOrOptions extends {
  schema: keyof DatabaseWithoutInternals;
}
  ? DatabaseWithoutInternals[PublicCompositeTypeNameOrOptions["schema"]]["CompositeTypes"][CompositeTypeName]
  : PublicCompositeTypeNameOrOptions extends keyof DefaultSchema["CompositeTypes"]
    ? DefaultSchema["CompositeTypes"][PublicCompositeTypeNameOrOptions]
    : never;

export const Constants = {
  graphql_public: {
    Enums: {},
  },
  public: {
    Enums: {
      admin_role: ["owner", "manager", "operator", "viewer"],
      app_role: ["admin", "customer"],
      async_job_status: ["queued", "running", "succeeded", "failed", "retrying"],
      policy_status: ["draft", "scheduled", "active", "paused", "ended", "disabled"],
      tx_status: [
        "pending",
        "completed",
        "cancelled",
        "confirmed",
        "canceled",
        "failed",
        "expired",
      ],
      tx_type: [
        "earn",
        "redeem",
        "cancel",
        "expire",
        "adjust",
        "event_earn",
        "manual_earn",
        "use",
        "manual_deduct",
        "earn_cancel",
        "use_cancel",
      ],
      user_status: ["active", "dormant", "withdrawn", "blocked"],
    },
  },
} as const;
