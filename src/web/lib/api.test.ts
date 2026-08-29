/// <reference types="node" />
/**
 * src/web/lib/api.test.ts
 *
 * WHAT IT IS
 * The tests for the one place the browser talks to our server.
 *
 * WHY IT EXISTS
 * Two promises live in this file and both are invisible until the day they matter.
 *
 * Nothing throws. A rejected fetch on venue wifi, a 500 with an HTML error page from a
 * proxy, a 204 with no body at all: every one of them has to come back as an answer the
 * screen can render, because an exception here is a white page in front of a founder.
 *
 * And it fails closed. The server half of this app is being written at the same time as
 * this half, so a route that does not exist yet answers 404. A 404 must become "this part
 * is not connected yet", never an empty list, because an empty list reads as "you have no
 * files" and that is the one thing this app must never say to somebody who has work.
 *
 * WHAT IT READS AND WRITES. It replaces the global fetch for the length of a test and puts
 * the real one back afterwards.
 */
import test from "node:test";
import assert from "node:assert/strict";
import {
  PROBLEM_TEXT,
  downloadAllUrl,
  downloadUrl,
  fetchFiles,
  kindForStatus,
  recordStep,
  sendMessage,
  streamUrl,
} from "./api.ts";

const realFetch = globalThis.fetch;

function stubFetch(handler: (url: string, init?: RequestInit) => Promise<Response>): void {
  globalThis.fetch = ((input: string | URL | Request, init?: RequestInit) =>
    handler(String(input), init)) as typeof fetch;
}

test.afterEach(() => {
  globalThis.fetch = realFetch;
});

test("a status becomes the kind that decides what the founder reads", () => {
  assert.equal(kindForStatus(401), "signed_out");
  assert.equal(kindForStatus(403), "signed_out");
  assert.equal(kindForStatus(404), "not_built_yet");
  assert.equal(kindForStatus(429), "too_many");
  assert.equal(kindForStatus(500), "server");
  assert.equal(kindForStatus(503), "server");
  assert.equal(kindForStatus(400), "refused");
});

test("a route that does not exist yet says so, and never looks like an empty folder", async () => {
  stubFetch(() => Promise.resolve(new Response("", { status: 404 })));
  const result = await fetchFiles();
  assert.equal(result.ok, false);
  if (!result.ok) {
    assert.equal(result.problem.kind, "not_built_yet");
    assert.equal(result.problem.text, PROBLEM_TEXT.not_built_yet);
    assert.ok(result.problem.text.includes("Nothing you have made is affected"));
  }
});

test("a dropped connection is the wifi, and is said that way", async () => {
  stubFetch(() => Promise.reject(new TypeError("Failed to fetch")));
  const result = await fetchFiles();
  assert.equal(result.ok, false);
  if (!result.ok) {
    assert.equal(result.problem.kind, "offline");
    assert.equal(result.problem.status, null);
  }
});

test("a body that is not JSON does not throw, it becomes the sentence for its status", async () => {
  stubFetch(() => Promise.resolve(new Response("<html>gateway error</html>", { status: 502 })));
  const result = await fetchFiles();
  assert.equal(result.ok, false);
  if (!result.ok) assert.equal(result.problem.kind, "server");
});

test("a refusal the server wrote for this founder wins over our general sentence", async () => {
  stubFetch(() =>
    Promise.resolve(
      new Response(JSON.stringify({ message: "You have reached the limit we set for today. Tell a mentor." }), {
        status: 400,
        headers: { "content-type": "application/json" },
      }),
    ),
  );
  const result = await fetchFiles();
  assert.equal(result.ok, false);
  if (!result.ok) assert.equal(result.problem.text, "You have reached the limit we set for today. Tell a mentor.");
});

test("a message carries the client id that makes a double send impossible", async () => {
  let seen: { url: string; body: unknown } | null = null;
  stubFetch((url, init) => {
    seen = { url, body: JSON.parse(String(init?.body)) as unknown };
    return Promise.resolve(
      new Response(JSON.stringify({ turnId: "tn_1" }), { status: 202, headers: { "content-type": "application/json" } }),
    );
  });
  const result = await sendMessage("t_42", "we sell to construction firms", "c_9");
  assert.equal(result.ok, true);
  const call = seen as { url: string; body: { text: string; clientMsgId: string } } | null;
  assert.equal(call?.url, "/api/threads/t_42/messages");
  assert.equal(call?.body.clientMsgId, "c_9");
  assert.equal(call?.body.text, "we sell to construction firms");
});

test("a 204 is a success with nothing in it, not a parse failure", async () => {
  stubFetch(() => Promise.resolve(new Response(null, { status: 204 })));
  const result = await fetchFiles();
  assert.equal(result.ok, true);
});

test("a 200 carrying a sign in page rather than an answer is a problem, not a null", async () => {
  // The failure this stops: a proxy answers a read with an HTML page and a 200, the screen
  // reads a field off nothing, and the founder gets a white page instead of a sentence.
  stubFetch(() => Promise.resolve(new Response("<html>sign in</html>", { status: 200 })));
  const result = await fetchFiles();
  assert.equal(result.ok, false);
  if (!result.ok) assert.equal(result.problem.kind, "server");
});

test("a write that answers with an empty body has still worked", async () => {
  // The other half of the same rule. A route that records a step and answers 200 with
  // nothing in it is a route that worked, and failing the founder for that would be wrong.
  stubFetch(() => Promise.resolve(new Response("", { status: 200 })));
  const result = await recordStep("plan", "done");
  assert.equal(result.ok, true);
});

test("a file name in a URL is encoded, so a name can never be read as a path", () => {
  assert.equal(downloadUrl("people/ada.md"), "/api/files/people%2Fada.md/download");
  assert.equal(streamUrl("t 1"), "/api/threads/t%201/stream");
  assert.equal(downloadAllUrl(false), "/api/files/download.zip");
  assert.equal(downloadAllUrl(true), "/api/files/download.zip?snapshots=1");
});
