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
  assert.equal(body.keywords.includes("連結"), true);
  assert.equal(body.keywords.includes("附件"), true);
  assert.match(body.sourceNotice, /示範模式/);
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
