---
name: ralph
description: "Convert PRDs to prd.json format for the Ralph autonomous agent system. Use when you have an existing PRD and need to convert it to Ralph's JSON format. Triggers on: convert this prd, turn this into ralph format, create prd.json from this, ralph json."
---

# Ralph PRD Converter

Converts existing PRDs to the prd.json format that Ralph uses for autonomous execution.

---

## The Job

Take a PRD (markdown file or text) and convert it to `prd.json` in your ralph directory.

**IMPORTANT:** Always add PRD changes to the **main `prd.json` file**, not separate files. If a `prd.json` already exists:
1. Read the existing `prd.json` file
2. Add the new PRD's `prdContext` entry to the existing `prdContext` object
3. Add the new user stories to the existing `userStories` array, renumbering them sequentially (continuing from the last story ID)
4. Never create separate files like `prd-change-XXX.json` - all changes go into the main `prd.json`

---

## Output Format

```json
{
 "project": "[Project Name]",
 "branchName": "ralph/[feature-name-kebab-case]",
 "description": "[Feature description from PRD title/intro]",
 "sourcePrd": "[Relative path to the source PRD markdown file]",
 "prdContext": {
   "PRD-XXX": {
     "name": "[Module Name from PRD title]",
     "overview": "[1-2 sentences from PRD Overview section]",
     "background": "[1-2 sentences from PRD Background section explaining domain context]",
     "goals": [
       "Goal 1: Description",
       "Goal 2: Description"
     ],
     "coreConcepts": {
       "ConceptName": "Definition (only include if PRD has important domain concepts)"
     }
   }
 },
 "userStories": [
 {
 "id": "US-001",
 "title": "[Story title]",
 "description": "As a [user], I want [feature] so that [benefit]",
 "acceptanceCriteria": [
 "Criterion 1",
 "Criterion 2",
 "Typecheck passes"
 ],
 "priority": 1,
 "passes": false,
 "notes": "PRD-XXX: [section reference] - See '[UI Specification section name]' for mockups"
 }
 ]
}
```

### Source PRD (Important)

The `sourcePrd` field points to the original PRD markdown file. This is critical because:
- The JSON is the **task checklist** (what to do, in what order)
- The PRD is the **design reference** (UI mockups, interaction patterns, visual specs)

The agent will read both files but follow the JSON for task execution while consulting the PRD for design decisions.

### PRD Context (Important)

The `prdContext` section provides high-level context that helps Ralph understand the module's purpose before implementing individual stories. Extract this from the PRD's opening sections:

- **name**: The module/feature name from the PRD title
- **overview**: What the module does (from PRD Overview section)
- **background**: Domain context explaining why this matters (from PRD Background section)
- **goals**: Array of objectives (from PRD Goals & Objectives section)
- **coreConcepts**: Optional - include only if the PRD defines important domain terms that Ralph needs to understand (e.g., Queue vs View distinctions, entity relationships)

### Story Notes (Critical for Design Context)

**Each user story's `notes` field should reference specific PRD sections** so the agent knows exactly where to look for design details:

```json
"notes": "CHANGE-044: US-TUX-003 - See 'Multi-Select States (List View)' in UI Specifications"
```

Good notes patterns:
- `"PRD-003: US-WORK-005 - See 'Work Item Detail Page' mockup"`
- `"CHANGE-044: See 'Hierarchical Assignment' in UI Specifications for tree structure"`
- `"PRD-002: US-TRIAGE-010 - Reference 'Preview Mode Layout' diagram"`

The agent uses these notes to navigate directly to relevant mockups and design specs in the source PRD, rather than guessing at implementation details.

---

## Story Size: Finding the Right Balance

**Each story must be completable in ONE Ralph iteration (one context window).**

Ralph spawns a fresh Amp instance per iteration with no memory of previous work. If a story is too big, the LLM runs out of context before finishing and produces broken code.

### The Goldilocks Principle

