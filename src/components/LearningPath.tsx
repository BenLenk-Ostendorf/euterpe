import { useCallback, useLayoutEffect, useRef, useState } from 'react'
import {
  TIERS,
  ALL_SKILLS,
  CATEGORIES,
  CATEGORY_COLOR,
  type ChallengeId,
  type Skill,
} from '../music/learningPath'

interface Edge {
  from: string
  to: string
  d: string
}

const FAINT = 'rgba(239,230,214,0.16)'

export default function LearningPath({
  onStartChallenge,
}: {
  onStartChallenge?: (id: ChallengeId) => void
}) {
  const graphRef = useRef<HTMLDivElement | null>(null)
  const nodeRefs = useRef<Map<string, HTMLElement>>(new Map())
  const [edges, setEdges] = useState<Edge[]>([])
  const [size, setSize] = useState({ w: 0, h: 0 })
  const [hovered, setHovered] = useState<string | null>(null)
  const [selected, setSelected] = useState<Skill | null>(null)

  const setNodeRef = useCallback(
    (id: string) => (el: HTMLElement | null) => {
      if (el) nodeRefs.current.set(id, el)
      else nodeRefs.current.delete(id)
    },
    [],
  )

  // Kanten aus den gemessenen DOM-Positionen rechnen — robust gegen Umbruch.
  const measure = useCallback(() => {
    const graph = graphRef.current
    if (!graph) return
    const origin = graph.getBoundingClientRect()
    const next: Edge[] = []

    for (const skill of ALL_SKILLS) {
      const target = nodeRefs.current.get(skill.id)
      if (!target || skill.deps.length === 0) continue
      const tr = target.getBoundingClientRect()

      skill.deps.forEach((depId, i) => {
        const source = nodeRefs.current.get(depId)
        if (!source) return
        const sr = source.getBoundingClientRect()

        const sx = sr.left - origin.left + sr.width / 2
        const sy = sr.bottom - origin.top
        // Eingangspunkte am Ziel auffächern, damit Pfeile sich nicht stapeln.
        const tx =
          tr.left - origin.left + (tr.width * (i + 1)) / (skill.deps.length + 1)
        const ty = tr.top - origin.top - 2
        const my = (sy + ty) / 2

        next.push({
          from: depId,
          to: skill.id,
          d: `M${sx},${sy} C${sx},${my} ${tx},${my} ${tx},${ty}`,
        })
      })
    }

    setEdges(next)
    setSize({ w: graph.offsetWidth, h: graph.offsetHeight })
  }, [])

  useLayoutEffect(() => {
    measure()
    const graph = graphRef.current
    if (!graph || typeof ResizeObserver === 'undefined') return
    const ro = new ResizeObserver(measure)
    ro.observe(graph)
    return () => ro.disconnect()
  }, [measure])

  return (
    <div className="flex w-full flex-col gap-6">
      {/* Legende */}
      <div className="flex flex-wrap items-center justify-center gap-x-5 gap-y-2 text-xs text-bone/70">
        {CATEGORIES.map((c) => (
          <span key={c.cat} className="inline-flex items-center gap-2">
            <span
              className="inline-block h-2.5 w-2.5 rounded-sm"
              style={{ background: c.color }}
            />
            {c.name}
          </span>
        ))}
      </div>
      <p className="text-center text-xs text-bone/40">
        Pfeil = „setzt voraus". Zeig auf ein Ziel, um seine Verbindungen zu
        sehen — tipp es an für die Details.
      </p>

      {/* Graph */}
      <div ref={graphRef} className="relative">
        <svg
          className="pointer-events-none absolute inset-0"
          width={size.w}
          height={size.h}
          viewBox={`0 0 ${size.w} ${size.h}`}
          aria-hidden
        >
          <defs>
            <marker
              id="lp-arrow"
              viewBox="0 0 8 8"
              refX="6.5"
              refY="4"
              markerWidth="6"
              markerHeight="6"
              orient="auto"
            >
              <path d="M0,0 L8,4 L0,8 z" fill="context-stroke" />
            </marker>
          </defs>
          {edges.map((e, i) => {
            const on = hovered === e.from || hovered === e.to
            return (
              <path
                key={i}
                d={e.d}
                fill="none"
                stroke={on ? CATEGORY_COLOR[skillCat(e.from)] : FAINT}
                strokeWidth={on ? 2 : 1.3}
                opacity={hovered && !on ? 0.4 : 1}
                markerEnd="url(#lp-arrow)"
                style={{ transition: 'stroke 0.15s, opacity 0.15s' }}
              />
            )
          })}
        </svg>

        <div className="relative z-10 flex flex-col gap-11">
          {TIERS.map((tier, ti) => (
            <div
              key={ti}
              className="flex flex-wrap items-stretch justify-center gap-4"
            >
              {tier.map((skill) => {
                const isGoal = skill.cat === 'ziel'
                const isSel = selected?.id === skill.id
                const color = CATEGORY_COLOR[skill.cat]
                return (
                  <button
                    key={skill.id}
                    ref={setNodeRef(skill.id)}
                    type="button"
                    onMouseEnter={() => setHovered(skill.id)}
                    onMouseLeave={() => setHovered(null)}
                    onFocus={() => setHovered(skill.id)}
                    onBlur={() => setHovered(null)}
                    onClick={() => setSelected(skill)}
                    className={`ease-soft flex max-w-[210px] flex-1 basis-[150px] items-center rounded-xl border px-3 py-2.5 text-left text-[13px] leading-snug text-bone transition-all duration-150 hover:-translate-y-0.5 ${
                      isGoal ? 'justify-center text-center font-display' : ''
                    }`}
                    style={{
                      borderTopColor: isSel ? color : 'rgba(239,230,214,0.12)',
                      borderRightColor: isSel
                        ? color
                        : 'rgba(239,230,214,0.12)',
                      borderBottomColor: isSel
                        ? color
                        : 'rgba(239,230,214,0.12)',
                      borderLeftWidth: isGoal ? 1 : 4,
                      borderLeftColor: color,
                      background: isGoal
                        ? 'rgba(240,212,154,0.10)'
                        : isSel
                          ? 'rgba(47,38,31,0.9)'
                          : 'rgba(36,29,24,0.55)',
                      boxShadow: isSel ? `0 0 18px ${color}40` : 'none',
                      maxWidth: isGoal ? 360 : undefined,
                      flexBasis: isGoal ? 'auto' : undefined,
                      fontSize: isGoal ? 15 : undefined,
                    }}
                  >
                    {skill.label}
                  </button>
                )
              })}
            </div>
          ))}
        </div>
      </div>

      {/* Detail-Panel */}
      <div
        className="ease-soft min-h-[92px] rounded-xl border border-bone/10 bg-ink-800/50 p-4 transition-all duration-200"
        aria-live="polite"
      >
        {selected ? (
          <div className="flex flex-col gap-1.5">
            <div className="flex items-center gap-2">
              <span
                className="inline-block h-2.5 w-2.5 rounded-sm"
                style={{ background: CATEGORY_COLOR[selected.cat] }}
              />
              <span className="text-xs uppercase tracking-wider text-bone/45">
                {CATEGORIES.find((c) => c.cat === selected.cat)?.name}
              </span>
            </div>
            <h3 className="font-display text-xl text-amber-soft">
              {selected.label}
            </h3>
            <p className="text-sm leading-relaxed text-bone/75">
              {selected.detail}
            </p>
            {selected.challenge && onStartChallenge && (
              <button
                type="button"
                onClick={() => onStartChallenge(selected.challenge!)}
                className="ease-soft mt-1 w-fit rounded-full border border-amber-glow/50 bg-ink-700/70 px-4 py-1.5 text-sm text-amber-soft transition-all hover:border-amber-glow hover:bg-ink-600"
              >
                ▶ Challenge starten
              </button>
            )}
          </div>
        ) : (
          <p className="text-sm text-bone/40">
            Wähl ein Lernziel aus, um zu sehen, worum es geht und worauf es dabei
            ankommt.
          </p>
        )}
      </div>
    </div>
  )
}

function skillCat(id: string) {
  return ALL_SKILLS.find((s) => s.id === id)?.cat ?? 'mec'
}
