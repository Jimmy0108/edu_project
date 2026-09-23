import assert from "node:assert/strict";
import { spawn, spawnSync } from "node:child_process";
import { existsSync, mkdtempSync, rmSync } from "node:fs";
import net from "node:net";
import os from "node:os";
import path from "node:path";

const APP_URL = "http://localhost:3000";
const chromeCandidates = process.platform === "win32"
  ? ["C:\\Program Files\\Google\\Chrome\\Application\\chrome.exe", "C:\\Program Files (x86)\\Microsoft\\Edge\\Application\\msedge.exe"]
  : ["/usr/bin/google-chrome", "/usr/bin/chromium", "/Applications/Google Chrome.app/Contents/MacOS/Google Chrome"];
const delay = milliseconds => new Promise(resolve => setTimeout(resolve, milliseconds));

async function getFreePort() {
  return await new Promise((resolve, reject) => {
    const server = net.createServer();
    server.once("error", reject);
    server.listen(0, "127.0.0.1", () => {
      const address = server.address();
      server.close(() => resolve(address.port));
    });
  });
}

async function waitForHttp(url, timeout = 30_000) {
  const started = Date.now();
  let lastError;
  while (Date.now() - started < timeout) {
    try {
      const response = await fetch(url);
      if (response.ok) return response;
    } catch (error) { lastError = error; }
    await delay(150);
  }
  throw new Error(`等待 ${url} 逾時`, { cause: lastError });
}

class CdpClient {
  constructor(url) {
    this.nextId = 1;
    this.pending = new Map();
    this.socket = new WebSocket(url);
  }

  async connect() {
    await new Promise((resolve, reject) => {
      this.socket.addEventListener("open", resolve, { once: true });
      this.socket.addEventListener("error", reject, { once: true });
    });
    this.socket.addEventListener("message", event => {
      const message = JSON.parse(String(event.data));
      if (!message.id || !this.pending.has(message.id)) return;
      const { resolve, reject } = this.pending.get(message.id);
      this.pending.delete(message.id);
      if (message.error) reject(new Error(message.error.message)); else resolve(message.result);
    });
  }

  call(method, params = {}) {
    const id = this.nextId++;
    return new Promise((resolve, reject) => {
      this.pending.set(id, { resolve, reject });
      this.socket.send(JSON.stringify({ id, method, params }));
    });
  }

  close() { this.socket.close(); }
}

async function evaluate(client, expression) {
  const result = await client.call("Runtime.evaluate", { expression, awaitPromise: true, returnByValue: true, userGesture: true });
  if (result.exceptionDetails) throw new Error(result.exceptionDetails.text || "瀏覽器腳本執行失敗");
  return result.result.value;
}

async function waitFor(client, expression, label, timeout = 15_000) {
  const started = Date.now();
  while (Date.now() - started < timeout) {
    if (await evaluate(client, `Boolean(${expression})`)) return;
    await delay(100);
  }
  const visibleText = await evaluate(client, "document.body?.innerText.slice(0, 1200) || ''");
  throw new Error(`等待畫面狀態逾時：${label}\n當下畫面：${visibleText}`);
}

async function clickText(client, text) {
  const result = await evaluate(client, `(() => {
    const text = ${JSON.stringify(text)};
    const element = [...document.querySelectorAll("button, a")].find(item => item.textContent?.replace(/\\s+/g, " ").includes(text));
    if (!element) return "missing";
    if (element.disabled) return "disabled";
    element.click();
    return "clicked";
  })()`);
  assert.equal(result, "clicked", `無法點擊「${text}」：${result}`);
}

async function navigate(client, url) {
  await client.call("Page.navigate", { url });
  await waitFor(client, "document.readyState === 'complete'", url);
}

function stopProcess(child) {
  if (!child?.pid || child.exitCode !== null) return;
  if (process.platform === "win32") spawnSync("taskkill", ["/PID", String(child.pid), "/T", "/F"], { stdio: "ignore" });
  else child.kill("SIGTERM");
}

let server;
let browser;
let client;
let profileDirectory;

