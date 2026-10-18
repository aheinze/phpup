export type LogLevel = "info" | "warning" | "error";
export interface LogEntry { raw: string; message: string; level: LogLevel; }

export function logEntries(chunks: string[]): LogEntry[] {
  let previousLevel: LogLevel = "info";
  return chunks.join("").split(/\r?\n/).filter(Boolean).map(raw => {
    const clean = raw.replace(/\x1b\[[0-9;]*[a-zA-Z]/g, "");
    let message = clean;
    let level: LogLevel = /\b(error|fatal|exception|failed|panic)\b/i.test(clean) ? "error"
      : /\b(warn|warning|deprecated)\b/i.test(clean) ? "warning"
      : /^(\s|#\d|Stack trace:)/.test(clean) ? previousLevel : "info";
    try {
      const data = JSON.parse(clean);
      if (data && typeof data.msg === "string") {
        level = ["error", "fatal", "panic"].includes(data.level) ? "error" : data.level === "warn" ? "warning" : "info";
        message = data.msg;
        for (const key of ["error", "err", "file", "line", "status"]) {
          if (data[key] !== undefined) message += ` · ${key}: ${typeof data[key] === "string" ? data[key] : JSON.stringify(data[key])}`;
        }
      }
    } catch { /* PHP and shell output remain plain text. */ }
    previousLevel = level;
    return { raw, message, level };
  });
}

export function filterLogs(entries: LogEntry[], query: string, issuesOnly: boolean) {
  const needle = query.trim().toLowerCase();
  return entries.filter(entry => (!issuesOnly || entry.level !== "info") && (!needle || entry.raw.toLowerCase().includes(needle)));
}
