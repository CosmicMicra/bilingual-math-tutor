import React from 'react';
import { motion, AnimatePresence } from 'motion/react';
import {
  GoogleAuthProvider,
  createUserWithEmailAndPassword,
  getAuth,
  onAuthStateChanged,
  signInWithEmailAndPassword,
  signInWithPopup,
  signOut,
  type User,
} from 'firebase/auth';
import { Languages, HelpCircle, CheckCircle2, ChevronRight, BookOpen, Clock, BarChart3, AlertCircle, Users, Lock, Trash2 } from 'lucide-react';
import { translateProblem, BilingualProblem } from './lib/gemini';
import { firebaseApp } from './lib/firebase';
import { authFetch, getMyProfile, selectQuestion, upsertMyProfile, type QuestionRecord, type UserProfile } from './lib/api';

import { calculateLDS, calculateMCS, InteractionFeatures, getDiagnosticQuadrant, adaptiveDecide, AdaptiveState } from './lib/adaptive-engine';

const EMA_PREV_WEIGHT = 0.7;
const EMA_SAMPLE_WEIGHT = 0.3;
const ANALYTICS_BLOCK_SIZE = 20;

function stepEma(prev: number | null, sample: number): number {
  return prev === null ? sample : EMA_PREV_WEIGHT * prev + EMA_SAMPLE_WEIGHT * sample;
}

interface SessionMetricsState {
  lifetimeLds: number | null;
  lifetimeMcs: number | null;
  blockLds: number | null;
  blockMcs: number | null;
  completedProblems: number;
  analyticsBlockIndex: number;
}

const INITIAL_SESSION_METRICS: SessionMetricsState = {
  lifetimeLds: null,
  lifetimeMcs: null,
  blockLds: null,
  blockMcs: null,
  completedProblems: 0,
  analyticsBlockIndex: 1,
};

// --- Types ---
type ProblemStatus = 'solved' | 'revealed' | 'unsolved';

interface Interaction {
  id: string;
  problemId: string;
  userId: string;
  problem: BilingualProblem;
  attempts: string[];
  attemptsCount: number;
  levelViews: {
    [key: number]: number; // Level ID -> First access timestamp
  };
  levelsViewedBeforeCorrect: number[];
  activeLevelOnCorrect?: number;
  timeSpentPerLevel: {
    [key: number]: number; // Level ID -> Total ms spent
  };
  lastLevelChangeTimestamp: number;
  sessionStartTime: number;
  
  firstCorrectAnswer?: string;
  timeToFirstAttempt?: number;
  timeToCorrect?: number;
  timeStepsViewed?: string;
  answerRevealedBySystem: boolean;
  timeAnswerRevealed?: string;
  timeHintUnlocked?: string;
  
  isSolved: ProblemStatus;
  createdAt: number;

  // Feature Engineering
  lds: number;
  mcs: number;
  maxHintLevel: number;
  diagnosticQuadrant?: string;
  adaptiveDecision?: string;
  nextLevel?: string;
  questionId?: string;
  questionTopic?: string;
  questionLevel?: string;
  sourceMode?: 'manual' | 'practice';
}

// --- Components ---

const Header = ({
  user,
  profile,
  onSignOut,
}: {
  user: User | null;
  profile: UserProfile | null;
  onSignOut: () => void;
}) => (
  <header className="border-b border-[#E6E2D3] bg-white sticky top-0 z-50">
    <div className="max-w-7xl mx-auto px-8 py-4 flex items-center justify-between">
      <div className="flex items-center gap-3">
        <div className="w-10 h-10 bg-[#8B9D83] rounded-lg flex items-center justify-center shadow-sm">
          <BookOpen className="text-white w-6 h-6" />
        </div>
        <div>
          <h1 className="text-xl font-bold tracking-tight text-[#5A534A]">
            Bilingual Math Tutor <span className="font-normal opacity-60">| Bilingual Notebook</span>
          </h1>
          <p className="text-[10px] uppercase tracking-[0.2em] font-bold text-[#8B9D83] mt-1">Adaptive Learning Suite v1.1</p>
        </div>
      </div>
      <div className="flex items-center gap-6">
        <div className="text-right hidden sm:block">
          <p className="text-[10px] uppercase tracking-widest opacity-60 font-bold text-[#433E37]">Student Progress</p>
          <p className="text-sm font-medium italic text-[#5A534A]">
            {profile?.displayName || user?.email || 'Learning Session Active'}
          </p>
        </div>
        {user && (
          <button
            onClick={onSignOut}
            className="px-3 py-2 text-[10px] font-bold uppercase tracking-wider border border-[#E6E2D3] rounded-lg text-[#5A534A] hover:bg-[#F3F1E9]"
          >
            Sign Out
          </button>
        )}
        <div className="h-10 w-10 rounded-full border-2 border-[#8B9D83] bg-[#F3F1E9] flex items-center justify-center">
          <Users className="w-5 h-5 text-[#8B9D83]" />
        </div>
      </div>
    </div>
  </header>
);

/** Renders bilingual helper text with styled parenthetical translations (no raw HTML). */
function BilingualHighlighted({ text }: { text: string }) {
  const spanClass =
    'border-b-2 border-[#8B9D83] bg-[#F3F1E9] px-1 font-sans font-bold text-[14px] not-italic text-[#8B9D83]';
  const nodes: React.ReactNode[] = [];
  const re = /\(([^)]+)\)/g;
  let lastIndex = 0;
  let match: RegExpExecArray | null;
  let key = 0;
  while ((match = re.exec(text)) !== null) {
    if (match.index > lastIndex) {
      nodes.push(text.slice(lastIndex, match.index));
    }
    nodes.push(
      <span key={`h-${key++}`} className={spanClass}>
        ({match[1]})
      </span>
    );
    lastIndex = match.index + match[0].length;
  }
  if (lastIndex < text.length) {
    nodes.push(text.slice(lastIndex));
  }
  return <>{nodes}</>;
}

