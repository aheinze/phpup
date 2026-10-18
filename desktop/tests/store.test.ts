import { beforeEach, expect, mock, test } from "bun:test";
import { defaultSettings } from "../src/lib/projectConfig";
import type { Project } from "../src/types";

const configs = new Map<string, string>();
const spawned: Array<{ command: string; events: Record<string, (data: any) => void> }> = [];
const executed: string[] = [];
let failWrites = false;
let failValidation = false;
let failStop = false;
let failPreflight = false;
let stopGate: Promise<void> | null = null;
let closeOnStop = false;
let configGate: Promise<void> | null = null;
let managed: unknown[] = [];
let selectedUrl = "";
mock.module("@tauri-apps/plugin-shell", () => ({ Command: { create: (_name: string, args: string[]) => {
  const command = args[1];
  const events: Record<string, (data: any) => void> = {};
  return {
    stdout: { on: (_event: string, cb: (data: string) => void) => { events.stdout = cb; } },
    stderr: { on: (_event: string, cb: (data: string) => void) => { events.stderr = cb; } },
    on: (event: string, cb: (data: any) => void) => { events[event] = cb; },
    spawn: async () => { spawned.push({ command, events }); return { pid: 424242, kill: async () => {} }; },
    execute: async () => {
      executed.push(command);
      if (command.includes("--dry-run") && failPreflight) return { code: 2, stdout: "", stderr: "Document root does not exist" };
      if (command.includes("frankenphp validate") && failValidation) return { code: 1, stdout: "invalid Caddyfile", stderr: "" };
      if (command.includes("--stop")) {
        if (stopGate) await stopGate;
        if (failStop) return { code: 1, stdout: "", stderr: "Permission denied" };
        if (closeOnStop) { spawned.at(-1)?.events.close({ code: 0 }); managed = []; }
      }
      if (command.includes("--list --json")) return { code: 0, stdout: JSON.stringify(managed), stderr: "" };
      if (command.includes("for d in")) return { code: 0, stdout: "public", stderr: "" };
      if (command.includes("if [ -f") && command.includes("/config")) {
        if (configGate) await configGate;
        for (const [path, content] of configs) if (command.includes(path + "/.phpup/config")) return { code: 0, stdout: content, stderr: "" };
        return { code: 44, stdout: "", stderr: "" };
      }
      if (command.includes("mktemp") && failWrites) return { code: 1, stdout: "", stderr: "Permission denied" };
      return { code: 0, stdout: "", stderr: "" };
    },
  };
} } }));
mock.module("@tauri-apps/plugin-dialog", () => ({ open: async () => null }));
mock.module("@tauri-apps/plugin-opener", () => ({ openUrl: async (url: string) => { selectedUrl = url; } }));
mock.module("@tauri-apps/api/path", () => ({ resolveResource: async () => "/bundle/phpup" }));
const { getStore } = await import("../src/composables/useStore");
const store = getStore();
function project(id: string): Project { return { id, name: id, path: `/tmp/${id}`, port: "8000", docroot: "public", hasConfig: true, isRunning: false, status: "stopped" }; }
beforeEach(() => {
  spawned.splice(0); executed.splice(0); configs.clear(); failWrites = false; failValidation = false; failStop = false; configGate = null; managed = []; selectedUrl = "";
  store.projects.value = []; store.selectedProject.value = null;
  store.settings.value = defaultSettings(); store.showSettings.value = false; store.notifications.value = [];
  store.phpupReady.value = true; stopGate = null; closeOnStop = false; failPreflight = false; store.showCaddyfile.value = false;
});

test("sidebar launch uses target settings, rejects duplicate starts, and waits for readiness", async () => {
  const a = project("a"), b = project("b");
  configs.set(a.path, "DOMAIN=a.test\nHTTPS_MODE=local\nWORKER_MODE=1");
  configs.set(b.path, "DOMAIN=\nHTTPS_MODE=off\nWORKER_MODE=0\nPORT=9010");
  store.projects.value = [a, b];
  await store.selectProject(a);
  await store.startProject(b);
  expect(spawned[0].command).not.toContain("a.test");
  expect(spawned[0].command).toContain("'--no-worker'");
  expect(b.status).toBe("starting"); expect(b.isRunning).toBe(false);
  await store.startProject(b);
  expect(spawned.length).toBe(1);
  spawned[0].events.stdout("still running some setup");
  expect(b.status).toBe("starting");
  spawned[0].events.stdout("[phpup:ready] http://127.0.0.1:9011");
  expect(b.status).toBe("running"); expect(b.port).toBe("9011");
  spawned[0].events.close({ code: 1 });
  await store.selectProject(b);
  expect(store.projectOutput.value.join("")).toContain("Server failed");
});

test("switching to an unconfigured project resets domain and worker settings", async () => {
  const a = project("reset-a"), b = project("reset-b");
  configs.set(a.path, "DOMAIN=a.test\nWORKER_MODE=1");
  await store.selectProject(a); await store.selectProject(b);
  expect(store.settings.value.domain).toBe("");
  expect(store.settings.value.workerMode).toBe(false);
});

test("failed settings saves retain the draft and editor", async () => {
  const a = project("save-a"); configs.set(a.path, "PORT=8000");
  await store.selectProject(a); store.showSettings.value = true;
  store.settings.value.port = "9000"; failWrites = true;
  expect(await store.saveSettings()).toBe(false);
  expect(store.showSettings.value).toBe(true);
  expect(a.port).toBe("8000"); expect(store.settings.value.port).toBe("9000");
});

