import Link from "next/link";
import { House } from "lucide-react";
import { cn } from "@/lib/utils/cn";

export function Brand({ inverse = false }: { inverse?: boolean }) {
  return <Link href="/" aria-label="HostelFix home" className={cn("inline-flex min-h-11 items-center gap-2.5 rounded-md", inverse && "text-white")}>
    <span className={cn("flex size-9 items-center justify-center rounded-xl", inverse ? "bg-white/15 text-white" : "bg-brand text-white")}><House className="size-5" strokeWidth={2} aria-hidden="true" /></span>
    <span className="text-xl font-bold tracking-[-0.055em]">HostelFix<span className={inverse ? "text-lime" : "text-brand"}>.</span></span>
  </Link>;
}
