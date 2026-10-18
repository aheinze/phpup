"""Exercise the real hosts helper against a temporary file; never touches /etc/hosts."""
from pathlib import Path
import subprocess
import tempfile
import unittest

SOURCE = (Path(__file__).resolve().parents[1] / 'phpup').read_text()
HELPER = SOURCE[SOURCE.index('manage_hosts_entry() {'):SOURCE.index('\nis_port_free() {')]

class HostsTests(unittest.TestCase):
    def setUp(self):
        self.tmp = tempfile.TemporaryDirectory(prefix='phpup-hosts-')
        self.addCleanup(self.tmp.cleanup)
        self.hosts = Path(self.tmp.name) / 'hosts'

    def run_helper(self, script):
        prefix = 'set -euo pipefail\nlog() { :; }\ndebug() { :; }\ncommand_exists() { command -v "$1" >/dev/null; }\nHOSTS_ENTRY_ADDED=0\n'
        result = subprocess.run(['bash', '-c', prefix + HELPER + '\n' + script, 'test', str(self.hosts)], capture_output=True, text=True)
        self.assertEqual(result.returncode, 0, result.stderr)
        return result.stdout.strip()

    def test_existing_alias_is_not_owned_or_changed(self):
        original = '127.0.0.1 localhost app.test # user-managed\n'
        self.hosts.write_text(original)
        self.assertEqual(self.run_helper('manage_hosts_entry add app.test 127.0.0.1 "$1"; echo "$HOSTS_ENTRY_ADDED"'), '0')
        self.assertEqual(self.hosts.read_text(), original)

    def test_owned_entry_is_removed_without_touching_similar_names(self):
        original = '127.0.0.1 localhost\n127.0.0.1 not-app.test # phpup-managed\n127.0.0.1 appXtest # phpup-managed\n'
        self.hosts.write_text(original)
        self.assertEqual(self.run_helper('manage_hosts_entry add app.test 127.0.0.1 "$1"; echo "$HOSTS_ENTRY_ADDED"'), '1')
        self.assertIn('127.0.0.1 app.test # phpup-managed\n', self.hosts.read_text())
        self.run_helper('manage_hosts_entry remove app.test 127.0.0.1 "$1"')
        self.assertEqual(self.hosts.read_text(), original)

    def test_comments_do_not_count_as_aliases(self):
        self.hosts.write_text('127.0.0.1 localhost # app.test\n')
        self.assertEqual(self.run_helper('manage_hosts_entry add app.test 127.0.0.1 "$1"; echo "$HOSTS_ENTRY_ADDED"'), '1')

if __name__ == '__main__':
    unittest.main(verbosity=2)
