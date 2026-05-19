import cefrData from '../../cefr_vocabulary.json';
import type { InteractionRecord } from './api';

/** CEFR band; "U" = unknown / not in list. */
export type CefrBand = 'A1' | 'A2' | 'B1' | 'B2' | 'C1' | 'C2' | 'U';

/** Word type from cefr_vocabulary.json. */
export type WordType = 'general' | 'math' | 'context' | 'name' | 'unknown';

export const CEFR_ORDER: CefrBand[] = ['A1', 'A2', 'B1', 'B2', 'C1', 'C2', 'U'];
export const WORD_TYPES: WordType[] = ['general', 'math', 'context', 'name', 'unknown'];

const CEFR_WEIGHT: Record<CefrBand, number> = {
  A1: 0.0,
  A2: 0.2,
  B1: 0.4,
  B2: 0.6,
  C1: 0.8,
  C2: 1.0,
  U: 0.5,
};

interface VocabEntry {
  cefr: CefrBand;
  type: WordType;
}

/** Build word → {cefr, type} map from cefr_vocabulary.json. Skips _meta. */
const CEFR_MAP: Record<string, VocabEntry> = (() => {
  const out: Record<string, VocabEntry> = {};
  const raw = cefrData as Record<string, unknown>;
  const validBands = new Set(['A1', 'A2', 'B1', 'B2', 'C1', 'C2']);
  for (const [word, entry] of Object.entries(raw)) {
    if (word.startsWith('_') || !entry || typeof entry !== 'object') continue;
    const e = entry as { cefr?: string; type?: string };
    const rawType = (e.type ?? 'unknown') as string;
    const type: WordType = (
      ['general', 'math', 'context', 'name'].includes(rawType)
        ? rawType
        : 'unknown'
    ) as WordType;
    const cefr: CefrBand = validBands.has(e.cefr ?? '') ? (e.cefr as CefrBand) : 'U';
    out[word.toLowerCase()] = { cefr, type };
  }
  return out;
})();

const STOPWORDS = new Set<string>([
  'a', 'an', 'the', 'is', 'am', 'are', 'was', 'were', 'be', 'been', 'being',
  'do', 'does', 'did', 'has', 'have', 'had', 'of', 'in', 'on', 'at', 'to',
  'for', 'with', 'by', 'from', 'as', 'it', 'its', "it's", 'this', 'that',
  'these', 'those', 'and', 'or', 'but', 'if', 'so', 'not', 'no', 'yes',
  'i', 'you', 'he', 'she', 'we', 'they', 'me', 'him', 'her', 'us', 'them',
  'my', 'your', 'his', 'their', 'our', 'mine', 'yours', 'hers', 'ours',
  'will', 'would', 'can', 'could', 'should', 'may', 'might', 'must', 'shall',
  'into', 'than', 'then', 'there', 'here', 's', 't', 'd', 'll', 've', 're',
  'about', 'just', 'also', 'too', 'very', 'much', 'many', 'such', 'each',
  // Light stoplist additions; "math" content words like add/subtract stay.
]);

/** Lightweight lemmatizer used only for CEFR lookup. */
function lemmaCandidates(word: string): string[] {
  const w = word.toLowerCase();
  const variants = new Set<string>([w]);
  if (w.endsWith('ies') && w.length > 4) variants.add(w.slice(0, -3) + 'y');
  if (w.endsWith('es') && w.length > 3) variants.add(w.slice(0, -2));
  if (w.endsWith('s') && w.length > 3) variants.add(w.slice(0, -1));
  if (w.endsWith('ed') && w.length > 3) {
    variants.add(w.slice(0, -2));
    variants.add(w.slice(0, -1));
  }
  if (w.endsWith('ing') && w.length > 4) {
    variants.add(w.slice(0, -3));
    variants.add(w.slice(0, -3) + 'e');
  }
  if (w.endsWith('er') && w.length > 3) variants.add(w.slice(0, -2));
  if (w.endsWith('est') && w.length > 4) variants.add(w.slice(0, -3));
  return [...variants];
}

