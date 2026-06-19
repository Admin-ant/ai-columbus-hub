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
    PostgrestVersion: "14.5"
  }
  public: {
    Tables: {
      accountant_sync_events: {
        Row: {
          created_at: string
          created_by: string | null
          id: string
          invoice_id: string | null
          organization_id: string
          payload: Json
          response: Json | null
          status: Database["public"]["Enums"]["sync_status"]
          target: string
        }
        Insert: {
          created_at?: string
          created_by?: string | null
          id?: string
          invoice_id?: string | null
          organization_id: string
          payload: Json
          response?: Json | null
          status?: Database["public"]["Enums"]["sync_status"]
          target?: string
        }
        Update: {
          created_at?: string
          created_by?: string | null
          id?: string
          invoice_id?: string | null
          organization_id?: string
          payload?: Json
          response?: Json | null
          status?: Database["public"]["Enums"]["sync_status"]
          target?: string
        }
        Relationships: [
          {
            foreignKeyName: "accountant_sync_events_invoice_id_fkey"
            columns: ["invoice_id"]
            isOneToOne: false
            referencedRelation: "invoices"
            referencedColumns: ["id"]
          },
          {
            foreignKeyName: "accountant_sync_events_organization_id_fkey"
            columns: ["organization_id"]
            isOneToOne: false
            referencedRelation: "organizations"
            referencedColumns: ["id"]
          },
        ]
      }
      chart_of_accounts: {
        Row: {
          active: boolean
          code: string
          created_at: string
          id: string
          is_vat_account: boolean
          name: string
          organization_id: string
          type: Database["public"]["Enums"]["account_type"]
          updated_at: string
          vat_rate: number | null
        }
        Insert: {
          active?: boolean
          code: string
          created_at?: string
          id?: string
          is_vat_account?: boolean
          name: string
          organization_id: string
          type: Database["public"]["Enums"]["account_type"]
          updated_at?: string
          vat_rate?: number | null
        }
        Update: {
          active?: boolean
          code?: string
          created_at?: string
          id?: string
          is_vat_account?: boolean
          name?: string
          organization_id?: string
          type?: Database["public"]["Enums"]["account_type"]
          updated_at?: string
          vat_rate?: number | null
        }
        Relationships: [
          {
            foreignKeyName: "chart_of_accounts_organization_id_fkey"
            columns: ["organization_id"]
            isOneToOne: false
            referencedRelation: "organizations"
            referencedColumns: ["id"]
          },
        ]
      }
      clients: {
        Row: {
          created_at: string
          id: string
          monthly_value: number
          name: string
          start_date: string | null
          updated_at: string
        }
        Insert: {
          created_at?: string
          id?: string
          monthly_value?: number
          name: string
          start_date?: string | null
          updated_at?: string
        }
        Update: {
          created_at?: string
          id?: string
          monthly_value?: number
          name?: string
          start_date?: string | null
          updated_at?: string
        }
        Relationships: []
      }
      invoice_lines: {
        Row: {
          created_at: string
          description: string
          id: string
          invoice_id: string
          position: number
          product_id: string | null
          quantity: number
          revenue_account_id: string | null
          subtotal_cents: number
          total_cents: number
          unit_price_cents: number
          vat_cents: number
          vat_rate: number
        }
        Insert: {
          created_at?: string
          description: string
          id?: string
          invoice_id: string
          position?: number
          product_id?: string | null
          quantity?: number
          revenue_account_id?: string | null
          subtotal_cents?: number
          total_cents?: number
          unit_price_cents?: number
          vat_cents?: number
          vat_rate?: number
        }
        Update: {
          created_at?: string
          description?: string
          id?: string
          invoice_id?: string
          position?: number
          product_id?: string | null
          quantity?: number
          revenue_account_id?: string | null
          subtotal_cents?: number
          total_cents?: number
          unit_price_cents?: number
          vat_cents?: number
          vat_rate?: number
        }
        Relationships: [
          {
            foreignKeyName: "invoice_lines_invoice_id_fkey"
            columns: ["invoice_id"]
            isOneToOne: false
            referencedRelation: "invoices"
            referencedColumns: ["id"]
          },
          {
            foreignKeyName: "invoice_lines_product_id_fkey"
            columns: ["product_id"]
            isOneToOne: false
            referencedRelation: "products"
            referencedColumns: ["id"]
          },
          {
            foreignKeyName: "invoice_lines_revenue_account_id_fkey"
            columns: ["revenue_account_id"]
            isOneToOne: false
            referencedRelation: "chart_of_accounts"
            referencedColumns: ["id"]
          },
        ]
      }
      invoices: {
        Row: {
          amount: number
          client_id: string | null
          client_name: string | null
          created_at: string
          currency: string
          due_date: string
          id: string
          invoice_number: string
          issue_date: string
          organization_id: string
          paid_at: string | null
          quote_id: string | null
          sent_at: string | null
          status: Database["public"]["Enums"]["invoice_status"]
          subtotal_cents: number
          total_cents: number
          updated_at: string
          vat_cents: number
        }
        Insert: {
          amount?: number
          client_id?: string | null
          client_name?: string | null
          created_at?: string
          currency?: string
          due_date?: string
          id?: string
          invoice_number: string
          issue_date?: string
          organization_id: string
          paid_at?: string | null
          quote_id?: string | null
          sent_at?: string | null
          status?: Database["public"]["Enums"]["invoice_status"]
          subtotal_cents?: number
          total_cents?: number
          updated_at?: string
          vat_cents?: number
        }
        Update: {
          amount?: number
          client_id?: string | null
          client_name?: string | null
          created_at?: string
          currency?: string
          due_date?: string
          id?: string
          invoice_number?: string
          issue_date?: string
          organization_id?: string
          paid_at?: string | null
          quote_id?: string | null
          sent_at?: string | null
          status?: Database["public"]["Enums"]["invoice_status"]
          subtotal_cents?: number
          total_cents?: number
          updated_at?: string
          vat_cents?: number
        }
        Relationships: [
          {
            foreignKeyName: "invoices_client_id_fkey"
            columns: ["client_id"]
            isOneToOne: false
            referencedRelation: "clients"
            referencedColumns: ["id"]
          },
          {
            foreignKeyName: "invoices_organization_id_fkey"
            columns: ["organization_id"]
            isOneToOne: false
            referencedRelation: "organizations"
            referencedColumns: ["id"]
          },
          {
            foreignKeyName: "invoices_quote_id_fkey"
            columns: ["quote_id"]
            isOneToOne: false
            referencedRelation: "quotes"
            referencedColumns: ["id"]
          },
        ]
      }
      journal_entries: {
        Row: {
          created_at: string
          created_by: string | null
          description: string
          entry_date: string
          id: string
          invoice_id: string | null
          organization_id: string
          quote_id: string | null
          source: string
        }
        Insert: {
          created_at?: string
          created_by?: string | null
          description: string
          entry_date?: string
          id?: string
          invoice_id?: string | null
          organization_id: string
          quote_id?: string | null
          source?: string
        }
        Update: {
          created_at?: string
          created_by?: string | null
          description?: string
          entry_date?: string
          id?: string
          invoice_id?: string | null
          organization_id?: string
          quote_id?: string | null
          source?: string
        }
        Relationships: [
          {
            foreignKeyName: "journal_entries_invoice_id_fkey"
            columns: ["invoice_id"]
            isOneToOne: false
            referencedRelation: "invoices"
            referencedColumns: ["id"]
          },
          {
            foreignKeyName: "journal_entries_organization_id_fkey"
            columns: ["organization_id"]
            isOneToOne: false
            referencedRelation: "organizations"
            referencedColumns: ["id"]
          },
          {
            foreignKeyName: "journal_entries_quote_id_fkey"
            columns: ["quote_id"]
            isOneToOne: false
            referencedRelation: "quotes"
            referencedColumns: ["id"]
          },
        ]
      }
      journal_lines: {
        Row: {
          account_id: string
          credit_cents: number
          debit_cents: number
          description: string | null
          entry_id: string
          id: string
        }
        Insert: {
          account_id: string
          credit_cents?: number
          debit_cents?: number
          description?: string | null
          entry_id: string
          id?: string
        }
        Update: {
          account_id?: string
          credit_cents?: number
          debit_cents?: number
          description?: string | null
          entry_id?: string
          id?: string
        }
        Relationships: [
          {
            foreignKeyName: "journal_lines_account_id_fkey"
            columns: ["account_id"]
            isOneToOne: false
            referencedRelation: "chart_of_accounts"
            referencedColumns: ["id"]
          },
          {
            foreignKeyName: "journal_lines_entry_id_fkey"
            columns: ["entry_id"]
            isOneToOne: false
            referencedRelation: "journal_entries"
            referencedColumns: ["id"]
          },
        ]
      }
      leads: {
        Row: {
          company: string | null
          created_at: string
          created_by: string | null
          email: string | null
          id: string
          last_contact_at: string | null
          name: string
          notes: string | null
          organization_id: string
          phone: string | null
          position: number
          potential_monthly_value: number
          rep: string | null
          source: string | null
          stage: Database["public"]["Enums"]["lead_stage"]
          target_start_date: string | null
          updated_at: string
          value: number
        }
        Insert: {
          company?: string | null
          created_at?: string
          created_by?: string | null
          email?: string | null
          id?: string
          last_contact_at?: string | null
          name: string
          notes?: string | null
          organization_id: string
          phone?: string | null
          position?: number
          potential_monthly_value?: number
          rep?: string | null
          source?: string | null
          stage?: Database["public"]["Enums"]["lead_stage"]
          target_start_date?: string | null
          updated_at?: string
          value?: number
        }
        Update: {
          company?: string | null
          created_at?: string
          created_by?: string | null
          email?: string | null
          id?: string
          last_contact_at?: string | null
          name?: string
          notes?: string | null
          organization_id?: string
          phone?: string | null
          position?: number
          potential_monthly_value?: number
          rep?: string | null
          source?: string | null
          stage?: Database["public"]["Enums"]["lead_stage"]
          target_start_date?: string | null
          updated_at?: string
          value?: number
        }
        Relationships: [
          {
            foreignKeyName: "leads_organization_id_fkey"
            columns: ["organization_id"]
            isOneToOne: false
            referencedRelation: "organizations"
            referencedColumns: ["id"]
          },
        ]
      }
      organization_members: {
        Row: {
          created_at: string
          id: string
          organization_id: string
          role: Database["public"]["Enums"]["org_role"]
          user_id: string
        }
        Insert: {
          created_at?: string
          id?: string
          organization_id: string
          role?: Database["public"]["Enums"]["org_role"]
          user_id: string
        }
        Update: {
          created_at?: string
          id?: string
          organization_id?: string
          role?: Database["public"]["Enums"]["org_role"]
          user_id?: string
        }
        Relationships: [
          {
            foreignKeyName: "organization_members_organization_id_fkey"
            columns: ["organization_id"]
            isOneToOne: false
            referencedRelation: "organizations"
            referencedColumns: ["id"]
          },
        ]
      }
      organizations: {
        Row: {
          brand_color: string | null
          created_at: string
          id: string
          invoice_prefix: string
          logo_url: string | null
          name: string
          next_invoice_seq: number
          slug: string
          tax_number: string | null
          updated_at: string
        }
        Insert: {
          brand_color?: string | null
          created_at?: string
          id?: string
          invoice_prefix: string
          logo_url?: string | null
          name: string
          next_invoice_seq?: number
          slug: string
          tax_number?: string | null
          updated_at?: string
        }
        Update: {
          brand_color?: string | null
          created_at?: string
          id?: string
          invoice_prefix?: string
          logo_url?: string | null
          name?: string
          next_invoice_seq?: number
          slug?: string
          tax_number?: string | null
          updated_at?: string
        }
        Relationships: []
      }
      products: {
        Row: {
          active: boolean
          contract_months: number | null
          created_at: string
          created_by: string | null
          description: string | null
          discount_percent: number
          discount_type: Database["public"]["Enums"]["discount_type"]
          id: string
          name: string
          organization_id: string
          pricing_type: Database["public"]["Enums"]["pricing_type"]
          setup_fee_cents: number
          sku: string | null
          unit_price_cents: number
          updated_at: string
          vat_rate: number
        }
        Insert: {
          active?: boolean
          contract_months?: number | null
          created_at?: string
          created_by?: string | null
          description?: string | null
          discount_percent?: number
          discount_type?: Database["public"]["Enums"]["discount_type"]
          id?: string
          name: string
          organization_id: string
          pricing_type?: Database["public"]["Enums"]["pricing_type"]
          setup_fee_cents?: number
          sku?: string | null
          unit_price_cents?: number
          updated_at?: string
          vat_rate?: number
        }
        Update: {
          active?: boolean
          contract_months?: number | null
          created_at?: string
          created_by?: string | null
          description?: string | null
          discount_percent?: number
          discount_type?: Database["public"]["Enums"]["discount_type"]
          id?: string
          name?: string
          organization_id?: string
          pricing_type?: Database["public"]["Enums"]["pricing_type"]
          setup_fee_cents?: number
          sku?: string | null
          unit_price_cents?: number
          updated_at?: string
          vat_rate?: number
        }
        Relationships: [
          {
            foreignKeyName: "products_organization_id_fkey"
            columns: ["organization_id"]
            isOneToOne: false
            referencedRelation: "organizations"
            referencedColumns: ["id"]
          },
        ]
      }
      profiles: {
        Row: {
          avatar_url: string | null
          created_at: string
          display_name: string | null
          email: string | null
          id: string
          updated_at: string
        }
        Insert: {
          avatar_url?: string | null
          created_at?: string
          display_name?: string | null
          email?: string | null
          id: string
          updated_at?: string
        }
        Update: {
          avatar_url?: string | null
          created_at?: string
          display_name?: string | null
          email?: string | null
          id?: string
          updated_at?: string
        }
        Relationships: []
      }
      quotes: {
        Row: {
          content_json: Json
          created_at: string
          created_by: string | null
          id: string
          lead_id: string | null
          mollie_payment_id: string | null
          organization_id: string
          public_token: string
          signature_svg: string | null
          signed_at: string | null
          status: Database["public"]["Enums"]["quote_status"]
          title: string
          total_amount: number
          updated_at: string
        }
        Insert: {
          content_json?: Json
          created_at?: string
          created_by?: string | null
          id?: string
          lead_id?: string | null
          mollie_payment_id?: string | null
          organization_id: string
          public_token?: string
          signature_svg?: string | null
          signed_at?: string | null
          status?: Database["public"]["Enums"]["quote_status"]
          title: string
          total_amount?: number
          updated_at?: string
        }
        Update: {
          content_json?: Json
          created_at?: string
          created_by?: string | null
          id?: string
          lead_id?: string | null
          mollie_payment_id?: string | null
          organization_id?: string
          public_token?: string
          signature_svg?: string | null
          signed_at?: string | null
          status?: Database["public"]["Enums"]["quote_status"]
          title?: string
          total_amount?: number
          updated_at?: string
        }
        Relationships: [
          {
            foreignKeyName: "quotes_lead_id_fkey"
            columns: ["lead_id"]
            isOneToOne: false
            referencedRelation: "leads"
            referencedColumns: ["id"]
          },
          {
            foreignKeyName: "quotes_organization_id_fkey"
            columns: ["organization_id"]
            isOneToOne: false
            referencedRelation: "organizations"
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
          role: Database["public"]["Enums"]["app_role"]
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
    }
    Views: {
      [_ in never]: never
    }
    Functions: {
      next_invoice_number: { Args: { _org_id: string }; Returns: string }
      post_invoice_journal: { Args: { _invoice_id: string }; Returns: string }
      seed_default_chart: { Args: { _org: string }; Returns: undefined }
    }
    Enums: {
      account_type:
        | "asset"
        | "liability"
        | "equity"
        | "revenue"
        | "expense"
        | "vat"
      app_role: "admin" | "medewerker"
      discount_type: "none" | "one_time" | "recurring"
      invoice_status: "draft" | "sent" | "paid" | "overdue" | "cancelled"
      lead_stage:
        | "nieuwe"
        | "op_afspraak"
        | "in_afwachting"
        | "even_on_hold"
        | "in_contact"
        | "klant"
        | "verloren"
        | "ai_columbus"
        | "contact_opgenomen"
        | "offerte_verzonden"
        | "gewonnen"
      org_role: "holding_admin" | "company_staff"
      pricing_type: "one_time" | "monthly_recurring" | "per_credit"
      quote_status:
        | "draft"
        | "sent"
        | "viewed"
        | "signed"
        | "approved_paid"
        | "declined"
      sync_status: "pending" | "success" | "failed"
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
      account_type: [
        "asset",
        "liability",
        "equity",
        "revenue",
        "expense",
        "vat",
      ],
      app_role: ["admin", "medewerker"],
      discount_type: ["none", "one_time", "recurring"],
      invoice_status: ["draft", "sent", "paid", "overdue", "cancelled"],
      lead_stage: [
        "nieuwe",
        "op_afspraak",
        "in_afwachting",
        "even_on_hold",
        "in_contact",
        "klant",
        "verloren",
        "ai_columbus",
        "contact_opgenomen",
        "offerte_verzonden",
        "gewonnen",
      ],
      org_role: ["holding_admin", "company_staff"],
      pricing_type: ["one_time", "monthly_recurring", "per_credit"],
      quote_status: [
        "draft",
        "sent",
        "viewed",
        "signed",
        "approved_paid",
        "declined",
      ],
      sync_status: ["pending", "success", "failed"],
    },
  },
} as const
