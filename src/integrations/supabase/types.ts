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
    }
    Views: {
      [_ in never]: never
    }
    Functions: {
      [_ in never]: never
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
