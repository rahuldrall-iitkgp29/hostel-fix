import type { ComponentProps } from "react";
import { cn } from "@/lib/utils/cn";

const tones = {
  neutral: "bg-canvas text-muted border-line",
  success: "bg-brand-soft text-brand border-brand/15",
  warning: "bg-warning-soft text-warning border-warning/15",
};

export function Badge({ tone = "neutral", className, ...props }: ComponentProps<"span"> & { tone?: keyof typeof tones }) {
  return <span {...props} className={cn("inline-flex items-center gap-1.5 rounded-full border px-3 py-1 text-xs font-medium", tones[tone], className)} />;
}
