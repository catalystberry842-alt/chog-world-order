import type { Metadata } from "next";
import Link from "next/link";
import { OwnerDashboard } from "@/components/campaigns/owner-dashboard";
import { PageContainer, PageHeader } from "@/components/ui/page-header";

export const metadata: Metadata = {
  title: "Project dashboard",
  description: "Create and publish paid campaigns, review applications, and accept deliverables.",
};

export default function DashboardPage() {
  return (
    <PageContainer>
      <Link href="/collabs" className="w-fit text-sm font-medium text-white/60 hover:text-white">
        ← All campaigns
      </Link>
      <PageHeader
        eyebrow="Project dashboard"
        title="Your campaigns"
        description="Draft a campaign, publish it once it is complete, then review applications and deliverables. Every decision is recorded with a reason."
      />
      <OwnerDashboard />
    </PageContainer>
  );
}
