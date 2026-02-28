---
name: prd-review
description: "Review a PRD for completeness, identifying missing user stories, interaction gaps, and UI state coverage. Use when you have a PRD that needs quality review before implementation. Triggers on: review this prd, check prd completeness, prd review, audit this prd, is this prd complete."
---

# PRD Review Skill

Systematically analyze a PRD to identify gaps that would cause incomplete implementations when used by autonomous agents or junior developers.

---

## The Job

1. Read the PRD provided by the user
2. Extract all entities mentioned
3. Run completeness checks
4. Generate a gap report with specific recommendations
5. Optionally: Generate the missing user stories

---

## Step 1: Entity Extraction

Read through the PRD and identify ALL entities. An entity is anything that:
- Has a data model/interface defined
- Appears in user stories as something created, viewed, edited, or deleted
- Is mentioned in API endpoints
- Appears in UI specifications

Create a list:
```
ENTITIES FOUND:
1. [Entity A] - mentioned in: [US-001, Data Models, API]
2. [Entity B] - mentioned in: [US-003, US-004]
3. [Entity C] - mentioned in: [Data Models only - WARNING: no user stories!]
```

---

## Step 2: CRUD Coverage Check

For EACH entity, check if the PRD has user stories for:

| Entity | Create | Read (List) | Read (Detail) | Update | Delete | Notes |
|--------|--------|-------------|---------------|--------|--------|-------|
| Entity A | US-002 | US-001 | US-005 | MISSING | MISSING | No edit/delete stories |
| Entity B | MISSING | US-003 | N/A | US-004 | MISSING | Has tasks but no way to add them! |

### Create Check
- [ ] Is there a story for creating this entity?
- [ ] Does it specify the trigger (button, menu item)?
- [ ] Does it specify required vs optional fields?
- [ ] Does it specify what happens after creation (redirect, close modal, etc.)?

### Read (List) Check
- [ ] Is there a story for viewing a list of this entity?
- [ ] Does it specify sorting options?
- [ ] Does it specify filtering options?
- [ ] Does it specify pagination or infinite scroll?
- [ ] Does it specify what columns/fields are shown?

### Read (Detail) Check
- [ ] Is there a story for viewing a single item's details?
- [ ] Does it specify how to navigate to detail (click row, dedicated button)?
- [ ] Does it specify the layout (tabs, sections)?

### Update Check
- [ ] Is there a story for editing this entity?
- [ ] Does it specify which fields are editable?
- [ ] Does it specify the edit interaction (modal, inline, page)?
- [ ] Does it specify validation?

### Delete Check
- [ ] Is there a story for deleting this entity?
- [ ] Does it specify confirmation behavior?
- [ ] Does it specify what happens to related/child entities?

---

## Step 3: Relationship & Hierarchy Check

For entities that contain or relate to other entities:

### Parent-Child Relationships
```
RELATIONSHIPS FOUND:
- Work Item CONTAINS Tasks
- Template CONTAINS Sections
- Section CONTAINS Template Tasks

CHECKS:
- [ ] Can Tasks be added to a Work Item? Story exists? [YES/NO - US-XXX]
- [ ] Can Tasks be removed from a Work Item? Story exists? [YES/NO]
- [ ] Can Tasks be reordered within a Work Item? Story exists? [YES/NO]
- [ ] What happens when Work Item is deleted? Tasks cascade? Specified? [YES/NO]
```

### Hierarchy Depth
```
If nesting exists (e.g., Tasks → Subtasks):
- [ ] Is the nesting depth specified? (1 level, 2 levels, unlimited?)
- [ ] Are operations for child entities specified?
- [ ] Is the UI for nested items specified?
```

---

## Step 4: UI State Coverage

Check if the PRD specifies all UI states:

### Empty States
For each list/collection view:
- [ ] Empty state message specified?
- [ ] Call-to-action in empty state specified?
- [ ] Empty state illustration/icon specified?

### Loading States
- [ ] Initial load indicator specified?
- [ ] Skeleton loaders vs spinners specified?
- [ ] Loading state for individual operations specified?

### Error States
- [ ] Form validation errors specified?
- [ ] Network/API error handling specified?
- [ ] Retry mechanism specified?

### Success Feedback
- [ ] Success notification style specified (toast, inline, redirect)?
- [ ] Undo option for destructive actions specified?

### Layout & Scroll Behavior

For each page/view, think through: "If this page has lots of content, 
what will the user need to always see while scrolling?"

**Review Questions:**
1. **Will navigation disappear?** If the header scrolls away, how does user navigate?
2. **Will context disappear?** Can user always see WHAT they're looking at?
3. **Will primary actions disappear?** Submit buttons, main CTAs - still accessible after scroll?
4. **For split views:** Does each panel scroll independently, or does scrolling 
   one panel affect the other?

**Common Gaps to Flag:**
- List + sidebar views where sidebar disappears on scroll (sidebar should be sticky)
- Detail pages with action buttons that scroll out of view (actions should be sticky)
- Forms where submit button is only at the bottom (submit area should be sticky or floating)
- Headers that scroll away losing context (header should be sticky)
- Split-panel views that scroll as one unit instead of independently

**If Not Specified, Add to Gaps:**
"Page layout doesn't specify scroll behavior. Recommend: [specific suggestion based on page type]"

