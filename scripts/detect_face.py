"""Face detection script. Usage: python detect_face.py <image_path>"""
import sys, json, cv2

def detect(path):
    img = cv2.imread(path)
    if img is None:
        return {"error": "cannot read image", "face": False, "faceRegion": None}

    gray = cv2.cvtColor(img, cv2.COLOR_BGR2GRAY)
    cascade = cv2.CascadeClassifier("D:/pintietool/scripts/cascade/haarcascade_frontalface_default.xml")
    faces = cascade.detectMultiScale(gray, scaleFactor=1.1, minNeighbors=5, minSize=(60, 60))

    if len(faces) == 0:
        return {"face": False, "faceRegion": None}

    # Use the largest face
    best = max(faces, key=lambda f: f[2] * f[3])
    x, y, w, h = best.tolist()
    h_img, w_img = img.shape[:2]
    cx = (x + w / 2) / w_img
    cy = (y + h / 2) / h_img
    r = max(w, h) / max(w_img, h_img) * 0.8

    return {
        "face": True,
        "faceRegion": {"cx": round(cx, 4), "cy": round(cy, 4), "r": round(r, 4)}
    }

if __name__ == "__main__":
    result = detect(sys.argv[1])
    print(json.dumps(result))
