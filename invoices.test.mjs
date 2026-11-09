import test from "node:test";
import assert from "node:assert/strict";
import { buildInvoice, SEED_INVOICES } from "./invoices.mjs";

const NOW = new Date("2026-11-09T05:30:00Z");

test("a fully priced complete order becomes a To Be Paid invoice with Net 7 terms", () => {
  const order = {
    items: [
      { product: "Wheat flour", quantity: 10, unit: "bag" },
      { product: "Iodized salt", quantity: 2, unit: "pack" }
    ],
    delivery_location: "Hubballi",
    delivery_date: "2026-11-10",
    asked_about_pending_credit: false
  };
  const invoice = buildInvoice(order, 2, NOW);
  assert.equal(invoice.invoice_id, "INV-20261109-002");
  assert.equal(invoice.status, "To Be Paid");
  assert.equal(invoice.credit_terms, "Net 7 Days");
  assert.equal(invoice.due_date, "2026-11-16");
  assert.equal(invoice.items[0].rate_inr_per_unit, 1850);
  assert.equal(invoice.items[0].amount_inr, 18500);
  assert.equal(invoice.total_inr, 18550);
  assert.equal(invoice.simulated, true);
  assert.deepEqual(invoice.order_snapshot, order);
});

test("rate lookup is case-insensitive across product and unit", () => {
  const order = {
    items: [{ product: "WHEAT FLOUR", quantity: 3, unit: "Bag" }],
    delivery_location: "Mysuru",
    delivery_date: "2026-11-10",
    asked_about_pending_credit: false
  };
  const invoice = buildInvoice(order, 3, NOW);
  assert.equal(invoice.items[0].rate_inr_per_unit, 1850);
  assert.equal(invoice.items[0].amount_inr, 5550);
  assert.equal(invoice.total_inr, 5550);
});

test("uncatalogued products are flagged instead of guessed", () => {
  const order = {
    items: [{ product: "Soap", quantity: 50, unit: "box" }],
    delivery_location: "Jayanagar",
    delivery_date: "2026-11-10",
    asked_about_pending_credit: false
  };
  const invoice = buildInvoice(order, 4, NOW);
  assert.equal(invoice.items[0].rate_inr_per_unit, null);
  assert.equal(invoice.items[0].amount_inr, null);
  assert.equal(invoice.total_inr, null);
  assert.equal(invoice.status, "Draft - pricing pending");
});

test("a missing quantity never produces an amount", () => {
  const order = {
    items: [{ product: "Leaf tea", quantity: null, unit: "pack" }],
    delivery_location: "Mandya",
    delivery_date: "2026-11-10",
    asked_about_pending_credit: false
  };
  const invoice = buildInvoice(order, 5, NOW);
  assert.equal(invoice.items[0].amount_inr, null);
  assert.equal(invoice.status, "Draft - pricing pending");
});

test("the seed ledger invoice follows the same shape", () => {
  assert.equal(SEED_INVOICES.length, 1);
  const seed = SEED_INVOICES[0];
  assert.match(seed.invoice_id, /^INV-\d{8}-\d{3}$/);
  assert.equal(seed.status, "To Be Paid");
  assert.equal(
    seed.total_inr,
    seed.items.reduce((sum, item) => sum + item.amount_inr, 0)
  );
});
