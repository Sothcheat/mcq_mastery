import { GoogleGenAI } from '@google/genai';
import { Question } from '../types';

export async function extractQuestionsFromPDF(base64Data: string): Promise<Question[]> {
  const apiKey = import.meta.env.VITE_GEMINI_API_KEY;
  if (!apiKey) {
    throw new Error("Missing VITE_GEMINI_API_KEY");
  }

  const ai = new GoogleGenAI({ apiKey });

  // Remove the data URI prefix if present
  const base64Content = base64Data.split(',')[1] || base64Data;

  const response = await ai.models.generateContent({
    model: 'gemini-2.5-flash',
    contents: [
      {
        role: 'user',
        parts: [
          {
            inlineData: {
              data: base64Content,
              mimeType: 'application/pdf',
            }
          }
        ]
      }
    ],
    config: {
      systemInstruction: `You are a precise document parser. Your only job is to extract every multiple-choice question from the provided PDF — no skipping, no summarizing, no inventing.

EXTRACTION RULES:
- Read the entire document before outputting anything.
- Extract EVERY question. If you find N questions, your output MUST contain exactly N objects. Do not stop early.
- If a question is ambiguous or partially visible, still include it with your best reading.
- Ignore headers, footers, page numbers, and instructions that are not part of a question.

OUTPUT RULES:
- Return ONLY a raw JSON array. No preamble, no explanation, no markdown fences, no trailing text.
- After extraction is complete, shuffle the array randomly before returning it (Fisher-Yates or equivalent).
- Each object in the array MUST follow this exact schema:
  {
    "id": <integer, 1-based index AFTER shuffling>,
    "question": "<full question text as a string>",
    "options": ["<option A text>", "<option B text>", "<option C text>", "<option D text>"],
    "answer": "<string that exactly matches one of the four options>"
  }

SELF-CHECK before outputting:
1. Count all questions found in the document.
2. Confirm your array has that exact count.
3. If counts do not match, re-scan the document and add the missing questions.
4. Only then shuffle and output.`,
      responseMimeType: 'application/json'
    }
  });

  const text = response.text;
  if (!text) throw new Error("No response from AI");

  let cleaned = text.trim();
  if (cleaned.startsWith('```')) {
    const firstNewline = cleaned.indexOf('\n');
    cleaned = cleaned.substring(firstNewline + 1);
  }
  if (cleaned.endsWith('```')) {
    cleaned = cleaned.substring(0, cleaned.lastIndexOf('```'));
  }
  cleaned = cleaned.trim();

  try {
    const questions: Question[] = JSON.parse(cleaned);
    if (!Array.isArray(questions)) throw new Error("Response is not an array");
    for (const q of questions) {
      if (!q.id || !q.question || !Array.isArray(q.options) || q.options.length !== 4 || !q.answer) {
        throw new Error(`Invalid question format for id ${q.id}`);
      }
    }
    return questions;
  } catch (err) {
    console.error("Failed to parse JSON:", err);
    throw new Error("Could not extract questions. Please check your PDF and try again.");
  }
}
