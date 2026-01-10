// Utility helpers extracted from App.jsx
export const uid = (prefix = "id") => {
  try {
    if (typeof crypto !== "undefined" && crypto.randomUUID) return crypto.randomUUID();
  } catch {
    // ignore
  }
  return `${prefix}-${Date.now()}-${Math.random().toString(16).slice(2)}`;
};

export function safeParse(raw, fallback) {
  try {
    return raw ? JSON.parse(raw) : fallback;
  } catch {
    return fallback;
  }
}

export function isoToday() {
  return new Date().toISOString().slice(0, 10);
}

export function isEmail(s) {
  return /.+@.+\..+/.test(String(s || "").trim());
}

export function toNumberOrNull(v) {
  if (v === "" || v === null || v === undefined) return null;
  const n = Number(v);
  return Number.isFinite(n) ? n : null;
}

export function moneyFmt(n) {
  if (n === null || n === undefined) return "-";
  const x = Number(n);
  if (!Number.isFinite(x)) return "-";
  return x.toFixed(2);
}

export function buildMailto(email, subject, body) {
  const s = encodeURIComponent(subject || "");
  const b = encodeURIComponent(body || "");
  return `mailto:${encodeURIComponent(email || "")}?subject=${s}&body=${b}`;
}

export function buildRFQSubject({ rfq, request, vendor }) {
  const bits = [];
  bits.push(rfq.subjectPrefix || "RFQ");
  if (request.reference) bits.push(request.reference);
  if (request.title) bits.push(request.title);
  if (vendor?.name) bits.push(`(${vendor.name})`);
  return bits.join(" - ").trim();
}

export function buildRFQBody({ profile, rfq, request, vendor }) {
  const lines = [];
  const greetingName = vendor?.name ? `${rfq.greeting} ${vendor.name},` : `${rfq.greeting} Sir/Madam,`;
  lines.push(greetingName);
  lines.push("");

  lines.push("Please provide a quotation for the following request:");
  lines.push("");
  if (request.title) lines.push(`Title: ${request.title}`);
  if (request.category) lines.push(`Category: ${request.category}`);
  if (request.reference) lines.push(`Reference: ${request.reference}`);
  if (request.neededBy) lines.push(`Needed by: ${request.neededBy}`);
  if (request.deliveryTo) lines.push(`Delivery to: ${request.deliveryTo}`);
  lines.push("");

  if (request.spec) {
    lines.push("Specification / items:");
    lines.push(request.spec);
    lines.push("");
  }

  if (request.notes) {
    lines.push("Notes:");
    lines.push(request.notes);
    lines.push("");
  }

  lines.push("Please include in your quote:");
  const inc = rfq.include || {};
  if (inc.leadTime) lines.push("- Lead time / delivery timeframe");
  if (inc.validity) lines.push("- Quote validity period");
  if (inc.delivery) lines.push("- Delivery charges (if any)");
  if (inc.payment) lines.push(`- ${rfq.paymentLine || "Payment terms"}`);
  lines.push("");

  lines.push(rfq.closing || "Kind regards");
  lines.push(profile?.user || rfq.signatureName || "");
  if (profile?.org) lines.push(profile.org);

  return lines.filter((l) => l !== undefined).join("\n");
}

export const norm = (s) => (s || "").toString().trim();
export const parseTags = (s) =>
  norm(s)
    .split(",")
    .map((x) => norm(x))
    .filter(Boolean);

export const uniqBy = (arr, keyFn) => {
  const seen = new Set();
  const out = [];
  for (const x of arr) {
    const k = keyFn(x);
    if (!k || seen.has(k)) continue;
    seen.add(k);
    out.push(x);
  }
  return out;
};

export const vendorKey = (v) => {
  const email = norm(v.email).toLowerCase();
  const web = norm(v.website).toLowerCase().replace(/^https?:\/\//, "");
  return email || web || norm(v.name).toLowerCase();
};

export const buildVendorSearchTermsDE = ({ request, category, city }) => {
  const title = norm(request?.title);
  const spec = norm(request?.spec || request?.description);
  const where = norm(city) || "Deutschland";
  const cat = norm(category);

  const base = [title, spec].filter(Boolean).join(" ").trim();
  const catBit = cat ? cat : "";

  const q1 = [base, catBit, where, "Angebot", "Lieferzeit", "E-Mail"].filter(Boolean).join(" ");
  const q2 = [base, catBit, where, "Händler", "Kontakt", "Ansprechpartner"].filter(Boolean).join(" ");
  const q3 = [base, where, "Firma", "E-Mail", "Telefon"].filter(Boolean).join(" ");

  return uniqBy([q1, q2, q3].map((x) => norm(x)).filter(Boolean), (x) => x);
};

export const googleDE = (q) => `https://www.google.de/search?q=${encodeURIComponent(q)}`;
export const googleMapsDE = (q) => `https://www.google.de/maps/search/${encodeURIComponent(q)}`;

export const pickThreeFromLibrary = ({ library, category, requiredTags = [] }) => {
  const cat = norm(category).toLowerCase();
  const tags = requiredTags.map((t) => norm(t).toLowerCase()).filter(Boolean);

  const scored = library.map((v) => {
    const vCat = norm(v.category).toLowerCase();
    const vTags = (v.tags || []).map((t) => norm(t).toLowerCase());
    let score = 0;
    if (cat && vCat === cat) score += 3;
    for (const t of tags) if (vTags.includes(t)) score += 2;
    if (norm(v.email)) score += 1;
    if (norm(v.website)) score += 1;
    return { v, score };
  });

  scored.sort((a, b) => b.score - a.score);
  return scored.slice(0, 3).map((x) => x.v);
};