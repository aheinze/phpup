**phpup** — Advanced FrankenPHP based dev server helper

PHPUP is a Bash tool to start FrankenPHP with extensive configuration options. It supports both classic and worker modes, auto-discovers free ports, enables file watching for auto-reload, HTTPS support, performance tuning, and much more.

Quick start

**Option 1: Auto-install (recommended)**
```bash
sudo ./phpup --install
```
This installs both `phpup` and `frankenphp` to `/usr/local/bin/` for system-wide use.

**Option 2: Manual setup**
- Ensure `frankenphp` is installed and in your `PATH`.
- Run: `./phpup`
- The script prints the chosen port and document root and starts the server.

Options

Basic Options:
- `--host HOST` — Host to bind (default: `127.0.0.1`, supports custom domains like `website.local`)
- `--port PORT` — Port to use (default: `8000` or `PORT` env)
- `--caddyfile FILE` — Path to a custom Caddyfile (default: auto-detect common names)
- `--docroot DIR` — Document root (default: `./public`, `./web`, or `.`)

PHP Configuration:
- `--php-threads NUM` — Number of PHP threads (default: `auto`, can be number)
- `--max-wait TIME` — Max time to wait for free thread (default: `30s`)

Advanced Features:
- `--worker` — Enable worker mode (experimental)
- `--watch` — Enable file watcher for auto-reload during development
- `--watch-pattern PAT` — Additional watch patterns (can use multiple times)
- `--https MODE` — HTTPS mode: `off`, `local`, or `on` (default: `off`)
- `--compression` — Enable HTTP compression (default: on)
- `--no-compression` — Disable HTTP compression
- `--open`, `-o` — Open browser automatically after server starts

Development & Debug:
- `--verbose`, `-v` — Verbose output and show FrankenPHP debug output
- `--env-file FILE` — Load environment variables from file
  - Also auto-loads `.phpup/.env` if it exists

Other Options:
- `--init` — Generate .phpup/ configuration files and exit
- `--install` — Install phpup and auto-install FrankenPHP to /usr/local/bin/ for system-wide use
- `--build-php` — Interactive helper to build custom FrankenPHP with additional extensions
- `--tui` — Launch the interactive curses-based frontend
- `--list` — List running FrankenPHP instances for the current user
- `--dry-run` — Print the resolved command and exit
- `--quiet` — Reduce output
- `--` — Pass remaining arguments to FrankenPHP

Custom Caddyfile

If a custom Caddyfile is present, it is used as-is. You can reference these environment variables inside the Caddyfile using Caddy's env placeholders: `{$HOST}`, `{$PORT}`, `{$DOCROOT}`. The script exports them before launching FrankenPHP.

Auto-detect order for Caddyfile:

`./.phpup/Caddyfile`, `./Caddyfile.local`, `./Caddyfile.dev`, `./Caddyfile`, `./caddy/Caddyfile`, `./config/Caddyfile`, `./.Caddyfile`.

Environment variables for Caddyfile

- `SERVER_NAME` — set to `HOST:PORT` (e.g., `127.0.0.1:8000`)
- `SERVER_ROOT` — set to the resolved document root
- `HOST`, `PORT`, `DOCROOT` — also exported for compatibility
- `DOCUMENT_ROOT` — alias to `DOCROOT`
- `PROTOCOL` — set to `http` or `https` based on mode
- `PHP_THREADS` — number of PHP threads
- `MAX_WAIT_TIME` — max wait time for free threads
- `WORKER_FILE` — path to worker file for worker mode

**Dynamic Port Override:** Generated Caddyfiles use environment variables (e.g., `{$HOST}:{$PORT}`) so you can override settings with command-line options even after file generation.

This matches the placeholders in the official FrankenPHP Caddyfile template.

Generated Configuration

If no custom Caddyfile is found, the script automatically generates optimized configurations:

**Caddyfile Generation:**
- Classic mode: `.phpup/Caddyfile.classic` with auto-scaling threads (2-10)
- Worker mode: `.phpup/Caddyfile.worker` with fixed thread pool and file watching
- Enhanced routing: Supports PHP apps in subfolders (e.g., `/cockpit`, `/admin`)
- Features: HTTPS/TLS, compression, debug logging

