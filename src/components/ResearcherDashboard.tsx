import React from 'react';
import {
  Users,
  BarChart3,
  Download,
  RefreshCw,
  AlertCircle,
  ChevronDown,
} from 'lucide-react';
import { getAllSessions, type InteractionRecord } from '../lib/api';
import {
  CEFR_ORDER,
  WORD_TYPES,
  analyzeWords,
  downloadFile,
  hintUsage,
  interactionsToCsv,
  listStudents,
  quadrantDistribution,
  summarize,
  wordRowsToCsv,
  type CefrBand,
  type WordRow,
  type WordType,
} from '../lib/word-analysis';

type Scope = 'cohort' | 'student';

const QUADRANT_LABEL: Record<string, string> = {
  thriving: 'Thriving',
  language_gap: 'Language Gap',
  math_struggle: 'Math Struggle',
  dual_challenge: 'Dual Challenge',
};

function pct(n: number): string {
  if (!Number.isFinite(n)) return '—';
  return `${(n * 100).toFixed(0)}%`;
}

function fmtMs(ms: number): string {
  if (!ms || !Number.isFinite(ms)) return '—';
  const s = ms / 1000;
  if (s < 60) return `${s.toFixed(1)}s`;
  const m = Math.floor(s / 60);
  return `${m}m ${Math.round(s - m * 60)}s`;
}

function shortId(id: string | undefined, n = 8): string {
  if (!id) return '—';
  return id.length <= n ? id : `${id.slice(0, n)}…`;
}

function CefrBadge({ band }: { band: CefrBand }) {
  const colors: Record<CefrBand, string> = {
    A1: 'bg-emerald-50 text-emerald-700 border-emerald-200',
    A2: 'bg-emerald-50 text-emerald-700 border-emerald-200',
    B1: 'bg-amber-50 text-amber-700 border-amber-200',
    B2: 'bg-amber-50 text-amber-700 border-amber-200',
    C1: 'bg-rose-50 text-rose-700 border-rose-200',
    C2: 'bg-rose-50 text-rose-700 border-rose-200',
    U: 'bg-[#F3F1E9] text-[#8B9D83] border-[#E6E2D3]',
  };
  return (
    <span
      className={`inline-block px-1.5 py-0.5 rounded border text-[10px] font-bold tracking-wider ${colors[band]}`}
    >
      {band === 'U' ? '—' : band}
    </span>
  );
}

