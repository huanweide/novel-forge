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
  return 0.16 * Math.sin(0.5 * x + t * 0.8) + 0.11 * Math.sin(0.7 * z + t * 1.1);
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
float waveH(float x, float z, float t){ return 0.16*sin(0.5*x + t*0.8) + 0.11*sin(0.7*z + t*1.1); }
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
  vec3 deep = vec3(0.012, 0.020, 0.045);
  vec3 sheen = vec3(0.10, 0.22, 0.45);
  vec3 col = deep + sheen * fres * 0.9;
  float flow = fbm(vWP.xz*0.35 + vec2(uTime*0.03, uTime*0.02));
  col += vec3(0.05, 0.10, 0.22) * flow * 0.5;
  float star = pow(fbm(vWP.xz*1.4 + vec2(uTime*0.05)), 9.0);
  col += vec3(0.65, 0.80, 1.0) * star * 1.4;
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

function makeGlowTexture(rgb: [number, number, number]): THREE.CanvasTexture {
  const c = document.createElement("canvas");
  c.width = c.height = 128;
  const x = c.getContext("2d")!;
  const g = x.createRadialGradient(64, 64, 0, 64, 64, 64);
  const col = `rgba(${Math.round(rgb[0] * 255)},${Math.round(rgb[1] * 255)},${Math.round(rgb[2] * 255)},`;
  g.addColorStop(0, col + "0.95)"); g.addColorStop(0.4, col + "0.4)"); g.addColorStop(1, col + "0)");
  x.fillStyle = g; x.fillRect(0, 0, 128, 128);
  const t = new THREE.CanvasTexture(c); t.needsUpdate = true; return t;
}

