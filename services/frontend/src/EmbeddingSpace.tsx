import { useEffect, useRef, useState, useMemo } from 'react'
import { Canvas, useFrame } from '@react-three/fiber'
import { OrbitControls, Text, Sphere } from '@react-three/drei'
import * as THREE from 'three'

const API_URL = import.meta.env.VITE_API_URL || 'http://localhost:8000'

interface Doc {
  id: string
  payload: { title?: string; cuisine?: string }
  x: number
  y: number
  z: number
  score: number | null
}

interface PositionsData {
  docs: Doc[]
  query?: { x: number; y: number; z: number }
}

// Center all coords on the query position
function centered(docs: Doc[] | undefined, query: { x: number; y: number; z: number } | undefined) {
  if (!docs) return []
  if (!query) return docs.map(d => ({ ...d, cx: d.x * 5, cy: d.y * 5, cz: d.z * 5 }))
  return docs.map(d => ({
    ...d,
    cx: (d.x - query.x) * 5,
    cy: (d.y - query.y) * 5,
    cz: (d.z - query.z) * 5,
  }))
}

// Heatmap: cold blue → amber → hot red, t is normalized 0–1 within the current result set
const COLD     = new THREE.Color('#1d4ed8')
const WARM     = new THREE.Color('#f59e0b')
const HOT      = new THREE.Color('#ff2200')
const UNSCORED = new THREE.Color('#374151')

function heatColor(t: number): THREE.Color {
  if (t < 0.5) return new THREE.Color().lerpColors(COLD, WARM, t * 2)
  return new THREE.Color().lerpColors(WARM, HOT, (t - 0.5) * 2)
}

// ── Stars background ──────────────────────────────────────────────────────────
function Stars() {
  const points = useRef<THREE.Points>(null!)
  const geo = useMemo(() => {
    const g = new THREE.BufferGeometry()
    const count = 600
    const pos = new Float32Array(count * 3)
    for (let i = 0; i < count * 3; i++) pos[i] = (Math.random() - 0.5) * 40
    g.setAttribute('position', new THREE.BufferAttribute(pos, 3))
    return g
  }, [])
  return (
    <points ref={points} geometry={geo}>
      <pointsMaterial size={0.03} color="#ffffff" transparent opacity={0.25} />
    </points>
  )
}

// ── Dot ───────────────────────────────────────────────────────────────────────
function RecipeDot({ pos, normalizedScore, isTop, title, onHover }: {
  pos: [number, number, number]
  normalizedScore: number | null  // 0–1 relative to current result set
  isTop: boolean
  title: string
  onHover: (t: string | null, pos: [number, number, number] | null) => void
}) {
  const mesh = useRef<THREE.Mesh>(null!)
  const matRef = useRef<THREE.MeshStandardMaterial>(null!)
  const color = normalizedScore === null ? UNSCORED : heatColor(normalizedScore)
  const baseScale = normalizedScore === null ? 1.0 : 1.0 + normalizedScore * 0.6
  const baseIntensity = normalizedScore === null ? 0.15 : 0.4 + normalizedScore * 1.2

  useFrame(({ clock }) => {
    if (!matRef.current) return
    if (isTop) {
      matRef.current.emissiveIntensity = baseIntensity + Math.sin(clock.getElapsedTime() * 4) * 1.2
    }
  })

  return (
    <mesh
      ref={mesh}
      position={pos}
      scale={baseScale}
      onPointerOver={e => { e.stopPropagation(); onHover(title, pos) }}
      onPointerOut={() => onHover(null, null)}
    >
      <sphereGeometry args={[0.07, 16, 16]} />
      <meshStandardMaterial
        ref={matRef}
        color={color}
        emissive={color}
        emissiveIntensity={baseIntensity}
      />
    </mesh>
  )
}

