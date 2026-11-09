const NUMBER_WORDS = new Map([
  ["one", 1], ["ek", 1], ["एक", 1], ["ಒಂದು", 1], ["ಒಂದ್", 1],
  ["two", 2], ["do", 2], ["दो", 2], ["ಎರಡು", 2],
  ["three", 3], ["teen", 3], ["तीन", 3], ["ಮೂರು", 3],
  ["four", 4], ["char", 4], ["चार", 4], ["ನಾಲ್ಕು", 4],
  ["five", 5], ["paanch", 5], ["पांच", 5], ["पाँच", 5], ["ಐದು", 5],
  ["six", 6], ["chhah", 6], ["छह", 6], ["ಆರು", 6],
  ["seven", 7], ["saat", 7], ["सात", 7], ["ಏಳು", 7],
  ["eight", 8], ["aath", 8], ["आठ", 8], ["ಎಂಟು", 8],
  ["nine", 9], ["nau", 9], ["नौ", 9], ["ಒಂಬತ್ತು", 9],
  ["ten", 10], ["das", 10], ["दस", 10], ["ಹತ್ತು", 10],
  ["twelve", 12], ["बारह", 12], ["ಹನ್ನೆರಡು", 12],
  ["twenty", 20], ["बीस", 20], ["ಇಪ್ಪತ್ತು", 20]
]);

const UNITS = [
  { unit: "kg", aliases: ["kg", "kgs", "kilo", "kilos", "kilogram", "kilograms", "किलो", "किलोग्राम", "ಕೆಜಿ", "ಕಿಲೋ"] },
  { unit: "g", aliases: ["g", "gm", "gms", "gram", "grams", "ग्राम", "ಗ್ರಾಂ"] },
  { unit: "litre", aliases: ["l", "lt", "ltr", "litre", "litres", "liter", "liters", "लीटर", "ಲೀಟರ್"] },
  { unit: "case", aliases: ["case", "cases", "carton", "cartons", "crate", "crates", "पेटी", "कार्टन", "ಕೇಸ್", "ಕಾರ್ಟನ್"] },
  { unit: "bag", aliases: ["bag", "bags", "sack", "sacks", "बोरी", "थैला", "ಚೀಲ"] },
  { unit: "box", aliases: ["box", "boxes", "डिब्बा", "डिब्बे", "ಬಾಕ್ಸ್"] },
  { unit: "pack", aliases: ["pack", "packs", "packet", "packets", "pkt", "पैक", "पैकेट", "ಪ್ಯಾಕ್", "ಪ್ಯಾಕೆಟ್"] },
  { unit: "pouch", aliases: ["pouch", "pouches", "पाउच", "ಪೌಚ್"] }
];

export const PRODUCT_CATALOG = [
  {
    product: "Wheat flour",
    defaultUnit: "bag",
    aliases: ["wheat flour", "atta", "गेहूं का आटा", "गेहूं आटा", "आटा", "ಗೋಧಿ ಹಿಟ್ಟು", "ಗೋಧಿಹಿಟ್ಟು"]
  },
  {
    product: "Iodized salt",
    defaultUnit: "pack",
    aliases: ["iodized salt", "salt", "नमक", "ಉಪ್ಪು"]
  },
  {
    product: "Leaf tea",
    defaultUnit: "pack",
    aliases: ["leaf tea", "tea", "chai", "चाय", "ಚಹಾ"]
  },
  {
    product: "Cooking oil",
    defaultUnit: "pouch",
    aliases: ["cooking oil", "edible oil", "oil", "तेल", "ಅಡುಗೆ ಎಣ್ಣೆ", "ಎಣ್ಣೆ"]
  }
];

