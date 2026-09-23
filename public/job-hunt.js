const $ = (s) => document.querySelector(s);
const $$ = (s) => document.querySelectorAll(s);

const KEYS = {
  profile: "il_candidate_profile",
  companies: "il_companies",
  jobs: "il_jobs",
  apps: "il_applications",
};

const STATUSES = ["待决定", "已投", "测评", "笔试", "面试", "Offer"];

function uid() {
  return crypto.randomUUID ? crypto.randomUUID() : String(Date.now()) + Math.random().toString(16).slice(2);
}

function load(key, fallback) {
  try {
    const raw = localStorage.getItem(key);
    return raw ? JSON.parse(raw) : fallback;
  } catch {
    return fallback;
  }
}

function save(key, value) {
  localStorage.setItem(key, JSON.stringify(value));
}

function matchScore(job, profile) {
  let score = 50;
  const dir = (profile.direction || "").toLowerCase();
  const city = (profile.city || "").toLowerCase();
  const kws = (profile.keywords || "")
    .split(/[,，、\s]+/)
    .map((s) => s.trim().toLowerCase())
    .filter(Boolean);

  const blob = `${job.title} ${job.company} ${job.city} ${job.jd || ""}`.toLowerCase();
  if (dir && blob.includes(dir)) score += 15;
  if (city && (job.city || "").toLowerCase().includes(city.split(/[/／]/)[0])) score += 15;
  for (const kw of kws) {
    if (blob.includes(kw)) score += 5;
  }
  if (job.deadline) {
    const days = (new Date(job.deadline) - new Date()) / 86400000;
    if (days >= 0 && days <= 7) score += 10;
  }
  return Math.min(99, score);
}

// ----- 偏好 -----
function loadPref() {
  const p = load(KEYS.profile, {});
  $("#pref-direction").value = p.direction || "";
  $("#pref-city").value = p.city || "";
  $("#pref-grad").value = p.grad || "";
  $("#pref-keywords").value = p.keywords || "";
  $("#pref-intern").value = p.intern || "both";
  $("#pref-resume").value = p.resume || "";
}

$("#save-pref").addEventListener("click", () => {
  const profile = {
    direction: $("#pref-direction").value.trim(),
    city: $("#pref-city").value.trim(),
    grad: $("#pref-grad").value.trim(),
    keywords: $("#pref-keywords").value.trim(),
    intern: $("#pref-intern").value,
    resume: $("#pref-resume").value.trim(),
  };
  save(KEYS.profile, profile);
  $("#pref-status").textContent = "已保存";
  renderAll();
  setTimeout(() => ($("#pref-status").textContent = ""), 1500);
});

// ----- 添加岗位 -----
$("#add-job").addEventListener("click", () => {
  const company = $("#co-name").value.trim();
  const careerUrl = $("#co-url").value.trim();
  const title = $("#job-title").value.trim();
  const city = $("#job-city").value.trim();
  const jobUrl = $("#job-url").value.trim();
  const deadline = $("#job-deadline").value;
  const jd = $("#job-jd").value.trim();

  if (!company || !title) {
    $("#add-status").textContent = "请至少填写公司名和岗位名称";
    return;
  }

  const companies = load(KEYS.companies, []);
  let co = companies.find((c) => c.name === company);
  if (!co) {
    co = { id: uid(), name: company, careerUrl, type: "", note: "" };
    companies.push(co);
    save(KEYS.companies, companies);
  } else if (careerUrl && !co.careerUrl) {
    co.careerUrl = careerUrl;
    save(KEYS.companies, companies);
  }

  const jobs = load(KEYS.jobs, []);
  const profile = load(KEYS.profile, {});
  const job = {
    id: uid(),
    companyId: co.id,
    company,
    title,
    city,
    url: jobUrl || careerUrl || "",
    jd,
    deadline: deadline || "",
    createdAt: new Date().toISOString(),
  };
  job.score = matchScore(job, profile);
  jobs.unshift(job);
  save(KEYS.jobs, jobs);

  $("#add-status").textContent = "已加入岗位库";
  $("#job-title").value = "";
  $("#job-url").value = "";
  $("#job-jd").value = "";
  renderAll();
  setTimeout(() => ($("#add-status").textContent = ""), 1500);
});

// ----- 投递 -----
function getApps() {
  return load(KEYS.apps, []);
}

function addToBoard(jobId) {
  const apps = getApps();
  if (apps.some((a) => a.jobId === jobId)) return;
  const jobs = load(KEYS.jobs, []);
  const job = jobs.find((j) => j.id === jobId);
  if (!job) return;
  const profile = load(KEYS.profile, {});
  apps.push({
    id: uid(),
    jobId,
    company: job.company,
    title: job.title,
    status: "待决定",
    appliedAt: "",
    resume: profile.resume || "",
    nextStep: "",
    note: "",
  });
  save(KEYS.apps, apps);
  renderAll();
}

function setStatus(appId, status) {
  const apps = getApps();
  const a = apps.find((x) => x.id === appId);
  if (!a) return;
  a.status = status;
  if (status === "已投" && !a.appliedAt) {
    a.appliedAt = new Date().toISOString().slice(0, 10);
  }
  save(KEYS.apps, apps);
  renderAll();
}

