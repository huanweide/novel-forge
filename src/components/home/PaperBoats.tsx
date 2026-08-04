"use client";

import { useEffect, useRef, useState } from "react";
import { useRouter } from "next/navigation";
import * as THREE from "three";

// ─── 类型 ────────────────────────────────────────────────────
export interface PaperProject {
  id: string | null;
  name: string;
  genre?: string[];
  targetWordCount?: number;
  updatedAt?: string;
  storyNodes?: number;
}

// ─── 船型系统（BoatFactory，参数驱动，≤7 种几何） ──────────────
type BoatType = "wupeng" | "tower" | "sail" | "fishing" | "dragon" | "mech" | "drift";
type Tier = 1 | 2 | 3;

// 真实原型名（仅作 tooltip 内小字，弱化呈现）
const TYPE_NAMES: Record<BoatType, string> = {
  wupeng: "黑珍珠号", tower: "复仇女王号", sail: "飞翔的荷兰人",
  fishing: "航空母舰", dragon: "驱逐舰", mech: "核潜艇", drift: "未名舰队",
};
// 意境名（UI 主呈现，弱化真实名强调）
const TYPE_POETIC: Record<BoatType, string> = {
  wupeng: "暗夜金帆", tower: "赤骨怒潮", sail: "幽海磷光",
  fishing: "云港巨舰", dragon: "银锋迅影", mech: "深蓝潜蛟", drift: "无名漂流",
};
// 层级归类（一层低平 / 两层扬帆 / 三层连云）
const TYPE_TIER: Record<BoatType, Tier> = {
  mech: 1, dragon: 1,
  wupeng: 2, tower: 2, sail: 2, drift: 2,
  fishing: 3,
};
const TIER_NAME: Record<Tier, string> = { 1: "一层 · 平波", 2: "两层 · 扬帆", 3: "三层 · 连云" };

// 题材 → 船型映射（船型即语义）；未命中回退 未名舰队（drift）
const GENRE_TO_TYPE: Record<string, BoatType> = {
  武侠: "wupeng", 言情: "wupeng", 爱情: "wupeng", 田园: "wupeng", 古典: "wupeng", 市井: "wupeng",
  仙侠: "tower", 玄幻: "tower", 历史: "tower", 奇幻: "tower",
  冒险: "sail", 西幻: "sail", 翻译: "sail", 成长: "sail",
  科幻: "fishing", 军事: "fishing", 游戏: "fishing", 赛博: "fishing",
  推理: "dragon", 都市: "dragon", 竞技: "dragon",
  悬疑: "mech", 灵异: "mech", 恐怖: "mech", 谍战: "mech",
};
function boatTypeFor(genre?: string[]): BoatType {
  if (genre) for (const g of genre) if (GENRE_TO_TYPE[g]) return GENRE_TO_TYPE[g];
  return "drift";
}

const clamp = (v: number, a: number, b: number) => Math.max(a, Math.min(b, v));

// ─── 每类型随机配色（保证类型区分度 + 同型不同船） ─────────────
// 每个船型一个色相族，船与船之间在族内抖动，相邻船不撞色
const TYPE_HUE: Record<BoatType, number> = {
  wupeng: 0.11, tower: 0.0, sail: 0.43, fishing: 0.60, dragon: 0.56, mech: 0.54, drift: 0.80,
};
const TYPE_SURF: Record<BoatType, { rough: number; metal: number }> = {
  wupeng: { rough: 0.45, metal: 0.5 }, tower: { rough: 0.5, metal: 0.45 },
  sail: { rough: 0.62, metal: 0.15 }, fishing: { rough: 0.55, metal: 0.4 },
  dragon: { rough: 0.5, metal: 0.45 }, mech: { rough: 0.3, metal: 0.7 }, drift: { rough: 0.7, metal: 0.1 },
};
// 吃水深度（原点在海面下多少比例船高）：潜艇深、航母浅
const TYPE_DRAFT: Record<BoatType, number> = {
  mech: 0.78, dragon: 0.4, wupeng: 0.32, tower: 0.34, sail: 0.33, fishing: 0.22, drift: 0.4,
};

function hslToRgb(h: number, s: number, l: number): [number, number, number] {
  const a = s * Math.min(l, 1 - l);
  const f = (n: number) => {
    const k = (n + h * 12) % 12;
    return l - a * Math.max(-1, Math.min(k - 3, 9 - k, 1));
  };
  return [f(0), f(8), f(4)];
}
// 确定性散列，保证渲染稳定且相邻船不同色
function boatHullColor(type: BoatType, i: number): [number, number, number] {
  const base = TYPE_HUE[type];
  const h = (base + ((i * 0.137 + 0.21) % 1) * 0.09 - 0.045 + 1) % 1;
  const s = 0.42 + 0.22 * ((i * 0.53 + 0.11) % 1);
  const l = 0.5 + 0.14 * ((i * 0.29 + 0.07) % 1);
  return hslToRgb(h, s, l);
}

// ─── 双层波（CPU 与 GPU 同公式，保证船贴浪） ──────────────────
function seaH(x: number, z: number, t: number) {
  return 0.19 * Math.sin(0.5 * x + t * 0.8) + 0.13 * Math.sin(0.7 * z + t * 1.1);
}

const NOISE = `
float hash(vec2 p){ return fract(sin(dot(p, vec2(127.1,311.7)))*43758.5453); }
float vnoise(vec2 x){ vec2 i=floor(x), f=fract(x); f=f*f*(3.0-2.0*f);
  float a=hash(i), b=hash(i+vec2(1,0)), c=hash(i+vec2(0,1)), d=hash(i+vec2(1,1));
  return mix(mix(a,b,f.x), mix(c,d,f.x), f.y); }
float fbm(vec2 p){ float v=0.0,a=0.5; for(int i=0;i<5;i++){ v+=a*vnoise(p); p*=2.03; a*=0.5; } return v; }`;

