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
          address_line1: string | null
          address_line2: string | null
          city: string | null
          contact_person: string | null
          country: string | null
          created_at: string
          created_by: string | null
          email: string | null
          id: string
          kvk_number: string | null
          monthly_value: number | null
          name: string
          notes: string | null
          organization_id: string | null
          phone: string | null
          postal_code: string | null
          start_date: string | null
          updated_at: string
          vat_number: string | null
          website: string | null
        }
        Insert: {
          address_line1?: string | null
          address_line2?: string | null
          city?: string | null
          contact_person?: string | null
          country?: string | null
          created_at?: string
          created_by?: string | null
          email?: string | null
          id?: string
          kvk_number?: string | null
          monthly_value?: number | null
          name: string
          notes?: string | null
          organization_id?: string | null
          phone?: string | null
          postal_code?: string | null
          start_date?: string | null
          updated_at?: string
          vat_number?: string | null
          website?: string | null
        }
        Update: {
          address_line1?: string | null
          address_line2?: string | null
          city?: string | null
          contact_person?: string | null
          country?: string | null
          created_at?: string
          created_by?: string | null
          email?: string | null
          id?: string
          kvk_number?: string | null
          monthly_value?: number | null
          name?: string
          notes?: string | null
          organization_id?: string | null
          phone?: string | null
          postal_code?: string | null
          start_date?: string | null
          updated_at?: string
          vat_number?: string | null
          website?: string | null
        }
        Relationships: [
          {
            foreignKeyName: "clients_organization_id_fkey"
            columns: ["organization_id"]
            isOneToOne: false
            referencedRelation: "organizations"
            referencedColumns: ["id"]
          },
        ]
      }
      expense_attachment_audit: {
        Row: {
          action: string
          actor_id: string | null
          attachment_id: string | null
          created_at: string
          expense_id: string
          file_name: string | null
          id: string
          note: string | null
          organization_id: string
          previous_file_name: string | null
          previous_storage_path: string | null
          storage_path: string | null
        }
        Insert: {
          action: string
          actor_id?: string | null
          attachment_id?: string | null
          created_at?: string
          expense_id: string
          file_name?: string | null
          id?: string
          note?: string | null
          organization_id: string
          previous_file_name?: string | null
          previous_storage_path?: string | null
          storage_path?: string | null
        }
        Update: {
          action?: string
          actor_id?: string | null
          attachment_id?: string | null
          created_at?: string
          expense_id?: string
          file_name?: string | null
          id?: string
          note?: string | null
          organization_id?: string
          previous_file_name?: string | null
          previous_storage_path?: string | null
          storage_path?: string | null
        }
        Relationships: [
          {
            foreignKeyName: "expense_attachment_audit_expense_id_fkey"
            columns: ["expense_id"]
            isOneToOne: false
            referencedRelation: "expenses"
            referencedColumns: ["id"]
          },
          {
            foreignKeyName: "expense_attachment_audit_organization_id_fkey"
            columns: ["organization_id"]
            isOneToOne: false
            referencedRelation: "organizations"
            referencedColumns: ["id"]
          },
        ]
      }
      expense_attachments: {
        Row: {
          created_at: string
          expense_id: string
          file_name: string
          id: string
          mime_type: string | null
          organization_id: string
          size_bytes: number | null
          storage_path: string
          uploaded_by: string | null
        }
        Insert: {
          created_at?: string
          expense_id: string
          file_name: string
          id?: string
          mime_type?: string | null
          organization_id: string
          size_bytes?: number | null
          storage_path: string
          uploaded_by?: string | null
        }
        Update: {
          created_at?: string
          expense_id?: string
          file_name?: string
          id?: string
          mime_type?: string | null
          organization_id?: string
          size_bytes?: number | null
          storage_path?: string
          uploaded_by?: string | null
        }
        Relationships: [
          {
            foreignKeyName: "expense_attachments_expense_id_fkey"
            columns: ["expense_id"]
            isOneToOne: false
            referencedRelation: "expenses"
            referencedColumns: ["id"]
          },
          {
            foreignKeyName: "expense_attachments_organization_id_fkey"
            columns: ["organization_id"]
            isOneToOne: false
            referencedRelation: "organizations"
            referencedColumns: ["id"]
          },
        ]
      }
      expenses: {
        Row: {
          amount_cents: number
          category: string | null
          client_id: string | null
          created_at: string
          created_by: string | null
          description: string | null
          expense_date: string
          id: string
          journal_error: string | null
          journal_status: string
          notes: string | null
          organization_id: string
          paid_at: string | null
          payment_method: string | null
          project_id: string | null
          reference: string | null
          status: string
          supplier: string
          total_cents: number
          updated_at: string
          vat_cents: number
          vat_rate: number | null
        }
        Insert: {
          amount_cents?: number
          category?: string | null
          client_id?: string | null
          created_at?: string
          created_by?: string | null
          description?: string | null
          expense_date?: string
          id?: string
          journal_error?: string | null
          journal_status?: string
          notes?: string | null
          organization_id: string
          paid_at?: string | null
          payment_method?: string | null
          project_id?: string | null
          reference?: string | null
          status?: string
          supplier: string
          total_cents?: number
          updated_at?: string
          vat_cents?: number
          vat_rate?: number | null
        }
        Update: {
          amount_cents?: number
          category?: string | null
          client_id?: string | null
          created_at?: string
          created_by?: string | null
          description?: string | null
          expense_date?: string
          id?: string
          journal_error?: string | null
          journal_status?: string
          notes?: string | null
          organization_id?: string
          paid_at?: string | null
          payment_method?: string | null
          project_id?: string | null
          reference?: string | null
          status?: string
          supplier?: string
          total_cents?: number
          updated_at?: string
          vat_cents?: number
          vat_rate?: number | null
        }
        Relationships: [
          {
            foreignKeyName: "expenses_client_id_fkey"
            columns: ["client_id"]
            isOneToOne: false
            referencedRelation: "clients"
            referencedColumns: ["id"]
          },
          {
            foreignKeyName: "expenses_organization_id_fkey"
            columns: ["organization_id"]
            isOneToOne: false
            referencedRelation: "organizations"
            referencedColumns: ["id"]
          },
          {
            foreignKeyName: "expenses_project_id_fkey"
            columns: ["project_id"]
            isOneToOne: false
            referencedRelation: "projects"
            referencedColumns: ["id"]
          },
        ]
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
      invoice_link_log: {
        Row: {
          actor_id: string | null
          actor_label: string | null
          client_id: string | null
          created_at: string
          id: string
          invoice_id: string
          note: string | null
          organization_id: string
          project_id: string | null
          source: string
        }
        Insert: {
          actor_id?: string | null
          actor_label?: string | null
          client_id?: string | null
          created_at?: string
          id?: string
          invoice_id: string
          note?: string | null
          organization_id: string
          project_id?: string | null
          source: string
        }
        Update: {
          actor_id?: string | null
          actor_label?: string | null
          client_id?: string | null
          created_at?: string
          id?: string
          invoice_id?: string
          note?: string | null
          organization_id?: string
          project_id?: string | null
          source?: string
        }
        Relationships: [
          {
            foreignKeyName: "invoice_link_log_client_id_fkey"
            columns: ["client_id"]
            isOneToOne: false
            referencedRelation: "clients"
            referencedColumns: ["id"]
          },
          {
            foreignKeyName: "invoice_link_log_invoice_id_fkey"
            columns: ["invoice_id"]
            isOneToOne: false
            referencedRelation: "invoices"
            referencedColumns: ["id"]
          },
          {
            foreignKeyName: "invoice_link_log_organization_id_fkey"
            columns: ["organization_id"]
            isOneToOne: false
            referencedRelation: "organizations"
            referencedColumns: ["id"]
          },
          {
            foreignKeyName: "invoice_link_log_project_id_fkey"
            columns: ["project_id"]
            isOneToOne: false
            referencedRelation: "projects"
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
          project_id: string | null
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
          project_id?: string | null
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
          project_id?: string | null
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
            foreignKeyName: "invoices_project_id_fkey"
            columns: ["project_id"]
            isOneToOne: false
            referencedRelation: "projects"
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
          expense_id: string | null
          id: string
          invoice_id: string | null
          organization_id: string
          quote_id: string | null
          reversed_by_entry_id: string | null
          reverses_entry_id: string | null
          source: string
        }
        Insert: {
          created_at?: string
          created_by?: string | null
          description: string
          entry_date?: string
          expense_id?: string | null
          id?: string
          invoice_id?: string | null
          organization_id: string
          quote_id?: string | null
          reversed_by_entry_id?: string | null
          reverses_entry_id?: string | null
          source?: string
        }
        Update: {
          created_at?: string
          created_by?: string | null
          description?: string
          entry_date?: string
          expense_id?: string | null
          id?: string
          invoice_id?: string | null
          organization_id?: string
          quote_id?: string | null
          reversed_by_entry_id?: string | null
          reverses_entry_id?: string | null
          source?: string
        }
        Relationships: [
          {
            foreignKeyName: "journal_entries_expense_id_fkey"
            columns: ["expense_id"]
            isOneToOne: false
            referencedRelation: "expenses"
            referencedColumns: ["id"]
          },
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
          {
            foreignKeyName: "journal_entries_reversed_by_entry_id_fkey"
            columns: ["reversed_by_entry_id"]
            isOneToOne: false
            referencedRelation: "journal_entries"
            referencedColumns: ["id"]
          },
          {
            foreignKeyName: "journal_entries_reverses_entry_id_fkey"
            columns: ["reverses_entry_id"]
            isOneToOne: false
            referencedRelation: "journal_entries"
            referencedColumns: ["id"]
          },
        ]
      }
      journal_export_log: {
        Row: {
          exported_at: string
          exported_by: string | null
          file_name: string
          file_size_bytes: number | null
          id: string
          journal_entry_id: string
          organization_id: string
          template_theme: string | null
        }
        Insert: {
          exported_at?: string
          exported_by?: string | null
          file_name: string
          file_size_bytes?: number | null
          id?: string
          journal_entry_id: string
          organization_id: string
          template_theme?: string | null
        }
        Update: {
          exported_at?: string
          exported_by?: string | null
          file_name?: string
          file_size_bytes?: number | null
          id?: string
          journal_entry_id?: string
          organization_id?: string
          template_theme?: string | null
        }
        Relationships: [
          {
            foreignKeyName: "journal_export_log_journal_entry_id_fkey"
            columns: ["journal_entry_id"]
            isOneToOne: false
            referencedRelation: "journal_entries"
            referencedColumns: ["id"]
          },
          {
            foreignKeyName: "journal_export_log_organization_id_fkey"
            columns: ["organization_id"]
            isOneToOne: false
            referencedRelation: "organizations"
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
      outreach_campaigns: {
        Row: {
          ai_pitch: string | null
          channel: string
          created_at: string
          created_by: string | null
          daily_limit: number
          goal: string | null
          id: string
          name: string
          notes: string | null
          organization_id: string
          pitch_variants: Json
          sequence_steps: Json
          status: string
          updated_at: string
        }
        Insert: {
          ai_pitch?: string | null
          channel?: string
          created_at?: string
          created_by?: string | null
          daily_limit?: number
          goal?: string | null
          id?: string
          name: string
          notes?: string | null
          organization_id: string
          pitch_variants?: Json
          sequence_steps?: Json
          status?: string
          updated_at?: string
        }
        Update: {
          ai_pitch?: string | null
          channel?: string
          created_at?: string
          created_by?: string | null
          daily_limit?: number
          goal?: string | null
          id?: string
          name?: string
          notes?: string | null
          organization_id?: string
          pitch_variants?: Json
          sequence_steps?: Json
          status?: string
          updated_at?: string
        }
        Relationships: [
          {
            foreignKeyName: "outreach_campaigns_organization_id_fkey"
            columns: ["organization_id"]
            isOneToOne: false
            referencedRelation: "organizations"
            referencedColumns: ["id"]
          },
        ]
      }
      outreach_messages: {
        Row: {
          body: string | null
          campaign_id: string | null
          channel: string
          created_at: string
          direction: string
          error: string | null
          id: string
          organization_id: string
          provider_message_id: string | null
          received_at: string | null
          reply_classification: string | null
          sent_at: string | null
          sentiment: string | null
          status: string
          step_index: number | null
          subject: string | null
          target_id: string
          updated_at: string
        }
        Insert: {
          body?: string | null
          campaign_id?: string | null
          channel?: string
          created_at?: string
          direction?: string
          error?: string | null
          id?: string
          organization_id: string
          provider_message_id?: string | null
          received_at?: string | null
          reply_classification?: string | null
          sent_at?: string | null
          sentiment?: string | null
          status?: string
          step_index?: number | null
          subject?: string | null
          target_id: string
          updated_at?: string
        }
        Update: {
          body?: string | null
          campaign_id?: string | null
          channel?: string
          created_at?: string
          direction?: string
          error?: string | null
          id?: string
          organization_id?: string
          provider_message_id?: string | null
          received_at?: string | null
          reply_classification?: string | null
          sent_at?: string | null
          sentiment?: string | null
          status?: string
          step_index?: number | null
          subject?: string | null
          target_id?: string
          updated_at?: string
        }
        Relationships: [
          {
            foreignKeyName: "outreach_messages_campaign_id_fkey"
            columns: ["campaign_id"]
            isOneToOne: false
            referencedRelation: "outreach_campaigns"
            referencedColumns: ["id"]
          },
          {
            foreignKeyName: "outreach_messages_organization_id_fkey"
            columns: ["organization_id"]
            isOneToOne: false
            referencedRelation: "organizations"
            referencedColumns: ["id"]
          },
          {
            foreignKeyName: "outreach_messages_target_id_fkey"
            columns: ["target_id"]
            isOneToOne: false
            referencedRelation: "outreach_targets"
            referencedColumns: ["id"]
          },
        ]
      }
      outreach_targets: {
        Row: {
          campaign_id: string | null
          company: string
          contact_name: string | null
          created_at: string
          created_by: string | null
          email: string | null
          id: string
          last_contact_at: string | null
          last_message_at: string | null
          linkedin_url: string | null
          next_send_at: string | null
          notes: string | null
          organization_id: string
          paused: boolean
          phone: string | null
          pitch_variant_id: string | null
          reply_classification: string | null
          research_at: string | null
          research_summary: string | null
          sequence_step_index: number
          stage: string
          updated_at: string
        }
        Insert: {
          campaign_id?: string | null
          company: string
          contact_name?: string | null
          created_at?: string
          created_by?: string | null
          email?: string | null
          id?: string
          last_contact_at?: string | null
          last_message_at?: string | null
          linkedin_url?: string | null
          next_send_at?: string | null
          notes?: string | null
          organization_id: string
          paused?: boolean
          phone?: string | null
          pitch_variant_id?: string | null
          reply_classification?: string | null
          research_at?: string | null
          research_summary?: string | null
          sequence_step_index?: number
          stage?: string
          updated_at?: string
        }
        Update: {
          campaign_id?: string | null
          company?: string
          contact_name?: string | null
          created_at?: string
          created_by?: string | null
          email?: string | null
          id?: string
          last_contact_at?: string | null
          last_message_at?: string | null
          linkedin_url?: string | null
          next_send_at?: string | null
          notes?: string | null
          organization_id?: string
          paused?: boolean
          phone?: string | null
          pitch_variant_id?: string | null
          reply_classification?: string | null
          research_at?: string | null
          research_summary?: string | null
          sequence_step_index?: number
          stage?: string
          updated_at?: string
        }
        Relationships: [
          {
            foreignKeyName: "outreach_targets_campaign_id_fkey"
            columns: ["campaign_id"]
            isOneToOne: false
            referencedRelation: "outreach_campaigns"
            referencedColumns: ["id"]
          },
          {
            foreignKeyName: "outreach_targets_organization_id_fkey"
            columns: ["organization_id"]
            isOneToOne: false
            referencedRelation: "organizations"
            referencedColumns: ["id"]
          },
        ]
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
      project_status_history: {
        Row: {
          changed_at: string
          changed_by: string | null
          id: string
          new_status: Database["public"]["Enums"]["project_status"]
          old_status: Database["public"]["Enums"]["project_status"] | null
          organization_id: string
          project_id: string
        }
        Insert: {
          changed_at?: string
          changed_by?: string | null
          id?: string
          new_status: Database["public"]["Enums"]["project_status"]
          old_status?: Database["public"]["Enums"]["project_status"] | null
          organization_id: string
          project_id: string
        }
        Update: {
          changed_at?: string
          changed_by?: string | null
          id?: string
          new_status?: Database["public"]["Enums"]["project_status"]
          old_status?: Database["public"]["Enums"]["project_status"] | null
          organization_id?: string
          project_id?: string
        }
        Relationships: [
          {
            foreignKeyName: "project_status_history_organization_id_fkey"
            columns: ["organization_id"]
            isOneToOne: false
            referencedRelation: "organizations"
            referencedColumns: ["id"]
          },
          {
            foreignKeyName: "project_status_history_project_id_fkey"
            columns: ["project_id"]
            isOneToOne: false
            referencedRelation: "projects"
            referencedColumns: ["id"]
          },
        ]
      }
      projects: {
        Row: {
          client_id: string | null
          contact_email: string | null
          contact_name: string | null
          contact_phone: string | null
          created_at: string
          created_by: string | null
          id: string
          last_modified_at: string
          last_modified_by: string | null
          name: string
          notes: string | null
          organization_id: string
          status: Database["public"]["Enums"]["project_status"]
          target_month: string | null
          updated_at: string
          value_cents: number
        }
        Insert: {
          client_id?: string | null
          contact_email?: string | null
          contact_name?: string | null
          contact_phone?: string | null
          created_at?: string
          created_by?: string | null
          id?: string
          last_modified_at?: string
          last_modified_by?: string | null
          name: string
          notes?: string | null
          organization_id: string
          status?: Database["public"]["Enums"]["project_status"]
          target_month?: string | null
          updated_at?: string
          value_cents?: number
        }
        Update: {
          client_id?: string | null
          contact_email?: string | null
          contact_name?: string | null
          contact_phone?: string | null
          created_at?: string
          created_by?: string | null
          id?: string
          last_modified_at?: string
          last_modified_by?: string | null
          name?: string
          notes?: string | null
          organization_id?: string
          status?: Database["public"]["Enums"]["project_status"]
          target_month?: string | null
          updated_at?: string
          value_cents?: number
        }
        Relationships: [
          {
            foreignKeyName: "projects_client_id_fkey"
            columns: ["client_id"]
            isOneToOne: false
            referencedRelation: "clients"
            referencedColumns: ["id"]
          },
          {
            foreignKeyName: "projects_organization_id_fkey"
            columns: ["organization_id"]
            isOneToOne: false
            referencedRelation: "organizations"
            referencedColumns: ["id"]
          },
        ]
      }
      quote_status_events: {
        Row: {
          created_at: string
          event_type: Database["public"]["Enums"]["quote_event_type"]
          id: string
          metadata: Json
          occurred_at: string
          organization_id: string
          quote_id: string
        }
        Insert: {
          created_at?: string
          event_type: Database["public"]["Enums"]["quote_event_type"]
          id?: string
          metadata?: Json
          occurred_at?: string
          organization_id: string
          quote_id: string
        }
        Update: {
          created_at?: string
          event_type?: Database["public"]["Enums"]["quote_event_type"]
          id?: string
          metadata?: Json
          occurred_at?: string
          organization_id?: string
          quote_id?: string
        }
        Relationships: [
          {
            foreignKeyName: "quote_status_events_organization_id_fkey"
            columns: ["organization_id"]
            isOneToOne: false
            referencedRelation: "organizations"
            referencedColumns: ["id"]
          },
          {
            foreignKeyName: "quote_status_events_quote_id_fkey"
            columns: ["quote_id"]
            isOneToOne: false
            referencedRelation: "quotes"
            referencedColumns: ["id"]
          },
        ]
      }
      quote_templates: {
        Row: {
          cover_image_url: string | null
          created_at: string
          created_by: string | null
          description: string | null
          id: string
          is_default: boolean
          name: string
          organization_id: string
          sections: Json
          theme: Json
          updated_at: string
        }
        Insert: {
          cover_image_url?: string | null
          created_at?: string
          created_by?: string | null
          description?: string | null
          id?: string
          is_default?: boolean
          name: string
          organization_id: string
          sections?: Json
          theme?: Json
          updated_at?: string
        }
        Update: {
          cover_image_url?: string | null
          created_at?: string
          created_by?: string | null
          description?: string | null
          id?: string
          is_default?: boolean
          name?: string
          organization_id?: string
          sections?: Json
          theme?: Json
          updated_at?: string
        }
        Relationships: [
          {
            foreignKeyName: "quote_templates_organization_id_fkey"
            columns: ["organization_id"]
            isOneToOne: false
            referencedRelation: "organizations"
            referencedColumns: ["id"]
          },
        ]
      }
      quotes: {
        Row: {
          client_id: string | null
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
          client_id?: string | null
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
          client_id?: string | null
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
            foreignKeyName: "quotes_client_id_fkey"
            columns: ["client_id"]
            isOneToOne: false
            referencedRelation: "clients"
            referencedColumns: ["id"]
          },
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
      studio_quote_events: {
        Row: {
          duration_ms: number | null
          event_type: string
          id: string
          metadata: Json
          occurred_at: string
          organization_id: string
          quote_id: string
          section_key: string | null
        }
        Insert: {
          duration_ms?: number | null
          event_type: string
          id?: string
          metadata?: Json
          occurred_at?: string
          organization_id: string
          quote_id: string
          section_key?: string | null
        }
        Update: {
          duration_ms?: number | null
          event_type?: string
          id?: string
          metadata?: Json
          occurred_at?: string
          organization_id?: string
          quote_id?: string
          section_key?: string | null
        }
        Relationships: [
          {
            foreignKeyName: "studio_quote_events_quote_id_fkey"
            columns: ["quote_id"]
            isOneToOne: false
            referencedRelation: "studio_quotes"
            referencedColumns: ["id"]
          },
        ]
      }
      studio_quotes: {
        Row: {
          accepted_at: string | null
          accepted_by_name: string | null
          accepted_signature: string | null
          ai_brief: string | null
          approved_at: string | null
          client_name: string | null
          cover_image_url: string | null
          created_at: string
          created_by: string | null
          followup_count: number
          followup_sent_at: string | null
          id: string
          intro_video_url: string | null
          last_viewed_at: string | null
          organization_id: string
          outreach_target_id: string | null
          packages: Json
          public_token: string | null
          sections: Json
          selected_package_id: string | null
          status: string
          template_id: string | null
          theme: Json
          title: string
          updated_at: string
          view_count: number
        }
        Insert: {
          accepted_at?: string | null
          accepted_by_name?: string | null
          accepted_signature?: string | null
          ai_brief?: string | null
          approved_at?: string | null
          client_name?: string | null
          cover_image_url?: string | null
          created_at?: string
          created_by?: string | null
          followup_count?: number
          followup_sent_at?: string | null
          id?: string
          intro_video_url?: string | null
          last_viewed_at?: string | null
          organization_id: string
          outreach_target_id?: string | null
          packages?: Json
          public_token?: string | null
          sections?: Json
          selected_package_id?: string | null
          status?: string
          template_id?: string | null
          theme?: Json
          title: string
          updated_at?: string
          view_count?: number
        }
        Update: {
          accepted_at?: string | null
          accepted_by_name?: string | null
          accepted_signature?: string | null
          ai_brief?: string | null
          approved_at?: string | null
          client_name?: string | null
          cover_image_url?: string | null
          created_at?: string
          created_by?: string | null
          followup_count?: number
          followup_sent_at?: string | null
          id?: string
          intro_video_url?: string | null
          last_viewed_at?: string | null
          organization_id?: string
          outreach_target_id?: string | null
          packages?: Json
          public_token?: string | null
          sections?: Json
          selected_package_id?: string | null
          status?: string
          template_id?: string | null
          theme?: Json
          title?: string
          updated_at?: string
          view_count?: number
        }
        Relationships: [
          {
            foreignKeyName: "studio_quotes_organization_id_fkey"
            columns: ["organization_id"]
            isOneToOne: false
            referencedRelation: "organizations"
            referencedColumns: ["id"]
          },
          {
            foreignKeyName: "studio_quotes_outreach_target_id_fkey"
            columns: ["outreach_target_id"]
            isOneToOne: false
            referencedRelation: "outreach_targets"
            referencedColumns: ["id"]
          },
          {
            foreignKeyName: "studio_quotes_template_id_fkey"
            columns: ["template_id"]
            isOneToOne: false
            referencedRelation: "quote_templates"
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
      post_expense_journal:
        | { Args: { _expense_id: string }; Returns: string }
        | {
            Args: { _counter_code?: string; _expense_id: string }
            Returns: string
          }
      post_invoice_journal: { Args: { _invoice_id: string }; Returns: string }
      reverse_expense_journal: {
        Args: { _expense_id: string; _reason?: string }
        Returns: string
      }
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
      project_status:
        | "contact_gezocht"
        | "afspraak_geboekt"
        | "offerte_verstuurd"
        | "contract_verstuurd"
        | "contract_getekend"
        | "on_hold"
      quote_event_type: "viewed" | "signed" | "paid" | "invoice_created"
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
      project_status: [
        "contact_gezocht",
        "afspraak_geboekt",
        "offerte_verstuurd",
        "contract_verstuurd",
        "contract_getekend",
        "on_hold",
      ],
      quote_event_type: ["viewed", "signed", "paid", "invoice_created"],
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
