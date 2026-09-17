import React from 'react';
import { Button } from './Button';

export interface PaginationProps {
  page: number;
  totalPages: number;
  onPageChange: (page: number) => void;
  isLoading?: boolean;
}

export const Pagination: React.FC<PaginationProps> = ({
  page,
  totalPages,
  onPageChange,
  isLoading = false,
}) => {
  if (totalPages <= 1) return null;

  return (
    <div style={{ display: 'flex', alignItems: 'center', justifyContent: 'center', gap: '1rem', marginTop: '1.25rem' }}>
      <Button
        variant="secondary"
        size="sm"
        disabled={page <= 1 || isLoading}
        onClick={() => onPageChange(page - 1)}
      >
        ← Precedente
      </Button>
      <span style={{ fontSize: '0.9rem', color: 'var(--color-text-muted)' }}>
        Pagina <strong>{page}</strong> di <strong>{totalPages}</strong>
      </span>
      <Button
        variant="secondary"
        size="sm"
        disabled={page >= totalPages || isLoading}
        onClick={() => onPageChange(page + 1)}
      >
        Successiva →
      </Button>
    </div>
  );
};
