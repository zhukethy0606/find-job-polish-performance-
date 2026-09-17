// 在公司名后做一轮搜索，找官网招聘页
async function findCareersPage(company, env) {
  const q = encodeURIComponent(`${company} 招聘 官网 careers`);
  const res = await fetch(
    `https://api.search.brave.com/res/v1/web/search?q=${q}&count=5&search_lang=zh-hans`,
    { headers: { "X-Subscription-Token": env.BRAVE_API_KEY, Accept: "application/json" } }
  );
  if (!res.ok) return null;
  const data = await res.json();
  const results = data.web?.results ?? [];
  // 优先官网 careers/jobs 路径，其次主流招聘平台，再其次官网首页
  const rank = (u = "") => {
    if (/careers|jobs|join|zhaopin|招聘/i.test(u)) return 0;
    if (/zhipin\.com|lagou\.com|liepin\.com/.test(u)) return 1;
    return 2;
  };
  results.sort((a, b) => rank(a.url) - rank(b.url));
  return results[0]?.url ?? null;
}

// 从帖子正文提取公司名：规则字典 + 后缀匹配
async function extractCompanies(text) {
  const dict = ["字节跳动","腾讯","阿里巴巴","美团","百度","京东","网易","华为","小米","滴滴","快手","拼多多","小红书","B站","哔哩哔哩","宁德时代","比亚迪","大疆","商汤","旷视","携程","蔚来","理想汽车","小鹏汽车","蚂蚁集团","阿里云","腾讯云","飞书","钉钉","贝壳","得物","Soul","米哈游","莉莉丝","吉比特"];
  const blacklist = ["我们公司","该公司","大公司","小公司","公司","集团公司","科技公司","创业公司","这家公司"];
  const found = new Set(dict.filter((d) => text.includes(d)));
  const re = /([\u4e00-\u9fa5A-Za-z0-9]{2,15}(?:公司|集团|科技|网络|信息|智能))/g;
  for (const m of text.matchAll(re)) {
    if (!blacklist.includes(m[1])) found.add(m[1]);
  }
  return [...found].slice(0, 10);
}

// 抓取帖子正文：直连失败则回退 r.jina.ai 阅读器（能处理 JS 渲染和多数反爬）
async function fetchPostText(url) {
  let html = null;
  try {
    const ctrl = new AbortController();
    setTimeout(() => ctrl.abort(), 8000);
    const res = await fetch(url, {
      signal: ctrl.signal,
      headers: { "User-Agent": "Mozilla/5.0 (Windows NT 10.0; Win64; x64) AppleWebKit/537.36 (KHTML, like Gecko) Chrome/124.0 Safari/537.36" },
    });
    if (res.ok) html = await res.text();
  } catch { /* fall through to jina */ }
  if (html && html.length > 500) {
    return html
      .replace(/<script[\s\S]*?<\/script>|<style[\s\S]*?<\/style>/gi, " ")
      .replace(/<[^>]+>/g, " ")
      .replace(/\s+/g, " ");
  }
  const r2 = await fetch(`https://r.jina.ai/${url}`);
  const t = await r2.text();
  if (t.length > 200 && !/429|402|403/.test(t.slice(0, 100))) return t;
  throw new Error("无法抓取该页面（可能有登录或反爬限制，试试知乎、V2EX、公众号文章等公开页面）");
}

export async function handleFindJobs(request, env) {
  const json = (body, status = 200) =>
    new Response(JSON.stringify(body), {
      status,
      headers: { "content-type": "application/json; charset=utf-8", "cache-control": "no-store" },
    });
  try {
    const { url } = await request.json();
    if (typeof url !== "string" || !/^https?:\/\//.test(url)) {
      return json({ error: "请输入完整链接（以 https:// 开头）" }, 400);
    }
    const text = await fetchPostText(url);
    const companies = await extractCompanies(text);
    if (!companies.length) return json({ companies: [] });
    const out = await Promise.all(
      companies.map(async (name) => ({ name, careersUrl: await findCareersPage(name, env) }))
    );
    return json({ companies: out.filter((c) => c.careersUrl) });
  } catch (error) {
    console.log(JSON.stringify({ event: "find_jobs_error", message: error instanceof Error ? error.message : "unknown" }));
    return json({ error: error instanceof Error ? error.message : "分析失败，请稍后重试" }, 502);
  }
}
