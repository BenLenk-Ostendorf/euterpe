// Der Lernzielgraph: vom ersten Tastenfinden bis zum freien Begleiten.
// Jeder Knoten ist EIN klares "Du kannst …", die Kanten sind Voraussetzungen.
// Bewusst ohne Fortschritts-/Scoring-Logik — reine Orientierung, kein Spiel.

export type SkillCat = 'mec' | 'wis' | 'geh' | 'anw' | 'ziel'

/** Spielbare Challenge zu einem Lernziel (sofern vorhanden). */
export type ChallengeId = 'tastenfinder' | 'notenregen'

/** Anzeige-Name einer Challenge (für Listen/Buttons). */
export const CHALLENGE_LABEL: Record<ChallengeId, string> = {
  tastenfinder: 'Tastenfinder',
  notenregen: 'Notenregen',
}

// Spielbare Artefakte, die (noch) keinem Lernziel zugeordnet sind. Der
// Notenregen ist als Spiel erhalten, aber bewusst nicht an p1 „Puls" gehängt
// — dafür gibt es vermutlich ein besseres Spielkonzept (noch offen).
export const STANDALONE_CHALLENGES: ChallengeId[] = ['notenregen']

export interface Skill {
  id: string
  cat: SkillCat
  /** Das Lernziel, immer als "Du kannst …". */
  label: string
  /** Kurze Erklärung + worauf es ankommt. */
  detail: string
  /** IDs der direkt vorausgesetzten Fähigkeiten. */
  deps: string[]
  /** Optionale spielbare Challenge, die zu diesem Lernziel hinführt. */
  challenge?: ChallengeId
}

export interface CategoryMeta {
  cat: SkillCat
  name: string
  /** Hex-Farbe, abgestimmt auf die Dark-Academia-/Jazz-Palette. */
  color: string
}

export const CATEGORIES: CategoryMeta[] = [
  { cat: 'mec', name: 'Mechanik', color: '#e0b15e' },
  { cat: 'wis', name: 'Wissen', color: '#7fa8c9' },
  { cat: 'geh', name: 'Gehör', color: '#9bb88a' },
  { cat: 'anw', name: 'Anwendung', color: '#cf9277' },
  { cat: 'ziel', name: 'Ziel', color: '#f0d49a' },
]

export const CATEGORY_COLOR: Record<SkillCat, string> = CATEGORIES.reduce(
  (acc, c) => ({ ...acc, [c.cat]: c.color }),
  {} as Record<SkillCat, string>,
)

