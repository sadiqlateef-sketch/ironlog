// Types for the Phase 1 schema. Once your Supabase project is running, you can
// regenerate this file from the live database with:
//   npx supabase gen types typescript --local > src/types/database.ts

export type Json = string | number | boolean | null | { [key: string]: Json | undefined } | Json[];

export type SetType = "warmup" | "normal" | "drop" | "failure";
export type MuscleGroup =
  | "chest" | "upper_back" | "lats" | "lower_back" | "traps"
  | "front_delts" | "side_delts" | "rear_delts"
  | "biceps" | "triceps" | "forearms"
  | "abs" | "obliques"
  | "quads" | "hamstrings" | "glutes" | "adductors" | "abductors" | "calves"
  | "neck";
export type EquipmentType =
  | "barbell" | "dumbbell" | "kettlebell" | "machine" | "cable"
  | "bodyweight" | "band" | "smith_machine" | "ez_bar" | "trap_bar" | "other";
export type ExerciseMechanic = "compound" | "isolation";
export type UnitSystem = "metric" | "imperial";
/** What a set of this exercise records (see migration 20261016020000_timed_sets.sql). */
export type Tracking = "weight_reps" | "time" | "distance_time";
/** How the logger asks how hard a set was (see migration 20261018170000_smarter_sets.sql). */
export type EffortScale = "rir" | "rpe" | "off";
export type TrainingGoal = "strength" | "hypertrophy" | "powerbuilding" | "general";
export type SessionSource = "web" | "phone" | "watch" | "import" | "claude";
export type AdjustmentAction = "increase" | "hold" | "deload" | "adjust_reps";
export type AdjustmentStatus = "pending" | "applied" | "dismissed";

/** Shape of users.physical_stats (all optional). */
/** A weekly recap, from the weekly-recap Edge Function. */
export type WeeklyRecap = {
  headline: string;
  wins: string[];
  watch_outs: string[];
  next_week: string[];
  numbers: { workouts: number; sets: number; volume_kg: number; minutes: number; records: number; prev_workouts: number; prev_volume_kg: number };
};

export type PhysicalStats = {
  height_cm?: number;
  bodyweight_kg?: number;
  birth_year?: number;
  sex?: "male" | "female" | "other";
  training_age_years?: number;
  resting_hr?: number;
  max_hr?: number;
};

type Timestamps = { created_at: string; updated_at: string };