const seaVert = `
uniform float uTime;
varying vec3 vWP; varying vec3 vN;
float waveH(float x, float z, float t){ return 0.19*sin(0.5*x + t*0.8) + 0.13*sin(0.7*z + t*1.1); }
void main(){
  vec4 wp = modelMatrix * vec4(position, 1.0);
  float h = waveH(wp.x, wp.z, uTime);
  wp.y += h;
  float e = 0.4;
  float hx = waveH(wp.x+e, wp.z, uTime) - waveH(wp.x-e, wp.z, uTime);
  float hz = waveH(wp.x, wp.z+e, uTime) - waveH(wp.x, wp.z-e, uTime);
  vN = normalize(vec3(-hx, 2.0*e, -hz));
  vWP = wp.xyz;
  gl_Position = projectionMatrix * viewMatrix * wp;
}`;

const seaFrag = NOISE + `
uniform float uTime;
varying vec3 vWP; varying vec3 vN;
void main(){
  vec3 V = normalize(cameraPosition - vWP);
  vec3 N = normalize(vN);
  float fres = pow(1.0 - max(dot(V, N), 0.0), 2.2);
  vec3 deep = vec3(0.10, 0.30, 0.60);
  vec3 sheen = vec3(0.45, 0.70, 0.95);
  vec3 col = deep + sheen * fres * 1.1;
  float flow = fbm(vWP.xz*0.35 + vec2(uTime*0.03, uTime*0.02));
  col += vec3(0.12, 0.28, 0.50) * flow * 0.55;
  float foam = smoothstep(0.62, 0.82, fbm(vWP.xz*1.6 + vec2(uTime*0.05, uTime*0.03)));
  col += vec3(1.0, 1.0, 1.0) * foam * 0.45;
  float rings = sin(length(vWP.xz)*7.0 - uTime*2.5);
  col += vec3(1.0) * smoothstep(0.88, 1.0, abs(rings)) * 0.08;
  gl_FragColor = vec4(col, 1.0);
}`;

// ─── 圆角精细化船体（放样：截面半圆+收分首尾+舷弧，不再长方体） ──
// 截面为闭合环：龙骨(底)→右舷弧→甲板→左舷弧，沿船长放样并对首尾收尖，
// 得到圆润船体（圆底、曲舷、平甲板），绝非长方体。
function makeHull(L: number, W: number, H: number, opt: {
  sheer?: number; segsX?: number; segsZ?: number;
} = {}): THREE.BufferGeometry {
  const { sheer = 0.22, segsX = 24, segsZ = 14 } = opt;
  const M = segsZ;
  // 截面半宽随归一化高度 u(0 龙骨..1 甲板)：下半圆（圆底）+ 近甲板满宽
  const xHalf = (u: number) => Math.sqrt(Math.max(0, 1 - Math.pow(1 - u, 2)));
  // 船长收分：首尾皆收尖（独木舟式圆润船体），中段最宽
  const lengthTaper = (t: number) => Math.pow(Math.sin(Math.PI * t), 0.6);
  // 构造截面点序（闭合环），右侧 u:0→1，左侧 u:1→0（去重端点）
  const prof: Array<[number, number]> = [];
  for (let k = 0; k <= M; k++) prof.push([k / M, 1]);
  for (let k = M - 1; k >= 1; k--) prof.push([k / M, -1]);

  const stations = segsX + 1;
  const ringPts = prof.length;
  const positions: number[] = [];
  const indices: number[] = [];
  for (let i = 0; i <= stations; i++) {
    const t = i / stations;
    const x = -L / 2 + L * t;
    const lt = lengthTaper(t);
    const sh = sheer * (Math.pow(t, 2.3) + Math.pow(1 - t, 2.3));
    for (const [u, side] of prof) {
      const y = -H / 2 + H * u + sh;
      const z = side * (W / 2) * xHalf(u) * lt;
      positions.push(x, y, z);
    }
  }
  const stride = ringPts;
  for (let i = 0; i < stations; i++) {
    for (let p = 0; p < ringPts; p++) {
      const a = i * stride + p;
      const b = i * stride + ((p + 1) % ringPts);
      const c = a + stride;
      const d = b + stride;
      indices.push(a, c, b, b, c, d);
    }
  }
  const g = new THREE.BufferGeometry();
  g.setAttribute("position", new THREE.Float32BufferAttribute(positions, 3));
  g.setIndex(indices);
  g.computeVertexNormals();
  return g;
}

// ─── 共享材质（模块顶层，纯色，SSR 安全） ─────────────────────
const GOLD_MAT = new THREE.MeshStandardMaterial({ color: 0xe6b54e, roughness: 0.3, metalness: 0.7 }); // 金饰
const SAKE_BLACK_MAT = new THREE.MeshStandardMaterial({ color: 0x2b2b36, roughness: 0.5, metalness: 0.35, side: THREE.DoubleSide }); // 黑帆
const DARK_MAT = new THREE.MeshStandardMaterial({ color: 0x232c40, roughness: 0.6, metalness: 0.15, side: THREE.DoubleSide }); // 暗部细节
const GHOST_SAIL_MAT = new THREE.MeshStandardMaterial({ color: 0xd6e8e4, roughness: 0.9, transparent: true, opacity: 0.75, side: THREE.DoubleSide }); // 破帆
const GHOST_GLOW = new THREE.MeshBasicMaterial({ color: 0x5dffd0 }); // 幽绿发光
const COLD_MAT = new THREE.MeshBasicMaterial({ color: 0x6fd6ff }); // 冷蓝发光
const CORE_WARM = new THREE.MeshBasicMaterial({ color: 0xfff2d8 }); // 暖白船头灯
const DECK_MAT = new THREE.MeshStandardMaterial({ color: 0x9aabbf, roughness: 0.8, metalness: 0.1 }); // 甲板

// 纹理材质：桅杆木纹（依赖 document，客户端惰性构建，SSR 安全）
let _woodTex: THREE.CanvasTexture | null = null;
function getWoodTex(): THREE.CanvasTexture {
  if (!_woodTex) {
    const c = document.createElement("canvas"); c.width = 128; c.height = 128;
    const x = c.getContext("2d")!;
    x.fillStyle = "#3a3328"; x.fillRect(0, 0, 128, 128);
    for (let i = 0; i < 26; i++) {
      x.strokeStyle = `rgba(${90 + Math.random() * 50},${80 + Math.random() * 45},${55 + Math.random() * 35},${0.25 + Math.random() * 0.3})`;
      x.lineWidth = 1 + Math.random() * 2.4;
      x.beginPath();
      const sx = Math.random() * 128;
      x.moveTo(sx, 0);
      x.bezierCurveTo(sx + (Math.random() * 30 - 15), 42, sx + (Math.random() * 30 - 15), 86, sx + (Math.random() * 20 - 10), 128);
      x.stroke();
    }
    _woodTex = new THREE.CanvasTexture(c); _woodTex.needsUpdate = true;
  }
  return _woodTex;
}
let _woodMat: THREE.MeshStandardMaterial | null = null;
function getWoodMat(): THREE.MeshStandardMaterial {
  if (!_woodMat) _woodMat = new THREE.MeshStandardMaterial({ map: getWoodTex(), color: 0x4a4133, roughness: 0.85, metalness: 0.0 });
  return _woodMat;
}

