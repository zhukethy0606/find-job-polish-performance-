import { handleFindJobs } from "./find-jobs.js";

const json = (body, status = 200) =>
  new Response(JSON.stringify(body), {
    status,
    headers: { "content-type": "application/json; charset=utf-8", "cache-control": "no-store" },
  });

const clean = (text) => text.replace(/\s+/g, " ").trim();
const sentences = (text) => text.split(/(?<=[。！？!?；;])\s*|\n+/).map(clean).filter(Boolean);
const count = (text, pattern) => (text.match(pattern) || []).length;

function findEvidence(items, pattern) {
  return items.find((item) => pattern.test(item)) || "文字稿中没有找到明确例子";
}

function analyze(text, role) {
  const normalized = clean(text);
  const parts = sentences(text);
  const words = normalized.length;
  const filler = count(normalized, /\b(然后|就是|那个|其实|可能|应该|感觉|basically|actually|like)\b/gi);
  const metrics = count(normalized, /\d+(?:\.\d+)?\s*(?:%|个|人|万|千|天|周|月|倍|小时|分钟)/g);
  const examples = count(normalized, /(?:例如|比如|一次|当时|项目|案例|负责|主导|结果|成果|上线|优化)/g);
  const questions = count(normalized, /[？?]/g);
  const issues = [];
  if (words < 280) issues.push({ level: "高", title: "信息密度不足", why: "文字稿较短，难以体现完整的思考、行动和结果。", evidence: `当前约 ${words} 字`, fix: "每个核心问题至少补齐：背景 → 任务 → 行动 → 结果 → 复盘。" });
  if (metrics < 2) issues.push({ level: "高", title: "成果缺少量化", why: "回答里几乎没有可验证的结果，容易显得贡献模糊。", evidence: findEvidence(parts, /负责|项目|优化|结果/), fix: "补充规模、周期、转化率、成本、效率或质量变化；说不准精确数值时给区间与口径。" });
  if (examples < 3) issues.push({ level: "中", title: "具体案例不够", why: "观点多、场景少，面试官无法判断你的实际做法。", evidence: "未发现足够多的项目/案例锚点", fix: "准备 2–3 个可迁移案例，分别覆盖成功、困难和冲突/失败复盘。" });
  if (!/(我\s*(?:负责|主导|推动|做了|设计|解决|协调|决定)|我的)/.test(normalized)) issues.push({ level: "中", title: "个人贡献不清晰", why: "表达更像团队介绍，个人职责与决策边界没有被说出来。", evidence: findEvidence(parts, /团队|我们|项目/), fix: "用“我负责…”开头，明确你做的判断、动作、协作对象和最终产出。" });
  if (filler > 8) issues.push({ level: "中", title: "表达有较多缓冲词", why: "口语填充词会削弱结论感和自信。", evidence: `检测到约 ${filler} 处缓冲词`, fix: "先给结论，再给两点依据；停顿比“然后/就是”更有力量。" });
  if (!/(挑战|困难|问题|失败|冲突|风险|复盘|改进)/.test(normalized)) issues.push({ level: "低", title: "缺少困难与复盘", why: "没有展示面对不确定性时的判断与成长。", evidence: "没有看到清晰的困难—应对—复盘链路", fix: "补一个失败或阻力最大的案例，强调如何识别风险、调整方案和沉淀方法。" });
  if (questions === 0) issues.push({ level: "低", title: "没有看到反问准备", why: "反问能展示你对岗位、团队和成功标准的理解。", evidence: "文字稿未包含问面试官的问题", fix: "准备 3 个反问：入职 90 天成功标准、团队当前瓶颈、该岗位为何现在开放。" });
  const score = Math.max(42, Math.min(92, 90 - issues.reduce((sum, item) => sum + ({ 高: 12, 中: 7, 低: 4 }[item.level]), 0) + Math.min(metrics, 6)));
  const strengths = [
    examples >= 3 ? "有项目语境，回答不完全停留在抽象观点。" : "已提供可继续打磨的原始表达。",
    metrics >= 2 ? "开始用结果和数据支撑贡献。" : "有机会通过补充量化结果显著提升说服力。",
    words >= 280 ? "素材量足以整理出完整回答框架。" : "适合先选一个核心案例做深度打磨。",
  ];
  const followUps = [
    `如果面试官追问“你在这个${role || "岗位"}项目中具体做了什么”，请用 60 秒讲清你的职责边界和关键动作。`,
    "你如何证明方案有效？请准备一个前后对比数据，以及数据口径。",
    "如果重做一次，你会优先改变哪一步？为什么？",
  ];
  return { score, wordCount: words, metrics, filler, strengths, issues: issues.slice(0, 5), followUps, summary: issues.length ? "建议优先补强高优先级项，再练习用 STAR 结构压缩表达。" : "基础表达较完整；下一步请重点练习更短、更有结论的版本。" };
}

