/**
 * shot_dialogs.cjs — 截取创造前弹窗证据（Stage 2 / v2.59.0 预览）。
 * 正确链路：OnboardingModal 挂在 workspace 内（首次进入工作区）。
 * 1) workspace 首次进入 → OnboardingModal 引导
 * 2) 关闭引导 → 工具栏「项目设定」→ ProjectSettingsDialog
 * 3) 「小说骨架」→ BuildConfigDialog（项目设定/项目骨架编辑）
 * 4) 首页回归（Hero + 灵感文体墙）
 */
const { spawn, execSync } = require("child_process");
const fs = require("fs");
const path = require("path");
const os = require("os");

const CHROME = "C:\\Program Files\\Google\\Chrome\\Application\\chrome.exe";
const DEBUG_PORT = 9354;
const OUTPUT_DIR = path.join(__dirname, "PROCESS", "ui-shots");
const BASE = "http://127.0.0.1:3001";

let msgId = 0;
let ws = null;
let cdp = null;
function nextId() { return ++msgId; }
function send(method, params = {}) {
  const id = nextId();
  const sock = cdp || ws;
  return new Promise((resolve, reject) => {
    const handler = (ev) => {
      const msg = JSON.parse(ev.data.toString());
      if (msg.id === id) {
        sock.removeEventListener("message", handler);
        if (msg.error) reject(new Error(msg.error.message));
        else resolve(msg.result);
      }
    };
    sock.addEventListener("message", handler);
    sock.send(JSON.stringify({ id, method, params }));
    setTimeout(() => { sock.removeEventListener("message", handler); reject(new Error(`CDP timeout: ${method}`)); }, 15000);
  });
}
function launchChrome() {
  try {
    const ver = execSync(`curl -s http://127.0.0.1:${DEBUG_PORT}/json/version`, { stdio: "pipe", timeout: 3000 }).toString();
    return JSON.parse(ver).webSocketDebuggerUrl;
  } catch {
    const args = ["--headless=new","--no-sandbox","--disable-gpu","--disable-dev-shm-usage",`--remote-debugging-port=${DEBUG_PORT}`,`--user-data-dir=${path.join(os.tmpdir(), "nf-dialogs-" + DEBUG_PORT)}`,"--window-size=1440,900"];
    const p = spawn(CHROME, args, { detached: true, stdio: "ignore", shell: false });
    p.unref();
    for (let i = 0; i < 30; i++) {
      try {
        const ver = execSync(`curl -s http://127.0.0.1:${DEBUG_PORT}/json/version`, { stdio: "pipe", timeout: 2000 }).toString();
        return JSON.parse(ver).webSocketDebuggerUrl;
      } catch { /* wait */ }
    }
    throw new Error("Chrome 启动超时");
  }
}
function connectCDP(wsUrl) {
  return new Promise((resolve, reject) => {
    const socket = new WebSocket(wsUrl);
    socket.addEventListener("open", () => resolve(socket));
    socket.addEventListener("error", () => reject(new Error("WS 连接错误")));
    setTimeout(() => reject(new Error("WS 超时")), 10000);
  });
}
const sleep = (ms) => new Promise((r) => setTimeout(r, ms));
async function clickByText(text, tag = "button") {
  const res = await send("Runtime.evaluate", {
    expression: `(function(){ const els=[...document.querySelectorAll('${tag}')]; const el=els.find(e=>e.textContent.trim().includes(${JSON.stringify(text)})); if(el){ el.click(); return true; } return false; })()`,
    returnByValue: true,
  });
  return !!res.result?.value;
}
async function shot(name) {
  const out = path.join(OUTPUT_DIR, name);
  const r = await send("Page.captureScreenshot", { format: "png", captureBeyondViewport: false });
  fs.writeFileSync(out, Buffer.from(r.data, "base64"));
  console.log("[截图]", name);
  return out;
}

