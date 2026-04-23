import "dotenv/config";
import express from "express";
import fs from "node:fs/promises";
import path from "node:path";
import { fileURLToPath } from "node:url";
import { generateAssistantReply } from "./openai.js";
import { createSpeechPayload } from "./tts.js";
import { sendToTouchDesigner } from "./td.js";
import { createMessageId } from "./queue.js";
import { cleanupAudioFiles, deleteAllAudioFiles } from "./audioCleanup.js";

const __filename = fileURLToPath(import.meta.url);
const __dirname = path.dirname(__filename);
const rootDir = path.resolve(__dirname, "..");
const publicDir = path.join(rootDir, "public");
const audioDir = path.join(publicDir, "audio");

const app = express();
const port = Number(process.env.PORT || 3000);
const maxInputLength = 200;
const storyState = {
  interactionCount: 0,
  storyStage: 1,
  revealedFacts: []
};

app.use(express.json({ limit: "32kb" }));
app.use(express.static(publicDir));

app.get("/health", (req, res) => {
  res.json({ ok: true });
});

app.post("/api/message", async (req, res) => {
  const userText = normalizeInput(req.body?.text);

  if (!process.env.OPENAI_API_KEY) {
    return res.status(500).json({ error: "OPENAI_API_KEY is not configured." });
  }

  if (!userText) {
    return res.status(400).json({ error: "text is required." });
  }

  if (userText.length > maxInputLength) {
    return res.status(400).json({ error: `text must be ${maxInputLength} characters or fewer.` });
  }

  const id = createMessageId();
  const createdAt = new Date().toISOString();

  try {
    const nextState = getNextStoryState(storyState);
    const assistantReply = await generateAssistantReply(userText, nextState);
    const assistantText = assistantReply.assistantText;
    applyStoryState(storyState, nextState, assistantReply);
    let audioBase64 = null;
    let audioMimeType = null;

    try {
      const audioPayload = await createSpeechPayload({ text: assistantText });
      audioBase64 = audioPayload.audioBase64;
      audioMimeType = audioPayload.audioMimeType;
    } catch (error) {
      console.error("[tts] Failed:", error);
    }

    sendToTouchDesigner({
      type: "assistant_message",
      id,
      text: assistantText,
      createdAt
    });

    res.json({
      id,
      userText,
      summary: assistantReply.summary,
      memoryFragment: assistantReply.memoryFragment,
      question: assistantReply.question,
      assistantText,
      audioUrl: null,
      audioBase64,
      audioMimeType,
      createdAt,
      storyStage: storyState.storyStage,
      interactionCount: storyState.interactionCount
    });
  } catch (error) {
    console.error("[ai] Failed:", error);
    res.status(500).json({ error: "Failed to generate assistant response." });
  }
});

app.post("/api/td/broadcast", (req, res) => {
  const id = typeof req.body?.id === "string" ? req.body.id : createMessageId();
  const text = normalizeInput(req.body?.text);

  if (!text) {
    return res.status(400).json({ error: "text is required." });
  }

  sendToTouchDesigner({
    type: "assistant_message",
    id,
    text,
    createdAt: new Date().toISOString()
  });

  res.json({ ok: true });
});

app.delete("/api/audio", async (req, res) => {
  try {
    const result = await deleteAllAudioFiles(audioDir);
    res.json({ ok: true, ...result });
  } catch (error) {
    console.error("[audio] Failed to delete audio files:", error);
    res.status(500).json({ error: "Failed to delete audio files." });
  }
});

app.use((err, req, res, next) => {
  console.error("[server] Unhandled error:", err);
  res.status(500).json({ error: "Internal server error." });
});

await fs.mkdir(audioDir, { recursive: true });
cleanupAudioFiles(audioDir)
  .then((result) => {
    console.log(`[audio] Cleanup complete. Deleted ${result.deleted}, kept ${result.kept}.`);
  })
  .catch((error) => {
    console.warn("[audio] Cleanup failed:", error.message);
  });

app.listen(port, () => {
  console.log(`AI voice bot running at http://localhost:${port}`);
});

function normalizeInput(value) {
  if (typeof value !== "string") {
    return "";
  }

  return value.replace(/\s+/g, " ").trim();
}

function getNextStoryState(currentState) {
  const interactionCount = currentState.interactionCount + 1;

  return {
    interactionCount,
    storyStage: resolveStoryStage(interactionCount),
    revealedFacts: [...currentState.revealedFacts]
  };
}

function resolveStoryStage(interactionCount) {
  if (interactionCount >= 9) {
    return 5;
  }

  if (interactionCount >= 7) {
    return 4;
  }

  if (interactionCount >= 5) {
    return 3;
  }

  if (interactionCount >= 3) {
    return 2;
  }

  return 1;
}

function applyStoryState(currentState, nextState, reply) {
  currentState.interactionCount = nextState.interactionCount;
  currentState.storyStage = nextState.storyStage;

  const facts = [
    `stage_${nextState.storyStage}`,
    reply.summary,
    reply.memoryFragment
  ];

  for (const fact of facts) {
    if (fact && !currentState.revealedFacts.includes(fact)) {
      currentState.revealedFacts.push(fact);
    }
  }

  if (currentState.revealedFacts.length > 18) {
    currentState.revealedFacts = currentState.revealedFacts.slice(-18);
  }
}
