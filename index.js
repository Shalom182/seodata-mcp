#!/usr/bin/env node
/**
 * seodata-mcp — MCP-сервер SEO-комбайна (seodata.win).
 *
 * Обёртка Model Context Protocol над публичным клиентским API комбайна
 * (/api/public/v1). Даёт любой нейросети (Claude, Kimi, Cursor и т.д.)
 * plug-and-play доступ к витринам, статьям, аудитам, AI-генерации
 * и позициям — после авторизации ключом `seo_<48 hex>`.
 *
 * Конфигурация (env):
 *   SEODATA_API_KEY   — ключ api-ключа комбайна вида seo_<48 hex> (обязателен
 *                       для авторизованных инструментов; выдаётся в админке,
 *                       раздел «API-ключи»)
 *   SEODATA_BASE_URL  — базовый URL комбайна (по умолчанию https://seodata.win)
 *
 * Транспорт: stdio (JSON-RPC). Запуск: `node index.js` или `npx seodata-mcp`.
 */
import { Server } from "@modelcontextprotocol/sdk/server/index.js";
import { StdioServerTransport } from "@modelcontextprotocol/sdk/server/stdio.js";
import {
  CallToolRequestSchema,
  ListResourcesRequestSchema,
  ListToolsRequestSchema,
  ReadResourceRequestSchema,
} from "@modelcontextprotocol/sdk/types.js";

const BASE_URL = (process.env.SEODATA_BASE_URL ?? "https://seodata.win").replace(/\/+$/, "");
const API = `${BASE_URL}/api/public/v1`;
const API_KEY = (process.env.SEODATA_API_KEY ?? "").trim();

const SERVER_NAME = "seodata-mcp";
const SERVER_VERSION = "1.0.0";

// ---------------------------------------------------------------------------
// HTTP-слой
// ---------------------------------------------------------------------------

class ApiError extends Error {
  constructor(status, body) {
    super(`HTTP ${status}`);
    this.status = status;
    this.body = body;
  }
}

async function apiFetch(path, { method = "GET", body } = {}) {
  if (!API_KEY) {
    throw new ApiError(0, { error: "no_api_key" });
  }
  let res;
  try {
    res = await fetch(`${API}${path}`, {
      method,
      headers: {
        Authorization: `Bearer ${API_KEY}`,
        "Content-Type": "application/json",
        Accept: "application/json",
      },
      body: body === undefined ? undefined : JSON.stringify(body),
    });
  } catch (err) {
    return {
      ok: false,
      status: 0,
      error: "network_error",
      hint: `Не удалось достучаться до ${BASE_URL}: ${err?.message ?? err}`,
    };
  }
  const text = await res.text();
  let json = null;
  try {
    json = text ? JSON.parse(text) : null;
  } catch {
    /* не JSON — редкий случай (nginx-страница и т.п.) */
  }
  if (!res.ok) {
    throw new ApiError(res.status, json ?? { raw: text.slice(0, 500) });
  }
  return json;
}

/** Человекочитаемое описание ошибок API для нейросети. */
function explainError(err) {
  if (!(err instanceof ApiError)) {
    return { error: "internal_error", hint: String(err?.message ?? err) };
  }
  const body = err.body ?? {};
  const base = { error: body.error ?? `http_${err.status}`, status: err.status };
  switch (err.status) {
    case 0:
      return {
        ...base,
        hint: "Не задан SEODATA_API_KEY. Возьмите ключ вида seo_... в админке комбайна (раздел «API-ключи») и добавьте его в env конфигурации MCP-сервера.",
      };
    case 401:
      return {
        ...base,
        hint: "Ключ отсутствует или недействителен. Проверьте SEODATA_API_KEY (формат seo_<48 hex>). Ключи создаются в админке: раздел «API-ключи».",
      };
    case 403:
      return {
        ...base,
        hint: `У ключа нет scope «${body.need ?? "?"}». Добавьте scope при создании ключа в админке либо используйте ключ с нужными правами.`,
      };
    case 404:
      return {
        ...base,
        hint: body.detail ?? "Объект не найден либо принадлежит другому владельцу. Уточните slug/id через seodata_list_storefronts / seodata_list_articles.",
      };
    case 429:
      return {
        ...base,
        hint: body.error === "rate_limited"
          ? "Превышен минутный лимит (60 запросов/мин). Подождите минуту."
          : `Исчерпана дневная квота ключа (${body.dailyQuota ?? "?"} запросов/день). Квота сбросится в 00:00 UTC либо попросите поднять dailyQuota в админке.`,
      };
    default:
      return { ...base, detail: body.detail ?? body.raw };
  }
}

function ok(data) {
  return { content: [{ type: "text", text: JSON.stringify(data, null, 2) }] };
}

function fail(err) {
  return { content: [{ type: "text", text: JSON.stringify(explainError(err), null, 2) }], isError: true };
}

// ---------------------------------------------------------------------------
// Инструменты (1:1 поверх /api/public/v1)
// ---------------------------------------------------------------------------

