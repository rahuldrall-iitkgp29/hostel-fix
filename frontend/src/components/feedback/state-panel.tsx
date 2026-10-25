import { CircleAlert, Inbox, LockKeyhole } from 'lucide-react';
import type { ReactNode } from 'react';
import { Card } from '@/components/ui/card';

const icons = { empty: Inbox, error: CircleAlert, unavailable: LockKeyhole };

export function StatePanel({
  title,
  children,
  action,
  kind = 'empty',
}: {
  title: string;
  children: ReactNode;
  action?: ReactNode;
  kind?: keyof typeof icons;
}) {
  const Icon = icons[kind];
  return (
    <Card
      className="flex flex-col items-center gap-4 px-6 py-10 text-center"
      role={kind === 'error' ? 'alert' : undefined}
    >
      <span className="flex size-12 items-center justify-center rounded-2xl bg-brand-soft text-brand">
        <Icon className="size-5" aria-hidden="true" />
      </span>
      <div className="space-y-2">
        <h2 className="text-lg font-semibold tracking-tight">{title}</h2>
        <div className="mx-auto max-w-md text-sm leading-6 text-muted">
          {children}
        </div>
      </div>
      {action && <div className="mt-2">{action}</div>}
    </Card>
  );
}