Stories should be **small enough** to complete in one iteration, but **large enough** to represent meaningful progress. Overly granular stories create excessive overhead (reading context, verifying, committing) that slows down the overall build.

### Group related operations together:

**Database schema for a module → ONE story**
```
❌ Too granular:
- US-001: Add users table
- US-002: Add posts table
- US-003: Add comments table

✅ Better:
- US-001: Add database schema for blog module (users, posts, comments tables with indexes)
```

**CRUD operations for an entity → ONE story**
```
❌ Too granular:
- US-010: Create listPosts query
- US-011: Create getPost query
- US-012: Create createPost mutation
- US-013: Create updatePost mutation
- US-014: Create deletePost mutation

✅ Better:
- US-010: Create posts CRUD operations (list, get, create, update, delete)
```

**Related UI components → ONE story**
```
❌ Too granular:
- US-020: Add progress bar to list view
- US-021: Add progress bar to detail view
- US-022: Add status dropdown to detail view

✅ Better:
- US-020: Add progress display and status controls to work item views
```

### Right-sized stories:
- Create all database tables for a module (schema story)
- Create all CRUD operations for an entity (backend story)
- Build a complete page with its core functionality
- Add a feature with 2-4 related UI changes
- Implement a form with validation and submission

### Too big (still split these):
- "Build the entire dashboard" - Split into: schema, backend CRUD, list page, detail page, filters
- "Add authentication" - Split into: schema + auth config, auth pages, protected routes
- "Build full CRUD UI" - Split into: backend operations, list view, create/edit form, detail view

### Too small (combine these):
- Individual database table additions (combine into one schema story)
- Individual query/mutation per story (combine into CRUD story)
- Minor UI tweaks that are part of the same feature

**Rule of thumb:** 
- If you cannot describe the change in 2-3 sentences, it is too big.
- If the story only touches one function/file with trivial changes, it is too small - combine with related work.

### Acceptance Criteria Count (IMPORTANT)

**Target: 8-12 acceptance criteria per story. Maximum: 15.**

Even if the story scope is right, too many criteria exhaust the agent's working memory. Count your criteria - if a story has more than 15, split it.

**Example - Too many criteria (28):**
```json
{
  "id": "US-510",
  "title": "Views Management page for admins",
  "acceptanceCriteria": [
    "Create /settings/views route and page",
    "Add 'Views Management' item to Settings sidebar",
    "Page shows 'System Views' section at top",
    "System Views table shows: drag handle, name, description...",
    "System views include: All Tickets, My Tickets...",
    "Edit button opens dialog/sheet with tabs",
    "Edit dialog shows warning banner",
    "Filters tab uses same filter builder...",
    "Columns tab allows drag-to-reorder...",
    "Save button applies changes...",
    "Reset to Default button shows confirmation...",
    "'Shared Views' section below System Views",
    "Shared Views table shows: drag handle, name...",
    "Create Shared View opens full view editor",
    "Sharing tab options: Everyone, Specific Teams...",
    "Delete shows confirmation...",
    "Duplicate creates copy...",
    "Drag-and-drop reordering...",
    "Reorder saves automatically...",
    "New order reflects immediately...",
    "Empty state for Shared Views...",
    "Non-admins cannot access this page...",
    "Typecheck passes"
  ]
}
```

