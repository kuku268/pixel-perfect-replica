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
      credit_products: {
        Row: {
          active: boolean
          created_at: string
          credits: number
          id: string
          name: string
          price_twd: number | null
          price_usd: number
          stripe_price_id: string | null
        }
        Insert: {
          active?: boolean
          created_at?: string
          credits: number
          id?: string
          name: string
          price_twd?: number | null
          price_usd: number
          stripe_price_id?: string | null
        }
        Update: {
          active?: boolean
          created_at?: string
          credits?: number
          id?: string
          name?: string
          price_twd?: number | null
          price_usd?: number
          stripe_price_id?: string | null
        }
        Relationships: []
      }
      credit_transactions: {
        Row: {
          amount: number
          created_at: string
          description: string | null
          id: string
          job_id: string | null
          ecpay_merchant_trade_no: string | null
          provider: string | null
          stripe_payment_intent_id: string | null
          type: string
          user_id: string
        }
        Insert: {
          amount: number
          created_at?: string
          description?: string | null
          id?: string
          job_id?: string | null
          ecpay_merchant_trade_no?: string | null
          provider?: string | null
          stripe_payment_intent_id?: string | null
          type: string
          user_id: string
        }
        Update: {
          amount?: number
          created_at?: string
          description?: string | null
          id?: string
          job_id?: string | null
          ecpay_merchant_trade_no?: string | null
          provider?: string | null
          stripe_payment_intent_id?: string | null
          type?: string
          user_id?: string
        }
        Relationships: [
          {
            foreignKeyName: "credit_transactions_job_id_fkey"
            columns: ["job_id"]
            isOneToOne: false
            referencedRelation: "jobs"
            referencedColumns: ["id"]
          },
        ]
      }
      ecpay_orders: {
        Row: {
          amount_twd: number
          created_at: string
          credits: number
          ecpay_trade_no: string | null
          merchant_trade_no: string
          notify_payload: Json | null
          paid_at: string | null
          product_id: string
          rtn_code: string | null
          status: string
          user_id: string
        }
        Insert: {
          amount_twd: number
          created_at?: string
          credits: number
          ecpay_trade_no?: string | null
          merchant_trade_no: string
          notify_payload?: Json | null
          paid_at?: string | null
          product_id: string
          rtn_code?: string | null
          status?: string
          user_id: string
        }
        Update: {
          amount_twd?: number
          created_at?: string
          credits?: number
          ecpay_trade_no?: string | null
          merchant_trade_no?: string
          notify_payload?: Json | null
          paid_at?: string | null
          product_id?: string
          rtn_code?: string | null
          status?: string
          user_id?: string
        }
        Relationships: [
          {
            foreignKeyName: "ecpay_orders_product_id_fkey"
            columns: ["product_id"]
            isOneToOne: false
            referencedRelation: "credit_products"
            referencedColumns: ["id"]
          },
        ]
      }
      job_sessions: {
        Row: {
          created_at: string
          engine: string | null
          fargate_task_arn: string | null
          id: string
          job_id: string
          overrides: Json | null
          segments: Json | null
          session_number: number
          speakers: Json | null
          subtitle_txt_content: string | null
          summary_content: string | null
        }
        Insert: {
          created_at?: string
          engine?: string | null
          fargate_task_arn?: string | null
          id?: string
          job_id: string
          overrides?: Json | null
          segments?: Json | null
          session_number?: number
          speakers?: Json | null
          subtitle_txt_content?: string | null
          summary_content?: string | null
        }
        Update: {
          created_at?: string
          engine?: string | null
          fargate_task_arn?: string | null
          id?: string
          job_id?: string
          overrides?: Json | null
          segments?: Json | null
          session_number?: number
          speakers?: Json | null
          subtitle_txt_content?: string | null
          summary_content?: string | null
        }
        Relationships: [
          {
            foreignKeyName: "job_sessions_job_id_fkey"
            columns: ["job_id"]
            isOneToOne: false
            referencedRelation: "jobs"
            referencedColumns: ["id"]
          },
        ]
      }
      jobs: {
        Row: {
          audio_key: string | null
          created_at: string
          current_session_id: string | null
          edit_deadline: string | null
          error_message: string | null
          exported_at: string | null
          formats: string[]
          id: string
          language: string
          original_filename: string | null
          parent_job_id: string | null
          source_kind: string
          speakers_expected: number | null
          status: string
          tier: string
          topic: string | null
          updated_at: string
          upload_key: string | null
          user_id: string
          video_source_url: string
        }
        Insert: {
          audio_key?: string | null
          created_at?: string
          current_session_id?: string | null
          edit_deadline?: string | null
          error_message?: string | null
          exported_at?: string | null
          formats?: string[]
          id?: string
          language?: string
          original_filename?: string | null
          parent_job_id?: string | null
          source_kind?: string
          speakers_expected?: number | null
          status?: string
          tier?: string
          topic?: string | null
          updated_at?: string
          upload_key?: string | null
          user_id: string
          video_source_url: string
        }
        Update: {
          audio_key?: string | null
          created_at?: string
          current_session_id?: string | null
          edit_deadline?: string | null
          error_message?: string | null
          exported_at?: string | null
          formats?: string[]
          id?: string
          language?: string
          original_filename?: string | null
          parent_job_id?: string | null
          source_kind?: string
          speakers_expected?: number | null
          status?: string
          tier?: string
          topic?: string | null
          updated_at?: string
          upload_key?: string | null
          user_id?: string
          video_source_url?: string
        }
        Relationships: [
          {
            foreignKeyName: "fk_current_session"
            columns: ["current_session_id"]
            isOneToOne: false
            referencedRelation: "job_sessions"
            referencedColumns: ["id"]
          },
          {
            foreignKeyName: "jobs_parent_job_id_fkey"
            columns: ["parent_job_id"]
            isOneToOne: false
            referencedRelation: "jobs"
            referencedColumns: ["id"]
          },
        ]
      }
      profiles: {
        Row: {
          created_at: string
          credits_balance: number
          email: string | null
          id: string
          role: string
        }
        Insert: {
          created_at?: string
          credits_balance?: number
          email?: string | null
          id: string
          role?: string
        }
        Update: {
          created_at?: string
          credits_balance?: number
          email?: string | null
          id?: string
          role?: string
        }
        Relationships: []
      }
    }
    Views: {
      [_ in never]: never
    }
    Functions: {
      ecpay_mark_paid: {
        Args: {
          p_amount: number
          p_ecpay_trade_no: string
          p_merchant_trade_no: string
          p_payload: Json
        }
        Returns: string
      }
    }
    Enums: {
      [_ in never]: never
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
  public: {
    Enums: {},
  },
} as const
