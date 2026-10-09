import Link from "next/link";
import { ChogIllustration } from "@/components/ui/chog-illustration";
import { PageContainer } from "@/components/ui/page-header";

export default function NotFound() {
  return (
    <PageContainer className="items-center text-center">
      <ChogIllustration mood="puzzled" className="h-40 w-auto" />
      <div className="flex max-w-md flex-col gap-3">
        <p className="font-hand text-3xl text-blush-300">404</p>
        <h1 className="font-display text-3xl font-semibold">This page wandered off</h1>
        <p className="text-white/65">The link might be old, or the page never existed.</p>
      </div>
      <div className="flex flex-wrap justify-center gap-3">
        <Link href="/" className="btn btn-primary">
          Go home
        </Link>
        <Link href="/collabs" className="btn btn-ghost">
          Browse collabs
        </Link>
      </div>
    </PageContainer>
  );
}
