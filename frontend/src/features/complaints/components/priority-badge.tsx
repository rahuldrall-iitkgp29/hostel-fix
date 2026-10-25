import { cn } from '@/lib/utils/cn';
import type { Priority } from '../types';

const priorityStyles: Record<
  Priority,
  { label: string; dot: string; text: string }
> = {
  LOW: { label: 'Low', dot: 'bg-muted', text: 'text-muted' },
  MEDIUM: { label: 'Medium', dot: 'bg-brand', text: 'text-brand' },
  HIGH: { label: 'High', dot: 'bg-warning', text: 'text-warning' },
  CRITICAL: {
    label: 'Critical',
    dot: 'bg-danger',
    text: 'text-danger font-semibold',
  },
};

export function PriorityBadge({
  priority,
  className,
}: {
  priority: Priority;
  className?: string;
}) {
  const config = priorityStyles[priority] || priorityStyles.MEDIUM;
  return (
    <span
      className={cn(
        'inline-flex items-center gap-1.5 text-xs font-medium',
        config.text,
        className
      )}
    >
      <span
        className={cn('size-2 rounded-full', config.dot)}
        aria-hidden="true"
      />
      {config.label}
    </span>
  );
}
