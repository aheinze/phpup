import type { ProjectSettings } from "../types";

export function shellEscape(value: string): string {
  return "'" + value.replace(/'/g, "'\\''") + "'";
}

export function defaultSettings(): ProjectSettings {
  return { host: "127.0.0.1", port: "8000", domain: "", docroot: ".", phpThreads: "auto", httpsMode: "off", workerMode: false, watchMode: false, compression: true, openBrowser: false, xdebug: false };
}

const fields = {
  HOST: "host", PORT: "port", DOMAIN: "domain", DOCROOT: "docroot",
  PHP_THREADS: "phpThreads", HTTPS_MODE: "httpsMode", WORKER_MODE: "workerMode",
  WATCH_MODE: "watchMode", COMPRESSION: "compression", OPEN_BROWSER: "openBrowser", XDEBUG: "xdebug",
} as const;
const booleans = new Set(["workerMode", "watchMode", "compression", "openBrowser", "xdebug"]);

export function parseSettings(content: string, defaults = defaultSettings()): ProjectSettings {
  const settings = { ...defaults };
  for (const line of content.split(/\r?\n/)) {
    const match = /^\s*([A-Z_]+)\s*=(.*)$/.exec(line);
    if (!match || !(match[1] in fields)) continue;
    const field = fields[match[1] as keyof typeof fields];
    let value = match[2].trim();
    if ((value.startsWith('"') && value.endsWith('"')) || (value.startsWith("'") && value.endsWith("'"))) value = value.slice(1, -1);
    if (booleans.has(field)) {
      if (!/^[01]$/.test(value)) throw new Error(`${match[1]} must be 0 or 1`);
      Object.assign(settings, { [field]: value === "1" });
    } else Object.assign(settings, { [field]: value });
  }
  return settings;
}

export function validateProjectSettings(settings: ProjectSettings): string[] {
  const errors: string[] = [];
  if (!/^\d+$/.test(settings.port) || Number(settings.port) < 1 || Number(settings.port) > 65535) errors.push("Port must be an integer from 1 to 65535");
  if (!/^(?:[a-zA-Z0-9][a-zA-Z0-9.-]*|::1)$/.test(settings.host)) errors.push("Enter a valid host or IP address");
  if (settings.domain && !/^[a-z0-9][a-z0-9.-]*\.[a-z]{2,}$/.test(settings.domain)) errors.push("Enter a valid lowercase domain, such as myapp.test");
  if (settings.phpThreads !== "auto" && (!/^\d+$/.test(settings.phpThreads) || Number(settings.phpThreads) < 1 || Number(settings.phpThreads) > 256)) errors.push("PHP threads must be auto or an integer from 1 to 256");
  if (!["off", "local", "on"].includes(settings.httpsMode)) errors.push("Invalid HTTPS mode");
  if (!settings.docroot || /[\x00-\x1f\x7f{}]/.test(settings.docroot)) errors.push("Enter a valid document root");
  if (settings.watchMode && !settings.workerMode) errors.push("Watch mode requires a compatible worker script and Worker Mode");
  for (const value of Object.values(settings)) {
    if (typeof value === "string" && /[\x00-\x1f\x7f]/.test(value)) { errors.push("Settings cannot contain control characters"); break; }
  }
  return errors;
}

export function serializeSettings(settings: ProjectSettings, existing = ""): string {
  const preserved = existing.split(/\r?\n/).filter(line => {
    const key = /^\s*([A-Z_]+)\s*=/.exec(line)?.[1];
    return line.trim() && (!key || !(key in fields));
  });
  return [...preserved, ...Object.entries(fields).map(([key, field]) => `${key}=${typeof settings[field] === "boolean" ? Number(settings[field]) : settings[field]}`), ""].join("\n");
}

export function projectUrl(settings: ProjectSettings, port = settings.port): string {
  const host = settings.domain || settings.host;
  return `${settings.httpsMode === "off" ? "http" : "https"}://${host.includes(":") ? `[${host}]` : host}:${port}`;
}

export function launchArgs(settings: ProjectSettings): string[] {
  return ["--host", settings.host, "--port", settings.port, ...(settings.domain ? ["--domain", settings.domain] : ["--no-domain"]),
    "--docroot", settings.docroot, "--php-threads", settings.phpThreads, "--https", settings.httpsMode,
    settings.workerMode ? "--worker" : "--no-worker", settings.watchMode ? "--watch" : "--no-watch",
    settings.compression ? "--compression" : "--no-compression", settings.openBrowser ? "--open" : "--no-open",
    settings.xdebug ? "--xdebug" : "--no-xdebug"];
}

// A sibling temporary file keeps Caddy imports relative to the original file.
export function validationCommand(path: string, content: string, settings: ProjectSettings, projectPath: string): string {
  const root = settings.docroot.startsWith("/") ? settings.docroot : `${projectPath}/${settings.docroot}`;
  const host = settings.domain || (settings.host === "::1" ? "[::1]" : settings.host);
  const env = { HOST: host, PORT: settings.port, DOCROOT: root, SERVER_NAME: `${host}:${settings.port}`, SERVER_ROOT: root, DOCUMENT_ROOT: root, PROTOCOL: settings.httpsMode === "off" ? "http" : "https", PHP_THREADS: settings.phpThreads, MAX_WAIT_TIME: "30s", PHPUP_DIR: `${projectPath}/.phpup` };
  return `cd ${shellEscape(projectPath)} && tmp=$(mktemp ${shellEscape(path + ".validate.XXXXXX")}) && trap 'rm -f "$tmp"' EXIT && printf '%s' ${shellEscape(content)} > "$tmp" && worker=${shellEscape(root + "/index.php")} && { [ ! -f ${shellEscape(root + "/app.php")} ] || worker=${shellEscape(root + "/app.php")}; } && scan_env=() && if [ -f ${shellEscape(projectPath + "/.phpup/php.ini")} ]; then scan="\${PHP_INI_SCAN_DIR-}"; if [ "\${PHP_INI_SCAN_DIR+x}" = x ] && [ -z "$scan" ]; then scan=${shellEscape(projectPath + "/.phpup")}; else scan="$scan:"${shellEscape(projectPath + "/.phpup")}; fi; scan_env=("PHP_INI_SCAN_DIR=$scan"); fi && env ${Object.entries(env).map(([k, v]) => `${k}=${shellEscape(v)}`).join(" ")} WORKER_FILE="$worker" "\${scan_env[@]}" frankenphp validate --adapter caddyfile --config "$tmp" 2>&1`;
}

export function atomicWriteCommand(path: string, content: string): string {
  return `tmp=$(mktemp ${shellEscape(path + ".XXXXXX")}) && trap 'rm -f "$tmp"' EXIT && printf '%s' ${shellEscape(content)} > "$tmp" && chmod 600 "$tmp" && mv -f "$tmp" ${shellEscape(path)}`;
}
