import { Container } from "@/components/layout/container";
import { Skeleton } from "@/components/ui/skeleton";

export default function Loading() {
  return <main id="main-content"><Container className="space-y-8 py-20"><p role="status" className="sr-only">Loading HostelFix…</p><Skeleton className="h-5 w-36" /><Skeleton className="h-12 w-3/4 max-w-lg" /><Skeleton className="h-6 w-full max-w-xl" /><div className="grid gap-5 md:grid-cols-3">{[0, 1, 2].map((key) => <Skeleton key={key} className="h-48" />)}</div></Container></main>;
}
