"use client";

import {
  DoorOpen,
  Laptop,
  Pulse,
  SmileyWink,
  Sparkle,
  Users,
} from "@phosphor-icons/react";
import type { IconWeight } from "@phosphor-icons/react";
import type { ItemCategory } from "@/data/inventory-mock";

const CATEGORY_ICON = {
  Home: DoorOpen,
  Family: Users,
  Personal: SmileyWink,
  Work: Laptop,
  Health: Pulse,
  Upkeep: Sparkle,
} as const;

const ICON_COLOR = "#0f394c";
const WRAPPER_CLASS =
  "inline-flex h-9 w-9 shrink-0 items-center justify-center rounded-full bg-[#D0E4EB]";

export function CategoryIcon({
  category,
  variant = "well",
  iconColor,
  weight,
}: {
  category: ItemCategory;
  /** `bare`: icon only, no circular well (e.g. on custom pill backgrounds). */
  variant?: "well" | "bare";
  /** Overrides default ink color (e.g. white on colored pills). */
  iconColor?: string;
  /** Icon style; default `duotone`. Use `fill` for solid single-color glyphs on pills. */
  weight?: IconWeight;
}) {
  const color = iconColor ?? ICON_COLOR;
  const w = weight ?? "duotone";
  const Icon = CATEGORY_ICON[category as keyof typeof CATEGORY_ICON] ?? CATEGORY_ICON.Home;
  if (variant === "bare") {
    return (
      <span className="inline-flex shrink-0 items-center justify-center" aria-hidden>
        <Icon weight={w} size={20} color={color} />
      </span>
    );
  }
  return (
    <span className={WRAPPER_CLASS} aria-hidden>
      <Icon weight={w} size={22} color={color} />
    </span>
  );
}
