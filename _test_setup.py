import urllib.request, json

B = "http://127.0.0.1:3001"
PID = "a3b9493f-7e90-47e0-a798-cca5c01f33af"

def req(method, path, obj=None):
    data = json.dumps(obj).encode("utf-8") if obj is not None else None
    r = urllib.request.Request(B + path, data=data,
                                headers={"Content-Type": "application/json"}, method=method)
    try:
        with urllib.request.urlopen(r, timeout=30) as resp:
            return resp.status, resp.read().decode("utf-8")
    except urllib.error.HTTPError as e:
        return e.code, e.read().decode("utf-8", "replace")

# 1) 读取并开启自动化填表配置
st, body = req("GET", f"/api/projects/{PID}/config")
print("GET_CONFIG", st, body[:200])

st, body = req("PUT", f"/api/projects/{PID}/config",
               {"autoFillEnabled": True, "fillFrequency": 1, "skipLatestChapter": False, "contextKeepChapters": 4})
print("PUT_CONFIG", st, body[:200])

# 2) 创建 3 个章节节点（古风/悬疑，围绕沈砚血脉觉醒）
nodes = [
    {"title": "第一章 血脉初醒", "order": 0,
     "outline": "沈砚在宗门后山试炼，意外触动上古封印，指尖渗出血色纹路，引来巡守弟子注目。"},
    {"title": "第二章 夜袭", "order": 1,
     "outline": "妖兽夜袭宗门，沈砚血脉异动击退来敌，被暗中观察的长老记在心中。"},
    {"title": "第三章 禁地残卷", "order": 2,
     "outline": "沈砚循血脉记忆找到禁地石室，发现记载身世的残卷，谜团渐开。"},
]
created = []
for n in nodes:
    n2 = dict(n, projectId=PID, type="section", status="outline_only")
    st, body = req("POST", "/api/story/nodes", n2)
    created.append((st, body[:150]))
    print("NODE", st, body[:150])

# 3) 列出节点确认
st, body = req("GET", f"/api/story/nodes?projectId={PID}")
print("LIST_NODES", st, "count_hint:", body.count('"order"'))
