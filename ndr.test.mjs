import test from "node:test";
import assert from "node:assert/strict";
import { mkdtemp, rm } from "node:fs/promises";
import { tmpdir } from "node:os";
import { join } from "node:path";
import { buildResolution, ensureLedger, writeLedger, EXCEPTION_STATUSES } from "./ndr.mjs";

const DEMO_ORDER = {
  order_id: "ORD-1043",
  distributor: "Novelty Kirana",
  delivery_location: "Jayanagar",
  items: [{ product: "Cooking oil", quantity: 24, unit: "pouch" }]
};

test("seeds the deliveries ledger once and persists changes", async () => {
  const dir = await mkdtemp(join(tmpdir(), "ndr-ledger-"));
  const ledgerPath = join(dir, "orders_ledger.json");
  try {
    const seeded = await ensureLedger(ledgerPath);
    assert.ok(seeded.deliveries.length >= 4);
    assert.ok(seeded.deliveries.every((delivery) => typeof delivery.order_id === "string"));
    const reread = await ensureLedger(ledgerPath);
    assert.deepEqual(reread, seeded);

    reread.deliveries[0].status = "Delivered";
    await writeLedger(ledgerPath, reread);
    const persisted = await ensureLedger(ledgerPath);
    assert.equal(persisted.deliveries[0].status, "Delivered");
    assert.notEqual(persisted, seeded);
  } finally {
    await rm(dir, { recursive: true, force: true });
  }
});

test("shop-closed resolution reschedules only after the receiver confirms", () => {
  const now = new Date("2026-11-09T04:30:00Z");
  const resolution = buildResolution(DEMO_ORDER, "Delivery Failed - Shop Closed", now);
  assert.equal(resolution.status, "rescheduled");
  assert.equal(resolution.requires_human_follow_up, false);
  assert.equal(resolution.scheduled_delivery_date, "2026-11-10");
  assert.deepEqual(resolution.called_parties, ["driver", "receiver"]);
  const receiverIndex = resolution.transcript.findIndex((line) => line.speaker.startsWith("receiver"));
  const confirmIndex = resolution.transcript.findIndex((line) => /Confirmed by the receiver/.test(line.text));
  assert.ok(receiverIndex > -1 && confirmIndex > receiverIndex);
  assert.equal(DEMO_ORDER.status, undefined);
});

test("quantity-mismatch dispute is flagged for human review", () => {
  const now = new Date("2026-11-09T04:30:00Z");
  const resolution = buildResolution(DEMO_ORDER, "Refused - Quantity Mismatch", now);
  assert.equal(resolution.status, "rescheduled");
  assert.equal(resolution.requires_human_follow_up, true);
  assert.equal(resolution.scheduled_delivery_date, "2026-11-11");
  assert.ok(resolution.transcript.some((line) => /human review|manual reconciliation/.test(line.text)));
});

test("rejects statuses without a resolution script", () => {
  assert.throws(() => buildResolution(DEMO_ORDER, "Delivered", new Date()), /No resolution script exists/);
  assert.deepEqual(EXCEPTION_STATUSES, ["Delivery Failed - Shop Closed", "Refused - Quantity Mismatch"]);
});
