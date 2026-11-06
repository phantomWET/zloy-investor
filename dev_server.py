"""Локальный запуск: python3 dev_server.py → http://localhost:8000

Отдаёт сайт из public/ и передаёт POST /api/chat в api/chat.py.
Ключ берётся из файла .env (образец — .env.example).
"""
import importlib.util
import json
import os
from http.server import SimpleHTTPRequestHandler, ThreadingHTTPServer

ROOT = os.path.dirname(os.path.abspath(__file__))

env_path = os.path.join(ROOT, ".env")
if os.path.exists(env_path):
    for line in open(env_path, encoding="utf-8"):
        line = line.strip()
        if line and not line.startswith("#") and "=" in line:
            k, v = line.split("=", 1)
            os.environ.setdefault(k.strip(), v.strip().strip('"').strip("'"))

spec = importlib.util.spec_from_file_location("chat", os.path.join(ROOT, "api", "chat.py"))
chat = importlib.util.module_from_spec(spec)
spec.loader.exec_module(chat)


class Handler(SimpleHTTPRequestHandler):
    def __init__(self, *a, **kw):
        super().__init__(*a, directory=os.path.join(ROOT, "public"), **kw)

    def do_GET(self):
        if self.path.startswith("/api/chat"):
            return chat.handler.do_GET(self)
        return super().do_GET()

    def do_POST(self):
        if self.path.startswith("/api/chat"):
            return chat.handler.do_POST(self)
        self.send_error(404)

    _send = chat.handler._send


if __name__ == "__main__":
    port = int(os.environ.get("PORT", "8000"))
    print(f"Злой инвестор: http://localhost:{port}  (mock={os.environ.get('LLM_MOCK') == '1'})")
    ThreadingHTTPServer(("127.0.0.1", port), Handler).serve_forever()
