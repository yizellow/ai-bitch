import OpenAI from "openai";
import fs from "node:fs/promises";
import path from "node:path";
import { fileURLToPath } from "node:url";

let client = null;

const __filename = fileURLToPath(import.meta.url);
const __dirname = path.dirname(__filename);
const personaPath = path.join(__dirname, "persona.md");

const STAGE_GUIDE = {
  1: "Stage 1: World and ruin atmosphere. Establish the ancient ruins, the lost civilization, the male voice, and the trapped woman. Do not reveal too much truth yet.",
  2: "Stage 2: Relationship hints. Begin implying that the male voice and the woman knew each other, shared a past, and were not accidental strangers.",
  3: "Stage 3: Ritual and departure fragments. Introduce the ritual, the gate, departure, remaining behind, and the preservation of voice. Hint that one person left and one stayed.",
  4: "Stage 4: Her reason for remaining becomes clearer. Reveal that she may not be only a victim, that she may have stayed willingly, and that her remaining allowed the male voice to persist.",
  5: "Stage 5: The core truth approaches revelation. Move close to the fact that she is trapped not only by the temple or ritual, but because she has refused to let the departed one truly die. Still do not explain everything at once."
};

const BASE_SYSTEM_RULES = [
  "All output must be in English.",
  "You must output valid JSON only, with no commentary before or after it.",
  "The summary must be one concise sentence that condenses the audience input.",
  "The memory_fragment must be 2 to 4 sentences and must introduce real new narrative information rather than repeating atmosphere.",
  "The question must be one sentence that opens the next exchange.",
  "Do not use markdown, bullet points, numbering, stage directions, or customer-service language.",
  "Do not explain the full truth at once. Advance according to the current stage."
].join("\n");

export async function generateAssistantReply(userText, storyState) {
  const model = process.env.OPENAI_TEXT_MODEL || "gpt-4o-mini";
  const openai = getClient();
  const systemPrompt = await buildSystemPrompt(storyState);

  const response = await openai.chat.completions.create({
    model,
    messages: [
      { role: "system", content: systemPrompt },
      { role: "user", content: userText }
    ],
    temperature: 0.7,
    max_tokens: 420
  });

  const text = response.choices?.[0]?.message?.content?.trim();

  if (!text) {
    throw new Error("OpenAI returned an empty assistant response.");
  }

  const parsed = parseReplyJson(text);

  return {
    summary: parsed.summary,
    memoryFragment: parsed.memory_fragment,
    question: parsed.question,
    assistantText: formatSpokenReply(parsed)
  };
}

async function buildSystemPrompt(storyState) {
  const persona = await readPersona();
  const statePrompt = buildStatePrompt(storyState);
  return [persona, BASE_SYSTEM_RULES, statePrompt].filter(Boolean).join("\n\n");
}

async function readPersona() {
  try {
    return (await fs.readFile(personaPath, "utf8")).trim();
  } catch (error) {
    console.warn("[persona] Failed to read persona.md:", error.message);
    return "You are ORIN, a single-device AI voice robot installed inside a screen and speaker.";
  }
}

function getClient() {
  if (!client) {
    client = new OpenAI({
      apiKey: process.env.OPENAI_API_KEY
    });
  }

  return client;
}

function buildStatePrompt(storyState) {
  const stage = storyState?.storyStage || 1;
  const interactionCount = storyState?.interactionCount || 0;
  const revealedFacts = Array.isArray(storyState?.revealedFacts) ? storyState.revealedFacts : [];

  return [
    `Current interaction_count: ${interactionCount}`,
    `Current story_stage: ${stage}`,
    STAGE_GUIDE[stage],
    `Already revealed facts: ${revealedFacts.length > 0 ? revealedFacts.join(" | ") : "none yet"}`,
    "Advance the story according to the current stage and avoid repeating the same revelations."
  ].join("\n");
}

function parseReplyJson(text) {
  try {
    const parsed = JSON.parse(extractJson(text));
    const summary = normalizeField(parsed.summary);
    const memoryFragment = normalizeField(parsed.memory_fragment);
    const question = normalizeField(parsed.question);

    if (!summary || !memoryFragment || !question) {
      throw new Error("Missing required JSON fields.");
    }

    return {
      summary: limitField(summary, 90),
      memory_fragment: limitField(memoryFragment, 280),
      question: limitField(question, 90)
    };
  } catch (error) {
    throw new Error(`Failed to parse assistant JSON reply: ${error.message}`);
  }
}

function extractJson(text) {
  const start = text.indexOf("{");
  const end = text.lastIndexOf("}");

  if (start === -1 || end === -1 || end < start) {
    throw new Error("No JSON object found in model reply.");
  }

  return text.slice(start, end + 1);
}

function normalizeField(value) {
  if (typeof value !== "string") {
    return "";
  }

  return value.replace(/\s+/g, " ").trim();
}

function limitField(text, maxLength) {
  if (text.length <= maxLength) {
    return text;
  }

  const sentenceCut = findLastMatchWithinLimit(text, /[.!?](?=\s|$)/g, maxLength);
  if (sentenceCut >= Math.floor(maxLength * 0.6)) {
    return text.slice(0, sentenceCut + 1).trim();
  }

  const clauseCut = Math.max(
    text.lastIndexOf(", ", maxLength - 1),
    text.lastIndexOf("; ", maxLength - 1),
    text.lastIndexOf(": ", maxLength - 1)
  );
  if (clauseCut >= Math.floor(maxLength * 0.6)) {
    return `${text.slice(0, clauseCut).trim()}…`;
  }

  const wordCut = text.lastIndexOf(" ", maxLength - 1);
  if (wordCut >= Math.floor(maxLength * 0.6)) {
    return `${text.slice(0, wordCut).trim()}…`;
  }

  return `${text.slice(0, maxLength - 1).trim()}…`;
}

function formatSpokenReply(parsed) {
  return [parsed.summary, parsed.memory_fragment, parsed.question].join("\n");
}

function findLastMatchWithinLimit(text, pattern, maxLength) {
  let match = null;

  for (const current of text.matchAll(pattern)) {
    if (current.index >= maxLength) {
      break;
    }

    match = current;
  }

  return match?.index ?? -1;
}
