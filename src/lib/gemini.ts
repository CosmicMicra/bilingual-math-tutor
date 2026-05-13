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

export async function ocrTranslateProblem(
  file: File,
  onProgress?: (status: string, progress: number) => void
): Promise<BilingualProblem> {
  onProgress?.('Uploading image...', 10);

  const formData = new FormData();
  formData.append('image', file);

  const ocrResponse = await authFetch('/api/ocr', {
    method: 'POST',
    body: formData,
  });

  if (!ocrResponse.ok) {
    const error = await ocrResponse.json().catch(() => ({}));
    throw new Error((error as { error?: string }).error || 'Failed to extract text from image');
  }

  onProgress?.('Scanning image...', 50);

  const { extractedText } = await ocrResponse.json();

  if (!extractedText) {
    throw new Error('Could not extract any text from the image. Please upload a clearer image.');
  }

  onProgress?.('Processing math problem...', 80);
  return translateProblem(extractedText);
}
