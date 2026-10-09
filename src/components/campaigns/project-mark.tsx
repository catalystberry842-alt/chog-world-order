import type { CampaignProject } from "@/lib/types";

/** Generated project logo: rounded tile with the project's initial. */
export function ProjectMark({ project, size = "md" }: { project: CampaignProject; size?: "md" | "lg" }) {
  return (
    <span
      aria-hidden="true"
      className={`inline-flex shrink-0 items-center justify-center font-semibold text-white ring-1 ring-white/15 ${
        size === "lg" ? "h-14 w-14 rounded-2xl text-2xl" : "h-10 w-10 rounded-xl text-base"
      }`}
      style={{ background: `hsl(${project.hue} 45% 38%)` }}
    >
      {project.name[0]}
    </span>
  );
}
