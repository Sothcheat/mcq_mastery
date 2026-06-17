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
// OpenAI client pointed at Google AI Studio (OpenAI-compatible endpoint)
// ---------------------------------------------------------------------------
const client = new OpenAI({
    baseURL: "https://generativelanguage.googleapis.com/v1beta/openai/",
    apiKey: process.env.GEMINI_API_KEY ?? "",
});

const MODEL = "gemma-4-26b-a4b-it";

const SYSTEM_PROMPT = `You are a precise educational data parser. Extract every multiple-choice question from the text into a strict JSON array.

OUTPUT CONTRACT:
- Output ONLY a raw JSON array. No markdown. No preamble. No trailing text.
- NEVER stop mid-array. Complete every object before stopping.

SCHEMA (strict):
[{"id":"q1","question":"Question text only","options":["Option A","Option B","Option C","Option D"]}]

PARSING RULES:
1. OPTIONS COUNT: Questions may have 2 to 6 options. Extract ALL of them — never truncate to 4.
2. STRIP ALL PREFIXES: Options arrive with many prefix styles. Strip every one completely:
   - Letter-dot: "A. " "B. " "C. "
   - Letter-comma: "a, " "b, " "c, "
   - Letter-paren: "A) " "B) " "C) "
   - Bullets: "• " "- " "* "
   Options in the "options" array must be clean text with no prefix characters.
3. SPLIT SQUASHED TEXT: If the question and options run together, find the first option marker (any format above) — everything before it is the "question", everything from the first marker onward is options.
4. "question" field contains question text ONLY — never include option text inside it.
6. Skip any question that is truncated or cut off — do not include partial questions.

EXAMPLES:

Input: "The powerhouse of the cell is A. Nucleus B. Mitochondria C. Ribosome D. Golgi apparatus E. Lysosome"
Output: [{"id":"q1","question":"The powerhouse of the cell is","options":["Nucleus","Mitochondria","Ribosome","Golgi apparatus","Lysosome"]}]

Input: "DNA replication is a, Semi-conservative b, Conservative c, Dispersive"
Output: [{"id":"q1","question":"DNA replication is","options":["Semi-conservative","Conservative","Dispersive"]}]

Input: "Insulin is produced by • Alpha cells • Beta cells • Delta cells • PP cells"
Output: [{"id":"q1","question":"Insulin is produced by","options":["Alpha cells","Beta cells","Delta cells","PP cells"]}]`;

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

    if (!process.env.GEMINI_API_KEY) {
        return res.status(500).json({
            error: "GEMINI_API_KEY environment variable is not set on the server.",
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
            response_format: {
                type: "json_schema",
                json_schema: {
                    name: "mcq_result",
                    strict: true,
                    schema: {
                        type: "object",
                        required: ["questions"],
                        additionalProperties: false,
                        properties: {
                            questions: {
                                type: "array",
                                items: {
                                    type: "object",
                                    required: ["id", "question", "options"],
                                    additionalProperties: false,
                                    properties: {
                                        id:       { type: "string" },
                                        question: { type: "string" },
                                        options:  { type: "array", items: { type: "string" } },
                                    },
                                },
                            },
                        },
                    },
                },
            } as Parameters<
                typeof client.chat.completions.create
            >[0]["response_format"],
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

    // Structured output wraps the array in { questions: [...] }.
    // Fall back to the regex salvage parser for any malformed output.
    let rawQuestions: RawQuestion[] = [];
    try {
        const parsed = JSON.parse(content) as { questions?: RawQuestion[] } | RawQuestion[];
        if (Array.isArray(parsed)) {
            rawQuestions = parsed;
        } else if (parsed && Array.isArray((parsed as { questions?: RawQuestion[] }).questions)) {
            rawQuestions = (parsed as { questions: RawQuestion[] }).questions;
        }
    } catch {
        rawQuestions = extractJsonArray(content);
    }

    const questions = rawQuestions
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