export default function ResearcherDashboard() {
  const [interactions, setInteractions] = React.useState<InteractionRecord[]>([]);
  const [loading, setLoading] = React.useState(true);
  const [error, setError] = React.useState<string | null>(null);
  const [scope, setScope] = React.useState<Scope>('cohort');
  const [studentId, setStudentId] = React.useState<string | null>(null);
  const [cefrFilter, setCefrFilter] = React.useState<CefrBand | 'ALL'>('ALL');
  const [typeFilter, setTypeFilter] = React.useState<WordType | 'ALL'>('ALL');
  const [minAppearances, setMinAppearances] = React.useState(3);

  const refresh = React.useCallback(async () => {
    setLoading(true);
    setError(null);
    try {
      const data = await getAllSessions();
      setInteractions(data);
    } catch (err) {
      setError(err instanceof Error ? err.message : 'Failed to load sessions');
    } finally {
      setLoading(false);
    }
  }, []);

  React.useEffect(() => {
    refresh();
  }, [refresh]);

  const students = React.useMemo(() => listStudents(interactions), [interactions]);

  // Auto-pick first student when switching to per-student scope.
  React.useEffect(() => {
    if (scope === 'student' && !studentId && students.length > 0) {
      setStudentId(students[0].userId);
    }
  }, [scope, studentId, students]);

  const focusUserId = scope === 'student' ? studentId : null;

  const summary = React.useMemo(
    () => summarize(interactions, focusUserId),
    [interactions, focusUserId]
  );
  const quadrants = React.useMemo(
    () => quadrantDistribution(interactions, focusUserId),
    [interactions, focusUserId]
  );
  const hints = React.useMemo(
    () => hintUsage(interactions, focusUserId),
    [interactions, focusUserId]
  );

  const wordRows: WordRow[] = React.useMemo(
    () =>
      analyzeWords(interactions, {
        focusUserId,
        minAppearances,
        cefrFilter,
        typeFilter,
      }),
    [interactions, focusUserId, minAppearances, cefrFilter, typeFilter]
  );

  const scopedInteractions = React.useMemo(
    () =>
      focusUserId
        ? interactions.filter((i) => i.userId === focusUserId)
        : interactions,
    [interactions, focusUserId]
  );

  const recent = React.useMemo(() => scopedInteractions.slice(0, 20), [scopedInteractions]);

  const scopeLabel = scope === 'cohort' ? 'Cohort' : `Student ${shortId(focusUserId ?? '')}`;

  return (
    <main className="max-w-7xl mx-auto px-8 py-8 space-y-6">
      {/* Scope bar */}
      <section className="bg-white border border-[#E6E2D3] rounded-2xl p-4 shadow-sm flex flex-wrap items-center gap-4">
        <div className="flex items-center gap-2">
          <BarChart3 className="w-4 h-4 text-[#8B9D83]" />
          <span className="text-[10px] uppercase tracking-widest font-bold text-[#5A534A]">
            Researcher Dashboard
          </span>
        </div>

        <div className="flex rounded-lg border border-[#E6E2D3] overflow-hidden">
          <button
            onClick={() => setScope('cohort')}
            className={`px-3 py-1.5 text-[11px] font-bold uppercase tracking-wider ${
              scope === 'cohort'
                ? 'bg-[#8B9D83] text-white'
                : 'bg-white text-[#5A534A] hover:bg-[#F3F1E9]'
            }`}
          >
            All Students
          </button>
          <button
            onClick={() => setScope('student')}
            className={`px-3 py-1.5 text-[11px] font-bold uppercase tracking-wider ${
              scope === 'student'
                ? 'bg-[#8B9D83] text-white'
                : 'bg-white text-[#5A534A] hover:bg-[#F3F1E9]'
            }`}
          >
            Per Student
          </button>
        </div>

        {scope === 'student' && (
          <div className="relative">
            <select
              value={studentId ?? ''}
              onChange={(e) => setStudentId(e.target.value || null)}
              className="appearance-none pr-8 pl-3 py-1.5 text-xs font-medium border border-[#E6E2D3] rounded-lg bg-white text-[#5A534A] focus:outline-none focus:ring-1 focus:ring-[#8B9D83]"
            >
              {students.length === 0 && <option value="">No students yet</option>}
              {students.map((s) => (
                <option key={s.userId} value={s.userId}>
                  {shortId(s.userId, 12)} · {s.count} interactions
                </option>
              ))}
            </select>
            <ChevronDown className="w-3 h-3 text-[#8B9D83] absolute right-2 top-1/2 -translate-y-1/2 pointer-events-none" />
          </div>
        )}

        <div className="ml-auto flex items-center gap-2">
          <button
            onClick={refresh}
            className="px-3 py-1.5 rounded-lg border border-[#E6E2D3] text-[11px] font-bold uppercase tracking-wider text-[#5A534A] hover:bg-[#F3F1E9] flex items-center gap-1.5"
          >
            <RefreshCw className={`w-3 h-3 ${loading ? 'animate-spin' : ''}`} />
            Refresh
          </button>
          <button
            onClick={() =>
              downloadFile(
                `interactions-${scope}-${Date.now()}.csv`,
                interactionsToCsv(scopedInteractions),
                'text/csv'
              )
            }
            className="px-3 py-1.5 rounded-lg border border-[#E6E2D3] text-[11px] font-bold uppercase tracking-wider text-[#5A534A] hover:bg-[#F3F1E9] flex items-center gap-1.5"
          >
            <Download className="w-3 h-3" />
            Interactions CSV
          </button>
          <button
            onClick={() =>
              downloadFile(
                `interactions-${scope}-${Date.now()}.json`,
                JSON.stringify(scopedInteractions, null, 2),
                'application/json'
              )
            }
            className="px-3 py-1.5 rounded-lg border border-[#E6E2D3] text-[11px] font-bold uppercase tracking-wider text-[#5A534A] hover:bg-[#F3F1E9] flex items-center gap-1.5"
          >
            <Download className="w-3 h-3" />
            JSON
          </button>
        </div>
      </section>

      {error && (
        <div className="bg-rose-50 border border-rose-200 text-rose-800 text-sm px-4 py-3 rounded-xl flex items-center gap-2">
          <AlertCircle className="w-4 h-4" />
          {error}
        </div>
      )}

      {loading && interactions.length === 0 && (
        <div className="text-sm text-[#5A534A] opacity-70">Loading interactions…</div>
      )}

      {/* Summary cards */}
      <section className="grid grid-cols-2 md:grid-cols-5 gap-4">
        <Card label={scope === 'cohort' ? 'Students' : 'Selected Student'} value={summary.totalStudents.toString()} />
        <Card label="Interactions" value={summary.totalInteractions.toString()} />
        <Card label="Solve Rate" value={pct(summary.solvedRate)} />
        <Card label="Avg Time to Correct" value={fmtMs(summary.avgTimeToCorrectMs)} />
        <Card label="Avg Attempts" value={summary.avgAttempts ? summary.avgAttempts.toFixed(2) : '—'} />
      </section>

      {/* Quadrants + hint usage */}
      <section className="grid grid-cols-1 lg:grid-cols-2 gap-6">
        <Panel title="Diagnostic Quadrant Distribution" subtitle={scopeLabel}>
          <div className="space-y-3">
            {Object.entries(quadrants).map(([q, n]) => {
              const counts = Object.values(quadrants) as number[];
              const denom = counts.reduce((a, b) => a + b, 0) || 1;
              const ratio = (n as number) / denom;
              return (
                <div key={q}>
                  <div className="flex justify-between text-xs font-medium text-[#5A534A] mb-1">
                    <span>{QUADRANT_LABEL[q] ?? q}</span>
                    <span className="opacity-60">
                      {n} · {pct(ratio)}
                    </span>
                  </div>
                  <div className="h-2 bg-[#F3F1E9] rounded-full overflow-hidden">
                    <div
                      className="h-full bg-[#8B9D83]"
                      style={{ width: `${ratio * 100}%` }}
                    />
                  </div>
                </div>
              );
            })}
          </div>
        </Panel>

        <Panel title="Hint Depth Usage" subtitle={scopeLabel}>
          <div className="space-y-3">
            {([
              ['No Hint (L0)', hints.l0],
              ['L1 Simplified', hints.l1],
              ['L2 Bilingual', hints.l2],
              ['L3 Spanish', hints.l3],
              ['Answer Revealed', hints.revealed],
            ] as Array<[string, number]>).map(([label, n]) => {
              const denom = hints.total || 1;
              const ratio = n / denom;
              return (
                <div key={label}>
                  <div className="flex justify-between text-xs font-medium text-[#5A534A] mb-1">
                    <span>{label}</span>
                    <span className="opacity-60">
                      {n} · {pct(ratio)}
                    </span>
                  </div>
                  <div className="h-2 bg-[#F3F1E9] rounded-full overflow-hidden">
                    <div
                      className="h-full bg-[#8B9D83]"
                      style={{ width: `${ratio * 100}%` }}
                    />
                  </div>
                </div>
              );
            })}
          </div>
        </Panel>
      </section>

      {/* Word Difficulty */}
      <Panel
        title="Word Difficulty"
        subtitle="Cohort-averaged signals · CEFR-weighted · sorted by difficulty"
        right={
          <button
            onClick={() =>
              downloadFile(
                `word-difficulty-${scope}-${Date.now()}.csv`,
                wordRowsToCsv(wordRows, !!focusUserId),
                'text/csv'
              )
            }
            className="px-3 py-1.5 rounded-lg border border-[#E6E2D3] text-[11px] font-bold uppercase tracking-wider text-[#5A534A] hover:bg-[#F3F1E9] flex items-center gap-1.5"
          >
            <Download className="w-3 h-3" />
            Words CSV
          </button>
        }
      >
        <div className="flex flex-wrap items-center gap-3 mb-2 text-[11px]">
          <span className="font-bold uppercase tracking-wider text-[#5A534A] opacity-70">CEFR:</span>
          {(['ALL', ...CEFR_ORDER] as Array<CefrBand | 'ALL'>).map((b) => (
            <button
              key={b}
              onClick={() => setCefrFilter(b)}
              className={`px-2 py-0.5 rounded border text-[10px] font-bold tracking-wider ${
                cefrFilter === b
                  ? 'bg-[#8B9D83] text-white border-[#8B9D83]'
                  : 'bg-white border-[#E6E2D3] text-[#5A534A] hover:bg-[#F3F1E9]'
              }`}
            >
              {b === 'U' ? 'Unknown' : b}
            </button>
          ))}
          <div className="ml-4 flex items-center gap-2">
            <span className="font-bold uppercase tracking-wider text-[#5A534A] opacity-70">
              Min appearances
            </span>
            <input
              type="number"
              min={1}
              max={50}
              value={minAppearances}
              onChange={(e) => setMinAppearances(Math.max(1, Number(e.target.value) || 1))}
              className="w-16 px-2 py-1 border border-[#E6E2D3] rounded text-xs"
            />
          </div>
          <span className="ml-auto text-[10px] font-bold uppercase tracking-wider text-[#8B9D83]">
            {wordRows.length} words
          </span>
        </div>

        <div className="flex flex-wrap items-center gap-3 mb-4 text-[11px]">
          <span
            title="Word type from cefr_vocabulary.json: math = academic math term, general = everyday English, context = story word, name = proper noun (always excluded)."
            className="font-bold uppercase tracking-wider text-[#5A534A] opacity-70"
          >
            Type:
          </span>
          {(['ALL', ...WORD_TYPES.filter((t) => t !== 'name')] as Array<WordType | 'ALL'>).map((t) => (
            <button
              key={t}
              onClick={() => setTypeFilter(t)}
              className={`px-2 py-0.5 rounded border text-[10px] font-bold tracking-wider capitalize ${
                typeFilter === t
                  ? 'bg-[#5A534A] text-white border-[#5A534A]'
                  : 'bg-white border-[#E6E2D3] text-[#5A534A] hover:bg-[#F3F1E9]'
              }`}
            >
              {t}
            </button>
          ))}
        </div>

        {wordRows.length === 0 ? (
          <p className="text-sm text-[#5A534A] opacity-60">
            Not enough data yet. Try lowering “min appearances” or run more sessions.
          </p>
        ) : (
          <div className="overflow-x-auto -mx-2">
            <table className="w-full text-sm">
              <thead>
                <tr className="text-[10px] uppercase tracking-wider text-[#8B9D83] border-b border-[#E6E2D3]">
                  <th className="text-left px-2 py-2">Word</th>
                  <th className="text-left px-2 py-2">CEFR</th>
                  <th className="text-left px-2 py-2">Type</th>
                  <th className="text-right px-2 py-2">Appearances</th>
                  <th className="text-right px-2 py-2">Solve&nbsp;Rate</th>
                  {focusUserId && (
                    <th className="text-right px-2 py-2">Student&nbsp;Solve</th>
                  )}
                  <th className="text-right px-2 py-2">Avg&nbsp;Attempts</th>
                  <th className="text-right px-2 py-2">Escalation</th>
                  <th className="text-right px-2 py-2">Difficulty</th>
                </tr>
              </thead>
              <tbody>
                {wordRows.slice(0, 100).map((r) => (
                  <tr key={r.word} className="border-b border-[#F3F1E9] hover:bg-[#FDFBF7]">
                    <td className="px-2 py-2 font-medium text-[#5A534A]">
                      {r.word}
                      {r.belowExpectation && (
                        <span
                          title="Performance is below what this word's CEFR level predicts (A1/A2 word with low solve rate)."
                          className="ml-2 px-1.5 py-0.5 rounded text-[9px] font-bold uppercase tracking-wider bg-rose-50 border border-rose-200 text-rose-700"
                        >
                          Below expectation
                        </span>
                      )}
                    </td>
                    <td className="px-2 py-2">
                      <CefrBadge band={r.cefr} />
                    </td>
                    <td className="px-2 py-2">
                      <span
                        className={`inline-block px-1.5 py-0.5 rounded border text-[10px] font-bold uppercase tracking-wider ${
                          r.type === 'math'
                            ? 'bg-indigo-50 text-indigo-700 border-indigo-200'
                            : r.type === 'context'
                            ? 'bg-amber-50 text-amber-700 border-amber-200'
                            : r.type === 'general'
                            ? 'bg-[#F3F1E9] text-[#5A534A] border-[#E6E2D3]'
                            : 'bg-white text-[#8B9D83] border-[#E6E2D3]'
                        }`}
                      >
                        {r.type === 'unknown' ? '—' : r.type}
                      </span>
                    </td>
                    <td className="text-right px-2 py-2 tabular-nums">{r.appearances}</td>
                    <td className="text-right px-2 py-2 tabular-nums">{pct(r.solveRate)}</td>
                    {focusUserId && (
                      <td className="text-right px-2 py-2 tabular-nums">
                        {r.studentSolveRate == null ? '—' : pct(r.studentSolveRate)}
                        {r.studentAppearances != null && (
                          <span className="ml-1 text-[10px] opacity-60">
                            ({r.studentAppearances})
                          </span>
                        )}
                      </td>
                    )}
                    <td className="text-right px-2 py-2 tabular-nums">{r.avgAttempts.toFixed(2)}</td>
                    <td className="text-right px-2 py-2 tabular-nums">{pct(r.escalationRate)}</td>
                    <td className="text-right px-2 py-2 tabular-nums font-bold text-[#5A534A]">
                      {r.difficultyScore.toFixed(2)}
                    </td>
                  </tr>
                ))}
              </tbody>
            </table>
            {wordRows.length > 100 && (
              <p className="text-[10px] text-[#8B9D83] mt-2">
                Showing top 100 of {wordRows.length}. Export CSV for full list.
              </p>
            )}
          </div>
        )}
      </Panel>

      {/* Recent sessions */}
      <Panel title="Recent Sessions" subtitle={`${recent.length} of ${scopedInteractions.length}`}>
        <div className="overflow-x-auto -mx-2">
          <table className="w-full text-sm">
            <thead>
              <tr className="text-[10px] uppercase tracking-wider text-[#8B9D83] border-b border-[#E6E2D3]">
                <th className="text-left px-2 py-2">User</th>
                <th className="text-left px-2 py-2">Problem</th>
                <th className="text-left px-2 py-2">Topic / Level</th>
                <th className="text-left px-2 py-2">Status</th>
                <th className="text-left px-2 py-2">Quadrant</th>
                <th className="text-right px-2 py-2">Attempts</th>
                <th className="text-right px-2 py-2">Time</th>
              </tr>
            </thead>
            <tbody>
              {recent.map((rec) => (
                <tr key={rec.id} className="border-b border-[#F3F1E9] hover:bg-[#FDFBF7]">
                  <td className="px-2 py-2 font-mono text-[11px] text-[#5A534A]">
                    {shortId(rec.userId)}
                  </td>
                  <td className="px-2 py-2 font-serif italic text-[#5A534A] max-w-[20rem]">
                    <span className="line-clamp-1">
                      {rec.problem?.original ?? rec.problem?.simplified ?? '—'}
                    </span>
                  </td>
                  <td className="px-2 py-2 text-xs text-[#5A534A]">
                    {(rec.questionTopic ?? '—')}
                    <span className="opacity-60"> · {rec.questionLevel ?? '—'}</span>
                  </td>
                  <td className="px-2 py-2 text-xs">
                    {rec.isSolved === 'solved' ? (
                      <span className="text-emerald-700">Solved</span>
                    ) : rec.isSolved === 'revealed' ? (
                      <span className="text-amber-700">Revealed</span>
                    ) : (
                      <span className="text-[#8B9D83]">In&nbsp;progress</span>
                    )}
                  </td>
                  <td className="px-2 py-2 text-xs text-[#5A534A]">
                    {rec.diagnosticQuadrant
                      ? QUADRANT_LABEL[rec.diagnosticQuadrant] ?? rec.diagnosticQuadrant
                      : '—'}
                  </td>
                  <td className="text-right px-2 py-2 tabular-nums">
                    {rec.attemptsCount ?? '—'}
                  </td>
                  <td className="text-right px-2 py-2 tabular-nums">
                    {fmtMs(rec.timeToCorrect ?? 0)}
                  </td>
                </tr>
              ))}
              {recent.length === 0 && (
                <tr>
                  <td colSpan={7} className="text-center text-[#8B9D83] py-6 text-sm">
                    No sessions yet.
                  </td>
                </tr>
              )}
            </tbody>
          </table>
        </div>
      </Panel>
    </main>
  );
}

function Card({ label, value }: { label: string; value: string }) {
  return (
    <div className="bg-white border border-[#E6E2D3] rounded-xl p-4 shadow-sm">
      <p className="text-[10px] uppercase tracking-widest font-bold text-[#8B9D83] mb-1">
        {label}
      </p>
      <p className="text-2xl font-bold text-[#5A534A]">{value}</p>
    </div>
  );
}

function Panel({
  title,
  subtitle,
  right,
  children,
}: {
  title: string;
  subtitle?: string;
  right?: React.ReactNode;
  children: React.ReactNode;
}) {
  return (
    <section className="bg-white border border-[#E6E2D3] rounded-2xl p-6 shadow-sm">
      <div className="flex items-start justify-between gap-4 mb-4">
        <div>
          <h2 className="text-sm font-bold uppercase tracking-wider text-[#5A534A] flex items-center gap-2">
            <Users className="w-3.5 h-3.5 text-[#8B9D83]" />
            {title}
          </h2>
          {subtitle && (
            <p className="text-[10px] uppercase tracking-widest font-bold text-[#8B9D83] mt-1">
              {subtitle}
            </p>
          )}
        </div>
        {right}
      </div>
      {children}
    </section>
  );
}
