1	// app.js
2	// 目的：
3	// 1) 統一呼叫 Cloudflare Worker（解 CORS）
4	// 2) 任何錯誤都「完整顯示」(包含 upstream_status / upstream_head)
5	// 3) 提供：檔案轉 base64、簽名板、訊息顯示等共用工具
6	
7	// ✅ 請確認這條是你的 Cloudflare Worker URL
8	const API_BASE = "https://join-form.2025-forcepower.workers.dev";
9	
10	// -------------------- API --------------------
11	async function apiCall(body) {
12	  const resp = await fetch(API_BASE, {
13	    method: "POST",
14	    headers: { "Content-Type": "application/json" },
15	    body: JSON.stringify(body),
16	  });
17	
18	  const text = await resp.text();
19	
20	  // Worker 理論上永遠回 JSON；這段是保險
21	  let json;
22	  try {
23	    json = JSON.parse(text || "{}");
24	  } catch (e) {
25	    throw new Error(
26	      "API 回應無法解析為 JSON\n" +
27	      "Status: " + resp.status + "\n" +
28	      "Head:\n" + (text || "").slice(0, 300)
29	    );
30	  }
31	
32	  // ✅ 任何錯誤都把整包 JSON 顯示出來（含 upstream_*）
33	  if (!json.ok) {
34	    throw new Error(JSON.stringify(json, null, 2));
35	  }
36	
37	  return json.result;
38	}
39	
40	// -------------------- DOM helpers --------------------
41	function qs(id) { return document.getElementById(id); }
42	
43	function setMsg(el, html, kind) {
44	  if (!el) return;
45	  if (kind === "err") {
46	    el.innerHTML = `<pre class="err" style="white-space:pre-wrap; margin:0;">${escapeHtml(String(html))}</pre>`;
47	  } else if (kind === "ok") {
48	    el.innerHTML = `<div class="ok">${escapeHtml(String(html))}</div>`;
49	  } else {
50	    el.innerHTML = `<div>${escapeHtml(String(html))}</div>`;
51	  }
52	}
53	
54	function escapeHtml(str) {
55	  return String(str)
56	    .replaceAll("&", "&amp;")
57	    .replaceAll("<", "&lt;")
58	    .replaceAll(">", "&gt;")
59	    .replaceAll('"', "&quot;")
60	    .replaceAll("'", "&#039;");
61	}
62	
63	// -------------------- File to DataURL (base64) --------------------
64	function fileToDataUrl(file) {
65	  return new Promise((resolve, reject) => {
66	    if (!file) return resolve("");
67	    const r = new FileReader();
68	    r.onload = () => resolve(r.result);
69	    r.onerror = reject;
70	    r.readAsDataURL(file);
71	  });
72	}
73	
74	// -------------------- Signature Canvas --------------------
75	// ✅ 只修改這一段：修正「空白簽名也能送出」的判定（避免空白畫布 toDataURL 仍有值）
76	function setupSignatureCanvas(canvas) {
77	  const ctx = canvas.getContext("2d");
78	
79	  let drawing = false;
80	  let last = null;
81	
82	  // ✅ 用布林值追蹤「是否真的畫過」
83	  let hasInk = false;
84	
85	  function resize() {
86	    const rect = canvas.getBoundingClientRect();
87	    const dpr = window.devicePixelRatio || 1;
88	
89	    // 設定內部像素、再用 transform 對齊視覺座標
90	    canvas.width = Math.floor(rect.width * dpr);
91	    canvas.height = Math.floor(rect.height * dpr);
92	
93	    ctx.setTransform(dpr, 0, 0, dpr, 0, 0);
94	    ctx.lineWidth = 2;
95	    ctx.lineCap = "round";
96	    ctx.strokeStyle = "#111";
97	  }
98	
99	  resize();
100	  window.addEventListener("resize", resize);
101	
102	  function getPoint(e) {
103	    const r = canvas.getBoundingClientRect();
104	    const t = (e.touches && e.touches[0]) ? e.touches[0] : e;
105	    return { x: t.clientX - r.left, y: t.clientY - r.top };
106	  }
107	
108	  function start(e) {
109	    drawing = true;
110	    last = getPoint(e);
111	  }
112	
113	  function move(e) {
114	    if (!drawing) return;
115	    e.preventDefault();
116	
117	    const p = getPoint(e);
118	    ctx.beginPath();
119	    ctx.moveTo(last.x, last.y);
120	    ctx.lineTo(p.x, p.y);
121	    ctx.stroke();
122	
123	    // ✅ 只要有畫線就視為已簽名
124	    hasInk = true;
125	
126	    last = p;
127	  }
128	
129	  function end() {
130	    drawing = false;
131	    last = null;
132	  }
133	
134	  canvas.addEventListener("mousedown", start);
135	  canvas.addEventListener("mousemove", move);
136	  window.addEventListener("mouseup", end);
137	
138	  canvas.addEventListener("touchstart", start, { passive: false });
139	  canvas.addEventListener("touchmove", move, { passive: false });
140	  canvas.addEventListener("touchend", end);
141	
142	  return {
143	    clear() {
144	      ctx.clearRect(0, 0, canvas.width, canvas.height);
145	      hasInk = false; // ✅ 清除後視為未簽名
146	    },
147	    toDataUrl() { return canvas.toDataURL("image/png"); },
148	
149	    // ✅ 改成用 hasInk 判定，避免「空白畫布也有 dataURL」導致誤判
150	    isBlank() { return !hasInk; },
151	  };
152	}
153	
154	// -------------------- Convenience wrappers (optional) --------------------
155	async function apiSubmitApplication(payload) {
156	  return apiCall({ action: "submitApplication", payload });
157	}
158	
159	async function apiLogin(phone, password, city, district) {
160	  return apiCall({ action: "login", phone, password, city, district });
161	}
162	
163	async function apiGetProfile(phone, password, city, district) {
164	  return apiCall({ action: "getProfile", phone, password, city, district });
165	}
166	
167	async function apiUploadAfterLogin(phone, password, city, district, payload) {
168	  return apiCall({ action: "uploadAfterLogin", phone, password, city, district, payload });
169	}
170	
171	
172	// -------------------- Session helpers --------------------
173	// 用 localStorage 保存登入狀態（手機/密碼）供 portal.html 使用
174	function saveSession(phone, password, city, district) {
175	  localStorage.setItem("join_phone", String(phone || ""));
176	  localStorage.setItem("join_password", String(password || ""));
177	  localStorage.setItem("join_city", String(city || ""));
178	  localStorage.setItem("join_district", String(district || ""));
179	}
180	
181	function getSession() {
182	  return {
183	    phone: localStorage.getItem("join_phone") || "",
184	    password: localStorage.getItem("join_password") || "",
185	    city: localStorage.getItem("join_city") || "",
186	    district: localStorage.getItem("join_district") || "",
187	  };
188	}
189	
190	
191	function clearSession() {
192	  localStorage.removeItem("join_phone");
193	  localStorage.removeItem("join_password");
194	  localStorage.removeItem("join_city");
195	  localStorage.removeItem("join_district");
196	}
197	
198	
199	function loadSession() {
200	  return getSession();
201	}
