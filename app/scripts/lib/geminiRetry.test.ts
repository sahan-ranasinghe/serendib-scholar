/**
 * Run with:  npx tsx --test scripts/lib/geminiRetry.test.ts
 *
 * This classifier decides whether a paid, long-running pipeline keeps going
 * or aborts, so the cases below are pinned deliberately — the 500 INTERNAL
 * one is here because a real extraction run lost the tail of a 2-hour video
 * to exactly that error being treated as fatal.
 */
import { test } from "node:test";
import assert from "node:assert/strict";
import { classifyRetryableApiError } from "./geminiRetry";

test("429 by status is rate limited", () => {
  assert.equal(classifyRetryableApiError({ status: 429 }), "rate limited");
});

test("RESOURCE_EXHAUSTED in a bare Error message is rate limited", () => {
  assert.equal(classifyRetryableApiError(new Error("429 RESOURCE_EXHAUSTED: quota")), "rate limited");
});

test("500 by status is a transient server error", () => {
  assert.equal(classifyRetryableApiError({ status: 500 }), "transient server error");
});

test("regression: real 500 INTERNAL payload from a video-extraction segment is retryable", () => {
  const real = new Error('{"error":{"code":500,"message":"Internal error encountered.","status":"INTERNAL"}}');
  assert.equal(classifyRetryableApiError(real), "transient server error");
});

test("503 UNAVAILABLE is a transient server error", () => {
  assert.equal(classifyRetryableApiError(new Error("503 UNAVAILABLE")), "transient server error");
});

test("504 deadline exceeded is a transient server error", () => {
  assert.equal(classifyRetryableApiError(new Error("DEADLINE_EXCEEDED")), "transient server error");
});

test("a bad request is NOT retryable — retrying just burns quota", () => {
  assert.equal(classifyRetryableApiError({ status: 400 }), null);
});

test("an auth failure is NOT retryable", () => {
  assert.equal(classifyRetryableApiError(new Error("403 PERMISSION_DENIED")), null);
});

test("a connect timeout is retryable as a network failure", () => {
  const error = new TypeError("fetch failed");
  (error as Error & { cause?: unknown }).cause = new Error("Connect Timeout Error (UND_ERR_CONNECT_TIMEOUT)");
  assert.equal(classifyRetryableApiError(error), "network failure");
});

test("ECONNRESET is retryable as a network failure", () => {
  assert.equal(classifyRetryableApiError(new Error("read ECONNRESET")), "network failure");
});

test("depleted prepayment credits abort immediately — never retried", () => {
  assert.equal(
    classifyRetryableApiError(new Error('{"error":{"code":429,"message":"Your prepayment credits are depleted.","status":"RESOURCE_EXHAUSTED"}}')),
    null,
  );
});

test("an exceeded spending cap aborts immediately — never retried", () => {
  assert.equal(
    classifyRetryableApiError(new Error('{"error":{"code":429,"message":"Your project has exceeded its monthly spending cap.","status":"RESOURCE_EXHAUSTED"}}')),
    null,
  );
});

test("an unrelated error is NOT retryable", () => {
  assert.equal(classifyRetryableApiError(new Error("Empty response from model")), null);
});
