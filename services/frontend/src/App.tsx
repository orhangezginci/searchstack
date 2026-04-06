import { useState, useEffect } from 'react'
import { motion, AnimatePresence } from 'framer-motion'
import EmbeddingSpace from './EmbeddingSpace'
import './App.css'

const API_URL = import.meta.env.VITE_API_URL || 'http://localhost:8000'

// ── Recipe search types ──────────────────────────────────────────────────────

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

// ── Image search types ───────────────────────────────────────────────────────

interface ImageResult {
  filename: string
  title: string
  score: number
  percentile: number
  score_delta: number
}

interface ImageSearchResponse {
  query: string
  total_indexed: number
  results: ImageResult[]
}

// ── Constants ────────────────────────────────────────────────────────────────

const THRESHOLDS = [
  { label: 'Wide',     value: 0.10, hint: '≥ 0.10' },
  { label: 'Balanced', value: 0.20, hint: '≥ 0.20' },
  { label: 'Narrow',   value: 0.30, hint: '≥ 0.30' },
  { label: 'Strict',   value: 0.40, hint: '≥ 0.40' },
]

const RECIPE_SUGGESTIONS = [
  'I have a hangover',
  'I have the flu',
  'a romantic dinner for two',
]

const IMAGE_SUGGESTIONS = [
  'romantic sunset at the beach',
  'something dramatic and stormy',
  'cozy morning coffee',
  'joy and laughter',
]

// ── Shared components ────────────────────────────────────────────────────────

function ScoreBar({ score, max, color }: { score: number; max: number; color: string }) {
  const pct = Math.min((score / max) * 100, 100)
  return (
    <div className="score-row">
      <div className="score-bar-track">
        <motion.div
          className="score-bar-fill"
          style={{ background: color }}
          initial={{ width: 0 }}
          animate={{ width: `${pct}%` }}
          transition={{ duration: 0.5, ease: 'easeOut' }}
        />
      </div>
      <span className="score-value">{score.toFixed(3)}</span>
    </div>
  )
}

// ── Recipe result column ─────────────────────────────────────────────────────

function ResultColumn({
  title, badge, desc, type, results, query,
}: {
  title: string; badge: string; desc: string
  type: 'semantic' | 'keyword'; results: Result[]; query: string
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
        <motion.div className="no-results"
          initial={{ opacity: 0, scale: 0.96 }} animate={{ opacity: 1, scale: 1 }}
          transition={{ duration: 0.4 }}>
          <motion.div className="no-results-zero"
            initial={{ opacity: 0, y: -10 }} animate={{ opacity: 1, y: 0 }}
            transition={{ delay: 0.1, duration: 0.4 }}>
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
            <motion.div key={r.id} className="result-card"
              initial={{ opacity: 0, y: 16 }} animate={{ opacity: 1, y: 0 }}
              transition={{ duration: 0.3, delay: i * 0.07 }}>
              <div className="result-rank">#{i + 1}</div>
              <div className="result-title">{r.payload.title ?? 'Result'}</div>
              <div className="result-cuisine">{r.payload.cuisine}</div>
              <div className="result-text">{r.payload.text}</div>
              <ScoreBar score={r.score} max={maxScore} color="#7c3aed" />
            </motion.div>
          ))}
        </AnimatePresence>
      )}
    </div>
  )
}

// ── Concept breakdown types ──────────────────────────────────────────────────

interface ConceptsData {
  concepts: string[]
  breakdown: Record<string, Record<string, number>>
}

// ── Image search results ─────────────────────────────────────────────────────

function ConceptBreakdown({ filename, concepts, breakdown }: {
  filename: string
  concepts: string[]
  breakdown: Record<string, Record<string, number>>
}) {
  const scores = breakdown[filename]
  if (!scores) return null
  const max = Math.max(...concepts.map(c => scores[c] ?? 0))
  const min = Math.min(...concepts.map(c => scores[c] ?? 0))
  const range = max - min + 0.001

  return (
    <div className="concept-chips">
      {concepts.map(concept => {
        const score = scores[concept] ?? 0
        const t = (score - min) / range          // 0 = weakest, 1 = strongest
        const opacity = 0.25 + t * 0.75
        const label = t > 0.75 ? 'strong' : t > 0.4 ? 'moderate' : 'weak'
        return (
          <span
            key={concept}
            className="concept-chip"
            style={{ opacity }}
            title={`${concept}: ${label} match (${score.toFixed(3)})`}
          >
            {concept}
          </span>
        )
      })}
    </div>
  )
}

function ResultStats({ result }: { result: ImageResult }) {
  return (
    <div className="result-stats">
      <div className="result-stat-col">
        <span className="result-stat-value">top {100 - result.percentile}%</span>
        <span className="result-stat-label">of collection</span>
      </div>
      <div className="result-stat-sep" />
      <div className="result-stat-col">
        <span className="result-stat-value">{result.score.toFixed(3)}</span>
        <span className="result-stat-label">
          {result.score_delta === 0 ? 'best match' : `${result.score_delta.toFixed(3)} vs #1`}
        </span>
      </div>
    </div>
  )
}

