import Link from 'next/link';
import { Brand } from '@/components/layout/brand';
import { Container } from '@/components/layout/container';

export function PublicFooter() {
  return (
    <footer className="border-t border-line bg-canvas py-8">
      <Container className="flex flex-col items-start justify-between gap-5 sm:flex-row sm:items-center">
        <div>
          <Brand />
          <p className="mt-2 text-xs text-muted">
            A little care. A better place to live.
          </p>
        </div>
        <nav
          aria-label="Footer navigation"
          className="flex flex-wrap items-center gap-x-6 gap-y-2 text-sm text-muted"
        >
          <Link
            href="/#how-it-works"
            className="inline-flex min-h-11 items-center hover:text-brand"
          >
            How it works
          </Link>
          <Link
            href="/login"
            className="inline-flex min-h-11 items-center hover:text-brand"
          >
            Sign in
          </Link>
          <span className="text-xs">HostelFix · Campus maintenance</span>
        </nav>
      </Container>
    </footer>
  );
}
