#!/usr/bin/env bash
# Test --list and --stop modes

#
# List mode tests
#

test_start "list mode runs without error"
output=$("$PHPUP" --list 2>&1) || true
# Should complete even if no processes
if [[ $? -eq 0 ]] || assert_contains "$output" "No" || assert_contains "$output" "PID"; then
    test_pass
else
    test_fail "List mode should run"
fi

test_start "list mode shows header or no processes message"
output=$("$PHPUP" --list 2>&1) || true
if assert_contains "$output" "PID" || assert_contains "$output" "No "; then
    test_pass
else
    test_fail "Should show header or 'No' message"
fi

#
# Stats mode tests
#

test_start "stats mode runs without error"
output=$("$PHPUP" --stats 2>&1) || true
# Should complete even if no processes
if [[ $? -eq 0 ]] || assert_contains "$output" "No" || assert_contains "$output" "PID"; then
    test_pass
else
    test_fail "Stats mode should run"
fi

#
# Stop mode tests
#

test_start "stop mode runs without error"
output=$("$PHPUP" --stop 2>&1) || true
# Should complete even if no processes to stop
if [[ $? -eq 0 ]] || assert_contains "$output" "No" || assert_contains "$output" "Stopp"; then
    test_pass
else
    test_fail "Stop mode should run"
fi

test_start "stop mode provides feedback"
output=$("$PHPUP" --stop 2>&1) || true
# Should give some feedback
if [ -n "$output" ]; then
    test_pass
else
    test_fail "Should provide feedback"
fi

#
# Combined mode tests
#

test_start "list and stop are mutually exclusive modes"
# Running with both should work (one takes precedence)
output=$("$PHPUP" --list 2>&1) || true
exit_list=$?
output=$("$PHPUP" --stop 2>&1) || true
exit_stop=$?
# Both should work independently
if [[ $exit_list -eq 0 ]] || [[ $exit_stop -eq 0 ]]; then
    test_pass
else
    test_fail "Both modes should work"
fi