function ImageResults({ results, query }: { results: ImageResult[]; query: string }) {
  const maxScore = results.length > 0 ? results[0].score : 1
  const [conceptsData, setConceptsData] = useState<ConceptsData | null>(null)

  useEffect(() => {
    if (results.length === 0) return
    fetch(`${API_URL}/search/images/concepts`, {
      method: 'POST',
      headers: { 'Content-Type': 'application/json' },
      body: JSON.stringify({ query, filenames: results.map(r => r.filename) }),
    })
      .then(r => r.json())
      .then(setConceptsData)
  }, [query, results])

  const [hero, ...rest] = results

  return (
    <div className="image-results-full">
      <div className="image-results-header">
        <div className="column-header-top">
          <span className="column-title image-results-title">Visual Semantic Search</span>
          <span className="column-badge image-results-badge">CLIP ViT-B/32</span>
        </div>
        <span className="column-desc">
          Text query embedded into CLIP's shared vision-language space — no filenames, no tags, pure visual semantics.
        </span>
      </div>

      {/* Hero card — top match */}
      {hero && (
        <motion.div className="image-hero-card"
          initial={{ opacity: 0, y: 20 }} animate={{ opacity: 1, y: 0 }}
          transition={{ duration: 0.4 }}>
          <div className="image-hero-rank">#1 Best Match</div>
          <img src={`${API_URL}/images/${hero.filename}`} alt={hero.title} className="image-hero-thumb" />
          <div className="image-hero-meta">
            <span className="image-hero-title">{hero.title}</span>
            <ResultStats result={hero} />
            {conceptsData && (
              <ConceptBreakdown filename={hero.filename} concepts={conceptsData.concepts} breakdown={conceptsData.breakdown} />
            )}
          </div>
        </motion.div>
      )}

      {/* Rest — horizontal row */}
      {rest.length > 0 && (
        <div className="image-rest-row">
          {rest.map((r, i) => (
            <motion.div key={r.filename} className="image-rest-card"
              initial={{ opacity: 0, y: 16 }} animate={{ opacity: 1, y: 0 }}
              transition={{ duration: 0.3, delay: 0.1 + i * 0.06 }}>
              <div className="image-rank">#{i + 2}</div>
              <img src={`${API_URL}/images/${r.filename}`} alt={r.title} className="image-rest-thumb" />
              <div className="image-rest-meta">
                <span className="image-rest-title">{r.title}</span>
                <ResultStats result={r} />
                {conceptsData && (
                  <ConceptBreakdown filename={r.filename} concepts={conceptsData.concepts} breakdown={conceptsData.breakdown} />
                )}
              </div>
            </motion.div>
          ))}
        </div>
      )}
    </div>
  )
}

// ── Main App ─────────────────────────────────────────────────────────────────