const TOOLS = [
  {
    name: "seodata_whoami",
    description:
      "Кто я: имя ключа, префикс, scopes, дневная квота и расход за сегодня. Используй первым — проверка авторизации и доступных прав.",
    inputSchema: { type: "object", properties: {}, additionalProperties: false },
  },
  {
    name: "seodata_list_storefronts",
    description:
      "Список витрин (сайтов) владельца ключа: id, имя, slug, язык, домен. Scope: content:read. Идентификаторы отсюда нужны остальным инструментам.",
    inputSchema: { type: "object", properties: {}, additionalProperties: false },
  },
  {
    name: "seodata_list_articles",
    description:
      "Опубликованные статьи витрины с полным контентом. Scope: content:read.",
    inputSchema: {
      type: "object",
      properties: {
        storefrontSlug: { type: "string", description: "Slug витрины из seodata_list_storefronts" },
        limit: { type: "number", description: "Макс. статей (1–100, по умолчанию 50)" },
        offset: { type: "number", description: "Смещение для пагинации (по умолчанию 0)" },
      },
      required: ["storefrontSlug"],
      additionalProperties: false,
    },
  },
  {
    name: "seodata_get_article",
    description:
      "Полная опубликованная статья: заголовок, контент, meta, ключи, обложка. Scope: content:read.",
    inputSchema: {
      type: "object",
      properties: {
        storefrontSlug: { type: "string" },
        articleSlug: { type: "string" },
      },
      required: ["storefrontSlug", "articleSlug"],
      additionalProperties: false,
    },
  },
  {
    name: "seodata_get_page",
    description: "Статическая страница витрины (о нас, контакты и т.п.). Scope: content:read.",
    inputSchema: {
      type: "object",
      properties: {
        storefrontSlug: { type: "string" },
        pageSlug: { type: "string" },
      },
      required: ["storefrontSlug", "pageSlug"],
      additionalProperties: false,
    },
  },
  {
    name: "seodata_search",
    description:
      "Полнотекстовый поиск по всем опубликованным статьям владельца (заголовок, лид, контент). Scope: content:read.",
    inputSchema: {
      type: "object",
      properties: {
        q: { type: "string", description: "Запрос, минимум 2 символа" },
      },
      required: ["q"],
      additionalProperties: false,
    },
  },
  {
    name: "seodata_run_audit",
    description:
      "SEO-аудит главной страницы домена (~5–15 с): score 0–100 + список проверок (title, meta, h1, canonical, robots, sitemap, скорость и др.). Если передать storefrontId — результат сохранится в историю аудитов витрины. Scope: audit:run.",
    inputSchema: {
      type: "object",
      properties: {
        domain: { type: "string", description: "Домен без протокола и путей, например example.com" },
        storefrontId: { type: "number", description: "Необязательно: id витрины для сохранения аудита" },
      },
      required: ["domain"],
      additionalProperties: false,
    },
  },
  {
    name: "seodata_generate_article",
    description:
      "Запуск AI-генерации статьи в фоне (очередь комбайна). Возвращает jobId — статус смотри через seodata_get_job; готовая статья появится черновиком витрины. Scope: generate:run.",
    inputSchema: {
      type: "object",
      properties: {
        storefrontId: { type: "number", description: "Id витрины (число из seodata_list_storefronts)" },
        topic: { type: "string", description: "Тема статьи, 3–2000 символов" },
        keywords: { type: "string", description: "Ключевые слова через запятую (до 1000 символов)" },
        keywordId: { type: "number", description: "Id главного ключа из панорамы — статья пишется строго под него" },
        tone: { type: "string", enum: ["expert", "selling", "friendly", "neutral"], description: "Тон (по умолчанию expert)" },
        language: { type: "string", enum: ["ru", "en", "es", "tr", "id", "vi", "zh", "de", "pt", "ar"], description: "Язык (по умолчанию ru)" },
        length: { type: "string", enum: ["short", "medium", "long"], description: "Объём (по умолчанию medium)" },
      },
      required: ["storefrontId", "topic"],
      additionalProperties: false,
    },
  },
  {
    name: "seodata_get_job",
    description:
      "Статус фоновой задачи (например генерации статьи): pending/processing/done/error + результат/ошибка. Scope: jobs:read.",
    inputSchema: {
      type: "object",
      properties: {
        jobId: { type: "number", description: "Id задачи из seodata_generate_article" },
      },
      required: ["jobId"],
      additionalProperties: false,
    },
  },
  {
    name: "seodata_get_positions",
    description:
      "Позиции отслеживаемых ключей витрины за последние 30 дней: плоский массив {keywordId, keyword, date, position, url}. Scope: positions:read.",
    inputSchema: {
      type: "object",
      properties: {
        storefrontId: { type: "number", description: "Id витрины (число из seodata_list_storefronts)" },
      },
      required: ["storefrontId"],
      additionalProperties: false,
    },
  },
];

// ---------------------------------------------------------------------------
// Обработчики
// ---------------------------------------------------------------------------

