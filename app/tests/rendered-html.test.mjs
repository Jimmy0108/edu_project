import assert from "node:assert/strict";
import test from "node:test";
import { buildFallbackLesson, confirmEntireLesson, PHISHING_SAMPLE_MATERIALS } from "../lib/lesson.ts";

async function worker() {
  const workerUrl = new URL("../dist/server/index.js", import.meta.url);
  workerUrl.searchParams.set("test", String(Date.now()));
  const imported = await import(workerUrl.href);
  return imported.default;
}

const env = {
  ASSETS: {
    fetch: async () => new Response("Not found", { status: 404 }),
  },
};

const ctx = {
  waitUntil() {},
  passThroughOnException() {},
};

test("validates AI output and rejects invented citation IDs", async () => {
  const oldKey = process.env.GROQ_API_KEY, oldFetch = globalThis.fetch;
  process.env.GROQ_API_KEY = 'test-only-placeholder';
  const output = { summary: 'RAG 檢索教材', keywords: ['RAG'], visual: { title: '概念', cards: [{ label: 'RAG', text: '檢索教材' }] }, reading: { title: '短句', steps: [{ title: '一', text: 'RAG 檢索教材' }] }, focus: { goal: '閱讀', steps: ['檢索教材'] }, sourceNotice: '依據教材', sourceIds: ['one'] };
  let calls = 0;
  globalThis.fetch = async (url, options) => {
    assert.equal(String(url), 'https://api.groq.com/openai/v1/chat/completions');
    const sent = JSON.parse(options.body); calls++;
    assert.equal(sent.response_format.type, 'json_schema');
    assert.equal(JSON.parse(sent.messages[1].content).materials.length, 1);
    return Response.json({ choices: [{ message: { content: JSON.stringify(output) } }] });
  };
  try {
    const app = await worker();
    const post = () => app.fetch(new Request('http://localhost/api/scaffold', { method: 'POST', headers: { 'content-type': 'application/json' }, body: JSON.stringify({ transcript: 'RAG 檢索教材', materials: [{ id: 'one', file: 'a.pptx', location: '投影片 1', text: 'RAG 檢索教材', confirmed: true }] }) }), { ...env, GROQ_API_KEY: 'test-only-placeholder' }, ctx);
    const good = await (await post()).json(); assert.equal(good.provider, 'groq'); assert.deepEqual(good.sourceIds, ['one']);
    output.sourceIds = ['invented'];
    const bad = await (await post()).json(); assert.equal(bad.provider, 'demo'); assert.deepEqual(bad.sourceIds, []); assert.ok(bad.aiError);
    assert.equal(calls, 2);
  } finally { globalThis.fetch = oldFetch; if (oldKey === undefined) delete process.env.GROQ_API_KEY; else process.env.GROQ_API_KEY = oldKey; }
});

test("retrieves confirmed course sources and rejects malformed input", async () => {
  const app = await worker();
  const post = payload => app.fetch(new Request("http://localhost/api/scaffold", { method: "POST", headers: { "content-type": "application/json" }, body: JSON.stringify(payload) }), env, ctx);
  assert.equal((await post(null)).status, 400);
  assert.equal((await post({ transcript: "RAG", materials: [{}] })).status, 400);
  const response = await post({ transcript: "RAG 檢索教材", materials: [
    { id: 'confirmed', file: 'report.pptx', location: '投影片 3', text: 'RAG 檢索教材段落', confirmed: true },
    { id: 'draft', file: 'report.pptx', location: '投影片 4', text: 'RAG 檢索教材', confirmed: false },
  ] });
  const data = await response.json();
  assert.equal(data.retrieved[0].id, 'confirmed'); assert.equal(data.retrieved.length, 1);
  assert.deepEqual(data.sourceIds, []); assert.equal(data.retrievalMethod, 'lexical-tfidf');
});

