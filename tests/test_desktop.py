"""Native Tauri/WebKit smoke tests. Requires a built debug app and tauri-driver."""
import base64
import json
import os
from pathlib import Path
import shutil
import signal
import socket
import subprocess
import tempfile
import time
import unittest
import urllib.error
import urllib.request

ROOT = Path(__file__).resolve().parents[1]
APP = ROOT / "desktop/src-tauri/target/debug/PHPUp"
ELEMENT = "element-6066-11e4-a52e-4f735466cecf"

def free_port():
    with socket.socket() as sock:
        sock.bind(("127.0.0.1", 0))
        return sock.getsockname()[1]

@unittest.skipUnless(APP.exists() and all(shutil.which(c) for c in ["tauri-driver", "WebKitWebDriver", "xvfb-run", "frankenphp"]), "requires built desktop, tauri-driver, WebKitWebDriver, Xvfb and FrankenPHP")
class DesktopTests(unittest.TestCase):
    def setUp(self):
        self.tmp = tempfile.TemporaryDirectory(prefix="phpup-native-")
        self.root = Path(self.tmp.name)
        self.addCleanup(self.tmp.cleanup)
        self.env = {**os.environ, "PHPUP_DESKTOP_CONFIG_DIR": str(self.root / "desktop"), "XDG_RUNTIME_DIR": str(self.root / "runtime"), "XDG_DATA_HOME": str(self.root / "data"), "XDG_CACHE_HOME": str(self.root / "cache"), "GDK_BACKEND": "x11", "WEBKIT_DISABLE_COMPOSITING_MODE": "1"}
        (self.root / "runtime").mkdir(mode=0o700)
        (self.root / "desktop").mkdir()
        self.projects = []
        start_port = free_port()
        for name in ["Alpha", "Beta", "Broken", "Unconfigured", "Grouped"]:
            path = self.root / name
            path.mkdir()
            (path / "index.php").write_text('<?php echo "' + name + '";')
            if name != "Unconfigured":
                subprocess.run([str(ROOT / "phpup"), "--init", "--port", str(start_port)], cwd=path, env=self.env, check=True, capture_output=True)
            self.projects.append(dict(id=name, name=name, path=str(path), port=str(start_port), docroot=str(path), hasConfig=name != "Unconfigured", isRunning=False, status="stopped"))
        self.projects[-1]["groupId"] = "group"
        (self.root / "Broken/Caddyfile").write_text("{\n invalid_directive\n}\n")
        (self.root / "desktop/projects.json").write_text(json.dumps(dict(projects=self.projects, groups=[dict(id="group", name="Archived projects", collapsed=True)])))
        self.log = tempfile.TemporaryFile(mode="w+")
        self.addCleanup(self.log.close)
        self.session = None
        self.base = f"http://127.0.0.1:{free_port()}"
        self.driver = subprocess.Popen(["xvfb-run", "-a", "-s", "-screen 0 1280x900x24", "tauri-driver", "--port", self.base.rsplit(":", 1)[1], "--native-port", str(free_port()), "--native-driver", shutil.which("WebKitWebDriver")], env=self.env, stdout=self.log, stderr=subprocess.STDOUT, start_new_session=True)
        self.addCleanup(self.cleanup_driver)
        self.wait(lambda: self.request("GET", "/status"), timeout=15)
        data = self.request("POST", "/session", {"capabilities": {"alwaysMatch": {"browserName": "wry", "tauri:options": {"application": str(APP)}}}})
        self.session = data["sessionId"]
        self.wait(lambda: "Alpha" in self.text("body"))

    def cleanup_driver(self):
        subprocess.run([str(ROOT / "phpup"), "--stop", "--all"], cwd=self.root, env=self.env, capture_output=True, timeout=15)
        if self.session:
            try: self.request("DELETE", f"/session/{self.session}")
            except Exception: pass
        if self.driver.poll() is None:
            os.killpg(self.driver.pid, signal.SIGTERM)
            try: self.driver.wait(timeout=5)
            except subprocess.TimeoutExpired:
                os.killpg(self.driver.pid, signal.SIGKILL)
                self.driver.wait()

    def request(self, method, path, body=None):
        request = urllib.request.Request(self.base + path, data=None if body is None else json.dumps(body).encode(), headers={"Content-Type": "application/json"}, method=method)
        try:
            with urllib.request.urlopen(request, timeout=30) as response: return json.load(response)["value"]
        except urllib.error.HTTPError as error:
            with error: raise AssertionError(error.read().decode()) from error

    def call(self, method, path, body=None):
        return self.request(method, f"/session/{self.session}" + path, body)

    def element(self, css):
        return self.call("POST", "/element", {"using": "css selector", "value": css})[ELEMENT]

    def text(self, css):
        return self.call("POST", "/execute/sync", {"script": "return document.querySelector(arguments[0])?.textContent || ''", "args": [css]})

    def click(self, css):
        self.call("POST", f"/element/{self.element(css)}/click", {})

    def type(self, css, value):
        self.click(css)
        self.shortcut("a")
        self.call("POST", f"/element/{self.element(css)}/value", {"text": value})

    def shortcut(self, key, shift=False):
        modifiers = ["\ue009"] + (["\ue008"] if shift else [])
        actions = [{"type": "keyDown", "value": m} for m in modifiers]
        actions += [{"type": "keyDown", "value": key}, {"type": "keyUp", "value": key}]
        actions += [{"type": "keyUp", "value": m} for m in reversed(modifiers)]
        self.call("POST", "/actions", {"actions": [{"type": "key", "id": "keyboard", "actions": actions}]})

    def wait(self, fn, timeout=12):
        last = None
        deadline = time.monotonic() + timeout
        while time.monotonic() < deadline:
            try:
                value = fn()
                if value: return value
            except Exception as error: last = error
            time.sleep(.1)
        self.log.seek(0)
        body = self.text("body") if self.session else "No session"
        self.snapshot("failure") if self.session else None
        self.fail(f"Timed out: {last}\n{body}\n{self.log.read()[-5000:]}")

    def select(self, index):
        self.click(f'[data-project-id="{self.projects[index - 1]["id"]}"] .project-name')
        self.wait(lambda: self.projects[index - 1]["name"] in self.text(".project-header"))

    def instances(self):
        result = subprocess.run([str(ROOT / "phpup"), "--list", "--json"], cwd=self.root, env=self.env, capture_output=True, text=True, check=True)
        return json.loads(result.stdout)

    def snapshot(self, name):
        # Let Vue updates and short theme transitions paint before capturing WebKit.
        self.call("POST", "/execute/async", {"script": "const done = arguments[arguments.length - 1]; requestAnimationFrame(() => requestAnimationFrame(() => setTimeout(() => done(null), 200)));", "args": []})
        directory = os.environ.get("PHPUP_TEST_ARTIFACT_DIR")
        if directory:
            path = Path(directory)
            path.mkdir(parents=True, exist_ok=True)
            (path / f"{name}.png").write_bytes(base64.b64decode(self.call("GET", "/screenshot")))

    def test_multiple_projects_restart_and_close(self):
        self.select(1)
        self.wait(lambda: "Checks passed" in self.text(".doctor-panel"))
        self.snapshot("desktop-diagnostics")
        self.click('.project-header button[title="Start"]')
        self.wait(lambda: self.text(".status-badge") == "Running")
        self.click('[data-project-id="Beta"] button[title="Start"]')
        self.wait(lambda: len(self.instances()) == 2)
        records = self.instances()
        self.assertEqual(len({item["port"] for item in records}), 2)
        for item in records:
            with urllib.request.urlopen(item["url"], timeout=3) as response:
                self.assertEqual(response.read().decode(), Path(item["path"]).name)
        self.click('.project-header button[title="Stop"]')
        self.wait(lambda: self.text(".status-badge") == "Stopped")
        self.assertEqual(len(self.instances()), 1)
        self.click('.project-header button[title="Start"]')
        self.wait(lambda: self.text(".status-badge") == "Running")
        self.click('.traffic-btn[title="Close"]')
        self.wait(lambda: "2 servers" in self.text(".modal"))
        self.click(".modal .btn-danger")
        self.wait(lambda: len(self.instances()) == 0)

    def test_keyboard_search_includes_collapsed_groups_and_empty_results(self):
        self.shortcut("k")
        self.assertEqual(self.call("POST", "/execute/sync", {"script": "return document.activeElement.getAttribute('aria-label')", "args": []}), "Find project")
        self.type('.search-input', "grouped")
        self.wait(lambda: "Grouped" in self.text(".project-list"))
        self.call("POST", f"/element/{self.element('.search-input')}/value", {"text": "\ue007"})
        self.wait(lambda: "Grouped" in self.text(".project-header"))
        self.assertEqual(self.call("POST", "/execute/sync", {"script": "return document.querySelectorAll('.project-item').length", "args": []}), 1)
        self.type('.search-input', "no-such-project")
        self.shortcut("\ue007")
        self.assertEqual(self.instances(), [], "Server shortcuts must not fire while typing in search")
        self.wait(lambda: "No matching projects" in self.text(".project-list"))
        self.snapshot("daily-search-empty")
        self.click('.clear-search')
        self.wait(lambda: "Alpha" in self.text(".project-list"))
        self.assertNotIn("Grouped", self.text(".project-list"), "Searching must not persistently expand a group")
        self.select(1)
        self.call("POST", f"/element/{self.element('[data-project-id=Alpha] .project-name')}/value", {"text": "\ue032"})
        self.type('.project-name-input', 'Renamed Alpha')
        self.call("POST", f"/element/{self.element('.project-name-input')}/value", {"text": "\ue007"})
        self.wait(lambda: "Renamed Alpha" in self.text('[data-project-id=Alpha]'))
        self.wait(lambda: json.loads((self.root / 'desktop/projects.json').read_text())['projects'][0]['name'] == 'Renamed Alpha')

    def test_restart_shortcuts_and_live_php_logs(self):
        (self.root / "Alpha/index.php").write_text('<?php if (isset($_GET["warn"])) trigger_error("DAILY_PHP_WARNING", E_USER_WARNING); echo "Alpha";')
        self.select(1)
        self.shortcut("\ue007")
        self.wait(lambda: self.text('.status-badge').strip() == 'Running')
        old = self.instances()[0]
        with urllib.request.urlopen(old['url'] + '/?warn=1', timeout=3) as response: response.read()
        self.wait(lambda: "DAILY_PHP_WARNING" in self.text('.console-output'))
        self.type('input[aria-label="Search logs"]', 'DAILY_PHP_WARNING')
        self.click('.console-filters input[type="checkbox"]')
        self.assertIn('DAILY_PHP_WARNING', self.text('.console-output'))
        self.assertNotIn('Starting server', self.text('.console-output'))
        self.click('button[title="Copy visible logs"]')
        self.wait(lambda: 'Visible logs copied' in self.text('.console'))
        self.click('button[title="Follow new log messages"]')
        self.assertIn('Following paused', self.text('.console'))
        self.snapshot('daily-running-logs')
        self.call('POST', '/window/rect', {'width': 600, 'height': 700})
        self.call('POST', '/execute/sync', {'script': 'document.documentElement.setAttribute("data-theme", "light")', 'args': []})
        self.snapshot('daily-small-light')
        self.assertTrue(self.call('POST', '/execute/sync', {'script': 'return document.documentElement.scrollWidth <= window.innerWidth', 'args': []}))
        self.call('POST', '/window/rect', {'width': 900, 'height': 700})
        self.select(1)
        self.shortcut('r', shift=True)
        self.wait(lambda: len(self.instances()) == 1 and self.instances()[0]['pid'] != old['pid'])
        self.wait(lambda: self.text('.status-badge').strip() == 'Running')
        self.assertIn(self.instances()[0]['url'], self.text('.url-cell'))
        self.shortcut('\ue007')
        self.wait(lambda: self.instances() == [])

    def test_last_project_and_sidebar_width_survive_relaunch(self):
        self.select(2)
        element = self.element('.resize-handle')
        self.call('POST', f'/element/{element}/value', {'text': '\ue014'})
        state = self.root / 'desktop/projects.json'
        self.wait(lambda: json.loads(state.read_text()).get('ui', {}).get('selectedProjectId') == 'Beta')
        self.wait(lambda: json.loads(state.read_text())['ui']['sidebarWidth'] == 240)
        self.request('DELETE', f'/session/{self.session}')
        self.session = None
        data = self.request('POST', '/session', {'capabilities': {'alwaysMatch': {'browserName': 'wry', 'tauri:options': {'application': str(APP)}}}})
        self.session = data['sessionId']
        self.wait(lambda: 'Beta' in self.text('.project-header'))
        self.assertEqual(self.call('POST', '/execute/sync', {'script': 'return document.querySelector(".sidebar").style.width', 'args': []}), '240px')
        self.assertEqual(self.instances(), [])

    def test_unconfigured_project_has_read_only_diagnostics(self):
        self.select(4)
        self.wait(lambda: "Checks passed" in self.text(".doctor-panel"))
        self.assertIn("hasn’t been configured".replace("’", "'"), self.text(".init-card"))
        self.assertFalse((self.root / "Unconfigured/.phpup").exists())

    def test_diagnostics_refresh_and_project_switch(self):
        self.select(1)
        self.wait(lambda: "Checks passed" in self.text(".doctor-panel"))
        (self.root / "Alpha/composer.json").write_text(json.dumps({"require": {"ext-phpup_missing": "*"}}))
        self.click(".doctor-header button")
        self.wait(lambda: "ext-phpup_missing" in self.text(".doctor-panel"))
        self.select(2)
        self.wait(lambda: "Checks passed" in self.text(".doctor-panel"))
        self.assertNotIn("ext-phpup_missing", self.text(".doctor-panel"))
        self.select(1)
        self.wait(lambda: "ext-phpup_missing" in self.text(".doctor-panel"))

    def test_failed_launch_retains_log_after_project_switch(self):
        self.select(3)
        self.wait(lambda: "Caddyfile syntax" in self.text(".doctor-panel"))
        self.snapshot("desktop-diagnostics-error")
        self.click('.project-header button[title="Start"]')
        self.wait(lambda: self.text(".status-badge").strip() == "Crashed")
        self.assertIn("invalid_directive", self.text("body"))
        self.select(1)
        self.select(3)
        self.assertIn("invalid_directive", self.text("body"))
        self.assertEqual(self.instances(), [])

if __name__ == "__main__":
    unittest.main(verbosity=2)
