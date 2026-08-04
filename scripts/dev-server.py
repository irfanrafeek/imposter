#!/usr/bin/env python3
"""Local static server for www/, with caching turned off.

`python3 -m http.server` sends Last-Modified and no Cache-Control, which lets
browsers heuristically cache CSS and JS. Editing a stylesheet then reloading
can therefore show the OLD file with the NEW markup, which renders as a
half-broken page and reads like a design bug rather than a stale asset.

Production does not have this problem: firebase.json already sends
"no-cache, no-store, must-revalidate" for everything except images. This
mirrors that locally so what you see in a preview is what ships.

    python3 scripts/dev-server.py [port]
"""
import functools
import http.server
import os
import sys

PORT = int(sys.argv[1]) if len(sys.argv) > 1 else 8123
ROOT = os.path.join(os.path.dirname(os.path.abspath(__file__)), '..', 'www')


class NoCacheHandler(http.server.SimpleHTTPRequestHandler):
    def end_headers(self):
        self.send_header('Cache-Control', 'no-cache, no-store, must-revalidate')
        self.send_header('Pragma', 'no-cache')
        self.send_header('Expires', '0')
        super().end_headers()


if __name__ == '__main__':
    handler = functools.partial(NoCacheHandler, directory=ROOT)
    with http.server.ThreadingHTTPServer(('', PORT), handler) as httpd:
        print(f'Serving www/ at http://localhost:{PORT} (caching disabled)')
        httpd.serve_forever()
