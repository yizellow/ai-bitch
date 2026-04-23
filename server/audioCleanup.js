import fs from "node:fs/promises";
import path from "node:path";

export async function cleanupAudioFiles(audioDir, options = {}) {
  const maxFiles = Number(options.maxFiles ?? process.env.AUDIO_MAX_FILES ?? 50);
  const maxAgeHours = Number(options.maxAgeHours ?? process.env.AUDIO_MAX_AGE_HOURS ?? 24);
  const maxAgeMs = maxAgeHours * 60 * 60 * 1000;
  const now = Date.now();
  const files = await getAudioFiles(audioDir);

  const expiredFiles = files.filter((file) => now - file.mtimeMs > maxAgeMs);
  const extraFiles = files
    .filter((file) => !expiredFiles.includes(file))
    .slice(maxFiles);

  const filesToDelete = [...expiredFiles, ...extraFiles];
  await deleteFiles(filesToDelete);

  return {
    deleted: filesToDelete.length,
    kept: files.length - filesToDelete.length
  };
}

export async function deleteAllAudioFiles(audioDir) {
  const files = await getAudioFiles(audioDir);
  await deleteFiles(files);

  return {
    deleted: files.length
  };
}

async function getAudioFiles(audioDir) {
  const entries = await fs.readdir(audioDir, { withFileTypes: true });
  const files = [];

  for (const entry of entries) {
    if (!entry.isFile() || path.extname(entry.name) !== ".mp3") {
      continue;
    }

    const filePath = path.join(audioDir, entry.name);
    const stats = await fs.stat(filePath);
    files.push({
      path: filePath,
      name: entry.name,
      mtimeMs: stats.mtimeMs
    });
  }

  return files.sort((a, b) => b.mtimeMs - a.mtimeMs);
}

async function deleteFiles(files) {
  await Promise.all(
    files.map((file) =>
      fs.unlink(file.path).catch((error) => {
        console.warn("[audio] Failed to delete file:", file.name, error.message);
      })
    )
  );
}