**Split by functional area:**
```json
{
  "id": "US-510a",
  "title": "Views Management page with System Views section",
  "acceptanceCriteria": [
    "Create /settings/views route and page",
    "Add 'Views Management' item to Settings sidebar with LayoutGrid icon",
    "Page shows 'System Views' section at top with description",
    "System Views table shows: drag handle, name, description, 'Modified' badge, Edit button, Reset button",
    "System views include: All Tickets, My Tickets, Unassigned, New, Pending",
    "Non-admins cannot access this page (redirect to settings home)",
    "Typecheck passes"
  ],
  "priority": 2,
  "notes": "CHANGE-044: US-TUX-002a - See 'Views Management Page' in UI Specifications"
},
{
  "id": "US-510b",
  "title": "System View edit dialog",
  "acceptanceCriteria": [
    "Edit button opens dialog/sheet with tabs: Filters, Columns, Sort, Grouping",
    "Edit dialog shows warning banner: 'Changes will affect all users'",
    "Filters tab uses same filter builder component as view creation",
    "Columns tab allows drag-to-reorder and show/hide toggles",
    "Save button applies changes and shows success toast",
    "Reset to Default button shows confirmation dialog",
    "Typecheck passes"
  ],
  "priority": 3,
  "notes": "CHANGE-044: US-TUX-002b - See 'View Edit Dialog/Sheet' in UI Specifications"
},
{
  "id": "US-510c",
  "title": "Shared Views section with CRUD and reordering",
  "acceptanceCriteria": [
    "'Shared Views' section below System Views with 'Create Shared View' button",
    "Shared Views table shows: drag handle, name, Shared With, Created By, Created Date, Edit button, action menu",
    "Create Shared View opens full view editor with Sharing tab",
    "Sharing tab options: Everyone (radio), Specific Teams (multi-select), Specific Users (multi-select)",
    "Action menu has Duplicate and Delete options",
    "Delete shows confirmation: 'Users who have it favorited will lose access'",
    "Duplicate creates copy with '(Copy)' suffix and opens in edit mode",
    "Drag-and-drop reordering within each section saves automatically with toast",
    "Empty state: 'No shared views yet. Create a shared view...'",
    "Typecheck passes"
  ],
  "priority": 4,
  "notes": "CHANGE-044: US-TUX-002c - See 'Views Management Page' in UI Specifications"
}
```

**Splitting rules:**
1. **Count criteria** - If > 15, must split
2. **Find natural boundaries** - Look for distinct functional areas (schema, different UI sections, different user flows)
3. **Each split gets its own notes** - Reference the specific PRD section for that split
4. **Maintain dependencies** - Earlier splits should not depend on later ones
5. **Suffix the ID** - Use US-XXXa, US-XXXb, etc. to show they're related

---

## Story Ordering: Dependencies First

Stories execute in priority order. Earlier stories must not depend on later ones.

**Correct order:**
1. Schema/database changes (migrations)
2. Server actions / backend logic
3. UI components that use the backend
4. Dashboard/summary views that aggregate data

**Wrong order:**
1. UI component (depends on schema that does not exist yet)
2. Schema change

---

## Acceptance Criteria: Must Be Verifiable

Each criterion must be something Ralph can CHECK, not something vague.

### Good criteria (verifiable):
- "Add `status` column to tasks table with default 'pending'"
- "Filter dropdown has options: All, Active, Completed"
- "Clicking delete shows confirmation dialog"
- "Typecheck passes"
- "Tests pass"

### Bad criteria (vague):
- "Works correctly"
- "User can do X easily"
- "Good UX"
- "Handles edge cases"

### Always include as final criterion:
```
"Typecheck passes"
```

For stories with testable logic, also include:
```
"Tests pass"
```

---

## Conversion Rules

1. **Each user story becomes one JSON entry**
2. **IDs**: Sequential (US-001, US-002, etc.)
3. **Priority**: Based on dependency order, then document order
4. **All stories**: `passes: false` and empty `notes`
5. **branchName**: Derive from feature name, kebab-case, prefixed with `ralph/`
6. **Always add**: "Typecheck passes" to every story's acceptance criteria

---

## Splitting Large PRDs

If a PRD has big features, split them into meaningful chunks - but don't over-split:

**Original:**
> "Add user notification system"

**Split into (good balance):**
1. US-001: Add notifications schema and backend operations (table, CRUD queries/mutations)
2. US-002: Create notification UI components (bell icon, dropdown panel, notification items)
3. US-003: Add mark-as-read and notification preferences

