import type { ComponentProps } from 'react';
import { ChevronDown } from 'lucide-react';
import { cn } from '@/lib/utils/cn';

export type SelectOption = {
  value: string;
  label: string;
  disabled?: boolean;
};

type SelectFieldProps = Omit<ComponentProps<'select'>, 'children'> & {
  id: string;
  label: string;
  hint?: string;
  error?: string;
  options?: SelectOption[];
  placeholder?: string;
  children?: React.ReactNode;
};

export function SelectField({
  id,
  label,
  hint,
  error,
  options,
  placeholder,
  className,
  'aria-describedby': describedBy,
  children,
  ...props
}: SelectFieldProps) {
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
      <div className="relative">
        <select
          {...props}
          id={id}
          aria-invalid={error ? true : props['aria-invalid']}
          aria-describedby={description || undefined}
          className={cn(
            'min-h-11 w-full appearance-none rounded-xl border bg-surface px-3.5 py-3 pr-10 text-base text-ink disabled:cursor-not-allowed disabled:bg-canvas disabled:text-muted',
            error ? 'border-danger' : 'border-line',
            className
          )}
        >
          {placeholder && (
            <option value="" disabled>
              {placeholder}
            </option>
          )}
          {options
            ? options.map((opt) => (
                <option
                  key={opt.value}
                  value={opt.value}
                  disabled={opt.disabled}
                >
                  {opt.label}
                </option>
              ))
            : children}
        </select>
        <span
          className="pointer-events-none absolute inset-y-0 right-3 flex items-center text-muted"
          aria-hidden="true"
        >
          <ChevronDown className="size-4" />
        </span>
      </div>
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
