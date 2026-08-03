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
  wupeng: "经典纸船", tower: "塔式纸船", sail: "双帆纸船", fishing: "平筏纸船", dragon: "长龙纸船", mech: "尖角纸船",
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
const COLD_MAT = new THREE.MeshBasicMaterial({ color: 0x6fd6ff }); // 冷蓝发光（机关舟/天线）
const CORE_WARM = new THREE.MeshBasicMaterial({ color: 0xfff2d8 }); // 暖白船头灯（非机关舟）

// 带纹理材质：贴图依赖 document（canvas），仅在客户端（useEffect 内 createBoat）惰性构建，SSR 安全
let _paperTex: THREE.CanvasTexture | null = null;
function getPaperTex(): THREE.CanvasTexture { // 宣纸纹：米白底 + 极淡噪点
  if (!_paperTex) {
    const c = document.createElement("canvas"); c.width = c.height = 128;
    const x = c.getContext("2d")!;
    x.fillStyle = "#e9e7dd"; x.fillRect(0, 0, 128, 128);
    for (let i = 0; i < 1100; i++) {
      x.fillStyle = `rgba(96,88,72,${0.03 + Math.random() * 0.05})`;
      x.fillRect(Math.random() * 128, Math.random() * 128, 1.4, 1.4);
    }
    _paperTex = new THREE.CanvasTexture(c); _paperTex.needsUpdate = true;
  }
  return _paperTex;
}
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
let _hullMat: THREE.MeshStandardMaterial | null = null;
function getHullMat(): THREE.MeshStandardMaterial { // 船体：宣纸纹 + 米白
  if (!_hullMat) _hullMat = new THREE.MeshStandardMaterial({ map: getPaperTex(), color: 0xe9e7dd, flatShading: true, roughness: 0.92, metalness: 0.0, side: THREE.DoubleSide });
  return _hullMat;
}
let _woodMat: THREE.MeshStandardMaterial | null = null;
function getWoodMat(): THREE.MeshStandardMaterial { // 木料：木纹
  if (!_woodMat) _woodMat = new THREE.MeshStandardMaterial({ map: getWoodTex(), color: 0x4a4133, roughness: 0.85, metalness: 0.0 });
  return _woodMat;
}
let _sailMat: THREE.MeshStandardMaterial | null = null;
function getSailMat(): THREE.MeshStandardMaterial { // 帆：帆布纹 + 近不透
  if (!_sailMat) _sailMat = new THREE.MeshStandardMaterial({ map: getSailTex(), color: 0xe3e6ec, roughness: 0.9, metalness: 0.0, transparent: true, opacity: 0.97, side: THREE.DoubleSide });
  return _sailMat;
}
// 渔网材质（惰性，避免 SSR 报错）
let _netMat: THREE.MeshStandardMaterial | null = null;
function getNetMat(): THREE.MeshStandardMaterial {
  if (!_netMat) {
    _netMat = new THREE.MeshStandardMaterial({ map: makeNetTexture(), transparent: true, side: THREE.DoubleSide, roughness: 0.9 });
  }
  return _netMat;
}

// ─── 折纸部件（一张纸折出来的，薄、平面、棱角分明） ───────────
// 纸板：一块双面薄纸板
function paperBoard(w: number, h: number, opts: { rotX?: number; rotY?: number; rotZ?: number; x?: number; y?: number; z?: number; mat?: THREE.Material } = {}): THREE.Mesh {
  const m = new THREE.Mesh(new THREE.PlaneGeometry(w, h), opts.mat ?? getHullMat());
  if (opts.rotX) m.rotation.x = opts.rotX;
  if (opts.rotY) m.rotation.y = opts.rotY;
  if (opts.rotZ) m.rotation.z = opts.rotZ;
  m.position.set(opts.x ?? 0, opts.y ?? 0, opts.z ?? 0);
  return m;
}
// 纸杆：卷成细杆的纸（桅/桨/天线）
function paperStick(len: number, r = 0.028): THREE.Mesh {
  return new THREE.Mesh(new THREE.CylinderGeometry(r, r, len, 5), getWoodMat());
}
// 折纸棚：两片纸板对折成 A 形
function paperTent(w: number, h: number): THREE.Group {
  const g = new THREE.Group();
  g.add(paperBoard(w, h, { rotZ: -0.55, y: h / 2 }));
  g.add(paperBoard(w, h, { rotZ: 0.55, y: h / 2 }));
  return g;
}
// 三角纸帆：一片斜置的纸
function paperSail(w: number, h: number, tilt: number): THREE.Mesh {
  const m = new THREE.Mesh(new THREE.PlaneGeometry(w, h), getSailMat());
  m.rotation.z = tilt;
  return m;
}