// ─── 每型船体材质（每船克隆上随机色，perBoat 标记便于释放） ─────
function hullMatFor(type: BoatType, color: [number, number, number]): THREE.MeshStandardMaterial {
  const { rough, metal } = TYPE_SURF[type];
  const m = new THREE.MeshStandardMaterial({ color: new THREE.Color(color[0], color[1], color[2]), roughness: rough, metalness: metal, side: THREE.DoubleSide });
  (m.userData as { perBoat?: boolean }).perBoat = true;
  return m;
}

// ─── 现代名船部件（实体几何，低模但特征鲜明） ────────────────
function makeMast(len: number, r = 0.035): THREE.Mesh {
  return new THREE.Mesh(new THREE.CylinderGeometry(r, r * 1.3, len, 7), getWoodMat());
}
function makeSailPnl(w: number, h: number, mat: THREE.Material): THREE.Mesh {
  const geo = new THREE.PlaneGeometry(w, h, 6, 6);
  const p = geo.attributes.position as THREE.BufferAttribute;
  for (let i = 0; i < p.count; i++) {
    const x = p.getX(i), y = p.getY(i);
    const belly = 0.16 * (1 - Math.pow((x / (w / 2)), 2)) * (1 - Math.pow((y / (h / 2)), 2));
    p.setZ(i, belly);
  }
  geo.computeVertexNormals();
  return new THREE.Mesh(geo, mat);
}
// 舰载机（航母甲板上的"子舰"）
function makeJet(scale = 1): THREE.Group {
  const g = new THREE.Group();
  const body = new THREE.Mesh(new THREE.BoxGeometry(0.34 * scale, 0.05 * scale, 0.06 * scale), DECK_MAT);
  body.position.y = 0.03; g.add(body);
  const wing = new THREE.Mesh(new THREE.BoxGeometry(0.12 * scale, 0.015 * scale, 0.3 * scale), DECK_MAT);
  wing.position.y = 0.045; g.add(wing);
  const tail = new THREE.Mesh(new THREE.BoxGeometry(0.05 * scale, 0.06 * scale, 0.04 * scale), DECK_MAT);
  tail.position.set(-0.13 * scale, 0.06, 0); g.add(tail);
  return g;
}
// 舰炮（驱逐舰）
function makeTurret(scale = 1): THREE.Group {
  const g = new THREE.Group();
  const base = new THREE.Mesh(new THREE.BoxGeometry(0.16 * scale, 0.08 * scale, 0.16 * scale), DARK_MAT);
  base.position.y = 0.05; g.add(base);
  const barrel = new THREE.Mesh(new THREE.CylinderGeometry(0.012, 0.012, 0.3 * scale, 6), DARK_MAT);
  barrel.rotation.z = Math.PI / 2; barrel.position.set(0.2 * scale, 0.09, 0); g.add(barrel);
  return g;
}

// ─── 舷窗（环形发光，贴船舷两侧） ────────────────────────────
function addPortholes(group: THREE.Group, halfW: number, y: number, glow: THREE.Material, n = 4) {
  for (const sz of [-1, 1]) {
    for (let i = 0; i < n; i++) {
      const ring = new THREE.Mesh(new THREE.TorusGeometry(0.04, 0.015, 6, 10), glow);
      const x = -halfW * 0.55 + (1.1 * halfW) * (n > 1 ? i / (n - 1) : 0.5);
      ring.position.set(x, y, sz * halfW * 0.97);
      ring.rotation.y = sz > 0 ? 0 : Math.PI;
      group.add(ring);
    }
  }
}

// ─── 定制图案旗帜（每型不同图案，客户端惰性贴图，SSR 安全） ─────
const _flagTex: Partial<Record<BoatType, THREE.CanvasTexture>> = {};
function flagBg(type: BoatType): string {
  const map: Record<BoatType, string> = {
    wupeng: "#1a1206", tower: "#1c0606", sail: "#0c1a18",
    fishing: "#0a1622", dragon: "#0a1422", mech: "#06141c", drift: "#14101c",
  };
  return map[type];
}
function getFlagTex(type: BoatType): THREE.CanvasTexture {
  if (!_flagTex[type]) {
    const c = document.createElement("canvas"); c.width = 64; c.height = 40;
    const x = c.getContext("2d")!;
    x.fillStyle = flagBg(type); x.fillRect(0, 0, 64, 40);
    x.strokeStyle = "#e6b54e"; x.fillStyle = "#e6b54e"; x.lineWidth = 2.5;
    const cx = 32, cy = 20;
    if (type === "tower" || type === "wupeng") { // 骷髅 + 交叉骨
      x.beginPath(); x.arc(cx, cy - 3, 7, 0, Math.PI * 2); x.fill();
      x.fillRect(cx - 9, cy + 2, 18, 3);
      x.save(); x.translate(cx - 7, cy + 2); x.rotate(-0.6);
      x.fillRect(0, 0, 14, 3); x.restore();
      x.save(); x.translate(cx + 7, cy + 2); x.rotate(0.6);
      x.fillRect(-14, 0, 14, 3); x.restore();
    } else if (type === "sail") { // 幽灵漩涡
      x.beginPath(); x.arc(cx, cy, 10, 0.3, Math.PI * 1.7); x.stroke();
      x.beginPath(); x.arc(cx + 2, cy + 2, 5, 0, Math.PI * 1.6); x.stroke();
    } else if (type === "fishing") { // 星徽
      for (let k = 0; k < 5; k++) {
        const a = -Math.PI / 2 + k * (Math.PI * 2 / 5);
        x.beginPath(); x.moveTo(cx, cy); x.lineTo(cx + Math.cos(a) * 11, cy + Math.sin(a) * 11); x.stroke();
      }
    } else if (type === "dragon") { // 雷达棱纹
      for (let k = 0; k < 3; k++) { x.beginPath(); x.moveTo(cx - 10, cy + 6 - k * 5); x.lineTo(cx, cy - 2 - k * 5); x.lineTo(cx + 10, cy + 6 - k * 5); x.stroke(); }
    } else if (type === "mech") { // 波浪鳍
      x.beginPath(); x.moveTo(cx - 11, cy + 6);
      x.quadraticCurveTo(cx - 4, cy - 8, cx + 3, cy + 4);
      x.quadraticCurveTo(cx + 8, cy - 4, cx + 12, cy + 2); x.stroke();
    } else { // drift 问号
      x.font = "bold 22px serif"; x.fillText("?", cx - 6, cy + 8);
    }
    const tex = new THREE.CanvasTexture(c); tex.needsUpdate = true;
    _flagTex[type] = tex;
  }
  return _flagTex[type]!;
}
function addFlag(group: THREE.Group, x: number, y: number, z: number, type: BoatType) {
  const pole = new THREE.Mesh(new THREE.CylinderGeometry(0.01, 0.01, 0.5, 5), DARK_MAT);
  pole.position.set(x, y + 0.25, z); group.add(pole);
  const flagMat = new THREE.MeshBasicMaterial({ map: getFlagTex(type), side: THREE.DoubleSide });
  (flagMat.userData as { perBoat?: boolean }).perBoat = true;
  const flag = new THREE.Mesh(new THREE.PlaneGeometry(0.36, 0.22), flagMat);
  flag.position.set(x + 0.19, y + 0.4, z); group.add(flag);
}