async function main() {
  fs.mkdirSync(OUTPUT_DIR, { recursive: true });
  console.log("[1] 启动 Chrome");
  const browserWsUrl = launchChrome();
  ws = await connectCDP(browserWsUrl);
  const created = await send("Target.createTarget", { url: "about:blank" });
  const listRaw = execSync(`curl -s http://127.0.0.1:${DEBUG_PORT}/json/list`, { stdio: "pipe", timeout: 3000 }).toString();
  const targets = JSON.parse(listRaw);
  const target = targets.find((t) => t.id === created.targetId) || targets.find((t) => t.type === "page");
  cdp = await connectCDP(target.webSocketDebuggerUrl);
  await send("Page.enable");
  await send("Runtime.enable");
  await send("Emulation.setDeviceMetricsOverride", { width: 1440, height: 900, deviceScaleFactor: 1, mobile: false });

  // 取首页「进入工作台」链接
  console.log("[2] 首页取 workspace 链接");
  await send("Page.navigate", { url: BASE + "/" });
  await sleep(2500);
  const href = await send("Runtime.evaluate", {
    expression: `(function(){ const a=[...document.querySelectorAll('a')].find(e=>e.textContent.includes('进入工作台')); return a?a.getAttribute('href'):null; })()`,
    returnByValue: true,
  });
  if (!href.result?.value) throw new Error("未找到「进入工作台」链接");
  console.log("[workspace href]", href.result.value);

  // ===== 截图 1：workspace 首次进入 → OnboardingModal =====
  console.log("[3] workspace 首次进入（不预置 onboard key）");
  await send("Runtime.evaluate", { expression: `localStorage.removeItem('nf_onboarded_v1');` });
  await send("Page.navigate", { url: BASE + href.result.value });
  await sleep(5000);
  const hasOnboard = await send("Runtime.evaluate", { expression: `(function(){ return document.body.innerText.includes('欢迎来到小说工坊'); })()`, returnByValue: true });
  console.log("[含 Onboarding 标题?]", hasOnboard.result?.value);
  await shot("v259-onboarding.png");

  // ===== 关闭引导 → 项目设定 → 小说骨架 → BuildConfig =====
  console.log("[4] 关闭引导并打开 BuildConfigDialog");
  const preset = `localStorage.setItem('nf_onboarded_v1','1'); localStorage.setItem('novel-forge-last-version','v2.59.0'); localStorage.setItem('nf-shortcuts-seen','1');`;
  await send("Runtime.evaluate", { expression: preset });
  await send("Page.reload", {});
  await sleep(4500);
  const ok1 = await clickByText("项目设定");
  console.log("[点击 工具栏 项目设定?]", ok1);
  await sleep(1500);
  await shot("v259-projectsettings.png");
  const ok2 = await clickByText("小说骨架");
  console.log("[点击 小说骨架?]", ok2);
  await sleep(1800);
  const hasBc = await send("Runtime.evaluate", { expression: `(function(){ return !!document.querySelector('.nf-accent-bar'); })()`, returnByValue: true });
  console.log("[BuildConfig 已开 (含 .nf-accent-bar)?]", hasBc.result?.value);
  await shot("v259-buildconfig.png");

  // ===== 首页回归 =====
  console.log("[5] 首页回归");
  await send("Page.navigate", { url: BASE + "/" });
  await sleep(2000);
  await send("Runtime.evaluate", { expression: preset });
  await send("Page.reload", {});
  await sleep(3500);
  const hasWall = await send("Runtime.evaluate", { expression: `(function(){ return !!document.querySelector('.nf-genrewall'); })()`, returnByValue: true });
  console.log("[含 .nf-genrewall?]", hasWall.result?.value);
  await shot("v259-home-hero.png");
  await send("Runtime.evaluate", { expression: `document.querySelector('.nf-genrewall')?.scrollIntoView({block:'center'}); window.scrollBy(0,-40);` });
  await sleep(1200);
  await shot("v259-home-genrewall.png");

  cdp.close();
  ws.close();
}
main().catch((e) => { console.error("致命错误:", e.message); if (ws) ws.close(); process.exit(1); });
