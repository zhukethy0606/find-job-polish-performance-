// 动态加载 Tesseract（仅截图时用）
async function loadTesseract() {
  if (window.Tesseract) return window.Tesseract;
  await new Promise((resolve, reject) => {
    const s = document.createElement("script");
    s.src = "https://cdn.jsdelivr.net/npm/tesseract.js@5/dist/tesseract.min.js";
    s.onload = resolve;
    s.onerror = () => reject(new Error("OCR 脚本加载失败"));
    document.head.appendChild(s);
  });
  return window.Tesseract;
}

const $ = (s) => document.querySelector(s);
const $$ = (s) => document.querySelectorAll(s);

function escapeHtml(str) {
  return String(str).replace(/[&<>"']/g, (c) =>
    ({ "&": "&amp;", "<": "&lt;", ">": "&gt;", '"': "&quot;", "'": "&#39;" }[c])
  );
}

// ========== 页面切换：快速投递 / 面试复盘 ==========
$$(".page-tab").forEach((tab) => {
  tab.addEventListener("click", () => {
    $$(".page-tab").forEach((t) => t.classList.remove("active"));
    tab.classList.add("active");
    const page = tab.dataset.page;
    $("#page-quick")?.classList.toggle("hidden", page !== "quick");
    $("#page-review")?.classList.toggle("hidden", page !== "review");
  });
});

// ========== 提取方式切换：链接 / 文字 / 截图 ==========
$$("[data-extract-tab]").forEach((tab) => {
  tab.addEventListener("click", () => {
    $$("[data-extract-tab]").forEach((t) => t.classList.remove("active"));
    tab.classList.add("active");
    const mode = tab.dataset.extractTab;
    $("#extract-url-pane")?.classList.toggle("hidden", mode !== "url");
    $("#extract-text-pane")?.classList.toggle("hidden", mode !== "text");
    $("#extract-image-pane")?.classList.toggle("hidden", mode !== "image");
  });
});

// ========== 通用提取 ==========
async function doExtract(payload) {
  const status = $("#extract-status");
  const error = $("#extract-error");
  const results = $("#company-results");

  if (error) error.textContent = "";
  if (results) {
    results.classList.add("hidden");
    results.innerHTML = "";
  }
  if (status) status.textContent = "正在提取公司名…";

  try {
    const res = await fetch("/api/extract-companies", {
      method: "POST",
      headers: { "content-type": "application/json" },
      body: JSON.stringify(payload),
    });
    const data = await res.json();
    if (!res.ok) throw new Error(data.error || "提取失败");

    if (status) {
      status.textContent = data.companies?.length
        ? `共找到 ${data.companies.length} 个可能的公司`
        : "未识别到明显的公司名，可尝试换一段内容或更清晰的截图";
    }

    if (data.companies?.length && results) {
      results.innerHTML = data.companies
        .map((name) => {
          const q = encodeURIComponent(name + " 招聘官网");
          return `
            <div class="company-card">
              <div class="company-name">${escapeHtml(name)}</div>
              <div class="search-btns">
                <a class="google" href="https://www.google.com/search?q=${q}" target="_blank" rel="noopener">Google 搜索</a>
                <a class="baidu" href="https://www.baidu.com/s?wd=${q}" target="_blank" rel="noopener">百度搜索</a>
                <a class="safari" href="https://www.google.com/search?q=${q}" target="_blank" rel="noopener">Safari 打开</a>
              </div>
            </div>`;
        })
        .join("");
      results.classList.remove("hidden");
    }
  } catch (err) {
    if (error) error.textContent = err.message || "提取失败，请稍后重试";
    if (status) status.textContent = "";
  }
}

// ----- 链接提取 -----
const extractBtn = $("#extract-btn");
if (extractBtn) {
  extractBtn.addEventListener("click", async () => {
    const url = ($("#post-url")?.value || "").trim();
    if (!url || !/^https?:\/\//i.test(url)) {
      if ($("#extract-error")) $("#extract-error").textContent = "请输入有效的帖子链接（以 http 或 https 开头）";
      return;
    }
    extractBtn.disabled = true;
    extractBtn.textContent = "正在提取…";
    await doExtract({ url });
    extractBtn.disabled = false;
    extractBtn.textContent = "提取公司 →";
  });
}

// ----- 文字提取 -----
const extractTextBtn = $("#extract-text-btn");
if (extractTextBtn) {
  extractTextBtn.addEventListener("click", async () => {
    const text = ($("#post-text")?.value || "").trim();
    if (text.length < 10) {
      if ($("#extract-error")) $("#extract-error").textContent = "请粘贴至少 10 个字的帖子内容";
      return;
    }
    extractTextBtn.disabled = true;
    extractTextBtn.textContent = "正在提取…";
    await doExtract({ text });
    extractTextBtn.disabled = false;
    extractTextBtn.textContent = "提取公司 →";
  });
}

// ----- 截图 OCR + 提取 -----
let selectedImageFile = null;

const imageInput = $("#post-image");
const extractImageBtn = $("#extract-image-btn");
const imageDropzone = $("#image-dropzone");
const imagePreviewName = $("#image-preview-name");

function setImageFile(file) {
  if (!file || !file.type.startsWith("image/")) {
    if ($("#extract-error")) $("#extract-error").textContent = "请选择图片文件（jpg / png / webp 等）";
    return;
  }
  if (file.size > 8 * 1024 * 1024) {
    if ($("#extract-error")) $("#extract-error").textContent = "图片请控制在 8MB 以内";
    return;
  }
  selectedImageFile = file;
  if ($("#extract-error")) $("#extract-error").textContent = "";
  if (imagePreviewName) imagePreviewName.textContent = `已选择：${file.name}`;
  if (extractImageBtn) extractImageBtn.disabled = false;
}

if (imageInput) {
  imageInput.addEventListener("change", (e) => {
    const file = e.target.files?.[0];
    if (file) setImageFile(file);
  });
}

if (imageDropzone) {
  ["dragenter", "dragover"].forEach((ev) => {
    imageDropzone.addEventListener(ev, (e) => {
      e.preventDefault();
      imageDropzone.style.borderColor = "#8b7cff";
    });
  });
  ["dragleave", "drop"].forEach((ev) => {
    imageDropzone.addEventListener(ev, (e) => {
      e.preventDefault();
      imageDropzone.style.borderColor = "";
    });
  });
  imageDropzone.addEventListener("drop", (e) => {
    const file = e.dataTransfer?.files?.[0];
    if (file) setImageFile(file);
  });
}

if (extractImageBtn) {
  extractImageBtn.addEventListener("click", async () => {
    if (!selectedImageFile) {
      if ($("#extract-error")) $("#extract-error").textContent = "请先选择一张截图";
      return;
    }

    extractImageBtn.disabled = true;
    extractImageBtn.textContent = "识别中…";
    if ($("#extract-error")) $("#extract-error").textContent = "";
    if ($("#extract-status")) $("#extract-status").textContent = "正在识别截图中的文字（首次可能稍慢）…";

    try {
      const Tesseract = await loadTesseract();
      const result = await Tesseract.recognize(selectedImageFile, "chi_sim+eng", {
        logger: (m) => {
          if (m.status === "recognizing text" && m.progress != null && $("#extract-status")) {
            $("#extract-status").textContent = `正在识别文字… ${Math.round(m.progress * 100)}%`;
          }
        },
      });
      const text = (result?.data?.text || "").trim();
      if (text.length < 5) {
        throw new Error("图中几乎没有识别到文字，请换更清晰的截图");
      }
      if ($("#extract-status")) $("#extract-status").textContent = `已识别约 ${text.length} 字，正在提取公司…`;
      await doExtract({ text });
    } catch (err) {
      if ($("#extract-error")) $("#extract-error").textContent = err.message || "截图识别失败，请重试或改用粘贴文字";
      if ($("#extract-status")) $("#extract-status").textContent = "";
    } finally {
      extractImageBtn.disabled = false;
      extractImageBtn.textContent = "提取公司 →";
    }
  });
}

// ========== Page 2: 面试复盘 ==========
const transcript = $("#transcript");
const results = $("#results");
const errorEl = $("#error");
const pdfStatus = $("#pdf-status");
let extractedText = "";

$$(".tab").forEach((tab) => {
  tab.addEventListener("click", () => {
    // 只处理面试复盘里的 tab（带 data-tab，且不是 extract-tab）
    if (!tab.dataset.tab) return;
    $$(".tab").forEach((b) => {
      if (b.dataset.tab) b.classList.toggle("active", b === tab);
    });
    $("#paste-pane")?.classList.toggle("hidden", tab.dataset.tab !== "paste");
    $("#pdf-pane")?.classList.toggle("hidden", tab.dataset.tab !== "pdf");
  });
});

const loadSample = $("#load-sample");
if (loadSample) {
  loadSample.addEventListener("click", () => {
    if (transcript) {
      transcript.value = `面试官：介绍一下你负责过的项目。
我：我在上一家公司负责过一个新用户转化项目。团队当时发现注册后 7 天的激活率不高，我们想通过优化引导来改善。我和设计、研发一起梳理了流程，然后上线了新版页面。最后效果还可以，用户反馈也不错。
面试官：中间遇到什么困难？
我：主要是时间比较紧，大家意见也不太一致。后来我们开会讨论了一下，最终还是按计划上线了。`;
    }
    if ($("#role")) $("#role").value = "产品经理";
    const pasteTab = $(".tab[data-tab='paste']");
    if (pasteTab) pasteTab.click();
    transcript?.focus();
  });
}

const pdfFile = $("#pdf-file");
if (pdfFile) {
  pdfFile.addEventListener("change", async (event) => {
    const file = event.target.files?.[0];
    if (!file) return;
    if (file.size > 12 * 1024 * 1024) {
      if (pdfStatus) pdfStatus.textContent = "文件请控制在 12 MB 以内。";
      return;
    }
    if (pdfStatus) pdfStatus.textContent = "正在提取 PDF 中的文字…";
    try {
      const pdfjsLib = await import("https://cdnjs.cloudflare.com/ajax/libs/pdf.js/4.4.168/pdf.min.mjs");
      pdfjsLib.GlobalWorkerOptions.workerSrc =
        "https://cdnjs.cloudflare.com/ajax/libs/pdf.js/4.4.168/pdf.worker.min.mjs";
      const pdf = await pdfjsLib.getDocument({ data: new Uint8Array(await file.arrayBuffer()) }).promise;
      const pages = [];
      for (let i = 1; i <= pdf.numPages; i++) {
        const content = await (await pdf.getPage(i)).getTextContent();
        pages.push(content.items.map((item) => item.str).join(" "));
      }
      extractedText = pages.join("\n").trim();
      if (pdfStatus) {
        pdfStatus.textContent = extractedText
          ? `已读取「${file.name}」的 ${pdf.numPages} 页文字，可开始分析。`
          : "没有读到可复制文字；请上传文字版 PDF 或直接粘贴转写稿。";
      }
    } catch (err) {
      console.error(err);
      if (pdfStatus) pdfStatus.textContent = "PDF 读取失败：请确认文件未加密且包含可复制文字。";
    }
  });
}

function render(data) {
  if (!results) return;
  const issuesHtml = data.issues?.length
    ? data.issues
        .map(
          (item) => `
        <div class="issue">
          <span class="tag ${item.level}">${item.level}优先</span>
          <div class="issue-body">
            <h4>${escapeHtml(item.title)}</h4>
            <p>${escapeHtml(item.why)}</p>
            <blockquote>${escapeHtml(item.evidence)}</blockquote>
            <div class="fix"><strong>建议：</strong>${escapeHtml(item.fix)}</div>
          </div>
        </div>`
        )
        .join("")
    : `<p style="font-size:14px;color:var(--muted)">还不错！请尝试把回答再压缩成 60 秒版本。</p>`;

  results.innerHTML = `
    <div class="results-head">
      <div>
        <h2>这份回答的复盘</h2>
        <p class="summary">${escapeHtml(data.summary || "")}</p>
      </div>
      <div class="score-box">
        <div class="num">${data.score}</div>
        <div class="label">/ 100 表达准备度</div>
      </div>
    </div>
    <div class="stats-row">
      <div class="stat"><strong>${data.wordCount}</strong> 字文字稿</div>
      <div class="stat"><strong>${data.metrics}</strong> 个量化信息</div>
      <div class="stat"><strong>${data.filler}</strong> 处缓冲词</div>
    </div>
    <div class="result-grid">
      <section>
        <h3>优先改进</h3>
        ${issuesHtml}
      </section>
      <div class="side-panel">
        <h3>已有基础</h3>
        <ul>${(data.strengths || []).map((s) => `<li>${escapeHtml(s)}</li>`).join("")}</ul>
        <h3>下一轮可能追问</h3>
        <ol>${(data.followUps || []).map((f) => `<li>${escapeHtml(f)}</li>`).join("")}</ol>
      </div>
    </div>`;
  results.classList.remove("hidden");
  results.scrollIntoView({ behavior: "smooth", block: "start" });
}

const analyzeBtn = $("#analyze");
if (analyzeBtn) {
  analyzeBtn.addEventListener("click", async () => {
    const text = (transcript?.value || "").trim() || extractedText;
    if (errorEl) errorEl.textContent = "";
    if (text.length < 40) {
      if (errorEl) errorEl.textContent = "请先粘贴文字稿，或上传含可复制文字的 PDF。";
      return;
    }
    analyzeBtn.disabled = true;
    analyzeBtn.textContent = "正在复盘…";
    try {
      const response = await fetch("/api/analyze", {
        method: "POST",
        headers: { "content-type": "application/json" },
        body: JSON.stringify({ text, role: ($("#role")?.value || "").trim() }),
      });
      const data = await response.json();
      if (!response.ok) throw new Error(data.error);
      render(data);
    } catch (err) {
      if (errorEl) errorEl.textContent = err.message || "分析失败，请稍后重试。";
    } finally {
      analyzeBtn.disabled = false;
      analyzeBtn.textContent = "开始分析 →";
    }
  });
}
