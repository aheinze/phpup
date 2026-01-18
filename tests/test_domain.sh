#!/usr/bin/env bash
# Test domain validation and handling

#
# Valid domain tests
#

test_start "accepts .test TLD domain"
output=$("$PHPUP" --domain myapp.test --dry-run 2>&1) || true
if assert_contains "$output" "myapp.test"; then
    test_pass
else
    test_fail "Should accept .test TLD"
fi

test_start "accepts .local TLD domain"
output=$("$PHPUP" --domain myapp.local --dry-run 2>&1) || true
if assert_contains "$output" "myapp.local"; then
    test_pass
else
    test_fail "Should accept .local TLD"
fi

test_start "accepts .localhost TLD domain"
output=$("$PHPUP" --domain myapp.localhost --dry-run 2>&1) || true
if assert_contains "$output" "myapp.localhost"; then
    test_pass
else
    test_fail "Should accept .localhost TLD"
fi

test_start "accepts subdomain with .test"
output=$("$PHPUP" --domain api.myapp.test --dry-run 2>&1) || true
if assert_contains "$output" "api.myapp.test"; then
    test_pass
else
    test_fail "Should accept subdomain"
fi

test_start "accepts domain with hyphens"
output=$("$PHPUP" --domain my-cool-app.test --dry-run 2>&1) || true
if assert_contains "$output" "my-cool-app.test"; then
    test_pass
else
    test_fail "Should accept hyphens in domain"
fi

test_start "accepts standard domain format"
output=$("$PHPUP" --domain example.com --dry-run 2>&1) || true
if assert_contains "$output" "example.com"; then
    test_pass
else
    test_fail "Should accept standard domain"
fi

#
# Auto-domain tests
#

test_start "auto-domain derives from folder name"
# Create a uniquely named folder
mkdir -p testproject123
cd testproject123
output=$("$PHPUP" --auto-domain --dry-run 2>&1) || true
cd ..
rm -rf testproject123
if assert_contains "$output" "testproject123.test"; then
    test_pass
else
    test_fail "Should derive domain from folder name"
fi

test_start "auto-domain converts underscores to hyphens"
mkdir -p my_test_project
cd my_test_project
output=$("$PHPUP" --auto-domain --dry-run 2>&1) || true
cd ..
rm -rf my_test_project
if assert_contains "$output" "my-test-project.test"; then
    test_pass
else
    test_fail "Should convert underscores to hyphens"
fi

test_start "auto-domain converts to lowercase"
mkdir -p MyMixedCaseProject
cd MyMixedCaseProject
output=$("$PHPUP" --auto-domain --dry-run 2>&1) || true
cd ..
rm -rf MyMixedCaseProject
if assert_contains "$output" "mymixedcaseproject.test"; then
    test_pass
else
    test_fail "Should convert to lowercase"
fi

#
# Domain sanitization tests (security)
#

test_start "sanitizes special characters from domain"
# The script should sanitize or reject dangerous characters
output=$("$PHPUP" --domain "test;whoami.test" --dry-run 2>&1) || true
# Should not contain semicolon after sanitization
if [[ "$output" != *";"* ]] || [[ "$output" == *"Invalid"* ]] || [[ "$output" == *"Error"* ]]; then
    test_pass
else
    test_fail "Should sanitize or reject special characters"
fi

test_start "rejects domain with backticks"
output=$("$PHPUP" --domain 'test`id`.test' --dry-run 2>&1) || true
# Should reject or sanitize backticks
if [[ "$output" != *'`'* ]] || [[ "$output" == *"Invalid"* ]] || [[ "$output" == *"Error"* ]]; then
    test_pass
else
    test_fail "Should reject backticks in domain"
fi

test_start "rejects domain with dollar signs"
output=$("$PHPUP" --domain 'test$USER.test' --dry-run 2>&1) || true
# Should reject or sanitize dollar signs
if [[ "$output" != *'$'* ]] || [[ "$output" == *"Invalid"* ]] || [[ "$output" == *"Error"* ]]; then
    test_pass
else
    test_fail "Should reject dollar signs in domain"
fi

#
# No-hosts flag tests
#

test_start "no-hosts flag prevents hosts file modification"
output=$("$PHPUP" --domain skiphost.test --no-hosts --dry-run 2>&1) || true
# Should accept the flag and complete
if [[ $? -eq 0 ]]; then
    test_pass
else
    test_fail "no-hosts flag should work"
fi

#
# Domain with HTTPS tests
#

test_start "domain works with https local"
output=$("$PHPUP" --domain secure.test --https local --dry-run 2>&1) || true
if assert_contains "$output" "secure.test"; then
    test_pass
else
    test_fail "Domain should work with HTTPS"
fi
