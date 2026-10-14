#!/usr/bin/env python3
"""Tiny local server for San Velocita Grand Prix (ES modules need http://, not file://).

  python3 serve.py [port] [--no-browser] [--auto-exit]

--auto-exit: quit once the game window has been closed for ~90 seconds
(the game pings /__ping every 20s while it is open).

Sessions: after each session you drove a lap in, the game sends how it went (your laps, the AI's) to saves/sessions/
(the newest 40), for tools/session.mjs.

Saves: on the game's own port (8000) the game mirrors everything it saves (tracks, liveries, careers, settings,
your livery images) into saves/ next to this file, and restores from it if the browser's storage comes back empty.
A dated copy is kept each day for two weeks (saves/history/). Other ports (test servers) don't touch saves/.
If iCloud Drive is on, saves/ (not the ChatGPT sign-in) is also copied to iCloud Drive/San Velocita Saves/ a few
seconds after each save and when the server stops, so the saves outlive this Mac; if saves/ is ever empty at
start-up, it's filled back from there first.

Character voices (llm.py): "Sign in with ChatGPT" for the game's LLM layer, on /__llm/* and /auth/callback. The account's
tokens are kept in saves/llm/ (a temp folder for test servers).
"""
import http.server, socketserver, webbrowser, os, sys, threading, time, json, re, shutil, datetime, tempfile, subprocess

PORT = next((int(a) for a in sys.argv[1:] if a.isdigit()), 8000)
AUTO_EXIT = '--auto-exit' in sys.argv
os.chdir(os.path.dirname(os.path.abspath(__file__)))
ROOT = os.getcwd()
last_ping = time.time()
SAVES = os.path.join(os.getcwd(), 'saves') if PORT == 8000 or '--saves' in sys.argv else None
LS, ASSETS = (os.path.join(SAVES, 'storage'), os.path.join(SAVES, 'assets')) if SAVES else (None, None)
lock = threading.Lock()
CLOUD_DOCS = os.path.expanduser('~/Library/Mobile Documents/com~apple~CloudDocs')
CLOUD = os.path.join(CLOUD_DOCS, 'San Velocita Saves') if SAVES and os.path.isdir(CLOUD_DOCS) else None
CLOUD_PARTS = ('storage', 'assets', 'history')   # saves/llm holds sign-in tokens: those stay on this Mac
sys.path.insert(0, os.getcwd())
import llm
VOICES = llm.Voices(os.path.join(SAVES, 'llm') if SAVES else os.path.join(tempfile.gettempdir(), f'svgp-llm-{PORT}'), PORT)

def safe(name):
    return re.sub(r'[^A-Za-z0-9._-]', '_', name)[:120]

def daily_copy():
    # the first save each day keeps the state so far in saves/history/<date>/ (two weeks of them)
    hist = os.path.join(SAVES, 'history')
    day = os.path.join(hist, datetime.date.today().isoformat())
    if os.path.isdir(day) or not os.path.isdir(LS) or not os.listdir(LS):
        return
    os.makedirs(hist, exist_ok=True)
    shutil.copytree(LS, os.path.join(day, 'storage'))
    if os.path.isdir(ASSETS):
        shutil.copytree(ASSETS, os.path.join(day, 'assets'))
    for old in sorted(os.listdir(hist))[:-14]:
        shutil.rmtree(os.path.join(hist, old), ignore_errors=True)

def sync_tree(src, dst):
    # make dst match src: copy what's new or changed, drop what src no longer has
    if not os.path.isdir(src):
        return
    for root, dirs, files in os.walk(src):
        out = os.path.join(dst, os.path.relpath(root, src))
        os.makedirs(out, exist_ok=True)
        for f in files:
            if f.endswith('.tmp'):
                continue
            a, b = os.path.join(root, f), os.path.join(out, f)
            sa = os.stat(a)
            try:
                sb = os.stat(b)
                if sb.st_size == sa.st_size and int(sb.st_mtime) == int(sa.st_mtime):
                    continue
            except OSError:
                pass
            shutil.copy2(a, b)
    for root, dirs, files in os.walk(dst, topdown=False):
        mine = os.path.join(src, os.path.relpath(root, dst))
        for f in files:
            if not os.path.exists(os.path.join(mine, f)):
                os.remove(os.path.join(root, f))
        if root != dst and not os.path.isdir(mine):
            shutil.rmtree(root, ignore_errors=True)

def cloud_copy():
    # saves/ -> iCloud Drive (never allowed to get in the way of the game)
    if not CLOUD:
        return
    try:
        with lock:
            for part in CLOUD_PARTS:
                sync_tree(os.path.join(SAVES, part), os.path.join(CLOUD, part))
    except Exception as e:
        print('iCloud copy of saves failed:', e)

