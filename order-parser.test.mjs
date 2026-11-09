import test from "node:test";
import assert from "node:assert/strict";
import { parseOrder } from "./order-parser.mjs";
import { SARVAM_LANGUAGES, SARVAM_TTS_LANGUAGE_CODES } from "./public/languages.js";
import { findMissingFields, sanitizeOrder } from "./order-schema.mjs";

function tomorrowUtc() {
  const date = new Date();
  const tomorrow = new Date(Date.UTC(date.getUTCFullYear(), date.getUTCMonth(), date.getUTCDate() + 1));
  return tomorrow.toISOString().slice(0, 10);
}

test("parses a Hindi order and pending-credit question", () => {
  const { order, warnings } = parseOrder("कल Hubli में 5 बोरी आटा और 2 पैकेट नमक भेजना, मेरा बाकी क्रेडिट बताना");
  assert.deepEqual(order.items, [
    { product: "Wheat flour", quantity: 5, unit: "bag" },
    { product: "Iodized salt", quantity: 2, unit: "pack" }
  ]);
  assert.equal(order.delivery_location, "Hubballi");
  assert.equal(order.delivery_date, tomorrowUtc());
  assert.equal(order.asked_about_pending_credit, true);
  assert.deepEqual(warnings, []);
});

test("parses a Kannada order with localized digits", () => {
  const { order, warnings } = parseOrder("ನಾಳೆ ಹುಬ್ಬಳ್ಳಿಗೆ ೩ ಕೆಜಿ ಗೋಧಿ ಹಿಟ್ಟು ಮತ್ತು ೪ ಪ್ಯಾಕ್ ಉಪ್ಪು ಕಳುಹಿಸಿ");
  assert.deepEqual(order.items, [
    { product: "Wheat flour", quantity: 3, unit: "kg" },
    { product: "Iodized salt", quantity: 4, unit: "pack" }
  ]);
  assert.equal(order.delivery_location, "Hubballi");
  assert.equal(order.delivery_date, tomorrowUtc());
  assert.equal(order.asked_about_pending_credit, false);
  assert.deepEqual(warnings, []);
});

test("flags missing fields instead of guessing", () => {
  const { order, warnings } = parseOrder("Send atta to Mysuru tomorrow");
  assert.deepEqual(order.items, [{ product: "Wheat flour", quantity: null, unit: "bag" }]);
  assert.equal(order.delivery_location, "Mysuru");
  assert.ok(warnings.some((warning) => warning.includes("Quantity not heard")));
});

test("lists all 22 Indic STT languages and Indian English", () => {
  const codes = SARVAM_LANGUAGES.map(({ code }) => code);
  assert.equal(SARVAM_LANGUAGES.length, 23);
  assert.equal(new Set(codes).size, 23);
  assert.ok(codes.includes("en-IN"));
  assert.equal(SARVAM_TTS_LANGUAGE_CODES.size, 11);
});

test("keeps malformed model fields explicit for review", () => {
  const order = sanitizeOrder({
    items: [{ product: "Wheat flour", quantity: null, unit: "bag" }],
    delivery_location: "Hubballi",
    delivery_date: "2026-02-30",
    asked_about_pending_credit: false
  });
  assert.equal(order.delivery_date, null);
  assert.deepEqual(findMissingFields(order), ["items[0].quantity", "delivery_date"]);
});

test("rejects an invalid order container", () => {
  assert.throws(() => sanitizeOrder({ items: "not-an-array" }));
});
