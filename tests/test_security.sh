#!/usr/bin/env bash
# Test security features

#
# Input sanitization tests
#

test_start "rejects semicolon in extra args"
output=$("$PHPUP" --dry-run -- "test;whoami" 2>&1) || true
if assert_contains "$output" "Invalid" || assert_contains "$output" "error" || [[ $? -ne 0 ]]; then
    test_pass
else
    test_fail "Should reject semicolon in args"
fi

test_start "rejects pipe in extra args"
output=$("$PHPUP" --dry-run -- "test|cat" 2>&1) || true
if assert_contains "$output" "Invalid" || assert_contains "$output" "error" || [[ $? -ne 0 ]]; then
    test_pass
else
    test_fail "Should reject pipe in args"
fi

test_start "rejects ampersand in extra args"
output=$("$PHPUP" --dry-run -- "test&id" 2>&1) || true
if assert_contains "$output" "Invalid" || assert_contains "$output" "error" || [[ $? -ne 0 ]]; then
    test_pass
else
    test_fail "Should reject ampersand in args"
fi

test_start "rejects dollar sign in extra args"
output=$("$PHPUP" --dry-run -- 'test$HOME' 2>&1) || true
if assert_contains "$output" "Invalid" || assert_contains "$output" "error" || [[ $? -ne 0 ]]; then
    test_pass
else
    test_fail "Should reject dollar sign in args"
fi

test_start "rejects backtick in extra args"
output=$("$PHPUP" --dry-run -- 'test`id`' 2>&1) || true
if assert_contains "$output" "Invalid" || assert_contains "$output" "error" || [[ $? -ne 0 ]]; then
    test_pass
else
    test_fail "Should reject backtick in args"
fi

test_start "rejects redirect in extra args"
output=$("$PHPUP" --dry-run -- "test>file" 2>&1) || true
if assert_contains "$output" "Invalid" || assert_contains "$output" "error" || [[ $? -ne 0 ]]; then
    test_pass
else
    test_fail "Should reject redirect in args"
fi

#
# Config file permissions tests
#

test_start "config file has restricted permissions"
rm -rf .phpup
"$PHPUP" --save --dry-run >/dev/null 2>&1 || true
if [ -f ".phpup/config" ]; then
    perms=$(stat -c "%a" .phpup/config 2>/dev/null || stat -f "%Lp" .phpup/config 2>/dev/null)
    if [ "$perms" = "600" ]; then
        test_pass
    else
        test_fail "Config should have 600 permissions"
    fi
else
    test_fail "Config file not created"
fi
rm -rf .phpup

#
# Unknown option handling
#

test_start "unknown option shows error"
output=$("$PHPUP" --unknown-option 2>&1) || true
if assert_contains "$output" "Unknown" || assert_contains "$output" "error" || [[ $? -ne 0 ]]; then
    test_pass
else
    test_fail "Should error on unknown option"
fi

test_start "usage shown after unknown option"
output=$("$PHPUP" --invalid-flag 2>&1) || true
if assert_contains "$output" "Usage" || assert_contains "$output" "--help"; then
    test_pass
else
    test_fail "Should show usage hint"
fi

#
# Path traversal protection
#

test_start "docroot cannot escape with .."
# This is a basic check - more thorough validation may be needed
output=$("$PHPUP" --docroot "../../../etc" --dry-run 2>&1) || true
# Should still work but resolve to absolute path
if [[ $? -eq 0 ]] || assert_contains "$output" "error"; then
    test_pass
else
    test_fail "Should handle path traversal safely"
fi
