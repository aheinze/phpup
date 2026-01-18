#!/usr/bin/env bash
# Test help and usage output

#
# Help flag tests
#

test_start "help flag shows usage"
output=$("$PHPUP" --help 2>&1) || true
if assert_contains "$output" "Usage: phpup"; then
    test_pass
else
    test_fail "Expected 'Usage: phpup' in output"
fi

test_start "help flag shows basic options"
output=$("$PHPUP" --help 2>&1) || true
if assert_contains "$output" "--host HOST"; then
    test_pass
else
    test_fail "Expected '--host HOST' in output"
fi

test_start "help flag shows --port option"
output=$("$PHPUP" --help 2>&1) || true
if assert_contains "$output" "--port PORT"; then
    test_pass
else
    test_fail "Expected '--port PORT' in output"
fi

test_start "help flag shows --docroot option"
output=$("$PHPUP" --help 2>&1) || true
if assert_contains "$output" "--docroot DIR"; then
    test_pass
else
    test_fail "Expected '--docroot DIR' in output"
fi

test_start "help flag shows --init option"
output=$("$PHPUP" --help 2>&1) || true
if assert_contains "$output" "--init"; then
    test_pass
else
    test_fail "Expected '--init' in output"
fi

test_start "help flag shows --worker option"
output=$("$PHPUP" --help 2>&1) || true
if assert_contains "$output" "--worker"; then
    test_pass
else
    test_fail "Expected '--worker' in output"
fi

test_start "help flag shows --https option"
output=$("$PHPUP" --help 2>&1) || true
if assert_contains "$output" "--https MODE"; then
    test_pass
else
    test_fail "Expected '--https MODE' in output"
fi

test_start "help flag shows examples section"
output=$("$PHPUP" --help 2>&1) || true
if assert_contains "$output" "Examples:"; then
    test_pass
else
    test_fail "Expected 'Examples:' in output"
fi

test_start "short help flag -h works"
output=$("$PHPUP" -h 2>&1) || true
if assert_contains "$output" "Usage: phpup"; then
    test_pass
else
    test_fail "Expected 'Usage: phpup' in output"
fi

test_start "help shows environment variables section"
output=$("$PHPUP" --help 2>&1) || true
if assert_contains "$output" "Environment variables available to Caddyfile"; then
    test_pass
else
    test_fail "Expected environment variables documentation"
fi

test_start "help mentions PHPUP_DIR variable"
output=$("$PHPUP" --help 2>&1) || true
if assert_contains "$output" "PHPUP_DIR"; then
    test_pass
else
    test_fail "Expected 'PHPUP_DIR' in environment variables list"
fi
