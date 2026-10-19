"use client";

import { useRef, useState } from "react";
import Link from "next/link";
import { Menu, X } from "lucide-react";
import { Button } from "@/components/ui/button";
import { publicNavigation } from "@/config/navigation";

export function MobileNavigation() {
  const [open, setOpen] = useState(false);
  const trigger = useRef<HTMLButtonElement>(null);
  return <div className="md:hidden" onKeyDown={(event) => {
    if (event.key === "Escape" && open) { setOpen(false); trigger.current?.focus(); }
  }}>
    <Button ref={trigger} variant="ghost" className="min-w-11 px-3" aria-label={open ? "Close navigation" : "Open navigation"} aria-expanded={open} aria-controls="mobile-navigation" onClick={() => setOpen(!open)}>
      {open ? <X className="size-5" aria-hidden="true" /> : <Menu className="size-5" aria-hidden="true" />}
    </Button>
    <nav id="mobile-navigation" aria-label="Mobile navigation" hidden={!open} className="absolute inset-x-0 top-full border-b border-line bg-surface p-5 shadow-lg">
      <div className="mx-auto flex max-w-lg flex-col gap-1">
        {[...publicNavigation, { href: "/login", label: "Sign in" }, { href: "/register", label: "Create a student account" }].map((item) => <Link key={item.href} href={item.href} onClick={() => setOpen(false)} className="rounded-xl px-4 py-3 text-sm font-medium hover:bg-brand-soft">{item.label}</Link>)}
      </div>
    </nav>
  </div>;
}
