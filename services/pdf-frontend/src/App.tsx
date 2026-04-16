import { useState, useRef, useEffect, DragEvent } from 'react'
import { Document, Page, pdfjs } from 'react-pdf'
import 'react-pdf/dist/Page/TextLayer.css'
import 'react-pdf/dist/Page/AnnotationLayer.css'

pdfjs.GlobalWorkerOptions.workerSrc = new URL(
  'pdfjs-dist/build/pdf.worker.min.mjs',
  import.meta.url,
).toString()

const API_URL    = import.meta.env.VITE_API_URL        || 'http://localhost:8000'
const INGEST_URL = import.meta.env.VITE_PDF_INGEST_URL || 'http://localhost:8006'
const COLLECTION = 'docs'

const SPECTACULAR_QUERIES = [
  'photographing something in space that traps light forever',
  'teaching a computer to play games by trial and error',
  'how a virus spreads silently before anyone notices',
  'when climate change becomes impossible to reverse',
  'how machines learn to understand human language',
  'event horizon telescope',
  'Q-learning reward',
  'self-attention mechanism',
]

// ── Palette ───────────────────────────────────────────────────────────────────

const DOC_COLORS = ['#7c3aed', '#2563eb', '#0891b2', '#059669', '#d97706', '#dc2626', '#9333ea']

function docColor(filename: string): string {
  let h = 0
  for (const c of filename) h = (h * 31 + c.charCodeAt(0)) & 0xffffffff
  return DOC_COLORS[Math.abs(h) % DOC_COLORS.length]
}

function docInitials(filename: string): string {
  const base = filename.replace(/\.pdf$/i, '')
  const words = base.split(/[\s_\-\.]+/).filter(Boolean)
  return words.length >= 2
    ? (words[0][0] + words[1][0]).toUpperCase()
    : base.slice(0, 2).toUpperCase()
}

function docDisplayName(filename: string): string {
  return filename
    .replace(/\.pdf$/i, '')
    .split(/[-_]+/)
    .map(w => w.charAt(0).toUpperCase() + w.slice(1))
    .join(' ')
}

// ── Types ─────────────────────────────────────────────────────────────────────

interface Doc {
  filename: string
  fileUrl: string
  pages: number
  chunks: number
  addedAt: number
}

interface SearchResult {
  id: string
  score: number
  snippet?: string
  payload: Record<string, unknown>
}

interface SearchResponse {
  query: string
  semantic: SearchResult[]
  keyword: SearchResult[]
  hybrid: SearchResult[]
}

interface ViewerTarget {
  doc: Doc
  pageNumber: number
  result: SearchResult
  query: string
}

type SeedItemState = 'pending' | 'downloading' | 'ingesting' | 'done' | 'error'

interface SeedItem {
  id: string
  label: string
  state: SeedItemState
  filename?: string
  pages?: number
  chunks?: number
  error?: string
}

interface SeedStatus {
  state: 'idle' | 'running' | 'done' | 'error'
  items: SeedItem[]
  error: string | null
}

// ── App ───────────────────────────────────────────────────────────────────────

