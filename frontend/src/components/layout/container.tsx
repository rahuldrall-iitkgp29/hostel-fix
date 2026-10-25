import type { ComponentProps, ReactNode } from 'react';
import { cn } from '@/lib/utils/cn';

export function Container({ className, ...props }: ComponentProps<'div'>) {
  return (
    <div
      {...props}
      className={cn(
        'mx-auto w-full max-w-7xl px-5 sm:px-8 lg:px-12',
        className
      )}
    />
  );
}

export function PageHeading({
  eyebrow,
  title,
  children,
}: {
  eyebrow?: string;
  title: string;
  children?: ReactNode;
}) {
  return (
    <div className="space-y-4">
      {eyebrow && <p className="eyebrow">{eyebrow}</p>}
      <h1 className="text-4xl leading-[1.12] font-semibold tracking-[-0.045em] sm:text-5xl">
        {title}
      </h1>
      {children && (
        <div className="max-w-lg text-base leading-7 text-muted">
          {children}
        </div>
      )}
    </div>
  );
}
