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
      systemInstruction: 'Extract all multiple-choice questions from this PDF. Return ONLY a raw JSON array with no preamble, no explanation, and no markdown fences. Each object must have: "id" (integer starting at 1), "question" (string), "options" (array of exactly 4 strings), "answer" (string that exactly matches one of the options).',
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
