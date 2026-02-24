#!/usr/bin/env python3
"""
Comprehensive PRD to prd.json converter following Ralph skill guidelines.
Reads all pending PRDs and converts them to JSON format with proper story sizing.
"""

import json
import re
from pathlib import Path
from typing import Dict, List, Any

def extract_prd_context(prd_content: str, prd_id: str) -> Dict[str, Any]:
    """Extract PRD context following Ralph skill guidelines."""
    context = {}
    
    # Extract name from title
    title_match = re.search(r'^# CHANGE:\s*(.+)$', prd_content, re.MULTILINE)
    if title_match:
        context['name'] = title_match.group(1).strip()
    else:
        context['name'] = prd_id.replace('CHANGE-', '')
    
    # Extract overview from Problem section (first paragraph)
    problem_match = re.search(r'## Problem\s*\n\n(.+?)(?=\n\n|\n###|\n##|$)', prd_content, re.DOTALL)
    if problem_match:
        overview = problem_match.group(1).strip()
        # Take first sentence or first 200 chars
        sentences = overview.split('. ')
        if sentences:
            context['overview'] = sentences[0] + '.' if not sentences[0].endswith('.') else sentences[0]
        else:
            context['overview'] = overview[:200] + '...' if len(overview) > 200 else overview
    else:
        context['overview'] = f"Implements {context['name']} feature"
    
    # Extract background (usually in Problem section)
    if problem_match:
        background = problem_match.group(1).strip()
        context['background'] = background[:400] + '...' if len(background) > 400 else background
    else:
        context['background'] = f"Adds {context['name']} functionality to the platform"
    
    # Extract goals from Proposed Change section
    goals = []
    proposed_match = re.search(r'## Proposed Change\s*\n\n(.+?)(?=\n\n## |$)', prd_content, re.DOTALL)
    if proposed_match:
        # Look for numbered or bulleted goals
        goal_lines = re.findall(r'^\d+\.\s+(.+?)(?=\n|$)', proposed_match.group(1), re.MULTILINE)
        goals.extend([g.strip()[:150] for g in goal_lines[:6]])  # Limit to 6 goals, 150 chars each
    
    # Also check Key Features section
    if not goals:
        features_match = re.search(r'### \d+\.\s+(.+?)(?=\n\n###|\n##|$)', prd_content, re.DOTALL)
        if features_match:
            goals.append(features_match.group(1).strip()[:150])
    
    context['goals'] = goals if goals else [f"Implement {context['name']} feature"]
    
    # Extract core concepts if present
    core_concepts_match = re.search(r'## (?:Core )?Concepts\s*\n\n(.+?)(?=\n\n## |$)', prd_content, re.DOTALL)
    if core_concepts_match:
        concepts = {}
        # Look for concept definitions
        concept_lines = re.findall(r'\*\*(\w+)\*\*:\s*(.+?)(?=\n\n|\*\*|$)', core_concepts_match.group(1), re.DOTALL)
        for concept_name, concept_def in concept_lines[:5]:  # Limit to 5 concepts
            concepts[concept_name] = concept_def.strip()[:200]
        if concepts:
            context['coreConcepts'] = concepts
    
    return context

