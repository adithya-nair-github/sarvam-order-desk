const PRICE_CARD_INR = new Map([
  ["wheat flour|bag", 1850],
  ["wheat flour|kg", 42],
  ["iodized salt|pack", 25],
  ["leaf tea|pack", 160],
  ["cooking oil|pouch", 135]
]);

export const SEED_INVOICES = [
  {
    invoice_id: "INV-20261108-001",
    generated_at: "2026-11-08T05:30:00.000Z",
    bill_to: "Ganesh Super Market (demo seed)",
    items: [
      { product: "Wheat flour", quantity: 4, unit: "bag", rate_inr_per_unit: 1850, amount_inr: 7400 },
      { product: "Iodized salt", quantity: 2, unit: "pack", rate_inr_per_unit: 25, amount_inr: 50 }
    ],
    total_inr: 7450,
    credit_terms: "Net 7 Days",
    due_date: "2026-11-15",
    status: "To Be Paid",
    order_snapshot: {
      items: [
        { product: "Wheat flour", quantity: 4, unit: "bag" },
        { product: "Iodized salt", quantity: 2, unit: "pack" }
      ],
      delivery_location: "Mysuru",
      delivery_date: "2026-11-08",
      asked_about_pending_credit: false
    },
    simulated: true
  }
];

function priceKey(product, unit) {
  return `${String(product).toLowerCase()}|${String(unit).toLowerCase()}`;
}

function utcDateOnly(now, extraDays) {
  const base = Date.UTC(now.getUTCFullYear(), now.getUTCMonth(), now.getUTCDate(), 12);
  return new Date(base + extraDays * 86400000).toISOString().slice(0, 10);
}

export function buildInvoice(order, sequence, now = new Date()) {
  const items = order.items.map((item) => {
    const rate = PRICE_CARD_INR.get(priceKey(item.product, item.unit)) ?? null;
    const amount = rate !== null && item.quantity !== null && item.quantity > 0 ? rate * item.quantity : null;
    return {
      product: item.product,
      quantity: item.quantity,
      unit: item.unit,
      rate_inr_per_unit: rate,
      amount_inr: amount
    };
  });
  const allPriced = items.length > 0 && items.every((item) => item.amount_inr !== null);
  const total = allPriced ? items.reduce((sum, item) => sum + item.amount_inr, 0) : null;
  const dateStamp = now.toISOString().slice(0, 10).replaceAll("-", "");

  return {
    invoice_id: `INV-${dateStamp}-${String(sequence).padStart(3, "0")}`,
    generated_at: now.toISOString(),
    bill_to: order.bill_to || "Distributor (voice-order draft)",
    items,
    total_inr: total,
    credit_terms: "Net 7 Days",
    due_date: utcDateOnly(now, 7),
    status: allPriced ? "To Be Paid" : "Draft - pricing pending",
    order_snapshot: order,
    simulated: true
  };
}
