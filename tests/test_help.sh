#!/usr/bin/env bash
# Test help and usage output

#
# Help flag tests
#

test_start "help flag shows usage"
status=0
output=$("$PHPUP" --help 2>&1) || status=$?
if assert_contains "$output" "Usage: phpup"; then
    test_pass
else
    test_fail "Expected 'Usage: phpup' in output"
fi

test_start "help flag shows basic options"
status=0
output=$("$PHPUP" --help 2>&1) || status=$?
if assert_contains "$output" "--host HOST"; then
    test_pass
else
    test_fail "Expected '--host HOST' in output"
fi

test_start "help flag shows --port option"
status=0
output=$("$PHPUP" --help 2>&1) || status=$?
if assert_contains "$output" "--port PORT"; then
    test_pass
else
    test_fail "Expected '--port PORT' in output"
fi

test_start "help flag shows --docroot option"
status=0
output=$("$PHPUP" --help 2>&1) || status=$?
if assert_contains "$output" "--docroot DIR"; then
    test_pass
else
    test_fail "Expected '--docroot DIR' in output"
fi

test_start "help flag shows --init option"
status=0
output=$("$PHPUP" --help 2>&1) || status=$?
if assert_contains "$output" "--init"; then
    test_pass
else
    test_fail "Expected '--init' in output"
fi

test_start "help flag shows --worker option"
status=0
output=$("$PHPUP" --help 2>&1) || status=$?
if assert_contains "$output" "--worker"; then
    test_pass
else
    test_fail "Expected '--worker' in output"
fi

test_start "help flag shows --https option"
status=0
output=$("$PHPUP" --help 2>&1) || status=$?
if assert_contains "$output" "--https MODE"; then
    test_pass
else
    test_fail "Expected '--https MODE' in output"
fi

test_start "help flag shows examples section"
status=0
output=$("$PHPUP" --help 2>&1) || status=$?
if assert_contains "$output" "Examples:"; then
    test_pass
else
    test_fail "Expected 'Examples:' in output"
fi

test_start "short help flag -h works"
status=0
output=$("$PHPUP" -h 2>&1) || status=$?
if assert_contains "$output" "Usage: phpup"; then
    test_pass
else
    test_fail "Expected 'Usage: phpup' in output"
fi

test_start "help shows environment variables section"
status=0
output=$("$PHPUP" --help 2>&1) || status=$?
if assert_contains "$output" "Environment variables available to Caddyfile"; then
    test_pass
else
    test_fail "Expected environment variables documentation"
fi

test_start "help mentions PHPUP_DIR variable"
status=0
output=$("$PHPUP" --help 2>&1) || status=$?
if assert_contains "$output" "PHPUP_DIR"; then
    test_pass
else
    test_fail "Expected 'PHPUP_DIR' in environment variables list"
fi
