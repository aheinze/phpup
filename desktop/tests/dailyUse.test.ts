import { expect, test } from "bun:test";
import { readWorkspaceState } from "../src/lib/workspace";
import { logEntries, filterLogs } from "../src/lib/logs";

test("workspace state tolerates old files and clamps invalid dimensions", () => {
  expect(readWorkspaceState(undefined)).toEqual({ selectedProjectId: null, sidebarWidth: 220 });
  expect(readWorkspaceState({ selectedProjectId: "site", sidebarWidth: 900 }).sidebarWidth).toBe(400);
  expect(readWorkspaceState({ selectedProjectId: 12, sidebarWidth: Number.NaN })).toEqual({ selectedProjectId: null, sidebarWidth: 220 });
  expect(readWorkspaceState({ sidebarWidth: -30 }).sidebarWidth).toBe(160);
});

test("logs preserve raw diagnostic data, format JSON, and retain exception context", () => {
  const raw = JSON.stringify({ level: "error", msg: "PHP failed", file: "/tmp/a.php", line: 4 });
  const entries = logEntries([raw + "\n", "Stack trace:\n#0 /tmp/a.php\n", "PHP Warning: test warning\n", "ordinary message\n"]);
  expect(entries[0].raw).toBe(raw);
  expect(entries[0].message).toBe("PHP failed · file: /tmp/a.php · line: 4");
  expect(filterLogs(entries, "", true).map(e => e.level)).toEqual(["error", "error", "error", "warning"]);
  expect(filterLogs(entries, " /TMP/A.PHP ", true)).toHaveLength(2);
  expect(filterLogs(entries, "not found", false)).toHaveLength(0);
});
