import { useState, useRef, useEffect } from 'react'
import { BookOpen, MoreVertical, Download, Send, Loader2 } from 'lucide-react'
import { useQuery, useMutation } from '@tanstack/react-query'
import { Book, EmailAddress } from '../types'
import * as api from '../api/client'
import { useToast } from '../App'

interface BookCardProps {
  book: Book
  onClick: () => void
}

export default function BookCard({ book, onClick }: BookCardProps) {
  const [imgError, setImgError] = useState(false)
  const [menuOpen, setMenuOpen] = useState(false)
  const [emailMenuOpen, setEmailMenuOpen] = useState(false)
  const menuRef = useRef<HTMLDivElement>(null)
  const { addToast } = useToast()

  const coverUrl = book.cover_filename && !imgError
    ? `/api/books/${book.id}/cover`
    : null

  const { data: emailAddresses = [] } = useQuery<EmailAddress[]>({
    queryKey: ['emailAddresses'],
    queryFn: () => api.getEmailAddresses(),
    staleTime: 5 * 60 * 1000,
  })

  const sendMutation = useMutation({
    mutationFn: (recipient: string) => api.sendBook(book.id, recipient),
    onSuccess: () => { setMenuOpen(false); setEmailMenuOpen(false); addToast('success', 'Book sent!') },
    onError: (e: Error) => addToast('error', e.message),
  })

  // Close menus on outside click
  useEffect(() => {
    if (!menuOpen) return
    const handleClick = (e: MouseEvent) => {
      if (menuRef.current && !menuRef.current.contains(e.target as Node)) {
        setMenuOpen(false)
        setEmailMenuOpen(false)
      }
    }
    document.addEventListener('mousedown', handleClick)
    return () => document.removeEventListener('mousedown', handleClick)
  }, [menuOpen])

  const seriesBadge = book.series_order != null ? `#${book.series_order}` : null

  return (
    <div
      role="button"
      tabIndex={0}
      onClick={onClick}
      onKeyDown={e => e.key === 'Enter' && onClick()}
      className={[
        'group relative flex flex-col w-full text-left',
        'rounded-lg overflow-visible',
        'bg-surface-card border border-line',
        'hover:border-line-strong hover:shadow-lg hover:shadow-black/40',
        'hover:scale-[1.02] active:scale-[0.98]',
        'transition-all duration-200 ease-out',
        'focus-visible:outline-none focus-visible:ring-2 focus-visible:ring-accent',
        'cursor-pointer min-w-0',
      ].join(' ')}
      aria-label={`Open ${book.title ?? book.filename}`}
    >
      {/* Cover — 2:3 aspect ratio */}
      <div className="relative w-full rounded-t-lg overflow-hidden" style={{ paddingBottom: '150%' }}>
        <div className="absolute inset-0">
          {coverUrl ? (
            <img
              src={coverUrl}
              alt={book.title ?? book.filename}
              onError={() => setImgError(true)}
              className="w-full h-full object-cover"
              loading="lazy"
              draggable={false}
            />
          ) : (
            <div className="w-full h-full flex flex-col items-center justify-center bg-surface-raised gap-2">
              <BookOpen size={32} className="text-ink-faint" />
            </div>
          )}

          {/* Gradient overlay */}
          <div className="absolute inset-0 bg-gradient-to-t from-black/30 via-transparent to-transparent opacity-0 group-hover:opacity-100 transition-opacity duration-200" />
        </div>

        {/* Series number badge (replaces format badge) */}
        {seriesBadge && (
          <span
            className={[
              'absolute top-2 right-2 z-10',
              'px-1.5 py-0.5 rounded text-[10px] font-semibold',
              'bg-black/60 text-white backdrop-blur-sm',
              'border border-white/10',
            ].join(' ')}
          >
            {seriesBadge}
          </span>
        )}

        {/* Three-dot menu */}
        <div
          ref={menuRef}
          className="absolute top-1 left-1 z-20"
          onClick={e => e.stopPropagation()}
          onKeyDown={e => e.stopPropagation()}
        >
          <button
            type="button"
            onClick={e => { e.stopPropagation(); setMenuOpen(v => !v); setEmailMenuOpen(false) }}
            className="w-6 h-6 flex items-center justify-center rounded bg-black/60 text-white opacity-0 group-hover:opacity-100 focus:opacity-100 hover:bg-black/80 transition-opacity"
            aria-label="Book actions"
          >
            <MoreVertical size={12} />
          </button>

          {menuOpen && (
            <div className="absolute left-0 top-full mt-0.5 w-44 bg-surface-raised border border-line rounded-lg shadow-xl py-1 z-50">
              {/* Download */}
              <a
                href={api.getDownloadUrl(book.id)}
                download
                onClick={() => setMenuOpen(false)}
                className="flex items-center gap-2 px-3 py-2 text-sm text-ink hover:bg-surface-high transition-colors"
              >
                <Download size={14} className="text-ink-muted" />
                Download
              </a>

              {/* Send */}
              {emailAddresses.length > 0 && (
                <button
                  type="button"
                  onClick={() => setEmailMenuOpen(v => !v)}
                  disabled={sendMutation.isPending}
                  className="flex items-center gap-2 w-full px-3 py-2 text-sm text-ink hover:bg-surface-high transition-colors disabled:opacity-50"
                >
                  {sendMutation.isPending
                    ? <Loader2 size={14} className="text-ink-muted animate-spin" />
                    : <Send size={14} className="text-ink-muted" />}
                  Send to…
                </button>
              )}

              {emailMenuOpen && emailAddresses.map(addr => (
                <button
                  key={addr.id}
                  type="button"
                  onClick={() => sendMutation.mutate(addr.email)}
                  className="flex flex-col w-full px-5 py-1.5 text-left hover:bg-surface-high transition-colors"
                >
                  <span className="text-xs text-ink truncate">{addr.label || addr.email}</span>
                  {addr.label && <span className="text-[10px] text-ink-muted truncate">{addr.email}</span>}
                </button>
              ))}
            </div>
          )}
        </div>
      </div>

      {/* Text below cover */}
      <div className="px-2.5 py-2 flex flex-col gap-0.5 min-w-0">
        <p
          className="text-ink text-sm font-medium leading-snug line-clamp-2 min-h-[2.5em]"
          title={book.title ?? book.filename}
        >
          {book.title ?? book.filename}
        </p>
        {book.author && (
          <p
            className="text-ink-muted text-xs leading-snug truncate"
            title={book.author}
          >
            {book.author}
          </p>
        )}
      </div>
    </div>
  )
}
