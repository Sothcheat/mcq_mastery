import { getDocumentProxy, extractText } from "unpdf";
import type { Question } from "../types";

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
 * Shuffles the questions array and the options inside each question.
 * With no answer key there is nothing to keep in sync, so this is a plain shuffle.
 */
export function shuffleQuestions(questions: Question[]): Question[] {
    return shuffle(questions).map((q, idx) => ({
        ...q,
        id: idx + 1,
        options: shuffle(q.options),
    }));
}

// ---------------------------------------------------------------------------
// Progress reporting
// ---------------------------------------------------------------------------
export type ProgressFn = (p: {
    phase: "parsing";
    completed: number;
    total: number;
}) => void;

export interface ExtractionResult {
    questions: Question[];
    failedChunks: number;
}

// Bare question before it gets a sequential id.
type ParsedQuestion = { question: string; options: string[] };

// Shape returned by the backend (no answer key).
interface RawQuestion {
    id?: string | number;
    question: string;
    options: string[];
}

// ---------------------------------------------------------------------------
// 1. Extract raw text from a PDF (runs on the main thread using unpdf).
// ---------------------------------------------------------------------------
export async function extractTextFromPDF(file: File): Promise<string> {
    const buffer = await file.arrayBuffer();
    const pdf = await getDocumentProxy(new Uint8Array(buffer));
    const { text } = await extractText(pdf, { mergePages: true });
    if (!text || text.trim().length === 0) {
        throw new Error(
            "Could not extract any text from the PDF. The file may be scanned or image-based.",
        );
    }
    return text;
}

// ---------------------------------------------------------------------------
// 2. Chunking — split the blob into per-question fragments on numbered markers,
//    never splitting a question across a chunk boundary. Falls back to plain
//    character chunks when the document has no detectable question numbering.
// ---------------------------------------------------------------------------
// Fewer questions per LLM chunk = much less truncation risk.
// At ~150 output tokens per question, 6 questions ≈ 900 tokens — well under the
// 4096 max_tokens budget. The old limit of 10 was close enough to the ceiling
// that the last question sometimes got cut off mid-object.
const MAX_QUESTIONS_PER_CHUNK = 6;
const MAX_CHARS_PER_CHUNK = 2000;
// Overlap keeps questions at char-chunk boundaries from being silently dropped.
const CHAR_CHUNK_OVERLAP = 300;

function splitIntoQuestions(text: string): string[] {
    const normalized = text.replace(/\r/g, "");
    // Split *before* a question-number marker ("1." "2)" "12.") so the marker
    // stays attached to the question that follows it.
    // The second pattern catches numbers at the start of a line after a newline.
    const parts = normalized.split(
        /\n(?=\s*\d{1,3}[.)]\s)|(?=(?:^|\s)\d{1,3}[.)]\s)/,
    );
    return parts.map((p) => p.trim()).filter((p) => p.length > 0);
}

function charChunks(text: string, size: number): string[] {
    const chunks: string[] = [];
    let start = 0;
    while (start < text.length) {
        const end = Math.min(start + size, text.length);
        chunks.push(text.slice(start, end));
        if (end === text.length) break;
        start += size - CHAR_CHUNK_OVERLAP;
    }
    return chunks;
}

/** Group fragments into chunks of at most N questions / M chars. */
function groupFragments(fragments: string[]): string[] {
    const chunks: string[] = [];
    let buf: string[] = [];
    let bufLen = 0;

    for (const frag of fragments) {
        if (
            buf.length > 0 &&
            (buf.length >= MAX_QUESTIONS_PER_CHUNK ||
                bufLen + frag.length > MAX_CHARS_PER_CHUNK)
        ) {
            chunks.push(buf.join("\n"));
            buf = [];
            bufLen = 0;
        }
        buf.push(frag);
        bufLen += frag.length;
    }
    if (buf.length) chunks.push(buf.join("\n"));
    return chunks;
}

// ---------------------------------------------------------------------------
// 3. Regex fast-path — handles the dominant "stem a, .. b, .. c, .. d, .." form
//    deterministically (free, instant). Returns null when it can't confidently
//    parse, so the fragment falls through to the LLM.
// ---------------------------------------------------------------------------
function regexParseQuestion(fragment: string): ParsedQuestion | null {
    const cleaned = fragment.replace(/^\s*\d{1,3}[.)]\s*/, "").trim();

    const re = /\b([a-e])[,.)]\s+/gi;
    const markers: { letter: string; start: number; contentStart: number }[] =
        [];
    let m: RegExpExecArray | null;
    while ((m = re.exec(cleaned)) !== null) {
        markers.push({
            letter: m[1].toLowerCase(),
            start: m.index,
            contentStart: re.lastIndex,
        });
    }
    if (markers.length < 2) return null;

    // Find the 'a' that starts the options run, then accept any markers that
    // follow in strictly increasing alphabetical order (a→c→d→e is fine — the
    // PDF may simply omit option b without the question being malformed).
    const startIdx = markers.findIndex((x) => x.letter === "a");
    if (startIdx === -1) return null;

    const run: typeof markers = [];
    let prevLetter = "";
    for (let i = startIdx; i < markers.length; i++) {
        const letter = markers[i].letter;
        if (run.length === 0 && letter === "a") {
            run.push(markers[i]);
            prevLetter = letter;
        } else if (run.length > 0 && letter > prevLetter && letter <= "e") {
            run.push(markers[i]);
            prevLetter = letter;
        } else {
            break;
        }
    }
    if (run.length < 2) return null;

    const question = cleaned.slice(0, run[0].start).trim();
    if (!question) return null;

    const options: string[] = [];
    for (let i = 0; i < run.length; i++) {
        const end = i + 1 < run.length ? run[i + 1].start : cleaned.length;
        const opt = cleaned.slice(run[i].contentStart, end).trim();
        // A very long "option" usually means we mis-split — bail to the LLM.
        if (!opt || opt.length > 400) return null;
        options.push(opt);
    }

    return { question, options };
}

