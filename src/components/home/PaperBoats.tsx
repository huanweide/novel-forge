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
  wupeng: "黑珍珠号", tower: "复仇女王号", sail: "飞翔的荷兰人", fishing: "航空母舰", dragon: "驱逐舰", mech: "核潜艇",
};
// 题材 → 名船映射（船型即语义）；未命中回退 wupeng（黑珍珠号）
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


// ─── 部件库（共享材质，按船型组合，不写新类） ──────────────────
// 纯色材质：模块顶层创建安全（不触 document），SSR 可用
// 六种现代名船的亮色涂装（用户验收：船太黑看不清 → 每种船一种高辨识亮色，深色细节保留）
const HULL_GOLD_MAT = new THREE.MeshStandardMaterial({ color: 0xc9a24e, roughness: 0.5, metalness: 0.45, side: THREE.DoubleSide }); // 黑珍珠号 · 亮金船体
const HULL_RED_MAT = new THREE.MeshStandardMaterial({ color: 0xa8433a, roughness: 0.55, metalness: 0.3, side: THREE.DoubleSide }); // 复仇女王号 · 猩红船体
const SAIL_BLACK_MAT = new THREE.MeshStandardMaterial({ color: 0x33333f, roughness: 0.5, metalness: 0.35, side: THREE.DoubleSide }); // 黑帆（保留名船特征，微反光不糊黑）
const GOLD_MAT = new THREE.MeshStandardMaterial({ color: 0xe6b54e, roughness: 0.3, metalness: 0.7 }); // 金饰（船艏像/艉楼/炮窗框）
const GHOST_MAT = new THREE.MeshStandardMaterial({ color: 0x3f9f8c, roughness: 0.6, metalness: 0.2, side: THREE.DoubleSide }); // 飞翔的荷兰人 · 幽绿青船体
const GHOST_SAIL_MAT = new THREE.MeshStandardMaterial({ color: 0xd6e8e4, roughness: 0.9, transparent: true, opacity: 0.75, side: THREE.DoubleSide }); // 破帆（亮白绿半透）
const GHOST_GLOW = new THREE.MeshBasicMaterial({ color: 0x5dffd0 }); // 荷兰人 幽绿发光
const DECK_MAT = new THREE.MeshStandardMaterial({ color: 0x9aabbf, roughness: 0.8, metalness: 0.1 }); // 航母甲板（浅灰蓝，弹射线可辨）
const HULL_GREY_MAT = new THREE.MeshStandardMaterial({ color: 0x6e88a8, roughness: 0.55, metalness: 0.35, side: THREE.DoubleSide }); // 军舰舰体（航母/驱逐舰 · 浅蓝灰）
const METAL_MAT = new THREE.MeshStandardMaterial({ color: 0x9fb0c0, roughness: 0.35, metalness: 0.7, side: THREE.DoubleSide }); // 核潜艇 · 亮银
const DARK_MAT = new THREE.MeshStandardMaterial({ color: 0x232c40, roughness: 0.6, metalness: 0.15, side: THREE.DoubleSide }); // 暗部细节（炮门/舰桥/缝隙，微亮不糊）
const COLD_MAT = new THREE.MeshBasicMaterial({ color: 0x6fd6ff }); // 冷蓝发光（点缀）
const CORE_WARM = new THREE.MeshBasicMaterial({ color: 0xfff2d8 }); // 暖白船头灯

// 纹理材质：桅杆木纹（贴图依赖 document，客户端惰性构建，SSR 安全）
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
let _woodMat: THREE.MeshStandardMaterial | null = null;
function getWoodMat(): THREE.MeshStandardMaterial { // 木料（桅杆）
  if (!_woodMat) _woodMat = new THREE.MeshStandardMaterial({ map: getWoodTex(), color: 0x4a4133, roughness: 0.85, metalness: 0.0 });
  return _woodMat;
}