Example: "Ticket detail page should have: sticky header with ticket info, 
sticky reply composer at bottom, scrollable conversation thread, 
scrollable sidebar for metadata."

---

## Step 5: Interaction Pattern Check

### Modal vs Inline
For each create/edit operation:
- [ ] Interaction pattern specified (modal, inline, page, panel)?
- [ ] Modal close behavior specified (click outside, X button, Escape key)?

### Confirmation Dialogs
For each destructive action:
- [ ] Confirmation required? Specified?
- [ ] Confirmation message specified?
- [ ] Button labels specified ("Delete" vs "Remove" vs "Cancel")?

### Form Behavior
- [ ] Validation timing specified (on blur, on submit, real-time)?
- [ ] Required field indicators specified?
- [ ] Save behavior specified (auto-save, explicit save button)?

---

## Step 6: API-to-Story Alignment

Check that every API endpoint has a corresponding user story:

```
API ENDPOINTS vs USER STORIES:

| Endpoint | Method | Corresponding Story | Status |
|----------|--------|---------------------|--------|
| /tasks | POST | US-011: Add Task | OK |
| /tasks/{id} | PUT | NONE | MISSING - no edit task story! |
| /tasks/{id} | DELETE | NONE | MISSING - no delete task story! |
| /tasks/{id}/complete | POST | US-013 | OK |
```

---

## Step 7: Generate Gap Report

Output a structured report:

```markdown
# PRD Review: [PRD Name]

## Summary
- **Entities Found:** X
- **User Stories:** Y
- **Critical Gaps:** Z
- **Overall Completeness:** XX%

## Critical Gaps (Must Fix)

### 1. Missing Create Story: [Entity Name]
**Problem:** The PRD mentions [Entity] and has API endpoints for creating it, but no user story.
**Impact:** Developers won't know how users add new [entities].
**Recommendation:** Add user story covering:
- Trigger (how does user initiate?)
- Required fields
- Success/error handling

### 2. Missing Edit Story: [Entity Name]
**Problem:** [Entity] can be created and viewed, but there's no story for editing.
**Impact:** Users will have no way to modify [entity] after creation.
**Recommendation:** Add user story specifying:
- Edit trigger (click, double-click, edit button?)
- Editable fields
- Save mechanism

### 3. [Continue for all critical gaps...]

## Minor Gaps (Should Fix)

### 1. No Empty State: [View Name]
**Problem:** The [list/view] doesn't specify what users see when no items exist.
**Recommendation:** Add acceptance criterion: "When no [items] exist, shows '[message]' with [Add button]"

### 2. No Loading State: [View Name]
**Recommendation:** Specify skeleton loader or spinner for initial load.

### 3. [Continue...]

## Implicit Assumptions Found

These items are implied but not explicitly stated:

1. **[Assumption]** - The PRD mentions [X] but doesn't specify [Y]. 
   An autonomous agent might interpret this as [Z].
   **Recommendation:** Explicitly state [expected behavior].

2. [Continue...]

## Recommended Additional User Stories

Based on the gaps found, here are user stories that should be added:

### US-NEW-001: [Story Title]
**As a** [user]
**I want to** [action]
**So that** [benefit]

**Trigger:** [specific trigger]

**Flow:**
1. [Step 1]
2. [Step 2]
...

**Acceptance Criteria:**
- [ ] [Criterion]
- [ ] [Criterion]

[Generate complete stories for all missing CRUD operations]
```

---

## Quick Checklist Output

For a fast review, output this checklist:

```markdown
## PRD Completeness Checklist: [PRD Name]

### Entity Coverage
| Entity | Create | List | Detail | Edit | Delete | Score |
|--------|--------|------|--------|------|--------|-------|
| [Name] | [check] | [check] | [check] | [X] | [X] | 3/5 |

### UI States
- [ ] Empty states for all lists
- [ ] Loading states specified
- [ ] Error handling specified
- [ ] Success feedback specified
- [ ] Confirmation dialogs for destructive actions

### Interaction Patterns
- [ ] Modal vs inline specified for all forms
- [ ] Validation behavior specified
- [ ] Save/cancel behavior specified

### Relationships
- [ ] All parent-child operations covered
- [ ] Cascade/orphan behavior specified
- [ ] Hierarchy depth specified (if nested)

### Layout & Scroll Behavior
- [ ] Sticky elements specified for each page (header, sidebar, actions)
- [ ] Scroll containers defined (what scrolls vs stays fixed)
- [ ] Split views scroll independently (if applicable)
- [ ] Primary actions remain accessible while scrolling

### API Alignment
- [ ] Every POST endpoint has create story
- [ ] Every PUT endpoint has edit story
- [ ] Every DELETE endpoint has delete story

**Overall Score: X/Y criteria met (XX%)**
```

---

## Usage

When the user provides a PRD:

1. **Read it completely** before starting analysis
2. **Don't just list problems** - provide specific, actionable recommendations
3. **Generate missing stories** in the same format as existing ones
4. **Prioritize gaps** - CRUD gaps are critical, UI state gaps are important
5. **Be specific** - "Missing delete story for Tasks" not "Some operations missing"

If the PRD is very incomplete (< 50% score), recommend rewriting with the comprehensive PRD skill rather than patching.
