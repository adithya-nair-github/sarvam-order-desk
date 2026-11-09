export const SEED_ACCOUNTS = [
  {
    account_id: "ACC-2001",
    distributor: "Sri Lakshmi Stores",
    credit_limit_inr: 100000,
    outstanding_inr: 18450,
    oldest_due_date: "2026-10-28",
    invoice_refs: ["INV-8801", "INV-8815"],
    promised_payment_date: null,
    payment_reported_at: null,
    dispute_open: false,
    collections: []
  },
  {
    account_id: "ACC-2002",
    distributor: "Prakash Traders",
    credit_limit_inr: 150000,
    outstanding_inr: 52300,
    oldest_due_date: "2026-10-12",
    invoice_refs: ["INV-7740", "INV-7802"],
    promised_payment_date: null,
    payment_reported_at: null,
    dispute_open: false,
    collections: []
  },
  {
    account_id: "ACC-2003",
    distributor: "Maruti Provision Store",
    credit_limit_inr: 80000,
    outstanding_inr: 9750,
    oldest_due_date: "2026-08-25",
    invoice_refs: ["INV-6512"],
    promised_payment_date: null,
    payment_reported_at: null,
    dispute_open: false,
    collections: []
  },
  {
    account_id: "ACC-2004",
    distributor: "Ganesh Super Market",
    credit_limit_inr: 120000,
    outstanding_inr: 34110,
    oldest_due_date: "2026-11-02",
    invoice_refs: ["INV-8462", "INV-8470"],
    promised_payment_date: null,
    payment_reported_at: null,
    dispute_open: false,
    collections: []
  },
  {
    account_id: "ACC-2005",
    distributor: "Novelty Kirana",
    credit_limit_inr: 60000,
    outstanding_inr: 6290,
    oldest_due_date: "2026-10-05",
    invoice_refs: ["INV-8123"],
    promised_payment_date: null,
    payment_reported_at: null,
    dispute_open: false,
    collections: []
  }
];

export function agingDays(dueDate, now = new Date()) {
  const due = Date.parse(`${dueDate}T00:00:00Z`);
  const today = Date.UTC(now.getUTCFullYear(), now.getUTCMonth(), now.getUTCDate());
  if (Number.isNaN(due)) return 0;
  return Math.max(0, Math.floor((today - due) / 86400000));
}

function utcDateOnly(now, extraDays) {
  const base = Date.UTC(now.getUTCFullYear(), now.getUTCMonth(), now.getUTCDate(), 12);
  return new Date(base + extraDays * 86400000).toISOString().slice(0, 10);
}

function outcomeFor(accountId, attempt) {
  let hash = 0;
  for (const character of `COL:${accountId}:${attempt}`) {
    hash = (hash * 31 + character.charCodeAt(0)) % 997;
  }
  if (hash % 10 < 5) return "Promise to Pay";
  if (hash % 10 < 8) return "Paid";
  return "Dispute";
}

export function buildCollectionsCall(account, now = new Date()) {
  const attempt = (account.collections?.length ?? 0) + 1;
  const outcome = outcomeFor(account.account_id, attempt);
  const balance = account.outstanding_inr;
  const invoices = account.invoice_refs.join(", ");
  const promiseDate = utcDateOnly(now, 5);
  const paidDate = utcDateOnly(now, -1);
  const agentLine = (text) => ({ speaker: "agent", text });
  const distributorLine = (text) => ({ speaker: `${account.distributor} (simulated)`, text });

  const call = {
    call_id: `COL-${account.account_id}-${attempt}`,
    simulated: true,
    outcome,
    balance_at_call: balance,
    requires_human_escalation: outcome === "Dispute",
    transcript: [],
    logged_at: now.toISOString()
  };

  const opening = agentLine(`Hello, this is the Namma Order Desk automated collections agent, calling about an outstanding balance of ₹${balance.toLocaleString("en-IN")} on invoices ${invoices}, due since ${account.oldest_due_date}. Could you confirm how and when this balance will be cleared?`);

  if (outcome === "Promise to Pay") {
    call.promise_date = promiseDate;
    call.transcript = [
      opening,
      distributorLine(`The balance is correct. We will clear the full ₹${balance.toLocaleString("en-IN")} by ${promiseDate}.`),
      agentLine(`Recorded: a promise to pay ₹${balance.toLocaleString("en-IN")} by ${promiseDate}. The commitment is logged on the account, and our team will follow up if plans change. This call was simulated for the demo.`)
    ];
  } else if (outcome === "Paid") {
    call.payment_reported_date = paidDate;
    call.transcript = [
      opening,
      distributorLine(`We sent the full payment of ₹${balance.toLocaleString("en-IN")} by UPI on ${paidDate}. Kindly verify with the bank.`),
      agentLine(`Recorded: a payment claim of ₹${balance.toLocaleString("en-IN")}, reported as paid on ${paidDate}. The claim is flagged for payment verification by our team — a reported payment is only credited after it is verified. This call was simulated for the demo.`)
    ];
  } else {
    call.transcript = [
      opening,
      distributorLine("Some of these invoice items were never delivered to us. We dispute the balance until it is reconciled."),
      agentLine(`Recorded: a dispute on the balance of ₹${balance.toLocaleString("en-IN")}. I am escalating this to a person for reconciliation; no payment is assumed and no reminder will continue until the dispute is resolved. This call was simulated for the demo.`)
    ];
  }

  return call;
}
