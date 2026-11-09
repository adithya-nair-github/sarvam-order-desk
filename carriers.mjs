export const CARRIER_REGISTRY = [
  { id: "carrier-anjaneya", name: "Anjaneya Roadlines", vehicle: "Ashok Leyland Dost (1.25 t)", capacity_kg: 1250, base_rate_inr_per_km: 14 },
  { id: "carrier-chethan", name: "Chethan Transports", vehicle: "Tata Ace (750 kg)", capacity_kg: 750, base_rate_inr_per_km: 11 },
  { id: "carrier-deepak", name: "Deepak Freight Movers", vehicle: "Eicher Pro 3015 (14 t)", capacity_kg: 14000, base_rate_inr_per_km: 22 },
  { id: "carrier-sagar", name: "Sagar Logistics", vehicle: "Mahindra Bolero Pickup (1 t)", capacity_kg: 1000, base_rate_inr_per_km: 13 }
];

const ROUTE_DISTANCES_KM = new Map([
  ["Jayanagar", 12],
  ["Hubballi", 410],
  ["Mysuru", 145],
  ["Mandya", 105],
  ["Dharwad", 430]
]);

export const getCarrier = (carrierId) => CARRIER_REGISTRY.find((carrier) => carrier.id === carrierId) ?? null;

function outcomeFor(orderId, carrierId) {
  let hash = 0;
  for (const character of `${orderId}:${carrierId}`) {
    hash = (hash * 31 + character.charCodeAt(0)) % 997;
  }
  const bucket = hash % 10;
  if (bucket < 6) return "Confirmed";
  if (bucket < 8) return "Counter-offer";
  return "Rejected";
}

function utcDateOnly(now, extraDays) {
  const base = Date.UTC(now.getUTCFullYear(), now.getUTCMonth(), now.getUTCDate(), 12);
  return new Date(base + extraDays * 86400000).toISOString().slice(0, 10);
}

export function buildCarrierDispatch(order, carrier, now = new Date()) {
  const distance = ROUTE_DISTANCES_KM.get(order.delivery_location) ?? 100;
  const outcome = outcomeFor(order.order_id, carrier.id);
  const pickupDate = utcDateOnly(now, 1);
  const sameDay = distance <= 150;
  const deliveryDate = utcDateOnly(now, sameDay ? 1 : 2);
  const deliveryWindow = sameDay ? "by 14:00" : "between 10:00 and 12:00";
  const load = order.load_weight_kg ?? 0;
  const offeredRate = carrier.base_rate_inr_per_km;
  const counterRate = offeredRate + 4;
  const agentLine = (text) => ({ speaker: "agent", text });
  const carrierLine = (text) => ({ speaker: `carrier ${carrier.name} (simulated)`, text });

  const opening = agentLine(`Hello, this is the Namma Order Desk automated dispatch agent. Could your ${carrier.vehicle} take an outbound load of about ${load} kg from the Bengaluru distribution hub to ${order.delivery_location} tomorrow, ${pickupDate}, with pickup between 08:00 and 10:00? The route is about ${distance} km and our budgeted rate is ₹${offeredRate} per km.`);

  const dispatch = {
    dispatch_id: `CRD-${order.order_id}-${(order.carrier_dispatches?.length ?? 0) + 1}`,
    simulated: true,
    carrier: { id: carrier.id, name: carrier.name, vehicle: carrier.vehicle, capacity_kg: carrier.capacity_kg },
    load_weight_kg: order.load_weight_kg ?? null,
    route: { origin: "Bengaluru distribution hub", destination: order.delivery_location, distance_km: distance },
    outcome,
    price_approval_required: outcome !== "Rejected",
    logged_at: now.toISOString(),
    transcript: []
  };

  if (outcome === "Confirmed") {
    dispatch.capacity_confirmed = true;
    dispatch.ets = {
      pickup_date: pickupDate,
      pickup_window: "between 08:00 and 10:00",
      delivery_date: deliveryDate,
      delivery_window: deliveryWindow
    };
    dispatch.pricing = {
      offered_rate_inr_per_km: offeredRate,
      carrier_rate_inr_per_km: offeredRate,
      estimated_price_inr: offeredRate * distance,
      price_status: "recorded for human approval"
    };
    dispatch.transcript = [
      opening,
      carrierLine(`Yes, we have a vehicle free in that window. The ${carrier.vehicle} can carry up to ${carrier.capacity_kg} kg, so a ${load} kg load fits. We are fine with ₹${offeredRate} per km.`),
      agentLine(`Recorded: capacity confirmed for ${load} kg, pickup on ${pickupDate} between 08:00 and 10:00, ${distance} km to ${order.delivery_location}, expected delivery ${deliveryDate} ${deliveryWindow}. The rate of ₹${offeredRate} per km is logged for human approval — I cannot commit the price on this call. This call was simulated for the demo.`)
    ];
  } else if (outcome === "Counter-offer") {
    dispatch.capacity_confirmed = true;
    dispatch.ets = {
      pickup_date: pickupDate,
      pickup_window: "between 08:00 and 10:00",
      delivery_date: deliveryDate,
      delivery_window: deliveryWindow
    };
    dispatch.pricing = {
      offered_rate_inr_per_km: offeredRate,
      carrier_rate_inr_per_km: counterRate,
      estimated_price_inr: counterRate * distance,
      price_status: "counter-offer pending approval"
    };
    dispatch.transcript = [
      opening,
      carrierLine(`The vehicle is free and the load fits, but for the ${order.delivery_location} route we would need ₹${counterRate} per km rather than ₹${offeredRate}.`),
      agentLine(`Recorded your counter-offer of ₹${counterRate} per km for the ${distance} km route. Capacity and the pickup window are noted, but the load is not booked until our team approves the price. This call was simulated for the demo.`)
    ];
  } else {
    dispatch.capacity_confirmed = false;
    dispatch.ets = null;
    dispatch.pricing = null;
    dispatch.transcript = [
      opening,
      carrierLine("Sorry, we do not have a vehicle available in that window."),
      agentLine(`Understood, we will look for another carrier. Order ${order.order_id} stays pending dispatch. This call was simulated for the demo.`)
    ];
  }

  return dispatch;
}
