# Monitoring Ralph

## How Ralph Works

Ralph is an autonomous agent that works in iterations. Each iteration:

1. **Reads** `prd.json` to find the highest priority incomplete user story
2. **Reads** `progress.txt` to understand what's been done and learn patterns
3. **Checks** the git branch matches `prd.json`'s `branchName`
4. **Implements** that single user story (one story per iteration)
5. **Runs** quality checks (typecheck, lint, build)
6. **Commits** changes with message: `feat: [Story ID] - [Story Title]`
7. **Updates** `prd.json` to mark the story as `passes: true`
8. **Appends** progress to `progress.txt`
9. **Stops** if all stories are complete (outputs " COMPLETE ")

## What You'll See

### Terminal Output
When you run `./ralph.sh --tool claude`, you'll see:
- Each iteration's number and progress
- **All output from Claude Code** (what it's reading, what it's doing)
- The script uses `tee /dev/stderr` so Claude's output goes to your terminal

### Files to Watch

1. **`progress.txt`** - Live log of what Ralph is doing
   ```bash
   # Watch it in real-time:
   tail -f scripts/ralph/progress.txt
   ```

2. **`prd.json`** - See which stories are complete
   ```bash
   # Check completion status:
   jq '.userStories[] | select(.passes == false) | {id, title, priority}' scripts/ralph/prd.json
   ```

3. **Git commits** - See what Ralph commits
   ```bash
   # Watch commits as they happen:
   git log --oneline --all -10
   
   # Or in another terminal:
   watch -n 2 'git log --oneline -5'
   ```

4. **Git status** - See what Ralph is working on
   ```bash
   # Check current changes:
   git status
   ```

## Recommended Monitoring Setup

### Option 1: Single Terminal (Simple)
Just run Ralph and watch the output:
```bash
./scripts/ralph/ralph.sh --tool claude 5
```
You'll see everything Claude does in real-time.

### Option 2: Multiple Terminals (Better Visibility)

**Terminal 1:** Run Ralph
```bash
cd /Users/sampotashnick/Documents/practice-management
./scripts/ralph/ralph.sh --tool claude 5
```

**Terminal 2:** Watch progress log
```bash
cd /Users/sampotashnick/Documents/practice-management
tail -f scripts/ralph/progress.txt
```

**Terminal 3:** Watch git activity (macOS compatible)
```bash
cd /Users/sampotashnick/Documents/practice-management
# Option 1: Use the monitor loop script
./scripts/ralph/monitor-loop.sh

# Option 2: Manual loop (Ctrl+C to stop)
while true; do clear; git log --oneline -5; echo "---"; git status --short; sleep 2; done

# Option 3: Install watch via homebrew (if you want)
# brew install watch
# watch -n 2 'git log --oneline -5 && echo "---" && git status --short'
```

**Terminal 4:** Monitor file changes (macOS compatible)
```bash
cd /Users/sampotashnick/Documents/practice-management
# Manual loop
while true; do clear; find . -name "*.tsx" -o -name "*.ts" | head -20; sleep 1; done
```

### Option 3: macOS-Compatible Monitoring Loop

Use the provided loop script:
```bash
./scripts/ralph/monitor-loop.sh
```
This continuously refreshes the dashboard every 3 seconds. Press Ctrl+C to stop.

### Option 4: VS Code Multi-View

Open these files side-by-side:
- `scripts/ralph/progress.txt` (auto-refresh)
- `scripts/ralph/prd.json` (see completion status)
- Git log view in VS Code

## Understanding the Output

### What Claude Code Does
- Reads files (you'll see file paths)
- Makes edits (you'll see what changed)
- Runs commands (you'll see terminal output)
- Commits changes (you'll see commit messages)

### What to Look For

✅ **Good signs:**
- "Reading prd.json..."
- "Implementing US-001..."
- "Running typecheck..."
- "Committing changes..."
- "Story US-001 marked as complete"

⚠️ **Warning signs:**
- Errors in typecheck/lint
- "Story too large, splitting..."
- Multiple failed attempts on same story

🛑 **Stop conditions:**
- Output contains " COMPLETE " (all stories done)
- Max iterations reached
- You press Ctrl+C

## Safety Features

1. **One story per iteration** - Small, focused changes
2. **Quality checks before commit** - Won't commit broken code
3. **Progress logging** - Full audit trail
4. **Git commits** - Easy to review/revert
5. **Branch isolation** - Works on `ralph/` branch

## If Something Goes Wrong

1. **Check progress.txt** - See what Ralph was trying to do
2. **Check git log** - See what was committed
3. **Check git status** - See uncommitted changes
4. **Review prd.json** - See which stories are marked complete
5. **Fix manually** - You can fix issues and mark story as `passes: true` manually

## Stopping Ralph

- **Ctrl+C** - Stops current iteration, leaves changes uncommitted
- **Let it finish** - It will stop when all stories complete or max iterations reached

## First Run Tips

1. Start with **1-2 iterations** to see how it works:
   ```bash
   ./scripts/ralph/ralph.sh --tool claude 2
   ```

2. Review what it did:
   ```bash
   git log --oneline -5
   cat scripts/ralph/progress.txt
   ```

3. If you're happy, run more iterations:
   ```bash
   ./scripts/ralph/ralph.sh --tool claude 10
   ```