def extract_user_stories(prd_content: str, prd_id: str, start_id: int) -> tuple[List[Dict[str, Any]], int]:
    """Extract and convert user stories following Ralph skill guidelines."""
    stories = []
    current_id = start_id
    
    # Find all user story sections (various formats)
    # Pattern: ### US-XXX: Title followed by content until next ### or ##
    story_pattern = r'### (US-[A-Z0-9-]+):\s*(.+?)(?=\n\n### |\n\n## |$)'
    
    found_stories = []
    matches = re.finditer(story_pattern, prd_content, re.DOTALL)
    for match in matches:
        story_id = match.group(1)
        story_content = match.group(2)
        found_stories.append((story_id, story_content))
    
    # If no explicit user stories found, create stories from sections
    if not found_stories:
        # Look for major sections that indicate stories
        sections = re.findall(r'^## (.+)$', prd_content, re.MULTILINE)
        # Filter out non-story sections
        story_sections = [s for s in sections if s not in ['Problem', 'Proposed Change', 'Entities', 'API Requirements', 'UI Specifications', 'Acceptance Criteria', 'Implementation Notes', 'Future Enhancements']]
        
        # Create stories from major feature sections
        for section in story_sections[:10]:  # Limit to 10 sections
            found_stories.append(f"**As a** user\n**I want to** {section.lower()}\n**So that** I can use this feature.")
    
    # Convert each found story
    for story_id, story_content in found_stories[:20]:  # Limit to 20 stories per PRD
        # Extract title
        title_match = re.search(r'\*\*As a\*\*.*?\*\*I want to\*\*\s*(.+?)\s*\*\*So that\*\*', story_content, re.MULTILINE | re.DOTALL)
        if not title_match:
            # Try alternative format
            title_match = re.search(r'^(.+?)$', story_content.strip(), re.MULTILINE)
        
        title = title_match.group(1).strip()[:100] if title_match else f"Implement {prd_id} feature"
        
        # Extract description
        desc_match = re.search(r'\*\*As a\*\*\s*(.+?)\s*\*\*I want to\*\*\s*(.+?)\s*\*\*So that\*\*\s*(.+?)(?=\n\n|\*\*|$)', story_content, re.DOTALL)
        if desc_match:
            description = f"As a {desc_match.group(1).strip()}, I want {desc_match.group(2).strip()} so that {desc_match.group(3).strip()}"
        else:
            description = f"As a user, I want {title.lower()} so that I can use this feature."
        
        # Extract acceptance criteria
        criteria = []
        criteria_section = re.search(r'\*\*Acceptance Criteria:\*\*\s*\n((?:- \[ \].*\n?)+)', story_content, re.MULTILINE)
        if criteria_section:
            criteria_lines = re.findall(r'- \[ \]\s*(.+?)(?=\n- \[ \]|\n\n|$)', criteria_section.group(1), re.DOTALL)
            criteria = [line.strip() for line in criteria_lines[:15]]  # Limit to 15 criteria
        
        # If no criteria found, create basic ones
        if not criteria:
            criteria = [
                "Feature implemented as specified",
                "Typecheck passes"
            ]
        else:
            # Ensure Typecheck passes is included
            if not any('typecheck' in c.lower() for c in criteria):
                criteria.append("Typecheck passes")
        
        # Determine if UI story (add browser verification)
        is_ui_story = any(keyword in story_content.lower() for keyword in ['ui', 'component', 'page', 'view', 'button', 'dialog', 'modal', 'form', 'display', 'render', 'show', 'visible'])
        if is_ui_story and not any('browser' in c.lower() or 'verify' in c.lower() for c in criteria):
            criteria.append("Verify in browser using dev-browser skill")
        
        # Determine priority based on content (schema first, then backend, then UI)
        if any(keyword in story_content.lower() for keyword in ['schema', 'table', 'database', 'migration']):
            priority = current_id - start_id + 1
        elif any(keyword in story_content.lower() for keyword in ['query', 'mutation', 'action', 'backend', 'api']):
            priority = current_id - start_id + 1
        else:
            priority = current_id - start_id + 1
        
        story = {
            "id": f"US-{current_id}",
            "title": title,
            "description": description[:300] if len(description) > 300 else description,
            "acceptanceCriteria": criteria[:20],  # Limit to 20 criteria
            "priority": priority,
            "passes": False,
            "notes": f"{prd_id}: {story_id}"
        }
        
        stories.append(story)
        current_id += 1
    
    # If no stories found, create a default story
    if not stories:
        stories.append({
            "id": f"US-{current_id}",
            "title": f"Implement {prd_id}",
            "description": f"As a user, I want {prd_id.replace('CHANGE-', '').replace('-', ' ').lower()} so that I can use this feature.",
            "acceptanceCriteria": [
                "Feature implemented as specified in PRD",
                "Typecheck passes",
                "Verify in browser using dev-browser skill"
            ],
            "priority": 1,
            "passes": False,
            "notes": f"{prd_id}: Initial implementation"
        })
        current_id += 1
    
    return stories, current_id

def main():
    """Main conversion function."""
    prds_dir = Path(__file__).parent.parent.parent / "PRDs" / "Pending"
    prd_json_path = Path(__file__).parent / "prd.json"
    
    # Read existing prd.json
    print(f"Reading {prd_json_path}...")
    with open(prd_json_path, 'r') as f:
        prd_data = json.load(f)
    
    # Find last story ID (handle decimal IDs)
    last_id = 0
    for story in prd_data.get('userStories', []):
        story_id = story['id'].replace('US-', '')
        try:
            story_num = float(story_id)
            last_id = max(last_id, int(story_num))
        except ValueError:
            pass
    
    next_id = last_id + 1
    print(f"Last story ID: {last_id}, starting from US-{next_id}")
    
    # Process each pending PRD
    pending_prds = sorted(prds_dir.glob("CHANGE-*.md"))
    print(f"Found {len(pending_prds)} pending PRDs")
    
    total_stories = 0
    for prd_file in pending_prds:
        print(f"\nProcessing {prd_file.name}...")
        
        with open(prd_file, 'r') as f:
            prd_content = f.read()
        
        # Extract PRD ID from filename
        prd_id = prd_file.stem.replace('CHANGE-', 'CHANGE-')
        
        # Extract context
        context = extract_prd_context(prd_content, prd_id)
        print(f"  Context: {context['name']}")
        
        # Extract user stories
        stories, next_id = extract_user_stories(prd_content, prd_id, next_id)
        print(f"  Created {len(stories)} stories (US-{next_id - len(stories)} to US-{next_id - 1})")
        total_stories += len(stories)
        
        # Add to prd.json
        prd_data['prdContext'][prd_id] = context
        prd_data['userStories'].extend(stories)
    
    # Write updated prd.json
    print(f"\nWriting updated prd.json...")
    print(f"Total stories added: {total_stories}")
    with open(prd_json_path, 'w') as f:
        json.dump(prd_data, f, indent=2)
    
    print(f"\nConversion complete! Added {total_stories} total stories.")
    print(f"New stories: US-{last_id + 1} to US-{next_id - 1}")

if __name__ == '__main__':
    main()
