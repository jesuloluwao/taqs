---
name: prd-expander
description: "Expand a basic PRD with feature suggestions and UX considerations. Prompts product thinking about information architecture, user workflows, and feature depth. Use when you have a working PRD that feels thin. Triggers on: expand this prd, flesh out this prd, what am I missing, prd suggestions, make this prd better, prd expander."
---

# PRD Expander Skill

Help PRD authors think like product people by suggesting feature expansions and prompting UX considerations. This is NOT about completeness (that's PRD Review) - it's about depth and thoughtfulness.

---

## The Job

1. Read the PRD provided by the user
2. Extract entities and their relationships
3. Generate feature expansion suggestions
4. Generate UX/product thinking prompts
5. Output prioritized suggestions with rationale

---

## Philosophy

The PRD Reviewer asks: "Can someone implement what you've described?"
The PRD Expander asks: "Have you thought deeply enough about what you're building?"

This skill prompts questions, not answers. The PRD author decides what's right for their product.

---

## Step 1: Entity & Relationship Mapping

Read the PRD and create a mental model:

```
ENTITIES:
- Work Item (primary entity)
  - Has many: Tasks
  - Has many: Time Entries
  - Belongs to: Client
  - Has one: Template (optional)

RELATIONSHIPS:
- Work Item → Tasks (parent-child)
- Work Item → Client (association)
- Template → Work Item (source)
```

---

## Step 2: Feature Expansion Patterns

For EACH entity, consider these expansion patterns. Only suggest ones that make sense for this domain:

### Hierarchy & Structure
| Pattern | Question to Ask |
|---------|-----------------|
| **Nesting** | "You have Tasks - do users need subtasks? How deep?" |
| **Grouping** | "With many Tasks, would Sections help organize them?" |
| **Ordering** | "Can items be reordered? Drag-and-drop? Manual sort order?" |
| **Dependencies** | "Can Task B depend on Task A? Block until complete?" |

### Lifecycle & State
| Pattern | Question to Ask |
|---------|-----------------|
| **Archiving** | "When work is done, archive or delete? Need to reference old items?" |
| **Soft delete** | "Should delete be reversible? Trash/recycle bin?" |
| **Versioning** | "Do users need to see previous versions? Track changes?" |
| **Duplication** | "Would users want to clone/duplicate this entity?" |

### Collaboration & Audit
| Pattern | Question to Ask |
|---------|-----------------|
| **Comments** | "Do users need to discuss this entity? Threaded comments?" |
| **Activity log** | "Should users see who changed what and when?" |
| **Assignments** | "Can multiple people be assigned? Primary + watchers?" |
| **Notifications** | "When should users be notified about changes?" |

### Organization & Discovery
| Pattern | Question to Ask |
|---------|-----------------|
| **Tags/Labels** | "Beyond categories, do users need flexible tagging?" |
| **Favorites/Pins** | "Should users be able to pin frequently accessed items?" |
| **Search** | "How will users find this among hundreds of items?" |
| **Filters** | "What filters beyond basic ones? Saved filters?" |

### Bulk & Power User
| Pattern | Question to Ask |
|---------|-----------------|
| **Bulk operations** | "Select multiple and delete/archive/assign/move?" |
| **Import/Export** | "Bring data in from CSV? Export for reporting?" |
| **Keyboard shortcuts** | "For power users, what actions need shortcuts?" |
| **Templates** | "Can users create their own templates from existing items?" |

### Attachments & Links
| Pattern | Question to Ask |
|---------|-----------------|
| **File attachments** | "Do users need to attach documents to this entity?" |
| **Links to other entities** | "Should this link to other items in the system?" |
| **External links** | "URLs, references to external systems?" |

---

## Step 3: UX/Product Thinking Prompts

These questions help the PRD author think through the actual user experience:

### Information Architecture
```
You have [X] sub-objects on [Entity]. How should they be organized?

OPTIONS TO CONSIDER:
□ Tabs - Good when: sub-objects are distinct, users focus on one at a time
□ Collapsible sections - Good when: users need to see multiple at once
□ Single scroll - Good when: everything fits, no need to hide
□ Sidebar + main content - Good when: navigation + detail pattern
□ Nested pages - Good when: sub-objects are complex enough to be their own view

QUESTIONS:
- What does the user need to see 80% of the time? Put that first/default.
- What's secondary but still needs quick access?
- What's rarely used and can be buried in "More" or settings?
```

### User Workflow Analysis
```
Walk through the primary user journey:

1. User lands on [page] - what do they see first?
2. User wants to [primary action] - how many clicks?
3. User needs to [secondary action] - is it discoverable?
4. User made a mistake - how do they undo/fix?

QUESTIONS:
- What's the MOST COMMON thing a user does here? Is it the easiest?
- What takes too many clicks? Can we reduce?
- Are related actions grouped together?
- Does the user lose context during any flow?
```

### Interaction Pattern Decisions
```
For each create/edit action, consider:

MODAL:
✓ Good for: Quick actions, focused input, don't lose page context
✗ Bad for: Complex forms, need to reference other data, long workflows

INLINE EDIT:
✓ Good for: Single field changes, quick updates, lists
✗ Bad for: Multiple related fields, validation complexity

DEDICATED PAGE:
✓ Good for: Complex entities, lots of fields, sub-navigation needed
✗ Bad for: Simple creates, frequent operations

SLIDE-OUT PANEL:
✓ Good for: Detail views, keeping list visible, moderate complexity
✗ Bad for: Full-width content needs, complex sub-navigation

QUESTIONS:
- Will the user need to see other data while doing this action?
- How often is this action performed? (frequent = fast access)
- How complex is the form? (complex = more space needed)
```

### Priority & Default States
```
When the user opens [Entity detail page]:

WHAT SHOULD BE VISIBLE IMMEDIATELY:
- [ ] Most important summary info
- [ ] Primary action buttons
- [ ] Most-used sub-object (which one?)

WHAT CAN BE ONE CLICK AWAY:
- [ ] Secondary sub-objects
- [ ] Settings/configuration
- [ ] History/activity

WHAT CAN BE HIDDEN:
- [ ] Rarely used features
- [ ] Admin/advanced options
- [ ] Archived/completed items

QUESTIONS:
- If the user only had 5 seconds, what must they see?
- What's the default tab/view? Why?
- Should completed/archived items be hidden by default?
```

### Context & Navigation
```
QUESTIONS:
- When viewing [Entity], does user need breadcrumbs back to parent?
- After creating [Entity], where should user land?
- Can user navigate between sibling items without going back to list?
- Is there a logical "next" action to suggest?
```

### Empty & First-Time States
```
First-time user with zero [Entities]:

QUESTIONS:
- What's the onboarding experience? Just "Add first [Entity]"?
- Should there be sample data or templates to start from?
- Is the empty state an opportunity to educate about features?
```

---

## Step 4: Generate Output

Structure your output as:

```markdown
# PRD Expander: [PRD Name]

## Feature Expansion Suggestions

### High Value (Likely Worth Adding)

#### 1. [Suggestion Name]
**Pattern:** [e.g., Grouping/Sections]
**Current state:** You have Tasks as a flat list.
**Suggestion:** Consider adding Sections to group related tasks.
**Why it matters:** With 10+ tasks, users struggle to find what they need. Sections like "Setup", "Monthly", "Wrap-up" provide structure.
**Questions to answer:**
- Can sections be reordered?
- Can tasks move between sections?
- Are sections just for organization or do they have properties (due dates, assignees)?

#### 2. [Next suggestion...]

### Medium Value (Consider Based on User Needs)

#### 3. [Suggestion...]

### Lower Priority (Nice-to-Have)

#### 4. [Suggestion...]

---

## UX/Product Thinking Prompts

### Information Architecture

**Observation:** Work Item has 6 sub-objects: Tasks, Time, Documents, Notes, Budget, Activity.

**Questions to consider:**
1. What's the default view when opening a Work Item? Tasks seems most common - is that right for your users?
2. Should all 6 be tabs, or group some? (e.g., Documents + Notes = "Files & Notes")
3. Is Activity important enough for a tab, or collapse into a sidebar/footer?
4. On mobile, how does this simplify?

### User Workflow

**Observation:** Creating a new Task requires opening the Work Item, clicking Tasks tab, clicking Add Task.

**Questions to consider:**
1. Could tasks be added inline without a modal?
2. Should there be a quick-add from the Work Item header?
3. For bulk task creation, is there a faster path?

### Interaction Patterns

**Observation:** The PRD doesn't specify how task editing works.

**Questions to consider:**
1. Click to edit inline? Or modal?
2. What if user clicks task title vs. clicking an edit icon?
3. Checkbox for completion - does it trigger anything else?

---

## Summary

| Category | Suggestions | Key Decision Needed |
|----------|-------------|---------------------|
| Feature Expansion | 4 high, 3 medium, 2 low | Task sections - yes/no? |
| UX/Architecture | 3 prompts | Default tab decision |
| Interaction | 2 prompts | Inline vs modal editing |

**Recommended next step:** Decide on the 2-3 highest-impact suggestions, then update the PRD before running PRD Review for completeness checking.
```

---

## Usage Notes

1. **Run BEFORE PRD Review** - Expander helps you add depth, then Review checks completeness
2. **Be selective** - Not every suggestion applies. This is a menu, not a checklist.
3. **Ask, don't prescribe** - Present options and questions, let the PRD author decide
4. **Domain awareness** - Tailor suggestions to the product domain (accounting app vs social app have different needs)
5. **Prioritize ruthlessly** - Too many features = bloat. Help identify what's truly valuable.

---

## Anti-Patterns to Avoid

- **Feature creep** - Don't suggest everything. Some products benefit from simplicity.
- **Assuming complexity** - Not every list needs filtering, sorting, and 10 view options.
- **Ignoring context** - A task in a to-do app ≠ a task in project management software.
- **Being prescriptive** - "You should add sections" vs "Would sections help organize tasks?"
