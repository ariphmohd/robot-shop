#!/usr/bin/env python3
"""Local storefront preview: upstream read APIs, isolated in-memory demo checkout."""
import argparse
import json
import re
import sys
import threading
import time
import uuid
from http.cookies import SimpleCookie
from http.server import SimpleHTTPRequestHandler, ThreadingHTTPServer
from pathlib import Path
from urllib.error import HTTPError, URLError
from urllib.parse import quote, urlsplit
from urllib.request import urlopen

ROOT = Path(__file__).resolve().parents[2]
sys.path.insert(0, str(ROOT / 'app/payment'))
from delivery import validate_address, delivery_estimate
STATIC = ROOT / 'app/web/static'
SESSIONS = {}
LOCK = threading.Lock()


def empty_cart():
    return {'total': 0, 'tax': 0, 'items': []}


def total(cart):
    cart['total'] = round(sum(item['subtotal'] for item in cart['items']), 2)
    cart['tax'] = cart['total'] - cart['total'] / 1.2
    return cart


class Preview(SimpleHTTPRequestHandler):
    def __init__(self, *args, **kwargs):
        super().__init__(*args, directory=str(STATIC), **kwargs)

    def log_message(self, *_args):
        pass  # Never write request bodies or address details to console logs.

    def session(self):
        cookie = SimpleCookie()
        try:
            cookie.load(self.headers.get('Cookie', ''))
        except Exception:
            pass
        token = cookie.get('robotshop_preview')
        token = token.value if token else ''
        now = time.monotonic()
        with LOCK:
            for key in list(SESSIONS):
                if now - SESSIONS[key]['created'] > 43200:
                    del SESSIONS[key]
            if token not in SESSIONS:
                if len(SESSIONS) >= 1000:
                    raise ValueError('Preview session limit reached. Restart the preview.')
                token = uuid.uuid4().hex
                SESSIONS[token] = {'cart': empty_cart(), 'id': 'preview-' + token, 'created': now,
                                   'lock': threading.Lock()}
            self.preview_token = token
            return SESSIONS[token]

    def reply(self, value, status=200):
        body = json.dumps(value).encode()
        self.send_response(status)
        self.send_header('Content-Type', 'application/json')
        self.send_header('Cache-Control', 'no-store')
        self.send_header('X-Content-Type-Options', 'nosniff')
        if hasattr(self, 'preview_token'):
            self.send_header('Set-Cookie', 'robotshop_preview=' + self.preview_token + '; Path=/; HttpOnly; SameSite=Strict')
        self.send_header('Content-Length', str(len(body)))
        self.end_headers()
        self.wfile.write(body)

    def read_upstream(self, path):
        with urlopen(self.server.upstream + path, timeout=10) as response:
            return json.load(response)

    def do_GET(self):
        path = urlsplit(self.path).path
        if path.startswith('/api/'):
            return self.api('GET', path)
        if path == '/' or re.fullmatch(r'/(cart|shipping|payment|login|search(?:/[^/]+)?|product/[^/]+)', path):
            body = (STATIC / 'index.html').read_text()
            body = body.replace('<main class="container"', '<div class="shop-notice" role="status" style="margin:0;text-align:center">Local preview · Checkout uses temporary demo orders. No payment or physical shipment.</div><main class="container"')
            content = body.encode()
            self.send_response(200)
            self.send_header('Content-Type', 'text/html; charset=utf-8')
            self.send_header('Cache-Control', 'no-store')
            self.send_header('Content-Length', str(len(content)))
            self.end_headers(); self.wfile.write(content)
        else:
            super().do_GET()

    def do_POST(self):
        self.api('POST', urlsplit(self.path).path)

    def do_PUT(self):
        self.reply({'error': 'This action is unavailable in the source preview.'}, 405)

    def api(self, method, path):
        try:
            if self.headers.get('Sec-Fetch-Site') == 'cross-site':
                return self.reply({'error': 'Cross-site requests are not allowed.'}, 403)
            if method == 'GET' and (path.startswith('/api/catalogue/') or path.startswith('/api/ratings/api/fetch/') or re.match(r'^/api/shipping/(codes$|match/|calc/)', path)):
                return self.reply(self.read_upstream(path))
            session = self.session()
            payload = None
            if method == 'POST':
                origin = self.headers.get('Origin')
                if origin and urlsplit(origin).netloc != self.headers.get('Host'):
                    return self.reply({'error': 'Origin not allowed.'}, 403)
                length = int(self.headers.get('Content-Length', '0'))
                if not 0 < length <= 32768 or self.headers.get_content_type() != 'application/json':
                    return self.reply({'error': 'Expected a small JSON request.'}, 400)
                payload = json.loads(self.rfile.read(length))
            with session['lock']:
                cart = session['cart']
                if method == 'GET' and path == '/api/user/uniqueid':
                    return self.reply({'uuid': session['id']})
                if method == 'GET' and path.startswith('/api/user/history/'):
                    return self.reply({'history': []})
                if method == 'GET' and path.startswith('/api/cart/cart/'):
                    return self.reply(cart)
                match = re.fullmatch(r'/api/cart/(add|update)/[^/]+/([a-zA-Z0-9_-]+)/([0-9]+)', path)
                if method == 'GET' and match:
                    action, sku, raw_qty = match.groups()
                    qty = int(raw_qty)
                    if qty > 99 or (action == 'add' and (qty == 0 or sku == 'SHIP')):
                        raise ValueError('Choose a quantity between 1 and 99.')
                    item = next((i for i in cart['items'] if i['sku'] == sku), None)
                    if action == 'add':
                        product = self.read_upstream('/api/catalogue/product/' + quote(sku))
                        if not product.get('instock'):
                            raise ValueError('This product is unavailable.')
                        if item:
                            qty += item['qty']
                        else:
                            item = {'sku': sku, 'name': product['name'], 'price': product['price']}
                            cart['items'].append(item)
                    if item:
                        if qty:
                            if qty > 99: raise ValueError('Choose a quantity between 1 and 99.')
                            item['qty'] = qty; item['subtotal'] = round(qty * item['price'], 2)
                        else:
                            cart['items'].remove(item)
                    return self.reply(total(cart))
                if method == 'POST' and path.startswith('/api/shipping/confirm/'):
                    if not cart['items'] or not isinstance(payload, dict):
                        raise ValueError('Add a product before confirming delivery.')
                    cost, location = payload.get('cost'), payload.get('location')
                    if type(cost) not in (int, float) or not 0 <= cost <= 1e6 or not isinstance(location, str) or len(location) > 220:
                        raise ValueError('Invalid shipping quote.')
                    cart['items'] = [i for i in cart['items'] if i['sku'] != 'SHIP']
                    cart['items'].append({'sku': 'SHIP', 'qty': 1, 'name': 'Shipping to ' + location, 'price': cost, 'subtotal': cost})
                    return self.reply(total(cart))
                if method == 'POST' and path.startswith('/api/payment/pay/'):
                    address = validate_address(payload.get('deliveryAddress') if isinstance(payload, dict) else None)
                    if not cart['total'] or not any(i['sku'] == 'SHIP' for i in cart['items']):
                        raise ValueError('Confirm delivery before ordering.')
                    result = {'orderid': 'PREVIEW-' + str(uuid.uuid4()), 'delivery': {'address': address, 'estimate': delivery_estimate()}}
                    session['cart'] = empty_cart()
                    return self.reply(result)
                return self.reply({'error': 'This action is unavailable in the source preview.'}, 405)
        except (ValueError, TypeError, KeyError):
            self.reply({'error': 'Check your cart and delivery details.'}, 400)
        except (HTTPError, URLError, TimeoutError):
            self.reply({'error': 'The local catalogue or shipping service is unavailable.'}, 502)


if __name__ == '__main__':
    parser = argparse.ArgumentParser(description=__doc__)
    parser.add_argument('--port', type=int, default=18090)
    parser.add_argument('--upstream', default='http://localhost')
    args = parser.parse_args()
    server = ThreadingHTTPServer(('127.0.0.1', args.port), Preview)
    server.upstream = args.upstream.rstrip('/')
    print('Local preview: http://localhost:' + str(args.port) + '/ (isolated demo checkout)', flush=True)
    server.serve_forever()
