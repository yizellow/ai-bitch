# Single-Device AI Voice Robot

A local MVP built with plain HTML/CSS/Vanilla JS and Node.js + Express. The user types text in the browser, the server generates a short AI response with OpenAI, converts that response into speech with OpenAI TTS, and the frontend plays each response through a FIFO queue.

## File Structure

```txt
server/
  server.js
  openai.js
  tts.js
  td.js
  queue.js
  persona.md
  audioCleanup.js
public/
  index.html
  style.css
  app.js
package.json
.env.example
README.md
```

## Setup

```bash
npm install
cp .env.example .env
```

Edit `.env`:

```bash
OPENAI_API_KEY=your_key
PORT=3000
TD_WS_URL=ws://127.0.0.1:9980
ENABLE_TD=false
OPENAI_TTS_VOICE=cedar
```

## Persona

Edit [server/persona.md](server/persona.md) to change the robot's story, identity, and tone. The server reads this file each time it generates a response, so you can edit the background and send a new message without changing JavaScript code.

## Start

```bash
npm run dev
```

Open:

```txt
http://localhost:3000
```

## Deploy on Render

This project is a better fit for Render than Netlify because it needs a real Node.js server for:

- `GET /health`
- `POST /api/message`
- OpenAI text generation
- OpenAI TTS generation

The repo includes [render.yaml](render.yaml), so you can deploy it as a Render Blueprint or create a Web Service manually with the same settings.

### Render settings

- Runtime: `Node`
- Build Command: `npm install`
- Start Command: `npm start`
- Health Check Path: `/health`

### Required environment variables

Set these in the Render dashboard:

```bash
OPENAI_API_KEY=your_key
PORT=10000
ENABLE_TD=false
TD_WS_URL=ws://127.0.0.1:9980
OPENAI_TEXT_MODEL=gpt-4o-mini
OPENAI_TTS_MODEL=gpt-4o-mini-tts
OPENAI_TTS_VOICE=cedar
```

### Important note about audio files

This app returns TTS audio directly to the browser without saving new MP3 files on disk. The legacy `DELETE /api/audio` route remains only to remove older files that may already exist in `public/audio/`.

## API

### `GET /health`

```json
{
  "ok": true
}
```

### `POST /api/message`

Request:

```json
{
  "text": "Hello, introduce yourself."
}
```

Response:

```json
{
  "id": "msg_20260423T120000000Z_001",
  "userText": "Hello, introduce yourself.",
  "assistantText": "Hello. I am ORIN, a quiet archive machine living inside this device.",
  "audioUrl": null,
  "audioBase64": "<base64-audio>",
  "audioMimeType": "audio/mpeg",
  "createdAt": "2026-04-23T12:00:00.000Z"
}
```

If TTS fails, the server still returns the text response with `audioUrl: null` and `audioBase64: null`.

### `POST /api/td/broadcast`

Request:

```json
{
  "id": "msg_20260423T120000000Z_001",
  "text": "Hello. I am ORIN, a quiet archive machine living inside this device."
}
```

### `DELETE /api/audio`

Deletes any existing legacy MP3 files in `public/audio/`.

```json
{
  "ok": true,
  "deleted": 8
}
```

Response:

```json
{
  "ok": true
}
```

## TouchDesigner

WebSocket output is prepared for a later TouchDesigner phase:

```bash
ENABLE_TD=true
TD_WS_URL=ws://127.0.0.1:9980
```

The server sends:

```json
{
  "type": "assistant_message",
  "id": "msg_20260423T120000000Z_001",
  "text": "Hello. I am ORIN, a quiet archive machine living inside this device.",
  "createdAt": "2026-04-23T12:00:00.000Z"
}
```

If TouchDesigner is not open or the WebSocket is not connected, the main AI/TTS/playback flow still continues.

## Playback Queue

Frontend queue state:

```js
{
  queue: [],
  isPlaying: false,
  currentItem: null
}
```

Rules:

- New audio items are appended to the end of the queue.
- Only one audio item plays at a time.
- The next item starts after the current audio fires `ended`.
- Rapid submissions play in order without interrupting the current audio.

## Notes

- Keep the API key only in `.env`.
- Input is limited to 200 characters.
- OpenAI TTS uses `gpt-4o-mini-tts`.
- The default voice is `cedar`, with instructions for a very low, calm male voice.
- The assistant persona is ORIN: a quiet archive machine inside the device, designed for short spoken installation responses.
- New TTS responses are returned directly to the browser without being saved as MP3 files.
- For public installations, clearly disclose that the voice is AI-generated.
