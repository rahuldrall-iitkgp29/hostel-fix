import { Badge } from "@/components/ui/badge";
import type { ComplaintStatus } from "../types";

const statusConfig: Record<
  ComplaintStatus,
  { label: string; tone: "neutral" | "success" | "warning" }
> = {
  SUBMITTED: { label: "Submitted", tone: "neutral" },
  TRIAGED: { label: "Triaged", tone: "warning" },
  ASSIGNED: { label: "Assigned", tone: "warning" },
  IN_PROGRESS: { label: "In Progress", tone: "warning" },
  RESOLVED: { label: "Resolved", tone: "success" },
  CLOSED: { label: "Closed", tone: "neutral" },
  REOPENED: { label: "Reopened", tone: "warning" },
  REJECTED: { label: "Rejected", tone: "neutral" },
};

export function StatusBadge({ status, className }: { status: ComplaintStatus; className?: string }) {
  const config = statusConfig[status] || { label: status, tone: "neutral" };
  return (
    <Badge tone={config.tone} className={className}>
      {config.label}
    </Badge>
  );
}
