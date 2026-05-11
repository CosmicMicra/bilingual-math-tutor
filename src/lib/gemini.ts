import { authFetch } from './api';
import Tesseract from 'tesseract.js';

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
  onProgress?.('Loading OCR engine...', 0);

  const { data } = await Tesseract.recognize(file, 'eng', {
    logger: (m) => {
      if (m.status === 'loading tesseract core') {
        onProgress?.('Loading OCR engine...', Math.round((m.progress || 0) * 100));
      } else if (m.status === 'initializing tesseract') {
        onProgress?.('Initializing...', Math.round((m.progress || 0) * 100));
      } else if (m.status === 'loading language traineddata') {
        onProgress?.('Loading language data...', Math.round((m.progress || 0) * 100));
      } else if (m.status === 'recognizing text') {
        onProgress?.('Scanning image...', Math.round((m.progress || 0) * 100));
      }
    },
  });

  const extractedText = data.text.trim();
  if (!extractedText) {
    throw new Error('Could not extract any text from the image. Please upload a clearer image.');
  }

  onProgress?.('Processing math problem...', 100);
  return translateProblem(extractedText);
}
