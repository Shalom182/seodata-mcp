#!/usr/bin/env node
/**
 * e2e-full-run.mjs — «прогон нового чата»: нейросеть подключилась к
 * seodata-mcp впервые и вызывает КАЖДЫЙ инструмент по очереди.
 *
 * Запуск: SEODATA_API_KEY=$(cat ../.secrets/mcp-api-key) node e2e-full-run.mjs
 */
import { Client } from "@modelcontextprotocol/sdk/client/index.js";
import { StdioClientTransport } from "@modelcontextprotocol/sdk/client/stdio.js";

const API_KEY = process.env.SEODATA_API_KEY;
if (!API_KEY) {
  console.error("Задайте SEODATA_API_KEY");
  process.exit(1);
}

const transport = new StdioClientTransport({
  command: process.execPath,
  args: ["index.js"],
  env: { ...process.env, SEODATA_API_KEY: API_KEY },
});
const client = new Client({ name: "fresh-chat-llm", version: "1.0.0" });
await client.connect(transport);

const call = async (name, args = {}) => {
  const r = await client.callTool({ name, arguments: args });
  const text = r.content[0].text;
  let body;
  try { body = JSON.parse(text); } catch { body = text; }
  console.log(`\n=== ${name} ===`);
  console.log(typeof body === "string" ? body.slice(0, 600) : JSON.stringify(body, null, 2).slice(0, 900));
  if (r.isError) console.log("   ^ isError=true");
  return body;
};

// 0. Что видит нейросеть при подключении
const { tools } = await client.listTools();
console.log(`Подключено. Инструментов: ${tools.length}: ${tools.map((t) => t.name).join(", ")}`);

// 1. Кто я
await call("seodata_whoami");

// 2. Витрины
const sf = await call("seodata_list_storefronts");
const first = sf?.data?.[0];
if (!first) {
  console.log("Нет витрин у владельца ключа — дальше нечего прогонять");
  process.exit(1);
}
console.log(`\n>>> Работаем с витриной #${first.id} «${first.name}» (${first.slug}, ${first.domain ?? "без домена"})`);

// 3. Статьи витрины
const arts = await call("seodata_list_articles", { storefrontSlug: first.slug, limit: 3 });

// 4. Полная статья (если есть)
if (arts?.data?.length) {
  const a = arts.data[0];
  const full = await call("seodata_get_article", { storefrontSlug: first.slug, articleSlug: a.slug });
  console.log(`   ^ статья «${full?.data?.title}», контент ${full?.data?.content?.length ?? 0} знаков`);

  // 6. Поиск по слову из заголовка
  const word = (a.title ?? "").split(/\s+/).find((w) => w.length > 3) ?? "sms";
  await call("seodata_search", { q: word });
} else {
  console.log("Опубликованных статей нет — get_article/search пропускаем");
  await call("seodata_search", { q: "sms" });
}

// 5. Статическая страница (slug не знаем — демонстрируем и 404-путь)
await call("seodata_get_page", { storefrontSlug: first.slug, pageSlug: "about" });

// 7. Аудит домена витрины (или своего домена)
await call("seodata_run_audit", { domain: first.domain ?? "seodata.win", storefrontId: first.id });

// 8. Генерация статьи (короткая, тестовая)
const gen = await call("seodata_generate_article", {
  storefrontId: first.id,
  topic: "MCP smoke test: короткая тестовая статья о приёме SMS онлайн (сгенерирована автопрогоном MCP, удалить)",
  tone: "neutral",
  language: "ru",
  length: "short",
});

// 9. Статус задачи — поллим до результата (генерация идёт минуты)
const jobId = gen?.data?.jobId;
if (jobId) {
  const deadline = Date.now() + 6 * 60 * 1000;
  let st;
  do {
    await new Promise((r) => setTimeout(r, 20_000));
    st = await call("seodata_get_job", { jobId });
    console.log(`   job ${jobId}: ${st?.data?.status}`);
  } while (st?.data?.status !== "done" && st?.data?.status !== "error" && Date.now() < deadline);
} else {
  await call("seodata_get_job", { jobId: 1 });
}

// 10. Позиции
await call("seodata_get_positions", { storefrontId: first.id });

await client.close();
console.log("\nПРОГОН ЗАВЕРШЁН");
