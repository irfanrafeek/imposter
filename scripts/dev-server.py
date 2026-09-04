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
import json
import os
import re
import sys

HERE = os.path.dirname(os.path.abspath(__file__))
PORT = int(sys.argv[1]) if len(sys.argv) > 1 else 8123
ROOT = os.path.join(HERE, '..', 'www')


def load_rewrites():
    """The hosting rewrites, read from firebase.json rather than restated here.

    /admin has no file behind it; firebase.json rewrites it to admin.html
    (#207). Without this the clean URL 404s locally and only ever gets tested
    in production, which is the one place a broken one is expensive. Read from
    the config so a rewrite added there works here with no second edit.
    """
    try:
        with open(os.path.join(HERE, '..', 'firebase.json'), encoding='utf-8') as f:
            rules = json.load(f).get('hosting', {}).get('rewrites', [])
    except (OSError, ValueError):
        return {}
    # Plain paths only. Firebase also accepts globs and regexes; those are
    # for functions and SPA fallbacks, and guessing at them here would make
    # the mirror lie rather than be incomplete.
    return {r['source']: r['destination'] for r in rules
            if re.fullmatch(r'/[\w./-]*', str(r.get('source', '')))
            and r.get('destination')}


REWRITES = load_rewrites()


class NoCacheHandler(http.server.SimpleHTTPRequestHandler):
    def end_headers(self):
        self.send_header('Cache-Control', 'no-cache, no-store, must-revalidate')
        self.send_header('Pragma', 'no-cache')
        self.send_header('Expires', '0')
        super().end_headers()

    def translate_path(self, path):
        # A real file always wins, exactly as it does on Hosting.
        resolved = super().translate_path(path)
        if os.path.exists(resolved):
            return resolved
        target = REWRITES.get(path.split('?', 1)[0].split('#', 1)[0])
        return super().translate_path(target) if target else resolved


if __name__ == '__main__':
    handler = functools.partial(NoCacheHandler, directory=ROOT)
    with http.server.ThreadingHTTPServer(('', PORT), handler) as httpd:
        print(f'Serving www/ at http://localhost:{PORT} (caching disabled)')
        httpd.serve_forever()
