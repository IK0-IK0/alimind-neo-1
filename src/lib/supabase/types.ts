export type Json =
  | string
  | number
  | boolean
  | null
  | { [key: string]: Json | undefined }
  | Json[];

export type AssessmentStatus = "in_progress" | "completed" | "abandoned";
export type AccountRole = "user" | "reviewer";

export type AssessmentRecord = {
  id: string;
  user_id: string;
  status: AssessmentStatus;
  question_order: string[];
  answers: Json;
  messages: Json;
  consent_version: string;
  consent_accepted_at: string;
  started_at: string;
  updated_at: string;
  completed_at: string | null;
};

export type ProfileRecord = {
  id: string;
  display_name: string;
  account_role: AccountRole;
  created_at: string;
  updated_at: string;
};

export type AssessmentReviewStatus = "in_progress" | "completed";

export type AssessmentReviewRecord = {
  assessment_id: string;
  reviewer_id: string;
  status: AssessmentReviewStatus;
  started_at: string;
  updated_at: string;
  completed_at: string | null;
  delivered_at: string | null;
};

export type AssessmentReviewDraftRecord = {
  assessment_id: string;
  response_draft: string;
  recommendation_draft: string;
  selected_recipe: string;
};

export interface Database {
  public: {
    Tables: {
      profiles: {
        Row: ProfileRecord;
        Insert: {
          id: string;
          display_name?: string;
          account_role?: AccountRole;
          created_at?: string;
          updated_at?: string;
        };
        Update: Partial<Pick<ProfileRecord, "display_name" | "account_role">>;
        Relationships: [];
      };
      assessment_sessions: {
        Row: AssessmentRecord;
        Insert: Omit<AssessmentRecord, "id" | "started_at" | "updated_at" | "completed_at"> & {
          id?: string;
          started_at?: string;
          updated_at?: string;
          completed_at?: string | null;
        };
        Update: Partial<AssessmentRecord>;
        Relationships: [];
      };
      assessment_reviews: {
        Row: AssessmentReviewRecord;
        Insert: Omit<AssessmentReviewRecord, "started_at" | "updated_at" | "completed_at" | "delivered_at"> & {
          started_at?: string;
          updated_at?: string;
          completed_at?: string | null;
          delivered_at?: string | null;
        };
        Update: Partial<AssessmentReviewRecord>;
        Relationships: [
          {
            foreignKeyName: "assessment_reviews_assessment_id_fkey";
            columns: ["assessment_id"];
            isOneToOne: true;
            referencedRelation: "assessment_sessions";
            referencedColumns: ["id"];
          },
          {
            foreignKeyName: "assessment_reviews_reviewer_id_fkey";
            columns: ["reviewer_id"];
            isOneToOne: false;
            referencedRelation: "profiles";
            referencedColumns: ["id"];
          },
        ];
      };
      assessment_review_drafts: {
        Row: AssessmentReviewDraftRecord;
        Insert: {
          assessment_id: string;
          response_draft?: string;
          recommendation_draft?: string;
          selected_recipe?: string;
        };
        Update: Partial<Omit<AssessmentReviewDraftRecord, "assessment_id">>;
        Relationships: [
          {
            foreignKeyName: "assessment_review_drafts_assessment_id_fkey";
            columns: ["assessment_id"];
            isOneToOne: true;
            referencedRelation: "assessment_reviews";
            referencedColumns: ["assessment_id"];
          },
        ];
      };
    };
    Views: { [_ in never]: never };
    Functions: { [_ in never]: never };
    Enums: { [_ in never]: never };
    CompositeTypes: { [_ in never]: never };
  };
}
