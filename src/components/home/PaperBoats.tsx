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

// ─── 题材 → 折痕透光色 ───────────────────────────────────────
const GENRE_COLORS: Record<string, [number, number, number]> = {
  仙侠: [0.35, 0.85, 0.80], 玄幻: [0.65, 0.45, 0.95], 武侠: [0.45, 0.80, 0.45],
  都市: [0.40, 0.65, 1.00], 科幻: [0.35, 0.60, 1.00], 悬疑: [0.95, 0.45, 0.50],
  推理: [0.95, 0.50, 0.45], 言情: [1.00, 0.60, 0.75], 爱情: [1.00, 0.60, 0.75],
  历史: [0.95, 0.75, 0.40], 奇幻: [0.55, 0.50, 0.98], 恐怖: [0.75, 0.35, 0.45],
};
const DEFAULT_COLOR: [number, number, number] = [0.45, 0.70, 1.00];
function genreColor(genre?: string[]): [number, number, number] {
  if (genre) for (const g of genre) if (GENRE_COLORS[g]) return GENRE_COLORS[g];
  return DEFAULT_COLOR;
}

const clamp = (v: number, a: number, b: number) => Math.max(a, Math.min(b, v));

// ─── 船型系统（BoatFactory，参数驱动，≤6 种几何） ──────────────
type BoatType = "wupeng" | "tower" | "sail" | "fishing" | "dragon" | "mech";
const TYPE_NAMES: Record<BoatType, string> = {
  wupeng: "乌篷船", tower: "楼船", sail: "帆船", fishing: "渔船", dragon: "龙舟", mech: "机关舟",
};
// 题材 → 船型映射（张雪峰语义）；未命中回退 wupeng（不新增第 7 种几何）
const GENRE_TO_TYPE: Record<string, BoatType> = {
  武侠: "wupeng", 言情: "wupeng", 爱情: "wupeng", 田园: "wupeng", 古典: "wupeng", 市井: "wupeng",
  仙侠: "tower", 玄幻: "tower", 历史: "tower", 奇幻: "tower",
  冒险: "sail", 西幻: "sail", 翻译: "sail", 成长: "sail",
  悬疑: "fishing", 灵异: "fishing", 恐怖: "fishing",
  科幻: "mech", 推理: "mech",
};
function boatTypeFor(genre?: string[]): BoatType {
  if (genre) for (const g of genre) if (GENRE_TO_TYPE[g]) return GENRE_TO_TYPE[g];
  return "wupeng";
}

