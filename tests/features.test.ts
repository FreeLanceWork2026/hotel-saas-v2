import { test } from "node:test";
import assert from "node:assert/strict";
import { FEATURES, featuresForPath, isPathBlocked, resolveFeatures } from "../src/lib/features.ts";

test("defaults: new modules locked, existing ones on", () => {
  const map = resolveFeatures(null);
  assert.equal(map.online_ordering, false);
  assert.equal(map.guest_self_booking, false);
  assert.equal(map.kitchen_display, false);
  assert.equal(map.table_ordering, false);
  assert.equal(map.kiosk_pos, true);
  assert.equal(map.inventory, true);
});

test("stored rows override defaults; unknown keys ignored", () => {
  const map = resolveFeatures([
    { key: "online_ordering", enabled: true },
    { key: "kiosk_pos", enabled: false },
    { key: "not_a_feature", enabled: true },
  ]);
  assert.equal(map.online_ordering, true);
  assert.equal(map.kiosk_pos, false);
  assert.equal("not_a_feature" in map, false);
});

test("path matching respects segment boundaries", () => {
  assert.deepEqual(featuresForPath("/cart"), ["online_ordering"]);
  assert.deepEqual(featuresForPath("/cart/x"), ["online_ordering"]);
  assert.deepEqual(featuresForPath("/cartoon"), []);
  assert.deepEqual(featuresForPath("/"), []);
  assert.deepEqual(featuresForPath("/shop"), []);
});

test("nested paths need every guarding feature", () => {
  assert.deepEqual(featuresForPath("/admin/inventory/labels").sort(), ["inventory", "labels"]);
  const labelsOff = resolveFeatures([{ key: "labels", enabled: false }]);
  assert.equal(isPathBlocked("/admin/inventory/labels", labelsOff), true);
  assert.equal(isPathBlocked("/admin/inventory", labelsOff), false);
  const inventoryOff = resolveFeatures([{ key: "inventory", enabled: false }]);
  assert.equal(isPathBlocked("/admin/inventory/labels", inventoryOff), true);
});

test("APIs are blocked with their pages", () => {
  const defaults = resolveFeatures(null);
  assert.equal(isPathBlocked("/api/checkout", defaults), true);
  assert.equal(isPathBlocked("/api/pos/sale", defaults), false);
  const kioskOff = resolveFeatures([{ key: "kiosk_pos", enabled: false }]);
  assert.equal(isPathBlocked("/api/pos/sale", kioskOff), true);
  assert.equal(isPathBlocked("/kiosk", kioskOff), true);
});

test("platform panel and admin core are never gated", () => {
  const allOff = resolveFeatures(FEATURES.map((f) => ({ key: f.key, enabled: false })));
  for (const p of ["/platform", "/admin", "/admin/settings", "/admin/orders", "/login", "/api/me"]) {
    assert.equal(isPathBlocked(p, allOff), false, p);
  }
});
