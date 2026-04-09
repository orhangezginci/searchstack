import { useState, useEffect } from 'react'
import { motion, AnimatePresence } from 'framer-motion'
import EmbeddingSpace from './EmbeddingSpace'
import './App.css'

const API_URL = import.meta.env.VITE_API_URL || 'http://localhost:8000'
const APP_VERSION = '1.8.0'

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
  hybrid: Result[]
}

// ── Image search types ───────────────────────────────────────────────────────

interface ImageResult {
  filename: string
  title: string
  score: number
  percentile: number
  score_delta: number
}

interface UploadTimings {
  embedding_ms: number
  search_ms: number
}

interface ImageSearchResponse {
  query: string
  total_indexed: number
  query_vector?: number[]
  timings?: UploadTimings
  results: ImageResult[]
}

type PipelineStep = 'idle' | 'embedding' | 'searching' | 'explaining' | 'done'

interface PipelineState {
  step: PipelineStep
  timings: {
    embedding_ms?: number
    search_ms?: number
    explain_ms?: number
  }
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

const BENCHMARKS = [
  {
    winner: 'semantic' as const,
    label: 'Semantic Wins',
    query: 'I have the flu',
    why: 'Keyword returns Chocolate Lava Cake at #1 — pure token coincidence. Semantic finds Honey Ginger Tea and Chicken Soup through meaning.',
  },
  {
    winner: 'hybrid' as const,
    label: 'Hybrid Wins',
    query: 'street food quick and spicy',
    why: 'Semantic fixates on "spicy" → Vindaloo. Keyword misfires completely → Noodle Soup. Hybrid finds Pad Thai — ranked in both lists — and correctly promotes the one result both engines agree belongs in the conversation.',
  },
  {
    winner: 'keyword' as const,
    label: 'Keyword Wins',
    query: 'szechuan',
    why: 'A precise technical term with an exact match in the corpus. Keyword is surgical. Semantic adds irrelevant noise.',
  },
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

const COLUMN_COLOR: Record<string, string> = {
  semantic: '#7c3aed',
  hybrid:   '#10b981',
  keyword:  '#ea580c',
}

function ResultColumn({
  title, badge, desc, type, results, query,
}: {
  title: string; badge: string; desc: string
  type: 'semantic' | 'hybrid' | 'keyword'; results: Result[]; query: string
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
              <ScoreBar score={r.score} max={maxScore} color={COLUMN_COLOR[type]} />
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

// ── Pipeline visualizer ──────────────────────────────────────────────────────

const PIPELINE_NODES = [
  { id: 'image',   label: 'Your Image',    sub: 'JPEG · PNG · WEBP',  timingKey: null },
  { id: 'clip',    label: 'CLIP ViT-B/32', sub: '512-dim embedding',  timingKey: 'embedding_ms' },
  { id: 'qdrant',  label: 'Qdrant',        sub: `vector similarity`,   timingKey: 'search_ms' },
  { id: 'vocab',   label: 'Concept Vocab', sub: '28 visual probes',   timingKey: 'explain_ms' },
  { id: 'results', label: 'Results',       sub: 'ranked by vibe',     timingKey: null },
] as const

function nodeStatus(nodeIndex: number, step: PipelineStep): 'done' | 'active' | 'pending' {
  const activeNode = { embedding: 1, searching: 2, explaining: 3, done: 5, idle: -1 }[step]
  if (nodeIndex < activeNode) return 'done'
  if (nodeIndex === activeNode) return 'active'
  return 'pending'
}

type TooltipRow = { key: string; val: string; green?: boolean; wrap?: boolean }

function getTooltipRows(nodeId: string, state: PipelineState, filename?: string, concepts?: string[]): TooltipRow[] {
  const t = state.timings
  switch (nodeId) {
    case 'image':
      return [
        { key: 'file', val: filename ?? '—' },
        { key: 'formats', val: 'JPEG · PNG · WEBP' },
      ]
    case 'clip':
      return [
        { key: 'model', val: 'ViT-B/32' },
        { key: 'output', val: '512 dims' },
        ...(t.embedding_ms != null ? [{ key: 'embed time', val: `${t.embedding_ms}ms`, green: true }] : []),
        ...(concepts && concepts.length > 0 ? [{ key: 'detected', val: concepts.join(', '), wrap: true }] : []),
      ]
    case 'qdrant':
      return [
        { key: 'metric', val: 'cosine' },
        { key: 'threshold', val: '≥ 0.0' },
        ...(t.search_ms != null ? [{ key: 'search time', val: `${t.search_ms}ms`, green: true }] : []),
      ]
    case 'vocab':
      return [
        { key: 'probes', val: '28 concepts' },
        { key: 'cached', val: 'Redis TTL ∞' },
        ...(t.explain_ms != null ? [{ key: 'explain time', val: `${t.explain_ms}ms`, green: true }] : []),
      ]
    case 'results':
      return [
        { key: 'ranked by', val: 'cosine sim' },
        { key: 'score', val: '0 – 1' },
      ]
    default:
      return []
  }
}

function PipelineVisualizer({ state, filename, concepts }: { state: PipelineState; filename?: string; concepts?: string[] }) {
  const isActive = state.step !== 'idle' && state.step !== 'done'
  return (
    <div className={`pipeline ${isActive ? 'pipeline-processing' : ''} ${state.step === 'done' ? 'pipeline-complete' : ''}`}>
      <div className="pipeline-header">
        <span className="pipeline-title">Ingestion Pipeline</span>
        {state.step === 'done' && (
          <span className="pipeline-total">
            {((state.timings.embedding_ms ?? 0) + (state.timings.search_ms ?? 0) + (state.timings.explain_ms ?? 0))}ms total
          </span>
        )}
      </div>
      <div className="pipeline-track">
        {PIPELINE_NODES.map((node, i) => {
          const status = nodeStatus(i, state.step)
          const timing = node.timingKey ? state.timings[node.timingKey as keyof typeof state.timings] : null
          const tooltipRows = getTooltipRows(node.id, state, filename, concepts)
          return (
            <div key={node.id} className="pipeline-node-group">
              <motion.div
                className={`pipeline-node pipeline-node-${status}`}
                animate={status === 'active' ? { boxShadow: ['0 0 0px rgba(124,58,237,0)', '0 0 16px rgba(124,58,237,0.6)', '0 0 0px rgba(124,58,237,0)'] } : {}}
                transition={{ duration: 1.2, repeat: Infinity }}
              >
                <span className="pipeline-node-label">{node.label}</span>
                <span className="pipeline-node-sub">{node.sub}</span>
                {status === 'active' && <span className="pipeline-node-spinner" />}
                {status === 'done' && timing && (
                  <span className="pipeline-node-timing">{timing}ms</span>
                )}
                {status === 'done' && !timing && i > 0 && (
                  <span className="pipeline-node-check">✓</span>
                )}
                {tooltipRows.length > 0 && (
                  <div className="pipeline-tooltip">
                    {tooltipRows.map(row => (
                      <div key={row.key} className={`pipeline-tooltip-row${row.wrap ? ' wrap' : ''}`}>
                        <span className="pipeline-tooltip-key">{row.key}</span>
                        <span className={`pipeline-tooltip-val${row.green ? ' green' : ''}`}>{row.val}</span>
                      </div>
                    ))}
                  </div>
                )}
              </motion.div>
              {i < PIPELINE_NODES.length - 1 && (
                <div className={`pipeline-connector pipeline-connector-${status === 'done' ? 'done' : status === 'active' ? 'active' : 'pending'}`}>
                  <div className="pipeline-connector-line" />
                  {status === 'active' && [0, 1, 2].map(j => (
                    <div key={j} className="pipeline-connector-dot" style={{ animationDelay: `${j * 0.4}s` }} />
                  ))}
                  <span className="pipeline-connector-arrow">›</span>
                </div>
              )}
            </div>
          )
        })}
      </div>
    </div>
  )
}

// ── Image search results ─────────────────────────────────────────────────────

function ConceptBreakdown({ filename, concepts, breakdown, onConceptClick }: {
  filename: string
  concepts: string[]
  breakdown: Record<string, Record<string, number>>
  onConceptClick?: (concept: string) => void
}) {
  const scores = breakdown[filename]
  if (!scores) return null
  const max = Math.max(...concepts.map(c => scores[c] ?? 0))
  const min = Math.min(...concepts.map(c => scores[c] ?? 0))
  const range = max - min + 0.001

  return (
    <div className="result-explanation">
      <span className="result-explanation-label">Matched on</span>
      {concepts.map(concept => {
        const score = scores[concept] ?? 0
        const t = (score - min) / range
        const opacity = 0.25 + t * 0.75
        return (
          <button
            key={concept}
            className="result-explanation-tag"
            style={{ opacity }}
            title={`${concept}: ${score.toFixed(3)}`}
            onClick={() => onConceptClick?.(concept)}
          >
            {concept}
          </button>
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

function ImageResultCard({ result, rank, isHero, conceptsData, explanations, onConceptClick }: {
  result: ImageResult
  rank: number
  isHero?: boolean
  conceptsData?: ConceptsData | null
  explanations?: Record<string, string>
  onConceptClick?: (concept: string) => void
}) {
  const explanation = explanations?.[result.filename]
  const concepts = explanation
    ? explanation.replace('Matched on: ', '').split(', ')
    : null

  if (isHero) {
    return (
      <motion.div className="image-hero-card"
        initial={{ opacity: 0, y: 20 }} animate={{ opacity: 1, y: 0 }}
        transition={{ duration: 0.4 }}>
        <div className="image-hero-rank">#1 Best Match</div>
        <img src={`${API_URL}/images/${result.filename}`} alt={result.title} className="image-hero-thumb" />
        <div className="image-hero-meta">
          <span className="image-hero-title">{result.title}</span>
          <ResultStats result={result} />
          {concepts && (
            <div className="result-explanation">
              <span className="result-explanation-label">Matched on</span>
              {concepts.map(c => (
                <button key={c} className="result-explanation-tag" onClick={() => onConceptClick?.(c)}>{c}</button>
              ))}
            </div>
          )}
          {conceptsData && (
            <ConceptBreakdown filename={result.filename} concepts={conceptsData.concepts} breakdown={conceptsData.breakdown} onConceptClick={onConceptClick} />
          )}
        </div>
      </motion.div>
    )
  }

  return (
    <motion.div className="image-rest-card"
      initial={{ opacity: 0, y: 16 }} animate={{ opacity: 1, y: 0 }}
      transition={{ duration: 0.3, delay: rank * 0.06 }}>
      <div className="image-rank">#{rank + 1}</div>
      <img src={`${API_URL}/images/${result.filename}`} alt={result.title} className="image-rest-thumb" />
      <div className="image-rest-meta">
        <span className="image-rest-title">{result.title}</span>
        <ResultStats result={result} />
        {concepts && (
          <div className="result-explanation">
            <span className="result-explanation-label">Matched on</span>
            {concepts.map(c => (
              <button key={c} className="result-explanation-tag" onClick={() => onConceptClick?.(c)}>{c}</button>
            ))}
          </div>
        )}
        {conceptsData && (
          <ConceptBreakdown filename={result.filename} concepts={conceptsData.concepts} breakdown={conceptsData.breakdown} onConceptClick={onConceptClick} />
        )}
      </div>
    </motion.div>
  )
}

function ImageResults({ results, query, explanations, onConceptClick }: {
  results: ImageResult[]
  query: string
  explanations?: Record<string, string>
  onConceptClick?: (concept: string) => void
}) {
  const [conceptsData, setConceptsData] = useState<ConceptsData | null>(null)

  useEffect(() => {
    if (results.length === 0 || explanations !== undefined) {
      setConceptsData(null)
      return
    }
    fetch(`${API_URL}/search/images/concepts`, {
      method: 'POST',
      headers: { 'Content-Type': 'application/json' },
      body: JSON.stringify({ query, filenames: results.map(r => r.filename) }),
    })
      .then(r => r.json())
      .then(setConceptsData)
  }, [query, results, explanations])

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

      {hero && (
        <ImageResultCard result={hero} rank={0} isHero conceptsData={conceptsData} explanations={explanations} onConceptClick={onConceptClick} />
      )}

      {rest.length > 0 && (
        <div className="image-rest-row">
          {rest.map((r, i) => (
            <ImageResultCard key={r.filename} result={r} rank={i + 1} conceptsData={conceptsData} explanations={explanations} onConceptClick={onConceptClick} />
          ))}
        </div>
      )}
    </div>
  )
}

// ── Main App ─────────────────────────────────────────────────────────────────

export default function App() {
  const [mode, setMode] = useState<'recipes' | 'images' | 'upload'>('recipes')

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

  // Upload state
  const [uploadedFile, setUploadedFile] = useState<File | null>(null)
  const [uploadPreviewUrl, setUploadPreviewUrl] = useState<string | null>(null)
  const [uploadResults, setUploadResults] = useState<ImageSearchResponse | null>(null)
  const [uploadSearchMs, setUploadSearchMs] = useState<number | null>(null)
  const [uploadExplanations, setUploadExplanations] = useState<Record<string, string> | null>(null)
  const [dragOver, setDragOver] = useState(false)
  const [pipeline, setPipeline] = useState<PipelineState>({ step: 'idle', timings: {} })

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

  async function handleImageUpload(file: File) {
    setUploadedFile(file)
    setUploadPreviewUrl(URL.createObjectURL(file))
    setUploadResults(null)
    setUploadSearchMs(null)
    setUploadExplanations(null)
    setImageLoading(true)
    const t0 = performance.now()

    try {
      setPipeline({ step: 'embedding', timings: {} })
      const form = new FormData()
      form.append('file', file)
      const res = await fetch(`${API_URL}/search/images/upload`, { method: 'POST', body: form })
      const data: ImageSearchResponse = await res.json()
      setUploadResults(data)
      setUploadSearchMs(Math.round(performance.now() - t0))

      const timings = data.timings ?? { embedding_ms: 0, search_ms: 0 }
      setPipeline({ step: 'searching', timings })
      // brief pause so the user sees the searching step light up
      await new Promise(r => setTimeout(r, 300))

      if (data.query_vector && data.results.length > 0) {
        setPipeline({ step: 'explaining', timings })
        const explainRes = await fetch(`${API_URL}/search/images/upload/explain`, {
          method: 'POST',
          headers: { 'Content-Type': 'application/json' },
          body: JSON.stringify({
            query_vector: data.query_vector,
            filenames: data.results.map(r => r.filename),
          }),
        })
        const explainData = await explainRes.json()
        setUploadExplanations(explainData.explanations)
        setPipeline({ step: 'done', timings: { ...timings, explain_ms: explainData.explain_ms } })
      } else {
        setPipeline({ step: 'done', timings })
      }
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
        <span className="version-badge">v{APP_VERSION}</span>
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
        <button
          className={`mode-tab ${mode === 'upload' ? 'active' : ''}`}
          onClick={() => { setMode('upload'); setPipeline({ step: 'idle', timings: {} }) }}
        >
          Upload
          <span className="mode-tab-sub">image → similar</span>
        </button>
      </div>

      {/* ── Recipe mode ── */}
      {mode === 'recipes' && (
        <>
          <div className="benchmark-strip">
            {BENCHMARKS.map((b) => (
              <button key={b.query} className={`benchmark-card benchmark-${b.winner}`}
                onClick={() => { setRecipeQuery(b.query); handleRecipeSearch(b.query, threshold) }}>
                <span className={`benchmark-badge benchmark-badge-${b.winner}`}>{b.label}</span>
                <span className="benchmark-query">"{b.query}"</span>
                <span className="benchmark-why">{b.why}</span>
              </button>
            ))}
          </div>

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
                title="Hybrid Search" badge="RRF 70/30"
                desc="Combines semantic and keyword rankings via Reciprocal Rank Fusion — 70% semantic weight, 30% keyword. Best of both worlds."
                type="hybrid" results={recipeResults.hybrid} query={recipeResults.query}
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
            <ImageResults
              results={imageResults.results}
              query={imageResults.query}
              onConceptClick={(concept) => {
                setImageQuery(concept)
                handleImageSearch(concept)
              }}
            />
          )}
        </>
      )}

      {/* ── Upload mode ── */}
      {mode === 'upload' && (
        <>
          <div
            className={`upload-zone ${dragOver ? 'drag-over' : ''} ${uploadedFile ? 'has-file' : ''}`}
            onDragOver={(e) => { e.preventDefault(); setDragOver(true) }}
            onDragLeave={() => setDragOver(false)}
            onDrop={(e) => {
              e.preventDefault()
              setDragOver(false)
              const file = e.dataTransfer.files[0]
              if (file && file.type.startsWith('image/')) handleImageUpload(file)
            }}
            onClick={() => document.getElementById('upload-input')?.click()}
          >
            <input
              id="upload-input"
              type="file"
              accept="image/*"
              style={{ display: 'none' }}
              onChange={(e) => {
                const file = e.target.files?.[0]
                if (file) handleImageUpload(file)
              }}
            />
            {uploadPreviewUrl ? (
              <div className="upload-preview">
                <img src={uploadPreviewUrl} alt="uploaded" className="upload-preview-img" />
                <span className="upload-preview-name">{uploadedFile?.name}</span>
              </div>
            ) : (
              <div className="upload-placeholder">
                <span className="upload-icon">↑</span>
                <span className="upload-label">Drop an image or click to browse</span>
                <span className="upload-hint">CLIP embeds your image and finds visually similar photos from the collection</span>
              </div>
            )}
          </div>

          {pipeline.step !== 'idle' && (() => {
            const detectedConcepts = uploadExplanations
              ? [...new Set(
                  Object.values(uploadExplanations)
                    .flatMap(s => s.replace('Matched on:', '').split(',').map(c => c.trim()).filter(Boolean))
                )]
              : undefined
            return <PipelineVisualizer state={pipeline} filename={uploadedFile?.name} concepts={detectedConcepts} />
          })()}

          {uploadResults && uploadSearchMs !== null && (
            <div className="search-metrics">
              <span className="metric"><span className="metric-value">{uploadSearchMs}</span><span className="metric-label">ms</span></span>
              <span className="metric-divider" />
              <span className="metric"><span className="metric-value">{uploadResults.total_indexed}</span><span className="metric-label">images searched</span></span>
              <span className="metric-divider" />
              <span className="metric"><span className="metric-value">{uploadResults.results.length}</span><span className="metric-label">matched</span></span>
              <span className="metric-divider" />
              <span className="metric"><span className="metric-value">{uploadResults.results[0]?.score.toFixed(3)}</span><span className="metric-label">top score</span></span>
            </div>
          )}

          {uploadResults && uploadExplanations && (
            <ImageResults
              results={uploadResults.results}
              query={uploadResults.query}
              explanations={uploadExplanations}
              onConceptClick={(concept) => {
                setMode('images')
                setImageQuery(concept)
                handleImageSearch(concept)
              }}
            />
          )}
        </>
      )}

      <footer className="app-footer">v{APP_VERSION}</footer>
    </div>
  )
}
