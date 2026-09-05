import { test } from "node:test";
import assert from "node:assert/strict";
import { z } from "zod";
import { HttpError, json, readJson, route } from "../src/lib/api/respond";

function request(body: string): Request {
  return new Request("http://localhost/api/test", { method: "POST", body });
}

test("invalid JSON and invalid fields return 400 before any action runs", async () => {
  let actions = 0;
  const schema = z.object({ senderId: z.string().min(1) });
  const handler = route(async (req: Request) => {
    const body = schema.parse(await readJson(req));
    actions++;
    return json(body);
  });

  for (const body of ["", "{", "null", "[]", "{}", '{"senderId":12}', '{"senderId":""}']) {
    const response = await handler(request(body));
    assert.equal(response.status, 400, body);
    assert.equal(typeof (await response.json()).error, "string");
  }
  assert.equal(actions, 0);

  const response = await handler(request('{"senderId":"sender-1"}'));
  assert.equal(response.status, 200);
  assert.deepEqual(await response.json(), { senderId: "sender-1" });
  assert.equal(actions, 1);
});

test("optional scan bodies accept empty input but never silently accept malformed JSON", async () => {
  let actions = 0;
  const schema = z.object({ lookbackDays: z.number().int().min(1).default(365) });
  const handler = route(async (req: Request) => {
    const body = schema.parse(await readJson(req, { allowEmpty: true }));
    actions++;
    return json(body);
  });

  for (const body of ["", "  ", "{}"]) {
    const response = await handler(request(body));
    assert.equal(response.status, 200);
    assert.deepEqual(await response.json(), { lookbackDays: 365 });
  }
  for (const body of ['{"lookbackDays":', "null", '{"lookbackDays":0}']) {
    assert.equal((await handler(request(body))).status, 400);
  }
  assert.equal(actions, 3, "invalid input must not start a default scan");
});

test("invalid query parameters return 400 without exposing the submitted value", async () => {
  const handler = route(async () => {
    z.object({ status: z.enum(["ACTIVE", "KEPT"]) }).parse({ status: "private-input" });
    return json({ ok: true });
  });
  const response = await handler();
  assert.equal(response.status, 400);
  assert.deepEqual(await response.json(), { error: "Invalid request parameters." });
});

test("intentional HTTP errors preserve their status and safe message", async () => {
  const handler = route(async () => { throw new HttpError("Not signed in.", 401); });
  const response = await handler();
  assert.equal(response.status, 401);
  assert.deepEqual(await response.json(), { error: "Not signed in." });
});

test("unexpected errors remain 500 and do not expose server details", async (t) => {
  const logger = t.mock.method(console, "error", () => {});
  // An internal SyntaxError is a server bug, not a malformed request body.
  const handler = route(async () => { throw new SyntaxError("private server detail"); });
  const response = await handler();
  assert.equal(response.status, 500);
  assert.deepEqual(await response.json(), { error: "Something went wrong on the server." });
  assert.equal(logger.mock.callCount(), 1);
});
