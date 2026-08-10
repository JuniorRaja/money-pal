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
    PostgrestVersion: "14.15"
  }
  public: {
    Tables: {
      accounts: {
        Row: {
          created_at: string
          created_by: string | null
          credit_limit: number | null
          currency_code: string
          deleted_at: string | null
          id: string
          institution: string | null
          is_active: boolean
          is_primary: boolean
          kind: Database["public"]["Enums"]["account_kind"]
          modified_at: string
          modified_by: string | null
          name: string
          opening_balance: number
          user_id: string
        }
        Insert: {
          created_at?: string
          created_by?: string | null
          credit_limit?: number | null
          currency_code: string
          deleted_at?: string | null
          id?: string
          institution?: string | null
          is_active?: boolean
          is_primary?: boolean
          kind: Database["public"]["Enums"]["account_kind"]
          modified_at?: string
          modified_by?: string | null
          name: string
          opening_balance?: number
          user_id: string
        }
        Update: {
          created_at?: string
          created_by?: string | null
          credit_limit?: number | null
          currency_code?: string
          deleted_at?: string | null
          id?: string
          institution?: string | null
          is_active?: boolean
          is_primary?: boolean
          kind?: Database["public"]["Enums"]["account_kind"]
          modified_at?: string
          modified_by?: string | null
          name?: string
          opening_balance?: number
          user_id?: string
        }
        Relationships: [
          {
            foreignKeyName: "accounts_currency_code_fkey"
            columns: ["currency_code"]
            isOneToOne: false
            referencedRelation: "currencies"
            referencedColumns: ["code"]
          },
        ]
      }
      budget_lines: {
        Row: {
          budget_id: string
          category_id: string
          created_at: string
          created_by: string | null
          deleted_at: string | null
          id: string
          is_active: boolean
          modified_at: string
          modified_by: string | null
          planned: number
          user_id: string
        }
        Insert: {
          budget_id: string
          category_id: string
          created_at?: string
          created_by?: string | null
          deleted_at?: string | null
          id?: string
          is_active?: boolean
          modified_at?: string
          modified_by?: string | null
          planned: number
          user_id: string
        }
        Update: {
          budget_id?: string
          category_id?: string
          created_at?: string
          created_by?: string | null
          deleted_at?: string | null
          id?: string
          is_active?: boolean
          modified_at?: string
          modified_by?: string | null
          planned?: number
          user_id?: string
        }
        Relationships: [
          {
            foreignKeyName: "budget_lines_budget_id_fkey"
            columns: ["budget_id"]
            isOneToOne: false
            referencedRelation: "budgets"
            referencedColumns: ["id"]
          },
          {
            foreignKeyName: "budget_lines_category_id_fkey"
            columns: ["category_id"]
            isOneToOne: false
            referencedRelation: "categories"
            referencedColumns: ["id"]
          },
        ]
      }
      budget_templates: {
        Row: {
          category_id: string
          created_at: string
          created_by: string | null
          deleted_at: string | null
          id: string
          is_active: boolean
          modified_at: string
          modified_by: string | null
          name: string
          share_bps: number
        }
        Insert: {
          category_id: string
          created_at?: string
          created_by?: string | null
          deleted_at?: string | null
          id?: string
          is_active?: boolean
          modified_at?: string
          modified_by?: string | null
          name: string
          share_bps: number
        }
        Update: {
          category_id?: string
          created_at?: string
          created_by?: string | null
          deleted_at?: string | null
          id?: string
          is_active?: boolean
          modified_at?: string
          modified_by?: string | null
          name?: string
          share_bps?: number
        }
        Relationships: [
          {
            foreignKeyName: "budget_templates_category_id_fkey"
            columns: ["category_id"]
            isOneToOne: false
            referencedRelation: "categories"
            referencedColumns: ["id"]
          },
        ]
      }
      budgets: {
        Row: {
          created_at: string
          created_by: string | null
          currency_code: string
          deleted_at: string | null
          id: string
          is_active: boolean
          modified_at: string
          modified_by: string | null
          note: string | null
          period_month: string
          user_id: string
        }
        Insert: {
          created_at?: string
          created_by?: string | null
          currency_code: string
          deleted_at?: string | null
          id?: string
          is_active?: boolean
          modified_at?: string
          modified_by?: string | null
          note?: string | null
          period_month: string
          user_id: string
        }
        Update: {
          created_at?: string
          created_by?: string | null
          currency_code?: string
          deleted_at?: string | null
          id?: string
          is_active?: boolean
          modified_at?: string
          modified_by?: string | null
          note?: string | null
          period_month?: string
          user_id?: string
        }
        Relationships: [
          {
            foreignKeyName: "budgets_currency_code_fkey"
            columns: ["currency_code"]
            isOneToOne: false
            referencedRelation: "currencies"
            referencedColumns: ["code"]
          },
        ]
      }
      categories: {
        Row: {
          color_token: string | null
          created_at: string
          created_by: string | null
          deleted_at: string | null
          icon: string | null
          id: string
          is_active: boolean
          kind: Database["public"]["Enums"]["category_kind"]
          modified_at: string
          modified_by: string | null
          name: string
          parent_id: string | null
          sort_order: number
          user_id: string | null
        }
        Insert: {
          color_token?: string | null
          created_at?: string
          created_by?: string | null
          deleted_at?: string | null
          icon?: string | null
          id?: string
          is_active?: boolean
          kind: Database["public"]["Enums"]["category_kind"]
          modified_at?: string
          modified_by?: string | null
          name: string
          parent_id?: string | null
          sort_order?: number
          user_id?: string | null
        }
        Update: {
          color_token?: string | null
          created_at?: string
          created_by?: string | null
          deleted_at?: string | null
          icon?: string | null
          id?: string
          is_active?: boolean
          kind?: Database["public"]["Enums"]["category_kind"]
          modified_at?: string
          modified_by?: string | null
          name?: string
          parent_id?: string | null
          sort_order?: number
          user_id?: string | null
        }
        Relationships: [
          {
            foreignKeyName: "categories_parent_id_fkey"
            columns: ["parent_id"]
            isOneToOne: false
            referencedRelation: "categories"
            referencedColumns: ["id"]
          },
        ]
      }
      currencies: {
        Row: {
          code: string
          created_at: string
          created_by: string | null
          deleted_at: string | null
          is_active: boolean
          minor_unit: number
          modified_at: string
          modified_by: string | null
          name: string
          symbol: string
        }
        Insert: {
          code: string
          created_at?: string
          created_by?: string | null
          deleted_at?: string | null
          is_active?: boolean
          minor_unit?: number
          modified_at?: string
          modified_by?: string | null
          name: string
          symbol: string
        }
        Update: {
          code?: string
          created_at?: string
          created_by?: string | null
          deleted_at?: string | null
          is_active?: boolean
          minor_unit?: number
          modified_at?: string
          modified_by?: string | null
          name?: string
          symbol?: string
        }
        Relationships: []
      }
      fx_rates: {
        Row: {
          as_of: string
          base_code: string
          created_at: string
          created_by: string | null
          deleted_at: string | null
          is_active: boolean
          modified_at: string
          modified_by: string | null
          quote_code: string
          rate: number
        }
        Insert: {
          as_of: string
          base_code: string
          created_at?: string
          created_by?: string | null
          deleted_at?: string | null
          is_active?: boolean
          modified_at?: string
          modified_by?: string | null
          quote_code: string
          rate: number
        }
        Update: {
          as_of?: string
          base_code?: string
          created_at?: string
          created_by?: string | null
          deleted_at?: string | null
          is_active?: boolean
          modified_at?: string
          modified_by?: string | null
          quote_code?: string
          rate?: number
        }
        Relationships: [
          {
            foreignKeyName: "fx_rates_base_code_fkey"
            columns: ["base_code"]
            isOneToOne: false
            referencedRelation: "currencies"
            referencedColumns: ["code"]
          },
          {
            foreignKeyName: "fx_rates_quote_code_fkey"
            columns: ["quote_code"]
            isOneToOne: false
            referencedRelation: "currencies"
            referencedColumns: ["code"]
          },
        ]
      }
      goal_contributions: {
        Row: {
          amount: number
          contributed_on: string
          created_at: string
          created_by: string | null
          deleted_at: string | null
          goal_id: string
          id: string
          is_active: boolean
          modified_at: string
          modified_by: string | null
          transaction_id: string | null
          user_id: string
        }
        Insert: {
          amount: number
          contributed_on?: string
          created_at?: string
          created_by?: string | null
          deleted_at?: string | null
          goal_id: string
          id?: string
          is_active?: boolean
          modified_at?: string
          modified_by?: string | null
          transaction_id?: string | null
          user_id: string
        }
        Update: {
          amount?: number
          contributed_on?: string
          created_at?: string
          created_by?: string | null
          deleted_at?: string | null
          goal_id?: string
          id?: string
          is_active?: boolean
          modified_at?: string
          modified_by?: string | null
          transaction_id?: string | null
          user_id?: string
        }
        Relationships: [
          {
            foreignKeyName: "goal_contributions_goal_id_fkey"
            columns: ["goal_id"]
            isOneToOne: false
            referencedRelation: "goals"
            referencedColumns: ["id"]
          },
          {
            foreignKeyName: "goal_contributions_goal_id_fkey"
            columns: ["goal_id"]
            isOneToOne: false
            referencedRelation: "v_goal_progress"
            referencedColumns: ["goal_id"]
          },
          {
            foreignKeyName: "goal_contributions_transaction_id_fkey"
            columns: ["transaction_id"]
            isOneToOne: false
            referencedRelation: "transactions"
            referencedColumns: ["id"]
          },
          {
            foreignKeyName: "goal_contributions_transaction_id_fkey"
            columns: ["transaction_id"]
            isOneToOne: false
            referencedRelation: "v_transactions_flat"
            referencedColumns: ["id"]
          },
        ]
      }
      goals: {
        Row: {
          account_id: string | null
          blurb: string | null
          created_at: string
          created_by: string | null
          currency_code: string
          deleted_at: string | null
          icon: string | null
          id: string
          is_active: boolean
          modified_at: string
          modified_by: string | null
          monthly_contribution: number
          name: string
          target_amount: number
          target_date: string | null
          user_id: string
        }
        Insert: {
          account_id?: string | null
          blurb?: string | null
          created_at?: string
          created_by?: string | null
          currency_code: string
          deleted_at?: string | null
          icon?: string | null
          id?: string
          is_active?: boolean
          modified_at?: string
          modified_by?: string | null
          monthly_contribution?: number
          name: string
          target_amount: number
          target_date?: string | null
          user_id: string
        }
        Update: {
          account_id?: string | null
          blurb?: string | null
          created_at?: string
          created_by?: string | null
          currency_code?: string
          deleted_at?: string | null
          icon?: string | null
          id?: string
          is_active?: boolean
          modified_at?: string
          modified_by?: string | null
          monthly_contribution?: number
          name?: string
          target_amount?: number
          target_date?: string | null
          user_id?: string
        }
        Relationships: [
          {
            foreignKeyName: "goals_account_id_fkey"
            columns: ["account_id"]
            isOneToOne: false
            referencedRelation: "accounts"
            referencedColumns: ["id"]
          },
          {
            foreignKeyName: "goals_account_id_fkey"
            columns: ["account_id"]
            isOneToOne: false
            referencedRelation: "v_account_balances"
            referencedColumns: ["account_id"]
          },
          {
            foreignKeyName: "goals_currency_code_fkey"
            columns: ["currency_code"]
            isOneToOne: false
            referencedRelation: "currencies"
            referencedColumns: ["code"]
          },
        ]
      }
      holdings: {
        Row: {
          account_id: string
          asset_class: Database["public"]["Enums"]["holding_class"]
          created_at: string
          created_by: string | null
          currency_code: string
          deleted_at: string | null
          id: string
          invested: number
          is_active: boolean
          last_price: number
          modified_at: string
          modified_by: string | null
          name: string
          priced_at: string | null
          units: number
          user_id: string
        }
        Insert: {
          account_id: string
          asset_class: Database["public"]["Enums"]["holding_class"]
          created_at?: string
          created_by?: string | null
          currency_code: string
          deleted_at?: string | null
          id?: string
          invested?: number
          is_active?: boolean
          last_price?: number
          modified_at?: string
          modified_by?: string | null
          name: string
          priced_at?: string | null
          units: number
          user_id: string
        }
        Update: {
          account_id?: string
          asset_class?: Database["public"]["Enums"]["holding_class"]
          created_at?: string
          created_by?: string | null
          currency_code?: string
          deleted_at?: string | null
          id?: string
          invested?: number
          is_active?: boolean
          last_price?: number
          modified_at?: string
          modified_by?: string | null
          name?: string
          priced_at?: string | null
          units?: number
          user_id?: string
        }
        Relationships: [
          {
            foreignKeyName: "holdings_account_id_fkey"
            columns: ["account_id"]
            isOneToOne: false
            referencedRelation: "accounts"
            referencedColumns: ["id"]
          },
          {
            foreignKeyName: "holdings_account_id_fkey"
            columns: ["account_id"]
            isOneToOne: false
            referencedRelation: "v_account_balances"
            referencedColumns: ["account_id"]
          },
          {
            foreignKeyName: "holdings_currency_code_fkey"
            columns: ["currency_code"]
            isOneToOne: false
            referencedRelation: "currencies"
            referencedColumns: ["code"]
          },
        ]
      }
      import_jobs: {
        Row: {
          created_at: string
          created_by: string | null
          deleted_at: string | null
          duplicates: number
          finished_at: string | null
          id: string
          imported: number
          is_active: boolean
          modified_at: string
          modified_by: string | null
          rows_done: number
          rows_total: number
          source_id: string
          title: string | null
          user_id: string
        }
        Insert: {
          created_at?: string
          created_by?: string | null
          deleted_at?: string | null
          duplicates?: number
          finished_at?: string | null
          id?: string
          imported?: number
          is_active?: boolean
          modified_at?: string
          modified_by?: string | null
          rows_done?: number
          rows_total?: number
          source_id: string
          title?: string | null
          user_id: string
        }
        Update: {
          created_at?: string
          created_by?: string | null
          deleted_at?: string | null
          duplicates?: number
          finished_at?: string | null
          id?: string
          imported?: number
          is_active?: boolean
          modified_at?: string
          modified_by?: string | null
          rows_done?: number
          rows_total?: number
          source_id?: string
          title?: string | null
          user_id?: string
        }
        Relationships: [
          {
            foreignKeyName: "import_jobs_source_id_fkey"
            columns: ["source_id"]
            isOneToOne: false
            referencedRelation: "import_sources"
            referencedColumns: ["id"]
          },
        ]
      }
      import_review_items: {
        Row: {
          action_label: string | null
          created_at: string
          created_by: string | null
          deleted_at: string | null
          detail: string | null
          id: string
          is_active: boolean
          job_id: string
          kind: Database["public"]["Enums"]["review_kind"]
          modified_at: string
          modified_by: string | null
          resolved_at: string | null
          title: string | null
          user_id: string
        }
        Insert: {
          action_label?: string | null
          created_at?: string
          created_by?: string | null
          deleted_at?: string | null
          detail?: string | null
          id?: string
          is_active?: boolean
          job_id: string
          kind: Database["public"]["Enums"]["review_kind"]
          modified_at?: string
          modified_by?: string | null
          resolved_at?: string | null
          title?: string | null
          user_id: string
        }
        Update: {
          action_label?: string | null
          created_at?: string
          created_by?: string | null
          deleted_at?: string | null
          detail?: string | null
          id?: string
          is_active?: boolean
          job_id?: string
          kind?: Database["public"]["Enums"]["review_kind"]
          modified_at?: string
          modified_by?: string | null
          resolved_at?: string | null
          title?: string | null
          user_id?: string
        }
        Relationships: [
          {
            foreignKeyName: "import_review_items_job_id_fkey"
            columns: ["job_id"]
            isOneToOne: false
            referencedRelation: "import_jobs"
            referencedColumns: ["id"]
          },
        ]
      }
      import_sources: {
        Row: {
          created_at: string
          created_by: string | null
          deleted_at: string | null
          id: string
          is_active: boolean
          kind: Database["public"]["Enums"]["import_kind"]
          modified_at: string
          modified_by: string | null
          name: string
          status: string
          user_id: string
        }
        Insert: {
          created_at?: string
          created_by?: string | null
          deleted_at?: string | null
          id?: string
          is_active?: boolean
          kind: Database["public"]["Enums"]["import_kind"]
          modified_at?: string
          modified_by?: string | null
          name: string
          status?: string
          user_id: string
        }
        Update: {
          created_at?: string
          created_by?: string | null
          deleted_at?: string | null
          id?: string
          is_active?: boolean
          kind?: Database["public"]["Enums"]["import_kind"]
          modified_at?: string
          modified_by?: string | null
          name?: string
          status?: string
          user_id?: string
        }
        Relationships: []
      }
      labels: {
        Row: {
          color_token: string | null
          created_at: string
          created_by: string | null
          deleted_at: string | null
          id: string
          is_active: boolean
          modified_at: string
          modified_by: string | null
          name: string
          user_id: string
        }
        Insert: {
          color_token?: string | null
          created_at?: string
          created_by?: string | null
          deleted_at?: string | null
          id?: string
          is_active?: boolean
          modified_at?: string
          modified_by?: string | null
          name: string
          user_id: string
        }
        Update: {
          color_token?: string | null
          created_at?: string
          created_by?: string | null
          deleted_at?: string | null
          id?: string
          is_active?: boolean
          modified_at?: string
          modified_by?: string | null
          name?: string
          user_id?: string
        }
        Relationships: []
      }
      profiles: {
        Row: {
          accent: string | null
          assistant_context: boolean
          assistant_tone: string
          base_currency: string
          created_at: string
          created_by: string | null
          deleted_at: string | null
          display_name: string | null
          email: string | null
          is_active: boolean
          modified_at: string
          modified_by: string | null
          number_format: string
          reduce_motion: boolean
          round_to_nearest: boolean
          sidebar: string
          theme: string
          user_id: string
          week_starts_on: number
        }
        Insert: {
          accent?: string | null
          assistant_context?: boolean
          assistant_tone?: string
          base_currency?: string
          created_at?: string
          created_by?: string | null
          deleted_at?: string | null
          display_name?: string | null
          email?: string | null
          is_active?: boolean
          modified_at?: string
          modified_by?: string | null
          number_format?: string
          reduce_motion?: boolean
          round_to_nearest?: boolean
          sidebar?: string
          theme?: string
          user_id: string
          week_starts_on?: number
        }
        Update: {
          accent?: string | null
          assistant_context?: boolean
          assistant_tone?: string
          base_currency?: string
          created_at?: string
          created_by?: string | null
          deleted_at?: string | null
          display_name?: string | null
          email?: string | null
          is_active?: boolean
          modified_at?: string
          modified_by?: string | null
          number_format?: string
          reduce_motion?: boolean
          round_to_nearest?: boolean
          sidebar?: string
          theme?: string
          user_id?: string
          week_starts_on?: number
        }
        Relationships: [
          {
            foreignKeyName: "profiles_base_currency_fkey"
            columns: ["base_currency"]
            isOneToOne: false
            referencedRelation: "currencies"
            referencedColumns: ["code"]
          },
        ]
      }
      timeline_events: {
        Row: {
          account_id: string | null
          action_label: string | null
          amount: number | null
          created_at: string
          created_by: string | null
          currency_code: string | null
          deleted_at: string | null
          detail: string | null
          id: string
          is_active: boolean
          kind: Database["public"]["Enums"]["timeline_kind"]
          modified_at: string
          modified_by: string | null
          occurred_at: string
          title: string
          transaction_id: string | null
          user_id: string
        }
        Insert: {
          account_id?: string | null
          action_label?: string | null
          amount?: number | null
          created_at?: string
          created_by?: string | null
          currency_code?: string | null
          deleted_at?: string | null
          detail?: string | null
          id?: string
          is_active?: boolean
          kind: Database["public"]["Enums"]["timeline_kind"]
          modified_at?: string
          modified_by?: string | null
          occurred_at: string
          title: string
          transaction_id?: string | null
          user_id: string
        }
        Update: {
          account_id?: string | null
          action_label?: string | null
          amount?: number | null
          created_at?: string
          created_by?: string | null
          currency_code?: string | null
          deleted_at?: string | null
          detail?: string | null
          id?: string
          is_active?: boolean
          kind?: Database["public"]["Enums"]["timeline_kind"]
          modified_at?: string
          modified_by?: string | null
          occurred_at?: string
          title?: string
          transaction_id?: string | null
          user_id?: string
        }
        Relationships: [
          {
            foreignKeyName: "timeline_events_account_id_fkey"
            columns: ["account_id"]
            isOneToOne: false
            referencedRelation: "accounts"
            referencedColumns: ["id"]
          },
          {
            foreignKeyName: "timeline_events_account_id_fkey"
            columns: ["account_id"]
            isOneToOne: false
            referencedRelation: "v_account_balances"
            referencedColumns: ["account_id"]
          },
          {
            foreignKeyName: "timeline_events_currency_code_fkey"
            columns: ["currency_code"]
            isOneToOne: false
            referencedRelation: "currencies"
            referencedColumns: ["code"]
          },
          {
            foreignKeyName: "timeline_events_transaction_id_fkey"
            columns: ["transaction_id"]
            isOneToOne: false
            referencedRelation: "transactions"
            referencedColumns: ["id"]
          },
          {
            foreignKeyName: "timeline_events_transaction_id_fkey"
            columns: ["transaction_id"]
            isOneToOne: false
            referencedRelation: "v_transactions_flat"
            referencedColumns: ["id"]
          },
        ]
      }
      transaction_entries: {
        Row: {
          account_id: string
          amount: number
          created_at: string
          created_by: string | null
          currency_code: string
          deleted_at: string | null
          id: string
          is_active: boolean
          modified_at: string
          modified_by: string | null
          transaction_id: string
          user_id: string
        }
        Insert: {
          account_id: string
          amount: number
          created_at?: string
          created_by?: string | null
          currency_code: string
          deleted_at?: string | null
          id?: string
          is_active?: boolean
          modified_at?: string
          modified_by?: string | null
          transaction_id: string
          user_id: string
        }
        Update: {
          account_id?: string
          amount?: number
          created_at?: string
          created_by?: string | null
          currency_code?: string
          deleted_at?: string | null
          id?: string
          is_active?: boolean
          modified_at?: string
          modified_by?: string | null
          transaction_id?: string
          user_id?: string
        }
        Relationships: [
          {
            foreignKeyName: "transaction_entries_account_id_fkey"
            columns: ["account_id"]
            isOneToOne: false
            referencedRelation: "accounts"
            referencedColumns: ["id"]
          },
          {
            foreignKeyName: "transaction_entries_account_id_fkey"
            columns: ["account_id"]
            isOneToOne: false
            referencedRelation: "v_account_balances"
            referencedColumns: ["account_id"]
          },
          {
            foreignKeyName: "transaction_entries_currency_code_fkey"
            columns: ["currency_code"]
            isOneToOne: false
            referencedRelation: "currencies"
            referencedColumns: ["code"]
          },
          {
            foreignKeyName: "transaction_entries_transaction_id_fkey"
            columns: ["transaction_id"]
            isOneToOne: false
            referencedRelation: "transactions"
            referencedColumns: ["id"]
          },
          {
            foreignKeyName: "transaction_entries_transaction_id_fkey"
            columns: ["transaction_id"]
            isOneToOne: false
            referencedRelation: "v_transactions_flat"
            referencedColumns: ["id"]
          },
        ]
      }
      transactions: {
        Row: {
          attachments: number
          category_id: string | null
          confidence: number | null
          created_at: string
          created_by: string | null
          deleted_at: string | null
          descriptor: string | null
          external_ref: string | null
          id: string
          is_active: boolean
          label_id: string | null
          merchant: string | null
          modified_at: string
          modified_by: string | null
          note: string | null
          occurred_at: string
          payment_method: string | null
          source: string
          type: Database["public"]["Enums"]["txn_type"]
          user_id: string
        }
        Insert: {
          attachments?: number
          category_id?: string | null
          confidence?: number | null
          created_at?: string
          created_by?: string | null
          deleted_at?: string | null
          descriptor?: string | null
          external_ref?: string | null
          id?: string
          is_active?: boolean
          label_id?: string | null
          merchant?: string | null
          modified_at?: string
          modified_by?: string | null
          note?: string | null
          occurred_at: string
          payment_method?: string | null
          source?: string
          type: Database["public"]["Enums"]["txn_type"]
          user_id: string
        }
        Update: {
          attachments?: number
          category_id?: string | null
          confidence?: number | null
          created_at?: string
          created_by?: string | null
          deleted_at?: string | null
          descriptor?: string | null
          external_ref?: string | null
          id?: string
          is_active?: boolean
          label_id?: string | null
          merchant?: string | null
          modified_at?: string
          modified_by?: string | null
          note?: string | null
          occurred_at?: string
          payment_method?: string | null
          source?: string
          type?: Database["public"]["Enums"]["txn_type"]
          user_id?: string
        }
        Relationships: [
          {
            foreignKeyName: "transactions_category_id_fkey"
            columns: ["category_id"]
            isOneToOne: false
            referencedRelation: "categories"
            referencedColumns: ["id"]
          },
          {
            foreignKeyName: "transactions_label_id_fkey"
            columns: ["label_id"]
            isOneToOne: false
            referencedRelation: "labels"
            referencedColumns: ["id"]
          },
        ]
      }
    }
    Views: {
      v_account_balances: {
        Row: {
          account_id: string | null
          balance: number | null
          credit_limit: number | null
          currency_code: string | null
          institution: string | null
          is_primary: boolean | null
          kind: Database["public"]["Enums"]["account_kind"] | null
          minor_unit: number | null
          name: string | null
          symbol: string | null
          user_id: string | null
        }
        Relationships: [
          {
            foreignKeyName: "accounts_currency_code_fkey"
            columns: ["currency_code"]
            isOneToOne: false
            referencedRelation: "currencies"
            referencedColumns: ["code"]
          },
        ]
      }
      v_account_monthly_flow: {
        Row: {
          account_id: string | null
          delta: number | null
          entry_count: number | null
          last_activity_at: string | null
          period_month: string | null
          user_id: string | null
        }
        Relationships: [
          {
            foreignKeyName: "transaction_entries_account_id_fkey"
            columns: ["account_id"]
            isOneToOne: false
            referencedRelation: "accounts"
            referencedColumns: ["id"]
          },
          {
            foreignKeyName: "transaction_entries_account_id_fkey"
            columns: ["account_id"]
            isOneToOne: false
            referencedRelation: "v_account_balances"
            referencedColumns: ["account_id"]
          },
        ]
      }
      v_budget_progress: {
        Row: {
          category_id: string | null
          category_name: string | null
          color_token: string | null
          currency_code: string | null
          period_month: string | null
          planned: number | null
          remaining: number | null
          spent: number | null
          used_bps: number | null
          user_id: string | null
        }
        Relationships: [
          {
            foreignKeyName: "budget_lines_category_id_fkey"
            columns: ["category_id"]
            isOneToOne: false
            referencedRelation: "categories"
            referencedColumns: ["id"]
          },
          {
            foreignKeyName: "budgets_currency_code_fkey"
            columns: ["currency_code"]
            isOneToOne: false
            referencedRelation: "currencies"
            referencedColumns: ["code"]
          },
        ]
      }
      v_category_spend: {
        Row: {
          category_id: string | null
          currency_code: string | null
          period_month: string | null
          spent: number | null
          txn_count: number | null
          user_id: string | null
        }
        Relationships: [
          {
            foreignKeyName: "transaction_entries_currency_code_fkey"
            columns: ["currency_code"]
            isOneToOne: false
            referencedRelation: "currencies"
            referencedColumns: ["code"]
          },
          {
            foreignKeyName: "transactions_category_id_fkey"
            columns: ["category_id"]
            isOneToOne: false
            referencedRelation: "categories"
            referencedColumns: ["id"]
          },
        ]
      }
      v_goal_progress: {
        Row: {
          blurb: string | null
          currency_code: string | null
          goal_id: string | null
          icon: string | null
          monthly_contribution: number | null
          name: string | null
          progress_bps: number | null
          remaining: number | null
          saved: number | null
          target_amount: number | null
          target_date: string | null
          user_id: string | null
        }
        Relationships: [
          {
            foreignKeyName: "goals_currency_code_fkey"
            columns: ["currency_code"]
            isOneToOne: false
            referencedRelation: "currencies"
            referencedColumns: ["code"]
          },
        ]
      }
      v_holdings_valuation: {
        Row: {
          account_id: string | null
          asset_class: Database["public"]["Enums"]["holding_class"] | null
          currency_code: string | null
          current_value: number | null
          id: string | null
          invested: number | null
          last_price: number | null
          name: string | null
          priced_at: string | null
          units: number | null
          unrealised_gain: number | null
          user_id: string | null
        }
        Insert: {
          account_id?: string | null
          asset_class?: Database["public"]["Enums"]["holding_class"] | null
          currency_code?: string | null
          current_value?: never
          id?: string | null
          invested?: number | null
          last_price?: number | null
          name?: string | null
          priced_at?: string | null
          units?: number | null
          unrealised_gain?: never
          user_id?: string | null
        }
        Update: {
          account_id?: string | null
          asset_class?: Database["public"]["Enums"]["holding_class"] | null
          currency_code?: string | null
          current_value?: never
          id?: string | null
          invested?: number | null
          last_price?: number | null
          name?: string | null
          priced_at?: string | null
          units?: number | null
          unrealised_gain?: never
          user_id?: string | null
        }
        Relationships: [
          {
            foreignKeyName: "holdings_account_id_fkey"
            columns: ["account_id"]
            isOneToOne: false
            referencedRelation: "accounts"
            referencedColumns: ["id"]
          },
          {
            foreignKeyName: "holdings_account_id_fkey"
            columns: ["account_id"]
            isOneToOne: false
            referencedRelation: "v_account_balances"
            referencedColumns: ["account_id"]
          },
          {
            foreignKeyName: "holdings_currency_code_fkey"
            columns: ["currency_code"]
            isOneToOne: false
            referencedRelation: "currencies"
            referencedColumns: ["code"]
          },
        ]
      }
      v_monthly_cashflow: {
        Row: {
          currency_code: string | null
          expense: number | null
          income: number | null
          net: number | null
          period_month: string | null
          txn_count: number | null
          user_id: string | null
        }
        Relationships: [
          {
            foreignKeyName: "transaction_entries_currency_code_fkey"
            columns: ["currency_code"]
            isOneToOne: false
            referencedRelation: "currencies"
            referencedColumns: ["code"]
          },
        ]
      }
      v_net_worth: {
        Row: {
          base_currency: string | null
          cash: number | null
          investments: number | null
          liabilities: number | null
          net_worth: number | null
          user_id: string | null
        }
        Relationships: [
          {
            foreignKeyName: "profiles_base_currency_fkey"
            columns: ["base_currency"]
            isOneToOne: false
            referencedRelation: "currencies"
            referencedColumns: ["code"]
          },
        ]
      }
      v_transactions_flat: {
        Row: {
          account_id: string | null
          account_kind: Database["public"]["Enums"]["account_kind"] | null
          account_name: string | null
          amount: number | null
          attachments: number | null
          category_color: string | null
          category_id: string | null
          category_name: string | null
          confidence: number | null
          currency_code: string | null
          currency_symbol: string | null
          descriptor: string | null
          entry_id: string | null
          id: string | null
          label_id: string | null
          merchant: string | null
          minor_unit: number | null
          note: string | null
          occurred_at: string | null
          payment_method: string | null
          source: string | null
          type: Database["public"]["Enums"]["txn_type"] | null
          user_id: string | null
        }
        Relationships: [
          {
            foreignKeyName: "transaction_entries_account_id_fkey"
            columns: ["account_id"]
            isOneToOne: false
            referencedRelation: "accounts"
            referencedColumns: ["id"]
          },
          {
            foreignKeyName: "transaction_entries_account_id_fkey"
            columns: ["account_id"]
            isOneToOne: false
            referencedRelation: "v_account_balances"
            referencedColumns: ["account_id"]
          },
          {
            foreignKeyName: "transaction_entries_currency_code_fkey"
            columns: ["currency_code"]
            isOneToOne: false
            referencedRelation: "currencies"
            referencedColumns: ["code"]
          },
          {
            foreignKeyName: "transactions_category_id_fkey"
            columns: ["category_id"]
            isOneToOne: false
            referencedRelation: "categories"
            referencedColumns: ["id"]
          },
          {
            foreignKeyName: "transactions_label_id_fkey"
            columns: ["label_id"]
            isOneToOne: false
            referencedRelation: "labels"
            referencedColumns: ["id"]
          },
        ]
      }
    }
    Functions: {
      fn_account_balance: { Args: { p_account: string }; Returns: number }
      fn_apply_budget_template: {
        Args: {
          p_currency?: string
          p_monthly_income: number
          p_period_month: string
          p_template_name: string
        }
        Returns: string
      }
      fn_convert: {
        Args: { p_amount: number; p_from: string; p_on?: string; p_to: string }
        Returns: number
      }
      fn_record_transaction: {
        Args: {
          p_amount: number
          p_category?: string
          p_descriptor?: string
          p_from_account: string
          p_label?: string
          p_merchant?: string
          p_note?: string
          p_occurred_at: string
          p_payment_method?: string
          p_to_account?: string
          p_type: Database["public"]["Enums"]["txn_type"]
        }
        Returns: string
      }
    }
    Enums: {
      account_kind: "bank" | "cash" | "credit_card" | "investment" | "loan"
      category_kind:
        | "income"
        | "essentials"
        | "lifestyle"
        | "transfer"
        | "investment"
      holding_class:
        | "equity"
        | "mutual_fund"
        | "gold"
        | "fixed_income"
        | "crypto"
      import_kind: "gmail" | "pdf" | "csv" | "manual"
      review_kind: "duplicate" | "unknown_merchant" | "large_transfer"
      timeline_kind: "money" | "ai_insight" | "goal" | "bill" | "system"
      txn_type: "income" | "expense" | "transfer" | "adjustment"
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
      account_kind: ["bank", "cash", "credit_card", "investment", "loan"],
      category_kind: [
        "income",
        "essentials",
        "lifestyle",
        "transfer",
        "investment",
      ],
      holding_class: [
        "equity",
        "mutual_fund",
        "gold",
        "fixed_income",
        "crypto",
      ],
      import_kind: ["gmail", "pdf", "csv", "manual"],
      review_kind: ["duplicate", "unknown_merchant", "large_transfer"],
      timeline_kind: ["money", "ai_insight", "goal", "bill", "system"],
      txn_type: ["income", "expense", "transfer", "adjustment"],
    },
  },
} as const
