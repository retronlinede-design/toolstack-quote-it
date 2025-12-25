// Quote-It (ToolStack) — module-ready MVP (Styled to match Inspect-It master)
// Paste into: src/App.jsx
// Requires: Tailwind v4 configured (same as other ToolStack apps).

import React, { useEffect, useMemo, useRef, useState } from "react";

const APP_ID = "quoteit";
const APP_VERSION = "v1";

// Per-module storage namespace
const KEY = `toolstack.${APP_ID}.${APP_VERSION}`;

// Shared profile (used by all modules later)
const PROFILE_KEY = "toolstack.profile.v1";

// Optional: set later
const HUB_URL = "https://YOUR-WIX-HUB-URL-HERE";

// ✅ Same style of id helper as Budgit (prevents crypto issues on some builds)
const uid = (prefix = "id") => {
  try {
    if (typeof crypto !== "undefined" && crypto.randomUUID) return crypto.randomUUID();
  } catch {
    // ignore
  }
  return `${prefix}-${Date.now()}-${Math.random().toString(16).slice(2)}`;
};

function safeParse(raw, fallback) {
  try {
    return raw ? JSON.parse(raw) : fallback;
  } catch {
    return fallback;
  }
}

function isoToday() {
  return new Date().toISOString().slice(0, 10);
}

function loadProfile() {
  return (
    safeParse(localStorage.getItem(PROFILE_KEY), null) || {
      org: "ToolStack",
      user: "",
      language: "EN",
      logo: "",
    }
  );
}

function defaultState() {
  const mkVendor = () => ({
    id: uid("v"),
    name: "",
    email: "",
    phone: "",
    website: "",
    notes: "",
  });

  return {
    meta: { appId: APP_ID, version: APP_VERSION, updatedAt: new Date().toISOString() },
    ui: { step: 0 },
    request: {
      title: "",
      category: "",
      reference: "",
      neededBy: "",
      deliveryTo: "",
      spec: "",
      notes: "",
    },
    vendors: [mkVendor(), mkVendor(), mkVendor()],
    rfq: {
      subjectPrefix: "RFQ",
      greeting: "Dear",
      closing: "Kind regards",
      include: {
        leadTime: true,
        validity: true,
        delivery: true,
        payment: true,
      },
      paymentLine: "Please include payment terms.",
      signatureName: "",
    },
    quotes: [],
    compliance: {
      selectedVendorId: "",
      justification: "",
    },
  };
}

function loadState() {
  return safeParse(localStorage.getItem(KEY), null) || defaultState();
}

// NOTE: do NOT write to localStorage here (prevents double-save loops)
function saveState(state) {
  return {
    ...state,
    meta: { ...state.meta, updatedAt: new Date().toISOString() },
  };
}

function isEmail(s) {
  return /.+@.+\..+/.test(String(s || "").trim());
}

function toNumberOrNull(v) {
  if (v === "" || v === null || v === undefined) return null;
  const n = Number(v);
  return Number.isFinite(n) ? n : null;
}

function moneyFmt(n) {
  if (n === null || n === undefined) return "-";
  const x = Number(n);
  if (!Number.isFinite(x)) return "-";
  return x.toFixed(2);
}

function buildMailto(email, subject, body) {
  const s = encodeURIComponent(subject || "");
  const b = encodeURIComponent(body || "");
  return `mailto:${encodeURIComponent(email || "")}?subject=${s}&body=${b}`;
}

function buildRFQSubject({ rfq, request, vendor }) {
  const bits = [];
  bits.push(rfq.subjectPrefix || "RFQ");
  if (request.reference) bits.push(request.reference);
  if (request.title) bits.push(request.title);
  if (vendor?.name) bits.push(`(${vendor.name})`);
  return bits.join(" - ").trim();
}

