"use client";

import {
  Backpack,
  Bike,
  Car,
  Glasses,
  HeartPulse,
  House,
  Laptop,
  Moon,
  Package,
  PersonStanding,
  Scissors,
  Shirt,
  ShoppingBag,
  Smile,
  Users,
  Utensils,
  Video,
  Wrench,
  type LucideIcon,
} from "lucide-react";
import type { ItemCategory } from "@/data/inventory-mock";
import {
  CATEGORY_FILL,
  iconIdForTitle,
  TASK_ICON_IDS,
  TASK_ICON_LABEL,
  type TaskIconId,
} from "@/lib/planner/task-icon";

const GLYPH: Record<TaskIconId, LucideIcon> = {
  glasses: Glasses,
  car: Car,
  package: Package,
  "person-standing": PersonStanding,
  bike: Bike,
  utensils: Utensils,
  backpack: Backpack,
  video: Video,
  scissors: Scissors,
  shirt: Shirt,
  "shopping-bag": ShoppingBag,
  moon: Moon,
  house: House,
  users: Users,
  smile: Smile,
  laptop: Laptop,
  "heart-pulse": HeartPulse,
  wrench: Wrench,
};

const INK = "#0f394c";

export function TaskIcon({
  title,
  category,
  override,
  size = 28,
}: {
  title: string;
  category: ItemCategory;
  override?: string | null;
  size?: number;
}) {
  const id = iconIdForTitle(title, category, override);
  const Icon = GLYPH[id];
  return (
    <span
      className="inline-flex shrink-0 items-center justify-center rounded-full"
      style={{ width: size, height: size, backgroundColor: CATEGORY_FILL[category], color: INK }}
      aria-hidden
    >
      <Icon size={Math.round(size * 0.58)} strokeWidth={1.75} />
    </span>
  );
}

export function TaskIconPicker({
  title,
  category,
  value,
  disabled,
  onChange,
}: {
  title: string;
  category: ItemCategory;
  value: string | null;
  disabled?: boolean;
  onChange: (icon: string | null) => void;
}) {
  const fromName = TASK_ICON_LABEL[iconIdForTitle(title, category, null)];
  return (
    <div>
      <span className="mb-1 block text-[12px] font-medium text-ink-muted">Icon</span>
      <div className="flex gap-1 overflow-x-auto pb-1">
        <button
          type="button"
          disabled={disabled}
          aria-pressed={value == null}
          aria-label={`Use ${fromName} from the name`}
          onClick={() => onChange(null)}
          className="h-11 shrink-0 rounded-full px-3 text-[13px] font-medium text-[#0f394c] disabled:opacity-50"
          style={{
            backgroundColor: value == null ? "#f5ecc4" : "#f6f4f0",
          }}
        >
          Auto
        </button>
        {TASK_ICON_IDS.map((id) => {
          const Icon = GLYPH[id];
          const selected = value === id;
          return (
            <button
              key={id}
              type="button"
              disabled={disabled}
              aria-pressed={selected}
              aria-label={TASK_ICON_LABEL[id]}
              onClick={() => onChange(id)}
              className="inline-flex h-11 w-11 shrink-0 items-center justify-center rounded-full disabled:opacity-50"
              style={{
                backgroundColor: CATEGORY_FILL[category],
                color: INK,
                outline: selected ? `2px solid ${INK}` : "none",
                outlineOffset: 1,
              }}
            >
              <Icon size={18} strokeWidth={1.75} aria-hidden />
            </button>
          );
        })}
      </div>
    </div>
  );
}
