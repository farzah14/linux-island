#!/usr/bin/env python3
"""Offline read-only consistency checks for the Gemini Flash developer kit."""
from pathlib import Path
import json
import re
import sys
import xml.etree.ElementTree as ET

root = Path(__file__).resolve().parents[2]
problems = []

def require(path):
    target = root / path
    if not target.is_file():
        problems.append(f"missing file: {path}")
    return target

require('START_HERE.md')
require('GEMINI_FLASH_EXECUTION_GUIDE.md')
require('AGENTS.md')
require('docs/TASK_STATUS.md')
require('README.md')
require('design-system/STYLE_GUIDE_PREVIEW.html')
require('design-system/DESIGN_SYSTEM.md')
require('docs/superpowers/specs/2026-10-24-linux-island-v0.1-design.md')
require('docs/superpowers/plans/2026-10-24-linux-island-v0.1-implementation.md')
require('schemas/io.github.linuxisland.Core1.xml')
require('scripts/dev/audit-environment.sh')

for m in ['00-START-HERE','M0','M1','M2','M3','M4','M5']:
    require(f'docs/superpowers/plans/gemini-flash-v2/{m}.md')

manifest_path = require('prompts/gemini-flash-v2/TASK_MANIFEST.json')
if manifest_path.is_file():
    manifest=json.loads(manifest_path.read_text())
    tasks=manifest.get('tasks',[])
    if manifest.get('taskCount')!=21 or len(tasks)!=21:
        problems.append('manifest must declare 21 tasks')
    seen=set()
    for t in tasks:
        ident=t['id']
        if ident in seen: problems.append(f'duplicate task ID {ident}')
        seen.add(ident)
        if ident not in range(1,22): problems.append(f'out-of-range task ID {ident}')
        prompt=require(t['file'])
        if prompt.is_file():
            body=prompt.read_text()
            if f'TASK: {ident:02d}' not in body: problems.append(f'prompt {ident} missing TASK report format')
            if 'STATUS: PASS | PARTIAL | BLOCKED | FAIL' not in body:
                problems.append(f'prompt {ident} missing explicit status choices')
        milestone=root/f"docs/superpowers/plans/gemini-flash-v2/{t['milestone']}.md"
        if milestone.is_file():
            for card in re.findall(r'M[0-5]-\d+[A-Z]?', t['cards']):
                if card not in milestone.read_text():
                    problems.append(f'task {ident} references nonexisting card {card}')
        for dep in t['dependsOn']:
            if dep >= ident or dep < 1: problems.append(f'invalid dependency task {ident} -> {dep}')
    if seen!=set(range(1,22)):
        problems.append('manifest IDs not exactly 1..21')

palette_path=require('design-system/tokens/tokens.json')
if palette_path.is_file():
    palette=json.loads(palette_path.read_text())
    if palette.get('name')!='Linux Island Warm Minimalist':
        problems.append('Wrong design system name')
    if palette.get('palette',{}).get('amber',{}).get('300')!='#D8B77F':
        problems.append('Warm amber canonical token changed')

schema_path=root/'schemas/io.github.linuxisland.Core1.xml'
if schema_path.is_file():
    iface=ET.parse(schema_path).getroot().find("interface[@name='io.github.linuxisland.Core1']")
    if iface is None:
        problems.append('Core1 interface absent')
    else:
        methods=[x.attrib['name'] for x in iface.findall('method')]
        signals=[x.attrib['name'] for x in iface.findall('signal')]
        if methods != ['GetSnapshot','GetMediaState','ControlMedia','SetActivePlayer','GetSettings','UpdateSettings']:
            problems.append('Core1 method set/order drifted')
        if signals != ['MediaChanged','SettingsChanged','CoreStatusChanged']:
            problems.append('Core1 signal set/order drifted')

if problems:
    print('FAIL: Gemini Flash kit verification')
    for problem in problems: print(' -',problem)
    sys.exit(1)
print('PASS: 21 prompts, 7 v2 runbooks, warm tokens, Core1 schema and starter paths verified')
