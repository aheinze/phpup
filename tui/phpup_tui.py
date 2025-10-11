#!/usr/bin/env python3
"""Modern TUI interface for phpup - A FrankenPHP dev server launcher.

Provides an elegant interface to configure and launch PHP development servers
with visual feedback and intuitive controls.
"""

from __future__ import annotations

import curses
from curses import textpad
import itertools
import os
import subprocess
import sys
import time
import threading
from dataclasses import dataclass
from typing import Dict, List, Optional, Sequence, Tuple


SCRIPT_ROOT = os.path.dirname(os.path.dirname(os.path.abspath(__file__)))
PHPUP_PATH = os.path.join(SCRIPT_ROOT, "phpup")

FIELD_LABEL_WIDTH = 20

# Unicode box drawing characters for modern UI
BOX_CHARS = {
    "h": "─", "v": "│",
    "tl": "╭", "tr": "╮", "bl": "╰", "br": "╯",
    "t": "┬", "b": "┴", "l": "├", "r": "┤",
    "cross": "┼"
}

# Icons for visual elements
ICONS = {
    "server": "🐘",
    "host": "🌐",
    "port": "🔌",
    "domain": "🌍",
    "folder": "📁",
    "php": "🐘",
    "https": "🔒",
    "worker": "⚙",
    "watch": "👁",
    "verbose": "📝",
    "browser": "🌍",
    "compress": "📦",
    "pattern": "🔍",
    "args": "⚡",
    "on": "✅",
    "off": "❌",
    "selected": "▶ ",
    "unselected": " ",
    "run": "▶ ",
    "test": "🧪",
    "init": "🎯",
    "list": "📋",
    "stats": "📊",
    "stop": "🛑",
    "kill": "⚡",
    "quit": "🚪",
}

# Animation frames for spinner
SPINNER_FRAMES = ["⠋", "⠙", "⠹", "⠸", "⠼", "⠴", "⠦", "⠧", "⠇", "⠏"]
PULSE_FRAMES = ["◐", "◓", "◑", "◒"]
DOT_FRAMES = ["⣾", "⣽", "⣻", "⢿", "⡿", "⣟", "⣯", "⣷"]

COLORS: Dict[str, int] = {
    "header": curses.A_REVERSE,
    "field_label": curses.A_BOLD,
    "field_value": curses.A_NORMAL,
    "selected_label": curses.A_REVERSE | curses.A_BOLD,
    "selected_value": curses.A_REVERSE,
    "status": curses.A_DIM,
    "command": curses.A_DIM,
    "border": curses.A_NORMAL,
    "title": curses.A_BOLD,
    "section": curses.A_BOLD,
    "success": curses.A_BOLD,
    "error": curses.A_BOLD,
    "warning": curses.A_BOLD,
}


def init_colors() -> None:
    if not curses.has_colors():
        return
    curses.start_color()
    try:
        curses.use_default_colors()
    except curses.error:
        pass

    # Try to detect if we have extended colors (256 color mode)
    # If so, we can use a proper gray color
    border_color = curses.COLOR_WHITE  # Fallback
    if curses.COLORS >= 256:
        # Use color 240 (gray) if available in 256-color mode
        try:
            curses.init_pair(13, 240, -1)  # Gray foreground
            border_pair = 13
        except curses.error:
            # Fallback to dimmed white
            border_pair = 7
            border_color = curses.COLOR_WHITE
    else:
        # Standard 8-color mode - use dimmed white
        border_pair = 7
        border_color = curses.COLOR_WHITE

    # Modern color scheme with better contrast and visual hierarchy
    pairs = [
        (1, curses.COLOR_WHITE, curses.COLOR_BLUE),    # Header
        (2, curses.COLOR_CYAN, -1),                     # Labels
        (3, curses.COLOR_WHITE, -1),                    # Values
        (4, curses.COLOR_BLACK, curses.COLOR_CYAN),     # Selected label
        (5, curses.COLOR_BLACK, curses.COLOR_YELLOW),   # Selected value
        (6, curses.COLOR_YELLOW, -1),                   # Status/commands
        (7, border_color, -1),                          # Borders (subtle gray or dimmed white)
        (8, curses.COLOR_MAGENTA, -1),                  # Section headers
        (9, curses.COLOR_GREEN, -1),                    # Success
        (10, curses.COLOR_RED, -1),                     # Error
        (11, curses.COLOR_YELLOW, -1),                  # Warning
        (12, curses.COLOR_WHITE, curses.COLOR_MAGENTA), # Title bar
    ]

    for pair_id, fg, bg in pairs:
        try:
            curses.init_pair(pair_id, fg, bg)
        except curses.error:
            continue

    # Set up border color with appropriate dimming
    if curses.COLORS >= 256 and border_pair == 13:
        # Use the gray color without dimming (it's already subtle)
        border_attr = curses.color_pair(13)
    else:
        # Use dimmed white as fallback
        border_attr = curses.color_pair(7) | curses.A_DIM

    COLORS.update(
        {
            "header": curses.color_pair(12) | curses.A_BOLD,
            "field_label": curses.color_pair(2),
            "field_value": curses.color_pair(3),
            "selected_label": curses.color_pair(4) | curses.A_BOLD,
            "selected_value": curses.color_pair(5) | curses.A_BOLD,
            "status": curses.color_pair(6),
            "command": curses.color_pair(6),
            "border": border_attr,  # Adaptive gray/dimmed white
            "title": curses.color_pair(2) | curses.A_BOLD,  # Cyan for modern look
            "section": curses.color_pair(8) | curses.A_BOLD,
            "success": curses.color_pair(9) | curses.A_BOLD,
            "error": curses.color_pair(10) | curses.A_BOLD,
            "warning": curses.color_pair(11),
        }
    )


def safe_addstr(win: curses.window, row: int, col: int, text: str, attr: int = curses.A_NORMAL) -> None:
    """Render text safely, clipping to the window to avoid curses ERR."""

    max_y, max_x = win.getmaxyx()
    if row < 0 or row >= max_y:
        return
    if col < 0 or col >= max_x:
        return

    available = max_x - col
    if available <= 0:
        return

    clipped = text[: available - 1] if len(text) >= available else text
    try:
        win.addstr(row, col, clipped, attr)
    except curses.error:
        pass


def clear_line(win: curses.window, row: int) -> None:
    max_y, _ = win.getmaxyx()
    if row < 0 or row >= max_y:
        return
    try:
        win.move(row, 0)
        win.clrtoeol()
    except curses.error:
        pass


class Field:
    label: str

    def __init__(self, label: str) -> None:
        self.label = label

    def display_value(self) -> str:
        return ""

    def render(self, stdscr: curses.window, row: int, selected: bool) -> None:
        # Get appropriate icon based on label
        icon_map = {
            "Host": ICONS["host"],
            "Port": ICONS["port"],
            "Domain": ICONS["domain"],
            "Docroot": ICONS["folder"],
            "PHP Threads": ICONS["php"],
            "HTTPS Mode": ICONS["https"],
            "Worker Mode": ICONS["worker"],
            "Watch Mode": ICONS["watch"],
            "Verbose": ICONS["verbose"],
            "Open Browser": ICONS["browser"],
            "Compression": ICONS["compress"],
            "Watch Patterns": ICONS["pattern"],
            "Extra Args": ICONS["args"],
        }

        icon = icon_map.get(self.label, "  ")
        indicator = ICONS["selected"] if selected else ICONS["unselected"]
        label_attr = COLORS["selected_label"] if selected else COLORS["field_label"]
        value_attr = COLORS["selected_value"] if selected else COLORS["field_value"]

        label_text = f"{indicator} {icon} {self.label:<{FIELD_LABEL_WIDTH}}"
        value_text = self.display_value() or "─"

        safe_addstr(stdscr, row, 3, label_text, label_attr)
        safe_addstr(stdscr, row, 7 + FIELD_LABEL_WIDTH, value_text, value_attr)

    def handle_input(self, _stdscr: curses.window) -> None:
        raise NotImplementedError


class TextField(Field):
    def __init__(self, label: str, value: str = "", auto_detected: bool = False) -> None:
        super().__init__(label)
        self.value = value
        self.auto_detected = auto_detected

    def display_value(self) -> str:
        if self.value:
            if self.auto_detected and self.label == "Docroot":
                return f"{self.value} (auto-detected)"
            return self.value
        return ""

    def handle_input(self, stdscr: curses.window) -> None:
        max_y, max_x = stdscr.getmaxyx()
        win = curses.newwin(1, max_x - 4, max_y - 3, 2)
        win.erase()
        win.addstr(0, 0, self.value)
        curses.curs_set(1)
        safe_addstr(stdscr, max_y - 4, 1, f"Enter {self.label}: ")
        textbox = textpad.Textbox(win, insert_mode=True)
        try:
            new_val = textbox.edit().strip()
        finally:
            curses.curs_set(0)
            clear_line(stdscr, max_y - 4)
            win.erase()
        if new_val:
            self.value = new_val


class ChoiceField(Field):
    def __init__(self, label: str, choices: Sequence[str], default_index: int = 0) -> None:
        super().__init__(label)
        if not choices:
            raise ValueError("choices must not be empty")
        self.choices = list(choices)
        self.index = max(0, min(default_index, len(self.choices) - 1))

    @property
    def value(self) -> str:
        return self.choices[self.index]

    def handle_input(self, _stdscr: curses.window) -> None:
        self.index = (self.index + 1) % len(self.choices)

    def display_value(self) -> str:
        return self.value