const LOCATIONS = [
  { name: "Bengaluru", aliases: ["bengaluru", "bangalore", "ಬೆಂಗಳೂರು", "ಬೆಂಗಳೂರ", "बेंगलुरु", "बैंगलोर"] },
  { name: "Mysuru", aliases: ["mysuru", "mysore", "ಮೈಸೂರು", "मैसूर"] },
  { name: "Hubballi", aliases: ["hubballi", "hubli", "ಹುಬ್ಬಳ್ಳಿ", "हुबली"] },
  { name: "Mandya", aliases: ["mandya", "ಮಂಡ್ಯ", "मांड्या"] },
  { name: "Dharwad", aliases: ["dharwad", "ಧಾರವಾಡ", "धारवाड़"] }
];

const CREDIT_TERMS = ["pending credit", "credit balance", "outstanding", "udhaar", "उधार", "बाकी", "क्रेडिट", "ಬಾಕಿ", "ಸಾಲ"];
const DATE_ALIASES = [
  { offset: 2, aliases: ["day after tomorrow", "परसों", "ನಾಡಿದ್ದು"] },
  { offset: 1, aliases: ["tomorrow", "कल", "ನಾಳೆ"] },
  { offset: 0, aliases: ["today", "आज", "ಇಂದು"] }
];

const WEEKDAYS = [
  ["sunday", "रविवार", "ಭಾನುವಾರ"],
  ["monday", "सोमवार", "ಸೋಮವಾರ"],
  ["tuesday", "मंगलवार", "ಮಂಗಳವಾರ"],
  ["wednesday", "बुधवार", "ಬುಧವಾರ"],
  ["thursday", "गुरुवार", "ಗುರುವಾರ"],
  ["friday", "शुक्रवार", "ಶುಕ್ರವಾರ"],
  ["saturday", "शनिवार", "ಶನಿವಾರ"]
];

function normalizeDigits(text) {
  return text
    .replace(/[०-९]/g, (digit) => String(digit.charCodeAt(0) - 0x0966))
    .replace(/[೦-೯]/g, (digit) => String(digit.charCodeAt(0) - 0x0ce6));
}

function normalizeText(text) {
  return normalizeDigits(text)
    .toLocaleLowerCase("en-IN")
    .replace(/[.,!?;:()[\]{}]/g, " ")
    .replace(/\s+/g, " ")
    .trim();
}

function escaped(text) {
  return text.replace(/[.*+?^${}()|[\]\\]/g, "\\$&");
}

function findOccurrences(text, alias) {
  const occurrences = [];
  if (/^[a-z0-9 ]+$/i.test(alias)) {
    const pattern = new RegExp(`(^|[^a-z0-9])(${escaped(alias)})(?=$|[^a-z0-9])`, "g");
    for (const match of text.matchAll(pattern)) {
      occurrences.push({ start: match.index + match[1].length, end: match.index + match[0].length });
    }
    return occurrences;
  }

  let start = 0;
  while ((start = text.indexOf(alias, start)) !== -1) {
    occurrences.push({ start, end: start + alias.length });
    start += alias.length;
  }
  return occurrences;
}

function tokenize(text) {
  return text.match(/[\p{L}\p{M}\p{N}]+(?:\.[\p{N}]+)?/gu) ?? [];
}

function numberValue(token) {
  const numeric = Number(token);
  if (Number.isFinite(numeric) && token !== "") return numeric;
  return NUMBER_WORDS.get(token) ?? null;
}

function unitFromTokens(tokens) {
  const phrase = ` ${tokens.join(" ")} `;
  for (const entry of UNITS) {
    if (entry.aliases.some((alias) => phrase.includes(` ${alias} `))) return entry.unit;
  }
  return null;
}

function quantityAndUnit(beforeText, afterText, defaultUnit) {
  const before = tokenize(beforeText);
  const after = tokenize(afterText);
  const candidates = [];

  for (let index = Math.max(0, before.length - 8); index < before.length; index += 1) {
    const quantity = numberValue(before[index]);
    if (quantity !== null) candidates.push({ quantity, distance: before.length - index, side: "before", index });
  }
  for (let index = 0; index < Math.min(after.length, 8); index += 1) {
    const quantity = numberValue(after[index]);
    if (quantity !== null) candidates.push({ quantity, distance: index + 1, side: "after", index });
  }

  candidates.sort((left, right) => left.distance - right.distance || (left.side === "before" ? -1 : 1));
  const candidate = candidates[0];
  if (!candidate) return { quantity: null, unit: defaultUnit };

  const neighborhood = candidate.side === "before"
    ? [...before.slice(Math.max(0, candidate.index - 2), candidate.index + 4), ...after.slice(0, 2)]
    : [...before.slice(-2), ...after.slice(0, candidate.index + 4)];
  return { quantity: candidate.quantity, unit: unitFromTokens(neighborhood) ?? defaultUnit };
}

