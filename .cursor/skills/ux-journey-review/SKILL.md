---
name: ux-journey-review
description: "Review a PRD through a UX lens - walking through features as a user would. Catches confusion, dead-ends, and mental model mismatches that technical reviews miss. Triggers on: review ux, ux review, check user experience, walk through this prd, user journey review, would a user be confused."
---

# UX Journey Review Skill

Think like a user walking through the feature, not an engineer checking requirements. This skill catches issues that feel wrong even when the PRD is technically complete.

---

## The Job

1. Read the PRD provided by the user
2. Identify all major workflows
3. Walk through each workflow step-by-step as a user
4. Check for UX issues across 8 categories
5. Generate a structured report with findings and recommendations

---

## Philosophy

The PRD Reviewer asks: "Is every operation specified?"
The PRD Expander asks: "What features are missing?"
The UX Journey Review asks: "Would a user be confused?"

This skill assumes the user's perspective: "What is this? How do I...? What happens if...?"

---

## Step 1: Identify Major Workflows

Read the PRD and extract every distinct user workflow:

```
WORKFLOWS IDENTIFIED:

Primary Workflows (core value):
1. [Workflow A] - e.g., "Create a new work item from template"
2. [Workflow B] - e.g., "Track time against a task"

Secondary Workflows (supporting):
3. [Workflow C] - e.g., "Set up a recurring schedule"
4. [Workflow D] - e.g., "Review weekly work summary"

Setup/Configuration Workflows:
5. [Workflow E] - e.g., "Create a template for reuse"
```

---

## Step 2: Walk Through Each Workflow

For EACH workflow, trace the complete journey:

```
JOURNEY MAP: [Workflow Name]

Starting point: Where is the user? What's on screen?
Goal: What are they trying to accomplish?

Step 1: [User action]
  - What do they see?
  - What do they click?
  - What changes on screen?

Step 2: [User action]
  - What do they see?
  - Where might they get stuck?
  
[Continue until goal is reached]

Journey Stats:
- Total clicks to complete: X
- Context switches: X (times they leave current view)
- Dead-ends found: X
- Ambiguous moments: X (where would they hesitate?)
```

---

## Step 3: UX Issue Categories

Run through each category for every workflow:

### Category 1: Visual/Mental Model Consistency

Check if the visual representation matches the conceptual model:

```
VISUAL METAPHOR CHECK:

Feature: [e.g., My Week calendar view]
Intended metaphor: [e.g., Calendar/timeline]

Issues to flag:
- [ ] Empty state breaks the metaphor
      Example: Calendar showing "No events" text instead of empty calendar grid
      
- [ ] Full state looks different from mental model
      Example: Timeline that suddenly becomes a list when items overlap
      
- [ ] Metaphor switches mid-flow
      Example: Inbox → opens to kanban board → back button returns to different inbox layout

Questions:
- Would a user recognize what this is supposed to be?
- Does the empty version look like the full version, just empty?
- Is the visual consistent across all states?
```

### Category 2: Context Preservation

Check what happens when the user navigates:

```
CONTEXT PRESERVATION CHECK:

For each view with filters/state:
- [ ] Filters preserved when navigating away and back?
- [ ] Scroll position remembered?
- [ ] Selected items still selected?
- [ ] Partially completed forms retain data?

For detail views:
- [ ] Can user navigate to next/previous item without returning to list?
- [ ] Does detail view show enough context? (breadcrumbs, parent info)
- [ ] After editing, do they return to same list position?

For multi-step flows:
- [ ] Progress preserved if user leaves mid-flow?
- [ ] Can user review previous steps?
- [ ] What if browser back button is pressed?
```

### Category 3: Multi-tasking Scenarios

Check if the design supports real-world usage patterns:

```
MULTI-TASKING CHECK:

Scenario: User managing multiple items at once

Questions:
- If processing 5 emails, do they go back-and-forth for each one?
- Can they open multiple items in tabs or panels?
- Is there a batch/bulk mode for repetitive operations?
- When comparing items, can they see both at once?

Flags to raise:
- [ ] Sequential-only design for parallel tasks
- [ ] No way to keep reference item visible while working on another
- [ ] Forces complete one before starting another
- [ ] No bulk operations for repetitive actions
```

### Category 4: Mental Model Clarity

Check if users can understand the system:

```
CONCEPT CHECK:

For each major concept in the PRD:
1. [Concept Name] - e.g., "Templates"
   - Is it explained anywhere?
   - Can a user figure out what it does by name alone?
   - Are there examples or hints?

2. [Concept Name] - e.g., "Automators"
   - Is the relationship to other concepts clear?
   - Would "Schedule" or "Recurring" be clearer than "Automator"?

For connected concepts:
- Templates → Automators → Work Items
  - Is the relationship obvious?
  - Can user trace how they connect?
  - Would a diagram help?

Red flags:
- [ ] Jargon without explanation
- [ ] Concepts that require reading docs to understand
- [ ] Implicit relationships between features
- [ ] Same concept with different names in different places
```

