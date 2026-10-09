import type { Metadata } from "next";
import Link from "next/link";
import { connection } from "next/server";
import { Suspense } from "react";
import { PassportView } from "@/components/passport/passport-view";
import { PageContainer } from "@/components/ui/page-header";
import { LoadingLabel, ProfileSkeleton } from "@/components/ui/skeletons";
import { EmptyState, ErrorState } from "@/components/ui/state-panels";
import { getSamplePassport, getSamplePassportAddresses } from "@/lib/data";
import { shortAddress } from "@/lib/format";
import { normalizeAddress } from "@/lib/passport/address";
import type { PublicPassport } from "@/lib/passport/types";
import { getPassport } from "@/server/passport/service";
import { getServices } from "@/server/services";

export async function generateStaticParams() {
  const addresses = await getSamplePassportAddresses();
  return addresses.map((address) => ({ address }));
}

export async function generateMetadata({ params }: PageProps<"/profile/[address]">): Promise<Metadata> {
  const { address } = await params;
  const sample = normalizeAddress(address) ? await getSamplePassport(address) : undefined;
  return {
    title: sample?.profile.displayName ?? (normalizeAddress(address) ? shortAddress(address) : "Invalid address"),
    description: "Public Chog Passport: stamps, verified contributions, and reputation breakdown.",
  };
}

export default function ProfilePage({ params }: PageProps<"/profile/[address]">) {
  return (
    <PageContainer className="gap-8 md:gap-10">
      <Link href="/leaderboard" className="w-fit text-sm font-medium text-white/60 hover:text-white">
        ← Leaderboard
      </Link>
      <Suspense
        fallback={
          <>
            <ProfileSkeleton />
            <LoadingLabel>Loading profile…</LoadingLabel>
          </>
        }
      >
        <Profile params={params} />
      </Suspense>
    </PageContainer>
  );
}

type Lookup =
  | { kind: "found"; passport: PublicPassport }
  | { kind: "missing"; serviceConfigured: boolean };

/**
 * Real passports come from the database. Sample passports exist only for the
 * fake 0xc406… addresses and are always labelled. A database record always
 * wins over a sample.
 */
async function lookup(address: string): Promise<Lookup> {
  const services = getServices();
  if (services.store) {
    await connection(); // database reads happen at request time, never at build time
    const passport = await getPassport(services, address, null);
    if (passport) return { kind: "found", passport };
  }
  const sample = await getSamplePassport(address);
  if (sample) return { kind: "found", passport: sample };
  return { kind: "missing", serviceConfigured: Boolean(services.store) };
}

async function Profile({ params }: Pick<PageProps<"/profile/[address]">, "params">) {
  const { address: raw } = await params;
  const address = normalizeAddress(decodeURIComponent(raw));

  if (!address) {
    return (
      <ErrorState
        title="That doesn't look like a wallet address"
        description={
          <>
            Profiles live at <span className="font-mono">/profile/0x…</span> followed by a 40-character hex address.
            Check the link and try again.
          </>
        }
        action={
          <Link href="/leaderboard" className="btn btn-ghost btn-sm">
            Browse contributors
          </Link>
        }
      />
    );
  }

  const result = await lookup(address);

  if (result.kind === "missing") {
    return (
      <div className="flex flex-col gap-6">
        <header className="glass flex flex-col gap-2 rounded-[2rem] p-6 sm:p-8">
          <p className="text-xs font-semibold tracking-[0.2em] text-blush-300 uppercase">Public profile</p>
          <h1 className="text-3xl font-semibold">{shortAddress(address)}</h1>
          <p className="font-mono text-sm break-all text-white/55">{address}</p>
        </header>
        <EmptyState
          title="No passport for this address"
          description={
            result.serviceConfigured
              ? "This address has not signed in or recorded any verified activity yet. Wallet connection alone does not create a passport."
              : "Passport records are not available on this deployment (no database is configured), so only sample profiles can be shown."
          }
          action={
            <Link href="/passport" className="btn btn-primary btn-sm">
              Open your passport
            </Link>
          }
        />
      </div>
    );
  }

  const { passport } = result;
  return (
    <>
      <h1 className="sr-only">{passport.profile.displayName ?? shortAddress(passport.address)} public profile</h1>
      <PassportView passport={passport} audience="public" idPrefix="profile" />
    </>
  );
}
