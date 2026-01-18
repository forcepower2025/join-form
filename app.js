const API_BASE = "https://join-form.2025-forcepower.workers.dev";

async function apiCall(body) {
  const resp = await fetch(API_BASE, {
    method: "POST",
    headers: { "Content-Type": "application/json" },
    body: JSON.stringify(body),
  });

  const text = await resp.text(); // 先拿純文字
  let json;

  try {
    json = JSON.parse(text);
  } catch (e) {
    // 這裡就是你現在的問題：回來的是 HTML
    throw new Error(
      "API 回傳不是 JSON（可能是 HTML）。前 200 字：\n" +
      text.slice(0, 200)
    );
  }

  if (!json.ok) throw new Error(json.error || "API error");
  return json.result;
}


function qs(id){ return document.getElementById(id); }

function fileToDataUrl(file){
  return new Promise((resolve, reject)=>{
    if (!file) return resolve("");
    const r = new FileReader();
    r.onload = ()=> resolve(r.result);
    r.onerror = reject;
    r.readAsDataURL(file);
  });
}

function setupSignatureCanvas(canvas){
  const ctx = canvas.getContext("2d");

  function resize(){
    const rect = canvas.getBoundingClientRect();
    const dpr = window.devicePixelRatio || 1;
    canvas.width = Math.floor(rect.width * dpr);
    canvas.height = Math.floor(rect.height * dpr);
    ctx.setTransform(dpr,0,0,dpr,0,0);
    ctx.lineWidth = 2;
    ctx.lineCap = "round";
    ctx.strokeStyle = "#111";
  }
  resize();
  window.addEventListener("resize", resize);

  let drawing = false;
  let last = null;

  function pos(e){
    const r = canvas.getBoundingClientRect();
    const t = (e.touches && e.touches[0]) ? e.touches[0] : e;
    return { x: t.clientX - r.left, y: t.clientY - r.top };
  }

  function start(e){
    drawing = true;
    last = pos(e);
  }
  function move(e){
    if (!drawing) return;
    e.preventDefault();
    const p = pos(e);
    ctx.beginPath();
    ctx.moveTo(last.x, last.y);
    ctx.lineTo(p.x, p.y);
    ctx.stroke();
    last = p;
  }
  function end(){
    drawing = false;
    last = null;
  }

  canvas.addEventListener("mousedown", start);
  canvas.addEventListener("mousemove", move);
  window.addEventListener("mouseup", end);

  canvas.addEventListener("touchstart", start, {passive:false});
  canvas.addEventListener("touchmove", move, {passive:false});
  canvas.addEventListener("touchend", end);

  return {
    clear(){ ctx.clearRect(0,0,canvas.width,canvas.height); },
    toDataUrl(){ return canvas.toDataURL("image/png"); },
    isBlank(){
      const c = document.createElement("canvas");
      c.width = canvas.width; c.height = canvas.height;
      return canvas.toDataURL() === c.toDataURL();
    }
  };
}

function setMsg(el, text, kind){
  el.innerHTML = `<div class="${kind}">${text}</div>`;
}

function saveSession(phone, password){
  sessionStorage.setItem("phone", phone);
  sessionStorage.setItem("password", password);
}
function loadSession(){
  return {
    phone: sessionStorage.getItem("phone") || "",
    password: sessionStorage.getItem("password") || "",
  };
}
function clearSession(){
  sessionStorage.removeItem("phone");
  sessionStorage.removeItem("password");
}
