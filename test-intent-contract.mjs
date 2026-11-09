import test from "node:test";
import assert from "node:assert/strict";
import { validateGenerationArgs, supportsIntentFirstGenerate, describeTransportFailure, safeConnectionStatus, safeApiErrorCode } from "./intent-contract.mjs";

const good = { storefrontId: 13, intentId: 1, topic: "Free verification numbers", language: "en" };

for (const language of ["en", "ru", "ua", "jp", "ko", "pt-BR", "zh-CN", "zh-TW"]) {
  test("accepts canonical locale: " + language, () => {
    assert.deepEqual(validateGenerationArgs({...good, language}), { ok: true });
  });
}
for (const language of ["uk", "ja", "cn", "zh", "zh-cn", "zh-tw", "zh-Hans", "zh-Hant", "EN", "en_us", "pt-br", "en ", "", "zz", "fr", "fil", "xyz"]) {
  test("rejects legacy or noncanonical locale: " + JSON.stringify(language), () => {
    assert.deepEqual(validateGenerationArgs({...good, language}), {ok: false, error: "canonical_locale_required"});
  });
}

test("valid explicit intent and locale", () => {
  assert.deepEqual(validateGenerationArgs(good), { ok: true });
});
for (const patch of [{intentId:undefined},{intentId:0},{intentId:-1},{intentId:"1"},{storefrontId:0},{language:undefined},{topic:""}]) {
  test("fail closed on invalid generation request " + JSON.stringify(patch), () => {
    assert.equal(validateGenerationArgs({...good,...patch}).ok, false);
  });
}
const operation = { requestBody: { content: { "application/json": { schema: {
  required: ["storefrontId", "intentId", "topic"],
  properties: {intentId: {type: "integer"}}
} } } }, responses: {"202":{}, "422":{}} };
test("rejects legacy pre-intent OpenAPI", () => {
  assert.equal(supportsIntentFirstGenerate({paths: {"/api/public/v1/articles/generate": {post: {...operation,requestBody:{content:{"application/json":{schema:{required:["topic"], properties:{}}}}}}}}}), false);
});
test("requires negative intent rejection response", () => {
  assert.equal(supportsIntentFirstGenerate({paths: {"/api/public/v1/articles/generate": {post: {...operation,responses:{"202":{}}}}}}), false);
});
test("accepts documented required intent plus 422", () => {
  assert.equal(supportsIntentFirstGenerate({paths: {"/api/public/v1/articles/generate": {post:operation}}}), true);
});

test("failed POST is unknown, never reported as success or auto-retried", () => {
  const result = describeTransportFailure("POST");
  assert.equal(result.error, "network_error");
  assert.equal(result.outcome, "unknown_may_have_committed");
  assert.match(result.hint, /never retry automatically/i);
});
test("failed GET is unavailable, not a successful empty response", () => {
  assert.equal(describeTransportFailure("GET").outcome, "unavailable");
});

test("MCP status reports availability without disclosing any API-key prefix", () => {
  const secret = "seo_abcd1234_DEMO_NOT_REAL";
  const status = safeConnectionStatus("https://seodata.win", "https://seodata.win/api/public/v1", Boolean(secret), true);
  assert.equal(status.apiKeyConfigured, true);
  assert.equal(status.reachable, true);
  assert.equal(status.apiKeyPrefix, undefined);
  assert.equal(JSON.stringify(status).includes(secret), false);
  assert.equal(JSON.stringify(status).includes("seo_abcd"), false);
});

test("error codes redact internal details, preserve public errors", () => {
  assert.equal(safeApiErrorCode(500, "sql_private_password"), "http_500");
  assert.equal(safeApiErrorCode(400, "DB password=SECRET"), "http_400");
  assert.equal(safeApiErrorCode(503, undefined), "http_503");
  assert.equal(safeApiErrorCode(422, "intent_not_approved"), "intent_not_approved");
  assert.equal(safeApiErrorCode(0, "network_error"), "network_error");
});
