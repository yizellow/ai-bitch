const form = document.querySelector("#messageForm");
const input = document.querySelector("#messageInput");
const submitButton = document.querySelector("#submitButton");
const messagesEl = document.querySelector("#messages");
const playbackStatusEl = document.querySelector("#playbackStatus");
const queueListEl = document.querySelector("#queueList");
const currentItemEl = document.querySelector("#currentItem");
const clearButton = document.querySelector("#clearButton");
const clearAudioButton = document.querySelector("#clearAudioButton");
const charCount = document.querySelector("#charCount");

const state = {
  queue: [],
  isPlaying: false,
  currentItem: null,
  audio: null,
  audioContext: null
};

if (messagesEl) {
  renderMessagesEmpty();
}
renderQueue();

if (input && charCount) {
  input.addEventListener("input", () => {
    charCount.textContent = `${input.value.length} / 200`;
  });
}

if (form && input && submitButton) {
  form.addEventListener("submit", async (event) => {
    event.preventDefault();

    const text = input.value.trim();
    if (!text || submitButton.disabled) {
      return;
    }

    submitButton.disabled = true;
    setPlaybackStatus("Waiting for AI...");
    unlockAudio();

    try {
      const result = await sendMessage(text);
      appendMessage(result);

      if (result.audioUrl) {
        enqueue({
          id: result.id,
          text: result.assistantText,
          audioUrl: result.audioUrl,
          status: "queued"
        });
      } else if (result.audioBase64) {
        enqueue({
          id: result.id,
          text: result.assistantText,
          audioUrl: createAudioObjectUrl(result.audioBase64, result.audioMimeType),
          status: "queued"
        });
      } else {
        setPlaybackStatus("No audio for this response");
      }

      input.value = "";
      if (charCount) {
        charCount.textContent = "0 / 200";
      }
    } catch (error) {
      appendError(text, error.message);
      setPlaybackStatus("Error");
    } finally {
      submitButton.disabled = false;
      input.focus();
    }
  });
}

if (clearButton) {
  clearButton.addEventListener("click", () => {
    if (messagesEl) {
      messagesEl.innerHTML = "";
      renderMessagesEmpty();
    }

    state.queue = [];
    if (state.audio) {
      state.audio.pause();
    }

    state.isPlaying = false;
    state.currentItem = null;
    state.audio = null;
    closeAudioContext();
    setPlaybackStatus("Idle");
    renderQueue();
  });
}

if (clearAudioButton) {
  clearAudioButton.addEventListener("click", async () => {
    const confirmed = window.confirm("Delete all generated audio files on the server?");

    if (!confirmed) {
      return;
    }

    clearAudioButton.disabled = true;

    try {
      const result = await deleteAudioFiles();
      setPlaybackStatus(`Deleted ${result.deleted} audio files`);
    } catch (error) {
      setPlaybackStatus("Failed to delete audio files");
    } finally {
      clearAudioButton.disabled = false;
    }
  });
}

async function sendMessage(text) {
  const response = await fetch("/api/message", {
    method: "POST",
    headers: {
      "Content-Type": "application/json"
    },
    body: JSON.stringify({ text })
  });

  const data = await response.json().catch(() => ({}));

  if (!response.ok) {
    throw new Error(data.error || `API error: ${response.status}`);
  }

  return data;
}

async function deleteAudioFiles() {
  const response = await fetch("/api/audio", {
    method: "DELETE"
  });

  const data = await response.json().catch(() => ({}));

  if (!response.ok) {
    throw new Error(data.error || `API error: ${response.status}`);
  }

  return data;
}

function enqueue(item) {
  state.queue.push(item);
  renderQueue();

  if (!state.isPlaying) {
    playNext();
  }
}

function playNext() {
  if (state.isPlaying) {
    return;
  }

  const item = state.queue.find((queueItem) => queueItem.status === "queued");
  if (!item) {
    state.currentItem = null;
    setPlaybackStatus("Queue complete");
    renderQueue();
    return;
  }

  item.status = "playing";
  state.currentItem = item;
  state.isPlaying = true;
  setPlaybackStatus(`Playing: ${item.id}`);
  renderQueue();

  const audio = new Audio(item.audioUrl);
  state.audio = audio;

  audio.addEventListener("ended", () => onAudioEnded(item), { once: true });
  audio.addEventListener("error", () => onAudioError(item), { once: true });

  audio.play().catch(() => onAudioError(item));
}

function onAudioEnded(item) {
  item.status = "done";
  state.isPlaying = false;
  state.currentItem = null;
  state.audio = null;
  releaseAudioObjectUrl(item);
  setPlaybackStatus(`${item.id} finished`);
  renderQueue();
  playNext();
}

function onAudioError(item) {
  item.status = "error";
  state.isPlaying = false;
  state.currentItem = null;
  state.audio = null;
  releaseAudioObjectUrl(item);
  setPlaybackStatus(`${item.id} audio failed`);
  renderQueue();
  playNext();
}

