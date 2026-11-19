import { Button } from './button';
export function PaginationControls({
  label,
  page,
  totalPages,
  onPage,
  disabled = false,
}: {
  label: string;
  page: number;
  totalPages: number;
  onPage: (page: number) => void;
  disabled?: boolean;
}) {
  if (totalPages <= 1) return null;
  return (
    <nav
      aria-label={`${label} pagination`}
      className="flex items-center justify-between gap-2 text-xs"
    >
      <Button
        type="button"
        variant="secondary"
        disabled={disabled || page <= 1}
        onClick={() => onPage(page - 1)}
      >
        Previous
      </Button>
      <span>
        Page {page} of {totalPages}
      </span>
      <Button
        type="button"
        variant="secondary"
        disabled={disabled || page >= totalPages}
        onClick={() => onPage(page + 1)}
      >
        Next
      </Button>
    </nav>
  );
}
