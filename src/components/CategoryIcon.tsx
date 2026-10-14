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
  size,
}: {
  category: ItemCategory;
  /** `bare`: icon only, no circular well (e.g. on custom pill backgrounds). */
  variant?: "well" | "bare";
  /** Overrides default ink color (e.g. white on colored pills). */
  iconColor?: string;
  /** Icon style; default `duotone`. Use `fill` for solid single-color glyphs on pills. */
  weight?: IconWeight;
  /** Glyph size in pixels. Defaults to 20 bare, 22 in a well. */
  size?: number;
}) {
  const color = iconColor ?? ICON_COLOR;
  const w = weight ?? "duotone";
  const Icon = CATEGORY_ICON[category as keyof typeof CATEGORY_ICON] ?? CATEGORY_ICON.Home;
  const px = size ?? (variant === "bare" ? 20 : 22);
  if (variant === "bare") {
    return (
      <span className="inline-flex shrink-0 items-center justify-center" aria-hidden>
        <Icon weight={w} size={px} color={color} />
      </span>
    );
  }
  return (
    <span className={WRAPPER_CLASS} aria-hidden>
      <Icon weight={w} size={px} color={color} />
    </span>
  );
}
