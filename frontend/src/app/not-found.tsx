import { ArrowLeft } from "lucide-react";
import { Brand } from "@/components/layout/brand";
import { Container } from "@/components/layout/container";
import { ButtonLink } from "@/components/ui/button";

export default function NotFound() {
  return <Container className="py-8"><Brand /><main id="main-content" className="mx-auto max-w-lg py-24 text-center"><p className="eyebrow">404 / A wrong turn</p><h1 className="mt-5 text-4xl font-semibold tracking-tight">This room isn’t on the map.</h1><p className="mt-5 text-base leading-7 text-muted">We couldn’t find that page. Head back to HostelFix and we’ll help you find your way.</p><ButtonLink href="/" className="mt-8"><ArrowLeft className="size-4" aria-hidden="true" /> Back to home</ButtonLink></main></Container>;
}
