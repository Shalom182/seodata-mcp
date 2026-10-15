# seodata-mcp

**MCP-сервер SEO-комбайна (seodata.win)** — plug-and-play доступ нейросетей
(Claude, Kimi, Cursor, ChatGPT и любых MCP-клиентов) к витринам, статьям,
SEO-аудитам, AI-генерации контента и позициям ключей. Авторизация — одним
ключом `seo_<48 hex>`.

> **Подключить свою нейросеть за 2 минуты → [CONNECT.md](CONNECT.md)**
> (гайд по клиентам + готовые конфиги в [`examples/`](examples/))

*[English below](#english)*

Сервер — тонкая stateless-обёртка Model Context Protocol над публичным
клиентским API комбайна `/api/public/v1`. Ничего не хранит, одна зависимость
(`@modelcontextprotocol/sdk`), Node.js ≥ 18.
