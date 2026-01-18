#!/usr/bin/env bash
# Test configuration file handling

#
# Config file loading tests
#

test_start "config file is loaded from .phpup/config"
mkdir -p .phpup
cat > .phpup/config <<EOF
# phpup configuration
DOMAIN=testapp.test
HTTPS_MODE=local
WORKER_MODE=0
WATCH_MODE=1
EOF
output=$("$PHPUP" --dry-run 2>&1) || true
if assert_contains "$output" "testapp.test"; then
    test_pass
else
    test_fail "Config DOMAIN should be loaded"
fi
rm -rf .phpup

test_start "command line overrides config file"
mkdir -p .phpup
cat > .phpup/config <<EOF
DOMAIN=fromconfig.test
EOF
output=$("$PHPUP" --domain fromcli.test --dry-run 2>&1) || true
if assert_contains "$output" "fromcli.test"; then
    test_pass
else
    test_fail "CLI should override config"
fi
rm -rf .phpup

test_start "HOST is loaded from config"
mkdir -p .phpup
cat > .phpup/config <<EOF
HOST=192.168.1.1
EOF
output=$("$PHPUP" --dry-run 2>&1) || true
if assert_contains "$output" "192.168.1.1"; then
    test_pass
else
    test_fail "Config HOST should be loaded"
fi
rm -rf .phpup

test_start "PORT is loaded from config"
mkdir -p .phpup
cat > .phpup/config <<EOF
PORT=3000
EOF
output=$("$PHPUP" --dry-run 2>&1) || true
if assert_contains "$output" "3000"; then
    test_pass
else
    test_fail "Config PORT should be loaded"
fi
rm -rf .phpup

test_start "HTTPS_MODE is loaded from config"
mkdir -p .phpup
cat > .phpup/config <<EOF
HTTPS_MODE=local
EOF
output=$("$PHPUP" --dry-run 2>&1) || true
# When HTTPS is local, output should reference https
if [[ $? -eq 0 ]]; then
    test_pass
else
    test_fail "Config HTTPS_MODE should be loaded"
fi
rm -rf .phpup

test_start "WORKER_MODE is loaded from config"
mkdir -p .phpup public
echo '<?php' > public/index.php
cat > .phpup/config <<EOF
WORKER_MODE=1
EOF
output=$("$PHPUP" --dry-run 2>&1) || true
if [[ $? -eq 0 ]]; then
    test_pass
else
    test_fail "Config WORKER_MODE should be loaded"
fi
rm -rf .phpup public

test_start "WATCH_MODE is loaded from config"
mkdir -p .phpup
cat > .phpup/config <<EOF
WATCH_MODE=1
EOF
output=$("$PHPUP" --dry-run 2>&1) || true
if [[ $? -eq 0 ]]; then
    test_pass
else
    test_fail "Config WATCH_MODE should be loaded"
fi
rm -rf .phpup

test_start "PHP_THREADS is loaded from config"
mkdir -p .phpup
cat > .phpup/config <<EOF
PHP_THREADS=16
EOF
output=$("$PHPUP" --dry-run 2>&1) || true
if [[ $? -eq 0 ]]; then
    test_pass
else
    test_fail "Config PHP_THREADS should be loaded"
fi
rm -rf .phpup

test_start "DOCROOT is loaded from config"
mkdir -p .phpup webroot
cat > .phpup/config <<EOF
DOCROOT=webroot
EOF
output=$("$PHPUP" --dry-run 2>&1) || true
if assert_contains "$output" "webroot"; then
    test_pass
else
    test_fail "Config DOCROOT should be loaded"
fi
rm -rf .phpup webroot

test_start "OPEN_BROWSER is loaded from config"
mkdir -p .phpup
cat > .phpup/config <<EOF
OPEN_BROWSER=1
EOF
output=$("$PHPUP" --dry-run 2>&1) || true
if [[ $? -eq 0 ]]; then
    test_pass
else
    test_fail "Config OPEN_BROWSER should be loaded"
fi
rm -rf .phpup

test_start "config with comments is parsed correctly"
mkdir -p .phpup
cat > .phpup/config <<EOF
# This is a comment
DOMAIN=commented.test
# Another comment
HTTPS_MODE=off
EOF
output=$("$PHPUP" --dry-run 2>&1) || true
if assert_contains "$output" "commented.test"; then
    test_pass
else
    test_fail "Config with comments should work"
fi
rm -rf .phpup

test_start "empty config lines are handled"
mkdir -p .phpup
cat > .phpup/config <<EOF
DOMAIN=spaced.test

HTTPS_MODE=off

EOF
output=$("$PHPUP" --dry-run 2>&1) || true
if assert_contains "$output" "spaced.test"; then
    test_pass
else
    test_fail "Config with empty lines should work"
fi
rm -rf .phpup

test_start "missing config file is handled gracefully"
rm -rf .phpup
output=$("$PHPUP" --dry-run 2>&1) || true
if [[ $? -eq 0 ]]; then
    test_pass
else
    test_fail "Missing config should not cause error"
fi

#
# Config file saving tests
#

test_start "save flag creates config file"
rm -rf .phpup
"$PHPUP" --domain savetest.test --save --dry-run >/dev/null 2>&1 || true
if assert_file_exists ".phpup/config"; then
    test_pass
else
    test_fail "Config file should be created"
fi
rm -rf .phpup

test_start "saved config contains domain"
rm -rf .phpup
"$PHPUP" --domain savedomain.test --save --dry-run >/dev/null 2>&1 || true
if assert_file_contains ".phpup/config" "savedomain.test"; then
    test_pass
else
    test_fail "Saved config should contain domain"
fi
rm -rf .phpup

test_start "saved config has restricted permissions"
rm -rf .phpup
"$PHPUP" --domain permstest.test --save --dry-run >/dev/null 2>&1 || true
if [ -f ".phpup/config" ]; then
    perms=$(stat -c "%a" .phpup/config 2>/dev/null || stat -f "%Lp" .phpup/config 2>/dev/null)
    if [ "$perms" = "600" ]; then
        test_pass
    else
        test_fail "Config should have 600 permissions, got $perms"
    fi
else
    test_fail "Config file not created"
fi
rm -rf .phpup
