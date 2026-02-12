#!/bin/bash
# Update expected fixture files from actual test output
# Run this after tests generate new output with correct format

set -e

cd "$(dirname "$0")/.."

echo "Running tests to generate actual output..."
npm run test 2>&1 | grep -q "failing" || true

echo ""
echo "Updating expected fixture files..."

fixtures=(
  "simple"
  "multiple-interactions"
  "multiple-providers"
  "malformed-logs"
  "duplicates"
  "merging"
  "missing-fields"
)

for fixture in "${fixtures[@]}"; do
  fixture_dir="test/fixtures/$fixture"
  pacts_dir="$fixture_dir/pacts"
  expected_dir="$fixture_dir/expected"

  if [ -d "$pacts_dir" ]; then
    echo "  Updating $fixture..."
    cp -f "$pacts_dir"/*.json "$expected_dir/" 2>/dev/null || echo "    (no files to copy)"
  else
    echo "  Skipping $fixture (no pacts directory)"
  fi
done

echo ""
echo "Cleaning up pacts directories..."
find test/fixtures -type d -name "pacts" -exec rm -rf {} + 2>/dev/null || true

echo "Done! Expected fixture files updated."