// Die Knoten in Ebenen (von Grundlagen unten-frei bis zum Ziel).
export const TIERS: Skill[][] = [
  [
    {
      id: 'm1',
      cat: 'mec',
      label: 'Du kannst jede Taste benennen.',
      detail:
        'Finde zu jedem Tonnamen blind die Taste. Die zwei und drei schwarzen Tasten sind deine Orientierungs-Anker. Geschafft ist es, wenn du alle Tasten ruhig und ohne Beschriftung findest — mit beiden Händen.',
      deps: [],
      challenge: 'tastenfinder',
    },
    {
      id: 'p1',
      cat: 'mec',
      label: 'Du kannst im gleichmäßigen Puls spielen.',
      detail:
        'Ein Ton pro Puls, ohne zu eilen oder zu schleppen. Der Puls ist wichtiger als die Melodie.',
      deps: [],
    },
    {
      id: 'g0',
      cat: 'geh',
      label: 'Du kannst die Richtung einer Melodie hören.',
      detail:
        'Geht der nächste Ton hoch, runter oder bleibt gleich? Die gröbste — und wichtigste — erste Gehör-Stufe.',
      deps: [],
    },
  ],
  [
    {
      id: 'm2',
      cat: 'mec',
      label: 'Du kannst die Tastatur blind ertasten.',
      detail:
        'Tasten treffen, ohne hinzusehen. Erst dann kannst du beim Spielen hören statt schauen.',
      deps: ['m1'],
    },
    {
      id: 'w1',
      cat: 'wis',
      label: 'Du kannst eine Dur-Tonleiter spielen.',
      detail:
        'Die sieben Stufen einer Tonart in Reihe, mit sauberem Fingersatz und Daumenuntersatz.',
      deps: ['m1'],
    },
    {
      id: 'w2',
      cat: 'wis',
      label: 'Du kannst einen Dreiklang greifen.',
      detail:
        'Drei Töne übereinander (1–3–5) als einen Griff. Das Grundbauteil jeder Begleitung.',
      deps: ['m1'],
    },
    {
      id: 'g1',
      cat: 'geh',
      label: 'Du kannst Intervalle hören.',
      detail:
        'Erkenne den Abstand zweier Töne am Klang (Terz, Quinte …). Mit bekannten Liedanfängen verankern.',
      deps: ['g0'],
    },
  ],
  [
    {
      id: 'w3',
      cat: 'wis',
      label: 'Du kannst die Tonleiterstufen benennen.',
      detail:
        'Welcher Ton ist die 1., 4., 5. Stufe? In Stufen statt in absoluten Tönen denken macht alles übertragbar.',
      deps: ['w1'],
    },
    {
      id: 'w4',
      cat: 'wis',
      label: 'Du kannst die drei Hauptakkorde greifen.',
      detail:
        'Tonika, Subdominante, Dominante (I, IV, V). Damit lassen sich erstaunlich viele Lieder begleiten.',
      deps: ['w2'],
    },
    {
      id: 'm3',
      cat: 'mec',
      label: 'Du kannst beide Hände unabhängig bewegen.',
      detail:
        'Links etwas anderes als rechts. Der mechanische Kernknoten fürs Begleiten.',
      deps: ['m2', 'p1'],
    },
    {
      id: 'g2',
      cat: 'geh',
      label: 'Du kannst den Grundton heraushören.',
      detail:
        'Auf welchem Ton „ruht" das Lied? Der Grundton ist dein Ankerpunkt für alles Weitere.',
      deps: ['g1'],
    },
  ],
  [
    {
      id: 'g3',
      cat: 'geh',
      label: 'Du kannst einen Melodieton einer Stufe zuordnen.',
      detail:
        'Nicht nur „höher", sondern „das ist die 5. Stufe". Hier verschmelzen Gehör und Wissen.',
      deps: ['g2', 'w3'],
    },
    {
      id: 'a1',
      cat: 'anw',
      label: 'Du kannst die Tonart eines Stücks bestimmen.',
      detail:
        'Aus Grundton + Dur-/Moll-Klang die Tonart ableiten. Damit weißt du, welche Töne „passen".',
      deps: ['g2', 'w1'],
    },
    {
      id: 'w5',
      cat: 'wis',
      label: 'Du kannst eine Kadenz spielen.',
      detail:
        'Die typische Folge I–IV–V–I flüssig durchspielen — das harmonische Skelett unzähliger Songs.',
      deps: ['w4'],
    },
    {
      id: 'g4',
      cat: 'geh',
      label: 'Du kannst Akkordwechsel hören.',
      detail:
        'Spüren, WANN sich die Harmonie ändert — auch ohne zu wissen wohin. Das gibt der Begleitung ihren Rhythmus.',
      deps: ['g2'],
    },
  ],
  [
    {
      id: 'a2',
      cat: 'anw',
      label: 'Du kannst eine gehörte Melodie nachspielen.',
      detail:
        'Such-und-treffen: Ton für Ton die Melodie auf der Tastatur finden. Das eigentliche „Raushören".',
      deps: ['g3', 'a1', 'm2'],
    },
    {
      id: 'a3',
      cat: 'anw',
      label: 'Du kannst zu einer Melodie Akkorde finden.',
      detail:
        'Welcher Hauptakkord trägt die gerade gehörte Melodiestelle? Melodie und Harmonie verbinden.',
      deps: ['g4', 'w5', 'a1'],
    },
    {
      id: 'a4',
      cat: 'anw',
      label: 'Du kannst ein Begleitmuster spielen.',
      detail:
        'Akkorde nicht nur halten, sondern rhythmisieren: brechen, pumpen, Bass + Akkord.',
      deps: ['w4', 'm3'],
    },
  ],
  [
    {
      id: 'a5',
      cat: 'anw',
      label: 'Du kannst die Melodie über der Begleitung spielen.',
      detail:
        'Rechts die Melodie, links die Begleitung — gleichzeitig. Hier zahlt sich die Hand-Unabhängigkeit aus.',
      deps: ['a2', 'a3', 'a4'],
    },
  ],
  [
    {
      id: 'z',
      cat: 'ziel',
      label: 'Du kannst ein gehörtes Lied selbst begleiten.',
      detail:
        'Dein Ziel: etwas hören und es frei am Klavier umsetzen. Alle Stränge laufen hier zusammen.',
      deps: ['a5'],
    },
  ],
]

export const ALL_SKILLS: Skill[] = TIERS.flat()