class ToggleField(Field):
    def __init__(self, label: str, value: bool = False) -> None:
        super().__init__(label)
        self.value = value

    def handle_input(self, _stdscr: curses.window) -> None:
        self.value = not self.value

    def display_value(self) -> str:
        return f"{ICONS['on']} ON" if self.value else f"{ICONS['off']} OFF"


@dataclass
class ActionRegion:
    """Represents a clickable action button region."""
    key: str
    action: str
    row: int
    col_start: int
    col_end: int

    def contains_click(self, row: int, col: int) -> bool:
        return self.row == row and self.col_start <= col <= self.col_end


class Spinner:
    """Animated spinner for loading states."""
    def __init__(self, frames: List[str] = None):
        self.frames = frames or SPINNER_FRAMES
        self.frame_index = 0
        self.running = False
        self._thread = None
        self._lock = threading.Lock()

    def get_frame(self) -> str:
        """Get current spinner frame."""
        with self._lock:
            return self.frames[self.frame_index % len(self.frames)]

    def next_frame(self) -> None:
        """Advance to next frame."""
        with self._lock:
            self.frame_index = (self.frame_index + 1) % len(self.frames)

    def reset(self) -> None:
        """Reset spinner to first frame."""
        with self._lock:
            self.frame_index = 0


@dataclass
class ScrollablePanel:
    """Manages scrollable content within a panel."""
    content_height: int = 0
    visible_height: int = 0
    scroll_offset: int = 0

    def can_scroll_up(self) -> bool:
        return self.scroll_offset > 0

    def can_scroll_down(self) -> bool:
        return self.scroll_offset < max(0, self.content_height - self.visible_height)

    def scroll_up(self, lines: int = 1) -> None:
        self.scroll_offset = max(0, self.scroll_offset - lines)

    def scroll_down(self, lines: int = 1) -> None:
        max_scroll = max(0, self.content_height - self.visible_height)
        self.scroll_offset = min(max_scroll, self.scroll_offset + lines)

    def get_visible_range(self) -> Tuple[int, int]:
        """Returns (start_line, end_line) for visible content."""
        start = self.scroll_offset
        end = min(start + self.visible_height, self.content_height)
        return start, end


@dataclass
class Config:
    host: TextField
    port: TextField
    domain: TextField
    docroot: TextField
    php_threads: TextField
    https: ChoiceField
    worker: ToggleField
    watch: ToggleField
    verbose: ToggleField
    open_browser: ToggleField
    compression: ToggleField
    extra_watch: TextField
    extra_args: TextField

    def all_fields(self) -> List[Field]:
        return [
            self.host,
            self.port,
            self.domain,
            self.docroot,
            self.php_threads,
            self.https,
            self.worker,
            self.watch,
            self.verbose,
            self.open_browser,
            self.compression,
            self.extra_watch,
            self.extra_args,
        ]

    def build_command(self, dry_run: bool = False) -> List[str]:
        cmd: List[str] = [PHPUP_PATH]
        if self.domain.value:
            cmd += ["--domain", self.domain.value]
        if self.host.value:
            cmd += ["--host", self.host.value]
        if self.port.value:
            cmd += ["--port", self.port.value]
        if self.docroot.value:
            # Convert relative paths to absolute paths for consistency
            docroot_path = self.docroot.value
            if not os.path.isabs(docroot_path):
                docroot_path = os.path.abspath(docroot_path)
            cmd += ["--docroot", docroot_path]
        if self.php_threads.value:
            cmd += ["--php-threads", self.php_threads.value]
        if self.https.value != "off":
            cmd += ["--https", self.https.value]
        if self.worker.value:
            cmd.append("--worker")
        if self.watch.value:
            cmd.append("--watch")
        if self.verbose.value:
            cmd.append("--verbose")
        if self.open_browser.value:
            cmd.append("--open")
        if not self.compression.value:
            cmd.append("--no-compression")
        if self.extra_watch.value:
            for pattern in (p.strip() for p in self.extra_watch.value.split(",") if p.strip()):
                cmd += ["--watch-pattern", pattern]
        if dry_run:
            cmd.append("--dry-run")
        if self.extra_args.value:
            cmd.append("--")
            cmd.extend(shlex_split(self.extra_args.value))
        return cmd

    def build_init_command(self) -> List[str]:
        cmd: List[str] = [PHPUP_PATH, "--init"]
        if self.domain.value:
            cmd += ["--domain", self.domain.value]
        if self.docroot.value:
            # Convert relative paths to absolute paths for consistency
            docroot_path = self.docroot.value
            if not os.path.isabs(docroot_path):
                docroot_path = os.path.abspath(docroot_path)
            cmd += ["--docroot", docroot_path]
        # Always add --save when running --init with domain to persist configuration
        if self.domain.value:
            cmd.append("--save")
        return cmd

    def build_list_command(self) -> List[str]:
        return [PHPUP_PATH, "--list"]

    def build_stop_command(self) -> List[str]:
        return [PHPUP_PATH, "--stop"]


def shlex_split(value: str) -> List[str]:
    import shlex

    try:
        return shlex.split(value)
    except ValueError:
        return value.split()


def init_available() -> bool:
    return not os.path.isdir(".phpup")


def detect_best_docroot() -> str:
    """Auto-detect the best document root based on common web directory patterns."""
    # Priority order for web directories (most common first)
    web_dir_candidates = [
        "public",      # Laravel, Symfony, modern PHP
        "web",         # Drupal, some frameworks
        "www",         # Traditional web root
        "htdocs",      # Traditional Apache
        "dist",        # Build output (React, Vue, etc.)
        "build",       # Build output alternative
        "app/public",  # Nested public directories
        "src/public",  # Source public directories
    ]

    for candidate in web_dir_candidates:
        if os.path.isdir(candidate):
            # Check if it looks like a web root (has index files or web assets)
            web_indicators = [
                "index.php", "index.html", "index.htm",
                "app.php", "main.php", "bootstrap.php"
            ]

            candidate_path = candidate
            has_web_files = any(os.path.exists(os.path.join(candidate_path, indicator))
                              for indicator in web_indicators)

            # Also check for common web asset directories
            asset_dirs = ["css", "js", "assets", "img", "images", "static"]
            has_assets = any(os.path.exists(os.path.join(candidate_path, asset_dir))
                           for asset_dir in asset_dirs)

            if has_web_files or has_assets:
                return candidate

    # If no specific web directory found, check if current directory has web files
    web_indicators = ["index.php", "index.html", "app.php"]
    if any(os.path.exists(indicator) for indicator in web_indicators):
        return "."  # Current directory

    # Default fallback
    return ""


def get_project_info() -> Dict[str, str]:
    """Gather information about the current project/folder."""
    info = {}
    cwd = os.getcwd()

    # Basic folder info
    info["path"] = cwd
    info["name"] = os.path.basename(cwd)

    # Check for common project files
    project_files = []
    common_files = [
        ("composer.json", "🐘 PHP Composer"),
        ("package.json", "📦 Node.js"),
        ("requirements.txt", "🐍 Python"),
        ("Cargo.toml", "🦀 Rust"),
        ("pom.xml", "☕ Java Maven"),
        ("build.gradle", "🐘 Java Gradle"),
        ("go.mod", "🐹 Go"),
        (".env", "🔧 Environment"),
        ("docker-compose.yml", "🐳 Docker Compose"),
        ("Dockerfile", "🐳 Docker"),
        (".git", "📁 Git Repository")
    ]

    for file_name, description in common_files:
        if os.path.exists(file_name):
            project_files.append(description)

    info["project_files"] = project_files[:6]  # Limit to 6 items

    # Check for web-related files and directories
    web_dirs = []
    web_candidates = ["public", "web", "www", "htdocs", "dist", "build"]
    for candidate in web_candidates:
        if os.path.isdir(candidate):
            web_dirs.append(candidate)
    info["web_dirs"] = web_dirs[:3]  # Limit to 3

    # Check for PHP files count
    php_count = 0
    try:
        for item in os.listdir('.'):
            if item.endswith('.php'):
                php_count += 1
            if php_count >= 10:  # Cap the count for performance
                break
    except (OSError, PermissionError):
        pass
    info["php_files"] = str(php_count) if php_count > 0 else None

    # Check for phpup configuration
    phpup_configs = []
    config_files = [
        ".phpup/Caddyfile",
        ".phpup/Caddyfile.classic",
        ".phpup/Caddyfile.worker",
        "Caddyfile",
        "Caddyfile.local",
        "Caddyfile.dev"
    ]

    for config in config_files:
        if os.path.exists(config):
            phpup_configs.append(os.path.basename(config))

    info["phpup_configs"] = phpup_configs[:4]  # Limit to 4

    # Detect recommended docroot
    recommended_docroot = detect_best_docroot()
    if recommended_docroot and recommended_docroot != ".":
        info["recommended_docroot"] = recommended_docroot

    # Get directory size (rough estimate)
    try:
        total_size = 0
        file_count = 0
        for root, dirs, files in os.walk('.'):
            # Skip hidden directories and common large directories
            dirs[:] = [d for d in dirs if not d.startswith('.') and d not in ['node_modules', 'vendor', '__pycache__']]
            for file in files:
                if not file.startswith('.'):
                    try:
                        file_path = os.path.join(root, file)
                        total_size += os.path.getsize(file_path)
                        file_count += 1
                        if file_count >= 1000:  # Performance limit
                            break
                    except (OSError, PermissionError):
                        continue
            if file_count >= 1000:
                break

        # Format size
        if total_size > 1024 * 1024:  # > 1MB
            info["size"] = f"{total_size // (1024 * 1024)}MB"
        elif total_size > 1024:  # > 1KB
            info["size"] = f"{total_size // 1024}KB"
        else:
            info["size"] = f"{total_size}B"

        info["file_count"] = str(file_count) + ("+" if file_count >= 1000 else "")
    except Exception:
        info["size"] = "?"
        info["file_count"] = "?"

    return info