function removeJob(jobId) {
  let jobs = load(KEYS.jobs, []);
  jobs = jobs.filter((j) => j.id !== jobId);
  save(KEYS.jobs, jobs);
  let apps = getApps().filter((a) => a.jobId !== jobId);
  save(KEYS.apps, apps);
  renderAll();
}

// ----- 渲染 -----
function renderJobs() {
  const profile = load(KEYS.profile, {});
  const q = ($("#job-filter").value || "").trim().toLowerCase();
  let jobs = load(KEYS.jobs, []).map((j) => ({ ...j, score: matchScore(j, profile) }));
  jobs.sort((a, b) => b.score - a.score);
  if (q) {
    jobs = jobs.filter((j) =>
      `${j.company} ${j.title} ${j.city} ${j.jd || ""}`.toLowerCase().includes(q)
    );
  }
  const apps = getApps();
  const list = $("#job-list");
  if (!jobs.length) {
    list.innerHTML = `<p class="status">还没有岗位。在上方添加公司与岗位，或从「快速投递」记下的公司手动录入。</p>`;
    return;
  }
  list.innerHTML = jobs
    .map((j) => {
      const inBoard = apps.some((a) => a.jobId === j.id);
      const dl = j.deadline ? ` · 截止 ${j.deadline}` : "";
      return `
      <div class="job-card" data-id="${j.id}">
        <h3>${escapeHtml(j.title)} <span style="font-weight:400;color:#9aa0b4;font-size:12px">匹配 ${j.score}</span></h3>
        <div class="job-meta">${escapeHtml(j.company)} · ${escapeHtml(j.city || "城市未填")}${dl}</div>
        <div class="job-actions">
          ${j.url ? `<a class="btn-ghost" href="${escapeHtml(j.url)}" target="_blank" rel="noopener">官网查看</a>` : ""}
          <button class="btn-ghost" data-add="${j.id}" ${inBoard ? "disabled" : ""}>${inBoard ? "已在清单" : "加入投递清单"}</button>
          <button class="btn-danger" data-del="${j.id}">删除</button>
        </div>
      </div>`;
    })
    .join("");

  list.querySelectorAll("[data-add]").forEach((btn) => {
    btn.addEventListener("click", () => addToBoard(btn.getAttribute("data-add")));
  });
  list.querySelectorAll("[data-del]").forEach((btn) => {
    btn.addEventListener("click", () => {
      if (confirm("确定删除该岗位？")) removeJob(btn.getAttribute("data-del"));
    });
  });
}

function renderBoard() {
  const apps = getApps();
  const board = $("#board");
  board.innerHTML = STATUSES.map((st) => {
    const items = apps.filter((a) => a.status === st);
    return `
      <div class="board-row">
        <h4>${st}（${items.length}）</h4>
        ${
          items.length
            ? items
                .map(
                  (a) => `
          <div class="board-item">
            <span>${escapeHtml(a.company)} · ${escapeHtml(a.title)}</span>
            <select data-app="${a.id}">
              ${STATUSES.map((s) => `<option value="${s}" ${s === a.status ? "selected" : ""}>${s}</option>`).join("")}
            </select>
          </div>`
                )
                .join("")
            : `<div class="status" style="padding:4px 0">暂无</div>`
        }
      </div>`;
  }).join("");

  board.querySelectorAll("select[data-app]").forEach((sel) => {
    sel.addEventListener("change", () => setStatus(sel.getAttribute("data-app"), sel.value));
  });
}

function renderTodos() {
  const jobs = load(KEYS.jobs, []);
  const apps = getApps();
  const todos = [];
  const now = new Date();
  for (const j of jobs) {
    if (!j.deadline) continue;
    const d = new Date(j.deadline);
    const days = (d - now) / 86400000;
    if (days >= 0 && days <= 7) {
      todos.push({
        urgent: days <= 3,
        text: `${j.company}「${j.title}」将于 ${j.deadline} 截止（约 ${Math.ceil(days)} 天）`,
      });
    }
  }
  for (const a of apps) {
    if (a.status === "待决定") todos.push({ urgent: false, text: `待决定：${a.company} · ${a.title}` });
    if (a.status === "测评" || a.status === "笔试") todos.push({ urgent: true, text: `进行中（${a.status}）：${a.company} · ${a.title}` });
  }
  const ul = $("#todo-list");
  if (!todos.length) {
    ul.innerHTML = `<li>暂无提醒，添加带截止日期的岗位后会显示在这里</li>`;
    return;
  }
  ul.innerHTML = todos
    .slice(0, 12)
    .map((t) => `<li class="${t.urgent ? "urgent" : ""}">${escapeHtml(t.text)}</li>`)
    .join("");
}

function escapeHtml(str) {
  return String(str || "").replace(/[&<>"']/g, (c) =>
    ({ "&": "&amp;", "<": "&lt;", ">": "&gt;", '"': "&quot;", "'": "&#39;" }[c])
  );
}

function renderAll() {
  renderJobs();
  renderBoard();
  renderTodos();
}

$("#job-filter").addEventListener("input", renderJobs);

loadPref();
renderAll();
