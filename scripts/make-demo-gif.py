#!/usr/bin/env python3
# 生成 README 演示动图：首页 → 探讨模式 → 自动填表 → 本地过审自检
# 真实截图（home/explore）+ 程序化补足两帧，循环播放。
import sys
from PIL import Image, ImageDraw, ImageFont

BASE = "C:/Users/Administrator/WorkBuddy/2026-07-25-14-19-44/novel-forge"
FONT = "C:/Windows/Fonts/msyh.ttc"
OUT = BASE + "/docs/screenshots/demo.gif"

W, H = 820, 540
HEADER, FOOTER = 70, 70
CH = H - HEADER - FOOTER

try:
    f_t = ImageFont.truetype(FONT, 30)
    f_b = ImageFont.truetype(FONT, 21)
    f_s = ImageFont.truetype(FONT, 16)
except Exception as e:
    print("字体加载失败:", e); sys.exit(1)

def fit(path):
    im = Image.open(path).convert("RGB")
    im.thumbnail((W - 40, CH - 16), Image.LANCZOS)
    return im

def frame(title, footer, img=None, mock=None):
    c = Image.new("RGB", (W, H), (243, 244, 247))
    d = ImageDraw.Draw(c)
    d.rectangle([0, 0, W, HEADER], fill=(30, 33, 52))
    d.text((24, HEADER // 2 - 15), title, font=f_t, fill=(255, 255, 255))
    d.rectangle([0, H - FOOTER, W, H], fill=(30, 33, 52))
    d.text((24, H - FOOTER // 2 - 10), footer, font=f_b, fill=(220, 223, 235))
    if img:
        x = (W - img.width) // 2
        c.paste(img, (x, HEADER + 8))
    if mock:
        mock(d)
    return c

def mock_fill(d):
    x0, y0 = 40, HEADER + 30
    rows = [
        ("角色卡", "性格三层", "关系网"),
        ("林霜", "表层冷/里层软/核层狠", "与主角：宿敌→盟友"),
        ("沈砚", "表层暖/里层算计/核层孤", "与主角：亦师亦疑"),
    ]
    colw = [160, 320, 260]
    for ri, row in enumerate(rows):
        y = y0 + ri * 52
        for ci, cell in enumerate(row):
            x = x0 + sum(colw[:ci])
            d.rectangle([x, y, x + colw[ci] - 6, y + 44], outline=(120, 130, 160), width=1)
            d.text((x + 8, y + 12), cell, font=f_s, fill=(40, 44, 60))
    d.text((40, y0 + len(rows) * 52 + 14), "↑ 每章生成后自动抽取，角色卡/世界书零手动建档", font=f_s, fill=(90, 95, 120))

def mock_review(d):
    y = HEADER + 30
    data = [("段落 1", 92, (76, 175, 80)), ("段落 2", 74, (76, 175, 80)),
            ("段落 3", 48, (251, 188, 5)), ("段落 4", 23, (229, 57, 53))]
    for name, sc, col in data:
        d.text((40, y), name, font=f_s, fill=(40, 44, 60))
        d.rectangle([140, y + 4, 140 + sc * 4, y + 22], fill=col)
        d.text((140 + sc * 4 + 12, y), str(sc), font=f_s, fill=col)
        y += 50
    d.text((40, y + 6), "↑ 纯本地、不联网、稿件不上传；绿=干净 黄=可改 红=AI味重", font=f_s, fill=(90, 95, 120))

home = fit(BASE + "/docs/screenshots/home.png")
explore = fit(BASE + "/docs/screenshots/explore.png")

frames = [
    frame("① 首页 · 开箱即用", "选项目 / 示例小说，17 个预设 + 本地 SQLite 零配置", img=home),
    frame("② 探讨模式 · 对话式建世界", "一句话灵感 → 11 步对话构建完整世界观", img=explore),
    frame("③ 自动填表 · 设定自动建档", "生成后自动抽角色卡 / 世界书，关系图联动", mock=mock_fill),
    frame("④ 本地过审自检 · 去 AI 味", "段落级绿/黄/红评分，逐段高亮 AI 腔", mock=mock_review),
]

per = 18          # 每场景 18 帧
dur = 200         # 每帧 200ms → 单场景 3.6s，一轮约 14.4s 循环
seq = [fr for fr in frames for _ in range(per)]

seq[0].save(OUT, save_all=True, append_images=seq[1:], duration=dur, loop=0,
            optimize=True, disposal=2)
print("OK", OUT, "frames:", len(seq), "size(KB):", round(len(open(OUT,'rb').read())/1024))