function AuthPanel({
  mode,
  email,
  password,
  setMode,
  setEmail,
  setPassword,
  onEmailSubmit,
  onGoogleSubmit,
  error,
  disabled,
}: {
  mode: 'signin' | 'signup';
  email: string;
  password: string;
  setMode: (mode: 'signin' | 'signup') => void;
  setEmail: (v: string) => void;
  setPassword: (v: string) => void;
  onEmailSubmit: (e: React.FormEvent) => void;
  onGoogleSubmit: () => void;
  error: string | null;
  disabled: boolean;
}) {
  return (
    <main className="max-w-xl mx-auto px-6 py-16">
      <div className="bg-white border border-[#E6E2D3] rounded-2xl p-8 shadow-sm">
        <h2 className="text-xl font-bold text-[#5A534A] mb-2">
          {mode === 'signin' ? 'Sign in to your profile' : 'Create your profile'}
        </h2>
        <p className="text-sm text-[#5A534A] opacity-70 mb-6">
          Use Email/Password or Google. Your progress is tied to your account.
        </p>
        <div className="flex gap-2 mb-6">
          <button
            onClick={() => setMode('signin')}
            className={`px-4 py-2 rounded-lg text-xs font-bold uppercase tracking-wider ${
              mode === 'signin' ? 'bg-[#8B9D83] text-white' : 'bg-[#F3F1E9] text-[#5A534A]'
            }`}
          >
            Sign In
          </button>
          <button
            onClick={() => setMode('signup')}
            className={`px-4 py-2 rounded-lg text-xs font-bold uppercase tracking-wider ${
              mode === 'signup' ? 'bg-[#8B9D83] text-white' : 'bg-[#F3F1E9] text-[#5A534A]'
            }`}
          >
            Sign Up
          </button>
        </div>
        <form onSubmit={onEmailSubmit} className="space-y-4">
          <input
            type="email"
            placeholder="Email"
            value={email}
            onChange={(e) => setEmail(e.target.value)}
            className="w-full border border-[#E6E2D3] rounded-xl px-4 py-3 outline-none focus:ring-1 focus:ring-[#8B9D83]"
            required
          />
          <input
            type="password"
            placeholder="Password"
            value={password}
            onChange={(e) => setPassword(e.target.value)}
            className="w-full border border-[#E6E2D3] rounded-xl px-4 py-3 outline-none focus:ring-1 focus:ring-[#8B9D83]"
            required
            minLength={6}
          />
          <button
            type="submit"
            disabled={disabled}
            className="w-full bg-[#8B9D83] text-white rounded-xl py-3 text-sm font-bold uppercase tracking-wider disabled:opacity-60"
          >
            {mode === 'signin' ? 'Sign In' : 'Create Account'}
          </button>
        </form>
        <button
          onClick={onGoogleSubmit}
          disabled={disabled}
          className="w-full mt-4 border border-[#E6E2D3] rounded-xl py-3 text-sm font-bold uppercase tracking-wider text-[#5A534A] disabled:opacity-60"
        >
          Continue with Google
        </button>
        {error && <p className="mt-4 text-sm text-red-600">{error}</p>}
      </div>
    </main>
  );
}

const TabButton = ({ active, onClick, icon: Icon, label, level }: { active: boolean, onClick: () => void, icon: any, label: string, level: string }) => (
  <button
    onClick={onClick}
    className={`px-6 py-3 text-xs font-bold uppercase tracking-widest transition-all rounded-t-xl ${
      active 
      ? 'bg-[#8B9D83] text-white shadow-inner' 
      : 'bg-[#E6E2D3] text-[#5A534A] opacity-60 hover:opacity-100'
    }`}
  >
    <div className="flex items-center gap-2">
      <Icon className="w-3 h-3" />
      <span>{label}</span>
      <span className="text-[10px] opacity-50 ml-1">({level})</span>
    </div>
  </button>
);

