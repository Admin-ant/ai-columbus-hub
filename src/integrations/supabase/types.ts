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
      appointments: {
        Row: {
          attendee_email: string | null
          attendee_name: string | null
          client_id: string | null
          created_at: string
          created_by: string | null
          description: string | null
          ends_at: string
          ics_sequence: number
          ics_uid: string
          id: string
          invite_sent_at: string | null
          lead_id: string | null
          location: string | null
          organization_id: string
          starts_at: string
          status: string
          title: string
          updated_at: string
        }
        Insert: {
          attendee_email?: string | null
          attendee_name?: string | null
          client_id?: string | null
          created_at?: string
          created_by?: string | null
          description?: string | null
          ends_at: string
          ics_sequence?: number
          ics_uid?: string
          id?: string
          invite_sent_at?: string | null
          lead_id?: string | null
          location?: string | null
          organization_id: string
          starts_at: string
          status?: string
          title: string
          updated_at?: string
        }
        Update: {
          attendee_email?: string | null
          attendee_name?: string | null
          client_id?: string | null
          created_at?: string
          created_by?: string | null
          description?: string | null
          ends_at?: string
          ics_sequence?: number
          ics_uid?: string
          id?: string
          invite_sent_at?: string | null
          lead_id?: string | null
          location?: string | null
          organization_id?: string
          starts_at?: string
          status?: string
          title?: string
          updated_at?: string
        }
        Relationships: [
          {
            foreignKeyName: "appointments_client_id_fkey"
            columns: ["client_id"]
            isOneToOne: false
            referencedRelation: "clients"
            referencedColumns: ["id"]
          },
          {
            foreignKeyName: "appointments_lead_id_fkey"
            columns: ["lead_id"]
            isOneToOne: false
            referencedRelation: "leads"
            referencedColumns: ["id"]
          },
          {
            foreignKeyName: "appointments_organization_id_fkey"
            columns: ["organization_id"]
            isOneToOne: false
            referencedRelation: "organizations"
            referencedColumns: ["id"]
          },
        ]
      }
      call_recorder_rules: {
        Row: {
          action_kind: string
          created_at: string
          created_by: string | null
          enabled: boolean
          id: string
          keywords: string[]
          name: string
          organization_id: string
          priority: number
          target_stage: string | null
          task_body: string | null
          task_due_days: number
          task_title: string | null
          updated_at: string
        }
        Insert: {
          action_kind: string
          created_at?: string
          created_by?: string | null
          enabled?: boolean
          id?: string
          keywords?: string[]
          name: string
          organization_id: string
          priority?: number
          target_stage?: string | null
          task_body?: string | null
          task_due_days?: number
          task_title?: string | null
          updated_at?: string
        }
        Update: {
          action_kind?: string
          created_at?: string
          created_by?: string | null
          enabled?: boolean
          id?: string
          keywords?: string[]
          name?: string
          organization_id?: string
          priority?: number
          target_stage?: string | null
          task_body?: string | null
          task_due_days?: number
          task_title?: string | null
          updated_at?: string
        }
        Relationships: [
          {
            foreignKeyName: "call_recorder_rules_organization_id_fkey"
            columns: ["organization_id"]
            isOneToOne: false
            referencedRelation: "organizations"
            referencedColumns: ["id"]
          },
        ]
      }
      call_recordings: {
        Row: {
          audio_mime: string | null
          audio_path: string | null
          client_id: string | null
          created_at: string
          created_by: string | null
          duration_seconds: number | null
          error: string | null
          final_transcript: string | null
          finalized_at: string | null
          id: string
          lead_id: string | null
          organization_id: string
          pending_tasks: Json
          progress_stage: string | null
          report_markdown: string | null
          status: string
          suggested_stage: string | null
          summary: string | null
          tasks_created: number
          title: string | null
          transcript: string | null
          updated_at: string
          workflow_stage: string | null
        }
        Insert: {
          audio_mime?: string | null
          audio_path?: string | null
          client_id?: string | null
          created_at?: string
          created_by?: string | null
          duration_seconds?: number | null
          error?: string | null
          final_transcript?: string | null
          finalized_at?: string | null
          id?: string
          lead_id?: string | null
          organization_id: string
          pending_tasks?: Json
          progress_stage?: string | null
          report_markdown?: string | null
          status?: string
          suggested_stage?: string | null
          summary?: string | null
          tasks_created?: number
          title?: string | null
          transcript?: string | null
          updated_at?: string
          workflow_stage?: string | null
        }
        Update: {
          audio_mime?: string | null
          audio_path?: string | null
          client_id?: string | null
          created_at?: string
          created_by?: string | null
          duration_seconds?: number | null
          error?: string | null
          final_transcript?: string | null
          finalized_at?: string | null
          id?: string
          lead_id?: string | null
          organization_id?: string
          pending_tasks?: Json
          progress_stage?: string | null
          report_markdown?: string | null
          status?: string
          suggested_stage?: string | null
          summary?: string | null
          tasks_created?: number
          title?: string | null
          transcript?: string | null
          updated_at?: string
          workflow_stage?: string | null
        }
        Relationships: [
          {
            foreignKeyName: "call_recordings_client_id_fkey"
            columns: ["client_id"]
            isOneToOne: false
            referencedRelation: "clients"
            referencedColumns: ["id"]
          },
          {
            foreignKeyName: "call_recordings_lead_id_fkey"
            columns: ["lead_id"]
            isOneToOne: false
            referencedRelation: "leads"
            referencedColumns: ["id"]
          },
          {
            foreignKeyName: "call_recordings_organization_id_fkey"
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
      client_requirements: {
        Row: {
          created_at: string
          created_by: string | null
          currency: string
          id: string
          lead_id: string
          notes: string | null
          one_time_cents: number
          organization_id: string
          recurring_cents: number
          scope: string
          updated_at: string
        }
        Insert: {
          created_at?: string
          created_by?: string | null
          currency?: string
          id?: string
          lead_id: string
          notes?: string | null
          one_time_cents?: number
          organization_id: string
          recurring_cents?: number
          scope?: string
          updated_at?: string
        }
        Update: {
          created_at?: string
          created_by?: string | null
          currency?: string
          id?: string
          lead_id?: string
          notes?: string | null
          one_time_cents?: number
          organization_id?: string
          recurring_cents?: number
          scope?: string
          updated_at?: string
        }
        Relationships: [
          {
            foreignKeyName: "client_requirements_lead_id_fkey"
            columns: ["lead_id"]
            isOneToOne: true
            referencedRelation: "leads"
            referencedColumns: ["id"]
          },
          {
            foreignKeyName: "client_requirements_organization_id_fkey"
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
          external_id: string | null
          external_source: string | null
          external_url: string | null
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
          external_id?: string | null
          external_source?: string | null
          external_url?: string | null
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
          external_id?: string | null
          external_source?: string | null
          external_url?: string | null
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
      contract_lines: {
        Row: {
          contract_id: string
          created_at: string
          description: string
          id: string
          position: number
          product_id: string | null
          quantity: number
          unit_price_cents: number
          vat_rate: number
        }
        Insert: {
          contract_id: string
          created_at?: string
          description: string
          id?: string
          position?: number
          product_id?: string | null
          quantity?: number
          unit_price_cents?: number
          vat_rate?: number
        }
        Update: {
          contract_id?: string
          created_at?: string
          description?: string
          id?: string
          position?: number
          product_id?: string | null
          quantity?: number
          unit_price_cents?: number
          vat_rate?: number
        }
        Relationships: [
          {
            foreignKeyName: "contract_lines_contract_id_fkey"
            columns: ["contract_id"]
            isOneToOne: false
            referencedRelation: "contracts"
            referencedColumns: ["id"]
          },
          {
            foreignKeyName: "contract_lines_product_id_fkey"
            columns: ["product_id"]
            isOneToOne: false
            referencedRelation: "products"
            referencedColumns: ["id"]
          },
        ]
      }
      contracts: {
        Row: {
          auto_invoice: boolean
          billing_frequency: Database["public"]["Enums"]["billing_frequency"]
          client_id: string
          contract_number: string | null
          created_at: string
          created_by: string | null
          currency: string
          end_date: string | null
          id: string
          last_invoiced_at: string | null
          monthly_amount_cents: number
          next_invoice_date: string | null
          notes: string | null
          notice_period_days: number
          organization_id: string
          payment_terms_days: number
          project_id: string | null
          quote_id: string | null
          setup_fee_cents: number
          start_date: string
          status: Database["public"]["Enums"]["contract_status"]
          title: string
          updated_at: string
          vat_rate: number
        }
        Insert: {
          auto_invoice?: boolean
          billing_frequency?: Database["public"]["Enums"]["billing_frequency"]
          client_id: string
          contract_number?: string | null
          created_at?: string
          created_by?: string | null
          currency?: string
          end_date?: string | null
          id?: string
          last_invoiced_at?: string | null
          monthly_amount_cents?: number
          next_invoice_date?: string | null
          notes?: string | null
          notice_period_days?: number
          organization_id: string
          payment_terms_days?: number
          project_id?: string | null
          quote_id?: string | null
          setup_fee_cents?: number
          start_date: string
          status?: Database["public"]["Enums"]["contract_status"]
          title: string
          updated_at?: string
          vat_rate?: number
        }
        Update: {
          auto_invoice?: boolean
          billing_frequency?: Database["public"]["Enums"]["billing_frequency"]
          client_id?: string
          contract_number?: string | null
          created_at?: string
          created_by?: string | null
          currency?: string
          end_date?: string | null
          id?: string
          last_invoiced_at?: string | null
          monthly_amount_cents?: number
          next_invoice_date?: string | null
          notes?: string | null
          notice_period_days?: number
          organization_id?: string
          payment_terms_days?: number
          project_id?: string | null
          quote_id?: string | null
          setup_fee_cents?: number
          start_date?: string
          status?: Database["public"]["Enums"]["contract_status"]
          title?: string
          updated_at?: string
          vat_rate?: number
        }
        Relationships: [
          {
            foreignKeyName: "contracts_client_id_fkey"
            columns: ["client_id"]
            isOneToOne: false
            referencedRelation: "clients"
            referencedColumns: ["id"]
          },
          {
            foreignKeyName: "contracts_organization_id_fkey"
            columns: ["organization_id"]
            isOneToOne: false
            referencedRelation: "organizations"
            referencedColumns: ["id"]
          },
          {
            foreignKeyName: "contracts_project_id_fkey"
            columns: ["project_id"]
            isOneToOne: false
            referencedRelation: "projects"
            referencedColumns: ["id"]
          },
          {
            foreignKeyName: "contracts_quote_id_fkey"
            columns: ["quote_id"]
            isOneToOne: false
            referencedRelation: "quotes"
            referencedColumns: ["id"]
          },
        ]
      }
      crm_activities: {
        Row: {
          body: string | null
          client_id: string | null
          created_at: string
          created_by: string | null
          done: boolean
          done_at: string | null
          due_at: string | null
          id: string
          kind: string
          organization_id: string
          quote_id: string | null
          target_id: string | null
          title: string | null
          updated_at: string
        }
        Insert: {
          body?: string | null
          client_id?: string | null
          created_at?: string
          created_by?: string | null
          done?: boolean
          done_at?: string | null
          due_at?: string | null
          id?: string
          kind: string
          organization_id: string
          quote_id?: string | null
          target_id?: string | null
          title?: string | null
          updated_at?: string
        }
        Update: {
          body?: string | null
          client_id?: string | null
          created_at?: string
          created_by?: string | null
          done?: boolean
          done_at?: string | null
          due_at?: string | null
          id?: string
          kind?: string
          organization_id?: string
          quote_id?: string | null
          target_id?: string | null
          title?: string | null
          updated_at?: string
        }
        Relationships: [
          {
            foreignKeyName: "crm_activities_client_id_fkey"
            columns: ["client_id"]
            isOneToOne: false
            referencedRelation: "clients"
            referencedColumns: ["id"]
          },
          {
            foreignKeyName: "crm_activities_organization_id_fkey"
            columns: ["organization_id"]
            isOneToOne: false
            referencedRelation: "organizations"
            referencedColumns: ["id"]
          },
          {
            foreignKeyName: "crm_activities_quote_id_fkey"
            columns: ["quote_id"]
            isOneToOne: false
            referencedRelation: "studio_quotes"
            referencedColumns: ["id"]
          },
          {
            foreignKeyName: "crm_activities_target_id_fkey"
            columns: ["target_id"]
            isOneToOne: false
            referencedRelation: "outreach_targets"
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
      forecast_snapshots: {
        Row: {
          best_case_cents: number
          breakdown: Json
          commit_cents: number
          created_at: string
          created_by: string | null
          id: string
          organization_id: string
          period_end: string
          period_start: string
          updated_at: string
          weighted_value_cents: number
        }
        Insert: {
          best_case_cents?: number
          breakdown?: Json
          commit_cents?: number
          created_at?: string
          created_by?: string | null
          id?: string
          organization_id: string
          period_end: string
          period_start: string
          updated_at?: string
          weighted_value_cents?: number
        }
        Update: {
          best_case_cents?: number
          breakdown?: Json
          commit_cents?: number
          created_at?: string
          created_by?: string | null
          id?: string
          organization_id?: string
          period_end?: string
          period_start?: string
          updated_at?: string
          weighted_value_cents?: number
        }
        Relationships: [
          {
            foreignKeyName: "forecast_snapshots_organization_id_fkey"
            columns: ["organization_id"]
            isOneToOne: false
            referencedRelation: "organizations"
            referencedColumns: ["id"]
          },
        ]
      }
      integration_events: {
        Row: {
          created_client_id: string | null
          created_invoice_id: string | null
          created_lead_id: string | null
          created_quote_id: string | null
          error_message: string | null
          event: string
          external_id: string | null
          id: string
          organization_id: string | null
          payload: Json
          received_at: string
          result: Json | null
          source: string
          status: string
        }
        Insert: {
          created_client_id?: string | null
          created_invoice_id?: string | null
          created_lead_id?: string | null
          created_quote_id?: string | null
          error_message?: string | null
          event: string
          external_id?: string | null
          id?: string
          organization_id?: string | null
          payload: Json
          received_at?: string
          result?: Json | null
          source: string
          status?: string
        }
        Update: {
          created_client_id?: string | null
          created_invoice_id?: string | null
          created_lead_id?: string | null
          created_quote_id?: string | null
          error_message?: string | null
          event?: string
          external_id?: string | null
          id?: string
          organization_id?: string | null
          payload?: Json
          received_at?: string
          result?: Json | null
          source?: string
          status?: string
        }
        Relationships: [
          {
            foreignKeyName: "integration_events_organization_id_fkey"
            columns: ["organization_id"]
            isOneToOne: false
            referencedRelation: "organizations"
            referencedColumns: ["id"]
          },
        ]
      }
      invoice_attachments: {
        Row: {
          created_at: string
          filename: string
          id: string
          invoice_id: string
          mime_type: string | null
          organization_id: string
          size_bytes: number | null
          storage_path: string
          uploaded_by: string | null
        }
        Insert: {
          created_at?: string
          filename: string
          id?: string
          invoice_id: string
          mime_type?: string | null
          organization_id: string
          size_bytes?: number | null
          storage_path: string
          uploaded_by?: string | null
        }
        Update: {
          created_at?: string
          filename?: string
          id?: string
          invoice_id?: string
          mime_type?: string | null
          organization_id?: string
          size_bytes?: number | null
          storage_path?: string
          uploaded_by?: string | null
        }
        Relationships: [
          {
            foreignKeyName: "invoice_attachments_invoice_id_fkey"
            columns: ["invoice_id"]
            isOneToOne: false
            referencedRelation: "invoices"
            referencedColumns: ["id"]
          },
          {
            foreignKeyName: "invoice_attachments_organization_id_fkey"
            columns: ["organization_id"]
            isOneToOne: false
            referencedRelation: "organizations"
            referencedColumns: ["id"]
          },
        ]
      }
      invoice_email_log: {
        Row: {
          body: string | null
          cc_emails: string[]
          created_at: string
          error: string | null
          id: string
          invoice_id: string
          mail_message_id: string | null
          organization_id: string
          provider_message_id: string | null
          sent_by: string | null
          status: string
          subject: string
          to_email: string
        }
        Insert: {
          body?: string | null
          cc_emails?: string[]
          created_at?: string
          error?: string | null
          id?: string
          invoice_id: string
          mail_message_id?: string | null
          organization_id: string
          provider_message_id?: string | null
          sent_by?: string | null
          status?: string
          subject: string
          to_email: string
        }
        Update: {
          body?: string | null
          cc_emails?: string[]
          created_at?: string
          error?: string | null
          id?: string
          invoice_id?: string
          mail_message_id?: string | null
          organization_id?: string
          provider_message_id?: string | null
          sent_by?: string | null
          status?: string
          subject?: string
          to_email?: string
        }
        Relationships: [
          {
            foreignKeyName: "invoice_email_log_invoice_id_fkey"
            columns: ["invoice_id"]
            isOneToOne: false
            referencedRelation: "invoices"
            referencedColumns: ["id"]
          },
          {
            foreignKeyName: "invoice_email_log_organization_id_fkey"
            columns: ["organization_id"]
            isOneToOne: false
            referencedRelation: "organizations"
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
          line_type: Database["public"]["Enums"]["invoice_line_type"]
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
          line_type?: Database["public"]["Enums"]["invoice_line_type"]
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
          line_type?: Database["public"]["Enums"]["invoice_line_type"]
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
      invoice_number_sequences: {
        Row: {
          created_at: string
          id: string
          next_seq: number
          organization_id: string
          prefix: string
          updated_at: string
          year: number
        }
        Insert: {
          created_at?: string
          id?: string
          next_seq?: number
          organization_id: string
          prefix: string
          updated_at?: string
          year: number
        }
        Update: {
          created_at?: string
          id?: string
          next_seq?: number
          organization_id?: string
          prefix?: string
          updated_at?: string
          year?: number
        }
        Relationships: [
          {
            foreignKeyName: "invoice_number_sequences_organization_id_fkey"
            columns: ["organization_id"]
            isOneToOne: false
            referencedRelation: "organizations"
            referencedColumns: ["id"]
          },
        ]
      }
      invoice_payment_events: {
        Row: {
          amount_cents: number | null
          created_at: string
          event_type: string
          id: string
          invoice_id: string
          metadata: Json
          method: string | null
          mollie_payment_id: string | null
          organization_id: string
          status: string | null
        }
        Insert: {
          amount_cents?: number | null
          created_at?: string
          event_type: string
          id?: string
          invoice_id: string
          metadata?: Json
          method?: string | null
          mollie_payment_id?: string | null
          organization_id: string
          status?: string | null
        }
        Update: {
          amount_cents?: number | null
          created_at?: string
          event_type?: string
          id?: string
          invoice_id?: string
          metadata?: Json
          method?: string | null
          mollie_payment_id?: string | null
          organization_id?: string
          status?: string | null
        }
        Relationships: [
          {
            foreignKeyName: "invoice_payment_events_invoice_id_fkey"
            columns: ["invoice_id"]
            isOneToOne: false
            referencedRelation: "invoices"
            referencedColumns: ["id"]
          },
        ]
      }
      invoices: {
        Row: {
          amount: number
          client_id: string | null
          client_name: string | null
          contract_id: string | null
          created_at: string
          currency: string
          due_date: string
          external_id: string | null
          external_source: string | null
          external_url: string | null
          id: string
          invoice_number: string
          issue_date: string
          last_emailed_at: string | null
          mollie_checkout_url: string | null
          mollie_payment_id: string | null
          organization_id: string
          paid_at: string | null
          payment_link_url: string | null
          pdf_filename: string | null
          preferred_payment_method: string | null
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
          contract_id?: string | null
          created_at?: string
          currency?: string
          due_date?: string
          external_id?: string | null
          external_source?: string | null
          external_url?: string | null
          id?: string
          invoice_number: string
          issue_date?: string
          last_emailed_at?: string | null
          mollie_checkout_url?: string | null
          mollie_payment_id?: string | null
          organization_id: string
          paid_at?: string | null
          payment_link_url?: string | null
          pdf_filename?: string | null
          preferred_payment_method?: string | null
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
          contract_id?: string | null
          created_at?: string
          currency?: string
          due_date?: string
          external_id?: string | null
          external_source?: string | null
          external_url?: string | null
          id?: string
          invoice_number?: string
          issue_date?: string
          last_emailed_at?: string | null
          mollie_checkout_url?: string | null
          mollie_payment_id?: string | null
          organization_id?: string
          paid_at?: string | null
          payment_link_url?: string | null
          pdf_filename?: string | null
          preferred_payment_method?: string | null
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
          converted_client_id: string | null
          converted_contract_id: string | null
          converted_project_id: string | null
          created_at: string
          created_by: string | null
          email: string | null
          external_id: string | null
          external_source: string | null
          external_url: string | null
          id: string
          last_contact_at: string | null
          lost_reason: string | null
          name: string
          notes: string | null
          organization_id: string
          phone: string | null
          position: number
          potential_monthly_value: number
          quote_id: string | null
          rep: string | null
          source: string | null
          stage: Database["public"]["Enums"]["lead_stage"]
          target_start_date: string | null
          updated_at: string
          value: number
          won_at: string | null
        }
        Insert: {
          company?: string | null
          converted_client_id?: string | null
          converted_contract_id?: string | null
          converted_project_id?: string | null
          created_at?: string
          created_by?: string | null
          email?: string | null
          external_id?: string | null
          external_source?: string | null
          external_url?: string | null
          id?: string
          last_contact_at?: string | null
          lost_reason?: string | null
          name: string
          notes?: string | null
          organization_id: string
          phone?: string | null
          position?: number
          potential_monthly_value?: number
          quote_id?: string | null
          rep?: string | null
          source?: string | null
          stage?: Database["public"]["Enums"]["lead_stage"]
          target_start_date?: string | null
          updated_at?: string
          value?: number
          won_at?: string | null
        }
        Update: {
          company?: string | null
          converted_client_id?: string | null
          converted_contract_id?: string | null
          converted_project_id?: string | null
          created_at?: string
          created_by?: string | null
          email?: string | null
          external_id?: string | null
          external_source?: string | null
          external_url?: string | null
          id?: string
          last_contact_at?: string | null
          lost_reason?: string | null
          name?: string
          notes?: string | null
          organization_id?: string
          phone?: string | null
          position?: number
          potential_monthly_value?: number
          quote_id?: string | null
          rep?: string | null
          source?: string | null
          stage?: Database["public"]["Enums"]["lead_stage"]
          target_start_date?: string | null
          updated_at?: string
          value?: number
          won_at?: string | null
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
      mail_messages: {
        Row: {
          attachments: Json
          bcc_emails: string[]
          body_html: string | null
          body_text: string | null
          bounce_reason: string | null
          bounce_type: string | null
          bounced_at: string | null
          cc_emails: string[]
          client_id: string | null
          complained_at: string | null
          created_at: string
          created_by: string | null
          delivered_at: string | null
          error: string | null
          folder: string
          from_email: string | null
          from_name: string | null
          id: string
          in_reply_to: string | null
          lead_id: string | null
          message_id: string | null
          organization_id: string
          provider_message_id: string | null
          read_at: string | null
          received_at: string | null
          sent_at: string | null
          status: string
          subject: string | null
          thread_id: string | null
          to_emails: string[]
          updated_at: string
        }
        Insert: {
          attachments?: Json
          bcc_emails?: string[]
          body_html?: string | null
          body_text?: string | null
          bounce_reason?: string | null
          bounce_type?: string | null
          bounced_at?: string | null
          cc_emails?: string[]
          client_id?: string | null
          complained_at?: string | null
          created_at?: string
          created_by?: string | null
          delivered_at?: string | null
          error?: string | null
          folder?: string
          from_email?: string | null
          from_name?: string | null
          id?: string
          in_reply_to?: string | null
          lead_id?: string | null
          message_id?: string | null
          organization_id: string
          provider_message_id?: string | null
          read_at?: string | null
          received_at?: string | null
          sent_at?: string | null
          status?: string
          subject?: string | null
          thread_id?: string | null
          to_emails?: string[]
          updated_at?: string
        }
        Update: {
          attachments?: Json
          bcc_emails?: string[]
          body_html?: string | null
          body_text?: string | null
          bounce_reason?: string | null
          bounce_type?: string | null
          bounced_at?: string | null
          cc_emails?: string[]
          client_id?: string | null
          complained_at?: string | null
          created_at?: string
          created_by?: string | null
          delivered_at?: string | null
          error?: string | null
          folder?: string
          from_email?: string | null
          from_name?: string | null
          id?: string
          in_reply_to?: string | null
          lead_id?: string | null
          message_id?: string | null
          organization_id?: string
          provider_message_id?: string | null
          read_at?: string | null
          received_at?: string | null
          sent_at?: string | null
          status?: string
          subject?: string | null
          thread_id?: string | null
          to_emails?: string[]
          updated_at?: string
        }
        Relationships: [
          {
            foreignKeyName: "mail_messages_client_id_fkey"
            columns: ["client_id"]
            isOneToOne: false
            referencedRelation: "clients"
            referencedColumns: ["id"]
          },
          {
            foreignKeyName: "mail_messages_lead_id_fkey"
            columns: ["lead_id"]
            isOneToOne: false
            referencedRelation: "leads"
            referencedColumns: ["id"]
          },
          {
            foreignKeyName: "mail_messages_organization_id_fkey"
            columns: ["organization_id"]
            isOneToOne: false
            referencedRelation: "organizations"
            referencedColumns: ["id"]
          },
        ]
      }
      mail_settings: {
        Row: {
          created_at: string
          default_email_template_id: string | null
          default_linkedin_template_id: string | null
          default_whatsapp_template_id: string | null
          from_email: string | null
          from_name: string | null
          invite_body: string | null
          invite_subject: string | null
          organization_id: string
          reply_to: string | null
          signature: string | null
          updated_at: string
        }
        Insert: {
          created_at?: string
          default_email_template_id?: string | null
          default_linkedin_template_id?: string | null
          default_whatsapp_template_id?: string | null
          from_email?: string | null
          from_name?: string | null
          invite_body?: string | null
          invite_subject?: string | null
          organization_id: string
          reply_to?: string | null
          signature?: string | null
          updated_at?: string
        }
        Update: {
          created_at?: string
          default_email_template_id?: string | null
          default_linkedin_template_id?: string | null
          default_whatsapp_template_id?: string | null
          from_email?: string | null
          from_name?: string | null
          invite_body?: string | null
          invite_subject?: string | null
          organization_id?: string
          reply_to?: string | null
          signature?: string | null
          updated_at?: string
        }
        Relationships: [
          {
            foreignKeyName: "mail_settings_default_email_template_id_fkey"
            columns: ["default_email_template_id"]
            isOneToOne: false
            referencedRelation: "outreach_message_templates"
            referencedColumns: ["id"]
          },
          {
            foreignKeyName: "mail_settings_default_linkedin_template_id_fkey"
            columns: ["default_linkedin_template_id"]
            isOneToOne: false
            referencedRelation: "outreach_message_templates"
            referencedColumns: ["id"]
          },
          {
            foreignKeyName: "mail_settings_default_whatsapp_template_id_fkey"
            columns: ["default_whatsapp_template_id"]
            isOneToOne: false
            referencedRelation: "outreach_message_templates"
            referencedColumns: ["id"]
          },
          {
            foreignKeyName: "mail_settings_organization_id_fkey"
            columns: ["organization_id"]
            isOneToOne: true
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
          account_holder: string | null
          address_line1: string | null
          address_line2: string | null
          bic: string | null
          brand_accent_color: string | null
          brand_color: string | null
          brand_custom_domain: string | null
          brand_font: string | null
          brand_logo_url: string | null
          brand_primary_color: string | null
          city: string | null
          country: string | null
          created_at: string
          email: string | null
          iban: string | null
          id: string
          invoice_prefix: string
          kvk_number: string | null
          logo_url: string | null
          name: string
          next_invoice_seq: number
          phone: string | null
          postal_code: string | null
          slug: string
          tax_number: string | null
          updated_at: string
          website: string | null
        }
        Insert: {
          account_holder?: string | null
          address_line1?: string | null
          address_line2?: string | null
          bic?: string | null
          brand_accent_color?: string | null
          brand_color?: string | null
          brand_custom_domain?: string | null
          brand_font?: string | null
          brand_logo_url?: string | null
          brand_primary_color?: string | null
          city?: string | null
          country?: string | null
          created_at?: string
          email?: string | null
          iban?: string | null
          id?: string
          invoice_prefix: string
          kvk_number?: string | null
          logo_url?: string | null
          name: string
          next_invoice_seq?: number
          phone?: string | null
          postal_code?: string | null
          slug: string
          tax_number?: string | null
          updated_at?: string
          website?: string | null
        }
        Update: {
          account_holder?: string | null
          address_line1?: string | null
          address_line2?: string | null
          bic?: string | null
          brand_accent_color?: string | null
          brand_color?: string | null
          brand_custom_domain?: string | null
          brand_font?: string | null
          brand_logo_url?: string | null
          brand_primary_color?: string | null
          city?: string | null
          country?: string | null
          created_at?: string
          email?: string | null
          iban?: string | null
          id?: string
          invoice_prefix?: string
          kvk_number?: string | null
          logo_url?: string | null
          name?: string
          next_invoice_seq?: number
          phone?: string | null
          postal_code?: string | null
          slug?: string
          tax_number?: string | null
          updated_at?: string
          website?: string | null
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
          province: string | null
          send_window_end: number | null
          send_window_start: number | null
          sequence_steps: Json
          status: string
          timezone: string | null
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
          province?: string | null
          send_window_end?: number | null
          send_window_start?: number | null
          sequence_steps?: Json
          status?: string
          timezone?: string | null
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
          province?: string | null
          send_window_end?: number | null
          send_window_start?: number | null
          sequence_steps?: Json
          status?: string
          timezone?: string | null
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
      outreach_message_templates: {
        Row: {
          body: string
          channel: string
          created_at: string
          created_by: string | null
          description: string | null
          id: string
          is_default: boolean
          name: string
          organization_id: string
          subject: string | null
          updated_at: string
        }
        Insert: {
          body: string
          channel: string
          created_at?: string
          created_by?: string | null
          description?: string | null
          id?: string
          is_default?: boolean
          name: string
          organization_id: string
          subject?: string | null
          updated_at?: string
        }
        Update: {
          body?: string
          channel?: string
          created_at?: string
          created_by?: string | null
          description?: string | null
          id?: string
          is_default?: boolean
          name?: string
          organization_id?: string
          subject?: string | null
          updated_at?: string
        }
        Relationships: [
          {
            foreignKeyName: "outreach_message_templates_organization_id_fkey"
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
          clicked_at: string | null
          created_at: string
          direction: string
          error: string | null
          handled_at: string | null
          handled_by: string | null
          id: string
          opened_at: string | null
          organization_id: string
          provider_message_id: string | null
          read_at: string | null
          received_at: string | null
          reply_classification: string | null
          sent_at: string | null
          sentiment: string | null
          snooze_until: string | null
          status: string
          step_index: number | null
          subject: string | null
          target_id: string
          updated_at: string
          variant_id: string | null
        }
        Insert: {
          body?: string | null
          campaign_id?: string | null
          channel?: string
          clicked_at?: string | null
          created_at?: string
          direction?: string
          error?: string | null
          handled_at?: string | null
          handled_by?: string | null
          id?: string
          opened_at?: string | null
          organization_id: string
          provider_message_id?: string | null
          read_at?: string | null
          received_at?: string | null
          reply_classification?: string | null
          sent_at?: string | null
          sentiment?: string | null
          snooze_until?: string | null
          status?: string
          step_index?: number | null
          subject?: string | null
          target_id: string
          updated_at?: string
          variant_id?: string | null
        }
        Update: {
          body?: string | null
          campaign_id?: string | null
          channel?: string
          clicked_at?: string | null
          created_at?: string
          direction?: string
          error?: string | null
          handled_at?: string | null
          handled_by?: string | null
          id?: string
          opened_at?: string | null
          organization_id?: string
          provider_message_id?: string | null
          read_at?: string | null
          received_at?: string | null
          reply_classification?: string | null
          sent_at?: string | null
          sentiment?: string | null
          snooze_until?: string | null
          status?: string
          step_index?: number | null
          subject?: string | null
          target_id?: string
          updated_at?: string
          variant_id?: string | null
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
          active_variant_id: string | null
          campaign_id: string | null
          company: string
          contact_name: string | null
          created_at: string
          created_by: string | null
          demo_at: string | null
          demo_type: string | null
          email: string | null
          id: string
          last_contact_at: string | null
          last_message_at: string | null
          linkedin_url: string | null
          next_send_at: string | null
          notes: string | null
          organization_id: string
          paused: boolean
          personalized_at: string | null
          personalized_body: string | null
          personalized_subject: string | null
          phone: string | null
          pitch_variant_id: string | null
          province: string | null
          reply_classification: string | null
          research_at: string | null
          research_summary: string | null
          sequence_step_index: number
          stage: string
          updated_at: string
        }
        Insert: {
          active_variant_id?: string | null
          campaign_id?: string | null
          company: string
          contact_name?: string | null
          created_at?: string
          created_by?: string | null
          demo_at?: string | null
          demo_type?: string | null
          email?: string | null
          id?: string
          last_contact_at?: string | null
          last_message_at?: string | null
          linkedin_url?: string | null
          next_send_at?: string | null
          notes?: string | null
          organization_id: string
          paused?: boolean
          personalized_at?: string | null
          personalized_body?: string | null
          personalized_subject?: string | null
          phone?: string | null
          pitch_variant_id?: string | null
          province?: string | null
          reply_classification?: string | null
          research_at?: string | null
          research_summary?: string | null
          sequence_step_index?: number
          stage?: string
          updated_at?: string
        }
        Update: {
          active_variant_id?: string | null
          campaign_id?: string | null
          company?: string
          contact_name?: string | null
          created_at?: string
          created_by?: string | null
          demo_at?: string | null
          demo_type?: string | null
          email?: string | null
          id?: string
          last_contact_at?: string | null
          last_message_at?: string | null
          linkedin_url?: string | null
          next_send_at?: string | null
          notes?: string | null
          organization_id?: string
          paused?: boolean
          personalized_at?: string | null
          personalized_body?: string | null
          personalized_subject?: string | null
          phone?: string | null
          pitch_variant_id?: string | null
          province?: string | null
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
      outreach_template_versions: {
        Row: {
          body: string
          created_at: string
          created_by: string | null
          description: string | null
          id: string
          name: string
          organization_id: string
          subject: string | null
          template_id: string
          version: number
        }
        Insert: {
          body: string
          created_at?: string
          created_by?: string | null
          description?: string | null
          id?: string
          name: string
          organization_id: string
          subject?: string | null
          template_id: string
          version: number
        }
        Update: {
          body?: string
          created_at?: string
          created_by?: string | null
          description?: string | null
          id?: string
          name?: string
          organization_id?: string
          subject?: string | null
          template_id?: string
          version?: number
        }
        Relationships: [
          {
            foreignKeyName: "outreach_template_versions_organization_id_fkey"
            columns: ["organization_id"]
            isOneToOne: false
            referencedRelation: "organizations"
            referencedColumns: ["id"]
          },
          {
            foreignKeyName: "outreach_template_versions_template_id_fkey"
            columns: ["template_id"]
            isOneToOne: false
            referencedRelation: "outreach_message_templates"
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
          default_solution_type: string | null
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
          default_solution_type?: string | null
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
          default_solution_type?: string | null
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
      project_delivery_status_history: {
        Row: {
          changed_at: string
          changed_by: string | null
          id: string
          new_status: Database["public"]["Enums"]["project_delivery_status"]
          old_status:
            | Database["public"]["Enums"]["project_delivery_status"]
            | null
          organization_id: string
          project_id: string
        }
        Insert: {
          changed_at?: string
          changed_by?: string | null
          id?: string
          new_status: Database["public"]["Enums"]["project_delivery_status"]
          old_status?:
            | Database["public"]["Enums"]["project_delivery_status"]
            | null
          organization_id: string
          project_id: string
        }
        Update: {
          changed_at?: string
          changed_by?: string | null
          id?: string
          new_status?: Database["public"]["Enums"]["project_delivery_status"]
          old_status?:
            | Database["public"]["Enums"]["project_delivery_status"]
            | null
          organization_id?: string
          project_id?: string
        }
        Relationships: [
          {
            foreignKeyName: "project_delivery_status_history_organization_id_fkey"
            columns: ["organization_id"]
            isOneToOne: false
            referencedRelation: "organizations"
            referencedColumns: ["id"]
          },
          {
            foreignKeyName: "project_delivery_status_history_project_id_fkey"
            columns: ["project_id"]
            isOneToOne: false
            referencedRelation: "projects"
            referencedColumns: ["id"]
          },
        ]
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
          delivery_status: Database["public"]["Enums"]["project_delivery_status"]
          id: string
          last_modified_at: string
          last_modified_by: string | null
          monthly_value_cents: number
          name: string
          notes: string | null
          one_time_cents: number
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
          delivery_status?: Database["public"]["Enums"]["project_delivery_status"]
          id?: string
          last_modified_at?: string
          last_modified_by?: string | null
          monthly_value_cents?: number
          name: string
          notes?: string | null
          one_time_cents?: number
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
          delivery_status?: Database["public"]["Enums"]["project_delivery_status"]
          id?: string
          last_modified_at?: string
          last_modified_by?: string | null
          monthly_value_cents?: number
          name?: string
          notes?: string | null
          one_time_cents?: number
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
      quote_comments: {
        Row: {
          author_id: string | null
          body: string
          created_at: string
          id: string
          mentions: string[]
          organization_id: string
          quote_id: string
          resolved: boolean
          updated_at: string
        }
        Insert: {
          author_id?: string | null
          body: string
          created_at?: string
          id?: string
          mentions?: string[]
          organization_id: string
          quote_id: string
          resolved?: boolean
          updated_at?: string
        }
        Update: {
          author_id?: string | null
          body?: string
          created_at?: string
          id?: string
          mentions?: string[]
          organization_id?: string
          quote_id?: string
          resolved?: boolean
          updated_at?: string
        }
        Relationships: [
          {
            foreignKeyName: "quote_comments_organization_id_fkey"
            columns: ["organization_id"]
            isOneToOne: false
            referencedRelation: "organizations"
            referencedColumns: ["id"]
          },
          {
            foreignKeyName: "quote_comments_quote_id_fkey"
            columns: ["quote_id"]
            isOneToOne: false
            referencedRelation: "quotes"
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
          packages: Json
          preview_token: string | null
          preview_token_expires_at: string | null
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
          packages?: Json
          preview_token?: string | null
          preview_token_expires_at?: string | null
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
          packages?: Json
          preview_token?: string | null
          preview_token_expires_at?: string | null
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
          accepted_at: string | null
          accepted_by_name: string | null
          accepted_ip: string | null
          client_email: string | null
          client_id: string | null
          content_json: Json
          created_at: string
          created_by: string | null
          external_id: string | null
          external_source: string | null
          external_url: string | null
          followup_after_days: number
          followup_count: number
          followup_enabled: boolean
          id: string
          intro_message: string | null
          intro_video_url: string | null
          last_followup_at: string | null
          last_viewed_at: string | null
          lead_id: string | null
          mollie_checkout_url: string | null
          mollie_payment_id: string | null
          notify_email: string | null
          organization_id: string
          paid_at: string | null
          payer_company: string | null
          payer_email: string | null
          payer_kvk: string | null
          payer_vat: string | null
          public_token: string
          revoked_at: string | null
          revoked_by: string | null
          sent_at: string | null
          signature_svg: string | null
          signed_at: string | null
          status: Database["public"]["Enums"]["quote_status"]
          terms_accepted_at: string | null
          title: string
          total_amount: number
          updated_at: string
          view_count: number
        }
        Insert: {
          accepted_at?: string | null
          accepted_by_name?: string | null
          accepted_ip?: string | null
          client_email?: string | null
          client_id?: string | null
          content_json?: Json
          created_at?: string
          created_by?: string | null
          external_id?: string | null
          external_source?: string | null
          external_url?: string | null
          followup_after_days?: number
          followup_count?: number
          followup_enabled?: boolean
          id?: string
          intro_message?: string | null
          intro_video_url?: string | null
          last_followup_at?: string | null
          last_viewed_at?: string | null
          lead_id?: string | null
          mollie_checkout_url?: string | null
          mollie_payment_id?: string | null
          notify_email?: string | null
          organization_id: string
          paid_at?: string | null
          payer_company?: string | null
          payer_email?: string | null
          payer_kvk?: string | null
          payer_vat?: string | null
          public_token?: string
          revoked_at?: string | null
          revoked_by?: string | null
          sent_at?: string | null
          signature_svg?: string | null
          signed_at?: string | null
          status?: Database["public"]["Enums"]["quote_status"]
          terms_accepted_at?: string | null
          title: string
          total_amount?: number
          updated_at?: string
          view_count?: number
        }
        Update: {
          accepted_at?: string | null
          accepted_by_name?: string | null
          accepted_ip?: string | null
          client_email?: string | null
          client_id?: string | null
          content_json?: Json
          created_at?: string
          created_by?: string | null
          external_id?: string | null
          external_source?: string | null
          external_url?: string | null
          followup_after_days?: number
          followup_count?: number
          followup_enabled?: boolean
          id?: string
          intro_message?: string | null
          intro_video_url?: string | null
          last_followup_at?: string | null
          last_viewed_at?: string | null
          lead_id?: string | null
          mollie_checkout_url?: string | null
          mollie_payment_id?: string | null
          notify_email?: string | null
          organization_id?: string
          paid_at?: string | null
          payer_company?: string | null
          payer_email?: string | null
          payer_kvk?: string | null
          payer_vat?: string | null
          public_token?: string
          revoked_at?: string | null
          revoked_by?: string | null
          sent_at?: string | null
          signature_svg?: string | null
          signed_at?: string | null
          status?: Database["public"]["Enums"]["quote_status"]
          terms_accepted_at?: string | null
          title?: string
          total_amount?: number
          updated_at?: string
          view_count?: number
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
      recurring_invoice_runs: {
        Row: {
          contract_id: string
          created_at: string
          error: string | null
          id: string
          invoice_id: string | null
          organization_id: string
          period_end: string
          period_start: string
          status: string
        }
        Insert: {
          contract_id: string
          created_at?: string
          error?: string | null
          id?: string
          invoice_id?: string | null
          organization_id: string
          period_end: string
          period_start: string
          status: string
        }
        Update: {
          contract_id?: string
          created_at?: string
          error?: string | null
          id?: string
          invoice_id?: string | null
          organization_id?: string
          period_end?: string
          period_start?: string
          status?: string
        }
        Relationships: [
          {
            foreignKeyName: "recurring_invoice_runs_contract_id_fkey"
            columns: ["contract_id"]
            isOneToOne: false
            referencedRelation: "contracts"
            referencedColumns: ["id"]
          },
          {
            foreignKeyName: "recurring_invoice_runs_invoice_id_fkey"
            columns: ["invoice_id"]
            isOneToOne: false
            referencedRelation: "invoices"
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
          ai_winloss: Json | null
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
          outcome: string | null
          outcome_at: string | null
          outcome_reason: string | null
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
          win_probability: number | null
        }
        Insert: {
          accepted_at?: string | null
          accepted_by_name?: string | null
          accepted_signature?: string | null
          ai_brief?: string | null
          ai_winloss?: Json | null
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
          outcome?: string | null
          outcome_at?: string | null
          outcome_reason?: string | null
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
          win_probability?: number | null
        }
        Update: {
          accepted_at?: string | null
          accepted_by_name?: string | null
          accepted_signature?: string | null
          ai_brief?: string | null
          ai_winloss?: Json | null
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
          outcome?: string | null
          outcome_at?: string | null
          outcome_reason?: string | null
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
          win_probability?: number | null
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
      accept_quote_by_token: {
        Args: {
          _name: string
          _signature_svg: string
          _terms: boolean
          _token: string
        }
        Returns: string
      }
      convert_lead_to_customer: {
        Args: {
          _lead_id: string
          _monthly_cents: number
          _setup_cents: number
          _start_date: string
          _title: string
        }
        Returns: {
          out_client_id: string
          out_contract_id: string
          out_project_id: string
        }[]
      }
      create_customer_from_lead: {
        Args: {
          _lead_id: string
          _monthly_cents: number
          _setup_cents: number
          _start_date: string
          _title: string
        }
        Returns: {
          out_client_id: string
          out_contract_id: string
          out_project_id: string
        }[]
      }
      finalize_signed_quote: {
        Args: { _quote_id: string }
        Returns: {
          client_id: string
          contract_id: string
          invoice_id: string
        }[]
      }
      generate_recurring_invoices: {
        Args: { _only_contract_id?: string }
        Returns: {
          contract_id: string
          error: string
          invoice_id: string
          status: string
        }[]
      }
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
      seed_outreach_default_templates: {
        Args: { p_org_id: string }
        Returns: undefined
      }
      track_quote_view: { Args: { _token: string }; Returns: undefined }
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
      billing_frequency: "monthly" | "quarterly" | "yearly"
      contract_status: "draft" | "active" | "paused" | "cancelled" | "ended"
      discount_type: "none" | "one_time" | "recurring"
      invoice_line_type: "item" | "service_fee" | "discount" | "shipping"
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
      project_delivery_status:
        | "nieuw"
        | "in_uitvoering"
        | "wacht_op_klant"
        | "on_hold"
        | "opgeleverd"
        | "geannuleerd"
      project_status:
        | "contact_gezocht"
        | "afspraak_geboekt"
        | "offerte_verstuurd"
        | "contract_verstuurd"
        | "contract_getekend"
        | "on_hold"
      quote_event_type:
        | "viewed"
        | "signed"
        | "paid"
        | "invoice_created"
        | "converted"
        | "convert_error"
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
      billing_frequency: ["monthly", "quarterly", "yearly"],
      contract_status: ["draft", "active", "paused", "cancelled", "ended"],
      discount_type: ["none", "one_time", "recurring"],
      invoice_line_type: ["item", "service_fee", "discount", "shipping"],
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
      project_delivery_status: [
        "nieuw",
        "in_uitvoering",
        "wacht_op_klant",
        "on_hold",
        "opgeleverd",
        "geannuleerd",
      ],
      project_status: [
        "contact_gezocht",
        "afspraak_geboekt",
        "offerte_verstuurd",
        "contract_verstuurd",
        "contract_getekend",
        "on_hold",
      ],
      quote_event_type: [
        "viewed",
        "signed",
        "paid",
        "invoice_created",
        "converted",
        "convert_error",
      ],
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
