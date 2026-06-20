import { useState } from 'react'
import {
  STRANDS,
  STRAND_COLOR,
  CHALLENGE_LABEL,
  STANDALONE_CHALLENGES,
  NODES,
  PARETO,
  NORDSTERN,
  nodesOf,
  goalsOf,
  type ChallengeId,
  type PathNode,
  type SmallGoal,
} from '../music/learningPath'
import { useProgressStore, type SkillLevel } from '../state/progressStore'

// Farbe der Umrandung nach Fortschritt (nur für Knoten mit progressId).
const RING: Record<'none' | 'available' | SkillLevel, string> = {
  none: 'rgba(239,230,214,0.14)',
  available: 'rgba(239,230,214,0.24)',
  erreicht: 'rgba(155,184,138,0.5)',
  verinnerlicht: 'rgba(155,184,138,0.8)',
  gemeistert: '#9bb88a',
}

interface Detail {
  label: string
  detail: string
  color: string
}

export default function LearningPath({
  onStartChallenge,
  onStartFreeMode,
}: {
  onStartChallenge?: (id: ChallengeId) => void
  onStartFreeMode?: () => void
}) {
  const [selected, setSelected] = useState<Detail | null>(null)
  const progress = useProgressStore((s) => s.progress)
  const resetProgress = useProgressStore((s) => s.reset)

  // Klick: spielbar → starten; sonst Details zeigen.
  const activate = (item: PathNode | SmallGoal) => {
    if (item.challenge && onStartChallenge) return onStartChallenge(item.challenge)
    if (item.free && onStartFreeMode) return onStartFreeMode()
    setSelected({
      label: item.label,
      detail: item.detail,
      color: STRAND_COLOR[item.strand],
    })
  }

  const statusOf = (node: PathNode): 'none' | 'available' | SkillLevel => {
    if (node.progressId && progress[node.progressId]) return progress[node.progressId]
    return node.challenge || node.free ? 'available' : 'none'
  }

  return (
    <div className="flex w-full flex-col gap-6">
      {/* Kopf */}
      <div className="flex flex-wrap items-center justify-between gap-3">
        <p className="max-w-xl text-sm text-bone/55">
          Kein einzelner Aufstieg, sondern vier Stränge, die jeder für sich schon
          Musik machen — und oben im Nordstern zusammenlaufen.
        </p>
        {onStartFreeMode && (
          <button
            type="button"
            onClick={onStartFreeMode}
            className="ease-soft rounded-full border border-amber-glow/40 bg-ink-700/60 px-4 py-1.5 text-sm text-amber-soft transition-all hover:border-amber-glow hover:bg-ink-600"
          >
            ♪ Freier Modus
          </button>
        )}
      </div>

      {/* Legende */}
      <div className="flex flex-wrap items-center justify-center gap-x-5 gap-y-2 text-xs text-bone/55">
        <span className="inline-flex items-center gap-1.5">
          <span style={{ color: '#9bb88a' }}>✓</span> schon in der App
        </span>
        <span className="inline-flex items-center gap-1.5">
          <span className="text-amber-soft">★</span> kleines Ziel (Spaß-Gipfel)
        </span>
        <span className="inline-flex items-center gap-1.5">
          <span style={{ color: '#cf9277' }}>▦</span> läuft nebenher
        </span>
        <span className="inline-flex items-center gap-1.5">
          <span className="text-amber-soft">◆</span> Nordstern
        </span>
        {Object.keys(progress).length > 0 && (
          <button
            type="button"
            onClick={resetProgress}
            className="ease-soft rounded-full border border-bone/15 px-2.5 py-0.5 text-bone/45 transition-colors hover:border-amber-glow/50 hover:text-amber-soft"
          >
            Fortschritt zurücksetzen
          </button>
        )}
      </div>

      {/* Stränge */}
      <div className="flex flex-col gap-3">
        {STRANDS.map((strand) => {
          const nodes = nodesOf(strand.id)
          const goals = goalsOf(strand.id)
          return (
            <section
              key={strand.id}
              className="flex gap-3 rounded-xl border bg-ink-800/40 p-3 sm:gap-4 sm:p-4"
              style={{
                borderColor: strand.nebenher ? `${strand.color}66` : 'rgba(239,230,214,0.08)',
                borderStyle: strand.nebenher ? 'dashed' : 'solid',
              }}
            >
              {/* Strang-Label */}
              <div className="flex w-20 shrink-0 flex-col gap-0.5 sm:w-28">
                <span className="inline-flex items-center gap-1.5">
                  <span
                    className="inline-block h-2.5 w-2.5 rounded-sm"
                    style={{ background: strand.color }}
                  />
                  <span className="font-display text-sm text-bone">{strand.name}</span>
                </span>
                <span className="text-[11px] text-bone/45">{strand.sub}</span>
              </div>

              {/* Inhalt: Checkpoints + kleine Ziele */}
              <div className="flex min-w-0 flex-1 flex-col gap-2.5">
                <div className="flex flex-wrap items-center gap-x-1.5 gap-y-2">
                  {nodes.map((node, i) => {
                    const status = statusOf(node)
                    const launchable =
                      (node.challenge && onStartChallenge) || (node.free && onStartFreeMode)
                    return (
                      <span key={node.id} className="inline-flex items-center">
                        {i > 0 && <span className="mr-1.5 text-bone/25">→</span>}
                        <button
                          type="button"
                          onClick={() => activate(node)}
                          title={
                            node.challenge
                              ? `Übung „${CHALLENGE_LABEL[node.challenge]}" starten`
                              : node.free
                                ? 'Freien Modus starten'
                                : undefined
                          }
                          className="ease-soft flex flex-col items-start rounded-lg border bg-ink-700/50 px-2.5 py-1.5 text-left transition-all duration-150 hover:-translate-y-0.5"
                          style={{
                            borderColor: RING[status],
                            borderLeftWidth: 3,
                            borderLeftColor: strand.color,
                          }}
                        >
                          <span className="flex items-center gap-1 text-[13px] leading-tight text-bone">
                            {launchable && (
                              <span aria-hidden className="text-amber-soft">
                                {node.challenge ? '▶' : '♪'}
                              </span>
                            )}
                            {node.label}
                            {status === 'gemeistert' && (
                              <span aria-hidden style={{ color: '#9bb88a' }} title="gemeistert">
                                ✓
                              </span>
                            )}
                          </span>
                          {node.tag && (
                            <span className="text-[10.5px] leading-tight text-bone/45">
                              {node.challenge && status === 'available' ? '✓ ' : ''}
                              {node.tag}
                            </span>
                          )}
                        </button>
                      </span>
                    )
                  })}
                </div>

                {goals.length > 0 && (
                  <div className="flex flex-wrap items-center gap-1.5">
                    {goals.map((goal) => (
                      <button
                        key={goal.id}
                        type="button"
                        onClick={() => activate(goal)}
                        title={goal.ready ? 'spielbar' : 'kleines Ziel — noch zu bauen'}
                        className="ease-soft inline-flex items-center gap-1 rounded-full border border-amber-glow/40 bg-amber-glow/10 px-2.5 py-1 text-[12px] text-amber-soft transition-all hover:-translate-y-0.5 hover:border-amber-glow"
                        style={{ opacity: goal.ready ? 1 : 0.78 }}
                      >
                        <span aria-hidden>★</span>
                        {goal.label}
                        {goal.free && <span aria-hidden className="text-amber-soft/70">♪</span>}
                      </button>
                    ))}
                  </div>
                )}
              </div>
            </section>
          )
        })}
      </div>

      {/* Pareto-Ziel */}
      <button
        type="button"
        onClick={() => setSelected({ ...PARETO, color: '#e0b15e' })}
        className="ease-soft flex flex-col items-start gap-1 rounded-xl border border-amber-glow/45 bg-amber-glow/10 p-4 text-left transition-all hover:border-amber-glow"
      >
        <span className="inline-flex items-center gap-2">
          <span className="text-amber-soft">★</span>
          <span className="font-display text-base text-amber-soft">
            Pareto-Ziel — der schnelle Spaß
          </span>
        </span>
        <span className="text-sm text-bone/65">
          Bekannte Melodie + 3 Akkorde (I·IV·V) im 4/4, Hände zusammen. 80 % Spaß
          mit 20 % der Fertigkeiten.
        </span>
      </button>

      {/* Nordstern */}
      <button
        type="button"
        onClick={() => setSelected({ ...NORDSTERN, color: '#f0d49a' })}
        className="ease-soft flex flex-col items-center gap-1 rounded-xl border border-amber-glow/60 bg-amber-glow/15 p-4 text-center transition-all hover:border-amber-glow"
      >
        <span className="font-display text-lg text-amber-soft">◆ Nordstern</span>
        <span className="text-sm text-bone/70">
          Aus einer eigenen Melodie ein ganzes Klavierstück selbst spielen — hier
          laufen alle Stränge zusammen.
        </span>
      </button>

      {/* Detail-Panel */}
      <div
        className="ease-soft min-h-[92px] rounded-xl border border-bone/10 bg-ink-800/50 p-4 transition-all duration-200"
        aria-live="polite"
      >
        {selected ? (
          <div className="flex flex-col gap-1.5">
            <h3 className="flex items-center gap-2 font-display text-xl text-amber-soft">
              <span
                className="inline-block h-2.5 w-2.5 rounded-sm"
                style={{ background: selected.color }}
              />
              {selected.label}
            </h3>
            <p className="text-sm leading-relaxed text-bone/75">{selected.detail}</p>
          </div>
        ) : (
          <p className="text-sm text-bone/40">
            Tipp einen Checkpoint, ein ★-Ziel oder den Nordstern an, um zu sehen,
            worum es geht. ▶ startet eine Übung, ♪ den freien Modus.
          </p>
        )}
      </div>

      {/* Liste der spielbaren Übungen */}
      {onStartChallenge && (
        <div className="flex flex-col gap-2">
          <p className="text-xs uppercase tracking-wider text-bone/40">
            Übungen zum Mitspielen
          </p>
          <div className="flex flex-wrap gap-2">
            {NODES.filter((n) => n.challenge).map((n) => (
              <button
                key={n.id}
                type="button"
                onClick={() => onStartChallenge(n.challenge!)}
                className="ease-soft flex items-center gap-2 rounded-full border border-amber-glow/40 bg-ink-700/60 px-4 py-1.5 text-sm text-amber-soft transition-all hover:border-amber-glow hover:bg-ink-600"
              >
                <span aria-hidden>▶</span>
                <span className="font-medium">{CHALLENGE_LABEL[n.challenge!]}</span>
                <span className="text-bone/45">— {n.label}</span>
              </button>
            ))}
            {STANDALONE_CHALLENGES.map((id) => (
              <button
                key={id}
                type="button"
                onClick={() => onStartChallenge(id)}
                className="ease-soft flex items-center gap-2 rounded-full border border-bone/15 bg-ink-700/40 px-4 py-1.5 text-sm text-bone/70 transition-all hover:border-amber-glow/50 hover:text-amber-soft"
              >
                <span aria-hidden>▶</span>
                <span className="font-medium">{CHALLENGE_LABEL[id]}</span>
                <span className="text-bone/40">— Artefakt, noch keinem Strang zugeordnet</span>
              </button>
            ))}
          </div>
        </div>
      )}
    </div>
  )
}
