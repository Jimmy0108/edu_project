import assert from "node:assert/strict";
import test from "node:test";

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
  assert.match(html, /課堂即時認知鷹架/);
  assert.match(html, /視覺重點/);
  assert.doesNotMatch(html, /codex-preview|Your site is taking shape/i);
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
