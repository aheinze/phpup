# phpup

A local PHP development server powered by FrankenPHP, with a Bash CLI and a Vue/Tauri desktop app.

## Quick start

The CLI needs Bash, FrankenPHP and curl in your `PATH`. It uses `ss`, `lsof`, `nc`, or Bash TCP probing to find a free port.

```bash
# From this repository: install the CLI system-wide.
sudo ./phpup --install

# From a PHP project:
phpup --init
phpup --open
```

`--install` also runs the official FrankenPHP installer when FrankenPHP is missing. That installer may install distribution packages rather than a standalone binary. For manual installation, see the [FrankenPHP instructions](https://frankenphp.dev/docs/install/).

Without a saved document root, phpup checks `public`, `web`, `www`, then the current directory. Generated servers bind to `127.0.0.1` by default. Use `--host 0.0.0.0` explicitly when you want network access.

## Configuration that applies on restart

```bash
phpup --init --port 9000 --docroot public
phpup --php-threads 8 --no-compression --save
phpup --dry-run --verbose
```

`--init` creates:

- `.phpup/config`: literal `KEY=value` settings, overridden by command-line flags.
- `.phpup/php.ini`: project PHP settings, loaded in addition to system PHP configuration.
- `.phpup/Caddyfile.classic` and `.phpup/Caddyfile.worker`: examples for custom configuration.
- `.phpup/sessions`: local PHP session storage.

Normal launches generate a fresh, private `.phpup/runtime/Caddyfile.*` from the current settings. This file is removed on exit. Editing `.phpup/php.ini`, changing ports, compression or thread settings takes effect on the next launch. `--init --force` replaces the generated examples, PHP settings and saved config; it does not replace a custom main Caddyfile.

`--dry-run` prints the launch plan without saving configuration, creating files, modifying hosts or installing certificates, even when combined with `--save` or `--init`.

Application environment values are loaded literally from `.phpup/.env`, followed by `--env-file FILE`. These files are not evaluated as shell scripts. phpup's resolved runtime variables take precedence over conflicting application values.

## Diagnose a project

```bash
phpup doctor              # Readable findings with suggested fixes
phpup doctor --json       # Structured report for tools and CI
```

`--doctor` is an alias. Diagnostics inspect saved settings, the document root, writable runtime storage, curl, the requested port, and the actual FrankenPHP PHP runtime with the project's PHP configuration. They also check Composer JSON, installed autoloaders, required extension names (including locked development dependencies), custom Caddyfile syntax, local hosts entries and mkcert certificates. Command-line setting overrides are supported.

The report does not install dependencies, start servers, execute Composer/application scripts, change project files, edit hosts, or install certificate trust. A private temporary INI suppresses PHP error-log writes during inspection and is removed on exit. Custom Caddyfiles are adapted without provisioning listeners or certificates. PHP/extension version constraints and browser trust are explicitly reported as unverified; a successful report is not an application test.

Exit codes: `0` means no blocking findings (warnings may remain), `1` means one or more errors, and `2` means invalid arguments. JSON schema version 1 includes `project`, `ok`, `summary` counts and `checks`; each check has a stable `id`, `status` (`pass`, `warning`, `error`), `title`, `message` and optional `fix` text. It works even when FrankenPHP is missing. Doctor cannot be combined with actions such as `--install`, `--save`, `--init` or `--stop`.

The desktop shows the same report in each project's **Diagnostics** panel, including unconfigured projects. Use **Check again** after external changes, expand passed checks for runtime details, or **Copy report** for troubleshooting.

## Server lifecycle

```bash
phpup --list                 # Servers managed by phpup for this user
phpup --list --json          # pid, canonical path, actual port, URL
phpup --stop                 # Stop servers for the current project
phpup --stop --all           # Stop all servers managed by phpup
phpup --stats                # Read-only view of FrankenPHP processes
```

A server is registered only after it starts and answers an HTTP readiness request. An application error response still counts as a live server, so PHP errors remain debuggable. Occupied ports are skipped, and the actual URL is reported. Startup errors return a nonzero exit code and retain diagnostics in `.phpup/runtime/validation.log` or `server-<pid>.log`.

Process records live under `${XDG_RUNTIME_DIR:-${TMPDIR:-/tmp}}/phpup-<uid>`. They include process start tokens so stale PID files do not target unrelated processes. Stop waits for shutdown and reports failures. Ctrl-C and TERM clean up the child server and registry entry. Independently started FrankenPHP processes are not stopped by phpup.

Use `--verbose` to stream server diagnostics and the default `.phpup/php_errors.log` when project PHP configuration exists. The stream includes up to 80 recent lines per file and follows log rotation; custom error-log paths are not followed. PHP errors are written to `.phpup/php_errors.log`; HTTP access logs are in `.phpup/access.log`.

## Worker mode and HTTPS

```bash
# Requires an application compatible with FrankenPHP's worker API.
phpup --worker --watch
phpup --worker --watch --watch-pattern '**/*.twig'

# Local domain and certificates (may request system authentication).
phpup --domain app.test --https local --port 8443
phpup --domain app.test --https local --no-hosts
```

Classic PHP mode is the default. `--watch` requires `--worker`; it does not convert a normal front controller into a worker. See the [FrankenPHP worker documentation](https://frankenphp.dev/docs/worker/).

`--https local` uses local certificates. With `--domain`, phpup uses mkcert and can manage a hosts entry; `--no-hosts` leaves name resolution to you. `--https on` delegates certificate handling to Caddy and requires suitable domain/network configuration.

Saved toggles can be disabled with `--no-worker`, `--no-watch`, `--no-xdebug`, `--no-domain`, `--no-compression` and `--no-open`. `--xdebug` requires a FrankenPHP build containing Xdebug.

## Custom Caddyfiles and existing projects

Custom Caddyfiles are validated before launch and never silently rewritten. Auto-detection checks, in order:

`.phpup/Caddyfile`, `Caddyfile.local`, `Caddyfile.dev`, `Caddyfile`, `caddy/Caddyfile`, `config/Caddyfile`, `.Caddyfile`.

You can also select a file with `--caddyfile FILE`. Custom directives control the actual listener, document root, PHP options and file access. To keep readiness checks and the desktop URL correct, use the resolved address, for example `{$PROTOCOL}://{$HOST}:{$PORT}`.

Available placeholders: `HOST`, `PORT`, `DOCROOT`, `SERVER_NAME`, `SERVER_ROOT`, `DOCUMENT_ROOT`, `PROTOCOL`, `PHP_THREADS`, `MAX_WAIT_TIME`, `WORKER_FILE`, `PHPUP_DIR`. Quote path placeholders when using them in a custom file.

**Migration:** older versions created a `.phpup/Caddyfile` that imports a generated mode file. That file is now treated as custom and still wins over generated runtime configuration. Review it and move it aside if you want the new generated defaults. Mode examples are no longer selected automatically; choose one explicitly with `--caddyfile` to customize it.

Generated configuration rejects dotfiles/directories (including `.env`, `.git` and `.phpup`) and common project metadata before routing. It serves static assets and supports a front controller in the root or a first-level subfolder, such as `/admin/index.php`. Custom Caddyfiles must define their own access restrictions. Development error output is enabled; this is a local development tool, not a production configuration.

## Desktop and development

See [desktop/README.md](desktop/README.md) for native prerequisites and build commands. The desktop bundles the matching CLI, keeps settings isolated by project, and preserves crash output when switching projects. Failed saves retain the editor contents; running settings require a restart. Daily controls include safe Restart, keyboard project search, remembered workspace state, actual running URLs, and searchable live logs. See the [desktop workflow and shortcuts](desktop/README.md#everyday-workflow).

```bash
./tests/run_tests.sh
python3 tests/test_runtime.py
python3 tests/test_doctor.py
python3 tests/test_hosts.py
cd desktop
bun install --frozen-lockfile
bun test
bun run build
cargo check --locked --manifest-path src-tauri/Cargo.toml
```

The runtime suite uses temporary projects and local servers, without editing hosts or installing a CA. See [tests/README.md](tests/README.md).

`phpup --build-php` is an interactive helper for custom FrankenPHP builds. It requires Git and Docker with buildx; follow its output for the generated binary location. Run `phpup --help` for the complete CLI reference.