// 双层波（CPU 与 GPU 同公式，保证船贴浪）
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
  // 漫画风格的海：亮蓝主色 + 亮天蓝边缘光
  vec3 deep = vec3(0.10, 0.30, 0.60);
  vec3 sheen = vec3(0.45, 0.70, 0.95);
  vec3 col = deep + sheen * fres * 1.1;
  // 起伏的深蓝水波
  float flow = fbm(vWP.xz*0.35 + vec2(uTime*0.03, uTime*0.02));
  col += vec3(0.12, 0.28, 0.50) * flow * 0.55;
  // 白色浪花线（漫画波浪白沫）
  float foam = smoothstep(0.62, 0.82, fbm(vWP.xz*1.6 + vec2(uTime*0.05, uTime*0.03)));
  col += vec3(1.0, 1.0, 1.0) * foam * 0.45;
  // 漫画同心波纹（扩散圆环）
  float rings = sin(length(vWP.xz)*7.0 - uTime*2.5);
  col += vec3(1.0) * smoothstep(0.88, 1.0, abs(rings)) * 0.08;
  gl_FragColor = vec4(col, 1.0);
}`;

// ─── 参数化船体（Box 形变：收分 + 舷弧 + V 型底） ───────────────
function makeHull(L: number, W: number, H: number, opt: {
  sheer?: number; keel?: number; bottomTaper?: number; segsX?: number; segsZ?: number;
} = {}): THREE.BufferGeometry {
  const { sheer = 0.18, keel = 0.16, bottomTaper = 0.42, segsX = 14, segsZ = 6 } = opt;
  const g = new THREE.BoxGeometry(L, H, W, segsX, 1, segsZ);
  const p = g.attributes.position as THREE.BufferAttribute;
  for (let i = 0; i < p.count; i++) {
    let x = p.getX(i), y = p.getY(i), z = p.getZ(i);
    const t = (x + L / 2) / L;                 // 0 船尾 .. 1 船头
    const wMul = Math.pow(Math.sin(Math.PI * t), 0.5); // 两端收尖、中段最宽
    z *= wMul;
    y += sheer * Math.pow(t, 3) + sheer * 0.32 * Math.pow(1 - t, 3); // 首尾上翘舷弧
    if (y < 0) {                                // V 型底
      const f = (y + H / 2) / H;               // 0 底 .. 0.5 中线
      z *= bottomTaper + (1 - bottomTaper) * f * 2;
    }
    if (y < 0 && Math.abs(z) < 0.06 * W) y -= keel * 0.4; // 龙骨微沉
    p.setXYZ(i, x, y, z);
  }
  g.computeVertexNormals();
  return g;
}

function makeNetTexture(): THREE.CanvasTexture {
  const c = document.createElement("canvas");
  c.width = c.height = 64;
  const x = c.getContext("2d")!;
  x.clearRect(0, 0, 64, 64);
  x.strokeStyle = "rgba(180,200,220,0.85)"; x.lineWidth = 1;
  for (let i = 0; i <= 64; i += 8) {
    x.beginPath(); x.moveTo(i, 0); x.lineTo(i, 64); x.stroke();
    x.beginPath(); x.moveTo(0, i); x.lineTo(64, i); x.stroke();
  }
  const t = new THREE.CanvasTexture(c); t.needsUpdate = true; return t;
}

// ─── 部件库（共享材质，按船型组合，不写新类） ──────────────────
// 纯色材质：模块顶层创建安全（不触 document），SSR 可用
const METAL_MAT = new THREE.MeshStandardMaterial({ color: 0x2a3340, flatShading: true, roughness: 0.4, metalness: 0.6, side: THREE.DoubleSide }); // 机关舟金属壳
const DARK_MAT = new THREE.MeshStandardMaterial({ color: 0x1a1f2b, roughness: 0.9, metalness: 0.0, side: THREE.DoubleSide }); // 暗部件（檐/窗/舷边/龙骨）
const COLD_MAT = new THREE.MeshBasicMaterial({ color: 0x6fd6ff }); // 冷蓝发光（机关舟/龙眼）
const FLAG_MAT = new THREE.MeshStandardMaterial({ color: 0x7a3a3a, roughness: 0.7, metalness: 0.0, side: THREE.DoubleSide }); // 低饱和墨红，楼船旗
const CORE_WARM = new THREE.MeshBasicMaterial({ color: 0xfff2d8 }); // 暖白船头灯（非机关舟）

// 带纹理材质：贴图依赖 document（canvas），仅在客户端（useEffect 内 createBoat）惰性构建，SSR 安全
let _woodTex: THREE.CanvasTexture | null = null;
function getWoodTex(): THREE.CanvasTexture { // 木纹：深棕底 + 深浅竖木纹
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
let _sailTex: THREE.CanvasTexture | null = null;
function getSailTex(): THREE.CanvasTexture { // 帆布纹：米白底 + 斜织细纹
  if (!_sailTex) {
    const c = document.createElement("canvas"); c.width = c.height = 64;
    const x = c.getContext("2d")!;
    x.fillStyle = "#e3e6ec"; x.fillRect(0, 0, 64, 64);
    x.strokeStyle = "rgba(140,146,160,0.26)"; x.lineWidth = 1;
    for (let i = -64; i < 64; i += 6) { x.beginPath(); x.moveTo(i, 0); x.lineTo(i + 64, 64); x.stroke(); }
    for (let i = -64; i < 64; i += 6) { x.beginPath(); x.moveTo(i, 64); x.lineTo(i + 64, 0); x.stroke(); }
    _sailTex = new THREE.CanvasTexture(c); _sailTex.needsUpdate = true;
  }
  return _sailTex;
}
let _bambooTex: THREE.CanvasTexture | null = null;
function getBambooTex(): THREE.CanvasTexture { // 竹篷纹：深色底 + 竖向竹篾
  if (!_bambooTex) {
    const c = document.createElement("canvas"); c.width = 64; c.height = 64;
    const x = c.getContext("2d")!;
    x.fillStyle = "#2b313d"; x.fillRect(0, 0, 64, 64);
    for (let i = 0; i < 64; i += 6) { x.fillStyle = "rgba(58,64,78,0.75)"; x.fillRect(i, 0, 2.5, 64); }
    _bambooTex = new THREE.CanvasTexture(c); _bambooTex.needsUpdate = true;
  }
  return _bambooTex;
}
let _hullMat: THREE.MeshStandardMaterial | null = null;
function getHullMat(): THREE.MeshStandardMaterial { // 船体：浅木色木纹（真实木船）
  if (!_hullMat) _hullMat = new THREE.MeshStandardMaterial({ map: getWoodTex(), color: 0x7d6b52, flatShading: true, roughness: 0.88, metalness: 0.0, side: THREE.DoubleSide });
  return _hullMat;
}
let _woodMat: THREE.MeshStandardMaterial | null = null;
function getWoodMat(): THREE.MeshStandardMaterial { // 木料：深木纹（桅/橹/凳/鼓）
  if (!_woodMat) _woodMat = new THREE.MeshStandardMaterial({ map: getWoodTex(), color: 0x4a4133, roughness: 0.85, metalness: 0.0 });
  return _woodMat;
}
let _sailMat: THREE.MeshStandardMaterial | null = null;
function getSailMat(): THREE.MeshStandardMaterial { // 帆：帆布纹 + 近不透
  if (!_sailMat) _sailMat = new THREE.MeshStandardMaterial({ map: getSailTex(), color: 0xe3e6ec, roughness: 0.9, metalness: 0.0, transparent: true, opacity: 0.97, side: THREE.DoubleSide });
  return _sailMat;
}
let _canopyMat: THREE.MeshStandardMaterial | null = null;
function getCanopyMat(): THREE.MeshStandardMaterial { // 篷：竹篾
  if (!_canopyMat) _canopyMat = new THREE.MeshStandardMaterial({ map: getBambooTex(), color: 0x2b313d, roughness: 0.88, metalness: 0.0, side: THREE.DoubleSide });
  return _canopyMat;
}
// 渔网材质（惰性，避免 SSR 报错）
let _netMat: THREE.MeshStandardMaterial | null = null;
function getNetMat(): THREE.MeshStandardMaterial {
  if (!_netMat) {
    _netMat = new THREE.MeshStandardMaterial({ map: makeNetTexture(), transparent: true, side: THREE.DoubleSide, roughness: 0.9 });
  }
  return _netMat;
}

// ─── 真实船部件（实体几何，带真实材质） ───────────────────────
// 半圆柱篷（轴沿 X，弧朝上）
function makeCanopy(r: number, len: number): THREE.Mesh {
  const geo = new THREE.CylinderGeometry(r, r, len, 16, 1, true, 0, Math.PI);
  const m = new THREE.Mesh(geo, getCanopyMat());
  m.rotateZ(Math.PI / 2);
  m.rotateX(-Math.PI / 2);
  return m;
}
// 受风帆（中间鼓起）
function makeSail(w: number, h: number): THREE.Mesh {
  const geo = new THREE.PlaneGeometry(w, h, 6, 6);
  const p = geo.attributes.position as THREE.BufferAttribute;
  for (let i = 0; i < p.count; i++) {
    const x = p.getX(i), y = p.getY(i);
    const belly = 0.28 * (1 - Math.pow((x / (w / 2)), 2)) * (1 - Math.pow((y / (h / 2)), 2));
    p.setZ(i, belly);
  }
  geo.computeVertexNormals();
  return new THREE.Mesh(geo, getSailMat());
}
// 楼船：多层甲板 + 飞檐（四角上翘）+ 暗窗 + 顶饰
function makeTower(levels: number, w: number): THREE.Group {
  const grp = new THREE.Group();
  let y = 0;
  const lh = 0.3;
  for (let i = 0; i < levels; i++) {
    const lw = w * (1 - i * 0.16);
    const floor = new THREE.Mesh(new THREE.BoxGeometry(lw, lh, lw * 0.7), getHullMat());
    floor.position.y = y + lh / 2;
    grp.add(floor);
    const eave = new THREE.Mesh(new THREE.BoxGeometry(lw * 1.18, 0.05, lw * 0.84), DARK_MAT);
    eave.position.y = y + lh + 0.02;
    grp.add(eave);
    const cw = lw * 0.5;
    for (const sx of [-1, 1]) for (const sz of [-1, 1]) { // 飞檐四角上翘
      const tip = new THREE.Mesh(new THREE.BoxGeometry(0.12, 0.04, 0.12), DARK_MAT);
      tip.position.set(sx * cw, y + lh + 0.06, sz * cw * 0.7);
      tip.rotation.z = sx * 0.5; tip.rotation.x = sz * 0.5;
      grp.add(tip);
    }
    for (const sx of [-1, 1]) { // 正面暗窗
      const win = new THREE.Mesh(new THREE.BoxGeometry(0.12, 0.14, 0.04), DARK_MAT);
      win.position.set(sx * lw * 0.28, y + lh / 2, lw * 0.35 + 0.01);
      grp.add(win);
    }
    y += lh + 0.06;
  }
  const finial = new THREE.Mesh(new THREE.ConeGeometry(0.08, 0.22, 6), getWoodMat());
  finial.position.y = y + 0.1;
  grp.add(finial);
  return grp;
}
// 龙首：锥头 + 下颌 + 双眼 + 角 + 鬃毛
function makeDragonHead(): THREE.Group {
  const grp = new THREE.Group();
  const head = new THREE.Mesh(new THREE.ConeGeometry(0.16, 0.5, 6), getHullMat());
  head.rotation.z = -Math.PI / 2; head.position.set(0.25, 0.1, 0);
  grp.add(head);
  const jaw = new THREE.Mesh(new THREE.BoxGeometry(0.22, 0.08, 0.14), getHullMat());
  jaw.position.set(0.42, -0.02, 0); jaw.rotation.z = -0.2;
  grp.add(jaw);
  const eye = new THREE.Mesh(new THREE.SphereGeometry(0.04, 8, 8), COLD_MAT);
  eye.position.set(0.34, 0.16, 0.1); grp.add(eye);
  const eye2 = eye.clone(); eye2.position.z = -0.1; grp.add(eye2);
  const horn = new THREE.Mesh(new THREE.ConeGeometry(0.05, 0.3, 5), getWoodMat());
  horn.position.set(0.2, 0.34, 0); horn.rotation.z = 0.5;
  grp.add(horn);
  for (let i = 0; i < 4; i++) { // 鬃毛
    const m = new THREE.Mesh(new THREE.ConeGeometry(0.03, 0.18, 4), getWoodMat());
    m.position.set(0.1 - i * 0.07, 0.26 + i * 0.02, 0); m.rotation.z = 0.3;
    grp.add(m);
  }
  return grp;
}

interface BuiltBoat { group: THREE.Group; bowLocal: THREE.Vector3; }

// 工厂：按类型拼装真实船（船头朝 +X）。color = 题材色，仅作折痕/帆的低饱和晕染。
// 六种真实船型：乌篷/楼船/帆船/渔船/龙舟/机关舟。
function createBoat(type: BoatType, color: [number, number, number]): BuiltBoat {
  const group = new THREE.Group();
  let bowLocal: THREE.Vector3;
  const addEdges = (geo: THREE.BufferGeometry, col: [number, number, number], parent: THREE.Object3D) => {
    const e = new THREE.LineSegments(
      new THREE.EdgesGeometry(geo, 22),
      new THREE.LineBasicMaterial({ color: new THREE.Color(col[0], col[1], col[2]), transparent: true, opacity: 0.6, blending: THREE.AdditiveBlending })
    );
    parent.add(e);
  };
  // 船头灯柱：给真灯一个"灯座"，让光影有承接（费曼：灯亮则船身受光）
  const lantern = (x: number, y: number, z: number): THREE.Vector3 => {
    const post = new THREE.Mesh(new THREE.CylinderGeometry(0.015, 0.015, 0.22, 5), DARK_MAT);
    post.position.set(x, y, z);
    group.add(post);
    return new THREE.Vector3(x, y + 0.14, z);
  };

  if (type === "wupeng") {
    const hull = makeHull(2.0, 0.8, 0.5, { sheer: 0.22, bottomTaper: 0.4 });
    const body = new THREE.Mesh(hull, getHullMat());
    group.add(body); addEdges(hull, color, body);
    const canopy = makeCanopy(0.42, 1.1);
    canopy.position.set(-0.1, 0.32, 0);
    group.add(canopy);
    const ridge = new THREE.Mesh(new THREE.BoxGeometry(1.1, 0.03, 0.06), getCanopyMat()); // 篷脊
    ridge.position.set(-0.1, 0.74, 0);
    group.add(ridge);
    const oar = new THREE.Mesh(new THREE.CylinderGeometry(0.025, 0.02, 1.3, 6), getWoodMat()); // 长橹拖尾
    oar.rotation.z = Math.PI / 2.2; oar.position.set(-1.05, 0.05, 0.3);
    group.add(oar);
    const blade = new THREE.Mesh(new THREE.BoxGeometry(0.06, 0.24, 0.04), getWoodMat());
    blade.position.set(-1.68, 0.02, 0.3); blade.rotation.z = 0.4;
    group.add(blade);
    bowLocal = lantern(0.9, 0.45, 0);
  } else if (type === "tower") {
    const hull = makeHull(2.4, 1.1, 0.9, { sheer: 0.14, bottomTaper: 0.5 });
    const body = new THREE.Mesh(hull, getHullMat());
    group.add(body); addEdges(hull, color, body);
    const gunwale = new THREE.Mesh(new THREE.BoxGeometry(2.35, 0.06, 1.12), DARK_MAT);
    gunwale.position.y = 0.46;
    group.add(gunwale);
    const tower = makeTower(3, 1.0);
    tower.position.set(-0.1, 0.5, 0);
    group.add(tower);
    const pole = new THREE.Mesh(new THREE.CylinderGeometry(0.02, 0.02, 0.5, 5), getWoodMat());
    pole.position.set(0.2, 0.5 + 3 * 0.36 + 0.45, 0);
    group.add(pole);
    const flag = new THREE.Mesh(new THREE.PlaneGeometry(0.4, 0.25), FLAG_MAT);
    flag.position.set(0.42, 0.5 + 3 * 0.36 + 0.6, 0);
    group.add(flag);
    bowLocal = lantern(1.1, 0.62, 0);
  } else if (type === "sail") {
    const hull = makeHull(2.2, 0.7, 0.45, { sheer: 0.3, bottomTaper: 0.4 });
    const body = new THREE.Mesh(hull, getHullMat());
    group.add(body); addEdges(hull, color, body);
    const mast = new THREE.Mesh(new THREE.CylinderGeometry(0.04, 0.05, 1.6, 8), getWoodMat());
    mast.position.set(0.1, 0.25 + 0.8, 0);
    group.add(mast);
    const sail = makeSail(1.1, 1.4);
    sail.position.set(-0.1, 0.25 + 0.75, 0.02);
    group.add(sail); addEdges(sail.geometry, color, sail);
    const sail2 = makeSail(0.7, 0.7);
    sail2.position.set(0.6, 0.25 + 0.45, 0.02);
    group.add(sail2); addEdges(sail2.geometry, color, sail2);
    const boom = new THREE.Mesh(new THREE.CylinderGeometry(0.02, 0.02, 1.0, 6), getWoodMat());
    boom.rotation.z = Math.PI / 2; boom.position.set(-0.1, 0.25 + 0.08, 0.02);
    group.add(boom);
    const top = new THREE.Vector3(0.1, 0.25 + 1.55, 0); // 桅索：让桅"长"在船上
    for (const [dx, dz] of [[0.9, 0], [-1.0, 0], [0, 0.34], [0, -0.34]] as const) {
      const b = new THREE.Vector3(0.1 + dx, 0.32, dz);
      const len = top.distanceTo(b);
      const rig = new THREE.Mesh(new THREE.CylinderGeometry(0.01, 0.01, len, 4), DARK_MAT);
      rig.position.copy(top.clone().lerp(b, 0.5));
      rig.quaternion.setFromUnitVectors(new THREE.Vector3(0, 1, 0), b.clone().sub(top).normalize());
      group.add(rig);
    }
    bowLocal = lantern(1.0, 0.45, 0);
  } else if (type === "fishing") {
    const hull = makeHull(1.9, 0.72, 0.5, { sheer: 0.2, bottomTaper: 0.42 });
    const body = new THREE.Mesh(hull, getHullMat());
    group.add(body); addEdges(hull, color, body);
    const derrick = new THREE.Mesh(new THREE.CylinderGeometry(0.025, 0.03, 1.1, 6), getWoodMat());
    derrick.rotation.z = Math.PI / 2.6; derrick.position.set(0.7, 0.55, 0);
    group.add(derrick);
    const rope = new THREE.Mesh(new THREE.TorusGeometry(0.12, 0.03, 6, 12), getWoodMat());
    rope.position.set(0.7, 0.3, 0);
    group.add(rope);
    const net = new THREE.Mesh(new THREE.PlaneGeometry(0.8, 0.7, 5, 5), getNetMat());
    const np = net.geometry.attributes.position as THREE.BufferAttribute;
    for (let i = 0; i < np.count; i++) { const y = np.getY(i); if (y < 0) np.setY(i, y - 0.25 * (1 + y / 0.35)); }
    net.position.set(0.55, 0.15, 0.2);
    group.add(net);
    const cabin = new THREE.Mesh(new THREE.BoxGeometry(0.45, 0.3, 0.4), DARK_MAT);
    cabin.position.set(-0.55, 0.4, 0);
    group.add(cabin);
    const hold = new THREE.Mesh(new THREE.BoxGeometry(0.4, 0.18, 0.4), getHullMat());
    hold.position.set(-0.1, 0.34, 0);
    group.add(hold);
    bowLocal = lantern(0.9, 0.45, 0);
  } else if (type === "dragon") {
    const hull = makeHull(3.2, 0.5, 0.4, { sheer: 0.5, bottomTaper: 0.35 });
    const body = new THREE.Mesh(hull, getHullMat());
    group.add(body); addEdges(hull, color, body);
    const head = makeDragonHead();
    head.position.set(1.5, 0.2, 0);
    group.add(head);
    for (let i = 0; i < 8; i++) { // 横坐板
      const bench = new THREE.Mesh(new THREE.BoxGeometry(0.04, 0.06, 0.36), getWoodMat());
      bench.position.set(-1.4 + i * 0.4, 0.28, 0);
      group.add(bench);
    }
    const drum = new THREE.Mesh(new THREE.CylinderGeometry(0.16, 0.16, 0.18, 12), getWoodMat()); // 中央鼓
    drum.position.set(-0.1, 0.45, 0);
    group.add(drum);
    const drumTop = new THREE.Mesh(new THREE.CylinderGeometry(0.17, 0.17, 0.03, 12), DARK_MAT);
    drumTop.position.set(-0.1, 0.55, 0);
    group.add(drumTop);
    const tail = new THREE.Mesh(new THREE.ConeGeometry(0.14, 0.4, 5), getHullMat()); // 尾鳍上翘
    tail.position.set(-1.55, 0.3, 0); tail.rotation.z = Math.PI / 2.4;
    group.add(tail);
    bowLocal = lantern(1.45, 0.4, 0);
  } else { // mech 机关舟
    const hull = makeHull(2.0, 0.8, 0.5, { sheer: 0.1, bottomTaper: 0.55, segsX: 8, segsZ: 4 });
    const body = new THREE.Mesh(hull, METAL_MAT);
    group.add(body);
    const seams = new THREE.LineSegments(new THREE.EdgesGeometry(hull, 18), new THREE.LineBasicMaterial({ color: 0x6fd6ff, transparent: true, opacity: 0.9, blending: THREE.AdditiveBlending }));
    group.add(seams);
    for (const sz of [-1, 1]) { // 侧鳍
      const fin = new THREE.Mesh(new THREE.BoxGeometry(0.4, 0.04, 0.18), METAL_MAT);
      fin.position.set(-0.3, 0.0, sz * 0.45); fin.rotation.y = sz * 0.2;
      group.add(fin);
    }
    const stern = new THREE.Mesh(new THREE.ConeGeometry(0.18, 0.4, 8), METAL_MAT);
    stern.rotation.z = -Math.PI / 2; stern.position.set(-1.0, 0.1, 0);
    group.add(stern);
    const thruster = new THREE.Mesh(new THREE.SphereGeometry(0.1, 10, 10), COLD_MAT);
    thruster.position.set(-1.15, 0.1, 0);
    group.add(thruster);
    const core = new THREE.Mesh(new THREE.SphereGeometry(0.08, 10, 10), COLD_MAT);
    core.position.set(0.4, 0.2, 0);
    group.add(core);
    const ant = new THREE.Mesh(new THREE.CylinderGeometry(0.01, 0.01, 0.5, 4), METAL_MAT);
    ant.position.set(0.5, 0.5, 0);
    group.add(ant);
    const antTip = new THREE.Mesh(new THREE.SphereGeometry(0.03, 8, 8), COLD_MAT);
    antTip.position.set(0.5, 0.75, 0);
    group.add(antTip);
    bowLocal = lantern(0.9, 0.45, 0);
  }

  return { group, bowLocal };
}

interface Boat {
  id: string | null;
  name: string;
  type: BoatType;
  color: [number, number, number];
  group: THREE.Group;
  bowLocal: THREE.Vector3;
  baseX: number;
  baseZ: number;
  scale: number;
  bright: number;
  bornAt: number;
  landed: boolean;
  landAt?: number;
  phase: number;
}

const LAMP_MAX = 8; // 真 PointLight 全局上限（马斯克/芒格铁律）

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
    scene.fog = new THREE.Fog(0x05070f, 18, 46);
    const camera = new THREE.PerspectiveCamera(50, 1, 0.1, 120);
    camera.position.set(0, 3, 14);

    const renderer = new THREE.WebGLRenderer({ antialias: true, alpha: true });
    renderer.setPixelRatio(Math.min(window.devicePixelRatio, 1.75));
    renderer.setClearColor(0x05070f, 1);
    mount.appendChild(renderer.domElement);
    const cv = renderer.domElement;
    cv.style.width = "100%"; cv.style.height = "100%"; cv.style.display = "block";
    cv.style.cursor = "default";

    scene.add(new THREE.AmbientLight(0x2a3860, 0.9));
    const moon = new THREE.DirectionalLight(0x8fb0ff, 0.5);
    moon.position.set(6, 12, 8);
    scene.add(moon);

    // 真灯池（≤8）
    const lampPool: THREE.PointLight[] = [];
    for (let i = 0; i < LAMP_MAX; i++) {
      const pl = new THREE.PointLight(0xffffff, 0, 7, 2);
      pl.castShadow = false;
      scene.add(pl); lampPool.push(pl);
    }

    // 墨海
    const seaMat = new THREE.ShaderMaterial({ uniforms: { uTime: { value: 0 } }, vertexShader: seaVert, fragmentShader: seaFrag });
    const sea = new THREE.Mesh(new THREE.PlaneGeometry(64, 40, 130, 80), seaMat);
    sea.rotation.x = -Math.PI / 2;
    scene.add(sea);

    const boats: Boat[] = [];
    const N = list.length;
    list.forEach((p, i) => {
      const color = genreColor(p.genre);
      const type = boatTypeFor(p.genre);
      const scale = clamp(0.72 + (p.targetWordCount ?? 60000) / 160000, 0.72, 1.5);
      const days = p.updatedAt ? (Date.now() - new Date(p.updatedAt).getTime()) / 86400000 : 4;
      const bright = clamp(1 - days / 30, 0.35, 1);
      const baseX = N > 1 ? -11 + (22 / (N - 1)) * i : 0;
      const baseZ = Math.sin(i * 1.3) * 3.2 - 1;

      const built = createBoat(type, color);
      const group = built.group;
      group.userData = { index: i, id: p.id, name: p.name };

      // 船头发光球（诚实光源，非加性光晕）
      const lampCore = new THREE.Mesh(new THREE.SphereGeometry(0.07, 12, 12), type === "mech" ? COLD_MAT : CORE_WARM);
      lampCore.position.copy(built.bowLocal);
      group.add(lampCore);

      group.scale.setScalar(scale);
      scene.add(group);

      boats.push({ id: p.id, name: p.name, type, color, group, bowLocal: built.bowLocal, baseX, baseZ, scale, bright, bornAt: i * 0.35, landed: false, phase: Math.random() * Math.PI * 2 });
    });

    // 交互：拖拽旋转视角 · 滚轮缩放 · 点击纸船直接进入写作区
    const ray = new THREE.Raycaster();
    const mouse = new THREE.Vector2();
    let downX = 0, downY = 0;
    let dragging = false, lastX = 0, lastY = 0;
    // 相机目标（拖拽/滚轮改目标，渲染循环缓动）
    let tYaw = 0, tPitch = 0.24, tRadius = 13;
    let cYaw = 0, cPitch = 0.24, cRadius = 13;
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
    const onDown = (e: PointerEvent) => {
      downX = e.clientX; downY = e.clientY;
      lastX = e.clientX; lastY = e.clientY;
      dragging = true;
    };
    const onUp = (e: PointerEvent) => {
      dragging = false;
      if (Math.hypot(e.clientX - downX, e.clientY - downY) > 6) return; // 拖拽不算点击
      const idx = pickBoat(e);
      if (idx == null) return;
      const p = boats[idx];
      if (!window.confirm(`你确认要进入《${p.name}》吗？`)) return;
      if (p.id) router.push(`/workspace/${p.id}`);
      else router.push("/explore");
    };
    const onWheel = (e: WheelEvent) => {
      e.preventDefault();
      tRadius = clamp(tRadius * (1 + e.deltaY * 0.0012), 6, 26);
    };
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
    const lookTarget = new THREE.Vector3(0, 0.3, -1);

    const renderOnce = () => {
      const t = clock.getElapsedTime();
      seaMat.uniforms.uTime.value = t;

      boats.forEach((b) => {
        let y;
        if (!b.landed) {
          const p = clamp((t - b.bornAt) / 1.2, 0, 1);
          const ease = 1 - Math.pow(1 - p, 3);
          y = THREE.MathUtils.lerp(12, seaH(b.baseX, b.baseZ, t), ease); // 从上方掉落
          if (p >= 1) { b.landed = true; b.landAt = t; }
        } else {
          y = seaH(b.baseX, b.baseZ, t);
          if (b.landAt != null) {
            const dt = t - b.landAt;
            if (dt < 0.6) y += Math.max(0, Math.sin(dt * 9)) * 0.12 * (1 - dt / 0.6); // 落水扑通
          }
        }
        b.group.position.set(b.baseX, y, b.baseZ);
        b.group.rotation.z = Math.sin(t * 0.8 + b.phase) * 0.1;
        b.group.rotation.x = Math.cos(t * 0.6 + b.phase) * 0.07;
        b.group.scale.setScalar(b.scale);
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
          pl.color.setRGB(b.color[0], b.color[1], b.color[2]);
          pl.intensity = b.bright * (1.5 + Math.sin(t * 2 + b.phase) * 0.25);
        } else {
          pl.intensity = 0;
        }
      });

      // 相机：拖拽旋转 + 滚轮缩放（缓动跟随目标，reduced-motion 下同样可用但不自动漂移）
      cYaw += (tYaw - cYaw) * 0.08;
      cPitch += (tPitch - cPitch) * 0.08;
      cRadius += (tRadius - cRadius) * 0.08;
      const cp = Math.cos(cPitch), sp = Math.sin(cPitch);
      camera.position.lerp(
        new THREE.Vector3(Math.sin(cYaw) * cp * cRadius, sp * cRadius + 1.6, Math.cos(cYaw) * cp * cRadius),
        0.12
      );
      lookTarget.lerp(new THREE.Vector3(0, 0.3, -1), 0.1);
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
      <div className="relative h-[420px] md:h-[480px] rounded-xl overflow-hidden">
        <div ref={mountRef} className="absolute inset-0" />
        {hoverName && (
          <div className="pointer-events-none absolute left-1/2 top-3 z-10 -translate-x-1/2 rounded-full border border-[var(--nv-border-3)] bg-[var(--nv-surface-3)]/90 px-3.5 py-1.5 text-xs text-[var(--nv-text-primary)] shadow-lg backdrop-blur-sm">
            《{hoverName}》
          </div>
        )}
        <div className="pointer-events-none absolute bottom-2 left-0 right-0 text-center text-[11px] text-[var(--nv-text-muted)] tracking-wide">
          点击纸船进入写作区 · 拖拽旋转视角 · 滚轮缩放 · 下方书栏点击直达
        </div>
      </div>

      <div className="mt-4">
        <div className="flex items-center gap-2 mb-2 px-1">
          <span className="w-1 h-3.5 rounded-full bg-[var(--nv-creative)]/70" />
          <span className="text-xs font-medium text-[var(--nv-text-tertiary)] tracking-wide">选择一本书</span>
        </div>
        <div className="flex gap-2 overflow-x-auto pb-1">
          {list.map((p, i) => {
            const c = genreColor(p.genre);
            const tp = boatTypeFor(p.genre);
            return (
              <button
                key={p.id ?? i}
                onClick={() => openBoat(p)}
                className="shrink-0 inline-flex items-center gap-2 rounded-xl border border-[var(--nv-border-2)] bg-transparent px-3.5 py-2 text-sm text-[var(--nv-text-tertiary)] transition-colors hover:border-[var(--nv-border-3)] hover:bg-[var(--nv-surface-2)] hover:text-[var(--nv-text-primary)]"
                title={`${p.name} · ${TYPE_NAMES[tp]} · 点击进入`}
              >
                <span
                  className="w-2 h-2 rounded-full"
                  style={{ backgroundColor: `rgb(${c[0] * 255},${c[1] * 255},${c[2] * 255})`, boxShadow: `0 0 8px rgb(${c[0] * 255},${c[1] * 255},${c[2] * 255})` }}
                />
                <span className="max-w-[140px] truncate">{p.name}</span>
                <span className="text-[10px] text-[var(--nv-text-muted)] opacity-70">{TYPE_NAMES[tp]}</span>
              </button>
            );
          })}
        </div>
      </div>
    </div>
  );
}