// ─── 现代名船部件（实体几何，低模但特征鲜明） ────────────────
// 桅杆
function makeMast(len: number, r = 0.035): THREE.Mesh {
  return new THREE.Mesh(new THREE.CylinderGeometry(r, r * 1.3, len, 7), getWoodMat());
}
// 帆（中间微鼓）
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
function makeJet(): THREE.Mesh {
  const g = new THREE.Group();
  const body = new THREE.Mesh(new THREE.BoxGeometry(0.34, 0.05, 0.06), HULL_GREY_MAT);
  body.position.y = 0.03;
  g.add(body);
  const wing = new THREE.Mesh(new THREE.BoxGeometry(0.12, 0.015, 0.3), HULL_GREY_MAT);
  wing.position.y = 0.045;
  g.add(wing);
  const tail = new THREE.Mesh(new THREE.BoxGeometry(0.05, 0.06, 0.04), HULL_GREY_MAT);
  tail.position.set(-0.13, 0.06, 0);
  g.add(tail);
  const m = new THREE.Mesh(new THREE.BoxGeometry(0.34, 0.05, 0.06), HULL_GREY_MAT); // 容器
  m.add(g);
  return m;
}
// 舰炮（驱逐舰）
function makeTurret(): THREE.Group {
  const g = new THREE.Group();
  const base = new THREE.Mesh(new THREE.BoxGeometry(0.16, 0.08, 0.16), DARK_MAT);
  base.position.y = 0.05;
  g.add(base);
  const barrel = new THREE.Mesh(new THREE.CylinderGeometry(0.012, 0.012, 0.3, 6), DARK_MAT);
  barrel.rotation.z = Math.PI / 2; barrel.position.set(0.2, 0.09, 0);
  g.add(barrel);
  return g;
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
      new THREE.LineBasicMaterial({ color: new THREE.Color(col[0], col[1], col[2]), transparent: true, opacity: 0.65, blending: THREE.AdditiveBlending })
    );
    parent.add(e);
  };
  const lantern = (x: number, y: number, z: number): THREE.Vector3 => {
    const post = new THREE.Mesh(new THREE.CylinderGeometry(0.012, 0.012, 0.2, 5), DARK_MAT);
    post.position.set(x, y, z);
    group.add(post);
    return new THREE.Vector3(x, y + 0.13, z);
  };
  // 黑帆三桅（黑珍珠号 / 复仇女王号共用骨架；hullMat 决定船体亮色涂装）
  const rigBlack = (L: number, W: number, H: number, opt: { sheer?: number; bottomTaper?: number; gold?: boolean; hullMat?: THREE.Material } = {}) => {
    const hull = makeHull(L, W, H, { sheer: opt.sheer ?? 0.28, bottomTaper: opt.bottomTaper ?? 0.42, segsX: 12, segsZ: 5 });
    const body = new THREE.Mesh(hull, opt.hullMat ?? HULL_GOLD_MAT);
    group.add(body); addEdges(hull, color, body);
    const masts: Array<[number, number]> = [[-0.85, 1.6], [0.0, 1.9], [0.75, 1.4]];
    for (const [mx, mh] of masts) {
      const mast = makeMast(mh);
      mast.position.set(mx, 0.45 + mh / 2, 0);
      group.add(mast);
      const sail = makeSailPnl(0.9, mh * 0.72, SAIL_BLACK_MAT);
      sail.position.set(mx - 0.02, 0.45 + mh * 0.5, 0.01);
      group.add(sail);
    }
    const sternSail = makeSailPnl(0.75, 1.0, SAIL_BLACK_MAT);
    sternSail.rotation.y = 0.35; sternSail.position.set(0.95, 1.0, 0);
    group.add(sternSail);
    if (opt.gold) { // 金饰
      const bowOrn = new THREE.Mesh(new THREE.SphereGeometry(0.07, 8, 8), GOLD_MAT);
      bowOrn.position.set(L / 2 + 0.05, 0.42, 0);
      group.add(bowOrn);
      const sternCastle = new THREE.Mesh(new THREE.BoxGeometry(0.4, 0.3, 0.5), GOLD_MAT);
      sternCastle.position.set(-L / 2 + 0.2, 0.55, 0);
      group.add(sternCastle);
      for (const sz of [-1, 1]) for (let i = 0; i < 3; i++) { // 金框炮门
        const port = new THREE.Mesh(new THREE.BoxGeometry(0.06, 0.07, 0.03), GOLD_MAT);
        port.position.set(L / 2 - 0.35 - i * 0.45, 0.28, sz * (W / 2 + 0.01));
        group.add(port);
      }
    }
    return lantern(L / 2 + 0.05, 0.55, 0);
  };

  if (type === "wupeng") { // 黑珍珠号：亮金船体 + 黑帆 + 金饰 + 加勒比最快船
    bowLocal = rigBlack(2.6, 0.85, 0.75, { sheer: 0.3, bottomTaper: 0.4, gold: true, hullMat: HULL_GOLD_MAT });
  } else if (type === "tower") { // 复仇女王号：猩红船体 + 黑胡子旗舰黑帆 + 金饰 + 骷髅
    bowLocal = rigBlack(2.5, 0.95, 0.85, { sheer: 0.26, bottomTaper: 0.45, gold: true, hullMat: HULL_RED_MAT });
    const skull = new THREE.Mesh(new THREE.SphereGeometry(0.06, 8, 8), new THREE.MeshStandardMaterial({ color: 0xe8e4d8, roughness: 0.4 }));
    skull.position.set(-1.1, 1.15, 0);
    group.add(skull);
  } else if (type === "sail") { // 飞翔的荷兰人：幽灵船，青灰船体 + 破帆 + 幽绿光
    const hull = makeHull(2.6, 0.9, 0.8, { sheer: 0.35, bottomTaper: 0.4, segsX: 12, segsZ: 5 });
    const body = new THREE.Mesh(hull, GHOST_MAT);
    group.add(body); addEdges(hull, color, body);
    const gmasts: Array<[number, number]> = [[-0.85, 1.7], [0.0, 2.0], [0.75, 1.5]];
    for (const [mx, mh] of gmasts) {
      const mast = makeMast(mh);
      mast.position.set(mx, 0.5 + mh / 2, 0);
      group.add(mast);
      const sail = makeSailPnl(0.95, mh * 0.8, GHOST_SAIL_MAT);
      sail.position.set(mx - 0.02, 0.5 + mh * 0.55, 0.01);
      group.add(sail);
    }
    const tusk = new THREE.Mesh(new THREE.ConeGeometry(0.03, 0.5, 6), new THREE.MeshStandardMaterial({ color: 0xd8d4c8, roughness: 0.3 }));
    tusk.rotation.z = -Math.PI / 2; tusk.position.set(1.45, 0.55, 0);
    group.add(tusk);
    for (const sz of [-1, 1]) for (let i = 0; i < 4; i++) { // 幽绿舷灯
      const glow = new THREE.Mesh(new THREE.SphereGeometry(0.035, 6, 6), GHOST_GLOW);
      glow.position.set(1.0 - i * 0.55, 0.42, sz * 0.46);
      group.add(glow);
    }
    bowLocal = lantern(1.2, 0.6, 0);
  } else if (type === "fishing") { // 航空母舰：宽平甲板 + 右舷舰岛 + 斜角甲板 + 舰载机（子舰=作品）
    const hull = new THREE.Mesh(new THREE.BoxGeometry(3.4, 0.5, 1.25), HULL_GREY_MAT);
    hull.position.y = 0.1;
    group.add(hull);
    const deck = new THREE.Mesh(new THREE.BoxGeometry(3.3, 0.07, 1.05), DECK_MAT);
    deck.position.y = 0.4;
    group.add(deck);
    const island = new THREE.Mesh(new THREE.BoxGeometry(0.5, 0.55, 0.32), DARK_MAT);
    island.position.set(-0.7, 0.72, 0.4);
    group.add(island);
    const ant = new THREE.Mesh(new THREE.CylinderGeometry(0.008, 0.008, 0.5, 4), DARK_MAT);
    ant.position.set(-0.7, 1.05, 0.4);
    group.add(ant);
    const angled = new THREE.Mesh(new THREE.BoxGeometry(2.6, 0.015, 0.09), DARK_MAT); // 斜角甲板线
    angled.position.set(0.1, 0.44, -0.35); angled.rotation.y = 0.22;
    group.add(angled);
    const cats = new THREE.Mesh(new THREE.BoxGeometry(0.015, 0.015, 0.75), GHOST_SAIL_MAT); // 弹射线
    cats.position.set(0.55, 0.44, 0.3);
    group.add(cats);
    // 舰载机（子舰=作品，甲板上 3 架）
    const jets: Array<[number, number, number, number]> = [[0.7, 0.44, 0.32, 0.1], [-0.1, 0.44, 0.36, -0.12], [0.35, 0.44, -0.3, 0.25]];
    for (const [jx, jy, jz, jr] of jets) {
      const jet = makeJet();
      jet.position.set(jx, jy, jz); jet.rotation.y = jr;
      group.add(jet);
    }
    for (const sz of [-1, 1]) { // 舷台
      const sponson = new THREE.Mesh(new THREE.BoxGeometry(1.4, 0.06, 0.12), DARK_MAT);
      sponson.position.set(-0.3, 0.18, sz * 0.62);
      group.add(sponson);
    }
    bowLocal = lantern(1.55, 0.55, 0);
  } else if (type === "dragon") { // 驱逐舰：现代军舰，舰桥 + 主炮 + 导弹架 + 天线
    const hull = makeHull(2.8, 0.55, 0.45, { sheer: 0.06, bottomTaper: 0.6, segsX: 10, segsZ: 4 });
    const body = new THREE.Mesh(hull, HULL_GREY_MAT);
    group.add(body);
    const bridge = new THREE.Mesh(new THREE.BoxGeometry(0.42, 0.4, 0.34), DARK_MAT);
    bridge.position.set(-0.6, 0.42, 0);
    group.add(bridge);
    const radar = new THREE.Mesh(new THREE.BoxGeometry(0.14, 0.12, 0.14), DARK_MAT);
    radar.position.set(-0.6, 0.68, 0);
    group.add(radar);
    const gun = makeTurret();
    gun.position.set(0.7, 0.3, 0);
    group.add(gun);
    const launchers: Array<[number, number, number]> = [[0.15, 0.18, 0.5], [0.15, -0.18, -0.5]];
    for (const [mx, mz, mr] of launchers) { // 导弹发射架
      const launcher = new THREE.Mesh(new THREE.BoxGeometry(0.5, 0.05, 0.08), DARK_MAT);
      launcher.position.set(mx, 0.36, mz); launcher.rotation.y = mr;
      group.add(launcher);
    }
    const sternGun = makeTurret();
    sternGun.position.set(-1.2, 0.3, 0);
    group.add(sternGun);
    const ants: Array<[number, number]> = [[0.9, 0], [-0.2, 0.2], [0.4, -0.2]];
    for (const [ax, az] of ants) {
      const a = new THREE.Mesh(new THREE.CylinderGeometry(0.006, 0.006, 0.4, 4), DARK_MAT);
      a.position.set(ax, 0.5, az);
      group.add(a);
    }
    bowLocal = lantern(1.35, 0.45, 0);
  } else { // mech 核潜艇：圆柱艇身 + 围壳 + 潜望镜 + 螺旋桨
    const hull = new THREE.Mesh(new THREE.CylinderGeometry(0.28, 0.28, 2.4, 12), METAL_MAT);
    hull.rotation.z = Math.PI / 2;
    group.add(hull);
    const bow = new THREE.Mesh(new THREE.ConeGeometry(0.28, 0.45, 12), METAL_MAT);
    bow.rotation.z = -Math.PI / 2; bow.position.set(1.35, 0, 0);
    group.add(bow);
    const stern = new THREE.Mesh(new THREE.ConeGeometry(0.28, 0.35, 12), METAL_MAT);
    stern.rotation.z = Math.PI / 2; stern.position.set(-1.3, 0, 0);
    group.add(stern);
    const fin = new THREE.Mesh(new THREE.BoxGeometry(0.14, 0.22, 0.16), METAL_MAT); // 尾鳍
    fin.position.set(-1.15, 0, 0);
    group.add(fin);
    const prop = new THREE.Mesh(new THREE.BoxGeometry(0.06, 0.18, 0.06), DARK_MAT); // 螺旋桨
    prop.position.set(-1.5, 0, 0);
    group.add(prop);
    const sail = new THREE.Mesh(new THREE.BoxGeometry(0.5, 0.26, 0.2), DARK_MAT); // 围壳
    sail.position.set(0.15, 0.35, 0);
    group.add(sail);
    const periscope = new THREE.Mesh(new THREE.CylinderGeometry(0.008, 0.008, 0.3, 4), DARK_MAT);
    periscope.position.set(0.15, 0.56, 0);
    group.add(periscope);
    const pTip = new THREE.Mesh(new THREE.SphereGeometry(0.015, 6, 6), GHOST_GLOW);
    pTip.position.set(0.15, 0.7, 0);
    group.add(pTip);
    for (const sz of [-1, 1]) for (let i = 0; i < 2; i++) { // 侧舷绿灯
      const l = new THREE.Mesh(new THREE.SphereGeometry(0.025, 6, 6), GHOST_GLOW);
      l.position.set(0.5 + i * 0.7, 0.1, sz * 0.27);
      group.add(l);
    }
    bowLocal = lantern(1.2, 0.4, 0);
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
    scene.fog = new THREE.Fog(0x0a2a55, 18, 46); // 雾色与清除色一致（深海蓝），远景不糊黑
    const camera = new THREE.PerspectiveCamera(50, 1, 0.1, 120);
    camera.position.set(0, 3, 14);

    const renderer = (() => {
      try {
        return new THREE.WebGLRenderer({ antialias: true, alpha: true });
      } catch (err) {
        console.warn("[PaperBoats] WebGL 不可用，3D 已降级（不影响下方作品区）：", err);
        return null;
      }
    })();
    if (!renderer) return; // 3D 失败静默降级，绝不让整页组件树崩溃
    renderer.setPixelRatio(Math.min(window.devicePixelRatio, 1.75));
    renderer.setClearColor(0x0a2a55, 1); // 深海蓝背景（不再近黑，周边不糊黑）
    mount.appendChild(renderer.domElement);
    const cv = renderer.domElement;
    cv.style.width = "100%"; cv.style.height = "100%"; cv.style.display = "block";
    cv.style.cursor = "default";

    scene.add(new THREE.AmbientLight(0x9fb4e8, 1.4)); // 亮环境光：所有船体清晰可见（不再只亮 8 艘）
    scene.add(new THREE.HemisphereLight(0xbcd4ff, 0x2a3a55, 1.15)); // 天顶暖 + 海底冷的自然光
    const moon = new THREE.DirectionalLight(0x8fb0ff, 0.85);
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
