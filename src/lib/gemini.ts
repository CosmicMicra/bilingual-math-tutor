import { authFetch } from './api';

export interface BilingualProblem {
  original: string;
  simplified: string;
  bilingual: string;
  spanish: string;
  answer: string;
  solution: string;
}

export async function translateProblem(problemText: string): Promise<BilingualProblem> {
  const response = await authFetch('/api/translate', {
    method: 'POST',
    headers: {
      'Content-Type': 'application/json',
    },
    body: JSON.stringify({ problemText }),
  });

  if (!response.ok) {
    const error = await response.json().catch(() => ({}));
    throw new Error((error as { error?: string }).error || 'Failed to translate problem');
  }

  return response.json();
}
