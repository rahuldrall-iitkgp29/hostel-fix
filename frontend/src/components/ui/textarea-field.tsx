import type { ComponentProps } from 'react';
import { cn } from '@/lib/utils/cn';

type TextareaFieldProps = ComponentProps<'textarea'> & {
  id: string;
  label: string;
  hint?: string;
  error?: string;
};

export function TextareaField({
  id,
  label,
  hint,
  error,
  className,
  rows = 4,
  'aria-describedby': describedBy,
  ...props
}: TextareaFieldProps) {
  const description = [
    describedBy,
    hint && `${id}-hint`,
    error && `${id}-error`,
  ]
    .filter(Boolean)
    .join(' ');

  return (
    <div className="space-y-2">
      <label htmlFor={id} className="block text-sm font-semibold text-ink">
        {label}
      </label>
      <textarea
        {...props}
        id={id}
        rows={rows}
        aria-invalid={error ? true : props['aria-invalid']}
        aria-describedby={description || undefined}
        className={cn(
          'w-full rounded-xl border bg-surface px-3.5 py-3 text-base text-ink placeholder:text-muted disabled:cursor-not-allowed disabled:bg-canvas disabled:text-muted',
          error ? 'border-danger' : 'border-line',
          className
        )}
      />
      {hint && (
        <p id={`${id}-hint`} className="text-sm text-muted">
          {hint}
        </p>
      )}
      {error && (
        <p id={`${id}-error`} className="text-sm text-danger">
          {error}
        </p>
      )}
    </div>
  );
}
