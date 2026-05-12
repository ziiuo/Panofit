# -*- coding: utf-8 -*-
"""Create bitable fields using unicode escapes to avoid encoding issues."""
import requests, json
try:
    from config_secret import FEISHU_APP_ID as APP_ID, FEISHU_APP_SECRET as APP_SECRET, FEISHU_APP_TOKEN as APP_TOKEN, FEISHU_TABLE_ID as TABLE_ID
except ImportError:
    print("Please create config_secret.py from config_example.py first")
    exit(1)

TOKEN = requests.post(
    "https://open.feishu.cn/open-apis/auth/v3/tenant_access_token/internal",
    json={"app_id": APP_ID, "app_secret": APP_SECRET}
).json()["tenant_access_token"]
print("Token OK")

BASE = "https://open.feishu.cn/open-apis/bitable/v1/apps/%s/tables/%s" % (APP_TOKEN, TABLE_ID)
HEAD = {"Authorization": "Bearer " + TOKEN}

# Delete all non-primary fields
r = requests.get(BASE + "/fields", headers=HEAD)
for item in r.json()["data"]["items"]:
    if item.get("is_primary"): continue
    requests.delete(BASE + "/fields/" + item["field_id"], headers=HEAD)
    print("Deleted: " + item["field_id"])

# Create fields with unicode escapes
FIELDS = [
    ("事件时间", 1),   # 事件时间
    ("IP归属地", 1),        # IP归属地
    ("设备类型", 3),    # 设备类型
    ("设备UA", 1),               # 设备UA
    ("会话ID", 1),               # 会话ID
    ("事件类型", 3),    # 事件类型
    ("页面", 1),                  # 页面
    ("素材数量", 2),    # 素材数量
    ("拆分方案", 1),    # 拆分方案
    ("生成耗时", 2),    # 生成耗时
    ("画布数量", 2),    # 画布数量
    ("会话时长", 2),    # 会话时长
]

for name, ftype in FIELDS:
    r = requests.post(BASE + "/fields",
        headers=HEAD,
        json={"field_name": name, "type": ftype})
    print("Create %s (%s): %s" % (name, ftype, r.json().get("code")))

# Verify
print("\n--- Fields ---")
r = requests.get(BASE + "/fields", headers=HEAD)
for item in r.json()["data"]["items"]:
    print("  %s: %s (type=%s)" % (item["field_id"], item["field_name"], item["type"]))

# Test write
print("\n--- Test ---")
fields = {
    "事件时间": "2026-05-12 10:30",  # 事件时间
    "IP归属地": "北京",          # IP归属地 - 北京
    "设备类型": "iPhone",             # 设备类型
    "设备UA": "Mozilla",
    "会话ID": "uni-test",                     # 会话ID
    "事件类型": "test",               # 事件类型
    "页面": "home",                            # 页面
    "素材数量": 3,                    # 素材数量
    "拆分方案": "3",
    "生成耗时": 8,                    # 生成耗时
    "画布数量": 1,                    # 画布数量
    "会话时长": 30,                   # 会话时长
}
r = requests.post(BASE + "/records", headers=HEAD, json={"fields": fields})
print("Write: %s %s" % (r.json().get("code"), r.json().get("msg", "")))
if r.json().get("code") == 0:
    print("SUCCESS - all fields verified!")
