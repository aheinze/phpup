#!/usr/bin/env bash
# phpup test runner
# Run all tests: ./tests/run_tests.sh
# Run specific test file: ./tests/run_tests.sh tests/test_args.sh

set -euo pipefail

SCRIPT_DIR="$(cd "$(dirname "${BASH_SOURCE[0]}")" && pwd)"
PROJECT_ROOT="$(dirname "$SCRIPT_DIR")"
PHPUP="$PROJECT_ROOT/phpup"

# Test counters
TESTS_RUN=0
TESTS_PASSED=0
TESTS_FAILED=0
CURRENT_TEST=""

# Colors
RED='\033[0;31m'
GREEN='\033[0;32m'
YELLOW='\033[0;33m'
BLUE='\033[0;34m'
NC='\033[0m' # No Color

# Test temp directory
TEST_TMPDIR=""

#
# Test framework functions
#

setup_test_env() {
    TEST_TMPDIR=$(mktemp -d)
    cd "$TEST_TMPDIR"
    export PHPUP
    export TEST_TMPDIR
}

cleanup_test_env() {
    if [ -n "$TEST_TMPDIR" ] && [ -d "$TEST_TMPDIR" ]; then
        rm -rf "$TEST_TMPDIR"
    fi
}

# Called before each test file
before_all() {
    setup_test_env
}

# Called after each test file
after_all() {
    cleanup_test_env
}

# Start a test
test_start() {
    CURRENT_TEST="$1"
    TESTS_RUN=$((TESTS_RUN + 1))
    printf "  ${BLUE}TEST${NC} %s ... " "$CURRENT_TEST"
}

# Mark test as passed
test_pass() {
    TESTS_PASSED=$((TESTS_PASSED + 1))
    printf "${GREEN}PASS${NC}\n"
}

# Mark test as failed
test_fail() {
    local msg="${1:-}"
    TESTS_FAILED=$((TESTS_FAILED + 1))
    printf "${RED}FAIL${NC}\n"
    if [ -n "$msg" ]; then
        printf "    ${RED}Error: %s${NC}\n" "$msg"
    fi
}

# Assert that command succeeds
assert_success() {
    if "$@" >/dev/null 2>&1; then
        return 0
    else
        return 1
    fi
}

# Assert that command fails
assert_failure() {
    if "$@" >/dev/null 2>&1; then
        return 1
    else
        return 0
    fi
}

# Assert output contains string
assert_contains() {
    local output="$1"
    local expected="$2"
    if [[ "$output" == *"$expected"* ]]; then
        return 0
    else
        return 1
    fi
}

# Assert output equals string
assert_equals() {
    local actual="$1"
    local expected="$2"
    if [ "$actual" = "$expected" ]; then
        return 0
    else
        return 1
    fi
}

# Assert file exists
assert_file_exists() {
    local file="$1"
    if [ -f "$file" ]; then
        return 0
    else
        return 1
    fi
}

# Assert directory exists
assert_dir_exists() {
    local dir="$1"
    if [ -d "$dir" ]; then
        return 0
    else
        return 1
    fi
}

# Assert file contains string
assert_file_contains() {
    local file="$1"
    local expected="$2"
    if [ -f "$file" ] && grep -q "$expected" "$file"; then
        return 0
    else
        return 1
    fi
}

#
# Run tests
#

run_test_file() {
    local test_file="$1"
    local test_name
    test_name=$(basename "$test_file" .sh)

    printf "\n${YELLOW}Running %s${NC}\n" "$test_name"

    before_all

    # Source the test file
    source "$test_file"

    after_all
}

print_summary() {
    printf "\n${YELLOW}════════════════════════════════════════${NC}\n"
    printf "Tests run: %d\n" "$TESTS_RUN"
    printf "${GREEN}Passed: %d${NC}\n" "$TESTS_PASSED"
    if [ "$TESTS_FAILED" -gt 0 ]; then
        printf "${RED}Failed: %d${NC}\n" "$TESTS_FAILED"
    else
        printf "Failed: %d\n" "$TESTS_FAILED"
    fi
    printf "${YELLOW}════════════════════════════════════════${NC}\n"

    if [ "$TESTS_FAILED" -gt 0 ]; then
        return 1
    fi
    return 0
}

main() {
    printf "${YELLOW}╔════════════════════════════════════════╗${NC}\n"
    printf "${YELLOW}║         phpup Test Suite               ║${NC}\n"
    printf "${YELLOW}╚════════════════════════════════════════╝${NC}\n"

    # Check phpup exists
    if [ ! -x "$PHPUP" ]; then
        printf "${RED}Error: phpup not found or not executable at %s${NC}\n" "$PHPUP"
        exit 1
    fi

    if [ $# -gt 0 ]; then
        # Run specific test files
        for test_file in "$@"; do
            if [ -f "$test_file" ]; then
                run_test_file "$test_file"
            else
                printf "${RED}Test file not found: %s${NC}\n" "$test_file"
            fi
        done
    else
        # Run all test files
        for test_file in "$SCRIPT_DIR"/test_*.sh; do
            if [ -f "$test_file" ]; then
                run_test_file "$test_file"
            fi
        done
    fi

    print_summary
}

main "$@"