def draw_box(stdscr: curses.window, y: int, x: int, height: int, width: int, title: str = "", style: str = "default") -> None:
    """Draw a modern box with rounded corners and optional styles."""
    try:
        # Style variations
        if style == "double":
            chars = {"tl": "╔", "tr": "╗", "bl": "╚", "br": "╝", "h": "═", "v": "║"}
            border_color = COLORS["success"]
        elif style == "bold":
            chars = {"tl": "┏", "tr": "┓", "bl": "┗", "br": "┛", "h": "━", "v": "┃"}
            border_color = COLORS["field_label"]
        elif style == "dotted":
            chars = {"tl": "┌", "tr": "┐", "bl": "└", "br": "┘", "h": "┄", "v": "┊"}
            border_color = COLORS["border"]
        else:  # default rounded
            chars = BOX_CHARS
            border_color = COLORS["border"]

        # Top border
        safe_addstr(stdscr, y, x, chars["tl"], border_color)
        safe_addstr(stdscr, y, x + 1, chars["h"] * (width - 2), border_color)
        safe_addstr(stdscr, y, x + width - 1, chars["tr"], border_color)

        # Title if provided (left-aligned with fancy styling)
        if title:
            title_text = f" ✦ {title} ✦ "
            title_pos = x + 2
            safe_addstr(stdscr, y, title_pos, title_text, COLORS["section"])

        # Side borders
        for i in range(1, height - 1):
            safe_addstr(stdscr, y + i, x, chars["v"], border_color)
            safe_addstr(stdscr, y + i, x + width - 1, chars["v"], border_color)

        # Bottom border
        safe_addstr(stdscr, y + height - 1, x, chars["bl"], border_color)
        safe_addstr(stdscr, y + height - 1, x + 1, chars["h"] * (width - 2), border_color)
        safe_addstr(stdscr, y + height - 1, x + width - 1, chars["br"], border_color)
    except curses.error:
        pass

def draw_header(stdscr: curses.window, show_init: bool, animation_frame: int = 0) -> None:
    """Draw animated header with pulsing effects."""
    max_y, max_x = stdscr.getmaxyx()
    if max_y <= 2:
        return

    # Animated pulse effect for the icon
    pulse_icon = PULSE_FRAMES[animation_frame % len(PULSE_FRAMES)] if animation_frame else ""

    # Modern minimalist header - left aligned
    title = f"{pulse_icon} {ICONS['php']} phpup {pulse_icon}"
    version = ""
    tagline = "FrankenPHP Development Server"

    # Status indicators with animation
    status_items = []
    if show_init:
        spinner = SPINNER_FRAMES[animation_frame % len(SPINNER_FRAMES)]
        status_items.append(f"{spinner} Config Required")
    else:
        status_items.append("✓ Ready")

    # Draw clean header without background
    safe_addstr(stdscr, 0, 2, title, COLORS["title"] | curses.A_BOLD)
    safe_addstr(stdscr, 0, len(title) + 3, version, COLORS["status"])
    safe_addstr(stdscr, 0, len(title) + len(version) + 5, f"— {tagline}", COLORS["field_value"])

    # Right-aligned status with pulsing effect
    if status_items:
        status_text = " ".join(status_items)
        status_x = max_x - len(status_text) - 2
        if status_x > 0:
            status_color = COLORS["warning"] if show_init else COLORS["success"]
            safe_addstr(stdscr, 0, status_x, status_text, status_color)

    # Gradient-like separator line with special characters
    if max_y > 1 and max_x > 1:
        # Create a fancy separator with gradient effect
        left_cap = "╾"
        right_cap = "╼"
        middle = "━" * (max_x - 3)
        separator = left_cap + middle + right_cap
        safe_addstr(stdscr, 1, 0, separator, COLORS["border"])


def run_phpup_command(stdscr: curses.window, cmd: List[str]) -> None:
    stdscr.clear()
    safe_addstr(stdscr, 0, 0, f"Running: {' '.join(shlex_escape(arg) for arg in cmd)}", curses.A_BOLD)
    stdscr.refresh()
    try:
        # Run in current working directory, not script directory
        proc = subprocess.Popen(cmd, stdout=subprocess.PIPE, stderr=subprocess.STDOUT, text=True)
    except FileNotFoundError:
        safe_addstr(stdscr, 2, 0, "phpup script not found. Expected at: " + PHPUP_PATH)
        safe_addstr(stdscr, 4, 0, "Press any key to return")
        stdscr.getch()
        return

    lines = []
    for line in itertools.islice(proc.stdout, 1000):
        lines.append(line.rstrip("\n"))
    proc.wait()
    lines.append(f"Process exited with status {proc.returncode}")

    max_y, max_x = stdscr.getmaxyx()
    top = 2
    per_page = max_y - top - 2
    page = 0

    while True:
        stdscr.erase()
        safe_addstr(stdscr, 0, 0, f"Running: {' '.join(shlex_escape(arg) for arg in cmd)}", curses.A_BOLD)
        if max_y > 1 and max_x > 1:
            try:
                stdscr.hline(1, 0, curses.ACS_HLINE, max_x - 1)
            except curses.error:
                pass
        start = page * per_page
        for idx, line in enumerate(lines[start : start + per_page]):
            safe_addstr(stdscr, top + idx, 0, line)
        safe_addstr(stdscr, max_y - 1, 0, "PgUp/PgDn navigate output, any other key to return")
        key = stdscr.getch()
        if key in (curses.KEY_NPAGE, ord("j")) and (page + 1) * per_page < len(lines):
            page += 1
        elif key in (curses.KEY_PPAGE, ord("k")) and page > 0:
            page -= 1
        else:
            break


def parse_server_info(output_lines: List[str]) -> Dict[str, str]:
    """Parse phpup output to extract server information."""
    info = {}

    for line in output_lines:
        line = line.strip()
        if line.startswith("Host:") and "Port:" in line:
            # Extract: "Host: 127.0.0.1  Port: 8001"
            parts = line.split()
            if len(parts) >= 4:
                info["host"] = parts[1]
                info["port"] = parts[3]
        elif line.startswith("Protocol:"):
            info["protocol"] = line.split(":", 1)[1].strip()
        elif line.startswith("📁 Docroot:"):
            info["docroot"] = line.split(":", 1)[1].strip()
        elif line.startswith("Mode:"):
            info["mode"] = line.split(":", 1)[1].strip()
        elif "Port" in line and "is busy, switching to" in line:
            # Extract switched port info
            import re
            match = re.search(r"switching to (\d+)", line)
            if match:
                info["port"] = match.group(1)

    return info


def launch_phpup_with_feedback(stdscr: curses.window, cfg: Config, dry_run: bool) -> None:
    """Launch phpup with enhanced feedback including clickable URLs."""
    cmd = cfg.build_command(dry_run=dry_run)

    stdscr.clear()
    safe_addstr(stdscr, 0, 0, f"Running: {' '.join(shlex_escape(arg) for arg in cmd)}", curses.A_BOLD)
    stdscr.refresh()

    try:
        proc = subprocess.Popen(cmd, stdout=subprocess.PIPE, stderr=subprocess.STDOUT, text=True)
    except FileNotFoundError:
        safe_addstr(stdscr, 2, 0, "phpup script not found. Expected at: " + PHPUP_PATH)
        safe_addstr(stdscr, 4, 0, "Press any key to return")
        stdscr.getch()
        return

    # Collect output lines
    lines = []
    for line in proc.stdout:
        line = line.rstrip("\n")
        lines.append(line)
        if len(lines) > 1000:  # Limit output
            break

    proc.wait()

    # Parse server information
    server_info = parse_server_info(lines)

    max_y, max_x = stdscr.getmaxyx()

    # Enhanced display for server startup
    if not dry_run and proc.returncode == 0 and server_info.get("host") and server_info.get("port"):
        display_server_success(stdscr, server_info, lines)
    else:
        # Fallback to regular output display
        display_command_output(stdscr, cmd, lines, proc.returncode)


