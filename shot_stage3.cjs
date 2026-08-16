/**
 * shot_stage3.cjs — 截取创造后工作台证据（Stage 3 / v2.60.0 预览）。
 * 覆盖：左栏各 Tab（大纲/角色/世界/故事）+ 右栏工具箱。
 * 设计目标：Tab 切换转场 + 激活态高光 + 卡片悬浮微交互 的可视验证。
 */
const { spawn, execSync } = require("child_process");
const fs = require("fs");
const path = require("path");
const os = require("os");

const CHROME = "C:\\Program Files\\Google\\Chrome\\Application\\chrome.exe";
const DEBUG_PORT = 9356;
const OUTPUT_DIR = path.join(__dirname, "PROCESS", "ui-shots");
const BASE = "http://127.0.0.1:3001";
const PROJECT = "5550f26f-4237-427d-bb6d-e34b851cfe70";
const PRESET = `localStorage.setItem('nf_onboarded_v1','1'); localStorage.setItem('novel-forge-last-version','v2.60.0'); localStorage.setItem('nf-shortcuts-seen','1');`;

let msgId = 0;
let ws = null, cdp = null;
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
    const args = ["--headless=new","--no-sandbox","--disable-gpu","--disable-dev-shm-usage",`--remote-debugging-port=${DEBUG_PORT}`,`--user-data-dir=${path.join(os.tmpdir(), "nf-stage3-" + DEBUG_PORT)}`,"--window-size=1440,900"];
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

  console.log("[2] 进入 workspace（预置关闭弹窗）");
  await send("Page.navigate", { url: BASE + "/workspace/" + PROJECT });
  await sleep(2500);
  await send("Runtime.evaluate", { expression: PRESET });
  await send("Page.reload", {});
  await sleep(4500);

  // 1) 左栏默认：大纲
  console.log("[3] 左栏·大纲");
  await shot("v260-left-outline.png");

  // 2) 角色 tab
  console.log("[4] 左栏·角色");
  await clickByText("角色");
  await sleep(1200);
  await shot("v260-left-characters.png");

  // 3) 世界 tab
  console.log("[5] 左栏·世界");
  await clickByText("世界");
  await sleep(1200);
  await shot("v260-left-world.png");

  // 4) 故事 tab
  console.log("[6] 左栏·故事");
  await clickByText("故事");
  await sleep(1200);
  await shot("v260-left-storylines.png");

  // 5) 右栏·工具箱
  console.log("[7] 右栏·工具箱");
  const okTool = await clickByText("工具箱");
  console.log("[点击 工具箱?]", okTool);
  await sleep(1200);
  await shot("v260-right-toolbox.png");

  cdp.close();
  ws.close();
}
main().catch((e) => { console.error("致命错误:", e.message); if (ws) ws.close(); process.exit(1); });
