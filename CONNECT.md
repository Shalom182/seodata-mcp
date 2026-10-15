# Подключение нейросетей к SEO-комбайну через MCP

Пошаговый гайд: как приконектить любую нейросеть (Claude, Kimi, Cursor,
Windsurf, Cline, Continue, LibreChat…) к комбайну за 2 минуты.

**Что нужно заранее:**

1. **API-ключ** `seo_<48 hex>` — админка комбайна → «API-ключи» → создать
   (scopes под задачи, см. README). Ключ показывается один раз.
2. **Node.js ≥ 18** на машине, где работает клиент (`node -v`).

Во всех конфигах ниже замените `seo_ВАШ_КЛЮЧ` на свой ключ.
Готовые файлы-примеры — в папке [`examples/`](examples/).

---

## Универсальный конфиг (stdio)

Большинство клиентов принимают один и тот же JSON-блок:

```json
{
  "mcpServers": {
    "seodata": {
      "command": "npx",
      "args": ["-y", "github:Shalom182/seodata-mcp"],
      "env": {
        "SEODATA_API_KEY": "seo_ВАШ_КЛЮЧ"
      }
    }
  }
}
```

Вариант без npx-кэша (локальный клон — быстрее старт, офлайн после установки):

```bash
git clone https://github.com/Shalom182/seodata-mcp.git && cd seodata-mcp && npm install
```

```json
{
  "mcpServers": {
    "seodata": {
      "command": "node",
      "args": ["/полный/путь/seodata-mcp/index.js"],
      "env": { "SEODATA_API_KEY": "seo_ВАШ_КЛЮЧ" }
    }
  }
}
```

Если комбайн self-hosted (не seodata.win) — добавьте в `env`:
`"SEODATA_BASE_URL": "https://ваш-домен"`.

---

## По клиентам

### Claude Desktop

Файл конфигурации:

- **macOS:** `~/Library/Application Support/Claude/claude_desktop_config.json`
- **Windows:** `%APPDATA%\Claude\claude_desktop_config.json`
- **Linux:** `~/.config/Claude/claude_desktop_config.json`

Вставьте универсальный блок в `mcpServers`, сохраните, **полностью
перезапустите** Claude Desktop. Проверка: иконка инструментов → должны
появиться `seodata_*`.

### Cursor

- Глобально: `~/.cursor/mcp.json`
- На проект: `.cursor/mcp.json` в корне проекта

Вставьте универсальный блок → Settings → MCP → сервер `seodata` должен
стать зелёным.

### Windsurf

Файл `~/.codeium/windsurf/mcp_config.json` — универсальный блок.
Перезапуск IDE.

### Kimi Code / Kimi CLI

Настройки → MCP (или конфиг `mcp.json` в профиле) — универсальный блок
`mcpServers`. После сохранения инструменты `seodata_*` доступны в чате.

### Cline / Roo Code (VS Code)

Иконка MCP Servers в панели расширения → «Edit MCP Settings» → в JSON
добавьте блок `seodata` (в Cline ключ верхнего уровня тоже `mcpServers`).

### Continue

`~/.continue/config.yaml`:

```yaml
mcpServers:
  - name: seodata
    command: npx
    args: ["-y", "github:Shalom182/seodata-mcp"]
    env:
      SEODATA_API_KEY: seo_ВАШ_КЛЮЧ
```

### LibreChat

`librechat.yaml`:

```yaml
mcpServers:
  seodata:
    type: stdio
    command: npx
    args: ["-y", "github:Shalom182/seodata-mcp"]
    env:
      SEODATA_API_KEY: seo_ВАШ_КЛЮЧ
```

### Клиенты только с remote MCP (ChatGPT-коннекторы, Claude.ai web)

Локальный stdio-сервер они не поднимают. Два пути:

1. **Мост stdio→HTTP** на своей машине/сервере, например supergateway:
   ```bash
   npx -y supergateway --stdio "npx -y github:Shalom182/seodata-mcp" --port 8080
   ```
   и подключить клиент к `http://<хост>:8080/sse`. Ключ задайте в env
   процесса моста. Мост без своей авторизации — публикуйте только в
   доверенной сети или за прокси с auth.
2. **Remote MCP в самом комбайне** (`/api/mcp` поверх тех же ключей) —
   в дорожной карте (фаза 2).

---

## Проверка подключения

Спросите нейросеть:

> Проверь связь с комбайном: кто я, какие scopes и сколько квоты осталось?

Ожидаемо: вызов `seodata_whoami` → имя ключа, список scopes, квота и
расход за сегодня. Дальше, например:

> Покажи мои витрины → сделай SEO-аудит домена X → поставь генерацию
> статьи на витрину Y и следи за задачей до результата.

## Если что-то не так

| Симптом | Причина | Лечение |
|---|---|---|
| Инструменты не появились | Клиент не перезапущен / JSON с ошибкой | Проверьте JSON (лишняя запятая), перезапустите клиент |
| `no_api_key` | Нет `SEODATA_API_KEY` в env конфига | Добавьте ключ в блок `env` |
| `invalid_token` (401) | Ключ неверный или отозван | Перевыпустите в админке, раздел «API-ключи» |
| `forbidden_scope` (403) | У ключа нет нужного scope | Создайте ключ с нужными scopes |
| `rate_limited` / `quota_exceeded` (429) | 60 зап/мин или дневная квота | Подождите / поднимите `dailyQuota` |
| `network_error` | Нет доступа к seodata.win | Проверьте интернет/прокси, `SEODATA_BASE_URL` |
| `npx: command not found` | Нет Node.js | Установите Node ≥ 18 |

## Безопасность ключа

- Ключ = доступ к данным владельца: не коммитьте конфиг с ключом в git,
  не публикуйте скриншоты с ним.
- Для каждой нейросети/машины — отдельный ключ: проще отозвать точечно.
- Скомпрометирован → удалите в админке и создайте новый (в БД хранится
  только хеш, восстановить старый нельзя).

---

## English (short)

Add this to any MCP client config, replacing `seo_YOUR_KEY` with your API
key (combine admin panel → API keys):

```json
{
  "mcpServers": {
    "seodata": {
      "command": "npx",
      "args": ["-y", "github:Shalom182/seodata-mcp"],
      "env": { "SEODATA_API_KEY": "seo_YOUR_KEY" }
    }
  }
}
```

Works with Claude Desktop, Cursor, Windsurf, Kimi Code, Cline, Continue,
LibreChat and any stdio-capable MCP client. Then ask the model:
"check the combine connection" — it should call `seodata_whoami`.
Remote-only clients: bridge stdio→HTTP with supergateway, or wait for the
hosted `/api/mcp` endpoint (roadmap).
