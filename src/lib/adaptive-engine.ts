
export enum HintLevel {
  NONE = 0,
  L1 = 1,
  L2 = 2,
  L3 = 3,
  L4 = 4
}

// Weights from Technical Specification Section 5
const LDS_WEIGHTS = {
  DEPTH: 0.35,
  RATIO: 0.25,
  ESCALATION: 0.20,
  REVEAL: 0.20
};

const MCS_WEIGHTS = {
  CORRECTNESS: 0.30,
  SPEED: 0.25,
  EFFICIENCY: 0.20,
  INDEPENDENCE: 0.25
};

// Default median times (in ms) per sub-level based on complexity
// Derived from Taxonomy (Section 3.2)
const MEDIAN_TIMES_MS: Record<string, number> = {
  "1.1": 30000, "1.2": 35000, "1.3": 40000, "1.4": 45000, "1.5": 50000,
  "2.1": 60000, "2.2": 70000, "2.3": 80000, "2.4": 90000, "2.5": 100000,
  "3.1": 120000, "3.2": 140000, "3.3": 160000, "3.4": 180000, "3.5": 200000
};

function clamp(val: number, min: number, max: number): number {
  return Math.min(Math.max(val, min), max);
}

export interface InteractionFeatures {
  isCorrect: boolean;
  maxHintLevel: number;
  attempts: number;
  timeSpentMs: number;
  timePerLevel: Record<number, number>; // Level ID -> ms spent
  timeBeforeFirstHintMs: number;
  level: string; // e.g. "2.1"
}

/**
 * Computes Language Dependency Score (LDS)
 * 0 = English Independent, 1 = Fully Spanish Dependent
 */
export function calculateLDS(features: InteractionFeatures): number {
  const { maxHintLevel, timeSpentMs, timePerLevel, timeBeforeFirstHintMs, level } = features;
  
  // D_hint: Hint Depth Normalized
  const dHint = maxHintLevel / 4;
  
  // R_scaffold: Scaffold Time Ratio
  const scaffoldTime = (timePerLevel[1] || 0) + (timePerLevel[2] || 0) + (timePerLevel[3] || 0) + (timePerLevel[4] || 0);
  const rScaffold = timeSpentMs > 0 ? scaffoldTime / timeSpentMs : 0;
  
  // E_speed: Escalation Speed
  let eSpeed = 0;
  const medianTime = MEDIAN_TIMES_MS[level] || 60000;
  if (maxHintLevel > 0) {
    eSpeed = clamp(1 - (timeBeforeFirstHintMs / medianTime), 0, 1);
  }
  
  // F_reveal: Reveal Flag
  const fReveal = maxHintLevel === 4 ? 1.0 : 0.0;
  
  const lds = (
    LDS_WEIGHTS.DEPTH * dHint +
    LDS_WEIGHTS.RATIO * rScaffold +
    LDS_WEIGHTS.ESCALATION * eSpeed +
    LDS_WEIGHTS.REVEAL * fReveal
  );
  
  return clamp(lds, 0, 1);
}

/**
 * Computes Math Confidence Score (MCS)
 * 0 = Low Confidence, 1 = High Confidence
 */
export function calculateMCS(features: InteractionFeatures, lds: number): number {
  const { isCorrect, timeSpentMs, attempts, level } = features;
  
  // C_correct: Correctness
  const cCorrect = isCorrect ? 1.0 : 0.0;
  
  // S_speed: Speed Factor
  const medianTime = MEDIAN_TIMES_MS[level] || 60000;
  const sSpeed = clamp(medianTime / timeSpentMs, 0, 1);
  
  // A_efficiency: Attempt Efficiency
  const aEfficiency = attempts > 0 ? 1 / attempts : 0;
  
  // Language Independence: (1 - LDS)
  const lIndependence = 1 - lds;
  
  const mcs = (
    MCS_WEIGHTS.CORRECTNESS * cCorrect +
    MCS_WEIGHTS.SPEED * sSpeed +
    MCS_WEIGHTS.EFFICIENCY * aEfficiency +
    MCS_WEIGHTS.INDEPENDENCE * lIndependence
  );
  
  return clamp(mcs, 0, 1);
}

/**
 * Helper to determine the diagnostic quadrant
 */
export function getDiagnosticQuadrant(lds: number, mcs: number): 'thriving' | 'language_gap' | 'math_struggle' | 'dual_challenge' {
  if (mcs >= 0.6) {
    return lds < 0.4 ? 'thriving' : 'language_gap';
  } else {
    return lds < 0.4 ? 'math_struggle' : 'dual_challenge';
  }
}

// --- Adaptive Engine (Technical Specification Section 6) ---

export interface TopicMastery {
  pKnow: number;
}

export interface ThompsonPrior {
  alpha: number;
  beta: number;
}

export interface AdaptiveState {
  currentElo: number;
  currentLevel: string;
  totalInteractions: number;
  topicMastery: Record<string, number>; // Topic -> P(know)
  thompsonPriors: Record<string, ThompsonPrior>; // Level -> Alpha/Beta
  streakCount: number;
  streakWrongCount: number;
}