def display_server_success(stdscr: curses.window, server_info: Dict[str, str], _output_lines: List[str]) -> None:
    """Display enhanced server startup success information."""
    # Enable mouse for this interface too
    try:
        curses.mousemask(curses.ALL_MOUSE_EVENTS)
    except curses.error:
        pass

    stdscr.clear()
    max_y, max_x = stdscr.getmaxyx()

    # Title with project context
    project_info = get_project_info()
    project_name = project_info.get("name", "Project")
    safe_addstr(stdscr, 0, 0, f"🚀 FrankenPHP Server Started Successfully for {project_name}!", COLORS["success"])

    # Server details box
    details_start = 2
    if max_y > 10:
        draw_box(stdscr, details_start, 2, 8, max_x - 4, "Server Details")

        row = details_start + 1
        protocol = server_info.get("protocol", "http")
        host = server_info.get("host", "127.0.0.1")
        port = server_info.get("port", "8000")

        # Server URL (make it prominent and clickable)
        server_url = f"{protocol}://{host}:{port}"
        safe_addstr(stdscr, row, 4, "🌐 Server URL:", COLORS["field_label"])
        safe_addstr(stdscr, row, 18, f"[{server_url}]", COLORS["success"] | curses.A_UNDERLINE)
        url_row = row
        url_col_start = 18
        url_col_end = 18 + len(f"[{server_url}]")
        row += 1

        # Mode and docroot
        if server_info.get("mode"):
            safe_addstr(stdscr, row, 4, f"⚙️  Mode: {server_info['mode']}", COLORS["field_value"])
            row += 1

        if server_info.get("docroot"):
            docroot = server_info["docroot"]
            # Truncate long paths
            if len(docroot) > 50:
                docroot = "..." + docroot[-47:]
            safe_addstr(stdscr, row, 4, f"📁 Document root: {docroot}", COLORS["field_value"])
            row += 1

        # Status
        safe_addstr(stdscr, row, 4, "✅ Status: Running", COLORS["success"])
        row += 1

        # Additional info
        safe_addstr(stdscr, row, 4, "💡 Tip: Server will run in background until stopped", COLORS["status"])
        row += 2

        # Quick actions (make them look more clickable)
        safe_addstr(stdscr, row, 4, "Quick actions:", COLORS["field_label"])
        row += 1

        # Open browser action (more button-like)
        browser_text = "🌍 Open in Browser"
        safe_addstr(stdscr, row, 6, f"[{browser_text}]", COLORS["success"] | curses.A_UNDERLINE)
        browser_row = row
        row += 1

        # Process list action
        processes_text = "📋 List Processes"
        safe_addstr(stdscr, row, 6, f"[{processes_text}]", COLORS["status"] | curses.A_UNDERLINE)
        processes_row = row

    # Instructions
    footer_row = max_y - 2
    safe_addstr(stdscr, footer_row, 0, "Click URL/buttons or press 'o' (browser), 'l' (processes), any other key to return", COLORS["warning"])

    stdscr.refresh()

    # Handle user input (keyboard and mouse)
    while True:
        key = stdscr.getch()

        # Handle mouse events
        if key == curses.KEY_MOUSE:
            try:
                _, mouse_x, mouse_y, _, mouse_state = curses.getmouse()
                if mouse_state & curses.BUTTON1_CLICKED:
                    # Check if clicked on URL
                    if 'url_row' in locals() and mouse_y == url_row and url_col_start <= mouse_x <= url_col_end:
                        key = ord('o')  # Simulate 'o' key press
                    # Check if clicked on browser action
                    elif 'browser_row' in locals() and mouse_y == browser_row and 6 <= mouse_x <= 6 + len(f"[{browser_text}]"):
                        key = ord('o')  # Simulate 'o' key press
                    # Check if clicked on processes action
                    elif 'processes_row' in locals() and mouse_y == processes_row and 6 <= mouse_x <= 6 + len(f"[{processes_text}]"):
                        key = ord('l')  # Simulate 'l' key press
            except curses.error:
                pass

        if key == ord('o') or key == ord('O'):
            # Try to open browser
            server_url = f"{server_info.get('protocol', 'http')}://{server_info.get('host', '127.0.0.1')}:{server_info.get('port', '8000')}"
            try:
                import webbrowser
                webbrowser.open(server_url)
                safe_addstr(stdscr, footer_row, 0, f"Opening {server_url} in browser... Press any key to return", COLORS["success"])
                stdscr.refresh()
                stdscr.getch()
            except Exception:
                safe_addstr(stdscr, footer_row, 0, f"Could not open browser. URL: {server_url} - Press any key to return", COLORS["error"])
                stdscr.refresh()
                stdscr.getch()
            break
        elif key == ord('l') or key == ord('L'):
            # Show unified process manager
            unified_process_manager(stdscr)
            break
        else:
            break


def display_process_list_readonly(stdscr: curses.window, processes: List[Dict[str, str]]) -> None:
    """Display a read-only list of running processes."""
    stdscr.clear()
    max_y, max_x = stdscr.getmaxyx()

    safe_addstr(stdscr, 0, 0, f"📋 Running FrankenPHP Processes ({len(processes)} found)", COLORS["title"])
    safe_addstr(stdscr, 1, 0, "Press any key to return", COLORS["status"])

    # Table header
    if max_y > 3:
        header = f"{'PID':>7} {'LISTEN':20} {'MODE':8} {'CONFIG':30} DOCROOT"
        safe_addstr(stdscr, 3, 0, header, COLORS["field_label"])

    # Process list
    start_row = 4
    for i, process in enumerate(processes):
        if start_row + i >= max_y - 2:
            break
        line = f"{process['pid']:>7} {process['listen']:20} {process['mode']:8} {process.get('started_from', '-'):30} {process.get('config', '-')}"
        safe_addstr(stdscr, start_row + i, 0, line[:max_x-1], COLORS["field_value"])

    stdscr.refresh()
    stdscr.getch()


def display_command_output(stdscr: curses.window, cmd: List[str], lines: List[str], return_code: int) -> None:
    """Display command output with pagination (fallback for non-server commands)."""
    stdscr.clear()
    max_y, max_x = stdscr.getmaxyx()

    safe_addstr(stdscr, 0, 0, f"Running: {' '.join(shlex_escape(arg) for arg in cmd)}", curses.A_BOLD)
    if max_y > 1 and max_x > 1:
        try:
            stdscr.hline(1, 0, curses.ACS_HLINE, max_x - 1)
        except curses.error:
            pass

    # Add exit status
    status_line = f"Process exited with status {return_code}"
    lines.append(status_line)

    top = 2
    per_page = max_y - top - 2
    page = 0

    while True:
        # Clear content area
        for i in range(top, max_y - 1):
            try:
                stdscr.move(i, 0)
                stdscr.clrtoeol()
            except curses.error:
                pass

        start = page * per_page
        for idx, line in enumerate(lines[start:start + per_page]):
            safe_addstr(stdscr, top + idx, 0, line)

        safe_addstr(stdscr, max_y - 1, 0, "PgUp/PgDn navigate output, any other key to return")
        stdscr.refresh()

        key = stdscr.getch()
        if key in (curses.KEY_NPAGE, ord("j")) and (page + 1) * per_page < len(lines):
            page += 1
        elif key in (curses.KEY_PPAGE, ord("k")) and page > 0:
            page -= 1
        else:
            break


def launch_phpup(stdscr: curses.window, cfg: Config, dry_run: bool) -> None:
    """Legacy function for backwards compatibility."""
    launch_phpup_with_feedback(stdscr, cfg, dry_run)


def get_running_processes() -> List[Dict[str, str]]:
    """Get list of running FrankenPHP processes as structured data."""
    try:
        result = subprocess.run([PHPUP_PATH, "--list"],
                              capture_output=True, text=True)
        if result.returncode != 0:
            return []

        lines = result.stdout.strip().split('\n')
        processes = []

        # Skip header lines and empty lines
        for line in lines:
            line = line.strip()
            # Skip header, separator lines, and status messages
            if not line or line.startswith('PID') or line.startswith('🔎') or \
               line.startswith('No FrankenPHP') or '---' in line:
                continue

            # Parse process info (PID, LISTEN, MODE, STARTED FROM, CONFIG)
            parts = line.split(None, 4)  # Split into max 5 parts
            if len(parts) >= 4:
                processes.append({
                    'pid': parts[0],
                    'listen': parts[1] if len(parts) > 1 else '-',
                    'mode': parts[2] if len(parts) > 2 else '-',
                    'started_from': parts[3] if len(parts) > 3 else '-',
                    'config': parts[4] if len(parts) > 4 else '-'
                })

        return processes
    except (subprocess.SubprocessError, FileNotFoundError):
        return []


