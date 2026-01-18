#!/usr/bin/env bash
# Test --init mode functionality

#
# Basic init tests
#

test_start "init creates .phpup directory"
rm -rf .phpup
"$PHPUP" --init >/dev/null 2>&1 || true
if assert_dir_exists ".phpup"; then
    test_pass
else
    test_fail "Should create .phpup directory"
fi
rm -rf .phpup

test_start "init creates php.ini file"
rm -rf .phpup
"$PHPUP" --init >/dev/null 2>&1 || true
if assert_file_exists ".phpup/php.ini"; then
    test_pass
else
    test_fail "Should create php.ini"
fi
rm -rf .phpup

test_start "init creates Caddyfile.classic"
rm -rf .phpup
"$PHPUP" --init >/dev/null 2>&1 || true
if assert_file_exists ".phpup/Caddyfile.classic"; then
    test_pass
else
    test_fail "Should create Caddyfile.classic"
fi
rm -rf .phpup

test_start "init creates Caddyfile.worker"
rm -rf .phpup
"$PHPUP" --init >/dev/null 2>&1 || true
if assert_file_exists ".phpup/Caddyfile.worker"; then
    test_pass
else
    test_fail "Should create Caddyfile.worker"
fi
rm -rf .phpup

#
# PHP.ini content tests
#

test_start "php.ini contains memory_limit"
rm -rf .phpup
"$PHPUP" --init >/dev/null 2>&1 || true
if assert_file_contains ".phpup/php.ini" "memory_limit"; then
    test_pass
else
    test_fail "php.ini should contain memory_limit"
fi
rm -rf .phpup

test_start "php.ini contains error_log"
rm -rf .phpup
"$PHPUP" --init >/dev/null 2>&1 || true
if assert_file_contains ".phpup/php.ini" "error_log"; then
    test_pass
else
    test_fail "php.ini should contain error_log"
fi
rm -rf .phpup

test_start "php.ini has development settings by default"
rm -rf .phpup
"$PHPUP" --init >/dev/null 2>&1 || true
if assert_file_contains ".phpup/php.ini" "display_errors = On"; then
    test_pass
else
    test_fail "php.ini should have development-friendly settings"
fi
rm -rf .phpup

#
# Caddyfile content tests
#

test_start "Caddyfile.classic contains PHPUP_DIR variable"
rm -rf .phpup
"$PHPUP" --init >/dev/null 2>&1 || true
if assert_file_contains ".phpup/Caddyfile.classic" "PHPUP_DIR"; then
    test_pass
else
    test_fail "Caddyfile.classic should use PHPUP_DIR variable"
fi
rm -rf .phpup

test_start "Caddyfile.worker contains PHPUP_DIR variable"
rm -rf .phpup
"$PHPUP" --init >/dev/null 2>&1 || true
if assert_file_contains ".phpup/Caddyfile.worker" "PHPUP_DIR"; then
    test_pass
else
    test_fail "Caddyfile.worker should use PHPUP_DIR variable"
fi
rm -rf .phpup

test_start "Caddyfile.classic contains HOST variable"
rm -rf .phpup
"$PHPUP" --init >/dev/null 2>&1 || true
if assert_file_contains ".phpup/Caddyfile.classic" "HOST"; then
    test_pass
else
    test_fail "Caddyfile.classic should use HOST variable"
fi
rm -rf .phpup

test_start "Caddyfile.classic contains PORT variable"
rm -rf .phpup
"$PHPUP" --init >/dev/null 2>&1 || true
if assert_file_contains ".phpup/Caddyfile.classic" "PORT"; then
    test_pass
else
    test_fail "Caddyfile.classic should use PORT variable"
fi
rm -rf .phpup

test_start "Caddyfile.classic contains DOCROOT variable"
rm -rf .phpup
"$PHPUP" --init >/dev/null 2>&1 || true
if assert_file_contains ".phpup/Caddyfile.classic" "DOCROOT"; then
    test_pass
else
    test_fail "Caddyfile.classic should use DOCROOT variable"
fi
rm -rf .phpup

test_start "Caddyfile.classic enables php_server"
rm -rf .phpup
"$PHPUP" --init >/dev/null 2>&1 || true
if assert_file_contains ".phpup/Caddyfile.classic" "php_server"; then
    test_pass
else
    test_fail "Caddyfile.classic should enable php_server"
fi
rm -rf .phpup

test_start "Caddyfile.worker contains worker directive"
rm -rf .phpup
"$PHPUP" --init >/dev/null 2>&1 || true
if assert_file_contains ".phpup/Caddyfile.worker" "worker"; then
    test_pass
else
    test_fail "Caddyfile.worker should have worker directive"
fi
rm -rf .phpup

#
# Force mode tests
#

test_start "init does not overwrite without --force"
rm -rf .phpup
mkdir -p .phpup
echo "# Custom config" > .phpup/php.ini
"$PHPUP" --init >/dev/null 2>&1 || true
if assert_file_contains ".phpup/php.ini" "Custom config"; then
    test_pass
else
    test_fail "Should not overwrite without --force"
fi
rm -rf .phpup

test_start "init --force overwrites existing files"
rm -rf .phpup
mkdir -p .phpup
echo "# Custom config" > .phpup/php.ini
"$PHPUP" --init --force >/dev/null 2>&1 || true
if assert_file_contains ".phpup/php.ini" "memory_limit"; then
    test_pass
else
    test_fail "Should overwrite with --force"
fi
rm -rf .phpup

#
# Docroot detection during init
#

test_start "init detects public docroot"
rm -rf .phpup public
mkdir -p public
"$PHPUP" --init >/dev/null 2>&1 || true
if assert_file_contains ".phpup/Caddyfile.classic" "public"; then
    test_pass
else
    test_fail "Should detect public docroot"
fi
rm -rf .phpup public

test_start "init detects web docroot"
rm -rf .phpup web
mkdir -p web
"$PHPUP" --init >/dev/null 2>&1 || true
if assert_file_contains ".phpup/Caddyfile.classic" "web"; then
    test_pass
else
    test_fail "Should detect web docroot"
fi
rm -rf .phpup web

test_start "init with explicit docroot"
rm -rf .phpup customdoc
mkdir -p customdoc
"$PHPUP" --init --docroot customdoc >/dev/null 2>&1 || true
if assert_file_contains ".phpup/Caddyfile.classic" "customdoc"; then
    test_pass
else
    test_fail "Should use explicit docroot"
fi
rm -rf .phpup customdoc

#
# Domain configuration during init
#

test_start "init with domain creates proper config"
rm -rf .phpup
"$PHPUP" --init --domain initdomain.test --save >/dev/null 2>&1 || true
if assert_file_contains ".phpup/config" "initdomain.test"; then
    test_pass
else
    test_fail "Should save domain in config"
fi
rm -rf .phpup

#
# Log file configuration tests
#

test_start "Caddyfile.classic configures access log"
rm -rf .phpup
"$PHPUP" --init >/dev/null 2>&1 || true
if assert_file_contains ".phpup/Caddyfile.classic" "access.log"; then
    test_pass
else
    test_fail "Should configure access log"
fi
rm -rf .phpup

test_start "php.ini configures error log in .phpup"
rm -rf .phpup
"$PHPUP" --init >/dev/null 2>&1 || true
if assert_file_contains ".phpup/php.ini" "php_errors.log"; then
    test_pass
else
    test_fail "Should configure PHP error log"
fi
rm -rf .phpup
