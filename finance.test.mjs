import test from "node:test";
import assert from "node:assert/strict";
import { agingDays, buildCollectionsCall, SEED_ACCOUNTS } from "./finance.mjs";

const NOW = new Date("2026-11-09T04:30:00Z");
const ACCOUNT = { ...SEED_ACCOUNTS[0], account_id: "ACC-2001", collections: [] };

test("aging is day-based and never negative", () => {
  assert.equal(agingDays("2026-10-28", NOW), 12);
  assert.equal(agingDays("2026-08-25", NOW), 76);
  assert.equal(agingDays("2026-11-15", NOW), 0);
});

test("seed accounts all have balances and invoice refs", () => {
  assert.ok(SEED_ACCOUNTS.length >= 5);
  for (const account of SEED_ACCOUNTS) {
    assert.ok(account.outstanding_inr > 0);
    assert.ok(account.credit_limit_inr >= account.outstanding_inr);
    assert.ok(account.invoice_refs.length > 0);
    assert.deepEqual(account.collections, []);
  }
});

test("collections outcomes are valid and deterministic per attempt", () => {
  const first = buildCollectionsCall(ACCOUNT, NOW);
  const firstReplay = buildCollectionsCall({ ...ACCOUNT, collections: [] }, NOW);
  assert.equal(first.outcome, firstReplay.outcome);
  assert.ok(["Promise to Pay", "Paid", "Dispute"].includes(first.outcome));
  assert.equal(first.call_id, "COL-ACC-2001-1");
  assert.equal(first.simulated, true);
});

test("each outcome matches its own structure", () => {
  const findPair = (wanted) => {
    for (const entry of SEED_ACCOUNTS) {
      for (let attempt = 0; attempt < 4; attempt += 1) {
        const collections = Array(attempt).fill(null);
        if (buildCollectionsCall({ ...entry, collections }, NOW).outcome === wanted) {
          return { seed: entry, collections };
        }
      }
    }
    return null;
  };

  const promisePair = findPair("Promise to Pay");
  assert.ok(promisePair, "a promise outcome exists across seeded accounts");
  const promise = buildCollectionsCall({ ...promisePair.seed, collections: [...promisePair.collections] }, NOW);
  assert.equal(promise.requires_human_escalation, false);
  assert.equal(promise.promise_date, "2026-11-14");
  assert.match(promise.transcript.at(-1).text, /promise to pay/);

  const paidPair = findPair("Paid");
  if (paidPair) {
    const paid = buildCollectionsCall({ ...paidPair.seed, collections: [...paidPair.collections] }, NOW);
    assert.equal(paid.requires_human_escalation, false);
    assert.equal(paid.payment_reported_date, "2026-11-08");
    assert.match(paid.transcript.at(-1).text, /verification/);
  }

  const disputePair = findPair("Dispute");
  assert.ok(disputePair, "a dispute outcome exists across seeded accounts");
  const dispute = buildCollectionsCall({ ...disputePair.seed, collections: [...disputePair.collections] }, NOW);
  assert.equal(dispute.requires_human_escalation, true);
  assert.equal(dispute.promise_date, undefined);
  assert.match(dispute.transcript.at(-1).text, /escalating this to a person/);
});

test("the collection call never mutates the account or claims payment is credited", () => {
  const before = JSON.stringify(ACCOUNT);
  buildCollectionsCall(ACCOUNT, NOW);
  assert.equal(JSON.stringify(ACCOUNT), before);
  for (const seed of SEED_ACCOUNTS) {
    const call = buildCollectionsCall({ ...seed, collections: [] }, NOW);
    const agentText = call.transcript.filter((line) => line.speaker === "agent").map((line) => line.text).join(" ");
    if (call.outcome === "Paid") assert.match(agentText, /only credited after it is verified/);
    if (call.outcome === "Dispute") assert.match(agentText, /escalating this to a person/);
  }
});
