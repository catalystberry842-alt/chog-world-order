import Link from "next/link";
import { EmptyState } from "@/components/ui/state-panels";
import { PageContainer } from "@/components/ui/page-header";

export default function CampaignNotFound() {
  return (
    <PageContainer>
      <EmptyState
        title="Campaign not found"
        description="This campaign doesn't exist or was removed by the project."
        action={
          <Link href="/collabs" className="btn btn-primary btn-sm">
            Browse campaigns
          </Link>
        }
      />
    </PageContainer>
  );
}