const HANDLERS = {
  async seodata_whoami() {
    return apiFetch("/me");
  },
  async seodata_list_storefronts() {
    return apiFetch("/storefronts");
  },
  async seodata_list_articles({ storefrontSlug, limit, offset }) {
    const qs = new URLSearchParams();
    if (limit !== undefined) qs.set("limit", String(limit));
    if (offset !== undefined) qs.set("offset", String(offset));
    const suffix = qs.size ? `?${qs}` : "";
    return apiFetch(`/storefronts/${encodeURIComponent(storefrontSlug)}/articles${suffix}`);
  },
  async seodata_get_article({ storefrontSlug, articleSlug }) {
    return apiFetch(
      `/storefronts/${encodeURIComponent(storefrontSlug)}/articles/${encodeURIComponent(articleSlug)}`,
    );
  },
  async seodata_get_page({ storefrontSlug, pageSlug }) {
    return apiFetch(
      `/storefronts/${encodeURIComponent(storefrontSlug)}/pages/${encodeURIComponent(pageSlug)}`,
    );
  },
  async seodata_search({ q }) {
    return apiFetch(`/search?q=${encodeURIComponent(q)}`);
  },
  async seodata_run_audit({ domain, storefrontId }) {
    return apiFetch("/audits", {
      method: "POST",
      body: { domain, ...(storefrontId !== undefined ? { storefrontId } : {}) },
    });
  },
  async seodata_generate_article(args) {
    const { storefrontId, topic, keywords, keywordId, tone, language, length } = args;
    const body = { storefrontId, topic };
    if (keywords !== undefined) body.keywords = keywords;
    if (keywordId !== undefined) body.keywordId = keywordId;
    if (tone !== undefined) body.tone = tone;
    if (language !== undefined) body.language = language;
    if (length !== undefined) body.length = length;
    return apiFetch("/articles/generate", { method: "POST", body });
  },
  async seodata_get_job({ jobId }) {
    return apiFetch(`/jobs/${jobId}`);
  },
  async seodata_get_positions({ storefrontId }) {
    return apiFetch(`/positions?storefrontId=${storefrontId}`);
  },
};

// ---------------------------------------------------------------------------
// Сервер
// ---------------------------------------------------------------------------

const server = new Server(
  { name: SERVER_NAME, version: SERVER_VERSION },
  { capabilities: { tools: {}, resources: {} } },
);

server.setRequestHandler(ListToolsRequestSchema, async () => ({ tools: TOOLS }));

server.setRequestHandler(CallToolRequestSchema, async (request) => {
  const { name, arguments: args = {} } = request.params;
  const handler = HANDLERS[name];
  if (!handler) {
    return {
      content: [
        {
          type: "text",
          text: JSON.stringify({ error: "unknown_tool", hint: `Инструмент «${name}» не существует. Список — через tools/list.` }),
        },
      ],
      isError: true,
    };
  }
  try {
    const result = await handler(args);
    return ok(result);
  } catch (err) {
    return fail(err);
  }
});

// Ресурс: живое описание API (OpenAPI-спека с сервера) — нейросеть может
// сама свериться с актуальным контрактом.
server.setRequestHandler(ListResourcesRequestSchema, async () => ({
  resources: [
    {
      uri: "seodata://openapi.json",
      name: "OpenAPI-спека публичного API комбайна",
      mimeType: "application/json",
      description: "Живой OpenAPI 3.0 документ /api/public/v1 с сервера seodata.win",
    },
    {
      uri: "seodata://status",
      name: "Статус подключения MCP к комбайну",
      mimeType: "application/json",
      description: "Базовый URL, наличие ключа и доступность API",
    },
  ],
}));

server.setRequestHandler(ReadResourceRequestSchema, async (request) => {
  const { uri } = request.params;
  if (uri === "seodata://openapi.json") {
    const res = await fetch(`${API}/openapi.json`);
    const text = await res.text();
    return { contents: [{ uri, mimeType: "application/json", text }] };
  }
  if (uri === "seodata://status") {
    let reachable = false;
    try {
      // живость проверяем по открытой OpenAPI-спеке (корень API со слэшем
      // не матчится роутом Hono)
      const res = await fetch(`${API}/openapi.json`);
      reachable = res.ok;
    } catch {
      reachable = false;
    }
    return {
      contents: [
        {
          uri,
          mimeType: "application/json",
          text: JSON.stringify(
            {
              baseUrl: BASE_URL,
              api: API,
              apiKeyConfigured: Boolean(API_KEY),
              apiKeyPrefix: API_KEY ? API_KEY.slice(0, 8) + "…" : null,
              reachable,
            },
            null,
            2,
          ),
        },
      ],
    };
  }
  throw new Error(`Неизвестный ресурс: ${uri}`);
});

const transport = new StdioServerTransport();
await server.connect(transport);
console.error(`${SERVER_NAME} v${SERVER_VERSION}: подключено к ${BASE_URL} (stdio), ключ ${API_KEY ? "задан" : "НЕ задан"}`);