// 规则提取（备用）
function extractCompaniesByRule(text) {
  const companies = new Set();
  const cnPattern = /([\u4e00-\u9fa5]{2,12}(?:科技|网络|信息|软件|互联网|集团|控股|股份|有限公司|公司|银行|证券|保险|医院|大学|研究院|中心))/g;
  let m;
  while ((m = cnPattern.exec(text)) !== null) {
    const name = m[1].replace(/(的|和|与|及|等)$/, "").trim();
    if (name.length >= 3 && name.length <= 16) companies.add(name);
  }
  const enPattern = /\b([A-Z][A-Za-z0-9&.\-]{1,20}(?:\s+[A-Z][A-Za-z0-9&.\-]{1,15}){0,3})\b/g;
  while ((m = enPattern.exec(text)) !== null) {
    const name = m[1].trim();
    if (name.length >= 2 && !/^(The|And|For|With|This|That|From)$/i.test(name)) {
      companies.add(name);
    }
  }
  return Array.from(companies).slice(0, 15);
}

// DeepSeek 提取公司
async function extractCompaniesByAI(text, apiKey) {
  const prompt = `从下面这段文字中提取所有提到的公司名称（包括中文和英文公司）。
只返回公司名，用 JSON 数组格式，例如：["字节跳动","阿里巴巴","Google"]
不要解释，不要其他文字。如果没有公司就返回 []。

文字内容：
${text.slice(0, 8000)}`;

  const resp = await fetch("https://api.deepseek.com/v1/chat/completions", {
    method: "POST",
    headers: {
      "Content-Type": "application/json",
      Authorization: `Bearer ${apiKey}`,
    },
    body: JSON.stringify({
      model: "deepseek-chat",
      messages: [
        { role: "system", content: "你是一个只输出 JSON 的助手。" },
        { role: "user", content: prompt },
      ],
      temperature: 0.1,
      max_tokens: 500,
    }),
  });

  if (!resp.ok) {
    const errText = await resp.text();
    throw new Error(`DeepSeek API 错误: ${resp.status} ${errText}`);
  }

  const data = await resp.json();
  const content = data.choices?.[0]?.message?.content || "[]";
  // 尝试解析 JSON
  const match = content.match(/\[[\s\S]*\]/);
  if (!match) return [];
  try {
    const list = JSON.parse(match[0]);
    return Array.isArray(list) ? list.map(String).filter(Boolean).slice(0, 15) : [];
  } catch {
    return [];
  }
}

export default {
  async fetch(request, env) {
    const url = new URL(request.url);

    if (url.pathname === "/api/find-jobs") {
      if (request.method !== "POST") return json({ error: "Method not allowed" }, 405);
      return handleFindJobs(request, env);
    }

    if (url.pathname === "/api/analyze") {
      if (request.method !== "POST") return json({ error: "Method not allowed" }, 405);
      try {
        const { text, role } = await request.json();
        if (typeof text !== "string" || clean(text).length < 40) {
          return json({ error: "请至少提供 40 个字符的文字稿。" }, 400);
        }
        if (text.length > 60000) return json({ error: "一次最多分析 60,000 个字符。" }, 413);
        return json(analyze(text, typeof role === "string" ? role.slice(0, 100) : ""));
      } catch (error) {
        return json({ error: "无法读取内容，请检查后重试。" }, 400);
      }
    }

    // 提取公司（支持 url 或 text）
    if (url.pathname === "/api/extract-companies") {
      if (request.method !== "POST") return json({ error: "Method not allowed" }, 405);
      try {
        const body = await request.json();
        let text = "";

        if (body.text && typeof body.text === "string") {
          text = body.text.trim();
        } else if (body.url && /^https?:\/\//i.test(body.url)) {
          const resp = await fetch(body.url, {
            headers: {
              "User-Agent": "Mozilla/5.0 (compatible; InterviewLab/1.0)",
              Accept: "text/html,application/xhtml+xml",
            },
            redirect: "follow",
          });
          if (!resp.ok) return json({ error: `无法访问该链接（${resp.status}）` }, 400);
          const html = await resp.text();
          text = html
            .replace(/<script[^>]*>[\s\S]*?<\/script>/gi, " ")
            .replace(/<style[^>]*>[\s\S]*?<\/style>/gi, " ")
            .replace(/<[^>]+>/g, " ")
            .replace(/\s+/g, " ")
            .slice(0, 30000);
        } else {
          return json({ error: "请提供帖子链接或文字内容" }, 400);
        }

        if (text.length < 10) {
          return json({ error: "内容太少，无法提取" }, 400);
        }

        let companies = [];
        // 优先用 DeepSeek
        if (env.DEEPSEEK_API_KEY) {
          try {
            companies = await extractCompaniesByAI(text, env.DEEPSEEK_API_KEY);
          } catch (e) {
            console.log("AI extract failed, fallback to rule", e.message);
          }
        }
        // 失败或结果为空时用规则
        if (!companies.length) {
          companies = extractCompaniesByRule(text);
        }

        return json({ companies, textLength: text.length });
      } catch (e) {
        console.log("extract error", e.message);
        return json({ error: "提取失败，请稍后重试或直接粘贴文字" }, 400);
      }
    }

    return env.ASSETS.fetch(request);
  },
};
