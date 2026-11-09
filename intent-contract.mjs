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
  if (typeof args.language !== "string" || !args.language.trim()) {
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