test("status matching requires the complete project path", async () => {
  const a = project("work/site"), b = project("other/work/site");
  store.projects.value = [a, b];
  managed = [{ pid: "123", path: b.path, port: "9000", url: "http://127.0.0.1:9000" }];
  await store.refreshAllStatuses();
  expect(a.isRunning).toBe(false); expect(b.isRunning).toBe(true);
  await store.openInBrowser(b); expect(selectedUrl).toBe("http://127.0.0.1:9000");
});

test("an invalid Caddyfile never reaches the save command", async () => {
  const a = project("caddy-invalid"); await store.selectProject(a);
  store.selectedCaddyfile.value = "Caddyfile";
  store.caddyfileContent.value = "invalid draft"; store.showCaddyfile.value = true;
  failValidation = true;
  expect(await store.saveCaddyfile()).toBe(false);
  expect(store.caddyfileContent.value).toBe("invalid draft");
  expect(store.showCaddyfile.value).toBe(true);
  expect(executed.some(command => command.includes("mv -f") && command.includes(".phpup/Caddyfile"))).toBe(false);
});

test("validation and save use the same snapshot while the editor changes", async () => {
  const a = project("caddy-snapshot"); await store.selectProject(a);
  store.selectedCaddyfile.value = "Caddyfile";
  store.caddyfileContent.value = "original draft"; store.showCaddyfile.value = true;
  const save = store.saveCaddyfile();
  store.caddyfileContent.value = "new draft";
  expect(await save).toBe(true);
  expect(executed.find(command => command.includes("frankenphp validate"))).toContain("original draft");
  expect(executed.find(command => command.includes("mv -f") && command.includes(".phpup/Caddyfile"))).toContain("original draft");
  expect(store.caddyfileContent.value).toBe("new draft");
  expect(store.showCaddyfile.value).toBe(true);
});

test("failed stops keep the project tracked and prevent removal", async () => {
  const a = project("stop-failure"); a.isRunning = true; a.status = "running";
  store.projects.value = [a];
  managed = [{ pid: "123", path: a.path, port: "8000", url: "http://127.0.0.1:8000" }];
  failStop = true;
  expect(await store.stopProject(a)).toBe(false);
  expect(a.status).toBe("running");
  await store.removeProject(a);
  expect(store.projects.value.length).toBe(1);
  expect(store.notifications.value.some(n => n.message.includes("Permission denied"))).toBe(true);
});

test("stopping during configuration loading cancels the pending spawn", async () => {
  const a = project("cancel-start"); store.projects.value = [a];
  let release!: () => void;
  configGate = new Promise<void>(resolve => { release = resolve; });
  const start = store.startProject(a);
  const stop = store.stopProject(a);
  release();
  await start;
  expect(await stop).toBe(true);
  expect(spawned.length).toBe(0);
  expect(a.status).toBe("stopped");
});


test("restart waits for shutdown, uses fresh settings, and ignores repeated clicks", async () => {
  const a = project("restart-success"); store.projects.value = [a]; configs.set(a.path, "PORT=8000");
  await store.startProject(a); spawned[0].events.stdout("[phpup:ready] http://127.0.0.1:8000");
  configs.set(a.path, "PORT=9123"); closeOnStop = true;
  let release!: () => void;
  stopGate = new Promise(resolve => { release = resolve; });
  const restart = store.restartProject(a);
  await new Promise(resolve => setTimeout(resolve, 0));
  await store.restartProject(a);
  expect(spawned.length).toBe(1);
  expect(a.status).toBe("stopping");
  release(); await restart;
  expect(spawned.length).toBe(2);
  expect(spawned[1].command).toContain("'9123'");
  expect(spawned[1].command).toContain("'--verbose'");
  expect(a.status).toBe("starting");
  expect(store.restartingProjects.value.has(a.id)).toBe(false);
  spawned[1].events.close({ code: 0 });
});

test("restart preserves the running server when saved settings are invalid", async () => {
  const a = project("restart-invalid"); a.isRunning = true; a.status = "running";
  configs.set(a.path, "PORT=invalid");
  await store.restartProject(a);
  expect(executed.some(c => c.includes("--stop"))).toBe(false);
  expect(spawned.length).toBe(0);
  expect(a.status).toBe("running");
});

test("a failed stop aborts restart", async () => {
  const a = project("restart-stop-failure"); store.projects.value = [a];
  a.isRunning = true; a.status = "running"; failStop = true;
  managed = [{ pid: "123", path: a.path, port: "8000", url: "http://127.0.0.1:8000" }];
  await store.restartProject(a);
  expect(a.status).toBe("running"); expect(spawned.length).toBe(0);
});

test("an explicit stop cancels an in-flight restart", async () => {
  const a = project("cancel-restart"); store.projects.value = [a];
  await store.startProject(a); spawned[0].events.stdout("[phpup:ready] http://127.0.0.1:8000");
  let release!: () => void;
  configGate = new Promise(resolve => { release = resolve; }); closeOnStop = true;
  const restart = store.restartProject(a);
  expect(await store.stopProject(a)).toBe(true);
  release(); await restart;
  expect(spawned.length).toBe(1); expect(a.status).toBe("stopped");
});

test("browser actions never open a guessed URL before readiness", async () => {
  const a = project("url-not-ready"); a.status = "starting";
  await store.openInBrowser(a);
  expect(selectedUrl).toBe("");
});


test("a failed CLI preflight preserves the running server", async () => {
  const a = project("restart-missing-root"); a.isRunning = true; a.status = "running";
  failPreflight = true;
  await store.restartProject(a);
  expect(executed.some(c => c.includes("--stop"))).toBe(false);
  expect(a.status).toBe("running"); expect(spawned.length).toBe(0);
  expect(store.notifications.value.some(n => n.message.includes("Document root does not exist"))).toBe(true);
});
