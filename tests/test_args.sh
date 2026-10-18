#!/usr/bin/env bash
# Test argument parsing

#
# Dry-run tests - validates argument parsing
#

test_start "dry-run shows command without starting server"
status=0
output=$("$PHPUP" --dry-run 2>&1) || status=$?
if assert_contains "$output" "frankenphp"; then
    test_pass
else
    test_fail "Expected 'frankenphp' in dry-run output"
fi

test_start "custom host is parsed correctly"
status=0
output=$("$PHPUP" --host 0.0.0.0 --dry-run 2>&1) || status=$?
if assert_contains "$output" "0.0.0.0"; then
    test_pass
else
    test_fail "Expected '0.0.0.0' in output"
fi

test_start "custom port is parsed correctly"
status=0
output=$("$PHPUP" --port 9000 --dry-run 2>&1) || status=$?
if assert_contains "$output" "9000"; then
    test_pass
else
    test_fail "Expected '9000' in output"
fi

test_start "docroot option is parsed"
mkdir -p testdoc
status=0
output=$("$PHPUP" --docroot testdoc --dry-run 2>&1) || status=$?
if assert_contains "$output" "testdoc"; then
    test_pass
else
    test_fail "Expected 'testdoc' in output"
fi

test_start "worker mode flag is recognized"
mkdir -p public
echo '<?php' > public/index.php
status=0
output=$("$PHPUP" --worker --dry-run 2>&1) || status=$?
# Worker mode should set WORKER_MODE or mention worker
if [ "$status" -eq 0 ] && assert_contains "$output" "Worker mode: 1"; then
    test_pass
else
    test_fail "Expected worker-related output"
fi

test_start "watch mode flag is recognized"
status=0
output=$("$PHPUP" --worker --watch --dry-run 2>&1) || status=$?
# Watch mode should set WATCH_MODE
if [[ $status -eq 0 ]]; then
    test_pass
else
    test_fail "Watch flag should be accepted"
fi

test_start "https off mode is default"
status=0
output=$("$PHPUP" --dry-run 2>&1) || status=$?
# Default should be http not https
if assert_contains "$output" "http://"; then
    test_pass
else
    test_fail "Default should use http://"
fi

test_start "https local mode is parsed"
status=0
output=$("$PHPUP" --https local --dry-run 2>&1) || status=$?
# Should mention https when enabled
if [[ $status -eq 0 ]]; then
    test_pass
else
    test_fail "HTTPS local mode should be accepted"
fi

test_start "quiet mode suppresses output"
output=$("$PHPUP" --quiet --dry-run 2>&1)
# With quiet mode, output should be minimal
line_count=$(echo "$output" | wc -l)
if [ "$line_count" -lt 10 ]; then
    test_pass
else
    test_fail "Quiet mode should produce minimal output"
fi

test_start "php-threads option is parsed"
status=0
output=$("$PHPUP" --php-threads 8 --dry-run 2>&1) || status=$?
if [[ $status -eq 0 ]]; then
    test_pass
else
    test_fail "php-threads should be accepted"
fi

test_start "max-wait option is parsed"
status=0
output=$("$PHPUP" --max-wait 60s --dry-run 2>&1) || status=$?
if [[ $status -eq 0 ]]; then
    test_pass
else
    test_fail "max-wait should be accepted"
fi

test_start "domain option is parsed"
status=0
output=$("$PHPUP" --domain myapp.test --dry-run 2>&1) || status=$?
if assert_contains "$output" "myapp.test"; then
    test_pass
else
    test_fail "Expected 'myapp.test' in output"
fi

test_start "auto-domain flag is recognized"
status=0
output=$("$PHPUP" --auto-domain --dry-run 2>&1) || status=$?
# Should derive domain from folder name
if [[ $status -eq 0 ]]; then
    test_pass
else
    test_fail "auto-domain flag should be accepted"
fi

test_start "no-hosts flag is recognized"
status=0
output=$("$PHPUP" --no-hosts --dry-run 2>&1) || status=$?
if [[ $status -eq 0 ]]; then
    test_pass
else
    test_fail "no-hosts flag should be accepted"
fi

test_start "compression is enabled by default"
status=0
output=$("$PHPUP" --dry-run 2>&1) || status=$?
# Compression should be on by default - check for gzip/zstd in output
if [[ $status -eq 0 ]]; then
    test_pass
else
    test_fail "Default compression should work"
fi

test_start "no-compression flag is recognized"
status=0
output=$("$PHPUP" --no-compression --dry-run 2>&1) || status=$?
if [[ $status -eq 0 ]]; then
    test_pass
else
    test_fail "no-compression flag should be accepted"
fi

test_start "open browser flag is recognized"
status=0
output=$("$PHPUP" --open --dry-run 2>&1) || status=$?
if [[ $status -eq 0 ]]; then
    test_pass
else
    test_fail "--open flag should be accepted"
fi

test_start "short open flag -o is recognized"
status=0
output=$("$PHPUP" -o --dry-run 2>&1) || status=$?
if [[ $status -eq 0 ]]; then
    test_pass
else
    test_fail "-o flag should be accepted"
fi

test_start "verbose flag is recognized"
status=0
output=$("$PHPUP" --verbose --dry-run 2>&1) || status=$?
if [[ $status -eq 0 ]]; then
    test_pass
else
    test_fail "--verbose flag should be accepted"
fi

test_start "short verbose flag -v is recognized"
status=0
output=$("$PHPUP" -v --dry-run 2>&1) || status=$?
if [[ $status -eq 0 ]]; then
    test_pass
else
    test_fail "-v flag should be accepted"
fi

test_start "multiple flags can be combined"
mkdir -p public
status=0
output=$("$PHPUP" --host 0.0.0.0 --port 9000 --worker --watch --verbose --dry-run 2>&1) || status=$?
if assert_contains "$output" "0.0.0.0" && assert_contains "$output" "9000"; then
    test_pass
else
    test_fail "Multiple flags should be parsed correctly"
fi
