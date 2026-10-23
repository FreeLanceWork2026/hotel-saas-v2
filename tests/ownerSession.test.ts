import { test } from "node:test";
import assert from "node:assert/strict";
import {
  OWNER_SESSION_SECONDS, configuredPassword, createOwnerToken, passwordMatches, verifyOwnerToken,
} from "../src/lib/ownerSession.ts";

const PW = "correct-horse-battery";

test("short or missing passwords leave the panel unconfigured", () => {
  assert.equal(configuredPassword(undefined), null);
  assert.equal(configuredPassword(""), null);
  assert.equal(configuredPassword("short"), null);
  assert.equal(configuredPassword(PW), PW);
});

test("password comparison", async () => {
  assert.equal(await passwordMatches(PW, PW), true);
  assert.equal(await passwordMatches("wrong", PW), false);
  assert.equal(await passwordMatches("", PW), false);
});

test("valid token verifies", async () => {
  const token = await createOwnerToken(PW);
  assert.equal(await verifyOwnerToken(token, PW), true);
});

test("token rejected after expiry", async () => {
  const now = Date.now();
  const token = await createOwnerToken(PW, now);
  assert.equal(await verifyOwnerToken(token, PW, now + (OWNER_SESSION_SECONDS - 1) * 1000), true);
  assert.equal(await verifyOwnerToken(token, PW, now + (OWNER_SESSION_SECONDS + 1) * 1000), false);
});

test("changing the password invalidates old tokens", async () => {
  const token = await createOwnerToken(PW);
  assert.equal(await verifyOwnerToken(token, "a-brand-new-password"), false);
});

test("tampered or malformed tokens rejected", async () => {
  const token = await createOwnerToken(PW);
  const [exp, sig] = token.split(".");
  const later = String(Number(exp) + 999_999);
  assert.equal(await verifyOwnerToken(`${later}.${sig}`, PW), false);
  assert.equal(await verifyOwnerToken(`${exp}.${sig}x`, PW), false);
  assert.equal(await verifyOwnerToken(`${token}.extra`, PW), false);
  assert.equal(await verifyOwnerToken("garbage", PW), false);
  assert.equal(await verifyOwnerToken(undefined, PW), false);
  assert.equal(await verifyOwnerToken(token, null), false);
});
