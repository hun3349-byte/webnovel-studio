/**
 * Supabase Database Types
 *
 * 이 파일은 Supabase에서 자동 생성되거나 수동으로 정의된 DB 타입을 포함합니다.
 * `npx supabase gen types typescript --local > src/types/database.ts` 로 재생성 가능
 */

export type Json =
  | string
  | number
  | boolean
  | null
  | { [key: string]: Json | undefined }
  | Json[];

export type Database = {
  public: {
    Tables: {
      characters: {
        Row: {
          additional_data: Json | null
          age: string | null
          appearance: string | null
          backstory: string | null
          created_at: string | null
          current_location: string | null
          emotional_state: string | null
          first_appearance_episode: number | null
          gender: string | null
          goals: string[] | null
          id: string
          injuries: string[] | null
          is_alive: boolean | null
          last_appearance_episode: number | null
          name: string
          personality: string | null
          possessed_items: string[] | null
          project_id: string
          role: string | null
          speech_pattern: string | null
          status_effects: string[] | null
          updated_at: string | null
        }
        Insert: {
          additional_data?: Json | null
          age?: string | null
          appearance?: string | null
          backstory?: string | null
          created_at?: string | null
          current_location?: string | null
          emotional_state?: string | null
          first_appearance_episode?: number | null
          gender?: string | null
          goals?: string[] | null
          id?: string
          injuries?: string[] | null
          is_alive?: boolean | null
          last_appearance_episode?: number | null
          name: string
          personality?: string | null
          possessed_items?: string[] | null
          project_id: string
          role?: string | null
          speech_pattern?: string | null
          status_effects?: string[] | null
          updated_at?: string | null
        }
        Update: {
          additional_data?: Json | null
          age?: string | null
          appearance?: string | null
          backstory?: string | null
          created_at?: string | null
          current_location?: string | null
          emotional_state?: string | null
          first_appearance_episode?: number | null
          gender?: string | null
          goals?: string[] | null
          id?: string
          injuries?: string[] | null
          is_alive?: boolean | null
          last_appearance_episode?: number | null
          name?: string
          personality?: string | null
          possessed_items?: string[] | null
          project_id?: string
          role?: string | null
          speech_pattern?: string | null
          status_effects?: string[] | null
          updated_at?: string | null
        }
        Relationships: [
          {
            foreignKeyName: "characters_project_id_fkey"
            columns: ["project_id"]
            isOneToOne: false
            referencedRelation: "projects"
            referencedColumns: ["id"]
          }
        ]
      }
      character_memories: {
        Row: {
          character_id: string
          created_at: string | null
          detail: string | null
          emotional_impact: string | null
          id: string
          importance: number | null
          keywords: string[] | null
          memory_type: string | null
          project_id: string
          related_character_ids: string[] | null
          source_episode_id: string | null
          source_episode_number: number | null
          summary: string
        }
        Insert: {
          character_id: string
          created_at?: string | null
          detail?: string | null
          emotional_impact?: string | null
          id?: string
          importance?: number | null
          keywords?: string[] | null
          memory_type?: string | null
          project_id: string
          related_character_ids?: string[] | null
          source_episode_id?: string | null
          source_episode_number?: number | null
          summary: string
        }
        Update: {
          character_id?: string
          created_at?: string | null
          detail?: string | null
          emotional_impact?: string | null
          id?: string
          importance?: number | null
          keywords?: string[] | null
          memory_type?: string | null
          project_id?: string
          related_character_ids?: string[] | null
          source_episode_id?: string | null
          source_episode_number?: number | null
          summary?: string
        }
        Relationships: [
          {
            foreignKeyName: "character_memories_character_id_fkey"
            columns: ["character_id"]
            isOneToOne: false
            referencedRelation: "characters"
            referencedColumns: ["id"]
          },
          {
            foreignKeyName: "character_memories_project_id_fkey"
            columns: ["project_id"]
            isOneToOne: false
            referencedRelation: "projects"
            referencedColumns: ["id"]
          }
        ]
      }
      character_relationships: {
        Row: {
          a_perception_of_b: string | null
          b_perception_of_a: string | null
          character_a_id: string
          character_b_id: string
          created_at: string | null
          description: string | null
          id: string
          intensity: number | null
          project_id: string
          relationship_type: string | null
          updated_at: string | null
        }
        Insert: {
          a_perception_of_b?: string | null
          b_perception_of_a?: string | null
          character_a_id: string
          character_b_id: string
          created_at?: string | null
          description?: string | null
          id?: string
          intensity?: number | null
          project_id: string
          relationship_type?: string | null
          updated_at?: string | null
        }
        Update: {
          a_perception_of_b?: string | null
          b_perception_of_a?: string | null
          character_a_id?: string
          character_b_id?: string
          created_at?: string | null
          description?: string | null
          id?: string
          intensity?: number | null
          project_id?: string
          relationship_type?: string | null
          updated_at?: string | null
        }
        Relationships: [
          {
            foreignKeyName: "character_relationships_character_a_id_fkey"
            columns: ["character_a_id"]
            isOneToOne: false
            referencedRelation: "characters"
            referencedColumns: ["id"]
          },
          {
            foreignKeyName: "character_relationships_character_b_id_fkey"
            columns: ["character_b_id"]
            isOneToOne: false
            referencedRelation: "characters"
            referencedColumns: ["id"]
          },
          {
            foreignKeyName: "character_relationships_project_id_fkey"
            columns: ["project_id"]
            isOneToOne: false
            referencedRelation: "projects"
            referencedColumns: ["id"]
          }
        ]
      }
      episode_character_states: {
        Row: {
          changes: string[] | null
          character_id: string
          created_at: string | null
          emotional_after: string | null
          emotional_before: string | null
          episode_log_id: string
          id: string
          injuries_gained: string[] | null
          injuries_healed: string[] | null
          location_after: string | null
          location_before: string | null
        }
        Insert: {
          changes?: string[] | null
          character_id: string
          created_at?: string | null
          emotional_after?: string | null
          emotional_before?: string | null
          episode_log_id: string
          id?: string
          injuries_gained?: string[] | null
          injuries_healed?: string[] | null
          location_after?: string | null
          location_before?: string | null
        }
        Update: {
          changes?: string[] | null
          character_id?: string
          created_at?: string | null
          emotional_after?: string | null
          emotional_before?: string | null
          episode_log_id?: string
          id?: string
          injuries_gained?: string[] | null
          injuries_healed?: string[] | null
          location_after?: string | null
          location_before?: string | null
        }
        Relationships: [
          {
            foreignKeyName: "episode_character_states_character_id_fkey"
            columns: ["character_id"]
            isOneToOne: false
            referencedRelation: "characters"
            referencedColumns: ["id"]
          },
          {
            foreignKeyName: "episode_character_states_episode_log_id_fkey"
            columns: ["episode_log_id"]
            isOneToOne: false
            referencedRelation: "episode_logs"
            referencedColumns: ["id"]
          }
        ]
      }
      episode_item_changes: {
        Row: {
          change_type: string | null
          character_id: string | null
          created_at: string | null
          episode_log_id: string
          id: string
          item_description: string | null
          item_name: string
          transferred_to_character_id: string | null
        }
        Insert: {
          change_type?: string | null
          character_id?: string | null
          created_at?: string | null
          episode_log_id: string
          id?: string
          item_description?: string | null
          item_name: string
          transferred_to_character_id?: string | null
        }
        Update: {
          change_type?: string | null
          character_id?: string | null
          created_at?: string | null
          episode_log_id?: string
          id?: string
          item_description?: string | null
          item_name?: string
          transferred_to_character_id?: string | null
        }
        Relationships: [
          {
            foreignKeyName: "episode_item_changes_character_id_fkey"
            columns: ["character_id"]
            isOneToOne: false
            referencedRelation: "characters"
            referencedColumns: ["id"]
          },
          {
            foreignKeyName: "episode_item_changes_episode_log_id_fkey"
            columns: ["episode_log_id"]
            isOneToOne: false
            referencedRelation: "episode_logs"
            referencedColumns: ["id"]
          },
          {
            foreignKeyName: "episode_item_changes_transferred_to_character_id_fkey"
            columns: ["transferred_to_character_id"]
            isOneToOne: false
            referencedRelation: "characters"
            referencedColumns: ["id"]
          }
        ]
      }
      episode_log_queue: {
        Row: {
          completed_at: string | null
          created_at: string | null
          episode_id: string
          id: string
          last_error: string | null
          max_retries: number | null
          project_id: string
          queue_status: string | null
          retry_count: number | null
          scheduled_at: string | null
          started_at: string | null
          worker_id: string | null
        }
        Insert: {
          completed_at?: string | null
          created_at?: string | null
          episode_id: string
          id?: string
          last_error?: string | null
          max_retries?: number | null
          project_id: string
          queue_status?: string | null
          retry_count?: number | null
          scheduled_at?: string | null
          started_at?: string | null
          worker_id?: string | null
        }
        Update: {
          completed_at?: string | null
          created_at?: string | null
          episode_id?: string
          id?: string
          last_error?: string | null
          max_retries?: number | null
          project_id?: string
          queue_status?: string | null
          retry_count?: number | null
          scheduled_at?: string | null
          started_at?: string | null
          worker_id?: string | null
        }
        Relationships: [
          {
            foreignKeyName: "episode_log_queue_episode_id_fkey"
            columns: ["episode_id"]
            isOneToOne: false
            referencedRelation: "episodes"
            referencedColumns: ["id"]
          },
          {
            foreignKeyName: "episode_log_queue_project_id_fkey"
            columns: ["project_id"]
            isOneToOne: false
            referencedRelation: "projects"
            referencedColumns: ["id"]
          }
        ]
      }
      episode_logs: {
        Row: {
          created_at: string | null
          episode_id: string
          episode_number: number
          id: string
          is_fallback: boolean | null
          last_500_chars: string
          project_id: string
          raw_ai_response: Json | null
          summary: string
        }
        Insert: {
          created_at?: string | null
          episode_id: string
          episode_number: number
          id?: string
          is_fallback?: boolean | null
          last_500_chars: string
          project_id: string
          raw_ai_response?: Json | null
          summary: string
        }
        Update: {
          created_at?: string | null
          episode_id?: string
          episode_number?: number
          id?: string
          is_fallback?: boolean | null
          last_500_chars?: string
          project_id?: string
          raw_ai_response?: Json | null
          summary?: string
        }
        Relationships: [
          {
            foreignKeyName: "episode_logs_episode_id_fkey"
            columns: ["episode_id"]
            isOneToOne: true
            referencedRelation: "episodes"
            referencedColumns: ["id"]
          },
          {
            foreignKeyName: "episode_logs_project_id_fkey"
            columns: ["project_id"]
            isOneToOne: false
            referencedRelation: "projects"
            referencedColumns: ["id"]
          }
        ]
      }
      episodes: {
        Row: {
          char_count: number | null
          cliffhanger_score: number | null
          content: string
          created_at: string | null
          episode_number: number
          id: string
          log_last_error: string | null
          log_retry_count: number | null
          log_status: string | null
          project_id: string
          published_at: string | null
          show_dont_tell_score: number | null
          status: string | null
          title: string | null
          updated_at: string | null
        }
        Insert: {
          char_count?: number | null
          cliffhanger_score?: number | null
          content: string
          created_at?: string | null
          episode_number: number
          id?: string
          log_last_error?: string | null
          log_retry_count?: number | null
          log_status?: string | null
          project_id: string
          published_at?: string | null
          show_dont_tell_score?: number | null
          status?: string | null
          title?: string | null
          updated_at?: string | null
        }
        Update: {
          char_count?: number | null
          cliffhanger_score?: number | null
          content?: string
          created_at?: string | null
          episode_number?: number
          id?: string
          log_last_error?: string | null
          log_retry_count?: number | null
          log_status?: string | null
          project_id?: string
          published_at?: string | null
          show_dont_tell_score?: number | null
          status?: string | null
          title?: string | null
          updated_at?: string | null
        }
        Relationships: [
          {
            foreignKeyName: "episodes_project_id_fkey"
            columns: ["project_id"]
            isOneToOne: false
            referencedRelation: "projects"
            referencedColumns: ["id"]
          }
        ]
      }
      projects: {
        Row: {
          created_at: string | null
          genre: string | null
          id: string
          status: string | null
          target_platform: string | null
          title: string
          total_episodes: number | null
          updated_at: string | null
          user_id: string
        }
        Insert: {
          created_at?: string | null
          genre?: string | null
          id?: string
          status?: string | null
          target_platform?: string | null
          title: string
          total_episodes?: number | null
          updated_at?: string | null
          user_id: string
        }
        Update: {
          created_at?: string | null
          genre?: string | null
          id?: string
          status?: string | null
          target_platform?: string | null
          title?: string
          total_episodes?: number | null
          updated_at?: string | null
          user_id?: string
        }
        Relationships: []
      }
      prompt_templates: {
        Row: {
          created_at: string | null
          id: string
          is_active: boolean | null
          name: string
          purpose: string | null
          template: string
          variables: string[] | null
          version: number | null
        }
        Insert: {
          created_at?: string | null
          id?: string
          is_active?: boolean | null
          name: string
          purpose?: string | null
          template: string
          variables?: string[] | null
          version?: number | null
        }
        Update: {
          created_at?: string | null
          id?: string
          is_active?: boolean | null
          name?: string
          purpose?: string | null
          template?: string
          variables?: string[] | null
          version?: number | null
        }
        Relationships: []
      }
      relationship_history: {
        Row: {
          change_description: string | null
          created_at: string | null
          episode_id: string | null
          episode_number: number | null
          id: string
          new_intensity: number | null
          new_type: string | null
          previous_intensity: number | null
          previous_type: string | null
          relationship_id: string
        }
        Insert: {
          change_description?: string | null
          created_at?: string | null
          episode_id?: string | null
          episode_number?: number | null
          id?: string
          new_intensity?: number | null
          new_type?: string | null
          previous_intensity?: number | null
          previous_type?: string | null
          relationship_id: string
        }
        Update: {
          change_description?: string | null
          created_at?: string | null
          episode_id?: string | null
          episode_number?: number | null
          id?: string
          new_intensity?: number | null
          new_type?: string | null
          previous_intensity?: number | null
          previous_type?: string | null
          relationship_id?: string
        }
        Relationships: [
          {
            foreignKeyName: "relationship_history_relationship_id_fkey"
            columns: ["relationship_id"]
            isOneToOne: false
            referencedRelation: "character_relationships"
            referencedColumns: ["id"]
          }
        ]
      }
      story_hooks: {
        Row: {
          created_at: string | null
          created_in_episode_id: string | null
          created_in_episode_number: number
          detail: string | null
          hook_type: string | null
          id: string
          importance: number | null
          keywords: string[] | null
          project_id: string
          related_character_ids: string[] | null
          resolution_summary: string | null
          resolved_in_episode_id: string | null
          resolved_in_episode_number: number | null
          status: string | null
          summary: string
          updated_at: string | null
        }
        Insert: {
          created_at?: string | null
          created_in_episode_id?: string | null
          created_in_episode_number: number
          detail?: string | null
          hook_type?: string | null
          id?: string
          importance?: number | null
          keywords?: string[] | null
          project_id: string
          related_character_ids?: string[] | null
          resolution_summary?: string | null
          resolved_in_episode_id?: string | null
          resolved_in_episode_number?: number | null
          status?: string | null
          summary: string
          updated_at?: string | null
        }
        Update: {
          created_at?: string | null
          created_in_episode_id?: string | null
          created_in_episode_number?: number
          detail?: string | null
          hook_type?: string | null
          id?: string
          importance?: number | null
          keywords?: string[] | null
          project_id?: string
          related_character_ids?: string[] | null
          resolution_summary?: string | null
          resolved_in_episode_id?: string | null
          resolved_in_episode_number?: number | null
          status?: string | null
          summary?: string
          updated_at?: string | null
        }
        Relationships: [
          {
            foreignKeyName: "story_hooks_created_in_episode_id_fkey"
            columns: ["created_in_episode_id"]
            isOneToOne: false
            referencedRelation: "episodes"
            referencedColumns: ["id"]
          },
          {
            foreignKeyName: "story_hooks_project_id_fkey"
            columns: ["project_id"]
            isOneToOne: false
            referencedRelation: "projects"
            referencedColumns: ["id"]
          },
          {
            foreignKeyName: "story_hooks_resolved_in_episode_id_fkey"
            columns: ["resolved_in_episode_id"]
            isOneToOne: false
            referencedRelation: "episodes"
            referencedColumns: ["id"]
          }
        ]
      }
      system_settings: {
        Row: {
          created_at: string | null
          id: string
          project_id: string | null
          setting_key: string
          setting_value: Json
          updated_at: string | null
        }
        Insert: {
          created_at?: string | null
          id?: string
          project_id?: string | null
          setting_key: string
          setting_value: Json
          updated_at?: string | null
        }
        Update: {
          created_at?: string | null
          id?: string
          project_id?: string | null
          setting_key?: string
          setting_value?: Json
          updated_at?: string | null
        }
        Relationships: [
          {
            foreignKeyName: "system_settings_project_id_fkey"
            columns: ["project_id"]
            isOneToOne: false
            referencedRelation: "projects"
            referencedColumns: ["id"]
          }
        ]
      }
      timeline_events: {
        Row: {
          character_focus: string | null
          constraints: string[] | null
          created_at: string | null
          episode_end: number
          episode_start: number
          event_name: string
          event_type: string
          foreshadowing_seeds: string[] | null
          id: string
          importance: number | null
          key_characters: string[] | null
          location: string | null
          main_conflict: string | null
          notes: string | null
          objectives: string[] | null
          pacing: string | null
          project_id: string
          status: string | null
          tone: string | null
          updated_at: string | null
        }
        Insert: {
          character_focus?: string | null
          constraints?: string[] | null
          created_at?: string | null
          episode_end: number
          episode_start: number
          event_name: string
          event_type: string
          foreshadowing_seeds?: string[] | null
          id?: string
          importance?: number | null
          key_characters?: string[] | null
          location?: string | null
          main_conflict?: string | null
          notes?: string | null
          objectives?: string[] | null
          pacing?: string | null
          project_id: string
          status?: string | null
          tone?: string | null
          updated_at?: string | null
        }
        Update: {
          character_focus?: string | null
          constraints?: string[] | null
          created_at?: string | null
          episode_end?: number
          episode_start?: number
          event_name?: string
          event_type?: string
          foreshadowing_seeds?: string[] | null
          id?: string
          importance?: number | null
          key_characters?: string[] | null
          location?: string | null
          main_conflict?: string | null
          notes?: string | null
          objectives?: string[] | null
          pacing?: string | null
          project_id?: string
          status?: string | null
          tone?: string | null
          updated_at?: string | null
        }
        Relationships: [
          {
            foreignKeyName: "timeline_events_project_id_fkey"
            columns: ["project_id"]
            isOneToOne: false
            referencedRelation: "projects"
            referencedColumns: ["id"]
          }
        ]
      }
      world_bibles: {
        Row: {
          absolute_rules: Json | null
          additional_settings: Json | null
          created_at: string | null
          forbidden_elements: string[] | null
          geography: string | null
          id: string
          power_system_name: string | null
          power_system_ranks: Json | null
          power_system_rules: string | null
          project_id: string
          time_period: string | null
          updated_at: string | null
          version: number | null
          world_name: string | null
        }
        Insert: {
          absolute_rules?: Json | null
          additional_settings?: Json | null
          created_at?: string | null
          forbidden_elements?: string[] | null
          geography?: string | null
          id?: string
          power_system_name?: string | null
          power_system_ranks?: Json | null
          power_system_rules?: string | null
          project_id: string
          time_period?: string | null
          updated_at?: string | null
          version?: number | null
          world_name?: string | null
        }
        Update: {
          absolute_rules?: Json | null
          additional_settings?: Json | null
          created_at?: string | null
          forbidden_elements?: string[] | null
          geography?: string | null
          id?: string
          power_system_name?: string | null
          power_system_ranks?: Json | null
          power_system_rules?: string | null
          project_id?: string
          time_period?: string | null
          updated_at?: string | null
          version?: number | null
          world_name?: string | null
        }
        Relationships: [
          {
            foreignKeyName: "world_bibles_project_id_fkey"
            columns: ["project_id"]
            isOneToOne: true
            referencedRelation: "projects"
            referencedColumns: ["id"]
          }
        ]
      }
      writing_memories: {
        Row: {
          applied_count: number | null
          avoid_patterns: string[] | null
          confidence: number | null
          created_at: string | null
          edited_text: string | null
          favor_patterns: string[] | null
          feedback_type: string | null
          id: string
          is_active: boolean | null
          original_text: string | null
          preference_summary: string | null
          project_id: string
          updated_at: string | null
          user_id: string
        }
        Insert: {
          applied_count?: number | null
          avoid_patterns?: string[] | null
          confidence?: number | null
          created_at?: string | null
          edited_text?: string | null
          favor_patterns?: string[] | null
          feedback_type?: string | null
          id?: string
          is_active?: boolean | null
          original_text?: string | null
          preference_summary?: string | null
          project_id: string
          updated_at?: string | null
          user_id: string
        }
        Update: {
          applied_count?: number | null
          avoid_patterns?: string[] | null
          confidence?: number | null
          created_at?: string | null
          edited_text?: string | null
          favor_patterns?: string[] | null
          feedback_type?: string | null
          id?: string
          is_active?: boolean | null
          original_text?: string | null
          preference_summary?: string | null
          project_id?: string
          updated_at?: string | null
          user_id?: string
        }
        Relationships: [
          {
            foreignKeyName: "writing_memories_project_id_fkey"
            columns: ["project_id"]
            isOneToOne: false
            referencedRelation: "projects"
            referencedColumns: ["id"]
          }
        ]
      }
    }
    Views: {
      [_ in never]: never
    }
    Functions: {
      create_fallback_episode_log: {
        Args: {
          p_episode_id: string
          p_project_id: string
          p_episode_number: number
          p_content: string
        }
        Returns: string
      }
      get_active_timeline_events: {
        Args: {
          p_project_id: string
          p_episode_number: number
        }
        Returns: {
          id: string
          event_name: string
          event_type: string
          episode_start: number
          episode_end: number
          location: string
          main_conflict: string
          objectives: string[]
          constraints: string[]
          foreshadowing_seeds: string[]
          character_focus: string
          tone: string
          pacing: string
          importance: number
        }[]
      }
      get_sliding_window_context: {
        Args: {
          p_project_id: string
          p_target_episode_number: number
          p_window_size?: number
        }
        Returns: {
          episode_number: number
          summary: string
          last_500_chars: string
          is_fallback: boolean
        }[]
      }
      get_unresolved_hooks: {
        Args: {
          p_project_id: string
          p_limit?: number
        }
        Returns: {
          id: string
          hook_type: string
          summary: string
          importance: number
          created_in_episode_number: number
          keywords: string[]
        }[]
      }
      search_character_memories: {
        Args: {
          p_project_id: string
          p_search_query: string
          p_limit?: number
        }
        Returns: {
          character_id: string
          character_name: string
          memory_type: string
          memory_summary: string
          source_episode_number: number
          importance: number
        }[]
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

type PublicSchema = Database[Extract<keyof Database, "public">]

export type Tables<
  PublicTableNameOrOptions extends
    | keyof (PublicSchema["Tables"] & PublicSchema["Views"])
    | { schema: keyof Database },
  TableName extends PublicTableNameOrOptions extends { schema: keyof Database }
    ? keyof (Database[PublicTableNameOrOptions["schema"]]["Tables"] &
        Database[PublicTableNameOrOptions["schema"]]["Views"])
    : never = never,
> = PublicTableNameOrOptions extends { schema: keyof Database }
  ? (Database[PublicTableNameOrOptions["schema"]]["Tables"] &
      Database[PublicTableNameOrOptions["schema"]]["Views"])[TableName] extends {
      Row: infer R
    }
    ? R
    : never
  : PublicTableNameOrOptions extends keyof (PublicSchema["Tables"] &
        PublicSchema["Views"])
    ? (PublicSchema["Tables"] &
        PublicSchema["Views"])[PublicTableNameOrOptions] extends {
        Row: infer R
      }
      ? R
      : never
    : never

export type TablesInsert<
  PublicTableNameOrOptions extends
    | keyof PublicSchema["Tables"]
    | { schema: keyof Database },
  TableName extends PublicTableNameOrOptions extends { schema: keyof Database }
    ? keyof Database[PublicTableNameOrOptions["schema"]]["Tables"]
    : never = never,
> = PublicTableNameOrOptions extends { schema: keyof Database }
  ? Database[PublicTableNameOrOptions["schema"]]["Tables"][TableName] extends {
      Insert: infer I
    }
    ? I
    : never
  : PublicTableNameOrOptions extends keyof PublicSchema["Tables"]
    ? PublicSchema["Tables"][PublicTableNameOrOptions] extends {
        Insert: infer I
      }
      ? I
      : never
    : never

export type TablesUpdate<
  PublicTableNameOrOptions extends
    | keyof PublicSchema["Tables"]
    | { schema: keyof Database },
  TableName extends PublicTableNameOrOptions extends { schema: keyof Database }
    ? keyof Database[PublicTableNameOrOptions["schema"]]["Tables"]
    : never = never,
> = PublicTableNameOrOptions extends { schema: keyof Database }
  ? Database[PublicTableNameOrOptions["schema"]]["Tables"][TableName] extends {
      Update: infer U
    }
    ? U
    : never
  : PublicTableNameOrOptions extends keyof PublicSchema["Tables"]
    ? PublicSchema["Tables"][PublicTableNameOrOptions] extends {
        Update: infer U
      }
      ? U
      : never
    : never

export type Enums<
  PublicEnumNameOrOptions extends
    | keyof PublicSchema["Enums"]
    | { schema: keyof Database },
  EnumName extends PublicEnumNameOrOptions extends { schema: keyof Database }
    ? keyof Database[PublicEnumNameOrOptions["schema"]]["Enums"]
    : never = never,
> = PublicEnumNameOrOptions extends { schema: keyof Database }
  ? Database[PublicEnumNameOrOptions["schema"]]["Enums"][EnumName]
  : PublicEnumNameOrOptions extends keyof PublicSchema["Enums"]
    ? PublicSchema["Enums"][PublicEnumNameOrOptions]
    : never

export type CompositeTypes<
  PublicCompositeTypeNameOrOptions extends
    | keyof PublicSchema["CompositeTypes"]
    | { schema: keyof Database },
  CompositeTypeName extends PublicCompositeTypeNameOrOptions extends {
    schema: keyof Database
  }
    ? keyof Database[PublicCompositeTypeNameOrOptions["schema"]]["CompositeTypes"]
    : never = never,
> = PublicCompositeTypeNameOrOptions extends { schema: keyof Database }
  ? Database[PublicCompositeTypeNameOrOptions["schema"]]["CompositeTypes"][CompositeTypeName]
  : PublicCompositeTypeNameOrOptions extends keyof PublicSchema["CompositeTypes"]
    ? PublicSchema["CompositeTypes"][PublicCompositeTypeNameOrOptions]
    : never
