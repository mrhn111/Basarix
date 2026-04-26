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
      ai_cache: {
        Row: {
          last_called_at: string
          user_id: string
        }
        Insert: {
          last_called_at?: string
          user_id: string
        }
        Update: {
          last_called_at?: string
          user_id?: string
        }
        Relationships: []
      }
      exam_results: {
        Row: {
          bos: number
          dogru: number
          exam_topic_id: string
          id: string
          yanlis: number
        }
        Insert: {
          bos?: number
          dogru?: number
          exam_topic_id: string
          id?: string
          yanlis?: number
        }
        Update: {
          bos?: number
          dogru?: number
          exam_topic_id?: string
          id?: string
          yanlis?: number
        }
        Relationships: [
          {
            foreignKeyName: "exam_results_exam_topic_id_fkey"
            columns: ["exam_topic_id"]
            isOneToOne: true
            referencedRelation: "exam_topics"
            referencedColumns: ["id"]
          },
        ]
      }
      exam_topics: {
        Row: {
          exam_id: string
          id: string
          mufredat_topic_id: string
        }
        Insert: {
          exam_id: string
          id?: string
          mufredat_topic_id: string
        }
        Update: {
          exam_id?: string
          id?: string
          mufredat_topic_id?: string
        }
        Relationships: [
          {
            foreignKeyName: "exam_topics_exam_id_fkey"
            columns: ["exam_id"]
            isOneToOne: false
            referencedRelation: "exams"
            referencedColumns: ["id"]
          },
          {
            foreignKeyName: "exam_topics_mufredat_topic_id_fkey"
            columns: ["mufredat_topic_id"]
            isOneToOne: false
            referencedRelation: "mufredat"
            referencedColumns: ["id"]
          },
        ]
      }
      exams: {
        Row: {
          created_at: string
          date: string
          id: string
          is_completed: boolean
          type: Database["public"]["Enums"]["exam_type"]
          user_id: string
        }
        Insert: {
          created_at?: string
          date: string
          id?: string
          is_completed?: boolean
          type: Database["public"]["Enums"]["exam_type"]
          user_id: string
        }
        Update: {
          created_at?: string
          date?: string
          id?: string
          is_completed?: boolean
          type?: Database["public"]["Enums"]["exam_type"]
          user_id?: string
        }
        Relationships: []
      }
      mufredat: {
        Row: {
          grade: number
          id: string
          subject: string
          topic: string
          unit: string
        }
        Insert: {
          grade: number
          id?: string
          subject: string
          topic: string
          unit: string
        }
        Update: {
          grade?: number
          id?: string
          subject?: string
          topic?: string
          unit?: string
        }
        Relationships: []
      }
      users: {
        Row: {
          alan: string | null
          created_at: string
          email: string
          grade: number
          id: string
        }
        Insert: {
          alan?: string | null
          created_at?: string
          email: string
          grade: number
          id: string
        }
        Update: {
          alan?: string | null
          created_at?: string
          email?: string
          grade?: number
          id?: string
        }
        Relationships: []
      }
      wrong_tags: {
        Row: {
          count: number
          exam_result_id: string
          id: string
          tag: Database["public"]["Enums"]["wrong_tag_type"]
        }
        Insert: {
          count?: number
          exam_result_id: string
          id?: string
          tag: Database["public"]["Enums"]["wrong_tag_type"]
        }
        Update: {
          count?: number
          exam_result_id?: string
          id?: string
          tag?: Database["public"]["Enums"]["wrong_tag_type"]
        }
        Relationships: [
          {
            foreignKeyName: "wrong_tags_exam_result_id_fkey"
            columns: ["exam_result_id"]
            isOneToOne: false
            referencedRelation: "exam_results"
            referencedColumns: ["id"]
          },
        ]
      }
    }
    Views: {
      [_ in never]: never
    }
    Functions: {
      save_exam: { Args: { payload: Json }; Returns: string }
    }
    Enums: {
      exam_type: "yazili" | "deneme" | "lgs" | "tyt" | "ayt"
      wrong_tag_type: "bilgi_eksikligi" | "dikkat_hatasi"
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
      exam_type: ["yazili", "deneme", "lgs", "tyt", "ayt"],
      wrong_tag_type: ["bilgi_eksikligi", "dikkat_hatasi"],
    },
  },
} as const
