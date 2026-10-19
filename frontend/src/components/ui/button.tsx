import Link from "next/link";
import { LoaderCircle } from "lucide-react";
import type { ComponentProps } from "react";
import { cn } from "@/lib/utils/cn";

type Variant = "primary" | "secondary" | "ghost";
const variants: Record<Variant, string> = {
  primary: "bg-brand text-white hover:bg-brand-dark border-transparent shadow-xs",
  secondary: "border-line bg-surface text-ink hover:bg-canvas",
  ghost: "border-transparent text-ink hover:bg-brand-soft",
};

function buttonClass(variant: Variant, className?: string) {
  return cn("inline-flex min-h-11 shrink-0 items-center justify-center gap-2 rounded-xl border px-5 py-3 text-sm font-semibold transition-colors disabled:pointer-events-none disabled:opacity-50", variants[variant], className);
}

export function Button({ variant = "primary", loading = false, disabled, children, className, type = "button", ...props }: ComponentProps<"button"> & { variant?: Variant; loading?: boolean }) {
  return <button {...props} type={type} disabled={disabled || loading} aria-busy={loading || undefined} className={buttonClass(variant, className)}>
    {loading && <LoaderCircle className="size-4 animate-spin" aria-hidden="true" />}{children}
  </button>;
}

export function ButtonLink({ variant = "primary", className, ...props }: ComponentProps<typeof Link> & { variant?: Variant }) {
  return <Link {...props} className={buttonClass(variant, className)} />;
}
