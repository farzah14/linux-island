#!/usr/bin/env python3
"""Deterministic fixture runner for Linux Island cross-desktop UI parity tests.

Provides isolated test states for Media, System, AI Quota, and Search pages
without touching real user accounts, private cookies, or personal media.
"""
import argparse
import json
import os
from pathlib import Path
import subprocess
import sys
import time

ROOT = Path(__file__).resolve().parents[2]

FIXTURES = {
    'FIX-MEDIA-EMPTY': {
        'page': 'media',
        'description': 'Core service online, zero active media players.',
        'media': None,
    },
    'FIX-MEDIA-PLAYING': {
        'page': 'media',
        'description': 'Active audio playback with standard metadata, 25% progress, 0.8 volume.',
        'media': {
            'playerId': 'org.mpris.MediaPlayer2.TestPlayer',
            'title': 'Solaris Drift',
            'artist': 'Warm Ambient Collective',
            'playbackStatus': 'Playing',
            'positionUs': 60000000,
            'durationUs': 240000000,
            'canPlay': true if hasattr(bool, 'true') else True,
            'canPause': True,
            'canNext': True,
            'canPrevious': True,
            'canSeek': True,
            'volume': 0.8,
            'audioLevels': [0.4, 0.8, 0.5],
        },
    },
    'FIX-MEDIA-PAUSED': {
        'page': 'media',
        'description': 'Paused playback with position retained, BeatBars stopped.',
        'media': {
            'playerId': 'org.mpris.MediaPlayer2.TestPlayer',
            'title': 'Solaris Drift',
            'artist': 'Warm Ambient Collective',
            'playbackStatus': 'Paused',
            'positionUs': 60000000,
            'durationUs': 240000000,
            'canPlay': True,
            'canPause': False,
            'canNext': True,
            'canPrevious': True,
            'canSeek': True,
            'volume': 0.8,
            'audioLevels': [0.0, 0.0, 0.0],
        },
    },
    'FIX-MEDIA-LONG-TEXT': {
        'page': 'media',
        'description': 'Exceedingly long title and artist to verify ellipsis and boundary safety.',
        'media': {
            'playerId': 'org.mpris.MediaPlayer2.LongPlayer',
            'title': 'Symphony No. 9 in D Minor, Op. 125 "Choral": IV. Presto - Allegro assai vivace',
            'artist': 'Berliner Philharmoniker, Herbert von Karajan, Wiener Singverein & Soloists',
            'playbackStatus': 'Playing',
            'positionUs': 120000000,
            'durationUs': 1440000000,
            'canPlay': True,
            'canPause': True,
            'canNext': True,
            'canPrevious': True,
            'canSeek': True,
            'volume': 1.0,
            'audioLevels': [0.6, 0.9, 0.7],
        },
    },
    'FIX-MEDIA-NO-SEEK': {
        'page': 'media',
        'description': 'Live stream without seek capability (canSeek: false).',
        'media': {
            'playerId': 'org.mpris.MediaPlayer2.LiveRadio',
            'title': 'BBC World Service Live Stream',
            'artist': 'BBC News & Features',
            'playbackStatus': 'Playing',
            'positionUs': 0,
            'durationUs': 0,
            'canPlay': True,
            'canPause': True,
            'canNext': False,
            'canPrevious': False,
            'canSeek': False,
            'volume': 0.75,
            'audioLevels': [0.3, 0.5, 0.4],
        },
    },
    'FIX-CORE-OFFLINE': {
        'page': 'media',
        'description': 'Core service disconnected/offline; UI displays "Core offline" fallback.',
        'connected': False,
        'media': None,
    },
    'FIX-SYSTEM-NORMAL': {
        'page': 'system',
        'description': 'Normal system metrics with CPU 25%, RAM 48%, Battery 85%, active network.',
        'metrics': {
            'cpuPercent': 25.0,
            'cpuText': '25%',
            'memPercent': 48.0,
            'memText': '48%',
            'memDetailText': '7.6 / 15.8 GB',
            'hasBattery': True,
            'batteryPercent': 85,
            'batteryCharging': True,
            'batteryText': '85%',
            'netText': '1.3 MB/s',
            'netDetailText': '↓ 1.2 MB/s · ↑ 140 KB/s',
        },
    },
    'FIX-SYSTEM-NO-BAT': {
        'page': 'system',
        'description': 'Desktop system with no battery hardware present.',
        'metrics': {
            'cpuPercent': 15.0,
            'cpuText': '15%',
            'memPercent': 32.0,
            'memText': '32%',
            'memDetailText': '5.1 / 15.8 GB',
            'hasBattery': False,
            'netText': '240 KB/s',
            'netDetailText': '↓ 200 KB/s · ↑ 40 KB/s',
        },
    },
    'FIX-AI-QUOTA-NORMAL': {
        'page': 'ai',
        'description': 'Active AI quota entries for Antigravity, OpenAI Codex, and Claude Code.',
        'quota': {
            'antigravity': {'connected': True, 'percent5h': 62, 'percent7d': 45, 'detailText': 'Resets in 2h 15m', 'altDetailText': 'Resets on Mon 09:00'},
            'codex': {'connected': True, 'percent5h': 28, 'percent7d': 18, 'detailText': 'Resets in 4h 30m', 'altDetailText': 'Resets on Sun 00:00'},
            'claude': {'connected': True, 'percent5h': 85, 'percent7d': 70, 'detailText': 'Resets in 45m', 'altDetailText': 'Resets on Tue 12:00'},
        },
    },
    'FIX-AI-QUOTA-OFFLINE': {
        'page': 'ai',
        'description': 'AI session offline / backend unreachable; honest "No active session" state.',
        'quota': {
            'antigravity': {'connected': False, 'detailText': 'No active session'},
            'codex': {'connected': False, 'detailText': 'No active session'},
            'claude': {'connected': False, 'detailText': 'No active session'},
        },
    },
    'FIX-SEARCH-INITIAL': {
        'page': 'search',
        'description': 'Search section ready, Google/Brave engine selector visible, empty query.',
        'search': {'engine': 'google', 'query': ''},
    },
    'FIX-SEARCH-FOCUSED': {
        'page': 'search',
        'description': 'Search entry focused with active focus ring and typed query text.',
        'search': {'engine': 'google', 'query': 'linux island documentation'},
    },
}


