#!/usr/bin/env python3
"""Local preview server for Into the Edge.

Serves the site with caching disabled and accepts POST /__save?name=<file> so that the
page can write snapshots (the Open Graph image, recorded videos) into ./exports/.
Usage: python3 tools/serve.py [port]
"""
import http.server
import os
import re
import sys
import urllib.parse

ROOT = os.path.dirname(os.path.dirname(os.path.abspath(__file__)))
EXPORTS = os.path.join(ROOT, 'exports')


class Handler(http.server.SimpleHTTPRequestHandler):
    def __init__(self, *args, **kwargs):
        super().__init__(*args, directory=ROOT, **kwargs)

    def end_headers(self):
        self.send_header('Cache-Control', 'no-store')
        super().end_headers()

    def do_POST(self):
        url = urllib.parse.urlparse(self.path)
        if url.path != '/__save':
            self.send_error(404)
            return
        name = urllib.parse.parse_qs(url.query).get('name', ['snapshot.bin'])[0]
        name = re.sub(r'[^A-Za-z0-9._-]', '_', os.path.basename(name)) or 'snapshot.bin'
        length = int(self.headers.get('Content-Length', '0'))
        data = self.rfile.read(length)
        os.makedirs(EXPORTS, exist_ok=True)
        with open(os.path.join(EXPORTS, name), 'wb') as f:
            f.write(data)
        self.send_response(200)
        self.send_header('Content-Type', 'text/plain')
        self.end_headers()
        self.wfile.write(f'saved exports/{name} ({len(data)} bytes)'.encode())

    def log_message(self, fmt, *args):
        if os.environ.get('VERBOSE'):
            super().log_message(fmt, *args)


Handler.extensions_map.update({'.js': 'text/javascript', '.mjs': 'text/javascript', '.json': 'application/json', '.woff2': 'font/woff2', '.svg': 'image/svg+xml'})

if __name__ == '__main__':
    port = int(sys.argv[1]) if len(sys.argv) > 1 else int(os.environ.get('PORT', '8790'))
    http.server.ThreadingHTTPServer(('127.0.0.1', port), Handler).serve_forever()