try {
  let existingApp = false;
  try {
    const response = await fetch(`${APP_URL}/prepare`);
    existingApp = response.ok && (await response.text()).includes("EduBridge_AI");
  } catch { existingApp = false; }

  if (!existingApp) {
    const vinextCli = path.join(process.cwd(), "node_modules", "vinext", "dist", "cli.js");
    server = spawn(process.execPath, [vinextCli, "dev"], { cwd: process.cwd(), stdio: ["ignore", "pipe", "pipe"], windowsHide: true });
    let serverOutput = "";
    const remember = chunk => { serverOutput = `${serverOutput}${chunk}`.slice(-4_000); };
    server.stdout.on("data", remember); server.stderr.on("data", remember);
    await Promise.race([
      waitForHttp(`${APP_URL}/prepare`),
      new Promise((_, reject) => server.once("exit", code => reject(new Error(`vinext 提前結束（${code}）：${serverOutput}`)))),
    ]);
  }

  const chromePath = process.env.CHROME_PATH || chromeCandidates.find(existsSync);
  assert.ok(chromePath, "找不到 Chrome 或 Edge；可用 CHROME_PATH 指定瀏覽器執行檔。");
  const debuggingPort = await getFreePort();
  profileDirectory = mkdtempSync(path.join(os.tmpdir(), "edubridge-e2e-"));
  browser = spawn(chromePath, [
    "--headless=new", "--disable-gpu", "--no-first-run", "--no-default-browser-check", "--disable-extensions",
    `--remote-debugging-port=${debuggingPort}`, `--user-data-dir=${profileDirectory}`, "--window-size=1440,1000", `${APP_URL}/prepare`,
  ], { stdio: "ignore", windowsHide: true });

  await waitForHttp(`http://127.0.0.1:${debuggingPort}/json/version`);
  const targets = await (await fetch(`http://127.0.0.1:${debuggingPort}/json/list`)).json();
  const target = targets.find(item => item.type === "page");
  assert.ok(target?.webSocketDebuggerUrl, "Chrome 未提供可測試的頁面目標。");
  client = new CdpClient(target.webSocketDebuggerUrl);
  await client.connect();
  await client.call("Page.enable");
  await client.call("Runtime.enable");

  await waitFor(client, "document.body?.innerText.includes('快速展示')", "課前準備首頁");
  await delay(800);
  await clickText(client, "快速展示");
  await waitFor(client, "document.body.innerText.includes('已載入並核對競賽用資安微課')", "快速展示教材載入");
  await clickText(client, "依已確認內容建立知識圖譜");
  await waitFor(client, "document.body.innerText.includes('教師核對並編輯知識圖譜')", "知識圖譜草稿");
  await clickText(client, "我已檢查本頁無警告");
  await waitFor(client, "[...document.querySelectorAll('button')].some(item => item.textContent.includes('圖譜核對完成') && !item.disabled)", "圖譜確認");
  await clickText(client, "圖譜核對完成");
  await waitFor(client, "document.body.innerText.includes('診斷題與支援卡')", "教學內容編輯");
  await clickText(client, "我已檢查本頁無警告");
  await waitFor(client, "[...document.querySelectorAll('button')].some(item => item.textContent.includes('教學內容確認完成') && !item.disabled)", "教學內容確認");
  await clickText(client, "教學內容確認完成");
  await waitFor(client, "document.body.innerText.includes('發布到本機 Demo')", "發布預覽");
  await clickText(client, "發布到本機 Demo");
  await waitFor(client, "localStorage.getItem('edubridge-lesson-v3') && document.body.innerText.includes('已發布')", "課程包發布");
  assert.equal(await evaluate(client, "JSON.parse(localStorage.getItem('edubridge-lesson-v3')).version"), 3);

  await navigate(client, `${APP_URL}/teach`);
  await waitFor(client, "document.body.innerText.includes('主要教學畫面')", "教師授課頁");
  await clickText(client, "送出合格字幕片段");
  await waitFor(client, "document.body.innerText.includes('等待下一個合格片段')", "第一段只同步字幕");
  await clickText(client, "再次確認同一概念");
  await waitFor(client, "document.body.innerText.includes('穩定辨識')", "第二段觸發穩定概念");
  const frame = await evaluate(client, "JSON.parse(localStorage.getItem('edubridge-live-frame-v3'))");
  assert.equal(frame.decision.stable, true);
  assert.ok(frame.decision.supportCardId);

  await navigate(client, `${APP_URL}/learn?stage=live&student=B`);
  await waitFor(client, "document.body.innerText.includes('由我展開補充')", "學生端單一提示");
  await clickText(client, "由我展開補充");
  await waitFor(client, "document.body.innerText.includes('為什麼現在顯示？') && document.body.innerText.includes('課堂理解檢核')", "支援卡與理解檢核");
  await clickText(client, "我的呈現偏好");
  await waitFor(client, "document.body.innerText.includes('逐行聚焦')", "閱讀偏好抽屜");
  assert.equal(await evaluate(client, `(() => {
    const selects = [...document.querySelectorAll('.reading-controls select')];
    if (selects.length !== 3) return false;
    ['1.4', 'wide', 'one'].forEach((value, index) => {
      selects[index].value = value;
      selects[index].dispatchEvent(new Event('change', { bubbles: true }));
    });
    return true;
  })()`), true);
  await waitFor(client, "JSON.parse(localStorage.getItem('edubridge-support-v3-B')).reading.fontScale === 1.4", "閱讀偏好儲存");

  await client.call("Emulation.setDeviceMetricsOverride", { width: 720, height: 900, deviceScaleFactor: 2, mobile: false });
  await delay(150);
  const layout = await evaluate(client, `({
    horizontalOverflow: document.documentElement.scrollWidth > document.documentElement.clientWidth + 1,
    fontScale: getComputedStyle(document.querySelector('.learner')).getPropertyValue('--reader-scale').trim(),
    lineFocus: document.querySelector('.learner').classList.contains('focus-one'),
    unnamedButtons: [...document.querySelectorAll('button')].filter(button => !button.textContent.trim() && !button.getAttribute('aria-label')).length
  })`);
  assert.equal(layout.horizontalOverflow, false, "模擬 200% 縮放後不應出現整頁水平溢位");
  assert.equal(layout.fontScale, "1.4");
  assert.equal(layout.lineFocus, true);
  assert.equal(layout.unnamedButtons, 0);

  console.log("✓ Chrome E2E：課前準備、發布、穩定概念、學生支援及 200% 縮放全部通過");
} finally {
  client?.close();
  stopProcess(browser);
  stopProcess(server);
  if (profileDirectory?.startsWith(os.tmpdir())) rmSync(profileDirectory, { recursive: true, force: true });
}