cloud_timer = None
def cloud_soon():
    # a few seconds after the last save of a burst
    global cloud_timer
    if not CLOUD:
        return
    if cloud_timer:
        cloud_timer.cancel()
    cloud_timer = threading.Timer(5, cloud_copy)
    cloud_timer.daemon = True
    cloud_timer.start()

def cloud_restore():
    # saves/ is empty (a new Mac, or the folder was lost) but iCloud has a copy: put it back before the game asks
    if not CLOUD or not os.path.isdir(os.path.join(CLOUD, 'storage')):
        return
    if os.path.isdir(LS) and os.listdir(LS):
        return
    try:
        for part in CLOUD_PARTS:
            src = os.path.join(CLOUD, part)
            if os.path.isdir(src):
                shutil.copytree(src, os.path.join(SAVES, part), dirs_exist_ok=True)
        print('Saves restored from iCloud Drive.')
    except Exception as e:
        print('Restoring saves from iCloud failed:', e)

class Handler(http.server.SimpleHTTPRequestHandler):
    def do_GET(self):
        global last_ping
        if self.path.startswith('/__ping'):
            last_ping = time.time()
            self.send_response(200); self.send_header('Content-Type', 'text/plain'); self.end_headers()
            self.wfile.write(b'svgp')
            return
        if self.path.startswith('/__exists'):
            # optional files (models/garage.glb): the game asks here first, so a missing one isn't a 404 in the console
            from urllib.parse import urlparse, parse_qs
            rel = (parse_qs(urlparse(self.path).query).get('p') or [''])[0]
            full = os.path.normpath(os.path.join(os.getcwd(), rel))
            ok = full.startswith(os.getcwd() + os.sep) and os.path.isfile(full)
            self.send_response(200); self.send_header('Content-Type', 'application/json'); self.end_headers()
            self.wfile.write(b'{"ok":true}' if ok else b'{"ok":false}')
            return
        if self.path.startswith('/auth/callback'):
            from urllib.parse import urlparse, parse_qs
            q = {k: v[0] for k, v in parse_qs(urlparse(self.path).query).items()}
            ok, msg = VOICES.callback(q)
            page = llm.PAGE.format(title='Signed in' if ok else 'Sign-in didn\'t work',
                                   body=(f'Character voices will use {msg}\'s ChatGPT plan. You can close this tab and go back to the game.' if ok else msg))
            return self.reply(page, 'text/html; charset=utf-8')
        if self.path.startswith('/__voice/status'):
            # the voice tools (tools/voice/gen.mjs) can run: an ElevenLabs key, and node
            ok = bool(os.environ.get('ELEVENLABS_API_KEY')) and shutil.which('node') is not None
            return self.reply(json.dumps({'ok': ok}), 'application/json')
        if self.path.startswith('/__llm/status'):
            return self.reply(json.dumps(VOICES.status()), 'application/json')
        if self.path.startswith('/__saves') and SAVES:
            # everything saved: { keys: { key: text }, assets: [id] }
            out = {'keys': {}, 'assets': []}
            if os.path.isdir(LS):
                for f in os.listdir(LS):
                    if f.endswith('.txt'):
                        with open(os.path.join(LS, f), encoding='utf-8') as fh:
                            out['keys'][f[:-4]] = fh.read()
            if os.path.isdir(ASSETS):
                out['assets'] = [f[:-4] for f in os.listdir(ASSETS) if f.endswith('.txt')]
            return self.reply(json.dumps(out), 'application/json')
        if self.path.startswith('/__asset') and SAVES:
            from urllib.parse import urlparse, parse_qs
            aid = safe((parse_qs(urlparse(self.path).query).get('id') or [''])[0])
            full = os.path.join(ASSETS, aid + '.txt')
            if not os.path.isfile(full):
                self.send_response(404); self.end_headers(); return
            with open(full, encoding='utf-8') as fh:
                return self.reply(fh.read(), 'text/plain')
        super().do_GET()
    def do_POST(self):
        # /__save?k=key (body: the value), /__del?k=key, /__asset?id=id (body: the image's data URL)
        from urllib.parse import urlparse, parse_qs
        u = urlparse(self.path); q = parse_qs(u.query)
        body = self.rfile.read(int(self.headers.get('Content-Length') or 0)).decode('utf-8')
        # character voices: /__llm/signin, /__llm/say { instructions, input }, /__llm/signout
        if u.path.startswith('/__llm/'):
            if u.path == '/__llm/signin':
                return self.reply(json.dumps({'url': VOICES.start()}), 'application/json')
            if u.path == '/__llm/signout':
                VOICES.signout(); return self.reply('{"ok":true}', 'application/json')
            if u.path == '/__llm/say':
                try:
                    a = json.loads(body or '{}')
                except Exception:
                    a = {}
                return self.reply(json.dumps(VOICES.say(str(a.get('instructions') or ''), str(a.get('input') or ''))), 'application/json')
            self.send_response(404); self.end_headers(); return
        # a player's own name for the commentators: /__voice/name { name, say } records its calls (tools/voice/gen.mjs,
        # with the ElevenLabs key from this shell: it never goes to the game), once
        if u.path == '/__voice/name':
            try:
                a = json.loads(body or '{}')
            except Exception:
                a = {}
            name = re.sub(r"[^A-Za-z' -]", '', str(a.get('name') or '')).strip()[:30]
            say = re.sub(r"[^A-Za-z' -]", '', str(a.get('say') or '')).strip()[:40]
            if not name or not os.environ.get('ELEVENLABS_API_KEY'):
                return self.reply(json.dumps({'ok': False, 'error': 'no name' if not name else 'no ElevenLabs key in this shell'}), 'application/json')
            cmd = ['node', os.path.join(ROOT, 'tools', 'voice', 'gen.mjs'), '--custom-name', name] + (['--say', say] if say else [])
            try:
                r = subprocess.run(cmd, cwd=ROOT, capture_output=True, text=True, timeout=180)
                ok = r.returncode == 0
                return self.reply(json.dumps({'ok': ok, 'slug': re.sub(r'[^a-z0-9]', '', name.lower()), 'error': '' if ok else (r.stderr or r.stdout)[-300:]}), 'application/json')
            except Exception as e:
                return self.reply(json.dumps({'ok': False, 'error': str(e)}), 'application/json')
        if not SAVES:
            self.send_response(404); self.end_headers(); return
        # a finished session, every lap of it (js/session.js): saves/sessions/<name>.json, the newest 40 kept, for
        # tools/session.mjs to pick apart. Stays on this Mac (not copied to iCloud).
        if u.path == '/__session':
            d = os.path.join(SAVES, 'sessions'); os.makedirs(d, exist_ok=True)
            with open(os.path.join(d, safe((q.get('name') or ['session'])[0]) + '.json'), 'w', encoding='utf-8') as fh:
                fh.write(body)
            for old in sorted(f for f in os.listdir(d) if f.endswith('.json'))[:-40]:
                os.remove(os.path.join(d, old))
            return self.reply('ok', 'text/plain')
        with lock:
            os.makedirs(LS, exist_ok=True); os.makedirs(ASSETS, exist_ok=True)
            daily_copy()
            if u.path == '/__save':
                key = safe((q.get('k') or [''])[0])
                tmp = os.path.join(LS, key + '.tmp')
                with open(tmp, 'w', encoding='utf-8') as fh:
                    fh.write(body)
                os.replace(tmp, os.path.join(LS, key + '.txt'))
            elif u.path == '/__del':
                full = os.path.join(LS, safe((q.get('k') or [''])[0]) + '.txt')
                if os.path.isfile(full):
                    os.remove(full)
            elif u.path == '/__asset':
                aid = safe((q.get('id') or [''])[0])
                with open(os.path.join(ASSETS, aid + '.txt'), 'w', encoding='utf-8') as fh:
                    fh.write(body)
            else:
                self.send_response(404); self.end_headers(); return
        cloud_soon()
        self.reply('ok', 'text/plain')
    def reply(self, text, ctype):
        data = text.encode('utf-8')
        self.send_response(200); self.send_header('Content-Type', ctype); self.send_header('Content-Length', str(len(data))); self.end_headers()
        self.wfile.write(data)
    def end_headers(self):
        self.send_header('Cache-Control', 'no-store')
        super().end_headers()
    def log_message(self, *a):
        pass

class Server(socketserver.ThreadingTCPServer):
    allow_reuse_address = True
    daemon_threads = True

def watchdog(httpd):
    while True:
        time.sleep(10)
        if time.time() - last_ping > 90:
            httpd.shutdown()
            return

if CLOUD:
    cloud_restore()
    cloud_copy()

with Server(('127.0.0.1', PORT), Handler) as httpd:
    url = f'http://localhost:{PORT}/'
    print(f'San Velocita Grand Prix running at {url}  (Ctrl+C to stop)')
    if AUTO_EXIT:
        threading.Thread(target=watchdog, args=(httpd,), daemon=True).start()
    if '--no-browser' not in sys.argv:
        webbrowser.open(url)
    try:
        httpd.serve_forever()
    except KeyboardInterrupt:
        pass
    if cloud_timer:
        cloud_timer.cancel()
    cloud_copy()
