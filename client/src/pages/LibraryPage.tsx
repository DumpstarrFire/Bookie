import { useEffect } from 'react'
import { useQuery } from '@tanstack/react-query'
import { Loader2, BookOpen, ChevronLeft, ChevronRight } from 'lucide-react'
import { useStore } from '../store'
import * as api from '../api/client'
import FilterBar from '../components/FilterBar'
import BookCard from '../components/BookCard'
import BookListItem from '../components/BookListItem'
import BookDialog from '../components/BookDialog'

const PER_PAGE_OPTIONS = [10, 25, 50, 100]

function getPageNumbers(current: number, total: number): (number | '…')[] {
  if (total <= 7) return Array.from({ length: total }, (_, i) => i + 1)
  const result: (number | '…')[] = [1]
  if (current > 3) result.push('…')
  for (let p = Math.max(2, current - 1); p <= Math.min(total - 1, current + 1); p++) {
    result.push(p)
  }
  if (current < total - 2) result.push('…')
  result.push(total)
  return result
}

export default function LibraryPage() {
  const { filters, page, setPage, perPage, setPerPage, viewMode, gridSize, selectedBookId, setSelectedBookId, setVisibleBookIds } = useStore()

  const queryKey = ['books', filters, page, perPage]
  const { data, isFetching, isError, error } = useQuery({
    queryKey,
    queryFn: () =>
      api.getBooks({
        page,
        per_page: perPage,
        q: filters.q || undefined,
        format: filters.format || undefined,
        tag: filters.tag || undefined,
        series: filters.series || undefined,
        sort: filters.sort,
        order: filters.order,
      }),
    placeholderData: prev => prev,
  })

  const books = data?.books ?? []
  const total = data?.total ?? 0
  const pages = data?.pages ?? 1

  useEffect(() => {
    setVisibleBookIds((data?.books ?? []).map(b => b.id))
  }, [data?.books, setVisibleBookIds])

  const pageNumbers = getPageNumbers(page, pages)

  return (
    <div>
      <FilterBar />

      <div className="px-4 py-4">
        {isFetching && books.length > 0 && (
          <div className="flex justify-center mb-3">
            <Loader2 className="w-5 h-5 text-accent animate-spin" />
          </div>
        )}

        {isError && (
          <div className="flex flex-col items-center justify-center py-20 text-ink-muted">
            <p className="text-sm">{(error as Error).message}</p>
          </div>
        )}

        {isFetching && books.length === 0 && (
          <div className="flex items-center justify-center py-20">
            <Loader2 className="w-8 h-8 text-accent animate-spin" />
          </div>
        )}

        {!isFetching && books.length === 0 && (
          <div className="flex flex-col items-center justify-center py-24 gap-4 text-ink-muted">
            <BookOpen className="w-16 h-16 opacity-30" />
            <p className="text-base font-medium">No books found</p>
            <p className="text-sm">
              {filters.q || filters.format || filters.tag || filters.series
                ? 'Try clearing your filters.'
                : 'Upload some books to get started.'}
            </p>
          </div>
        )}

        {viewMode === 'grid' && books.length > 0 && (
          <div
            className="grid gap-3"
            style={{ gridTemplateColumns: `repeat(auto-fill, minmax(${gridSize}px, 1fr))` }}
          >
            {books.map(book => (
              <BookCard key={book.id} book={book} onClick={() => setSelectedBookId(book.id)} />
            ))}
          </div>
        )}

        {viewMode === 'list' && books.length > 0 && (
          <div className="space-y-1">
            {books.map(book => (
              <BookListItem key={book.id} book={book} onClick={() => setSelectedBookId(book.id)} />
            ))}
          </div>
        )}

        {/* Bottom controls: pagination + per-page */}
        {books.length > 0 && (
          <div className="flex flex-col items-center gap-3 mt-6 pb-6">

            {/* Page navigation */}
            {pages > 1 && (
              <div className="flex items-center gap-1">
                <button
                  className="btn-outline !px-2 !py-1.5 disabled:opacity-40"
                  onClick={() => setPage(page - 1)}
                  disabled={page <= 1}
                  aria-label="Previous page"
                >
                  <ChevronLeft size={14} />
                </button>

                {pageNumbers.map((p, i) =>
                  p === '…' ? (
                    <span key={`ellipsis-${i}`} className="px-1 text-ink-faint text-sm select-none">…</span>
                  ) : (
                    <button
                      key={p}
                      onClick={() => setPage(p as number)}
                      className={[
                        'min-w-[2rem] px-2 py-1.5 rounded text-sm transition-colors focus-visible:outline-none focus-visible:ring-2 focus-visible:ring-accent',
                        page === p
                          ? 'bg-accent text-white font-medium'
                          : 'border border-line text-ink-muted hover:border-line-strong hover:text-ink',
                      ].join(' ')}
                    >
                      {p}
                    </button>
                  )
                )}

                <button
                  className="btn-outline !px-2 !py-1.5 disabled:opacity-40"
                  onClick={() => setPage(page + 1)}
                  disabled={page >= pages}
                  aria-label="Next page"
                >
                  <ChevronRight size={14} />
                </button>
              </div>
            )}

            {/* Per-page selector + total count */}
            <div className="flex items-center gap-2 text-sm text-ink-muted">
              <span>Show</span>
              {PER_PAGE_OPTIONS.map(n => (
                <button
                  key={n}
                  onClick={() => setPerPage(n)}
                  className={[
                    'min-w-[2rem] px-2 py-1 rounded text-sm transition-colors focus-visible:outline-none focus-visible:ring-2 focus-visible:ring-accent',
                    perPage === n
                      ? 'bg-accent text-white font-medium'
                      : 'border border-line text-ink-muted hover:border-line-strong hover:text-ink',
                  ].join(' ')}
                >
                  {n}
                </button>
              ))}
              <span>per page</span>
              {total > 0 && <span className="text-ink-faint ml-1">· {total.toLocaleString()} total</span>}
            </div>

          </div>
        )}
      </div>

      {selectedBookId !== null && (
        <BookDialog
          bookId={selectedBookId}
          onClose={() => setSelectedBookId(null)}
          onDelete={() => setSelectedBookId(null)}
        />
      )}
    </div>
  )
}
