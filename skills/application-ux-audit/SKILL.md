---
name: application-ux-audit
description: "Review an entire application's UX across multiple PRDs AND the actual codebase to find inconsistencies, cross-module issues, and PRD drift. Triggers on: audit app ux, application ux audit, cross-module review, check app consistency, review entire application ux, system ux audit, ux consistency check, cross-feature audit."
---

# Application UX Audit

Systematically review an application's UX by examining both PRDs and actual code to surface cross-module inconsistencies, workflow gaps, and PRD drift.

---

## The Job

1. Discover all PRDs in `/PRDs/` and `/PRDs/Added to Ralph/`
2. Identify the actual navigation structure from code
3. Map shared concepts across modules
4. Trace cross-module workflows
5. Compare PRD specifications to code implementation
6. Generate a comprehensive audit report

**Critical:** This skill inspects CODE directly. Do NOT use browser automation.

---

## Phase 1: Discovery

### Step 1A: Gather PRD Information

Read all PRD files from:
- `/PRDs/*.md`
- `/PRDs/Added to Ralph/*.md`

For each PRD, extract:
```
PRD: [filename]
Module: [module name]
Navigation Location: [where this lives in nav - from PRD]
Key Entities: [list main entities]
Shared Concepts Used: [contacts, assignments, templates, etc.]
Cross-Module References: [other modules mentioned]
```

### Step 1B: Inspect Actual Code Structure

Key files to read:

**Navigation & Layout:**
- `components/layout/sidebar.tsx` - actual navigation structure
- `components/layout/header.tsx` - header interactions
- `app/(dashboard)/layout.tsx` - dashboard shell

**Route Structure:**
- List all directories in `app/(dashboard)/` - these are the actual routes
- Note any routes that don't have PRDs
- Note any PRDs without corresponding routes

**Data Models:**
- `convex/schema.ts` - actual data relationships
- Look for shared types/concepts

**Create a Navigation Map:**
```
ACTUAL NAVIGATION (from code):
├── [Section Name]
│   ├── [Route A] → PRD-XXX (or NO PRD)
│   ├── [Route B] → PRD-XXX
│   └── [Subroute]
├── [Section Name]
│   └── ...
```

---

## Phase 2: Cross-Module Analysis

### Step 2A: Identify Shared Concepts

Search the codebase for concepts that appear in multiple modules:

| Concept | Appears In | Implementation Consistent? |
|---------|------------|---------------------------|
| Contacts | Work, Billing, Triage, ... | Check |
| Assignments | Triage, Work, My Week | Check |
| Templates | Work, Settings | Check |
| Time Entries | Time, Work, Billing | Check |
| Tags/Categories | Multiple | Check |

For each shared concept, examine:
1. **Data Model:** Is the same schema/type used? Or does each module define its own?
2. **UI Components:** Are the same components used (contact picker, assignment dropdown)?
3. **Behavior:** Does selecting/creating work the same way?

### Step 2B: Map Cross-Module Workflows

Identify key user journeys that span modules. For each:

```
WORKFLOW: [Name]
Modules Involved: [A → B → C]
PRDs Referenced: [PRD-001, PRD-003, ...]

Steps:
1. [Module A] User does X
   - Code location: [file path]
   - What context is passed?
   
2. [Module B] User continues with Y
   - Code location: [file path]
   - Is context received? How?
   
3. [Module C] User completes with Z
   - Does final step have full context?

Gaps Found:
- [ ] Context lost between step X and Y
- [ ] No link from A to B
- [ ] Terminology differs (A calls it X, B calls it Y)
```

**Key Workflows to Trace:**
1. Email → Create Work Item → Log Time → Create Invoice
2. Template → Recurring Automation → Work Item Creation
3. Contact → Associated Work Items → Billing History
4. Assignment flow (where assigned, where viewed, where completed)

---

## Phase 3: Consistency Checks

### 3A: UI Pattern Consistency

For each pattern, search the codebase and document variations:

**Confirmation Dialogs:**
- Search for: `AlertDialog`, `confirm`, delete operations
- Are confirmation messages consistent?
- Are button labels consistent ("Delete" vs "Remove" vs "Cancel")?

**Empty States:**
- Search for: "No [items]", "empty", "Get started"
- Is messaging tone consistent?
- Do all lists have empty states?

**Create/Edit Patterns:**
- When is modal used vs page vs slide-over?
- Is it consistent within similar operations?

**Loading States:**
- Are skeleton loaders or spinners used consistently?
- Search for: `Skeleton`, `loading`, `isLoading`

### 3B: Terminology Audit

Search for variations of key terms:

| Canonical Term | Variations Found | Files | Recommendation |
|---------------|------------------|-------|----------------|
| Work Item | "Work", "Project", "Job" | [...] | Standardize to X |
| Assignment | "Assign", "Assigned to" | [...] | Check consistency |
| Recurring Work | "Automation", "Schedule" | [...] | Clarify distinction |

Code search patterns:
- Search UI strings (labels, buttons, headings)
- Search for plural/singular inconsistencies
- Search for similar but different terms

### 3C: Component Usage Consistency

Check if standard components are used consistently:

| Component | Expected Use | Actual Use | Gaps |
|-----------|--------------|------------|------|
| ContactPicker | Selecting contacts | Check all modules | |
| AssignmentDropdown | Assigning users | Check all modules | |
| DatePicker | Date selection | All date inputs | |
| StatusBadge | Status display | Check styling | |

