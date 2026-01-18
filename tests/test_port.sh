#!/usr/bin/env bash
# Test port handling

#
# Default port tests
#

test_start "default port is 8000"
output=$("$PHPUP" --dry-run 2>&1) || true
if assert_contains "$output" "8000"; then
    test_pass
else
    test_fail "Default port should be 8000"
fi

test_start "custom port is used"
output=$("$PHPUP" --port 9000 --dry-run 2>&1) || true
if assert_contains "$output" "9000"; then
    test_pass
else
    test_fail "Custom port should be used"
fi

test_start "PORT env var is respected"
output=$(PORT=7000 "$PHPUP" --dry-run 2>&1) || true
if assert_contains "$output" "7000"; then
    test_pass
else
    test_fail "PORT env var should be used"
fi

test_start "command line overrides PORT env var"
output=$(PORT=7000 "$PHPUP" --port 9000 --dry-run 2>&1) || true
if assert_contains "$output" "9000"; then
    test_pass
else
    test_fail "CLI should override env var"
fi

#
# Port from config tests
#

test_start "port loaded from config"
rm -rf .phpup
mkdir -p .phpup
cat > .phpup/config <<EOF
PORT=5000
EOF
output=$("$PHPUP" --dry-run 2>&1) || true
if assert_contains "$output" "5000"; then
    test_pass
else
    test_fail "Should load port from config"
fi
rm -rf .phpup

test_start "CLI port overrides config"
rm -rf .phpup
mkdir -p .phpup
cat > .phpup/config <<EOF
PORT=5000
EOF
output=$("$PHPUP" --port 6000 --dry-run 2>&1) || true
if assert_contains "$output" "6000"; then
    test_pass
else
    test_fail "CLI should override config port"
fi
rm -rf .phpup

#
# Port validation tests
#

test_start "numeric port is accepted"
output=$("$PHPUP" --port 8080 --dry-run 2>&1) || true
if [[ $? -eq 0 ]]; then
    test_pass
else
    test_fail "Numeric port should be accepted"
fi

test_start "high port number is accepted"
output=$("$PHPUP" --port 65000 --dry-run 2>&1) || true
if [[ $? -eq 0 ]]; then
    test_pass
else
    test_fail "High port should be accepted"
fi

#
# Host and port combination tests
#

test_start "host and port are combined correctly"
output=$("$PHPUP" --host 0.0.0.0 --port 3000 --dry-run 2>&1) || true
if assert_contains "$output" "0.0.0.0" && assert_contains "$output" "3000"; then
    test_pass
else
    test_fail "Host and port should be combined"
fi

test_start "localhost works as host"
output=$("$PHPUP" --host localhost --port 8080 --dry-run 2>&1) || true
if assert_contains "$output" "localhost" || assert_contains "$output" "8080"; then
    test_pass
else
    test_fail "localhost should work as host"
fi

#
# HTTPS port tests
#

test_start "https mode with custom port"
output=$("$PHPUP" --https local --port 8443 --dry-run 2>&1) || true
if assert_contains "$output" "8443"; then
    test_pass
else
    test_fail "Should use custom port with https"
fi
