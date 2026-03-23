import {
  DoorOpen,
  Laptop,
  Pulse,
  SmileyWink,
  Sparkle,
  Users,
} from "@phosphor-icons/react";
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

export function CategoryIcon({ category }: { category: ItemCategory }) {
  const Icon = CATEGORY_ICON[category as keyof typeof CATEGORY_ICON] ?? CATEGORY_ICON.Home;
  return (
    <span className={WRAPPER_CLASS} aria-hidden>
      <Icon weight="duotone" size={22} color={ICON_COLOR} />
    </span>
  );
}
