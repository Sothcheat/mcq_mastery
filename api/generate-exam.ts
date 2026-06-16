import type { VercelRequest, VercelResponse } from "@vercel/node";
import OpenAI from "openai";

// Each request handles a single small chunk, so a short budget is plenty.
export const maxDuration = 60;

// ---------------------------------------------------------------------------
// Types
// ---------------------------------------------------------------------------
interface RawQuestion {
    id?: string | number;
    question: string;
    options: string[];
}

interface Question {
    question: string;
    options: string[];
}

// ---------------------------------------------------------------------------
// OpenAI client pointed at Hugging Face Inference API
// ---------------------------------------------------------------------------
const client = new OpenAI({
    baseURL: "https://router.huggingface.co/v1/",
    apiKey: process.env.HUGGINGFACE_API_KEY ?? "",
});

// Llama 3.1 8B is reliably served on the HuggingFace free router.
// Try "Qwen/Qwen2.5-7B-Instruct" if you want a drop-in upgrade,
// but verify it's available on your tier first.
// const MODEL = "meta-llama/Llama-3.1-8B-Instruct";
const MODEL = "Qwen/Qwen2.5-7B-Instruct";

const SYSTEM_PROMPT = `You are a JSON extraction engine. Your task: find every multiple-choice question in the input and return a JSON array.

OUTPUT: A raw JSON array only. No markdown fences, no explanation, no text outside the array.
SCHEMA: [{"id":"q1","question":"...","options":["...","...","...","..."]}]

OPTION MARKERS — options are introduced by any of these prefixes (strip the prefix from the option text):
  a,  b,  c,  d,  e       (lowercase letter + comma)
  a.  b.  c.  d.  e.      (lowercase letter + period)
  a)  b)  c)  d)  e)      (lowercase letter + paren)
  A.  B.  C.  D.  E.      (uppercase letter + period)
  A)  B)  C)  D)  E)      (uppercase letter + paren)
  A,  B,  C,  D,  E,      (uppercase letter + comma)

HOW TO SPLIT squashed text (question and options run together):
1. Find the first option marker (e.g. "a, " or "A. " or "a) ").
2. Everything BEFORE that marker = the question field.
3. Each segment between consecutive markers = one option (strip the marker prefix).

EXAMPLE:
Input:  "The primary structure of protein represents a, Linear sequence of amino acids b, 3-dimensional folded structure c, Helical arrangement d, Sub-unit assembly"
Output: [{"id":"q1","question":"The primary structure of protein represents","options":["Linear sequence of amino acids","3-dimensional folded structure","Helical arrangement","Sub-unit assembly"]}]

RULES:
1. Extract EVERY question you can find — do not skip a question just because its format is unusual.
2. The "question" field must contain only the question stem, never the options.
3. Strip option-marker prefixes completely from every option string.
4. If a question has fewer than 2 options visible, still include it with whatever options you can see.
5. Only omit a question if the question text itself is completely missing or unreadable.
6. Output nothing except the JSON array.`;

// ---------------------------------------------------------------------------
// Robust JSON array extraction
// Handles: raw arrays, object-wrapped arrays, markdown-fenced output,
// and partial trailing garbage from cut-off model responses.
// ---------------------------------------------------------------------------
function extractJsonArray(raw: string): RawQuestion[] {
    let text = raw.trim();

    // 1. Strip markdown code fences if present  (```json ... ``` or ``` ... ```)
    const fenceMatch = text.match(/```(?:json)?\s*([\s\S]*?)```/i);
    if (fenceMatch) text = fenceMatch[1].trim();

    // 2. Slice from the first '[' to the last ']' to strip any preamble or
    //    trailing garbage the model accidentally emits after the array.
    const firstBracket = text.indexOf("[");
    const lastBracket = text.lastIndexOf("]");
    if (firstBracket !== -1 && lastBracket > firstBracket) {
        text = text.slice(firstBracket, lastBracket + 1);
    }

    // 3. Try a direct parse of the cleaned string
    try {
        const parsed: unknown = JSON.parse(text);
        if (Array.isArray(parsed)) return parsed as RawQuestion[];
        if (typeof parsed === "object" && parsed !== null) {
            const arr = Object.values(parsed as Record<string, unknown>).find(
                Array.isArray,
            );
            if (arr) return arr as RawQuestion[];
        }
    } catch {
        /* fall through */
    }

    // 4. Last-resort: try to salvage each individual {...} object from the text
    //    (handles the case where the closing ] was cut off mid-stream)
    const objectMatches = text.match(
        /\{[^{}]*"options"\s*:\s*\[[^\]]*\][^{}]*\}/g,
    );
    if (objectMatches) {
        try {
            const salvaged = objectMatches
                .map((s) => {
                    try {
                        return JSON.parse(s);
                    } catch {
                        return null;
                    }
                })
                .filter(Boolean);
            if (salvaged.length > 0) return salvaged as RawQuestion[];
        } catch {
            /* give up */
        }
    }

    return [];
}