---

## Phase 4: PRD vs Code Drift Analysis

For each PRD, compare spec to implementation:

```
PRD: [filename]
Module: [name]

NAVIGATION:
- PRD says: [nav location/structure]
- Code shows: [actual location]
- Drift: [none | minor | significant]

ENTITIES:
- PRD defines: [entities]
- Code implements: [entities]
- Missing in code: [list]
- Extra in code (not in PRD): [list]

USER STORIES:
Sample 3-5 key user stories and verify:
- US-XXX: [title]
  - PRD flow: [expected flow]
  - Actual code: [what code does]
  - Match: [yes | partial | no]

KEY BEHAVIORS:
- [Behavior A]: PRD says X, code does Y
- [Behavior B]: ...

VERDICT:
- [ ] PRD is authoritative (update code)
- [ ] Code is authoritative (update PRD)
- [ ] Both need alignment
```

---

## Phase 5: Generate Audit Report

Output the following sections:

### 1. Navigation Map

```markdown
## Current Navigation Structure

### Actual (from code)
[Tree structure of sidebar + routes]

### Per PRD Specs
[What PRDs say navigation should be]

### Discrepancies
- [Module X] is under Settings but PRD says it belongs under Work
- [Route Y] exists with no corresponding PRD
- [PRD-XXX] defines route that doesn't exist
```

### 2. Cross-Module Workflow Maps

```markdown
## Key User Journeys

### Workflow: [Name]
[Diagram or step list]

**Status:** Complete | Has Gaps | Broken

**Issues:**
- Step X to Y: [issue description]
```

### 3. Consistency Report

```markdown
## Consistency Analysis

### Confirmation Dialogs
| Module | Delete Confirmation | Style | Message |
|--------|---------------------|-------|---------|
| Work   | Yes                 | Modal | "Delete work item?" |
| Contacts | Yes              | Modal | "Remove contact?" |

**Issues:** Inconsistent verb usage (delete vs remove)

### Empty States
[Similar table format]

### Terminology
[Table of term variations with recommendations]
```

### 4. PRD Drift Report

```markdown
## PRD vs Code Discrepancies

### PRD-XXX: [Module Name]
**Drift Level:** Low | Medium | High

| Area | PRD | Code | Action |
|------|-----|------|--------|
| Nav Location | Settings | Work | Update PRD |
| Entity X | Defined | Missing | Implement or remove from PRD |

### PRD-YYY: [Module Name]
...
```

### 5. UX Issues (Prioritized)

```markdown
## UX Issues Found

### Critical (Blocks User Workflows)
1. **[Issue Title]**
   - Location: [module/file]
   - Problem: [description]
   - Impact: [user impact]
   - Recommendation: [specific fix]

### High (Significant UX Friction)
1. ...

### Medium (Inconsistency/Polish)
1. ...

### Low (Nice to Have)
1. ...
```

### 6. Recommendations

```markdown
## Recommendations

### Immediate Actions
1. [Action] - [rationale]

### Short-term Improvements
1. ...

### Architecture Considerations
1. [Suggestion for better organization]
```

---

## Key Files to Inspect

### Navigation & Structure
- `components/layout/sidebar.tsx`
- `components/layout/header.tsx`
- `app/(dashboard)/layout.tsx`
- All subdirectories in `app/(dashboard)/`

### Shared Components
- `components/` - look for shared pickers, dropdowns, dialogs
- Search for: `Dialog`, `AlertDialog`, `Sheet`, `Modal`

### Data Layer
- `convex/schema.ts`
- `convex/*.ts` - mutations and queries for shared operations

### Each Module
- `app/(dashboard)/[module]/page.tsx` - main page
- `app/(dashboard)/[module]/[id]/page.tsx` - detail pages
- Related components in `components/`

---

## Search Patterns

Use these grep patterns to find relevant code:

```bash
# Find all empty states
rg -l "No .* yet|Get started|empty" --type tsx

# Find confirmation dialogs
rg -l "AlertDialog|confirm" --type tsx

# Find loading states
rg "isLoading|loading|Skeleton" --type tsx

# Find assignment-related code
rg -i "assign|assigned" --type tsx --type ts

# Find terminology variations
rg -i "work item|work-item|workitem" --type tsx
```

---

## Checklist Before Completion

- [ ] All PRDs in both directories have been read
- [ ] Actual navigation structure documented from code
- [ ] At least 3 cross-module workflows traced
- [ ] Shared concepts (contacts, assignments, templates) checked
- [ ] Confirmation dialogs compared across modules
- [ ] Empty states compared across modules
- [ ] PRD drift documented for each module
- [ ] Issues prioritized by severity
- [ ] Specific recommendations provided

---

## Output Format

Save the audit report to: `tasks/ux-audit-[date].md`

Structure:
1. Executive Summary (key findings in 5 bullets)
2. Navigation Map
3. Cross-Module Workflows
4. Consistency Report
5. PRD Drift Report
6. Prioritized Issues
7. Recommendations
8. Appendix: Files Inspected

---

## Usage Notes

- This is a read-only audit - do not make changes during the audit
- Focus on cross-cutting issues, not individual module bugs
- When in doubt about "correct" behavior, flag for human decision
- Code often reflects intentional decisions not in PRDs - ask before assuming PRD is right
- Prioritize issues that affect multiple modules over single-module issues