// Taxonomy mapping for Elo calculations
export const LEVEL_ELO_TARGETS: Record<string, number> = {
  "1.1": 820, "1.2": 870, "1.3": 920, "1.4": 970, "1.5": 1020,
  "2.1": 1070, "2.2": 1120, "2.3": 1170, "2.4": 1220, "2.5": 1270,
  "3.1": 1320, "3.2": 1370, "3.3": 1420, "3.4": 1470, "3.5": 1520
};

const ALL_LEVELS = Object.keys(LEVEL_ELO_TARGETS).sort((a, b) => {
  const [majorA, minorA] = a.split('.').map(Number);
  const [majorB, minorB] = b.split('.').map(Number);
  return majorA !== majorB ? majorA - majorB : minorA - minorB;
});

// BKT Parameters (Section 6.3)
const BKT_DEFAULTS = {
  P_L0: 0.10,
  P_T: 0.15,
  P_S: 0.10,
  P_G: 0.25
};

/**
 * Section 6.2: Elo Update Logic
 */
export function calculateEloUpdate(
  studentElo: number,
  questionElo: number,
  maxHintLevel: number,
  isCorrect: boolean,
  totalInteractions: number
): number {
  // Weighted outcome Os
  let weightedOutcome = 0;
  if (!isCorrect || maxHintLevel === 4) {
    weightedOutcome = 0.00;
  } else {
    switch (maxHintLevel) {
      case 0: weightedOutcome = 1.00; break;
      case 1: weightedOutcome = 0.75; break;
      case 2: weightedOutcome = 0.50; break;
      case 3: weightedOutcome = 0.25; break;
    }
  }

  // Expected outcome Es
  const expectedOutcome = 1 / (1 + Math.pow(10, (questionElo - studentElo) / 400));

  // K-factor schedule
  let kFactor = 24;
  if (totalInteractions < 10) {
    kFactor = 48;
  } else if (totalInteractions < 30) {
    kFactor = 32;
  }

  return studentElo + kFactor * (weightedOutcome - expectedOutcome);
}

/**
 * Section 6.3: BKT Update Logic
 */
export function calculateBKTUpdate(
  pKnowPrev: number,
  weightedOutcome: number,
  hintDepthNormalized: number
): number {
  const isConsideredCorrect = weightedOutcome >= 0.5;
  const pSAdj = BKT_DEFAULTS.P_S * (1 + 0.5 * hintDepthNormalized);
  
  let pKnowGivenObs: number;
  if (isConsideredCorrect) {
    pKnowGivenObs = (pKnowPrev * (1 - pSAdj)) / (pKnowPrev * (1 - pSAdj) + (1 - pKnowPrev) * BKT_DEFAULTS.P_G);
  } else {
    pKnowGivenObs = (pKnowPrev * pSAdj) / (pKnowPrev * pSAdj + (1 - pKnowPrev) * (1 - BKT_DEFAULTS.P_G));
  }

  return pKnowGivenObs + (1 - pKnowGivenObs) * BKT_DEFAULTS.P_T;
}

/**
 * Section 6.4: Thompson Sampling Selection
 */
export function selectNextLevel(
  state: AdaptiveState,
  currentLevel: string
): string {
  const zpdWindow = getZPDWindow(currentLevel);
  let bestLevel = currentLevel;
  let maxScore = -1;

  zpdWindow.forEach(level => {
    const prior = state.thompsonPriors[level] || { alpha: 1, beta: 1 };
    // Sample theta from Beta distribution using simplified approximation
    // sum of alpha+beta samples
    const sampledTheta = sampleBeta(prior.alpha, prior.beta);
    
    // Proximity Bonus
    const levelElo = LEVEL_ELO_TARGETS[level];
    const proximityBonus = Math.exp(-0.5 * Math.pow((levelElo - state.currentElo) / 100, 2));
    
    const score = sampledTheta * proximityBonus;
    if (score > maxScore) {
      maxScore = score;
      bestLevel = level;
    }
  });

  return bestLevel;
}

function getZPDWindow(currentLevel: string): string[] {
  const idx = ALL_LEVELS.indexOf(currentLevel);
  const start = Math.max(0, idx - 2);
  const end = Math.min(ALL_LEVELS.length - 1, idx + 3);
  return ALL_LEVELS.slice(start, end + 1);
}

// Simple Beta sampling approx using rejection sampling or Mean if complex
function sampleBeta(alpha: number, beta: number): number {
  // Box-Muller or Gamma approx would be better, but for client-side simple:
  // We'll use a simple sum of uniforms approx for Gamma then normalize
  const gammaA = sampleGamma(alpha);
  const gammaB = sampleGamma(beta);
  return gammaA / (gammaA + gammaB);
}

