"use client";

import Image from "next/image";
import Link from "next/link";
import { BottomNav } from "./BottomNav";

export function AppShell({ children }: { children: React.ReactNode }) {
  return (
    <div className="mx-auto flex min-h-dvh w-full max-w-shell flex-col sm:max-w-xl md:max-w-2xl lg:max-w-3xl">
      <header className="flex justify-center px-5 pt-6 sm:px-8 sm:pt-8 md:px-10">
        <Link
          href="/"
          className="inline-flex focus-visible:outline-none focus-visible:ring-2 focus-visible:ring-accent/40 focus-visible:ring-offset-2 focus-visible:ring-offset-surface"
          aria-label="Keeper home"
        >
          <Image
            src="/keeper-logo.png"
            alt="Keeper"
            width={1024}
            height={512}
            priority
            sizes="(max-width: 640px) 90vw, 420px"
            className="h-auto w-full max-w-[17.5rem] object-contain object-center sm:max-w-[21rem] md:max-w-[24rem]"
          />
        </Link>
      </header>
      <main className="flex flex-1 flex-col px-5 pb-28 pt-4 sm:px-8 sm:pt-6 md:px-10">
        {children}
      </main>
      <BottomNav />
    </div>
  );
}
