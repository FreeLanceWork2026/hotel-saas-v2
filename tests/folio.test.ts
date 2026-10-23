import { test } from "node:test";
import assert from "node:assert/strict";
import { folioTotals, parsePercent, retainerAmount, retainerOutstanding } from "../src/lib/folio.ts";

test("bill totals ignore voided lines and payments", () => {
  const t = folioTotals(
    1600,
    [{ amount: 600, voided_at: null }, { amount: 69, voided_at: null }, { amount: 999, voided_at: "2026-10-01" }],
    [{ amount: 800, voided_at: null }, { amount: 500, voided_at: "2026-10-01" }]
  );
  assert.deepEqual(t, { roomTotal: 1600, extrasTotal: 669, totalDue: 2269, paid: 800, balance: 1469 });
});

test("event bill: hall + wedding package + plates", () => {
  // Hall A 1 day + wedding 20,000 + 250 plates × 600
  const t = folioTotals(2000, [{ amount: 20000, voided_at: null }, { amount: 250 * 600, voided_at: null }], []);
  assert.equal(t.totalDue, 172000);
  assert.equal(t.balance, 172000);
});

test("overpayment shows as negative balance (credit to guest)", () => {
  assert.equal(folioTotals(500, [], [{ amount: 600, voided_at: null }]).balance, -100);
});

test("retainer percent", () => {
  assert.equal(retainerAmount(1500, 50), 750);
  assert.equal(retainerAmount(1001, 25), 251); // rounded up to whole birr
  assert.equal(retainerAmount(1500, 0), 0);
  assert.equal(retainerOutstanding(1500, 50, 500), 250);
  assert.equal(retainerOutstanding(1500, 50, 900), 0);
});

test("percent setting parsing", () => {
  assert.equal(parsePercent("50"), 50);
  assert.equal(parsePercent("25%"), 25);
  assert.equal(parsePercent(""), 0);
  assert.equal(parsePercent("abc"), 0);
  assert.equal(parsePercent("150"), 100);
});
