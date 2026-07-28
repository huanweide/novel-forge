import urllib.request, urllib.error, json, time

B = "http://127.0.0.1:3001"
PID = "a3b9493f-7e90-47e0-a798-cca5c01f33af"
NODES = [
    ("ffbecae7-4cb8-4917-b7db-3f8bc0328d14", "第一章 血脉初醒"),
    ("5295bd24-3684-4493-bb0b-435f8a146183", "第二章 夜袭"),
    ("eb6f0979-a6fb-40e4-bd4b-8b12807cbccb", "第三章 禁地残卷"),
]

def post_json(path, obj, timeout=300):
    data = json.dumps(obj).encode("utf-8")
    req = urllib.request.Request(B + path, data=data,
                                 headers={"Content-Type": "application/json"}, method="POST")
    with urllib.request.urlopen(req, timeout=timeout) as resp:
        return resp.read().decode("utf-8", "replace")

def get_json(path, timeout=30):
    req = urllib.request.Request(B + path, headers={"Content-Type": "application/json"}, method="GET")
    with urllib.request.urlopen(req, timeout=timeout) as resp:
        return resp.read().decode("utf-8", "replace")

def gen_chapter(node_id, title):
    t0 = time.time()
    text = post_json("/api/generate/write",
                     {"projectId": PID, "nodeId": node_id, "targetWordCount": 600})
    dt = time.time() - t0
    content = ""
    types = {}
    for line in text.splitlines():
        if line.startswith("data:"):
            payload = line[5:].strip()
            try:
                j = json.loads(payload)
            except Exception:
                continue
            t = j.get("type")
            types[t] = types.get(t, 0) + 1
            if t == "chunk":
                content += j.get("content", "")
    return dt, len(content), types, content

print("========== 开始三章生成 ==========", flush=True)
for i, (nid, title) in enumerate(NODES, 1):
    print(f"\n### {title} ###", flush=True)
    try:
        dt, clen, types, content = gen_chapter(nid, title)
        print(f"耗时 {dt:.1f}s | 正文字数 {clen} | 事件类型 {types}", flush=True)
        print("正文预览:", content[:160].replace(chr(10), " "), flush=True)
    except Exception as e:
        print("生成异常:", repr(e), flush=True)
        continue
    # 查填表结果
    try:
        tbls = json.loads(get_json(f"/api/projects/{PID}/lore-tables"))
        for tb in tbls:
            if tb.get("key") == "auto_facts":
                rows = tb.get("rows", [])
                print(f"[填表] 表={tb['name']} 行数={len(rows)}", flush=True)
                for r in rows[:6]:
                    print("  行:", json.dumps(r, ensure_ascii=False)[:200], flush=True)
    except Exception as e:
        print("查表异常:", repr(e), flush=True)
    # 查剧情推进
    try:
        sl = json.loads(get_json(f"/api/storylines?projectId={PID}"))
        for s in sl:
            binds = s.get("chapterBindings", [])
            print(f"[剧情线] {s.get('title')} chapterBindings={len(binds)}", flush=True)
    except Exception as e:
        print("查故事线异常:", repr(e), flush=True)

print("\n========== 三章生成结束 ==========", flush=True)