interface BuiltBoat { group: THREE.Group; bowLocal: THREE.Vector3; }

// 工厂：按类型拼装折纸船（船头朝 +X）。color = 题材色，仅作折痕线的晕染。
// 六种折法，张张都是"一张纸折出来的船"：经典/塔式/双帆/平筏/长龙/尖角。
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
  // 船头灯柱：给真灯一个"灯座"，让光影有承接（费曼：灯亮则船身受光）
  const lantern = (x: number, y: number, z: number): THREE.Vector3 => {
    const post = paperStick(0.22, 0.014);
    post.position.set(x, y, z);
    group.add(post);
    return new THREE.Vector3(x, y + 0.14, z);
  };
  const board = paperBoard; // 短别名

  if (type === "wupeng") { // 经典纸船：V 形船身 + 中央纸棚 + 首尾纸角上折
    const hull = makeHull(2.0, 0.8, 0.5, { sheer: 0.28, bottomTaper: 0.4, segsX: 8, segsZ: 4 });
    const body = new THREE.Mesh(hull, getHullMat());
    group.add(body); addEdges(hull, color, body);
    const tent = paperTent(0.9, 0.42);
    tent.position.set(-0.1, 0.3, 0);
    group.add(tent);
    group.add(board(0.34, 0.3, { rotX: -0.7, x: 0.92, y: 0.28 }));   // 船头纸角
    group.add(board(0.34, 0.3, { rotX: 0.7, x: -0.92, y: 0.28 }));  // 船尾纸角
    bowLocal = lantern(0.9, 0.45, 0);
  } else if (type === "tower") { // 塔式纸船：两层叠纸台 + 顶层纸旗
    const hull = makeHull(2.2, 0.95, 0.55, { sheer: 0.2, bottomTaper: 0.5, segsX: 8, segsZ: 4 });
    const body = new THREE.Mesh(hull, getHullMat());
    group.add(body); addEdges(hull, color, body);
    group.add(board(1.1, 0.62, { y: 0.42 }));   // 一层纸台
    group.add(board(0.8, 0.44, { y: 0.78 }));   // 二层纸台
    const pole = paperStick(0.5); pole.position.set(0.05, 1.05, 0); group.add(pole);
    group.add(board(0.34, 0.2, { rotY: 0.4, x: 0.24, y: 1.18 })); // 小纸旗
    bowLocal = lantern(1.05, 0.55, 0);
  } else if (type === "sail") { // 双帆纸船：双纸桅 + 两片斜纸帆
    const hull = makeHull(2.0, 0.6, 0.42, { sheer: 0.32, bottomTaper: 0.4, segsX: 8, segsZ: 4 });
    const body = new THREE.Mesh(hull, getHullMat());
    group.add(body); addEdges(hull, color, body);
    const mast1 = paperStick(1.5); mast1.position.set(-0.2, 0.95, 0); group.add(mast1);
    const mast2 = paperStick(1.1); mast2.position.set(0.5, 0.75, 0); group.add(mast2);
    const sail1 = paperSail(0.9, 1.1, -0.35); sail1.position.set(-0.5, 0.95, 0.02); group.add(sail1);
    const sail2 = paperSail(0.6, 0.7, 0.3); sail2.position.set(0.75, 0.7, 0.02); group.add(sail2);
    bowLocal = lantern(0.95, 0.42, 0);
  } else if (type === "fishing") { // 平筏纸船：浅平船身 + 小纸棚 + 尾桨 + 线网
    const hull = makeHull(1.8, 0.9, 0.32, { sheer: 0.18, bottomTaper: 0.45, segsX: 8, segsZ: 4 });
    const body = new THREE.Mesh(hull, getHullMat());
    group.add(body); addEdges(hull, color, body);
    const tent = paperTent(0.7, 0.3);
    tent.position.set(-0.5, 0.24, 0);
    group.add(tent);
    group.add(board(0.16, 0.9, { rotY: 0.3, x: 0.75, y: 0.1, z: 0.25 })); // 尾桨
    const net = new THREE.Mesh(new THREE.PlaneGeometry(0.7, 0.5, 4, 4), getNetMat());
    const np = net.geometry.attributes.position as THREE.BufferAttribute;
    for (let i = 0; i < np.count; i++) { const yy = np.getY(i); if (yy < 0) np.setY(i, yy - 0.2); }
    net.position.set(0.5, 0.12, -0.2);
    group.add(net);
    bowLocal = lantern(0.85, 0.4, 0);
  } else if (type === "dragon") { // 长龙纸船：窄长船身 + 首尾纸尖大幅上翘 + 一排纸坐板 + 纸鼓
    const hull = makeHull(3.0, 0.42, 0.36, { sheer: 0.55, bottomTaper: 0.35, segsX: 10, segsZ: 3 });
    const body = new THREE.Mesh(hull, getHullMat());
    group.add(body); addEdges(hull, color, body);
    group.add(board(0.4, 0.5, { rotX: -0.9, x: 1.42, y: 0.4 }));   // 船头纸尖
    group.add(board(0.4, 0.5, { rotX: 0.9, x: -1.42, y: 0.4 }));   // 船尾纸尖
    for (let i = 0; i < 7; i++) { // 纸坐板
      group.add(board(0.34, 0.05, { rotY: Math.PI / 2, x: -1.2 + i * 0.42, y: 0.22 }));
    }
    const drum = new THREE.Mesh(new THREE.CylinderGeometry(0.13, 0.13, 0.14, 10), getHullMat()); // 纸鼓
    drum.position.set(-0.05, 0.34, 0);
    group.add(drum);
    bowLocal = lantern(1.38, 0.42, 0);
  } else { // mech 尖角纸船：灰纸棱角 + 冷蓝折痕 + 纸翼 + 天线
    const hull = makeHull(2.0, 0.75, 0.5, { sheer: 0.15, bottomTaper: 0.55, segsX: 6, segsZ: 3 });
    const body = new THREE.Mesh(hull, getHullMat());
    group.add(body);
    const seams = new THREE.LineSegments(new THREE.EdgesGeometry(hull, 18), new THREE.LineBasicMaterial({ color: 0x6fd6ff, transparent: true, opacity: 0.95, blending: THREE.AdditiveBlending }));
    group.add(seams);
    for (const sz of [-1, 1]) { // 纸翼
      group.add(board(0.5, 0.22, { rotY: sz * 0.5, x: -0.25, y: 0.05, z: sz * 0.42 }));
    }
    const ant = paperStick(0.5, 0.015); ant.position.set(0.45, 0.5, 0); group.add(ant);
    const antTip = new THREE.Mesh(new THREE.SphereGeometry(0.03, 8, 8), COLD_MAT);
    antTip.position.set(0.45, 0.75, 0);
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
      cv.style.cursor = pickBoat(e) != null ? "pointer" : (dragging ? "grabbing" : "grab");
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
    if (p.id) router.push(`/workspace/${p.id}`);
    else router.push("/explore");
  };

  return (
    <div className="relative w-full select-none">
      <div className="relative h-[420px] md:h-[480px] rounded-xl overflow-hidden">
        <div ref={mountRef} className="absolute inset-0" />
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
