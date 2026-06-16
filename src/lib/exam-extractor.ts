import { getDocumentProxy, extractText } from 'unpdf';
import type { Question } from '../types';

// ---------------------------------------------------------------------------
// Shuffle utilities (Fisher-Yates)
// ---------------------------------------------------------------------------
function shuffle<T>(arr: T[]): T[] {
  const a = [...arr];
  for (let i = a.length - 1; i > 0; i--) {
    const j = Math.floor(Math.random() * (i + 1));
    [a[i], a[j]] = [a[j], a[i]];
  }
  return a;
}

/**
 * Shuffles the questions array and also shuffles the options inside each
 * question (keeping the correct_answer reference in sync).
 */
export function shuffleQuestions(questions: Question[]): Question[] {
  const shuffled = shuffle(questions);
  return shuffled.map((q, idx) => ({
    ...q,
    id: idx + 1,
    options: shuffle(q.options),
  }));
}

// ---------------------------------------------------------------------------
// Extract raw text from a PDF File using unpdf (runs in browser)
// ---------------------------------------------------------------------------
export async function extractTextFromPDF(file: File): Promise<string> {
  const buffer = await file.arrayBuffer();
  const pdf = await getDocumentProxy(new Uint8Array(buffer));
  const { text } = await extractText(pdf, { mergePages: true });
  if (!text || text.trim().length === 0) {
    throw new Error('Could not extract any text from the PDF. The file may be scanned or image-based.');
  }
  return text;
}

// ---------------------------------------------------------------------------
// Send extracted text to backend and retrieve questions
// ---------------------------------------------------------------------------
export async function extractQuestionsFromText(text: string): Promise<Question[]> {
  const response = await fetch('/api/generate-exam', {
    method: 'POST',
    headers: { 'Content-Type': 'application/json' },
    body: JSON.stringify({ text }),
  });

  if (!response.ok) {
    let message = `Server error: ${response.status}`;
    try {
      const body = await response.json() as { error?: string };
      if (body.error) message = body.error;
    } catch {
      // ignore parse error
    }
    throw new Error(message);
  }

  const questions = await response.json() as Question[];
  if (!Array.isArray(questions) || questions.length === 0) {
    throw new Error('No questions could be extracted from your PDF. Please check the document and try again.');
  }

  return questions;
}
