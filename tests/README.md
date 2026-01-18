# phpup Tests

This directory contains the test suite for phpup.

## Running Tests

Make the test runner executable and run all tests:

```bash
chmod +x tests/run_tests.sh tests/test_*.sh
./tests/run_tests.sh
```

Run a specific test file:

```bash
./tests/run_tests.sh tests/test_args.sh
```

## Test Files

| File | Description |
|------|-------------|
| `run_tests.sh` | Test runner and framework |
| `test_help.sh` | Help/usage output tests |
| `test_args.sh` | Argument parsing tests |
| `test_config.sh` | Configuration file handling |
| `test_domain.sh` | Domain validation and handling |
| `test_docroot.sh` | Document root detection |
| `test_port.sh` | Port handling tests |
| `test_init.sh` | --init mode tests |
| `test_list_stop.sh` | --list and --stop mode tests |
| `test_security.sh` | Security feature tests |

## Writing New Tests

Use the provided test framework functions:

```bash
test_start "description of test"
# ... test logic ...
if <condition>; then
    test_pass
else
    test_fail "error message"
fi
```

Available assertion helpers:
- `assert_success <command>` - Assert command succeeds
- `assert_failure <command>` - Assert command fails
- `assert_contains "$output" "expected"` - Assert string contains substring
- `assert_equals "$actual" "$expected"` - Assert strings are equal
- `assert_file_exists "path"` - Assert file exists
- `assert_dir_exists "path"` - Assert directory exists
- `assert_file_contains "path" "string"` - Assert file contains string

## Requirements

- Bash 4.0+
- phpup script in parent directory
