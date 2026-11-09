import test from "node:test";
import assert from "node:assert/strict";
import { computeEconomics, designTotals, selfBuiltMinuteCost, verdict } from "./public/economics.js";

test("short-call design cuts call minutes per order sharply", () => {
  const long = designTotals("long");
  const short = designTotals("short");
  assert.equal(long.minutes, 9.5);
  assert.equal(Math.round(short.minutes * 100) / 100, 1.85);
  assert.equal(short.messages, 4);
});

test("default model numbers are internally consistent", () => {
  const result = computeEconomics();
  assert.equal(result.telecaller_per_min, 4.49);
  assert.equal(result.per_order.telecaller, 42.63);
  assert.equal(result.per_order.ai_long, 28.5);
  assert.equal(result.per_order.ai_short, 6.15);
  assert.equal(result.break_even_per_min.long, 4.49);
  assert.ok(result.per_order.ai_short < result.per_order.ai_long);
  assert.equal(result.monthly.orders, 1600);
});

test("break-even price makes voice AI cost equal to a telecaller", () => {
  const base = computeEconomics();
  const atLong = computeEconomics({ price_per_min: base.break_even_per_min.long });
  assert.ok(Math.abs(atLong.per_order.ai_long - base.per_order.telecaller) < 0.05);
  const atShort = computeEconomics({ price_per_min: base.break_even_per_min.short });
  assert.ok(Math.abs(atShort.per_order.ai_short - base.per_order.telecaller) < 0.05);
});

test("verdict changes with price", () => {
  assert.equal(verdict(3, 4.49, 22.7).tone, "good");
  assert.equal(verdict(6, 4.49, 22.7).tone, "mixed");
  assert.equal(verdict(25, 4.49, 22.7).tone, "bad");
  const cheapTelecaller = computeEconomics({ telecaller_monthly: 15000 });
  assert.equal(cheapTelecaller.verdict.tone, "mixed");
});

test("self-built minute cost adds up from Sarvam rates", () => {
  const cost = selfBuiltMinuteCost();
  assert.equal(cost.stt, 0.49);
  assert.equal(cost.tts, 0.36);
  assert.equal(cost.llm, 0.16);
  assert.equal(cost.total, 1.01);
});
