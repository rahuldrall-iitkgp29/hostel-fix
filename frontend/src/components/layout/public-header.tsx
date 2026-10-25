import Link from 'next/link';
import { ArrowUpRight } from 'lucide-react';
import { Brand } from '@/components/layout/brand';
import { Container } from '@/components/layout/container';
import { MobileNavigation } from '@/components/layout/mobile-navigation';
import { ButtonLink } from '@/components/ui/button';
import { publicNavigation } from '@/config/navigation';

export function PublicHeader() {
  return (
    <header className="relative z-30 border-b border-line/70 bg-canvas">
      <Container className="flex h-20 items-center justify-between gap-6">
        <Brand />
        <nav
          aria-label="Main navigation"
          className="hidden items-center gap-7 md:flex"
        >
          {publicNavigation.map((item) => (
            <Link
              key={item.href}
              href={item.href}
              className="flex min-h-11 items-center text-sm font-medium text-muted hover:text-brand"
            >
              {item.label}
            </Link>
          ))}
        </nav>
        <div className="hidden items-center gap-2 md:flex">
          <ButtonLink href="/login" variant="ghost">
            Sign in
          </ButtonLink>
          <ButtonLink href="/register">
            Get started <ArrowUpRight className="size-4" aria-hidden="true" />
          </ButtonLink>
        </div>
        <MobileNavigation />
      </Container>
    </header>
  );
}
