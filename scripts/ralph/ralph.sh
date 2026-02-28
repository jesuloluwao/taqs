#!/bin/bash
# Ralph Wiggum - Long-running AI agent loop
# Usage: ./ralph.sh [--tool amp|claude] [max_iterations]
#
# Now with embedded story context - extracts the next story and relevant
# PRD context directly into the prompt for efficiency.
#
# Model selection: Configure in Claude settings, not here.

set -e

# Parse arguments
TOOL="claude" # Default to claude
MAX_ITERATIONS=10

while [[ $# -gt 0 ]]; do
  case $1 in
    --tool)
      TOOL="$2"
      shift 2
      ;;
    --tool=*)
      TOOL="${1#*=}"
      shift
      ;;
    *)
      # Assume it's max_iterations if it's a number
      if [[ "$1" =~ ^[0-9]+$ ]]; then
        MAX_ITERATIONS="$1"
      fi
      shift
      ;;
  esac
done

# Validate tool choice
if [[ "$TOOL" != "amp" && "$TOOL" != "claude" ]]; then
  echo "Error: Invalid tool '$TOOL'. Must be 'amp' or 'claude'."
  exit 1
fi

SCRIPT_DIR="$(cd "$(dirname "${BASH_SOURCE[0]}")" && pwd)"
PRD_FILE="$SCRIPT_DIR/prd.json"
PROGRESS_FILE="$SCRIPT_DIR/progress.txt"
ARCHIVE_DIR="$SCRIPT_DIR/archive"
LAST_BRANCH_FILE="$SCRIPT_DIR/.last-branch"
TEMP_PROMPT="/tmp/ralph-prompt-$$.md"

# =============================================================================
# STORY EXTRACTION FUNCTIONS
# =============================================================================

# Get the next incomplete story (highest priority with passes: false)
get_next_story() {
  jq -r '
    .userStories 
    | sort_by(.priority) 
    | map(select(.passes == false)) 
    | .[0] // empty
  ' "$PRD_FILE" 2>/dev/null
}

# Extract PRD key from story notes (e.g., "CHANGE-044: US-TUX-001" -> "CHANGE-044")
extract_prd_key() {
  local notes="$1"
  # Match PRD-XXX or CHANGE-XXX pattern at start of notes
  echo "$notes" | grep -oE '^(PRD-[0-9]+|CHANGE-[0-9]+)' | head -1
}

# Get prdContext for a specific key
get_prd_context() {
  local key="$1"
  jq -r --arg key "$key" '
    .prdContext[$key] // empty
  ' "$PRD_FILE" 2>/dev/null
}

# Format story as markdown
format_story_markdown() {
  local story_json="$1"
  
  local id=$(echo "$story_json" | jq -r '.id')
  local title=$(echo "$story_json" | jq -r '.title')
  local description=$(echo "$story_json" | jq -r '.description')
  local notes=$(echo "$story_json" | jq -r '.notes // "None"')
  local priority=$(echo "$story_json" | jq -r '.priority')
  
  # Format acceptance criteria as bullet points
  local criteria=$(echo "$story_json" | jq -r '.acceptanceCriteria | map("- " + .) | join("\n")')
  
  cat << EOF
### $id: $title

**Priority:** $priority

**Description:** $description

**Acceptance Criteria:**
$criteria

**Notes:** $notes
EOF
}