**PHP Configuration:**
- PHP settings configured directly in Caddyfile using FrankenPHP's `php_ini` block
- Optimized settings for development and production use
- Includes: generous upload limits (50M), 256M memory limit, error reporting enabled
- Settings applied automatically in both classic and worker modes
- No standalone `php.ini` is generated; configuration lives inline in the Caddyfiles.

Initialization

Use `--init` to generate customizable configuration files:

```bash
./phpup --init
```

This creates:
- `.phpup/Caddyfile` - Main Caddyfile (imports classic mode by default)
- `.phpup/Caddyfile.classic` - Classic mode template with inline PHP configuration
- `.phpup/Caddyfile.worker` - Worker mode template with inline PHP configuration

The generated files use Caddy environment placeholders (`{$HOST}`, `{$PORT}`, `{$DOCROOT}`) so they work with any configuration.

Subfolder Applications

The generated Caddyfiles include enhanced routing that automatically supports PHP applications in subfolders:

**How it works:**
1. **Subfolder apps** (e.g., `/cockpit/`) are served by their own `index.php`
2. **Unmatched routes** fall back to the main application's `/index.php`
3. **Static files** are served directly from any location

**Example structure:**
```
/
├── index.php          # Main application
├── cockpit/
│   └── index.php      # Cockpit CMS
├── admin/
│   └── index.php      # Admin panel
└── api/
    └── index.php      # API application
```

**Routing behavior:**
- `http://localhost:8000/` → Main application (`/index.php`)
- `http://localhost:8000/cockpit/` → Cockpit app (`/cockpit/index.php`)
- `http://localhost:8000/admin/users` → Admin app (`/admin/index.php`)
- `http://localhost:8000/api/v1/posts` → API app (`/api/index.php`)
- `http://localhost:8000/unknown/route` → Main app (`/index.php?/unknown/route`)

This works seamlessly with applications like Cockpit CMS, Laravel, Symfony, or any modular PHP setup.

Examples

```bash
# Initialize configuration files for customization
./phpup --init

# Install phpup system-wide and auto-install FrankenPHP if needed
sudo ./phpup --install

# Basic usage (classic mode)
./phpup

# Auto-open browser after starting
./phpup --open

# Interactive TUI interface
./phpup --tui

# Development with file watching (auto-reload on changes)
./phpup --watch --verbose

# Show FrankenPHP debug logs
./phpup --debug

# Worker mode with custom PHP threads
./phpup --worker --php-threads 10

# Interactive TUI frontend

There is also a lightweight curses-based helper in `tui/phpup_tui.py`. Launch it directly with `./phpup --tui` or run the script yourself:

**Requirements:**
- Python 3.6+ (uses built-in libraries only: curses, subprocess, os, sys, dataclasses)
- Terminal with color support (recommended)

**Usage:**
```bash
# Launch via phpup
./phpup --tui

# Run from the project directory
python3 tui/phpup_tui.py