export default function App() {
  const [docs, setDocs]           = useState<Doc[]>([])
  const [query, setQuery]         = useState('')
  const [loading, setLoading]     = useState(false)
  const [response, setResponse]   = useState<SearchResponse | null>(null)
  const [viewer, setViewer]       = useState<ViewerTarget | null>(null)
  const [ingesting, setIngesting] = useState<string[]>([])
  const [dragOver, setDragOver]   = useState(false)
  const [seedStatus, setSeedStatus] = useState<SeedStatus | null>(null)
  const [seedError, setSeedError]   = useState<string | null>(null)
  const [resetting, setResetting]   = useState(false)
  const inputRef = useRef<HTMLInputElement>(null)

  async function refreshDocs() {
    try {
      const res  = await fetch(`${INGEST_URL}/documents`)
      const data = await res.json() as { documents: Array<{ filename: string; pages: number }> }
      const stored: Doc[] = data.documents.map(d => ({
        filename: d.filename,
        fileUrl:  `${INGEST_URL}/pdfs/${encodeURIComponent(d.filename)}`,
        pages:    d.pages,
        chunks:   0,
        addedAt:  0,
      }))
      setDocs(stored)
    } catch {
      // Service not ready yet — fine, user can still upload
    }
  }

  useEffect(() => { void refreshDocs() }, [])

  // ── Seed-demo ───────────────────────────────────────────────────────────────

  async function startSeedDemo() {
    setSeedError(null)
    setSeedStatus({ state: 'running', items: [], error: null })
    try {
      const res = await fetch(`${INGEST_URL}/seed-demo`, { method: 'POST' })
      if (res.status === 404) {
        setSeedStatus(null)
        setSeedError(
          'Your ingestion service does not have a /seed-demo endpoint.\n' +
          'The tutorial builds a minimal service — demo seeding is part of the\n' +
          'complete implementation in examples/pdf-ingestion/main.py.',
        )
        return
      }
      if (!res.ok) {
        const text = await res.text()
        setSeedStatus(null)
        setSeedError(`Seed request failed (${res.status}): ${text}`)
        return
      }
    } catch {
      setSeedStatus(null)
      setSeedError(
        `Cannot reach the PDF ingestion service at ${INGEST_URL}.\n` +
        'Make sure your pdf-ingestion-service is running (see tutorial step 6).',
      )
    }
  }

  async function resetKnowledgeBase() {
    if (!window.confirm('Delete all indexed documents and stored PDFs? This cannot be undone.')) return
    setResetting(true)
    try {
      await fetch(`${INGEST_URL}/reset`, { method: 'DELETE' })
      setDocs([])
      setResponse(null)
      setViewer(null)
      setSeedStatus(null)
      setSeedError(null)
    } finally {
      setResetting(false)
    }
  }

  useEffect(() => {
    if (seedStatus?.state !== 'running') return
    const id = setInterval(async () => {
      try {
        const res  = await fetch(`${INGEST_URL}/seed-demo/status`)
        const data = await res.json() as SeedStatus
        setSeedStatus(data)
        if (data.state === 'done' || data.state === 'error') {
          clearInterval(id)
          const seededDocs: Doc[] = data.items
            .filter(item => item.state === 'done' && item.filename)
            .map(item => ({
              filename: item.filename!,
              fileUrl:  `${INGEST_URL}/pdfs/${encodeURIComponent(item.filename!)}`,
              pages:    item.pages  ?? 0,
              chunks:   item.chunks ?? 0,
              addedAt:  Date.now(),
            }))
          if (seededDocs.length > 0) {
            setDocs(prev => {
              const seededNames = new Set(seededDocs.map(d => d.filename))
              return [...prev.filter(d => !seededNames.has(d.filename)), ...seededDocs]
            })
          } else {
            void refreshDocs()
          }
        }
      } catch {
        // transient; keep polling
      }
    }, 2000)
    return () => clearInterval(id)
  }, [seedStatus?.state])

  // ── Ingest ─────────────────────────────────────────────────────────────────

  async function ingestFile(file: File) {
    if (!file.name.toLowerCase().endsWith('.pdf')) return
    if (ingesting.includes(file.name)) return
    setIngesting(prev => [...prev, file.name])
    try {
      const form = new FormData()
      form.append('file', file)
      form.append('collection', COLLECTION)
      const res  = await fetch(`${INGEST_URL}/ingest`, { method: 'POST', body: form })
      const data = await res.json() as { pages?: number; chunks_published?: number }
      if (!res.ok) throw new Error(JSON.stringify(data))
      const doc: Doc = {
        filename: file.name,
        fileUrl:  URL.createObjectURL(file),
        pages:    data.pages ?? 0,
        chunks:   data.chunks_published ?? 0,
        addedAt:  Date.now(),
      }
      setDocs(prev => {
        const filtered = prev.filter(d => d.filename !== file.name)
        return [...filtered, doc]
      })
    } finally {
      setIngesting(prev => prev.filter(n => n !== file.name))
    }
  }

  function handleFiles(files: FileList | null) {
    if (!files) return
    for (const f of Array.from(files)) void ingestFile(f)
  }

  function handleDrop(e: DragEvent<HTMLDivElement>) {
    e.preventDefault()
    setDragOver(false)
    handleFiles(e.dataTransfer.files)
  }

  // ── Search ─────────────────────────────────────────────────────────────────

  async function handleSearch(q = query) {
    if (!q.trim()) return
    setLoading(true)
    setResponse(null)
    setViewer(null)
    try {
      const res = await fetch(`${API_URL}/search`, {
        method: 'POST',
        headers: { 'Content-Type': 'application/json' },
        body: JSON.stringify({ query: q, collection: COLLECTION, limit: 8 }),
      })
      setResponse(await res.json() as SearchResponse)
    } finally {
      setLoading(false)
    }
  }

  // ── Open viewer ────────────────────────────────────────────────────────────

  function openViewer(result: SearchResult, q: string) {
    const source = String(result.payload.source ?? '')
    if (!source) return
    // Prefer the in-memory URL (user just uploaded), otherwise stream from service
    const existing = docs.find(d => d.filename === source)
    const doc: Doc = existing ?? {
      filename: source,
      fileUrl:  `${INGEST_URL}/pdfs/${encodeURIComponent(source)}`,
      pages:    typeof result.payload.page === 'number' ? result.payload.page : 1,
      chunks:   0,
      addedAt:  0,
    }
    setViewer({
      doc,
      pageNumber: typeof result.payload.page === 'number' ? result.payload.page : 1,
      result,
      query: q,
    })
  }

  // ── Merged result list (hybrid-ranked, deduplicated) ───────────────────────

  const mergedResults: Array<SearchResult & { methods: string[] }> = response
    ? (() => {
        const key = (r: SearchResult) =>
          `${String(r.payload.source ?? '')}:${String(r.payload.page ?? '')}`
        const semanticKeys = new Set(response.semantic.map(key))
        const keywordKeys  = new Set(response.keyword.map(key))
        return response.hybrid.map(r => ({
          ...r,
          methods: [
            semanticKeys.has(key(r)) ? 'semantic' : '',
            keywordKeys.has(key(r))  ? 'keyword'  : '',
          ].filter(Boolean),
        }))
      })()
    : []

  const showLibrary = !response && !loading
  const hasResults  = mergedResults.length > 0

  return (
    <div
      style={s.root}
      onDragOver={e => { e.preventDefault(); setDragOver(true) }}
      onDragLeave={e => { if (!e.currentTarget.contains(e.relatedTarget as Node)) setDragOver(false) }}
      onDrop={handleDrop}
    >
      {/* ── Global drag overlay ── */}
      {dragOver && (
        <div style={s.dragOverlay}>
          <div style={s.dragOverlayInner}>
            <div style={s.dragOverlayIcon}>📄</div>
            <div style={s.dragOverlayText}>Drop PDFs to add to your library</div>
          </div>
        </div>
      )}

      {/* ── Header ── */}
      <header style={s.header}>
        <div style={s.headerLeft}>
          <div style={s.logo}>
            <span style={s.logoIcon}>⬡</span>
            <span style={s.logoText}>PDF Search</span>
          </div>
          <span style={s.headerSub}>Search across your documents with semantic intelligence</span>
        </div>
        <button style={s.addBtn} onClick={() => inputRef.current?.click()}>
          + Add PDFs
        </button>
        <input
          ref={inputRef}
          type="file"
          accept=".pdf"
          multiple
          style={{ display: 'none' }}
          onChange={e => handleFiles(e.target.files)}
        />
      </header>

      {/* ── Search bar ── */}
      <div style={s.searchWrap}>
        <form style={s.searchForm} onSubmit={e => { e.preventDefault(); void handleSearch() }}>
          <span style={s.searchIcon}>⌕</span>
          <input
            style={s.searchInput}
            value={query}
            onChange={e => setQuery(e.target.value)}
            placeholder={
              docs.length > 0
                ? `Search ${docs.length} document${docs.length !== 1 ? 's' : ''}…`
                : 'Add PDFs to start searching…'
            }
            disabled={docs.length === 0}
            autoFocus
          />
          {query && (
            <button
              type="button"
              style={s.clearBtn}
              onClick={() => { setQuery(''); setResponse(null); setViewer(null) }}
            >
              ✕
            </button>
          )}
          <button style={s.searchBtn} disabled={loading || docs.length === 0}>
            {loading ? <span style={s.spinner} /> : 'Search'}
          </button>
        </form>

        {docs.length > 0 && !response && !loading && (
          <div style={s.suggestions}>
            <span style={s.suggestionsLabel}>Try:</span>
            {SPECTACULAR_QUERIES.map(q => (
              <button key={q} style={s.suggestionChip} onClick={() => { setQuery(q); void handleSearch(q) }}>
                {q}
              </button>
            ))}
          </div>
        )}
      </div>

      {/* ── Main content ── */}
      <main style={s.main}>

        {/* Library view */}
        {showLibrary && (
          <div>
            {docs.length === 0 ? (
              <>
                <EmptyLibrary
                  onAdd={() => inputRef.current?.click()}
                  onSeed={startSeedDemo}
                  seeding={seedStatus?.state === 'running'}
                />
                {(seedStatus || seedError) && (
                  <SeedPanel
                    status={seedStatus}
                    error={seedError}
                    onDismiss={() => { setSeedStatus(null); setSeedError(null) }}
                  />
                )}
              </>
            ) : (
              <>
                <DocLibrary
                  docs={docs}
                  ingesting={ingesting}
                  onAdd={() => inputRef.current?.click()}
                  onOpen={doc => setViewer({ doc, pageNumber: 1, result: { id: '', score: 0, payload: {} }, query: '' })}
                  onSeed={startSeedDemo}
                  seeding={seedStatus?.state === 'running'}
                  onReset={resetKnowledgeBase}
                  resetting={resetting}
                />
                {(seedStatus || seedError) && (
                  <SeedPanel
                    status={seedStatus}
                    error={seedError}
                    onDismiss={() => { setSeedStatus(null); setSeedError(null) }}
                  />
                )}
              </>
            )}
          </div>
        )}

        {/* Loading */}
        {loading && (
          <div style={s.loadingState}>
            <div style={s.loadingDots}>
              <span /><span /><span />
            </div>
            <div style={s.loadingText}>Searching across {docs.length} document{docs.length !== 1 ? 's' : ''}…</div>
          </div>
        )}

        {/* Results */}
        {response && !loading && (
          <div style={s.resultsLayout}>
            {/* Result list */}
            <div style={viewer ? s.resultListNarrow : s.resultListFull}>
              {hasResults ? (
                <>
                  <div style={s.resultsHeader}>
                    <span style={s.resultsCount}>{mergedResults.length} result{mergedResults.length !== 1 ? 's' : ''}</span>
                    <span style={s.resultsQuery}>for "{response.query}"</span>
                    <button style={s.backBtn} onClick={() => { setResponse(null); setViewer(null) }}>
                      ← Library
                    </button>
                  </div>
                  <div style={s.resultCards}>
                    {mergedResults.map((r, i) => (
                      <ResultCard
                        key={r.id}
                        result={r}
                        rank={i + 1}
                        query={response.query}
                        isSelected={viewer?.result.id === r.id}
                        canOpen={!!String(r.payload.source ?? '')}
                        onClick={() => openViewer(r, response.query)}
                      />
                    ))}
                  </div>
                </>
              ) : (
                <div style={s.noResults}>
                  <div style={s.noResultsIcon}>⊘</div>
                  <div style={s.noResultsText}>No results for "{response.query}"</div>
                  <div style={s.noResultsSub}>Try different keywords or add more documents</div>
                  <button style={s.backBtn} onClick={() => { setResponse(null); setViewer(null) }}>← Library</button>
                </div>
              )}
            </div>

            {/* PDF viewer */}
            {viewer && viewer.result.id && (
              <PdfViewer
                target={viewer}
                onClose={() => setViewer(null)}
              />
            )}
          </div>
        )}
      </main>

      {/* ── Ingesting toasts ── */}
      {ingesting.length > 0 && (
        <div style={s.toastStack}>
          {ingesting.map(name => (
            <div key={name} style={s.toast}>
              <span style={s.toastSpinner} />
              <span style={s.toastText}>Ingesting {name}…</span>
            </div>
          ))}
        </div>
      )}
    </div>
  )
}