// ---------------------------------------------------------------------------
// Validate and normalise a raw question.
// Accepts 2–6 options (not strictly 4) to handle edge cases.
// ---------------------------------------------------------------------------
function normaliseQuestion(raw: RawQuestion): Question | null {
    if (
        !raw.question ||
        typeof raw.question !== "string" ||
        !Array.isArray(raw.options) ||
        raw.options.length < 2 // relaxed: at least 2 options
    ) {
        return null;
    }

    const options = raw.options.map((o) => String(o).trim()).filter(Boolean);
    if (options.length < 2) return null;

    return {
        question: raw.question.trim(),
        options,
    };
}

// ---------------------------------------------------------------------------
// Vercel handler — stateless: one chunk in, questions out.
// The frontend chunks the text and fans out these requests with a concurrency
// cap, so this handler stays simple and short-lived.
// ---------------------------------------------------------------------------
export default async function handler(req: VercelRequest, res: VercelResponse) {
    // CORS headers (useful during local dev)
    res.setHeader("Access-Control-Allow-Origin", "*");
    res.setHeader("Access-Control-Allow-Methods", "POST, OPTIONS");
    res.setHeader("Access-Control-Allow-Headers", "Content-Type");

    if (req.method === "OPTIONS") return res.status(204).end();
    if (req.method !== "POST")
        return res.status(405).json({ error: "Method Not Allowed" });

    const { chunk } = req.body as { chunk?: string };

    if (!chunk || typeof chunk !== "string" || chunk.trim().length === 0) {
        return res
            .status(400)
            .json({ error: 'Missing or empty "chunk" field in request body.' });
    }

    if (!process.env.HUGGINGFACE_API_KEY) {
        return res.status(500).json({
            error: "HUGGINGFACE_API_KEY environment variable is not set on the server.",
        });
    }

    let content: string;
    try {
        const response = await client.chat.completions.create({
            model: MODEL,
            messages: [
                { role: "system", content: SYSTEM_PROMPT },
                { role: "user", content: chunk },
            ],
            // response_format omitted — unreliable on HuggingFace; we parse manually below.
            temperature: 0.1,
            max_tokens: 4096,
        });
        content = response.choices[0]?.message?.content ?? "";
    } catch (err: unknown) {
        const msg = err instanceof Error ? err.message : String(err);
        console.error("[generate-exam] model error:", msg);
        return res.status(502).json({ error: `AI model error: ${msg}` });
    }

    if (!content.trim()) {
        return res.status(200).json({ questions: [] });
    }

    const questions = extractJsonArray(content)
        .map(normaliseQuestion)
        .filter((q): q is Question => q !== null);

    console.log(
        `[generate-exam] chunk ${chunk.length} chars -> ${questions.length} question(s).`,
    );

    // When a chunk produces nothing, log both the raw input and output so the
    // missing question's format can be diagnosed from Vercel function logs.
    if (questions.length === 0) {
        console.warn(
            "[generate-exam] 0 questions extracted. chunk input:",
            chunk,
        );
        console.warn(
            "[generate-exam] 0 questions extracted. model output:",
            content,
        );
    }

    return res.status(200).json({ questions });
}
