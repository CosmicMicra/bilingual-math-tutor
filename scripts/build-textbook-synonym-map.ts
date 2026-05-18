/**
 * Builds textbook_synonym_map.json — a CEFR-graded synonym map where:
 *
 *   - SYNONYM SOURCE:   Princeton WordNet 3.x (via `wordpos`)
 *   - TEXTBOOK FILTER:  Only synonyms that actually appear somewhere in
 *                       our grade 6-7 question bank vocabulary
 *                       (extracted from question_database.json).
 *                       Swap CORPUS_SOURCE to an external textbook
 *                       word list later if you want broader coverage.
 *   - CEFR ORACLE:      cefr_vocabulary.json
 *   - PROTECTED TERMS:  Common Core / NCTM grade 6-7 math vocabulary
 *                       — never substituted.
 *
 * Output entry shape:
 *   "approximately": {
 *     "cefr": "B2",
 *     "type": "general",
 *     "by_level": {
 *       "A1": ["about"],
 *       "A2": ["around", "near"],
 *       "B1": ["nearly"]
 *     }
 *   }
 *
 * Usage: npx tsx scripts/build-textbook-synonym-map.ts
 */
import * as fs from 'node:fs';
import * as path from 'node:path';
import { createRequire } from 'node:module';
const require = createRequire(import.meta.url);
// eslint-disable-next-line @typescript-eslint/no-require-imports
const WordPOS = require('wordpos');

const ROOT = process.cwd();
const VOCAB_PATH = path.join(ROOT, 'cefr_vocabulary.json');
const QUESTIONS_PATH = path.join(ROOT, 'question_database.json');
const OUT_PATH = path.join(ROOT, 'textbook_synonym_map.json');

const CEFR_LEVELS = ['A1', 'A2', 'B1', 'B2', 'C1', 'C2'] as const;
const CEFR_RANK: Record<string, number> = { A1: 1, A2: 2, B1: 3, B2: 4, C1: 5, C2: 6 };

type CefrLevel = (typeof CEFR_LEVELS)[number];
type VocabEntry = { cefr: string; type: string };
type ByLevel = Partial<Record<CefrLevel, string[]>>;
type MapEntry =
  | { cefr: string; type: string; protected: true; reason: string }
  | { cefr: string; type: string; by_level: ByLevel };

/**
 * Grade 6-7 essential math vocabulary (Common Core / NCTM).
 * NEVER substituted — students must learn these terms verbatim.
 */
const PROTECTED_MATH_TERMS = new Set<string>([
  'ratio', 'rate', 'unit', 'percent', 'percentage', 'equivalent',
  'coefficient', 'variable', 'expression', 'equation', 'inequality',
  'factor', 'multiple', 'gcf', 'lcm',
  'mean', 'median', 'mode', 'range', 'quartile',
  'fraction', 'numerator', 'denominator', 'decimal',
  'integer', 'negative', 'positive', 'opposite', 'absolute',
  'plane', 'axis', 'coordinate', 'origin', 'quadrant',
  'area', 'perimeter', 'volume',
  'proportion', 'proportional', 'scale',
  'rational', 'irrational',
  'probability', 'sample', 'population', 'distribution',
  'circumference', 'radius', 'diameter',
  'angle', 'triangle', 'quadrilateral', 'polygon',
  'parallel', 'perpendicular',
  'sum', 'difference', 'product', 'quotient',
  'addend', 'minuend', 'subtrahend', 'dividend', 'divisor',
  'add', 'subtract', 'multiply', 'divide',
  'estimate', 'evaluate', 'simplify', 'solve',
  'square', 'rectangle', 'circle', 'cube', 'cylinder', 'sphere', 'cone',
  'vertex', 'edge', 'face', 'side',
  'length', 'width', 'height', 'depth',
]);

// ── Step A: build the textbook corpus from question_database.json ─────────
function buildCorpus(): Set<string> {
  const questions = JSON.parse(fs.readFileSync(QUESTIONS_PATH, 'utf-8')) as Array<{
    problem_text?: string;
    scaffolds?: Record<string, string>;
    solution_steps?: string[];
  }>;
  const corpus = new Set<string>();
  const collect = (text: string) => {
    const tokens = text.toLowerCase().match(/[a-z]+/g) ?? [];
    for (const t of tokens) corpus.add(t);
  };
  for (const q of questions) {
    if (q.problem_text) collect(q.problem_text);
    if (q.scaffolds) for (const v of Object.values(q.scaffolds)) collect(v);
    if (q.solution_steps) for (const s of q.solution_steps) collect(s);
  }
  return corpus;
}

// ── Step B: pull WordNet synonyms — POS-restricted + first-sense only ────
// Strategy:
//   1. Look up the word in all 4 POS, but pick the DOMINANT POS
//      (the one with the most synsets — i.e., the word's most common
//      grammatical role per WordNet).
//   2. From that POS, keep ONLY the first synset (WordNet orders synsets
//      by frequency, so synset[0] = the most common sense of the word).
// This trades recall for precision: fewer synonyms, but each one is
// strongly tied to the word's primary meaning.
async function getWordNetSynonyms(wp: any, word: string): Promise<string[]> {
  const [nouns, verbs, adjs, advs] = await Promise.all([
    wp.lookupNoun(word).catch(() => []),
    wp.lookupVerb(word).catch(() => []),
    wp.lookupAdjective(word).catch(() => []),
    wp.lookupAdverb(word).catch(() => []),
  ]);
  // Pick dominant POS by synset count (ties broken by N > V > Adj > Adv,
  // which roughly matches typical math-word-problem usage).
  const buckets: Array<{ pos: string; synsets: any[] }> = [
    { pos: 'n',   synsets: nouns ?? [] },
    { pos: 'v',   synsets: verbs ?? [] },
    { pos: 'a',   synsets: adjs  ?? [] },
    { pos: 'r',   synsets: advs  ?? [] },
  ];
  const dominant = buckets.reduce((best, b) =>
    b.synsets.length > best.synsets.length ? b : best
  );
  const firstSense = dominant.synsets[0];
  const syns: string[] = firstSense?.synonyms ?? [];
  const out = new Set<string>();
  for (const s of syns) {
    const cleaned = s.toLowerCase().replace(/_/g, ' ').trim();
    if (cleaned && cleaned !== word.toLowerCase()) out.add(cleaned);
  }
  return Array.from(out);
}