### Category 5: First-time Experience

Check what new users encounter:

```
FIRST-TIME USER CHECK:

When the feature is first accessed:
- [ ] What does a new user see? (empty states, onboarding?)
- [ ] Is it clear what to do first?
- [ ] Are there helpful hints, examples, or templates?
- [ ] Can they accomplish something meaningful quickly?

Empty state quality:
- [ ] Does it explain what this feature is for?
- [ ] Does it guide toward the first action?
- [ ] Is there sample data or "try it" options?
- [ ] Does it match the visual metaphor? (calendar = empty calendar, not blank page)

First action friction:
- [ ] How many clicks to do the first meaningful thing?
- [ ] Are setup/config steps required before value?
- [ ] Can setup be skipped or done later?
```

### Category 6: Recovery Paths

Check if users can fix mistakes:

```
RECOVERY CHECK:

For each action type:

Destructive actions (delete, remove, cancel):
- [ ] Confirmation before execution?
- [ ] Undo available after execution?
- [ ] Soft delete / trash / archive option?
- [ ] How long until permanent?

State changes (status, assignments):
- [ ] Can be reversed?
- [ ] Is current state clear before changing?
- [ ] History of changes visible?

Multi-step flows:
- [ ] Can cancel at any point?
- [ ] What's saved vs lost when canceling?
- [ ] Can go back to previous steps?
- [ ] Draft/auto-save for long forms?

Error states:
- [ ] Can retry failed operations?
- [ ] Clear explanation of what went wrong?
- [ ] Suggested fix or next action?
```

### Category 7: Entry Points & Discoverability

Check if users can find features from logical places:

```
ENTRY POINT CHECK:

For the main feature:
- Can it be accessed from multiple logical places?
- Does the navigation label match what users would search for?

Example: "Set up recurring work for a client"
User might look in:
- [ ] Client page (direct context)
- [ ] Work Items list (related area)
- [ ] Settings/Automation (configuration mindset)
- [ ] Templates (related concept)

Flags to raise:
- [ ] Only accessible from one unintuitive location
- [ ] Feature name doesn't match user vocabulary
- [ ] No contextual "create new" from related views
- [ ] Hidden in settings when frequently used
```

### Category 8: Click Efficiency & Flow

Check if common tasks are efficient:

```
EFFICIENCY CHECK:

For each primary workflow:
1. [Workflow] - Current clicks: X
   - Is this reasonable for frequency of use?
   - Are there shortcuts for power users?
   - Could defaults reduce required input?

Common patterns to check:
- [ ] Frequently repeated action requires modal each time
- [ ] Must navigate away to get reference info
- [ ] No keyboard shortcuts for common actions
- [ ] Defaults not smart (e.g., due date defaults to today when usually next week)
- [ ] Must re-enter same info across related items
```

### Category 9: Redundancy & Optimal Placement

Check for over-duplication of controls and sub-optimal placement:

```
REDUNDANCY CHECK:

For each major action (create, edit, start, stop, etc.):

Count entry points on each screen:
- [ ] How many ways to trigger this action from a single page/view?
- [ ] Is each instance justified by different context?

Justified duplication examples:
✓ Timer in global header (always accessible) + timer in work item detail (contextual)
✓ "Create Work Item" in nav + "Add Task" button within work item (different scopes)
✓ Search in header (global) + search in contacts list (filtered to contacts)

Over-duplication red flags:
✗ Same action button appears 3+ times on one page
✗ Multiple identical controls with no contextual difference
✗ "Start timer" at top of page AND in page header AND in action menu (all same scope)
✗ Duplicate "Save" buttons that do identical things

Questions to ask:
- [ ] Does each entry point serve a different use case or context?
- [ ] Would removing one cause confusion or friction?
- [ ] Are any positioned awkwardly due to incremental additions?
- [ ] Is there a "primary" way that should be emphasized vs. alternatives?

Placement optimization:
- [ ] Is the most-used action in the most prominent position?
- [ ] Are related actions grouped together?
- [ ] Have incremental additions created scattered or illogical positioning?
- [ ] Would consolidating improve clarity without losing access?

Example issue:
Feature: Timer for work items
- Global header: Start timer (any work item) ✓ Justified - global access
- Work item detail page: Start timer button in page header ✗ Redundant with global
- Work item detail page: Start timer in task list for each task ✓ Justified - task-specific
Result: Remove timer from page-level header, keep global + task-level
```

---

## Step 4: Generate the Report

Structure output as:

```markdown
# UX Journey Review: [PRD Name]

## Summary

| Category | Issues Found | Severity |
|----------|--------------|----------|
| Mental Model | 2 | 1 Critical, 1 Minor |
| First-time UX | 1 | Important |
| Recovery | 0 | - |
| Entry Points | 1 | Minor |
| Redundancy | 3 | 2 Important, 1 Minor |
| ... | ... | ... |

**Overall UX Health:** [Good / Needs Work / Major Concerns]

---

## Journey Maps

### Workflow 1: [Name]

**Goal:** [What user is trying to do]
**Starting point:** [Where they begin]

| Step | User Action | Screen State | Friction? |
|------|-------------|--------------|-----------|
| 1 | Clicks "New Work" | List view | None |
| 2 | Selects template | Modal opens | None |
| 3 | ??? | Unclear | ISSUE: What fields are required? |

**Total clicks:** X
**Dead-ends:** X
**Ambiguous moments:** X

### Workflow 2: [Name]
[Continue for each workflow]

---

## UX Issues Found

### Critical (Blocks or Confuses Users)

#### Issue 1: [Title]
**Category:** [Mental Model / First-time / etc.]
**Location:** [Where in the flow]
**Problem:** [What's wrong]
**User impact:** [How it affects them]
**Recommendation:** [Specific fix]

Example:
> **Issue: Empty "My Week" shows blank page instead of empty calendar**
> Category: Visual/Mental Model
> Location: My Week view with no scheduled items
> Problem: Users see "No items scheduled" text on a blank page
> User impact: Breaks calendar metaphor; users may not recognize this as a calendar view
> Recommendation: Show empty calendar grid with week dates visible, "No items" shown within the calendar structure

### Important (Causes Friction)

#### Issue 2: [Title]
[Same structure]

### Minor (Polish Items)

#### Issue 3: [Title]
[Same structure]

---

## Questions to Resolve

These need human judgment - the PRD author should decide:

1. **[Question]**
   Context: [Why this matters]
   Options: 
   - Option A: [description + tradeoff]
   - Option B: [description + tradeoff]

2. **[Question]**
   [Continue]

---

## Recommendations

### Quick Wins (Easy fixes, high impact)
1. [Recommendation]
2. [Recommendation]

### Consider for V1 (Medium effort, improves UX significantly)
1. [Recommendation]
2. [Recommendation]

### Future Consideration (Nice to have)
1. [Recommendation]
```

---

## Severity Guidelines

**Critical:** User cannot complete task, or will definitely be confused
- Dead-end with no path forward
- Concept makes no sense without explanation
- Empty state completely breaks mental model
- Destructive action with no undo or warning

**Important:** User will experience friction or frustration
- Too many clicks for frequent action
- Context lost when navigating
- First-time user won't know what to do
- No way to do parallel tasks that users expect

**Minor:** Polish items that would improve experience
- Could use keyboard shortcut
- Slightly unclear wording
- Would benefit from loading state

---

## Red Flag Patterns

Flag immediately if you see these:

1. **The Blank Slate Problem**
   - Empty state is just "No items" instead of maintaining the UI structure
   - Calendar shows text instead of empty calendar
   - Kanban board disappears when empty

2. **The Back Button Trap**
   - User in detail view, clicks back, loses filters/scroll position
   - Multi-step flow loses all progress on back
   - Back goes somewhere unexpected

3. **The Hidden Feature**
   - Important feature only accessible from one unintuitive place
   - No contextual entry points from related areas
   - Requires knowing the feature exists to find it

4. **The Concept Puzzle**
   - Multiple related features with unclear relationship
   - Templates → Schedules → Automators → Work Items (how do these connect?)
   - User has to understand system architecture to use it

5. **The One-at-a-Time Trap**
   - Managing multiple items requires back-and-forth for each
   - Can't compare two items side by side
   - No bulk operations for obviously repetitive tasks

6. **The Over-Duplication Problem**
   - Same action appears 3+ times on one page with no contextual difference
   - Multiple entry points for same scope (all page-level OR all task-level)
   - "Start timer" in header, in toolbar, and in dropdown on same page
   - Incremental additions have created awkward scattered placement

---

## Usage Notes

1. **Run AFTER PRD is written** - This reviews, doesn't create
2. **Complements technical review** - Different concerns, both valuable
3. **Think like a confused user** - "What is this?" not "Is this implemented correctly?"
4. **Be specific** - "Empty calendar should show grid with dates" not "empty state needs work"
5. **Prioritize findings** - Not everything is critical; help focus effort

---

## Sample Questions to Ask While Reviewing

Walk through the PRD asking these:

- "If I'm a new employee on day one, can I figure out what to do?"
- "If I have 15 of these to process, how painful is it?"
- "What if I started something and got interrupted?"
- "Where would I look if I wanted to [common task]?"
- "What if I made a mistake?"
- "Does this LOOK like what it IS?" (calendar looks like calendar, inbox looks like inbox)
- "If I tell a coworker 'go to the [feature name]', would they find it?"
- "How many different ways can I [do this action] from this page? Does each one make sense?"
