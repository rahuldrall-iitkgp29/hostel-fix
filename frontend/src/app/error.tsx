"use client";

import { useEffect } from "react";
import { Container } from "@/components/layout/container";
import { StatePanel } from "@/components/feedback/state-panel";
import { Button, ButtonLink } from "@/components/ui/button";

export default function ErrorPage({ reset }: { error: Error & { digest?: string }; reset: () => void }) {
  useEffect(() => { document.getElementById("main-content")?.focus(); }, []);
  return <main id="main-content" tabIndex={-1} className="py-20"><Container className="max-w-xl"><StatePanel kind="error" title="We couldn’t load this page" action={<div className="flex flex-wrap justify-center gap-3"><Button onClick={reset}>Try again</Button><ButtonLink href="/" variant="secondary">Back to home</ButtonLink></div>}><p>Something interrupted the request. Try again, or return to the home page.</p></StatePanel></Container></main>;
}