export function lookupVocab(word: string): VocabEntry {
  for (const candidate of lemmaCandidates(word)) {
    const hit = CEFR_MAP[candidate];
    if (hit) return hit;
  }
  return { cefr: 'U', type: 'unknown' };
}

/** Backwards-compatible CEFR-only lookup. */
export function lookupCefr(word: string): CefrBand {
  return lookupVocab(word).cefr;
}

/** Tokenize problem text into normalized content words. */
export function tokenize(text: string): string[] {
  if (!text) return [];
  const cleaned = text.toLowerCase().replace(/[^a-zA-Z'\s]+/g, ' ');
  const tokens = cleaned.split(/\s+/).filter(Boolean);
  const out: string[] = [];
  const seenInDoc = new Set<string>();
  for (const t of tokens) {
    if (t.length < 2) continue;
    if (STOPWORDS.has(t)) continue;
    if (seenInDoc.has(t)) continue;
    seenInDoc.add(t);
    out.push(t);
  }
  return out;
}

export interface WordRow {
  word: string;
  cefr: CefrBand;
  type: WordType;
  appearances: number;
  solveRate: number;
  avgAttempts: number;
  escalationRate: number;
  /** Optional, only populated when a per-student scope is active. */
  studentSolveRate?: number | null;
  studentAppearances?: number;
  difficultyScore: number;
  /** True when CEFR predicts an easy word (A1/A2) but cohort solve rate is below threshold — i.e. performance is below what the word's CEFR level predicts. */
  belowExpectation: boolean;
}

interface PerWordAccum {
  appearances: number;
  solved: number;
  attemptsSum: number;
  escalations: number;
  studentAppearances: number;
  studentSolved: number;
}

function getProblemText(rec: InteractionRecord): string {
  const p = rec.problem ?? {};
  return (
    (p.original as string | undefined) ||
    (p.simplified as string | undefined) ||
    ''
  );
}

function isSolvedRec(rec: InteractionRecord): boolean {
  return rec.isSolved === 'solved';
}

function attemptsOf(rec: InteractionRecord): number {
  const n = rec.attemptsCount;
  return typeof n === 'number' && n >= 0 ? n : 0;
}

/** True if the student used L2 (bilingual) or L3 (spanish) or revealed. */
function didEscalate(rec: InteractionRecord): boolean {
  if (rec.isSolved === 'revealed') return true;
  const lvls = rec.levelsViewedBeforeCorrect;
  if (Array.isArray(lvls) && lvls.some((l) => Number(l) >= 2)) return true;
  if (typeof rec.activeLevelOnCorrect === 'number' && rec.activeLevelOnCorrect >= 2) return true;
  if (typeof rec.maxHintLevel === 'number' && rec.maxHintLevel >= 2) return true;
  return false;
}

export interface WordAnalysisOptions {
  /** When set, also compute that student's solve rate per word. */
  focusUserId?: string | null;
  /** Drop words with fewer than this many cohort appearances. */
  minAppearances?: number;
  /** CEFR band filter; "ALL" means no filter. */
  cefrFilter?: CefrBand | 'ALL';
  /** Word type filter; "ALL" means no filter. Proper names are always dropped. */
  typeFilter?: WordType | 'ALL';
}

export function analyzeWords(
  interactions: InteractionRecord[],
  opts: WordAnalysisOptions = {}
): WordRow[] {
  const {
    focusUserId = null,
    minAppearances = 3,
    cefrFilter = 'ALL',
    typeFilter = 'ALL',
  } = opts;
  const accum = new Map<string, PerWordAccum>();
  let maxAvgAttempts = 1;

  for (const rec of interactions) {
    const tokens = tokenize(getProblemText(rec));
    if (tokens.length === 0) continue;
    const solved = isSolvedRec(rec) ? 1 : 0;
    const attempts = attemptsOf(rec);
    const escalated = didEscalate(rec) ? 1 : 0;
    const focusMatch = focusUserId && rec.userId === focusUserId;

    for (const t of tokens) {
      let row = accum.get(t);
      if (!row) {
        row = {
          appearances: 0,
          solved: 0,
          attemptsSum: 0,
          escalations: 0,
          studentAppearances: 0,
          studentSolved: 0,
        };
        accum.set(t, row);
      }
      row.appearances += 1;
      row.solved += solved;
      row.attemptsSum += attempts;
      row.escalations += escalated;
      if (focusMatch) {
        row.studentAppearances += 1;
        row.studentSolved += solved;
      }
    }
  }

  // First pass — compute averages for normalization.
  for (const row of accum.values()) {
    const avg = row.appearances > 0 ? row.attemptsSum / row.appearances : 0;
    if (avg > maxAvgAttempts) maxAvgAttempts = avg;
  }

  const rows: WordRow[] = [];
  for (const [word, r] of accum) {
    if (r.appearances < minAppearances) continue;
    const { cefr, type } = lookupVocab(word);
    // Always drop proper names — not assessed for CEFR.
    if (type === 'name') continue;
    if (cefrFilter !== 'ALL' && cefr !== cefrFilter) continue;
    if (typeFilter !== 'ALL' && type !== typeFilter) continue;

    const solveRate = r.appearances > 0 ? r.solved / r.appearances : 0;
    const avgAttempts = r.appearances > 0 ? r.attemptsSum / r.appearances : 0;
    const escalationRate = r.appearances > 0 ? r.escalations / r.appearances : 0;
    const normAttempts = maxAvgAttempts > 0 ? Math.min(avgAttempts / maxAvgAttempts, 1) : 0;
    const cefrWeight = CEFR_WEIGHT[cefr];

    const difficultyScore =
      0.35 * (1 - solveRate) +
      0.25 * escalationRate +
      0.15 * normAttempts +
      0.25 * cefrWeight;

    const belowExpectation =
      (cefr === 'A1' || cefr === 'A2') && solveRate < 0.5 && r.appearances >= minAppearances;

    rows.push({
      word,
      cefr,
      type,
      appearances: r.appearances,
      solveRate,
      avgAttempts,
      escalationRate,
      studentSolveRate:
        focusUserId
          ? r.studentAppearances > 0
            ? r.studentSolved / r.studentAppearances
            : null
          : undefined,
      studentAppearances: focusUserId ? r.studentAppearances : undefined,
      difficultyScore,
      belowExpectation,
    });
  }

  rows.sort((a, b) => b.difficultyScore - a.difficultyScore);
  return rows;
}

// ---------- Cohort / per-student summary helpers ----------

export interface CohortSummary {
  totalStudents: number;
  totalInteractions: number;
  solvedRate: number;
  avgTimeToCorrectMs: number;
  avgAttempts: number;
}

export function summarize(
  interactions: InteractionRecord[],
  focusUserId?: string | null
): CohortSummary {
  const scoped = focusUserId
    ? interactions.filter((i) => i.userId === focusUserId)
    : interactions;
  const total = scoped.length;
  const solved = scoped.filter(isSolvedRec).length;
  let timeSum = 0;
  let timeN = 0;
  let attemptsSum = 0;
  let attemptsN = 0;
  const users = new Set<string>();
  for (const rec of scoped) {
    if (rec.userId) users.add(rec.userId);
    if (typeof rec.timeToCorrect === 'number' && rec.timeToCorrect > 0) {
      timeSum += rec.timeToCorrect;
      timeN += 1;
    }
    const a = attemptsOf(rec);
    if (a > 0) {
      attemptsSum += a;
      attemptsN += 1;
    }
  }
  return {
    totalStudents: focusUserId ? 1 : users.size,
    totalInteractions: total,
    solvedRate: total > 0 ? solved / total : 0,
    avgTimeToCorrectMs: timeN > 0 ? timeSum / timeN : 0,
    avgAttempts: attemptsN > 0 ? attemptsSum / attemptsN : 0,
  };
}

export const QUADRANTS = ['thriving', 'language_gap', 'math_struggle', 'dual_challenge'] as const;
export type Quadrant = (typeof QUADRANTS)[number];

export function quadrantDistribution(
  interactions: InteractionRecord[],
  focusUserId?: string | null
): Record<Quadrant, number> {
  const scoped = focusUserId
    ? interactions.filter((i) => i.userId === focusUserId)
    : interactions;
  const out: Record<Quadrant, number> = {
    thriving: 0,
    language_gap: 0,
    math_struggle: 0,
    dual_challenge: 0,
  };
  for (const rec of scoped) {
    const q = rec.diagnosticQuadrant as Quadrant | undefined;
    if (q && q in out) out[q] += 1;
  }
  return out;
}

export interface HintUsage {
  l0: number;
  l1: number;
  l2: number;
  l3: number;
  revealed: number;
  total: number;
}

export function hintUsage(
  interactions: InteractionRecord[],
  focusUserId?: string | null
): HintUsage {
  const scoped = focusUserId
    ? interactions.filter((i) => i.userId === focusUserId)
    : interactions;
  const out: HintUsage = { l0: 0, l1: 0, l2: 0, l3: 0, revealed: 0, total: scoped.length };
  for (const rec of scoped) {
    if (rec.isSolved === 'revealed') {
      out.revealed += 1;
      continue;
    }
    const m = typeof rec.maxHintLevel === 'number' ? rec.maxHintLevel : 0;
    if (m <= 0) out.l0 += 1;
    else if (m === 1) out.l1 += 1;
    else if (m === 2) out.l2 += 1;
    else out.l3 += 1;
  }
  return out;
}

export function listStudents(
  interactions: InteractionRecord[]
): Array<{ userId: string; count: number }> {
  const map = new Map<string, number>();
  for (const rec of interactions) {
    if (!rec.userId) continue;
    map.set(rec.userId, (map.get(rec.userId) ?? 0) + 1);
  }
  return [...map.entries()]
    .map(([userId, count]) => ({ userId, count }))
    .sort((a, b) => b.count - a.count);
}

// ---------- CSV export ----------

function csvEscape(v: unknown): string {
  const s = v == null ? '' : String(v);
  if (/[",\n]/.test(s)) return `"${s.replace(/"/g, '""')}"`;
  return s;
}

export function wordRowsToCsv(rows: WordRow[], includeStudent: boolean): string {
  const head = [
    'word',
    'cefr',
    'type',
    'appearances',
    'solve_rate',
    'avg_attempts',
    'escalation_rate',
    'difficulty_score',
    'below_expectation',
  ];
  if (includeStudent) {
    head.splice(5, 0, 'student_solve_rate', 'student_appearances');
  }
  const lines: string[] = [head.join(',')];
  for (const r of rows) {
    const base: Array<string | number | boolean | null | undefined> = [
      r.word,
      r.cefr,
      r.type,
      r.appearances,
      r.solveRate.toFixed(4),
    ];
    if (includeStudent) {
      base.push(
        r.studentSolveRate == null ? '' : r.studentSolveRate.toFixed(4),
        r.studentAppearances ?? 0
      );
    }
    base.push(
      r.avgAttempts.toFixed(3),
      r.escalationRate.toFixed(4),
      r.difficultyScore.toFixed(4),
      r.belowExpectation ? 'true' : 'false'
    );
    lines.push(base.map(csvEscape).join(','));
  }
  return lines.join('\n');
}

export function interactionsToCsv(interactions: InteractionRecord[]): string {
  const head = [
    'id', 'userId', 'problemId', 'questionTopic', 'questionLevel',
    'isSolved', 'attemptsCount', 'maxHintLevel', 'activeLevelOnCorrect',
    'lds', 'mcs', 'diagnosticQuadrant', 'timeToCorrect', 'createdAt',
  ];
  const lines: string[] = [head.join(',')];
  for (const r of interactions) {
    lines.push(head.map((k) => csvEscape((r as Record<string, unknown>)[k])).join(','));
  }
  return lines.join('\n');
}

export function downloadFile(filename: string, content: string, mime = 'text/plain') {
  const blob = new Blob([content], { type: mime });
  const url = URL.createObjectURL(blob);
  const a = document.createElement('a');
  a.href = url;
  a.download = filename;
  document.body.appendChild(a);
  a.click();
  document.body.removeChild(a);
  URL.revokeObjectURL(url);
}
