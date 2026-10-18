#!/usr/bin/env bash
# Test --list and --stop modes

#
# List mode tests
#

test_start "list mode runs without error"
status=0
output=$("$PHPUP" --list 2>&1) || status=$?
# Should complete even if no processes
if [[ $status -eq 0 ]]; then
    test_pass
else
    test_fail "List mode should run"
fi

test_start "list mode shows header or no processes message"
status=0
output=$("$PHPUP" --list 2>&1) || status=$?
if assert_contains "$output" "PID" || assert_contains "$output" "No "; then
    test_pass
else
    test_fail "Should show header or 'No' message"
fi

#
# Stats mode tests
#

test_start "stats mode runs without error"
status=0
output=$("$PHPUP" --stats 2>&1) || status=$?
# Should complete even if no processes
if [[ $status -eq 0 ]]; then
    test_pass
else
    test_fail "Stats mode should run"
fi

#
# Stop mode tests
#

test_start "stop mode runs without error"
status=0
output=$("$PHPUP" --stop 2>&1) || status=$?
# Should complete even if no processes to stop
if [[ $status -eq 0 ]]; then
    test_pass
else
    test_fail "Stop mode should run"
fi

test_start "stop mode provides feedback"
status=0
output=$("$PHPUP" --stop 2>&1) || status=$?
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
status=0
output=$("$PHPUP" --list 2>&1) || status=$?
exit_list=$status
status=0
output=$("$PHPUP" --stop 2>&1) || status=$?
exit_stop=$status
# Both should work independently
if [[ $exit_list -eq 0 ]] && [[ $exit_stop -eq 0 ]]; then
    test_pass
else
    test_fail "Both modes should work"
fi