function appendMessage(result) {
  if (!messagesEl) {
    return;
  }

  removeEmptyMessage();

  messagesEl.append(
    createMessageBubble({
      role: "You",
      text: result.userText,
      time: result.createdAt,
      type: "user"
    })
  );

  messagesEl.append(
    createMessageBubble({
      role: "Echo",
      text: result.audioUrl || result.audioBase64
        ? result.assistantText
        : `${result.assistantText}\n\nNo audio was generated for this response. Check the server TTS log.`,
      time: result.createdAt,
      type: result.audioUrl || result.audioBase64 ? "ai" : "error",
      id: result.id
    })
  );

  scrollMessagesToBottom();
}

function appendError(userText, message) {
  if (!messagesEl) {
    return;
  }

  removeEmptyMessage();

  const createdAt = new Date().toISOString();

  messagesEl.append(
    createMessageBubble({
      role: "You",
      text: userText,
      time: createdAt,
      type: "user"
    })
  );

  messagesEl.append(
    createMessageBubble({
      role: "Error",
      text: message,
      time: createdAt,
      type: "error"
    })
  );

  scrollMessagesToBottom();
}

function renderQueue() {
  if (currentItemEl) {
    currentItemEl.textContent = state.currentItem
      ? `Now playing: ${state.currentItem.id}`
      : "Nothing is playing";
  }

  if (!queueListEl) {
    return;
  }

  queueListEl.innerHTML = "";

  if (state.queue.length === 0) {
    const empty = document.createElement("li");
    empty.className = "empty";
    empty.textContent = "The queue is empty";
    queueListEl.append(empty);
    return;
  }

  for (const item of state.queue) {
    const li = document.createElement("li");
    li.className = "queue-item";
    li.dataset.status = item.status;
    li.innerHTML = `
      <div class="queue-meta">
        <span>${escapeHtml(item.id)}</span>
        <span>${translateStatus(item.status)}</span>
      </div>
      <span>${escapeHtml(item.text)}</span>
    `;
    queueListEl.append(li);
  }
}

function renderMessagesEmpty() {
  if (!messagesEl) {
    return;
  }

  if (messagesEl.children.length > 0) {
    return;
  }

  const empty = document.createElement("article");
  empty.className = "message message-empty";
  empty.dataset.empty = "true";
  empty.textContent = "No messages yet";
  messagesEl.append(empty);
  scrollMessagesToBottom();
}

function removeEmptyMessage() {
  if (!messagesEl) {
    return;
  }

  const empty = messagesEl.querySelector("[data-empty='true']");
  if (empty) {
    empty.remove();
  }
}

function setPlaybackStatus(text) {
  if (playbackStatusEl) {
    playbackStatusEl.textContent = text;
  }
}

function createMessageBubble({ role, text, time, type, id }) {
  const article = document.createElement("article");
  article.className = `message message-${type}`;

  const meta = document.createElement("div");
  meta.className = "message-meta";

  const roleEl = document.createElement("span");
  roleEl.className = "message-role";
  roleEl.textContent = role;

  const timeEl = document.createElement("span");
  timeEl.textContent = id ? `${id} · ${formatTime(time)}` : formatTime(time);

  const textEl = document.createElement("p");
  textEl.textContent = text;

  meta.append(roleEl, timeEl);
  article.append(meta, textEl);

  return article;
}

function scrollMessagesToBottom() {
  if (!messagesEl) {
    return;
  }

  requestAnimationFrame(() => {
    messagesEl.scrollTop = messagesEl.scrollHeight;
  });
}

function createAudioObjectUrl(audioBase64, audioMimeType = "audio/mpeg") {
  const binary = window.atob(audioBase64);
  const bytes = new Uint8Array(binary.length);

  for (let index = 0; index < binary.length; index += 1) {
    bytes[index] = binary.charCodeAt(index);
  }

  const blob = new Blob([bytes], { type: audioMimeType });
  return URL.createObjectURL(blob);
}

function releaseAudioObjectUrl(item) {
  if (item?.audioUrl?.startsWith("blob:")) {
    URL.revokeObjectURL(item.audioUrl);
  }
}

function translateStatus(status) {
  const labels = {
    queued: "Queued",
    playing: "Playing",
    done: "Done",
    error: "Error"
  };

  return labels[status] || status;
}

function formatTime(value) {
  return new Intl.DateTimeFormat("en", {
    hour: "2-digit",
    minute: "2-digit",
    second: "2-digit"
  }).format(new Date(value));
}

function escapeHtml(value) {
  return String(value)
    .replaceAll("&", "&amp;")
    .replaceAll("<", "&lt;")
    .replaceAll(">", "&gt;")
    .replaceAll('"', "&quot;")
    .replaceAll("'", "&#039;");
}

function unlockAudio() {
  const AudioContextClass = window.AudioContext || window.webkitAudioContext;

  if (!AudioContextClass) {
    return;
  }

  if (!state.audioContext) {
    state.audioContext = new AudioContextClass();
  }

  if (state.audioContext.state === "suspended") {
    state.audioContext.resume().catch(() => {});
  }
}

function closeAudioContext() {
  if (!state.audioContext || state.audioContext.state === "closed") {
    return;
  }

  state.audioContext.close().catch(() => {});
  state.audioContext = null;
}
