import { useState, useRef, useEffect } from 'react'
import { useQueryClient, useMutation } from '@tanstack/react-query'
import { Search, Upload, Link, X, Check } from 'lucide-react'
import * as api from '../api/client'
import type { Book } from '../types'
import Dialog from './Dialog'
import Spinner from './Spinner'
import { useToast } from '../App'

interface Props {
  bookId: number
  bookTitle?: string
  bookAuthor?: string
  fileFormat?: string
  onClose: () => void
}

interface CoverResult {
  title: string
  cover_url: string
  source: string
}

const SOURCE_LABELS: Record<string, string> = {
  google_books: 'Google',
  open_library: 'OpenLib',
  goodreads: 'Goodreads',
  itunes: 'iTunes',
}

export default function CoverDialog({ bookId, bookTitle, bookAuthor, fileFormat, onClose }: Props) {
  const qc = useQueryClient()
  const { addToast } = useToast()
  const fileInputRef = useRef<HTMLInputElement>(null)

  const [searchQuery, setSearchQuery] = useState([bookTitle, bookAuthor].filter(Boolean).join(' '))
  const [coverResults, setCoverResults] = useState<CoverResult[]>([])
  const [searching, setSearching] = useState(false)
  const [selectedUrl, setSelectedUrl] = useState<string | null>(null)
  const [manualUrl, setManualUrl] = useState('')
  const [previewUrl, setPreviewUrl] = useState<string | null>(null)
  const [previewFile, setPreviewFile] = useState<File | null>(null)
  const [previewMode, setPreviewMode] = useState<'search' | 'url' | 'file' | null>(null)

  // Auto-search on mount when there's a query
  useEffect(() => {
    if (searchQuery.trim()) searchCovers()
  }, [])  // eslint-disable-line react-hooks/exhaustive-deps

  const uploadMutation = useMutation({
    mutationFn: async () => {
      if (previewFile) {
        const formData = new FormData()
        formData.append('cover', previewFile)
        const res = await fetch(`/api/books/${bookId}/cover`, {
          method: 'POST', credentials: 'include', body: formData,
        })
        if (!res.ok) {
          const body = await res.json().catch(() => ({}))
          throw new Error(body?.error ?? `Upload failed (HTTP ${res.status})`)
        }
        return res.json() as Promise<Book>
      } else {
        const url = selectedUrl || manualUrl.trim()
        if (!url) throw new Error('No cover selected')
        return api.setCoverFromUrl(bookId, url)
      }
    },
    onSuccess: async (book) => {
      if (fileFormat?.toLowerCase() === 'epub') {
        try { await api.embedCover(bookId); addToast('success', 'Cover saved and embedded in EPUB') }
        catch { addToast('success', 'Cover saved (embed failed)') }
      } else {
        addToast('success', 'Cover saved')
      }
      qc.setQueryData(['book', bookId], book)
      qc.invalidateQueries({ queryKey: ['books'] })
      onClose()
    },
    onError: (e: Error) => addToast('error', e.message),
  })

  async function searchCovers() {
    const q = searchQuery.trim()
    if (!q) return
    setSearching(true)
    setCoverResults([])
    try {
      const results = await fetch(`/api/metadata/search?q=${encodeURIComponent(q)}`, { credentials: 'include' })
        .then(r => r.json()) as CoverResult[]
      setCoverResults(Array.isArray(results) ? results.filter(r => r.cover_url) : [])
    } catch {
      addToast('error', 'Search failed')
    } finally {
      setSearching(false)
    }
  }

  function selectSearchResult(url: string) {
    setSelectedUrl(url); setPreviewUrl(url); setPreviewFile(null); setManualUrl(''); setPreviewMode('search')
  }

  function applyManualUrl() {
    const url = manualUrl.trim()
    if (!url) return
    setSelectedUrl(url); setPreviewUrl(url); setPreviewFile(null); setPreviewMode('url')
  }

  function handleFileSelect(e: React.ChangeEvent<HTMLInputElement>) {
    const file = e.target.files?.[0]
    if (!file) return
    setPreviewFile(file); setPreviewUrl(URL.createObjectURL(file)); setSelectedUrl(null); setManualUrl(''); setPreviewMode('file')
    e.target.value = ''
  }

  function clearPreview() {
    setPreviewUrl(null); setPreviewFile(null); setSelectedUrl(null); setPreviewMode(null)
  }

  const canSave = previewMode !== null && (previewFile || selectedUrl || manualUrl.trim())

  const footer = (
    <div className="flex items-center justify-between gap-3">
      <button type="button" onClick={onClose} className="px-3 py-2 rounded text-sm font-medium text-ink border border-line hover:bg-surface-raised transition-colors">
        Cancel
      </button>
      <button
        type="button"
        onClick={() => uploadMutation.mutate()}
        disabled={!canSave || uploadMutation.isPending}
        className="flex items-center gap-1.5 px-4 py-2 rounded text-sm font-medium bg-accent hover:bg-accent-hover text-white transition-colors disabled:opacity-50"
      >
        {uploadMutation.isPending ? <Spinner size={14} className="text-white" /> : <Check size={14} />}
        Set Cover
      </button>
    </div>
  )

  return (
    <Dialog open onClose={onClose} title="Change Cover" footer={footer} wide>
      <div className="p-4 space-y-3">
        {/* Search bar */}
        <div className="flex gap-2">
          <input
            className="field flex-1"
            value={searchQuery}
            onChange={e => setSearchQuery(e.target.value)}
            onKeyDown={e => e.key === 'Enter' && searchCovers()}
            placeholder="Search for covers…"
          />
          <button
            type="button"
            onClick={searchCovers}
            disabled={searching || !searchQuery.trim()}
            className="flex items-center gap-1.5 px-3 py-2 rounded text-sm font-medium border border-line hover:bg-surface-raised transition-colors disabled:opacity-50 shrink-0"
          >
            {searching ? <Spinner size={14} /> : <Search size={14} />}
            Search
          </button>
        </div>

        {/* Results grid */}
        {searching && (
          <div className="flex justify-center py-8"><Spinner size={24} /></div>
        )}
        {!searching && coverResults.length > 0 && (
          <div className="grid grid-cols-4 sm:grid-cols-6 gap-2 max-h-72 overflow-y-auto pr-1">
            {coverResults.map((r, i) => (
              <button
                key={i}
                type="button"
                onClick={() => selectSearchResult(r.cover_url)}
                className={[
                  'relative rounded-lg overflow-hidden border-2 transition-all',
                  selectedUrl === r.cover_url ? 'border-accent' : 'border-transparent hover:border-line',
                ].join(' ')}
                title={`${r.title} (${SOURCE_LABELS[r.source] ?? r.source})`}
              >
                <img
                  src={r.cover_url}
                  alt={r.title}
                  loading="lazy"
                  className="w-full aspect-[2/3] object-cover bg-surface-raised"
                  onError={e => (e.currentTarget.closest('button')!.style.display = 'none')}
                />
                <span className="absolute bottom-0 left-0 right-0 text-[8px] bg-black/60 text-white px-0.5 py-0.5 truncate text-center leading-tight">
                  {SOURCE_LABELS[r.source] ?? r.source}
                </span>
                {selectedUrl === r.cover_url && (
                  <span className="absolute top-1 right-1 w-4 h-4 rounded-full bg-accent flex items-center justify-center">
                    <Check size={10} className="text-white" />
                  </span>
                )}
              </button>
            ))}
          </div>
        )}
        {!searching && coverResults.length === 0 && searchQuery && (
          <p className="text-xs text-ink-muted text-center py-2">No covers found — try a different search</p>
        )}

        {/* Selected preview strip */}
        {previewUrl && (
          <div className="flex items-center gap-3 px-3 py-2 bg-surface-raised rounded-lg">
            <img src={previewUrl} alt="Selected" className="h-12 w-8 object-cover rounded shrink-0" />
            <p className="text-xs text-ink-muted flex-1 truncate">
              {previewMode === 'file' ? previewFile?.name : 'Cover selected'}
            </p>
            <button type="button" onClick={clearPreview} className="text-ink-muted hover:text-ink shrink-0">
              <X size={14} />
            </button>
          </div>
        )}

        {/* Compact bottom row: upload file + paste URL */}
        <div className="flex flex-wrap gap-2 pt-1 border-t border-line">
          <input ref={fileInputRef} type="file" accept="image/*" className="sr-only" onChange={handleFileSelect} />
          <button
            type="button"
            onClick={() => fileInputRef.current?.click()}
            className="flex items-center gap-1.5 px-3 py-1.5 rounded text-xs text-ink border border-line hover:bg-surface-raised transition-colors"
          >
            <Upload size={12} />
            Upload file
          </button>

          <div className="flex gap-1.5 flex-1 min-w-0">
            <input
              className="field flex-1 min-w-0 text-xs py-1.5"
              value={manualUrl}
              onChange={e => setManualUrl(e.target.value)}
              onKeyDown={e => e.key === 'Enter' && applyManualUrl()}
              placeholder="Paste image URL…"
              type="url"
            />
            <button
              type="button"
              onClick={applyManualUrl}
              disabled={!manualUrl.trim()}
              className="flex items-center gap-1 px-2.5 py-1.5 rounded text-xs font-medium border border-line hover:bg-surface-raised transition-colors disabled:opacity-50 shrink-0"
            >
              <Link size={12} />
              Use
            </button>
          </div>
        </div>
      </div>
    </Dialog>
  )
}
