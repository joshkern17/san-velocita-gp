#!/usr/bin/env python3
"""Tiny local server for San Velocita Grand Prix (ES modules need http://, not file://).

  python3 serve.py [port] [--no-browser] [--auto-exit]

--auto-exit: quit once the game window has been closed for ~90 seconds
(the game pings /__ping every 20s while it is open).

Saves: on the game's own port (8000) the game mirrors everything it saves (tracks, liveries, careers, settings,
your livery images) into saves/ next to this file, and restores from it if the browser's storage comes back empty.
A dated copy is kept each day for two weeks (saves/history/). Other ports (test servers) don't touch saves/.
"""
import http.server, socketserver, webbrowser, os, sys, threading, time, json, re, shutil, datetime

PORT = next((int(a) for a in sys.argv[1:] if a.isdigit()), 8000)
AUTO_EXIT = '--auto-exit' in sys.argv
os.chdir(os.path.dirname(os.path.abspath(__file__)))
last_ping = time.time()
SAVES = os.path.join(os.getcwd(), 'saves') if PORT == 8000 or '--saves' in sys.argv else None
LS, ASSETS = (os.path.join(SAVES, 'storage'), os.path.join(SAVES, 'assets')) if SAVES else (None, None)
lock = threading.Lock()

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
        if not SAVES:
            self.send_response(404); self.end_headers(); return
        u = urlparse(self.path); q = parse_qs(u.query)
        body = self.rfile.read(int(self.headers.get('Content-Length') or 0)).decode('utf-8')
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
