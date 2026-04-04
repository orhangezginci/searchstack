import { useState } from 'react'
import { motion, AnimatePresence } from 'framer-motion'
import EmbeddingSpace from './EmbeddingSpace'
import './App.css'

const API_URL = import.meta.env.VITE_API_URL || 'http://localhost:8000'

interface Result {
  id: string
  score: number
  payload: {
    text: string
    title?: string
    cuisine?: string
  }
}

interface SearchResponse {
  query: string
  semantic: Result[]
  keyword: Result[]
}

const THRESHOLDS = [
  { label: 'Wide',     value: 0.10, hint: '≥ 0.10' },
  { label: 'Balanced', value: 0.20, hint: '≥ 0.20' },
  { label: 'Narrow',   value: 0.30, hint: '≥ 0.30' },
  { label: 'Strict',   value: 0.40, hint: '≥ 0.40' },
]

const SUGGESTIONS = [
  'I have a hangover',
  'I have the flu',
  'a romantic dinner for two',
]

function ScoreBar({ score, max }: { score: number; max: number }) {
  const pct = Math.min((score / max) * 100, 100)
  return (
    <div className="score-row">
      <div className="score-bar-track">
        <motion.div
          className="score-bar-fill"
          initial={{ width: 0 }}
          animate={{ width: `${pct}%` }}
          transition={{ duration: 0.5, ease: 'easeOut' }}
        />
      </div>
      <span className="score-value">{score.toFixed(3)}</span>
    </div>
  )
}

function ResultColumn({
  title,
  badge,
  desc,
  type,
  results,
  query,
}: {
  title: string
  badge: string
  desc: string
  type: 'semantic' | 'keyword'
  results: Result[]
  query: string
}) {
  const maxScore = results.length > 0 ? results[0].score : 1

  return (
    <div className={type}>
      <div className="column-header">
        <div className="column-header-top">
          <span className="column-title">{title}</span>
          <span className="column-badge">{badge}</span>
        </div>
        <span className="column-desc">{desc}</span>
      </div>

      {results.length === 0 ? (
        <motion.div
          className="no-results"
          initial={{ opacity: 0, scale: 0.96 }}
          animate={{ opacity: 1, scale: 1 }}
          transition={{ duration: 0.4 }}
        >
          <motion.div
            className="no-results-zero"
            initial={{ opacity: 0, y: -10 }}
            animate={{ opacity: 1, y: 0 }}
            transition={{ delay: 0.1, duration: 0.4 }}
          >
            0
          </motion.div>

          {type === 'semantic' ? (
            <>
              <span className="no-results-title">Threshold too strict</span>
              <span className="no-results-explanation">
                The model found semantically related recipes, but all scored below the current threshold. Lower it to see results.
              </span>
              <span className="no-results-verdict" style={{ color: '#a78bfa' }}>try "balanced" or "wide"</span>
            </>
          ) : (
            <>
              <span className="no-results-title">No matches found</span>
              <span className="no-results-explanation">
                BM25 searched for these exact tokens in every recipe — found nothing:
              </span>
              <div className="no-results-tokens">
                {query.toLowerCase().split(/\s+/).filter(Boolean).map((token) => (
                  <span key={token} className="token">{token}</span>
                ))}
              </div>
              <span className="no-results-verdict">keyword search is blind to meaning</span>
            </>
          )}
        </motion.div>
      ) : (
        <AnimatePresence>
          {results.map((r, i) => (
            <motion.div
              key={r.id}
              className="result-card"
              initial={{ opacity: 0, y: 16 }}
              animate={{ opacity: 1, y: 0 }}
              transition={{ duration: 0.3, delay: i * 0.07 }}
            >
              <div className="result-rank">#{i + 1}</div>
              <div className="result-title">{r.payload.title ?? 'Result'}</div>
              <div className="result-cuisine">{r.payload.cuisine}</div>
              <div className="result-text">{r.payload.text}</div>
              <ScoreBar score={r.score} max={maxScore} />
            </motion.div>
          ))}
        </AnimatePresence>
      )}
    </div>
  )
}

