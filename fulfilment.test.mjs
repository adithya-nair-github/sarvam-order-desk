import test from "node:test";
import assert from "node:assert/strict";
import { mkdtemp, rm } from "node:fs/promises";
import { tmpdir } from "node:os";
import { join } from "node:path";
import { creditSnapshot, estimateLoadKg, fulfilOrder, nextOrderId } from "./fulfilment.mjs";
import { ensureLedger, writeLedger } from "./ndr.mjs";

const NOW = new Date("2026-11-09T04:30:00Z");
const ORDER = {
  items: [{ product: "Wheat flour", quantity: 5, unit: "bag" }, { product: "Iodized salt", quantity: 2, unit: "pack" }],
  delivery_location: "Hubballi",
  delivery_date: "2026-11-11",
  asked_about_pending_credit: true
};

async function withLedger(work) {
  const dir = await mkdtemp(join(tmpdir(), "fulfil-"));
  try {
    const path = join(dir, "orders_ledger.json");
    return await work(await ensureLedger(path), path);
  } finally {
    await rm(dir, { recursive: true, force: true });
  }
}

test("a completed order creates an order record, an invoice, a transport request and a balance update", async () => {
  await withLedger((ledger) => {
    const before = creditSnapshot(ledger);
    const deliveriesBefore = ledger.deliveries.length;
    const result = fulfilOrder(ledger, ORDER, NOW);
    assert.equal(result.delivery.order_id, "ORD-1047");
    assert.equal(ledger.deliveries.length, deliveriesBefore + 1);
    assert.equal(result.delivery.load_weight_kg, 252);
    assert.equal(result.invoice.order_id, "ORD-1047");
    assert.equal(result.invoice.total_inr, 5 * 1850 + 2 * 25);
    assert.equal(result.invoice.bill_to, "Sri Lakshmi Stores");
    assert.ok(result.transport);
    assert.equal(result.transport.simulated, true);
    assert.ok(result.transport.carrier.capacity_kg >= 252);
    assert.equal(result.account.outstanding_inr, before.outstanding_amount_inr + result.invoice.total_inr);
    assert.ok(ledger.accounts[0].invoice_refs.includes(result.invoice.invoice_id));
    assert.equal(result.delivery.status === "Dispatch Scheduled", result.transport.outcome === "Confirmed");
  });
});

test("unpriced items keep the invoice in pricing-pending and leave the balance alone", async () => {
  await withLedger((ledger) => {
    const before = ledger.accounts[0].outstanding_inr;
    const result = fulfilOrder(ledger, { ...ORDER, items: [{ product: "Soap", quantity: 3, unit: "box" }] }, NOW);
    assert.equal(result.invoice.status, "Draft - pricing pending");
    assert.equal(result.account, null);
    assert.equal(ledger.accounts[0].outstanding_inr, before);
  });
});

test("order ids keep counting up and the order survives a ledger reload", async () => {
  await withLedger(async (ledger, path) => {
    fulfilOrder(ledger, ORDER, NOW);
    fulfilOrder(ledger, ORDER, NOW);
    await writeLedger(path, ledger);
    const reloaded = await ensureLedger(path);
    assert.equal(nextOrderId(reloaded.deliveries), "ORD-1049");
    assert.ok(reloaded.deliveries.some((entry) => entry.order_id === "ORD-1048"));
    assert.equal(reloaded.invoices.length, 3);
  });
});

test("load estimates use unit weights and a default for unknown products", () => {
  assert.equal(estimateLoadKg([{ product: "Wheat flour", quantity: 2, unit: "bag" }]), 100);
  assert.equal(estimateLoadKg([{ product: "Soap", quantity: 3, unit: "box" }]), 30);
});
