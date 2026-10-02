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
  budget: {
    Tables: {
      allocation_period_amounts: {
        Row: {
          allocation_request_id: string
          amount: number
          created_at: string | null
          id: string
          notes: string | null
          period_number: number
          updated_at: string | null
        }
        Insert: {
          allocation_request_id: string
          amount: number
          created_at?: string | null
          id?: string
          notes?: string | null
          period_number: number
          updated_at?: string | null
        }
        Update: {
          allocation_request_id?: string
          amount?: number
          created_at?: string | null
          id?: string
          notes?: string | null
          period_number?: number
          updated_at?: string | null
        }
        Relationships: [
          {
            foreignKeyName: "allocation_period_amounts_allocation_request_id_fkey"
            columns: ["allocation_request_id"]
            isOneToOne: false
            referencedRelation: "allocation_requests"
            referencedColumns: ["id"]
          },
        ]
      }
      allocation_request_history: {
        Row: {
          action: string
          actor_id: string
          actor_name: string
          created_at: string | null
          id: string
          new_status:
            | Database["budget"]["Enums"]["allocation_request_status"]
            | null
          notes: string | null
          old_status:
            | Database["budget"]["Enums"]["allocation_request_status"]
            | null
          request_id: string
        }
        Insert: {
          action: string
          actor_id: string
          actor_name: string
          created_at?: string | null
          id?: string
          new_status?:
            | Database["budget"]["Enums"]["allocation_request_status"]
            | null
          notes?: string | null
          old_status?:
            | Database["budget"]["Enums"]["allocation_request_status"]
            | null
          request_id: string
        }
        Update: {
          action?: string
          actor_id?: string
          actor_name?: string
          created_at?: string | null
          id?: string
          new_status?:
            | Database["budget"]["Enums"]["allocation_request_status"]
            | null
          notes?: string | null
          old_status?:
            | Database["budget"]["Enums"]["allocation_request_status"]
            | null
          request_id?: string
        }
        Relationships: [
          {
            foreignKeyName: "allocation_request_history_request_id_fkey"
            columns: ["request_id"]
            isOneToOne: false
            referencedRelation: "allocation_requests"
            referencedColumns: ["id"]
          },
        ]
      }
      allocation_requests: {
        Row: {
          admin_notes: string | null
          approved_amount: number | null
          budget_breakdown: Json | null
          created_at: string | null
          fiscal_year_id: string
          id: string
          justification: string
          ministry_id: string
          organization_id: string
          period_type: Database["budget"]["Enums"]["allocation_period_type"]
          requested_amount: number
          requester_id: string
          requester_name: string
          reviewed_at: string | null
          reviewed_by: string | null
          status: Database["budget"]["Enums"]["allocation_request_status"]
          updated_at: string | null
        }
        Insert: {
          admin_notes?: string | null
          approved_amount?: number | null
          budget_breakdown?: Json | null
          created_at?: string | null
          fiscal_year_id: string
          id?: string
          justification: string
          ministry_id: string
          organization_id: string
          period_type?: Database["budget"]["Enums"]["allocation_period_type"]
          requested_amount: number
          requester_id: string
          requester_name: string
          reviewed_at?: string | null
          reviewed_by?: string | null
          status?: Database["budget"]["Enums"]["allocation_request_status"]
          updated_at?: string | null
        }
        Update: {
          admin_notes?: string | null
          approved_amount?: number | null
          budget_breakdown?: Json | null
          created_at?: string | null
          fiscal_year_id?: string
          id?: string
          justification?: string
          ministry_id?: string
          organization_id?: string
          period_type?: Database["budget"]["Enums"]["allocation_period_type"]
          requested_amount?: number
          requester_id?: string
          requester_name?: string
          reviewed_at?: string | null
          reviewed_by?: string | null
          status?: Database["budget"]["Enums"]["allocation_request_status"]
          updated_at?: string | null
        }
        Relationships: [
          {
            foreignKeyName: "allocation_requests_fiscal_year_id_fkey"
            columns: ["fiscal_year_id"]
            isOneToOne: false
            referencedRelation: "fiscal_years"
            referencedColumns: ["id"]
          },
          {
            foreignKeyName: "allocation_requests_ministry_id_fkey"
            columns: ["ministry_id"]
            isOneToOne: false
            referencedRelation: "ministries"
            referencedColumns: ["id"]
          },
        ]
      }
      budget_allocations: {
        Row: {
          allocated_amount: number
          approved_at: string | null
          approved_by: string | null
          created_at: string
          fiscal_year_id: string
          id: string
          ministry_id: string
          notes: string | null
          organization_id: string
          updated_at: string
        }
        Insert: {
          allocated_amount?: number
          approved_at?: string | null
          approved_by?: string | null
          created_at?: string
          fiscal_year_id: string
          id?: string
          ministry_id: string
          notes?: string | null
          organization_id: string
          updated_at?: string
        }
        Update: {
          allocated_amount?: number
          approved_at?: string | null
          approved_by?: string | null
          created_at?: string
          fiscal_year_id?: string
          id?: string
          ministry_id?: string
          notes?: string | null
          organization_id?: string
          updated_at?: string
        }
        Relationships: [
          {
            foreignKeyName: "budget_allocations_fiscal_year_id_fkey"
            columns: ["fiscal_year_id"]
            isOneToOne: false
            referencedRelation: "fiscal_years"
            referencedColumns: ["id"]
          },
          {
            foreignKeyName: "budget_allocations_ministry_id_fkey"
            columns: ["ministry_id"]
            isOneToOne: false
            referencedRelation: "ministries"
            referencedColumns: ["id"]
          },
        ]
      }
      expense_history: {
        Row: {
          action: string
          actor_id: string
          actor_name: string
          created_at: string
          expense_request_id: string
          id: string
          new_status: Database["budget"]["Enums"]["expense_status"]
          notes: string | null
          previous_status: Database["budget"]["Enums"]["expense_status"] | null
        }
        Insert: {
          action: string
          actor_id: string
          actor_name: string
          created_at?: string
          expense_request_id: string
          id?: string
          new_status: Database["budget"]["Enums"]["expense_status"]
          notes?: string | null
          previous_status?: Database["budget"]["Enums"]["expense_status"] | null
        }
        Update: {
          action?: string
          actor_id?: string
          actor_name?: string
          created_at?: string
          expense_request_id?: string
          id?: string
          new_status?: Database["budget"]["Enums"]["expense_status"]
          notes?: string | null
          previous_status?: Database["budget"]["Enums"]["expense_status"] | null
        }
        Relationships: [
          {
            foreignKeyName: "expense_history_expense_request_id_fkey"
            columns: ["expense_request_id"]
            isOneToOne: false
            referencedRelation: "expense_requests"
            referencedColumns: ["id"]
          },
        ]
      }
      expense_requests: {
        Row: {
          amount: number
          attachments: Json | null
          created_at: string
          description: string | null
          finance_notes: string | null
          finance_processed_at: string | null
          finance_processor_id: string | null
          fiscal_year_id: string
          id: string
          is_advance_payment: boolean
          is_different_recipient: boolean
          leader_notes: string | null
          leader_reviewed_at: string | null
          leader_reviewer_id: string | null
          ministry_id: string
          organization_id: string
          payment_reference: string | null
          recipient_email: string | null
          recipient_name: string | null
          recipient_phone: string | null
          reimbursement_type: Database["budget"]["Enums"]["reimbursement_type"]
          requester_email: string | null
          requester_id: string
          requester_name: string
          requester_phone: string | null
          status: Database["budget"]["Enums"]["expense_status"]
          submitted_at: string | null
          tin: string | null
          title: string
          treasury_notes: string | null
          treasury_reviewed_at: string | null
          treasury_reviewer_id: string | null
          updated_at: string
        }
        Insert: {
          amount: number
          attachments?: Json | null
          created_at?: string
          description?: string | null
          finance_notes?: string | null
          finance_processed_at?: string | null
          finance_processor_id?: string | null
          fiscal_year_id: string
          id?: string
          is_advance_payment?: boolean
          is_different_recipient?: boolean
          leader_notes?: string | null
          leader_reviewed_at?: string | null
          leader_reviewer_id?: string | null
          ministry_id: string
          organization_id: string
          payment_reference?: string | null
          recipient_email?: string | null
          recipient_name?: string | null
          recipient_phone?: string | null
          reimbursement_type?: Database["budget"]["Enums"]["reimbursement_type"]
          requester_email?: string | null
          requester_id: string
          requester_name: string
          requester_phone?: string | null
          status?: Database["budget"]["Enums"]["expense_status"]
          submitted_at?: string | null
          tin?: string | null
          title: string
          treasury_notes?: string | null
          treasury_reviewed_at?: string | null
          treasury_reviewer_id?: string | null
          updated_at?: string
        }
        Update: {
          amount?: number
          attachments?: Json | null
          created_at?: string
          description?: string | null
          finance_notes?: string | null
          finance_processed_at?: string | null
          finance_processor_id?: string | null
          fiscal_year_id?: string
          id?: string
          is_advance_payment?: boolean
          is_different_recipient?: boolean
          leader_notes?: string | null
          leader_reviewed_at?: string | null
          leader_reviewer_id?: string | null
          ministry_id?: string
          organization_id?: string
          payment_reference?: string | null
          recipient_email?: string | null
          recipient_name?: string | null
          recipient_phone?: string | null
          reimbursement_type?: Database["budget"]["Enums"]["reimbursement_type"]
          requester_email?: string | null
          requester_id?: string
          requester_name?: string
          requester_phone?: string | null
          status?: Database["budget"]["Enums"]["expense_status"]
          submitted_at?: string | null
          tin?: string | null
          title?: string
          treasury_notes?: string | null
          treasury_reviewed_at?: string | null
          treasury_reviewer_id?: string | null
          updated_at?: string
        }
        Relationships: [
          {
            foreignKeyName: "expense_requests_fiscal_year_id_fkey"
            columns: ["fiscal_year_id"]
            isOneToOne: false
            referencedRelation: "fiscal_years"
            referencedColumns: ["id"]
          },
          {
            foreignKeyName: "expense_requests_ministry_id_fkey"
            columns: ["ministry_id"]
            isOneToOne: false
            referencedRelation: "ministries"
            referencedColumns: ["id"]
          },
        ]
      }
      fiscal_years: {
        Row: {
          created_at: string
          id: string
          is_active: boolean
          name: string
          organization_id: string
          updated_at: string
          year: number
        }
        Insert: {
          created_at?: string
          id?: string
          is_active?: boolean
          name: string
          organization_id: string
          updated_at?: string
          year: number
        }
        Update: {
          created_at?: string
          id?: string
          is_active?: boolean
          name?: string
          organization_id?: string
          updated_at?: string
          year?: number
        }
        Relationships: []
      }
      ministries: {
        Row: {
          created_at: string
          description: string | null
          id: string
          is_active: boolean
          is_serving_ministry: boolean
          leader_id: string | null
          name: string
          organization_id: string
          updated_at: string
        }
        Insert: {
          created_at?: string
          description?: string | null
          id?: string
          is_active?: boolean
          is_serving_ministry?: boolean
          leader_id?: string | null
          name: string
          organization_id: string
          updated_at?: string
        }
        Update: {
          created_at?: string
          description?: string | null
          id?: string
          is_active?: boolean
          is_serving_ministry?: boolean
          leader_id?: string | null
          name?: string
          organization_id?: string
          updated_at?: string
        }
        Relationships: []
      }
      ministry_flags: {
        Row: {
          created_at: string
          created_by: string
          created_by_name: string
          expense_request_id: string | null
          flag_type: Database["budget"]["Enums"]["ministry_flag_type"]
          id: string
          ministry_id: string
          notes: string | null
          organization_id: string
          resolution_notes: string | null
          resolved_at: string | null
          resolved_by: string | null
          resolved_by_name: string | null
          updated_at: string
        }
        Insert: {
          created_at?: string
          created_by: string
          created_by_name: string
          expense_request_id?: string | null
          flag_type: Database["budget"]["Enums"]["ministry_flag_type"]
          id?: string
          ministry_id: string
          notes?: string | null
          organization_id: string
          resolution_notes?: string | null
          resolved_at?: string | null
          resolved_by?: string | null
          resolved_by_name?: string | null
          updated_at?: string
        }
        Update: {
          created_at?: string
          created_by?: string
          created_by_name?: string
          expense_request_id?: string | null
          flag_type?: Database["budget"]["Enums"]["ministry_flag_type"]
          id?: string
          ministry_id?: string
          notes?: string | null
          organization_id?: string
          resolution_notes?: string | null
          resolved_at?: string | null
          resolved_by?: string | null
          resolved_by_name?: string | null
          updated_at?: string
        }
        Relationships: [
          {
            foreignKeyName: "ministry_flags_expense_request_id_fkey"
            columns: ["expense_request_id"]
            isOneToOne: false
            referencedRelation: "expense_requests"
            referencedColumns: ["id"]
          },
          {
            foreignKeyName: "ministry_flags_ministry_id_fkey"
            columns: ["ministry_id"]
            isOneToOne: false
            referencedRelation: "ministries"
            referencedColumns: ["id"]
          },
        ]
      }
    }
    Views: {
      [_ in never]: never
    }
    Functions: {
      ensure_next_fiscal_year: { Args: never; Returns: undefined }
      get_active_fiscal_year: {
        Args: { _organization_id: string }
        Returns: string
      }
      get_ministry_remaining_budget: {
        Args: { _fiscal_year_id: string; _ministry_id: string }
        Returns: number
      }
      get_ministry_total_spent: {
        Args: { _fiscal_year_id: string; _ministry_id: string }
        Returns: number
      }
      get_period_label: {
        Args: {
          p_period_number: number
          p_period_type: Database["budget"]["Enums"]["allocation_period_type"]
        }
        Returns: string
      }
      is_budget_manager: {
        Args: { _organization_id: string; _user_id: string }
        Returns: boolean
      }
      is_finance_user: {
        Args: { _organization_id: string; _user_id: string }
        Returns: boolean
      }
      is_ministry_blocked: { Args: { _ministry_id: string }; Returns: boolean }
      is_ministry_leader: {
        Args: { _ministry_id: string; _user_id: string }
        Returns: boolean
      }
      is_treasury_user: {
        Args: { _organization_id: string; _user_id: string }
        Returns: boolean
      }
    }
    Enums: {
      allocation_period_type: "annual" | "quarterly" | "monthly"
      allocation_request_status:
        | "draft"
        | "pending"
        | "approved"
        | "partially_approved"
        | "denied"
        | "cancelled"
      expense_status:
        | "draft"
        | "pending_leader"
        | "leader_approved"
        | "leader_denied"
        | "pending_treasury"
        | "treasury_approved"
        | "treasury_denied"
        | "pending_finance"
        | "completed"
        | "cancelled"
      ministry_flag_type: "missing_receipts" | "unreturned_funds"
      reimbursement_type: "zelle" | "check" | "ach" | "admin_online_purchase"
    }
    CompositeTypes: {
      [_ in never]: never
    }
  }
  church: {
    Tables: {
      check_in_audit: {
        Row: {
          action: string
          actor_auth_user_id: string | null
          actor_name: string | null
          batch_id: string | null
          check_in_id: string | null
          child_person_id: string | null
          created_at: string
          detail: Json | null
          id: string
          kids_session_id: string | null
          organization_id: string
          outcome: string
          room_id: string | null
          station_id: string | null
          volunteer_id: string | null
        }
        Insert: {
          action: string
          actor_auth_user_id?: string | null
          actor_name?: string | null
          batch_id?: string | null
          check_in_id?: string | null
          child_person_id?: string | null
          created_at?: string
          detail?: Json | null
          id?: string
          kids_session_id?: string | null
          organization_id: string
          outcome?: string
          room_id?: string | null
          station_id?: string | null
          volunteer_id?: string | null
        }
        Update: {
          action?: string
          actor_auth_user_id?: string | null
          actor_name?: string | null
          batch_id?: string | null
          check_in_id?: string | null
          child_person_id?: string | null
          created_at?: string
          detail?: Json | null
          id?: string
          kids_session_id?: string | null
          organization_id?: string
          outcome?: string
          room_id?: string | null
          station_id?: string | null
          volunteer_id?: string | null
        }
        Relationships: []
      }
      check_in_stations: {
        Row: {
          auth_user_id: string | null
          code: string
          created_at: string
          device_type: string
          id: string
          is_active: boolean
          last_seen_at: string | null
          location_note: string | null
          name: string
          organization_id: string
          updated_at: string
        }
        Insert: {
          auth_user_id?: string | null
          code: string
          created_at?: string
          device_type?: string
          id?: string
          is_active?: boolean
          last_seen_at?: string | null
          location_note?: string | null
          name: string
          organization_id: string
          updated_at?: string
        }
        Update: {
          auth_user_id?: string | null
          code?: string
          created_at?: string
          device_type?: string
          id?: string
          is_active?: boolean
          last_seen_at?: string | null
          location_note?: string | null
          name?: string
          organization_id?: string
          updated_at?: string
        }
        Relationships: []
      }
      claim_attempts: {
        Row: {
          action: string
          created_at: string
          id: number
          identifier: string
          ip: string | null
          outcome: string | null
        }
        Insert: {
          action: string
          created_at?: string
          id?: number
          identifier: string
          ip?: string | null
          outcome?: string | null
        }
        Update: {
          action?: string
          created_at?: string
          id?: number
          identifier?: string
          ip?: string | null
          outcome?: string | null
        }
        Relationships: []
      }
      consent_children: {
        Row: {
          child_dob_text: string | null
          child_grade_text: string | null
          child_name_at_signing: string
          child_person_id: string
          consent_signature_id: string
          created_at: string
          id: string
          medical_changed_at: string | null
          organization_id: string
          per_child_answers: Json
          resign_due_by: string | null
          resign_overdue_notified_at: string | null
          resign_reminded_at: string | null
          withdrawn_at: string | null
          withdrawn_by: string | null
          withdrawn_by_name: string | null
          withdrawn_reason: string | null
        }
        Insert: {
          child_dob_text?: string | null
          child_grade_text?: string | null
          child_name_at_signing: string
          child_person_id: string
          consent_signature_id: string
          created_at?: string
          id?: string
          medical_changed_at?: string | null
          organization_id: string
          per_child_answers?: Json
          resign_due_by?: string | null
          resign_overdue_notified_at?: string | null
          resign_reminded_at?: string | null
          withdrawn_at?: string | null
          withdrawn_by?: string | null
          withdrawn_by_name?: string | null
          withdrawn_reason?: string | null
        }
        Update: {
          child_dob_text?: string | null
          child_grade_text?: string | null
          child_name_at_signing?: string
          child_person_id?: string
          consent_signature_id?: string
          created_at?: string
          id?: string
          medical_changed_at?: string | null
          organization_id?: string
          per_child_answers?: Json
          resign_due_by?: string | null
          resign_overdue_notified_at?: string | null
          resign_reminded_at?: string | null
          withdrawn_at?: string | null
          withdrawn_by?: string | null
          withdrawn_by_name?: string | null
          withdrawn_reason?: string | null
        }
        Relationships: [
          {
            foreignKeyName: "consent_children_consent_signature_id_fkey"
            columns: ["consent_signature_id"]
            isOneToOne: false
            referencedRelation: "consent_signatures"
            referencedColumns: ["id"]
          },
          {
            foreignKeyName: "fk_consent_child_person"
            columns: ["child_person_id", "organization_id"]
            isOneToOne: false
            referencedRelation: "people"
            referencedColumns: ["id", "organization_id"]
          },
        ]
      }
      consent_documents: {
        Row: {
          body: Json
          body_sha256: string
          code: string
          created_at: string
          effective_from: string
          id: string
          organization_id: string
          published_by: string | null
          published_by_name: string
          required_acknowledgments: string[]
          retired_at: string | null
          title: string
          version: number
        }
        Insert: {
          body: Json
          body_sha256: string
          code: string
          created_at?: string
          effective_from: string
          id?: string
          organization_id: string
          published_by?: string | null
          published_by_name: string
          required_acknowledgments?: string[]
          retired_at?: string | null
          title: string
          version: number
        }
        Update: {
          body?: Json
          body_sha256?: string
          code?: string
          created_at?: string
          effective_from?: string
          id?: string
          organization_id?: string
          published_by?: string | null
          published_by_name?: string
          required_acknowledgments?: string[]
          retired_at?: string | null
          title?: string
          version?: number
        }
        Relationships: []
      }
      consent_signatures: {
        Row: {
          answers: Json
          client_ip_reported: string | null
          consent_document_id: string
          created_at: string
          document_code: string
          document_sha256: string
          document_version: number
          household_id: string | null
          id: string
          legal_hold: boolean
          organization_id: string
          pdf_attempts: number
          pdf_bytes: number | null
          pdf_error: string | null
          pdf_sha256: string | null
          pdf_storage_path: string | null
          reviewed_at: string | null
          reviewed_by: string | null
          reviewed_by_name: string | null
          revoked_at: string | null
          revoked_by: string | null
          revoked_by_name: string | null
          revoked_reason: string | null
          secondary_signed_at: string | null
          secondary_signer_person_id: string | null
          secondary_signer_printed_name: string | null
          signed_at: string
          signer_auth_user_id: string | null
          signer_person_id: string
          signer_printed_name: string
          signer_relationship: string | null
          source: string
          superseded_by_signature_id: string | null
          updated_at: string
          user_agent: string | null
          witness_name: string | null
          witness_station_id: string | null
          witness_volunteer_id: string | null
        }
        Insert: {
          answers?: Json
          client_ip_reported?: string | null
          consent_document_id: string
          created_at?: string
          document_code: string
          document_sha256: string
          document_version: number
          household_id?: string | null
          id?: string
          legal_hold?: boolean
          organization_id: string
          pdf_attempts?: number
          pdf_bytes?: number | null
          pdf_error?: string | null
          pdf_sha256?: string | null
          pdf_storage_path?: string | null
          reviewed_at?: string | null
          reviewed_by?: string | null
          reviewed_by_name?: string | null
          revoked_at?: string | null
          revoked_by?: string | null
          revoked_by_name?: string | null
          revoked_reason?: string | null
          secondary_signed_at?: string | null
          secondary_signer_person_id?: string | null
          secondary_signer_printed_name?: string | null
          signed_at?: string
          signer_auth_user_id?: string | null
          signer_person_id: string
          signer_printed_name: string
          signer_relationship?: string | null
          source: string
          superseded_by_signature_id?: string | null
          updated_at?: string
          user_agent?: string | null
          witness_name?: string | null
          witness_station_id?: string | null
          witness_volunteer_id?: string | null
        }
        Update: {
          answers?: Json
          client_ip_reported?: string | null
          consent_document_id?: string
          created_at?: string
          document_code?: string
          document_sha256?: string
          document_version?: number
          household_id?: string | null
          id?: string
          legal_hold?: boolean
          organization_id?: string
          pdf_attempts?: number
          pdf_bytes?: number | null
          pdf_error?: string | null
          pdf_sha256?: string | null
          pdf_storage_path?: string | null
          reviewed_at?: string | null
          reviewed_by?: string | null
          reviewed_by_name?: string | null
          revoked_at?: string | null
          revoked_by?: string | null
          revoked_by_name?: string | null
          revoked_reason?: string | null
          secondary_signed_at?: string | null
          secondary_signer_person_id?: string | null
          secondary_signer_printed_name?: string | null
          signed_at?: string
          signer_auth_user_id?: string | null
          signer_person_id?: string
          signer_printed_name?: string
          signer_relationship?: string | null
          source?: string
          superseded_by_signature_id?: string | null
          updated_at?: string
          user_agent?: string | null
          witness_name?: string | null
          witness_station_id?: string | null
          witness_volunteer_id?: string | null
        }
        Relationships: [
          {
            foreignKeyName: "consent_signatures_consent_document_id_fkey"
            columns: ["consent_document_id"]
            isOneToOne: false
            referencedRelation: "consent_documents"
            referencedColumns: ["id"]
          },
          {
            foreignKeyName: "consent_signatures_household_id_fkey"
            columns: ["household_id"]
            isOneToOne: false
            referencedRelation: "households"
            referencedColumns: ["id"]
          },
          {
            foreignKeyName: "consent_signatures_superseded_by_signature_id_fkey"
            columns: ["superseded_by_signature_id"]
            isOneToOne: false
            referencedRelation: "consent_signatures"
            referencedColumns: ["id"]
          },
          {
            foreignKeyName: "fk_consent_signature_signer"
            columns: ["signer_person_id", "organization_id"]
            isOneToOne: false
            referencedRelation: "people"
            referencedColumns: ["id", "organization_id"]
          },
        ]
      }
      crypto_config: {
        Row: {
          created_at: string
          id: boolean
          pickup_pepper: string
        }
        Insert: {
          created_at?: string
          id?: boolean
          pickup_pepper: string
        }
        Update: {
          created_at?: string
          id?: boolean
          pickup_pepper?: string
        }
        Relationships: []
      }
      donations: {
        Row: {
          amount_cents: number
          batch_id: string | null
          check_number: string | null
          created_at: string
          created_by: string | null
          created_by_name: string | null
          donor_email_raw: string | null
          donor_name_raw: string | null
          donor_phone_raw: string | null
          external_reference: string | null
          fee_cents: number
          fund_id: string
          household_id: string | null
          id: string
          is_tax_deductible: boolean
          method: string
          note: string | null
          organization_id: string
          person_id: string | null
          received_on: string
          refunded_at: string | null
          refunded_reason: string | null
          source: string
          updated_at: string
        }
        Insert: {
          amount_cents: number
          batch_id?: string | null
          check_number?: string | null
          created_at?: string
          created_by?: string | null
          created_by_name?: string | null
          donor_email_raw?: string | null
          donor_name_raw?: string | null
          donor_phone_raw?: string | null
          external_reference?: string | null
          fee_cents?: number
          fund_id: string
          household_id?: string | null
          id?: string
          is_tax_deductible?: boolean
          method: string
          note?: string | null
          organization_id: string
          person_id?: string | null
          received_on: string
          refunded_at?: string | null
          refunded_reason?: string | null
          source?: string
          updated_at?: string
        }
        Update: {
          amount_cents?: number
          batch_id?: string | null
          check_number?: string | null
          created_at?: string
          created_by?: string | null
          created_by_name?: string | null
          donor_email_raw?: string | null
          donor_name_raw?: string | null
          donor_phone_raw?: string | null
          external_reference?: string | null
          fee_cents?: number
          fund_id?: string
          household_id?: string | null
          id?: string
          is_tax_deductible?: boolean
          method?: string
          note?: string | null
          organization_id?: string
          person_id?: string | null
          received_on?: string
          refunded_at?: string | null
          refunded_reason?: string | null
          source?: string
          updated_at?: string
        }
        Relationships: [
          {
            foreignKeyName: "fk_donations_batch"
            columns: ["batch_id", "organization_id"]
            isOneToOne: false
            referencedRelation: "giving_batches"
            referencedColumns: ["id", "organization_id"]
          },
          {
            foreignKeyName: "fk_donations_fund"
            columns: ["fund_id", "organization_id"]
            isOneToOne: false
            referencedRelation: "giving_funds"
            referencedColumns: ["id", "organization_id"]
          },
          {
            foreignKeyName: "fk_donations_household"
            columns: ["household_id", "organization_id"]
            isOneToOne: false
            referencedRelation: "households"
            referencedColumns: ["id", "organization_id"]
          },
          {
            foreignKeyName: "fk_donations_person"
            columns: ["person_id", "organization_id"]
            isOneToOne: false
            referencedRelation: "people"
            referencedColumns: ["id", "organization_id"]
          },
        ]
      }
      giving_access_audit: {
        Row: {
          action: string
          actor_name: string | null
          auth_user_id: string | null
          created_at: string
          id: string
          organization_id: string
          row_count: number | null
          subject_household_id: string | null
          subject_person_id: string | null
          tax_year: number | null
        }
        Insert: {
          action: string
          actor_name?: string | null
          auth_user_id?: string | null
          created_at?: string
          id?: string
          organization_id: string
          row_count?: number | null
          subject_household_id?: string | null
          subject_person_id?: string | null
          tax_year?: number | null
        }
        Update: {
          action?: string
          actor_name?: string | null
          auth_user_id?: string | null
          created_at?: string
          id?: string
          organization_id?: string
          row_count?: number | null
          subject_household_id?: string | null
          subject_person_id?: string | null
          tax_year?: number | null
        }
        Relationships: [
          {
            foreignKeyName: "giving_access_audit_subject_household_id_fkey"
            columns: ["subject_household_id"]
            isOneToOne: false
            referencedRelation: "households"
            referencedColumns: ["id"]
          },
          {
            foreignKeyName: "giving_access_audit_subject_person_id_fkey"
            columns: ["subject_person_id"]
            isOneToOne: false
            referencedRelation: "people"
            referencedColumns: ["id"]
          },
        ]
      }
      giving_batches: {
        Row: {
          created_at: string
          created_by: string | null
          created_by_name: string | null
          expected_total_cents: number | null
          id: string
          name: string
          notes: string | null
          organization_id: string
          posted_at: string | null
          posted_by: string | null
          posted_by_name: string | null
          received_on: string
          source: string
          status: string
          updated_at: string
        }
        Insert: {
          created_at?: string
          created_by?: string | null
          created_by_name?: string | null
          expected_total_cents?: number | null
          id?: string
          name: string
          notes?: string | null
          organization_id: string
          posted_at?: string | null
          posted_by?: string | null
          posted_by_name?: string | null
          received_on?: string
          source: string
          status?: string
          updated_at?: string
        }
        Update: {
          created_at?: string
          created_by?: string | null
          created_by_name?: string | null
          expected_total_cents?: number | null
          id?: string
          name?: string
          notes?: string | null
          organization_id?: string
          posted_at?: string | null
          posted_by?: string | null
          posted_by_name?: string | null
          received_on?: string
          source?: string
          status?: string
          updated_at?: string
        }
        Relationships: []
      }
      giving_funds: {
        Row: {
          code: string
          created_at: string
          created_by: string | null
          created_by_name: string | null
          description: string | null
          id: string
          is_active: boolean
          is_tax_deductible: boolean
          name: string
          organization_id: string
          sort_order: number
          updated_at: string
        }
        Insert: {
          code: string
          created_at?: string
          created_by?: string | null
          created_by_name?: string | null
          description?: string | null
          id?: string
          is_active?: boolean
          is_tax_deductible?: boolean
          name: string
          organization_id: string
          sort_order?: number
          updated_at?: string
        }
        Update: {
          code?: string
          created_at?: string
          created_by?: string | null
          created_by_name?: string | null
          description?: string | null
          id?: string
          is_active?: boolean
          is_tax_deductible?: boolean
          name?: string
          organization_id?: string
          sort_order?: number
          updated_at?: string
        }
        Relationships: []
      }
      group_memberships: {
        Row: {
          created_at: string
          end_date: string | null
          group_id: string
          id: string
          notes: string | null
          organization_id: string
          person_id: string
          role_id: string
          start_date: string
          updated_at: string
        }
        Insert: {
          created_at?: string
          end_date?: string | null
          group_id: string
          id?: string
          notes?: string | null
          organization_id: string
          person_id: string
          role_id: string
          start_date?: string
          updated_at?: string
        }
        Update: {
          created_at?: string
          end_date?: string | null
          group_id?: string
          id?: string
          notes?: string | null
          organization_id?: string
          person_id?: string
          role_id?: string
          start_date?: string
          updated_at?: string
        }
        Relationships: [
          {
            foreignKeyName: "fk_group_memberships_group"
            columns: ["group_id", "organization_id"]
            isOneToOne: false
            referencedRelation: "groups"
            referencedColumns: ["id", "organization_id"]
          },
          {
            foreignKeyName: "fk_group_memberships_person"
            columns: ["person_id", "organization_id"]
            isOneToOne: false
            referencedRelation: "people"
            referencedColumns: ["id", "organization_id"]
          },
          {
            foreignKeyName: "group_memberships_role_id_fkey"
            columns: ["role_id"]
            isOneToOne: false
            referencedRelation: "ministry_roles"
            referencedColumns: ["id"]
          },
        ]
      }
      group_types: {
        Row: {
          code: string
          created_at: string
          display_name: string
          id: string
          is_active: boolean
          organization_id: string
          sort_order: number
          updated_at: string
        }
        Insert: {
          code: string
          created_at?: string
          display_name: string
          id?: string
          is_active?: boolean
          organization_id: string
          sort_order?: number
          updated_at?: string
        }
        Update: {
          code?: string
          created_at?: string
          display_name?: string
          id?: string
          is_active?: boolean
          organization_id?: string
          sort_order?: number
          updated_at?: string
        }
        Relationships: []
      }
      groups: {
        Row: {
          code: string | null
          created_at: string
          created_by: string | null
          created_by_name: string | null
          description: string | null
          group_type_id: string
          id: string
          is_active: boolean
          location: string | null
          meeting_day: string | null
          meeting_time: string | null
          ministry_id: string | null
          name: string
          organization_id: string
          room_id: string | null
          updated_at: string
        }
        Insert: {
          code?: string | null
          created_at?: string
          created_by?: string | null
          created_by_name?: string | null
          description?: string | null
          group_type_id: string
          id?: string
          is_active?: boolean
          location?: string | null
          meeting_day?: string | null
          meeting_time?: string | null
          ministry_id?: string | null
          name: string
          organization_id: string
          room_id?: string | null
          updated_at?: string
        }
        Update: {
          code?: string | null
          created_at?: string
          created_by?: string | null
          created_by_name?: string | null
          description?: string | null
          group_type_id?: string
          id?: string
          is_active?: boolean
          location?: string | null
          meeting_day?: string | null
          meeting_time?: string | null
          ministry_id?: string | null
          name?: string
          organization_id?: string
          room_id?: string | null
          updated_at?: string
        }
        Relationships: [
          {
            foreignKeyName: "groups_group_type_id_fkey"
            columns: ["group_type_id"]
            isOneToOne: false
            referencedRelation: "group_types"
            referencedColumns: ["id"]
          },
        ]
      }
      household_members: {
        Row: {
          created_at: string
          end_date: string | null
          household_id: string
          household_role: string
          id: string
          is_primary_contact: boolean
          is_primary_household: boolean
          organization_id: string
          person_id: string
          start_date: string
          updated_at: string
        }
        Insert: {
          created_at?: string
          end_date?: string | null
          household_id: string
          household_role?: string
          id?: string
          is_primary_contact?: boolean
          is_primary_household?: boolean
          organization_id: string
          person_id: string
          start_date?: string
          updated_at?: string
        }
        Update: {
          created_at?: string
          end_date?: string | null
          household_id?: string
          household_role?: string
          id?: string
          is_primary_contact?: boolean
          is_primary_household?: boolean
          organization_id?: string
          person_id?: string
          start_date?: string
          updated_at?: string
        }
        Relationships: [
          {
            foreignKeyName: "fk_household_members_household"
            columns: ["household_id", "organization_id"]
            isOneToOne: false
            referencedRelation: "households"
            referencedColumns: ["id", "organization_id"]
          },
          {
            foreignKeyName: "fk_household_members_person"
            columns: ["person_id", "organization_id"]
            isOneToOne: false
            referencedRelation: "people"
            referencedColumns: ["id", "organization_id"]
          },
        ]
      }
      households: {
        Row: {
          address_line1: string | null
          address_line2: string | null
          city: string | null
          country: string | null
          created_at: string
          created_by: string | null
          created_by_name: string | null
          id: string
          is_active: boolean
          name: string
          notes: string | null
          organization_id: string
          postal_code: string | null
          primary_phone: string | null
          state: string | null
          updated_at: string
        }
        Insert: {
          address_line1?: string | null
          address_line2?: string | null
          city?: string | null
          country?: string | null
          created_at?: string
          created_by?: string | null
          created_by_name?: string | null
          id?: string
          is_active?: boolean
          name: string
          notes?: string | null
          organization_id: string
          postal_code?: string | null
          primary_phone?: string | null
          state?: string | null
          updated_at?: string
        }
        Update: {
          address_line1?: string | null
          address_line2?: string | null
          city?: string | null
          country?: string | null
          created_at?: string
          created_by?: string | null
          created_by_name?: string | null
          id?: string
          is_active?: boolean
          name?: string
          notes?: string | null
          organization_id?: string
          postal_code?: string | null
          primary_phone?: string | null
          state?: string | null
          updated_at?: string
        }
        Relationships: []
      }
      import_batches: {
        Row: {
          column_mapping: Json
          committed_at: string | null
          created_at: string
          created_by: string | null
          created_by_name: string
          dry_run_at: string | null
          filename: string
          id: string
          organization_id: string
          row_count: number
          status: string
          summary: Json | null
          updated_at: string
        }
        Insert: {
          column_mapping?: Json
          committed_at?: string | null
          created_at?: string
          created_by?: string | null
          created_by_name: string
          dry_run_at?: string | null
          filename: string
          id?: string
          organization_id: string
          row_count?: number
          status?: string
          summary?: Json | null
          updated_at?: string
        }
        Update: {
          column_mapping?: Json
          committed_at?: string | null
          created_at?: string
          created_by?: string | null
          created_by_name?: string
          dry_run_at?: string | null
          filename?: string
          id?: string
          organization_id?: string
          row_count?: number
          status?: string
          summary?: Json | null
          updated_at?: string
        }
        Relationships: []
      }
      import_rows: {
        Row: {
          batch_id: string
          created_at: string
          created_person_id: string | null
          diff: Json | null
          errors: Json
          id: string
          include: boolean
          match_person_id: string | null
          match_reason: string | null
          organization_id: string
          parsed: Json
          raw: Json
          row_number: number
          status: string
        }
        Insert: {
          batch_id: string
          created_at?: string
          created_person_id?: string | null
          diff?: Json | null
          errors?: Json
          id?: string
          include?: boolean
          match_person_id?: string | null
          match_reason?: string | null
          organization_id: string
          parsed?: Json
          raw: Json
          row_number: number
          status?: string
        }
        Update: {
          batch_id?: string
          created_at?: string
          created_person_id?: string | null
          diff?: Json | null
          errors?: Json
          id?: string
          include?: boolean
          match_person_id?: string | null
          match_reason?: string | null
          organization_id?: string
          parsed?: Json
          raw?: Json
          row_number?: number
          status?: string
        }
        Relationships: [
          {
            foreignKeyName: "import_rows_batch_id_fkey"
            columns: ["batch_id"]
            isOneToOne: false
            referencedRelation: "import_batches"
            referencedColumns: ["id"]
          },
          {
            foreignKeyName: "import_rows_created_person_id_fkey"
            columns: ["created_person_id"]
            isOneToOne: false
            referencedRelation: "people"
            referencedColumns: ["id"]
          },
          {
            foreignKeyName: "import_rows_match_person_id_fkey"
            columns: ["match_person_id"]
            isOneToOne: false
            referencedRelation: "people"
            referencedColumns: ["id"]
          },
        ]
      }
      kids_age_bands: {
        Row: {
          code: string
          created_at: string
          display_name: string
          id: string
          is_active: boolean
          max_age_months: number
          min_age_months: number
          organization_id: string
          sort_order: number
          updated_at: string
        }
        Insert: {
          code: string
          created_at?: string
          display_name: string
          id?: string
          is_active?: boolean
          max_age_months: number
          min_age_months: number
          organization_id: string
          sort_order?: number
          updated_at?: string
        }
        Update: {
          code?: string
          created_at?: string
          display_name?: string
          id?: string
          is_active?: boolean
          max_age_months?: number
          min_age_months?: number
          organization_id?: string
          sort_order?: number
          updated_at?: string
        }
        Relationships: []
      }
      kids_check_in_batches: {
        Row: {
          client_batch_key: string | null
          created_at: string
          created_by_name: string
          created_by_station_id: string | null
          created_by_volunteer_id: string | null
          household_id: string | null
          id: string
          kids_session_id: string
          organization_id: string
          status: string
          updated_at: string
        }
        Insert: {
          client_batch_key?: string | null
          created_at?: string
          created_by_name: string
          created_by_station_id?: string | null
          created_by_volunteer_id?: string | null
          household_id?: string | null
          id?: string
          kids_session_id: string
          organization_id: string
          status?: string
          updated_at?: string
        }
        Update: {
          client_batch_key?: string | null
          created_at?: string
          created_by_name?: string
          created_by_station_id?: string | null
          created_by_volunteer_id?: string | null
          household_id?: string | null
          id?: string
          kids_session_id?: string
          organization_id?: string
          status?: string
          updated_at?: string
        }
        Relationships: [
          {
            foreignKeyName: "fk_kids_batches_household"
            columns: ["household_id", "organization_id"]
            isOneToOne: false
            referencedRelation: "households"
            referencedColumns: ["id", "organization_id"]
          },
          {
            foreignKeyName: "fk_kids_batches_session"
            columns: ["kids_session_id", "organization_id"]
            isOneToOne: false
            referencedRelation: "kids_sessions"
            referencedColumns: ["id", "organization_id"]
          },
          {
            foreignKeyName: "kids_check_in_batches_created_by_station_id_fkey"
            columns: ["created_by_station_id"]
            isOneToOne: false
            referencedRelation: "check_in_stations"
            referencedColumns: ["id"]
          },
          {
            foreignKeyName: "kids_check_in_batches_created_by_volunteer_id_fkey"
            columns: ["created_by_volunteer_id"]
            isOneToOne: false
            referencedRelation: "kids_volunteers"
            referencedColumns: ["id"]
          },
        ]
      }
      kids_check_in_holds: {
        Row: {
          child_person_id: string
          created_at: string
          expires_at: string
          id: string
          leaders_notified_at: string | null
          lifted_by: string | null
          lifted_by_name: string | null
          lifted_reason: string | null
          organization_id: string
          parent_notified_at: string | null
          raised_at: string
          raised_by: string | null
          raised_by_name: string
          reason: string
          serving_kids_session_id: string | null
          serving_session_date: string | null
          serving_started_at: string | null
          settled_at: string | null
          source: string
          source_late_pickup_id: string | null
          status: string
          updated_at: string
        }
        Insert: {
          child_person_id: string
          created_at?: string
          expires_at: string
          id?: string
          leaders_notified_at?: string | null
          lifted_by?: string | null
          lifted_by_name?: string | null
          lifted_reason?: string | null
          organization_id: string
          parent_notified_at?: string | null
          raised_at?: string
          raised_by?: string | null
          raised_by_name: string
          reason: string
          serving_kids_session_id?: string | null
          serving_session_date?: string | null
          serving_started_at?: string | null
          settled_at?: string | null
          source?: string
          source_late_pickup_id?: string | null
          status?: string
          updated_at?: string
        }
        Update: {
          child_person_id?: string
          created_at?: string
          expires_at?: string
          id?: string
          leaders_notified_at?: string | null
          lifted_by?: string | null
          lifted_by_name?: string | null
          lifted_reason?: string | null
          organization_id?: string
          parent_notified_at?: string | null
          raised_at?: string
          raised_by?: string | null
          raised_by_name?: string
          reason?: string
          serving_kids_session_id?: string | null
          serving_session_date?: string | null
          serving_started_at?: string | null
          settled_at?: string | null
          source?: string
          source_late_pickup_id?: string | null
          status?: string
          updated_at?: string
        }
        Relationships: [
          {
            foreignKeyName: "fk_kids_hold_child"
            columns: ["child_person_id", "organization_id"]
            isOneToOne: false
            referencedRelation: "people"
            referencedColumns: ["id", "organization_id"]
          },
          {
            foreignKeyName: "kids_check_in_holds_serving_kids_session_id_fkey"
            columns: ["serving_kids_session_id"]
            isOneToOne: false
            referencedRelation: "kids_sessions"
            referencedColumns: ["id"]
          },
          {
            foreignKeyName: "kids_check_in_holds_source_late_pickup_id_fkey"
            columns: ["source_late_pickup_id"]
            isOneToOne: false
            referencedRelation: "kids_late_pickups"
            referencedColumns: ["id"]
          },
        ]
      }
      kids_check_in_location_history: {
        Row: {
          changed_at: string
          changed_by_name: string
          changed_by_volunteer_id: string | null
          check_in_id: string
          from_room_id: string | null
          id: string
          organization_id: string
          reason: string | null
          to_room_id: string
        }
        Insert: {
          changed_at?: string
          changed_by_name: string
          changed_by_volunteer_id?: string | null
          check_in_id: string
          from_room_id?: string | null
          id?: string
          organization_id: string
          reason?: string | null
          to_room_id: string
        }
        Update: {
          changed_at?: string
          changed_by_name?: string
          changed_by_volunteer_id?: string | null
          check_in_id?: string
          from_room_id?: string | null
          id?: string
          organization_id?: string
          reason?: string | null
          to_room_id?: string
        }
        Relationships: [
          {
            foreignKeyName: "kids_check_in_location_history_changed_by_volunteer_id_fkey"
            columns: ["changed_by_volunteer_id"]
            isOneToOne: false
            referencedRelation: "kids_volunteers"
            referencedColumns: ["id"]
          },
          {
            foreignKeyName: "kids_check_in_location_history_check_in_id_fkey"
            columns: ["check_in_id"]
            isOneToOne: false
            referencedRelation: "kids_check_ins"
            referencedColumns: ["id"]
          },
        ]
      }
      kids_check_in_secrets: {
        Row: {
          attempts: number
          batch_id: string
          code_hash: string
          consumed_at: string | null
          created_at: string
          expires_at: string
          kids_session_id: string
          locked_until: string | null
          rotated_at: string
          token_hash: string
        }
        Insert: {
          attempts?: number
          batch_id: string
          code_hash: string
          consumed_at?: string | null
          created_at?: string
          expires_at: string
          kids_session_id: string
          locked_until?: string | null
          rotated_at?: string
          token_hash: string
        }
        Update: {
          attempts?: number
          batch_id?: string
          code_hash?: string
          consumed_at?: string | null
          created_at?: string
          expires_at?: string
          kids_session_id?: string
          locked_until?: string | null
          rotated_at?: string
          token_hash?: string
        }
        Relationships: [
          {
            foreignKeyName: "kids_check_in_secrets_batch_id_fkey"
            columns: ["batch_id"]
            isOneToOne: true
            referencedRelation: "kids_check_in_batches"
            referencedColumns: ["id"]
          },
        ]
      }
      kids_check_ins: {
        Row: {
          assignment_reason: string | null
          batch_id: string
          checked_in_at: string
          checked_in_by_name: string
          checked_in_by_station_id: string | null
          checked_in_by_volunteer_id: string | null
          checked_out_at: string | null
          checked_out_by_name: string | null
          checked_out_by_station_id: string | null
          checked_out_by_volunteer_id: string | null
          checkout_method: string | null
          child_person_id: string
          created_at: string
          dropped_off_by_person_id: string | null
          has_pickup_restriction: boolean
          household_id: string | null
          id: string
          kids_session_id: string
          label_age_band_code: string | null
          label_allergy_flag: boolean
          label_allergy_short: string | null
          label_child_name: string
          label_room_name: string | null
          label_special_needs_flag: boolean
          organization_id: string
          override_authorized_by_name: string | null
          override_authorized_by_volunteer_id: string | null
          override_reason: string | null
          override_verification: string | null
          picked_up_by_name: string | null
          picked_up_by_person_id: string | null
          room_id: string
          status: string
          tag_number: number
          today_note: string | null
          updated_at: string
        }
        Insert: {
          assignment_reason?: string | null
          batch_id: string
          checked_in_at?: string
          checked_in_by_name: string
          checked_in_by_station_id?: string | null
          checked_in_by_volunteer_id?: string | null
          checked_out_at?: string | null
          checked_out_by_name?: string | null
          checked_out_by_station_id?: string | null
          checked_out_by_volunteer_id?: string | null
          checkout_method?: string | null
          child_person_id: string
          created_at?: string
          dropped_off_by_person_id?: string | null
          has_pickup_restriction?: boolean
          household_id?: string | null
          id?: string
          kids_session_id: string
          label_age_band_code?: string | null
          label_allergy_flag?: boolean
          label_allergy_short?: string | null
          label_child_name: string
          label_room_name?: string | null
          label_special_needs_flag?: boolean
          organization_id: string
          override_authorized_by_name?: string | null
          override_authorized_by_volunteer_id?: string | null
          override_reason?: string | null
          override_verification?: string | null
          picked_up_by_name?: string | null
          picked_up_by_person_id?: string | null
          room_id: string
          status?: string
          tag_number: number
          today_note?: string | null
          updated_at?: string
        }
        Update: {
          assignment_reason?: string | null
          batch_id?: string
          checked_in_at?: string
          checked_in_by_name?: string
          checked_in_by_station_id?: string | null
          checked_in_by_volunteer_id?: string | null
          checked_out_at?: string | null
          checked_out_by_name?: string | null
          checked_out_by_station_id?: string | null
          checked_out_by_volunteer_id?: string | null
          checkout_method?: string | null
          child_person_id?: string
          created_at?: string
          dropped_off_by_person_id?: string | null
          has_pickup_restriction?: boolean
          household_id?: string | null
          id?: string
          kids_session_id?: string
          label_age_band_code?: string | null
          label_allergy_flag?: boolean
          label_allergy_short?: string | null
          label_child_name?: string
          label_room_name?: string | null
          label_special_needs_flag?: boolean
          organization_id?: string
          override_authorized_by_name?: string | null
          override_authorized_by_volunteer_id?: string | null
          override_reason?: string | null
          override_verification?: string | null
          picked_up_by_name?: string | null
          picked_up_by_person_id?: string | null
          room_id?: string
          status?: string
          tag_number?: number
          today_note?: string | null
          updated_at?: string
        }
        Relationships: [
          {
            foreignKeyName: "fk_kids_check_ins_child"
            columns: ["child_person_id", "organization_id"]
            isOneToOne: false
            referencedRelation: "people"
            referencedColumns: ["id", "organization_id"]
          },
          {
            foreignKeyName: "fk_kids_check_ins_picked_up_by"
            columns: ["picked_up_by_person_id"]
            isOneToOne: false
            referencedRelation: "people"
            referencedColumns: ["id"]
          },
          {
            foreignKeyName: "fk_kids_check_ins_session"
            columns: ["kids_session_id", "organization_id"]
            isOneToOne: false
            referencedRelation: "kids_sessions"
            referencedColumns: ["id", "organization_id"]
          },
          {
            foreignKeyName: "fk_kids_check_ins_session_room"
            columns: ["kids_session_id", "room_id"]
            isOneToOne: false
            referencedRelation: "kids_session_rooms"
            referencedColumns: ["kids_session_id", "room_id"]
          },
          {
            foreignKeyName: "kids_check_ins_batch_id_fkey"
            columns: ["batch_id"]
            isOneToOne: false
            referencedRelation: "kids_check_in_batches"
            referencedColumns: ["id"]
          },
          {
            foreignKeyName: "kids_check_ins_checked_in_by_station_id_fkey"
            columns: ["checked_in_by_station_id"]
            isOneToOne: false
            referencedRelation: "check_in_stations"
            referencedColumns: ["id"]
          },
          {
            foreignKeyName: "kids_check_ins_checked_in_by_volunteer_id_fkey"
            columns: ["checked_in_by_volunteer_id"]
            isOneToOne: false
            referencedRelation: "kids_volunteers"
            referencedColumns: ["id"]
          },
          {
            foreignKeyName: "kids_check_ins_checked_out_by_station_id_fkey"
            columns: ["checked_out_by_station_id"]
            isOneToOne: false
            referencedRelation: "check_in_stations"
            referencedColumns: ["id"]
          },
          {
            foreignKeyName: "kids_check_ins_checked_out_by_volunteer_id_fkey"
            columns: ["checked_out_by_volunteer_id"]
            isOneToOne: false
            referencedRelation: "kids_volunteers"
            referencedColumns: ["id"]
          },
          {
            foreignKeyName: "kids_check_ins_override_authorized_by_volunteer_id_fkey"
            columns: ["override_authorized_by_volunteer_id"]
            isOneToOne: false
            referencedRelation: "kids_volunteers"
            referencedColumns: ["id"]
          },
        ]
      }
      kids_child_room_preference: {
        Row: {
          child_person_id: string
          grade_sort_at_set: number | null
          organization_id: string
          room_id: string
          school_year_set: number
          set_at: string
          set_by: string | null
          set_by_name: string
        }
        Insert: {
          child_person_id: string
          grade_sort_at_set?: number | null
          organization_id: string
          room_id: string
          school_year_set: number
          set_at?: string
          set_by?: string | null
          set_by_name: string
        }
        Update: {
          child_person_id?: string
          grade_sort_at_set?: number | null
          organization_id?: string
          room_id?: string
          school_year_set?: number
          set_at?: string
          set_by?: string | null
          set_by_name?: string
        }
        Relationships: [
          {
            foreignKeyName: "fk_kids_room_pref_child"
            columns: ["child_person_id", "organization_id"]
            isOneToOne: false
            referencedRelation: "people"
            referencedColumns: ["id", "organization_id"]
          },
        ]
      }
      kids_classroom_teachers: {
        Row: {
          created_at: string
          created_by: string | null
          created_by_name: string | null
          effective_from: string
          effective_to: string | null
          id: string
          is_lead: boolean
          notes: string | null
          organization_id: string
          person_id: string
          role: string
          room_id: string
          updated_at: string
        }
        Insert: {
          created_at?: string
          created_by?: string | null
          created_by_name?: string | null
          effective_from?: string
          effective_to?: string | null
          id?: string
          is_lead?: boolean
          notes?: string | null
          organization_id: string
          person_id: string
          role?: string
          room_id: string
          updated_at?: string
        }
        Update: {
          created_at?: string
          created_by?: string | null
          created_by_name?: string | null
          effective_from?: string
          effective_to?: string | null
          id?: string
          is_lead?: boolean
          notes?: string | null
          organization_id?: string
          person_id?: string
          role?: string
          room_id?: string
          updated_at?: string
        }
        Relationships: [
          {
            foreignKeyName: "fk_kids_classroom_teachers_person"
            columns: ["person_id", "organization_id"]
            isOneToOne: false
            referencedRelation: "people"
            referencedColumns: ["id", "organization_id"]
          },
        ]
      }
      kids_consent_exceptions: {
        Row: {
          child_person_id: string
          granted_at: string
          granted_by: string | null
          granted_by_name: string
          id: string
          kids_session_id: string
          organization_id: string
          reason: string
        }
        Insert: {
          child_person_id: string
          granted_at?: string
          granted_by?: string | null
          granted_by_name: string
          id?: string
          kids_session_id: string
          organization_id: string
          reason: string
        }
        Update: {
          child_person_id?: string
          granted_at?: string
          granted_by?: string | null
          granted_by_name?: string
          id?: string
          kids_session_id?: string
          organization_id?: string
          reason?: string
        }
        Relationships: [
          {
            foreignKeyName: "fk_kids_consent_exception_child"
            columns: ["child_person_id", "organization_id"]
            isOneToOne: false
            referencedRelation: "people"
            referencedColumns: ["id", "organization_id"]
          },
          {
            foreignKeyName: "kids_consent_exceptions_kids_session_id_fkey"
            columns: ["kids_session_id"]
            isOneToOne: false
            referencedRelation: "kids_sessions"
            referencedColumns: ["id"]
          },
        ]
      }
      kids_consent_policy: {
        Row: {
          created_at: string
          enforce_from: string | null
          mode: string
          notice_text: string | null
          organization_id: string
          resign_grace_days: number
          updated_at: string
          updated_by: string | null
          updated_by_name: string | null
        }
        Insert: {
          created_at?: string
          enforce_from?: string | null
          mode?: string
          notice_text?: string | null
          organization_id: string
          resign_grace_days?: number
          updated_at?: string
          updated_by?: string | null
          updated_by_name?: string | null
        }
        Update: {
          created_at?: string
          enforce_from?: string | null
          mode?: string
          notice_text?: string | null
          organization_id?: string
          resign_grace_days?: number
          updated_at?: string
          updated_by?: string | null
          updated_by_name?: string | null
        }
        Relationships: []
      }
      kids_events: {
        Row: {
          auto_expire_minutes_after_end: number
          auto_open_dow: number | null
          auto_open_service_label: string
          check_in_closes_minutes_after: number
          check_in_opens_minutes_before: number
          created_at: string
          created_by: string | null
          created_by_name: string | null
          description: string | null
          event_type: string
          id: string
          is_active: boolean
          late_pickup_grace_minutes: number
          name: string
          organization_id: string
          service_minutes: number
          service_starts_local: string | null
          updated_at: string
        }
        Insert: {
          auto_expire_minutes_after_end?: number
          auto_open_dow?: number | null
          auto_open_service_label?: string
          check_in_closes_minutes_after?: number
          check_in_opens_minutes_before?: number
          created_at?: string
          created_by?: string | null
          created_by_name?: string | null
          description?: string | null
          event_type?: string
          id?: string
          is_active?: boolean
          late_pickup_grace_minutes?: number
          name: string
          organization_id: string
          service_minutes?: number
          service_starts_local?: string | null
          updated_at?: string
        }
        Update: {
          auto_expire_minutes_after_end?: number
          auto_open_dow?: number | null
          auto_open_service_label?: string
          check_in_closes_minutes_after?: number
          check_in_opens_minutes_before?: number
          created_at?: string
          created_by?: string | null
          created_by_name?: string | null
          description?: string | null
          event_type?: string
          id?: string
          is_active?: boolean
          late_pickup_grace_minutes?: number
          name?: string
          organization_id?: string
          service_minutes?: number
          service_starts_local?: string | null
          updated_at?: string
        }
        Relationships: []
      }
      kids_incident_notes: {
        Row: {
          author_id: string | null
          author_name: string
          body: string
          created_at: string
          id: string
          incident_id: string
          organization_id: string
          visibility: string
        }
        Insert: {
          author_id?: string | null
          author_name: string
          body: string
          created_at?: string
          id?: string
          incident_id: string
          organization_id: string
          visibility?: string
        }
        Update: {
          author_id?: string | null
          author_name?: string
          body?: string
          created_at?: string
          id?: string
          incident_id?: string
          organization_id?: string
          visibility?: string
        }
        Relationships: [
          {
            foreignKeyName: "kids_incident_notes_incident_id_fkey"
            columns: ["incident_id"]
            isOneToOne: false
            referencedRelation: "kids_incidents"
            referencedColumns: ["id"]
          },
        ]
      }
      kids_incidents: {
        Row: {
          admin_summary: string | null
          check_in_id: string | null
          child_person_id: string
          created_at: string
          decline_reason: string | null
          external_report_made: boolean | null
          external_report_note: string | null
          external_report_reference: string | null
          external_reported_at: string | null
          id: string
          kids_session_id: string | null
          legal_hold: boolean
          occurred_on: string
          organization_id: string
          parent_message: string | null
          pdf_attempts: number
          pdf_error: string | null
          pdf_generated_at: string | null
          pdf_sha256: string | null
          pdf_storage_path: string | null
          reported_at: string
          reported_by: string | null
          reported_by_name: string
          reported_by_person_id: string | null
          reported_narrative: string
          room_id: string | null
          sent_at: string | null
          severity: string
          signed_off_at: string | null
          signed_off_by: string | null
          signed_off_by_name: string | null
          status: string
          updated_at: string
        }
        Insert: {
          admin_summary?: string | null
          check_in_id?: string | null
          child_person_id: string
          created_at?: string
          decline_reason?: string | null
          external_report_made?: boolean | null
          external_report_note?: string | null
          external_report_reference?: string | null
          external_reported_at?: string | null
          id?: string
          kids_session_id?: string | null
          legal_hold?: boolean
          occurred_on: string
          organization_id: string
          parent_message?: string | null
          pdf_attempts?: number
          pdf_error?: string | null
          pdf_generated_at?: string | null
          pdf_sha256?: string | null
          pdf_storage_path?: string | null
          reported_at?: string
          reported_by?: string | null
          reported_by_name: string
          reported_by_person_id?: string | null
          reported_narrative: string
          room_id?: string | null
          sent_at?: string | null
          severity: string
          signed_off_at?: string | null
          signed_off_by?: string | null
          signed_off_by_name?: string | null
          status?: string
          updated_at?: string
        }
        Update: {
          admin_summary?: string | null
          check_in_id?: string | null
          child_person_id?: string
          created_at?: string
          decline_reason?: string | null
          external_report_made?: boolean | null
          external_report_note?: string | null
          external_report_reference?: string | null
          external_reported_at?: string | null
          id?: string
          kids_session_id?: string | null
          legal_hold?: boolean
          occurred_on?: string
          organization_id?: string
          parent_message?: string | null
          pdf_attempts?: number
          pdf_error?: string | null
          pdf_generated_at?: string | null
          pdf_sha256?: string | null
          pdf_storage_path?: string | null
          reported_at?: string
          reported_by?: string | null
          reported_by_name?: string
          reported_by_person_id?: string | null
          reported_narrative?: string
          room_id?: string | null
          sent_at?: string | null
          severity?: string
          signed_off_at?: string | null
          signed_off_by?: string | null
          signed_off_by_name?: string | null
          status?: string
          updated_at?: string
        }
        Relationships: [
          {
            foreignKeyName: "fk_kids_incident_child"
            columns: ["child_person_id", "organization_id"]
            isOneToOne: false
            referencedRelation: "people"
            referencedColumns: ["id", "organization_id"]
          },
          {
            foreignKeyName: "kids_incidents_check_in_id_fkey"
            columns: ["check_in_id"]
            isOneToOne: false
            referencedRelation: "kids_check_ins"
            referencedColumns: ["id"]
          },
          {
            foreignKeyName: "kids_incidents_kids_session_id_fkey"
            columns: ["kids_session_id"]
            isOneToOne: false
            referencedRelation: "kids_sessions"
            referencedColumns: ["id"]
          },
        ]
      }
      kids_late_pickups: {
        Row: {
          check_in_id: string | null
          child_person_id: string
          created_at: string
          detected_at: string
          dismissed_reason: string | null
          id: string
          kids_session_id: string | null
          legal_hold: boolean
          minutes_late: number | null
          organization_id: string
          parent_message: string | null
          parent_notified_at: string | null
          reviewed_at: string | null
          reviewed_by: string | null
          reviewed_by_name: string | null
          room_id: string | null
          session_date: string | null
          source: string
          status: string
        }
        Insert: {
          check_in_id?: string | null
          child_person_id: string
          created_at?: string
          detected_at?: string
          dismissed_reason?: string | null
          id?: string
          kids_session_id?: string | null
          legal_hold?: boolean
          minutes_late?: number | null
          organization_id: string
          parent_message?: string | null
          parent_notified_at?: string | null
          reviewed_at?: string | null
          reviewed_by?: string | null
          reviewed_by_name?: string | null
          room_id?: string | null
          session_date?: string | null
          source: string
          status?: string
        }
        Update: {
          check_in_id?: string | null
          child_person_id?: string
          created_at?: string
          detected_at?: string
          dismissed_reason?: string | null
          id?: string
          kids_session_id?: string | null
          legal_hold?: boolean
          minutes_late?: number | null
          organization_id?: string
          parent_message?: string | null
          parent_notified_at?: string | null
          reviewed_at?: string | null
          reviewed_by?: string | null
          reviewed_by_name?: string | null
          room_id?: string | null
          session_date?: string | null
          source?: string
          status?: string
        }
        Relationships: [
          {
            foreignKeyName: "fk_kids_late_pickup_child"
            columns: ["child_person_id", "organization_id"]
            isOneToOne: false
            referencedRelation: "people"
            referencedColumns: ["id", "organization_id"]
          },
          {
            foreignKeyName: "kids_late_pickups_check_in_id_fkey"
            columns: ["check_in_id"]
            isOneToOne: false
            referencedRelation: "kids_check_ins"
            referencedColumns: ["id"]
          },
          {
            foreignKeyName: "kids_late_pickups_kids_session_id_fkey"
            columns: ["kids_session_id"]
            isOneToOne: false
            referencedRelation: "kids_sessions"
            referencedColumns: ["id"]
          },
        ]
      }
      kids_leader_invites: {
        Row: {
          claimed_at: string | null
          claimed_user_id: string | null
          created_at: string
          created_by: string | null
          created_by_name: string | null
          display_name: string
          email: string
          id: string
          organization_id: string
          permission: Database["church"]["Enums"]["module_permission"]
          person_id: string | null
          scope_room_ids: string[] | null
          updated_at: string
        }
        Insert: {
          claimed_at?: string | null
          claimed_user_id?: string | null
          created_at?: string
          created_by?: string | null
          created_by_name?: string | null
          display_name: string
          email: string
          id?: string
          organization_id: string
          permission?: Database["church"]["Enums"]["module_permission"]
          person_id?: string | null
          scope_room_ids?: string[] | null
          updated_at?: string
        }
        Update: {
          claimed_at?: string | null
          claimed_user_id?: string | null
          created_at?: string
          created_by?: string | null
          created_by_name?: string | null
          display_name?: string
          email?: string
          id?: string
          organization_id?: string
          permission?: Database["church"]["Enums"]["module_permission"]
          person_id?: string | null
          scope_room_ids?: string[] | null
          updated_at?: string
        }
        Relationships: [
          {
            foreignKeyName: "kids_leader_invites_person_id_fkey"
            columns: ["person_id"]
            isOneToOne: false
            referencedRelation: "people"
            referencedColumns: ["id"]
          },
        ]
      }
      kids_leader_scope: {
        Row: {
          created_at: string
          granted_by: string | null
          granted_by_name: string | null
          id: string
          organization_id: string
          room_id: string
          updated_at: string
          user_id: string
        }
        Insert: {
          created_at?: string
          granted_by?: string | null
          granted_by_name?: string | null
          id?: string
          organization_id: string
          room_id: string
          updated_at?: string
          user_id: string
        }
        Update: {
          created_at?: string
          granted_by?: string | null
          granted_by_name?: string | null
          id?: string
          organization_id?: string
          room_id?: string
          updated_at?: string
          user_id?: string
        }
        Relationships: []
      }
      kids_pickup_authorizations: {
        Row: {
          authorized_person_id: string
          child_person_id: string
          created_at: string
          created_by: string | null
          created_by_name: string | null
          effective_from: string
          effective_to: string | null
          id: string
          lifted_at: string | null
          lifted_by: string | null
          lifted_by_name: string | null
          organization_id: string
          relationship_note: string | null
          updated_at: string
        }
        Insert: {
          authorized_person_id: string
          child_person_id: string
          created_at?: string
          created_by?: string | null
          created_by_name?: string | null
          effective_from?: string
          effective_to?: string | null
          id?: string
          lifted_at?: string | null
          lifted_by?: string | null
          lifted_by_name?: string | null
          organization_id: string
          relationship_note?: string | null
          updated_at?: string
        }
        Update: {
          authorized_person_id?: string
          child_person_id?: string
          created_at?: string
          created_by?: string | null
          created_by_name?: string | null
          effective_from?: string
          effective_to?: string | null
          id?: string
          lifted_at?: string | null
          lifted_by?: string | null
          lifted_by_name?: string | null
          organization_id?: string
          relationship_note?: string | null
          updated_at?: string
        }
        Relationships: [
          {
            foreignKeyName: "fk_kids_pickup_auth_child"
            columns: ["child_person_id", "organization_id"]
            isOneToOne: false
            referencedRelation: "people"
            referencedColumns: ["id", "organization_id"]
          },
          {
            foreignKeyName: "fk_kids_pickup_auth_person"
            columns: ["authorized_person_id", "organization_id"]
            isOneToOne: false
            referencedRelation: "people"
            referencedColumns: ["id", "organization_id"]
          },
        ]
      }
      kids_pickup_restrictions: {
        Row: {
          child_person_id: string
          created_at: string
          created_by: string | null
          created_by_name: string | null
          effective_from: string
          effective_to: string | null
          id: string
          lifted_at: string | null
          lifted_by: string | null
          lifted_by_name: string | null
          organization_id: string
          reason_restricted: string | null
          restricted_person_id: string | null
          restricted_person_name: string | null
          updated_at: string
        }
        Insert: {
          child_person_id: string
          created_at?: string
          created_by?: string | null
          created_by_name?: string | null
          effective_from?: string
          effective_to?: string | null
          id?: string
          lifted_at?: string | null
          lifted_by?: string | null
          lifted_by_name?: string | null
          organization_id: string
          reason_restricted?: string | null
          restricted_person_id?: string | null
          restricted_person_name?: string | null
          updated_at?: string
        }
        Update: {
          child_person_id?: string
          created_at?: string
          created_by?: string | null
          created_by_name?: string | null
          effective_from?: string
          effective_to?: string | null
          id?: string
          lifted_at?: string | null
          lifted_by?: string | null
          lifted_by_name?: string | null
          organization_id?: string
          reason_restricted?: string | null
          restricted_person_id?: string | null
          restricted_person_name?: string | null
          updated_at?: string
        }
        Relationships: [
          {
            foreignKeyName: "fk_kids_restriction_child"
            columns: ["child_person_id", "organization_id"]
            isOneToOne: false
            referencedRelation: "people"
            referencedColumns: ["id", "organization_id"]
          },
          {
            foreignKeyName: "fk_kids_restriction_person"
            columns: ["restricted_person_id", "organization_id"]
            isOneToOne: false
            referencedRelation: "people"
            referencedColumns: ["id", "organization_id"]
          },
        ]
      }
      kids_session_rooms: {
        Row: {
          capacity_override: number | null
          closed_reason: string | null
          created_at: string
          id: string
          is_open: boolean
          kids_session_id: string
          organization_id: string
          room_id: string
          updated_at: string
        }
        Insert: {
          capacity_override?: number | null
          closed_reason?: string | null
          created_at?: string
          id?: string
          is_open?: boolean
          kids_session_id: string
          organization_id: string
          room_id: string
          updated_at?: string
        }
        Update: {
          capacity_override?: number | null
          closed_reason?: string | null
          created_at?: string
          id?: string
          is_open?: boolean
          kids_session_id?: string
          organization_id?: string
          room_id?: string
          updated_at?: string
        }
        Relationships: [
          {
            foreignKeyName: "fk_kids_session_rooms_session"
            columns: ["kids_session_id", "organization_id"]
            isOneToOne: false
            referencedRelation: "kids_sessions"
            referencedColumns: ["id", "organization_id"]
          },
        ]
      }
      kids_session_staffing: {
        Row: {
          created_at: string
          ended_at: string | null
          id: string
          kids_session_id: string
          organization_id: string
          person_id: string
          role: string
          room_id: string | null
          started_at: string
          updated_at: string
          was_background_check_current: boolean | null
        }
        Insert: {
          created_at?: string
          ended_at?: string | null
          id?: string
          kids_session_id: string
          organization_id: string
          person_id: string
          role?: string
          room_id?: string | null
          started_at?: string
          updated_at?: string
          was_background_check_current?: boolean | null
        }
        Update: {
          created_at?: string
          ended_at?: string | null
          id?: string
          kids_session_id?: string
          organization_id?: string
          person_id?: string
          role?: string
          room_id?: string | null
          started_at?: string
          updated_at?: string
          was_background_check_current?: boolean | null
        }
        Relationships: [
          {
            foreignKeyName: "fk_kids_staffing_person"
            columns: ["person_id", "organization_id"]
            isOneToOne: false
            referencedRelation: "people"
            referencedColumns: ["id", "organization_id"]
          },
          {
            foreignKeyName: "fk_kids_staffing_session"
            columns: ["kids_session_id", "organization_id"]
            isOneToOne: false
            referencedRelation: "kids_sessions"
            referencedColumns: ["id", "organization_id"]
          },
        ]
      }
      kids_sessions: {
        Row: {
          closed_at: string | null
          created_at: string
          ends_at: string
          id: string
          kids_event_id: string
          next_tag_number: number
          opened_at: string | null
          organization_id: string
          service_label: string
          session_date: string
          starts_at: string
          status: string
          updated_at: string
        }
        Insert: {
          closed_at?: string | null
          created_at?: string
          ends_at: string
          id?: string
          kids_event_id: string
          next_tag_number?: number
          opened_at?: string | null
          organization_id: string
          service_label: string
          session_date: string
          starts_at: string
          status?: string
          updated_at?: string
        }
        Update: {
          closed_at?: string | null
          created_at?: string
          ends_at?: string
          id?: string
          kids_event_id?: string
          next_tag_number?: number
          opened_at?: string | null
          organization_id?: string
          service_label?: string
          session_date?: string
          starts_at?: string
          status?: string
          updated_at?: string
        }
        Relationships: [
          {
            foreignKeyName: "fk_kids_sessions_event"
            columns: ["kids_event_id", "organization_id"]
            isOneToOne: false
            referencedRelation: "kids_events"
            referencedColumns: ["id", "organization_id"]
          },
        ]
      }
      kids_shift_tokens: {
        Row: {
          ended_at: string | null
          expires_at: string
          id: string
          issued_at: string
          issued_to_auth_user: string | null
          organization_id: string
          station_id: string
          token_hash: string
          volunteer_id: string
        }
        Insert: {
          ended_at?: string | null
          expires_at: string
          id?: string
          issued_at?: string
          issued_to_auth_user?: string | null
          organization_id: string
          station_id: string
          token_hash: string
          volunteer_id: string
        }
        Update: {
          ended_at?: string | null
          expires_at?: string
          id?: string
          issued_at?: string
          issued_to_auth_user?: string | null
          organization_id?: string
          station_id?: string
          token_hash?: string
          volunteer_id?: string
        }
        Relationships: [
          {
            foreignKeyName: "kids_shift_tokens_station_id_fkey"
            columns: ["station_id"]
            isOneToOne: false
            referencedRelation: "check_in_stations"
            referencedColumns: ["id"]
          },
          {
            foreignKeyName: "kids_shift_tokens_volunteer_id_fkey"
            columns: ["volunteer_id"]
            isOneToOne: false
            referencedRelation: "kids_volunteers"
            referencedColumns: ["id"]
          },
        ]
      }
      kids_volunteer_pins: {
        Row: {
          created_at: string
          failed_attempts: number
          last_used_at: string | null
          locked_until: string | null
          pin_hash: string
          rotated_at: string
          volunteer_id: string
        }
        Insert: {
          created_at?: string
          failed_attempts?: number
          last_used_at?: string | null
          locked_until?: string | null
          pin_hash: string
          rotated_at?: string
          volunteer_id: string
        }
        Update: {
          created_at?: string
          failed_attempts?: number
          last_used_at?: string | null
          locked_until?: string | null
          pin_hash?: string
          rotated_at?: string
          volunteer_id?: string
        }
        Relationships: [
          {
            foreignKeyName: "kids_volunteer_pins_volunteer_id_fkey"
            columns: ["volunteer_id"]
            isOneToOne: true
            referencedRelation: "kids_volunteers"
            referencedColumns: ["id"]
          },
        ]
      }
      kids_volunteers: {
        Row: {
          background_check_expires_on: string | null
          background_check_reference: string | null
          background_check_status: string
          can_override: boolean
          created_at: string
          id: string
          is_active: boolean
          may_not_serve_with_children: boolean
          organization_id: string
          person_id: string
          training_completed_on: string | null
          updated_at: string
        }
        Insert: {
          background_check_expires_on?: string | null
          background_check_reference?: string | null
          background_check_status?: string
          can_override?: boolean
          created_at?: string
          id?: string
          is_active?: boolean
          may_not_serve_with_children?: boolean
          organization_id: string
          person_id: string
          training_completed_on?: string | null
          updated_at?: string
        }
        Update: {
          background_check_expires_on?: string | null
          background_check_reference?: string | null
          background_check_status?: string
          can_override?: boolean
          created_at?: string
          id?: string
          is_active?: boolean
          may_not_serve_with_children?: boolean
          organization_id?: string
          person_id?: string
          training_completed_on?: string | null
          updated_at?: string
        }
        Relationships: [
          {
            foreignKeyName: "fk_kids_volunteers_person"
            columns: ["person_id", "organization_id"]
            isOneToOne: false
            referencedRelation: "people"
            referencedColumns: ["id", "organization_id"]
          },
        ]
      }
      membership_statuses: {
        Row: {
          code: string
          counts_as_active: boolean
          created_at: string
          description: string | null
          display_name: string
          id: string
          is_active: boolean
          organization_id: string
          sort_order: number
          updated_at: string
        }
        Insert: {
          code: string
          counts_as_active?: boolean
          created_at?: string
          description?: string | null
          display_name: string
          id?: string
          is_active?: boolean
          organization_id: string
          sort_order?: number
          updated_at?: string
        }
        Update: {
          code?: string
          counts_as_active?: boolean
          created_at?: string
          description?: string | null
          display_name?: string
          id?: string
          is_active?: boolean
          organization_id?: string
          sort_order?: number
          updated_at?: string
        }
        Relationships: []
      }
      ministry_aliases: {
        Row: {
          alias: string
          created_at: string
          id: string
          ministry_id: string
          organization_id: string
        }
        Insert: {
          alias: string
          created_at?: string
          id?: string
          ministry_id: string
          organization_id: string
        }
        Update: {
          alias?: string
          created_at?: string
          id?: string
          ministry_id?: string
          organization_id?: string
        }
        Relationships: []
      }
      ministry_assignments: {
        Row: {
          created_at: string
          created_by: string | null
          created_by_name: string | null
          end_date: string | null
          id: string
          is_primary_role: boolean
          ministry_id: string
          ministry_role_id: string
          notes: string | null
          organization_id: string
          person_id: string
          start_date: string
          updated_at: string
        }
        Insert: {
          created_at?: string
          created_by?: string | null
          created_by_name?: string | null
          end_date?: string | null
          id?: string
          is_primary_role?: boolean
          ministry_id: string
          ministry_role_id: string
          notes?: string | null
          organization_id: string
          person_id: string
          start_date?: string
          updated_at?: string
        }
        Update: {
          created_at?: string
          created_by?: string | null
          created_by_name?: string | null
          end_date?: string | null
          id?: string
          is_primary_role?: boolean
          ministry_id?: string
          ministry_role_id?: string
          notes?: string | null
          organization_id?: string
          person_id?: string
          start_date?: string
          updated_at?: string
        }
        Relationships: [
          {
            foreignKeyName: "fk_ministry_assignments_person"
            columns: ["person_id", "organization_id"]
            isOneToOne: false
            referencedRelation: "people"
            referencedColumns: ["id", "organization_id"]
          },
          {
            foreignKeyName: "ministry_assignments_ministry_role_id_fkey"
            columns: ["ministry_role_id"]
            isOneToOne: false
            referencedRelation: "ministry_roles"
            referencedColumns: ["id"]
          },
        ]
      }
      ministry_name_review_queue: {
        Row: {
          created_at: string
          id: string
          occurrences: number
          organization_id: string
          raw_name: string
          resolution: string | null
          resolved_at: string | null
          resolved_by: string | null
          source: string
          source_profile_id: string | null
        }
        Insert: {
          created_at?: string
          id?: string
          occurrences?: number
          organization_id: string
          raw_name: string
          resolution?: string | null
          resolved_at?: string | null
          resolved_by?: string | null
          source?: string
          source_profile_id?: string | null
        }
        Update: {
          created_at?: string
          id?: string
          occurrences?: number
          organization_id?: string
          raw_name?: string
          resolution?: string | null
          resolved_at?: string | null
          resolved_by?: string | null
          source?: string
          source_profile_id?: string | null
        }
        Relationships: []
      }
      ministry_roles: {
        Row: {
          code: string
          created_at: string
          display_name: string
          id: string
          is_active: boolean
          is_leadership_role: boolean
          is_serving_role: boolean
          organization_id: string
          sort_order: number
          updated_at: string
        }
        Insert: {
          code: string
          created_at?: string
          display_name: string
          id?: string
          is_active?: boolean
          is_leadership_role?: boolean
          is_serving_role?: boolean
          organization_id: string
          sort_order?: number
          updated_at?: string
        }
        Update: {
          code?: string
          created_at?: string
          display_name?: string
          id?: string
          is_active?: boolean
          is_leadership_role?: boolean
          is_serving_role?: boolean
          organization_id?: string
          sort_order?: number
          updated_at?: string
        }
        Relationships: []
      }
      module_grants: {
        Row: {
          created_at: string
          granted_by: string | null
          granted_by_name: string | null
          id: string
          notes: string | null
          organization_id: string
          permission: Database["church"]["Enums"]["module_permission"]
          updated_at: string
          user_id: string
        }
        Insert: {
          created_at?: string
          granted_by?: string | null
          granted_by_name?: string | null
          id?: string
          notes?: string | null
          organization_id: string
          permission: Database["church"]["Enums"]["module_permission"]
          updated_at?: string
          user_id: string
        }
        Update: {
          created_at?: string
          granted_by?: string | null
          granted_by_name?: string | null
          id?: string
          notes?: string | null
          organization_id?: string
          permission?: Database["church"]["Enums"]["module_permission"]
          updated_at?: string
          user_id?: string
        }
        Relationships: []
      }
      notification_log: {
        Row: {
          attachment_bucket: string | null
          attachment_filename: string | null
          attachment_path: string | null
          attempts: number
          body: string
          channel: string
          check_in_id: string | null
          child_person_id: string | null
          claimed_at: string | null
          consent_signature_id: string | null
          created_at: string
          error: string | null
          id: string
          kids_session_id: string | null
          kind: string
          organization_id: string
          provider_message_id: string | null
          recipient_email: string | null
          recipient_name: string | null
          recipient_person_id: string | null
          recipient_phone: string | null
          sent_at: string | null
          sent_by_auth_user: string | null
          sent_by_name: string | null
          sent_by_person_id: string | null
          status: string
          subject: string | null
        }
        Insert: {
          attachment_bucket?: string | null
          attachment_filename?: string | null
          attachment_path?: string | null
          attempts?: number
          body: string
          channel?: string
          check_in_id?: string | null
          child_person_id?: string | null
          claimed_at?: string | null
          consent_signature_id?: string | null
          created_at?: string
          error?: string | null
          id?: string
          kids_session_id?: string | null
          kind: string
          organization_id: string
          provider_message_id?: string | null
          recipient_email?: string | null
          recipient_name?: string | null
          recipient_person_id?: string | null
          recipient_phone?: string | null
          sent_at?: string | null
          sent_by_auth_user?: string | null
          sent_by_name?: string | null
          sent_by_person_id?: string | null
          status?: string
          subject?: string | null
        }
        Update: {
          attachment_bucket?: string | null
          attachment_filename?: string | null
          attachment_path?: string | null
          attempts?: number
          body?: string
          channel?: string
          check_in_id?: string | null
          child_person_id?: string | null
          claimed_at?: string | null
          consent_signature_id?: string | null
          created_at?: string
          error?: string | null
          id?: string
          kids_session_id?: string | null
          kind?: string
          organization_id?: string
          provider_message_id?: string | null
          recipient_email?: string | null
          recipient_name?: string | null
          recipient_person_id?: string | null
          recipient_phone?: string | null
          sent_at?: string | null
          sent_by_auth_user?: string | null
          sent_by_name?: string | null
          sent_by_person_id?: string | null
          status?: string
          subject?: string | null
        }
        Relationships: [
          {
            foreignKeyName: "notification_log_check_in_id_fkey"
            columns: ["check_in_id"]
            isOneToOne: false
            referencedRelation: "kids_check_ins"
            referencedColumns: ["id"]
          },
          {
            foreignKeyName: "notification_log_child_person_id_fkey"
            columns: ["child_person_id"]
            isOneToOne: false
            referencedRelation: "people"
            referencedColumns: ["id"]
          },
          {
            foreignKeyName: "notification_log_consent_signature_id_fkey"
            columns: ["consent_signature_id"]
            isOneToOne: false
            referencedRelation: "consent_signatures"
            referencedColumns: ["id"]
          },
          {
            foreignKeyName: "notification_log_kids_session_id_fkey"
            columns: ["kids_session_id"]
            isOneToOne: false
            referencedRelation: "kids_sessions"
            referencedColumns: ["id"]
          },
          {
            foreignKeyName: "notification_log_recipient_person_id_fkey"
            columns: ["recipient_person_id"]
            isOneToOne: false
            referencedRelation: "people"
            referencedColumns: ["id"]
          },
          {
            foreignKeyName: "notification_log_sent_by_person_id_fkey"
            columns: ["sent_by_person_id"]
            isOneToOne: false
            referencedRelation: "people"
            referencedColumns: ["id"]
          },
        ]
      }
      people: {
        Row: {
          accepted_lord_is_approximate: boolean
          accepted_lord_month: number | null
          accepted_lord_year: number | null
          amharic_name: string | null
          birth_month: number | null
          birth_year: number | null
          created_at: string
          created_by: string | null
          created_by_name: string | null
          deceased: boolean
          email: string | null
          first_name: string
          gender: string | null
          id: string
          inactive_reason: string | null
          is_active: boolean
          is_child: boolean
          last_name: string
          marital_status: string | null
          member_number: string | null
          member_since: string | null
          membership_status_id: string | null
          merged_into_person_id: string | null
          middle_name: string | null
          notes: string | null
          notify_by_email: boolean
          notify_by_sms: boolean
          organization_id: string
          phone: string | null
          phone_digits: string | null
          photo_path: string | null
          preferred_name: string | null
          profile_id: string | null
          school_grade_id: string | null
          search_name: string | null
          sms_consent_at: string | null
          sms_opted_out_at: string | null
          updated_at: string
        }
        Insert: {
          accepted_lord_is_approximate?: boolean
          accepted_lord_month?: number | null
          accepted_lord_year?: number | null
          amharic_name?: string | null
          birth_month?: number | null
          birth_year?: number | null
          created_at?: string
          created_by?: string | null
          created_by_name?: string | null
          deceased?: boolean
          email?: string | null
          first_name: string
          gender?: string | null
          id?: string
          inactive_reason?: string | null
          is_active?: boolean
          is_child?: boolean
          last_name: string
          marital_status?: string | null
          member_number?: string | null
          member_since?: string | null
          membership_status_id?: string | null
          merged_into_person_id?: string | null
          middle_name?: string | null
          notes?: string | null
          notify_by_email?: boolean
          notify_by_sms?: boolean
          organization_id: string
          phone?: string | null
          phone_digits?: string | null
          photo_path?: string | null
          preferred_name?: string | null
          profile_id?: string | null
          school_grade_id?: string | null
          search_name?: string | null
          sms_consent_at?: string | null
          sms_opted_out_at?: string | null
          updated_at?: string
        }
        Update: {
          accepted_lord_is_approximate?: boolean
          accepted_lord_month?: number | null
          accepted_lord_year?: number | null
          amharic_name?: string | null
          birth_month?: number | null
          birth_year?: number | null
          created_at?: string
          created_by?: string | null
          created_by_name?: string | null
          deceased?: boolean
          email?: string | null
          first_name?: string
          gender?: string | null
          id?: string
          inactive_reason?: string | null
          is_active?: boolean
          is_child?: boolean
          last_name?: string
          marital_status?: string | null
          member_number?: string | null
          member_since?: string | null
          membership_status_id?: string | null
          merged_into_person_id?: string | null
          middle_name?: string | null
          notes?: string | null
          notify_by_email?: boolean
          notify_by_sms?: boolean
          organization_id?: string
          phone?: string | null
          phone_digits?: string | null
          photo_path?: string | null
          preferred_name?: string | null
          profile_id?: string | null
          school_grade_id?: string | null
          search_name?: string | null
          sms_consent_at?: string | null
          sms_opted_out_at?: string | null
          updated_at?: string
        }
        Relationships: [
          {
            foreignKeyName: "people_membership_status_id_fkey"
            columns: ["membership_status_id"]
            isOneToOne: false
            referencedRelation: "membership_statuses"
            referencedColumns: ["id"]
          },
          {
            foreignKeyName: "people_merged_into_person_id_fkey"
            columns: ["merged_into_person_id"]
            isOneToOne: false
            referencedRelation: "people"
            referencedColumns: ["id"]
          },
          {
            foreignKeyName: "people_school_grade_id_fkey"
            columns: ["school_grade_id"]
            isOneToOne: false
            referencedRelation: "school_grades"
            referencedColumns: ["id"]
          },
        ]
      }
      people_history: {
        Row: {
          action: string
          actor_id: string | null
          actor_name: string
          created_at: string
          field_name: string | null
          id: string
          new_value: string | null
          notes: string | null
          old_value: string | null
          organization_id: string
          person_id: string
        }
        Insert: {
          action: string
          actor_id?: string | null
          actor_name: string
          created_at?: string
          field_name?: string | null
          id?: string
          new_value?: string | null
          notes?: string | null
          old_value?: string | null
          organization_id: string
          person_id: string
        }
        Update: {
          action?: string
          actor_id?: string | null
          actor_name?: string
          created_at?: string
          field_name?: string | null
          id?: string
          new_value?: string | null
          notes?: string | null
          old_value?: string | null
          organization_id?: string
          person_id?: string
        }
        Relationships: [
          {
            foreignKeyName: "people_history_person_id_fkey"
            columns: ["person_id"]
            isOneToOne: false
            referencedRelation: "people"
            referencedColumns: ["id"]
          },
        ]
      }
      person_emergency_contacts: {
        Row: {
          alt_phone: string | null
          created_at: string
          id: string
          name: string
          organization_id: string
          person_id: string
          phone: string
          priority: number
          relationship: string | null
          updated_at: string
        }
        Insert: {
          alt_phone?: string | null
          created_at?: string
          id?: string
          name: string
          organization_id: string
          person_id: string
          phone: string
          priority?: number
          relationship?: string | null
          updated_at?: string
        }
        Update: {
          alt_phone?: string | null
          created_at?: string
          id?: string
          name?: string
          organization_id?: string
          person_id?: string
          phone?: string
          priority?: number
          relationship?: string | null
          updated_at?: string
        }
        Relationships: [
          {
            foreignKeyName: "fk_person_emergency_contacts_person"
            columns: ["person_id", "organization_id"]
            isOneToOne: false
            referencedRelation: "people"
            referencedColumns: ["id", "organization_id"]
          },
        ]
      }
      person_photos: {
        Row: {
          created_at: string
          id: string
          is_primary: boolean
          organization_id: string
          person_id: string
          slot: number
          storage_path: string
          uploaded_by: string | null
          uploaded_by_name: string | null
        }
        Insert: {
          created_at?: string
          id?: string
          is_primary?: boolean
          organization_id: string
          person_id: string
          slot: number
          storage_path: string
          uploaded_by?: string | null
          uploaded_by_name?: string | null
        }
        Update: {
          created_at?: string
          id?: string
          is_primary?: boolean
          organization_id?: string
          person_id?: string
          slot?: number
          storage_path?: string
          uploaded_by?: string | null
          uploaded_by_name?: string | null
        }
        Relationships: [
          {
            foreignKeyName: "fk_person_photos_person"
            columns: ["person_id", "organization_id"]
            isOneToOne: false
            referencedRelation: "people"
            referencedColumns: ["id", "organization_id"]
          },
        ]
      }
      person_relationships: {
        Row: {
          created_at: string
          end_date: string | null
          id: string
          is_mirrored: boolean
          notes: string | null
          organization_id: string
          person_id: string
          related_person_id: string
          relationship_type_id: string
          start_date: string | null
          updated_at: string
        }
        Insert: {
          created_at?: string
          end_date?: string | null
          id?: string
          is_mirrored?: boolean
          notes?: string | null
          organization_id: string
          person_id: string
          related_person_id: string
          relationship_type_id: string
          start_date?: string | null
          updated_at?: string
        }
        Update: {
          created_at?: string
          end_date?: string | null
          id?: string
          is_mirrored?: boolean
          notes?: string | null
          organization_id?: string
          person_id?: string
          related_person_id?: string
          relationship_type_id?: string
          start_date?: string | null
          updated_at?: string
        }
        Relationships: [
          {
            foreignKeyName: "fk_person_relationships_person"
            columns: ["person_id", "organization_id"]
            isOneToOne: false
            referencedRelation: "people"
            referencedColumns: ["id", "organization_id"]
          },
          {
            foreignKeyName: "fk_person_relationships_related"
            columns: ["related_person_id", "organization_id"]
            isOneToOne: false
            referencedRelation: "people"
            referencedColumns: ["id", "organization_id"]
          },
          {
            foreignKeyName: "person_relationships_relationship_type_id_fkey"
            columns: ["relationship_type_id"]
            isOneToOne: false
            referencedRelation: "relationship_types"
            referencedColumns: ["id"]
          },
        ]
      }
      person_sensitive: {
        Row: {
          allergies: string | null
          allergy_label_short: string | null
          allergy_severity: string
          created_at: string
          medical_notes: string | null
          medications: string | null
          organization_id: string
          person_id: string
          photo_consent: boolean
          special_needs: string | null
          special_needs_flag: boolean
          updated_at: string
          updated_by: string | null
          updated_by_name: string | null
        }
        Insert: {
          allergies?: string | null
          allergy_label_short?: string | null
          allergy_severity?: string
          created_at?: string
          medical_notes?: string | null
          medications?: string | null
          organization_id: string
          person_id: string
          photo_consent?: boolean
          special_needs?: string | null
          special_needs_flag?: boolean
          updated_at?: string
          updated_by?: string | null
          updated_by_name?: string | null
        }
        Update: {
          allergies?: string | null
          allergy_label_short?: string | null
          allergy_severity?: string
          created_at?: string
          medical_notes?: string | null
          medications?: string | null
          organization_id?: string
          person_id?: string
          photo_consent?: boolean
          special_needs?: string | null
          special_needs_flag?: boolean
          updated_at?: string
          updated_by?: string | null
          updated_by_name?: string | null
        }
        Relationships: [
          {
            foreignKeyName: "fk_person_sensitive_person"
            columns: ["person_id", "organization_id"]
            isOneToOne: false
            referencedRelation: "people"
            referencedColumns: ["id", "organization_id"]
          },
        ]
      }
      person_sensitive_history: {
        Row: {
          allergies: string | null
          allergy_severity: string | null
          changed_by: string | null
          changed_by_name: string
          changed_by_role: string
          created_at: string
          id: string
          medical_notes: string | null
          medications: string | null
          organization_id: string
          person_id: string
          special_needs: string | null
          special_needs_flag: boolean | null
        }
        Insert: {
          allergies?: string | null
          allergy_severity?: string | null
          changed_by?: string | null
          changed_by_name: string
          changed_by_role: string
          created_at?: string
          id?: string
          medical_notes?: string | null
          medications?: string | null
          organization_id: string
          person_id: string
          special_needs?: string | null
          special_needs_flag?: boolean | null
        }
        Update: {
          allergies?: string | null
          allergy_severity?: string | null
          changed_by?: string | null
          changed_by_name?: string
          changed_by_role?: string
          created_at?: string
          id?: string
          medical_notes?: string | null
          medications?: string | null
          organization_id?: string
          person_id?: string
          special_needs?: string | null
          special_needs_flag?: boolean | null
        }
        Relationships: []
      }
      person_service_interests: {
        Row: {
          created_at: string
          follow_up_owner_person_id: string | null
          id: string
          interest_date: string
          interest_level: string
          ministry_id: string
          notes: string | null
          organization_id: string
          person_id: string
          status: string
          updated_at: string
        }
        Insert: {
          created_at?: string
          follow_up_owner_person_id?: string | null
          id?: string
          interest_date?: string
          interest_level?: string
          ministry_id: string
          notes?: string | null
          organization_id: string
          person_id: string
          status?: string
          updated_at?: string
        }
        Update: {
          created_at?: string
          follow_up_owner_person_id?: string | null
          id?: string
          interest_date?: string
          interest_level?: string
          ministry_id?: string
          notes?: string | null
          organization_id?: string
          person_id?: string
          status?: string
          updated_at?: string
        }
        Relationships: [
          {
            foreignKeyName: "fk_service_interests_owner"
            columns: ["follow_up_owner_person_id", "organization_id"]
            isOneToOne: false
            referencedRelation: "people"
            referencedColumns: ["id", "organization_id"]
          },
          {
            foreignKeyName: "fk_service_interests_person"
            columns: ["person_id", "organization_id"]
            isOneToOne: false
            referencedRelation: "people"
            referencedColumns: ["id", "organization_id"]
          },
        ]
      }
      record_retention: {
        Row: {
          basis: string
          organization_id: string
          record_type: string
          retain_forever: boolean
          retain_years: number
          updated_at: string
          updated_by: string | null
          updated_by_name: string | null
        }
        Insert: {
          basis: string
          organization_id: string
          record_type: string
          retain_forever?: boolean
          retain_years: number
          updated_at?: string
          updated_by?: string | null
          updated_by_name?: string | null
        }
        Update: {
          basis?: string
          organization_id?: string
          record_type?: string
          retain_forever?: boolean
          retain_years?: number
          updated_at?: string
          updated_by?: string | null
          updated_by_name?: string | null
        }
        Relationships: []
      }
      relationship_types: {
        Row: {
          code: string
          created_at: string
          display_name: string
          id: string
          implies_guardianship: boolean
          inverse_code: string
          is_active: boolean
          organization_id: string
          sort_order: number
          updated_at: string
        }
        Insert: {
          code: string
          created_at?: string
          display_name: string
          id?: string
          implies_guardianship?: boolean
          inverse_code: string
          is_active?: boolean
          organization_id: string
          sort_order?: number
          updated_at?: string
        }
        Update: {
          code?: string
          created_at?: string
          display_name?: string
          id?: string
          implies_guardianship?: boolean
          inverse_code?: string
          is_active?: boolean
          organization_id?: string
          sort_order?: number
          updated_at?: string
        }
        Relationships: []
      }
      room_kids_config: {
        Row: {
          capacity: number | null
          created_at: string
          is_active: boolean
          is_checkin_location: boolean
          kids_age_band_id: string | null
          label_room_name: string | null
          organization_id: string
          ratio_children_per_volunteer: number | null
          room_id: string
          school_grade_id: string | null
          sort_order: number
          updated_at: string
        }
        Insert: {
          capacity?: number | null
          created_at?: string
          is_active?: boolean
          is_checkin_location?: boolean
          kids_age_band_id?: string | null
          label_room_name?: string | null
          organization_id: string
          ratio_children_per_volunteer?: number | null
          room_id: string
          school_grade_id?: string | null
          sort_order?: number
          updated_at?: string
        }
        Update: {
          capacity?: number | null
          created_at?: string
          is_active?: boolean
          is_checkin_location?: boolean
          kids_age_band_id?: string | null
          label_room_name?: string | null
          organization_id?: string
          ratio_children_per_volunteer?: number | null
          room_id?: string
          school_grade_id?: string | null
          sort_order?: number
          updated_at?: string
        }
        Relationships: [
          {
            foreignKeyName: "room_kids_config_kids_age_band_id_fkey"
            columns: ["kids_age_band_id"]
            isOneToOne: false
            referencedRelation: "kids_age_bands"
            referencedColumns: ["id"]
          },
          {
            foreignKeyName: "room_kids_config_school_grade_id_fkey"
            columns: ["school_grade_id"]
            isOneToOne: false
            referencedRelation: "school_grades"
            referencedColumns: ["id"]
          },
        ]
      }
      school_grades: {
        Row: {
          code: string
          created_at: string
          display_name: string
          id: string
          is_active: boolean
          organization_id: string
          sort_order: number
          updated_at: string
        }
        Insert: {
          code: string
          created_at?: string
          display_name: string
          id?: string
          is_active?: boolean
          organization_id: string
          sort_order?: number
          updated_at?: string
        }
        Update: {
          code?: string
          created_at?: string
          display_name?: string
          id?: string
          is_active?: boolean
          organization_id?: string
          sort_order?: number
          updated_at?: string
        }
        Relationships: []
      }
      training_attendance: {
        Row: {
          attendance_status: string
          attended_on: string | null
          completion_status: string | null
          created_at: string
          credited_minutes: number | null
          id: string
          notes: string | null
          organization_id: string
          person_id: string
          recorded_by: string | null
          recorded_by_name: string | null
          training_session_id: string
          updated_at: string
        }
        Insert: {
          attendance_status?: string
          attended_on?: string | null
          completion_status?: string | null
          created_at?: string
          credited_minutes?: number | null
          id?: string
          notes?: string | null
          organization_id: string
          person_id: string
          recorded_by?: string | null
          recorded_by_name?: string | null
          training_session_id: string
          updated_at?: string
        }
        Update: {
          attendance_status?: string
          attended_on?: string | null
          completion_status?: string | null
          created_at?: string
          credited_minutes?: number | null
          id?: string
          notes?: string | null
          organization_id?: string
          person_id?: string
          recorded_by?: string | null
          recorded_by_name?: string | null
          training_session_id?: string
          updated_at?: string
        }
        Relationships: [
          {
            foreignKeyName: "fk_training_attendance_person"
            columns: ["person_id", "organization_id"]
            isOneToOne: false
            referencedRelation: "people"
            referencedColumns: ["id", "organization_id"]
          },
          {
            foreignKeyName: "fk_training_attendance_session"
            columns: ["training_session_id", "organization_id"]
            isOneToOne: false
            referencedRelation: "training_sessions"
            referencedColumns: ["id", "organization_id"]
          },
        ]
      }
      training_courses: {
        Row: {
          category: string | null
          code: string | null
          created_at: string
          created_by: string | null
          created_by_name: string | null
          default_duration_minutes: number | null
          id: string
          is_active: boolean
          ministry_id: string | null
          name: string
          objective: string | null
          organization_id: string
          target_audience: string | null
          updated_at: string
        }
        Insert: {
          category?: string | null
          code?: string | null
          created_at?: string
          created_by?: string | null
          created_by_name?: string | null
          default_duration_minutes?: number | null
          id?: string
          is_active?: boolean
          ministry_id?: string | null
          name: string
          objective?: string | null
          organization_id: string
          target_audience?: string | null
          updated_at?: string
        }
        Update: {
          category?: string | null
          code?: string | null
          created_at?: string
          created_by?: string | null
          created_by_name?: string | null
          default_duration_minutes?: number | null
          id?: string
          is_active?: boolean
          ministry_id?: string | null
          name?: string
          objective?: string | null
          organization_id?: string
          target_audience?: string | null
          updated_at?: string
        }
        Relationships: []
      }
      training_instructors: {
        Row: {
          created_at: string
          external_instructor_name: string | null
          id: string
          instructor_role: string
          organization_id: string
          person_id: string | null
          training_session_id: string
        }
        Insert: {
          created_at?: string
          external_instructor_name?: string | null
          id?: string
          instructor_role?: string
          organization_id: string
          person_id?: string | null
          training_session_id: string
        }
        Update: {
          created_at?: string
          external_instructor_name?: string | null
          id?: string
          instructor_role?: string
          organization_id?: string
          person_id?: string | null
          training_session_id?: string
        }
        Relationships: [
          {
            foreignKeyName: "fk_training_instructors_person"
            columns: ["person_id", "organization_id"]
            isOneToOne: false
            referencedRelation: "people"
            referencedColumns: ["id", "organization_id"]
          },
          {
            foreignKeyName: "fk_training_instructors_session"
            columns: ["training_session_id", "organization_id"]
            isOneToOne: false
            referencedRelation: "training_sessions"
            referencedColumns: ["id", "organization_id"]
          },
        ]
      }
      training_sessions: {
        Row: {
          created_at: string
          created_by: string | null
          created_by_name: string | null
          duration_minutes: number | null
          ends_at: string | null
          id: string
          location: string | null
          notes: string | null
          organization_id: string
          room_id: string | null
          starts_at: string
          status: string
          training_course_id: string
          updated_at: string
        }
        Insert: {
          created_at?: string
          created_by?: string | null
          created_by_name?: string | null
          duration_minutes?: number | null
          ends_at?: string | null
          id?: string
          location?: string | null
          notes?: string | null
          organization_id: string
          room_id?: string | null
          starts_at: string
          status?: string
          training_course_id: string
          updated_at?: string
        }
        Update: {
          created_at?: string
          created_by?: string | null
          created_by_name?: string | null
          duration_minutes?: number | null
          ends_at?: string | null
          id?: string
          location?: string | null
          notes?: string | null
          organization_id?: string
          room_id?: string | null
          starts_at?: string
          status?: string
          training_course_id?: string
          updated_at?: string
        }
        Relationships: [
          {
            foreignKeyName: "fk_training_sessions_course"
            columns: ["training_course_id", "organization_id"]
            isOneToOne: false
            referencedRelation: "training_courses"
            referencedColumns: ["id", "organization_id"]
          },
        ]
      }
      workflow_card_activities: {
        Row: {
          actor_auth_user: string | null
          actor_name: string | null
          assignee_person_id: string | null
          body: string | null
          card_id: string
          created_at: string
          from_step_id: string | null
          id: string
          kind: string
          organization_id: string
          to_step_id: string | null
        }
        Insert: {
          actor_auth_user?: string | null
          actor_name?: string | null
          assignee_person_id?: string | null
          body?: string | null
          card_id: string
          created_at?: string
          from_step_id?: string | null
          id?: string
          kind: string
          organization_id: string
          to_step_id?: string | null
        }
        Update: {
          actor_auth_user?: string | null
          actor_name?: string | null
          assignee_person_id?: string | null
          body?: string | null
          card_id?: string
          created_at?: string
          from_step_id?: string | null
          id?: string
          kind?: string
          organization_id?: string
          to_step_id?: string | null
        }
        Relationships: [
          {
            foreignKeyName: "workflow_card_activities_assignee_person_id_fkey"
            columns: ["assignee_person_id"]
            isOneToOne: false
            referencedRelation: "people"
            referencedColumns: ["id"]
          },
          {
            foreignKeyName: "workflow_card_activities_card_id_fkey"
            columns: ["card_id"]
            isOneToOne: false
            referencedRelation: "workflow_cards"
            referencedColumns: ["id"]
          },
          {
            foreignKeyName: "workflow_card_activities_from_step_id_fkey"
            columns: ["from_step_id"]
            isOneToOne: false
            referencedRelation: "workflow_steps"
            referencedColumns: ["id"]
          },
          {
            foreignKeyName: "workflow_card_activities_to_step_id_fkey"
            columns: ["to_step_id"]
            isOneToOne: false
            referencedRelation: "workflow_steps"
            referencedColumns: ["id"]
          },
        ]
      }
      workflow_cards: {
        Row: {
          assignee_person_id: string | null
          completed_at: string | null
          completed_by_name: string | null
          created_at: string
          created_by: string | null
          created_by_name: string | null
          current_step_id: string | null
          due_on: string | null
          entered_step_at: string
          id: string
          organization_id: string
          outcome: string | null
          person_id: string
          snooze_until: string | null
          status: string
          updated_at: string
          workflow_id: string
        }
        Insert: {
          assignee_person_id?: string | null
          completed_at?: string | null
          completed_by_name?: string | null
          created_at?: string
          created_by?: string | null
          created_by_name?: string | null
          current_step_id?: string | null
          due_on?: string | null
          entered_step_at?: string
          id?: string
          organization_id: string
          outcome?: string | null
          person_id: string
          snooze_until?: string | null
          status?: string
          updated_at?: string
          workflow_id: string
        }
        Update: {
          assignee_person_id?: string | null
          completed_at?: string | null
          completed_by_name?: string | null
          created_at?: string
          created_by?: string | null
          created_by_name?: string | null
          current_step_id?: string | null
          due_on?: string | null
          entered_step_at?: string
          id?: string
          organization_id?: string
          outcome?: string | null
          person_id?: string
          snooze_until?: string | null
          status?: string
          updated_at?: string
          workflow_id?: string
        }
        Relationships: [
          {
            foreignKeyName: "fk_workflow_cards_assignee"
            columns: ["assignee_person_id", "organization_id"]
            isOneToOne: false
            referencedRelation: "people"
            referencedColumns: ["id", "organization_id"]
          },
          {
            foreignKeyName: "fk_workflow_cards_person"
            columns: ["person_id", "organization_id"]
            isOneToOne: false
            referencedRelation: "people"
            referencedColumns: ["id", "organization_id"]
          },
          {
            foreignKeyName: "fk_workflow_cards_step"
            columns: ["current_step_id", "organization_id"]
            isOneToOne: false
            referencedRelation: "workflow_steps"
            referencedColumns: ["id", "organization_id"]
          },
          {
            foreignKeyName: "fk_workflow_cards_workflow"
            columns: ["workflow_id", "organization_id"]
            isOneToOne: false
            referencedRelation: "workflows"
            referencedColumns: ["id", "organization_id"]
          },
        ]
      }
      workflow_steps: {
        Row: {
          created_at: string
          description: string | null
          expected_days: number | null
          id: string
          is_active: boolean
          name: string
          organization_id: string
          sequence: number
          updated_at: string
          workflow_id: string
        }
        Insert: {
          created_at?: string
          description?: string | null
          expected_days?: number | null
          id?: string
          is_active?: boolean
          name: string
          organization_id: string
          sequence: number
          updated_at?: string
          workflow_id: string
        }
        Update: {
          created_at?: string
          description?: string | null
          expected_days?: number | null
          id?: string
          is_active?: boolean
          name?: string
          organization_id?: string
          sequence?: number
          updated_at?: string
          workflow_id?: string
        }
        Relationships: [
          {
            foreignKeyName: "fk_workflow_steps_workflow"
            columns: ["workflow_id", "organization_id"]
            isOneToOne: false
            referencedRelation: "workflows"
            referencedColumns: ["id", "organization_id"]
          },
        ]
      }
      workflows: {
        Row: {
          auto_add_on_status_code: string | null
          category: string | null
          created_at: string
          created_by: string | null
          created_by_name: string | null
          default_assignee_person_id: string | null
          description: string | null
          id: string
          is_active: boolean
          name: string
          organization_id: string
          updated_at: string
        }
        Insert: {
          auto_add_on_status_code?: string | null
          category?: string | null
          created_at?: string
          created_by?: string | null
          created_by_name?: string | null
          default_assignee_person_id?: string | null
          description?: string | null
          id?: string
          is_active?: boolean
          name: string
          organization_id: string
          updated_at?: string
        }
        Update: {
          auto_add_on_status_code?: string | null
          category?: string | null
          created_at?: string
          created_by?: string | null
          created_by_name?: string | null
          default_assignee_person_id?: string | null
          description?: string | null
          id?: string
          is_active?: boolean
          name?: string
          organization_id?: string
          updated_at?: string
        }
        Relationships: [
          {
            foreignKeyName: "fk_workflows_default_assignee"
            columns: ["default_assignee_person_id", "organization_id"]
            isOneToOne: false
            referencedRelation: "people"
            referencedColumns: ["id", "organization_id"]
          },
        ]
      }
    }
    Views: {
      [_ in never]: never
    }
    Functions: {
      add_child_to_household: {
        Args: { _child: Json; _household_id: string }
        Returns: string
      }
      add_child_to_person: {
        Args: { _child: Json; _parent_person_id: string }
        Returns: {
          child_person_id: string
          household_created: boolean
          household_id: string
        }[]
      }
      add_person_photo: {
        Args: {
          _make_primary?: boolean
          _person_id: string
          _storage_path: string
        }
        Returns: {
          created_at: string
          id: string
          is_primary: boolean
          organization_id: string
          person_id: string
          slot: number
          storage_path: string
          uploaded_by: string | null
          uploaded_by_name: string | null
        }
        SetofOptions: {
          from: "*"
          to: "person_photos"
          isOneToOne: true
          isSetofReturn: false
        }
      }
      add_person_to_household: {
        Args: {
          _household_id: string
          _is_primary?: boolean
          _person_id: string
        }
        Returns: undefined
      }
      add_person_to_workflow: {
        Args: {
          _assignee_person_id?: string
          _note?: string
          _organization_id: string
          _person_id: string
          _workflow_id: string
        }
        Returns: string
      }
      add_workflow_card_note: {
        Args: { _body: string; _card_id: string }
        Returns: undefined
      }
      advance_workflow_card: {
        Args: { _card_id: string; _note?: string; _to_step_id?: string }
        Returns: Json
      }
      age_band_for: {
        Args: {
          _as_of?: string
          _birth_month: number
          _birth_year: number
          _organization_id: string
        }
        Returns: string
      }
      age_in_months: {
        Args: { _as_of: string; _birth_month: number; _birth_year: number }
        Returns: number
      }
      age_years: {
        Args: { _as_of?: string; _birth_month: number; _birth_year: number }
        Returns: number
      }
      assert_family_editor: {
        Args: { _person_id: string; _related_person_id: string }
        Returns: string
      }
      assert_giving_admin: {
        Args: { _organization_id: string }
        Returns: undefined
      }
      assert_giving_reader: {
        Args: { _organization_id: string }
        Returns: undefined
      }
      assert_kids_incident_admin: {
        Args: { _organization_id: string }
        Returns: undefined
      }
      assert_kids_leader: {
        Args: { _organization_id: string }
        Returns: undefined
      }
      assert_workflow_actor: { Args: { _card_id: string }; Returns: string }
      assign_classroom_teacher: {
        Args: {
          _is_lead?: boolean
          _organization_id: string
          _person_id: string
          _role?: string
          _room_id: string
        }
        Returns: {
          created_at: string
          created_by: string | null
          created_by_name: string | null
          effective_from: string
          effective_to: string | null
          id: string
          is_lead: boolean
          notes: string | null
          organization_id: string
          person_id: string
          role: string
          room_id: string
          updated_at: string
        }
        SetofOptions: {
          from: "*"
          to: "kids_classroom_teachers"
          isOneToOne: true
          isSetofReturn: false
        }
      }
      assign_session_staff: {
        Args: {
          _kids_session_id: string
          _person_id: string
          _role?: string
          _room_id?: string
        }
        Returns: {
          created_at: string
          ended_at: string | null
          id: string
          kids_session_id: string
          organization_id: string
          person_id: string
          role: string
          room_id: string | null
          started_at: string
          updated_at: string
          was_background_check_current: boolean | null
        }
        SetofOptions: {
          from: "*"
          to: "kids_session_staffing"
          isOneToOne: true
          isSetofReturn: false
        }
      }
      assign_workflow_card: {
        Args: { _assignee_person_id: string; _card_id: string; _note?: string }
        Returns: undefined
      }
      auth_user_id_for_email: { Args: { _email: string }; Returns: string }
      authorize_pickup: {
        Args: { _child_person_id: string; _note?: string; _person_id: string }
        Returns: string
      }
      backfill_people_from_profiles: {
        Args: { _organization_id: string }
        Returns: {
          created: number
          linked: number
          skipped: number
        }[]
      }
      can_manage_photos_of: { Args: { _person_id: string }; Returns: boolean }
      can_manage_workflows: {
        Args: { _organization_id: string }
        Returns: boolean
      }
      can_read_consent_pdf: {
        Args: { _signature_id: string }
        Returns: boolean
      }
      can_read_incident_pdf: {
        Args: { _incident_id: string }
        Returns: boolean
      }
      can_read_workflows: {
        Args: { _organization_id: string }
        Returns: boolean
      }
      can_view_photos_of: { Args: { _person_id: string }; Returns: boolean }
      check_in_children: {
        Args: {
          _assignment_reason?: string
          _child_person_ids: string[]
          _client_batch_key?: string
          _dropped_off_by_person_id?: string
          _kids_session_id: string
          _override_capacity?: boolean
          _room_ids?: string[]
          _shift_token?: string
        }
        Returns: {
          allergy_label: string
          batch_id: string
          check_in_id: string
          child_name: string
          child_person_id: string
          consent_state: string
          guardian_phone: string
          has_restriction: boolean
          pickup_code: string
          pickup_token: string
          refusal_code: string
          refusal_message: string
          refused: boolean
          room_id: string
          room_name: string
          tag_number: number
        }[]
      }
      check_in_one_child: {
        Args: {
          _assignment_reason: string
          _batch: string
          _child_person_id: string
          _dropped_off_by_person_id: string
          _kids_session_id: string
          _override_capacity: boolean
          _room_id: string
          a: Database["church"]["CompositeTypes"]["resolved_actor"]
        }
        Returns: string
      }
      check_out_children: {
        Args: {
          _check_in_ids: string[]
          _override_authorizer_pin?: string
          _override_authorizer_volunteer_id?: string
          _override_reason?: string
          _override_verification?: string
          _picked_up_by_name?: string
          _picked_up_by_person_id?: string
          _presented?: string
          _shift_token?: string
        }
        Returns: {
          check_in_id: string
          checked_out_at: string
          child_name: string
        }[]
      }
      child_consent_state: {
        Args: { _child_person_id: string; _for_household_id?: string }
        Returns: {
          document_version: number
          medical_changed_at: string
          resign_due_by: string
          signature_id: string
          signed_at: string
          state: string
        }[]
      }
      child_has_active_restriction: {
        Args: { _child_person_id: string }
        Returns: boolean
      }
      child_pickup_permissions: {
        Args: { _child_person_id: string }
        Returns: {
          created_by_name: string
          display_name: string
          effective_from: string
          id: string
          is_name_only: boolean
          kind: string
          note: string
          person_id: string
          phone: string
        }[]
      }
      children_missing_placement: {
        Args: { _organization_id: string }
        Returns: {
          child_name: string
          has_birth_year: boolean
          has_grade: boolean
          household_id: string
          household_name: string
          parent_email: string
          parent_names: string
          parent_phone: string
          person_id: string
        }[]
      }
      children_without_an_adult: {
        Args: { _organization_id: string }
        Returns: {
          added_by: string
          added_on: string
          child_name: string
          has_grade: boolean
          has_household: boolean
          household_id: string
          household_name: string
          person_id: string
        }[]
      }
      claim_attach_login: {
        Args: { _auth_user_id: string; _person_id: string }
        Returns: boolean
      }
      claim_kids_leader_invites: {
        Args: { _email: string; _user_id: string }
        Returns: number
      }
      claim_lookup: {
        Args: {
          _email?: string
          _first_name?: string
          _last_name?: string
          _organization_id: string
          _phone?: string
        }
        Returns: Database["church"]["CompositeTypes"]["claim_verdict"]
        SetofOptions: {
          from: "*"
          to: "claim_verdict"
          isOneToOne: true
          isSetofReturn: false
        }
      }
      claim_note_attempt: {
        Args: { _action: string; _identifier: string; _ip: string }
        Returns: boolean
      }
      claim_open_followup: { Args: { _person_id: string }; Returns: number }
      claim_queued_notifications: {
        Args: { _limit?: number }
        Returns: {
          attachment_bucket: string | null
          attachment_filename: string | null
          attachment_path: string | null
          attempts: number
          body: string
          channel: string
          check_in_id: string | null
          child_person_id: string | null
          claimed_at: string | null
          consent_signature_id: string | null
          created_at: string
          error: string | null
          id: string
          kids_session_id: string | null
          kind: string
          organization_id: string
          provider_message_id: string | null
          recipient_email: string | null
          recipient_name: string | null
          recipient_person_id: string | null
          recipient_phone: string | null
          sent_at: string | null
          sent_by_auth_user: string | null
          sent_by_name: string | null
          sent_by_person_id: string | null
          status: string
          subject: string | null
        }[]
        SetofOptions: {
          from: "*"
          to: "notification_log"
          isOneToOne: false
          isSetofReturn: true
        }
      }
      close_todays_sessions: {
        Args: { _organization_id: string }
        Returns: number
      }
      complete_notification: {
        Args: {
          _error?: string
          _id: string
          _ok: boolean
          _provider_message_id?: string
        }
        Returns: undefined
      }
      complete_workflow_card: {
        Args: { _card_id: string; _note?: string; _outcome?: string }
        Returns: Json
      }
      confirm_kids_purge: {
        Args: {
          _organization_id: string
          _reason: string
          _record_type: string
        }
        Returns: number
      }
      consent_document_digest: { Args: { _body: Json }; Returns: string }
      consent_document_sha256: { Args: { _body: Json }; Returns: string }
      consent_pdf_payload: { Args: { _signature_id: string }; Returns: Json }
      consent_pdf_signed_url: {
        Args: { _signature_id: string }
        Returns: {
          expires_in: number
          storage_path: string
        }[]
      }
      consent_pdfs_pending: {
        Args: { _limit?: number }
        Returns: {
          at: string
          household_id: string
          id: string
          kind: string
          organization_id: string
        }[]
      }
      current_consent_document: {
        Args: { _code?: string; _organization_id: string; _surface?: string }
        Returns: {
          body: Json
          body_sha256: string
          code: string
          document_id: string
          effective_from: string
          required_acknowledgments: string[]
          title: string
          version: number
        }[]
      }
      current_profile_name: { Args: never; Returns: string }
      delete_person_photo: { Args: { _photo_id: string }; Returns: string }
      delete_person_relationship: {
        Args: { _relationship_id: string }
        Returns: undefined
      }
      derive_allergy_label: { Args: { _allergies: string }; Returns: string }
      dispatch_consent_pdf: { Args: never; Returns: undefined }
      dispatch_kids_notifications: { Args: never; Returns: undefined }
      end_my_shift: { Args: { _kids_session_id: string }; Returns: number }
      end_pickup_permission: {
        Args: { _id: string; _kind: string }
        Returns: undefined
      }
      end_session_staff: { Args: { _staffing_id: string }; Returns: undefined }
      expire_stale_check_ins: { Args: never; Returns: number }
      family_link_candidates: {
        Args: { _person_id: string; _search?: string }
        Returns: {
          already_related: boolean
          first_name: string
          household_name: string
          id: string
          is_child: boolean
          last_name: string
        }[]
      }
      find_duplicate_person: {
        Args: {
          _birth_month: number
          _birth_year: number
          _email: string
          _first_name: string
          _last_name: string
          _organization_id: string
          _phone: string
        }
        Returns: {
          person_id: string
          reason: string
          tier: number
        }[]
      }
      generate_pickup_code: { Args: never; Returns: string }
      giving_batches_list: {
        Args: { _limit?: number; _organization_id: string }
        Returns: {
          created_at: string
          created_by_name: string
          entered_total_cents: number
          expected_total_cents: number
          gift_count: number
          id: string
          name: string
          notes: string
          posted_at: string
          posted_by_name: string
          received_on: string
          source: string
          status: string
          unmatched_count: number
          variance_cents: number
        }[]
      }
      giving_donations: {
        Args: {
          _batch_id?: string
          _fund_id?: string
          _limit?: number
          _offset?: number
          _only_unmatched?: boolean
          _organization_id: string
          _search?: string
          _year?: number
        }
        Returns: {
          amount_cents: number
          batch_id: string
          batch_name: string
          batch_status: string
          check_number: string
          donor_name: string
          donor_name_raw: string
          external_reference: string
          fee_cents: number
          fund_id: string
          fund_name: string
          household_id: string
          household_name: string
          id: string
          is_tax_deductible: boolean
          method: string
          note: string
          person_id: string
          received_on: string
          refunded_at: string
          source: string
          total_count: number
        }[]
      }
      giving_fund_totals: {
        Args: { _organization_id: string; _year: number }
        Returns: {
          donor_count: number
          fund_code: string
          fund_id: string
          fund_name: string
          gift_count: number
          total_cents: number
        }[]
      }
      giving_import_commit: {
        Args: { _batch_id: string; _organization_id: string; _rows: Json }
        Returns: Json
      }
      giving_import_dry_run: {
        Args: { _organization_id: string; _rows: Json }
        Returns: {
          amount_cents: number
          donor_name: string
          error: string
          external_reference: string
          fund_code: string
          is_duplicate: boolean
          match_confidence: string
          matched_name: string
          matched_person_id: string
          received_on: string
          row_number: number
        }[]
      }
      giving_match_donor: {
        Args: {
          _email?: string
          _name?: string
          _organization_id: string
          _phone?: string
        }
        Returns: {
          confidence: string
          display_name: string
          email: string
          household_id: string
          household_name: string
          person_id: string
          phone: string
        }[]
      }
      giving_overview: {
        Args: { _organization_id: string; _year: number }
        Returns: Json
      }
      giving_person_search: {
        Args: { _limit?: number; _organization_id: string; _term: string }
        Returns: {
          display_name: string
          email: string
          household_id: string
          household_name: string
          person_id: string
        }[]
      }
      giving_phone_key: { Args: { _phone: string }; Returns: string }
      giving_statement: {
        Args: {
          _household_id?: string
          _organization_id: string
          _person_id?: string
          _year: number
        }
        Returns: Json
      }
      giving_statement_recipients: {
        Args: { _min_cents?: number; _organization_id: string; _year: number }
        Returns: {
          address_line1: string
          address_line2: string
          city: string
          deductible_cents: number
          email: string
          gift_count: number
          household_id: string
          person_id: string
          postal_code: string
          recipient_name: string
          state: string
          total_cents: number
        }[]
      }
      has_live_kids_shift_in: {
        Args: { _organization_id: string }
        Returns: boolean
      }
      has_permission_in_org: {
        Args: {
          _organization_id: string
          _permissions: Database["church"]["Enums"]["module_permission"][]
        }
        Returns: boolean
      }
      hash_pickup: { Args: { _value: string }; Returns: string }
      household_contact_phone: {
        Args: { _household_id: string }
        Returns: string
      }
      household_summaries: {
        Args: { _organization_id: string }
        Returns: {
          adult_count: number
          child_count: number
          city: string
          household_id: string
          name: string
          primary_contact_name: string
          primary_phone: string
        }[]
      }
      i_am_an_adult_of: { Args: { _household_id: string }; Returns: boolean }
      import_commit: { Args: { _batch_id: string }; Returns: Json }
      import_dry_run: { Args: { _batch_id: string }; Returns: Json }
      incident_pdf_payload: { Args: { _incident_id: string }; Returns: Json }
      incident_pdf_signed_url: {
        Args: { _incident_id: string }
        Returns: {
          expires_in: number
          storage_path: string
        }[]
      }
      insert_person_from_json: {
        Args: {
          _actor_name: string
          _is_child: boolean
          _organization_id: string
          _p: Json
        }
        Returns: string
      }
      is_approved_collector: {
        Args: {
          _child_person_id: string
          _person_id: string
          _person_name?: string
        }
        Returns: boolean
      }
      is_kiosk_session: { Args: never; Returns: boolean }
      join_group: { Args: { _group_id: string }; Returns: string }
      join_ministry: { Args: { _ministry_id: string }; Returns: string }
      kids_add_incident_note: {
        Args: { _body: string; _incident_id: string }
        Returns: string
      }
      kids_attendance_report: {
        Args: { _from: string; _organization_id: string; _to: string }
        Returns: {
          age_band_name: string
          avg_minutes: number
          children: number
          first_time_visitors: number
          not_checked_out: number
          overrides: number
          room_name: string
          service_label: string
          session_date: string
          volunteers: number
        }[]
      }
      kids_auto_close_sessions: { Args: never; Returns: number }
      kids_auto_open_sessions: { Args: never; Returns: number }
      kids_batch_is_replayable: {
        Args: { _batch_id: string }
        Returns: boolean
      }
      kids_child_access_history: {
        Args: { _child_person_id: string }
        Returns: {
          actor_name: string
          record: string
          viewed_at: string
        }[]
      }
      kids_child_room_preferences: {
        Args: {
          _child_person_ids: string[]
          _kids_session_id?: string
          _shift_token?: string
        }
        Returns: {
          carried_years: number
          child_person_id: string
          room_id: string
          room_name: string
          set_at: string
          set_by_name: string
        }[]
      }
      kids_classroom_teacher_list: {
        Args: { _organization_id: string }
        Returns: {
          display_name: string
          id: string
          is_lead: boolean
          person_id: string
          phone: string
          role: string
          room_id: string
          room_name: string
        }[]
      }
      kids_close_room_in_session: {
        Args: { _kids_session_id: string; _room_id: string }
        Returns: undefined
      }
      kids_consent_coverage: {
        Args: { _organization_id: string }
        Returns: {
          children_covered: number
          children_no_household: number
          children_total: number
          children_uncovered: number
          households_signed: number
          households_total: number
          signatures_unreviewed: number
        }[]
      }
      kids_consent_gate: {
        Args: { _child_person_id: string; _kids_session_id?: string }
        Returns: {
          allow: boolean
          enforcing: boolean
          excepted: boolean
          refusal_code: string
          resign_due_by: string
          state: string
        }[]
      }
      kids_consent_needs_resigning: {
        Args: { _organization_id: string }
        Returns: {
          child_name: string
          child_person_id: string
          days_left: number
          household_id: string
          is_overdue: boolean
          medical_changed_at: string
          resign_due_by: string
          signature_id: string
          signed_at: string
        }[]
      }
      kids_consent_policy_for: {
        Args: { _organization_id: string }
        Returns: {
          enforce_from: string
          enforcing_now: boolean
          mode: string
          notice_text: string
          resign_grace_days: number
          updated_at: string
          updated_by_name: string
        }[]
      }
      kids_consent_resign_sweep: {
        Args: never
        Returns: {
          overdue: number
          reminded: number
        }[]
      }
      kids_decline_incident: {
        Args: { _incident_id: string; _reason: string }
        Returns: boolean
      }
      kids_dismiss_late_pickup: {
        Args: { _late_pickup_id: string; _reason: string }
        Returns: boolean
      }
      kids_eligible_volunteers: {
        Args: { _organization_id: string }
        Returns: {
          can_override: boolean
          display_name: string
          is_active: boolean
          may_not_serve_with_children: boolean
          on_kids_team: boolean
          person_id: string
          phone: string
          volunteer_id: string
        }[]
      }
      kids_exceptions_report: {
        Args: { _from: string; _organization_id: string; _to: string }
        Returns: {
          action: string
          actor_name: string
          category: string
          child_name: string
          occurred_at: string
          outcome: string
          reason: string
          room_name: string
          session_date: string
          total_count: number
        }[]
      }
      kids_expire_open_check_ins: {
        Args: {
          _kids_session_id?: string
          _note?: string
          _organization_id: string
        }
        Returns: {
          child_names: string[]
          expired_count: number
        }[]
      }
      kids_grant_consent_exception: {
        Args: {
          _child_person_id: string
          _kids_session_id: string
          _reason: string
        }
        Returns: string
      }
      kids_incident_detail: {
        Args: { _incident_id: string }
        Returns: {
          admin_summary: string
          child_name: string
          child_person_id: string
          decline_reason: string
          external_report_made: boolean
          external_report_note: string
          external_report_reference: string
          external_reported_at: string
          id: string
          occurred_on: string
          parent_message: string
          reported_at: string
          reported_by_name: string
          reported_narrative: string
          room_name: string
          sent_at: string
          severity: string
          signed_off_at: string
          signed_off_by_name: string
          status: string
        }[]
      }
      kids_incident_queue: {
        Args: { _include_settled?: boolean; _organization_id: string }
        Returns: {
          age_hours: number
          child_name: string
          child_person_id: string
          external_report_made: boolean
          id: string
          needs_reporting_answer: boolean
          note_count: number
          occurred_on: string
          reported_at: string
          reported_by_name: string
          room_name: string
          severity: string
          signed_off_at: string
          signed_off_by_name: string
          status: string
        }[]
      }
      kids_late_pickup_report: {
        Args: { _from: string; _organization_id: string; _to: string }
        Returns: {
          child_name: string
          child_person_id: string
          detected_at: string
          dismissed_reason: string
          id: string
          minutes_late: number
          parent_notified_at: string
          reviewed_by_name: string
          room_name: string
          session_date: string
          source: string
          status: string
          times_in_range: number
        }[]
      }
      kids_leader_orgs: { Args: never; Returns: string[] }
      kids_leader_room_ids: {
        Args: { _organization_id: string }
        Returns: string[]
      }
      kids_leader_sees_all_rooms: {
        Args: { _organization_id: string }
        Returns: boolean
      }
      kids_leaders_to_notify: {
        Args: { _organization_id: string }
        Returns: {
          email: string
          full_name: string
        }[]
      }
      kids_lift_check_in_hold: {
        Args: { _hold_id: string; _reason: string }
        Returns: boolean
      }
      kids_live_board: {
        Args: { _organization_id: string }
        Returns: {
          age_band_code: string
          age_band_name: string
          allergy_count: number
          capacity: number
          checked_in_count: number
          checked_out_count: number
          grade_name: string
          kids_session_id: string
          label_room_name: string
          misplaced_count: number
          over_capacity: boolean
          over_ratio: boolean
          ratio_children_per_volunteer: number
          restriction_count: number
          room_id: string
          room_name: string
          session_date: string
          session_label: string
          volunteer_count: number
        }[]
      }
      kids_live_hold_for: {
        Args: { _child_person_id: string; _kids_session_id: string }
        Returns: {
          child_person_id: string
          created_at: string
          expires_at: string
          id: string
          leaders_notified_at: string | null
          lifted_by: string | null
          lifted_by_name: string | null
          lifted_reason: string | null
          organization_id: string
          parent_notified_at: string | null
          raised_at: string
          raised_by: string | null
          raised_by_name: string
          reason: string
          serving_kids_session_id: string | null
          serving_session_date: string | null
          serving_started_at: string | null
          settled_at: string | null
          source: string
          source_late_pickup_id: string | null
          status: string
          updated_at: string
        }
        SetofOptions: {
          from: "*"
          to: "kids_check_in_holds"
          isOneToOne: true
          isSetofReturn: false
        }
      }
      kids_my_incidents: {
        Args: never
        Returns: {
          child_name: string
          decline_reason: string
          id: string
          note_count: number
          occurred_on: string
          reported_at: string
          reported_narrative: string
          room_name: string
          severity: string
          status: string
        }[]
      }
      kids_notification_log: {
        Args: { _from: string; _organization_id: string; _to: string }
        Returns: {
          attempts: number
          channel: string
          created_at: string
          destination: string
          error: string
          kind: string
          recipient_name: string
          sent_by_name: string
          status: string
          subject: string
        }[]
      }
      kids_notify_expired: {
        Args: {
          _actor: string
          _automatic: boolean
          _names: string[]
          _organization_id: string
        }
        Returns: number
      }
      kids_notify_incident_raised: {
        Args: { _incident_id: string }
        Returns: number
      }
      kids_notify_late_pickup: {
        Args: { _late_pickup_id: string; _message?: string }
        Returns: number
      }
      kids_open_room_in_session: {
        Args: {
          _capacity_override?: number
          _kids_session_id: string
          _room_id: string
        }
        Returns: undefined
      }
      kids_open_session: {
        Args: {
          _ends_at: string
          _kids_event_id: string
          _label: string
          _organization_id: string
          _reopen_closed?: boolean
          _session_date: string
          _starts_at: string
        }
        Returns: {
          session_id: string
          was_created: boolean
        }[]
      }
      kids_preferred_room_for_child: {
        Args: {
          _child_person_id: string
          _kids_session_id: string
          _organization_id: string
        }
        Returns: {
          carried_years: number
          room_id: string
        }[]
      }
      kids_raise_check_in_hold: {
        Args: {
          _child_person_id: string
          _reason: string
          _source_late_pickup_id?: string
        }
        Returns: string
      }
      kids_raise_incident: {
        Args: {
          _check_in_id?: string
          _child_person_id: string
          _kids_session_id?: string
          _narrative: string
          _occurred_on: string
          _room_id?: string
          _severity: string
        }
        Returns: string
      }
      kids_record_external_report: {
        Args: {
          _incident_id: string
          _made: boolean
          _note?: string
          _reference?: string
        }
        Returns: boolean
      }
      kids_record_late_pickup: {
        Args: { _check_in_id: string; _source: string }
        Returns: string
      }
      kids_records_due_for_purge: {
        Args: { _organization_id: string }
        Returns: {
          basis: string
          due_count: number
          held_count: number
          oldest: string
          record_type: string
          retain_forever: boolean
          retain_years: number
        }[]
      }
      kids_refusal_message: {
        Args: { _code: string; _first_name: string }
        Returns: string
      }
      kids_retention_sweep: { Args: never; Returns: number }
      kids_review_incident: { Args: { _incident_id: string }; Returns: boolean }
      kids_room_roster: {
        Args: { _kids_session_id: string; _room_id?: string }
        Returns: {
          assignment_reason: string
          check_in_id: string
          checked_in_at: string
          checked_in_by_name: string
          checked_out_at: string
          checked_out_by_name: string
          checkout_method: string
          child_name: string
          child_person_id: string
          dropped_off_by_name: string
          grade_name: string
          guardian_phone: string
          has_allergy: boolean
          has_restriction: boolean
          minutes_in_room: number
          picked_up_by_name: string
          room_id: string
          room_name: string
          status: string
          tag_number: number
        }[]
      }
      kids_send_incident_to_parent: {
        Args: { _incident_id: string; _source?: string }
        Returns: number
      }
      kids_sensitive_access_report: {
        Args: {
          _actor_auth_user_id?: string
          _child_person_id?: string
          _from: string
          _organization_id: string
          _record_type?: string
          _to: string
        }
        Returns: {
          actor_name: string
          child_name: string
          detail: Json
          record: string
          viewed_at: string
        }[]
      }
      kids_sensitive_access_summary: {
        Args: { _from: string; _organization_id: string; _to: string }
        Returns: {
          actor_auth_user_id: string
          actor_name: string
          children_seen: number
          first_read: string
          last_read: string
          on_days: number
          reads: number
          record_types: string[]
        }[]
      }
      kids_serve_hold: {
        Args: {
          _actor_name: string
          _hold_id: string
          _kids_session_id: string
        }
        Returns: boolean
      }
      kids_session_tick: { Args: never; Returns: undefined }
      kids_set_child_room_preference: {
        Args: {
          _child_person_id: string
          _room_id?: string
          _shift_token?: string
        }
        Returns: undefined
      }
      kids_set_incident_severity: {
        Args: { _incident_id: string; _severity: string; _why?: string }
        Returns: boolean
      }
      kids_set_legal_hold: {
        Args: {
          _hold: boolean
          _reason?: string
          _record_id: string
          _record_type: string
        }
        Returns: undefined
      }
      kids_set_station_active: {
        Args: { _is_active: boolean; _station_id: string }
        Returns: undefined
      }
      kids_settle_holds: { Args: never; Returns: number }
      kids_sign_off_incident: {
        Args: { _admin_summary?: string; _incident_id: string }
        Returns: boolean
      }
      kids_stations: {
        Args: { _organization_id: string }
        Returns: {
          code: string
          device_type: string
          is_active: boolean
          last_seen_at: string
          location_note: string
          name: string
          seen_today: boolean
          station_id: string
        }[]
      }
      kids_still_here: {
        Args: { _organization_id: string }
        Returns: {
          check_in_id: string
          checked_in_at: string
          child_name: string
          child_person_id: string
          guardian_name: string
          guardian_phone: string
          has_allergy: boolean
          has_restriction: boolean
          minutes_in_room: number
          room_name: string
          session_date: string
          session_label: string
          session_status: string
          tag_number: number
        }[]
      }
      kids_sync_session_rooms: {
        Args: { _kids_session_id: string }
        Returns: {
          rooms_attached: number
          rooms_closed: number
        }[]
      }
      kiosk_active_station: {
        Args: { _org: string; _station_id: string }
        Returns: string
      }
      kiosk_find_household_by_phone: {
        Args: { _kids_session_id: string; _phone: string; _station_id?: string }
        Returns: {
          already_checked_in: boolean
          child_name: string
          child_person_id: string
          grade_name: string
          household_id: string
          household_name: string
          photo_path: string
        }[]
      }
      kiosk_register_station: {
        Args: {
          _code: string
          _device_type?: string
          _location_note?: string
          _name: string
        }
        Returns: {
          station_id: string
          station_name: string
        }[]
      }
      kiosk_session_bootstrap:
        | {
            Args: { _station_id?: string }
            Returns: {
              kids_session_id: string
              open_room_count: number
              session_date: string
              session_label: string
              station_known: boolean
              station_name: string
              status: string
            }[]
          }
        | {
            Args: { _station_id?: string; _today?: string }
            Returns: {
              kids_session_id: string
              open_room_count: number
              session_date: string
              session_label: string
              station_known: boolean
              station_name: string
              status: string
            }[]
          }
      leave_group: { Args: { _membership_id: string }; Returns: undefined }
      leave_ministry: { Args: { _assignment_id: string }; Returns: undefined }
      link_profile_to_person: {
        Args: { _person_id: string; _profile_id: string }
        Returns: undefined
      }
      mask_email: { Args: { _email: string }; Returns: string }
      may_edit_child_medical: {
        Args: { _child_person_id: string }
        Returns: boolean
      }
      my_admin_orgs: { Args: never; Returns: string[] }
      my_child_medical: {
        Args: { _child_person_id: string }
        Returns: {
          allergies: string
          allergy_severity: string
          child_name: string
          child_person_id: string
          has_record: boolean
          medical_notes: string
          medications: string
          special_needs: string
          special_needs_flag: boolean
          updated_at: string
          updated_by_name: string
        }[]
      }
      my_children: {
        Args: never
        Returns: {
          birth_month: number
          birth_year: number
          display_name: string
          first_name: string
          grade_name: string
          household_id: string
          household_name: string
          last_name: string
          organization_id: string
          person_id: string
          preferred_name: string
          school_grade_id: string
        }[]
      }
      my_children_check_ins: {
        Args: { _limit?: number }
        Returns: {
          check_in_id: string
          checked_in_at: string
          checked_out_at: string
          child_name: string
          child_person_id: string
          picked_up_by_name: string
          room_name: string
          service_label: string
          session_date: string
          status: string
        }[]
      }
      my_current_shift: {
        Args: { _kids_session_id: string }
        Returns: {
          role: string
          room_id: string
          room_name: string
          staffing_id: string
        }[]
      }
      my_family: {
        Args: never
        Returns: {
          editable: boolean
          first_name: string
          is_child: boolean
          last_name: string
          person_id: string
          related_person_id: string
          relationship_code: string
          relationship_id: string
          relationship_name: string
        }[]
      }
      my_giving: {
        Args: { _year?: number }
        Returns: {
          amount_cents: number
          fund_name: string
          id: string
          is_tax_deductible: boolean
          method: string
          note: string
          received_on: string
        }[]
      }
      my_giving_years: {
        Args: never
        Returns: {
          gift_count: number
          tax_year: number
          total_cents: number
        }[]
      }
      my_group_options: {
        Args: { _organization_id: string }
        Returns: {
          already_member: boolean
          description: string
          group_id: string
          group_type: string
          meeting_day: string
          meeting_time: string
          member_count: number
          name: string
          room_name: string
        }[]
      }
      my_groups: {
        Args: never
        Returns: {
          group_name: string
          group_type: string
          is_leadership_role: boolean
          meeting_day: string
          meeting_place: string
          meeting_time: string
          membership_id: string
          organization_id: string
          role_name: string
        }[]
      }
      my_household_detail: {
        Args: never
        Returns: {
          address_line1: string
          address_line2: string
          city: string
          household_id: string
          i_can_edit: boolean
          name: string
          organization_id: string
          postal_code: string
          primary_phone: string
          state: string
        }[]
      }
      my_household_ids: { Args: never; Returns: string[] }
      my_household_members: {
        Args: never
        Returns: {
          birth_month: number
          birth_year: number
          display_name: string
          email: string
          household_role: string
          is_child: boolean
          is_me: boolean
          is_primary_contact: boolean
          person_id: string
          phone: string
        }[]
      }
      my_ministry_options: {
        Args: { _organization_id: string }
        Returns: {
          already_serving: boolean
          ministry_id: string
          name: string
        }[]
      }
      my_orgs: { Args: never; Returns: string[] }
      my_orgs_with_any: {
        Args: {
          _permissions: Database["church"]["Enums"]["module_permission"][]
        }
        Returns: string[]
      }
      my_person_ids: { Args: never; Returns: string[] }
      my_person_in_org: { Args: { _organization_id: string }; Returns: string }
      my_portal_summary: { Args: { _organization_id: string }; Returns: Json }
      my_serving: {
        Args: never
        Returns: {
          assignment_id: string
          is_leadership_role: boolean
          is_primary_role: boolean
          ministry_name: string
          organization_id: string
          role_name: string
          start_date: string
        }[]
      }
      my_statement: {
        Args: { _organization_id: string; _year: number }
        Returns: Json
      }
      my_workflow_cards: {
        Args: { _organization_id: string }
        Returns: {
          card_id: string
          due_on: string
          is_overdue: boolean
          person_name: string
          person_phone: string
          status: string
          step_name: string
          workflow_id: string
          workflow_name: string
        }[]
      }
      non_leadership_role: {
        Args: { _organization_id: string; _preferred_code: string }
        Returns: string
      }
      normalize_pickup_code: { Args: { _raw: string }; Returns: string }
      notify_targets_for_child: {
        Args: {
          _channel?: string
          _child_person_id: string
          _dropped_off_by?: string
        }
        Returns: {
          email: string
          name: string
          person_id: string
          phone: string
        }[]
      }
      open_todays_session: {
        Args: { _organization_id: string; _service_label?: string }
        Returns: {
          rooms_attached: number
          rooms_closed: number
          service_label: string
          session_id: string
          was_created: boolean
        }[]
      }
      org_people_for_grants: {
        Args: { _organization_id: string }
        Returns: {
          app_role: string
          email: string
          full_name: string
          is_org_admin: boolean
          permissions: Database["church"]["Enums"]["module_permission"][]
          person_id: string
          user_id: string
        }[]
      }
      person_field_diff: {
        Args: {
          _after: Database["church"]["Tables"]["people"]["Row"]
          _before: Database["church"]["Tables"]["people"]["Row"]
          _patch: Json
        }
        Returns: {
          field: string
          new_value: string
          old_value: string
        }[]
      }
      person_photos_for: {
        Args: { _person_ids: string[] }
        Returns: {
          is_primary: boolean
          person_id: string
          photo_id: string
          slot: number
          storage_path: string
        }[]
      }
      pick_room_for_child: {
        Args: {
          _child_person_id: string
          _kids_session_id: string
          _organization_id: string
        }
        Returns: {
          reason: string
          room_id: string
        }[]
      }
      post_giving_batch: { Args: { _batch_id: string }; Returns: Json }
      preview_profile_backfill: {
        Args: { _organization_id: string }
        Returns: {
          action: string
          email: string
          full_name: string
          matched_person_id: string
          matched_person_name: string
          profile_id: string
        }[]
      }
      publish_consent_document: {
        Args: {
          _body: Json
          _code: string
          _effective_from?: string
          _organization_id: string
          _required_acknowledgments?: string[]
          _title: string
        }
        Returns: {
          body_sha256: string
          document_id: string
          retired_version: number
          version: number
        }[]
      }
      queue_child_notification: {
        Args: {
          _attachment_bucket?: string
          _attachment_filename?: string
          _attachment_path?: string
          _body: string
          _channel?: string
          _check_in_id: string
          _kind: string
          _sent_by_name?: string
          _sent_by_person_id?: string
          _subject?: string
        }
        Returns: number
      }
      queue_consent_notifications: {
        Args: { _signature_id: string }
        Returns: number
      }
      queue_missing_consent_notifications: { Args: never; Returns: number }
      queue_pickup_code_sms: {
        Args: { _batch_id: string; _code: string }
        Returns: number
      }
      record_consent_pdf: {
        Args: {
          _bytes: number
          _error?: string
          _sha256: string
          _signature_id: string
          _storage_path: string
        }
        Returns: undefined
      }
      record_consent_review: {
        Args: { _signature_id: string }
        Returns: undefined
      }
      record_incident_pdf: {
        Args: {
          _error?: string
          _incident_id: string
          _sha256: string
          _storage_path: string
        }
        Returns: undefined
      }
      refresh_child_allergy_flags: {
        Args: { _person_id: string }
        Returns: number
      }
      register_member_family: {
        Args: {
          _children?: Json
          _emergency_contacts?: Json
          _household?: Json
          _organization_id: string
          _person: Json
          _service_interest_ministry_ids?: string[]
          _spouse?: Json
        }
        Returns: {
          out_child_count: number
          out_household_id: string
          out_person_id: string
          out_spouse_person_id: string
        }[]
      }
      register_new_member: {
        Args: {
          _auth_user_id: string
          _email: string
          _first_name: string
          _last_name: string
          _organization_id: string
          _phone: string
        }
        Returns: string
      }
      registering_themselves: {
        Args: { _organization_id: string }
        Returns: boolean
      }
      remove_classroom_teacher: { Args: { _id: string }; Returns: undefined }
      remove_workflow_card: {
        Args: { _card_id: string; _reason?: string }
        Returns: undefined
      }
      reopen_workflow_card: {
        Args: { _card_id: string; _note?: string }
        Returns: undefined
      }
      reprint_pickup_label: {
        Args: { _batch_id: string; _reason?: string; _shift_token?: string }
        Returns: {
          allergy_label: string
          batch_id: string
          check_in_id: string
          child_name: string
          guardian_phone: string
          household_name: string
          pickup_code: string
          pickup_token: string
          room_name: string
          tag_number: number
        }[]
      }
      resolve_actor: {
        Args: { _shift_token?: string }
        Returns: Database["church"]["CompositeTypes"]["resolved_actor"]
        SetofOptions: {
          from: "*"
          to: "resolved_actor"
          isOneToOne: true
          isSetofReturn: false
        }
      }
      resolve_pickup: {
        Args: {
          _kids_session_id: string
          _presented: string
          _shift_token?: string
        }
        Returns: {
          batch_id: string
          check_in_id: string
          child_name: string
          child_person_id: string
          has_restriction: boolean
          room_name: string
          status: string
          tag_number: number
        }[]
      }
      restrict_pickup: {
        Args: {
          _child_person_id: string
          _person_id?: string
          _person_name?: string
          _reason?: string
        }
        Returns: string
      }
      restriction_names_person: {
        Args: {
          _child_person_id: string
          _person_id: string
          _person_name?: string
        }
        Returns: boolean
      }
      retire_kids_classroom: {
        Args: { _organization_id: string; _room_id: string }
        Returns: undefined
      }
      revoke_kids_consent: {
        Args: { _reason?: string; _signature_id: string }
        Returns: undefined
      }
      school_year_of: { Args: { _d: string }; Returns: number }
      screen_children_for_check_in: {
        Args: {
          _child_person_ids: string[]
          _kids_session_id?: string
          _shift_token?: string
        }
        Returns: {
          allow: boolean
          child_name: string
          child_person_id: string
          enforce_from: string
          enforcing: boolean
          excepted: boolean
          household_id: string
          notice_text: string
          policy_mode: string
          refusal_code: string
          resign_due_by: string
          state: string
        }[]
      }
      send_parent_message: {
        Args: { _check_in_id: string; _message: string; _shift_token?: string }
        Returns: {
          channel: string
          destination: string
          recipient_name: string
          status: string
        }[]
      }
      set_child_sensitive_from_json: {
        Args: {
          _actor: string
          _child: Json
          _organization_id: string
          _person_id: string
        }
        Returns: undefined
      }
      set_consent_resign_grace: {
        Args: { _days: number; _organization_id: string }
        Returns: undefined
      }
      set_kids_consent_mode: {
        Args: {
          _enforce_from?: string
          _mode: string
          _notice_text?: string
          _organization_id: string
        }
        Returns: undefined
      }
      set_module_grants: {
        Args: {
          _organization_id: string
          _permissions: Database["church"]["Enums"]["module_permission"][]
          _user_id: string
        }
        Returns: Database["church"]["Enums"]["module_permission"][]
      }
      set_person_relationship: {
        Args: {
          _person_id: string
          _related_person_id: string
          _relationship_type_id: string
        }
        Returns: string
      }
      set_primary_photo: { Args: { _photo_id: string }; Returns: undefined }
      set_room_kids_config: {
        Args: {
          _capacity?: number
          _is_checkin_location: boolean
          _kids_age_band_id?: string
          _label_room_name?: string
          _ratio?: number
          _room_id: string
          _sort_order?: number
        }
        Returns: {
          capacity: number | null
          created_at: string
          is_active: boolean
          is_checkin_location: boolean
          kids_age_band_id: string | null
          label_room_name: string | null
          organization_id: string
          ratio_children_per_volunteer: number | null
          room_id: string
          school_grade_id: string | null
          sort_order: number
          updated_at: string
        }
        SetofOptions: {
          from: "*"
          to: "room_kids_config"
          isOneToOne: true
          isSetofReturn: false
        }
      }
      set_volunteer_pin: {
        Args: { _pin: string; _volunteer_id: string }
        Returns: undefined
      }
      sign_kids_consent: {
        Args: {
          _answers?: Json
          _child_person_ids: string[]
          _client_ip_reported?: string
          _household_id: string
          _organization_id: string
          _per_child_answers?: Json
          _secondary_printed_name?: string
          _secondary_signer_person_id?: string
          _signer_person_id: string
          _signer_printed_name: string
          _signer_relationship?: string
          _source: string
          _user_agent?: string
          _witness_station_id?: string
        }
        Returns: {
          children_named: number
          document_sha256: string
          document_version: number
          signature_id: string
          superseded_signature_id: string
        }[]
      }
      snooze_workflow_card: {
        Args: { _card_id: string; _note?: string; _until: string }
        Returns: undefined
      }
      start_my_shift: {
        Args: { _kids_session_id: string; _role?: string; _room_id?: string }
        Returns: {
          created_at: string
          ended_at: string | null
          id: string
          kids_session_id: string
          organization_id: string
          person_id: string
          role: string
          room_id: string | null
          started_at: string
          updated_at: string
          was_background_check_current: boolean | null
        }
        SetofOptions: {
          from: "*"
          to: "kids_session_staffing"
          isOneToOne: true
          isSetofReturn: false
        }
      }
      station_child_consent_prefill: {
        Args: { _child_person_ids: string[]; _shift_token?: string }
        Returns: {
          allergies: string
          allergy_severity: string
          child_name: string
          child_person_id: string
          has_record: boolean
          medications: string
          special_needs: string
        }[]
      }
      station_child_safety_card: {
        Args: { _check_in_id: string; _shift_token?: string }
        Returns: {
          allergies: string
          allergy_severity: string
          child_name: string
          contacts: Json
          emergency_name: string
          emergency_phone: string
          medications: string
          special_needs: string
        }[]
      }
      station_classroom_grades: {
        Args: { _shift_token?: string }
        Returns: {
          grade_name: string
          room_id: string
          room_name: string
          school_grade_id: string
          sort_order: number
        }[]
      }
      station_close_shift: {
        Args: { _shift_token: string }
        Returns: undefined
      }
      station_consent_signers: {
        Args: { _child_person_id: string; _shift_token?: string }
        Returns: {
          full_name: string
          has_email: boolean
          household_id: string
          person_id: string
        }[]
      }
      station_find_batch_for_reprint: {
        Args: {
          _kids_session_id?: string
          _query: string
          _shift_token?: string
        }
        Returns: {
          batch_id: string
          checked_in_at: string
          children: string
          household_name: string
          masked_phone: string
        }[]
      }
      station_household_adults: {
        Args: { _household_id: string; _shift_token?: string }
        Returns: {
          display_name: string
          is_primary_contact: boolean
          masked_phone: string
          person_id: string
          relationship: string
        }[]
      }
      station_list_volunteers: {
        Args: { _station_id: string }
        Returns: {
          display_name: string
          volunteer_id: string
        }[]
      }
      station_open_shift: {
        Args: {
          _duration_minutes?: number
          _pin: string
          _station_id: string
          _volunteer_id: string
        }
        Returns: {
          can_override: boolean
          expires_at: string
          shift_token: string
          volunteer_name: string
        }[]
      }
      station_pickup_candidates: {
        Args: { _check_in_id: string; _shift_token?: string }
        Returns: {
          child_has_restriction: boolean
          display_name: string
          dropped_off: boolean
          is_authorized: boolean
          is_guardian: boolean
          person_id: string
          relationship: string
        }[]
      }
      station_register_visitor_family: {
        Args: { _children: Json; _guardian: Json; _shift_token?: string }
        Returns: {
          child_display_name: string
          child_person_id: string
          guardian_person_id: string
          household_id: string
          household_name: string
        }[]
      }
      station_room_roster: {
        Args: {
          _kids_session_id: string
          _room_id?: string
          _shift_token?: string
        }
        Returns: {
          check_in_id: string
          checked_in_at: string
          child_display_name: string
          has_allergy: boolean
          has_restriction: boolean
          minutes_in_room: number
          room_id: string
          room_name: string
          tag_number: number
        }[]
      }
      station_search_households: {
        Args: {
          _kids_session_id: string
          _query: string
          _shift_token?: string
        }
        Returns: {
          age_band_code: string
          already_checked_in: boolean
          child_display_name: string
          child_person_id: string
          grade_name: string
          household_id: string
          household_name: string
          masked_phone: string
          needs_staff: boolean
        }[]
      }
      station_session_rooms: {
        Args: { _kids_session_id: string; _shift_token?: string }
        Returns: {
          age_band_name: string
          capacity: number
          checked_in_count: number
          grade_name: string
          room_id: string
          room_name: string
          teachers: string
        }[]
      }
      station_sign_consent: {
        Args: {
          _answers: Json
          _child_person_ids: string[]
          _household_id: string
          _per_child_answers?: Json
          _shift_token?: string
          _signer_person_id: string
          _signer_printed_name: string
          _signer_relationship?: string
        }
        Returns: {
          children_named: number
          signature_id: string
        }[]
      }
      transfer_child: {
        Args: {
          _check_in_id: string
          _reason?: string
          _shift_token?: string
          _to_room_id: string
        }
        Returns: undefined
      }
      unlinked_logins: {
        Args: { _organization_id: string }
        Returns: {
          email: string
          full_name: string
          profile_id: string
        }[]
      }
      update_child_medical: {
        Args: {
          _allergies?: string
          _allergy_severity?: string
          _child_person_id: string
          _medical_notes?: string
          _medications?: string
          _no_known_conditions?: boolean
          _special_needs?: string
        }
        Returns: {
          allergy_label: string
          changed: boolean
          consent_now_stale: boolean
          resign_due_by: string
        }[]
      }
      update_my_child: {
        Args: { _child_id: string; _patch: Json }
        Returns: {
          accepted_lord_is_approximate: boolean
          accepted_lord_month: number | null
          accepted_lord_year: number | null
          amharic_name: string | null
          birth_month: number | null
          birth_year: number | null
          created_at: string
          created_by: string | null
          created_by_name: string | null
          deceased: boolean
          email: string | null
          first_name: string
          gender: string | null
          id: string
          inactive_reason: string | null
          is_active: boolean
          is_child: boolean
          last_name: string
          marital_status: string | null
          member_number: string | null
          member_since: string | null
          membership_status_id: string | null
          merged_into_person_id: string | null
          middle_name: string | null
          notes: string | null
          notify_by_email: boolean
          notify_by_sms: boolean
          organization_id: string
          phone: string | null
          phone_digits: string | null
          photo_path: string | null
          preferred_name: string | null
          profile_id: string | null
          school_grade_id: string | null
          search_name: string | null
          sms_consent_at: string | null
          sms_opted_out_at: string | null
          updated_at: string
        }
        SetofOptions: {
          from: "*"
          to: "people"
          isOneToOne: true
          isSetofReturn: false
        }
      }
      update_my_contact_details: {
        Args: { _email: string; _person_id: string; _phone: string }
        Returns: {
          accepted_lord_is_approximate: boolean
          accepted_lord_month: number | null
          accepted_lord_year: number | null
          amharic_name: string | null
          birth_month: number | null
          birth_year: number | null
          created_at: string
          created_by: string | null
          created_by_name: string | null
          deceased: boolean
          email: string | null
          first_name: string
          gender: string | null
          id: string
          inactive_reason: string | null
          is_active: boolean
          is_child: boolean
          last_name: string
          marital_status: string | null
          member_number: string | null
          member_since: string | null
          membership_status_id: string | null
          merged_into_person_id: string | null
          middle_name: string | null
          notes: string | null
          notify_by_email: boolean
          notify_by_sms: boolean
          organization_id: string
          phone: string | null
          phone_digits: string | null
          photo_path: string | null
          preferred_name: string | null
          profile_id: string | null
          school_grade_id: string | null
          search_name: string | null
          sms_consent_at: string | null
          sms_opted_out_at: string | null
          updated_at: string
        }
        SetofOptions: {
          from: "*"
          to: "people"
          isOneToOne: true
          isSetofReturn: false
        }
      }
      update_my_household: {
        Args: { _household_id: string; _patch: Json }
        Returns: {
          address_line1: string | null
          address_line2: string | null
          city: string | null
          country: string | null
          created_at: string
          created_by: string | null
          created_by_name: string | null
          id: string
          is_active: boolean
          name: string
          notes: string | null
          organization_id: string
          postal_code: string | null
          primary_phone: string | null
          state: string | null
          updated_at: string
        }
        SetofOptions: {
          from: "*"
          to: "households"
          isOneToOne: true
          isSetofReturn: false
        }
      }
      update_person_details: {
        Args: { _patch: Json; _person_id: string }
        Returns: {
          accepted_lord_is_approximate: boolean
          accepted_lord_month: number | null
          accepted_lord_year: number | null
          amharic_name: string | null
          birth_month: number | null
          birth_year: number | null
          created_at: string
          created_by: string | null
          created_by_name: string | null
          deceased: boolean
          email: string | null
          first_name: string
          gender: string | null
          id: string
          inactive_reason: string | null
          is_active: boolean
          is_child: boolean
          last_name: string
          marital_status: string | null
          member_number: string | null
          member_since: string | null
          membership_status_id: string | null
          merged_into_person_id: string | null
          middle_name: string | null
          notes: string | null
          notify_by_email: boolean
          notify_by_sms: boolean
          organization_id: string
          phone: string | null
          phone_digits: string | null
          photo_path: string | null
          preferred_name: string | null
          profile_id: string | null
          school_grade_id: string | null
          search_name: string | null
          sms_consent_at: string | null
          sms_opted_out_at: string | null
          updated_at: string
        }
        SetofOptions: {
          from: "*"
          to: "people"
          isOneToOne: true
          isSetofReturn: false
        }
      }
      upsert_household_by_name: {
        Args: { _actor: string; _name: string; _organization_id: string }
        Returns: string
      }
      upsert_kids_classroom: {
        Args: {
          _capacity?: number
          _is_checkin_location?: boolean
          _kids_age_band_id?: string
          _label_room_name?: string
          _name?: string
          _organization_id: string
          _ratio?: number
          _room_id?: string
          _school_grade_id?: string
          _sort_order?: number
        }
        Returns: {
          capacity: number | null
          created_at: string
          is_active: boolean
          is_checkin_location: boolean
          kids_age_band_id: string | null
          label_room_name: string | null
          organization_id: string
          ratio_children_per_volunteer: number | null
          room_id: string
          school_grade_id: string | null
          sort_order: number
          updated_at: string
        }
        SetofOptions: {
          from: "*"
          to: "room_kids_config"
          isOneToOne: true
          isSetofReturn: false
        }
      }
      upsert_person_sensitive: {
        Args: {
          _allergies?: string
          _allergy_label_short?: string
          _allergy_severity?: string
          _medical_notes?: string
          _medications?: string
          _person_id: string
          _photo_consent?: boolean
          _special_needs?: string
        }
        Returns: {
          allergies: string | null
          allergy_label_short: string | null
          allergy_severity: string
          created_at: string
          medical_notes: string | null
          medications: string | null
          organization_id: string
          person_id: string
          photo_consent: boolean
          special_needs: string | null
          special_needs_flag: boolean
          updated_at: string
          updated_by: string | null
          updated_by_name: string | null
        }
        SetofOptions: {
          from: "*"
          to: "person_sensitive"
          isOneToOne: true
          isSetofReturn: false
        }
      }
      uuid_or_null: { Args: { _text: string }; Returns: string }
      wake_snoozed_workflow_cards: {
        Args: { _organization_id: string }
        Returns: number
      }
      withdraw_child_consent: {
        Args: {
          _child_person_id: string
          _reason?: string
          _signature_id: string
        }
        Returns: undefined
      }
      workflow_board: {
        Args: {
          _include_closed?: boolean
          _only_mine?: boolean
          _organization_id: string
          _workflow_id: string
        }
        Returns: {
          assignee_name: string
          assignee_person_id: string
          card_id: string
          created_at: string
          days_in_step: number
          due_on: string
          household_name: string
          is_overdue: boolean
          last_activity_at: string
          last_note: string
          outcome: string
          person_email: string
          person_id: string
          person_name: string
          person_phone: string
          snooze_until: string
          status: string
          step_id: string
          step_name: string
          step_sequence: number
        }[]
      }
      workflow_card_history: {
        Args: { _card_id: string }
        Returns: {
          actor_name: string
          assignee_name: string
          body: string
          created_at: string
          from_step_name: string
          id: string
          kind: string
          to_step_name: string
        }[]
      }
      workflow_due_date: { Args: { _step_id: string }; Returns: string }
      workflow_summaries: {
        Args: { _organization_id: string }
        Returns: {
          auto_add_on_status_code: string
          category: string
          completed_30d: number
          description: string
          is_active: boolean
          my_count: number
          name: string
          open_count: number
          overdue_count: number
          snoozed_count: number
          step_count: number
          workflow_id: string
        }[]
      }
    }
    Enums: {
      module_permission:
        | "members_admin"
        | "members_viewer"
        | "members_import"
        | "kids_admin"
        | "kids_volunteer"
        | "leadership_viewer"
        | "kids_leader"
        | "giving_admin"
        | "giving_viewer"
    }
    CompositeTypes: {
      claim_verdict: {
        outcome: string | null
        person_id: string | null
        auth_user_id: string | null
        masked_email: string | null
      }
      resolved_actor: {
        organization_id: string | null
        person_id: string | null
        volunteer_id: string | null
        station_id: string | null
        actor_name: string | null
        source: string | null
        can_check_in: boolean | null
        can_check_out: boolean | null
        can_override: boolean | null
      }
    }
  }
  inventory: {
    Tables: {
      asset: {
        Row: {
          acquisition_cost: number
          acquisition_date: string
          approved_by: string | null
          asset_description: string
          asset_status: string
          asset_tag_number: string
          category: string
          church_branch_id: string
          created_at: string | null
          current_condition: string
          date_of_entry: string
          depreciation_method: string | null
          estimated_useful_life_years: number | null
          id: string
          last_verified_date: string | null
          ministry_assigned: string | null
          model_or_serial_number: string | null
          physical_location: string
          prepared_by: string
          quantity: number
          remarks: string | null
          responsible_ministry_leader: string | null
          reviewed_by: string | null
          unit_of_measure: string
          updated_at: string | null
          updated_by: string | null
        }
        Insert: {
          acquisition_cost: number
          acquisition_date: string
          approved_by?: string | null
          asset_description: string
          asset_status?: string
          asset_tag_number: string
          category: string
          church_branch_id: string
          created_at?: string | null
          current_condition: string
          date_of_entry?: string
          depreciation_method?: string | null
          estimated_useful_life_years?: number | null
          id?: string
          last_verified_date?: string | null
          ministry_assigned?: string | null
          model_or_serial_number?: string | null
          physical_location: string
          prepared_by: string
          quantity?: number
          remarks?: string | null
          responsible_ministry_leader?: string | null
          reviewed_by?: string | null
          unit_of_measure?: string
          updated_at?: string | null
          updated_by?: string | null
        }
        Update: {
          acquisition_cost?: number
          acquisition_date?: string
          approved_by?: string | null
          asset_description?: string
          asset_status?: string
          asset_tag_number?: string
          category?: string
          church_branch_id?: string
          created_at?: string | null
          current_condition?: string
          date_of_entry?: string
          depreciation_method?: string | null
          estimated_useful_life_years?: number | null
          id?: string
          last_verified_date?: string | null
          ministry_assigned?: string | null
          model_or_serial_number?: string | null
          physical_location?: string
          prepared_by?: string
          quantity?: number
          remarks?: string | null
          responsible_ministry_leader?: string | null
          reviewed_by?: string | null
          unit_of_measure?: string
          updated_at?: string | null
          updated_by?: string | null
        }
        Relationships: []
      }
      disposal_history: {
        Row: {
          approved_at: string | null
          approved_by: string | null
          asset_id: string
          created_at: string | null
          disposal_date: string
          disposal_method: string
          disposal_value: number
          id: string
          rejected_at: string | null
          rejected_by: string | null
          remarks: string | null
          requested_by: string
          reviewed_at: string | null
          reviewed_by: string | null
        }
        Insert: {
          approved_at?: string | null
          approved_by?: string | null
          asset_id: string
          created_at?: string | null
          disposal_date: string
          disposal_method: string
          disposal_value: number
          id?: string
          rejected_at?: string | null
          rejected_by?: string | null
          remarks?: string | null
          requested_by: string
          reviewed_at?: string | null
          reviewed_by?: string | null
        }
        Update: {
          approved_at?: string | null
          approved_by?: string | null
          asset_id?: string
          created_at?: string | null
          disposal_date?: string
          disposal_method?: string
          disposal_value?: number
          id?: string
          rejected_at?: string | null
          rejected_by?: string | null
          remarks?: string | null
          requested_by?: string
          reviewed_at?: string | null
          reviewed_by?: string | null
        }
        Relationships: [
          {
            foreignKeyName: "disposal_history_asset_id_fkey"
            columns: ["asset_id"]
            isOneToOne: false
            referencedRelation: "asset"
            referencedColumns: ["id"]
          },
        ]
      }
      transfer_history: {
        Row: {
          approved_by: string | null
          asset_id: string
          created_at: string | null
          id: string
          new_location: string
          new_ministry: string
          previous_location: string
          previous_ministry: string
          remarks: string | null
          requested_by: string
          transfer_date: string | null
        }
        Insert: {
          approved_by?: string | null
          asset_id: string
          created_at?: string | null
          id?: string
          new_location: string
          new_ministry: string
          previous_location: string
          previous_ministry: string
          remarks?: string | null
          requested_by: string
          transfer_date?: string | null
        }
        Update: {
          approved_by?: string | null
          asset_id?: string
          created_at?: string | null
          id?: string
          new_location?: string
          new_ministry?: string
          previous_location?: string
          previous_ministry?: string
          remarks?: string | null
          requested_by?: string
          transfer_date?: string | null
        }
        Relationships: [
          {
            foreignKeyName: "transfer_history_asset_id_fkey"
            columns: ["asset_id"]
            isOneToOne: false
            referencedRelation: "asset"
            referencedColumns: ["id"]
          },
        ]
      }
      verification_history: {
        Row: {
          asset_id: string
          condition: string
          created_at: string | null
          id: string
          physical_location_at_verification: string
          remarks: string | null
          verification_date: string
          verified_by: string
        }
        Insert: {
          asset_id: string
          condition: string
          created_at?: string | null
          id?: string
          physical_location_at_verification: string
          remarks?: string | null
          verification_date: string
          verified_by: string
        }
        Update: {
          asset_id?: string
          condition?: string
          created_at?: string | null
          id?: string
          physical_location_at_verification?: string
          remarks?: string | null
          verification_date?: string
          verified_by?: string
        }
        Relationships: [
          {
            foreignKeyName: "verification_history_asset_id_fkey"
            columns: ["asset_id"]
            isOneToOne: false
            referencedRelation: "asset"
            referencedColumns: ["id"]
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
      [_ in never]: never
    }
    CompositeTypes: {
      [_ in never]: never
    }
  }
  public: {
    Tables: {
      church_branch: {
        Row: {
          contact_info: string | null
          created_at: string | null
          id: string
          is_active: boolean
          location: string | null
          name: string
          updated_at: string | null
        }
        Insert: {
          contact_info?: string | null
          created_at?: string | null
          id?: string
          is_active?: boolean
          location?: string | null
          name: string
          updated_at?: string | null
        }
        Update: {
          contact_info?: string | null
          created_at?: string | null
          id?: string
          is_active?: boolean
          location?: string | null
          name?: string
          updated_at?: string | null
        }
        Relationships: []
      }
      events: {
        Row: {
          created_at: string
          created_by: string
          description: string | null
          ends_at: string
          id: string
          is_recurring: boolean | null
          organization_id: string
          parent_event_id: string | null
          recurrence_end_date: string | null
          recurrence_rule: string | null
          reviewer_id: string | null
          reviewer_notes: string | null
          room_allows_overlap: boolean
          room_id: string
          starts_at: string
          status: Database["public"]["Enums"]["event_status"]
          title: string
          updated_at: string
        }
        Insert: {
          created_at?: string
          created_by: string
          description?: string | null
          ends_at: string
          id?: string
          is_recurring?: boolean | null
          organization_id: string
          parent_event_id?: string | null
          recurrence_end_date?: string | null
          recurrence_rule?: string | null
          reviewer_id?: string | null
          reviewer_notes?: string | null
          room_allows_overlap?: boolean
          room_id: string
          starts_at: string
          status?: Database["public"]["Enums"]["event_status"]
          title: string
          updated_at?: string
        }
        Update: {
          created_at?: string
          created_by?: string
          description?: string | null
          ends_at?: string
          id?: string
          is_recurring?: boolean | null
          organization_id?: string
          parent_event_id?: string | null
          recurrence_end_date?: string | null
          recurrence_rule?: string | null
          reviewer_id?: string | null
          reviewer_notes?: string | null
          room_allows_overlap?: boolean
          room_id?: string
          starts_at?: string
          status?: Database["public"]["Enums"]["event_status"]
          title?: string
          updated_at?: string
        }
        Relationships: [
          {
            foreignKeyName: "events_organization_id_fkey"
            columns: ["organization_id"]
            isOneToOne: false
            referencedRelation: "organizations"
            referencedColumns: ["id"]
          },
          {
            foreignKeyName: "events_parent_event_id_fkey"
            columns: ["parent_event_id"]
            isOneToOne: false
            referencedRelation: "events"
            referencedColumns: ["id"]
          },
          {
            foreignKeyName: "events_room_id_fkey"
            columns: ["room_id"]
            isOneToOne: false
            referencedRelation: "rooms"
            referencedColumns: ["id"]
          },
        ]
      }
      ministry: {
        Row: {
          church_branch_id: string
          contact_info: string | null
          created_at: string | null
          id: string
          is_active: boolean
          name: string
          updated_at: string | null
        }
        Insert: {
          church_branch_id: string
          contact_info?: string | null
          created_at?: string | null
          id?: string
          is_active?: boolean
          name: string
          updated_at?: string | null
        }
        Update: {
          church_branch_id?: string
          contact_info?: string | null
          created_at?: string | null
          id?: string
          is_active?: boolean
          name?: string
          updated_at?: string | null
        }
        Relationships: [
          {
            foreignKeyName: "ministry_church_branch_id_fkey"
            columns: ["church_branch_id"]
            isOneToOne: false
            referencedRelation: "church_branch"
            referencedColumns: ["id"]
          },
        ]
      }
      organizations: {
        Row: {
          address: string | null
          city: string | null
          contact_email: string | null
          contact_phone: string | null
          country: string | null
          created_at: string
          id: string
          is_active: boolean | null
          logo_url: string | null
          name: string
          settings: Json | null
          slug: string
          state: string | null
          timezone: string | null
          updated_at: string
          website: string | null
        }
        Insert: {
          address?: string | null
          city?: string | null
          contact_email?: string | null
          contact_phone?: string | null
          country?: string | null
          created_at?: string
          id?: string
          is_active?: boolean | null
          logo_url?: string | null
          name: string
          settings?: Json | null
          slug: string
          state?: string | null
          timezone?: string | null
          updated_at?: string
          website?: string | null
        }
        Update: {
          address?: string | null
          city?: string | null
          contact_email?: string | null
          contact_phone?: string | null
          country?: string | null
          created_at?: string
          id?: string
          is_active?: boolean | null
          logo_url?: string | null
          name?: string
          settings?: Json | null
          slug?: string
          state?: string | null
          timezone?: string | null
          updated_at?: string
          website?: string | null
        }
        Relationships: []
      }
      profiles: {
        Row: {
          created_at: string
          default_organization_id: string | null
          email: string
          full_name: string
          id: string
          ministry_name: string | null
          must_change_password: boolean
          phone_number: string | null
          updated_at: string
        }
        Insert: {
          created_at?: string
          default_organization_id?: string | null
          email: string
          full_name: string
          id: string
          ministry_name?: string | null
          must_change_password?: boolean
          phone_number?: string | null
          updated_at?: string
        }
        Update: {
          created_at?: string
          default_organization_id?: string | null
          email?: string
          full_name?: string
          id?: string
          ministry_name?: string | null
          must_change_password?: boolean
          phone_number?: string | null
          updated_at?: string
        }
        Relationships: [
          {
            foreignKeyName: "profiles_default_organization_id_fkey"
            columns: ["default_organization_id"]
            isOneToOne: false
            referencedRelation: "organizations"
            referencedColumns: ["id"]
          },
        ]
      }
      roles: {
        Row: {
          created_at: string | null
          description: string | null
          id: string
          name: string
          updated_at: string | null
        }
        Insert: {
          created_at?: string | null
          description?: string | null
          id?: string
          name: string
          updated_at?: string | null
        }
        Update: {
          created_at?: string | null
          description?: string | null
          id?: string
          name?: string
          updated_at?: string | null
        }
        Relationships: []
      }
      rooms: {
        Row: {
          allow_overlap: boolean
          color: string | null
          created_at: string
          description: string | null
          id: string
          is_active: boolean
          name: string
          organization_id: string
          updated_at: string
        }
        Insert: {
          allow_overlap?: boolean
          color?: string | null
          created_at?: string
          description?: string | null
          id?: string
          is_active?: boolean
          name: string
          organization_id: string
          updated_at?: string
        }
        Update: {
          allow_overlap?: boolean
          color?: string | null
          created_at?: string
          description?: string | null
          id?: string
          is_active?: boolean
          name?: string
          organization_id?: string
          updated_at?: string
        }
        Relationships: [
          {
            foreignKeyName: "rooms_organization_id_fkey"
            columns: ["organization_id"]
            isOneToOne: false
            referencedRelation: "organizations"
            referencedColumns: ["id"]
          },
        ]
      }
      user_organizations: {
        Row: {
          email: string
          id: string
          is_primary: boolean | null
          joined_at: string | null
          organization_id: string
          role: Database["public"]["Enums"]["app_role"]
          user_id: string
        }
        Insert: {
          email: string
          id?: string
          is_primary?: boolean | null
          joined_at?: string | null
          organization_id: string
          role?: Database["public"]["Enums"]["app_role"]
          user_id: string
        }
        Update: {
          email?: string
          id?: string
          is_primary?: boolean | null
          joined_at?: string | null
          organization_id?: string
          role?: Database["public"]["Enums"]["app_role"]
          user_id?: string
        }
        Relationships: [
          {
            foreignKeyName: "user_organizations_organization_id_fkey"
            columns: ["organization_id"]
            isOneToOne: false
            referencedRelation: "organizations"
            referencedColumns: ["id"]
          },
        ]
      }
      user_profile: {
        Row: {
          church_branch_id: string
          created_at: string | null
          full_name: string | null
          id: string
          ministry_id: string | null
          updated_at: string | null
        }
        Insert: {
          church_branch_id: string
          created_at?: string | null
          full_name?: string | null
          id: string
          ministry_id?: string | null
          updated_at?: string | null
        }
        Update: {
          church_branch_id?: string
          created_at?: string | null
          full_name?: string | null
          id?: string
          ministry_id?: string | null
          updated_at?: string | null
        }
        Relationships: [
          {
            foreignKeyName: "user_profile_church_branch_id_fkey"
            columns: ["church_branch_id"]
            isOneToOne: false
            referencedRelation: "church_branch"
            referencedColumns: ["id"]
          },
          {
            foreignKeyName: "user_profile_ministry_id_fkey"
            columns: ["ministry_id"]
            isOneToOne: false
            referencedRelation: "ministry"
            referencedColumns: ["id"]
          },
        ]
      }
      user_roles: {
        Row: {
          assigned_at: string | null
          assigned_by: string | null
          id: string
          role_id: string
          user_id: string
        }
        Insert: {
          assigned_at?: string | null
          assigned_by?: string | null
          id?: string
          role_id: string
          user_id: string
        }
        Update: {
          assigned_at?: string | null
          assigned_by?: string | null
          id?: string
          role_id?: string
          user_id?: string
        }
        Relationships: [
          {
            foreignKeyName: "user_roles_role_id_fkey"
            columns: ["role_id"]
            isOneToOne: false
            referencedRelation: "roles"
            referencedColumns: ["id"]
          },
        ]
      }
    }
    Views: {
      [_ in never]: never
    }
    Functions: {
      clear_password_change_required: { Args: never; Returns: undefined }
      get_user_branch_id: { Args: never; Returns: string }
      get_user_emails: {
        Args: { user_ids: string[] }
        Returns: {
          email: string
          user_id: string
        }[]
      }
      get_user_organization_id: { Args: { _user_id: string }; Returns: string }
      get_users_in_same_organizations: {
        Args: { _user_id: string }
        Returns: string[]
      }
      has_internal_access: {
        Args: { _organization_id: string }
        Returns: boolean
      }
      has_internal_access_anywhere: { Args: never; Returns: boolean }
      has_role: {
        Args: {
          _role: Database["public"]["Enums"]["app_role"]
          _user_id: string
        }
        Returns: boolean
      }
      is_admin: { Args: never; Returns: boolean }
      is_asset_manager: { Args: never; Returns: boolean }
      is_ministry_leader: { Args: never; Returns: boolean }
      is_org_admin:
        | { Args: { _org_id: string; _user_id: string }; Returns: boolean }
        | { Args: { org_id: string }; Returns: boolean }
      is_staff: { Args: { _organization_id: string }; Returns: boolean }
      is_staff_anywhere: { Args: never; Returns: boolean }
      is_system_admin: { Args: never; Returns: boolean }
      user_belongs_to_org: {
        Args: { _org_id: string; _user_id: string }
        Returns: boolean
      }
      user_has_role: { Args: { role_name: string }; Returns: boolean }
    }
    Enums: {
      app_role: "admin" | "contributor" | "treasury" | "finance" | "member"
      event_status:
        | "draft"
        | "pending_review"
        | "approved"
        | "rejected"
        | "published"
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
  TableName extends (DefaultSchemaTableNameOrOptions extends {
    schema: keyof DatabaseWithoutInternals
  }
    ? keyof (DatabaseWithoutInternals[DefaultSchemaTableNameOrOptions["schema"]]["Tables"] &
        DatabaseWithoutInternals[DefaultSchemaTableNameOrOptions["schema"]]["Views"])
    : never) = never,
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
  TableName extends (DefaultSchemaTableNameOrOptions extends {
    schema: keyof DatabaseWithoutInternals
  }
    ? keyof DatabaseWithoutInternals[DefaultSchemaTableNameOrOptions["schema"]]["Tables"]
    : never) = never,
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
  TableName extends (DefaultSchemaTableNameOrOptions extends {
    schema: keyof DatabaseWithoutInternals
  }
    ? keyof DatabaseWithoutInternals[DefaultSchemaTableNameOrOptions["schema"]]["Tables"]
    : never) = never,
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
  EnumName extends (DefaultSchemaEnumNameOrOptions extends {
    schema: keyof DatabaseWithoutInternals
  }
    ? keyof DatabaseWithoutInternals[DefaultSchemaEnumNameOrOptions["schema"]]["Enums"]
    : never) = never,
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
  CompositeTypeName extends (PublicCompositeTypeNameOrOptions extends {
    schema: keyof DatabaseWithoutInternals
  }
    ? keyof DatabaseWithoutInternals[PublicCompositeTypeNameOrOptions["schema"]]["CompositeTypes"]
    : never) = never,
> = PublicCompositeTypeNameOrOptions extends {
  schema: keyof DatabaseWithoutInternals
}
  ? DatabaseWithoutInternals[PublicCompositeTypeNameOrOptions["schema"]]["CompositeTypes"][CompositeTypeName]
  : PublicCompositeTypeNameOrOptions extends keyof DefaultSchema["CompositeTypes"]
    ? DefaultSchema["CompositeTypes"][PublicCompositeTypeNameOrOptions]
    : never

export const Constants = {
  budget: {
    Enums: {
      allocation_period_type: ["annual", "quarterly", "monthly"],
      allocation_request_status: [
        "draft",
        "pending",
        "approved",
        "partially_approved",
        "denied",
        "cancelled",
      ],
      expense_status: [
        "draft",
        "pending_leader",
        "leader_approved",
        "leader_denied",
        "pending_treasury",
        "treasury_approved",
        "treasury_denied",
        "pending_finance",
        "completed",
        "cancelled",
      ],
      ministry_flag_type: ["missing_receipts", "unreturned_funds"],
      reimbursement_type: ["zelle", "check", "ach", "admin_online_purchase"],
    },
  },
  church: {
    Enums: {
      module_permission: [
        "members_admin",
        "members_viewer",
        "members_import",
        "kids_admin",
        "kids_volunteer",
        "leadership_viewer",
        "kids_leader",
        "giving_admin",
        "giving_viewer",
      ],
    },
  },
  inventory: {
    Enums: {},
  },
  public: {
    Enums: {
      app_role: ["admin", "contributor", "treasury", "finance", "member"],
      event_status: [
        "draft",
        "pending_review",
        "approved",
        "rejected",
        "published",
      ],
    },
  },
} as const
