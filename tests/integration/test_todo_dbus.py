#!/usr/bin/env python3
import ast
import json
import os
from pathlib import Path
import subprocess
import sys
import tempfile
import time

ROOT = Path(__file__).resolve().parents[2]
CORE = ROOT / 'build/dev/core/linux-island-core'


def run_bus():
    with tempfile.TemporaryDirectory() as directory:
        env = dict(os.environ, XDG_DATA_HOME=directory + '/data', XDG_CONFIG_HOME=directory + '/config', XDG_CACHE_HOME=directory + '/cache')
        process = None
        def call(method, *args):
            result = subprocess.check_output(['gdbus', 'call', '--session', '--dest', 'io.github.linuxisland.Core',
                '--object-path', '/io/github/linuxisland/Core', '--method', 'io.github.linuxisland.Todo1.' + method, *args], text=True, stderr=subprocess.DEVNULL)
            return result.strip()
        def start():
            proc = subprocess.Popen([str(CORE)], env=env, stdout=subprocess.DEVNULL, stderr=subprocess.DEVNULL)
            for _ in range(50):
                try:
                    call('GetTasks')
                    return proc
                except subprocess.CalledProcessError:
                    time.sleep(.1)
            proc.terminate()
            proc.wait()
            raise RuntimeError('Core did not start')
        def tasks():
            return json.loads(ast.literal_eval(call('GetTasks'))[0])
        try:
            process = start()
            assert tasks() == []
            assert call('AddTask', 'Read a book') == '(true,)'
            task = tasks()[0]
            assert call('SetDone', task['id'], 'true') == '(true,)'
            process.terminate(); process.wait(); process = None
            process = start()
            assert tasks()[0]['done'] is True
            assert call('RemoveTask', task['id']) == '(true,)'
            assert tasks() == []
            print('PASS: todo D-Bus add, complete, restart and delete')
        finally:
            if process is not None:
                process.terminate(); process.wait()

if __name__ == '__main__':
    if len(sys.argv) > 1:
        run_bus()
    else:
        sys.exit(subprocess.call(['dbus-run-session', '--', sys.executable, __file__, '--inside']))
