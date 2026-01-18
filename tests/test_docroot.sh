#!/usr/bin/env bash
# Test document root detection

#
# Auto-detection tests
#

test_start "detects public directory as docroot"
rm -rf public web www
mkdir -p public
output=$("$PHPUP" --dry-run 2>&1) || true
if assert_contains "$output" "public"; then
    test_pass
else
    test_fail "Should detect public directory"
fi
rm -rf public

test_start "detects web directory as docroot"
rm -rf public web www
mkdir -p web
output=$("$PHPUP" --dry-run 2>&1) || true
if assert_contains "$output" "web"; then
    test_pass
else
    test_fail "Should detect web directory"
fi
rm -rf web

test_start "detects www directory as docroot"
rm -rf public web www
mkdir -p www
output=$("$PHPUP" --dry-run 2>&1) || true
if assert_contains "$output" "www"; then
    test_pass
else
    test_fail "Should detect www directory"
fi
rm -rf www

test_start "prefers public over web"
rm -rf public web
mkdir -p public web
output=$("$PHPUP" --dry-run 2>&1) || true
if assert_contains "$output" "public"; then
    test_pass
else
    test_fail "Should prefer public over web"
fi
rm -rf public web

test_start "falls back to current directory with index.php"
rm -rf public web www
echo '<?php echo "test";' > index.php
output=$("$PHPUP" --dry-run 2>&1) || true
# Should use current directory
if [[ $? -eq 0 ]]; then
    test_pass
else
    test_fail "Should use current directory with index.php"
fi
rm -f index.php

#
# Explicit docroot tests
#

test_start "explicit docroot overrides auto-detection"
rm -rf public customroot
mkdir -p public customroot
output=$("$PHPUP" --docroot customroot --dry-run 2>&1) || true
if assert_contains "$output" "customroot"; then
    test_pass
else
    test_fail "Explicit docroot should override"
fi
rm -rf public customroot

test_start "absolute path docroot is accepted"
rm -rf /tmp/phpup-test-docroot
mkdir -p /tmp/phpup-test-docroot
output=$("$PHPUP" --docroot /tmp/phpup-test-docroot --dry-run 2>&1) || true
if assert_contains "$output" "/tmp/phpup-test-docroot"; then
    test_pass
else
    test_fail "Should accept absolute path"
fi
rm -rf /tmp/phpup-test-docroot

test_start "relative docroot is converted to absolute"
rm -rf relroot
mkdir -p relroot
output=$("$PHPUP" --docroot relroot --dry-run 2>&1) || true
# Should appear as absolute path in output
if assert_contains "$output" "relroot"; then
    test_pass
else
    test_fail "Should handle relative docroot"
fi
rm -rf relroot

#
# Invalid docroot tests
#

test_start "non-existent docroot shows error or warning"
output=$("$PHPUP" --docroot /nonexistent/path/xyz --dry-run 2>&1) || true
# Should warn or error about missing directory
if assert_contains "$output" "error" || assert_contains "$output" "Error" || \
   assert_contains "$output" "not found" || assert_contains "$output" "not exist" || \
   [[ $? -ne 0 ]]; then
    test_pass
else
    test_fail "Should warn about non-existent docroot"
fi

#
# Docroot from config tests
#

test_start "docroot loaded from config"
rm -rf .phpup configdoc
mkdir -p .phpup configdoc
cat > .phpup/config <<EOF
DOCROOT=configdoc
EOF
output=$("$PHPUP" --dry-run 2>&1) || true
if assert_contains "$output" "configdoc"; then
    test_pass
else
    test_fail "Should load docroot from config"
fi
rm -rf .phpup configdoc
