# seodata-mcp

**MCP-сервер SEO-комбайна (seodata.win)** — plug-and-play доступ нейросетей
(Claude, Kimi, Cursor, ChatGPT и любых MCP-клиентов) к витринам, статьям,
SEO-аудитам, AI-генерации контента и позициям ключей. Авторизация — одним
ключом `seo_<48 hex>`.

*[English below](#english)*

Сервер — тонкая stateless-обёртка Model Context Protocol над публичным
клиентским API комбайна `/api/public/v1`. Ничего не хранит, одна зависимость
(`@modelcontextprotocol/sdk`), Node.js ≥ 18.

---

**Статус P0 (2026-11-09):** GitHub `main` этого MCP-репозитория остаётся старой версией, а изменения intent-first расположены только в `fix/intent-first-safe-adapter-20261109` (CODE ONLY). До независимого production SHA/health/authenticated API-проверки `seodata_generate_article` должен оставаться выключенным (`SEODATA_ENABLE_GENERATION` не установлен). Публичная публикация запрещена; только combiner admin-gate с явно утверждённым интентом. OpenAPI capability probe необходим, но сам по себе не подтверждает owner scope и не является разрешением на расход.

## Быстрый старт

### 0. Получить ключ

Админка комбайна → раздел **«API-ключи»** → создать ключ. Scopes под задачи:

| Scope | Что открывает |
|---|---|
| `content:read` | витрины, статьи, страницы, поиск |
| `audit:run` | SEO-аудит доменов |
| `generate:run` | AI-генерация статей (фоном) |
| `jobs:read` | статус фоновых задач |
| `positions:read` | позиции ключей за 30 дней |

Лимиты ключа: дневная квота (по умолчанию 1000) + 60 запросов/мин.

### 1. Подключить клиент

**Без установки (через GitHub):**

```json
{
  "mcpServers": {
    "seodata": {
      "command": "npx",
      "args": ["-y", "github:Shalom182/seodata-mcp"],
      "env": { "SEODATA_API_KEY": "seo_ваш_ключ" }
    }
  }
}
```

**npm (когда пакет опубликован):**

```json
{
  "mcpServers": {
    "seodata": {
      "command": "npx",
      "args": ["-y", "seodata-mcp"],
      "env": { "SEODATA_API_KEY": "seo_ваш_ключ" }
    }
  }
}
```

**Локально:**

```bash
git clone https://github.com/Shalom182/seodata-mcp.git
cd seodata-mcp && npm install
```

```json
{
  "mcpServers": {
    "seodata": {
      "command": "node",
      "args": ["/путь/к/seodata-mcp/index.js"],
      "env": { "SEODATA_API_KEY": "seo_ваш_ключ" }
    }
  }
}
```

Этот блок `mcpServers` одинаково работает в **Claude Desktop**
(`claude_desktop_config.json`), **Cursor/Windsurf** (`mcp.json`),
**Kimi Code** и любом MCP-совместимом клиенте.

### 2. Проверить

Спросите нейросеть: «проверь связь с комбайном» — она вызовет
`seodata_whoami` и покажет scopes, квоту и расход за сегодня.

---

## Инструменты (10)

| Инструмент | Что делает | Scope |
|---|---|---|
| `seodata_whoami` | Ключ: имя, scopes, квота, расход за сегодня. **Вызывать первым** | — |
| `seodata_list_storefronts` | Витрины владельца: id, slug, язык, домен | content:read |
| `seodata_list_articles` | Опубликованные статьи витрины (limit/offset) | content:read |
| `seodata_get_article` | Полная статья: контент, meta, ключи, обложка | content:read |
| `seodata_get_page` | Статическая страница витрины | content:read |
| `seodata_search` | Поиск по всему опубликованному контенту | content:read |
| `seodata_run_audit` | SEO-аудит домена (~5–15 с): score + проверки; опционально сохраняет в витрину | audit:run |
| `seodata_generate_article` | **ЗАБЛОКИРОВАНО по умолчанию**: после отдельного разрешения, подтверждённого server SHA и OpenAPI capability probe — approved intentId → фоновая генерация черновика, без публикации и автоматических retry | generate:run |
| `seodata_get_job` | Статус фоновой задачи + результат/ошибка | jobs:read |
| `seodata_get_positions` | Позиции ключей витрины за 30 дней | positions:read |

### Ресурсы

| URI | Что отдаёт |
|---|---|
| `seodata://status` | Базовый URL, наличие ключа, доступность API |
| `seodata://openapi.json` | Живая OpenAPI 3.0 спека `/api/public/v1` с продакшена |

### Типовые сценарии

- «Какие у меня витрины и что на них опубликовано?» → `list_storefronts` → `list_articles`
- «Найди статью про X и перепиши» → `search` → `get_article`
- «Проведи SEO-аудит домена» → `run_audit`
- «Напиши статью про X на витрину Y» → **не запускать** без согласия владельца на платный API-вызов, owner-scoped approved `intentId`, канонической локали и проверенного production backend gate. Только после разрешения: `generate_article` → `get_job` → черновик в админке, никакой автопубликации
- «Как движутся позиции?» → `get_positions`

Ошибки API приходят нейросети с полем `hint` на русском: что случилось
(401/403/404/429/no_api_key) и что сделать.

## Конфигурация (env)

| Переменная | По умолчанию | Назначение |
|---|---|---|
| `SEODATA_API_KEY` | — | Ключ `seo_<48 hex>` (обязателен для авторизованных вызовов) |
| `SEODATA_BASE_URL` | `https://seodata.win` | Базовый URL комбайна (для self-hosted копии) |

Без ключа сервер стартует, но инструменты вернут `no_api_key` с подсказкой —
удобно для диагностики конфигурации клиента.

## Безопасность

- Ключ живёт только в env на машине пользователя; сервер ничего не логирует
  и не хранит.
- Видимость данных = владелец ключа (owner-изоляция на стороне API).
- MCP покрывает только публичный клиентский API: чтение контента, аудиты,
  постановка генерации в очередь, позиции. Мутирующее управление
  (публикация, сателлиты, домены, пользователи) остаётся в админке.

## Самопроверка

```bash
npm install
npm run test:offline              # без ключа, сети, платных API и публикации
npm test                          # MCP handshake + сетевой GET status/OpenAPI; при ключе — ещё read-only API
# НЕ запускать e2e-full-run.mjs: live E2E может вызвать POST и платную генерацию.
# Требуется отдельное согласие владельца, проверка backend gate и лимитов.
# При сетевом сбое POST итог UNKNOWN: никаких автоматических повторов.
```

## Файлы

| Файл | Назначение |
|---|---|
| `index.js` | Сервер (stdio-транспорт, 10 инструментов, 2 ресурса) |
| `test-client.mjs` | Самопроверка без ручного MCP-клиента |
| `e2e-full-run.mjs` | E2E-прогон каждого инструмента против живого API |

## Лицензия

MIT © Shalom182 (seodata.win)

---

## English

**MCP server for the SEO Combine (seodata.win)** — plug-and-play LLM access
(storefronts, articles, SEO audits, AI article generation, keyword positions)
via a single `seo_<48 hex>` API key. Thin stateless wrapper over the
combine's public client API `/api/public/v1`. One dependency, Node.js ≥ 18.

### Quick start

1. Get an API key: admin panel → **API keys** → create with scopes
   (`content:read`, `audit:run`, `generate:run`, `jobs:read`, `positions:read`).
2. Add to any MCP client (Claude Desktop, Cursor, Kimi Code, …):

```json
{
  "mcpServers": {
    "seodata": {
      "command": "npx",
      "args": ["-y", "github:Shalom182/seodata-mcp"],
      "env": { "SEODATA_API_KEY": "seo_your_key" }
    }
  }
}
```

3. Ask the model: "check the combine connection" — it will call
   `seodata_whoami` and show scopes and quota.

### Tools

`seodata_whoami` · `seodata_list_storefronts` · `seodata_list_articles` ·
`seodata_get_article` · `seodata_get_page` · `seodata_search` ·
`seodata_run_audit` (domain SEO audit, ~5–15 s) ·
`seodata_generate_article` (queued AI article → `jobId`) ·
`seodata_get_job` · `seodata_get_positions` (30 days).

Resources: `seodata://status` (connectivity), `seodata://openapi.json`
(live OpenAPI 3.0 spec). API errors are returned with a human-readable
`hint` field (401/403/404/429/no_api_key).

### Configuration

| Env | Default | Purpose |
|---|---|---|
| `SEODATA_API_KEY` | — | `seo_<48 hex>` key |
| `SEODATA_BASE_URL` | `https://seodata.win` | Combine base URL (self-hosted) |

Security: the key never leaves the user's machine; data visibility is scoped
to the key owner; the server is read-only except for queueing article
generation.

### Self-test

```bash
npm install && npm test
```

License: MIT © Shalom182 (seodata.win)


## Безопасный intent-first MCP (кандидат v1.1.0-rc.1; NOT PROD VERIFIED)

Клиент сохраняет **ровно 10 tools**. Он НЕ получает права утверждать интенты, менять редакционный QA или публиковать статьи. `seodata_generate_article` требует **переданный владельцем** positive integer `intentId`, `storefrontId`, `topic` и явную каноническую `language`; без них HTTP-задание не создаётся. `ua` и `jp` сохраняются как внутренние коды, `zh-CN` и `zh-TW` не объединяются.

**Fail-closed по умолчанию:** запись `SEODATA_ENABLE_GENERATION` отсутствует → `generation_disabled`. Только после отдельного разрешения владельца, независимой приёмки backend issue [marketing #160](https://github.com/Shalom182/marketing/issues/160), production deployed SHA/health и read-only smoke можно *осознанно* установить `SEODATA_ENABLE_GENERATION=1`. Перед генерацией MCP бесплатно проверяет live `/api/public/v1/openapi.json`: requestBody обязан содержать required `intentId` и 422 response. Это только подтверждение описанного контракта, **не proof** серверного approval — backend должен повторно проверить intent status, owner/project/storefront/cluster/locale до биллинга и очереди. Нет retry на платный вызов. Установку флага и paid smoke без согласия владельца НЕ выполнять.

Offline-тесты без ключа, HTTP и расходов: `npm run test:offline` (Node.js >= 18). `npm test` — старый сетевой smoke, НЕ запускать автоматически. Никаких реальных ключей в примерах/коммитах. Отдельный план синхронизации: [MCP issue #1](https://github.com/Shalom182/seodata-mcp/issues/1); соответствующий backend-код у Kimi — [marketing PR #163](https://github.com/Shalom182/marketing/pull/163). До merge/deploy обоих контуров **MCP PROD NOT VERIFIED**.