def show_process_stats(stdscr: curses.window) -> None:
    """Show detailed statistics for running FrankenPHP processes."""
    try:
        result = subprocess.run([PHPUP_PATH, "--stats"],
                              capture_output=True, text=True)
        if result.returncode != 0:
            stdscr.clear()
            safe_addstr(stdscr, 0, 0, "❌ Failed to get process statistics", COLORS["error"])
            safe_addstr(stdscr, 2, 0, "Press any key to return", COLORS["status"])
            stdscr.refresh()
            stdscr.getch()
            return

        lines = result.stdout.strip().split('\n')

        # Enable mouse for this interface
        try:
            curses.mousemask(curses.ALL_MOUSE_EVENTS)
        except curses.error:
            pass

        page = 0
        per_page = 0

        while True:
            stdscr.clear()
            max_y, max_x = stdscr.getmaxyx()

            # Header
            safe_addstr(stdscr, 0, 0, "📊 FrankenPHP Process Statistics", COLORS["title"])

            # Draw separator
            if max_y > 1 and max_x > 1:
                try:
                    stdscr.hline(1, 0, curses.ACS_HLINE, max_x - 1)
                except curses.error:
                    pass

            # Calculate pagination
            content_lines = [line for line in lines if line.strip() and not line.startswith('📊')]
            per_page = max_y - 4  # Reserve space for header and footer

            if not content_lines:
                safe_addstr(stdscr, 3, 0, "No FrankenPHP processes found for current user.", COLORS["status"])
                safe_addstr(stdscr, max_y - 1, 0, "Press any key to return", COLORS["status"])
            else:
                # Show paginated content
                start = page * per_page
                end = min(start + per_page, len(content_lines))

                for i, line in enumerate(content_lines[start:end]):
                    row = 2 + i
                    if row < max_y - 1:
                        if line.startswith('PID'):
                            # Header line
                            safe_addstr(stdscr, row, 0, line[:max_x-1], COLORS["field_label"])
                        else:
                            # Data line
                            safe_addstr(stdscr, row, 0, line[:max_x-1], COLORS["field_value"])

                # Footer with navigation
                footer = f"Page {page + 1}/{(len(content_lines) + per_page - 1) // per_page} | PgUp/PgDn: Navigate | Any other key: Return"
                safe_addstr(stdscr, max_y - 1, 0, footer[:max_x-1], COLORS["status"])

            stdscr.refresh()
            key = stdscr.getch()

            # Handle navigation
            if key in (curses.KEY_NPAGE, ord('j')) and (page + 1) * per_page < len(content_lines):
                page += 1
            elif key in (curses.KEY_PPAGE, ord('k')) and page > 0:
                page -= 1
            else:
                break

    except (subprocess.SubprocessError, FileNotFoundError):
        stdscr.clear()
        safe_addstr(stdscr, 0, 0, "❌ phpup script not found or failed", COLORS["error"])
        safe_addstr(stdscr, 2, 0, "Press any key to return", COLORS["status"])
        stdscr.refresh()
        stdscr.getch()


def unified_process_manager(stdscr: curses.window) -> None:
    """Unified process manager - list processes with optional selective killing."""
    # Enable mouse for this interface too
    try:
        curses.mousemask(curses.ALL_MOUSE_EVENTS)
    except curses.error:
        pass

    processes = get_running_processes()

    if not processes:
        stdscr.clear()
        safe_addstr(stdscr, 0, 0, "📋 No FrankenPHP processes found for current user.", COLORS["title"])
        safe_addstr(stdscr, 2, 0, "Press any key to return", COLORS["status"])
        stdscr.refresh()
        stdscr.getch()
        return

    selected = [False] * len(processes)
    current_row = 0
    kill_mode = False  # Toggle between view-only and kill mode

    while True:
        stdscr.clear()
        max_y, max_x = stdscr.getmaxyx()

        # Header with mode indicator
        if kill_mode:
            safe_addstr(stdscr, 0, 0, f"🛑 Process Manager - KILL MODE ({len(processes)} found)", COLORS["error"])
            safe_addstr(stdscr, 1, 0, "Select processes to kill: ↑/↓ navigate, SPACE/click toggle, ENTER kill, ESC exit kill mode", COLORS["warning"])
        else:
            safe_addstr(stdscr, 0, 0, f"📋 Process Manager ({len(processes)} found)", COLORS["title"])
            safe_addstr(stdscr, 1, 0, "View running processes: ↑/↓ navigate, 'k' for kill mode, ESC to return", COLORS["status"])

        # Table header
        if max_y > 3:
            if kill_mode:
                header = f"{'':3} {'PID':>7} {'LISTEN':20} {'MODE':8} {'STARTED FROM':30} CONFIG"
            else:
                header = f"{'PID':>7} {'LISTEN':20} {'MODE':8} {'STARTED FROM':30} CONFIG"
            safe_addstr(stdscr, 3, 0, header, COLORS["field_label"])

        # Process list
        start_row = 4
        for i, process in enumerate(processes):
            if start_row + i >= max_y - 2:
                break

            if kill_mode:
                # Show checkbox in kill mode
                checkbox = "☑" if selected[i] else "☐"
                highlight = COLORS["selected_value"] if i == current_row else COLORS["field_value"]
                line = f"{checkbox:3} {process['pid']:>7} {process['listen']:20} {process['mode']:8} {process.get('started_from', '-'):30} {process.get('config', '-')}"
            else:
                # Simple list in view mode
                highlight = COLORS["selected_value"] if i == current_row else COLORS["field_value"]
                line = f"{process['pid']:>7} {process['listen']:20} {process['mode']:8} {process.get('started_from', '-'):30} {process.get('config', '-')}"

            safe_addstr(stdscr, start_row + i, 0, line[:max_x-1], highlight)

        # Footer with mode-specific instructions
        footer_row = max_y - 1
        if kill_mode:
            selected_count = sum(selected)
            if selected_count > 0:
                safe_addstr(stdscr, footer_row, 0, f"Selected: {selected_count} process(es) - ENTER to kill, ESC to exit kill mode", COLORS["warning"])
            else:
                safe_addstr(stdscr, footer_row, 0, "Select processes with SPACE/click, ENTER to kill, ESC to exit kill mode", COLORS["status"])
        else:
            safe_addstr(stdscr, footer_row, 0, "Press 'k' to enter kill mode, 'r' to refresh, or ESC to return to main menu", COLORS["status"])

        stdscr.refresh()
        key = stdscr.getch()

        # Handle mouse events
        if key == curses.KEY_MOUSE:
            try:
                _, mouse_x, mouse_y, _, mouse_state = curses.getmouse()
                if mouse_state & curses.BUTTON1_CLICKED:
                    # Check if click was on a process row
                    for i, process in enumerate(processes):
                        process_row = start_row + i
                        if mouse_y == process_row and 0 <= mouse_x < max_x:
                            current_row = i
                            if kill_mode:
                                # Toggle selection in kill mode
                                selected[i] = not selected[i]
                            break
            except curses.error:
                pass  # Mouse event handling failed
        elif key in (curses.KEY_UP, ord('j')) and current_row > 0:
            current_row -= 1
        elif key == curses.KEY_DOWN and current_row < len(processes) - 1:
            current_row += 1
        elif key == ord(' ') and kill_mode:  # Space to toggle selection (only in kill mode)
            selected[current_row] = not selected[current_row]
        elif key == ord('k') or key == ord('K'):  # Enter kill mode
            if not kill_mode:
                kill_mode = True
                selected = [False] * len(processes)  # Reset selections
        elif key == ord('r') or key == ord('R'):  # Refresh process list
            processes = get_running_processes()
            selected = [False] * len(processes)
            current_row = 0
            if current_row >= len(processes):
                current_row = max(0, len(processes) - 1)
        elif key in (curses.KEY_ENTER, 10, 13) and kill_mode:  # Enter to kill selected
            selected_pids = [processes[i]['pid'] for i, sel in enumerate(selected) if sel]
            if selected_pids:
                kill_selected_processes(stdscr, selected_pids, processes)
                # Refresh after killing
                processes = get_running_processes()
                if not processes:
                    # No processes left, exit
                    stdscr.clear()
                    safe_addstr(stdscr, 0, 0, "✅ All processes killed. Press any key to return", COLORS["success"])
                    stdscr.refresh()
                    stdscr.getch()
                    break
                selected = [False] * len(processes)
                current_row = 0
                kill_mode = False  # Exit kill mode after killing
        elif key == 27:  # ESC
            if kill_mode:
                kill_mode = False  # Exit kill mode
                selected = [False] * len(processes)  # Reset selections
            else:
                break  # Exit process manager