// ── Empty library ─────────────────────────────────────────────────────────────

function EmptyLibrary({ onAdd, onSeed, seeding }: { onAdd: () => void; onSeed: () => void; seeding: boolean }) {
  return (
    <div style={s.emptyLibrary}>
      <div style={s.emptyLibraryIcon}>📂</div>
      <h2 style={s.emptyLibraryTitle}>Your document library is empty</h2>
      <p style={s.emptyLibrarySub}>
        Drop PDF files anywhere on this page, or click below to browse.
        <br />
        Once ingested you can search across all of them at once.
      </p>
      <div style={{ display: 'flex', gap: 12, flexWrap: 'wrap' as const, justifyContent: 'center' }}>
        <button style={s.emptyLibraryBtn} onClick={onAdd}>+ Add PDFs</button>
        <button style={s.seedBtn} onClick={onSeed} disabled={seeding}>
          {seeding ? 'Loading demo data…' : 'Load demo data'}
        </button>
      </div>
      <p style={s.emptyLibrarySeedHint}>
        Demo data downloads 5 open-access documents and indexes them automatically.
        Requires the PDF ingestion service to be running.
      </p>
    </div>
  )
}

// ── Seed panel ────────────────────────────────────────────────────────────────

const SEED_ITEM_ICON: Record<SeedItemState, string> = {
  pending:     '◦',
  downloading: '↓',
  ingesting:   '⧗',
  done:        '✓',
  error:       '✗',
}

