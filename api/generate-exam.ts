import type { VercelRequest, VercelResponse } from '@vercel/node';
import OpenAI from 'openai';

// Fluid Compute: allow up to 5 minutes for large PDFs with many chunks
export const maxDuration = 300;

// ---------------------------------------------------------------------------
// Types
// ---------------------------------------------------------------------------
interface RawQuestion {
  id: string | number;
  question: string;
  options: string[];
  correct_answer: string;
}

interface Question {
  id: number;
  question: string;
  options: string[];
  answer: string;
}

// ---------------------------------------------------------------------------
// OpenAI client pointed at Hugging Face Inference API
// ---------------------------------------------------------------------------
const client = new OpenAI({
  baseURL: 'https://api-inference.huggingface.co/v1/',
  apiKey: process.env.HUGGINGFACE_API_KEY ?? '',
});

const MODEL = 'meta-llama/Meta-Llama-3.1-8B-Instruct';

const SYSTEM_PROMPT = `You are a precise educational data parser. Extract every multiple-choice question from the provided text chunk into a strict JSON array.

EXTRACTION RULES:

    Extract every complete question found in the text.

    If a question is cut off, incomplete, or partially visible at the beginning or end of the text, IGNORE IT completely to prevent broken data.

    Ignore headers, footers, page numbers, and instructions.

OUTPUT RULES:

    Return ONLY a raw, valid JSON array.

    Do not include markdown formatting (like \`\`\`json), preambles, or trailing text.

    Each object MUST follow this exact schema:
    {"id": "generate-a-random-unique-string", "question": "Full question text", "options": ["A", "B", "C", "D"], "correct_answer": "Exact text of the correct option"}`;

// ---------------------------------------------------------------------------
// Text chunking utility
// ---------------------------------------------------------------------------
const CHUNK_SIZE = 15_000;  // characters
const OVERLAP = 1_000;      // characters

function chunkText(text: string): string[] {
  const chunks: string[] = [];
  let start = 0;

  while (start < text.length) {
    const end = Math.min(start + CHUNK_SIZE, text.length);
    chunks.push(text.slice(start, end));
    if (end === text.length) break;
    start += CHUNK_SIZE - OVERLAP;
  }

  return chunks;
}

// ---------------------------------------------------------------------------
// Process a single chunk against the LLM
// ---------------------------------------------------------------------------
async function processChunk(chunk: string, chunkIndex: number): Promise<RawQuestion[]> {
  try {
    const response = await client.chat.completions.create({
      model: MODEL,
      messages: [
        { role: 'system', content: SYSTEM_PROMPT },
        { role: 'user', content: chunk },
      ],
      response_format: { type: 'json_object' },
      temperature: 0.1,
      max_tokens: 4096,
    });

    const content = response.choices[0]?.message?.content ?? '';
    if (!content) return [];

    // The model might wrap the array in an object like { "questions": [...] }
    // or return a raw array string — handle both cases.
    let parsed: unknown;
    try {
      parsed = JSON.parse(content);
    } catch {
      console.warn(`Chunk ${chunkIndex}: failed to parse JSON`, content.slice(0, 200));
      return [];
    }

    // Unwrap if the model wrapped the array in an object
    if (Array.isArray(parsed)) {
      return parsed as RawQuestion[];
    }
    if (typeof parsed === 'object' && parsed !== null) {
      const obj = parsed as Record<string, unknown>;
      const arr = Object.values(obj).find((v) => Array.isArray(v));
      if (arr) return arr as RawQuestion[];
    }

    return [];
  } catch (err) {
    console.error(`Chunk ${chunkIndex}: error calling model`, err);
    return [];
  }
}

// ---------------------------------------------------------------------------
// Validate and normalise a raw question from the model
// ---------------------------------------------------------------------------
function normaliseQuestion(raw: RawQuestion, index: number): Question | null {
  if (
    !raw.question ||
    typeof raw.question !== 'string' ||
    !Array.isArray(raw.options) ||
    raw.options.length !== 4 ||
    !raw.correct_answer ||
    typeof raw.correct_answer !== 'string'
  ) {
    return null;
  }

  return {
    id: index + 1,
    question: raw.question.trim(),
    options: raw.options.map((o) => String(o).trim()),
    answer: raw.correct_answer.trim(),
  };
}

// ---------------------------------------------------------------------------
// Vercel handler
// ---------------------------------------------------------------------------
export default async function handler(req: VercelRequest, res: VercelResponse) {
  if (req.method !== 'POST') {
    return res.status(405).json({ error: 'Method Not Allowed' });
  }

  const { text } = req.body as { text?: string };

  if (!text || typeof text !== 'string' || text.trim().length === 0) {
    return res.status(400).json({ error: 'Missing or empty "text" field in request body.' });
  }

  if (!process.env.HUGGINGFACE_API_KEY) {
    return res.status(500).json({ error: 'HUGGINGFACE_API_KEY is not configured.' });
  }

  try {
    const chunks = chunkText(text.trim());
    console.log(`Processing ${chunks.length} chunk(s) for text of length ${text.length}`);

    // Send all chunks in parallel
    const chunkResults = await Promise.all(
      chunks.map((chunk, i) => processChunk(chunk, i))
    );

    // Flatten and deduplicate (by question text)
    const seen = new Set<string>();
    const allQuestions: Question[] = [];

    for (const rawQuestions of chunkResults) {
      for (const raw of rawQuestions) {
        const normalised = normaliseQuestion(raw, allQuestions.length);
        if (normalised && !seen.has(normalised.question)) {
          seen.add(normalised.question);
          allQuestions.push(normalised);
        }
      }
    }

    // Re-assign sequential IDs after dedup
    allQuestions.forEach((q, i) => { q.id = i + 1; });

    console.log(`Returning ${allQuestions.length} unique question(s).`);
    return res.status(200).json(allQuestions);
  } catch (err) {
    console.error('Unhandled error in generate-exam handler:', err);
    return res.status(500).json({ error: 'Internal server error.' });
  }
}