interface BuiltBoat { group: THREE.Group; bowLocal: THREE.Vector3; hullH: number; }

// 工厂：按类型拼装真实船（船头朝 +X）。color = 每型随机亮色涂装。
function createBoat(type: BoatType, color: [number, number, number]): BuiltBoat {
  const group = new THREE.Group();
  let bowLocal: THREE.Vector3;
  const hullMat = hullMatFor(type, color);
  const addEdges = (geo: THREE.BufferGeometry, col: [number, number, number], parent: THREE.Object3D) => {
    const e = new THREE.LineSegments(
      new THREE.EdgesGeometry(geo, 24),
      new THREE.LineBasicMaterial({ color: new THREE.Color(col[0], col[1], col[2]), transparent: true, opacity: 0.6, blending: THREE.AdditiveBlending })
    );
    (e.userData as { perBoat?: boolean }).perBoat = true;
    parent.add(e);
  };
  const lantern = (x: number, y: number, z: number): THREE.Vector3 => {
    const post = new THREE.Mesh(new THREE.CylinderGeometry(0.012, 0.012, 0.2, 5), DARK_MAT);
    post.position.set(x, y, z); group.add(post);
    return new THREE.Vector3(x, y + 0.13, z);
  };
  // 黑帆三桅骨架（暗夜金帆 / 赤骨怒潮 共用；hullMat 决定随机亮色涂装）
  const rigBlack = (L: number, W: number, H: number, opt: { sheer?: number; gold?: boolean; skull?: boolean } = {}) => {
    const hull = makeHull(L, W, H, { sheer: opt.sheer ?? 0.3, segsX: 22, segsZ: 13 });
    const body = new THREE.Mesh(hull, hullMat);
    group.add(body); addEdges(hull, color, body);
    const masts: Array<[number, number]> = [[-0.95, 1.7], [0.0, 2.05], [0.85, 1.5]];
    for (const [mx, mh] of masts) {
      const mast = makeMast(mh);
      mast.position.set(mx, 0.5 + mh / 2, 0); group.add(mast);
      const sail = makeSailPnl(1.0, mh * 0.72, SAKE_BLACK_MAT);
      sail.position.set(mx - 0.02, 0.5 + mh * 0.5, 0.01); group.add(sail);
    }
    const sternSail = makeSailPnl(0.82, 1.1, SAKE_BLACK_MAT);
    sternSail.rotation.y = 0.35; sternSail.position.set(1.05, 1.1, 0); group.add(sternSail);
    if (opt.gold) {
      const bowOrn = new THREE.Mesh(new THREE.SphereGeometry(0.08, 8, 8), GOLD_MAT);
      bowOrn.position.set(L / 2 + 0.05, 0.45, 0); group.add(bowOrn);
      const sternCastle = new THREE.Mesh(new THREE.BoxGeometry(0.45, 0.34, 0.56), GOLD_MAT);
      sternCastle.position.set(-L / 2 + 0.22, 0.6, 0); group.add(sternCastle);
      for (const sz of [-1, 1]) for (let i = 0; i < 3; i++) {
        const port = new THREE.Mesh(new THREE.BoxGeometry(0.07, 0.08, 0.03), GOLD_MAT);
        port.position.set(L / 2 - 0.4 - i * 0.5, 0.3, sz * (W / 2 + 0.01)); group.add(port);
      }
    }
    if (opt.skull) {
      const skull = new THREE.Mesh(new THREE.SphereGeometry(0.07, 8, 8), new THREE.MeshStandardMaterial({ color: 0xe8e4d8, roughness: 0.4 }));
      skull.position.set(-1.2, 1.25, 0); group.add(skull);
    }
    addPortholes(group, W / 2, 0.05, type === "tower" ? GHOST_GLOW : CORE_WARM, 4);
    addFlag(group, -L / 2 + 0.1, 0.7, 0, type);
    return lantern(L / 2 + 0.05, 0.6, 0);
  };

  if (type === "wupeng") { // 暗夜金帆：随机亮金船体 + 黑帆 + 金饰
    bowLocal = rigBlack(3.0, 1.05, 0.95, { sheer: 0.32, gold: true });
  } else if (type === "tower") { // 赤骨怒潮：随机亮红船体 + 黑帆 + 骷髅 + 舷窗林立
    bowLocal = rigBlack(2.9, 1.15, 1.05, { sheer: 0.28, gold: true, skull: true });
  } else if (type === "sail") { // 幽海磷光：幽绿青船体 + 破帆 + 幽绿舷灯 + 独角鲸牙
    const hull = makeHull(3.0, 1.05, 1.0, { sheer: 0.36, segsX: 22, segsZ: 13 });
    const body = new THREE.Mesh(hull, hullMat);
    group.add(body); addEdges(hull, color, body);
    const gmasts: Array<[number, number]> = [[-0.95, 1.8], [0.0, 2.15], [0.85, 1.6]];
    for (const [mx, mh] of gmasts) {
      const mast = makeMast(mh);
      mast.position.set(mx, 0.55 + mh / 2, 0); group.add(mast);
      const sail = makeSailPnl(1.05, mh * 0.8, GHOST_SAIL_MAT);
      sail.position.set(mx - 0.02, 0.55 + mh * 0.55, 0.01); group.add(sail);
    }
    const tusk = new THREE.Mesh(new THREE.ConeGeometry(0.035, 0.55, 6), new THREE.MeshStandardMaterial({ color: 0xd8d4c8, roughness: 0.3 }));
    tusk.rotation.z = -Math.PI / 2; tusk.position.set(1.6, 0.6, 0); group.add(tusk);
    for (const sz of [-1, 1]) for (let i = 0; i < 4; i++) {
      const glow = new THREE.Mesh(new THREE.SphereGeometry(0.04, 6, 6), GHOST_GLOW);
      glow.position.set(1.1 - i * 0.6, 0.45, sz * 0.5); group.add(glow);
    }
    addPortholes(group, 0.5, 0.1, GHOST_GLOW, 4);
    addFlag(group, -1.3, 0.8, 0, type);
    bowLocal = lantern(1.35, 0.65, 0);
  } else if (type === "fishing") { // 云港巨舰：宽甲板 + 舰岛 + 斜角 + 舰载机（子舰=作品）
    const hull = new THREE.Mesh(new THREE.BoxGeometry(3.9, 0.55, 1.5), hullMat);
    hull.position.y = 0.1; group.add(hull);
    const deck = new THREE.Mesh(new THREE.BoxGeometry(3.8, 0.07, 1.28), DECK_MAT);
    deck.position.y = 0.42; group.add(deck);
    const island = new THREE.Mesh(new THREE.BoxGeometry(0.55, 0.6, 0.36), DARK_MAT);
    island.position.set(-0.8, 0.78, 0.45); group.add(island);
    const ant = new THREE.Mesh(new THREE.CylinderGeometry(0.008, 0.008, 0.55, 4), DARK_MAT);
    ant.position.set(-0.8, 1.15, 0.45); group.add(ant);
    const angled = new THREE.Mesh(new THREE.BoxGeometry(2.9, 0.015, 0.1), DARK_MAT);
    angled.position.set(0.1, 0.46, -0.4); angled.rotation.y = 0.22; group.add(angled);
    const cats = new THREE.Mesh(new THREE.BoxGeometry(0.015, 0.015, 0.85), GHOST_SAIL_MAT);
    cats.position.set(0.6, 0.46, 0.34); group.add(cats);
    // 舰载机（子舰=作品，甲板上 4 架，武器放大）
    const jets: Array<[number, number, number, number]> = [
      [0.8, 0.46, 0.36, 0.1], [-0.15, 0.46, 0.4, -0.12], [0.4, 0.46, -0.34, 0.25], [-0.6, 0.46, -0.3, -0.2],
    ];
    for (const [jx, jy, jz, jr] of jets) {
      const jet = makeJet(1.3); jet.position.set(jx, jy, jz); jet.rotation.y = jr; group.add(jet);
    }
    for (const sz of [-1, 1]) {
      const sponson = new THREE.Mesh(new THREE.BoxGeometry(1.6, 0.07, 0.14), DARK_MAT);
      sponson.position.set(-0.35, 0.2, sz * 0.72); group.add(sponson);
    }
    addPortholes(group, 0.75, 0.05, COLD_MAT, 5);
    addFlag(group, -1.7, 1.0, 0.45, type);
    bowLocal = lantern(1.75, 0.6, 0);
  } else if (type === "dragon") { // 银锋迅影：现代军舰，舰桥 + 雷达 + 主炮 + 导弹架
    const hull = makeHull(3.2, 0.7, 0.55, { sheer: 0.07, segsX: 20, segsZ: 11 });
    const body = new THREE.Mesh(hull, hullMat);
    group.add(body); addEdges(hull, color, body);
    const bridge = new THREE.Mesh(new THREE.BoxGeometry(0.48, 0.45, 0.4), DARK_MAT);
    bridge.position.set(-0.7, 0.45, 0); group.add(bridge);
    const radar = new THREE.Mesh(new THREE.BoxGeometry(0.16, 0.14, 0.16), DARK_MAT);
    radar.position.set(-0.7, 0.74, 0); group.add(radar);
    const gun = makeTurret(1.25); gun.position.set(0.8, 0.33, 0); group.add(gun);
    const launchers: Array<[number, number, number]> = [[0.18, 0.2, 0.58], [0.18, -0.2, -0.58]];
    for (const [mx, mz, mr] of launchers) {
      const launcher = new THREE.Mesh(new THREE.BoxGeometry(0.56, 0.06, 0.09), DARK_MAT);
      launcher.position.set(mx, 0.4, mz); launcher.rotation.y = mr; group.add(launcher);
    }
    const sternGun = makeTurret(1.1); sternGun.position.set(-1.35, 0.33, 0); group.add(sternGun);
    const ants: Array<[number, number]> = [[1.05, 0], [-0.25, 0.22], [0.45, -0.22]];
    for (const [ax, az] of ants) {
      const a = new THREE.Mesh(new THREE.CylinderGeometry(0.006, 0.006, 0.45, 4), DARK_MAT);
      a.position.set(ax, 0.55, az); group.add(a);
    }
    addPortholes(group, 0.35, 0.05, COLD_MAT, 4);
    addFlag(group, -1.45, 0.5, 0, type);
    bowLocal = lantern(1.5, 0.5, 0);
  } else if (type === "mech") { // 深蓝潜蛟：圆柱艇身 + 围壳 + 潜望镜 + 螺旋桨（保留赞誉的圆角建模）
    const hull = new THREE.Mesh(new THREE.CylinderGeometry(0.32, 0.32, 2.7, 14), hullMat);
    hull.rotation.z = Math.PI / 2; group.add(hull);
    const bow = new THREE.Mesh(new THREE.ConeGeometry(0.32, 0.5, 14), hullMat);
    bow.rotation.z = -Math.PI / 2; bow.position.set(1.5, 0, 0); group.add(bow);
    const stern = new THREE.Mesh(new THREE.ConeGeometry(0.32, 0.4, 14), hullMat);
    stern.rotation.z = Math.PI / 2; stern.position.set(-1.45, 0, 0); group.add(stern);
    const fin = new THREE.Mesh(new THREE.BoxGeometry(0.16, 0.25, 0.18), hullMat);
    fin.position.set(-1.28, 0, 0); group.add(fin);
    const prop = new THREE.Mesh(new THREE.BoxGeometry(0.07, 0.2, 0.07), DARK_MAT);
    prop.position.set(-1.68, 0, 0); group.add(prop);
    const sail = new THREE.Mesh(new THREE.BoxGeometry(0.55, 0.3, 0.22), DARK_MAT);
    sail.position.set(0.18, 0.4, 0); group.add(sail);
    const periscope = new THREE.Mesh(new THREE.CylinderGeometry(0.008, 0.008, 0.34, 4), DARK_MAT);
    periscope.position.set(0.18, 0.62, 0); group.add(periscope);
    const pTip = new THREE.Mesh(new THREE.SphereGeometry(0.015, 6, 6), GHOST_GLOW);
    pTip.position.set(0.18, 0.78, 0); group.add(pTip);
    for (const sz of [-1, 1]) for (let i = 0; i < 2; i++) {
      const l = new THREE.Mesh(new THREE.SphereGeometry(0.03, 6, 6), GHOST_GLOW);
      l.position.set(0.55 + i * 0.8, 0.12, sz * 0.3); group.add(l);
    }
    addFlag(group, 0.18, 0.7, 0, type);
    bowLocal = lantern(1.35, 0.45, 0);
  } else { // drift 未名舰队：小巧折纸漂流艇（略弯，带图案）
    const hull = makeHull(2.0, 0.75, 0.62, { sheer: 0.4, segsX: 18, segsZ: 11 });
    const body = new THREE.Mesh(hull, hullMat);
    body.rotation.z = 0.06; group.add(body); addEdges(hull, color, body);
    const mast = makeMast(1.2); mast.position.set(0, 0.5 + 0.6, 0); group.add(mast);
    const sail = makeSailPnl(0.9, 0.85, GHOST_SAIL_MAT);
    sail.position.set(-0.02, 0.5 + 0.55, 0.01); group.add(sail);
    addPortholes(group, 0.38, 0.05, COLD_MAT, 3);
    addFlag(group, -0.9, 0.6, 0, type);
    bowLocal = lantern(1.0, 0.55, 0);
  }

  const hullHByType: Record<BoatType, number> = {
    wupeng: 0.95, tower: 1.05, sail: 1.0, fishing: 0.7, dragon: 0.55, mech: 0.64, drift: 0.62,
  };
  return { group, bowLocal, hullH: hullHByType[type] };
}