function SeedPanel({ status, error, onDismiss }: {
  status: SeedStatus | null
  error: string | null
  onDismiss: () => void
}) {
  const isDone = status?.state === 'done' || status?.state === 'error' || error
  return (
    <div style={s.seedPanel}>
      <div style={s.seedPanelHeader}>
        <span style={s.seedPanelTitle}>Demo data</span>
        {isDone && (
          <button style={s.seedPanelClose} onClick={onDismiss}>✕</button>
        )}
      </div>

      {error && (
        <div style={s.seedPanelError}>{error}</div>
      )}

      {status && status.items.length > 0 && (
        <div style={s.seedItems}>
          {status.items.map(item => {
            const isActive = item.state === 'downloading' || item.state === 'ingesting'
            return (
              <div key={item.id} style={s.seedItem}>
                <span style={{
                  ...s.seedItemIcon,
                  color: item.state === 'done' ? '#22c55e'
                       : item.state === 'error' ? '#ef4444'
                       : isActive ? '#a78bfa' : '#4a4a6a',
                }}>
                  {SEED_ITEM_ICON[item.state]}
                </span>
                <div style={s.seedItemContent}>
                  <div style={s.seedItemLabel}>{item.label}</div>
                  {item.state === 'downloading' && (
                    <div style={s.seedItemSub}>Downloading…</div>
                  )}
                  {item.state === 'ingesting' && (
                    <div style={s.seedItemSub}>Indexing pages…</div>
                  )}
                  {item.state === 'done' && (
                    <div style={{ ...s.seedItemSub, color: '#22c55e' }}>
                      {item.pages} pages indexed
                    </div>
                  )}
                  {item.state === 'error' && (
                    <div style={{ ...s.seedItemSub, color: '#ef4444' }}>{item.error}</div>
                  )}
                </div>
              </div>
            )
          })}
          {status.state === 'running' && status.items.length === 0 && (
            <div style={s.seedItemSub}>Starting…</div>
          )}
          {status.state === 'done' && (
            <div style={s.seedDoneNote}>
              All done — try the suggested queries above to see semantic vs keyword search in action.
            </div>
          )}
          {status.state === 'error' && (
            <div style={{ ...s.seedDoneNote, color: '#ef4444' }}>
              Some or all downloads failed. Check that the ingestion service has internet access.
            </div>
          )}
        </div>
      )}
    </div>
  )
}

// ── Doc library grid ──────────────────────────────────────────────────────────

function DocLibrary({
  docs,
  ingesting,
  onAdd,
  onOpen,
  onSeed,
  seeding,
  onReset,
  resetting,
}: {
  docs: Doc[]
  ingesting: string[]
  onAdd: () => void
  onOpen: (doc: Doc) => void
  onSeed: () => void
  seeding: boolean
  onReset: () => void
  resetting: boolean
}) {
  return (
    <div>
      <div style={s.libraryHeader}>
        <span style={s.libraryCount}>{docs.length} document{docs.length !== 1 ? 's' : ''}</span>
        <div style={{ display: 'flex', gap: 8 }}>
          <button style={s.libraryAddBtn} onClick={onAdd}>+ Add more</button>
          <button style={s.seedBtn} onClick={onSeed} disabled={seeding || resetting}>
            {seeding ? 'Loading demo data…' : 'Load demo data'}
          </button>
          <button style={s.resetBtn} onClick={onReset} disabled={resetting || seeding}>
            {resetting ? 'Clearing…' : 'Clear'}
          </button>
        </div>
      </div>
      <div style={s.docGrid}>
        {docs.map(doc => {
          const color = docColor(doc.filename)
          return (
            <button key={doc.filename} style={s.docCard} onClick={() => onOpen(doc)}>
              <div style={{ ...s.docCardIcon, background: color + '22', border: `1px solid ${color}44` }}>
                <span style={{ ...s.docCardInitials, color }}>{docInitials(doc.filename)}</span>
              </div>
              <div style={s.docCardName}>{docDisplayName(doc.filename)}</div>
              <div style={s.docCardMeta}>{doc.pages} pages</div>
            </button>
          )
        })}
        {ingesting.map(name => (
          <div key={name} style={{ ...s.docCard, ...s.docCardIngesting }}>
            <div style={{ ...s.docCardIcon, background: '#2a2a3e' }}>
              <span style={s.docCardSpinner} />
            </div>
            <div style={s.docCardName}>{name.replace(/\.pdf$/i, '')}</div>
            <div style={s.docCardMeta}>Ingesting…</div>
          </div>
        ))}
      </div>
    </div>
  )
}

