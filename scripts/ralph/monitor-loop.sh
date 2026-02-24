#!/bin/bash
# Continuous monitoring loop for macOS (watch command alternative)

SCRIPT_DIR="$(cd "$(dirname "${BASH_SOURCE[0]}")" && pwd)"

# Clear screen and show initial state
clear

while true; do
  # Move cursor to top
  tput cup 0 0
  
  # Run monitor script
  "$SCRIPT_DIR/monitor.sh"
  
  # Show timestamp
  echo ""
  echo "🕐 Last updated: $(date '+%H:%M:%S')"
  echo "Press Ctrl+C to stop"
  
  # Wait 3 seconds
  sleep 3
  
  # Clear screen for next iteration
  clear
done
