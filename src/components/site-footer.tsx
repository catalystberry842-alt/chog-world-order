import { site } from "@/lib/site";

export function SiteFooter() {
  return (
    <footer className="border-t-4 border-ink">
      <div className="mx-auto flex w-full max-w-5xl flex-col gap-2 px-5 py-6 text-sm text-ink/75">
        <p className="font-semibold text-ink">{site.name}</p>
        <p>
          A sketch for the Monad ecosystem. No app is deployed from this
          repository, and no smart contracts live here.
        </p>
      </div>
    </footer>
  );
}