// ── Query dot at center ────────────────────────────────────────────────────────
function QueryDot() {
  const mesh = useRef<THREE.Mesh>(null!)
  const ring = useRef<THREE.Mesh>(null!)

  useFrame(({ clock }) => {
    const t = clock.getElapsedTime()
    if (mesh.current) mesh.current.scale.setScalar(1 + Math.sin(t * 2.5) * 0.12)
    if (ring.current) ring.current.rotation.y = t * 0.8
  })

  return (
    <group position={[0, 0, 0]}>
      {/* Core */}
      <mesh ref={mesh}>
        <sphereGeometry args={[0.14, 32, 32]} />
        <meshStandardMaterial color="#f9a8d4" emissive="#ec4899" emissiveIntensity={2} />
      </mesh>
      {/* Rotating ring */}
      <mesh ref={ring} rotation={[Math.PI / 4, 0, 0]}>
        <torusGeometry args={[0.26, 0.015, 12, 60]} />
        <meshStandardMaterial color="#f472b6" emissive="#f472b6" emissiveIntensity={1.5} transparent opacity={0.7} />
      </mesh>
    </group>
  )
}

// ── Threshold sphere ──────────────────────────────────────────────────────────
function ThresholdSphere({ docs, threshold }: {
  docs: (Doc & { cx: number; cy: number; cz: number })[]
  threshold: number
}) {
  const outerRef = useRef<THREE.Mesh>(null!)
  const wireRef = useRef<THREE.Mesh>(null!)

  // Radius = max 3D distance of passing docs from center (query)
  const targetRadius = useMemo(() => {
    const passing = docs.filter(d => d.score !== null && d.score >= threshold)
    if (passing.length === 0) return 0.5
    const max = Math.max(...passing.map(d =>
      new THREE.Vector3(d.cx, d.cy, d.cz).length()
    ))
    return max + 0.25
  }, [docs, threshold])

  const currentRadius = useRef(targetRadius)

  useFrame(({ clock }) => {
    currentRadius.current += (targetRadius - currentRadius.current) * 0.06
    const r = currentRadius.current
    if (outerRef.current) outerRef.current.scale.setScalar(r)
    if (wireRef.current) {
      wireRef.current.scale.setScalar(r)
      wireRef.current.rotation.y = clock.getElapsedTime() * 0.12
    }
  })

  return (
    <group>
      {/* Solid translucent fill */}
      <mesh ref={outerRef}>
        <sphereGeometry args={[1, 48, 48]} />
        <meshStandardMaterial
          color="#7c3aed"
          transparent
          opacity={0.06}
          side={THREE.BackSide}
          depthWrite={false}
        />
      </mesh>
      {/* Wireframe shell */}
      <mesh ref={wireRef}>
        <sphereGeometry args={[1, 18, 18]} />
        <meshBasicMaterial
          color="#a78bfa"
          wireframe
          transparent
          opacity={0.18}
        />
      </mesh>
    </group>
  )
}

// ── Hover label ───────────────────────────────────────────────────────────────
function HoverLabel({ title, pos }: { title: string; pos: [number, number, number] }) {
  return (
    <Text
      position={[pos[0], pos[1] + 0.22, pos[2]]}
      fontSize={0.1}
      color="#e2e2f0"
      anchorX="center"
      anchorY="bottom"
      outlineWidth={0.012}
      outlineColor="#000000"
      renderOrder={1}
    >
      {title}
    </Text>
  )
}

