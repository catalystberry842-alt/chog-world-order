"use client";

import { useEffect } from "react";
import { PageContainer } from "@/components/ui/page-header";
import { ErrorState } from "@/components/ui/state-panels";

export default function RouteError({ error, retry }: { error: Error & { digest?: string }; retry: () => void }) {
  useEffect(() => {
    console.error(error);
  }, [error]);

  return (
    <PageContainer>
      <ErrorState
        title="Something went wrong"
        description="This page failed to load. Try again, and if it keeps happening, come back in a moment."
        action={
          <button type="button" className="btn btn-primary btn-sm" onClick={() => retry()}>
            Try again
          </button>
        }
      />
    </PageContainer>
  );
}
