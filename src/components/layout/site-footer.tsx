import Link from "next/link";
import { paymentsContractConfig } from "@/lib/contracts/campaign-payments";
import { nav, site } from "@/lib/site";

export function SiteFooter() {
  return (
    <footer className="mt-auto border-t border-white/[0.06]">
      <div className="mx-auto grid w-full max-w-6xl gap-8 px-4 py-10 sm:px-6 md:grid-cols-[1.5fr_1fr]">
        <div className="flex max-w-md flex-col gap-3">
          <p className="text-lg font-semibold">{site.name}</p>
          <p className="text-sm leading-relaxed text-white/55">{site.description}</p>
          <p className="text-xs leading-relaxed text-white/40">
            Anything marked “Sample” is mock data for illustration. Real passports and scores come only from
            verified evidence.{" "}
            {paymentsContractConfig().enabled
              ? "Creators are paid directly from project wallets; Chog World Order never holds funds."
              : "On-chain payments are not enabled on this deployment."}
          </p>
        </div>
        <nav aria-label="Footer" className="flex flex-col gap-2 text-sm md:items-end">
          <Link href="/" className="text-white/60 hover:text-white">
            Home
          </Link>
          {nav.map((item) => (
            <Link key={item.href} href={item.href} className="text-white/60 hover:text-white">
              {item.label}
            </Link>
          ))}
        </nav>
      </div>
    </footer>
  );
}