function sampleGamma(k: number): number {
  if (k < 1) return sampleGamma(k + 1) * Math.pow(Math.random(), 1 / k);
  let d = k - 1 / 3;
  let c = 1 / Math.sqrt(9 * d);
  while (true) {
    let x, v, u;
    do {
      x = normalRandom();
      v = 1 + c * x;
    } while (v <= 0);
    v = v * v * v;
    u = Math.random();
    if (u < 1 - 0.0331 * x * x * x * x) return d * v;
    if (Math.log(u) < 0.5 * x * x + d * (1 - v + Math.log(v))) return d * v;
  }
}

function normalRandom(): number {
  let u = 0, v = 0;
  while (u === 0) u = Math.random();
  while (v === 0) v = Math.random();
  return Math.sqrt(-2.0 * Math.log(u)) * Math.cos(2.0 * Math.PI * v);
}

/**
 * Section 6.5: Decision Orchestrator
 */
export function adaptiveDecide(
  state: AdaptiveState,
  interaction: InteractionFeatures,
  lds: number,
  mcs: number,
  topic: string
): { newState: AdaptiveState; decision: string } {
  const { maxHintLevel, isCorrect, level } = interaction;
  
  // 1. Calculate outcomes
  let weightedOutcome = 0;
  if (!isCorrect || maxHintLevel === 4) {
    weightedOutcome = 0.00;
  } else {
    switch (maxHintLevel) {
      case 0: weightedOutcome = 1.00; break;
      case 1: weightedOutcome = 0.75; break;
      case 2: weightedOutcome = 0.50; break;
      case 3: weightedOutcome = 0.25; break;
    }
  }

  // 2. Update state components
  const questionElo = LEVEL_ELO_TARGETS[level] || 1000;
  const nextElo = calculateEloUpdate(state.currentElo, questionElo, maxHintLevel, isCorrect, state.totalInteractions);
  
  const currentTopicPKnow = state.topicMastery[topic] || BKT_DEFAULTS.P_L0;
  const nextPKnow = calculateBKTUpdate(currentTopicPKnow, weightedOutcome, maxHintLevel / 4);
  
  const currentPrior = state.thompsonPriors[level] || { alpha: 1, beta: 1 };
  const nextPrior = {
    alpha: currentPrior.alpha + weightedOutcome,
    beta: currentPrior.beta + (1 - weightedOutcome)
  };

  const nextStreak = isCorrect && weightedOutcome >= 0.75 ? state.streakCount + 1 : 0;
  const nextStreakWrong = !isCorrect || weightedOutcome < 0.25 ? state.streakWrongCount + 1 : 0;

  const tempState: AdaptiveState = {
    ...state,
    currentElo: nextElo,
    totalInteractions: state.totalInteractions + 1,
    topicMastery: { ...state.topicMastery, [topic]: nextPKnow },
    thompsonPriors: { ...state.thompsonPriors, [level]: nextPrior },
    streakCount: nextStreak,
    streakWrongCount: nextStreakWrong
  };

  // 3. Determine progression decision
  let decision = "MAINTAIN";
  if (weightedOutcome >= 0.85 && nextStreak >= 3) {
    decision = "SKIP";
  } else if (weightedOutcome >= 0.75 && nextPKnow >= 0.70) {
    decision = "INCREASE";
  } else if (weightedOutcome >= 0.40) {
    decision = "MAINTAIN";
  } else if (weightedOutcome >= 0.25 || nextStreakWrong < 2) {
    decision = "DECREASE";
  } else {
    decision = "RAPID_DECREASE";
  }

  // 4. Language Gap Overlay
  if (lds > 0.6 && mcs > 0.6) {
    // If skip/increase, keep them, but don't drop difficulty due to language
    if (decision === "DECREASE" || decision === "RAPID_DECREASE") {
      decision = "MAINTAIN";
    }
  }

  // 5. Select next level
  let nextLevelCandidate = selectNextLevel(tempState, level);
  
  // Guardrails
  const currentIdx = ALL_LEVELS.indexOf(level);
  if (decision === "SKIP") {
    nextLevelCandidate = ALL_LEVELS[Math.min(currentIdx + 2, ALL_LEVELS.length - 1)];
  } else if (decision === "INCREASE") {
    nextLevelCandidate = ALL_LEVELS[Math.min(currentIdx + 1, ALL_LEVELS.length - 1)];
  } else if (decision === "DECREASE") {
    nextLevelCandidate = ALL_LEVELS[Math.max(currentIdx - 1, 0)];
  } else if (decision === "RAPID_DECREASE") {
    nextLevelCandidate = ALL_LEVELS[Math.max(currentIdx - 2, 0)];
  } else if (decision === "MAINTAIN") {
    // Thompson sampling might pick something else, we let it if it's within +/- 1
    const nextIdx = ALL_LEVELS.indexOf(nextLevelCandidate);
    if (Math.abs(nextIdx - currentIdx) > 1) {
      nextLevelCandidate = level;
    }
  }

  return {
    newState: { ...tempState, currentLevel: nextLevelCandidate },
    decision
  };
}
