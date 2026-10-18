# phpup desktop

A Vue 3 / TypeScript frontend in Tauri 2. The Linux desktop runs the bundled `../phpup` CLI through Bash; an installed `phpup` is a fallback when the resource is unavailable.

## Requirements

- Bun for frontend dependencies and commands.
- Rust/Cargo and native [Tauri prerequisites](https://v2.tauri.app/start/prerequisites/).
- Bash, FrankenPHP and curl for managing PHP servers.

On Fedora, Tauri requires the WebKitGTK 4.1 and GTK 3 development packages, a C/C++ build toolchain, OpenSSL development headers and librsvg. For example:

```bash
sudo dnf install gcc gcc-c++ make pkgconf-pkg-config openssl-devel \
  webkit2gtk4.1-devel gtk3-devel librsvg2-devel
```

The native checks used in this repository expect `pkg-config --modversion webkit2gtk-4.1 libsoup-3.0` to succeed. Authentication for hosts/certificate setup may require a desktop PolicyKit agent. Linux is the currently verified platform.

## Run and build

From this directory:

```bash
bun install --frozen-lockfile
bun run tauri dev
```

`bun run dev` alone serves the frontend; shell, dialogs and server management require the Tauri host.

```bash
bun test
bun run build
cargo check --locked --manifest-path src-tauri/Cargo.toml
bun run tauri build --no-bundle  # Native binary without installer packaging
bun run tauri build            # Distribution bundles; needs packaging tools
```

Rebuild the desktop after changing `../phpup` so the bundled CLI and frontend use the same lifecycle protocol.

## Behavior and state

- Projects/groups are saved atomically to `~/.config/phpup-desktop/projects.json`. Set `PHPUP_DESKTOP_CONFIG_DIR` before launching to use a separate state directory (used by native tests).
- Diagnostics runs the bundled `phpup doctor --json` against saved settings. Errors include suggested fixes; warnings and passed checks remain distinguishable. Refresh is explicit, and switching projects discards stale results.
- Each project loads `.phpup/config` independently. Starting another project from the sidebar does not reuse the selected project's settings.
- `Starting` becomes `Running` only after `[phpup:ready] <URL>` or a matching record from `phpup --list --json`. The actual URL includes an automatically selected port.
- Stop targets the project's managed server. Tools → Stop All targets only servers managed by phpup.
- Errors remain visible until dismissed. Server output is retained per project during the desktop session, with a 1,000-line limit.
- Settings and Caddyfiles use atomic writes. Invalid Caddyfiles are not saved; validation runs with a sibling temporary file so relative imports keep working.
- A failed stop prevents Stop All & Close from closing the app. Close Without Stopping is explicit.
- The webview uses a content security policy permitting packaged scripts and local IPC, following [Tauri's CSP guidance](https://v2.tauri.app/security/csp/).

The current shell bridge is privileged application code; project PHP scripts, Composer scripts and custom Caddyfiles execute with your user permissions. Only open projects you intend to run.

See the [CLI README](../README.md) for generated defaults and migration of older `.phpup/Caddyfile` configurations.

## Everyday workflow

- The desktop reopens the last selected project and remembers the sidebar width. It reconnects to managed server status without automatically starting projects.
- **Start / Stop** is labeled in the project header. **Restart** reloads saved settings after a confirmed stop; invalid settings or a failed stop leave the working server intact. Stop cancels a restart that is still pending.
- **Find project** is always visible and searches names and paths. Matching projects appear even inside collapsed groups. Enter selects the first match; Down moves focus into results; Escape clears the filter. Double-click a project name or press F2 to rename it.
- Running projects show their actual URL with **Open in browser** and **Copy URL**, including automatically assigned ports. A guessed URL is never opened while startup is pending.
- **Logs** appears above diagnostics. Search text, show only errors and warnings, pause **Following**, or scroll up to read earlier messages. Copy copies the visible entries in their original form, preserving diagnostic fields. Clear affects the captured buffer, not files on disk.
- Launches from the desktop stream FrankenPHP output and the default `.phpup/php_errors.log`. Up to 80 recent lines per file are read initially; each project's captured buffer is capped at 1,000 entries. Custom PHP error-log destinations are not followed. Captured logs last for this desktop session; restart a server left running by another window to capture its output here.

| Shortcut | Action |
| --- | --- |
| Ctrl/⌘ K | Focus project search |
| Ctrl/⌘ Enter | Start or stop the selected project |
| Ctrl/⌘ Shift R | Restart the selected running project |
| Ctrl/⌘ S | Save the current settings or Caddyfile editor |

Server shortcuts are disabled while typing in fields, editing configuration, or using confirmation dialogs. The sidebar resize separator also accepts Left/Right arrow keys.

## Native UI regression tests

The Linux suite drives the actual Tauri app through WebKit WebDriver and Xvfb. It verifies diagnostics refresh, project isolation, keyboard search across collapsed groups, workspace restoration, live PHP logs, restart shortcuts, two simultaneous servers with automatic port selection, retained launch errors and Stop All & Close. State and runtime registries are isolated from your projects.

```bash
cargo install tauri-driver --version 2.1.0 --locked
# Install WebKitWebDriver and xvfb-run with your distribution package manager.
bun run tauri build --debug --no-bundle --ci
cd ..
python3 tests/test_desktop.py
```

Set `PHPUP_TEST_ARTIFACT_DIR` to retain screenshots. Missing native prerequisites skip the suite. See the [Tauri WebDriver documentation](https://v2.tauri.app/develop/tests/webdriver/).
