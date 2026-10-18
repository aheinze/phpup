import { expect, test } from "bun:test";
import { parseDoctorReport } from "../src/lib/doctor";

const report = { schemaVersion: 1, project: "/tmp/site", ok: false, summary: { errors: 1, warnings: 0, passes: 0 },
  checks: [{ id: "runtime", status: "error", title: "FrankenPHP", message: "Missing", fix: "Install FrankenPHP" }] };

test("diagnostics accepts a complete report even when CLI exits with findings", () => {
  expect(parseDoctorReport(JSON.stringify(report), 1, "/tmp/site").checks[0].fix).toBe("Install FrankenPHP");
});
test("diagnostics rejects stale project results, broken contracts and CLI crashes", () => {
  for (const value of [null, {}, { ...report, schemaVersion: 2 }, { ...report, ok: true }, { ...report, checks: [] },
    { ...report, summary: { ...report.summary, errors: 0 } }, { ...report, checks: [{ ...report.checks[0], status: "unknown" }] }]) {
    expect(() => parseDoctorReport(JSON.stringify(value), 1, "/tmp/site")).toThrow();
  }
  expect(() => parseDoctorReport(JSON.stringify(report), 1, "/tmp/other")).toThrow();
  expect(() => parseDoctorReport(JSON.stringify(report), null, "/tmp/site")).toThrow();
  expect(() => parseDoctorReport(JSON.stringify(report), 0, "/tmp/site")).toThrow();
});
