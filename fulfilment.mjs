import { buildInvoice } from "./invoices.mjs";
import { buildCarrierDispatch, CARRIER_REGISTRY } from "./carriers.mjs";

// The demo distributor behind every voice order. Matches the credit account ACC-2001.
export const DEMO_DISTRIBUTOR = { name: "Sri Lakshmi Stores", account_id: "ACC-2001" };

const UNIT_WEIGHT_KG = new Map([
  ["wheat flour|bag", 50],
  ["wheat flour|kg", 1],
  ["iodized salt|pack", 1],
  ["leaf tea|pack", 0.5],
  ["cooking oil|pouch", 1]
]);
const DEFAULT_UNIT_WEIGHT_KG = 10;

export function estimateLoadKg(items) {
  const total = items.reduce((sum, item) => {
    const perUnit = UNIT_WEIGHT_KG.get(`${String(item.product).toLowerCase()}|${String(item.unit).toLowerCase()}`) ?? DEFAULT_UNIT_WEIGHT_KG;
    return sum + perUnit * (item.quantity ?? 0);
  }, 0);
  return Math.max(1, Math.round(total));
}

export function nextOrderId(deliveries) {
  const highest = deliveries.reduce((max, entry) => {
    const match = /^ORD-(\d+)$/.exec(entry.order_id);
    return match ? Math.max(max, Number(match[1])) : max;
  }, 1040);
  return `ORD-${highest + 1}`;
}

export function creditSnapshot(ledger) {
  const account = ledger.accounts.find((entry) => entry.account_id === DEMO_DISTRIBUTOR.account_id);
  if (!account) return null;
  return { account: account.distributor, outstanding_amount_inr: account.outstanding_inr, due_date: account.oldest_due_date };
}

// One completed voice order becomes: an order record, a proforma invoice,
// a transport request to a carrier, and a balance update on the customer account.
export function fulfilOrder(ledger, order, now = new Date()) {
  const orderId = nextOrderId(ledger.deliveries);
  const loadKg = estimateLoadKg(order.items);

  const delivery = {
    order_id: orderId,
    distributor: DEMO_DISTRIBUTOR.name,
    delivery_location: order.delivery_location,
    items: order.items.map(({ product, quantity, unit }) => ({ product, quantity, unit })),
    status: "Pending",
    scheduled_delivery_date: order.delivery_date,
    load_weight_kg: loadKg,
    load_weight_estimated: true,
    carrier_dispatches: [],
    resolution: null,
    source: "voice order",
    created_at: now.toISOString()
  };

  const invoice = {
    ...buildInvoice({ ...order, bill_to: DEMO_DISTRIBUTOR.name }, ledger.invoices.length + 1, now),
    order_id: orderId
  };
  delivery.invoice_id = invoice.invoice_id;

  // Transport request: try carriers that can carry the load, cheapest rate first,
  // and stop at the first one that confirms capacity or counters. Every call is simulated.
  const candidates = CARRIER_REGISTRY
    .filter((carrier) => carrier.capacity_kg >= loadKg)
    .sort((left, right) => left.base_rate_inr_per_km - right.base_rate_inr_per_km || left.capacity_kg - right.capacity_kg);
  for (const carrier of candidates) {
    const dispatch = buildCarrierDispatch(delivery, carrier, now);
    delivery.carrier_dispatches.push(dispatch);
    if (dispatch.outcome === "Confirmed") delivery.status = "Dispatch Scheduled";
    if (dispatch.outcome !== "Rejected") break;
  }
  const transport = delivery.carrier_dispatches.at(-1) ?? null;

  let account = null;
  const target = ledger.accounts.find((entry) => entry.account_id === DEMO_DISTRIBUTOR.account_id);
  if (target && invoice.total_inr !== null) {
    target.outstanding_inr += invoice.total_inr;
    target.invoice_refs = [...target.invoice_refs, invoice.invoice_id];
    account = {
      account_id: target.account_id,
      distributor: target.distributor,
      outstanding_inr: target.outstanding_inr,
      credit_limit_inr: target.credit_limit_inr,
      over_credit_limit: target.outstanding_inr > target.credit_limit_inr
    };
  }

  ledger.deliveries.push(delivery);
  ledger.invoices.push(invoice);
  return { delivery, invoice, transport, account };
}
