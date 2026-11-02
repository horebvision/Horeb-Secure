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
      academic_announcements: {
        Row: {
          author_name: string
          author_role: string
          content: string
          created_at: string
          id: string
          is_active: boolean
          priority: string
          published_at: string
          target_module_id: string | null
          title: string
        }
        Insert: {
          author_name?: string
          author_role?: string
          content: string
          created_at?: string
          id: string
          is_active?: boolean
          priority?: string
          published_at?: string
          target_module_id?: string | null
          title: string
        }
        Update: {
          author_name?: string
          author_role?: string
          content?: string
          created_at?: string
          id?: string
          is_active?: boolean
          priority?: string
          published_at?: string
          target_module_id?: string | null
          title?: string
        }
        Relationships: []
      }
      activity_logs: {
        Row: {
          action: string
          created_at: string | null
          details: string | null
          entity_id: string | null
          entity_type: string
          id: string
          user_id: string | null
          user_name: string | null
        }
        Insert: {
          action: string
          created_at?: string | null
          details?: string | null
          entity_id?: string | null
          entity_type: string
          id?: string
          user_id?: string | null
          user_name?: string | null
        }
        Update: {
          action?: string
          created_at?: string | null
          details?: string | null
          entity_id?: string | null
          entity_type?: string
          id?: string
          user_id?: string | null
          user_name?: string | null
        }
        Relationships: [
          {
            foreignKeyName: "activity_logs_user_id_fkey"
            columns: ["user_id"]
            isOneToOne: false
            referencedRelation: "profiles"
            referencedColumns: ["id"]
          },
        ]
      }
      advertisements: {
        Row: {
          amount_paid: number
          clicks_count: number | null
          created_at: string | null
          days_count: number
          description: string
          duration_seconds: number | null
          end_date: string
          id: string
          media_type: string
          media_url: string
          payment_method: string
          start_date: string
          status: string
          target_url: string | null
          title: string
          updated_at: string | null
          user_id: string
          user_name: string
          user_phone: string
          views_count: number | null
          whatsapp_number: string | null
        }
        Insert: {
          amount_paid?: number
          clicks_count?: number | null
          created_at?: string | null
          days_count?: number
          description: string
          duration_seconds?: number | null
          end_date: string
          id: string
          media_type: string
          media_url: string
          payment_method?: string
          start_date?: string
          status?: string
          target_url?: string | null
          title: string
          updated_at?: string | null
          user_id: string
          user_name: string
          user_phone: string
          views_count?: number | null
          whatsapp_number?: string | null
        }
        Update: {
          amount_paid?: number
          clicks_count?: number | null
          created_at?: string | null
          days_count?: number
          description?: string
          duration_seconds?: number | null
          end_date?: string
          id?: string
          media_type?: string
          media_url?: string
          payment_method?: string
          start_date?: string
          status?: string
          target_url?: string | null
          title?: string
          updated_at?: string | null
          user_id?: string
          user_name?: string
          user_phone?: string
          views_count?: number | null
          whatsapp_number?: string | null
        }
        Relationships: []
      }
      alert_events: {
        Row: {
          actor_id: string | null
          alert_id: string
          comment: string | null
          created_at: string
          event_type: string
          from_status:
            | Database["public"]["Enums"]["securia_alert_status"]
            | null
          id: string
          metadata: Json | null
          to_status: Database["public"]["Enums"]["securia_alert_status"] | null
        }
        Insert: {
          actor_id?: string | null
          alert_id: string
          comment?: string | null
          created_at?: string
          event_type: string
          from_status?:
            | Database["public"]["Enums"]["securia_alert_status"]
            | null
          id?: string
          metadata?: Json | null
          to_status?: Database["public"]["Enums"]["securia_alert_status"] | null
        }
        Update: {
          actor_id?: string | null
          alert_id?: string
          comment?: string | null
          created_at?: string
          event_type?: string
          from_status?:
            | Database["public"]["Enums"]["securia_alert_status"]
            | null
          id?: string
          metadata?: Json | null
          to_status?: Database["public"]["Enums"]["securia_alert_status"] | null
        }
        Relationships: [
          {
            foreignKeyName: "alert_events_actor_id_fkey"
            columns: ["actor_id"]
            isOneToOne: false
            referencedRelation: "users"
            referencedColumns: ["id"]
          },
          {
            foreignKeyName: "alert_events_alert_id_fkey"
            columns: ["alert_id"]
            isOneToOne: false
            referencedRelation: "alerts"
            referencedColumns: ["id"]
          },
        ]
      }
      alerts: {
        Row: {
          alert_number: string
          assigned_agent_id: string | null
          client_notes: string | null
          created_at: string
          id: string
          intervention_id: string | null
          is_silent: boolean
          latitude: number | null
          location_address: string | null
          longitude: number | null
          organization_id: string | null
          priority: Database["public"]["Enums"]["securia_alert_priority"]
          security_center_id: string | null
          site_id: string | null
          status: Database["public"]["Enums"]["securia_alert_status"]
          type: Database["public"]["Enums"]["securia_alert_type"]
          updated_at: string
          user_id: string
        }
        Insert: {
          alert_number: string
          assigned_agent_id?: string | null
          client_notes?: string | null
          created_at?: string
          id?: string
          intervention_id?: string | null
          is_silent?: boolean
          latitude?: number | null
          location_address?: string | null
          longitude?: number | null
          organization_id?: string | null
          priority?: Database["public"]["Enums"]["securia_alert_priority"]
          security_center_id?: string | null
          site_id?: string | null
          status?: Database["public"]["Enums"]["securia_alert_status"]
          type: Database["public"]["Enums"]["securia_alert_type"]
          updated_at?: string
          user_id: string
        }
        Update: {
          alert_number?: string
          assigned_agent_id?: string | null
          client_notes?: string | null
          created_at?: string
          id?: string
          intervention_id?: string | null
          is_silent?: boolean
          latitude?: number | null
          location_address?: string | null
          longitude?: number | null
          organization_id?: string | null
          priority?: Database["public"]["Enums"]["securia_alert_priority"]
          security_center_id?: string | null
          site_id?: string | null
          status?: Database["public"]["Enums"]["securia_alert_status"]
          type?: Database["public"]["Enums"]["securia_alert_type"]
          updated_at?: string
          user_id?: string
        }
        Relationships: [
          {
            foreignKeyName: "alerts_assigned_agent_id_fkey"
            columns: ["assigned_agent_id"]
            isOneToOne: false
            referencedRelation: "security_agents"
            referencedColumns: ["id"]
          },
          {
            foreignKeyName: "alerts_intervention_id_fkey"
            columns: ["intervention_id"]
            isOneToOne: false
            referencedRelation: "interventions"
            referencedColumns: ["id"]
          },
          {
            foreignKeyName: "alerts_organization_id_fkey"
            columns: ["organization_id"]
            isOneToOne: false
            referencedRelation: "organizations"
            referencedColumns: ["id"]
          },
          {
            foreignKeyName: "alerts_security_center_id_fkey"
            columns: ["security_center_id"]
            isOneToOne: false
            referencedRelation: "security_centers"
            referencedColumns: ["id"]
          },
          {
            foreignKeyName: "alerts_site_id_fkey"
            columns: ["site_id"]
            isOneToOne: false
            referencedRelation: "protected_sites"
            referencedColumns: ["id"]
          },
          {
            foreignKeyName: "alerts_user_id_fkey"
            columns: ["user_id"]
            isOneToOne: false
            referencedRelation: "users"
            referencedColumns: ["id"]
          },
        ]
      }
      answers: {
        Row: {
          answer: string
          created_at: string
          id: string
          is_correct: boolean
          position: number | null
          question_id: string
        }
        Insert: {
          answer: string
          created_at?: string
          id?: string
          is_correct?: boolean
          position?: number | null
          question_id: string
        }
        Update: {
          answer?: string
          created_at?: string
          id?: string
          is_correct?: boolean
          position?: number | null
          question_id?: string
        }
        Relationships: [
          {
            foreignKeyName: "answers_question_id_fkey"
            columns: ["question_id"]
            isOneToOne: false
            referencedRelation: "questions"
            referencedColumns: ["id"]
          },
        ]
      }
      attestation_requests: {
        Row: {
          admin_notes: string | null
          attachment_url: string | null
          attestation_type: string
          client_email: string | null
          client_id: string | null
          client_name: string
          client_phone: string
          client_ref: string | null
          comments: string | null
          created_at: string | null
          document_file_url: string | null
          id: string
          ilot_number: string
          lot_number: string
          project_name: string
          request_number: string
          status: string | null
          updated_at: string | null
        }
        Insert: {
          admin_notes?: string | null
          attachment_url?: string | null
          attestation_type: string
          client_email?: string | null
          client_id?: string | null
          client_name: string
          client_phone: string
          client_ref?: string | null
          comments?: string | null
          created_at?: string | null
          document_file_url?: string | null
          id?: string
          ilot_number: string
          lot_number: string
          project_name: string
          request_number: string
          status?: string | null
          updated_at?: string | null
        }
        Update: {
          admin_notes?: string | null
          attachment_url?: string | null
          attestation_type?: string
          client_email?: string | null
          client_id?: string | null
          client_name?: string
          client_phone?: string
          client_ref?: string | null
          comments?: string | null
          created_at?: string | null
          document_file_url?: string | null
          id?: string
          ilot_number?: string
          lot_number?: string
          project_name?: string
          request_number?: string
          status?: string | null
          updated_at?: string | null
        }
        Relationships: [
          {
            foreignKeyName: "attestation_requests_client_id_fkey"
            columns: ["client_id"]
            isOneToOne: false
            referencedRelation: "profiles"
            referencedColumns: ["id"]
          },
        ]
      }
      audit_logs: {
        Row: {
          action: string
          created_at: string
          details: Json | null
          entity_id: string | null
          entity_type: string
          id: string
          user_id: string | null
        }
        Insert: {
          action: string
          created_at?: string
          details?: Json | null
          entity_id?: string | null
          entity_type: string
          id?: string
          user_id?: string | null
        }
        Update: {
          action?: string
          created_at?: string
          details?: Json | null
          entity_id?: string | null
          entity_type?: string
          id?: string
          user_id?: string | null
        }
        Relationships: []
      }
      categories: {
        Row: {
          created_at: string
          description: string | null
          display_order: number | null
          icon: string | null
          id: string
          image_url: string | null
          is_active: boolean
          name: string
          slug: string
        }
        Insert: {
          created_at?: string
          description?: string | null
          display_order?: number | null
          icon?: string | null
          id?: string
          image_url?: string | null
          is_active?: boolean
          name: string
          slug: string
        }
        Update: {
          created_at?: string
          description?: string | null
          display_order?: number | null
          icon?: string | null
          id?: string
          image_url?: string | null
          is_active?: boolean
          name?: string
          slug?: string
        }
        Relationships: []
      }
      company_settings: {
        Row: {
          address: string | null
          agreement_number: string | null
          capital: string | null
          cc: string | null
          company_name: string
          created_at: string | null
          email: string | null
          id: string
          logo_url: string | null
          ncc: string | null
          phone: string | null
          rccm: string | null
          slogan: string | null
          updated_at: string | null
          whatsapp: string | null
          working_hours: string | null
        }
        Insert: {
          address?: string | null
          agreement_number?: string | null
          capital?: string | null
          cc?: string | null
          company_name?: string
          created_at?: string | null
          email?: string | null
          id?: string
          logo_url?: string | null
          ncc?: string | null
          phone?: string | null
          rccm?: string | null
          slogan?: string | null
          updated_at?: string | null
          whatsapp?: string | null
          working_hours?: string | null
        }
        Update: {
          address?: string | null
          agreement_number?: string | null
          capital?: string | null
          cc?: string | null
          company_name?: string
          created_at?: string | null
          email?: string | null
          id?: string
          logo_url?: string | null
          ncc?: string | null
          phone?: string | null
          rccm?: string | null
          slogan?: string | null
          updated_at?: string | null
          whatsapp?: string | null
          working_hours?: string | null
        }
        Relationships: []
      }
      construction_quotes: {
        Row: {
          admin_notes: string | null
          bathrooms: number | null
          bedrooms: number | null
          budget_range: string | null
          client_email: string | null
          client_feedback: string | null
          client_id: string | null
          client_location: string | null
          client_name: string
          client_phone: string
          client_whatsapp: string | null
          created_at: string | null
          desired_deadline: string | null
          discount_amount: number | null
          has_garage: boolean | null
          has_land: boolean | null
          has_pool: boolean | null
          has_terrace: boolean | null
          house_type: string | null
          id: string
          land_dimensions: string | null
          land_location: string | null
          land_surface: number | null
          levels: number | null
          other_needs: string | null
          pdf_url: string | null
          plan_url: string | null
          project_type: string
          quote_amount: number | null
          request_number: string
          status: string | null
          tax_percent: number | null
          updated_at: string | null
          validity_date: string | null
        }
        Insert: {
          admin_notes?: string | null
          bathrooms?: number | null
          bedrooms?: number | null
          budget_range?: string | null
          client_email?: string | null
          client_feedback?: string | null
          client_id?: string | null
          client_location?: string | null
          client_name: string
          client_phone: string
          client_whatsapp?: string | null
          created_at?: string | null
          desired_deadline?: string | null
          discount_amount?: number | null
          has_garage?: boolean | null
          has_land?: boolean | null
          has_pool?: boolean | null
          has_terrace?: boolean | null
          house_type?: string | null
          id?: string
          land_dimensions?: string | null
          land_location?: string | null
          land_surface?: number | null
          levels?: number | null
          other_needs?: string | null
          pdf_url?: string | null
          plan_url?: string | null
          project_type: string
          quote_amount?: number | null
          request_number: string
          status?: string | null
          tax_percent?: number | null
          updated_at?: string | null
          validity_date?: string | null
        }
        Update: {
          admin_notes?: string | null
          bathrooms?: number | null
          bedrooms?: number | null
          budget_range?: string | null
          client_email?: string | null
          client_feedback?: string | null
          client_id?: string | null
          client_location?: string | null
          client_name?: string
          client_phone?: string
          client_whatsapp?: string | null
          created_at?: string | null
          desired_deadline?: string | null
          discount_amount?: number | null
          has_garage?: boolean | null
          has_land?: boolean | null
          has_pool?: boolean | null
          has_terrace?: boolean | null
          house_type?: string | null
          id?: string
          land_dimensions?: string | null
          land_location?: string | null
          land_surface?: number | null
          levels?: number | null
          other_needs?: string | null
          pdf_url?: string | null
          plan_url?: string | null
          project_type?: string
          quote_amount?: number | null
          request_number?: string
          status?: string | null
          tax_percent?: number | null
          updated_at?: string | null
          validity_date?: string | null
        }
        Relationships: [
          {
            foreignKeyName: "construction_quotes_client_id_fkey"
            columns: ["client_id"]
            isOneToOne: false
            referencedRelation: "profiles"
            referencedColumns: ["id"]
          },
        ]
      }
      coupons: {
        Row: {
          code: string
          created_at: string | null
          discount_amount: number | null
          discount_percent: number | null
          end_date: string | null
          id: string
          is_active: boolean | null
          max_discount_amount: number | null
          min_order_amount: number | null
          start_date: string | null
          usage_limit: number | null
          used_count: number | null
        }
        Insert: {
          code: string
          created_at?: string | null
          discount_amount?: number | null
          discount_percent?: number | null
          end_date?: string | null
          id: string
          is_active?: boolean | null
          max_discount_amount?: number | null
          min_order_amount?: number | null
          start_date?: string | null
          usage_limit?: number | null
          used_count?: number | null
        }
        Update: {
          code?: string
          created_at?: string | null
          discount_amount?: number | null
          discount_percent?: number | null
          end_date?: string | null
          id?: string
          is_active?: boolean | null
          max_discount_amount?: number | null
          min_order_amount?: number | null
          start_date?: string | null
          usage_limit?: number | null
          used_count?: number | null
        }
        Relationships: []
      }
      course_lessons: {
        Row: {
          chapter_number: number
          content: string
          created_at: string | null
          duration_minutes: number | null
          id: string
          key_takeaways: Json | null
          module_id: string
          order_index: number | null
          quiz: Json | null
          summary: string | null
          title: string
        }
        Insert: {
          chapter_number: number
          content: string
          created_at?: string | null
          duration_minutes?: number | null
          id?: string
          key_takeaways?: Json | null
          module_id: string
          order_index?: number | null
          quiz?: Json | null
          summary?: string | null
          title: string
        }
        Update: {
          chapter_number?: number
          content?: string
          created_at?: string | null
          duration_minutes?: number | null
          id?: string
          key_takeaways?: Json | null
          module_id?: string
          order_index?: number | null
          quiz?: Json | null
          summary?: string | null
          title?: string
        }
        Relationships: [
          {
            foreignKeyName: "course_lessons_module_id_fkey"
            columns: ["module_id"]
            isOneToOne: false
            referencedRelation: "modules"
            referencedColumns: ["id"]
          },
        ]
      }
      deliveries: {
        Row: {
          assigned_at: string | null
          created_at: string
          delivered_at: string | null
          driver_id: string | null
          driver_name: string | null
          driver_phone: string | null
          id: string
          notes: string | null
          order_id: string
          picked_up_at: string | null
          status: Database["public"]["Enums"]["order_status"]
          updated_at: string
        }
        Insert: {
          assigned_at?: string | null
          created_at?: string
          delivered_at?: string | null
          driver_id?: string | null
          driver_name?: string | null
          driver_phone?: string | null
          id?: string
          notes?: string | null
          order_id: string
          picked_up_at?: string | null
          status?: Database["public"]["Enums"]["order_status"]
          updated_at?: string
        }
        Update: {
          assigned_at?: string | null
          created_at?: string
          delivered_at?: string | null
          driver_id?: string | null
          driver_name?: string | null
          driver_phone?: string | null
          id?: string
          notes?: string | null
          order_id?: string
          picked_up_at?: string | null
          status?: Database["public"]["Enums"]["order_status"]
          updated_at?: string
        }
        Relationships: []
      }
      delivery_zones: {
        Row: {
          code: string
          created_at: string
          estimated_delivery_time: string | null
          fee: number
          id: string
          is_active: boolean
          name: string
        }
        Insert: {
          code: string
          created_at?: string
          estimated_delivery_time?: string | null
          fee?: number
          id?: string
          is_active?: boolean
          name: string
        }
        Update: {
          code?: string
          created_at?: string
          estimated_delivery_time?: string | null
          fee?: number
          id?: string
          is_active?: boolean
          name?: string
        }
        Relationships: []
      }
      documents: {
        Row: {
          client_id: string
          created_at: string | null
          file_size: string | null
          file_url: string
          id: string
          is_private: boolean | null
          lot_id: string | null
          name: string
          notes: string | null
          request_id: string | null
          status: string | null
          type: string
          updated_at: string | null
        }
        Insert: {
          client_id: string
          created_at?: string | null
          file_size?: string | null
          file_url: string
          id?: string
          is_private?: boolean | null
          lot_id?: string | null
          name: string
          notes?: string | null
          request_id?: string | null
          status?: string | null
          type: string
          updated_at?: string | null
        }
        Update: {
          client_id?: string
          created_at?: string | null
          file_size?: string | null
          file_url?: string
          id?: string
          is_private?: boolean | null
          lot_id?: string | null
          name?: string
          notes?: string | null
          request_id?: string | null
          status?: string | null
          type?: string
          updated_at?: string | null
        }
        Relationships: [
          {
            foreignKeyName: "documents_client_id_fkey"
            columns: ["client_id"]
            isOneToOne: false
            referencedRelation: "profiles"
            referencedColumns: ["id"]
          },
          {
            foreignKeyName: "documents_lot_id_fkey"
            columns: ["lot_id"]
            isOneToOne: false
            referencedRelation: "lots"
            referencedColumns: ["id"]
          },
        ]
      }
      emergency_contacts: {
        Row: {
          created_at: string
          id: string
          is_active: boolean
          name: string
          phone: string
          priority_order: number | null
          relation: string
          user_id: string
        }
        Insert: {
          created_at?: string
          id?: string
          is_active?: boolean
          name: string
          phone: string
          priority_order?: number | null
          relation: string
          user_id: string
        }
        Update: {
          created_at?: string
          id?: string
          is_active?: boolean
          name?: string
          phone?: string
          priority_order?: number | null
          relation?: string
          user_id?: string
        }
        Relationships: [
          {
            foreignKeyName: "emergency_contacts_user_id_fkey"
            columns: ["user_id"]
            isOneToOne: false
            referencedRelation: "users"
            referencedColumns: ["id"]
          },
        ]
      }
      exam_answers: {
        Row: {
          answer_id: string | null
          attempt_id: string
          created_at: string
          id: string
          is_correct: boolean | null
          marked_for_review: boolean | null
          question_id: string
        }
        Insert: {
          answer_id?: string | null
          attempt_id: string
          created_at?: string
          id?: string
          is_correct?: boolean | null
          marked_for_review?: boolean | null
          question_id: string
        }
        Update: {
          answer_id?: string | null
          attempt_id?: string
          created_at?: string
          id?: string
          is_correct?: boolean | null
          marked_for_review?: boolean | null
          question_id?: string
        }
        Relationships: [
          {
            foreignKeyName: "exam_answers_answer_id_fkey"
            columns: ["answer_id"]
            isOneToOne: false
            referencedRelation: "answers"
            referencedColumns: ["id"]
          },
          {
            foreignKeyName: "exam_answers_attempt_id_fkey"
            columns: ["attempt_id"]
            isOneToOne: false
            referencedRelation: "exam_attempts"
            referencedColumns: ["id"]
          },
          {
            foreignKeyName: "exam_answers_question_id_fkey"
            columns: ["question_id"]
            isOneToOne: false
            referencedRelation: "questions"
            referencedColumns: ["id"]
          },
        ]
      }
      exam_attempts: {
        Row: {
          candidate_email: string | null
          candidate_name: string
          completed_at: string | null
          correct_answers: number | null
          created_at: string
          duration_seconds: number | null
          id: string
          module_id: string | null
          score: number | null
          score_percentage: number | null
          started_at: string
          status: string | null
          student_id: string | null
          total_questions: number | null
        }
        Insert: {
          candidate_email?: string | null
          candidate_name: string
          completed_at?: string | null
          correct_answers?: number | null
          created_at?: string
          duration_seconds?: number | null
          id?: string
          module_id?: string | null
          score?: number | null
          score_percentage?: number | null
          started_at?: string
          status?: string | null
          student_id?: string | null
          total_questions?: number | null
        }
        Update: {
          candidate_email?: string | null
          candidate_name?: string
          completed_at?: string | null
          correct_answers?: number | null
          created_at?: string
          duration_seconds?: number | null
          id?: string
          module_id?: string | null
          score?: number | null
          score_percentage?: number | null
          started_at?: string
          status?: string | null
          student_id?: string | null
          total_questions?: number | null
        }
        Relationships: [
          {
            foreignKeyName: "exam_attempts_module_id_fkey"
            columns: ["module_id"]
            isOneToOne: false
            referencedRelation: "modules"
            referencedColumns: ["id"]
          },
          {
            foreignKeyName: "exam_attempts_student_id_fkey"
            columns: ["student_id"]
            isOneToOne: false
            referencedRelation: "students"
            referencedColumns: ["id"]
          },
        ]
      }
      interventions: {
        Row: {
          accepted_at: string | null
          agent_id: string | null
          alert_id: string | null
          arrived_at: string | null
          assigned_at: string | null
          created_at: string
          en_route_at: string | null
          id: string
          report: string | null
          resolved_at: string | null
          security_center_id: string | null
          status: Database["public"]["Enums"]["securia_intervention_status"]
          updated_at: string
        }
        Insert: {
          accepted_at?: string | null
          agent_id?: string | null
          alert_id?: string | null
          arrived_at?: string | null
          assigned_at?: string | null
          created_at?: string
          en_route_at?: string | null
          id?: string
          report?: string | null
          resolved_at?: string | null
          security_center_id?: string | null
          status?: Database["public"]["Enums"]["securia_intervention_status"]
          updated_at?: string
        }
        Update: {
          accepted_at?: string | null
          agent_id?: string | null
          alert_id?: string | null
          arrived_at?: string | null
          assigned_at?: string | null
          created_at?: string
          en_route_at?: string | null
          id?: string
          report?: string | null
          resolved_at?: string | null
          security_center_id?: string | null
          status?: Database["public"]["Enums"]["securia_intervention_status"]
          updated_at?: string
        }
        Relationships: [
          {
            foreignKeyName: "fk_interventions_alert"
            columns: ["alert_id"]
            isOneToOne: false
            referencedRelation: "alerts"
            referencedColumns: ["id"]
          },
          {
            foreignKeyName: "interventions_agent_id_fkey"
            columns: ["agent_id"]
            isOneToOne: false
            referencedRelation: "security_agents"
            referencedColumns: ["id"]
          },
          {
            foreignKeyName: "interventions_security_center_id_fkey"
            columns: ["security_center_id"]
            isOneToOne: false
            referencedRelation: "security_centers"
            referencedColumns: ["id"]
          },
        ]
      }
      lot_owners: {
        Row: {
          assignment_date: string | null
          client_id: string
          contract_ref: string | null
          created_at: string | null
          id: string
          lot_id: string
          notes: string | null
          purchase_price: number | null
          status: string | null
        }
        Insert: {
          assignment_date?: string | null
          client_id: string
          contract_ref?: string | null
          created_at?: string | null
          id?: string
          lot_id: string
          notes?: string | null
          purchase_price?: number | null
          status?: string | null
        }
        Update: {
          assignment_date?: string | null
          client_id?: string
          contract_ref?: string | null
          created_at?: string | null
          id?: string
          lot_id?: string
          notes?: string | null
          purchase_price?: number | null
          status?: string | null
        }
        Relationships: [
          {
            foreignKeyName: "lot_owners_client_id_fkey"
            columns: ["client_id"]
            isOneToOne: false
            referencedRelation: "profiles"
            referencedColumns: ["id"]
          },
          {
            foreignKeyName: "lot_owners_lot_id_fkey"
            columns: ["lot_id"]
            isOneToOne: false
            referencedRelation: "lots"
            referencedColumns: ["id"]
          },
        ]
      }
      lot_verifications: {
        Row: {
          additional_info: string | null
          admin_notes: string | null
          attachment_url: string | null
          buyer_ref: string | null
          client_email: string | null
          client_id: string | null
          client_name: string
          client_phone: string
          created_at: string | null
          id: string
          ilot_number: string
          location: string
          lot_number: string
          project_name: string
          request_number: string
          status: string | null
          updated_at: string | null
          verification_result: string | null
          verified_at: string | null
          verified_by: string | null
        }
        Insert: {
          additional_info?: string | null
          admin_notes?: string | null
          attachment_url?: string | null
          buyer_ref?: string | null
          client_email?: string | null
          client_id?: string | null
          client_name: string
          client_phone: string
          created_at?: string | null
          id?: string
          ilot_number: string
          location: string
          lot_number: string
          project_name: string
          request_number: string
          status?: string | null
          updated_at?: string | null
          verification_result?: string | null
          verified_at?: string | null
          verified_by?: string | null
        }
        Update: {
          additional_info?: string | null
          admin_notes?: string | null
          attachment_url?: string | null
          buyer_ref?: string | null
          client_email?: string | null
          client_id?: string | null
          client_name?: string
          client_phone?: string
          created_at?: string | null
          id?: string
          ilot_number?: string
          location?: string
          lot_number?: string
          project_name?: string
          request_number?: string
          status?: string | null
          updated_at?: string | null
          verification_result?: string | null
          verified_at?: string | null
          verified_by?: string | null
        }
        Relationships: [
          {
            foreignKeyName: "lot_verifications_client_id_fkey"
            columns: ["client_id"]
            isOneToOne: false
            referencedRelation: "profiles"
            referencedColumns: ["id"]
          },
          {
            foreignKeyName: "lot_verifications_verified_by_fkey"
            columns: ["verified_by"]
            isOneToOne: false
            referencedRelation: "profiles"
            referencedColumns: ["id"]
          },
        ]
      }
      lots: {
        Row: {
          coordinates: string | null
          created_at: string | null
          description: string | null
          document_available: boolean | null
          has_acd: boolean | null
          id: string
          ilot_number: string
          location: string
          lot_number: string
          price: number | null
          project_id: string | null
          project_name: string | null
          reference: string | null
          status: string | null
          surface: number
          updated_at: string | null
        }
        Insert: {
          coordinates?: string | null
          created_at?: string | null
          description?: string | null
          document_available?: boolean | null
          has_acd?: boolean | null
          id?: string
          ilot_number: string
          location: string
          lot_number: string
          price?: number | null
          project_id?: string | null
          project_name?: string | null
          reference?: string | null
          status?: string | null
          surface: number
          updated_at?: string | null
        }
        Update: {
          coordinates?: string | null
          created_at?: string | null
          description?: string | null
          document_available?: boolean | null
          has_acd?: boolean | null
          id?: string
          ilot_number?: string
          location?: string
          lot_number?: string
          price?: number | null
          project_id?: string | null
          project_name?: string | null
          reference?: string | null
          status?: string | null
          surface?: number
          updated_at?: string | null
        }
        Relationships: [
          {
            foreignKeyName: "lots_project_id_fkey"
            columns: ["project_id"]
            isOneToOne: false
            referencedRelation: "projects"
            referencedColumns: ["id"]
          },
        ]
      }
      messages: {
        Row: {
          content: string
          created_at: string | null
          id: string
          is_admin_sender: boolean | null
          read_at: string | null
          receiver_id: string
          sender_id: string
        }
        Insert: {
          content: string
          created_at?: string | null
          id?: string
          is_admin_sender?: boolean | null
          read_at?: string | null
          receiver_id: string
          sender_id: string
        }
        Update: {
          content?: string
          created_at?: string | null
          id?: string
          is_admin_sender?: boolean | null
          read_at?: string | null
          receiver_id?: string
          sender_id?: string
        }
        Relationships: [
          {
            foreignKeyName: "messages_receiver_id_fkey"
            columns: ["receiver_id"]
            isOneToOne: false
            referencedRelation: "profiles"
            referencedColumns: ["id"]
          },
          {
            foreignKeyName: "messages_sender_id_fkey"
            columns: ["sender_id"]
            isOneToOne: false
            referencedRelation: "profiles"
            referencedColumns: ["id"]
          },
        ]
      }
      modules: {
        Row: {
          color: string
          created_at: string
          description: string | null
          duration_minutes: number
          icon: string
          id: string
          is_active: boolean
          name: string
          slug: string
          updated_at: string
        }
        Insert: {
          color?: string
          created_at?: string
          description?: string | null
          duration_minutes?: number
          icon?: string
          id?: string
          is_active?: boolean
          name: string
          slug: string
          updated_at?: string
        }
        Update: {
          color?: string
          created_at?: string
          description?: string | null
          duration_minutes?: number
          icon?: string
          id?: string
          is_active?: boolean
          name?: string
          slug?: string
          updated_at?: string
        }
        Relationships: []
      }
      notifications: {
        Row: {
          created_at: string | null
          id: string
          is_read: boolean | null
          link: string | null
          message: string
          title: string
          type: string | null
          user_id: string
        }
        Insert: {
          created_at?: string | null
          id?: string
          is_read?: boolean | null
          link?: string | null
          message: string
          title: string
          type?: string | null
          user_id: string
        }
        Update: {
          created_at?: string | null
          id?: string
          is_read?: boolean | null
          link?: string | null
          message?: string
          title?: string
          type?: string | null
          user_id?: string
        }
        Relationships: [
          {
            foreignKeyName: "notifications_user_id_fkey"
            columns: ["user_id"]
            isOneToOne: false
            referencedRelation: "profiles"
            referencedColumns: ["id"]
          },
        ]
      }
      order_items: {
        Row: {
          commission_amount: number
          commission_rate: number
          created_at: string
          id: string
          order_id: string
          product_id: string | null
          product_image: string | null
          product_name: string
          quantity: number
          seller_earning: number
          status: Database["public"]["Enums"]["order_status"]
          store_id: string
          subtotal: number
          unit_price: number
        }
        Insert: {
          commission_amount: number
          commission_rate?: number
          created_at?: string
          id?: string
          order_id: string
          product_id?: string | null
          product_image?: string | null
          product_name: string
          quantity: number
          seller_earning: number
          status?: Database["public"]["Enums"]["order_status"]
          store_id: string
          subtotal: number
          unit_price: number
        }
        Update: {
          commission_amount?: number
          commission_rate?: number
          created_at?: string
          id?: string
          order_id?: string
          product_id?: string | null
          product_image?: string | null
          product_name?: string
          quantity?: number
          seller_earning?: number
          status?: Database["public"]["Enums"]["order_status"]
          store_id?: string
          subtotal?: number
          unit_price?: number
        }
        Relationships: []
      }
      orders: {
        Row: {
          created_at: string
          customer_email: string | null
          customer_id: string | null
          customer_name: string
          customer_phone: string
          delivery_address: string
          delivery_fee: number
          delivery_zone_id: string | null
          delivery_zone_name: string
          driver_id: string | null
          driver_name: string | null
          driver_phone: string | null
          id: string
          notes: string | null
          order_number: string
          payment_method: Database["public"]["Enums"]["payment_method"]
          payment_status: Database["public"]["Enums"]["payment_status"]
          status: Database["public"]["Enums"]["order_status"]
          subtotal: number
          total_amount: number
          total_commission: number
          updated_at: string
        }
        Insert: {
          created_at?: string
          customer_email?: string | null
          customer_id?: string | null
          customer_name: string
          customer_phone: string
          delivery_address: string
          delivery_fee?: number
          delivery_zone_id?: string | null
          delivery_zone_name: string
          driver_id?: string | null
          driver_name?: string | null
          driver_phone?: string | null
          id?: string
          notes?: string | null
          order_number: string
          payment_method?: Database["public"]["Enums"]["payment_method"]
          payment_status?: Database["public"]["Enums"]["payment_status"]
          status?: Database["public"]["Enums"]["order_status"]
          subtotal: number
          total_amount: number
          total_commission?: number
          updated_at?: string
        }
        Update: {
          created_at?: string
          customer_email?: string | null
          customer_id?: string | null
          customer_name?: string
          customer_phone?: string
          delivery_address?: string
          delivery_fee?: number
          delivery_zone_id?: string | null
          delivery_zone_name?: string
          driver_id?: string | null
          driver_name?: string | null
          driver_phone?: string | null
          id?: string
          notes?: string | null
          order_number?: string
          payment_method?: Database["public"]["Enums"]["payment_method"]
          payment_status?: Database["public"]["Enums"]["payment_status"]
          status?: Database["public"]["Enums"]["order_status"]
          subtotal?: number
          total_amount?: number
          total_commission?: number
          updated_at?: string
        }
        Relationships: []
      }
      organizations: {
        Row: {
          address: string | null
          city: string | null
          code: string
          created_at: string
          email: string | null
          id: string
          is_active: boolean
          name: string
          phone: string | null
          postal_code: string | null
          updated_at: string
        }
        Insert: {
          address?: string | null
          city?: string | null
          code: string
          created_at?: string
          email?: string | null
          id?: string
          is_active?: boolean
          name: string
          phone?: string | null
          postal_code?: string | null
          updated_at?: string
        }
        Update: {
          address?: string | null
          city?: string | null
          code?: string
          created_at?: string
          email?: string | null
          id?: string
          is_active?: boolean
          name?: string
          phone?: string | null
          postal_code?: string | null
          updated_at?: string
        }
        Relationships: []
      }
      payout_requests: {
        Row: {
          admin_notes: string | null
          amount: number
          created_at: string | null
          id: string
          payment_method: string
          phone_number: string
          processed_at: string | null
          seller_id: string
          status: string
          store_id: string
        }
        Insert: {
          admin_notes?: string | null
          amount: number
          created_at?: string | null
          id: string
          payment_method: string
          phone_number: string
          processed_at?: string | null
          seller_id: string
          status?: string
          store_id: string
        }
        Update: {
          admin_notes?: string | null
          amount?: number
          created_at?: string | null
          id?: string
          payment_method?: string
          phone_number?: string
          processed_at?: string | null
          seller_id?: string
          status?: string
          store_id?: string
        }
        Relationships: []
      }
      products: {
        Row: {
          accommodation_type: string | null
          amenities: Json | null
          available_rooms: number | null
          category_id: string | null
          created_at: string
          description: string
          id: string
          images: string[]
          ingredients: string | null
          is_featured: boolean
          is_food: boolean | null
          is_hospitality: boolean | null
          is_spicy: boolean | null
          menu_category: string | null
          name: string
          portion_size: string | null
          preparation_time: number | null
          price: number
          price_per_night: number | null
          promo_price: number | null
          rating: number | null
          review_count: number | null
          sku: string | null
          slug: string
          status: Database["public"]["Enums"]["product_status"]
          stock: number
          store_id: string
          thumbnail_url: string | null
          total_rooms: number | null
          updated_at: string
          view_count: number
        }
        Insert: {
          accommodation_type?: string | null
          amenities?: Json | null
          available_rooms?: number | null
          category_id?: string | null
          created_at?: string
          description: string
          id?: string
          images?: string[]
          ingredients?: string | null
          is_featured?: boolean
          is_food?: boolean | null
          is_hospitality?: boolean | null
          is_spicy?: boolean | null
          menu_category?: string | null
          name: string
          portion_size?: string | null
          preparation_time?: number | null
          price: number
          price_per_night?: number | null
          promo_price?: number | null
          rating?: number | null
          review_count?: number | null
          sku?: string | null
          slug: string
          status?: Database["public"]["Enums"]["product_status"]
          stock?: number
          store_id: string
          thumbnail_url?: string | null
          total_rooms?: number | null
          updated_at?: string
          view_count?: number
        }
        Update: {
          accommodation_type?: string | null
          amenities?: Json | null
          available_rooms?: number | null
          category_id?: string | null
          created_at?: string
          description?: string
          id?: string
          images?: string[]
          ingredients?: string | null
          is_featured?: boolean
          is_food?: boolean | null
          is_hospitality?: boolean | null
          is_spicy?: boolean | null
          menu_category?: string | null
          name?: string
          portion_size?: string | null
          preparation_time?: number | null
          price?: number
          price_per_night?: number | null
          promo_price?: number | null
          rating?: number | null
          review_count?: number | null
          sku?: string | null
          slug?: string
          status?: Database["public"]["Enums"]["product_status"]
          stock?: number
          store_id?: string
          thumbnail_url?: string | null
          total_rooms?: number | null
          updated_at?: string
          view_count?: number
        }
        Relationships: []
      }
      profiles: {
        Row: {
          address: string | null
          avatar_url: string | null
          cni_number: string | null
          cni_url: string | null
          commune: string | null
          created_at: string
          email: string
          full_name: string
          id: string
          is_online: boolean | null
          last_login_at: string | null
          live_photo_url: string | null
          phone: string | null
          role: Database["public"]["Enums"]["user_role"]
          status: Database["public"]["Enums"]["user_status"]
          terms_accepted: boolean | null
          terms_accepted_at: string | null
          updated_at: string
          vehicle_type: string | null
          work_status: string | null
        }
        Insert: {
          address?: string | null
          avatar_url?: string | null
          cni_number?: string | null
          cni_url?: string | null
          commune?: string | null
          created_at?: string
          email: string
          full_name: string
          id: string
          is_online?: boolean | null
          last_login_at?: string | null
          live_photo_url?: string | null
          phone?: string | null
          role?: Database["public"]["Enums"]["user_role"]
          status?: Database["public"]["Enums"]["user_status"]
          terms_accepted?: boolean | null
          terms_accepted_at?: string | null
          updated_at?: string
          vehicle_type?: string | null
          work_status?: string | null
        }
        Update: {
          address?: string | null
          avatar_url?: string | null
          cni_number?: string | null
          cni_url?: string | null
          commune?: string | null
          created_at?: string
          email?: string
          full_name?: string
          id?: string
          is_online?: boolean | null
          last_login_at?: string | null
          live_photo_url?: string | null
          phone?: string | null
          role?: Database["public"]["Enums"]["user_role"]
          status?: Database["public"]["Enums"]["user_status"]
          terms_accepted?: boolean | null
          terms_accepted_at?: string | null
          updated_at?: string
          vehicle_type?: string | null
          work_status?: string | null
        }
        Relationships: []
      }
      projects: {
        Row: {
          available_lots: number | null
          code: string | null
          commune: string | null
          created_at: string | null
          description: string | null
          id: string
          image_url: string | null
          location: string
          name: string
          status: string | null
          total_lots: number | null
          updated_at: string | null
        }
        Insert: {
          available_lots?: number | null
          code?: string | null
          commune?: string | null
          created_at?: string | null
          description?: string | null
          id?: string
          image_url?: string | null
          location: string
          name: string
          status?: string | null
          total_lots?: number | null
          updated_at?: string | null
        }
        Update: {
          available_lots?: number | null
          code?: string | null
          commune?: string | null
          created_at?: string | null
          description?: string | null
          id?: string
          image_url?: string | null
          location?: string
          name?: string
          status?: string | null
          total_lots?: number | null
          updated_at?: string | null
        }
        Relationships: []
      }
      properties: {
        Row: {
          advance_months: number | null
          amenities: string[] | null
          bathrooms: number | null
          bedrooms: number | null
          commune: string | null
          created_at: string | null
          deposit_months: number | null
          description: string | null
          id: string
          images: string[] | null
          is_featured: boolean | null
          listing_type: string | null
          location: string
          price: number | null
          price_on_demand: boolean | null
          project_id: string | null
          property_type: string
          rental_frequency: string | null
          status: string | null
          surface: number | null
          title: string
          updated_at: string | null
        }
        Insert: {
          advance_months?: number | null
          amenities?: string[] | null
          bathrooms?: number | null
          bedrooms?: number | null
          commune?: string | null
          created_at?: string | null
          deposit_months?: number | null
          description?: string | null
          id?: string
          images?: string[] | null
          is_featured?: boolean | null
          listing_type?: string | null
          location: string
          price?: number | null
          price_on_demand?: boolean | null
          project_id?: string | null
          property_type: string
          rental_frequency?: string | null
          status?: string | null
          surface?: number | null
          title: string
          updated_at?: string | null
        }
        Update: {
          advance_months?: number | null
          amenities?: string[] | null
          bathrooms?: number | null
          bedrooms?: number | null
          commune?: string | null
          created_at?: string | null
          deposit_months?: number | null
          description?: string | null
          id?: string
          images?: string[] | null
          is_featured?: boolean | null
          listing_type?: string | null
          location?: string
          price?: number | null
          price_on_demand?: boolean | null
          project_id?: string | null
          property_type?: string
          rental_frequency?: string | null
          status?: string | null
          surface?: number | null
          title?: string
          updated_at?: string | null
        }
        Relationships: [
          {
            foreignKeyName: "properties_project_id_fkey"
            columns: ["project_id"]
            isOneToOne: false
            referencedRelation: "projects"
            referencedColumns: ["id"]
          },
        ]
      }
      protected_sites: {
        Row: {
          access_instructions: string | null
          address: string
          city: string | null
          created_at: string
          id: string
          is_default: boolean
          latitude: number | null
          longitude: number | null
          name: string
          organization_id: string | null
          owner_id: string
          postal_code: string | null
          security_center_id: string | null
          site_type: Database["public"]["Enums"]["securia_site_type"]
          updated_at: string
        }
        Insert: {
          access_instructions?: string | null
          address: string
          city?: string | null
          created_at?: string
          id?: string
          is_default?: boolean
          latitude?: number | null
          longitude?: number | null
          name: string
          organization_id?: string | null
          owner_id: string
          postal_code?: string | null
          security_center_id?: string | null
          site_type?: Database["public"]["Enums"]["securia_site_type"]
          updated_at?: string
        }
        Update: {
          access_instructions?: string | null
          address?: string
          city?: string | null
          created_at?: string
          id?: string
          is_default?: boolean
          latitude?: number | null
          longitude?: number | null
          name?: string
          organization_id?: string | null
          owner_id?: string
          postal_code?: string | null
          security_center_id?: string | null
          site_type?: Database["public"]["Enums"]["securia_site_type"]
          updated_at?: string
        }
        Relationships: [
          {
            foreignKeyName: "protected_sites_organization_id_fkey"
            columns: ["organization_id"]
            isOneToOne: false
            referencedRelation: "organizations"
            referencedColumns: ["id"]
          },
          {
            foreignKeyName: "protected_sites_owner_id_fkey"
            columns: ["owner_id"]
            isOneToOne: false
            referencedRelation: "users"
            referencedColumns: ["id"]
          },
          {
            foreignKeyName: "protected_sites_security_center_id_fkey"
            columns: ["security_center_id"]
            isOneToOne: false
            referencedRelation: "security_centers"
            referencedColumns: ["id"]
          },
        ]
      }
      questions: {
        Row: {
          created_at: string
          difficulty: string | null
          explanation: string | null
          id: string
          is_active: boolean
          module_id: string
          question: string
          updated_at: string
        }
        Insert: {
          created_at?: string
          difficulty?: string | null
          explanation?: string | null
          id?: string
          is_active?: boolean
          module_id: string
          question: string
          updated_at?: string
        }
        Update: {
          created_at?: string
          difficulty?: string | null
          explanation?: string | null
          id?: string
          is_active?: boolean
          module_id?: string
          question?: string
          updated_at?: string
        }
        Relationships: [
          {
            foreignKeyName: "questions_module_id_fkey"
            columns: ["module_id"]
            isOneToOne: false
            referencedRelation: "modules"
            referencedColumns: ["id"]
          },
        ]
      }
      quote_items: {
        Row: {
          category: string
          created_at: string | null
          description: string
          id: string
          order_index: number | null
          quantity: number | null
          quote_id: string
          total_price: number | null
          unit: string | null
          unit_price: number
        }
        Insert: {
          category?: string
          created_at?: string | null
          description: string
          id?: string
          order_index?: number | null
          quantity?: number | null
          quote_id: string
          total_price?: number | null
          unit?: string | null
          unit_price: number
        }
        Update: {
          category?: string
          created_at?: string | null
          description?: string
          id?: string
          order_index?: number | null
          quantity?: number | null
          quote_id?: string
          total_price?: number | null
          unit?: string | null
          unit_price?: number
        }
        Relationships: [
          {
            foreignKeyName: "quote_items_quote_id_fkey"
            columns: ["quote_id"]
            isOneToOne: false
            referencedRelation: "construction_quotes"
            referencedColumns: ["id"]
          },
        ]
      }
      reviews: {
        Row: {
          comment: string
          created_at: string | null
          id: string
          is_verified_purchase: boolean | null
          product_id: string
          rating: number
          user_avatar: string | null
          user_id: string
          user_name: string
        }
        Insert: {
          comment: string
          created_at?: string | null
          id: string
          is_verified_purchase?: boolean | null
          product_id: string
          rating: number
          user_avatar?: string | null
          user_id: string
          user_name: string
        }
        Update: {
          comment?: string
          created_at?: string | null
          id?: string
          is_verified_purchase?: boolean | null
          product_id?: string
          rating?: number
          user_avatar?: string | null
          user_id?: string
          user_name?: string
        }
        Relationships: []
      }
      security_agents: {
        Row: {
          badge_number: string
          created_at: string
          current_latitude: number | null
          current_longitude: number | null
          duty_status: Database["public"]["Enums"]["securia_agent_duty_status"]
          id: string
          is_active: boolean
          last_location_update: string | null
          organization_id: string
          patrol_vehicle: string | null
          security_center_id: string | null
          updated_at: string
          user_id: string
        }
        Insert: {
          badge_number: string
          created_at?: string
          current_latitude?: number | null
          current_longitude?: number | null
          duty_status?: Database["public"]["Enums"]["securia_agent_duty_status"]
          id?: string
          is_active?: boolean
          last_location_update?: string | null
          organization_id: string
          patrol_vehicle?: string | null
          security_center_id?: string | null
          updated_at?: string
          user_id: string
        }
        Update: {
          badge_number?: string
          created_at?: string
          current_latitude?: number | null
          current_longitude?: number | null
          duty_status?: Database["public"]["Enums"]["securia_agent_duty_status"]
          id?: string
          is_active?: boolean
          last_location_update?: string | null
          organization_id?: string
          patrol_vehicle?: string | null
          security_center_id?: string | null
          updated_at?: string
          user_id?: string
        }
        Relationships: [
          {
            foreignKeyName: "security_agents_organization_id_fkey"
            columns: ["organization_id"]
            isOneToOne: false
            referencedRelation: "organizations"
            referencedColumns: ["id"]
          },
          {
            foreignKeyName: "security_agents_security_center_id_fkey"
            columns: ["security_center_id"]
            isOneToOne: false
            referencedRelation: "security_centers"
            referencedColumns: ["id"]
          },
          {
            foreignKeyName: "security_agents_user_id_fkey"
            columns: ["user_id"]
            isOneToOne: true
            referencedRelation: "users"
            referencedColumns: ["id"]
          },
        ]
      }
      security_centers: {
        Row: {
          address: string | null
          city: string | null
          code: string
          created_at: string
          email: string | null
          id: string
          is_active: boolean
          latitude: number | null
          longitude: number | null
          name: string
          organization_id: string
          phone: string | null
          postal_code: string | null
          updated_at: string
        }
        Insert: {
          address?: string | null
          city?: string | null
          code: string
          created_at?: string
          email?: string | null
          id?: string
          is_active?: boolean
          latitude?: number | null
          longitude?: number | null
          name: string
          organization_id: string
          phone?: string | null
          postal_code?: string | null
          updated_at?: string
        }
        Update: {
          address?: string | null
          city?: string | null
          code?: string
          created_at?: string
          email?: string | null
          id?: string
          is_active?: boolean
          latitude?: number | null
          longitude?: number | null
          name?: string
          organization_id?: string
          phone?: string | null
          postal_code?: string | null
          updated_at?: string
        }
        Relationships: [
          {
            foreignKeyName: "security_centers_organization_id_fkey"
            columns: ["organization_id"]
            isOneToOne: false
            referencedRelation: "organizations"
            referencedColumns: ["id"]
          },
        ]
      }
      site_members: {
        Row: {
          can_trigger_alert: boolean
          created_at: string
          id: string
          member_role: Database["public"]["Enums"]["securia_site_member_role"]
          site_id: string
          user_id: string
        }
        Insert: {
          can_trigger_alert?: boolean
          created_at?: string
          id?: string
          member_role?: Database["public"]["Enums"]["securia_site_member_role"]
          site_id: string
          user_id: string
        }
        Update: {
          can_trigger_alert?: boolean
          created_at?: string
          id?: string
          member_role?: Database["public"]["Enums"]["securia_site_member_role"]
          site_id?: string
          user_id?: string
        }
        Relationships: [
          {
            foreignKeyName: "site_members_site_id_fkey"
            columns: ["site_id"]
            isOneToOne: false
            referencedRelation: "protected_sites"
            referencedColumns: ["id"]
          },
          {
            foreignKeyName: "site_members_user_id_fkey"
            columns: ["user_id"]
            isOneToOne: false
            referencedRelation: "users"
            referencedColumns: ["id"]
          },
        ]
      }
      stores: {
        Row: {
          accepts_delivery: boolean | null
          accepts_reservations: boolean | null
          accommodation_type: string | null
          address: string
          amenities: Json | null
          available_rooms: number | null
          banner_url: string | null
          commission_rate: number
          commune: string
          created_at: string
          cuisine_type: string | null
          description: string | null
          email: string | null
          gallery_urls: Json | null
          id: string
          logo_url: string | null
          name: string
          opening_hours: string | null
          phone: string
          rating: number | null
          review_count: number | null
          seller_id: string
          slug: string
          status: Database["public"]["Enums"]["store_status"]
          store_type: string | null
          total_rooms: number | null
          total_sales: number
          updated_at: string
        }
        Insert: {
          accepts_delivery?: boolean | null
          accepts_reservations?: boolean | null
          accommodation_type?: string | null
          address: string
          amenities?: Json | null
          available_rooms?: number | null
          banner_url?: string | null
          commission_rate?: number
          commune?: string
          created_at?: string
          cuisine_type?: string | null
          description?: string | null
          email?: string | null
          gallery_urls?: Json | null
          id?: string
          logo_url?: string | null
          name: string
          opening_hours?: string | null
          phone: string
          rating?: number | null
          review_count?: number | null
          seller_id: string
          slug: string
          status?: Database["public"]["Enums"]["store_status"]
          store_type?: string | null
          total_rooms?: number | null
          total_sales?: number
          updated_at?: string
        }
        Update: {
          accepts_delivery?: boolean | null
          accepts_reservations?: boolean | null
          accommodation_type?: string | null
          address?: string
          amenities?: Json | null
          available_rooms?: number | null
          banner_url?: string | null
          commission_rate?: number
          commune?: string
          created_at?: string
          cuisine_type?: string | null
          description?: string | null
          email?: string | null
          gallery_urls?: Json | null
          id?: string
          logo_url?: string | null
          name?: string
          opening_hours?: string | null
          phone?: string
          rating?: number | null
          review_count?: number | null
          seller_id?: string
          slug?: string
          status?: Database["public"]["Enums"]["store_status"]
          store_type?: string | null
          total_rooms?: number | null
          total_sales?: number
          updated_at?: string
        }
        Relationships: []
      }
      student_diplomas: {
        Row: {
          certificate_number: string
          created_at: string
          graduation_date: string
          iata_specialty_title: string
          id: string
          is_verified: boolean
          jury_president_name: string
          jury_president_role: string
          mention: string
          module_id: string | null
          score_percentage: number
          student_id: string
          verification_hash: string
        }
        Insert: {
          certificate_number: string
          created_at?: string
          graduation_date?: string
          iata_specialty_title: string
          id?: string
          is_verified?: boolean
          jury_president_name?: string
          jury_president_role?: string
          mention?: string
          module_id?: string | null
          score_percentage?: number
          student_id: string
          verification_hash: string
        }
        Update: {
          certificate_number?: string
          created_at?: string
          graduation_date?: string
          iata_specialty_title?: string
          id?: string
          is_verified?: boolean
          jury_president_name?: string
          jury_president_role?: string
          mention?: string
          module_id?: string | null
          score_percentage?: number
          student_id?: string
          verification_hash?: string
        }
        Relationships: [
          {
            foreignKeyName: "student_diplomas_module_id_fkey"
            columns: ["module_id"]
            isOneToOne: false
            referencedRelation: "modules"
            referencedColumns: ["id"]
          },
          {
            foreignKeyName: "student_diplomas_student_id_fkey"
            columns: ["student_id"]
            isOneToOne: false
            referencedRelation: "students"
            referencedColumns: ["id"]
          },
        ]
      }
      student_internships: {
        Row: {
          company_name: string
          company_sector: string
          created_at: string
          end_date: string
          evaluation_score: number | null
          id: string
          mentor_feedback: string | null
          role_title: string
          start_date: string
          status: string
          student_id: string
          supervisor_contact: string | null
          supervisor_name: string | null
          updated_at: string
        }
        Insert: {
          company_name: string
          company_sector?: string
          created_at?: string
          end_date: string
          evaluation_score?: number | null
          id?: string
          mentor_feedback?: string | null
          role_title: string
          start_date: string
          status?: string
          student_id: string
          supervisor_contact?: string | null
          supervisor_name?: string | null
          updated_at?: string
        }
        Update: {
          company_name?: string
          company_sector?: string
          created_at?: string
          end_date?: string
          evaluation_score?: number | null
          id?: string
          mentor_feedback?: string | null
          role_title?: string
          start_date?: string
          status?: string
          student_id?: string
          supervisor_contact?: string | null
          supervisor_name?: string | null
          updated_at?: string
        }
        Relationships: [
          {
            foreignKeyName: "student_internships_student_id_fkey"
            columns: ["student_id"]
            isOneToOne: false
            referencedRelation: "students"
            referencedColumns: ["id"]
          },
        ]
      }
      student_lesson_progress: {
        Row: {
          completed_at: string | null
          id: string
          lesson_id: string
          quiz_score: number | null
          status: string
          student_id: string
          updated_at: string | null
        }
        Insert: {
          completed_at?: string | null
          id?: string
          lesson_id: string
          quiz_score?: number | null
          status?: string
          student_id: string
          updated_at?: string | null
        }
        Update: {
          completed_at?: string | null
          id?: string
          lesson_id?: string
          quiz_score?: number | null
          status?: string
          student_id?: string
          updated_at?: string | null
        }
        Relationships: [
          {
            foreignKeyName: "student_lesson_progress_lesson_id_fkey"
            columns: ["lesson_id"]
            isOneToOne: false
            referencedRelation: "course_lessons"
            referencedColumns: ["id"]
          },
          {
            foreignKeyName: "student_lesson_progress_student_id_fkey"
            columns: ["student_id"]
            isOneToOne: false
            referencedRelation: "students"
            referencedColumns: ["id"]
          },
        ]
      }
      student_modules: {
        Row: {
          created_at: string | null
          id: string
          module_id: string
          student_id: string
        }
        Insert: {
          created_at?: string | null
          id?: string
          module_id: string
          student_id: string
        }
        Update: {
          created_at?: string | null
          id?: string
          module_id?: string
          student_id?: string
        }
        Relationships: [
          {
            foreignKeyName: "student_modules_module_id_fkey"
            columns: ["module_id"]
            isOneToOne: false
            referencedRelation: "modules"
            referencedColumns: ["id"]
          },
          {
            foreignKeyName: "student_modules_student_id_fkey"
            columns: ["student_id"]
            isOneToOne: false
            referencedRelation: "students"
            referencedColumns: ["id"]
          },
        ]
      }
      student_sessions: {
        Row: {
          created_at: string | null
          expires_at: string | null
          id: string
          session_token: string
          student_id: string
        }
        Insert: {
          created_at?: string | null
          expires_at?: string | null
          id?: string
          session_token: string
          student_id: string
        }
        Update: {
          created_at?: string | null
          expires_at?: string | null
          id?: string
          session_token?: string
          student_id?: string
        }
        Relationships: [
          {
            foreignKeyName: "student_sessions_student_id_fkey"
            columns: ["student_id"]
            isOneToOne: false
            referencedRelation: "students"
            referencedColumns: ["id"]
          },
        ]
      }
      students: {
        Row: {
          avatar_url: string | null
          created_at: string | null
          email: string | null
          expiration_date: string | null
          first_name: string | null
          formation: string | null
          full_name: string
          id: string
          is_active: boolean | null
          last_login_at: string | null
          last_name: string | null
          login: string | null
          matricule: string
          module_id: string
          password: string
          password_hash: string | null
          phone: string | null
          promotion: string | null
          start_date: string | null
          student_number: string | null
          updated_at: string | null
        }
        Insert: {
          avatar_url?: string | null
          created_at?: string | null
          email?: string | null
          expiration_date?: string | null
          first_name?: string | null
          formation?: string | null
          full_name: string
          id?: string
          is_active?: boolean | null
          last_login_at?: string | null
          last_name?: string | null
          login?: string | null
          matricule: string
          module_id: string
          password: string
          password_hash?: string | null
          phone?: string | null
          promotion?: string | null
          start_date?: string | null
          student_number?: string | null
          updated_at?: string | null
        }
        Update: {
          avatar_url?: string | null
          created_at?: string | null
          email?: string | null
          expiration_date?: string | null
          first_name?: string | null
          formation?: string | null
          full_name?: string
          id?: string
          is_active?: boolean | null
          last_login_at?: string | null
          last_name?: string | null
          login?: string | null
          matricule?: string
          module_id?: string
          password?: string
          password_hash?: string | null
          phone?: string | null
          promotion?: string | null
          start_date?: string | null
          student_number?: string | null
          updated_at?: string | null
        }
        Relationships: [
          {
            foreignKeyName: "students_module_id_fkey"
            columns: ["module_id"]
            isOneToOne: false
            referencedRelation: "modules"
            referencedColumns: ["id"]
          },
        ]
      }
      support_tickets: {
        Row: {
          agent_id: string | null
          agent_name: string | null
          created_at: string | null
          customer_id: string | null
          customer_name: string
          customer_phone: string
          description: string
          id: string
          order_id: string | null
          order_number: string | null
          photo_evidence_url: string | null
          priority: string | null
          reason: string
          refund_amount: number | null
          resolution_notes: string | null
          status: string | null
          store_id: string | null
          store_name: string | null
          subject: string
          ticket_number: string
          updated_at: string | null
        }
        Insert: {
          agent_id?: string | null
          agent_name?: string | null
          created_at?: string | null
          customer_id?: string | null
          customer_name: string
          customer_phone: string
          description: string
          id: string
          order_id?: string | null
          order_number?: string | null
          photo_evidence_url?: string | null
          priority?: string | null
          reason: string
          refund_amount?: number | null
          resolution_notes?: string | null
          status?: string | null
          store_id?: string | null
          store_name?: string | null
          subject: string
          ticket_number: string
          updated_at?: string | null
        }
        Update: {
          agent_id?: string | null
          agent_name?: string | null
          created_at?: string | null
          customer_id?: string | null
          customer_name?: string
          customer_phone?: string
          description?: string
          id?: string
          order_id?: string | null
          order_number?: string | null
          photo_evidence_url?: string | null
          priority?: string | null
          reason?: string
          refund_amount?: number | null
          resolution_notes?: string | null
          status?: string | null
          store_id?: string | null
          store_name?: string | null
          subject?: string
          ticket_number?: string
          updated_at?: string | null
        }
        Relationships: []
      }
      table_reservations: {
        Row: {
          created_at: string
          customer_email: string | null
          customer_id: string | null
          customer_name: string
          customer_phone: string
          date: string
          guests_count: number
          id: string
          special_requests: string | null
          status: string
          store_id: string
          store_name: string | null
          table_preference: string | null
          time: string
        }
        Insert: {
          created_at?: string
          customer_email?: string | null
          customer_id?: string | null
          customer_name: string
          customer_phone: string
          date: string
          guests_count?: number
          id: string
          special_requests?: string | null
          status?: string
          store_id: string
          store_name?: string | null
          table_preference?: string | null
          time: string
        }
        Update: {
          created_at?: string
          customer_email?: string | null
          customer_id?: string | null
          customer_name?: string
          customer_phone?: string
          date?: string
          guests_count?: number
          id?: string
          special_requests?: string | null
          status?: string
          store_id?: string
          store_name?: string | null
          table_preference?: string | null
          time?: string
        }
        Relationships: []
      }
      users: {
        Row: {
          avatar_url: string | null
          created_at: string
          email: string
          full_name: string
          id: string
          is_active: boolean
          organization_id: string | null
          phone: string
          role: Database["public"]["Enums"]["securia_user_role"]
          security_center_id: string | null
          updated_at: string
        }
        Insert: {
          avatar_url?: string | null
          created_at?: string
          email: string
          full_name: string
          id: string
          is_active?: boolean
          organization_id?: string | null
          phone: string
          role?: Database["public"]["Enums"]["securia_user_role"]
          security_center_id?: string | null
          updated_at?: string
        }
        Update: {
          avatar_url?: string | null
          created_at?: string
          email?: string
          full_name?: string
          id?: string
          is_active?: boolean
          organization_id?: string | null
          phone?: string
          role?: Database["public"]["Enums"]["securia_user_role"]
          security_center_id?: string | null
          updated_at?: string
        }
        Relationships: [
          {
            foreignKeyName: "users_organization_id_fkey"
            columns: ["organization_id"]
            isOneToOne: false
            referencedRelation: "organizations"
            referencedColumns: ["id"]
          },
          {
            foreignKeyName: "users_security_center_id_fkey"
            columns: ["security_center_id"]
            isOneToOne: false
            referencedRelation: "security_centers"
            referencedColumns: ["id"]
          },
        ]
      }
      visit_requests: {
        Row: {
          admin_notes: string | null
          assigned_agent: string | null
          client_email: string | null
          client_id: string | null
          client_name: string
          client_phone: string
          client_whatsapp: string | null
          commune: string | null
          created_at: string | null
          desired_date: string
          desired_move_in: string | null
          id: string
          listing_type: string | null
          location: string | null
          notes: string | null
          occupants_count: number | null
          price: number | null
          property_id: string | null
          property_title: string
          property_type: string | null
          request_number: string
          status: string | null
          time_slot: string
          updated_at: string | null
          visit_type: string | null
        }
        Insert: {
          admin_notes?: string | null
          assigned_agent?: string | null
          client_email?: string | null
          client_id?: string | null
          client_name: string
          client_phone: string
          client_whatsapp?: string | null
          commune?: string | null
          created_at?: string | null
          desired_date: string
          desired_move_in?: string | null
          id?: string
          listing_type?: string | null
          location?: string | null
          notes?: string | null
          occupants_count?: number | null
          price?: number | null
          property_id?: string | null
          property_title: string
          property_type?: string | null
          request_number: string
          status?: string | null
          time_slot: string
          updated_at?: string | null
          visit_type?: string | null
        }
        Update: {
          admin_notes?: string | null
          assigned_agent?: string | null
          client_email?: string | null
          client_id?: string | null
          client_name?: string
          client_phone?: string
          client_whatsapp?: string | null
          commune?: string | null
          created_at?: string | null
          desired_date?: string
          desired_move_in?: string | null
          id?: string
          listing_type?: string | null
          location?: string | null
          notes?: string | null
          occupants_count?: number | null
          price?: number | null
          property_id?: string | null
          property_title?: string
          property_type?: string | null
          request_number?: string
          status?: string | null
          time_slot?: string
          updated_at?: string | null
          visit_type?: string | null
        }
        Relationships: [
          {
            foreignKeyName: "visit_requests_client_id_fkey"
            columns: ["client_id"]
            isOneToOne: false
            referencedRelation: "profiles"
            referencedColumns: ["id"]
          },
        ]
      }
      whatsapp_templates: {
        Row: {
          category: string
          code: string
          created_at: string | null
          id: string
          template_text: string
          title: string
        }
        Insert: {
          category: string
          code: string
          created_at?: string | null
          id?: string
          template_text: string
          title: string
        }
        Update: {
          category?: string
          code?: string
          created_at?: string | null
          id?: string
          template_text?: string
          title?: string
        }
        Relationships: []
      }
    }
    Views: {
      [_ in never]: never
    }
    Functions: {
      admin_create_student_full: {
        Args: {
          p_allowed_module_ids?: string[]
          p_email?: string
          p_expiration_date?: string
          p_first_name: string
          p_formation?: string
          p_last_name: string
          p_login: string
          p_module_id?: string
          p_password: string
          p_phone?: string
          p_promotion?: string
          p_start_date?: string
          p_student_number?: string
        }
        Returns: Json
      }
      admin_extend_student_access: {
        Args: {
          p_days?: number
          p_new_expiration?: string
          p_student_id: string
        }
        Returns: string
      }
      admin_reset_student_password: {
        Args: { p_new_password: string; p_student_id: string }
        Returns: boolean
      }
      format_reference: {
        Args: { prefix: string; seq_name: string }
        Returns: string
      }
      get_current_user_org_id: { Args: never; Returns: string }
      get_current_user_role: {
        Args: never
        Returns: Database["public"]["Enums"]["securia_user_role"]
      }
      is_admin: { Args: never; Returns: boolean }
      is_site_member: {
        Args: { p_site_id: string; p_user_id: string }
        Returns: boolean
      }
      is_site_owner: {
        Args: { p_site_id: string; p_user_id: string }
        Returns: boolean
      }
      verify_student_login: {
        Args: { p_login: string; p_password: string }
        Returns: Json
      }
    }
    Enums: {
      order_status:
        | "pending"
        | "confirmed"
        | "processing"
        | "ready_for_delivery"
        | "out_for_delivery"
        | "delivered"
        | "cancelled"
      payment_method:
        | "cash_on_delivery"
        | "wave"
        | "orange_money"
        | "mtn_money"
        | "moov_money"
      payment_status: "pending" | "paid" | "failed" | "refunded"
      product_status:
        | "draft"
        | "pending"
        | "published"
        | "out_of_stock"
        | "archived"
      securia_agent_duty_status:
        | "OFF_DUTY"
        | "AVAILABLE"
        | "BUSY"
        | "DISPATCHED"
      securia_alert_priority: "LOW" | "MEDIUM" | "HIGH" | "CRITICAL"
      securia_alert_status:
        | "CREATED"
        | "SENT"
        | "RECEIVED"
        | "ACKNOWLEDGED"
        | "ASSIGNED"
        | "EN_ROUTE"
        | "ARRIVED"
        | "RESOLVED"
        | "CANCELLED"
        | "FALSE_ALARM"
        | "ESCALATED"
      securia_alert_type:
        | "INTRUSION"
        | "MENACE"
        | "AGRESSION"
        | "PERSONNE_SUSPECTE"
        | "URGENCE"
      securia_intervention_status:
        | "PENDING"
        | "ACCEPTED"
        | "EN_ROUTE"
        | "ON_SITE"
        | "COMPLETED"
        | "ABORTED"
      securia_site_member_role:
        | "OWNER"
        | "FAMILY"
        | "EMPLOYEE"
        | "SECURITY_CONTACT"
      securia_site_type: "RESIDENCE" | "COMMERCE" | "ENTREPRISE" | "AUTRE"
      securia_user_role: "USER" | "AGENT" | "SECURITY_MANAGER" | "ADMIN"
      store_status: "pending" | "approved" | "rejected" | "suspended"
      user_role:
        | "customer"
        | "seller"
        | "driver"
        | "admin"
        | "super_admin"
        | "agent"
      user_status: "active" | "pending" | "suspended"
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
    Enums: {
      order_status: [
        "pending",
        "confirmed",
        "processing",
        "ready_for_delivery",
        "out_for_delivery",
        "delivered",
        "cancelled",
      ],
      payment_method: [
        "cash_on_delivery",
        "wave",
        "orange_money",
        "mtn_money",
        "moov_money",
      ],
      payment_status: ["pending", "paid", "failed", "refunded"],
      product_status: [
        "draft",
        "pending",
        "published",
        "out_of_stock",
        "archived",
      ],
      securia_agent_duty_status: [
        "OFF_DUTY",
        "AVAILABLE",
        "BUSY",
        "DISPATCHED",
      ],
      securia_alert_priority: ["LOW", "MEDIUM", "HIGH", "CRITICAL"],
      securia_alert_status: [
        "CREATED",
        "SENT",
        "RECEIVED",
        "ACKNOWLEDGED",
        "ASSIGNED",
        "EN_ROUTE",
        "ARRIVED",
        "RESOLVED",
        "CANCELLED",
        "FALSE_ALARM",
        "ESCALATED",
      ],
      securia_alert_type: [
        "INTRUSION",
        "MENACE",
        "AGRESSION",
        "PERSONNE_SUSPECTE",
        "URGENCE",
      ],
      securia_intervention_status: [
        "PENDING",
        "ACCEPTED",
        "EN_ROUTE",
        "ON_SITE",
        "COMPLETED",
        "ABORTED",
      ],
      securia_site_member_role: [
        "OWNER",
        "FAMILY",
        "EMPLOYEE",
        "SECURITY_CONTACT",
      ],
      securia_site_type: ["RESIDENCE", "COMMERCE", "ENTREPRISE", "AUTRE"],
      securia_user_role: ["USER", "AGENT", "SECURITY_MANAGER", "ADMIN"],
      store_status: ["pending", "approved", "rejected", "suspended"],
      user_role: [
        "customer",
        "seller",
        "driver",
        "admin",
        "super_admin",
        "agent",
      ],
      user_status: ["active", "pending", "suspended"],
    },
  },
} as const
