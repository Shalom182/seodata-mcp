/**
 * Fail-closed guards for the intent-first public MCP adapter.
 * Pure functions: safe to unit test without credentials or network.
 */
export function validateGenerationArgs(args) {
  if (!args || !Number.isSafeInteger(args.storefrontId) || args.storefrontId <= 0) {
    return { ok: false, error: "storefront_id_required" };
  }
  if (!Number.isSafeInteger(args.intentId) || args.intentId <= 0) {
    return { ok: false, error: "approved_intent_id_required" };
  }
  if (typeof args.topic !== "string" || args.topic.trim().length < 3) {
    return { ok: false, error: "topic_required" };
  }
  // Use exact internal locale codes; never pass old uk/ja or lowercase zh variants.
  // The backend still must validate this locale against approved intent and owner scope.
  const locale = args.language;
  // Match the explicit MCP language enum, not just a plausible-looking tag:
  // an unknown locale is NOT evidence of a matching approved registry intent.
  const allowedCanonicalLocales = new Set([
    "ru", "en", "es", "tr", "id", "vi", "ua", "jp", "ko",
    "zh-CN", "zh-TW", "pt-BR", "de", "pt", "ar",
  ]);
  if (typeof locale !== "string" || !allowedCanonicalLocales.has(locale)) {
    return { ok: false, error: "canonical_locale_required" };
  }
  return { ok: true };
}

/**
 * Public, read-only capability probe. This is NOT an approval check;
 * the backend must still verify approval, project, cluster, locale and ownership.
 */
export function supportsIntentFirstGenerate(openapi) {
  const entries = Object.entries(openapi?.paths ?? {});
  const operation = entries.find(([path]) => path.endsWith("/articles/generate"))?.[1]?.post;
  const requestSchema = operation?.requestBody?.content?.["application/json"]?.schema;
  if (!requestSchema || !Array.isArray(requestSchema.required)) return false;
  const responses = operation?.responses ?? {};
  return requestSchema.required.includes("intentId")
    && Boolean(requestSchema.properties?.intentId)
    && Boolean(responses["422"]);
}

/** A timed-out write may already have run upstream; NEVER treat it as success or retry. */
export function describeTransportFailure(method = "GET") {
  const isWrite = String(method).toUpperCase() !== "GET";
  return {
    error: "network_error",
    hint: isWrite
      ? "The server response was lost: this write may have been accepted. Check existing job/article state before any manual retry; never retry automatically."
      : "The server could not be reached. This is an MCP error, not a successful empty result.",
    outcome: isWrite ? "unknown_may_have_committed" : "unavailable",
  };
}

/** Never return token prefixes or any credential bytes in public MCP resources. */
export function safeConnectionStatus(baseUrl, api, configured, reachable) {
  return {
    baseUrl,
    api,
    apiKeyConfigured: Boolean(configured),
    reachable: Boolean(reachable),
  };
}