function buildRFQBody({ profile, rfq, request, vendor }) {
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

// Inspect-It master styles (copied exactly)
const btnSecondary =
  "px-3 py-2 rounded-xl bg-white border border-neutral-200 shadow-sm hover:bg-neutral-50 active:translate-y-[1px] transition";
const btnPrimary =
  "px-3 py-2 rounded-xl bg-neutral-900 text-white border border-neutral-900 shadow-sm hover:bg-neutral-800 active:translate-y-[1px] transition";
const inputBase =
  "w-full mt-1 px-3 py-2 rounded-xl border border-neutral-200 bg-white focus:outline-none focus:ring-2 focus:ring-lime-400/25 focus:border-neutral-300";

function StepPill({ label, active, done, onClick }) {
  // Keep Inspect-It look: inactive = btnSecondary, active = btnPrimary
  return (
    <button
      onClick={onClick}
      className={active ? btnPrimary : btnSecondary}
      title={done ? "Done" : ""}
    >
      <span className="inline-flex items-center gap-2">
        <span>{label}</span>
        {done ? <span className="text-xs opacity-90">✓</span> : null}
      </span>
    </button>
  );
}

export default function App() {
  const [profile, setProfile] = useState(loadProfile());
  const [state, setState] = useState(loadState());

  const [previewOpen, setPreviewOpen] = useState(false);
  const importRef = useRef(null);

  // ✅ Debounced profile persist (prevents keystroke thrash)
  useEffect(() => {
    const t = setTimeout(() => {
      localStorage.setItem(PROFILE_KEY, JSON.stringify(profile));
    }, 300);
    return () => clearTimeout(t);
  }, [profile]);

  // ✅ Debounced state persist (single persist path)
  useEffect(() => {
    const t = setTimeout(() => {
      localStorage.setItem(KEY, JSON.stringify(state));
    }, 350);
    return () => clearTimeout(t);
  }, [state]);

  const step = state.ui.step;

  const steps = useMemo(
    () => [
      { key: "request", label: "1. Request" },
      { key: "vendors", label: "2. Vendors" },
      { key: "rfq", label: "3. RFQs" },
      { key: "quotes", label: "4. Quotes" },
      { key: "pack", label: "5. Pack" },
    ],
    []
  );

  const vendors = state.vendors || [];
  const vendorCount = vendors.filter((v) => String(v.name || "").trim()).length;
  const emailCount = vendors.filter((v) => isEmail(v.email)).length;

  const quotesByVendor = useMemo(() => {
    const m = new Map();
    for (const q of state.quotes || []) m.set(q.vendorId, q);
    return m;
  }, [state.quotes]);

  const quoteRows = useMemo(() => {
    return vendors
      .filter((v) => String(v.name || "").trim())
      .map((v) => {
        const q = quotesByVendor.get(v.id) || {};
        return {
          vendorId: v.id,
          vendorName: v.name,
          email: v.email,
          amount: toNumberOrNull(q.amount),
          leadTime: q.leadTime || "",
          validity: q.validity || "",
          proof: q.proof || "",
          notes: q.notes || "",
        };
      })
      .sort((a, b) => {
        const ax = a.amount === null ? Number.POSITIVE_INFINITY : a.amount;
        const bx = b.amount === null ? Number.POSITIVE_INFINITY : b.amount;
        return ax - bx;
      });
  }, [vendors, quotesByVendor]);

  const stepDone = useMemo(() => {
    const r = state.request;
    const requestOk = !!String(r.title || "").trim() && !!String(r.spec || "").trim();
    const vendorsOk = vendorCount >= 3;
    const rfqOk = vendorsOk && emailCount >= 1;
    const quotesOk = quoteRows.filter((x) => x.amount !== null).length >= 3;
    const packOk = quotesOk && !!state.compliance.selectedVendorId;
    return { requestOk, vendorsOk, rfqOk, quotesOk, packOk };
  }, [state.request, vendorCount, emailCount, quoteRows, state.compliance.selectedVendorId]);

  function setStep(n) {
    setState((prev) =>
      saveState({
        ...prev,
        ui: { ...prev.ui, step: Math.max(0, Math.min(steps.length - 1, n)) },
      })
    );
  }

  function updateRequest(patch) {
    setState((prev) => saveState({ ...prev, request: { ...prev.request, ...patch } }));
  }

  function updateRFQ(patch) {
    setState((prev) => saveState({ ...prev, rfq: { ...prev.rfq, ...patch } }));
  }

  function addVendor() {
    const v = { id: uid("v"), name: "", email: "", phone: "", website: "", notes: "" };
    setState((prev) => saveState({ ...prev, vendors: [...prev.vendors, v] }));
  }

  function updateVendor(id, patch) {
    setState((prev) =>
      saveState({
        ...prev,
        vendors: prev.vendors.map((v) => (v.id === id ? { ...v, ...patch } : v)),
      })
    );
  }

  function deleteVendor(id) {
    setState((prev) =>
      saveState({
        ...prev,
        vendors: prev.vendors.filter((v) => v.id !== id),
        quotes: (prev.quotes || []).filter((q) => q.vendorId !== id),
        compliance:
          prev.compliance.selectedVendorId === id
            ? { ...prev.compliance, selectedVendorId: "" }
            : prev.compliance,
      })
    );
  }

  function upsertQuote(vendorId, patch) {
    setState((prev) => {
      const existing = (prev.quotes || []).find((q) => q.vendorId === vendorId);
      const nextQuote = {
        vendorId,
        amount: existing?.amount ?? "",
        leadTime: existing?.leadTime ?? "",
        validity: existing?.validity ?? "",
        proof: existing?.proof ?? "",
        notes: existing?.notes ?? "",
        ...patch,
      };

      const quotes = existing
        ? prev.quotes.map((q) => (q.vendorId === vendorId ? nextQuote : q))
        : [...(prev.quotes || []), nextQuote];

      return saveState({ ...prev, quotes });
    });
  }

  function selectVendor(vendorId) {
    setState((prev) =>
      saveState({ ...prev, compliance: { ...prev.compliance, selectedVendorId: vendorId } })
    );
  }

  async function copyText(text) {
    try {
      await navigator.clipboard.writeText(text);
      alert("Copied to clipboard.");
    } catch {
      alert("Copy failed (browser blocked). You can select and copy manually.");
    }
  }

  function exportJSON() {
    const payload = { exportedAt: new Date().toISOString(), profile, data: state };
    const blob = new Blob([JSON.stringify(payload, null, 2)], { type: "application/json" });
    const url = URL.createObjectURL(blob);
    const a = document.createElement("a");
    a.href = url;
    a.download = `toolstack-quote-it-${APP_VERSION}-${isoToday()}.json`;
    a.click();
    URL.revokeObjectURL(url);
  }

  function importJSON(file) {
    const reader = new FileReader();
    reader.onload = () => {
      try {
        const parsed = JSON.parse(String(reader.result || ""));
        const incoming = parsed?.data;
        if (!incoming?.request || !Array.isArray(incoming?.vendors)) throw new Error("Invalid import file");
        setProfile(parsed?.profile || profile);
        setState(saveState(incoming));
      } catch (e) {
        alert("Import failed: " + (e?.message || "unknown error"));
      }
    };
    reader.readAsText(file);
  }

  function printPreview() {
    setPreviewOpen(true);
    setTimeout(() => window.print(), 50);
  }

  const moduleManifest = useMemo(
    () => ({
      id: APP_ID,
      name: "Quote-It",
      version: APP_VERSION,
      storageKeys: [KEY, PROFILE_KEY],
      exports: ["print", "json"],
    }),
    []
  );

  const rfqTextByVendor = useMemo(() => {
    const out = new Map();
    for (const v of vendors) {
      if (!String(v.name || "").trim()) continue;
      const subject = buildRFQSubject({ rfq: state.rfq, request: state.request, vendor: v });
      const body = buildRFQBody({ profile, rfq: state.rfq, request: state.request, vendor: v });
      out.set(v.id, { subject, body });
    }
    return out;
  }, [vendors, state.rfq, state.request, profile]);

  return (
    <div className="min-h-screen bg-neutral-50 text-neutral-900">
      {/* Print only preview when open */}
      {previewOpen ? (
        <style>{`
          @media print {
            body * { visibility: hidden !important; }
            #quoteit-print-preview, #quoteit-print-preview * { visibility: visible !important; }
            #quoteit-print-preview { position: absolute !important; left: 0; top: 0; width: 100%; }
          }
        `}</style>
      ) : null}

      <div className="max-w-6xl mx-auto p-4 sm:p-6">
        {/* Header (match Inspect-It) */}
        <div className="flex items-start justify-between gap-4">
          <div>
            <div className="text-2xl font-bold tracking-tight">Quote-It</div>
            <div className="text-sm text-neutral-600">
              Module-ready ({moduleManifest.id}.{moduleManifest.version}) • Mailto RFQs • 3-Quotes Pack • Print/export
            </div>
            <div className="mt-3 h-[2px] w-80 rounded-full bg-gradient-to-r from-lime-400/0 via-lime-400 to-emerald-400/0" />
          </div>

          <div className="flex flex-wrap gap-2 justify-end">
            <button className={btnSecondary} onClick={() => setPreviewOpen(true)}>
              Preview
            </button>
            <button className={btnSecondary} onClick={printPreview}>
              Print / Save PDF
            </button>
            <button className={btnSecondary} onClick={exportJSON}>
              Export
            </button>
            <button className={btnPrimary} onClick={() => importRef.current?.click()}>
              Import
            </button>
            <input
              ref={importRef}
              type="file"
              accept="application/json"
              className="hidden"
              onChange={(e) => {
                const f = e.target.files?.[0];
                if (f) importJSON(f);
                e.target.value = "";
              }}
            />
          </div>
        </div>

        {/* Step pills (same button styles) */}
        <div className="mt-4 flex flex-wrap gap-2">
          <StepPill label="1. Request" active={step === 0} done={stepDone.requestOk} onClick={() => setStep(0)} />
          <StepPill label="2. Vendors" active={step === 1} done={stepDone.vendorsOk} onClick={() => setStep(1)} />
          <StepPill label="3. RFQs" active={step === 2} done={stepDone.rfqOk} onClick={() => setStep(2)} />
          <StepPill label="4. Quotes" active={step === 3} done={stepDone.quotesOk} onClick={() => setStep(3)} />
          <StepPill label="5. Pack" active={step === 4} done={stepDone.packOk} onClick={() => setStep(4)} />
        </div>

        {/* Main grid (match Inspect-It) */}
        <div className="mt-4 grid grid-cols-1 lg:grid-cols-4 gap-4">
          {/* Profile card */}
          <div className="bg-white border border-neutral-200 rounded-2xl shadow-sm p-4">
            <div className="font-semibold">Profile (shared)</div>
            <div className="mt-3 space-y-2">
              <label className="block text-sm">
                <div className="text-neutral-600">Organization</div>
                <input
                  className={inputBase}
                  value={profile.org}
                  onChange={(e) => setProfile({ ...profile, org: e.target.value })}
                />
              </label>
              <label className="block text-sm">
                <div className="text-neutral-600">User</div>
                <input
                  className={inputBase}
                  value={profile.user}
                  onChange={(e) => setProfile({ ...profile, user: e.target.value })}
                />
              </label>
              <label className="block text-sm">
                <div className="text-neutral-600">Language</div>
                <select
                  className={inputBase}
                  value={profile.language}
                  onChange={(e) => setProfile({ ...profile, language: e.target.value })}
                >
                  <option value="EN">EN</option>
                  <option value="DE">DE</option>
                </select>
              </label>
              <div className="pt-2 text-xs text-neutral-500">
                Stored at <span className="font-mono">{PROFILE_KEY}</span>
              </div>
            </div>
          </div>

          {/* Main step card */}
          <div className="bg-white border border-neutral-200 rounded-2xl shadow-sm p-4 lg:col-span-3">
            {/* Step header row (same pattern as Inspect-It “New inspection”) */}
            <div className="flex flex-wrap items-end justify-between gap-3">
              <div>
                <div className="font-semibold">{steps[step]?.label || "Quote-It"}</div>
                <div className="text-sm text-neutral-600">
                  Vendors named: {vendorCount} • Valid emails: {emailCount} • Quotes with amounts:{" "}
                  {quoteRows.filter((x) => x.amount !== null).length}
                </div>
              </div>

              {/* Step actions */}
              <div className="flex flex-wrap gap-2">
                {step > 0 && (
                  <button className={btnSecondary} onClick={() => setStep(step - 1)}>
                    ← Back
                  </button>
                )}
                {step < steps.length - 1 && (
                  <button className={btnPrimary} onClick={() => setStep(step + 1)}>
                    Next →
                  </button>
                )}
              </div>
            </div>

            {/* Step content */}
            {step === 0 && (
              <div>
                <div className="mt-3 grid grid-cols-1 md:grid-cols-2 gap-2">
                  <label className="text-sm">
                    <div className="text-neutral-600">Title *</div>
                    <input
                      className={inputBase}
                      value={state.request.title}
                      onChange={(e) => updateRequest({ title: e.target.value })}
                    />
                  </label>
                  <label className="text-sm">
                    <div className="text-neutral-600">Category</div>
                    <input
                      className={inputBase}
                      value={state.request.category}
                      onChange={(e) => updateRequest({ category: e.target.value })}
                      placeholder="e.g., Vehicle service, IT, Office supplies"
                    />
                  </label>
                  <label className="text-sm">
                    <div className="text-neutral-600">Reference</div>
                    <input
                      className={inputBase}
                      value={state.request.reference}
                      onChange={(e) => updateRequest({ reference: e.target.value })}
                      placeholder="e.g., PR-2025-001"
                    />
                  </label>
                  <label className="text-sm">
                    <div className="text-neutral-600">Needed by</div>
                    <input
                      type="date"
                      className={inputBase}
                      value={state.request.neededBy}
                      onChange={(e) => updateRequest({ neededBy: e.target.value })}
                    />
                  </label>
                  <label className="text-sm md:col-span-2">
                    <div className="text-neutral-600">Delivery to</div>
                    <input
                      className={inputBase}
                      value={state.request.deliveryTo}
                      onChange={(e) => updateRequest({ deliveryTo: e.target.value })}
                      placeholder="Address / office / pickup"
                    />
                  </label>
                </div>

                <label className="block text-sm mt-3">
                  <div className="text-neutral-600">Specification / items *</div>
                  <textarea
                    className={`${inputBase} min-h-[120px]`}
                    value={state.request.spec}
                    onChange={(e) => updateRequest({ spec: e.target.value })}
                    placeholder="Describe the exact items/services needed. Include quantities, model numbers, scope, etc."
                  />
                </label>

                <label className="block text-sm mt-3">
                  <div className="text-neutral-600">Notes</div>
                  <textarea
                    className={`${inputBase} min-h-[90px]`}
                    value={state.request.notes}
                    onChange={(e) => updateRequest({ notes: e.target.value })}
                    placeholder="Any constraints, preferred brands, budget notes, etc."
                  />
                </label>
              </div>
            )}

            {step === 1 && (
              <div>
                <div className="mt-3 flex flex-wrap items-center justify-between gap-3">
                  <button className={btnSecondary} onClick={addVendor}>
                    + Vendor
                  </button>
                  <div className="text-sm text-neutral-600">Add at least 3 vendors for compliance.</div>
                </div>

                <div className="mt-4 space-y-3">
                  {vendors.map((v, idx) => (
                    <div key={v.id} className="rounded-2xl border border-neutral-200 bg-neutral-50 p-3">
                      <div className="flex items-center justify-between gap-2">
                        <div className="font-semibold">Vendor {idx + 1}</div>
                        <button
                          className="px-3 py-1.5 rounded-xl bg-white border border-neutral-200 hover:bg-neutral-50"
                          onClick={() => deleteVendor(v.id)}
                          disabled={vendors.length <= 1}
                          title={vendors.length <= 1 ? "Keep at least one vendor" : "Delete vendor"}
                        >
                          Delete
                        </button>
                      </div>

                      <div className="mt-2 grid grid-cols-1 md:grid-cols-2 gap-2">
                        <label className="text-sm">
                          <div className="text-neutral-600">Name *</div>
                          <input
                            className={inputBase}
                            value={v.name}
                            onChange={(e) => updateVendor(v.id, { name: e.target.value })}
                          />
                        </label>
                        <label className="text-sm">
                          <div className="text-neutral-600">Email</div>
                          <input
                            className={inputBase}
                            value={v.email}
                            onChange={(e) => updateVendor(v.id, { email: e.target.value })}
                            placeholder="quotes@vendor.com"
                          />
                        </label>
                        <label className="text-sm">
                          <div className="text-neutral-600">Phone</div>
                          <input
                            className={inputBase}
                            value={v.phone}
                            onChange={(e) => updateVendor(v.id, { phone: e.target.value })}
                          />
                        </label>
                        <label className="text-sm">
                          <div className="text-neutral-600">Website</div>
                          <input
                            className={inputBase}
                            value={v.website}
                            onChange={(e) => updateVendor(v.id, { website: e.target.value })}
                            placeholder="https://"
                          />
                        </label>
                      </div>

                      <label className="block text-sm mt-2">
                        <div className="text-neutral-600">Notes</div>
                        <input
                          className={inputBase}
                          value={v.notes}
                          onChange={(e) => updateVendor(v.id, { notes: e.target.value })}
                          placeholder="e.g., preferred / fast / local"
                        />
                      </label>
                    </div>
                  ))}
                </div>
              </div>
            )}

            {step === 2 && (
              <div>
                <div className="mt-3 grid grid-cols-1 md:grid-cols-2 gap-2">
                  <label className="text-sm">
                    <div className="text-neutral-600">Subject prefix</div>
                    <input
                      className={inputBase}
                      value={state.rfq.subjectPrefix}
                      onChange={(e) => updateRFQ({ subjectPrefix: e.target.value })}
                    />
                  </label>
                  <label className="text-sm">
                    <div className="text-neutral-600">Greeting</div>
                    <input
                      className={inputBase}
                      value={state.rfq.greeting}
                      onChange={(e) => updateRFQ({ greeting: e.target.value })}
                    />
                  </label>
                  <label className="text-sm">
                    <div className="text-neutral-600">Closing</div>
                    <input
                      className={inputBase}
                      value={state.rfq.closing}
                      onChange={(e) => updateRFQ({ closing: e.target.value })}
                    />
                  </label>
                  <label className="text-sm">
                    <div className="text-neutral-600">Signature name (optional)</div>
                    <input
                      className={inputBase}
                      value={state.rfq.signatureName}
                      onChange={(e) => updateRFQ({ signatureName: e.target.value })}
                      placeholder="If profile user is blank"
                    />
                  </label>

                  <label className="text-sm md:col-span-2">
                    <div className="text-neutral-600">Payment line</div>
                    <input
                      className={inputBase}
                      value={state.rfq.paymentLine}
                      onChange={(e) => updateRFQ({ paymentLine: e.target.value })}
                    />
                  </label>
                </div>

                <div className="mt-3 flex flex-wrap gap-2 text-sm">
                  {[
                    ["leadTime", "Lead time"],
                    ["validity", "Validity"],
                    ["delivery", "Delivery"],
                    ["payment", "Payment terms"],
                  ].map(([k, label]) => (
                    <label
                      key={k}
                      className="flex items-center gap-2 bg-white border border-neutral-200 rounded-full px-3 py-2"
                    >
                      <input
                        type="checkbox"
                        checked={!!state.rfq.include?.[k]}
                        onChange={(e) =>
                          updateRFQ({ include: { ...(state.rfq.include || {}), [k]: e.target.checked } })
                        }
                      />
                      <span>{label}</span>
                    </label>
                  ))}
                </div>

                <div className="mt-4 space-y-3">
                  {vendors
                    .filter((v) => String(v.name || "").trim())
                    .map((v) => {
                      const t = rfqTextByVendor.get(v.id);
                      const subject = t?.subject || "";
                      const body = t?.body || "";
                      const canMail = isEmail(v.email);

                      return (
                        <div key={v.id} className="rounded-2xl border border-neutral-200 bg-neutral-50 p-3">
                          <div className="flex items-start justify-between gap-3 flex-wrap">
                            <div>
                              <div className="font-semibold">{v.name}</div>
                              <div className="text-sm text-neutral-600">{v.email || "No email"}</div>
                            </div>
                            <div className="flex gap-2 flex-wrap">
                              <button className={btnSecondary} onClick={() => copyText(subject)}>
                                Copy subject
                              </button>
                              <button className={btnSecondary} onClick={() => copyText(body)}>
                                Copy body
                              </button>
                              <a
                                className={canMail ? btnPrimary : `${btnSecondary} pointer-events-none opacity-60`}
                                href={canMail ? buildMailto(v.email, subject, body) : undefined}
                              >
                                Email (mailto)
                              </a>
                            </div>
                          </div>

                          <div className="mt-3 grid grid-cols-1 md:grid-cols-2 gap-2">
                            <div className="rounded-xl bg-white border border-neutral-200 p-2">
                              <div className="text-xs text-neutral-600">Subject</div>
                              <div className="text-sm break-words">{subject || "-"}</div>
                            </div>
                            <div className="rounded-xl bg-white border border-neutral-200 p-2">
                              <div className="text-xs text-neutral-600">Body (preview)</div>
                              <pre className="text-xs whitespace-pre-wrap break-words">{body || "-"}</pre>
                            </div>
                          </div>
                        </div>
                      );
                    })}
                </div>
              </div>
            )}

            {step === 3 && (
              <div>
                <div className="mt-4 space-y-3">
                  {vendors
                    .filter((v) => String(v.name || "").trim())
                    .map((v) => {
                      const q = quotesByVendor.get(v.id) || {};
                      return (
                        <div key={v.id} className="rounded-2xl border border-neutral-200 bg-neutral-50 p-3">
                          <div className="flex items-start justify-between gap-3 flex-wrap">
                            <div>
                              <div className="font-semibold">{v.name}</div>
                              <div className="text-sm text-neutral-600">{v.email || ""}</div>
                            </div>
                            <div className="text-sm text-neutral-600">
                              Amount: <span className="font-semibold">{q.amount ? moneyFmt(q.amount) : "-"}</span>
                            </div>
                          </div>

                          <div className="mt-2 grid grid-cols-1 md:grid-cols-2 gap-2">
                            <label className="text-sm">
                              <div className="text-neutral-600">Total amount</div>
                              <input
                                type="number"
                                step="0.01"
                                className={inputBase}
                                value={q.amount ?? ""}
                                onChange={(e) => upsertQuote(v.id, { amount: e.target.value })}
                                placeholder="e.g., 199.99"
                              />
                            </label>
                            <label className="text-sm">
                              <div className="text-neutral-600">Lead time</div>
                              <input
                                className={inputBase}
                                value={q.leadTime ?? ""}
                                onChange={(e) => upsertQuote(v.id, { leadTime: e.target.value })}
                                placeholder="e.g., 3-5 business days"
                              />
                            </label>
                            <label className="text-sm">
                              <div className="text-neutral-600">Validity</div>
                              <input
                                className={inputBase}
                                value={q.validity ?? ""}
                                onChange={(e) => upsertQuote(v.id, { validity: e.target.value })}
                                placeholder="e.g., valid 14 days"
                              />
                            </label>
                            <label className="text-sm">
                              <div className="text-neutral-600">Proof reference</div>
                              <input
                                className={inputBase}
                                value={q.proof ?? ""}
                                onChange={(e) => upsertQuote(v.id, { proof: e.target.value })}
                                placeholder="e.g., email 24.12 / PDF filename"
                              />
                            </label>
                          </div>

                          <label className="block text-sm mt-2">
                            <div className="text-neutral-600">Notes</div>
                            <input
                              className={inputBase}
                              value={q.notes ?? ""}
                              onChange={(e) => upsertQuote(v.id, { notes: e.target.value })}
                              placeholder="Any special terms / observations"
                            />
                          </label>
                        </div>
                      );
                    })}
                </div>

                <div className="mt-4 rounded-2xl border border-neutral-200 bg-neutral-50 p-3">
                  <div className="font-semibold">Comparison (auto-sorted by amount)</div>
                  <div className="mt-2 overflow-auto">
                    <table className="w-full text-sm">
                      <thead className="text-left text-neutral-600">
                        <tr className="border-b">
                          <th className="py-2 pr-2">Select</th>
                          <th className="py-2 pr-2">Vendor</th>
                          <th className="py-2 pr-2">Amount</th>
                          <th className="py-2 pr-2">Lead time</th>
                          <th className="py-2 pr-2">Validity</th>
                          <th className="py-2 pr-2">Proof</th>
                        </tr>
                      </thead>
                      <tbody>
                        {quoteRows.length === 0 ? (
                          <tr>
                            <td colSpan={6} className="py-3 text-neutral-500">
                              Add vendor names first.
                            </td>
                          </tr>
                        ) : (
                          quoteRows.map((r) => (
                            <tr key={r.vendorId} className="border-b last:border-b-0">
                              <td className="py-2 pr-2">
                                <input
                                  type="radio"
                                  name="selectedVendor"
                                  checked={state.compliance.selectedVendorId === r.vendorId}
                                  onChange={() => selectVendor(r.vendorId)}
                                />
                              </td>
                              <td className="py-2 pr-2 font-medium">{r.vendorName}</td>
                              <td className="py-2 pr-2">{r.amount === null ? "-" : moneyFmt(r.amount)}</td>
                              <td className="py-2 pr-2">{r.leadTime || "-"}</td>
                              <td className="py-2 pr-2">{r.validity || "-"}</td>
                              <td className="py-2 pr-2">{r.proof || "-"}</td>
                            </tr>
                          ))
                        )}
                      </tbody>
                    </table>
                  </div>
                </div>
              </div>
            )}

            {step === 4 && (
              <div>
                <div className="mt-3 grid grid-cols-1 md:grid-cols-2 gap-3">
                  <div className="rounded-2xl border border-neutral-200 bg-neutral-50 p-3">
                    <div className="font-semibold">Selected vendor</div>
                    <div className="mt-2 text-sm">
                      {state.compliance.selectedVendorId
                        ? vendors.find((v) => v.id === state.compliance.selectedVendorId)?.name || "-"
                        : "Not selected"}
                    </div>
                    <div className="mt-3 text-sm text-neutral-600">
                      Tip: select vendor in the Quotes comparison table.
                    </div>
                  </div>

                  <div className="rounded-2xl border border-neutral-200 bg-neutral-50 p-3">
                    <div className="font-semibold">Compliance checklist</div>
                    <ul className="mt-2 text-sm text-neutral-700 list-disc pl-5">
                      <li>Request documented (title + specification)</li>
                      <li>At least 3 vendors contacted</li>
                      <li>At least 3 quotes recorded</li>
                      <li>Selection justified</li>
                    </ul>
                  </div>
                </div>

                <label className="block text-sm mt-3">
                  <div className="text-neutral-600">Justification (why selected vendor)</div>
                  <textarea
                    className={`${inputBase} min-h-[120px]`}
                    value={state.compliance.justification}
                    onChange={(e) =>
                      setState((prev) =>
                        saveState({
                          ...prev,
                          compliance: { ...prev.compliance, justification: e.target.value },
                        })
                      )
                    }
                    placeholder="e.g., lowest total cost, fastest delivery, compliant spec, best warranty..."
                  />
                </label>

                <div className="mt-4 flex flex-wrap items-center justify-between gap-3">
                  <button className={btnSecondary} onClick={() => setStep(3)}>
                    Back to quotes
                  </button>
                  <button className={btnPrimary} onClick={() => setPreviewOpen(true)}>
                    Open preview
                  </button>
                </div>
              </div>
            )}
          </div>
        </div>

        {/* Preview modal (match Inspect-It) */}
        {previewOpen && (
          <div className="fixed inset-0 bg-black/40 flex items-center justify-center p-3 z-50">
            <div className="w-full max-w-5xl bg-white rounded-2xl shadow-xl border border-neutral-200 overflow-hidden">
              <div className="p-3 border-b flex items-center justify-between">
                <div className="font-semibold">Preview — Three Quotes Pack</div>
                <div className="flex gap-2">
                  <button className={btnSecondary} onClick={printPreview}>
                    Print / Save PDF
                  </button>
                  <button className={btnPrimary} onClick={() => setPreviewOpen(false)}>
                    Close
                  </button>
                </div>
              </div>

              <div className="p-6 overflow-auto max-h-[80vh]">
                <div id="quoteit-print-preview">
                  <div className="text-xl font-bold">{profile.org || "ToolStack"}</div>
                  <div className="text-sm text-neutral-600">Three Quotes Pack</div>
                  <div className="mt-2 h-[2px] w-72 rounded-full bg-gradient-to-r from-lime-400/0 via-lime-400 to-emerald-400/0" />

                  <div className="mt-3 text-sm">
                    <div>
                      <span className="text-neutral-600">Prepared by:</span>{" "}
                      {profile.user || state.rfq.signatureName || "-"}
                    </div>
                    <div>
                      <span className="text-neutral-600">Date:</span> {isoToday()}
                    </div>
                    <div>
                      <span className="text-neutral-600">Reference:</span>{" "}
                      {state.request.reference || "-"}
                    </div>
                    <div>
                      <span className="text-neutral-600">Generated:</span>{" "}
                      {new Date().toLocaleString()}
                    </div>
                  </div>

                  <div className="mt-4 rounded-2xl border border-neutral-200 p-3 text-sm">
                    <div className="font-semibold">Request summary</div>
                    <div className="mt-1 text-neutral-700">
                      <div>
                        <span className="text-neutral-600">Title:</span>{" "}
                        {state.request.title || "-"}
                      </div>
                      <div>
                        <span className="text-neutral-600">Category:</span>{" "}
                        {state.request.category || "-"}
                      </div>
                      <div>
                        <span className="text-neutral-600">Needed by:</span>{" "}
                        {state.request.neededBy || "-"}
                      </div>
                      <div>
                        <span className="text-neutral-600">Delivery to:</span>{" "}
                        {state.request.deliveryTo || "-"}
                      </div>
                    </div>

                    <div className="mt-3">
                      <div className="font-semibold">Specification / items</div>
                      <div className="text-neutral-700 whitespace-pre-wrap">
                        {state.request.spec || "-"}
                      </div>
                    </div>

                    {state.request.notes ? (
                      <div className="mt-3">
                        <div className="font-semibold">Notes</div>
                        <div className="text-neutral-700 whitespace-pre-wrap">{state.request.notes}</div>
                      </div>
                    ) : null}
                  </div>

                  <div className="mt-4 rounded-2xl border border-neutral-200 p-3 text-sm">
                    <div className="font-semibold">Vendors contacted</div>
                    <div className="mt-2 overflow-auto">
                      <table className="w-full text-sm">
                        <thead className="text-left text-neutral-600">
                          <tr className="border-b">
                            <th className="py-2 pr-2">Vendor</th>
                            <th className="py-2 pr-2">Email</th>
                            <th className="py-2 pr-2">Phone</th>
                            <th className="py-2 pr-2">Website</th>
                          </tr>
                        </thead>
                        <tbody>
                          {vendors
                            .filter((v) => String(v.name || "").trim())
                            .map((v) => (
                              <tr key={v.id} className="border-b last:border-b-0">
                                <td className="py-2 pr-2 font-medium">{v.name}</td>
                                <td className="py-2 pr-2">{v.email || "-"}</td>
                                <td className="py-2 pr-2">{v.phone || "-"}</td>
                                <td className="py-2 pr-2">{v.website || "-"}</td>
                              </tr>
                            ))}
                        </tbody>
                      </table>
                    </div>
                  </div>

                  <div className="mt-4 rounded-2xl border border-neutral-200 p-3 text-sm">
                    <div className="font-semibold">Quotes comparison</div>
                    <div className="mt-2 overflow-auto">
                      <table className="w-full text-sm">
                        <thead className="text-left text-neutral-600">
                          <tr className="border-b">
                            <th className="py-2 pr-2">Selected</th>
                            <th className="py-2 pr-2">Vendor</th>
                            <th className="py-2 pr-2">Amount</th>
                            <th className="py-2 pr-2">Lead time</th>
                            <th className="py-2 pr-2">Validity</th>
                            <th className="py-2 pr-2">Proof</th>
                          </tr>
                        </thead>
                        <tbody>
                          {quoteRows.length === 0 ? (
                            <tr>
                              <td colSpan={6} className="py-3 text-neutral-500">
                                No quote rows.
                              </td>
                            </tr>
                          ) : (
                            quoteRows.map((r) => (
                              <tr key={r.vendorId} className="border-b last:border-b-0">
                                <td className="py-2 pr-2">
                                  {state.compliance.selectedVendorId === r.vendorId ? "✓" : ""}
                                </td>
                                <td className="py-2 pr-2 font-medium">{r.vendorName}</td>
                                <td className="py-2 pr-2">{r.amount === null ? "-" : moneyFmt(r.amount)}</td>
                                <td className="py-2 pr-2">{r.leadTime || "-"}</td>
                                <td className="py-2 pr-2">{r.validity || "-"}</td>
                                <td className="py-2 pr-2">{r.proof || "-"}</td>
                              </tr>
                            ))
                          )}
                        </tbody>
                      </table>
                    </div>
                  </div>

                  <div className="mt-4 rounded-2xl border border-neutral-200 p-3 text-sm">
                    <div className="font-semibold">Justification</div>
                    <div className="text-neutral-700 whitespace-pre-wrap">
                      {state.compliance.justification || "-"}
                    </div>
                  </div>

                  <div className="mt-6 grid grid-cols-2 gap-6 text-sm">
                    <div>
                      <div className="text-neutral-600">Prepared by</div>
                      <div className="mt-8 border-t pt-2">Signature</div>
                    </div>
                    <div>
                      <div className="text-neutral-600">Approved by</div>
                      <div className="mt-8 border-t pt-2">Signature</div>
                    </div>
                  </div>

                  <div className="mt-6 text-xs text-neutral-500">
                    Storage key: <span className="font-mono">{KEY}</span>
                  </div>
                </div>
              </div>
            </div>
          </div>
        )}

        {/* Footer link (match Inspect-It) */}
        <div className="mt-6 text-sm text-neutral-600">
          <a className="underline hover:text-neutral-900" href={HUB_URL} target="_blank" rel="noreferrer">
            Return to ToolStack hub
          </a>
        </div>
      </div>
    </div>
  );
}