interface Boat {
  id: string | null;
  name: string;
  type: BoatType;
  hullColor: [number, number, number];
  tier: Tier;
  group: THREE.Group;
  bowLocal: THREE.Vector3;
  scale: number;
  bright: number;
  bornAt: number;
  landed: boolean;
  landAt?: number;
  phase: number;
  // 巡游参数
  orbitR: number;
  orbitSpeed: number;
  orbitPhase: number;
  avoidX: number;
  avoidZ: number;
  draft: number;
  hullH: number;
}

const LAMP_MAX = 8; // 真 PointLight 全局上限（性能纪律）

export default function PaperBoats({ projects }: { projects: PaperProject[] }) {
  const mountRef = useRef<HTMLDivElement>(null);
  const router = useRouter();
  const [list, setList] = useState<PaperProject[]>([]);
  const [hoverName, setHoverName] = useState<string | null>(null);
  const hoverIdxRef = useRef<number | null>(null);

  useEffect(() => {
    setList(
      projects.length > 0
        ? projects
        : Array.from({ length: 6 }, (_, i) => ({
            id: null, name: `灵感 ${i + 1}`,
            genre: [["仙侠"], ["玄幻"], ["科幻"], ["悬疑"], ["言情"], ["历史"]][i],
            targetWordCount: 50000 + i * 22000,
            storyNodes: 4 + i * 3,
            updatedAt: new Date(Date.now() - i * 3 * 86400000).toISOString(),
          }))
    );
  }, [projects]);

  useEffect(() => {
    const mount = mountRef.current;
    if (!mount || list.length === 0) return;

    const scene = new THREE.Scene();
    scene.fog = new THREE.Fog(0x0a2a55, 20, 52);
    const camera = new THREE.PerspectiveCamera(50, 1, 0.1, 140);
    camera.position.set(0, 4, 16);

    const renderer = (() => {
      try {
        return new THREE.WebGLRenderer({ antialias: true, alpha: true });
      } catch (err) {
        console.warn("[PaperBoats] WebGL 不可用，3D 已降级（不影响下方作品区）：", err);
        return null;
      }
    })();
    if (!renderer) return;
    renderer.setPixelRatio(Math.min(window.devicePixelRatio, 1.5));
    renderer.setClearColor(0x0a2a55, 1);
    mount.appendChild(renderer.domElement);
    const cv = renderer.domElement;
    cv.style.width = "100%"; cv.style.height = "100%"; cv.style.display = "block";
    cv.style.cursor = "default";

    scene.add(new THREE.AmbientLight(0x9fb4e8, 1.4));
    scene.add(new THREE.HemisphereLight(0xbcd4ff, 0x2a3a55, 1.15));
    const moon = new THREE.DirectionalLight(0x8fb0ff, 0.85);
    moon.position.set(6, 12, 8); scene.add(moon);

    const lampPool: THREE.PointLight[] = [];
    for (let i = 0; i < LAMP_MAX; i++) {
      const pl = new THREE.PointLight(0xffffff, 0, 8, 2);
      pl.castShadow = false; scene.add(pl); lampPool.push(pl);
    }

    const seaMat = new THREE.ShaderMaterial({ uniforms: { uTime: { value: 0 } }, vertexShader: seaVert, fragmentShader: seaFrag });
    const sea = new THREE.Mesh(new THREE.PlaneGeometry(72, 46, 140, 90), seaMat);
    sea.rotation.x = -Math.PI / 2; scene.add(sea);

    // 静态星海：限制 3D 船数降低密度与卡顿；向日葵(phyllotaxis)分布均匀散开、互不重叠
    const MAX_BOATS = 12;
    const GOLDEN = Math.PI * (3 - Math.sqrt(5)); // ≈2.39996 黄金角
    const shown = list.slice(0, MAX_BOATS);
    const boats: Boat[] = [];
    shown.forEach((p, i) => {
      const type = boatTypeFor(p.genre);
      const hullColor = boatHullColor(type, i);
      const scale = clamp(0.95 + (p.targetWordCount ?? 60000) / 110000, 0.95, 1.9);
      const days = p.updatedAt ? (Date.now() - new Date(p.updatedAt).getTime()) / 86400000 : 4;
      const bright = clamp(1 - days / 30, 0.35, 1);
      const draft = TYPE_DRAFT[type];
      const tier = TYPE_TIER[type];

      const built = createBoat(type, hullColor);
      const group = built.group;
      group.userData = { index: i, id: p.id, name: p.name };

      const lampCore = new THREE.Mesh(new THREE.SphereGeometry(0.08, 12, 12), type === "mech" ? COLD_MAT : CORE_WARM);
      lampCore.position.copy(built.bowLocal); group.add(lampCore);

      group.scale.setScalar(scale);
      scene.add(group);

      // 静态布局：向日葵螺旋（半径随 sqrt(i) 增大、角度按黄金角递增）→ 天然均匀分散、不会聚堆
      // orbitSpeed=0 → 不再绕圈巡游；basePos 返回固定锚点，renderOnce 只随波浪轻浮、不水平移动
      const orbitR = 4.2 + Math.sqrt(i) * 1.7;
      const orbitPhase = i * GOLDEN;
      const orbitSpeed = 0;
      // 船头朝外（指向圆心反方向），静态摆放更有「停泊」感
      group.rotation.y = -orbitPhase;
      boats.push({
        id: p.id, name: p.name, type, hullColor, tier, group, bowLocal: built.bowLocal,
        scale, bright, bornAt: 0, landed: true, phase: Math.random() * Math.PI * 2,
        orbitR, orbitSpeed, orbitPhase, avoidX: 0, avoidZ: 0, draft, hullH: built.hullH,
      });
    });

    // 交互：拖拽旋转视角 · 滚轮缩放 · 点击纸船直接进入写作区
    const ray = new THREE.Raycaster();
    const mouse = new THREE.Vector2();
    let downX = 0, downY = 0;
    let dragging = false, lastX = 0, lastY = 0;
    let tYaw = 0, tPitch = 0.3, tRadius = 15;
    let cYaw = 0, cPitch = 0.3, cRadius = 15;
    const pickBoat = (e: PointerEvent): number | null => {
      const rect = cv.getBoundingClientRect();
      mouse.x = ((e.clientX - rect.left) / rect.width) * 2 - 1;
      mouse.y = -((e.clientY - rect.top) / rect.height) * 2 + 1;
      ray.setFromCamera(mouse, camera);
      const hits = ray.intersectObjects(boats.map((b) => b.group), true);
      if (!hits.length) return null;
      let o: THREE.Object3D | null = hits[0].object;
      while (o && o.userData.index === undefined) o = o.parent;
      return o ? (o.userData.index as number) : null;
    };
    const onMove = (e: PointerEvent) => {
      if (dragging) {
        tYaw -= (e.clientX - lastX) * 0.006;
        tPitch = clamp(tPitch + (e.clientY - lastY) * 0.004, 0.12, 1.1);
        lastX = e.clientX; lastY = e.clientY;
      }
      const idx = pickBoat(e);
      cv.style.cursor = idx != null ? "pointer" : (dragging ? "grabbing" : "grab");
      if (idx !== hoverIdxRef.current) {
        hoverIdxRef.current = idx;
        setHoverName(idx != null && boats[idx] ? boats[idx].name : null);
      }
    };
    const onDown = (e: PointerEvent) => { downX = e.clientX; downY = e.clientY; lastX = e.clientX; lastY = e.clientY; dragging = true; };
    const onUp = (e: PointerEvent) => {
      dragging = false;
      if (Math.hypot(e.clientX - downX, e.clientY - downY) > 6) return;
      const idx = pickBoat(e); if (idx == null) return;
      const p = boats[idx];
      if (!window.confirm(`你确认要进入《${p.name}》吗？`)) return;
      if (p.id) router.push(`/workspace/${p.id}`); else router.push("/explore");
    };
    const onWheel = (e: WheelEvent) => { e.preventDefault(); tRadius = clamp(tRadius * (1 + e.deltaY * 0.0012), 8, 30); };
    cv.addEventListener("pointermove", onMove);
    cv.addEventListener("pointerdown", onDown);
    cv.addEventListener("pointerup", onUp);
    cv.addEventListener("wheel", onWheel, { passive: false });

    const resize = () => {
      const w = mount.clientWidth, h = mount.clientHeight;
      if (!w || !h) return;
      renderer.setSize(w, h, false);
      camera.aspect = w / h; camera.updateProjectionMatrix();
    };
    resize();
    const ro = new ResizeObserver(resize);
    ro.observe(mount);

    const clock = new THREE.Clock();
    let raf = 0;
    let running = false;
    const lookTarget = new THREE.Vector3(0, 0.4, -1);

    // 静态星海基准位置：orbitSpeed=0 → ang 恒定，船水平不再移动；仅随波浪轻浮
    const basePos = (b: Boat, t: number): [number, number] => {
      const ang = b.orbitPhase + t * b.orbitSpeed;
      return [Math.cos(ang) * b.orbitR, Math.sin(ang) * b.orbitR * 0.85];
    };

    const renderOnce = () => {
      const t = clock.getElapsedTime();
      seaMat.uniforms.uTime.value = t;

      boats.forEach((b) => {
        const [bx, bz] = basePos(b, t);
        const px = bx + b.avoidX;
        const pz = bz + b.avoidZ;
        // 抬升船体：让吃水线落在船高下 1/3；静态停泊——水平固定，仅随波浪轻浮贴合水面
        const rise = (0.5 - b.draft) * b.hullH * b.scale;
        const y = seaH(px, pz, t) + rise;
        b.group.position.set(px, y, pz);
      });

      // 真灯分配：最近/最活跃 ≤8 艘
      boats.forEach((b) => b.group.updateMatrixWorld());
      const scored = boats.map((b, i) => ({ i, d: b.group.position.distanceTo(camera.position) - b.bright * 4 }));
      scored.sort((a, c) => a.d - c.d);
      const lit = new Set<number>();
      for (const s of scored) { if (lit.size >= LAMP_MAX) break; lit.add(s.i); }
      lampPool.forEach((pl, n) => {
        if (n < lit.size) {
          const b = boats[[...lit][n]];
          const wp = b.group.localToWorld(b.bowLocal.clone());
          pl.position.copy(wp);
          pl.color.setRGB(b.hullColor[0], b.hullColor[1], b.hullColor[2]);
          pl.intensity = b.bright * (1.5 + Math.sin(t * 2 + b.phase) * 0.25);
        } else pl.intensity = 0;
      });

      cYaw += (tYaw - cYaw) * 0.08;
      cPitch += (tPitch - cPitch) * 0.08;
      cRadius += (tRadius - cRadius) * 0.08;
      const cp = Math.cos(cPitch), sp = Math.sin(cPitch);
      camera.position.lerp(
        new THREE.Vector3(Math.sin(cYaw) * cp * cRadius, sp * cRadius + 1.8, Math.cos(cYaw) * cp * cRadius),
        0.12
      );
      lookTarget.lerp(new THREE.Vector3(0, 0.4, -1), 0.1);
      camera.lookAt(lookTarget);

      renderer.render(scene, camera);
    };

    const animate = () => { if (!running) return; renderOnce(); raf = requestAnimationFrame(animate); };
    const start = () => { if (running) return; running = true; raf = requestAnimationFrame(animate); };
    const stop = () => { running = false; cancelAnimationFrame(raf); };
    renderOnce();
    const onVis = () => { if (document.hidden) stop(); else start(); };
    document.addEventListener("visibilitychange", onVis);
    const io = new IntersectionObserver((es) => { if (es[0]?.isIntersecting) start(); else stop(); }, { rootMargin: "100px" });
    io.observe(mount);
    start();

    return () => {
      stop();
      document.removeEventListener("visibilitychange", onVis);
      io.disconnect();
      cancelAnimationFrame(raf);
      ro.disconnect();
      cv.removeEventListener("pointermove", onMove);
      cv.removeEventListener("pointerdown", onDown);
      cv.removeEventListener("pointerup", onUp);
      cv.removeEventListener("wheel", onWheel);
      // 释放每船克隆的几何/材质（共享模块材质保留）
      boats.forEach((b) => {
        b.group.traverse((o) => {
          const mesh = o as THREE.Mesh;
          if (mesh.geometry) mesh.geometry.dispose();
          const m = mesh.material as THREE.Material | THREE.Material[] | undefined;
          if (m) (Array.isArray(m) ? m : [m]).forEach((mm) => { if ((mm.userData as { perBoat?: boolean })?.perBoat) mm.dispose(); });
        });
      });
      renderer.dispose();
      if (cv.parentNode) cv.parentNode.removeChild(cv);
    };
  }, [list]);

  const openBoat = (p: PaperProject) => {
    if (!window.confirm(`你确认要进入《${p.name}》吗？`)) return;
    if (p.id) router.push(`/workspace/${p.id}`);
    else router.push("/explore");
  };

  return (
    <div className="relative w-full select-none">
      <div className="relative h-[440px] md:h-[520px] rounded-xl overflow-hidden">
        <div ref={mountRef} className="absolute inset-0" />
        {hoverName && (
          <div className="pointer-events-none absolute left-1/2 top-3 z-10 -translate-x-1/2 rounded-full border border-[var(--nv-border-3)] bg-[var(--nv-surface-3)]/90 px-3.5 py-1.5 text-xs text-[var(--nv-text-primary)] shadow-lg backdrop-blur-sm">
            《{hoverName}》
          </div>
        )}
        <div className="pointer-events-none absolute bottom-2 left-0 right-0 text-center text-[11px] text-[var(--nv-text-muted)] tracking-wide">
          星海静泊 · 拖拽旋转视角 · 滚轮缩放 · 点击纸船进入写作区
        </div>
      </div>

      <div className="mt-4">
        <div className="flex items-center gap-2 mb-2 px-1">
          <span className="w-1 h-3.5 rounded-full bg-[var(--nv-creative)]/70" />
          <span className="text-xs font-medium text-[var(--nv-text-tertiary)] tracking-wide">选择一本书</span>
        </div>
        <div className="flex gap-2 overflow-x-auto pb-1">
          {list.map((p, i) => {
            const tp = boatTypeFor(p.genre);
            const c = boatHullColor(tp, i);
            return (
              <button
                key={p.id ?? i}
                onClick={() => openBoat(p)}
                className="shrink-0 inline-flex items-center gap-2 rounded-xl border border-[var(--nv-border-2)] bg-transparent px-3.5 py-2 text-sm text-[var(--nv-text-tertiary)] transition-colors hover:border-[var(--nv-border-3)] hover:bg-[var(--nv-surface-2)] hover:text-[var(--nv-text-primary)]"
                title={`${p.name} · ${TYPE_POETIC[tp]}（${TYPE_NAMES[tp]}）· ${TIER_NAME[TYPE_TIER[tp]]} · 点击进入`}
              >
                <span
                  className="w-2 h-2 rounded-full"
                  style={{ backgroundColor: `rgb(${c[0] * 255},${c[1] * 255},${c[2] * 255})`, boxShadow: `0 0 8px rgb(${c[0] * 255},${c[1] * 255},${c[2] * 255})` }}
                />
                <span className="max-w-[140px] truncate" title={p.name}>{p.name}</span>
                <span className="text-[10px] text-[var(--nv-text-muted)] opacity-70">{TYPE_POETIC[tp]}</span>
              </button>
            );
          })}
        </div>
      </div>
    </div>
  );
}
