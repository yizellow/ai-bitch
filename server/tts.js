import OpenAI from "openai";

let client = null;

export async function createSpeechPayload({ text }) {
  const openai = getClient();
  const response = await openai.audio.speech.create({
    model: process.env.OPENAI_TTS_MODEL || "gpt-4o-mini-tts",
    voice: process.env.OPENAI_TTS_VOICE || "cedar",
    input: text,
    response_format: "mp3",
    instructions: "Use a very low ancient male voice with deep chest resonance, like an echo speaking from stone ruins. Do not sound feminine, bright, youthful, casual, or high-pitched. Speak slowly with ritual pauses, mournful weight, and a distant ceremonial presence."
  });

  const buffer = Buffer.from(await response.arrayBuffer());

  return {
    audioBase64: buffer.toString("base64"),
    audioMimeType: "audio/mpeg"
  };
}

function getClient() {
  if (!client) {
    client = new OpenAI({
      apiKey: process.env.OPENAI_API_KEY
    });
  }

  return client;
}
