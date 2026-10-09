"use client";

import Link from "next/link";
import { usePathname } from "next/navigation";
import { useState } from "react";
import { ConnectButton } from "@/components/wallet/connect-button";
import { nav, site } from "@/lib/site";

function LogoMark() {
  return (
    <svg viewBox="0 0 40 40" className="h-9 w-9" aria-hidden="true">
      <rect x="2" y="2" width="36" height="36" rx="11" fill="var(--monad-500)" />
      <path d="M9 14 7 6l7 5M31 14l2-8-7 5" fill="var(--monad-500)" />
      <ellipse cx="15" cy="19" rx="4" ry="4.6" fill="var(--paper)" />
      <ellipse cx="25" cy="19" rx="4" ry="4.6" fill="var(--paper)" />
      <circle cx="16" cy="20" r="2" fill="var(--ink)" />
      <circle cx="26" cy="20" r="2" fill="var(--ink)" />
      <ellipse cx="10.5" cy="25.5" rx="2.6" ry="1.6" fill="var(--blush-400)" />
      <ellipse cx="29.5" cy="25.5" rx="2.6" ry="1.6" fill="var(--blush-400)" />
      <path d="M17 27c2 2.4 4 2.4 6 0" stroke="var(--ink)" strokeWidth="1.8" fill="none" strokeLinecap="round" />
    </svg>
  );
}

export function SiteHeader() {
  const pathname = usePathname();
  const [menuOpen, setMenuOpen] = useState(false);

  const isActive = (href: string) => pathname === href || pathname.startsWith(`${href}/`);

  return (
    <header className="sticky top-0 z-40 border-b border-white/[0.06] bg-night-950">
      <div className="mx-auto flex h-16 w-full max-w-6xl items-center justify-between gap-4 px-4 sm:px-6">
        <Link href="/" className="flex items-center gap-2.5" onClick={() => setMenuOpen(false)}>
          <LogoMark />
          <span className="text-lg font-semibold tracking-tight">{site.name}</span>
        </Link>

        <nav aria-label="Primary" className="hidden items-center gap-1 md:flex">
          {nav.map((item) => (
            <Link
              key={item.href}
              href={item.href}
              aria-current={isActive(item.href) ? "page" : undefined}
              className={`rounded-full px-4 py-2 text-sm font-medium transition ${
                isActive(item.href)
                  ? "bg-white/10 text-white"
                  : "text-white/65 hover:bg-white/5 hover:text-white"
              }`}
            >
              {item.label}
            </Link>
          ))}
        </nav>

        <div className="flex items-center gap-2">
          <ConnectButton className="btn-sm hidden sm:inline-flex" />
          <button
            type="button"
            className="btn btn-ghost btn-sm md:hidden"
            aria-expanded={menuOpen}
            aria-controls="mobile-nav"
            onClick={() => setMenuOpen((open) => !open)}
          >
            <span className="sr-only">{menuOpen ? "Close menu" : "Open menu"}</span>
            <svg viewBox="0 0 24 24" className="h-5 w-5" aria-hidden="true" fill="none" stroke="currentColor" strokeWidth="2" strokeLinecap="round">
              {menuOpen ? <path d="M6 6l12 12M18 6 6 18" /> : <path d="M4 7h16M4 12h16M4 17h16" />}
            </svg>
          </button>
        </div>
      </div>

      {menuOpen && (
        <nav id="mobile-nav" aria-label="Mobile" className="border-t border-white/[0.06] px-4 pt-3 pb-5 md:hidden">
          <ul className="flex flex-col gap-1">
            {nav.map((item) => (
              <li key={item.href}>
                <Link
                  href={item.href}
                  aria-current={isActive(item.href) ? "page" : undefined}
                  onClick={() => setMenuOpen(false)}
                  className={`flex min-h-11 items-center rounded-2xl px-4 text-base font-medium ${
                    isActive(item.href) ? "bg-white/10 text-white" : "text-white/75"
                  }`}
                >
                  {item.label}
                </Link>
              </li>
            ))}
          </ul>
          <ConnectButton className="mt-3 w-full sm:hidden" />
        </nav>
      )}
    </header>
  );
}