export default function App() {
  const [mode, setMode] = useState<'recipes' | 'images'>('recipes')

  // Recipe state
  const [recipeQuery, setRecipeQuery] = useState('')
  const [recipeLoading, setRecipeLoading] = useState(false)
  const [recipeResults, setRecipeResults] = useState<SearchResponse | null>(null)
  const [threshold, setThreshold] = useState(0.20)

  // Image state
  const [imageQuery, setImageQuery] = useState('')
  const [imageLoading, setImageLoading] = useState(false)
  const [imageResults, setImageResults] = useState<ImageSearchResponse | null>(null)
  const [imageSearchMs, setImageSearchMs] = useState<number | null>(null)

  async function handleRecipeSearch(q = recipeQuery, t = threshold) {
    if (!q.trim()) return
    setRecipeLoading(true)
    setRecipeResults(null)
    try {
      const res = await fetch(`${API_URL}/search`, {
        method: 'POST',
        headers: { 'Content-Type': 'application/json' },
        body: JSON.stringify({ query: q, collection: 'recipes', limit: 5, score_threshold: t }),
      })
      setRecipeResults(await res.json())
    } finally {
      setRecipeLoading(false)
    }
  }

  async function handleImageSearch(q = imageQuery) {
    if (!q.trim()) return
    setImageLoading(true)
    setImageResults(null)
    setImageSearchMs(null)
    const t0 = performance.now()
    try {
      const res = await fetch(`${API_URL}/search/images`, {
        method: 'POST',
        headers: { 'Content-Type': 'application/json' },
        body: JSON.stringify({ query: q, limit: 6 }),
      })
      setImageResults(await res.json())
      setImageSearchMs(Math.round(performance.now() - t0))
    } finally {
      setImageLoading(false)
    }
  }

  function handleThreshold(val: number) {
    setThreshold(val)
    if (recipeQuery.trim()) handleRecipeSearch(recipeQuery, val)
  }

  return (
    <div className="app">
      <header className="header">
        <h1>Search Arena</h1>
        <p>Semantic vs Keyword — see the difference in real time</p>
      </header>

      {/* Mode tabs */}
      <div className="mode-tabs">
        <button
          className={`mode-tab ${mode === 'recipes' ? 'active' : ''}`}
          onClick={() => setMode('recipes')}
        >
          Recipe Search
          <span className="mode-tab-sub">text → text</span>
        </button>
        <button
          className={`mode-tab ${mode === 'images' ? 'active' : ''}`}
          onClick={() => setMode('images')}
        >
          Image Search
          <span className="mode-tab-sub">text → image</span>
        </button>
      </div>

      {/* ── Recipe mode ── */}
      {mode === 'recipes' && (
        <>
          <form className="search-form" onSubmit={(e) => { e.preventDefault(); handleRecipeSearch() }}>
            <input className="search-input" value={recipeQuery}
              onChange={(e) => setRecipeQuery(e.target.value)}
              placeholder="Try: I have a hangover…" />
            <button className="search-btn" disabled={recipeLoading}>
              {recipeLoading ? 'Searching…' : 'Search'}
            </button>
          </form>

          {!recipeResults && !recipeLoading && (
            <div className="empty-state">
              <p style={{ marginBottom: 16, color: '#6b6b8a' }}>Try one of these:</p>
              <div style={{ display: 'flex', flexWrap: 'wrap', gap: 8, justifyContent: 'center' }}>
                {RECIPE_SUGGESTIONS.map((s) => (
                  <button key={s} className="suggestion-chip"
                    onClick={() => { setRecipeQuery(s); handleRecipeSearch(s, threshold) }}>
                    {s}
                  </button>
                ))}
              </div>
            </div>
          )}

          {recipeResults && (
            <div className="threshold-bar">
              <span className="threshold-label">Similarity threshold</span>
              {THRESHOLDS.map((t) => (
                <button key={t.value}
                  className={`threshold-btn ${threshold === t.value ? 'active' : ''}`}
                  onClick={() => handleThreshold(t.value)}>
                  {t.label}<span className="val">{t.hint}</span>
                </button>
              ))}
            </div>
          )}

          {recipeResults && (
            <div style={{ marginBottom: 32 }}>
              <div style={{ fontSize: '0.75rem', color: '#6b6b8a', textTransform: 'uppercase', letterSpacing: '0.08em', marginBottom: 10 }}>
                Embedding Space — 768D → 3D via PCA &nbsp;·&nbsp; drag to rotate &nbsp;·&nbsp; scroll to zoom
              </div>
              <EmbeddingSpace query={recipeResults.query} threshold={threshold} />
            </div>
          )}

          {recipeResults && (
            <div className="results-grid">
              <ResultColumn
                title="Semantic Search" badge="all-mpnet-base-v2"
                desc="Converts your query into a 768-dim vector and finds the nearest recipes in embedding space — understands meaning, not just words."
                type="semantic" results={recipeResults.semantic} query={recipeResults.query}
              />
              <ResultColumn
                title="Keyword Search" badge="Elasticsearch BM25"
                desc="Tokenizes your query and scores recipes by exact word frequency (BM25). Fast and precise — but blind to meaning."
                type="keyword" results={recipeResults.keyword} query={recipeResults.query}
              />
            </div>
          )}
        </>
      )}

      {/* ── Image mode ── */}
      {mode === 'images' && (
        <>
          <form className="search-form" onSubmit={(e) => { e.preventDefault(); handleImageSearch() }}>
            <input className="search-input" value={imageQuery}
              onChange={(e) => setImageQuery(e.target.value)}
              placeholder="Try: romantic sunset at the beach…" />
            <button className="search-btn" disabled={imageLoading}>
              {imageLoading ? 'Searching…' : 'Search'}
            </button>
          </form>

          {!imageResults && !imageLoading && (
            <div className="empty-state">
              <p style={{ marginBottom: 16, color: '#6b6b8a' }}>Try one of these:</p>
              <div style={{ display: 'flex', flexWrap: 'wrap', gap: 8, justifyContent: 'center' }}>
                {IMAGE_SUGGESTIONS.map((s) => (
                  <button key={s} className="suggestion-chip"
                    onClick={() => { setImageQuery(s); handleImageSearch(s) }}>
                    {s}
                  </button>
                ))}
              </div>
            </div>
          )}


          {imageResults && imageSearchMs !== null && (
            <div className="search-metrics">
              <span className="metric"><span className="metric-value">{imageSearchMs}</span><span className="metric-label">ms</span></span>
              <span className="metric-divider" />
              <span className="metric"><span className="metric-value">{imageResults.total_indexed}</span><span className="metric-label">images searched</span></span>
              <span className="metric-divider" />
              <span className="metric"><span className="metric-value">{imageResults.results.length}</span><span className="metric-label">matched</span></span>
              <span className="metric-divider" />
              <span className="metric"><span className="metric-value">{imageResults.results[0]?.score.toFixed(3)}</span><span className="metric-label">top score</span></span>
            </div>
          )}

          {imageResults && (
            <ImageResults results={imageResults.results} query={imageResults.query} />
          )}
        </>
      )}
    </div>
  )
}
