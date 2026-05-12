# -*- coding: utf-8 -*-
"""Panofit backend: face detection + analytics tracking + static hosting."""
import json, time, os, sys, base64, io
from http.server import HTTPServer, BaseHTTPRequestHandler
import numpy as np

# ── Face detection ──
try:
    from ultralytics import YOLO
    _yolo = YOLO('yolov8n.pt')
    print("[INIT] YOLOv8 loaded")
    _use_yolo = True
except Exception as e:
    print(f"[INIT] YOLO unavailable ({e}), using Haar cascade")
    _use_yolo = False

if not _use_yolo:
    import cv2
    _cascade_path = os.path.join(os.path.dirname(__file__), 'scripts', 'cascade', 'haarcascade_frontalface_default.xml')
    _cascade = cv2.CascadeClassifier(_cascade_path)

def _detect_face(img_bytes):
    try:
        arr = np.frombuffer(img_bytes, np.uint8)
        img = cv2.imdecode(arr, cv2.IMREAD_COLOR)
        if img is None: return {"face": False, "faceRegion": None}
        h_img, w_img = img.shape[:2]

        if _use_yolo:
            results = _yolo(img, verbose=False)
            persons = []
            for r in results:
                for box in r.boxes:
                    if int(box.cls) == 0:
                        x1, y1, x2, y2 = map(int, box.xyxy[0].tolist())
                        persons.append((x1, y1, x2 - x1, y2 - y1))
            if not persons: return {"face": False, "faceRegion": None}
            best = max(persons, key=lambda f: f[2] * f[3])
            x, y, w, h = best
        else:
            gray = cv2.cvtColor(img, cv2.COLOR_BGR2GRAY)
            faces = _cascade.detectMultiScale(gray, 1.1, 5, minSize=(60, 60))
            if len(faces) == 0: return {"face": False, "faceRegion": None}
            best = max(faces, key=lambda f: f[2] * f[3])
            x, y, w, h = best.tolist()

        return {
            "face": True,
            "faceRegion": {
                "cx": round((x + w / 2) / w_img, 4),
                "cy": round((y + h / 2) / h_img, 4),
                "r": round(max(w, h) / max(w_img, h_img) * 0.8, 4)
            }
        }
    except Exception as e:
        return {"face": False, "faceRegion": None, "error": str(e)}


# ── Feishu tracking ──
def _get_config(key, default=""):
    val = os.environ.get(key, "")
    if val: return val
    try:
        from config_secret import FEISHU_APP_ID, FEISHU_APP_SECRET, FEISHU_APP_TOKEN, FEISHU_TABLE_ID
        return locals().get(key, default)
    except ImportError:
        return default

FEISHU_APP_ID = os.environ.get("FEISHU_APP_ID", "")
FEISHU_APP_SECRET = os.environ.get("FEISHU_APP_SECRET", "")
FEISHU_APP_TOKEN = os.environ.get("FEISHU_APP_TOKEN", "")
FEISHU_TABLE_ID = os.environ.get("FEISHU_TABLE_ID", "")

_token = None
_token_expires = 0

def _feishu_token():
    global _token, _token_expires
    if not FEISHU_APP_ID: return None
    if _token and time.time() < _token_expires - 300: return _token
    try:
        import requests
        r = requests.post("https://open.feishu.cn/open-apis/auth/v3/tenant_access_token/internal",
            json={"app_id": FEISHU_APP_ID, "app_secret": FEISHU_APP_SECRET}, timeout=10)
        d = r.json()
        if d.get("code") != 0: return None
        _token = d["tenant_access_token"]
        _token_expires = time.time() + d.get("expire", 7200)
        return _token
    except Exception: return None

