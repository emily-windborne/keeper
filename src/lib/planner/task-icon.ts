import type { ItemCategory } from "@/data/inventory-mock";

/** Lucide names, stored on the item when someone picks one. */
export const TASK_ICON_IDS = [
  "glasses",
  "car",
  "package",
  "person-standing",
  "bike",
  "utensils",
  "backpack",
  "video",
  "scissors",
  "shirt",
  "shopping-bag",
  "moon",
  "house",
  "users",
  "smile",
  "laptop",
  "heart-pulse",
  "wrench",
] as const;

export type TaskIconId = (typeof TASK_ICON_IDS)[number];

export const TASK_ICON_LABEL: Record<TaskIconId, string> = {
  glasses: "Glasses",
  car: "Car",
  package: "Package",
  "person-standing": "Yoga",
  bike: "Bike",
  utensils: "Meal",
  backpack: "School",
  video: "Call",
  scissors: "Crafts",
  shirt: "Laundry",
  "shopping-bag": "Shopping",
  moon: "Bedtime",
  house: "Home",
  users: "Family",
  smile: "Personal",
  laptop: "Work",
  "heart-pulse": "Health",
  wrench: "Upkeep",
};

/** Soft fills in the cream, navy, and mustard family. No ring. */
export const CATEGORY_FILL: Record<ItemCategory, string> = {
  Home: "#f3ead8",
  Family: "#f5ecc4",
  Personal: "#e4eef2",
  Work: "#d7e4ea",
  Health: "#e5f0e6",
  Upkeep: "#efe4d4",
};

const CATEGORY_ICON: Record<ItemCategory, TaskIconId> = {
  Home: "house",
  Family: "users",
  Personal: "smile",
  Work: "laptop",
  Health: "heart-pulse",
  Upkeep: "wrench",
};

/** Specific phrases win before broader ones. */
const TITLE_RULES: { id: TaskIconId; pattern: RegExp }[] = [
  { id: "glasses", pattern: /\b(eyeglasses|glasses)\b/i },
  { id: "package", pattern: /\b(ups|shipping|ship|package)\b/i },
  { id: "car", pattern: /\b(coolant|car|auto)\b/i },
  { id: "person-standing", pattern: /\b(yoga|pilates|stretch)\b/i },
  { id: "bike", pattern: /\b(peloton|bike|cycling)\b/i },
  { id: "utensils", pattern: /\b(meal|dinner|lunch|breakfast|cook|cooking)\b/i },
  { id: "backpack", pattern: /\b(school|drop-?off)\b/i },
  { id: "video", pattern: /\b(meeting|video|call)\b/i },
  { id: "scissors", pattern: /\b(crafts?)\b/i },
  { id: "shirt", pattern: /\b(laundry|clothes)\b/i },
  { id: "shopping-bag", pattern: /\b(grocer(?:y|ies))\b/i },
  { id: "moon", pattern: /\b(bedtime|sleep|wind-?down)\b/i },
];

export function isTaskIconId(value: unknown): value is TaskIconId {
  return typeof value === "string" && (TASK_ICON_IDS as readonly string[]).includes(value);
}

/** A saved choice wins. Otherwise the title, then the category. */
export function iconIdForTitle(
  title: string,
  category: ItemCategory,
  override?: string | null,
): TaskIconId {
  if (isTaskIconId(override)) return override;
  for (const rule of TITLE_RULES) {
    if (rule.pattern.test(title)) return rule.id;
  }
  return CATEGORY_ICON[category] ?? "house";
}
