# -*- coding: utf-8 -*-
"""Analytics server: receives events, writes to Feishu Bitable with IP geolocation."""
from http.server import HTTPServer, BaseHTTPRequestHandler
import json, time, requests, sys
try:
    from config_secret import FEISHU_APP_ID as APP_ID, FEISHU_APP_SECRET as APP_SECRET, FEISHU_APP_TOKEN as APP_TOKEN, FEISHU_TABLE_ID as TABLE_ID
except ImportError:
    APP_ID = APP_SECRET = APP_TOKEN = TABLE_ID = ""
    print("[WARN] config_secret.py not found, tracking disabled")

_token = None
_token_expires = 0

def _get_token():
    global _token, _token_expires
    if _token and time.time() < _token_expires - 300:
        return _token
    try:
        r = requests.post(
            "https://open.feishu.cn/open-apis/auth/v3/tenant_access_token/internal",
            json={"app_id": APP_ID, "app_secret": APP_SECRET}, timeout=10)
        data = r.json()
        if data.get("code") != 0:
            print("[AUTH] Failed: " + str(data))
            return None
        _token = data["tenant_access_token"]
        _token_expires = time.time() + data.get("expire", 7200)
        print("[AUTH] Token refreshed")
        return _token
    except Exception as e:
        print("[AUTH] Error: " + str(e))
        return None


def _geo(ip):
    try:
        r = requests.get("http://ip-api.com/json/" + ip + "?lang=zh-CN", timeout=3)
        return r.json().get("regionName", "未知")  # 未知
    except Exception:
        return "未知"  # 未知


def _device(ua):
    if not ua: return "未知"  # 未知
    ua = ua.lower()
    if "iphone" in ua or "ipad" in ua: return "iPhone"
    if "android" in ua: return "Android"
    if "windows" in ua: return "Windows"
    if "macintosh" in ua: return "Mac"
    return "其他"  # 其他


def _write_bitable(fields):
    token = _get_token()
    if not token: return False
    try:
        url = "https://open.feishu.cn/open-apis/bitable/v1/apps/" + APP_TOKEN + "/tables/" + TABLE_ID + "/records"
        body = {"fields": fields}
        print("[BITABLE] sending fields: " + str(list(fields.keys())))
        r = requests.post(url, headers={"Authorization": "Bearer " + token, "Content-Type": "application/json; charset=utf-8"}, json=body, timeout=10)
        data = r.json()
        print("[BITABLE] response: " + str(data.get("code")) + " " + str(data.get("msg","")))
        if data.get("code") != 0:
            return False
        return True
    except Exception as e:
        print("[BITABLE] Error: " + str(e))
        return False


class Handler(BaseHTTPRequestHandler):
    def do_POST(self):
        if self.path != "/track":
            self.send_response(404); self.end_headers(); return
        length = int(self.headers.get("Content-Length", 0))
        try:
            body = json.loads(self.rfile.read(length))
        except Exception:
            self.send_response(400); self.end_headers(); return

        ip = self.client_address[0]
        region = _geo(ip)
        device = _device(body.get("ua", ""))
        ua = (body.get("ua") or "")[:500]

        raw_time = body.get("time", "")
        # Extract date: "2026/5/11 23:59:16" → "2026-05-11"
        date_str = raw_time.split(" ")[0].replace("/", "-") if raw_time else ""
        if len(date_str) < 10:
            parts = date_str.split("-")
            if len(parts) == 3:
                date_str = parts[0] + "-" + parts[1].zfill(2) + "-" + parts[2].zfill(2)

        fields = {
            "事件时间": raw_time,                    # 事件时间
            "日期": date_str,                              # 日期（年月日）
            "IP归属地": region,                     # IP归属地
            "设备类型": device,                 # 设备类型
            "设备UA": ua,                               # 设备UA
            "会话ID": body.get("session_id", ""),       # 会话ID
            "事件类型": body.get("event", ""),  # 事件类型
            "页面": body.get("page", ""),               # 页面
            "素材数量": body.get("imageCount", None),  # 素材数量
            "拆分方案": body.get("splitOption", ""),    # 拆分方案
            "生成耗时": body.get("genDuration", None),     # 生成耗时
            "画布数量": body.get("canvasCount", None),  # 画布数量
            "会话时长": body.get("sessionDuration", None),     # 会话时长
        }
        fields = {k: v for k, v in fields.items() if v is not None}

        ok = _write_bitable(fields)
        print("[TRACK] " + (body.get("event") or "") + " | " + region + " | " + device + " | " + ("OK" if ok else "FAIL"))

        self.send_response(200 if ok else 500)
        self.send_header("Content-Type", "application/json")
        self.send_header("Access-Control-Allow-Origin", "*")
        self.end_headers()
        self.wfile.write(json.dumps({"ok": ok}).encode())

    def do_OPTIONS(self):
        self.send_response(200)
        self.send_header("Access-Control-Allow-Origin", "*")
        self.send_header("Access-Control-Allow-Headers", "Content-Type")
        self.end_headers()


if __name__ == "__main__":
    port = int(sys.argv[1]) if len(sys.argv) > 1 else 8766
    print("Track server on http://localhost:" + str(port))
    HTTPServer(("127.0.0.1", port), Handler).serve_forever()
