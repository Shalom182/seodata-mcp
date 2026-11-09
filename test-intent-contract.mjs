import test from "node:test";
import assert from "node:assert/strict";
import { validateGenerationArgs, supportsIntentFirstGenerate, describeTransportFailure } from "./intent-contract.mjs";

const good = { storefrontId: 13, intentId: 1, topic: "Free verification numbers", language: "en" };
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