# Format prdContext as markdown
format_context_markdown() {
  local key="$1"
  local context_json="$2"
  
  local name=$(echo "$context_json" | jq -r '.name // "Unknown"')
  local overview=$(echo "$context_json" | jq -r '.overview // "No overview"')
  local background=$(echo "$context_json" | jq -r '.background // ""')
  
  # Format goals as bullet points
  local goals=$(echo "$context_json" | jq -r '
    if .goals then
      .goals | map("- " + .) | join("\n")
    else
      "No goals specified"
    end
  ')
  
  # Format core concepts if present
  local concepts=$(echo "$context_json" | jq -r '
    if .coreConcepts then
      .coreConcepts | to_entries | map("- **" + .key + ":** " + .value) | join("\n")
    else
      ""
    end
  ')
  
  cat << EOF
## PRD Context: $key ($name)

**Overview:** $overview

EOF

  if [ -n "$background" ] && [ "$background" != "null" ]; then
    echo "**Background:** $background"
    echo ""
  fi
  
  echo "**Goals:**"
  echo "$goals"
  echo ""
  
  if [ -n "$concepts" ]; then
    echo "**Core Concepts:**"
    echo "$concepts"
    echo ""
  fi
}

# Build the complete prompt with embedded story and context
build_prompt() {
  local iteration="$1"
  
  # Get next story
  local story_json=$(get_next_story)
  
  if [ -z "$story_json" ] || [ "$story_json" == "null" ]; then
    echo "ERROR: No incomplete stories found"
    return 1
  fi
  
  local story_id=$(echo "$story_json" | jq -r '.id')
  local story_notes=$(echo "$story_json" | jq -r '.notes // ""')
  
  # Extract relevant PRD key from notes
  local prd_key=$(extract_prd_key "$story_notes")
  
  # Get the prdContext for this story
  local context_json=""
  if [ -n "$prd_key" ]; then
    context_json=$(get_prd_context "$prd_key")
  fi
  
  # Count remaining stories
  local remaining=$(jq '[.userStories[] | select(.passes == false)] | length' "$PRD_FILE")
  local total=$(jq '.userStories | length' "$PRD_FILE")
  local complete=$((total - remaining))
  
  # Get branch name
  local branch=$(jq -r '.branchName // "main"' "$PRD_FILE")
  
  # Build the prompt
  cat "$SCRIPT_DIR/CLAUDE.md"
  
  cat << EOF

---

# Ralph Iteration $iteration

## Progress: $complete / $total stories complete ($remaining remaining)
## Branch: $branch

EOF

  # Add PRD context if we found one
  if [ -n "$context_json" ] && [ "$context_json" != "null" ]; then
    format_context_markdown "$prd_key" "$context_json"
    echo "---"
    echo ""
  fi
  
  # Add the story
  echo "## Your Current Story"
  echo ""
  format_story_markdown "$story_json"
  
  # Add instructions for marking complete
  cat << EOF

---

## When Complete

After implementing all acceptance criteria and committing:

1. Mark this story as complete:
\`\`\`bash
jq '.userStories |= map(if .id == "$story_id" then .passes = true else . end)' scripts/ralph/prd.json > /tmp/prd-update.json && mv /tmp/prd-update.json scripts/ralph/prd.json
\`\`\`

2. Append your progress to \`scripts/ralph/progress.txt\`

3. Commit the prd.json update:
\`\`\`bash
git add scripts/ralph/prd.json scripts/ralph/progress.txt && git commit -m "chore: mark $story_id complete"
\`\`\`

4. If no stories remain, output: \` COMPLETE \`
EOF
}

# =============================================================================
# MAIN SCRIPT
# =============================================================================

# Archive previous run if branch changed
if [ -f "$PRD_FILE" ] && [ -f "$LAST_BRANCH_FILE" ]; then
  CURRENT_BRANCH=$(jq -r '.branchName // empty' "$PRD_FILE" 2>/dev/null || echo "")
  LAST_BRANCH=$(cat "$LAST_BRANCH_FILE" 2>/dev/null || echo "")
  
  if [ -n "$CURRENT_BRANCH" ] && [ -n "$LAST_BRANCH" ] && [ "$CURRENT_BRANCH" != "$LAST_BRANCH" ]; then
    # Archive the previous run
    DATE=$(date +%Y-%m-%d)
    FOLDER_NAME=$(echo "$LAST_BRANCH" | sed 's|^ralph/||')
    ARCHIVE_FOLDER="$ARCHIVE_DIR/$DATE-$FOLDER_NAME"
    
    echo "Archiving previous run: $LAST_BRANCH"
    mkdir -p "$ARCHIVE_FOLDER"
    [ -f "$PRD_FILE" ] && cp "$PRD_FILE" "$ARCHIVE_FOLDER/"
    [ -f "$PROGRESS_FILE" ] && cp "$PROGRESS_FILE" "$ARCHIVE_FOLDER/"
    echo "  Archived to: $ARCHIVE_FOLDER"
    
    # Reset progress file for new run
    echo "# Ralph Progress Log" > "$PROGRESS_FILE"
    echo "Started: $(date)" >> "$PROGRESS_FILE"
    echo "---" >> "$PROGRESS_FILE"
  fi
fi

# Track current branch
if [ -f "$PRD_FILE" ]; then
  CURRENT_BRANCH=$(jq -r '.branchName // empty' "$PRD_FILE" 2>/dev/null || echo "")
  if [ -n "$CURRENT_BRANCH" ]; then
    echo "$CURRENT_BRANCH" > "$LAST_BRANCH_FILE"
  fi
fi

# Initialize progress file if it doesn't exist
if [ ! -f "$PROGRESS_FILE" ]; then
  echo "# Ralph Progress Log" > "$PROGRESS_FILE"
  echo "Started: $(date)" >> "$PROGRESS_FILE"
  echo "---" >> "$PROGRESS_FILE"
fi

# Show startup info
echo ""
echo "==============================================================="
echo " Ralph Wiggum - Autonomous Development Loop"
echo "==============================================================="
echo ""
echo "  Tool:       $TOOL"
echo "  Iterations: $MAX_ITERATIONS"
echo ""

# Show next story
NEXT_STORY=$(jq -r '.userStories | sort_by(.priority) | map(select(.passes == false)) | .[0] | "\(.id): \(.title)"' "$PRD_FILE" 2>/dev/null)
echo "  Next story: $NEXT_STORY"
echo ""
echo "==============================================================="

for i in $(seq 1 $MAX_ITERATIONS); do
  # Get current story info
  CURRENT_STORY=$(jq -r '.userStories | sort_by(.priority) | map(select(.passes == false)) | .[0] | .id' "$PRD_FILE" 2>/dev/null)
  CURRENT_TITLE=$(jq -r '.userStories | sort_by(.priority) | map(select(.passes == false)) | .[0] | .title' "$PRD_FILE" 2>/dev/null)
  REMAINING=$(jq '[.userStories[] | select(.passes == false)] | length' "$PRD_FILE" 2>/dev/null)
  
  # Write status to file for easy monitoring (watch -n1 cat scripts/ralph/.ralph-status)
  cat > "$SCRIPT_DIR/.ralph-status" << EOF
═══════════════════════════════════════
RALPH STATUS (updated: $(date '+%H:%M:%S'))
═══════════════════════════════════════
Iteration:  $i of $MAX_ITERATIONS
Story:      $CURRENT_STORY
Title:      $CURRENT_TITLE
Remaining:  $REMAINING stories
Status:     RUNNING
═══════════════════════════════════════
EOF
  
  echo ""
  echo "╔═══════════════════════════════════════════════════════════════════╗"
  echo "║  ITERATION $i of $MAX_ITERATIONS - $REMAINING stories remaining"
  echo "║  Story: $CURRENT_STORY"
  echo "║  $CURRENT_TITLE"
  echo "╚═══════════════════════════════════════════════════════════════════╝"
  echo ""
  
  # Build the prompt with embedded story
  if ! build_prompt "$i" > "$TEMP_PROMPT" 2>&1; then
    echo "All stories complete or error building prompt"
    cat "$TEMP_PROMPT"
    rm -f "$TEMP_PROMPT"
    exit 0
  fi

  # Run the selected tool - non-interactive mode with --print
  if [[ "$TOOL" == "amp" ]]; then
    cat "$TEMP_PROMPT" | amp --dangerously-allow-all || true
  else
    claude --dangerously-skip-permissions --print < "$TEMP_PROMPT" || true
  fi
  
  # Force output flush
  echo ""
  
  # Check completion by looking at prd.json
  REMAINING_NOW=$(jq '[.userStories[] | select(.passes == false)] | length' "$PRD_FILE" 2>/dev/null)
  if [[ "$REMAINING_NOW" -eq 0 ]]; then
    echo ""
    echo "╔═══════════════════════════════════════════════════════════════════╗"
    echo "║  🎉 RALPH COMPLETE - All stories finished!"
    echo "║  Completed at iteration $i of $MAX_ITERATIONS"
    echo "╚═══════════════════════════════════════════════════════════════════╝"
    rm -f "$TEMP_PROMPT" "$SCRIPT_DIR/.ralph-status"
    exit 0
  fi
  
  # Show completion of this iteration
  NEXT_STORY=$(jq -r '.userStories | sort_by(.priority) | map(select(.passes == false)) | .[0] | .id' "$PRD_FILE" 2>/dev/null)
  NEXT_TITLE=$(jq -r '.userStories | sort_by(.priority) | map(select(.passes == false)) | .[0] | .title' "$PRD_FILE" 2>/dev/null)
  
  # Update status file
  cat > "$SCRIPT_DIR/.ralph-status" << EOF
═══════════════════════════════════════
RALPH STATUS (updated: $(date '+%H:%M:%S'))
═══════════════════════════════════════
Last completed: Iteration $i - $CURRENT_STORY
Next up:        $NEXT_STORY
Remaining:      $REMAINING_NOW stories
Status:         BETWEEN ITERATIONS
═══════════════════════════════════════
EOF
  
  echo "───────────────────────────────────────────────────────────────────"
  echo "  ✓ Iteration $i complete"
  echo "  → Next: $NEXT_STORY - $NEXT_TITLE"
  echo "───────────────────────────────────────────────────────────────────"
  echo ""
  
  sleep 2
done

rm -f "$TEMP_PROMPT"
echo ""
echo "==============================================================="
echo " Ralph reached max iterations ($MAX_ITERATIONS)"
echo " Check $PROGRESS_FILE for status."
echo "==============================================================="
exit 1
