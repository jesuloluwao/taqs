# Design Guidelines for Ralph PRDs

When creating prd.json files for Ralph, include design-focused user stories to avoid generic "AI slop" UIs.

## The Problem

Technical-only acceptance criteria like:
- "Sidebar has w-60 (240px) width"
- "Use bg-muted/40 background"
- "Use ShadCN Button variant='ghost'"

...result in stock, generic interfaces because they specify implementation details rather than design outcomes.

## The Solution

### 1. Add a Design Foundation Story Early (Priority 15-20)

```json
{
  "id": "US-DESIGN-001",
  "title": "Create custom design system foundation",
  "description": "As a user, I need a distinctive, polished interface that reflects the app's professional purpose.",
  "acceptanceCriteria": [
    "Configure custom Google Fonts in app/layout.tsx using next/font/google",
    "Use a distinctive display font (Outfit, Figtree, or Sora) for headings",
    "Use a refined body font (DM Sans or Plus Jakarta Sans) for text",
    "Create custom color palette in globals.css - NOT stock ShadCN blue",
    "Primary color should reflect app purpose (e.g., deep indigo for professional services)",
    "Add warm-tinted neutrals instead of pure gray",
    "Define sidebar-specific dark theme colors",
    "Add custom shadows (shadow-soft, shadow-medium) to tailwind.config.ts",
    "Add animation utilities (fade-in, slide-up) to globals.css",
    "Body element has antialiased class",
    "Typecheck passes"
  ],
  "priority": 15,
  "passes": false,
  "notes": "DESIGN: This story establishes the visual foundation for all other UI work"
}
```

### 2. Write Design-Outcome Acceptance Criteria

Instead of:
```
"Sidebar has bg-muted/40 background"
```

Write:
```
"Sidebar has a dark theme that contrasts with main content area"
"Sidebar uses custom sidebar color variables from globals.css"
```

Instead of:
```
"Header has h-14 (56px) height"
```

Write:
```
"Header has appropriate height for content and feels balanced"
"Header uses backdrop blur effect for modern glass-morphism"
```

### 3. Include Polish Stories

```json
{
  "id": "US-POLISH-001", 
  "title": "Add micro-interactions and animations",
  "description": "As a user, I need subtle animations that make the interface feel responsive and polished.",
  "acceptanceCriteria": [
    "Page content fades in on load (animate-fade-in)",
    "Navigation items have hover transforms (scale or translate)",
    "Active states have smooth color transitions",
    "Tooltips appear on collapsed sidebar items",
    "Toast notifications have proper positioning and styling",
    "Typecheck passes"
  ],
  "priority": 50,
  "passes": false,
  "notes": "DESIGN: Polish pass after core functionality is complete"
}
```

### 4. Reference Design Context in Notes

Add design context to story notes:

```json
{
  "notes": "PRD-000: Layout - Use dark sidebar theme, ensure visual hierarchy between sidebar and content"
}
```

## Checklist for Design-Aware PRDs

Before running Ralph, verify your prd.json includes:

- [ ] Design foundation story (fonts, colors, shadows)
- [ ] Sidebar story mentions dark theme or custom colors
- [ ] Header story mentions backdrop blur or polish
- [ ] At least one polish/animation story
- [ ] Notes reference design expectations where relevant
- [ ] Acceptance criteria describe outcomes, not just pixel values

## Example: Transforming a Generic Story

### Before (Generic)
```json
{
  "title": "Create Sidebar component structure",
  "acceptanceCriteria": [
    "Sidebar has w-60 (240px) width",
    "Sidebar has bg-muted/40 background",
    "Sidebar has border-r right border"
  ]
}
```

### After (Design-Aware)
```json
{
  "title": "Create Sidebar component with dark theme",
  "acceptanceCriteria": [
    "Sidebar uses dark theme (sidebar-background color variable)",
    "Sidebar contrasts clearly with main content area",
    "Sidebar has subtle border or shadow for depth",
    "Sidebar includes brand logo/icon area at top",
    "Navigation items have hover and active state transitions",
    "Collapsed state shows tooltips on hover"
  ]
}
```