// ── Scene ─────────────────────────────────────────────────────────────────────
function Scene({ data, threshold }: { data: PositionsData; threshold: number }) {
  const [hovered, setHovered] = useState<{ title: string; pos: [number, number, number] } | null>(null)

  const centeredDocs = useMemo(() => {
    const all = centered(data.docs, data.query)
    const withScore = all.filter(d => d.score !== null)
    const withoutScore = all.filter(d => d.score === null)
    const top10 = [...withScore].sort((a, b) => (b.score ?? 0) - (a.score ?? 0)).slice(0, 10)
    return [...top10, ...withoutScore.slice(0, 2)]
  }, [data])

  // Normalize scores relative to this result set so gradient spans the full range
  const { minScore, maxScore } = useMemo(() => {
    const scores = centeredDocs.map(d => d.score).filter((s): s is number => s !== null)
    return scores.length === 0
      ? { minScore: 0, maxScore: 1 }
      : { minScore: Math.min(...scores), maxScore: Math.max(...scores) }
  }, [centeredDocs])

  const topId = centeredDocs[0]?.score !== null ? centeredDocs[0]?.id : null

  return (
    <>
      <color attach="background" args={['#08080f']} />
      <ambientLight intensity={0.4} />
      <pointLight position={[4, 4, 4]} intensity={1.5} color="#c084fc" />
      <pointLight position={[-4, -2, -4]} intensity={0.8} color="#60a5fa" />

      <Stars />

      {centeredDocs.map(doc => {
        const range = maxScore - minScore
        const normalizedScore = doc.score === null ? null
          : range < 0.001 ? 1
          : (doc.score - minScore) / range
        return (
          <RecipeDot
            key={doc.id}
            pos={[doc.cx, doc.cy, doc.cz]}
            normalizedScore={normalizedScore}
            isTop={doc.id === topId}
            title={doc.payload.title ?? doc.payload.filename ?? 'Item'}
            onHover={(t, p) => setHovered(t && p ? { title: t, pos: p } : null)}
          />
        )
      })}

      {data.query && (
        <>
          <QueryDot />
          <ThresholdSphere docs={centeredDocs} threshold={threshold} />
        </>
      )}

      {hovered && <HoverLabel title={hovered.title} pos={hovered.pos} />}

      <OrbitControls
        enablePan={false}
        minDistance={2}
        maxDistance={12}
        autoRotate
        autoRotateSpeed={0.5}
      />
    </>
  )
}

// ── Main export ───────────────────────────────────────────────────────────────
export default function EmbeddingSpace({ query, threshold, collection = 'recipes' }: {
  query: string
  threshold: number
  collection?: 'recipes' | 'images'
}) {
  const [data, setData] = useState<PositionsData | null>(null)
  const [loading, setLoading] = useState(false)

  const endpoint = collection === 'images' ? '/positions/images' : '/positions'

  useEffect(() => {
    if (!query) return
    setLoading(true)
    fetch(`${API_URL}${endpoint}`, {
      method: 'POST',
      headers: { 'Content-Type': 'application/json' },
      body: JSON.stringify({ query, collection }),
    })
      .then(r => r.json())
      .then(setData)
      .finally(() => setLoading(false))
  }, [query])

  return (
    <div style={{
      width: '100%', height: '460px',
      borderRadius: '16px', border: '1px solid #1e1e32',
      overflow: 'hidden', position: 'relative',
      background: '#08080f',
    }}>
      {/* Legend */}
      <div style={{
        position: 'absolute', top: 12, left: 16, zIndex: 10,
        fontSize: '0.7rem', color: '#6b6b8a', pointerEvents: 'none',
        display: 'flex', gap: 16,
      }}>
        <span style={{ color: '#f472b6' }}>● your query</span>
        <span style={{ color: '#ef4444' }}>● hot</span>
        <span style={{ color: '#f59e0b' }}>● warm</span>
        <span style={{ color: '#2563eb' }}>● cold</span>
        <span style={{ color: '#a78bfa', opacity: 0.6 }}>○ threshold</span>
      </div>

      {/* Hint */}
      <div style={{
        position: 'absolute', bottom: 12, right: 16, zIndex: 10,
        fontSize: '0.68rem', color: '#44445a', pointerEvents: 'none',
      }}>
        drag to rotate · scroll to zoom · hover for title
      </div>

      {loading && (
        <div style={{ position: 'absolute', inset: 0, display: 'flex', alignItems: 'center', justifyContent: 'center', color: '#6b6b8a', fontSize: '0.85rem' }}>
          Computing embedding space…
        </div>
      )}

      {data && (
        <Canvas camera={{ position: [0, 0, 6], fov: 55 }}>
          <Scene data={data} threshold={threshold} />
        </Canvas>
      )}

      {!data && !loading && (
        <div style={{ position: 'absolute', inset: 0, display: 'flex', alignItems: 'center', justifyContent: 'center', color: '#44445a', fontSize: '0.85rem' }}>
          Search something to see the embedding space
        </div>
      )}
    </div>
  )
}