test("renders the EduBridge_AI classroom interface", async () => {
  const app = await worker();
  const response = await app.fetch(
    new Request("http://localhost/", { headers: { accept: "text/html" } }),
    env,
    ctx,
  );

  assert.equal(response.status, 200);
  const html = await response.text();
  assert.match(html, /EduBridge_AI/);
  assert.match(html, /知識圖譜驅動的課堂認知鷹架/);
  assert.match(html, /教師主導/);
  assert.match(html, /課前準備/);
  assert.doesNotMatch(html, /codex-preview|Your site is taking shape/i);
});

test("prepares a source-grounded lesson package without an AI key", async () => {
  const app = await worker();
  const materials = [
    { id: "m1", file: "lesson.pptx", location: "投影片 1", text: "釣魚郵件可能誘導使用者點擊可疑連結。", confirmed: true, sourceKind: "teacher-material" },
    { id: "m2", file: "lesson.pptx", location: "投影片 2", text: "檢查寄件者網域與網址拼字。", confirmed: true, sourceKind: "teacher-material" },
    { id: "m3", file: "lesson.pptx", location: "投影片 3", text: "多因素驗證增加第二道保護。", confirmed: true, sourceKind: "teacher-material" },
  ];
  const response = await app.fetch(new Request("http://localhost/api/lesson/prepare", { method: "POST", headers: { "content-type": "application/json" }, body: JSON.stringify({ title: "釣魚辨識", grade: "八年級", objective: "辨認可疑郵件", materials }) }), env, ctx);
  assert.equal(response.status, 200);
  const body = await response.json();
  assert.equal(body.provider, "local");
  assert.equal(body.lesson.version, 2);
  assert.ok(body.lesson.nodes.length >= 3 && body.lesson.nodes.length <= 12);
  assert.ok(body.lesson.nodes.every(node => node.sourceIds.length > 0 && node.teacherConfirmed === false));
  assert.ok(body.lesson.questions.length >= 3);
});

test("knowledge-graph scaffold requires teacher confirmation and stable repeated evidence", async () => {
  const app = await worker();
  const draft = buildFallbackLesson({ title: "釣魚辨識", grade: "八年級", objective: "辨認可疑郵件", materials: PHISHING_SAMPLE_MATERIALS.map(item => ({ ...item, confirmed: true })) });
  const request = lesson => app.fetch(new Request("http://localhost/api/scaffold", { method: "POST", headers: { "content-type": "application/json" }, body: JSON.stringify({ transcript: "檢查寄件者網域與拼字", previousConceptId: "sender-domain", lesson }) }), env, ctx);
  assert.equal((await request(draft)).status, 400);
  const response = await request(confirmEntireLesson(draft));
  assert.equal(response.status, 200);
  const body = await response.json();
  assert.equal(body.retrievalMethod, "knowledge-graph-lexical");
  assert.equal(body.decision.conceptId, "sender-domain");
  assert.equal(body.decision.stable, true);
  assert.ok(body.decision.sourceIds.length > 0);
});

test("provides clearly-labelled deterministic scaffolding without a key", async () => {
  const app = await worker();
  const response = await app.fetch(
    new Request("http://localhost/api/scaffold", {
      method: "POST",
      headers: { "content-type": "application/json" },
      body: JSON.stringify({
        transcript: "收到陌生郵件時，先不要點連結或下載附件。",
      }),
    }),
    env,
    ctx,
  );

  assert.equal(response.status, 200);
  const body = await response.json();
  assert.equal(body.provider, "demo");
  assert.ok(body.keywords.every(word => body.sourceTranscript.includes(word)));
  assert.match(body.sourceNotice, /未使用生成式 AI/);
});

test("does not send audio externally when the server key is absent", async () => {
  const app = await worker();
  const response = await app.fetch(
    new Request("http://localhost/api/transcribe", { method: "POST" }),
    env,
    ctx,
  );

  assert.equal(response.status, 503);
  const body = await response.json();
  assert.match(body.error, /不會把音訊傳送到任何外部服務/);
});
