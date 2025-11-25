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
    PostgrestVersion: "13.0.5"
  }
  public: {
    Tables: {
      organizations: {
        Row: {
          id: string
          name: string
          slug: string
          country: string | null
          state: string | null
          city: string | null
          address: string | null
          timezone: string
          contact_email: string | null
          contact_phone: string | null
          website: string | null
          logo_url: string | null
          is_active: boolean
          settings: Record<string, unknown>
          created_at: string
          updated_at: string
        }
        Insert: {
          id?: string
          name: string
          slug: string
          country?: string | null
          state?: string | null
          city?: string | null
          address?: string | null
          timezone?: string
          contact_email?: string | null
          contact_phone?: string | null
          website?: string | null
          logo_url?: string | null
          is_active?: boolean
          settings?: Record<string, unknown>
          created_at?: string
          updated_at?: string
        }
        Update: {
          id?: string
          name?: string
          slug?: string
          country?: string | null
          state?: string | null
          city?: string | null
          address?: string | null
          timezone?: string
          contact_email?: string | null
          contact_phone?: string | null
          website?: string | null
          logo_url?: string | null
          is_active?: boolean
          settings?: Record<string, unknown>
          created_at?: string
          updated_at?: string
        }
        Relationships: []
      }
      user_organizations: {
        Row: {
          id: string
          user_id: string
          organization_id: string
          role: Database["public"]["Enums"]["app_role"]
          is_primary: boolean
          joined_at: string
        }
        Insert: {
          id?: string
          user_id: string
          organization_id: string
          role?: Database["public"]["Enums"]["app_role"]
          is_primary?: boolean
          joined_at?: string
        }
        Update: {
          id?: string
          user_id?: string
          organization_id?: string
          role?: Database["public"]["Enums"]["app_role"]
          is_primary?: boolean
          joined_at?: string
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
      profiles: {
        Row: {
          created_at: string
          default_organization_id: string | null
          email: string
          full_name: string
          id: string
          ministry_name: string | null
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
      has_role: {
        Args: {
          _role: Database["public"]["Enums"]["app_role"]
          _user_id: string
        }
        Returns: boolean
      }
    }
    Enums: {
      app_role: "admin" | "contributor"
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
      app_role: ["admin", "contributor"],
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
