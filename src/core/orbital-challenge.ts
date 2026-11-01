export type ChallengeGeomKey =
  | 'challengeGeomS'
  | 'challengeGeomPz'
  | 'challengeGeomPx'
  | 'challengeGeomDxy'
  | 'challengeGeomDx2y2'
  | 'challengeGeomDz2'
  | 'challengeGeomFz3';

export interface ChallengeOrbital {
  readonly id: string;
  readonly labelHtml: string;
  readonly plainLabel: string;
  readonly n: number;
  readonly l: number;
  readonly m: number;
  readonly radialNodes: number;
  readonly angularNodes: number;
  readonly geomKey: ChallengeGeomKey;
  readonly distractorIds: readonly [string, string, string];
}

export interface ChallengeRound {
  readonly target: ChallengeOrbital;
  readonly choices: readonly ChallengeOrbital[];
  readonly roundNumber: number;
}

export interface ChallengeSessionState {
  readonly score: number;
  readonly attempts: number;
  readonly streak: number;
  readonly bestStreak: number;
  readonly hintUsed: boolean;
  readonly selectedChoiceId: string | null;
  readonly isCorrect: boolean | null;
  readonly round: ChallengeRound;
}

type OrbitalId =
  | '1s'
  | '2s'
  | '3s'
  | '4s'
  | '2pz'
  | '2px'
  | '3pz'
  | '4pz'
  | '3dxy'
  | '3dx2y2'
  | '3dz2'
  | '4fz3';

const ORBITALS_BY_ID: Record<OrbitalId, ChallengeOrbital> = {
  '1s': {
    id: '1s',
    labelHtml: '1s',
    plainLabel: '1s',
    n: 1,
    l: 0,
    m: 0,
    radialNodes: 0,
    angularNodes: 0,
    geomKey: 'challengeGeomS',
    distractorIds: ['2s', '3s', '2pz'],
  },
  '2s': {
    id: '2s',
    labelHtml: '2s',
    plainLabel: '2s',
    n: 2,
    l: 0,
    m: 0,
    radialNodes: 1,
    angularNodes: 0,
    geomKey: 'challengeGeomS',
    distractorIds: ['1s', '3s', '4s'],
  },
  '3s': {
    id: '3s',
    labelHtml: '3s',
    plainLabel: '3s',
    n: 3,
    l: 0,
    m: 0,
    radialNodes: 2,
    angularNodes: 0,
    geomKey: 'challengeGeomS',
    distractorIds: ['2s', '4s', '3pz'],
  },
  '4s': {
    id: '4s',
    labelHtml: '4s',
    plainLabel: '4s',
    n: 4,
    l: 0,
    m: 0,
    radialNodes: 3,
    angularNodes: 0,
    geomKey: 'challengeGeomS',
    distractorIds: ['2s', '3s', '4pz'],
  },
  '2pz': {
    id: '2pz',
    labelHtml: '2p<sub>z</sub>',
    plainLabel: '2pz',
    n: 2,
    l: 1,
    m: 0,
    radialNodes: 0,
    angularNodes: 1,
    geomKey: 'challengeGeomPz',
    distractorIds: ['2px', '3pz', '3dz2'],
  },
  '2px': {
    id: '2px',
    labelHtml: '2p<sub>x</sub>',
    plainLabel: '2px',
    n: 2,
    l: 1,
    m: 1,
    radialNodes: 0,
    angularNodes: 1,
    geomKey: 'challengeGeomPx',
    distractorIds: ['2pz', '3pz', '3dx2y2'],
  },
  '3pz': {
    id: '3pz',
    labelHtml: '3p<sub>z</sub>',
    plainLabel: '3pz',
    n: 3,
    l: 1,
    m: 0,
    radialNodes: 1,
    angularNodes: 1,
    geomKey: 'challengeGeomPz',
    distractorIds: ['2pz', '4pz', '3dz2'],
  },
  '4pz': {
    id: '4pz',
    labelHtml: '4p<sub>z</sub>',
    plainLabel: '4pz',
    n: 4,
    l: 1,
    m: 0,
    radialNodes: 2,
    angularNodes: 1,
    geomKey: 'challengeGeomPz',
    distractorIds: ['2pz', '3pz', '4fz3'],
  },
  '3dxy': {
    id: '3dxy',
    labelHtml: '3d<sub>xy</sub>',
    plainLabel: '3dxy',
    n: 3,
    l: 2,
    m: -2,
    radialNodes: 0,
    angularNodes: 2,
    geomKey: 'challengeGeomDxy',
    distractorIds: ['3dx2y2', '3dz2', '2px'],
  },
  '3dx2y2': {
    id: '3dx2y2',
    labelHtml: '3d<sub>x²−y²</sub>',
    plainLabel: '3dx²−y²',
    n: 3,
    l: 2,
    m: 2,
    radialNodes: 0,
    angularNodes: 2,
    geomKey: 'challengeGeomDx2y2',
    distractorIds: ['3dxy', '3dz2', '2px'],
  },
  '3dz2': {
    id: '3dz2',
    labelHtml: '3d<sub>z²</sub>',
    plainLabel: '3dz²',
    n: 3,
    l: 2,
    m: 0,
    radialNodes: 0,
    angularNodes: 2,
    geomKey: 'challengeGeomDz2',
    distractorIds: ['3pz', '4fz3', '3dx2y2'],
  },
  '4fz3': {
    id: '4fz3',
    labelHtml: '4f<sub>z³</sub>',
    plainLabel: '4fz³',
    n: 4,
    l: 3,
    m: 0,
    radialNodes: 0,
    angularNodes: 3,
    geomKey: 'challengeGeomFz3',
    distractorIds: ['3dz2', '4pz', '3pz'],
  },
};

