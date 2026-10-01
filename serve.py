#!/usr/bin/env python3
"""Tiny local server for San Velocita Grand Prix (ES modules need http://, not file://).

  python3 serve.py [port] [--no-browser] [--auto-exit]

--auto-exit: quit once the game window has been closed for ~90 seconds
(the game pings /__ping every 20s while it is open).
"""
import http.server, socketserver, webbrowser, os, sys, threading, time

PORT = next((int(a) for a in sys.argv[1:] if a.isdigit()), 8000)
AUTO_EXIT = '--auto-exit' in sys.argv
os.chdir(os.path.dirname(os.path.abspath(__file__)))
last_ping = time.time()

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
        super().do_GET()
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