async function main() {
  // Load CEFR oracle
  const raw = JSON.parse(fs.readFileSync(VOCAB_PATH, 'utf-8')) as Record<string, VocabEntry | unknown>;
  const vocab: Record<string, VocabEntry> = {};
  for (const [k, v] of Object.entries(raw)) {
    if (k.startsWith('_')) continue;
    if (v && typeof v === 'object' && 'cefr' in v) vocab[k.toLowerCase()] = v as VocabEntry;
  }

  // Build textbook corpus
  const corpus = buildCorpus();
  console.log(`Loaded ${Object.keys(vocab).length} CEFR-tagged words`);
  console.log(`Built corpus of ${corpus.size} unique words from question_database.json`);

  // Pick all words that need a synonym entry — every CEFR-tagged word
  // except proper names (we want by-level synonyms for ALL levels, not
  // just hard ones, so the map can support enrichment too).
  const sourceWords = Object.entries(vocab)
    .filter(([, v]) => v.type !== 'name')
    .map(([w]) => w);

  console.log(`Processing ${sourceWords.length} source words...`);

  const wp = new WordPOS();
  const out: Record<string, MapEntry> = {};

  let protectedCount = 0;
  let mappedCount = 0;
  let unmappedCount = 0;

  for (const word of sourceWords) {
    const entry = vocab[word];

    // Rule 1: protect curriculum math terms
    if (PROTECTED_MATH_TERMS.has(word)) {
      out[word] = {
        cefr: entry.cefr,
        type: entry.type,
        protected: true,
        reason: 'Common Core / NCTM Grade 6-7 essential math vocabulary',
      };
      protectedCount++;
      continue;
    }

    // Rule 2: get synonyms from WordNet
    const candidates = await getWordNetSynonyms(wp, word);

    // Rule 3: keep only synonyms that are
    //   (a) present in the textbook corpus AND
    //   (b) CEFR-tagged in cefr_vocabulary.json
    // Then group by CEFR level.
    const by_level: ByLevel = {};
    for (const cand of candidates) {
      if (!corpus.has(cand)) continue;          // textbook filter
      const cefr = vocab[cand]?.cefr;            // CEFR check
      if (!cefr || !CEFR_RANK[cefr]) continue;
      const level = cefr as CefrLevel;
      (by_level[level] ??= []).push(cand);
    }

    // Dedupe inside each bucket (preserve order)
    for (const lvl of CEFR_LEVELS) {
      if (by_level[lvl]) by_level[lvl] = Array.from(new Set(by_level[lvl]));
    }

    const totalSynonyms = Object.values(by_level).reduce((n, arr) => n + (arr?.length ?? 0), 0);
    if (totalSynonyms > 0) {
      out[word] = { cefr: entry.cefr, type: entry.type, by_level };
      mappedCount++;
    } else {
      unmappedCount++;
    }
  }

  const payload = {
    _meta: {
      description:
        'CEFR-graded synonym map for grade 6-7 math word problems. ' +
        'Synonyms grouped by CEFR level so consumers can request a specific level.',
      sources: {
        synonyms: 'Princeton WordNet 3.x (via wordpos npm package)',
        textbook_corpus: 'Tokenized vocabulary of question_database.json (problem_text + scaffolds + solution_steps)',
        cefr_levels: 'cefr_vocabulary.json (Cambridge English Vocabulary Profile + math grade-level mapping)',
        protected_terms: 'Common Core State Standards for Mathematics, Grades 6-7; NCTM',
      },
      rules: [
        'Synonyms come from a single WordNet POS — the dominant one for the source word',
        'Only the first synset (most common sense) of that POS is used',
        'Synonyms must appear in the grade 6-7 textbook corpus',
        'Synonyms must have a CEFR level recorded in cefr_vocabulary.json',
        'Protected math terms are never substituted',
        'Synonyms are bucketed under their CEFR level (A1..C2)',
      ],
      target_grades: [6, 7],
      created_at: new Date().toISOString(),
      stats: {
        source_words: sourceWords.length,
        textbook_corpus_size: corpus.size,
        protected_terms: protectedCount,
        words_with_synonyms: mappedCount,
        words_without_textbook_synonyms: unmappedCount,
      },
    },
    ...out,
  };

  fs.writeFileSync(OUT_PATH, JSON.stringify(payload, null, 2));
  console.log(`\nResults:`);
  console.log(`  Protected math terms:           ${protectedCount}`);
  console.log(`  Words with textbook synonyms:   ${mappedCount}`);
  console.log(`  Words without textbook synonyms:${unmappedCount}`);
  console.log(`\nWrote ${OUT_PATH}`);
}

main().catch((err) => {
  console.error(err);
  process.exit(1);
});
