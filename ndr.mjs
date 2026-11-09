import { readFile, writeFile } from "node:fs/promises";
import { SEED_ACCOUNTS } from "./finance.mjs";
import { SEED_INVOICES } from "./invoices.mjs";

export const EXCEPTION_STATUSES = ["Delivery Failed - Shop Closed", "Refused - Quantity Mismatch"];

const SEED_DELIVERIES = [
  {
    order_id: "ORD-1041",
    distributor: "Sri Lakshmi Stores",
    delivery_location: "Jayanagar",
    items: [{ product: "Wheat flour", quantity: 12, unit: "bag" }],
    status: "Pending",
    scheduled_delivery_date: "2026-11-10",
    load_weight_kg: 600,
    carrier_dispatches: [],
    resolution: null
  },
  {
    order_id: "ORD-1042",
    distributor: "Prakash Traders",
    delivery_location: "Hubballi",
    items: [{ product: "Soap", quantity: 50, unit: "box" }],
    status: "Out for Delivery",
    scheduled_delivery_date: "2026-11-09",
    load_weight_kg: 250,
    carrier_dispatches: [],
    resolution: null
  },
  {
    order_id: "ORD-1043",
    distributor: "Novelty Kirana",
    delivery_location: "Jayanagar",
    items: [{ product: "Cooking oil", quantity: 24, unit: "pouch" }],
    status: "Delivery Failed - Shop Closed",
    scheduled_delivery_date: "2026-11-09",
    load_weight_kg: 180,
    carrier_dispatches: [],
    resolution: null
  },
  {
    order_id: "ORD-1044",
    distributor: "Maruti Provision Store",
    delivery_location: "Mandya",
    items: [
      { product: "Iodized salt", quantity: 10, unit: "pack" },
      { product: "Leaf tea", quantity: 6, unit: "pack" }
    ],
    status: "Refused - Quantity Mismatch",
    scheduled_delivery_date: "2026-11-09",
    load_weight_kg: 120,
    carrier_dispatches: [],
    resolution: null
  },
  {
    order_id: "ORD-1045",
    distributor: "Ganesh Super Market",
    delivery_location: "Mysuru",
    items: [{ product: "Wheat flour", quantity: 4, unit: "bag" }],
    status: "Delivered",
    scheduled_delivery_date: "2026-11-08",
    load_weight_kg: 200,
    carrier_dispatches: [],
    resolution: null
  },
  {
    order_id: "ORD-1046",
    distributor: "Chethana Stores",
    delivery_location: "Dharwad",
    items: [
      { product: "Leaf tea", quantity: 8, unit: "pack" },
      { product: "Cooking oil", quantity: 10, unit: "pouch" }
    ],
    status: "Pending",
    scheduled_delivery_date: "2026-11-10",
    load_weight_kg: 340,
    carrier_dispatches: [],
    resolution: null
  }
];

export async function ensureLedger(ledgerPath) {
  try {
    const content = await readFile(ledgerPath, "utf8");
    const ledger = JSON.parse(content);
    if (ledger && Array.isArray(ledger.deliveries)) {
      let changed = false;
      if (!Array.isArray(ledger.accounts)) {
        ledger.accounts = structuredClone(SEED_ACCOUNTS);
        changed = true;
      }
      if (!Array.isArray(ledger.invoices)) {
        ledger.invoices = structuredClone(SEED_INVOICES);
        changed = true;
      }
      if (changed) await writeLedger(ledgerPath, ledger);
      return ledger;
    }
    throw new Error("Ledger file is missing a deliveries array.");
  } catch {
    const seeded = {
      deliveries: structuredClone(SEED_DELIVERIES),
      accounts: structuredClone(SEED_ACCOUNTS),
      invoices: structuredClone(SEED_INVOICES)
    };
    await writeLedger(ledgerPath, seeded);
    return seeded;
  }
}

export async function writeLedger(ledgerPath, ledger) {
  await writeFile(ledgerPath, `${JSON.stringify(ledger, null, 2)}\n`, "utf8");
}

function utcDateOnly(now, extraDays) {
  const base = Date.UTC(now.getUTCFullYear(), now.getUTCMonth(), now.getUTCDate(), 12);
  return new Date(base + extraDays * 86400000).toISOString().slice(0, 10);
}

function summaryText(order) {
  return order.items.map(({ quantity, unit, product }) => `${quantity} ${unit} of ${product}`).join(" plus ");
}

export function buildResolution(order, status, now = new Date()) {
  const agentLine = (line) => ({ speaker: "agent", text: line });
  const tomorrow = utcDateOnly(now, 1);
  const afterTomorrow = utcDateOnly(now, 2);

  if (status === "Delivery Failed - Shop Closed") {
    return {
      resolution_id: `RES-${order.order_id}`,
      simulated: true,
      status: "rescheduled",
      called_parties: ["driver", "receiver"],
      failure_reason: "Shop was closed at the delivery attempt.",
      requires_human_follow_up: false,
      scheduled_delivery_date: tomorrow,
      resolved_at: now.toISOString(),
      transcript: [
        agentLine(`Hello, this is the Namma Order Desk automated agent, speaking with the driver of order ${order.order_id}. The delivery of ${summaryText(order)} to ${order.delivery_location} is reported as failed because the shop was closed. Is the stock still on the vehicle and undamaged?`),
        { speaker: "driver (simulated)", text: "Yes, everything is still on the vehicle and undamaged. The shop was closed when I arrived." },
        agentLine(`Thank you. I will now check with the receiver before rescheduling anything. I can offer a redelivery tomorrow, ${tomorrow}, between 10:00 and 12:00.`),
        { speaker: "receiver (simulated)", text: `Confirmed, we will be open tomorrow morning. Please redeliver order ${order.order_id} then.` },
        agentLine(`Confirmed by the receiver. Order ${order.order_id} is rescheduled for ${tomorrow}, between 10:00 and 12:00. No other details change. This call was simulated for the demo.`)
      ]
    };
  }

  if (status === "Refused - Quantity Mismatch") {
    return {
      resolution_id: `RES-${order.order_id}`,
      simulated: true,
      status: "rescheduled",
      called_parties: ["receiver"],
      failure_reason: "Receiver refused part of the shipment: delivered quantity did not match the invoice.",
      requires_human_follow_up: true,
      scheduled_delivery_date: afterTomorrow,
      resolved_at: now.toISOString(),
      transcript: [
        agentLine(`Hello, this is the Namma Order Desk automated agent about order ${order.order_id}: ${summaryText(order)} to ${order.delivery_location}. The delivery is reported as refused because of a quantity mismatch. Could you confirm what was received against the invoice?`),
        { speaker: "receiver (simulated)", text: "The delivered count was short against the invoice. We accepted the matching portion but refused the rest." },
        agentLine(`Thank you, that is recorded. The quantity dispute is logged for manual reconciliation by a person. I can arrange the shortfall redelivery on ${afterTomorrow}, between 10:00 and 12:00, but only after your confirmation.`),
        { speaker: "receiver (simulated)", text: `Confirmed. Please send the shortfall on ${afterTomorrow}.` },
        agentLine(`Confirmed by the receiver. The shortfall redelivery for order ${order.order_id} is scheduled for ${afterTomorrow}. The quantity dispute stays flagged for human review and no invoice amount is changed automatically. This call was simulated for the demo.`)
      ]
    };
  }

  throw new Error(`No resolution script exists for status "${status}".`);
}
