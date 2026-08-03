#!/usr/bin/env python3
# -*- coding: utf-8 -*-
"""为「新城·龙陨之地」项目建 3 张空结构化表格（地理/宝物/势力），供一键填表实证。"""
import json, urllib.request, urllib.error

BASE = "http://127.0.0.1:3001"
PID = "577ed326-b241-4f67-9481-c9332cb03626"

TABLES = [
    {
        "name": "地理 · 地点",
        "key": "geo",
        "note": "从正文抽取的真实地点名称与信息。名称须逐字复制正文用字（含繁简/异体），禁止自创同义变体或错字地名。",
        "category": "geography",
        "columns": [
            {"key": "name", "label": "名称"},
            {"key": "desc", "label": "描述"},
            {"key": "firstChapter", "label": "首次出现章节"},
            {"key": "related", "label": "关联"},
        ],
        "rows": [],
    },
    {
        "name": "宝物 · 物品",
        "key": "treasure",
        "note": "从正文抽取的真实宝物/物品名称与信息。名称须逐字复制正文用字。",
        "category": "item",
        "columns": [
            {"key": "name", "label": "名称"},
            {"key": "type", "label": "类别"},
            {"key": "desc", "label": "描述"},
            {"key": "owner", "label": "归属"},
        ],
        "rows": [],
    },
    {
        "name": "势力 · 组织",
        "key": "faction",
        "note": "从正文抽取的真实势力/组织名称与信息。名称须逐字复制正文用字。",
        "category": "faction",
        "columns": [
            {"key": "name", "label": "名称"},
            {"key": "nature", "label": "性质"},
            {"key": "desc", "label": "描述"},
            {"key": "leader", "label": "首领"},
        ],
        "rows": [],
    },
]

def post(path, payload):
    url = BASE + path
    data = json.dumps(payload).encode("utf-8")
    req = urllib.request.Request(url, data=data, headers={"Content-Type": "application/json"}, method="POST")
    try:
        with urllib.request.urlopen(req, timeout=30) as r:
            return r.status, json.loads(r.read().decode("utf-8"))
    except urllib.error.HTTPError as e:
        return e.code, e.read().decode("utf-8", "replace")

if __name__ == "__main__":
    for t in TABLES:
        code, body = post(f"/api/projects/{PID}/lore-tables", t)
        if isinstance(body, dict) and "id" in body:
            print(f"OK   {t['key']:10s} -> {body['id']}  ({t['name']})")
        else:
            print(f"FAIL {t['key']:10s} -> HTTP {code}: {body}")
