import { getFirebaseAuth } from './firebase';

export interface UserProfile {
  uid: string;
  displayName?: string;
  email?: string | null;
  photoURL?: string | null;
  preferredLanguage?: 'en' | 'es';
  gradeLevel?: string;
  learningGoals?: string;
  createdAt?: unknown;
  lastLoginAt?: unknown;
  providerIds?: string[];
}

export interface QuestionRecord {
  id: string;
  level: string;
  topic: string;
  subtopic?: string;
  grade?: number;
  problem_text: string;
  answer: string;
  answer_numeric?: number;
  solution_steps?: string[];
  scaffolds?: {
    L1_simplified?: string;
    L2_bilingual?: string;
    L3_spanish?: string;
    L4_solution?: string;
  };
  [key: string]: unknown;
}

export async function authFetch(
  input: RequestInfo | URL,
  init?: RequestInit
): Promise<Response> {
  const auth = getFirebaseAuth();
  const user = auth.currentUser;
  if (!user) {
    throw new Error('Not signed in');
  }
  const token = await user.getIdToken();
  const headers = new Headers(init?.headers);
  headers.set('Authorization', `Bearer ${token}`);
  return fetch(input, { ...init, headers });
}

export async function getMyProfile(): Promise<UserProfile | null> {
  const res = await authFetch('/api/me');
  if (res.status === 404) {
    return null;
  }
  if (!res.ok) {
    throw new Error('Failed to load profile');
  }
  return (await res.json()) as UserProfile;
}

export async function upsertMyProfile(
  patch: Partial<UserProfile>
): Promise<UserProfile> {
  const res = await authFetch('/api/me', {
    method: 'PUT',
    headers: { 'Content-Type': 'application/json' },
    body: JSON.stringify(patch),
  });
  if (!res.ok) {
    throw new Error('Failed to update profile');
  }
  return (await res.json()) as UserProfile;
}

export async function selectQuestion(
  currentLevel: string,
  topic?: string,
  excludeRecentIds: string[] = []
): Promise<QuestionRecord> {
  const res = await authFetch('/api/questions/select', {
    method: 'POST',
    headers: { 'Content-Type': 'application/json' },
    body: JSON.stringify({
      currentLevel,
      topic,
      excludeRecentIds,
    }),
  });
  if (!res.ok) {
    const error = await res.json().catch(() => ({}));
    throw new Error((error as { error?: string }).error || 'Failed to select question');
  }
  return (await res.json()) as QuestionRecord;
}

/**
 * Raw interaction record as stored in Firestore. Researcher dashboard reads
 * these directly so the shape is intentionally loose.
 */
export interface InteractionRecord {
  id: string;
  problemId?: string;
  userId?: string;
  problem?: {
    original?: string;
    simplified?: string;
    bilingual?: string;
    spanish?: string;
    answer?: string;
    solution?: string;
  };
  attemptsCount?: number;
  levelsViewedBeforeCorrect?: number[];
  activeLevelOnCorrect?: number;
  timeSpentPerLevel?: Record<string, number>;
  timeToFirstAttempt?: number;
  timeToCorrect?: number;
  isSolved?: 'solved' | 'revealed' | 'unsolved';
  createdAt?: number | string;
  lds?: number;
  mcs?: number;
  maxHintLevel?: number;
  diagnosticQuadrant?: string;
  adaptiveDecision?: string;
  nextLevel?: string;
  questionId?: string;
  questionTopic?: string;
  questionLevel?: string;
  [key: string]: unknown;
}

export async function getAllSessions(): Promise<InteractionRecord[]> {
  const res = await authFetch('/api/sessions/all');
  if (!res.ok) {
    throw new Error('Failed to load sessions');
  }
  const data = (await res.json()) as InteractionRecord[];
  // Server skips orderBy to avoid requiring a Firestore composite index on a
  // collectionGroup query — sort newest-first here instead.
  const toTs = (v: unknown): number => {
    if (typeof v === 'number') return v;
    if (typeof v === 'string') {
      const t = Date.parse(v);
      return Number.isFinite(t) ? t : 0;
    }
    return 0;
  };
  data.sort((a, b) => toTs(b.createdAt) - toTs(a.createdAt));
  return data;
}