function matchProducts(text) {
  const found = [];
  for (const entry of PRODUCT_CATALOG) {
    const matches = entry.aliases.flatMap((alias) =>
      findOccurrences(text, alias).map((range) => ({ ...range, entry }))
    ).sort((left, right) => left.start - right.start || right.end - left.end);

    const selected = [];
    for (const match of matches) {
      if (selected.some((existing) => match.start < existing.end && match.end > existing.start)) continue;
      selected.push(match);
    }
    found.push(...selected);
  }
  return found.sort((left, right) => left.start - right.start);
}

function parseLocation(text) {
  const matches = LOCATIONS.flatMap((location) =>
    location.aliases.flatMap((alias) =>
      findOccurrences(text, alias).map((range) => ({ ...range, location }))
    )
  ).sort((left, right) => right.end - right.start - (left.end - left.start) || left.start - right.start);

  return matches[0]?.location.name ?? null;
}

function parseDeliveryDate(text) {
  const explicitDate = text.match(/\b(20\d{2})-(\d{2})-(\d{2})\b/);
  if (explicitDate) return `${explicitDate[1]}-${explicitDate[2]}-${explicitDate[3]}`;

  const today = new Date();
  const dateBase = new Date(Date.UTC(today.getUTCFullYear(), today.getUTCMonth(), today.getUTCDate()));
  for (const dateAlias of DATE_ALIASES) {
    if (dateAlias.aliases.some((alias) => text.includes(alias))) {
      dateBase.setUTCDate(dateBase.getUTCDate() + dateAlias.offset);
      return dateBase.toISOString().slice(0, 10);
    }
  }

  for (let weekday = 0; weekday < WEEKDAYS.length; weekday += 1) {
    if (!WEEKDAYS[weekday].some((alias) => text.includes(alias))) continue;
    const daysAhead = (weekday - dateBase.getUTCDay() + 7) % 7 || 7;
    dateBase.setUTCDate(dateBase.getUTCDate() + daysAhead);
    return dateBase.toISOString().slice(0, 10);
  }
  return null;
}

export function parseOrder(transcript) {
  const text = normalizeText(transcript);
  const warnings = [];
  const productMatches = matchProducts(text);
  const items = productMatches.map((match, index) => {
    const previousEnd = productMatches[index - 1]?.end ?? Math.max(0, match.start - 48);
    const nextStart = productMatches[index + 1]?.start ?? Math.min(text.length, match.end + 48);
    const contextBefore = text.slice(Math.max(previousEnd, match.start - 48), match.start);
    const contextAfter = text.slice(match.end, Math.min(nextStart, match.end + 48));
    const { quantity, unit } = quantityAndUnit(contextBefore, contextAfter, match.entry.defaultUnit);
    if (quantity === null) warnings.push(`Quantity not heard for ${match.entry.product}. Check before confirming.`);
    return { product: match.entry.product, quantity, unit };
  });

  const deliveryLocation = parseLocation(text);
  if (items.length === 0) warnings.push("No demo catalog products were recognized. Check the transcript before confirming.");
  if (!deliveryLocation) warnings.push("Delivery location not recognized. Check the transcript before confirming.");

  const askedAboutPendingCredit = CREDIT_TERMS.some((term) => text.includes(term));
  const order = {
    items,
    delivery_location: deliveryLocation,
    delivery_date: parseDeliveryDate(text),
    asked_about_pending_credit: askedAboutPendingCredit
  };
  return { order, warnings };
}
