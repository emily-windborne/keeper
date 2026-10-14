export type Item = {
  id: string;
  title: string;
  category: "Home" | "Family" | "Personal" | "Work" | "Upkeep" | "Health";
  type: "recurring" | "one_off" | "goal" | "anchor";
  frequency_type: "daily" | "weekly" | "biweekly" | "monthly" | "custom" | null;
  frequency_value: number | null;
  /** days, weeks, or months. Null on older rows until they are saved again. */
  frequency_unit: "days" | "weeks" | "months" | null;
  /** How many times inside one period. Daily: per day. Weekly: per week. */
  times_per_period: number;
  recurrence_end: "never" | "on_date" | "after_count";
  recurrence_end_date: string | null;
  recurrence_end_count: number | null;
  completed_count: number;
  preferred_days: string[] | null; // e.g. ['wednesday']
  preferred_time_of_day: "morning" | "afternoon" | "evening" | "anytime" | null;
  /** Clock time that must be kept when flexibility is Fixed, such as 13:00. */
  fixed_start_time: string | null;
  estimated_minutes: number;
  priority: "Critical" | "Important" | "Standard" | "Optional";
  flexibility: "Fixed" | "Preferred window" | "Flexible anytime";
  cadence_pressure:
    | "Must stay on cadence"
    | "Can slide a little"
    | "Can defer";
  minimum_success_threshold: string | null;
  notes: string | null;
  /** Lucide name chosen in the edit sheet. Empty means the title picks the icon. */
  icon?: string | null;
  is_archived: boolean;
  last_completed_at: string | null; // ISO date string
  next_due_date: string | null; // ISO date string
  created_at: string;
  updated_at: string;
};

export type ItemPriority = Item["priority"];
export type ItemCategory = Item["category"];
export type ItemType = Item["type"];
export type ItemFlexibility = Item["flexibility"];
export type ItemCadencePressure = Item["cadence_pressure"];
export type FrequencyType = Item["frequency_type"];