# Or if installed globally with --install:
phpui
```

Use the arrow keys or mouse to navigate between fields, press Enter or click to edit values.
Action buttons (F2-F6, Q) are clickable for quick access. Configuration fields can also be clicked to edit directly.

The TUI automatically detects common web project structures and suggests appropriate document roots:
- `public/` (Laravel, Symfony, modern PHP frameworks)
- `web/` (Drupal, some frameworks)
- `www/`, `htdocs/` (traditional web roots)
- `dist/`, `build/` (built frontend projects)

Auto-detected values are marked as "(auto-detected)" and can be overridden by editing the field.

**Responsive Interface:**
- Automatically adapts to terminal size changes
- Hides/shows panels based on available space
- Works on terminals as small as 40x10
- Instant resize handling without losing state

**Available actions:**
- F2: Initialize project configuration (when needed)
- F3: Stop all FrankenPHP processes
- F4: Process manager (shows working directory for each process)
- F5: Run server
- F6: Test/dry-run (show command preview)
- Q: Quit TUI

The footer shows the exact commands that will be executed. The TUI keeps the
original CLI intact while offering a friendlier way to tweak common options.

# List running FrankenPHP instances with their working directories
# Shows which folder each server was started from
./phpup --list

# HTTPS with local certificates
./phpup --https local --port 8443

# Production-like setup
./phpup --compression

# Adjust PHP settings
# Edit the php_ini block in .phpup/Caddyfile.classic or .phpup/Caddyfile.worker

# Custom hostname support (e.g., for local development domains)
./phpup --host website.local --port 8080
./phpup --host api.local --https local  # with HTTPS

# Watch specific file patterns
./phpup --watch --watch-pattern "*.twig" --watch-pattern "config/*.yml"

# Load environment variables from file
./phpup --env-file .env.local

# Auto-loads .phpup/.env if present (no flag needed)
echo "DB_HOST=localhost" > .phpup/.env
./phpup  # Automatically loads .phpup/.env

# Both modes use the same PHP configuration (inline in Caddyfile)
./phpup                # Classic mode with 50M upload limits, 256M memory
./phpup --worker       # Worker mode with same PHP configuration

# Test subfolder applications (automatically supported)
mkdir cockpit && echo '<?php echo "Cockpit CMS"; ?>' > cockpit/index.php
./phpup                # Now supports both / and /cockpit/ routes

```

Installation

The `--install` command provides an easy way to set up both phpup and FrankenPHP:

```bash
sudo ./phpup --install
```

This will:
1. Install `phpup` to `/usr/local/bin/` for system-wide access
2. Install the TUI as `phpui` command for global access
3. Check if FrankenPHP is available
4. If FrankenPHP is not found, automatically download and install it using the official installer
5. Set up proper permissions for both tools

After installation, you can use `phpup` and `phpui` from any directory.

Custom FrankenPHP Builds

The `--build-php` command helps you create custom FrankenPHP binaries with additional PHP extensions:

```bash
./phpup --build-php
```

**Prerequisites:**
- Docker with buildx (for building) - user must be in `docker` group or use `sudo`
- Git (for cloning FrankenPHP source)

**Docker Setup:**
```bash
# Add user to docker group (one-time setup)
sudo usermod -aG docker $USER
newgrp docker  # or logout/login

# Ensure docker buildx is available (usually included in modern Docker)
docker buildx version

# Or run with sudo if needed
sudo ./phpup --build-php
```

**Supported Extensions:**
- `xdebug` - Step debugger and profiler
- `mongodb` - MongoDB driver
- `swoole` - Async programming framework
- `redis` - Redis client
- `memcached` - Memcached client
- `imagick` - ImageMagick extension
- `gd` - GD graphics library
- `custom` - Add custom extensions via Dockerfile

**Example Usage:**
```bash
# Interactive mode - will prompt for PHP version and extensions
./phpup --build-php

# When prompted:
# 1. PHP version: 8.3 (or press Enter for 8.4)
# 2. Extensions: xdebug,mongodb,redis
# This builds FrankenPHP with PHP 8.3 + Xdebug + MongoDB + Redis
```

The build process:
1. Prompts for PHP version (8.1, 8.2, 8.3, 8.4)
2. Prompts for extensions to add
3. Clones the FrankenPHP repository
4. Uses the official FrankenPHP build system (`docker buildx bake`) with your extensions
5. Builds a static binary using the GNU toolchain (takes 10-20 minutes)
6. Extracts the custom binary to `/tmp/frankenphp-custom-build/`

**Installation:**
```bash
# Backup original
sudo mv /usr/local/bin/frankenphp /usr/local/bin/frankenphp.backup

# Install custom build
sudo cp /tmp/frankenphp-custom-build/frankenphp-custom /usr/local/bin/frankenphp

# Test
frankenphp version
```

Notes

- Classic mode is used by default; use `--worker` for experimental worker mode
- The script checks for a free port using `ss`, `lsof`, `nc`, or a `/dev/tcp` fallback
- You can override the port by setting the `PORT` environment variable or using `--port`
- File watching (`--watch`) automatically restarts workers when files change
- HTTPS mode `local` generates local certificates automatically
- Subfolder applications (e.g., `/cockpit/`, `/admin/`) are automatically supported with enhanced routing