// ── Result card ───────────────────────────────────────────────────────────────

function ResultCard({
  result,
  rank,
  query,
  isSelected,
  canOpen,
  onClick,
}: {
  result: SearchResult & { methods: string[] }
  rank: number
  query: string
  isSelected: boolean
  canOpen: boolean
  onClick: () => void
}) {
  const source  = String(result.payload.source ?? result.id)
  const page    = typeof result.payload.page === 'number' ? result.payload.page : null
  const color   = docColor(source)
  const initials = docInitials(source)
  const docName  = source.replace(/\.pdf$/i, '')
  const fallback = String(result.payload.text ?? '').slice(0, 400) + '…'

  return (
    <div
      style={{
        ...s.resultCard,
        ...(isSelected ? s.resultCardSelected : {}),
        ...(canOpen ? s.resultCardClickable : {}),
      }}
      onClick={canOpen ? onClick : undefined}
    >
      {/* Left: doc identity */}
      <div style={{ ...s.resultDocBadge, background: color + '18', borderColor: color + '44' }}>
        <span style={{ ...s.resultDocInitials, color }}>{initials}</span>
      </div>

      {/* Center: content */}
      <div style={s.resultBody}>
        <div style={s.resultMeta}>
          <span style={s.resultDocName}>{docName}</span>
          {page && (
            <span style={{ ...s.resultPageChip, background: color + '22', color, border: `1px solid ${color}44` }}>
              p.{page}
            </span>
          )}
          {result.methods.map(m => {
            const isKeyword = m === 'keyword'
            return (
              <span
                key={m}
                style={{
                  ...s.methodBadge,
                  background: isKeyword ? '#2a1a00' : '#0a1a2e',
                  color:      isKeyword ? '#f59e0b' : '#60a5fa',
                  borderColor: isKeyword ? '#f59e0b55' : '#60a5fa55',
                }}
              >{m}</span>
            )
          })}
        </div>
        <div style={s.resultSnippet}>
          {result.snippet ? <HighlightedText html={result.snippet} /> : fallback}
        </div>
      </div>

      {/* Right: score + action */}
      <div style={s.resultRight}>
        <span style={s.resultScore}>{result.score.toFixed(3)}</span>
        {canOpen && (
          <span style={{ ...s.resultAction, ...(isSelected ? s.resultActionActive : {}) }}>
            {isSelected ? '▶' : '→'}
          </span>
        )}
      </div>
    </div>
  )
}

// ── PDF viewer ────────────────────────────────────────────────────────────────

function PdfViewer({ target, onClose }: { target: ViewerTarget; onClose: () => void }) {
  const [numPages, setNumPages] = useState<number | null>(null)
  const [page, setPage]         = useState(target.pageNumber)
  const [copied, setCopied]     = useState(false)

  // Sync page + numPages whenever the user clicks a different result card.
  // numPages is cleared so a stale "of N" never shows for a different document;
  // react-pdf repopulates it immediately from its internal cache if the file
  // was already loaded.
  useEffect(() => {
    setPage(target.pageNumber)
    setNumPages(null)
  }, [target.result.id, target.doc.fileUrl, target.pageNumber])

  const color    = docColor(target.doc.filename)
  const initials = docInitials(target.doc.filename)
  const docName  = target.doc.filename.replace(/\.pdf$/i, '')

  function openNative() {
    // Jump to the matched page — works in all browser PDF viewers.
    window.open(`${target.doc.fileUrl}#page=${target.pageNumber}`, '_blank', 'noopener,noreferrer')

    // Copy the most distinctive snippet fragment to the clipboard so the user
    // can Ctrl+F → Ctrl+V in the native viewer to land on the exact passage.
    const parts = (target.result.snippet ?? '')
      .replace(/<\/?mark>/gi, '')
      .split(/\s*…\s*/)
      .map(p => p.trim())
      .filter(p => p.length > 10)
    const phrase = parts.sort((a, b) => b.length - a.length)[0]?.slice(0, 120).trim()
    if (phrase) {
      navigator.clipboard.writeText(phrase).then(() => {
        setCopied(true)
        setTimeout(() => setCopied(false), 3000)
      }).catch(() => {/* clipboard unavailable */})
    }
  }

  return (
    <div style={s.viewer}>
      {/* Viewer header */}
      <div style={s.viewerHeader}>
        <div style={{ ...s.viewerDocBadge, background: color + '22', border: `1px solid ${color}44` }}>
          <span style={{ ...s.viewerDocInitials, color }}>{initials}</span>
        </div>
        <div style={s.viewerHeaderInfo}>
          <div style={s.viewerDocName}>{docName}</div>
          <div style={s.viewerPageMeta}>
            Page {page}{numPages ? ` of ${numPages}` : ''}
          </div>
        </div>
        <button style={s.viewerOpenBtn} onClick={openNative} title="Open at this page · copies matched phrase to clipboard">
          ↗
        </button>
        <button style={s.viewerClose} onClick={onClose} title="Close">✕</button>
      </div>

      {/* Matched passage — shown before the PDF so the evidence is immediate */}
      {target.result.snippet && (
        <div style={{ ...s.viewerPassage, marginTop: 12 }}>
          <div style={s.viewerPassageLabel}>Matched passage</div>
          <div style={s.viewerPassageText}>
            <HighlightedText html={target.result.snippet} />
          </div>
        </div>
      )}

      {/* Page navigation */}
      {numPages && numPages > 1 && (
        <div style={s.viewerNav}>
          <button style={s.navBtn} disabled={page <= 1} onClick={() => setPage(p => p - 1)}>‹</button>
          <span style={s.navInfo}>{page} / {numPages}</span>
          <button style={s.navBtn} disabled={page >= numPages} onClick={() => setPage(p => p + 1)}>›</button>
        </div>
      )}

      {/* PDF page — pure context; double-click opens native browser viewer */}
      <div style={s.viewerPageWrap}>
        <div
          style={s.viewerPage}
          onDoubleClick={openNative}
          title="Double-click to open in browser PDF viewer"
        >
          <Document
            file={target.doc.fileUrl}
            onLoadSuccess={({ numPages: n }) => setNumPages(n)}
            loading={<div style={s.viewerPlaceholder}>Loading…</div>}
            error={<div style={s.viewerPlaceholder}>Could not render PDF</div>}
          >
            <Page
              pageNumber={page}
              width={420}
              renderTextLayer={false}
              renderAnnotationLayer={false}
            />
          </Document>
        </div>
        <div style={s.viewerHint}>
          {copied
            ? '✓ Phrase copied — Ctrl+F → Ctrl+V to find it'
            : 'Double-click to open at this page · phrase copied to clipboard'}
        </div>
      </div>

    </div>
  )
}