function makeTrailTexture(rgb: [number, number, number]): THREE.CanvasTexture {
  const c = document.createElement("canvas");
  c.width = 256; c.height = 32;
  const x = c.getContext("2d")!;
  const col = `rgba(${Math.round(rgb[0] * 255)},${Math.round(rgb[1] * 255)},${Math.round(rgb[2] * 255)},`;
  const g = x.createLinearGradient(0, 0, 256, 0);
  g.addColorStop(0, col + "0.85)"); g.addColorStop(0.5, col + "0.3)"); g.addColorStop(1, col + "0)");
  x.fillStyle = g; x.fillRect(0, 0, 256, 32);
  const t = new THREE.CanvasTexture(c); t.needsUpdate = true; return t;
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
const HULL_MAT = new THREE.MeshStandardMaterial({ color: 0xe8e6dc, flatShading: true, roughness: 0.9, metalness: 0.0, side: THREE.DoubleSide });
const METAL_HULL_MAT = new THREE.MeshStandardMaterial({ color: 0x2a3340, flatShading: true, roughness: 0.4, metalness: 0.6, side: THREE.DoubleSide });
const CANOPY_MAT = new THREE.MeshStandardMaterial({ color: 0x2b313d, roughness: 0.85, metalness: 0.0, side: THREE.DoubleSide });
const WOOD_MAT = new THREE.MeshStandardMaterial({ color: 0x3a3328, roughness: 0.8, metalness: 0.0 });
const SAIL_MAT = new THREE.MeshStandardMaterial({ color: 0xdfe3ea, roughness: 0.85, metalness: 0.0, side: THREE.DoubleSide });
const DARK_MAT = new THREE.MeshStandardMaterial({ color: 0x1a1f2b, roughness: 0.9, metalness: 0.0, side: THREE.DoubleSide });
const COLD_MAT = new THREE.MeshBasicMaterial({ color: 0x6fd6ff });

// 半圆柱篷（轴沿 X，弧朝上）
function makeCanopy(r: number, len: number): THREE.Mesh {
  const geo = new THREE.CylinderGeometry(r, r, len, 16, 1, true, 0, Math.PI);
  const m = new THREE.Mesh(geo, CANOPY_MAT);
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
  return new THREE.Mesh(geo, SAIL_MAT);
}

// 楼船：多层甲板 + 飞檐
function makeTower(levels: number, w: number): THREE.Group {
  const grp = new THREE.Group();
  let y = 0;
  const lh = 0.32;
  for (let i = 0; i < levels; i++) {
    const lw = w * (1 - i * 0.16);
    const floor = new THREE.Mesh(new THREE.BoxGeometry(lw, lh, lw * 0.7), HULL_MAT);
    floor.position.y = y + lh / 2;
    grp.add(floor);
    const eave = new THREE.Mesh(new THREE.BoxGeometry(lw * 1.18, 0.05, lw * 0.84), DARK_MAT);
    eave.position.y = y + lh + 0.02;
    grp.add(eave);
    y += lh + 0.04;
  }
  return grp;
}

// 龙首
function makeDragonHead(): THREE.Group {
  const grp = new THREE.Group();
  const head = new THREE.Mesh(new THREE.ConeGeometry(0.16, 0.5, 6), HULL_MAT);
  head.rotation.z = -Math.PI / 2; head.position.set(0.25, 0.1, 0);
  grp.add(head);
  const horn = new THREE.Mesh(new THREE.ConeGeometry(0.05, 0.3, 5), WOOD_MAT);
  horn.position.set(0.2, 0.32, 0); horn.rotation.z = 0.5;
  grp.add(horn);
  return grp;
}

interface BuiltBoat { group: THREE.Group; bowLocal: THREE.Vector3; }

// 工厂：按类型拼装部件树（船头朝 +X）
function createBoat(type: BoatType): BuiltBoat {
  const group = new THREE.Group();
  let deckY = 0.25, hullLen = 2.0, bowLocal: THREE.Vector3;
  const addEdges = (geo: THREE.BufferGeometry, color: [number, number, number], parent: THREE.Object3D) => {
    const e = new THREE.LineSegments(
      new THREE.EdgesGeometry(geo, 22),
      new THREE.LineBasicMaterial({ color: new THREE.Color(color[0], color[1], color[2]), transparent: true, opacity: 0.7, blending: THREE.AdditiveBlending })
    );
    parent.add(e);
  };

  if (type === "wupeng") {
    hullLen = 2.0;
    const hull = makeHull(hullLen, 0.8, 0.5, { sheer: 0.22, bottomTaper: 0.4 });
    const body = new THREE.Mesh(hull, HULL_MAT);
    group.add(body); addEdges(hull, DEFAULT_COLOR, body);
    const canopy = makeCanopy(0.42, 1.1);
    canopy.position.set(-0.1, 0.32, 0);
    group.add(canopy);
    const oar = new THREE.Mesh(new THREE.CylinderGeometry(0.03, 0.03, 1.0, 6), WOOD_MAT);
    oar.rotation.z = Math.PI / 2.4; oar.position.set(-0.95, 0.0, 0.35);
    group.add(oar);
    bowLocal = new THREE.Vector3(0.95, 0.5, 0);
  } else if (type === "tower") {
    hullLen = 2.4; deckY = 0.45;
    const hull = makeHull(hullLen, 1.1, 0.9, { sheer: 0.14, bottomTaper: 0.5 });
    const body = new THREE.Mesh(hull, HULL_MAT);
    group.add(body); addEdges(hull, DEFAULT_COLOR, body);
    const tower = makeTower(3, 1.0);
    tower.position.set(-0.1, 0.5, 0);
    group.add(tower);
    const flag = new THREE.Mesh(new THREE.PlaneGeometry(0.4, 0.25), new THREE.MeshStandardMaterial({ color: 0xc8504a, side: THREE.DoubleSide }));
    flag.position.set(0.2, 0.5 + 3 * 0.36 + 0.3, 0);
    group.add(flag);
    bowLocal = new THREE.Vector3(1.15, 0.7, 0);
  } else if (type === "sail") {
    hullLen = 2.2;
    const hull = makeHull(hullLen, 0.7, 0.45, { sheer: 0.3, bottomTaper: 0.4 });
    const body = new THREE.Mesh(hull, HULL_MAT);
    group.add(body); addEdges(hull, DEFAULT_COLOR, body);
    const mast = new THREE.Mesh(new THREE.CylinderGeometry(0.04, 0.05, 1.6, 8), WOOD_MAT);
    mast.position.set(0.1, 0.25 + 0.8, 0);
    group.add(mast);
    const sail = makeSail(1.1, 1.4);
    sail.position.set(-0.1, 0.25 + 0.75, 0.02);
    group.add(sail);
    const sail2 = makeSail(0.7, 0.7);
    sail2.position.set(0.6, 0.25 + 0.45, 0.02);
    group.add(sail2);
    bowLocal = new THREE.Vector3(1.05, 0.5, 0);
  } else if (type === "fishing") {
    hullLen = 1.9;
    const hull = makeHull(hullLen, 0.72, 0.5, { sheer: 0.2, bottomTaper: 0.42 });
    const body = new THREE.Mesh(hull, HULL_MAT);
    group.add(body); addEdges(hull, DEFAULT_COLOR, body);
    const derrick = new THREE.Mesh(new THREE.CylinderGeometry(0.025, 0.03, 1.1, 6), WOOD_MAT);
    derrick.rotation.z = Math.PI / 2.6; derrick.position.set(0.7, 0.55, 0);
    group.add(derrick);
    const net = new THREE.Mesh(new THREE.PlaneGeometry(0.8, 0.7, 5, 5), new THREE.MeshStandardMaterial({ map: makeNetTexture(), transparent: true, side: THREE.DoubleSide, roughness: 0.9 }));
    const np = net.geometry.attributes.position as THREE.BufferAttribute;
    for (let i = 0; i < np.count; i++) { const y = np.getY(i); if (y < 0) np.setY(i, y - 0.25 * (1 + y / 0.35)); }
    net.position.set(0.55, 0.15, 0.2);
    group.add(net);
    const hold = new THREE.Mesh(new THREE.BoxGeometry(0.4, 0.18, 0.4), DARK_MAT);
    hold.position.set(-0.2, 0.32, 0);
    group.add(hold);
    bowLocal = new THREE.Vector3(0.95, 0.5, 0);
  } else if (type === "dragon") {
    hullLen = 3.2;
    const hull = makeHull(hullLen, 0.5, 0.4, { sheer: 0.5, bottomTaper: 0.35 });
    const body = new THREE.Mesh(hull, HULL_MAT);
    group.add(body); addEdges(hull, DEFAULT_COLOR, body);
    const head = makeDragonHead();
    head.position.set(1.5, 0.2, 0);
    group.add(head);
    for (let i = 0; i < 6; i++) { // 横向坐板
      const bench = new THREE.Mesh(new THREE.BoxGeometry(0.04, 0.06, 0.36), WOOD_MAT);
      bench.position.set(-1.2 + i * 0.42, 0.28, 0);
      group.add(bench);
    }
    bowLocal = new THREE.Vector3(1.55, 0.5, 0);
  } else { // mech 机关舟
    hullLen = 2.0;
    const hull = makeHull(hullLen, 0.8, 0.5, { sheer: 0.1, bottomTaper: 0.55, segsX: 8, segsZ: 4 });
    const body = new THREE.Mesh(hull, METAL_HULL_MAT);
    group.add(body);
    const seams = new THREE.LineSegments(new THREE.EdgesGeometry(hull, 18), new THREE.LineBasicMaterial({ color: 0x6fd6ff, transparent: true, opacity: 0.9, blending: THREE.AdditiveBlending }));
    group.add(seams);
    const fin = new THREE.Mesh(new THREE.BoxGeometry(0.5, 0.04, 0.4), METAL_HULL_MAT);
    fin.position.set(-0.9, 0.0, 0); fin.rotation.y = 0.3;
    group.add(fin);
    const core = new THREE.Mesh(new THREE.SphereGeometry(0.08, 10, 10), COLD_MAT);
    core.position.set(0.4, 0.2, 0);
    group.add(core);
    bowLocal = new THREE.Vector3(0.95, 0.45, 0);
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
  lampGlow: THREE.Sprite;
  trail: THREE.Mesh;
  baseX: number;
  baseZ: number;
  scale: number;
  bright: number;
  trailLen: number;
  bornAt: number;
  landed: boolean;
  phase: number;
}

const LAMP_MAX = 8; // 真 PointLight 全局上限（马斯克/芒格铁律）

export default function PaperBoats({ projects }: { projects: PaperProject[] }) {
  const mountRef = useRef<HTMLDivElement>(null);
  const router = useRouter();
  const [focus, setFocus] = useState<number | null>(null);
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

  const focusRef = useRef<number | null>(null);
  useEffect(() => { focusRef.current = focus; }, [focus]);

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
      const trailLen = clamp(1.1 + (p.storyNodes ?? 6) * 0.14, 1.1, 4.2);
      const baseX = N > 1 ? -11 + (22 / (N - 1)) * i : 0;
      const baseZ = Math.sin(i * 1.3) * 3.2 - 1;

      const built = createBoat(type);
      const group = built.group;
      group.userData = { index: i, id: p.id, name: p.name };

      // 船头发光球 + 加性光晕 sprite（假光，全船都有）
      const lampCore = new THREE.Mesh(new THREE.SphereGeometry(0.07, 12, 12), new THREE.MeshBasicMaterial({ color: 0xffffff }));
      lampCore.position.copy(built.bowLocal);
      group.add(lampCore);
      const lampGlow = new THREE.Sprite(new THREE.SpriteMaterial({ map: makeGlowTexture(color), transparent: true, opacity: bright * 0.9, depthWrite: false, blending: THREE.AdditiveBlending }));
      lampGlow.scale.set(0.9, 0.9, 1);
      lampGlow.position.copy(built.bowLocal);
      group.add(lampGlow);

      group.scale.setScalar(scale);
      scene.add(group);

      const trail = new THREE.Mesh(
        new THREE.PlaneGeometry(trailLen, 0.5),
        new THREE.MeshBasicMaterial({ map: makeTrailTexture(color), transparent: true, opacity: 0.8, depthWrite: false, blending: THREE.AdditiveBlending, side: THREE.DoubleSide })
      );
      trail.rotation.x = -Math.PI / 2;
      scene.add(trail);

      boats.push({ id: p.id, name: p.name, type, color, group, bowLocal: built.bowLocal, lampGlow, trail, baseX, baseZ, scale, bright, trailLen, bornAt: i * 0.35, landed: false, phase: Math.random() * Math.PI * 2 });
    });

    // 航线光带
    const routeGeo = new THREE.BufferGeometry();
    const routePos = new Float32Array(Math.max(0, N - 1) * 2 * 3);
    routeGeo.setAttribute("position", new THREE.BufferAttribute(routePos, 3));
    const route = new THREE.LineSegments(routeGeo, new THREE.LineBasicMaterial({ color: 0x6f86d8, transparent: true, opacity: 0.28, blending: THREE.AdditiveBlending }));
    scene.add(route);

    // 涟漪池
    const ripples: { mesh: THREE.Mesh; t: number; active: boolean }[] = [];
    for (let k = 0; k < 5; k++) {
      const m = new THREE.Mesh(
        new THREE.RingGeometry(0.5, 0.6, 48),
        new THREE.MeshBasicMaterial({ color: 0x9fc0ff, transparent: true, opacity: 0, depthWrite: false, blending: THREE.AdditiveBlending, side: THREE.DoubleSide })
      );
      m.rotation.x = -Math.PI / 2; m.visible = false;
      scene.add(m);
      ripples.push({ mesh: m, t: 0, active: false });
    }
    const spawnRipple = (x: number, y: number, z: number) => {
      const r = ripples.find((q) => !q.active);
      if (!r) return;
      r.active = true; r.t = 0;
      r.mesh.position.set(x, y + 0.03, z);
      r.mesh.visible = true;
    };

    // 交互
    const ray = new THREE.Raycaster();
    const mouse = new THREE.Vector2();
    let downX = 0, downY = 0;
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
    const hoverRippleAt = useRef<number>(-1);
    const lastHoverRipple = useRef(0);
    const onMove = (e: PointerEvent) => {
      const idx = pickBoat(e);
      cv.style.cursor = idx != null ? "pointer" : "default";
      if (idx != null) {
        const now = performance.now();
        if (idx !== hoverRippleAt.current || now - lastHoverRipple.current > 700) {
          const b = boats[idx];
          spawnRipple(b.group.position.x, b.group.position.y, b.group.position.z);
          hoverRippleAt.current = idx;
          lastHoverRipple.current = now;
        }
      }
    };
    const onDown = (e: PointerEvent) => { downX = e.clientX; downY = e.clientY; };
    const onUp = (e: PointerEvent) => {
      if (Math.hypot(e.clientX - downX, e.clientY - downY) > 6) return;
      setFocus(pickBoat(e));
    };
    cv.addEventListener("pointermove", onMove);
    cv.addEventListener("pointerdown", onDown);
    cv.addEventListener("pointerup", onUp);

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
    const reduceMotion = window.matchMedia("(prefers-reduced-motion: reduce)");
    let reduced = reduceMotion.matches;
    const lookTarget = new THREE.Vector3(0, 0.5, -2);

    const renderOnce = () => {
      const t = clock.getElapsedTime();
      const dt = Math.min(clock.getDelta(), 0.05);
      seaMat.uniforms.uTime.value = t;

      boats.forEach((b, i) => {
        let y;
        if (!b.landed) {
          const p = clamp((t - b.bornAt) / 1.2, 0, 1);
          const ease = 1 - Math.pow(1 - p, 3);
          y = THREE.MathUtils.lerp(9, seaH(b.baseX, b.baseZ, t), ease);
          if (p >= 1) { b.landed = true; spawnRipple(b.baseX, seaH(b.baseX, b.baseZ, t), b.baseZ); }
        } else {
          y = seaH(b.baseX, b.baseZ, t);
        }
        b.group.position.set(b.baseX, y, b.baseZ);
        b.group.rotation.z = Math.sin(t * 0.8 + b.phase) * 0.06;
        b.group.rotation.x = Math.cos(t * 0.6 + b.phase) * 0.05;
        (b.lampGlow.material as THREE.SpriteMaterial).opacity = b.bright * (0.7 + Math.sin(t * 2 + b.phase) * 0.15);
        const target = focusRef.current === i ? 1.15 : 1.0;
        b.group.scale.setScalar(b.scale * target);
      });

      // 真灯分配：聚焦船 + 最近/最活跃 ≤8 艘
      boats.forEach((b) => b.group.updateMatrixWorld());
      const scored = boats.map((b, i) => ({ i, d: b.group.position.distanceTo(camera.position) - b.bright * 4 }));
      scored.sort((a, c) => a.d - c.d);
      const lit = new Set<number>();
      if (focusRef.current != null && focusRef.current < boats.length) lit.add(focusRef.current);
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

      // 航线
      for (let i = 0; i < N - 1; i++) {
        const a = boats[i].group.position, b = boats[i + 1].group.position;
        routePos[i * 6] = a.x; routePos[i * 6 + 1] = a.y + 0.3; routePos[i * 6 + 2] = a.z;
        routePos[i * 6 + 3] = b.x; routePos[i * 6 + 4] = b.y + 0.3; routePos[i * 6 + 5] = b.z;
      }
      routeGeo.attributes.position.needsUpdate = true;

      // 光尾随船
      boats.forEach((b) => {
        b.trail.position.set(b.baseX - b.trailLen / 2 - 0.9 * b.scale, seaH(b.baseX - b.trailLen / 2, b.baseZ, t) + 0.02, b.baseZ);
      });

      // 涟漪
      ripples.forEach((r) => {
        if (!r.active) return;
        r.t += dt;
        const k = r.t / 0.9;
        r.mesh.scale.setScalar(0.3 + k * 2.2);
        (r.mesh.material as THREE.MeshBasicMaterial).opacity = Math.max(0, 0.6 * (1 - k));
        if (k >= 1) { r.active = false; r.mesh.visible = false; }
      });

      // 相机
      if (focusRef.current != null && focusRef.current < boats.length && boats[focusRef.current]) {
        const b = boats[focusRef.current];
        const pos = b.group.position;
        const camDesired = new THREE.Vector3(pos.x - 2.1 * b.scale, pos.y + 1.15 * b.scale, pos.z + 0.2);
        camera.position.lerp(camDesired, 0.06);
        lookTarget.lerp(new THREE.Vector3(pos.x + 7, pos.y + 0.3, pos.z), 0.08);
      } else {
        const idle = new THREE.Vector3(Math.sin(t * 0.04) * 2.5, 3 + Math.sin(t * 0.06) * 0.25, 14);
        camera.position.lerp(idle, 0.04);
        lookTarget.lerp(new THREE.Vector3(0, 0.5, -2), 0.05);
      }
      camera.lookAt(lookTarget);

      renderer.render(scene, camera);
    };

    const animate = () => { if (!running) return; renderOnce(); raf = requestAnimationFrame(animate); };
    const start = () => { if (running || reduced) return; running = true; raf = requestAnimationFrame(animate); };
    const stop = () => { running = false; cancelAnimationFrame(raf); };
    renderOnce();
    const onVis = () => { if (document.hidden) stop(); else start(); };
    document.addEventListener("visibilitychange", onVis);
    const io = new IntersectionObserver((es) => { if (es[0]?.isIntersecting) start(); else stop(); }, { rootMargin: "100px" });
    io.observe(mount);
    const onReduce = () => { reduced = reduceMotion.matches; if (reduced) { stop(); renderOnce(); } else start(); };
    reduceMotion.addEventListener("change", onReduce);
    start();

    return () => {
      stop();
      document.removeEventListener("visibilitychange", onVis);
      io.disconnect();
      reduceMotion.removeEventListener("change", onReduce);
      cancelAnimationFrame(raf);
      ro.disconnect();
      cv.removeEventListener("pointermove", onMove);
      cv.removeEventListener("pointerdown", onDown);
      cv.removeEventListener("pointerup", onUp);
      renderer.dispose();
      if (cv.parentNode) cv.parentNode.removeChild(cv);
    };
  }, [list]);

  const openBoat = (p: PaperProject) => {
    if (p.id) router.push(`/workspace/${p.id}`);
    else router.push("/explore");
  };
  const focused = focus != null ? list[focus] : null;
  const focusedType: BoatType | null = focus != null ? boatTypeFor(list[focus].genre) : null;

  return (
    <div className="relative w-full select-none">
      <div className="relative h-[420px] md:h-[480px] rounded-xl overflow-hidden">
        <div ref={mountRef} className="absolute inset-0" />
        {focused && (
          <div className="absolute right-3 top-3 w-64 rounded-2xl border border-[var(--nv-border-3)] bg-[var(--nv-surface-2)]/95 backdrop-blur-md p-4 shadow-xl">
            <div className="flex items-center justify-between mb-1">
              <span className="text-[11px] text-[var(--nv-text-muted)]">纸舟 · {focusedType ? TYPE_NAMES[focusedType] : "未分类"} · {focused.genre?.[0] ?? "未分类"}</span>
              <button onClick={() => setFocus(null)} className="text-[var(--nv-text-muted)] hover:text-[var(--nv-text-primary)] text-xs leading-none" aria-label="回到全景">✕</button>
            </div>
            <h3 className="text-base font-semibold text-[var(--nv-text-primary)] truncate">{focused.name}</h3>
            <p className="mt-1 text-xs text-[var(--nv-text-tertiary)] leading-relaxed">
              从船头望向前方无边的墨海——那就是「下一章」。
            </p>
            <div className="mt-3 flex gap-2">
              <button onClick={() => openBoat(focused)} className="btn-primary flex-1 text-xs px-3 py-2 rounded-lg font-medium">打开这本书</button>
              <button onClick={() => setFocus(null)} className="btn-ghost flex-1 text-xs px-3 py-2 rounded-lg font-medium">回到全景</button>
            </div>
          </div>
        )}
        <div className="pointer-events-none absolute bottom-2 left-0 right-0 text-center text-[11px] text-[var(--nv-text-muted)] tracking-wide">
          点击纸船拉近望向前方墨海 · 或从下方选择一本书
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
            const active = focus === i;
            return (
              <button
                key={p.id ?? i}
                onClick={() => setFocus(active ? null : i)}
                className={`shrink-0 inline-flex items-center gap-2 rounded-xl border px-3.5 py-2 text-sm transition-colors ${
                  active
                    ? "border-[var(--nv-border-3)] bg-[var(--nv-surface-2)] text-[var(--nv-text-primary)]"
                    : "border-[var(--nv-border-2)] bg-transparent text-[var(--nv-text-tertiary)] hover:text-[var(--nv-text-primary)] hover:border-[var(--nv-border-3)]"
                }`}
                title={TYPE_NAMES[tp]}
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
