#!/bin/bash
# Helper script to monitor Ralph's progress

SCRIPT_DIR="$(cd "$(dirname "${BASH_SOURCE[0]}")" && pwd)"
PROGRESS_FILE="$SCRIPT_DIR/progress.txt"
PRD_FILE="$SCRIPT_DIR/prd.json"

echo "=== Ralph Monitoring Dashboard ==="
echo ""

# Show incomplete stories
echo "📋 Incomplete Stories:"
jq -r '.userStories[] | select(.passes == false) | "  \(.id) [Priority \(.priority)]: \(.title)"' "$PRD_FILE" 2>/dev/null | head -5
TOTAL_INCOMPLETE=$(jq '[.userStories[] | select(.passes == false)] | length' "$PRD_FILE" 2>/dev/null)
echo "  ... ($TOTAL_INCOMPLETE total incomplete)"
echo ""

# Show completed stories
COMPLETED=$(jq '[.userStories[] | select(.passes == true)] | length' "$PRD_FILE" 2>/dev/null)
TOTAL=$(jq '.userStories | length' "$PRD_FILE" 2>/dev/null)
echo "✅ Completed: $COMPLETED / $TOTAL stories"
echo ""

# Show recent progress
echo "📝 Recent Progress:"
tail -20 "$PROGRESS_FILE" 2>/dev/null | grep -E "^##|^-|^  -" | tail -10 || echo "  No progress yet"
echo ""

# Show recent git commits
echo "🔨 Recent Commits:"
git log --oneline -5 2>/dev/null || echo "  No commits yet"
echo ""

# Show current git status
echo "📊 Git Status:"
git status --short 2>/dev/null | head -5 || echo "  Clean working directory"
echo ""

echo "💡 Tip: Run 'tail -f $PROGRESS_FILE' in another terminal to watch live"
