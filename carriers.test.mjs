import test from "node:test";
import assert from "node:assert/strict";
import { buildCarrierDispatch, CARRIER_REGISTRY, getCarrier } from "./carriers.mjs";

const NOW = new Date("2026-11-09T04:30:00Z");
const PENDING_ORDER = {
  order_id: "ORD-1041",
  distributor: "Sri Lakshmi Stores",
  delivery_location: "Jayanagar",
  items: [{ product: "Wheat flour", quantity: 12, unit: "bag" }],
  status: "Pending",
  load_weight_kg: 600,
  carrier_dispatches: []
};

test("carrier registry looks up and rejects unknown carriers", () => {
  assert.equal(CARRIER_REGISTRY.length, 4);
  assert.ok(getCarrier("carrier-anjaneya"));
  assert.equal(getCarrier("carrier-unknown"), null);
});

test("dispatch outcomes are deterministic per order and carrier", () => {
  const carrier = CARRIER_REGISTRY[0];
  const first = buildCarrierDispatch(PENDING_ORDER, carrier, NOW);
  const second = buildCarrierDispatch(PENDING_ORDER, carrier, NOW);
  assert.equal(first.outcome, second.outcome);
  assert.deepEqual(first.pricing, second.pricing);
  assert.equal(first.dispatch_id, "CRD-ORD-1041-1");
});

test("every non-rejected dispatch confirms capacity, ETS and a price pending approval", () => {
  for (const carrier of CARRIER_REGISTRY) {
    const dispatch = buildCarrierDispatch(PENDING_ORDER, carrier, NOW);
    assert.ok(["Confirmed", "Counter-offer", "Rejected"].includes(dispatch.outcome));
    assert.equal(dispatch.simulated, true);
    assert.ok(dispatch.transcript.some((line) => line.speaker === "agent"));
    if (dispatch.outcome === "Rejected") {
      assert.equal(dispatch.capacity_confirmed, false);
      assert.equal(dispatch.price_approval_required, false);
      assert.equal(dispatch.pricing, null);
      continue;
    }
    assert.equal(dispatch.capacity_confirmed, true);
    assert.equal(dispatch.price_approval_required, true);
    assert.equal(dispatch.pricing.price_status.includes("approval"), true);
    assert.equal(dispatch.route.distance_km, 12);
    assert.equal(dispatch.ets.pickup_date, "2026-11-10");
    assert.equal(dispatch.ets.delivery_date, "2026-11-10");
  }
});

test("long routes push the delivery ETS to the day after pickup", () => {
  const hubballiOrder = { ...PENDING_ORDER, order_id: "ORD-1042", delivery_location: "Hubballi" };
  const carrier = CARRIER_REGISTRY.find((entry) => buildCarrierDispatch({ ...hubballiOrder, carrier_dispatches: [] }, entry, NOW).outcome !== "Rejected");
  const dispatch = buildCarrierDispatch(hubballiOrder, carrier, NOW);
  assert.equal(dispatch.route.distance_km, 410);
  assert.equal(dispatch.ets.pickup_date, "2026-11-10");
  assert.equal(dispatch.ets.delivery_date, "2026-11-11");
});

test("counter-offers record a carrier rate above the offered rate", () => {
  const offers = CARRIER_REGISTRY
    .map((carrier) => buildCarrierDispatch(PENDING_ORDER, carrier, NOW))
    .filter((dispatch) => dispatch.outcome === "Counter-offer");
  if (offers.length > 0) {
    const dispatch = offers[0];
    assert.ok(dispatch.pricing.carrier_rate_inr_per_km > dispatch.pricing.offered_rate_inr_per_km);
  }
});

test("the agent never commits a price on the call", () => {
  for (const carrier of CARRIER_REGISTRY) {
    const dispatch = buildCarrierDispatch(PENDING_ORDER, carrier, NOW);
    const recorded = dispatch.transcript.filter((line) => line.speaker === "agent").map((line) => line.text).join(" ");
    if (dispatch.outcome !== "Rejected") assert.match(recorded, /approval/);
  }
});
