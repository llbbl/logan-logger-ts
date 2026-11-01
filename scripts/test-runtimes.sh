#!/bin/sh
# Run the same fixture contract in all supported runtimes. Every runtime runs
# even when another fails, and the aggregate command fails if any target does.
set -eu

SCRIPT_DIR=$(CDPATH='' cd -- "$(dirname -- "$0")" && pwd)
REPO_ROOT=$(CDPATH='' cd -- "$SCRIPT_DIR/.." && pwd)
cd "$REPO_ROOT"

if ! command -v docker >/dev/null 2>&1; then
  echo 'Docker with Compose is required; install Docker Desktop or Docker Engine with the Compose plugin.' >&2
  exit 1
fi
if ! docker compose version >/dev/null 2>&1; then
  echo 'Docker Compose is required; install the Compose plugin.' >&2
  exit 1
fi
if ! docker info >/dev/null 2>&1; then
  echo 'Docker is not running or is inaccessible; start Docker and retry.' >&2
  exit 1
fi

docker compose -f ./compose.runtimes.yaml build

RESULT=0
for TARGET in node22 node24 node26 bun deno browsers; do
  echo "Runtime fixture target: $TARGET"
  if docker compose -f ./compose.runtimes.yaml run --rm --no-deps "$TARGET"; then
    echo "Runtime fixture target passed: $TARGET"
  else
    echo "Runtime fixture target failed: $TARGET" >&2
    RESULT=1
  fi
done

exit "$RESULT"
