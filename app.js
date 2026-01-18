// app.js
// 目的：
// 1) 統一呼叫 Cloudflare Worker（解 CORS）
// 2) 任何錯誤都「完整顯示」(包含 upstream_status / upstream_head)
// 3) 提供：檔案轉 base64、簽名板、訊息顯示等共用工具

// ✅ 請確認這條是你的 Cloudflare Worker URL
const API_BASE = "https://join-form.2025-forcepower.workers.dev";

// -------------------- API --------------------
async function apiCall(body) {
  const resp = await fetch(API_BASE, {
    method: "POST",
    headers: { "Content-Type": "application/json" },
    body: JSON.stringify(body),
  });

  const text = await resp.text();

  // Worker 理論上永遠回 JSON；這段是保險
  let json;
  try {
    json = JSON.parse(text || "{}");
  } catch (e) {
    throw new Error(
      "API 回應無法解析為 JSON\n" +
      "Status: " + resp.status + "\n" +
      "Head:\n" + (text || "").slice(0, 300)
    );
  }

  // ✅ 任何錯誤都把整包 JSON 顯示出來（含 upstream_*）
  if (!json.ok) {
    throw new Error(JSON.stringify(json, null, 2));
  }

  return json.result;
}

// -------------------- DOM helpers --------------------
function qs(id) { return document.getElementById(id); }

function setMsg(el, html, kind) {
  if (!el) return;
  if (kind === "err") {
    el.innerHTML = `<pre class="err" style="white-space:pre-wrap; margin:0;">${escapeHtml(String(html))}</pre>`;
  } else if (kind === "ok") {
    el.innerHTML = `<div class="ok">${escapeHtml(String(html))}</div>`;
  } else {
    el.innerHTML = `<div>${escapeHtml(String(html))}</div>`;
  }
}

function escapeHtml(str) {
  return String(str)
    .replaceAll("&", "&amp;")
    .replaceAll("<", "&lt;")
    .replaceAll(">", "&gt;")
    .replaceAll('"', "&quot;")
    .replaceAll("'", "&#039;");
}

// -------------------- File to DataURL (base64) --------------------
function fileToDataUrl(file) {
  return new Promise((resolve, reject) => {
    if (!file) return resolve("");
    const r = new FileReader();
    r.onload = () => resolve(r.result);
    r.onerror = reject;
    r.readAsDataURL(file);
  });
}

// -------------------- Signature Canvas --------------------
// ✅ 只修改這一段：修正「空白簽名也能送出」的判定（避免空白畫布 toDataURL 仍有值）
function setupSignatureCanvas(canvas) {
  const ctx = canvas.getContext("2d");

  let drawing = false;
  let last = null;

  // ✅ 用布林值追蹤「是否真的畫過」
  let hasInk = false;

  function resize() {
    const rect = canvas.getBoundingClientRect();
    const dpr = window.devicePixelRatio || 1;

    // 設定內部像素、再用 transform 對齊視覺座標
    canvas.width = Math.floor(rect.width * dpr);
    canvas.height = Math.floor(rect.height * dpr);

    ctx.setTransform(dpr, 0, 0, dpr, 0, 0);
    ctx.lineWidth = 2;
    ctx.lineCap = "round";
    ctx.strokeStyle = "#111";
  }

  resize();
  window.addEventListener("resize", resize);

  function getPoint(e) {
    const r = canvas.getBoundingClientRect();
    const t = (e.touches && e.touches[0]) ? e.touches[0] : e;
    return { x: t.clientX - r.left, y: t.clientY - r.top };
  }

  function start(e) {
    drawing = true;
    last = getPoint(e);
  }

  function move(e) {
    if (!drawing) return;
    e.preventDefault();

    const p = getPoint(e);
    ctx.beginPath();
    ctx.moveTo(last.x, last.y);
    ctx.lineTo(p.x, p.y);
    ctx.stroke();

    // ✅ 只要有畫線就視為已簽名
    hasInk = true;

    last = p;
  }

  function end() {
    drawing = false;
    last = null;
  }

  canvas.addEventListener("mousedown", start);
  canvas.addEventListener("mousemove", move);
  window.addEventListener("mouseup", end);

  canvas.addEventListener("touchstart", start, { passive: false });
  canvas.addEventListener("touchmove", move, { passive: false });
  canvas.addEventListener("touchend", end);

  return {
    clear() {
      ctx.clearRect(0, 0, canvas.width, canvas.height);
      hasInk = false; // ✅ 清除後視為未簽名
    },
    toDataUrl() { return canvas.toDataURL("image/png"); },

    // ✅ 改成用 hasInk 判定，避免「空白畫布也有 dataURL」導致誤判
    isBlank() { return !hasInk; },
  };
}

// -------------------- Convenience wrappers (optional) --------------------
async function apiSubmitApplication(payload) {
  return apiCall({ action: "submitApplication", payload });
}

async function apiLogin(phone, password) {
  return apiCall({ action: "login", phone, password });
}

async function apiGetProfile(phone, password) {
  return apiCall({ action: "getProfile", phone, password });
}

async function apiUploadAfterLogin(phone, password, payload) {
  return apiCall({ action: "uploadAfterLogin", phone, password, payload });
}


// -------------------- Session helpers --------------------
// 用 localStorage 保存登入狀態（手機/密碼）供 portal.html 使用
function saveSession(phone, password) {
  localStorage.setItem("join_phone", String(phone || ""));
  localStorage.setItem("join_password", String(password || ""));
}

function getSession() {
  return {
    phone: localStorage.getItem("join_phone") || "",
    password: localStorage.getItem("join_password") || "",
  };
}

function clearSession() {
  localStorage.removeItem("join_phone");
  localStorage.removeItem("join_password");
}
