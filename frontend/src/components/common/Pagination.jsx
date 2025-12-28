/**
 * Pagination Component
 *
 * Shared pagination controls for list views:
 * - Previous/Next buttons
 * - Page info display
 * - Configurable styling
 */

import { memo } from 'react';

const paginationStyles = `
  .pagination {
    display: flex;
    justify-content: center;
    align-items: center;
    gap: 1rem;
    padding: 1rem;
  }

  .pagination-btn {
    background: #6b7280;
    color: white;
    border: none;
    padding: 0.5rem 1rem;
    border-radius: 6px;
    font-size: 0.875rem;
    cursor: pointer;
    transition: background 0.2s;
  }

  .pagination-btn:hover:not(:disabled) {
    background: #4b5563;
  }

  .pagination-btn:disabled {
    background: #d1d5db;
    cursor: not-allowed;
  }

  .pagination-info {
    color: #666;
    font-size: 0.875rem;
  }
`;

const Pagination = memo(function Pagination({
  page,
  pages,
  total,
  onPageChange,
  showTotal = true,
}) {
  const handlePrevious = () => {
    if (page > 1) {
      onPageChange(page - 1);
    }
  };

  const handleNext = () => {
    if (page < pages) {
      onPageChange(page + 1);
    }
  };

  // Don't render if only one page or no pages
  if (pages <= 1) {
    return null;
  }

  return (
    <div className="pagination">
      <style>{paginationStyles}</style>
      <button
        onClick={handlePrevious}
        disabled={page === 1}
        className="pagination-btn"
        aria-label="Previous page"
      >
        Previous
      </button>
      <span className="pagination-info">
        Page {page} of {pages}
        {showTotal && total > 0 && ` (${total} total)`}
      </span>
      <button
        onClick={handleNext}
        disabled={page >= pages}
        className="pagination-btn"
        aria-label="Next page"
      >
        Next
      </button>
    </div>
  );
});

export default Pagination;