export type Database = {
  public: {
    Tables: {
      users: {
        Row: {
          id: string;
          email: string;
          display_name: string | null;
          physical_stats: Json;
          unit_system: UnitSystem;
          bar_weight_kg: number;
          available_plates_kg: number[];
          default_rest_seconds: number;
          gym_name: string | null;
          gym_lat: number | null;
          gym_lng: number | null;
          gym_radius_m: number;
          training_goal: TrainingGoal | null;
          training_equipment: string[];
          training_days_per_week: number | null;
          onboarded_at: string | null;
          effort_scale: EffortScale;
        } & Timestamps;
        Insert: {
          id: string;
          email: string;
          display_name?: string | null;
          physical_stats?: Json;
          unit_system?: UnitSystem;
          bar_weight_kg?: number;
          available_plates_kg?: number[];
          default_rest_seconds?: number;
          gym_name?: string | null;
          gym_lat?: number | null;
          gym_lng?: number | null;
          gym_radius_m?: number;
          training_goal?: TrainingGoal | null;
          training_equipment?: string[];
          training_days_per_week?: number | null;
          onboarded_at?: string | null;
          effort_scale?: EffortScale;
        };
        Update: Partial<Database["public"]["Tables"]["users"]["Insert"]>;
        Relationships: [];
      };
      exercises: {
        Row: {
          id: string;
          name: string;
          slug: string;
          primary_muscle: MuscleGroup;
          secondary_muscles: MuscleGroup[];
          equipment: EquipmentType;
          mechanic: ExerciseMechanic;
          animation_url: string | null;
          instructions: string | null;
          created_by: string | null;
          aliases: string[];
          image_urls: string[];
          tracking: Tracking;
          unilateral: boolean;
        } & Timestamps;
        Insert: {
          id?: string;
          name: string;
          slug: string;
          primary_muscle: MuscleGroup;
          secondary_muscles?: MuscleGroup[];
          equipment: EquipmentType;
          mechanic?: ExerciseMechanic;
          animation_url?: string | null;
          instructions?: string | null;
          created_by?: string | null;
          aliases?: string[];
          image_urls?: string[];
          tracking?: Tracking;
          unilateral?: boolean;
        };
        Update: Partial<Database["public"]["Tables"]["exercises"]["Insert"]>;
        Relationships: [];
      };
      exercise_prefs: {
        Row: {
          user_id: string;
          exercise_id: string;
          goal_weight_kg: number | null;
          goal_date: string | null;
          goal_start_kg: number | null;
          favorite: boolean;
          notes: string | null;
          rest_seconds: number | null;
          unilateral: boolean | null;
        } & Timestamps;
        Insert: {
          user_id?: string;
          exercise_id: string;
          goal_weight_kg?: number | null;
          goal_date?: string | null;
          goal_start_kg?: number | null;
          favorite?: boolean;
          notes?: string | null;
          rest_seconds?: number | null;
          unilateral?: boolean | null;
        };
        Update: Partial<Database["public"]["Tables"]["exercise_prefs"]["Insert"]>;
        Relationships: [];
      };
      body_measurements: {
        Row: {
          id: string;
          user_id: string;
          measured_on: string;
          weight_kg: number | null;
          body_fat_pct: number | null;
          waist_cm: number | null;
        } & Timestamps;
        Insert: {
          id?: string;
          user_id?: string;
          measured_on?: string;
          weight_kg?: number | null;
          body_fat_pct?: number | null;
          waist_cm?: number | null;
        };
        Update: Partial<Database["public"]["Tables"]["body_measurements"]["Insert"]>;
        Relationships: [];
      };
      routines: {
        Row: {
          id: string;
          user_id: string;
          name: string;
          description: string | null;
          ai_generated: boolean;
          ai_metadata: Json | null;
          position: number;
          archived: boolean;
          program_id: string | null;
          program_week: number | null;
          program_day: number | null;
        } & Timestamps;
        Insert: {
          id?: string;
          user_id?: string;
          name: string;
          description?: string | null;
          ai_generated?: boolean;
          ai_metadata?: Json | null;
          position?: number;
          archived?: boolean;
          program_id?: string | null;
          program_week?: number | null;
          program_day?: number | null;
        };
        Update: Partial<Database["public"]["Tables"]["routines"]["Insert"]>;
        Relationships: [];
      };
      programs: {
        Row: {
          id: string;
          user_id: string;
          name: string;
          methodology: string | null;
          summary: string | null;
          progression_rule: string | null;
          weeks: number;
          days_per_week: number;
          ai_generated: boolean;
          ai_metadata: Json | null;
          is_active: boolean;
          started_at: string | null;
        } & Timestamps;
        Insert: {
          id?: string;
          user_id?: string;
          name: string;
          methodology?: string | null;
          summary?: string | null;
          progression_rule?: string | null;
          weeks?: number;
          days_per_week?: number;
          ai_generated?: boolean;
          ai_metadata?: Json | null;
          is_active?: boolean;
          started_at?: string | null;
        };
        Update: Partial<Database["public"]["Tables"]["programs"]["Insert"]>;
        Relationships: [];
      };
      routine_exercises: {
        Row: {
          id: string;
          routine_id: string;
          exercise_id: string;
          position: number;
          superset_group: number | null;
          target_sets: number;
          target_reps: number;
          target_reps_max: number | null;
          target_weight_kg: number | null;
          target_rpe: number | null;
          target_percent_1rm: number | null;
          warmup_sets: number;
          rest_seconds: number;
          notes: string | null;
        } & Timestamps;
        Insert: {
          id?: string;
          routine_id: string;
          exercise_id: string;
          position: number;
          superset_group?: number | null;
          target_sets?: number;
          target_reps?: number;
          target_reps_max?: number | null;
          target_weight_kg?: number | null;
          target_rpe?: number | null;
          target_percent_1rm?: number | null;
          warmup_sets?: number;
          rest_seconds?: number;
          notes?: string | null;
        };
        Update: Partial<Database["public"]["Tables"]["routine_exercises"]["Insert"]>;
        Relationships: [
          { foreignKeyName: "routine_exercises_routine_id_fkey"; columns: ["routine_id"]; isOneToOne: false; referencedRelation: "routines"; referencedColumns: ["id"] },
          { foreignKeyName: "routine_exercises_exercise_id_fkey"; columns: ["exercise_id"]; isOneToOne: false; referencedRelation: "exercises"; referencedColumns: ["id"] },
        ];
      };
      workout_sessions: {
        Row: {
          id: string;
          user_id: string;
          routine_id: string | null;
          name: string | null;
          start_time: string;
          end_time: string | null;
          volume: number;
          source: SessionSource;
          avg_hr: number | null;
          max_hr: number | null;
          notes: string | null;
          at_gym: boolean | null;
          calendar_event_id: string | null;
          import_key: string | null;
        } & Timestamps;
        Insert: {
          id?: string;
          user_id?: string;
          routine_id?: string | null;
          name?: string | null;
          start_time?: string;
          end_time?: string | null;
          source?: SessionSource;
          avg_hr?: number | null;
          max_hr?: number | null;
          notes?: string | null;
          at_gym?: boolean | null;
          calendar_event_id?: string | null;
          import_key?: string | null;
        };
        Update: Partial<Database["public"]["Tables"]["workout_sessions"]["Insert"]>;
        Relationships: [
          { foreignKeyName: "workout_sessions_routine_id_fkey"; columns: ["routine_id"]; isOneToOne: false; referencedRelation: "routines"; referencedColumns: ["id"] },
        ];
      };
      workout_sets: {
        Row: {
          id: string;
          session_id: string;
          user_id: string;
          exercise_id: string;
          exercise_order: number;
          set_number: number;
          set_type: SetType;
          weight: number;
          reps: number;
          rpe: number | null;
          superset_group: number | null;
          parent_set_id: string | null;
          is_completed: boolean;
          completed_at: string | null;
          estimated_1rm: number | null;
          notes: string | null;
          client_id: string | null;
          duration_seconds: number | null;
          distance_m: number | null;
          reps_left: number | null;
          reps_right: number | null;
        } & Timestamps;
        Insert: {
          id?: string;
          session_id: string;
          user_id?: string;
          exercise_id: string;
          exercise_order?: number;
          set_number: number;
          set_type?: SetType;
          weight?: number;
          reps?: number;
          rpe?: number | null;
          superset_group?: number | null;
          parent_set_id?: string | null;
          is_completed?: boolean;
          completed_at?: string | null;
          notes?: string | null;
          client_id?: string | null;
          duration_seconds?: number | null;
          distance_m?: number | null;
          reps_left?: number | null;
          reps_right?: number | null;
        };
        Update: Partial<Database["public"]["Tables"]["workout_sets"]["Insert"]>;
        Relationships: [
          { foreignKeyName: "workout_sets_session_id_fkey"; columns: ["session_id"]; isOneToOne: false; referencedRelation: "workout_sessions"; referencedColumns: ["id"] },
          { foreignKeyName: "workout_sets_exercise_id_fkey"; columns: ["exercise_id"]; isOneToOne: false; referencedRelation: "exercises"; referencedColumns: ["id"] },
          { foreignKeyName: "workout_sets_parent_set_id_fkey"; columns: ["parent_set_id"]; isOneToOne: false; referencedRelation: "workout_sets"; referencedColumns: ["id"] },
        ];
      };
      heart_rate_samples: {
        Row: {
          id: number;
          session_id: string;
          user_id: string;
          recorded_at: string;
          bpm: number;
          source: SessionSource;
        };
        Insert: {
          session_id: string;
          user_id?: string;
          recorded_at: string;
          bpm: number;
          source?: SessionSource;
        };
        Update: Partial<Database["public"]["Tables"]["heart_rate_samples"]["Insert"]>;
        Relationships: [
          { foreignKeyName: "heart_rate_samples_session_id_fkey"; columns: ["session_id"]; isOneToOne: false; referencedRelation: "workout_sessions"; referencedColumns: ["id"] },
        ];
      };
      routine_adjustments: {
        Row: {
          id: string;
          user_id: string;
          session_id: string;
          routine_exercise_id: string;
          action: AdjustmentAction;
          current_weight_kg: number | null;
          suggested_weight_kg: number | null;
          suggested_reps: number | null;
          suggested_reps_max: number | null;
          reason: string;
          source: "ai" | "rules";
          status: AdjustmentStatus;
        } & Timestamps;
        Insert: {
          session_id: string;
          routine_exercise_id: string;
          action: AdjustmentAction;
          reason: string;
          user_id?: string;
          current_weight_kg?: number | null;
          suggested_weight_kg?: number | null;
          suggested_reps?: number | null;
          suggested_reps_max?: number | null;
          source?: "ai" | "rules";
          status?: AdjustmentStatus;
        };
        Update: Partial<Database["public"]["Tables"]["routine_adjustments"]["Insert"]>;
        Relationships: [
          { foreignKeyName: "routine_adjustments_routine_exercise_id_fkey"; columns: ["routine_exercise_id"]; isOneToOne: false; referencedRelation: "routine_exercises"; referencedColumns: ["id"] },
          { foreignKeyName: "routine_adjustments_session_id_fkey"; columns: ["session_id"]; isOneToOne: false; referencedRelation: "workout_sessions"; referencedColumns: ["id"] },
        ];
      };
      ai_usage: {
        Row: {
          id: number;
          user_id: string;
          kind: "generate_plan" | "adjust_session" | "import_workout" | "weekly_recap";
          model: string | null;
          input_tokens: number | null;
          output_tokens: number | null;
          ok: boolean;
          created_at: string;
        };
        Insert: never;
        Update: never;
        Relationships: [];
      };
      weekly_recaps: {
        Row: {
          user_id: string;
          week_start: string;
          recap: WeeklyRecap;
          source: "ai" | "rules";
          created_at: string;
        };
        Insert: never;
        Update: never;
        Relationships: [];
      };
      claude_links: {
        // token_hash isn't readable from the app.
        Row: {
          user_id: string;
          created_at: string;
          last_used_at: string | null;
        };
        Insert: never;
        Update: never;
        Relationships: [];
      };
    };
    Views: { [_ in never]: never };
    Functions: {
      create_claude_link: {
        Args: Record<string, never>;
        Returns: string;
      };
      reorder_routine_exercises: {
        Args: { p_routine_id: string; p_ids: string[] };
        Returns: undefined;
      };
      reorder_program_days: {
        Args: { p_program_id: string; p_week: number; p_routine_ids: string[] };
        Returns: undefined;
      };
      get_last_performance: {
        Args: { p_exercise_id: string };
        Returns: {
          session_id: string;
          performed_at: string;
          set_number: number;
          set_type: SetType;
          weight: number;
          reps: number;
          rpe: number | null;
          duration_seconds: number | null;
          distance_m: number | null;
          reps_left: number | null;
          reps_right: number | null;
        }[];
      };
      apply_routine_adjustment: {
        Args: { p_id: string };
        Returns: undefined;
      };
      start_program: {
        Args: { p_id: string };
        Returns: undefined;
      };
      stop_program: {
        Args: { p_id: string };
        Returns: undefined;
      };
      program_progress: {
        Args: { p_program_id?: string };
        Returns: {
          program_id: string;
          program_name: string;
          weeks: number;
          days_per_week: number;
          is_active: boolean;
          total: number;
          done: number;
          done_routine_ids: string[];
          next_routine_id: string | null;
          next_routine_name: string | null;
          next_week: number | null;
          next_day: number | null;
        }[];
      };
      get_logged_exercises: {
        Args: Record<string, never>;
        Returns: {
          exercise_id: string;
          name: string;
          equipment: EquipmentType;
          session_count: number;
          last_performed: string;
        }[];
      };
      get_e1rm_history: {
        Args: { p_exercise_id: string; p_since?: string };
        Returns: {
          session_id: string;
          performed_at: string;
          e1rm: number;
          weight: number;
          reps: number;
        }[];
      };
      get_muscle_sets: {
        Args: { p_since: string };
        Returns: {
          completed_at: string;
          set_type: SetType;
          primary_muscle: MuscleGroup;
          secondary_muscles: MuscleGroup[];
        }[];
      };
    };
    Enums: {
      set_type: SetType;
      muscle_group: MuscleGroup;
      equipment_type: EquipmentType;
      exercise_mechanic: ExerciseMechanic;
      unit_system: UnitSystem;
      session_source: SessionSource;
      adjustment_action: AdjustmentAction;
      adjustment_status: AdjustmentStatus;
    };
    CompositeTypes: { [_ in never]: never };
  };
};

export type Tables<T extends keyof Database["public"]["Tables"]> = Database["public"]["Tables"][T]["Row"];
