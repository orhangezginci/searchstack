import { useState } from 'react'

const API_URL = import.meta.env.VITE_API_URL || 'http://localhost:8000'
const APP_VERSION = '0.4.0'

// ── Collection registry ───────────────────────────────────────────────────────
// To add support for a new ingestion service, add an entry here.

interface Collection {
  id: string
  label: string
  ingestBaseUrl: string         // base URL of the ingestion service for this collection
  ingestEndpoint: string        // POST path — accepts multipart/form-data with a "file" field
  acceptedFileTypes: string     // passed to <input accept="...">
  searchFields: string[]        // payload fields to display in result cards
}

const COLLECTIONS: Collection[] = [
  {
    id: 'pdfs',
    label: 'PDF Documents',
    ingestBaseUrl: import.meta.env.VITE_PDF_INGEST_URL || 'http://localhost:8006',
    ingestEndpoint: '/ingest',
    acceptedFileTypes: '.pdf',
    searchFields: ['title', 'text', 'page'],
  },
]

// ── App ───────────────────────────────────────────────────────────────────────

type Tab = 'ingest' | 'search'

export default function App() {
  const [tab, setTab] = useState<Tab>('ingest')
  const [collection, setCollection] = useState<Collection>(COLLECTIONS[0])

  return (
    <div style={styles.app}>
      <header style={styles.header}>
        <h1 style={styles.title}>Search Arena</h1>
        <p style={styles.subtitle}>Generic ingestion &amp; search</p>
        <span style={styles.versionBadge}>v{APP_VERSION}</span>
      </header>

      {/* Collection selector */}
      <div style={styles.collectionBar}>
        <span style={styles.collectionLabel}>Collection:</span>
        <select
          style={styles.collectionSelect}
          value={collection.id}
          onChange={e => setCollection(COLLECTIONS.find(c => c.id === e.target.value)!)}
        >
          {COLLECTIONS.map(c => (
            <option key={c.id} value={c.id}>{c.label}</option>
          ))}
        </select>
      </div>

      {/* Tabs */}
      <div style={styles.tabs}>
        <button
          style={{ ...styles.tab, ...(tab === 'ingest' ? styles.tabActive : {}) }}
          onClick={() => setTab('ingest')}
        >
          Ingest
        </button>
        <button
          style={{ ...styles.tab, ...(tab === 'search' ? styles.tabActive : {}) }}
          onClick={() => setTab('search')}
        >
          Search
        </button>
      </div>

      {tab === 'ingest' && <IngestTab collection={collection} />}
      {tab === 'search' && <SearchTab collection={collection} />}

      <footer style={styles.footer}>v{APP_VERSION}</footer>
    </div>
  )
}

// ── Ingest tab ────────────────────────────────────────────────────────────────

function IngestTab({ collection }: { collection: Collection }) {
  const [file, setFile] = useState<File | null>(null)
  const [status, setStatus] = useState<string | null>(null)
  const [loading, setLoading] = useState(false)

  async function handleIngest() {
    if (!file) return
    setLoading(true)
    setStatus(null)
    try {
      const form = new FormData()
      form.append('file', file)
      const res = await fetch(`${collection.ingestBaseUrl}${collection.ingestEndpoint}`, {
        method: 'POST',
        body: form,
      })
      const data = await res.json() as Record<string, unknown>
      setStatus(res.ok ? `Ingested: ${JSON.stringify(data)}` : `Error: ${JSON.stringify(data)}`)
    } catch (err) {
      setStatus(`Error: ${String(err)}`)
    } finally {
      setLoading(false)
    }
  }

  return (
    <div style={styles.panel}>
      <h2 style={styles.panelTitle}>Upload to {collection.label}</h2>
      <input
        type="file"
        accept={collection.acceptedFileTypes}
        disabled={loading}
        onChange={e => { setFile(e.target.files?.[0] ?? null); setStatus(null) }}
        style={styles.fileInput}
      />
      {file && (
        <button style={styles.searchBtn} disabled={loading} onClick={() => void handleIngest()}>
          {loading ? 'Ingesting…' : `Ingest ${file.name}`}
        </button>
      )}
      {loading && <p style={styles.statusLoading}>Uploading…</p>}
      {status && <pre style={styles.statusBox}>{status}</pre>}
    </div>
  )
}

// ── Search tab ────────────────────────────────────────────────────────────────

interface SearchResult {
  id: string
  score: number
  payload: Record<string, unknown>
}

interface SearchResponse {
  query: string
  semantic: SearchResult[]
  keyword: SearchResult[]
  hybrid: SearchResult[]
}

function SearchTab({ collection }: { collection: Collection }) {
  const [query, setQuery] = useState('')
  const [loading, setLoading] = useState(false)
  const [results, setResults] = useState<SearchResponse | null>(null)

  async function handleSearch(q = query) {
    if (!q.trim()) return
    setLoading(true)
    setResults(null)
    try {
      const res = await fetch(`${API_URL}/search`, {
        method: 'POST',
        headers: { 'Content-Type': 'application/json' },
        body: JSON.stringify({ query: q, collection: collection.id, limit: 5 }),
      })
      setResults(await res.json() as SearchResponse)
    } finally {
      setLoading(false)
    }
  }

  return (
    <div style={styles.panel}>
      <h2 style={styles.panelTitle}>Search {collection.label}</h2>
      <form style={styles.searchForm} onSubmit={e => { e.preventDefault(); void handleSearch() }}>
        <input
          style={styles.searchInput}
          value={query}
          onChange={e => setQuery(e.target.value)}
          placeholder={`Search ${collection.label}…`}
        />
        <button style={styles.searchBtn} disabled={loading}>
          {loading ? 'Searching…' : 'Search'}
        </button>
      </form>

      {results && (
        <div style={styles.resultsGrid}>
          <ResultColumn title="Semantic" results={results.semantic} fields={collection.searchFields} color="#7c3aed" />
          <ResultColumn title="Hybrid" results={results.hybrid} fields={collection.searchFields} color="#10b981" />
          <ResultColumn title="Keyword" results={results.keyword} fields={collection.searchFields} color="#ea580c" />
        </div>
      )}
    </div>
  )
}

