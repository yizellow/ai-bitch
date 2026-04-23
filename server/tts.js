import fs from "node:fs/promises";
import path from "node:path";
import OpenAI from "openai";

let client = null;

export async function createSpeechFile({ id, text, audioDir }) {
  const fileName = `${id}.mp3`;
  const filePath = path.join(audioDir, fileName);

  if (await fileExists(filePath)) {
    return `/audio/${fileName}`;
  }

  const openai = getClient();
  const response = await openai.audio.speech.create({
    model: process.env.OPENAI_TTS_MODEL || "gpt-4o-mini-tts",
    voice: process.env.OPENAI_TTS_VOICE || "cedar",
    input: text,
    response_format: "mp3",
    instructions: "Use a very low adult male voice with a deep chest resonance. Do not sound feminine, bright, youthful, or high-pitched. Speak slowly with clear pauses, calm weight, and a grounded installation-like presence."
  });

  const buffer = Buffer.from(await response.arrayBuffer());
  await fs.writeFile(filePath, buffer);

  return `/audio/${fileName}`;
}

function getClient() {
  if (!client) {
    client = new OpenAI({
      apiKey: process.env.OPENAI_API_KEY
    });
  }

  return client;
}

async function fileExists(filePath) {
  try {
    await fs.access(filePath);
    return true;
  } catch {
    return false;
  }
}
