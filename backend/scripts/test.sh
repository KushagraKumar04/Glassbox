#!/usr/bin/env bash
# Run the Glassbox backend test suite.
# Usage:
#   ./scripts/test.sh
#   ./scripts/test.sh --cov=app --cov-report=term-missing
#   ./scripts/test.sh tests/test_api_smoke.py -v
set -euo pipefail

BACKEND_DIR="$(cd "$(dirname "${BASH_SOURCE[0]}")/.." && pwd)"
cd "$BACKEND_DIR"

if [ ! -d ".venv" ]; then
  echo "No .venv found at $BACKEND_DIR/.venv" >&2
  echo "Create it first: python -m venv .venv" >&2
  exit 1
fi

# shellcheck disable=SC1091
source .venv/bin/activate

echo "Installing dev requirements..."
pip install -q -r requirements-dev.txt

if [ "$#" -eq 0 ]; then
  set -- tests -v --tb=short
fi

echo
echo "Running: python -m pytest $*"
echo
python -m pytest "$@"