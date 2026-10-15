#!/usr/bin/env node
/**
 * test-client.mjs — самопроверка seodata-mcp без реального ключа.
 *
 * Поднимает сервер по stdio, выполняет initialize → tools/list →
 * resources/list → несколько вызовов инструментов и печатает результат.
 * Запуск: node test-client.mjs
 */
import { Client } from "@modelcontextprotocol/sdk/client/index.js";
import { StdioClientTransport } from "@modelcontextprotocol/sdk/client/stdio.js";

const transport = new StdioClientTransport({
  command: process.execPath,
  args: ["index.js"],
  env: { ...process.env, SEODATA_API_KEY: process.env.SEODATA_API_KEY ?? "" },
});

const client = new Client({ name: "seodata-mcp-test", version: "0.1.0" });
await client.connect(transport);

let failed = 0;
const check = (label, cond, extra = "") => {
  console.log(`${cond ? "PASS" : "FAIL"}  ${label}${extra ? " — " + extra : ""}`);
  if (!cond) failed += 1;
};

// 1. Список инструментов
const { tools } = await client.listTools();
check("tools/list: 10 инструментов", tools.length === 10, `получено ${tools.length}`);
const names = tools.map((t) => t.name);
for (const expected of [
  "seodata_whoami",
  "seodata_list_storefronts",
  "seodata_list_articles",
  "seodata_get_article",
  "seodata_get_page",
  "seodata_search",
  "seodata_run_audit",
  "seodata_generate_article",
  "seodata_get_job",
  "seodata_get_positions",
]) {
  check(`инструмент ${expected}`, names.includes(expected));
}

// 2. Ресурсы
const { resources } = await client.listResources();
check("resources/list: 2 ресурса", resources.length === 2, resources.map((r) => r.uri).join(", "));

// 3. Чтение ресурса статуса
const statusRes = await client.readResource({ uri: "seodata://status" });
const status = JSON.parse(statusRes.contents[0].text);
check("resource seodata://status: API доступен", status.reachable === true, JSON.stringify(status));

// 4. OpenAPI-спека с продакшена
const specRes = await client.readResource({ uri: "seodata://openapi.json" });
const spec = JSON.parse(specRes.contents[0].text);
check("resource seodata://openapi.json: валидная спека", Boolean(spec.openapi || spec.paths), Object.keys(spec.paths ?? {}).length + " путей");

// 5. Вызов без ключа → дружелюбная ошибка no_api_key (если ключ не задан)
if (!process.env.SEODATA_API_KEY) {
  const r = await client.callTool({ name: "seodata_whoami", arguments: {} });
  const body = JSON.parse(r.content[0].text);
  check("whoami без ключа → no_api_key + hint", r.isError === true && body.error === "no_api_key", body.hint?.slice(0, 60));
}

// 6. Вызов с мусорным ключом через отдельный процесс
{
  const t2 = new StdioClientTransport({
    command: process.execPath,
    args: ["index.js"],
    env: { ...process.env, SEODATA_API_KEY: "seo_deadbeefdeadbeefdeadbeefdeadbeefdeadbeefdeadbeefdeadbeef" },
  });
  const c2 = new Client({ name: "seodata-mcp-test-401", version: "0.1.0" });
  await c2.connect(t2);
  const r = await c2.callTool({ name: "seodata_whoami", arguments: {} });
  const body = JSON.parse(r.content[0].text);
  check("whoami с мусорным ключом → 401 invalid_token + hint", r.isError === true && body.status === 401, body.hint?.slice(0, 60));
  await c2.close();
}

// 7. Если задан реальный ключ — прогон авторизованного контура
if (process.env.SEODATA_API_KEY) {
  const me = await client.callTool({ name: "seodata_whoami", arguments: {} });
  const meBody = JSON.parse(me.content[0].text);
  check("whoami с реальным ключом", !me.isError && Boolean(meBody.scopes), JSON.stringify(meBody).slice(0, 120));

  const sf = await client.callTool({ name: "seodata_list_storefronts", arguments: {} });
  const sfBody = JSON.parse(sf.content[0].text);
  check("list_storefronts", !sf.isError && Array.isArray(sfBody.data), `витрин: ${sfBody.data?.length ?? "?"}`);
}

await client.close();
console.log(failed === 0 ? "\nВСЕ ПРОВЕРКИ ПРОШЛИ" : `\nПРОВАЛЕНО ПРОВЕРОК: ${failed}`);
process.exit(failed === 0 ? 0 : 1);
