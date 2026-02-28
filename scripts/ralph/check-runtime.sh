#!/bin/bash
# Check for runtime errors by starting dev server and hitting pages
# Usage: ./check-runtime.sh [routes...]
# Example: ./check-runtime.sh /tickets /settings/views

set -e

ROUTES="${@:-/}"
PORT=${PORT:-3002}
OUTPUT_FILE="/tmp/nextjs-runtime-check-$$.txt"

# Check if something is already running on the port
if lsof -i :$PORT > /dev/null 2>&1; then
  echo "Port $PORT already in use - assuming dev server is running"
  ALREADY_RUNNING=true
else
  ALREADY_RUNNING=false
  echo "Starting dev server..."
  pnpm dev > "$OUTPUT_FILE" 2>&1 &
  DEV_PID=$!
  
  # Wait for server to be ready
  echo "Waiting for server to start..."
  for i in {1..30}; do
    if curl -s http://localhost:$PORT > /dev/null 2>&1; then
      echo "Server ready"
      break
    fi
    sleep 1
  done
fi

# Hit each route to trigger SSR
echo "Checking routes for runtime errors..."
for route in $ROUTES; do
  echo "  Checking $route"
  curl -s "http://localhost:$PORT$route" > /dev/null 2>&1 || true
  sleep 1
done

# Give time for errors to appear
sleep 2

# Check for errors
ERRORS_FOUND=false
if [ "$ALREADY_RUNNING" = false ] && [ -f "$OUTPUT_FILE" ]; then
  if grep -iE "(Error:|error:|TypeError|ReferenceError|Cannot find module|Module not found|Unhandled Runtime Error)" "$OUTPUT_FILE"; then
    echo ""
    echo "❌ Runtime errors detected!"
    echo "Full output:"
    cat "$OUTPUT_FILE"
    ERRORS_FOUND=true
  fi
fi

# Clean up
if [ "$ALREADY_RUNNING" = false ]; then
  kill $DEV_PID 2>/dev/null || true
  rm -f "$OUTPUT_FILE"
fi

if [ "$ERRORS_FOUND" = true ]; then
  exit 1
else
  echo "✅ No runtime errors detected"
  exit 0
fi
