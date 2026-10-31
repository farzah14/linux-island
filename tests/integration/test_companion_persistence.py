#!/usr/bin/env python3
"""Companion session persistence: two consecutive launches, one cookie jar.

The embedded search companion is a real browser surface. If its WebEngine
profile ever silently reverts to in-memory, every login is lost when the window
closes -- and nothing in the UI says so. This host-level regression test proves
the opposite: a cookie set during the first launch is already on the wire for
the *first* request of the second launch.

It drives the real `linux-island-ui --companion` binary against a loopback HTTP
server, with XDG dirs redirected to a temporary tree, so the developer's actual
profile is never read or written. Cookie import from the system browser is
disabled here: this test is about the companion's own jar, not the importer.

Skips (exit 0 with SKIP) when the binary has not been built or the platform
plugin cannot run headless.
"""
from __future__ import annotations

import glob
import http.server
import os
import signal
import socketserver
import sqlite3
import subprocess
import sys
import tempfile
import threading
import time
from pathlib import Path

ROOT = Path(__file__).resolve().parents[2]
BINARY = ROOT / 'build/dev/island-ui/linux-island-ui'
COOKIE_NAME = 'island_persistence_test'
COOKIE_VALUE = 'persisted'


def skip(reason: str) -> None:
    print(f'SKIP: {reason}')
    sys.exit(0)


class Handler(http.server.BaseHTTPRequestHandler):
    """Serves /set (sets the cookie) and /check (reports what it received)."""

    seen: list[tuple[str, str | None]] = []

    def do_GET(self) -> None:  # noqa: N802 (BaseHTTPRequestHandler API)
        Handler.seen.append((self.path, self.headers.get('Cookie')))
        body = b'<html><body>ok</body></html>'
        self.send_response(200)
        self.send_header('Content-Type', 'text/html')
        if self.path.startswith('/set'):
            self.send_header(
                'Set-Cookie',
                f'{COOKIE_NAME}={COOKIE_VALUE}; Max-Age=86400; Path=/',
            )
        self.send_header('Content-Length', str(len(body)))
        self.end_headers()
        self.wfile.write(body)

    def log_message(self, *_args) -> None:
        pass


def launch(binary: Path, env: dict[str, str], url: str, expected_path: str) -> str:
    """Run the companion until the expected request arrives, then SIGTERM it.

    SIGTERM (not SIGKILL) is what lets Chromium flush its cookie store, which is
    exactly the behaviour under test.
    """
    proc = subprocess.Popen(
        [str(binary), '--companion', url],
        env=env, stdout=subprocess.PIPE, stderr=subprocess.STDOUT, text=True,
    )
    deadline = time.time() + 25
    try:
        while time.time() < deadline:
            if any(path == expected_path for path, _ in Handler.seen):
                break
            if proc.poll() is not None:
                break
            time.sleep(0.1)
        # Give WebEngine a moment to commit the cookie before teardown.
        time.sleep(1.5)
        proc.send_signal(signal.SIGTERM)
        try:
            output, _ = proc.communicate(timeout=20)
        except subprocess.TimeoutExpired:
            proc.kill()
            output, _ = proc.communicate()
    finally:
        if proc.poll() is None:
            proc.kill()
    return output


def cookie_rows(data_home: str) -> list[tuple]:
    rows = []
    for db in glob.glob(os.path.join(data_home, 'linux-island/webengine/Cookies')):
        if db.endswith('-journal'):
            continue
        try:
            con = sqlite3.connect(f'file:{db}?mode=ro', uri=True)
            rows.extend(con.execute(
                'SELECT host_key, name, has_expires FROM cookies WHERE name = ?',
                (COOKIE_NAME,),
            ).fetchall())
            con.close()
        except sqlite3.Error:
            continue
    return rows


def main() -> None:
    if not BINARY.is_file():
        skip(f'{BINARY} not built (run: cmake --build build/dev)')

    with tempfile.TemporaryDirectory(prefix='island-persist-') as tmp:
        data_home = os.path.join(tmp, 'data')
        cache_home = os.path.join(tmp, 'cache')
        os.makedirs(data_home, exist_ok=True)
        os.makedirs(cache_home, exist_ok=True)

        env = dict(os.environ)
        env.update({
            'XDG_DATA_HOME': data_home,
            'XDG_CACHE_HOME': cache_home,
            'XDG_CONFIG_HOME': os.path.join(tmp, 'config'),
            # This test is about the companion's own jar, never the host's
            # browser cookies. Import would also require an unlocked keyring.
            'ISLAND_NO_COOKIE_IMPORT': '1',
            'QT_QPA_PLATFORM': 'offscreen',
        })

        server = socketserver.TCPServer(('127.0.0.1', 0), Handler)
        port = server.server_address[1]
        threading.Thread(target=server.serve_forever, daemon=True).start()
        base = f'http://127.0.0.1:{port}'
        try:
            first = launch(BINARY, env, f'{base}/set', '/set')
            if '/set' not in [path for path, _ in Handler.seen]:
                server.shutdown()
                skip('companion did not reach the local server; headless WebEngine '
                     'unavailable here\n' + first[-600:])

            Handler.seen.clear()
            second = launch(BINARY, env, f'{base}/check', '/check')
            requests = [entry for entry in Handler.seen if entry[0] == '/check']
            if not requests:
                server.shutdown()
                skip('second companion launch made no request\n' + second[-600:])

            first_request_cookie = requests[0][1]
            assert first_request_cookie and COOKIE_NAME in first_request_cookie, (
                'the first request of the second launch must already carry the '
                f'cookie set by the first launch; got {first_request_cookie!r}\n'
                f'first launch output:\n{first[-400:]}\n'
                f'second launch output:\n{second[-400:]}'
            )

            rows = cookie_rows(data_home)
            assert rows, f'no {COOKIE_NAME} row persisted under {data_home}'
            assert all(has_expires == 1 for _host, _name, has_expires in rows), \
                f'persistent cookie must keep an expiry, got {rows}'
        finally:
            server.shutdown()

    print('PASS: companion profile persists cookies across two launches')


if __name__ == '__main__':
    main()