export default function App() {
  const [query, setQuery] = useState('')
  const [loading, setLoading] = useState(false)
  const [results, setResults] = useState<SearchResponse | null>(null)
  const [threshold, setThreshold] = useState(0.20)

  async function handleSearch(q = query, t = threshold) {
    if (!q.trim()) return
    setLoading(true)
    setResults(null)
    try {
      const res = await fetch(`${API_URL}/search`, {
        method: 'POST',
        headers: { 'Content-Type': 'application/json' },
        body: JSON.stringify({ query: q, collection: 'recipes', limit: 5, score_threshold: t }),
      })
      const data = await res.json()
      setResults(data)
    } finally {
      setLoading(false)
    }
  }

  function handleThreshold(val: number) {
    setThreshold(val)
    if (query.trim()) handleSearch(query, val)
  }

  return (
    <div className="app">
      <header className="header">
        <h1>Search Arena</h1>
        <p>Semantic vs Keyword — see the difference in real time</p>
      </header>

      <form
        className="search-form"
        onSubmit={(e) => { e.preventDefault(); handleSearch() }}
      >
        <input
          className="search-input"
          value={query}
          onChange={(e) => setQuery(e.target.value)}
          placeholder="Try: I have a hangover…"
        />
        <button className="search-btn" disabled={loading}>
          {loading ? 'Searching…' : 'Search'}
        </button>
      </form>

      {!results && !loading && (
        <div className="empty-state">
          <p style={{ marginBottom: 16, color: '#6b6b8a' }}>Try one of these:</p>
          <div style={{ display: 'flex', flexWrap: 'wrap', gap: 8, justifyContent: 'center' }}>
            {SUGGESTIONS.map((s) => (
              <button
                key={s}
                onClick={() => { setQuery(s); handleSearch(s, threshold) }}
                style={{
                  background: '#16162a',
                  border: '1px solid #2a2a45',
                  color: '#9090b0',
                  padding: '6px 14px',
                  borderRadius: 20,
                  cursor: 'pointer',
                  fontSize: '0.85rem',
                }}
              >
                {s}
              </button>
            ))}
          </div>
        </div>
      )}

      {results && (
        <div className="threshold-bar">
          <span className="threshold-label">Similarity threshold</span>
          {THRESHOLDS.map((t) => (
            <button
              key={t.value}
              className={`threshold-btn ${threshold === t.value ? 'active' : ''}`}
              onClick={() => handleThreshold(t.value)}
            >
              {t.label}
              <span className="val">{t.hint}</span>
            </button>
          ))}
        </div>
      )}

      {results && (
        <div style={{ marginBottom: 32 }}>
          <div style={{ fontSize: '0.75rem', color: '#6b6b8a', textTransform: 'uppercase', letterSpacing: '0.08em', marginBottom: 10 }}>
            Embedding Space — 768D → 3D via PCA &nbsp;·&nbsp; drag to rotate &nbsp;·&nbsp; scroll to zoom
          </div>
          <EmbeddingSpace query={results.query} threshold={threshold} />
        </div>
      )}

      {results && (
        <div className="results-grid">
          <ResultColumn
            title="Semantic Search"
            badge="all-mpnet-base-v2"
            desc="Converts your query into a 768-dim vector and finds the nearest recipes in embedding space — understands meaning, not just words."
            type="semantic"
            results={results.semantic}
            query={results.query}
          />
          <ResultColumn
            title="Keyword Search"
            badge="Elasticsearch BM25"
            desc="Tokenizes your query and scores recipes by exact word frequency (BM25). Fast and precise — but blind to meaning."
            type="keyword"
            results={results.keyword}
            query={results.query}
          />
        </div>
      )}
    </div>
  )
}
