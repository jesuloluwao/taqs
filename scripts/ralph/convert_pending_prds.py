#!/usr/bin/env python3
"""
Script to convert pending PRDs to prd.json format for Ralph.
Reads PRD markdown files and converts them to JSON format.
"""

import json
import re
import os
from pathlib import Path

def extract_prd_context(prd_content):
    """Extract PRD context (name, overview, background, goals) from markdown."""
    context = {}
    
    # Extract name from title
    title_match = re.search(r'^# CHANGE: (.+)$', prd_content, re.MULTILINE)
    if title_match:
        context['name'] = title_match.group(1).strip()
    
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
    
    # Extract background (usually in Problem section)
    if problem_match:
        context['background'] = problem_match.group(1).strip()[:300] + '...' if len(problem_match.group(1)) > 300 else problem_match.group(1).strip()
    
    # Extract goals from Proposed Change section
    goals_match = re.search(r'## Proposed Change\s*\n\n(.+?)(?=\n\n## |$)', prd_content, re.DOTALL)
    goals = []
    if goals_match:
        # Look for numbered or bulleted goals
        goal_lines = re.findall(r'^\d+\.\s+(.+)$', goals_match.group(1), re.MULTILINE)
        goals.extend(goal_lines[:5])  # Limit to 5 goals
    
    if not goals:
        # Fallback: extract from key features
        features_match = re.search(r'### \d+\.\s+(.+?)(?=\n\n###|\n##|$)', prd_content, re.DOTALL)
        if features_match:
            goals.append(features_match.group(1).strip()[:100])
    
    context['goals'] = goals if goals else ["Implement feature as specified in PRD"]
    
    return context

def extract_user_stories(prd_content, prd_id, start_id):
    """Extract user stories from PRD and convert to JSON format."""
    stories = []
    current_id = start_id
    
    # Find all user story sections
    story_pattern = r'### (US-[A-Z0-9-]+|US-[A-Z]+-\d+):\s*(.+?)(?=\n\n### |\n\n## |$)'
    story_matches = re.finditer(story_pattern, prd_content, re.DOTALL)
    
    for match in story_matches:
        story_id = match.group(1)
        story_content = match.group(2)
        
        # Extract title (first line after story ID)
        title_match = re.search(r'^\*\*As a\*\*.*?\*\*I want to\*\*\s*(.+?)\s*\*\*So that\*\*', story_content, re.MULTILINE | re.DOTALL)
        if not title_match:
            # Try alternative format
            title_match = re.search(r'^(.+?)$', story_content.strip(), re.MULTILINE)
        
        title = title_match.group(1).strip() if title_match else story_id
        
        # Extract description
        desc_match = re.search(r'^\*\*As a\*\*\s*(.+?)\s*\*\*I want to\*\*\s*(.+?)\s*\*\*So that\*\*\s*(.+?)(?=\n\n|\*\*|$)', story_content, re.DOTALL)
        if desc_match:
            description = f"As a {desc_match.group(1).strip()}, I want {desc_match.group(2).strip()} so that {desc_match.group(3).strip()}"
        else:
            description = f"As a user, I want {title.lower()} so that I can use this feature."
        
        # Extract acceptance criteria
        criteria_section = re.search(r'\*\*Acceptance Criteria:\*\*\s*\n((?:- \[ \].*\n?)+)', story_content, re.MULTILINE)
        criteria = []
        if criteria_section:
            criteria_lines = re.findall(r'- \[ \]\s*(.+?)(?=\n- \[ \]|\n\n|$)', criteria_section.group(1), re.DOTALL)
            criteria = [line.strip() for line in criteria_lines]
        
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
        is_ui_story = any(keyword in story_content.lower() for keyword in ['ui', 'component', 'page', 'view', 'button', 'dialog', 'modal', 'form', 'display', 'render'])
        if is_ui_story and not any('browser' in c.lower() or 'verify' in c.lower() for c in criteria):
            criteria.append("Verify in browser using dev-browser skill")
        
        story = {
            "id": f"US-{current_id}",
            "title": title[:100],  # Limit title length
            "description": description[:200] if len(description) > 200 else description,
            "acceptanceCriteria": criteria[:20],  # Limit to 20 criteria
            "priority": current_id - start_id + 1,  # Sequential priority
            "passes": False,
            "notes": f"{prd_id}: {story_id}"
        }
        
        stories.append(story)
        current_id += 1
    
    return stories, current_id

def main():
    """Main conversion function."""
    prds_dir = Path(__file__).parent.parent.parent / "PRDs" / "Pending"
    prd_json_path = Path(__file__).parent / "prd.json"
    
    # Read existing prd.json
    with open(prd_json_path, 'r') as f:
        prd_data = json.load(f)
    
    # Find last story ID
    last_id = 0
    for story in prd_data.get('userStories', []):
        story_num = int(story['id'].replace('US-', ''))
        last_id = max(last_id, story_num)
    
    next_id = last_id + 1
    
    # Process each pending PRD
    pending_prds = sorted(prds_dir.glob("CHANGE-*.md"))
    
    for prd_file in pending_prds:
        print(f"Processing {prd_file.name}...")
        
        with open(prd_file, 'r') as f:
            prd_content = f.read()
        
        # Extract PRD ID from filename
        prd_id = prd_file.stem.replace('CHANGE-', 'CHANGE-')
        
        # Extract context
        context = extract_prd_context(prd_content)
        
        # Extract user stories
        stories, next_id = extract_user_stories(prd_content, prd_id, next_id)
        
        # Add to prd.json
        prd_data['prdContext'][prd_id] = context
        prd_data['userStories'].extend(stories)
        
        print(f"  Added {len(stories)} stories (US-{next_id - len(stories)} to US-{next_id - 1})")
    
    # Write updated prd.json
    with open(prd_json_path, 'w') as f:
        json.dump(prd_data, f, indent=2)
    
    print(f"\nConversion complete! Added {next_id - last_id - 1} total stories.")

if __name__ == '__main__':
    main()
