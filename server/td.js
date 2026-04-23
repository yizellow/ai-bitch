import WebSocket from "ws";

let socket = null;
let isConnecting = false;

export function isTouchDesignerEnabled() {
  return process.env.ENABLE_TD === "true";
}

export function sendToTouchDesigner(payload) {
  if (!isTouchDesignerEnabled()) {
    return;
  }

  const message = JSON.stringify(payload);
  const ws = getSocket();

  if (!ws || ws.readyState !== WebSocket.OPEN) {
    console.warn("[td] WebSocket is not connected. Skipping message:", payload.id);
    return;
  }

  ws.send(message, (error) => {
    if (error) {
      console.warn("[td] Failed to send message:", error.message);
    }
  });
}

function getSocket() {
  if (socket && socket.readyState === WebSocket.OPEN) {
    return socket;
  }

  if (!isConnecting) {
    connect();
  }

  return socket;
}

function connect() {
  const url = process.env.TD_WS_URL || "ws://127.0.0.1:9980";
  isConnecting = true;
  socket = new WebSocket(url);

  socket.on("open", () => {
    isConnecting = false;
    console.log("[td] Connected:", url);
  });

  socket.on("close", () => {
    isConnecting = false;
    socket = null;
    console.warn("[td] WebSocket closed.");
  });

  socket.on("error", (error) => {
    isConnecting = false;
    console.warn("[td] WebSocket error:", error.message);
  });
}