def select_processes_to_kill(stdscr: curses.window) -> None:
    """Interactive process selection interface for killing specific processes."""
    # Enable mouse for this interface too
    try:
        curses.mousemask(curses.ALL_MOUSE_EVENTS)
    except curses.error:
        pass

    processes = get_running_processes()

    if not processes:
        stdscr.clear()
        safe_addstr(stdscr, 0, 0, "No FrankenPHP processes found for current user.", curses.A_BOLD)
        safe_addstr(stdscr, 2, 0, "Press any key to return")
        stdscr.refresh()
        stdscr.getch()
        return

    selected = [False] * len(processes)
    current_row = 0

    while True:
        stdscr.clear()
        max_y, max_x = stdscr.getmaxyx()

        # Header
        safe_addstr(stdscr, 0, 0, f"🛑 Select FrankenPHP processes to kill ({len(processes)} found)", COLORS["title"])

        # Instructions
        safe_addstr(stdscr, 1, 0, "Use ↑/↓ or mouse to navigate, SPACE/click to toggle, ENTER to kill, ESC to cancel", COLORS["status"])

        # Table header
        if max_y > 3:
            header = f"{'':3} {'PID':>7} {'LISTEN':20} {'MODE':8} {'STARTED FROM':30} CONFIG"
            safe_addstr(stdscr, 3, 0, header, COLORS["field_label"])

        # Process list
        start_row = 4
        for i, process in enumerate(processes):
            if start_row + i >= max_y - 2:
                break

            # Selection indicator
            checkbox = "☑" if selected[i] else "☐"
            highlight = COLORS["selected_value"] if i == current_row else COLORS["field_value"]

            # Format process line
            line = f"{checkbox:3} {process['pid']:>7} {process['listen']:20} {process['mode']:8} {process.get('started_from', '-'):30} {process.get('config', '-')}"
            safe_addstr(stdscr, start_row + i, 0, line[:max_x-1], highlight)

        # Footer with selected count
        selected_count = sum(selected)
        footer_row = max_y - 1
        if selected_count > 0:
            safe_addstr(stdscr, footer_row, 0, f"Selected: {selected_count} process(es) - ENTER to kill, ESC to cancel", COLORS["warning"])
        else:
            safe_addstr(stdscr, footer_row, 0, "Select with SPACE/click, then ENTER to kill, or ESC to cancel", COLORS["status"])

        stdscr.refresh()
        key = stdscr.getch()

        # Handle mouse events in process selector
        if key == curses.KEY_MOUSE:
            try:
                _, mouse_x, mouse_y, _, mouse_state = curses.getmouse()
                if mouse_state & curses.BUTTON1_CLICKED:
                    # Check if click was on a process row
                    for i, process in enumerate(processes):
                        process_row = start_row + i
                        if mouse_y == process_row and 0 <= mouse_x < max_x:
                            # Toggle selection for clicked row
                            selected[i] = not selected[i]
                            current_row = i
                            break
            except curses.error:
                pass  # Mouse event handling failed
        elif key in (curses.KEY_UP, ord('k')) and current_row > 0:
            current_row -= 1
        elif key in (curses.KEY_DOWN, ord('j')) and current_row < len(processes) - 1:
            current_row += 1
        elif key == ord(' '):  # Space to toggle selection
            selected[current_row] = not selected[current_row]
        elif key in (curses.KEY_ENTER, 10, 13):  # Enter to kill selected
            selected_pids = [processes[i]['pid'] for i, sel in enumerate(selected) if sel]
            if selected_pids:
                kill_selected_processes(stdscr, selected_pids, processes)
                break
        elif key == 27:  # ESC to cancel
            break


def kill_selected_processes(stdscr: curses.window, pids: List[str], processes: List[Dict[str, str]]) -> None:
    """Kill the selected processes by PID."""
    stdscr.clear()

    # Show confirmation
    safe_addstr(stdscr, 0, 0, f"🛑 Killing {len(pids)} selected process(es)...", COLORS["warning"])

    row = 2
    for pid in pids:
        # Find process info for this PID
        process_info = next((p for p in processes if p['pid'] == pid), None)
        if process_info:
            info = f"PID {pid}: {process_info['listen']} ({process_info['mode']}) - Started from: {process_info.get('started_from', '-')}"
        else:
            info = f"PID {pid}"
        safe_addstr(stdscr, row, 2, info, COLORS["field_value"])
        row += 1

    stdscr.refresh()

    # Kill processes using system kill command
    success_count = 0
    for pid in pids:
        try:
            result = subprocess.run(['kill', pid], capture_output=True, text=True)
            if result.returncode == 0:
                success_count += 1
                safe_addstr(stdscr, row, 2, f"✅ Killed PID {pid}", COLORS["success"])
            else:
                safe_addstr(stdscr, row, 2, f"❌ Failed to kill PID {pid}: {result.stderr.strip()}", COLORS["error"])
            row += 1
        except subprocess.SubprocessError as e:
            safe_addstr(stdscr, row, 2, f"❌ Error killing PID {pid}: {e}", COLORS["error"])
            row += 1

    # Summary
    row += 1
    safe_addstr(stdscr, row, 0, f"Killed {success_count}/{len(pids)} process(es). Press any key to return", COLORS["status"])
    stdscr.refresh()
    stdscr.getch()


def shlex_escape(value: str) -> str:
    if not value:
        return "''"
    if all(ch.isalnum() or ch in "@%_+=:,./-" for ch in value):
        return value
    return "'" + value.replace("'", "'\\''") + "'"


