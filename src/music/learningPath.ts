// Die Lern-Landkarte: KEIN einzelner Aufstieg, sondern mehrere parallele
// Stränge, die jeder für sich schon Musik machen — und oben im Nordstern
// zusammenlaufen. Jeder Strang trägt eigene kleine Spaß-Ziele.
//
// Grundlage: SKILL_DECOMPOSITION.md (Repo-Root). Bewusst ohne Scoring/Punkte —
// reine Orientierung. Fortschritts-Farbe kommt aus progressStore (lokal).

/** Spielbare Challenge (sofern vorhanden). */
export type ChallengeId =
  | 'tastenfinder'
  | 'hoertrainer'
  | 'durmoll'
  | 'akkordgriff'
  | 'notenregen'

export const CHALLENGE_LABEL: Record<ChallengeId, string> = {
  tastenfinder: 'Tastenfinder',
  hoertrainer: 'Hörtrainer',
  durmoll: 'Dur/Moll-Ohr',
  akkordgriff: 'Akkordgriff',
  notenregen: 'Notenregen',
}

// Spielbare Artefakte, die (noch) keinem Strang zugeordnet sind.
export const STANDALONE_CHALLENGES: ChallengeId[] = ['notenregen']

export type StrandId = 'gehoer' | 'improv' | 'akkorde' | 'koord'

export interface Strand {
  id: StrandId
  name: string
  /** Kurzes Schlagwort unter dem Namen. */
  sub: string
  color: string
  /** Koordination läuft als Dauerband „nebenher", nicht als Tor. */
  nebenher?: boolean
}

export const STRANDS: Strand[] = [
  { id: 'gehoer', name: 'Gehör', sub: 'das Ohr', color: '#9bb88a' },
  { id: 'improv', name: 'Improvisation', sub: 'die Sandbox', color: '#e0b15e' },
  { id: 'akkorde', name: 'Akkorde & Begleitung', sub: 'die Hände', color: '#7fa8c9' },
  {
    id: 'koord',
    name: 'Koordination',
    sub: 'läuft nebenher',
    color: '#cf9277',
    nebenher: true,
  },
]

export const STRAND_COLOR: Record<StrandId, string> = STRANDS.reduce(
  (acc, s) => ({ ...acc, [s.id]: s.color }),
  {} as Record<StrandId, string>,
)

/** Ein Checkpoint auf einem Strang. */
export interface PathNode {
  id: string
  strand: StrandId
  label: string
  /** Kleine Beschriftung (z. B. „über Liedanfänge"). */
  tag?: string
  detail: string
  /** Spielbare Übung, die hierher führt. */
  challenge?: ChallengeId
  /** Öffnet den freien Spiel-Modus (Sandbox). */
  free?: boolean
  /** ID im Fortschritts-Speicher, falls dieser Skill schon gemessen wird. */
  progressId?: string
}

/** Ein kleines Ziel = Spaß-Gipfel auf einem Strang. */
export interface SmallGoal {
  id: string
  strand: StrandId
  label: string
  detail: string
  challenge?: ChallengeId
  free?: boolean
  /** Schon in der App spielbar? (sonst: Konzept, noch zu bauen) */
  ready?: boolean
}

