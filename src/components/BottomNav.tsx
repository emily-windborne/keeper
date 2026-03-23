"use client";

import Link from "next/link";
import { usePathname } from "next/navigation";

const tabs = [
  { href: "/", label: "Planner", icon: PlannerIcon },
  { href: "/inventory", label: "Inventory", icon: InventoryIcon },
  { href: "/check-in", label: "Check-In", icon: CheckInIcon },
  { href: "/settings", label: "Settings", icon: SettingsIcon },
] as const;

function PlannerIcon({ active }: { active: boolean }) {
  return (
    <svg
      aria-hidden
      className="h-6 w-6"
      fill="none"
      viewBox="0 0 24 24"
      strokeWidth={active ? 2 : 1.5}
      stroke="currentColor"
    >
      <path
        strokeLinecap="round"
        strokeLinejoin="round"
        d="M6.75 3v2.25M17.25 3v2.25M3 18.75V7.5a2.25 2.25 0 012.25-2.25h13.5A2.25 2.25 0 0121 7.5v11.25m-18 0A2.25 2.25 0 005.25 21h13.5a2.25 2.25 0 002.25-2.25m-18 0v-7.5A2.25 2.25 0 015.25 9h13.5a2.25 2.25 0 012.25 2.25v7.5"
      />
    </svg>
  );
}

function InventoryIcon({ active }: { active: boolean }) {
  return (
    <svg
      aria-hidden
      className="h-6 w-6"
      fill="none"
      viewBox="0 0 24 24"
      strokeWidth={active ? 2 : 1.5}
      stroke="currentColor"
    >
      <path
        strokeLinecap="round"
        strokeLinejoin="round"
        d="M20.25 7.5l-.625 10.632a2.25 2.25 0 01-2.247 2.118H6.622a2.25 2.25 0 01-2.247-2.118L3.75 7.5M10 11.25h4M3.375 7.5h17.25c.621 0 1.125-.504 1.125-1.125v-1.5c0-.621-.504-1.125-1.125-1.125H3.375c-.621 0-1.125.504-1.125 1.125v1.5c0 .621.504 1.125 1.125 1.125z"
      />
    </svg>
  );
}

function CheckInIcon({ active }: { active: boolean }) {
  return (
    <svg
      aria-hidden
      className="h-6 w-6"
      fill="none"
      viewBox="0 0 24 24"
      strokeWidth={active ? 2 : 1.5}
      stroke="currentColor"
    >
      <path
        strokeLinecap="round"
        strokeLinejoin="round"
        d="M9 12.75L11.25 15 15 9.75M21 12a9 9 0 11-18 0 9 9 0 0118 0z"
      />
    </svg>
  );
}

function SettingsIcon({ active }: { active: boolean }) {
  return (
    <svg
      aria-hidden
      className="h-6 w-6"
      fill="none"
      viewBox="0 0 24 24"
      strokeWidth={active ? 2 : 1.5}
      stroke="currentColor"
    >
      <path
        strokeLinecap="round"
        strokeLinejoin="round"
        d="M9.594 3.94c.09-.542.56-.94 1.11-.94h2.593c.55 0 1.02.398 1.11.94l.213 1.281c.063.374.313.686.645.87.074.04.147.083.22.127.324.196.72.257 1.075.124l1.217-.456a1.125 1.125 0 011.37.49l1.296 2.247a1.125 1.125 0 01-.26 1.431l-1.003.827c-.293.24-.438.613-.431.992a6.759 6.759 0 010 .255c-.007.378.138.75.43.99l1.005.828c.424.35.534.954.26 1.43l-1.298 2.247a1.125 1.125 0 01-1.369.491l-1.217-.456c-.355-.133-.75-.072-1.076.124a6.57 6.57 0 01-.22.128c-.331.183-.581.495-.644.869l-.213 1.28c-.09.543-.56.941-1.11.941h-2.594c-.55 0-1.02-.398-1.11-.94l-.213-1.281c-.062-.374-.312-.686-.644-.87a6.52 6.52 0 01-.22-.127c-.325-.196-.72-.257-1.076-.124l-1.217.456a1.125 1.125 0 01-1.369-.49l-1.297-2.247a1.125 1.125 0 01.26-1.431l1.004-.827c.292-.24.437-.613.43-.992a6.932 6.932 0 010-.255c.007-.378-.138-.75-.43-.99l-1.004-.828a1.125 1.125 0 01-.26-1.43l1.297-2.247a1.125 1.125 0 011.37-.491l1.216.456c.356.133.751.072 1.076-.124.072-.044.146-.087.22-.128.332-.183.582-.495.644-.869l.214-1.281z"
      />
      <path strokeLinecap="round" strokeLinejoin="round" d="M15 12a3 3 0 11-6 0 3 3 0 016 0z" />
    </svg>
  );
}

export function BottomNav() {
  const pathname = usePathname();

  return (
    <nav
      className="pointer-events-none fixed bottom-0 left-0 right-0 z-50 border-t border-border bg-surface-raised/95 shadow-nav backdrop-blur-md supports-[backdrop-filter]:bg-surface-raised/85"
      aria-label="Main"
    >
      <div className="mx-auto flex w-full max-w-shell items-stretch justify-around gap-1 px-2 pb-[max(0.75rem,env(safe-area-inset-bottom))] pt-2 sm:max-w-xl sm:px-6 md:max-w-2xl lg:max-w-3xl">
        {tabs.map(({ href, label, icon: Icon }) => {
          const active =
            href === "/"
              ? pathname === "/"
              : pathname === href || pathname.startsWith(`${href}/`);

          return (
            <Link
              key={href}
              href={href}
              className="pointer-events-auto flex min-w-0 flex-1 flex-col items-center gap-1 px-2 py-2 text-xs transition-colors sm:py-2.5"
              aria-current={active ? "page" : undefined}
            >
              <span
                className={`grid h-11 w-11 place-items-center rounded-[20px] ${
                  active
                    ? "bg-accent-soft/85 text-accent"
                    : "text-ink-faint hover:text-ink-muted"
                }`}
              >
                <Icon active={active} />
              </span>
              <span
                className={`truncate ${
                  active ? "font-medium text-accent" : "font-normal text-ink-faint"
                }`}
              >
                {label}
              </span>
            </Link>
          );
        })}
      </div>
    </nav>
  );
}