**Over-split (avoid this):**
1. US-001: Add notifications table ← too small
2. US-002: Create listNotifications query ← too small
3. US-003: Create getNotification query ← too small
4. US-004: Create createNotification mutation ← too small
5. US-005: Add notification bell icon ← too small
6. US-006: Create dropdown panel ← combine with #5
7. US-007: Add mark-as-read mutation ← too small
8. US-008: Add notification preferences page

**The overhead of each iteration (context loading, verification, commits) adds up. 
3 well-scoped stories will complete faster than 8 tiny ones.**

---

## Example

**Input PRD:**
```markdown
# PRD-042: Task Status Feature

## Overview
The Task Status feature enables users to track progress on individual tasks through a visual status system.

## Background
Task management apps need clear progress indicators. Users currently cannot distinguish between tasks that are pending, in progress, or completed without manually reviewing each one.

## Goals & Objectives
1. **Progress Visibility**: Show task status at a glance
2. **Workflow Efficiency**: Enable quick status updates without opening task details
3. **Filtering**: Allow users to focus on tasks in specific states

## Requirements
- Toggle between pending/in-progress/done on task list
- Filter list by status
- Show status badge on each task
- Persist status in database
```

**Output prd.json (well-balanced):**
```json
{
 "project": "TaskApp",
 "branchName": "ralph/task-status",
 "description": "Task Status Feature - Track task progress with status indicators",
 "sourcePrd": "PRDs/PRD-042-Task-Status.md",
 "prdContext": {
   "PRD-042": {
     "name": "Task Status Feature",
     "overview": "Enables users to track progress on individual tasks through a visual status system.",
     "background": "Task management apps need clear progress indicators. Users currently cannot distinguish between tasks that are pending, in progress, or completed without manually reviewing each one.",
     "goals": [
       "Progress Visibility: Show task status at a glance",
       "Workflow Efficiency: Enable quick status updates without opening task details",
       "Filtering: Allow users to focus on tasks in specific states"
     ]
   }
 },
 "userStories": [
 {
 "id": "US-001",
 "title": "Add status field and update query",
 "description": "As a developer, I need status tracking in the database.",
 "acceptanceCriteria": [
 "Add status column to tasks: 'pending' | 'in_progress' | 'done' (default 'pending')",
 "Add index on status field",
 "Create updateTaskStatus mutation that validates status values",
 "Update listTasks query to accept optional status filter parameter",
 "Typecheck passes"
 ],
 "priority": 1,
 "passes": false,
 "notes": "PRD-042: Schema + backend - See 'Data Model' section"
 },
 {
 "id": "US-002",
 "title": "Add status UI to task list",
 "description": "As a user, I want to see and change task status in the list.",
 "acceptanceCriteria": [
 "Each task row shows colored status badge (gray=pending, blue=in_progress, green=done)",
 "Each row has status dropdown that saves immediately via updateTaskStatus",
 "Add filter dropdown to page header: All | Pending | In Progress | Done",
 "Filter updates the task list via listTasks query",
    "Filter persists in URL params",
    "Typecheck passes"
  ],
  "priority": 2,
 "passes": false,
 "notes": "PRD-042: See 'Task List UI' mockup in UI Specifications"
 }
 ]
}
```

**Note:** This is 2 stories instead of 4. The first handles all backend work, the second handles all UI work. 
Each story is still completable in one iteration, but we avoid the overhead of 4 separate iterations for tightly related changes.

**Key points:**
- `sourcePrd` points to the full PRD with mockups and detailed specs
- `prdContext` gives quick background context
- `notes` point to specific sections in the PRD for design details
- The agent follows the JSON checklist but consults the PRD for implementation guidance

---

## Archiving Previous Runs

**Before writing a new prd.json, check if there is an existing one from a different feature:**

