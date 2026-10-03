#!/usr/bin/env python3
"""Headless Chrome smoke run for the game.

Usage: tests/browser/run.py [port] [out-dir]
Serves the repo, then runs three headless Chrome sessions:
  play  - 120 s of automated play (synthetic frames, no rendering); prints the SMOKE RESULT statistics
  rally - renders one frame frozen mid-rally -> rally.png
  menu  - the start screen -> menu.png
Fails (exit 1) if the play run reports JS errors, no rally hits, or no points.
"""
import base64
import http.server
import json
import os
import random
import re
import subprocess
import sys
import threading
import time

ROOT = os.path.dirname(os.path.dirname(os.path.dirname(os.path.abspath(__file__))))
PORT = int(sys.argv[1]) if len(sys.argv) > 1 else 5599
OUT = sys.argv[2] if len(sys.argv) > 2 else '/tmp/pingpong-smoke'
CHROME = '/Applications/Google Chrome.app/Contents/MacOS/Google Chrome'
os.makedirs(OUT, exist_ok=True)


class Quiet(http.server.SimpleHTTPRequestHandler):
    def __init__(self, *a, **kw):
        super().__init__(*a, directory=ROOT, **kw)

    def log_message(self, *a):
        pass


server = http.server.ThreadingHTTPServer(('127.0.0.1', PORT), Quiet)
threading.Thread(target=server.serve_forever, daemon=True).start()


def chrome(name, url, budget, screenshot=False, dump=False, timeout=480):
    args = [
        CHROME, '--headless=new', '--disable-gpu', '--use-angle=swiftshader', '--enable-unsafe-swiftshader',
        '--no-first-run', '--no-default-browser-check', '--disable-crash-reporter', '--disable-breakpad',
        '--disable-background-networking', '--disable-sync', '--disable-component-update',
        '--hide-scrollbars', '--window-size=1024,640', '--enable-logging=stderr', '--v=0',
        f'--user-data-dir={OUT}/profile-{name}-{random.randint(0, 10**6)}',
        f'--virtual-time-budget={budget}',
    ]
    if screenshot:
        args.append(f'--screenshot={OUT}/{name}.png')
    if dump:
        args.append('--dump-dom')
    args.append(url)
    out_path = f'{OUT}/{name}.stdout'
    with open(out_path, 'w') as so, open(f'{OUT}/{name}.stderr', 'w') as se:
        proc = subprocess.Popen(args, stdout=so, stderr=se)
        # Chrome lingers for minutes after writing its outputs; stop it as soon as they are complete.
        deadline = time.time() + timeout
        while time.time() < deadline and proc.poll() is None:
            time.sleep(1)
            have_shot = (not screenshot) or os.path.exists(f'{OUT}/{name}.png')
            have_dom = (not dump) or ('</html>' in open(out_path, errors='replace').read())
            if have_shot and have_dom:
                time.sleep(1)
                break
        if proc.poll() is None:
            if time.time() >= deadline:
                print(f'{name}: TIMEOUT after {timeout}s')
            proc.kill()
    stdout = open(out_path, errors='replace').read()
    frame = re.search(r'id="smoke-frame"[^>]*src="data:image/png;base64,([^"]+)"', stdout)
    if frame:
        with open(f'{OUT}/{name}_frame.png', 'wb') as f:
            f.write(base64.b64decode(frame.group(1)))
    stderr = open(f'{OUT}/{name}.stderr', errors='replace').read()
    js_errors = [
        l for l in stderr.splitlines()
        if 'CONSOLE' in l and re.search(r'error|exception|failed to load|uncaught', l, re.I)
        and 'GL Driver Message' not in l and 'SMOKE RESULT' not in l
    ]
    return stdout, js_errors


def chrome_retry(name, url, budget, **kw):
    # Module fetches occasionally fail right after a previous Chrome instance was killed; retry once.
    for attempt in range(2):
        stdout, js_errors = chrome(name, url, budget, **kw)
        if not any('Failed to fetch' in l for l in js_errors):
            return stdout, js_errors
        print(f'{name}: transient fetch failure, retrying')
        time.sleep(2)
    return stdout, js_errors


base = f'http://127.0.0.1:{PORT}'
ok = True

RESULT_RE = r'id="smoke-result"[^>]*>SMOKE RESULT (\{.*?\})</pre>'
stdout, js_errors = chrome_retry('play', f'{base}/tests/browser/smoke.html?seconds=120', 8000, screenshot=True, dump=True)
m = re.search(RESULT_RE, stdout, re.S)
if not m:
    print('play: no SMOKE RESULT in DOM dump'); ok = False
else:
    stats = json.loads(m.group(1))
    print('play:', json.dumps(stats))
    if stats.get('errors'):
        print('play: page errors', stats['errors']); ok = False
    if stats.get('humanHits', 0) < 3 or stats.get('aiHits', 0) < 3:
        print('play: too few hits'); ok = False
    if stats.get('points', 0) < 1:
        print('play: no points were scored'); ok = False
    if stats.get('litFraction', 0) < 0.2:
        print('play: the rendered frame is almost empty'); ok = False
if js_errors:
    print('play: console errors:'); print('\n'.join(js_errors[:10])); ok = False

stdout, js_errors = chrome_retry('rally', f'{base}/tests/browser/smoke.html?seconds=30&freeze=1', 8000, screenshot=True, dump=True)
m = re.search(RESULT_RE, stdout, re.S)
print('rally:', m.group(1)[:200] if m else 'no result')
if js_errors:
    print('rally: console errors:'); print('\n'.join(js_errors[:10])); ok = False

_, js_errors = chrome_retry('menu', f'{base}/index.html', 800, screenshot=True)
if js_errors:
    print('menu: console errors:'); print('\n'.join(js_errors[:10])); ok = False

server.shutdown()
print('screenshots:', [f for f in os.listdir(OUT) if f.endswith('.png')])
print('SMOKE', 'OK' if ok else 'FAILED')
sys.exit(0 if ok else 1)
