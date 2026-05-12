"""Face detection HTTP server using YOLOv8 person detection."""
from http.server import HTTPServer, BaseHTTPRequestHandler
import json, cv2, os, sys, base64
import numpy as np
from ultralytics import YOLO

MODEL = YOLO('yolov8n.pt')  # class 0 = person

def _detect(img):
    try:
        if img is None: return {"face": False, "faceRegion": None}
        h_img, w_img = img.shape[:2]
        results = MODEL(img, verbose=False)
        persons = []
        for r in results:
            for box in r.boxes:
                if int(box.cls) == 0:  # person
                    x1, y1, x2, y2 = map(int, box.xyxy[0].tolist())
                    persons.append((x1, y1, x2 - x1, y2 - y1))
        if not persons: return {"face": False, "faceRegion": None}
        best = max(persons, key=lambda f: f[2] * f[3])
        x, y, w, h = best
        return {
            "face": True,
            "faceRegion": {"cx": round((x + w / 2) / w_img, 4),
                           "cy": round((y + h / 2) / h_img, 4),
                           "r": round(max(w, h) / max(w_img, h_img) * 0.8, 4)}
        }
    except Exception as e:
        return {"face": False, "faceRegion": None, "error": str(e)}

class Handler(BaseHTTPRequestHandler):
    def do_POST(self):
        length = int(self.headers.get("Content-Length", 0))
        body = json.loads(self.rfile.read(length))
        result = {"face": False, "faceRegion": None}
        if "path" in body:
            img = cv2.imread(body["path"].replace("\\", "/"))
            result = _detect(img)
        elif "base64" in body:
            data = base64.b64decode(body["base64"])
            arr = np.frombuffer(data, np.uint8)
            img = cv2.imdecode(arr, cv2.IMREAD_COLOR)
            result = _detect(img)
        self.send_response(200)
        self.send_header("Content-Type", "application/json")
        self.send_header("Access-Control-Allow-Origin", "*")
        self.send_header("Access-Control-Allow-Headers", "*")
        self.end_headers()
        self.wfile.write(json.dumps(result).encode())

    def do_OPTIONS(self):
        self.send_response(200)
        self.send_header("Access-Control-Allow-Origin", "*")
        self.send_header("Access-Control-Allow-Headers", "*")
        self.end_headers()

if __name__ == "__main__":
    port = int(sys.argv[1]) if len(sys.argv) > 1 else 8765
    print(f"Face server (YOLOv8) on http://localhost:{port}")
    HTTPServer(("127.0.0.1", port), Handler).serve_forever()
