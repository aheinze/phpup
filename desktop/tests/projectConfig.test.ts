import { describe, expect, test } from "bun:test";
import { mkdtemp, readdir, rm, writeFile } from "node:fs/promises";
import { tmpdir } from "node:os";
import { join } from "node:path";
import { defaultSettings, launchArgs, parseSettings, projectUrl, serializeSettings, validateProjectSettings, validationCommand, atomicWriteCommand } from "../src/lib/projectConfig";

describe("project configuration contract", () => {
  test("empty fields and fresh projects cannot inherit another project's settings", () => {
    const a = parseSettings('DOMAIN=a.test\nHTTPS_MODE=local\nWORKER_MODE=1');
    const b = parseSettings('DOMAIN=""\nPORT=9000');
    expect(a.domain).toBe("a.test");
    expect(b).toEqual({ ...defaultSettings(), port: "9000" });
    expect(parseSettings('DOCROOT="/home/me/My PHP Project"').docroot).toBe("/home/me/My PHP Project");
  });
  test("false settings explicitly override saved CLI flags", () => {
    expect(launchArgs(defaultSettings())).toContain("--no-worker");
    expect(launchArgs(defaultSettings())).toContain("--no-domain");
    expect(launchArgs(defaultSettings())).toContain("--no-watch");
    expect(launchArgs(defaultSettings())).toContain("--no-xdebug");
  });
  test("invalid numeric prefixes and config line injection are rejected", () => {
    for (const port of ["8000abc", "0", "65536", "8.5"]) expect(validateProjectSettings({ ...defaultSettings(), port }).length).toBeGreaterThan(0);
    expect(validateProjectSettings({ ...defaultSettings(), docroot: "public\nHOST=evil" }).length).toBeGreaterThan(0);
    expect(validateProjectSettings({ ...defaultSettings(), watchMode: true }).length).toBeGreaterThan(0);
    expect(() => parseSettings("WORKER_MODE=maybe")).toThrow();
  });
  test("saving preserves settings that the desktop does not edit", () => {
    const serialized = serializeSettings({ ...defaultSettings(), domain: "" }, "MAX_WAIT_TIME=60s\nDOMAIN=old.test\n");
    expect(serialized).toContain("MAX_WAIT_TIME=60s");
    expect(parseSettings(serialized).domain).toBe("");
  });
  test("domain and IPv6 URLs retain the actual port", () => {
    expect(projectUrl({ ...defaultSettings(), domain: "app.test", httpsMode: "local" }, "8443")).toBe("https://app.test:8443");
    expect(projectUrl({ ...defaultSettings(), host: "::1" })).toBe("http://[::1]:8000");
  });
});

test("Caddy validation preserves failures and cleans its temporary file", async () => {
  const root = await mkdtemp(join(tmpdir(), "phpup-caddy-test-"));
  try {
    const path = join(root, "Caddyfile");
    await writeFile(path, "original");
    const result = Bun.spawn(["bash", "-c", validationCommand(path, "{ invalid_directive }", defaultSettings(), root)], { stdout: "pipe", stderr: "pipe" });
    expect(await result.exited).not.toBe(0);
    expect(await Bun.file(path).text()).toBe("original");
    expect(await readdir(root)).toEqual(["Caddyfile"]);
  } finally { await rm(root, { recursive: true, force: true }); }
});

test("atomic writes handle apostrophes and literal shell syntax", async () => {
  const root = await mkdtemp(join(tmpdir(), "phpup-write-test-"));
  try {
    const path = join(root, "Developer's config");
    const content = "literal $(touch SHOULD_NOT_EXIST) `id` $HOME\n";
    const child = Bun.spawn(["bash", "-c", atomicWriteCommand(path, content)], { cwd: root, stdout: "pipe", stderr: "pipe" });
    expect(await child.exited).toBe(0);
    expect(await Bun.file(path).text()).toBe(content);
    expect(await readdir(root)).toEqual(["Developer's config"]);
  } finally { await rm(root, { recursive: true, force: true }); }
});