// ── Result column ─────────────────────────────────────────────────────────────

function ResultColumn({ title, results, fields, color }: {
  title: string
  results: SearchResult[]
  fields: string[]
  color: string
}) {
  return (
    <div style={styles.column}>
      <div style={{ ...styles.columnHeader, borderColor: color }}>
        <span style={{ ...styles.columnTitle, color }}>{title}</span>
      </div>
      {results.length === 0 ? (
        <p style={styles.noResults}>No results</p>
      ) : (
        results.map((r, i) => (
          <div key={r.id} style={styles.card}>
            <div style={styles.cardRank}>#{i + 1}</div>
            <div style={styles.cardScore}>{r.score.toFixed(3)}</div>
            {fields.map(f => r.payload[f] != null && (
              <div key={f} style={styles.cardField}>
                <span style={styles.cardFieldKey}>{f}: </span>
                <span>{String(r.payload[f])}</span>
              </div>
            ))}
          </div>
        ))
      )}
    </div>
  )
}

// ── Styles ────────────────────────────────────────────────────────────────────

const styles: Record<string, React.CSSProperties> = {
  app: { maxWidth: 900, margin: '0 auto', padding: '24px 16px', fontFamily: 'system-ui, sans-serif', color: '#e2e2f0', background: '#0f0f1a', minHeight: '100vh' },
  header: { textAlign: 'center', marginBottom: 24, position: 'relative' },
  title: { margin: 0, fontSize: '1.8rem', color: '#fff' },
  subtitle: { margin: '4px 0 0', color: '#6b6b8a', fontSize: '0.9rem' },
  versionBadge: { display: 'inline-block', marginTop: 8, background: '#2a2a3e', color: '#7c3aed', border: '1px solid #7c3aed', borderRadius: 20, padding: '2px 10px', fontSize: '0.75rem', letterSpacing: '0.05em', fontWeight: 600 },
  footer: { marginTop: 48, textAlign: 'center', color: '#3a3a5a', fontSize: '0.75rem' },
  collectionBar: { display: 'flex', alignItems: 'center', gap: 10, marginBottom: 20 },
  collectionLabel: { color: '#6b6b8a', fontSize: '0.85rem' },
  collectionSelect: { background: '#1a1a2e', color: '#e2e2f0', border: '1px solid #2a2a3e', borderRadius: 6, padding: '6px 10px', fontSize: '0.9rem' },
  tabs: { display: 'flex', gap: 8, marginBottom: 24 },
  tab: { padding: '8px 20px', borderRadius: 8, border: '1px solid #2a2a3e', background: '#1a1a2e', color: '#9090b0', cursor: 'pointer', fontSize: '0.9rem' },
  tabActive: { background: '#7c3aed', color: '#fff', borderColor: '#7c3aed' },
  panel: { background: '#1a1a2e', borderRadius: 12, padding: 24, border: '1px solid #2a2a3e' },
  panelTitle: { margin: '0 0 16px', fontSize: '1rem', color: '#fff' },
  fileInput: { display: 'block', color: '#e2e2f0', marginBottom: 12 },
  statusLoading: { color: '#9090b0', fontStyle: 'italic' },
  statusBox: { background: '#0f0f1a', borderRadius: 8, padding: 12, fontSize: '0.8rem', color: '#a0ffa0', whiteSpace: 'pre-wrap', wordBreak: 'break-all', border: '1px solid #2a2a3e' },
  searchForm: { display: 'flex', gap: 8, marginBottom: 20 },
  searchInput: { flex: 1, padding: '10px 14px', borderRadius: 8, border: '1px solid #2a2a3e', background: '#0f0f1a', color: '#e2e2f0', fontSize: '0.95rem' },
  searchBtn: { padding: '10px 20px', borderRadius: 8, background: '#7c3aed', color: '#fff', border: 'none', cursor: 'pointer', fontSize: '0.95rem' },
  resultsGrid: { display: 'grid', gridTemplateColumns: '1fr 1fr 1fr', gap: 16 },
  column: { display: 'flex', flexDirection: 'column', gap: 10 },
  columnHeader: { borderLeft: '3px solid', paddingLeft: 10, marginBottom: 4 },
  columnTitle: { fontWeight: 600, fontSize: '0.95rem' },
  noResults: { color: '#6b6b8a', fontSize: '0.9rem' },
  card: { background: '#0f0f1a', borderRadius: 8, padding: 12, border: '1px solid #2a2a3e', fontSize: '0.85rem' },
  cardRank: { color: '#6b6b8a', fontSize: '0.75rem', marginBottom: 4 },
  cardScore: { color: '#a78bfa', fontWeight: 600, marginBottom: 6 },
  cardField: { marginBottom: 2, lineHeight: 1.4 },
  cardFieldKey: { color: '#6b6b8a' },
}
