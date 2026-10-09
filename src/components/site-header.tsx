"use client";

import Link from "next/link";
import { usePathname } from "next/navigation";
import { nav, site } from "@/lib/site";

export function SiteHeader() {
  const pathname = usePathname();

  return (
    <header className="border-b-4 border-ink bg-crayon text-paper">
      <div className="mx-auto flex w-full max-w-5xl flex-col gap-4 px-5 py-4 md:flex-row md:items-center md:justify-between">
        <Link href="/" className="text-xl font-semibold tracking-tight">
          {site.name}
        </Link>
        <nav aria-label="Primary" className="flex flex-wrap gap-2">
          {nav.map((item) => {
            const active =
              pathname === item.href || pathname.startsWith(`${item.href}/`);
            return (
              <Link
                key={item.href}
                href={item.href}
                aria-current={active ? "page" : undefined}
                className={
                  active
                    ? "inline-flex min-h-11 items-center rounded-full bg-pink px-4 text-sm font-semibold text-ink"
                    : "inline-flex min-h-11 items-center rounded-full px-4 text-sm font-semibold text-paper hover:bg-paper/15"
                }
              >
                {item.label}
              </Link>
            );
          })}
        </nav>
      </div>
    </header>
  );
}
