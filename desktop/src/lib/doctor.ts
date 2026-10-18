export interface DoctorCheck {
  id: string;
  status: "pass" | "warning" | "error";
  title: string;
  message: string;
  fix: string | null;
}
export interface DoctorReport {
  schemaVersion: 1;
  project: string;
  ok: boolean;
  summary: { errors: number; warnings: number; passes: number };
  checks: DoctorCheck[];
}

// Validate at the process boundary; an old CLI or truncated response is not a clean bill of health.
export function parseDoctorReport(stdout: string, code: number | null, project: string): DoctorReport {
  const report = JSON.parse(stdout);
  if (!report || report.schemaVersion !== 1 || report.project !== project ||
      typeof report.ok !== "boolean" || !report.summary || !Array.isArray(report.checks) || !report.checks.length ||
      !report.checks.every((c: DoctorCheck) => c && typeof c.id === "string" && typeof c.title === "string" &&
        typeof c.message === "string" && ["pass", "warning", "error"].includes(c.status) && (c.fix === null || typeof c.fix === "string"))) {
    throw new Error("Invalid diagnostics response. Update or rebuild PHPUp and check again.");
  }
  const errors = report.checks.filter((c: DoctorCheck) => c.status === "error").length;
  const warnings = report.checks.filter((c: DoctorCheck) => c.status === "warning").length;
  const passes = report.checks.length - errors - warnings;
  if (new Set(report.checks.map((c: DoctorCheck) => c.id)).size !== report.checks.length ||
      report.summary.errors !== errors || report.summary.warnings !== warnings || report.summary.passes !== passes ||
      report.ok !== (errors === 0) || code !== (errors ? 1 : 0)) {
    throw new Error("Incomplete diagnostics response. Check again or run phpup doctor in a terminal.");
  }
  return report;
}
