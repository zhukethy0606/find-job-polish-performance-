const $ = (selector) => document.querySelector(selector);
const transcript = $("#transcript");
const results = $("#results");
const error = $("#error");
const pdfStatus = $("#pdf-status");
let extractedText = "";

document.querySelectorAll(".tab").forEach((tab) => {
  tab.addEventListener("click", () => {
    document.querySelectorAll(".tab").forEach((btn) => btn.classList.toggle("active", btn === tab));
    $("#paste-pane").classList.toggle("hidden", tab.dataset.tab !== "paste");
    $("#pdf-pane").classList.toggle("hidden", tab.dataset.tab !== "pdf");
  });
});

$("#load-sample").addEventListener("click", () => {
  transcript.value = `面试官：介绍一下你负责过的项目。
我：我在上一家公司负责过一个新用户转化项目。团队当时发现注册后 7 天的激活率不高，我们想通过优化引导来改善。我和设计、研发一起梳理了流程，然后上线了新版页面。最后效果还可以，用户反馈也不错。
面试官：中间遇到什么困难？
我：主要是时间比较紧，大家意见也不太一致。后来我们开会讨论了一下，最终还是按计划上线了。`;
  $("#role").value = "产品经理";
  $(".tab[data-tab='paste']").click();
  transcript.focus();
});

$("#pdf-file").addEventListener("change", async (event) => {
  const file = event.target.files?.[0];
  if (!file) return;
  if (file.size > 12 * 1024 * 1024) {
    pdfStatus.textContent = "文件请控制在 12 MB 以内。";
    return;
  }
  pdfStatus.textContent = "正在提取 PDF 中的文字…";
  try {
    const pdfjsLib = await import("/vendor/pdf.min.mjs");
    pdfjsLib.GlobalWorkerOptions.workerSrc = "/vendor/pdf.worker.min.mjs";
    const pdf = await pdfjsLib.getDocument({ data: new Uint8Array(await file.arrayBuffer()) }).promise;
    const pages = [];
    for (let pageNo = 1; pageNo <= pdf.numPages; pageNo += 1) {
      const content = await (await pdf.getPage(pageNo)).getTextContent();
      pages.push(content.items.map((item) => item.str).join(" "));
    }
    extractedText = pages.join("\n").trim();
    pdfStatus.textContent = extractedText
      ? `已读取「${file.name}」的 ${pdf.numPages} 页文字，可开始分析。`
      : "没有读到可复制文字；请上传文字版 PDF 或直接粘贴转写稿。";
  } catch (err) {
    console.error("PDF extraction failed", err);
    pdfStatus.textContent = "PDF 读取失败：请确认文件未加密且包含可复制文字；扫描版 PDF 请先做文字识别，或直接粘贴转写稿。";
  }
});

function escapeHtml(value) {
  return String(value).replace(/[&<>"']/g, (char) =>
    ({ "&": "&amp;", "<": "&lt;", ">": "&gt;", '"': "&quot;", "'": "&#39;" }[char])
  );
}

function render(data) {
  const issuesHtml = data.issues.length
    ? data.issues.map((item) => `
        <div class="issue">
          <span class="tag ${item.level}">${item.level}优先</span>
          <div class="issue-body">
            <h4>${escapeHtml(item.title)}</h4>
            <p>${escapeHtml(item.why)}</p>
            <blockquote>${escapeHtml(item.evidence)}</blockquote>
            <div class="fix"><strong>建议：</strong>${escapeHtml(item.fix)}</div>
          </div>
        </div>
      `).join("")
    : `<p style="font-size:14px;color:var(--muted)">还不错！请尝试把回答再压缩成 60 秒版本。</p>`;

  results.innerHTML = `
    <div class="results-head">
      <div>
        <h2>这份回答的复盘</h2>
        <p class="summary">${escapeHtml(data.summary)}</p>
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
        <ul>
          ${data.strengths.map((s) => `<li>${escapeHtml(s)}</li>`).join("")}
        </ul>
        <h3>下一轮可能追问</h3>
        <ol>
          ${data.followUps.map((f) => `<li>${escapeHtml(f)}</li>`).join("")}
        </ol>
      </div>
    </div>
  `;

  results.classList.remove("hidden");
  results.scrollIntoView({ behavior: "smooth", block: "start" });
}

$("#analyze").addEventListener("click", async () => {
  const text = transcript.value.trim() || extractedText;
  error.textContent = "";
  if (text.length < 40) {
    error.textContent = "请先粘贴文字稿，或上传含可复制文字的 PDF。";
    return;
  }
  const button = $("#analyze");
  button.disabled = true;
  button.textContent = "正在复盘…";
  try {
    const response = await fetch("/api/analyze", {
      method: "POST",
      headers: { "content-type": "application/json" },
      body: JSON.stringify({ text, role: $("#role").value.trim() }),
    });
    const data = await response.json();
    if (!response.ok) throw new Error(data.error);
    render(data);
  } catch (err) {
    error.textContent = err.message || "分析失败，请稍后重试。";
  } finally {
    button.disabled = false;
    button.textContent = "开始分析 →";
  }
});
