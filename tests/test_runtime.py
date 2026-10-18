"""Real HTTP/process regressions. All files, registry state and servers are isolated."""
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

PHPUP = str(Path(__file__).resolve().parents[1] / "phpup")

@unittest.skipUnless(shutil.which("frankenphp") and shutil.which("curl"), "requires FrankenPHP and curl")
class RuntimeTests(unittest.TestCase):
    def setUp(self):
        self.tmp = tempfile.TemporaryDirectory(prefix="phpup-regression-")
        self.root = Path(self.tmp.name)
        self.env = {**os.environ, "XDG_RUNTIME_DIR": str(self.root), "XDG_CONFIG_HOME": str(self.root / "xdg"), "XDG_DATA_HOME": str(self.root / "data")}
        self.env.pop("PORT", None)
        self.procs = []
        self.logs = []

    def tearDown(self):
        for proc in self.procs:
            if proc.poll() is None:
                os.killpg(proc.pid, signal.SIGTERM)
                try:
                    proc.wait(timeout=8)
                except subprocess.TimeoutExpired:
                    os.killpg(proc.pid, signal.SIGKILL)
                    proc.wait()
        for log in self.logs:
            log.close()
        self.tmp.cleanup()

    def project(self, name="site", php='<?php echo json_encode(["memory"=>ini_get("memory_limit")]);'):
        path = self.root / name
        path.mkdir(parents=True)
        (path / "index.php").write_text(php)
        return path

    def run_cli(self, path, *args):
        return subprocess.run([PHPUP, *args], cwd=path, env=self.env, capture_output=True, text=True, timeout=15)

    def instances(self):
        result = self.run_cli(self.root, "--list", "--json")
        self.assertEqual(result.returncode, 0, result.stderr)
        return json.loads(result.stdout)

    def start(self, path, *args):
        with socket.socket() as sock:
            sock.bind(("127.0.0.1", 0))
            port = sock.getsockname()[1]
        log = tempfile.TemporaryFile(mode="w+")
        self.logs.append(log)
        proc = subprocess.Popen([PHPUP, "--port", str(port), "--no-hosts", "--no-open", *args], cwd=path, env=self.env, stdout=log, stderr=subprocess.STDOUT, start_new_session=True)
        self.procs.append(proc)
        for _ in range(100):
            if proc.poll() is not None:
                break
            instances = self.instances()
            found = next((item for item in instances if item["path"] == str(path)), None)
            if found:
                return proc, found, log
            time.sleep(.05)
        log.seek(0)
        self.fail("Server did not become ready: " + log.read())

    def fetch(self, url):
        try:
            with urllib.request.urlopen(url, timeout=2) as response:
                return response.status, response.read()
        except urllib.error.HTTPError as error:
            try:
                return error.code, error.read()
            finally:
                error.close()

    def stop(self, path, proc):
        result = self.run_cli(path, "--stop")
        self.assertEqual(result.returncode, 0, result.stderr)
        proc.wait(timeout=8)

    def test_default_listener_and_private_files(self):
        path = self.project()
        (path / ".env").write_text("EXAMPLE=synthetic")
        (path / ".git").mkdir()
        (path / ".git/config").write_text("synthetic")
        (path / "composer.json").write_text("{}")
        (path / "style.css").write_text("body { color: red; }")
        proc, instance, _ = self.start(path)
        self.assertEqual(self.fetch(instance["url"])[0], 200)
        for private in ["/.env", "/.git/config", "/composer.json", "/.phpup/runtime/validation.log", "/%2eenv"]:
            self.assertEqual(self.fetch(instance["url"] + private)[0], 404, private)
        self.assertEqual(self.fetch(instance["url"] + "/style.css")[0], 200)
        runtime = next((path / ".phpup/runtime").glob("Caddyfile.*"))
        adapted = subprocess.run(["frankenphp", "adapt", "--adapter", "caddyfile", "--config", str(runtime)], env={**self.env, "PHPUP_DIR": str(path / ".phpup")}, capture_output=True, text=True)
        data = json.loads(adapted.stdout)
        listeners = [addr for server in data["apps"]["http"]["servers"].values() for addr in server["listen"]]
        self.assertEqual(listeners, ["127.0.0.1:" + instance["port"]])
        self.stop(path, proc)
        self.assertEqual(self.instances(), [])
        self.assertFalse(list((path / ".phpup/runtime").glob("Caddyfile.*")))

    def test_relaunch_applies_config_and_project_ini(self):
        path = self.project("Developer's PHP Project", php='<?php echo json_encode(["memory"=>ini_get("memory_limit"), "scanned"=>php_ini_scanned_files()]);')
        self.assertEqual(self.run_cli(path, "--init").returncode, 0)
        ini = path / ".phpup/php.ini"
        ini.write_text(ini.read_text().replace("256M", "384M"))
        first, old, _ = self.start(path)
        settings = json.loads(self.fetch(old["url"])[1])
        self.assertEqual(settings["memory"], "384M")
        scanned = [name.strip() for name in settings["scanned"].split(",") if name.strip()]
        self.assertEqual(len(scanned), len(set(scanned)), "INI files should be loaded only once")
        self.assertIn(str(ini), scanned)
        self.stop(path, first)
        second, current, _ = self.start(path, "--php-threads", "8", "--no-compression")
        self.assertNotEqual(old["port"], current["port"])
        runtime = next((path / ".phpup/runtime").glob("Caddyfile.*"))
        content = runtime.read_text()
        self.assertIn("num_threads 8", content)
        self.assertNotIn("encode zstd", content)
        self.assertEqual(self.fetch(current["url"])[0], 200)
        self.stop(path, second)

    def test_stopping_one_project_preserves_another(self):
        a, b = self.project("one/site"), self.project("two/site")
        pa, ia, _ = self.start(a)
        pb, ib, _ = self.start(b)
        self.stop(a, pa)
        self.assertIsNone(pb.poll())
        self.assertEqual(self.fetch(ib["url"])[0], 200)
        self.assertEqual([i["path"] for i in self.instances()], [str(b)])
        self.stop(b, pb)

    def test_invalid_config_fails_with_diagnostic_without_registry(self):
        path = self.project()
        (path / "Caddyfile").write_text("{ invalid_directive }")
        result = self.run_cli(path)
        self.assertNotEqual(result.returncode, 0)
        self.assertIn("adapting config", result.stderr.lower())
        self.assertEqual(self.instances(), [])
        self.assertEqual((path / "Caddyfile").read_text(), "{ invalid_directive }")

    def test_dry_run_never_writes_or_elevates(self):
        path = self.project()
        before = {p.name: p.read_bytes() for p in path.iterdir()}
        result = self.run_cli(path, "--domain", "review.test", "--https", "local", "--save", "--dry-run")
        self.assertEqual(result.returncode, 0, result.stderr)
        self.assertIn("review.test", result.stdout)
        self.assertEqual(before, {p.name: p.read_bytes() for p in path.iterdir()})

    def test_invalid_inputs_and_worker_mode(self):
        path = self.project()
        for args in [("--port",), ("--port", "65536"), ("--watch",), ("--docroot", "missing"), ("--all",), ("--json",), ("--stop", "--dry-run"), ("--install", "--dry-run")]:
            result = self.run_cli(path, *args)
            self.assertEqual(result.returncode, 2, result.stderr)
            self.assertNotIn("unbound", result.stderr)
        (path / ".phpup").mkdir()
        (path / ".phpup/config").write_text("PORT=oops\n")
        self.assertEqual(self.run_cli(path, "--dry-run").returncode, 2)

    def test_save_roundtrip_preserves_host_port_and_spaces(self):
        path = self.project("with spaces")
        result = self.run_cli(path, "--init", "--host", "localhost", "--port", "9001")
        self.assertEqual(result.returncode, 0, result.stderr)
        content = (path / ".phpup/config").read_text()
        self.assertIn("HOST=localhost", content)
        self.assertIn("PORT=9001", content)
        result = self.run_cli(path, "--dry-run")
        self.assertIn("http://localhost:9001", result.stdout)
        self.assertIn(str(path), result.stdout)

    def test_stale_registry_cannot_stop_an_unrelated_process(self):
        path = self.project()
        unrelated = subprocess.Popen(["sleep", "30"], start_new_session=True)
        self.procs.append(unrelated)
        registry = self.root / f"phpup-{os.getuid()}"
        registry.mkdir(mode=0o700)
        (registry / "stale.state").write_text(f"{unrelated.pid}\nwrong token\n{path}\n8000\nhttp://127.0.0.1:8000\n{unrelated.pid}\nwrong token\n")
        self.assertEqual(self.instances(), [])
        self.run_cli(path, "--stop")
        self.assertIsNone(unrelated.poll())

    def test_port_conflict_selects_and_reports_actual_port(self):
        path = self.project()
        with socket.socket() as occupied:
            occupied.bind(("127.0.0.1", 0))
            occupied.listen()
            original = occupied.getsockname()[1]
            proc, instance, _ = self.start(path, "--port", str(original))
            self.assertGreater(int(instance["port"]), original)
            self.assertEqual(self.fetch(instance["url"])[0], 200)
            self.stop(path, proc)

    def test_subfolder_routes_preserve_static_files_and_private_filter(self):
        path = self.project(php='<?php echo "MAIN";')
        (path / "admin").mkdir()
        (path / "admin/index.php").write_text('<?php echo "ADMIN";')
        (path / "admin/style.css").write_text("STATIC")
        (path / "admin/.env").write_text("synthetic")
        proc, instance, _ = self.start(path)
        self.assertEqual(self.fetch(instance["url"] + "/admin/users")[1], b"ADMIN")
        self.assertEqual(self.fetch(instance["url"] + "/admin/style.css")[1], b"STATIC")
        self.assertEqual(self.fetch(instance["url"] + "/admin/.env")[0], 404)
        self.assertEqual(self.fetch(instance["url"] + "/unknown/route")[1], b"MAIN")
        self.stop(path, proc)

    def test_paths_with_quotes_use_literal_log_and_ini_paths(self):
        path = self.project('PHP "quoted" project', php='<?php echo json_encode(["log"=>ini_get("error_log"), "sessions"=>ini_get("session.save_path")]);')
        for initialized in [False, True]:
            if initialized:
                self.assertEqual(self.run_cli(path, "--init").returncode, 0)
            proc, instance, _ = self.start(path)
            settings = json.loads(self.fetch(instance["url"])[1])
            self.assertEqual(settings["log"], str(path / ".phpup/php_errors.log"))
            self.assertEqual(settings["sessions"], str(path / ".phpup/sessions"))
            self.stop(path, proc)

    def test_custom_caddyfile_is_validated_and_preserved(self):
        path = self.project()
        custom = path / "Caddyfile"
        content = '{\n admin off\n auto_https off\n}\nhttp://{$HOST}:{$PORT} {\n bind 127.0.0.1\n respond "CUSTOM"\n}\n'
        custom.write_text(content)
        proc, instance, _ = self.start(path)
        self.assertEqual(self.fetch(instance["url"])[1], b"CUSTOM")
        self.assertEqual(custom.read_text(), content)
        self.stop(path, proc)

    def test_ipv6_loopback_readiness(self):
        try:
            with socket.socket(socket.AF_INET6) as sock:
                sock.bind(("::1", 0))
        except OSError:
            self.skipTest("IPv6 loopback unavailable")
        path = self.project()
        proc, instance, _ = self.start(path, "--host", "::1")
        self.assertTrue(instance["url"].startswith("http://[::1]:"))
        result = subprocess.run(["curl", "--noproxy", "*", "-fsS", instance["url"]], capture_output=True, timeout=3)
        self.assertEqual(result.returncode, 0, result.stderr)
        self.stop(path, proc)

    def test_stop_all_does_not_stop_unmanaged_frankenphp(self):
        path = self.project()
        with socket.socket() as sock:
            sock.bind(("127.0.0.1", 0))
            port = sock.getsockname()[1]
        custom = self.root / "unmanaged.caddy"
        custom.write_text('{\n admin off\n auto_https off\n}\nhttp://127.0.0.1:' + str(port) + ' {\n respond "UNMANAGED"\n}\n')
        unmanaged = subprocess.Popen(["frankenphp", "run", "--config", str(custom), "--adapter", "caddyfile"], stdout=subprocess.DEVNULL, stderr=subprocess.DEVNULL, start_new_session=True, env=self.env)
        self.procs.append(unmanaged)
        proc, _, _ = self.start(path)
        result = self.run_cli(path, "--stop", "--all")
        self.assertEqual(result.returncode, 0, result.stderr)
        proc.wait(timeout=8)
        self.assertIsNone(unmanaged.poll())
        self.assertEqual(self.fetch(f"http://127.0.0.1:{port}")[1], b"UNMANAGED")

    @unittest.skipUnless(shutil.which("mkcert") and shutil.which("openssl"), "requires mkcert and openssl")
    def test_local_https_with_isolated_ca(self):
        path = self.project(php='<?php echo "TLS_OK";')
        self.env.update(CAROOT=str(self.root / "ca"), TRUST_STORES="none")
        # Creating a CA does not install it into any system or browser trust store.
        created = subprocess.run(["mkcert", "-cert-file", str(self.root / "warm.pem"), "-key-file", str(self.root / "warm-key.pem"), "localhost"], env=self.env, capture_output=True)
        self.assertEqual(created.returncode, 0, created.stderr)
        proc, instance, _ = self.start(path, "--domain", "phpup-test.test", "--https", "local")
        args = ["curl", "--noproxy", "*", "--silent", "--show-error", "--resolve", "phpup-test.test:" + instance["port"] + ":127.0.0.1"]
        response = subprocess.run([*args, "--cacert", str(self.root / "ca/rootCA.pem"), instance["url"]], capture_output=True, timeout=5)
        self.assertEqual(response.returncode, 0, response.stderr)
        self.assertEqual(response.stdout, b"TLS_OK")
        untrusted = subprocess.run([*args, instance["url"]], capture_output=True, timeout=5)
        self.assertNotEqual(untrusted.returncode, 0, "The isolated CA must not be globally trusted")
        report = self.run_cli(path, "doctor", "--json", "--domain", "phpup-test.test", "--https", "local")
        checks = {c["id"]: c for c in json.loads(report.stdout)["checks"]}
        self.assertEqual(checks["tls.cert"]["status"], "pass")
        self.assertEqual(checks["tls.ca"]["status"], "warning")
        self.stop(path, proc)
        self.assertEqual(self.instances(), [])

    def test_verbose_streams_php_errors_and_cleans_up_log_follower(self):
        path = self.project(php='<?php if (isset($_GET["warn"])) trigger_error("PHPUP_LIVE_WARNING", E_USER_WARNING); echo "LIVE_OK";')
        self.assertEqual(self.run_cli(path, "--init").returncode, 0)
        proc, instance, log = self.start(path, "--verbose")
        self.fetch(instance["url"] + "/?warn=1")
        output = ""
        for _ in range(80):
            log.seek(0)
            output = log.read()
            if "PHPUP_LIVE_WARNING" in output: break
            time.sleep(.1)
        self.assertIn("PHPUP_LIVE_WARNING", output)
        children_path = Path(f"/proc/{proc.pid}/task/{proc.pid}/children")
        children = children_path.read_text().split() if children_path.exists() else []
        followers = [pid for pid in children if Path(f"/proc/{pid}/comm").exists() and Path(f"/proc/{pid}/comm").read_text().strip() == "tail"]
        if children_path.exists(): self.assertTrue(followers)
        self.stop(path, proc)
        for pid in followers:
            self.assertFalse(Path(f"/proc/{pid}").exists(), "Log follower survived shutdown")

    def test_worker_with_valid_handler(self):
        path = self.project(php='<?php while (frankenphp_handle_request(function () { echo "WORKER_OK"; })) {}')
        proc, instance, _ = self.start(path, "--worker", "--watch")
        self.assertEqual(self.fetch(instance["url"])[1], b"WORKER_OK")
        self.stop(path, proc)

if __name__ == "__main__":
    unittest.main(verbosity=2)