1. Read the current `prd.json` if it exists
2. Check if `branchName` differs from the new feature's branch name
3. If different AND `progress.txt` has content beyond the header:
 - Create archive folder: `archive/YYYY-MM-DD-feature-name/`
 - Copy current `prd.json` and `progress.txt` to archive
 - Reset `progress.txt` with fresh header

**The ralph.sh script handles this automatically** when you run it, but if you are manually updating prd.json between runs, archive first.

---

## Checklist Before Saving

Before writing prd.json, verify:

- [ ] **Previous run archived** (if prd.json exists with different branchName, archive it first)
- [ ] **sourcePrd field included** pointing to the original PRD markdown file
- [ ] **prdContext included** with overview, background, and goals extracted from the PRD
- [ ] **Story notes reference specific PRD sections** (e.g., "CHANGE-044: US-TUX-003 - See 'Multi-Select States' mockup")
- [ ] Each story is completable in one iteration (small enough)
- [ ] **Stories aren't over-granular** (combine related schema changes, CRUD operations, and UI components)
- [ ] **No story has more than 15 acceptance criteria** (split if over - see "Acceptance Criteria Count" section)
- [ ] Stories are ordered by dependency (schema to backend to UI)
- [ ] Every story has "Typecheck passes" as criterion
- [ ] Acceptance criteria are verifiable (not vague)
- [ ] No story depends on a later story
- [ ] **Design foundation story included** (see below)

### Quick Granularity Check
Count your stories and ask: "Could I combine any adjacent stories that touch the same feature area?"
- Multiple schema stories for one module → combine into one
- Multiple query/mutation stories for one entity → combine into CRUD story
- Multiple small UI tweaks for same page → combine into one UI story

---

## Design-Aware PRDs (IMPORTANT)

Generic user stories produce generic UIs. Include design guidance to avoid "AI slop."

### Include a Design Foundation Story Early

For any PRD with UI work, add a story like this around priority 15-20:

```json
{
  "id": "US-DESIGN-001",
  "title": "Create custom design system foundation",
  "description": "As a user, I need a distinctive, polished interface.",
  "acceptanceCriteria": [
    "Configure custom Google Fonts in app/layout.tsx using next/font/google",
    "Use distinctive display font (Outfit, Figtree, or Sora) for headings",
    "Use refined body font (DM Sans or Plus Jakarta Sans)",
    "Create custom color palette in globals.css - NOT stock ShadCN blue",
    "Primary color reflects app purpose (not generic blue)",
    "Define sidebar-specific dark theme colors",
    "Add custom shadows and animations to tailwind.config.ts",
    "Body element has antialiased class",
    "Typecheck passes"
  ],
  "priority": 15,
  "passes": false,
  "notes": "DESIGN: Visual foundation for all UI work"
}
```

### Write Design-Outcome Criteria (Not Implementation Details)

**Avoid:**
```
"Sidebar has bg-muted/40 background"  ← stock default
"Header has h-14 (56px) height"       ← arbitrary pixels
```

**Instead:**
```
"Sidebar uses dark theme that contrasts with content"
"Sidebar uses custom sidebar color variables"  
"Header has backdrop blur effect"
"Navigation items have hover transitions"
```

### Add a Polish Story

Near the end of UI-heavy PRDs, include:

```json
{
  "id": "US-POLISH-001",
  "title": "Add micro-interactions and animations",
  "acceptanceCriteria": [
    "Page content fades in on load",
    "Navigation items have hover transforms",
    "Active states have smooth transitions",
    "Tooltips on collapsed sidebar items",
    "Toast notifications properly positioned and styled",
    "Typecheck passes"
  ],
  "priority": 50,
  "passes": false,
  "notes": "DESIGN: Polish pass after core functionality"
}
```

### Design Quick Check

Before saving prd.json for UI-heavy features:
- [ ] Has design foundation story (fonts, colors, shadows)?
- [ ] Sidebar/header stories mention theming, not just dimensions?
- [ ] At least one polish/animation story?
- [ ] Acceptance criteria describe outcomes, not stock defaults?