export const NODES: PathNode[] = [
  // ── Gehör ──────────────────────────────────────────────────────────────
  {
    id: 'g0',
    strand: 'gehoer',
    label: 'Richtung hören',
    tag: 'Hörtrainer',
    detail:
      'Geht der nächste Ton hoch, runter oder bleibt gleich? Die gröbste — und wichtigste — erste Gehör-Stufe.',
    challenge: 'hoertrainer',
    progressId: 'g0',
  },
  {
    id: 'gd',
    strand: 'gehoer',
    label: 'Dur/Moll hören',
    tag: 'Dur/Moll-Ohr',
    detail:
      'Klingt ein Akkord fröhlich (Dur) oder traurig (Moll)? Reines Hören, keine Motorik — das schnellste Ohr-Erfolgserlebnis. Stufen: Grundstellung → Umkehrungen → gebrochen.',
    challenge: 'durmoll',
    progressId: 'gd',
  },
  {
    id: 'gi',
    strand: 'gehoer',
    label: 'Intervalle',
    tag: 'über Liedanfänge',
    detail:
      'Wie weit ist der Sprung? Abstände am Klang erkennen, mit bekannten Liedanfängen verankern (Quinte, Quarte, Oktave …).',
  },
  {
    id: 'gs',
    strand: 'gehoer',
    label: 'Grundton · Stufen',
    tag: 'Wechsel hören',
    detail:
      'Auf welchem Ton ruht das Lied (Grundton)? Welche Stufe ist ein Ton? Und wann wechselt die Harmonie? Die feine, mächtige Gehör-Ebene.',
  },

  // ── Improvisation ──────────────────────────────────────────────────────
  {
    id: 'im0',
    strand: 'improv',
    label: 'Pentatonik-Skala',
    tag: 'Sandbox',
    detail:
      'Die markierten Töne der Moll-Pentatonik — hier klingt alles. Der sichere Spielplatz, auf dem du nichts falsch machen kannst.',
    free: true,
  },
  {
    id: 'im1',
    strand: 'improv',
    label: 'Über Loop spielen',
    tag: 'keine falschen Töne',
    detail:
      'Über den 12-Bar-Blues-Loop frei Töne setzen — Phrasen probieren, Pausen lassen, dem eigenen Ohr folgen.',
    free: true,
  },
  {
    id: 'im2',
    strand: 'improv',
    label: 'Variieren',
    detail:
      'Eine kleine Idee aufgreifen und weiterdrehen: höher, tiefer, anders rhythmisiert. Aus einem Motiv wird eine Linie.',
  },

  // ── Akkorde & Begleitung ───────────────────────────────────────────────
  {
    id: 'm1',
    strand: 'akkorde',
    label: 'Tasten finden',
    tag: 'Tastenfinder',
    detail:
      'Zu jedem Tonnamen blind die Taste finden. Das Fundament für alles — Greifen, Orientieren, Spielen. Die schwarzen Tasten sind deine Anker.',
    challenge: 'tastenfinder',
    progressId: 'm1',
  },
  {
    id: 'w2',
    strand: 'akkorde',
    label: 'Akkord greifen',
    tag: 'Akkordgriff',
    detail:
      'Drei Töne (1–3–5) als einen Griff. Das Grundbauteil jeder Begleitung. Rezept: Grundton +4+3 Halbtöne = Dur, +3+4 = Moll.',
    challenge: 'akkordgriff',
    progressId: 'w2',
  },
  {
    id: 'ak1',
    strand: 'akkorde',
    label: 'I · IV · V',
    tag: 'Hauptakkorde',
    detail:
      'Tonika, Subdominante, Dominante — die drei Hauptakkorde einer Tonart. Damit lassen sich erstaunlich viele Lieder begleiten.',
  },
  {
    id: 'ak2',
    strand: 'akkorde',
    label: 'Im 4/4 begleiten',
    tag: 'auf 1-2-3-4',
    detail:
      'Den Akkord im gleichmäßigen Puls anschlagen und rechtzeitig zum nächsten wechseln. Schlicht 1-2-3-4 reicht — das klingt schon nach Begleitung.',
  },

  // ── Koordination (nebenher) ────────────────────────────────────────────
  {
    id: 'k0',
    strand: 'koord',
    label: 'Eine Hand sicher',
    tag: 'automatisieren',
    detail:
      'Erst läuft jede Hand für sich, fast ohne Hinsehen. Dann hat der Kopf frei für die andere.',
  },
  {
    id: 'k1',
    strand: 'koord',
    label: 'Hände zusammen',
    tag: 'Mini-Stück, langsam',
    detail:
      'Beide Hände gleichzeitig an einem sehr einfachen Stück — langsam, dosiert, immer wieder. Kein Mini-Spiel, sondern Üben am Stück. Die einzige echte Wand; deshalb läuft sie nebenher.',
  },
]

export const SMALL_GOALS: SmallGoal[] = [
  {
    id: 'goal-improv',
    strand: 'improv',
    label: 'Über einen Loop improvisieren',
    detail:
      'Eine Hand, „keine falschen Töne", klingt sofort nach Musik. Man kann nicht scheitern — dein Anti-Frust-Anker. Schon spielbar im freien Modus.',
    free: true,
    ready: true,
  },
  {
    id: 'goal-detektiv',
    strand: 'gehoer',
    label: 'Melodien-Detektiv',
    detail:
      'Eine bekannte Melodie (Happy Birthday, ein Zelda-Motiv) ohne Noten am Klavier raushören. Riesiger Aha-Moment. Nutzt Richtung + Intervalle. (Noch zu bauen.)',
  },
  {
    id: 'goal-ohr',
    strand: 'gehoer',
    label: 'Ohr-Mikro-Spiele',
    detail:
      'Dur/Moll und Akkordwechsel hören — 2-Minuten-Häppchen, null Motorik. Überträgt sich sofort aufs Hören echter Songs. Teil 1 „Dur/Moll" ist jetzt spielbar (▶); Akkordwechsel folgt.',
    challenge: 'durmoll',
    ready: true,
  },
  {
    id: 'goal-kadenz',
    strand: 'akkorde',
    label: 'Kadenz-Loop (3 Akkorde)',
    detail:
      'I–IV–V als Schleife flüssig spielen — das Skelett tausender Songs, klingt augenblicklich nach echtem Stück. (Noch zu bauen.)',
  },
]

export const PARETO = {
  label: 'Pareto-Ziel',
  detail:
    'Das schnelle, lohnende Zwischenziel: eine Melodie, die du schon spielen kannst, links mit drei Akkorden (I·IV·V) im 4/4 auf 1-2-3-4 begleiten — beide Hände zusammen, sodass es ordentlich klingt. Holt 80 % des Spaßes mit 20 % der Fertigkeiten.',
}

export const NORDSTERN = {
  label: 'Nordstern',
  detail:
    'Das große Ziel: aus einer eigenen inneren Melodie (die sich beim Spielen weiterentwickeln darf) ein ganzes Klavierstück selbst spielen. Hier laufen alle Stränge zusammen.',
}

export const nodesOf = (strand: StrandId): PathNode[] =>
  NODES.filter((n) => n.strand === strand)

export const goalsOf = (strand: StrandId): SmallGoal[] =>
  SMALL_GOALS.filter((g) => g.strand === strand)
