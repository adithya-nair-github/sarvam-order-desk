function isValidIsoDate(value) {
  if (typeof value !== "string" || !/^\d{4}-\d{2}-\d{2}$/.test(value)) return false;
  const date = new Date(`${value}T00:00:00Z`);
  return !Number.isNaN(date.valueOf()) && date.toISOString().slice(0, 10) === value;
}

export function sanitizeOrder(value) {
  if (!value || typeof value !== "object" || !Array.isArray(value.items)) {
    throw new Error("The model returned an invalid order shape.");
  }
  return {
    items: value.items.slice(0, 30).map((item) => ({
      product: typeof item?.product === "string" && item.product.trim() ? item.product.trim() : null,
      quantity: typeof item?.quantity === "number" && Number.isFinite(item.quantity) && item.quantity > 0 ? item.quantity : null,
      unit: typeof item?.unit === "string" && item.unit.trim() ? item.unit.trim() : null
    })),
    delivery_location: typeof value.delivery_location === "string" && value.delivery_location.trim() ? value.delivery_location.trim() : null,
    delivery_date: isValidIsoDate(value.delivery_date) ? value.delivery_date : null,
    asked_about_pending_credit: value.asked_about_pending_credit === true
  };
}

export function findMissingFields(order) {
  const missing = [];
  if (order.items.length === 0) missing.push("items");
  order.items.forEach((item, index) => {
    if (!item.product) missing.push(`items[${index}].product`);
    if (item.quantity === null) missing.push(`items[${index}].quantity`);
    if (!item.unit) missing.push(`items[${index}].unit`);
  });
  if (!order.delivery_location) missing.push("delivery_location");
  if (!order.delivery_date) missing.push("delivery_date");
  return missing;
}
