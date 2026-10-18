# phpup tests

Run from the repository root:

```bash
bash -n phpup
./tests/run_tests.sh
./tests/run_tests.sh tests/test_args.sh tests/test_init.sh
python3 tests/test_runtime.py
python3 tests/test_doctor.py
python3 tests/test_hosts.py
(cd desktop && bun test && bun run build)
cargo check --locked --manifest-path desktop/src-tauri/Cargo.toml
```

The shell suite covers argument validation, configuration round trips, initialization, document roots and management commands. It requires Bash and FrankenPHP for dry-run paths. Each test file runs in an isolated temporary directory and runtime registry. Capture failures with `status=0; output=$(command) || status=$?`; do not use `|| true` before checking `$?`.

The Python standard-library suite requires FrankenPHP and curl. It launches real servers on local ports and verifies HTTP file protections, loopback binding, classic and worker routing, project PHP settings, port conflicts, custom configuration, IPv6, stale PID records, scoped shutdown, live PHP warning output and log-follower cleanup. Fixtures, processes and XDG directories are cleaned up. It does not modify hosts, install certificates or stop existing servers. Missing runtime dependencies skip the suite; skips do not establish runtime coverage.

Desktop tests use Bun. Pure configuration tests exercise quoting, validation and atomic writes through a real shell. Store tests mock the Tauri bridge to reproduce cross-project settings, readiness, crash retention and write failures. The diagnostics contract tests also reject stale project reports, malformed responses and inconsistent exit codes.

The doctor suite asserts the JSON contract, missing runtime behavior, malformed saved configuration, project PHP configuration, startup warnings without log writes, Composer/lockfile requirements, custom Caddyfile adaptation without provisioning, busy ports and TLS errors. It snapshots project files to detect unintended writes. The hosts suite calls the real hosts helper on a temporary file, verifying alias detection and ownership cleanup.

With `mkcert` and `openssl` on PATH, the runtime suite also generates a temporary CA and verifies real HTTPS with curl, including rejection without the explicit CA. It never installs that CA into system/browser trust. Browser trust and authentication dialogs still need an interactive check on each target desktop.

For native UI coverage, install `tauri-driver` 2.1.0, WebKitWebDriver and Xvfb, then run:

```bash
(cd desktop && bun run tauri build --debug --no-bundle --ci)
PHPUP_TEST_ARTIFACT_DIR=/tmp/phpup-desktop-qa python3 tests/test_desktop.py
```

The app uses a temporary `PHPUP_DESKTOP_CONFIG_DIR` and isolated XDG directories. Screenshots are optional; application and server processes are cleaned up. The suite tests the packaged frontend and real shell bridge, not a browser-only mock.

Daily-use regressions cover restart sequencing, failure and cancellation; no browser launch before readiness; saved workspace defaults; log severity/context filtering; and native keyboard search through collapsed groups. Native tests also reopen the app to verify workspace restoration and exercise restart shortcuts and live PHP log filtering at the minimum window width.