export const CHALLENGE_POOL: readonly ChallengeOrbital[] = [
  ORBITALS_BY_ID['1s'],
  ORBITALS_BY_ID['2s'],
  ORBITALS_BY_ID['3s'],
  ORBITALS_BY_ID['4s'],
  ORBITALS_BY_ID['2pz'],
  ORBITALS_BY_ID['2px'],
  ORBITALS_BY_ID['3pz'],
  ORBITALS_BY_ID['4pz'],
  ORBITALS_BY_ID['3dxy'],
  ORBITALS_BY_ID['3dx2y2'],
  ORBITALS_BY_ID['3dz2'],
  ORBITALS_BY_ID['4fz3'],
];

function randomInt(maxExclusive: number): number {
  const buffer = new Uint32Array(1);
  globalThis.crypto.getRandomValues(buffer);
  return buffer[0] % maxExclusive;
}

function shuffleCopy<T>(items: readonly T[]): T[] {
  const copy = [...items];
  for (let i = copy.length - 1; i > 0; i--) {
    const j = randomInt(i + 1);
    const temp = copy[i];
    copy[i] = copy[j];
    copy[j] = temp;
  }
  return copy;
}

export class OrbitalChallengeEngine {
  private deck: ChallengeOrbital[] = [];
  private deckIndex = 0;
  private score = 0;
  private attempts = 0;
  private streak = 0;
  private bestStreak = 0;
  private hintUsed = false;
  private selectedChoiceId: string | null = null;
  private isCorrect: boolean | null = null;
  private round: ChallengeRound;

  public constructor() {
    this.deck = shuffleCopy(CHALLENGE_POOL);
    this.round = this.dealRound(1);
  }

  public getState(): ChallengeSessionState {
    return {
      score: this.score,
      attempts: this.attempts,
      streak: this.streak,
      bestStreak: this.bestStreak,
      hintUsed: this.hintUsed,
      selectedChoiceId: this.selectedChoiceId,
      isCorrect: this.isCorrect,
      round: this.round,
    };
  }

  public revealHint(): ChallengeSessionState {
    this.hintUsed = true;
    return this.getState();
  }

  public submitAnswer(choiceId: string): ChallengeSessionState {
    if (this.selectedChoiceId !== null) {
      return this.getState();
    }
    const correct = choiceId === this.round.target.id;
    this.selectedChoiceId = choiceId;
    this.isCorrect = correct;
    this.attempts += 1;
    if (correct) {
      this.score += 1;
      this.streak += 1;
      this.bestStreak = Math.max(this.bestStreak, this.streak);
    } else {
      this.streak = 0;
    }
    return this.getState();
  }

  public nextRound(): ChallengeSessionState {
    this.hintUsed = false;
    this.selectedChoiceId = null;
    this.isCorrect = null;
    this.round = this.dealRound(this.round.roundNumber + 1, this.round.target.id);
    return this.getState();
  }

  public reset(): ChallengeSessionState {
    this.score = 0;
    this.attempts = 0;
    this.streak = 0;
    this.bestStreak = 0;
    this.hintUsed = false;
    this.selectedChoiceId = null;
    this.isCorrect = null;
    this.deck = shuffleCopy(CHALLENGE_POOL);
    this.deckIndex = 0;
    this.round = this.dealRound(1);
    return this.getState();
  }

  private dealRound(roundNumber: number, previousTargetId?: string): ChallengeRound {
    if (this.deckIndex >= this.deck.length) {
      this.deck = shuffleCopy(CHALLENGE_POOL);
      this.deckIndex = 0;
      if (previousTargetId !== undefined && this.deck[0].id === previousTargetId) {
        const swapIndex = 1 + randomInt(this.deck.length - 1);
        const first = this.deck[0];
        this.deck[0] = this.deck[swapIndex];
        this.deck[swapIndex] = first;
      }
    }
    const target = this.deck[this.deckIndex];
    this.deckIndex += 1;
    const distractors = target.distractorIds.map((id) => ORBITALS_BY_ID[id as OrbitalId]);
    return {
      target,
      choices: shuffleCopy([target, ...distractors]),
      roundNumber,
    };
  }
}