// ---------------------------------------------------------------------------
// 4. Backend call for one chunk, with retry/backoff.
// ---------------------------------------------------------------------------
async function fetchChunk(chunk: string, retries = 2): Promise<RawQuestion[]> {
    for (let attempt = 0; ; attempt++) {
        try {
            const res = await fetch("/api/generate-exam", {
                method: "POST",
                headers: { "Content-Type": "application/json" },
                body: JSON.stringify({ chunk }),
            });
            if (!res.ok) {
                let message = `Server error: ${res.status}`;
                try {
                    const body = (await res.json()) as { error?: string };
                    if (body.error) message = body.error;
                } catch {
                    /* ignore */
                }
                throw new Error(message);
            }
            const data = (await res.json()) as { questions?: RawQuestion[] };
            return Array.isArray(data.questions) ? data.questions : [];
        } catch (err) {
            if (attempt >= retries) throw err;
            await new Promise((r) => setTimeout(r, 400 * (attempt + 1)));
        }
    }
}

/** Run `worker` over `items` with a bounded number of concurrent calls. */
async function runPool<T, R>(
    items: T[],
    limit: number,
    worker: (item: T, index: number) => Promise<R>,
): Promise<R[]> {
    const results: R[] = new Array(items.length);
    let next = 0;
    async function run() {
        while (next < items.length) {
            const i = next++;
            results[i] = await worker(items[i], i);
        }
    }
    await Promise.all(
        Array.from({ length: Math.min(limit, items.length) }, run),
    );
    return results;
}

const CONCURRENCY = 4;

// ---------------------------------------------------------------------------
// 5. Normalisation, dedup (by question stem), and sequential numbering.
// ---------------------------------------------------------------------------
function normalise(raw: RawQuestion): ParsedQuestion | null {
    if (!raw || typeof raw.question !== "string") return null;
    const question = raw.question.trim();
    if (!question) return null;
    const options = Array.isArray(raw.options)
        ? raw.options.map((o) => String(o).trim()).filter(Boolean)
        : [];
    if (options.length < 2) return null;
    return { question, options };
}

// ---------------------------------------------------------------------------
// 6. Orchestration: chunk → regex fast-path → LLM for the remainder →
//    reassemble. Reports progress as each LLM chunk resolves.
// ---------------------------------------------------------------------------
export async function extractQuestionsFromText(
    text: string,
    onProgress?: ProgressFn,
): Promise<ExtractionResult> {
    const fragments = splitIntoQuestions(text);

    const parsed: ParsedQuestion[] = [];
    let chunks: string[];

    if (fragments.length <= 1) {
        // No usable question numbering — skip regex, send char chunks to the LLM.
        chunks = charChunks(text, MAX_CHARS_PER_CHUNK);
    } else {
        // Try the deterministic fast-path per fragment; collect the leftovers.
        const leftover: string[] = [];
        for (const frag of fragments) {
            const hit = regexParseQuestion(frag);
            if (hit) parsed.push(hit);
            else leftover.push(frag);
        }
        // Skip fragments that have no option markers — they're headers/titles
        // and sending them to the LLM alongside real questions confuses the model.
        const HAS_OPTION_MARKER = /\b[a-eA-E][,.)]\s/;
        chunks = groupFragments(leftover.filter((f) => HAS_OPTION_MARKER.test(f)));
    }

    let completed = 0;
    const total = chunks.length;
    onProgress?.({ phase: "parsing", completed, total });

    let failedChunks = 0;
    let firstChunkError: string | null = null;
    const llmResults = await runPool(chunks, CONCURRENCY, async (chunk) => {
        try {
            return await fetchChunk(chunk);
        } catch (err) {
            failedChunks++;
            if (!firstChunkError) {
                firstChunkError =
                    err instanceof Error ? err.message : String(err);
            }
            return [] as RawQuestion[];
        } finally {
            completed++;
            onProgress?.({ phase: "parsing", completed, total });
        }
    });

    for (const list of llmResults) {
        for (const raw of list) {
            const n = normalise(raw);
            if (n) parsed.push(n);
        }
    }

    // Dedup by question stem. Questions that appear more than once in the PDF
    // (e.g. repeated in a chapter-review section) are intentionally collapsed.
    const seen = new Set<string>();
    const questions: Question[] = [];
    for (const it of parsed) {
        // Dedup key covers both stem and options so only truly identical questions
        // (same text AND same options) are collapsed — different options = different entry.
        const key = (it.question + it.options.join("")).toLowerCase().replace(/[^a-z0-9]/g, "");
        if (!key || seen.has(key)) continue;
        seen.add(key);
        questions.push({ id: questions.length + 1, question: it.question, options: it.options });
    }

    if (questions.length === 0) {
        const reason = firstChunkError
            ? `AI error: ${firstChunkError}`
            : "The model may have returned an unexpected format.";
        throw new Error(
            `No questions could be extracted from your PDF. ${reason}`,
        );
    }

    return { questions, failedChunks };
}