def _track(body, ip):
    if not FEISHU_APP_ID: return False
    import requests
    token = _feishu_token()
    if not token: return False
    try:
        r = requests.get(f"http://ip-api.com/json/{ip}?lang=zh-CN", timeout=3)
        region = r.json().get("regionName", "unknown")
    except Exception: region = "unknown"
    ua = (body.get("ua") or "")[:500]
    device = "other"
    if ua:
        ua_l = ua.lower()
        if "iphone" in ua_l or "ipad" in ua_l: device = "iPhone"
        elif "android" in ua_l: device = "Android"
        elif "windows" in ua_l: device = "Windows"
        elif "macintosh" in ua_l: device = "Mac"

    raw_time = body.get("time", "")
    date_str = raw_time.split(" ")[0].replace("/", "-") if raw_time else ""

    fields = {k: v for k, v in {
        "事件时间": raw_time, "日期": date_str, "IP归属地": region,
        "设备类型": device, "设备UA": ua,
        "会话ID": body.get("session_id", ""), "事件类型": body.get("event", ""),
        "页面": body.get("page", ""), "素材数量": body.get("imageCount"),
        "拆分方案": body.get("splitOption", ""), "生成耗时": body.get("genDuration"),
        "画布数量": body.get("canvasCount"), "会话时长": body.get("sessionDuration"),
    }.items() if v is not None}

    try:
        r = requests.post(
            f"https://open.feishu.cn/open-apis/bitable/v1/apps/{FEISHU_APP_TOKEN}/tables/{FEISHU_TABLE_ID}/records",
            headers={"Authorization": f"Bearer {token}"}, json={"fields": fields}, timeout=10)
        return r.json().get("code") == 0
    except Exception: return False


# ── Static file server ──
STATIC_DIR = os.path.join(os.path.dirname(__file__), 'dist')
MIME = {'.html': 'text/html', '.js': 'application/javascript', '.css': 'text/css',
        '.svg': 'image/svg+xml', '.png': 'image/png', '.jpg': 'image/jpeg',
        '.json': 'application/json', '.ico': 'image/x-icon', '.xml': 'application/xml'}

class Handler(BaseHTTPRequestHandler):
    def do_POST(self):
        length = int(self.headers.get("Content-Length", 0))
        raw = self.rfile.read(length)
        try: body = json.loads(raw)
        except: body = {}

        if self.path == "/detect":
            result = {"face": False, "faceRegion": None}
            if "base64" in body:
                try:
                    data = base64.b64decode(body["base64"])
                    result = _detect_face(data)
                except Exception as e:
                    result = {"face": False, "faceRegion": None, "error": str(e)}
            self._json(result)
        elif self.path == "/track":
            ok = _track(body, self.client_address[0])
            self._json({"ok": ok})
        else:
            self.send_response(404); self.end_headers()

    def do_GET(self):
        path = self.path.split("?")[0]
        if path == "/": path = "/index.html"
        if path == "/health":
            self._json({
                "status": "ok",
                "yolo": _use_yolo,
                "feishu": bool(FEISHU_APP_ID and FEISHU_APP_SECRET and FEISHU_APP_TOKEN and FEISHU_TABLE_ID)
            })
            return
        filepath = os.path.join(STATIC_DIR, path.lstrip("/"))
        if os.path.isfile(filepath):
            ext = os.path.splitext(filepath)[1]
            with open(filepath, 'rb') as f:
                data = f.read()
            self.send_response(200)
            self.send_header("Content-Type", MIME.get(ext, "application/octet-stream"))
            self.send_header("Cache-Control", "max-age=86400")
            self.end_headers()
            self.wfile.write(data)
        else:
            # SPA fallback
            index = os.path.join(STATIC_DIR, "index.html")
            if os.path.isfile(index):
                with open(index, 'rb') as f: data = f.read()
                self.send_response(200)
                self.send_header("Content-Type", "text/html")
                self.end_headers()
                self.wfile.write(data)
            else:
                self.send_response(404); self.end_headers()

    def do_OPTIONS(self):
        self.send_response(200)
        self.send_header("Access-Control-Allow-Origin", "*")
        self.send_header("Access-Control-Allow-Headers", "*")
        self.end_headers()

    def _json(self, data):
        self.send_response(200)
        self.send_header("Content-Type", "application/json")
        self.send_header("Access-Control-Allow-Origin", "*")
        self.end_headers()
        self.wfile.write(json.dumps(data).encode())

if __name__ == "__main__":
    port = int(os.environ.get("PORT", sys.argv[1] if len(sys.argv) > 1 else 8765))
    print(f"Panofit server on port {port}")
    HTTPServer(("0.0.0.0", port), Handler).serve_forever()