def draw_progress_bar(stdscr: curses.window, row: int, col: int, width: int, percent: float, style: str = "default") -> None:
    """Draw a modern progress bar with optional styles."""
    try:
        # Clamp percent between 0 and 100
        percent = max(0, min(100, percent))
        filled_width = int((width - 2) * (percent / 100))

        # Different style variations
        if style == "blocks":
            fill_char = "█"
            empty_char = "░"
            left_cap = "▕"
            right_cap = "▏"
        elif style == "dots":
            fill_char = "●"
            empty_char = "○"
            left_cap = "["
            right_cap = "]"
        elif style == "arrows":
            fill_char = "▶"
            empty_char = "▷"
            left_cap = "["
            right_cap = "]"
        else:  # default
            fill_char = "━"
            empty_char = "─"
            left_cap = "╾"
            right_cap = "╼"

        # Build progress bar
        filled = fill_char * filled_width
        empty = empty_char * (width - 2 - filled_width)
        bar = f"{left_cap}{filled}{empty}{right_cap}"

        # Color based on progress
        if percent < 30:
            color = COLORS["error"]
        elif percent < 70:
            color = COLORS["warning"]
        else:
            color = COLORS["success"]

        safe_addstr(stdscr, row, col, bar, color)

        # Add percentage text
        percent_text = f" {int(percent)}% "
        text_col = col + (width // 2) - (len(percent_text) // 2)
        safe_addstr(stdscr, row, text_col, percent_text, color | curses.A_BOLD)
    except curses.error:
        pass


def render_project_info_adaptive(stdscr: curses.window, row: int, width: int, max_height: int) -> int:
    """Render project information with adaptive height."""
    project_info = get_project_info()

    # Build content lines
    content_lines = []

    # Project name and path
    project_name = project_info.get("name", "Unknown")
    content_lines.append((f"📁 {project_name}", COLORS["title"], 4))

    path = project_info.get("path", "")
    if len(path) > width - 10:
        path = "..." + path[-(width - 13):]
    content_lines.append((f"📂 {path}", COLORS["field_value"], 4))

    # Add other info based on available space
    remaining_lines = max_height - 3  # Account for borders and basic info

    # Project files (show fewer on small screens)
    project_files = project_info.get("project_files", [])
    if remaining_lines > 0 and project_files:
        max_files = min(len(project_files), min(6, remaining_lines - 2))
        for project_file in project_files[:max_files]:
            content_lines.append((project_file, COLORS["field_value"], 6))
            remaining_lines -= 1

    # Web directories
    web_dirs = project_info.get("web_dirs", [])
    if remaining_lines > 0 and web_dirs:
        web_text = f"🌐 Web: {', '.join(web_dirs)}"
        content_lines.append((web_text[:width - 6], COLORS["field_value"], 4))
        remaining_lines -= 1

    # PHP files count
    php_files = project_info.get("php_files")
    if remaining_lines > 0 and php_files and php_files != "0":
        content_lines.append((f"🐘 PHP files: {php_files}", COLORS["field_value"], 4))
        remaining_lines -= 1

    # Size and file count (always show if space)
    if remaining_lines > 0:
        size = project_info.get("size", "?")
        file_count = project_info.get("file_count", "?")
        content_lines.append((f"📊 {file_count} files, {size}", COLORS["status"], 4))

    # Calculate actual box height
    actual_height = min(max_height, len(content_lines) + 2)

    # Draw box
    draw_box(stdscr, row, 1, actual_height, width, "Project Info")

    # Render content
    for i, (text, color, indent) in enumerate(content_lines):
        if i + 1 < actual_height - 1:  # Don't overflow box
            safe_addstr(stdscr, row + 1 + i, indent, text, color)

    return actual_height


def render_project_info_scrollable(stdscr: curses.window, row: int, width: int, max_height: int, panel: ScrollablePanel) -> int:
    """Render project information with scrollable content."""
    project_info = get_project_info()

    # Calculate actual content height needed
    content_lines = 2  # Title + path
    if project_info.get("project_files"):
        content_lines += min(len(project_info["project_files"]), 6)
    if project_info.get("web_dirs"):
        content_lines += 1
    if project_info.get("php_files") and project_info["php_files"] != "0":
        content_lines += 1
    if project_info.get("recommended_docroot"):
        content_lines += 1
    if project_info.get("phpup_configs"):
        content_lines += 1
    content_lines += 1  # Size/files line

    # Update panel with actual dimensions
    panel.content_height = content_lines
    panel.visible_height = max_height - 2  # Account for borders

    actual_height = min(max_height, content_lines + 2)  # +2 for borders

    # Draw box
    draw_box(stdscr, row, 1, actual_height, width, "Project Info")

    # Get visible content range
    start_line, end_line = panel.get_visible_range()

    # Render visible content
    content_row = row + 1
    current_content_line = 0

    # Build all content lines first
    content = []

    # Project name and path
    project_name = project_info.get("name", "Unknown")
    content.append((f"📁 {project_name}", COLORS["title"], 4))

    path = project_info.get("path", "")
    if len(path) > width - 10:
        path = "..." + path[-(width - 13):]
    content.append((f"📂 {path}", COLORS["field_value"], 4))

    # Project files
    project_files = project_info.get("project_files", [])
    for project_file in project_files[:6]:
        content.append((project_file, COLORS["field_value"], 6))

    # Web directories
    web_dirs = project_info.get("web_dirs", [])
    if web_dirs:
        web_text = f"🌐 Web: {', '.join(web_dirs)}"
        content.append((web_text[:width - 6], COLORS["field_value"], 4))

    # PHP files count
    php_files = project_info.get("php_files")
    if php_files and php_files != "0":
        content.append((f"🐘 PHP files: {php_files}", COLORS["field_value"], 4))

    # Recommended docroot
    recommended_docroot = project_info.get("recommended_docroot")
    if recommended_docroot:
        content.append((f"🎯 Suggested docroot: {recommended_docroot}", COLORS["success"], 4))

    # Config files
    phpup_configs = project_info.get("phpup_configs", [])
    if phpup_configs:
        configs_text = f"⚙️  Configs: {', '.join(phpup_configs[:3])}"
        content.append((configs_text[:width - 6], COLORS["field_value"], 4))

    # Size and file count
    size = project_info.get("size", "?")
    file_count = project_info.get("file_count", "?")
    content.append((f"📊 {file_count} files, {size}", COLORS["status"], 4))

    # Render only visible lines
    for i, (text, color, indent) in enumerate(content[start_line:end_line]):
        if content_row + i - row < actual_height - 1:  # Don't overflow box
            safe_addstr(stdscr, content_row + i, indent, text, color)

    # Draw scroll indicators if needed
    if panel.can_scroll_up():
        safe_addstr(stdscr, row, width - 3, "▲", COLORS["status"])
    if panel.can_scroll_down():
        safe_addstr(stdscr, row + actual_height - 1, width - 3, "▼", COLORS["status"])

    return actual_height


def render_project_info(stdscr: curses.window, row: int, width: int) -> int:
    """Render project information box and return the height used."""
    project_info = get_project_info()

    # Calculate box height based on content with modest padding
    content_lines = 2  # Title + path
    if project_info.get("project_files"):
        content_lines += min(len(project_info["project_files"]), 6)  # Max 6 project files
    if project_info.get("web_dirs"):
        content_lines += 1  # Web dirs line
    if project_info.get("php_files") and project_info["php_files"] != "0":
        content_lines += 1  # PHP files line
    if project_info.get("recommended_docroot"):
        content_lines += 1  # Recommended docroot line
    if project_info.get("phpup_configs"):
        content_lines += 1  # Config files line
    content_lines += 1  # Size/files line

    box_height = content_lines + 3  # Content + box borders

    # Draw project info box
    draw_box(stdscr, row, 1, box_height, width, "Project Info")

    current_row = row + 1

    # Project name and path
    project_name = project_info.get("name", "Unknown")
    safe_addstr(stdscr, current_row, 4, f"📁 {project_name}", COLORS["title"])
    current_row += 1

    # Path (truncated if too long)
    path = project_info.get("path", "")
    if len(path) > width - 10:
        path = "..." + path[-(width - 13):]
    safe_addstr(stdscr, current_row, 4, f"📂 {path}", COLORS["field_value"])
    current_row += 1

    # Project files
    project_files = project_info.get("project_files", [])
    for project_file in project_files[:6]:  # Max 6 to fit
        safe_addstr(stdscr, current_row, 6, project_file, COLORS["field_value"])
        current_row += 1

    # Web directories
    web_dirs = project_info.get("web_dirs", [])
    if web_dirs:
        web_text = f"🌐 Web: {', '.join(web_dirs)}"
        safe_addstr(stdscr, current_row, 4, web_text[:width - 6], COLORS["field_value"])
        current_row += 1

    # PHP files count
    php_files = project_info.get("php_files")
    if php_files and php_files != "0":
        safe_addstr(stdscr, current_row, 4, f"🐘 PHP files: {php_files}", COLORS["field_value"])
        current_row += 1

    # Recommended docroot
    recommended_docroot = project_info.get("recommended_docroot")
    if recommended_docroot:
        safe_addstr(stdscr, current_row, 4, f"🎯 Suggested docroot: {recommended_docroot}", COLORS["success"])
        current_row += 1

    # phpup configuration files
    phpup_configs = project_info.get("phpup_configs", [])
    if phpup_configs:
        configs_text = f"⚙️  Configs: {', '.join(phpup_configs[:3])}"  # Max 3 to fit
        safe_addstr(stdscr, current_row, 4, configs_text[:width - 6], COLORS["field_value"])
        current_row += 1

    # Size and file count
    size = project_info.get("size", "?")
    file_count = project_info.get("file_count", "?")
    safe_addstr(stdscr, current_row, 4, f"📊 {file_count} files, {size}", COLORS["status"])

    return box_height


def render_command_preview_adaptive(stdscr: curses.window, row: int, cfg: Config, show_init: bool, width: int, height: int) -> None:
    """Render command preview with adaptive height."""

    # Draw command preview box
    draw_box(stdscr, row, 1, height, width, "Command Preview")

    # Render main command
    cmd = cfg.build_command()
    if cmd and os.path.abspath(cmd[0]) == os.path.abspath(PHPUP_PATH):
        display_cmd = ["./phpup"] + cmd[1:]
    else:
        display_cmd = cmd
    preview = f"{ICONS['run']} " + " ".join(shlex_escape(arg) for arg in display_cmd)
    safe_addstr(stdscr, row + 1, 4, preview[:width - 6], COLORS["command"])

    # Render init command if needed and there's space
    if show_init and height >= 4:
        init_cmd = cfg.build_init_command()
        if init_cmd and os.path.abspath(init_cmd[0]) == os.path.abspath(PHPUP_PATH):
            init_display = ["./phpup"] + init_cmd[1:]
        else:
            init_display = init_cmd
        init_preview = f"{ICONS['init']} " + " ".join(shlex_escape(arg) for arg in init_display)
        safe_addstr(stdscr, row + 2, 4, init_preview[:width - 6], COLORS["warning"])


def render_command_preview(stdscr: curses.window, row: int, cfg: Config, show_init: bool) -> None:
    max_y, max_x = stdscr.getmaxyx()

    # Calculate box width (same as config box - 25% for actions)
    actions_width = max(30, max_x // 4)  # 25% of screen width
    box_width = max_x - actions_width - 5 if max_x > 80 else max_x - 2

    # Draw command preview box
    box_height = 4 if show_init else 3
    if row + box_height <= max_y:
        draw_box(stdscr, row, 1, box_height, box_width, "Command Preview")

    # Render main command
    cmd = cfg.build_command()
    if cmd and os.path.abspath(cmd[0]) == os.path.abspath(PHPUP_PATH):
        display_cmd = ["./phpup"] + cmd[1:]
    else:
        display_cmd = cmd
    preview = f"{ICONS['run']} " + " ".join(shlex_escape(arg) for arg in display_cmd)
    safe_addstr(stdscr, row + 1, 4, preview[:box_width - 6], COLORS["command"])

    # Render init command if needed
    if show_init:
        init_cmd = cfg.build_init_command()
        if init_cmd and os.path.abspath(init_cmd[0]) == os.path.abspath(PHPUP_PATH):
            init_display = ["./phpup"] + init_cmd[1:]
        else:
            init_display = init_cmd
        init_preview = f"{ICONS['init']} " + " ".join(shlex_escape(arg) for arg in init_display)
        safe_addstr(stdscr, row + 2, 4, init_preview[:box_width - 6], COLORS["warning"])


def curses_main(stdscr: curses.window) -> None:
    curses.curs_set(0)
    stdscr.nodelay(False)
    stdscr.keypad(True)

    # Enable mouse support
    try:
        curses.mousemask(curses.ALL_MOUSE_EVENTS | curses.REPORT_MOUSE_POSITION)
    except curses.error:
        pass  # Mouse not supported on this terminal

    init_colors()

    # Auto-detect docroot
    detected_docroot = detect_best_docroot()

    cfg = Config(
        host=TextField("Host", "127.0.0.1"),
        port=TextField("Port", "8000"),
        domain=TextField("Domain", ""),
        docroot=TextField("Docroot", detected_docroot, auto_detected=bool(detected_docroot)),
        php_threads=TextField("PHP Threads", "auto"),
        https=ChoiceField("HTTPS Mode", ["off", "local", "on"], 0),
        worker=ToggleField("Worker Mode", False),
        watch=ToggleField("Watch Mode", False),
        verbose=ToggleField("Verbose", False),
        open_browser=ToggleField("Open Browser", False),
        compression=ToggleField("Compression", True),
        extra_watch=TextField("Watch Patterns", ""),
        extra_args=TextField("Extra Args", ""),
    )

    fields = cfg.all_fields()
    selected_index = 0
    action_regions: List[ActionRegion] = []
    animation_frame = 0
    hovered_action = None  # Track which action button is hovered

    def handle_mouse_click(mouse_y: int, mouse_x: int) -> Optional[str]:
        """Handle mouse click and return the corresponding key if clicked on an action."""
        for region in action_regions:
            if region.contains_click(mouse_y, mouse_x):
                return region.key
        return None

    def handle_mouse_hover(mouse_y: int, mouse_x: int) -> Optional[str]:
        """Check if mouse is hovering over an action button."""
        for region in action_regions:
            if region.contains_click(mouse_y, mouse_x):
                return region.action
        return None

    while True:
        stdscr.erase()
        max_y, max_x = stdscr.getmaxyx()
        show_init = init_available()

        # Draw animated header
        draw_header(stdscr, show_init, animation_frame)
        animation_frame += 1

        # Calculate layout dimensions with improved responsiveness
        if max_x < 60:
            # Small screen: no actions panel, full width for content
            actions_width = 0
            config_width = max_x - 4
            show_actions = False
        else:
            # Normal screen: show actions panel
            actions_width = max(25, min(35, max_x // 4))  # Responsive width
            config_width = max_x - actions_width - 5
            show_actions = True

        # Draw project info box
        project_start_row = 2
        # Use adaptive rendering if screen is large enough, otherwise use regular
        if max_y >= 20:
            max_project_height = min(12, max_y // 3)
            project_info_height = render_project_info_adaptive(stdscr, project_start_row, config_width, max_project_height)
        else:
            project_info_height = render_project_info(stdscr, project_start_row, config_width)

        # Draw main configuration box below project info with adaptive height
        config_start_row = project_start_row + project_info_height + 1
        min_config_height = len(fields) + 5  # Minimum needed space
        available_height_for_config = max_y - config_start_row - 6  # Reserve space for preview
        config_height = max(min_config_height, min(min_config_height + 3, available_height_for_config))

        if config_start_row + config_height < max_y - 3:
            draw_box(stdscr, config_start_row, 1, config_height, config_width, "Server Configuration")

        # Draw section headers
        safe_addstr(stdscr, config_start_row + 1, 4, "── Basic Settings ──", COLORS["section"])
        safe_addstr(stdscr, config_start_row + 7, 4, "── Advanced Options ──", COLORS["section"])

        # Render fields with modest spacing
        field_start_row = config_start_row + 2
        for idx, field in enumerate(fields[:4]):
            field.render(stdscr, field_start_row + idx, selected_index == idx)

        for idx, field in enumerate(fields[4:], 4):
            offset = 1 if idx >= 4 else 0  # Add space after section header
            field.render(stdscr, field_start_row + idx + offset, selected_index == idx)

        # Draw actions panel on the right side (if screen is wide enough)
        if show_actions:
            actions_x = max_x - actions_width - 2
            actions_height = 11 if show_init else 9  # Content + separators + Stats action
            draw_box(stdscr, project_start_row, actions_x, actions_height, actions_width, "Actions")

            action_y = project_start_row + 1  # Modest padding

            if show_init:
                actions = [
                    ("F5", "Run", ICONS['run'], COLORS["success"]),
                    ("F6", "Test", ICONS['test'], COLORS["status"]),
                    ("---", "", "", ""),  # Separator
                    ("F2", "Init", ICONS['init'], COLORS["warning"]),
                    ("F4", "Processes", ICONS['list'], COLORS["status"]),
                    ("F7", "Stats", ICONS['stats'], COLORS["status"]),
                    ("F3", "Stop All", ICONS['stop'], COLORS["error"]),
                    ("---", "", "", ""),  # Separator
                    ("Q", "Quit", ICONS['quit'], COLORS["error"])
                ]
            else:
                actions = [
                    ("F5", "Run", ICONS['run'], COLORS["success"]),
                    ("F6", "Test", ICONS['test'], COLORS["status"]),
                    ("---", "", "", ""),  # Separator
                    ("F4", "Processes", ICONS['list'], COLORS["status"]),
                    ("F7", "Stats", ICONS['stats'], COLORS["status"]),
                    ("F3", "Stop All", ICONS['stop'], COLORS["error"]),
                    ("---", "", "", ""),  # Separator
                    ("Q", "Quit", ICONS['quit'], COLORS["error"])
                ]

            # Clear action regions for this frame
            action_regions.clear()

            # Layout for actions with separators
            for key, desc, icon, color in actions:
                if key == "---":  # Separator
                    # Draw a subtle separator line
                    separator_width = actions_width - 6
                    separator_line = "─" * separator_width
                    safe_addstr(stdscr, action_y, actions_x + 3, separator_line, COLORS["border"])
                    action_y += 1
                    continue

                # Make actions look more clickable with button-like appearance
                action_text = f"{icon}  {key:3} - {desc}"
                button_start = actions_x + 3  # Modest left padding
                button_end = button_start + len(action_text) + 1

                # Check if this button is hovered
                is_hovered = (hovered_action == desc)

                # Draw button with hover effect
                if is_hovered:
                    # Highlighted hover state with inverted colors
                    button_bg = f"▶ {action_text} ◀"
                    safe_addstr(stdscr, action_y, button_start - 1, button_bg, color | curses.A_REVERSE | curses.A_BOLD)
                else:
                    # Normal state
                    button_bg = " " + action_text + " "
                    safe_addstr(stdscr, action_y, button_start, button_bg, color)

                # Track this region for mouse clicks
                action_regions.append(ActionRegion(
                    key=key,
                    action=desc,
                    row=action_y,
                    col_start=button_start - 1,
                    col_end=button_end + 1
                ))
                action_y += 1

        # Render command preview below the main configuration box using remaining space
        command_preview_row = config_start_row + config_height + 1
        available_preview_space = max_y - command_preview_row - 1

        if available_preview_space >= 3:  # Minimum space needed
            if available_preview_space >= 5:
                # Use adaptive preview if there's enough space
                preview_height = min(5, available_preview_space)
                render_command_preview_adaptive(stdscr, command_preview_row, cfg, show_init, config_width, preview_height)
            else:
                # Use regular preview for smaller spaces
                render_command_preview(stdscr, command_preview_row, cfg, show_init)

        # Draw status line at bottom with key hints
        status_line = ""
        if show_init:
            status_line = "F2:Init F5:Run F6:Test F4:Processes F7:Stats F3:Stop Q:Quit"
        else:
            status_line = "F5:Run F6:Test F4:Processes F7:Stats F3:Stop Q:Quit"

        if not show_actions:
            # Show key hints when actions panel is hidden
            status_line += " | ↑↓:Navigate Enter:Edit"

        if len(status_line) < max_x - 2:
            safe_addstr(stdscr, max_y - 1, 1, status_line, COLORS["status"])

        stdscr.refresh()

        key = stdscr.getch()

        # Handle resize
        if key == curses.KEY_RESIZE:
            # Just continue to redraw with new dimensions
            continue

        # Handle mouse events
        if key == curses.KEY_MOUSE:
            try:
                _, mouse_x, mouse_y, _, mouse_state = curses.getmouse()

                # Update hover state
                hovered_action = handle_mouse_hover(mouse_y, mouse_x)

                if mouse_state & curses.BUTTON1_CLICKED:
                    # Handle action button clicks
                    clicked_key = handle_mouse_click(mouse_y, mouse_x)
                    if clicked_key:
                        # Simulate the corresponding function key press
                        if clicked_key == "F2" and show_init:
                            run_phpup_command(stdscr, cfg.build_init_command())
                        elif clicked_key == "F3":
                            run_phpup_command(stdscr, cfg.build_stop_command())
                        elif clicked_key == "F4":
                            unified_process_manager(stdscr)
                        elif clicked_key == "F7":
                            show_process_stats(stdscr)
                        elif clicked_key == "F5":
                            launch_phpup(stdscr, cfg, dry_run=False)
                        elif clicked_key == "F6":
                            launch_phpup(stdscr, cfg, dry_run=True)
                        elif clicked_key == "Q":
                            break
                        continue
                    # Check if click was on a configuration field for editing
                    field_start_row = config_start_row + 2
                    for idx, field in enumerate(fields):
                        field_row = field_start_row + idx + (1 if idx >= 4 else 0)
                        if mouse_y == field_row and 2 <= mouse_x <= config_width:
                            selected_index = idx
                            field.handle_input(stdscr)
                            break
            except curses.error:
                pass  # Mouse event handling failed
        elif key in (curses.KEY_UP, ord("k")):
            selected_index = (selected_index - 1) % len(fields)
        elif key in (curses.KEY_DOWN, ord("j")):
            selected_index = (selected_index + 1) % len(fields)
        elif key in (curses.KEY_ENTER, 10, 13):
            fields[selected_index].handle_input(stdscr)
        elif key == curses.KEY_F2 and show_init:
            run_phpup_command(stdscr, cfg.build_init_command())
        elif key == curses.KEY_F3:
            run_phpup_command(stdscr, cfg.build_stop_command())
        elif key == curses.KEY_F4:
            unified_process_manager(stdscr)
        elif key == curses.KEY_F7:
            show_process_stats(stdscr)
        elif key == curses.KEY_F5:
            launch_phpup(stdscr, cfg, dry_run=False)
        elif key == curses.KEY_F6:
            launch_phpup(stdscr, cfg, dry_run=True)
        elif key in (ord("r"), ord("R")):
            # Refresh project info (force re-scan)
            pass  # The info will be refreshed automatically on next draw
        elif key in (ord("q"), ord("Q")):
            break


def main() -> None:
    if not os.path.exists(PHPUP_PATH):
        sys.stderr.write(f"phpup script not found at expected path: {PHPUP_PATH}\n")
        sys.exit(1)
    curses.wrapper(curses_main)


if __name__ == "__main__":
    main()