def list_fixtures():
    print(f"Linux Island UI Parity Fixture Catalog ({len(FIXTURES)} fixtures):\n")
    print(f"{'FIXTURE ID':<24} {'PAGE':<10} {'DESCRIPTION'}")
    print("-" * 78)
    for fix_id, fix_data in sorted(FIXTURES.items()):
        print(f"{fix_id:<24} {fix_data['page']:<10} {fix_data['description']}")


def verify_fixtures():
    """Programmatic verification of fixture definitions."""
    required_keys = {'page', 'description'}
    errors = []
    for fix_id, fix_data in FIXTURES.items():
        if not required_keys.issubset(fix_data.keys()):
            errors.append(f"{fix_id} missing required keys")
        if fix_data['page'] not in ('media', 'system', 'ai', 'search'):
            errors.append(f"{fix_id} invalid page {fix_data['page']}")

    if errors:
        for err in errors:
            print("FAIL:", err)
        return 1

    print(f"PASS: {len(FIXTURES)} deterministic UI parity fixtures verified.")
    return 0


def main():
    parser = argparse.ArgumentParser(description='Linux Island UI Parity Fixture Runner')
    parser.add_argument('--list', action='store_true', help='List all available fixtures')
    parser.add_argument('--verify', action='store_true', help='Verify all fixture specifications')
    parser.add_argument('--fixture', type=str, help='Select fixture ID to inspect or dump')
    parser.add_argument('--json', action='store_true', help='Output fixture payload as JSON')
    args = parser.parse_args()

    if args.list:
        list_fixtures()
        return 0
    if args.verify or (not args.fixture and not args.list):
        return verify_fixtures()
    if args.fixture:
        if args.fixture not in FIXTURES:
            print(f"ERROR: Unknown fixture '{args.fixture}'. Use --list to view valid fixtures.")
            return 2
        fix = FIXTURES[args.fixture]
        if args.json:
            print(json.dumps(fix, indent=2))
        else:
            print(f"Fixture: {args.fixture}")
            print(f"Page   : {fix['page']}")
            print(f"Desc   : {fix['description']}")
            print(f"Payload: {json.dumps(fix, indent=2)}")
        return 0


if __name__ == '__main__':
    sys.exit(main())
