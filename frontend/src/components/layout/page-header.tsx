import type { ReactNode } from 'react';
import { Breadcrumbs, type BreadcrumbItem } from './breadcrumbs';
import { cn } from '@/lib/utils/cn';

export type PageHeaderProps = {
  eyebrow?: string;
  title: string;
  description?: ReactNode;
  breadcrumbs?: BreadcrumbItem[];
  actions?: ReactNode;
  badge?: ReactNode;
  className?: string;
};

export function PageHeader({
  eyebrow,
  title,
  description,
  breadcrumbs,
  actions,
  badge,
  className,
}: PageHeaderProps) {
  return (
    <header className={cn('space-y-4 pb-6 pt-2 sm:pb-8', className)}>
      {breadcrumbs && <Breadcrumbs items={breadcrumbs} className="mb-2" />}
      <div className="flex flex-col gap-4 sm:flex-row sm:items-center sm:justify-between">
        <div className="space-y-1">
          {eyebrow && <p className="eyebrow">{eyebrow}</p>}
          <div className="flex flex-wrap items-center gap-3">
            <h1 className="text-2xl font-bold tracking-tight text-ink sm:text-3xl">
              {title}
            </h1>
            {badge}
          </div>
          {description && (
            <div className="text-sm text-muted sm:text-base">{description}</div>
          )}
        </div>
        {actions && (
          <div className="flex flex-wrap items-center gap-3 pt-2 sm:pt-0">
            {actions}
          </div>
        )}
      </div>
    </header>
  );
}
