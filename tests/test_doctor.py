"""Read-only diagnostics contract, using the real FrankenPHP runtime."""
import json
import os
from pathlib import Path
import shutil
import socket
import subprocess
import tempfile
import unittest

PHPUP = Path(__file__).resolve().parents[1] / 'phpup'

@unittest.skipUnless(shutil.which('frankenphp'), 'requires FrankenPHP')
class DoctorTests(unittest.TestCase):
    def setUp(self):
        self.tmp = tempfile.TemporaryDirectory(prefix='phpup-doctor-')
        self.addCleanup(self.tmp.cleanup)
        self.root = Path(self.tmp.name)
        self.env = {**os.environ, 'XDG_RUNTIME_DIR': str(self.root)}
        self.env.pop('PORT', None)

    def run_cli(self, *args, env=None):
        return subprocess.run([str(PHPUP), *args], cwd=self.root, env=env or self.env, text=True, capture_output=True, timeout=20)

    def doctor(self, *args, env=None):
        before = {str(p): p.read_bytes() for p in self.root.rglob('*') if p.is_file()}
        result = self.run_cli('doctor', '--json', *args, env=env)
        report = json.loads(result.stdout)
        self.assertEqual(report['schemaVersion'], 1)
        self.assertEqual(report['project'], str(self.root))
        counts = {s: sum(c['status'] == s for c in report['checks']) for s in ['pass', 'warning', 'error']}
        self.assertEqual(report['summary'], dict(errors=counts['error'], warnings=counts['warning'], passes=counts['pass']))
        self.assertEqual(report['ok'], not counts['error'])
        self.assertEqual(result.returncode, 1 if counts['error'] else 0, result.stderr)
        self.assertEqual({str(p): p.read_bytes() for p in self.root.rglob('*') if p.is_file()}, before, 'doctor changed project files')
        self.assertFalse((self.root / f'phpup-{os.getuid()}').exists(), 'doctor created a registry')
        return {c['id']: c for c in report['checks']}

    def config(self, text):
        (self.root / '.phpup').mkdir(exist_ok=True)
        (self.root / '.phpup/config').write_text(text)

    def test_clean_project_and_human_output(self):
        checks = self.doctor()
        self.assertEqual(checks['runtime']['status'], 'pass')
        self.assertFalse((self.root / '.phpup').exists())
        result = self.run_cli('--doctor')
        self.assertEqual(result.returncode, 0, result.stderr)
        self.assertIn('[pass] FrankenPHP runtime: PHP ', result.stdout)
        self.assertNotIn('"schemaVersion"', result.stdout)

    def test_invalid_saved_settings_are_reported_together(self):
        self.config('PORT=bad\nWORKER_MODE=evil\nWORKER_MODE=bad\nHTTPS_MODE=invalid\nDOCROOT=missing\n')
        checks = self.doctor()
        for key in ['config.START_PORT', 'config.WORKER_MODE', 'config.HTTPS_MODE', 'docroot']:
            self.assertEqual(checks[key]['status'], 'error')
        self.assertEqual(checks['runtime']['status'], 'pass')

    def test_last_saved_value_wins_and_cli_override(self):
        self.config('PORT=bad\nPORT=9200\nWORKER_MODE=bad\nWORKER_MODE=0\n')
        checks = self.doctor('--port', '9201')
        self.assertEqual(checks['config']['status'], 'pass')
        self.assertIn('9201', checks['port']['message'])

    def test_required_extensions_lockfile_and_custom_vendor(self):
        (self.root / 'composer.json').write_text(json.dumps({'require': {'ext-json': '*'}, 'config': {'vendor-dir': "deps with ' quotes"}}))
        (self.root / 'composer.lock').write_text(json.dumps({'packages': [], 'packages-dev': [{'require': {'ext-phpup_missing': '*'}}]}))
        vendor = self.root / "deps with ' quotes"
        vendor.mkdir()
        (vendor / 'autoload.php').write_text('<?php file_put_contents("MUST_NOT_RUN", "bad");')
        checks = self.doctor()
        self.assertEqual(checks['extensions']['status'], 'error')
        self.assertIn('ext-phpup_missing', checks['extensions']['message'])
        self.assertEqual(checks['composer.vendor']['status'], 'pass')

    def test_invalid_composer_and_missing_vendor(self):
        (self.root / 'composer.json').write_text('{invalid')
        self.assertEqual(self.doctor()['composer.manifest.invalid']['status'], 'error')
        (self.root / 'composer.json').write_text('{}')
        self.assertEqual(self.doctor()['composer.vendor']['status'], 'warning')

    def test_project_ini_is_inspected(self):
        self.config('')
        (self.root / '.phpup/php.ini').write_text('memory_limit=384M\n')
        self.assertIn(str(self.root / '.phpup/php.ini'), self.doctor()['ini']['message'])

    def test_custom_caddy_syntax_is_checked_without_provisioning(self):
        (self.root / 'Caddyfile').write_text('{\n invalid_directive\n}\n')
        checks = self.doctor()
        self.assertEqual(checks['caddy.syntax']['status'], 'error')
        self.assertIn('invalid_directive', checks['caddy.syntax']['message'])
        (self.root / 'Caddyfile').write_text('{\n admin off\n}\nhttp://127.0.0.1:{$PORT} {\n respond "ok"\n log {\n output file MUST_NOT_CREATE/access.log\n }\n}\n')
        self.assertEqual(self.doctor()['caddy.syntax']['status'], 'pass')
        self.assertFalse((self.root / 'MUST_NOT_CREATE').exists())

    def test_custom_environment_and_ini_startup_warning(self):
        self.config('')
        (self.root / '.phpup/.env').write_text('SITE_REPLY=from-environment\n')
        (self.root / 'Caddyfile').write_text('{\n admin off\n}\nhttp://127.0.0.1:{$PORT} {\n respond {$SITE_REPLY}\n}\n')
        self.assertEqual(self.doctor()['caddy.syntax']['status'], 'pass')
        (self.root / '.phpup/php.ini').write_text('extension=phpup_missing_extension\nlog_errors=On\nerror_log="' + str(self.root / 'MUST_NOT_CREATE.log') + '"\n')
        self.assertEqual(self.doctor()['runtime.startup']['status'], 'warning')

    def test_busy_port_is_warning(self):
        with socket.socket() as sock:
            sock.bind(('127.0.0.1', 0))
            sock.listen()
            checks = self.doctor('--port', str(sock.getsockname()[1]))
        self.assertEqual(checks['port']['status'], 'warning')

    def test_unwritable_temp_parent_still_returns_json(self):
        checks = self.doctor(env={**self.env, 'TMPDIR': str(self.root / 'missing-temp')})
        self.assertEqual(checks['runtime']['status'], 'error')
        self.assertIn('temporary', checks['runtime']['message'])

    def test_missing_runtime_still_returns_json(self):
        path = self.root / 'bin'; path.mkdir()
        for cmd in ['bash', 'id', 'stat', 'date']:
            found = shutil.which(cmd)
            if found: (path / cmd).symlink_to(found)
        checks = self.doctor(env={**self.env, 'PATH': str(path)})
        self.assertEqual(checks['runtime']['status'], 'error')
        self.assertEqual(checks['curl']['status'], 'error')

    def test_local_https_missing_domain_and_broken_certificate(self):
        self.config('HTTPS_MODE=local\n')
        self.assertEqual(self.doctor()['tls.domain']['status'], 'warning')
        certs = self.root / '.phpup/certs'; certs.mkdir()
        (certs / 'site.test.pem').write_text('not a certificate')
        (certs / 'site.test-key.pem').write_text('not a key')
        self.config('HTTPS_MODE=local\nDOMAIN=site.test\n')
        self.assertEqual(self.doctor()['tls.cert']['status'], 'error')

    def test_mutating_modes_are_rejected(self):
        for flag in ['--init', '--save', '--install', '--build-php', '--stop', '--list', '--stats', '--force', '--dry-run']:
            result = self.run_cli('doctor', flag)
            self.assertEqual(result.returncode, 2, (flag, result.stderr))
        self.assertEqual(list(self.root.iterdir()), [])

    def test_json_escapes_control_characters_in_config(self):
        self.config('DOCROOT=bad\x01path\n')
        self.assertIn('\x01', self.doctor()['docroot']['message'])

if __name__ == '__main__':
    unittest.main(verbosity=2)