export default function App() {
  const [inputText, setInputText] = React.useState('');
  const [isPracticeMode, setIsPracticeMode] = React.useState(false);
  const [servedQuestionIds, setServedQuestionIds] = React.useState<string[]>([]);
  const [currentQuestionMeta, setCurrentQuestionMeta] = React.useState<Pick<QuestionRecord, 'id' | 'topic' | 'level'> | null>(null);
  const [loading, setLoading] = React.useState(false);
  const [currentProblem, setCurrentProblem] = React.useState<BilingualProblem | null>(null);
  const [activeLevel, setActiveLevel] = React.useState<number>(1);
  const [userAnswer, setUserAnswer] = React.useState('');
  const [interactions, setInteractions] = React.useState<Interaction[]>([]);
  const [currentInteractionId, setCurrentInteractionId] = React.useState<string | null>(null);
  const [feedback, setFeedback] = React.useState<{ type: 'success' | 'error', message: string } | null>(null);
  const [confirmReveal, setConfirmReveal] = React.useState(false);
  const [userId, setUserId] = React.useState<string>('');
  const [currentUser, setCurrentUser] = React.useState<User | null>(null);
  const [profile, setProfile] = React.useState<UserProfile | null>(null);
  const [authMode, setAuthMode] = React.useState<'signin' | 'signup'>('signin');
  const [email, setEmail] = React.useState('');
  const [password, setPassword] = React.useState('');
  const [authError, setAuthError] = React.useState<string | null>(null);
  const [authLoading, setAuthLoading] = React.useState(false);
  const [authReady, setAuthReady] = React.useState(false);
  const [adaptiveState, setAdaptiveState] = React.useState<AdaptiveState>({
    currentElo: 1000,
    currentLevel: '2.1',
    totalInteractions: 0,
    topicMastery: {},
    thompsonPriors: {},
    streakCount: 0,
    streakWrongCount: 0
  });
  const [sessionMetrics, setSessionMetrics] = React.useState<SessionMetricsState>(INITIAL_SESSION_METRICS);

  const applyMetricSample = React.useCallback((lds: number, mcs: number) => {
    setSessionMetrics((s) => ({
      ...s,
      lifetimeLds: stepEma(s.lifetimeLds, lds),
      lifetimeMcs: stepEma(s.lifetimeMcs, mcs),
      blockLds: stepEma(s.blockLds, lds),
      blockMcs: stepEma(s.blockMcs, mcs),
    }));
  }, []);

  /** Bump completed count; at block boundary clear block EMA bases. Call before applyMetricSample on that completion so the same sample seeds the new block. */
  const markProblemCompleted = React.useCallback(() => {
    setSessionMetrics((s) => {
      const startingNewBlock =
        s.completedProblems > 0 && s.completedProblems % ANALYTICS_BLOCK_SIZE === 0;
      const completedProblems = s.completedProblems + 1;
      const analyticsBlockIndex = Math.floor((completedProblems - 1) / ANALYTICS_BLOCK_SIZE) + 1;
      return {
        ...s,
        completedProblems,
        analyticsBlockIndex,
        blockLds: startingNewBlock ? null : s.blockLds,
        blockMcs: startingNewBlock ? null : s.blockMcs,
      };
    });
  }, []);

  React.useEffect(() => {
    if (!firebaseApp) {
      setAuthReady(false);
      setCurrentUser(null);
      setProfile(null);
      return;
    }
    const auth = getAuth(firebaseApp);
    const unsub = onAuthStateChanged(auth, async (user) => {
      setCurrentUser(user);
      setUserId(user?.uid ?? '');
      if (!user) {
        setAuthReady(false);
        setProfile(null);
        return;
      }
      try {
        let nextProfile = await getMyProfile();
        if (!nextProfile) {
          nextProfile = await upsertMyProfile({
            displayName: user.displayName ?? undefined,
            photoURL: user.photoURL ?? undefined,
            preferredLanguage: 'en',
          });
        }
        setProfile(nextProfile);
        setAuthReady(true);
      } catch (err) {
        console.error('Profile bootstrap failed:', err);
        setAuthReady(false);
      }
    });
    return () => unsub();
  }, []);

  const handleEmailAuth = async (e: React.FormEvent) => {
    e.preventDefault();
    if (!firebaseApp) return;
    setAuthLoading(true);
    setAuthError(null);
    try {
      const auth = getAuth(firebaseApp);
      if (authMode === 'signup') {
        await createUserWithEmailAndPassword(auth, email.trim(), password);
      } else {
        await signInWithEmailAndPassword(auth, email.trim(), password);
      }
      setEmail('');
      setPassword('');
    } catch (err) {
      const message = err instanceof Error ? err.message : 'Authentication failed';
      setAuthError(message);
    } finally {
      setAuthLoading(false);
    }
  };

  const handleGoogleAuth = async () => {
    if (!firebaseApp) return;
    setAuthLoading(true);
    setAuthError(null);
    try {
      const auth = getAuth(firebaseApp);
      await signInWithPopup(auth, new GoogleAuthProvider());
    } catch (err) {
      const message = err instanceof Error ? err.message : 'Google sign-in failed';
      setAuthError(message);
    } finally {
      setAuthLoading(false);
    }
  };

  const handleSignOut = async () => {
    if (!firebaseApp) return;
    try {
      const auth = getAuth(firebaseApp);
      await signOut(auth);
      setCurrentProblem(null);
      setCurrentInteractionId(null);
      setFeedback(null);
      setInteractions([]);
      setSessionMetrics(INITIAL_SESSION_METRICS);
    } catch (err) {
      console.error('Sign-out failed:', err);
    }
  };

  const syncToBackend = async (inter: Interaction, isUpdate = true) => {
    if (!firebaseApp || !authReady) return;
    try {
      const url = isUpdate ? `/api/sessions/${inter.id}` : '/api/sessions';
      const method = isUpdate ? 'PUT' : 'POST';

      const response = await authFetch(url, {
        method,
        headers: { 'Content-Type': 'application/json' },
        body: JSON.stringify(inter),
      });

      if (!response.ok) {
        console.warn('Backend sync failed:', await response.text());
      }
    } catch (err) {
      console.error('Persistence error:', err);
    }
  };

  // Load history from backend for the signed-in user
  React.useEffect(() => {
    const loadSessions = async () => {
      if (!authReady || !currentUser) return;
      try {
        const res = await authFetch('/api/sessions/me');
        if (res.ok) {
          const data = (await res.json()) as Interaction[];
          setInteractions(data);
          localStorage.setItem('bilingual-math-interactions', JSON.stringify(data));
          return;
        }
      } catch (e) {
        console.warn('Failed to load remote sessions, using local cache:', e);
      }
      const saved = localStorage.getItem('bilingual-math-interactions');
      if (saved) {
        setInteractions(JSON.parse(saved));
      }
    };
    loadSessions();
  }, [authReady, currentUser]);

  // Save changes to the active interaction
  const updateActiveInteraction = (updater: (inter: Interaction) => Interaction) => {
    if (!currentInteractionId) return;
    setInteractions(prev => {
      const next = prev.map(inter => {
        if (inter.id === currentInteractionId) {
          const updated = updater(inter);
          // Async sync to backend
          syncToBackend(updated, true);
          return updated;
        }
        return inter;
      });
      localStorage.setItem('bilingual-math-interactions', JSON.stringify(next));
      return next;
    });
  };

  const processProblemText = async (
    problemText: string,
    questionMeta: Pick<QuestionRecord, 'id' | 'topic' | 'level'> | null = null
  ) => {
    if (!problemText.trim() || loading || !firebaseApp || !authReady) return;
    setLoading(true);
    try {
      const result = await translateProblem(problemText);
      setCurrentProblem(result);
      setActiveLevel(0); // Start at level 0 (original)
      setUserAnswer('');
      setFeedback(null);
      setConfirmReveal(false);
      setCurrentQuestionMeta(questionMeta);
      
      const id = Date.now().toString();
      setCurrentInteractionId(id);
      
      const now = Date.now();
      const newInteraction: Interaction = {
        id,
        problemId: questionMeta?.id || ('math_problem_' + btoa(result.original.slice(0, 20)).replace(/=/g, '')),
        userId: userId,
        problem: result,
        attempts: [],
        attemptsCount: 0,
        levelViews: { 0: now },
        levelsViewedBeforeCorrect: [],
        timeSpentPerLevel: { 0: 0, 1: 0, 2: 0, 3: 0, 4: 0 },
        lastLevelChangeTimestamp: now,
        sessionStartTime: now,
        answerRevealedBySystem: false,
        isSolved: 'unsolved',
        createdAt: now,
        lds: 0,
        mcs: 0,
        maxHintLevel: 0,
        questionId: questionMeta?.id,
        questionTopic: questionMeta?.topic,
        questionLevel: questionMeta?.level,
        sourceMode: questionMeta ? 'practice' : 'manual'
      };
      
      setInteractions(prev => {
        const next = [newInteraction, ...prev];
        localStorage.setItem('bilingual-math-interactions', JSON.stringify(next));
        return next;
      });

      // Initial sync
      syncToBackend(newInteraction, false);
    } catch (error) {
      console.error(error);
      setFeedback({ type: 'error', message: 'Analysis failed. Please check your input.' });
    } finally {
      setLoading(false);
    }
  };

  const handleSubmit = async (e: React.FormEvent) => {
    e.preventDefault();
    await processProblemText(inputText, null);
  };

  const handlePracticeNextQuestion = async () => {
    if (loading || !firebaseApp || !authReady) return;
    try {
      setFeedback(null);
      const preferredTopic =
        currentQuestionMeta?.topic ||
        Object.entries(adaptiveState.topicMastery).sort((a, b) => (b[1] as number) - (a[1] as number))[0]?.[0] ||
        'arithmetic';
      const selected = await selectQuestion(
        adaptiveState.currentLevel,
        preferredTopic,
        servedQuestionIds
      );
      setServedQuestionIds((prev) => (prev.includes(selected.id) ? prev : [...prev, selected.id]));
      setInputText(selected.problem_text);
      await processProblemText(selected.problem_text, {
        id: selected.id,
        topic: selected.topic,
        level: selected.level,
      });
    } catch (error) {
      console.error(error);
      setFeedback({
        type: 'error',
        message: 'Practice question unavailable at this level right now.',
      });
    }
  };

  const handleLevelChange = (level: number) => {
    if (activeLevel === level) return;
    
    const now = Date.now();
    const timeSpent = now - (interactions.find(i => i.id === currentInteractionId)?.lastLevelChangeTimestamp || now);

    updateActiveInteraction(inter => {
      const isCorrect = inter.isSolved === 'solved';
      const updatedViews = { ...inter.levelViews, [level]: inter.levelViews[level] || now };
      const updatedSpent = { ...inter.timeSpentPerLevel, [activeLevel]: (inter.timeSpentPerLevel[activeLevel] || 0) + timeSpent };
      const updatedBeforeCorrect = isCorrect 
        ? inter.levelsViewedBeforeCorrect 
        : Array.from(new Set([...inter.levelsViewedBeforeCorrect, level]));

      const maxHintLevel = Math.max(inter.maxHintLevel || 0, level);
      
      const timeSpentTotal = (Object.values(updatedSpent) as number[]).reduce((a, b) => a + b, 0);
      const firstHintTs = updatedViews[1] || updatedViews[2] || updatedViews[3] || updatedViews[4];
      const timeBeforeFirstHintMs = firstHintTs ? (firstHintTs - inter.sessionStartTime) : 0;

      const features: InteractionFeatures = {
        isCorrect,
        maxHintLevel,
        attempts: inter.attemptsCount,
        timeSpentMs: timeSpentTotal,
        timePerLevel: updatedSpent,
        timeBeforeFirstHintMs,
        level: adaptiveState.currentLevel
      };

      const lds = calculateLDS(features);
      const mcs = calculateMCS(features, lds);
      applyMetricSample(lds, mcs);

      return {
        ...inter,
        levelViews: updatedViews,
        timeSpentPerLevel: updatedSpent,
        lastLevelChangeTimestamp: now,
        levelsViewedBeforeCorrect: updatedBeforeCorrect,
        timeStepsViewed: (level === 4 && !inter.timeStepsViewed) ? new Date(now).toISOString() : inter.timeStepsViewed,
        maxHintLevel,
        lds,
        mcs,
        diagnosticQuadrant: getDiagnosticQuadrant(lds, mcs)
      };
    });

    setActiveLevel(level);
  };

  const handleAnswerSubmit = (e: React.FormEvent) => {
    e.preventDefault();
    if (!userAnswer.trim() || !currentProblem || !currentInteractionId) return;

    const inter = interactions.find(i => i.id === currentInteractionId);
    if (!inter || inter.isSolved === 'revealed' || inter.isSolved === 'solved') return;

    const clean = (val: string) => val.replace(/[^0-9.]/g, '').trim();
    const isCorrect = clean(userAnswer) === clean(currentProblem.answer) && clean(userAnswer) !== '';
    
    const now = Date.now();
    const timeSpent = now - (inter.lastLevelChangeTimestamp || now);
    const updatedSpent = { ...inter.timeSpentPerLevel, [activeLevel]: (inter.timeSpentPerLevel[activeLevel] || 0) + timeSpent };

    if (isCorrect) {
      setFeedback({ type: 'success', message: 'Correct! Great job navigating the learning layers.' });
    } else {
      setFeedback({ type: 'error', message: 'Not quite. Use another learning layer for context clues.' });
    }

    updateActiveInteraction(inter => {
      const nextAttempts = [...inter.attempts, userAnswer];
      const firstAttempt = inter.attempts.length === 0;
      const isFirstCorrect = isCorrect && inter.isSolved === 'unsolved';
      
      const nextAttemptsCount = nextAttempts.length;
      const timeSpentTotal = (Object.values(updatedSpent) as number[]).reduce((a, b) => a + b, 0);
      
      const firstHintTs = inter.levelViews[1] || inter.levelViews[2] || inter.levelViews[3] || inter.levelViews[4];
      const timeBeforeFirstHintMs = firstHintTs ? (firstHintTs - inter.sessionStartTime) : 0;

      const features: InteractionFeatures = {
        isCorrect: isFirstCorrect || inter.isSolved === 'solved',
        maxHintLevel: inter.maxHintLevel || 0,
        attempts: nextAttemptsCount,
        timeSpentMs: timeSpentTotal,
        timePerLevel: updatedSpent,
        timeBeforeFirstHintMs,
        level: adaptiveState.currentLevel
      };

      const lds = calculateLDS(features);
      const mcs = calculateMCS(features, lds);

      if (isFirstCorrect) {
        markProblemCompleted();
      }
      applyMetricSample(lds, mcs);

      const adaptiveTopic = inter.questionTopic || currentQuestionMeta?.topic || 'arithmetic';
      const { newState, decision } = adaptiveDecide(adaptiveState, features, lds, mcs, adaptiveTopic);
      setAdaptiveState(newState);

      return {
        ...inter,
        attempts: nextAttempts,
        attemptsCount: nextAttemptsCount,
        timeSpentPerLevel: updatedSpent,
        lastLevelChangeTimestamp: now,
        isSolved: isFirstCorrect ? 'solved' : inter.isSolved,
        firstCorrectAnswer: isFirstCorrect ? userAnswer : inter.firstCorrectAnswer,
        activeLevelOnCorrect: isFirstCorrect ? activeLevel : inter.activeLevelOnCorrect,
        timeToFirstAttempt: firstAttempt ? now - inter.sessionStartTime : inter.timeToFirstAttempt,
        timeToCorrect: isFirstCorrect ? now - inter.sessionStartTime : inter.timeToCorrect,
        lds,
        mcs,
        diagnosticQuadrant: getDiagnosticQuadrant(lds, mcs),
        adaptiveDecision: decision,
        nextLevel: newState.currentLevel
      };
    });
    
    setUserAnswer('');
  };

  const handleRevealAnswer = () => {
    if (!currentInteractionId) return;
    
    if (!confirmReveal) {
      setConfirmReveal(true);
      return;
    }

    const now = Date.now();
    const inter = interactions.find(i => i.id === currentInteractionId);
    if (inter) {
      const timeSpent = now - (inter.lastLevelChangeTimestamp || now);
      const updatedSpent = {
        ...inter.timeSpentPerLevel,
        [activeLevel]: (inter.timeSpentPerLevel[activeLevel] || 0) + timeSpent,
      };
      const timeSpentTotal = (Object.values(updatedSpent) as number[]).reduce((a, b) => a + b, 0);
      const firstHintTs = inter.levelViews[1] || inter.levelViews[2] || inter.levelViews[3] || inter.levelViews[4];
      const timeBeforeFirstHintMs = firstHintTs ? (firstHintTs - inter.sessionStartTime) : 0;
      const maxHintLevel = Math.max(inter.maxHintLevel || 0, 4);
      const features: InteractionFeatures = {
        isCorrect: false,
        maxHintLevel,
        attempts: inter.attemptsCount,
        timeSpentMs: timeSpentTotal,
        timePerLevel: updatedSpent,
        timeBeforeFirstHintMs,
        level: adaptiveState.currentLevel,
      };
      const lds = calculateLDS(features);
      const mcs = calculateMCS(features, lds);
      markProblemCompleted();
      applyMetricSample(lds, mcs);
      updateActiveInteraction((i) => ({
        ...i,
        isSolved: 'revealed',
        answerRevealedBySystem: true,
        timeAnswerRevealed: new Date(now).toISOString(),
        timeSpentPerLevel: updatedSpent,
        lastLevelChangeTimestamp: now,
        maxHintLevel,
        lds,
        mcs,
        diagnosticQuadrant: getDiagnosticQuadrant(lds, mcs),
      }));
    } else {
      updateActiveInteraction((i) => ({
        ...i,
        isSolved: 'revealed',
        answerRevealedBySystem: true,
        timeAnswerRevealed: new Date(now).toISOString(),
      }));
    }
    setConfirmReveal(false);
  };

  const handleUnlockHints = () => {
    if (!currentInteractionId) return;
    const now = Date.now();
    updateActiveInteraction(inter => ({
      ...inter,
      timeHintUnlocked: new Date(now).toISOString(),
      levelViews: { 1: now },
      lastLevelChangeTimestamp: now,
      levelsViewedBeforeCorrect: []
    }));
  };

  const activeInteraction = interactions.find(i => i.id === currentInteractionId);
  const inputDisabled = activeInteraction?.isSolved === 'revealed' || activeInteraction?.isSolved === 'solved';
  const ordinalInBlock =
    sessionMetrics.completedProblems === 0
      ? 0
      : sessionMetrics.completedProblems % ANALYTICS_BLOCK_SIZE === 0
        ? ANALYTICS_BLOCK_SIZE
        : sessionMetrics.completedProblems % ANALYTICS_BLOCK_SIZE;
  const displayLifetimeLds = sessionMetrics.lifetimeLds ?? 0;
  const displayLifetimeMcs = sessionMetrics.lifetimeMcs ?? 0;

  return (
    <div className="min-h-screen bg-[#FDFBF7] text-[#433E37] font-sans selection:bg-[#8B9D83]/20">
      <Header user={currentUser} profile={profile} onSignOut={handleSignOut} />
      {!firebaseApp && (
        <div
          className="bg-amber-50 border-b border-amber-200 text-amber-900 text-center text-sm py-3 px-4"
          role="alert"
        >
          Firebase client env is missing. Set VITE_FIREBASE_API_KEY, VITE_FIREBASE_AUTH_DOMAIN,
          VITE_FIREBASE_PROJECT_ID, and VITE_FIREBASE_APP_ID. Enable Email/Password and Google providers in Firebase Auth.
        </div>
      )}
      {firebaseApp && !currentUser && (
        <AuthPanel
          mode={authMode}
          email={email}
          password={password}
          setMode={setAuthMode}
          setEmail={setEmail}
          setPassword={setPassword}
          onEmailSubmit={handleEmailAuth}
          onGoogleSubmit={handleGoogleAuth}
          error={authError}
          disabled={authLoading}
        />
      )}
      {firebaseApp && currentUser && !authReady && (
        <main className="max-w-2xl mx-auto py-16 px-8 text-center text-[#5A534A]">
          Preparing your profile...
        </main>
      )}
      {firebaseApp && currentUser && authReady && (
      <main className="max-w-7xl mx-auto px-8 py-8 grid grid-cols-1 lg:grid-cols-12 gap-8 h-auto lg:h-[calc(100vh-104px)] overflow-y-auto lg:overflow-hidden">
        
        {/* Left Column: Interactive Workspace */}
        <div className="lg:col-span-8 flex flex-col gap-6 lg:overflow-y-auto pr-2 scrollbar-thin scrollbar-thumb-[#E6E2D3]">
          
          {/* Input Area */}
          <section className="bg-white border border-[#E6E2D3] rounded-2xl p-6 shadow-sm">
            <div className="flex items-center justify-between gap-2 mb-4">
              <span className="px-2 py-0.5 bg-[#F3F1E9] text-[10px] font-bold uppercase rounded border border-[#E6E2D3] text-[#8B9D83]">Input Problem</span>
              <button
                type="button"
                onClick={() => setIsPracticeMode((prev) => !prev)}
                className={`px-3 py-1 rounded-lg text-[10px] font-bold uppercase tracking-wider border ${
                  isPracticeMode
                    ? 'bg-[#8B9D83] text-white border-[#8B9D83]'
                    : 'bg-[#F3F1E9] text-[#5A534A] border-[#E6E2D3]'
                }`}
              >
                {isPracticeMode ? 'Practice Mode On' : 'Manual Mode'}
              </button>
            </div>
            <form onSubmit={handleSubmit} className="space-y-4">
              <div className="relative">
                <textarea
                  value={inputText}
                  onChange={(e) => setInputText(e.target.value)}
                  maxLength={500}
                  placeholder={isPracticeMode ? 'Practice Mode pulls a question automatically...' : 'Paste a math word problem to begin analysis...'}
                  className={`w-full h-24 bg-[#FDFBF7] border rounded-xl p-4 text-sm font-serif italic outline-none focus:ring-1 transition-all resize-none placeholder-[#C5C1B1] ${
                    inputText.length >= 500 ? 'border-amber-400 focus:ring-amber-400' : 'border-[#E6E2D3] focus:ring-[#8B9D83]'
                  }`}
                  disabled={isPracticeMode}
                />
                <div className={`text-right text-[10px] font-bold mt-1 pr-1 ${inputText.length >= 500 ? 'text-amber-600' : 'text-[#8B9D83] opacity-60'}`}>
                  {inputText.length} / 500
                </div>
              </div>
              <div className="flex justify-end">
                {isPracticeMode ? (
                  <button
                    type="button"
                    onClick={handlePracticeNextQuestion}
                    disabled={loading || !authReady || !firebaseApp}
                    className={`px-8 py-3 rounded-xl font-bold uppercase tracking-widest text-xs transition-all shadow-md ${
                      loading || !authReady || !firebaseApp
                        ? 'bg-[#E6E2D3] text-[#5A534A] opacity-50 cursor-not-allowed'
                        : 'bg-[#8B9D83] hover:bg-[#7A8C72] text-white active:scale-95'
                    }`}
                  >
                    {loading ? 'Loading...' : 'Next Practice Question'}
                  </button>
                ) : (
                  <button
                    type="submit"
                    disabled={
                      loading ||
                      !inputText.trim() ||
                      inputText.length > 500 ||
                      !authReady ||
                      !firebaseApp
                    }
                    className={`px-8 py-3 rounded-xl font-bold uppercase tracking-widest text-xs transition-all shadow-md ${
                      loading || !inputText.trim() || inputText.length > 500 || !authReady || !firebaseApp
                      ? 'bg-[#E6E2D3] text-[#5A534A] opacity-50 cursor-not-allowed' 
                      : 'bg-[#8B9D83] hover:bg-[#7A8C72] text-white active:scale-95'
                    }`}
                  >
                    {loading ? 'Analyzing...' : 'Process Layers'}
                  </button>
                )}
              </div>
            </form>
          </section>

          {/* Session Progress */}
          <div className="bg-[#F3F1E9] border border-[#E6E2D3] rounded-full px-5 py-2.5 flex items-center gap-4 shadow-sm">
            <span className="text-[10px] font-bold uppercase tracking-widest text-[#8B9D83] whitespace-nowrap">Session Progress</span>
            <div className="flex-grow bg-[#E6E2D3] h-1.5 rounded-full overflow-hidden">
              <div 
                className="bg-[#8B9D83] h-full transition-all duration-1000 ease-out" 
                style={{ width: `${Math.min((interactions.length / 20) * 100, 100)}%` }}
              />
            </div>
            <span className="text-[10px] font-bold text-[#5A534A] whitespace-nowrap">{interactions.length} / 20</span>
          </div>

          {/* Solution & Workspace */}
          <AnimatePresence mode="wait">
            {currentProblem && (
              <motion.section
                initial={{ opacity: 0, y: 10 }}
                animate={{ opacity: 1, y: 0 }}
                exit={{ opacity: 0, y: -10 }}
                className="flex-grow flex flex-col"
              >
                {!activeInteraction?.timeHintUnlocked ? (
                  <div className="flex-grow flex flex-col items-center justify-center bg-white border border-[#E6E2D3] rounded-2xl p-12 shadow-sm">
                    <div className="w-16 h-16 bg-[#F3F1E9] rounded-full flex items-center justify-center mb-6">
                      <HelpCircle className="w-8 h-8 text-[#8B9D83]" />
                    </div>
                    <h3 className="text-xl font-bold text-[#5A534A] mb-2 uppercase tracking-tight">Ready for a perspective?</h3>
                    <p className="text-[#5A534A] opacity-60 text-center mb-8 max-w-sm italic">
                      Stuck on the original wording? Unlock tiered hints to break down the math naturally.
                    </p>
                    <button
                      onClick={handleUnlockHints}
                      className="px-10 py-4 bg-[#8B9D83] hover:bg-[#7A8C72] text-white rounded-2xl font-bold uppercase tracking-[0.2em] text-xs shadow-lg transition-all active:scale-95 flex items-center gap-3"
                    >
                      Need a Hint? 🔍
                    </button>
                  </div>
                ) : (
                  <>
                    {/* Tabs */}
                    <div className="flex gap-1 overflow-x-auto scrollbar-none">
                      <TabButton active={activeLevel === 1} onClick={() => handleLevelChange(1)} icon={Languages} label="Simplified" level="L1" />
                      <TabButton active={activeLevel === 2} onClick={() => handleLevelChange(2)} icon={HelpCircle} label="Bilingual" level="L2" />
                      <TabButton active={activeLevel === 3} onClick={() => handleLevelChange(3)} icon={Languages} label="Natural Spanish" level="L3" />
                      <TabButton active={activeLevel === 4} onClick={() => handleLevelChange(4)} icon={CheckCircle2} label="Steps" level="L4" />
                    </div>

                    <div className="flex-grow bg-white border border-[#E6E2D3] rounded-b-2xl rounded-tr-2xl p-8 shadow-lg relative min-h-[400px] flex flex-col">
                      
                      {/* Content Area */}
                      <div className="flex-grow">
                        <AnimatePresence mode="wait">
                          <motion.div
                            key={activeLevel}
                            initial={{ opacity: 0, x: 5 }}
                            animate={{ opacity: 1, x: 0 }}
                            exit={{ opacity: 0, x: -5 }}
                            className="max-w-3xl mx-auto"
                          >
                            {activeLevel < 4 ? (
                              <p className="text-2xl font-serif leading-[1.8] text-[#433E37] italic">
                                {activeLevel === 1 && currentProblem.simplified}
                                {activeLevel === 2 && (
                                  <BilingualHighlighted text={currentProblem.bilingual} />
                                )}
                                {activeLevel === 3 && currentProblem.spanish}
                              </p>
                            ) : (
                              <div className="space-y-6">
                                <h3 className="text-xs uppercase tracking-widest font-bold text-[#8B9D83] mb-4 flex items-center gap-2">
                                  <BookOpen className="w-4 h-4" /> Step-by-Step Methodology
                                </h3>
                                <div className="text-lg font-serif leading-relaxed text-[#5A534A] italic whitespace-pre-wrap pl-6 border-l-2 border-[#F3F1E9]">
                                  {currentProblem.solution}
                                </div>
                                
                                {/* Answer Reveal Logic */}
                                <div className="mt-8 pt-8 border-t border-[#F3F1E9] flex flex-col items-center">
                                  {activeInteraction?.isSolved === 'revealed' ? (
                                    <motion.div 
                                      initial={{ scale: 0.9, opacity: 0 }}
                                      animate={{ scale: 1, opacity: 1 }}
                                      className="bg-[#F3F1E9] px-8 py-4 rounded-2xl border border-[#E6E2D3] text-center"
                                    >
                                      <span className="text-[10px] uppercase font-bold text-[#8B9D83] block mb-1">System Revealed Answer</span>
                                      <span className="text-3xl font-serif italic font-bold text-[#433E37]">{currentProblem.answer}</span>
                                    </motion.div>
                                  ) : activeInteraction?.isSolved === 'solved' ? (
                                    <motion.div 
                                      initial={{ scale: 0.9, opacity: 0 }}
                                      animate={{ scale: 1, opacity: 1 }}
                                      className="bg-emerald-50 px-8 py-4 rounded-2xl border border-emerald-100 text-center"
                                    >
                                      <span className="text-[10px] uppercase font-bold text-emerald-600 block mb-1">Correct Answer</span>
                                      <span className="text-3xl font-serif italic font-bold text-emerald-700">{currentProblem.answer}</span>
                                    </motion.div>
                                  ) : (
                                    <button
                                      onClick={handleRevealAnswer}
                                      onMouseLeave={() => setConfirmReveal(false)}
                                      className={`flex items-center gap-3 px-8 py-3 border rounded-full text-xs font-bold uppercase tracking-widest transition-all ${
                                        confirmReveal 
                                        ? 'bg-amber-50 border-amber-200 text-amber-700 shadow-inner' 
                                        : 'bg-[#FDFBF7] border-[#E6E2D3] text-[#5A534A] opacity-60 hover:opacity-100 hover:shadow-md'
                                      }`}
                                    >
                                      {confirmReveal ? (
                                        <>Click again to confirm</>
                                      ) : (
                                        <><Lock className="w-4 h-4 text-[#8B9D83]" /> Reveal Hidden Answer</>
                                      )}
                                    </button>
                                  )}
                                </div>
                              </div>
                            )}
                          </motion.div>
                        </AnimatePresence>
                      </div>
                    </div>
                  </>
                )}

                {/* Submission Row - Now always visible below tabs or hint button */}
                <div className="mt-6 pt-6 border-t border-[#E6E2D3] flex flex-col sm:flex-row items-center gap-6">
                  <div className="flex-grow flex flex-col gap-2 w-full">
                    <div className="flex items-center gap-4 bg-[#F3F1E9] border-2 border-dashed border-[#E6E2D3] rounded-2xl px-6 py-4">
                      <span className="text-xs font-bold text-[#8B9D83] uppercase whitespace-nowrap">Your Submission:</span>
                      <input
                        type="text"
                        value={userAnswer}
                        disabled={inputDisabled}
                        onChange={(e) => setUserAnswer(e.target.value)}
                        placeholder={inputDisabled ? "Response locked" : "Enter numeric value..."}
                        className="flex-grow bg-transparent border-b border-[#8B9D83] text-xl font-serif italic outline-none text-[#433E37] placeholder-[#C5C1B1] disabled:opacity-30"
                      />
                    </div>
                    <AnimatePresence>
                      {feedback && (
                        <motion.div
                          initial={{ opacity: 0, height: 0 }}
                          animate={{ opacity: 1, height: 'auto' }}
                          exit={{ opacity: 0, height: 0 }}
                          className={`text-xs font-bold px-4 py-2 rounded-lg flex items-center gap-2 ${
                            feedback.type === 'success' ? 'bg-emerald-50 text-emerald-600' : 'bg-red-50 text-red-600'
                          }`}
                        >
                          {feedback.type === 'success' ? <CheckCircle2 className="w-3 h-3" /> : <AlertCircle className="w-3 h-3" />}
                          {feedback.message}
                        </motion.div>
                      )}
                    </AnimatePresence>
                  </div>
                  <button
                    onClick={handleAnswerSubmit}
                    disabled={inputDisabled || !userAnswer.trim()}
                    className="w-full sm:w-48 bg-[#8B9D83] hover:bg-[#7A8C72] disabled:bg-[#E6E2D3] disabled:text-[#5A534A]/50 text-white rounded-2xl h-16 font-bold uppercase tracking-widest text-xs shadow-md transition-all active:scale-95"
                  >
                    Check Answer
                  </button>
                </div>
              </motion.section>
            )}
          </AnimatePresence>
        </div>

        {/* Right Column: Interaction Monitoring */}
        <aside className="lg:col-span-4 flex flex-col gap-6 lg:overflow-y-auto pr-2 scrollbar-thin scrollbar-thumb-[#E6E2D3]">
          
          {/* Active Session Stats */}
          <section className="bg-[#F9F7F0] border border-[#E6E2D3] rounded-2xl p-6 shadow-sm">
            <h3 className="text-[11px] uppercase tracking-[0.2em] font-bold text-[#8B9D83] mb-6">Metrics & Telemetry</h3>
            
            <div className="grid grid-cols-2 gap-4">
              <div className="bg-white p-4 rounded-xl border border-[#E6E2D3] shadow-inner">
                <p className="text-[10px] opacity-40 uppercase font-bold mb-1">Total Attempts</p>
                <p className="text-2xl font-serif font-bold italic text-[#5A534A]">{activeInteraction?.attempts.length.toString().padStart(2, '0') || '00'}</p>
              </div>
              <div className="bg-white p-4 rounded-xl border border-[#E6E2D3] shadow-inner">
                <p className="text-[10px] opacity-40 uppercase font-bold mb-1">Status</p>
                <p className={`text-xs font-bold uppercase tracking-tight ${
                  activeInteraction?.isSolved === 'solved' ? 'text-emerald-600' : 
                  activeInteraction?.isSolved === 'revealed' ? 'text-amber-600' : 
                  'text-[#8B9D83]'
                }`}>
                  {activeInteraction?.isSolved || 'Idle'}
                </p>
              </div>
            </div>

            {/* Difficulty Indicator Card */}
            <div className="mt-4 bg-white p-5 rounded-2xl border border-[#E6E2D3] shadow-inner flex items-center justify-between">
              <div>
                <p className="text-[10px] opacity-40 uppercase font-bold mb-1">Current Level</p>
                <p className="text-4xl font-serif font-bold italic text-[#8B9D83] tracking-tight">
                  {adaptiveState.currentLevel}
                </p>
              </div>
              <div className="text-right">
                <p className="text-[10px] opacity-40 uppercase font-bold mb-1">Elo Rating</p>
                <p className="text-xl font-serif font-bold italic text-[#5A534A]">
                  {Math.round(adaptiveState.currentElo)}
                </p>
              </div>
            </div>

            {/* LDS & MCS Progress Bars (session EMA; block EMA still computed for analytics) */}
            <div className="mt-4 mb-2 text-[9px] uppercase font-bold text-[#5A534A] opacity-60">
              Analytics block {sessionMetrics.analyticsBlockIndex}
              <span className="font-mono normal-case ml-2">
                ({ordinalInBlock}/{ANALYTICS_BLOCK_SIZE} completed in block)
              </span>
            </div>
            <div className="mt-2 space-y-4">
              <div className="space-y-1.5">
                <div className="flex justify-between items-end">
                  <p className="text-[10px] uppercase font-bold text-[#8B9D83]">Language Dependency (session)</p>
                  <span className="text-[10px] font-mono font-bold text-amber-600">
                    {Math.round(displayLifetimeLds * 100)}%
                  </span>
                </div>
                <div className="h-2 w-full bg-[#E6E2D3] rounded-full overflow-hidden">
                  <div 
                    className="h-full bg-amber-500 transition-all duration-500"
                    style={{ width: `${displayLifetimeLds * 100}%` }}
                  />
                </div>
              </div>

              <div className="space-y-1.5">
                <div className="flex justify-between items-end">
                  <p className="text-[10px] uppercase font-bold text-[#8B9D83]">Math Confidence (session)</p>
                  <span className="text-[10px] font-mono font-bold text-emerald-600">
                    {Math.round(displayLifetimeMcs * 100)}%
                  </span>
                </div>
                <div className="h-2 w-full bg-[#E6E2D3] rounded-full overflow-hidden">
                  <div 
                    className="h-full bg-emerald-500 transition-all duration-500"
                    style={{ width: `${displayLifetimeMcs * 100}%` }}
                  />
                </div>
              </div>

              <div className="pt-2">
                <span className="text-[9px] opacity-40 uppercase font-bold block mb-1">Current Diagnostic</span>
                <span className="inline-block px-3 py-1 bg-white border border-[#E6E2D3] rounded-full text-[9px] font-bold uppercase text-[#8B9D83] tracking-wider shadow-sm">
                  {activeInteraction?.diagnosticQuadrant?.replace('_', ' ') || 'Calibrating...'}
                </span>
              </div>
            </div>

            <div className="mt-8 space-y-3">
              <h4 className="text-[9px] uppercase font-bold text-[#8B9D83]">Learning Layer Log</h4>
              {[1, 2, 3, 4].map(lvl => {
                const spent = activeInteraction?.timeSpentPerLevel[lvl] || 0;
                const active = activeLevel === lvl;
                return (
                  <div key={lvl} className={`flex items-center justify-between p-3 rounded-xl border ${active ? 'bg-white border-[#8B9D83]' : 'bg-[#F3F1E9]/50 border-transparent'} transition-all`}>
                    <div className="flex flex-col">
                      <span className="text-[10px] font-bold text-[#5A534A]">Level {lvl === 4 ? 'Steps' : lvl}</span>
                      <span className="text-[9px] opacity-50 uppercase">{lvl === 4 ? 'Analysis' : lvl === 1 ? 'Simplified' : lvl === 2 ? 'Bilingual' : 'Natural'}</span>
                    </div>
                    <div className="text-right">
                      <span className="text-xs font-mono font-medium text-[#8B9D83]">{Math.floor(spent / 1000)}s</span>
                    </div>
                  </div>
                );
              })}
            </div>
          </section>

          {/* Interaction History */}
          <section className="bg-white border border-[#E6E2D3] rounded-2xl flex-grow flex flex-col overflow-hidden shadow-sm">
             <div className="p-6 border-b border-[#F3F1E9] flex items-center justify-between bg-white sticky top-0 z-10">
                <h3 className="text-[11px] uppercase tracking-[0.2em] font-bold text-[#8B9D83]">Problem Archive</h3>
                <div className="flex gap-2">
                  <button 
                    onClick={() => {
                      const data = JSON.stringify(interactions, null, 2);
                      const blob = new Blob([data], { type: 'application/json' });
                      const url = URL.createObjectURL(blob);
                      const a = document.createElement('a'); a.href = url; a.download = 'learning-logs.json'; a.click();
                    }}
                    className="p-2 hover:bg-[#F3F1E9] rounded-lg transition-colors text-[#8B9D83]"
                  >
                    <BarChart3 className="w-4 h-4" />
                  </button>
                  <button onClick={() => confirm('Clear history?') && setInteractions([])} className="p-2 hover:bg-red-50 rounded-lg transition-colors text-red-400">
                    <Trash2 className="w-4 h-4" />
                  </button>
                </div>
            </div>
            
            <div className="overflow-y-auto flex-grow p-2 space-y-2 scrollbar-none">
              {interactions.map(inter => (
                <button
                  key={inter.id}
                  onClick={() => {
                    const now = Date.now();
                    setCurrentProblem(inter.problem);
                    setCurrentInteractionId(inter.id);
                    setActiveLevel(1);
                    setFeedback(null);
                    
                    updateActiveInteraction(i => ({
                      ...i,
                      lastLevelChangeTimestamp: now
                    }));
                  }}
                  className={`w-full text-left p-4 rounded-xl transition-all border ${
                    currentInteractionId === inter.id ? 'bg-[#F3F1E9] border-[#E6E2D3] shadow-sm' : 'border-transparent hover:bg-[#FDFBF7]'
                  }`}
                >
                  <p className="text-xs font-serif italic text-[#5A534A] line-clamp-2 leading-relaxed mb-2 opacity-80">
                    "{inter.problem.original}"
                  </p>
                  <div className="flex items-center justify-between">
                    <span className="text-[9px] font-bold uppercase tracking-tighter text-[#8B9D83]">
                      {new Date(inter.createdAt).toLocaleDateString()}
                    </span>
                    <div className="flex gap-1">
                      {inter.isSolved === 'solved' && <CheckCircle2 className="w-3 h-3 text-emerald-500" />}
                      {inter.isSolved === 'revealed' && <AlertCircle className="w-3 h-3 text-amber-500" />}
                    </div>
                  </div>
                </button>
              ))}
            </div>
          </section>
        </aside>
      </main>
      )}

      {currentUser && (
      <footer className="h-10 bg-white border-t border-[#E6E2D3] px-8 flex items-center justify-between text-[10px] uppercase tracking-widest font-bold text-[#AFA99E]">
        <div className="flex items-center gap-4">
          <span className="flex items-center gap-2 italic"><div className="w-1.5 h-1.5 rounded-full bg-green-500" /> Adaptive Engine Active</span>
        </div>
        <span>Session ID: {currentInteractionId?.slice(-6) || 'AX-000'}</span>
        <span>{new Date().toISOString().split('T')[0]} | {new Date().toLocaleTimeString([], { hour: '2-digit', minute: '2-digit', second: '2-digit' })}</span>
      </footer>
      )}
    </div>
  );
}