// ── Highlighted text ──────────────────────────────────────────────────────────

function HighlightedText({ html }: { html: string }) {
  const parts = html.split(/(<mark>[\s\S]*?<\/mark>)/gi)
  return (
    <>
      {parts.map((part, i) => {
        const m = part.match(/^<mark>([\s\S]*?)<\/mark>$/i)
        return m
          ? <mark key={i} style={{ background: '#fbbf24', color: '#0f0f1a', borderRadius: 3, padding: '0 3px', fontWeight: 600 }}>{m[1]}</mark>
          : <span key={i}>{part}</span>
      })}
    </>
  )
}

// ── Styles ────────────────────────────────────────────────────────────────────

const s: Record<string, React.CSSProperties> = {
  // Root
  root: { minHeight: '100vh', background: '#0a0a14', color: '#e2e2f0', fontFamily: 'system-ui, -apple-system, sans-serif', position: 'relative' },

  // Drag overlay
  dragOverlay: { position: 'fixed', inset: 0, background: 'rgba(10,10,20,0.88)', zIndex: 100, display: 'flex', alignItems: 'center', justifyContent: 'center', backdropFilter: 'blur(4px)' },
  dragOverlayInner: { border: '2px dashed #7c3aed', borderRadius: 20, padding: '60px 80px', textAlign: 'center' },
  dragOverlayIcon: { fontSize: '3rem', marginBottom: 12 },
  dragOverlayText: { fontSize: '1.2rem', color: '#c4b5fd', fontWeight: 600 },

  // Header
  header: { display: 'flex', alignItems: 'center', gap: 16, padding: '18px 32px', borderBottom: '1px solid #1a1a2e' },
  headerLeft: { flex: 1, display: 'flex', flexDirection: 'column', gap: 2 },
  logo: { display: 'flex', alignItems: 'center', gap: 8 },
  logoIcon: { fontSize: '1.2rem', color: '#7c3aed' },
  logoText: { fontWeight: 700, fontSize: '1.1rem', color: '#fff', letterSpacing: '-0.02em' },
  headerSub: { fontSize: '0.78rem', color: '#4a4a6a' },
  addBtn: { padding: '8px 18px', borderRadius: 8, background: '#7c3aed', color: '#fff', border: 'none', cursor: 'pointer', fontSize: '0.85rem', fontWeight: 600 },

  // Search
  searchWrap: { padding: '24px 32px 0', maxWidth: 1400, margin: '0 auto' },
  searchForm: { display: 'flex', alignItems: 'center', background: '#12121e', border: '1px solid #2a2a3e', borderRadius: 12, padding: '4px 4px 4px 16px', gap: 8 },
  searchIcon: { fontSize: '1.1rem', color: '#4a4a6a', flexShrink: 0 },
  searchInput: { flex: 1, background: 'transparent', border: 'none', outline: 'none', color: '#e2e2f0', fontSize: '1rem', padding: '8px 0' },
  clearBtn: { background: 'transparent', border: 'none', color: '#4a4a6a', cursor: 'pointer', fontSize: '0.9rem', padding: '4px 8px' },
  searchBtn: { padding: '10px 22px', borderRadius: 8, background: '#7c3aed', color: '#fff', border: 'none', cursor: 'pointer', fontSize: '0.9rem', fontWeight: 600, flexShrink: 0 },
  spinner: { display: 'inline-block', width: 14, height: 14, border: '2px solid rgba(255,255,255,0.3)', borderTopColor: '#fff', borderRadius: '50%', animation: 'spin 0.7s linear infinite' },
  suggestions: { display: 'flex', alignItems: 'center', gap: 8, flexWrap: 'wrap' as const, paddingTop: 12, paddingBottom: 4 },
  suggestionsLabel: { fontSize: '0.75rem', color: '#4a4a6a', flexShrink: 0 },
  suggestionChip: { padding: '5px 14px', borderRadius: 20, border: '1px solid #2a2a3e', background: 'transparent', color: '#6b6b8a', cursor: 'pointer', fontSize: '0.8rem' },

  // Main
  main: { padding: '24px 32px', maxWidth: 1400, margin: '0 auto' },

  // Empty library
  emptyLibrary: { display: 'flex', flexDirection: 'column', alignItems: 'center', justifyContent: 'center', padding: '80px 24px 32px', textAlign: 'center' },
  emptyLibraryIcon: { fontSize: '3.5rem', marginBottom: 16 },
  emptyLibraryTitle: { margin: '0 0 10px', fontSize: '1.3rem', color: '#fff', fontWeight: 600 },
  emptyLibrarySub: { margin: '0 0 24px', color: '#6b6b8a', lineHeight: 1.7, fontSize: '0.95rem' },
  emptyLibraryBtn: { padding: '12px 28px', borderRadius: 10, background: '#7c3aed', color: '#fff', border: 'none', cursor: 'pointer', fontSize: '0.95rem', fontWeight: 600 },
  seedBtn: { padding: '12px 28px', borderRadius: 10, background: 'transparent', color: '#a78bfa', border: '1px solid #4c1d95', cursor: 'pointer', fontSize: '0.95rem', fontWeight: 600 },
  resetBtn: { padding: '6px 14px', borderRadius: 6, background: 'transparent', border: '1px solid #4a1a1a', color: '#f87171', cursor: 'pointer', fontSize: '0.82rem' },
  emptyLibrarySeedHint: { margin: '16px 0 0', color: '#3a3a5a', fontSize: '0.78rem', maxWidth: 380, lineHeight: 1.6 },

  // Seed panel
  seedPanel: { maxWidth: 560, margin: '16px auto 0', background: '#10101e', border: '1px solid #2a2a3e', borderRadius: 10, overflow: 'hidden' },
  seedPanelHeader: { display: 'flex', alignItems: 'center', justifyContent: 'space-between', padding: '10px 16px', borderBottom: '1px solid #1e1e30', background: '#12121e' },
  seedPanelTitle: { fontWeight: 600, fontSize: '0.85rem', color: '#c4b5fd' },
  seedPanelClose: { background: 'transparent', border: 'none', color: '#4a4a6a', cursor: 'pointer', fontSize: '0.85rem', padding: '2px 6px' },
  seedPanelError: { padding: '12px 16px', color: '#fca5a5', fontSize: '0.85rem', lineHeight: 1.7, whiteSpace: 'pre-wrap' as const },
  seedItems: { padding: '10px 0 14px' },
  seedItem: { display: 'flex', alignItems: 'flex-start', gap: 10, padding: '6px 16px' },
  seedItemIcon: { fontWeight: 700, fontSize: '0.9rem', flexShrink: 0, width: 14, textAlign: 'center' as const, marginTop: 1 },
  seedItemContent: { flex: 1, minWidth: 0 },
  seedItemLabel: { fontSize: '0.82rem', color: '#c8c8e0', lineHeight: 1.4 },
  seedItemSub: { fontSize: '0.75rem', color: '#6b6b8a', marginTop: 2 },
  seedDoneNote: { margin: '10px 16px 0', fontSize: '0.8rem', color: '#6b6b8a', borderTop: '1px solid #1e1e30', paddingTop: 10 },

  // Library
  libraryHeader: { display: 'flex', alignItems: 'center', justifyContent: 'space-between', marginBottom: 16 },
  libraryCount: { color: '#6b6b8a', fontSize: '0.85rem' },
  libraryAddBtn: { padding: '6px 14px', borderRadius: 6, background: 'transparent', border: '1px solid #2a2a3e', color: '#9090b0', cursor: 'pointer', fontSize: '0.82rem' },
  docGrid: { display: 'grid', gridTemplateColumns: 'repeat(auto-fill, minmax(160px, 1fr))', gap: 12 },
  docCard: { background: '#12121e', border: '1px solid #1e1e30', borderRadius: 10, padding: '16px 12px', cursor: 'pointer', textAlign: 'center' as const, display: 'flex', flexDirection: 'column', alignItems: 'center', gap: 8, transition: 'border-color 0.15s', color: 'inherit' },
  docCardIngesting: { opacity: 0.6, cursor: 'default' },
  docCardIcon: { width: 52, height: 52, borderRadius: 10, display: 'flex', alignItems: 'center', justifyContent: 'center' },
  docCardInitials: { fontWeight: 700, fontSize: '1rem', letterSpacing: '-0.02em' },
  docCardSpinner: { display: 'inline-block', width: 18, height: 18, border: '2px solid #2a2a3e', borderTopColor: '#7c3aed', borderRadius: '50%', animation: 'spin 0.7s linear infinite' },
  docCardName: { fontSize: '0.8rem', color: '#c8c8e0', fontWeight: 500, wordBreak: 'break-word' as const, lineHeight: 1.3, width: '100%', textAlign: 'center' as const },
  docCardMeta: { fontSize: '0.72rem', color: '#4a4a6a' },

  // Loading state
  loadingState: { display: 'flex', flexDirection: 'column', alignItems: 'center', gap: 16, padding: '80px 0' },
  loadingDots: { display: 'flex', gap: 6 },
  loadingText: { color: '#6b6b8a', fontSize: '0.9rem' },

  // Results layout
  resultsLayout: { display: 'flex', gap: 20, alignItems: 'flex-start' },
  resultListFull: { flex: 1, minWidth: 0 },
  resultListNarrow: { flex: 1, minWidth: 0 },

  // Results header
  resultsHeader: { display: 'flex', alignItems: 'baseline', gap: 10, marginBottom: 16, flexWrap: 'wrap' as const },
  resultsCount: { fontWeight: 700, fontSize: '1.05rem', color: '#fff' },
  resultsQuery: { color: '#6b6b8a', fontSize: '0.9rem', flex: 1 },
  backBtn: { padding: '5px 12px', borderRadius: 6, background: 'transparent', border: '1px solid #2a2a3e', color: '#9090b0', cursor: 'pointer', fontSize: '0.8rem', marginLeft: 'auto' },

  noResults: { display: 'flex', flexDirection: 'column', alignItems: 'center', padding: '60px 24px', textAlign: 'center' as const, gap: 8 },
  noResultsIcon: { fontSize: '2rem', color: '#3a3a5a' },
  noResultsText: { fontSize: '1rem', color: '#9090b0', fontWeight: 500 },
  noResultsSub: { fontSize: '0.85rem', color: '#4a4a6a', marginBottom: 16 },

  // Result cards
  resultCards: { display: 'flex', flexDirection: 'column', gap: 10 },
  resultCard: { background: '#12121e', border: '1px solid #1e1e30', borderRadius: 10, padding: '14px 16px', display: 'flex', gap: 14, alignItems: 'flex-start', transition: 'border-color 0.12s' },
  resultCardClickable: { cursor: 'pointer' },
  resultCardSelected: { border: '1px solid #7c3aed55', background: '#7c3aed08' },
  resultDocBadge: { width: 40, height: 40, borderRadius: 8, display: 'flex', alignItems: 'center', justifyContent: 'center', flexShrink: 0, border: '1px solid' },
  resultDocInitials: { fontWeight: 700, fontSize: '0.8rem', letterSpacing: '-0.01em' },
  resultBody: { flex: 1, minWidth: 0 },
  resultMeta: { display: 'flex', alignItems: 'center', gap: 8, flexWrap: 'wrap' as const, marginBottom: 8 },
  resultDocName: { fontWeight: 600, fontSize: '0.88rem', color: '#d0d0e8' },
  resultPageChip: { fontSize: '0.72rem', fontWeight: 600, padding: '2px 8px', borderRadius: 10, border: '1px solid' },
  methodBadge: { fontSize: '0.65rem', fontWeight: 700, padding: '2px 8px', borderRadius: 10, textTransform: 'uppercase' as const, letterSpacing: '0.06em', border: '1px solid' },
  resultSnippet: { fontSize: '0.88rem', color: '#9090b0', lineHeight: 1.7, wordBreak: 'break-word' as const },
  resultRight: { display: 'flex', flexDirection: 'column', alignItems: 'flex-end', gap: 8, flexShrink: 0 },
  resultScore: { fontSize: '0.72rem', color: '#4a4a6a', fontVariantNumeric: 'tabular-nums' },
  resultAction: { fontSize: '1rem', color: '#3a3a5a' },
  resultActionActive: { color: '#7c3aed' },

  // PDF viewer
  viewer: { width: 460, flexShrink: 0, background: '#0e0e1a', border: '1px solid #1e1e30', borderRadius: 12, display: 'flex', flexDirection: 'column', overflow: 'hidden', maxHeight: '88vh', position: 'sticky', top: 20 },
  viewerHeader: { display: 'flex', alignItems: 'center', gap: 10, padding: '12px 14px', borderBottom: '1px solid #1e1e30', background: '#12121e' },
  viewerDocBadge: { width: 34, height: 34, borderRadius: 7, display: 'flex', alignItems: 'center', justifyContent: 'center', flexShrink: 0 },
  viewerDocInitials: { fontWeight: 700, fontSize: '0.75rem' },
  viewerHeaderInfo: { flex: 1, minWidth: 0 },
  viewerDocName: { fontWeight: 600, fontSize: '0.82rem', color: '#e2e2f0', overflow: 'hidden', textOverflow: 'ellipsis', whiteSpace: 'nowrap' as const },
  viewerPageMeta: { fontSize: '0.72rem', color: '#4a4a6a', marginTop: 2 },
  viewerOpenBtn: { background: 'transparent', border: '1px solid #2a2a3e', color: '#9090b0', cursor: 'pointer', fontSize: '0.85rem', padding: '3px 8px', borderRadius: 6, flexShrink: 0 },
  viewerClose: { background: 'transparent', border: 'none', color: '#4a4a6a', cursor: 'pointer', fontSize: '1rem', padding: '2px 6px', flexShrink: 0 },
  viewerNav: { display: 'flex', alignItems: 'center', justifyContent: 'center', gap: 16, padding: '8px', borderBottom: '1px solid #1e1e30', background: '#0e0e1a' },
  navBtn: { background: 'transparent', border: '1px solid #2a2a3e', color: '#9090b0', cursor: 'pointer', borderRadius: 6, padding: '4px 12px', fontSize: '1rem' },
  navInfo: { fontSize: '0.8rem', color: '#6b6b8a', minWidth: 50, textAlign: 'center' as const },
  viewerPageWrap: { flex: 1, overflow: 'hidden', display: 'flex', flexDirection: 'column' },
  viewerPage: { flex: 1, overflow: 'auto', padding: 16, display: 'flex', justifyContent: 'center', background: '#f5f5f0', cursor: 'zoom-in' },
  viewerHint: { textAlign: 'center' as const, fontSize: '0.68rem', color: '#3a3a5a', padding: '5px 0 6px', background: '#0e0e1a', letterSpacing: '0.02em' },
  viewerPlaceholder: { color: '#6b6b8a', padding: 48, textAlign: 'center' as const },
  viewerPassage: { borderLeft: '3px solid #7c3aed', margin: '0 14px 0', padding: '10px 14px', background: 'rgba(124,58,237,0.07)', borderRadius: '0 6px 6px 0' },
  viewerPassageLabel: { fontSize: '0.65rem', color: '#7c3aed', textTransform: 'uppercase' as const, letterSpacing: '0.1em', marginBottom: 6, fontWeight: 600 },
  viewerPassageText: { fontSize: '0.84rem', color: '#c4b5fd', lineHeight: 1.75 },
}
