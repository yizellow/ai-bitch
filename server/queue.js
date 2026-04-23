let counter = 0;

export function createMessageId() {
  counter += 1;
  const timestamp = new Date()
    .toISOString()
    .replaceAll("-", "")
    .replaceAll(":", "")
    .replace(".", "");

  return `msg_${timestamp}_${String(counter).padStart(3, "0")}`;
}
