import { useState, useRef, useCallback } from 'react'
import { useQuery } from '@tanstack/react-query'
import { Upload, X, CheckCircle, AlertCircle, FileText, Tag as TagIcon } from 'lucide-react'
import * as api from '../api/client'
import type { Tag } from '../types'
import Dialog from '../components/Dialog'

interface FileItem {
  id: string
  file: File
  status: 'pending' | 'uploading' | 'done' | 'error'
  progress: number
  error?: string
  bookId?: number
}

interface Props {
  onClose: () => void
}

const ALLOWED = new Set(['epub', 'pdf', 'mobi', 'azw', 'azw3', 'fb2', 'djvu', 'cbz', 'cbr', 'txt'])

function ext(name: string) {
  return name.split('.').pop()?.toLowerCase() ?? ''
}

export default function UploadPage({ onClose }: Props) {
  const [items, setItems] = useState<FileItem[]>([])
  const [dragging, setDragging] = useState(false)
  const [selectedTags, setSelectedTags] = useState<string[]>([])
  const inputRef = useRef<HTMLInputElement>(null)

  const { data: allTags = [] } = useQuery<Tag[]>({ queryKey: ['tags'], queryFn: api.getTags })

  function addFiles(files: File[]) {
    const valid = files.filter(f => ALLOWED.has(ext(f.name)))
    if (!valid.length) return
    setItems(prev => [
      ...prev,
      ...valid.map(f => ({ id: Math.random().toString(36).slice(2), file: f, status: 'pending' as const, progress: 0 })),
    ])
  }

  const handleDrop = useCallback((e: React.DragEvent) => {
    e.preventDefault(); setDragging(false)
    addFiles(Array.from(e.dataTransfer.files))
  }, [])

  function toggleTag(name: string) {
    setSelectedTags(prev => prev.includes(name) ? prev.filter(t => t !== name) : [...prev, name])
  }

  async function uploadAll() {
    const pending = items.filter(i => i.status === 'pending' || i.status === 'error')
    for (const item of pending) {
      setItems(prev => prev.map(i => i.id === item.id ? { ...i, status: 'uploading', progress: 0, error: undefined } : i))
      try {
        const book = await api.uploadFile(item.file, progress => {
          setItems(prev => prev.map(i => i.id === item.id ? { ...i, progress } : i))
        })
        if (selectedTags.length > 0 && book?.id) {
          await Promise.all(selectedTags.map(tag => api.addBookTag(book.id, tag).catch(() => {})))
        }
        setItems(prev => prev.map(i => i.id === item.id ? { ...i, status: 'done', progress: 100, bookId: book?.id } : i))
      } catch (err) {
        setItems(prev => prev.map(i => i.id === item.id ? { ...i, status: 'error', error: (err as Error).message } : i))
      }
    }
  }

  const pendingCount = items.filter(i => i.status === 'pending' || i.status === 'error').length
  const doneCount = items.filter(i => i.status === 'done').length

  const footer = items.length > 0 ? (
    <div className="flex items-center justify-between">
      <button onClick={() => setItems([])} className="btn-ghost text-sm">Clear all</button>
      <div className="flex items-center gap-3">
        {doneCount > 0 && <span className="text-sm text-success">{doneCount} uploaded</span>}
        <button
          className="btn-primary"
          onClick={uploadAll}
          disabled={pendingCount === 0 || items.some(i => i.status === 'uploading')}
        >
          <Upload className="w-4 h-4" />
          Upload {pendingCount > 0 ? `${pendingCount} file${pendingCount > 1 ? 's' : ''}` : ''}
        </button>
      </div>
    </div>
  ) : undefined

  return (
    <Dialog open onClose={onClose} title="Upload Books" footer={footer}>
      <div className="p-4 space-y-4">
        {/* Drop zone */}
        <div
          onDragOver={e => { e.preventDefault(); setDragging(true) }}
          onDragLeave={() => setDragging(false)}
          onDrop={handleDrop}
          onClick={() => inputRef.current?.click()}
          className={`border-2 border-dashed rounded-xl flex flex-col items-center justify-center gap-3 py-12 cursor-pointer transition-colors select-none
            ${dragging ? 'border-accent bg-accent/5' : 'border-line hover:border-line-strong hover:bg-surface-raised'}`}
        >
          <Upload className={`w-8 h-8 ${dragging ? 'text-accent' : 'text-ink-muted'}`} />
          <div className="text-center">
            <p className="text-sm font-medium text-ink">Drop files here or click to browse</p>
            <p className="text-xs text-ink-muted mt-1">EPUB, PDF, MOBI, AZW3, FB2, DJVU, CBZ, CBR, TXT · max 35 MB</p>
          </div>
          <input
            ref={inputRef} type="file" multiple
            accept={[...ALLOWED].map(e => `.${e}`).join(',')}
            className="hidden"
            onChange={e => addFiles(Array.from(e.target.files ?? []))}
            onClick={e => e.stopPropagation()}
          />
        </div>

        {/* Tag selector */}
        {allTags.length > 0 && (
          <div className="card p-3 space-y-2">
            <p className="text-xs font-medium text-ink-muted flex items-center gap-1.5">
              <TagIcon className="w-3.5 h-3.5" />
              Apply tags at import
            </p>
            <div className="flex flex-wrap gap-2">
              {allTags.map(t => (
                <button
                  key={t.id}
                  type="button"
                  onClick={() => toggleTag(t.name)}
                  className={[
                    'px-2.5 py-1 rounded-full text-xs font-medium transition-colors',
                    selectedTags.includes(t.name)
                      ? 'bg-accent text-white'
                      : 'bg-surface-raised text-ink-muted hover:text-ink border border-line',
                  ].join(' ')}
                >
                  {t.name}
                </button>
              ))}
            </div>
            {selectedTags.length > 0 && (
              <button onClick={() => setSelectedTags([])} className="text-xs text-ink-faint hover:text-ink-muted transition-colors">
                Clear selection
              </button>
            )}
          </div>
        )}

        {/* Queue */}
        {items.length > 0 && (
          <div className="space-y-2">
            {items.map(item => (
              <div key={item.id} className="card flex items-center gap-3 px-4 py-3">
                <FileText className="w-4 h-4 text-ink-muted shrink-0" />
                <div className="flex-1 min-w-0">
                  <p className="text-sm text-ink truncate">{item.file.name}</p>
                  <p className="text-xs text-ink-muted">{(item.file.size / 1024 / 1024).toFixed(1)} MB</p>
                  {item.status === 'uploading' && (
                    <div className="mt-1.5 space-y-1">
                      <div className="h-1 bg-surface-raised rounded-full overflow-hidden">
                        <div className="h-full bg-accent rounded-full transition-all duration-200" style={{ width: `${item.progress}%` }} />
                      </div>
                      {item.progress >= 100 && (
                        <p className="text-xs text-ink-muted">Processing — this may take a moment…</p>
                      )}
                    </div>
                  )}
                  {item.status === 'error' && <p className="text-xs text-danger mt-0.5">{item.error}</p>}
                </div>
                {item.status === 'done' && <CheckCircle className="w-4 h-4 text-success shrink-0" />}
                {item.status === 'error' && <AlertCircle className="w-4 h-4 text-danger shrink-0" />}
                {(item.status === 'pending' || item.status === 'error') && (
                  <button onClick={() => setItems(prev => prev.filter(i => i.id !== item.id))} className="text-ink-muted hover:text-danger transition-colors shrink-0">
                    <X className="w-4 h-4" />
                  </button>
                )}
              </div>
            ))}
          </div>
        )}
      </div>
    </Dialog>
  )
}
