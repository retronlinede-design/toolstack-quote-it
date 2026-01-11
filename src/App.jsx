import React, { useEffect, useMemo, useState } from "react";
import { fromZodError } from "zod-validation-error";
import { z } from "zod";
import {
  uid,
  safeParse,
  isoToday,
  isEmail,
  toNumberOrNull,
  moneyFmt,
  buildMailto,
  buildRFQSubject,
  buildRFQBody,
  norm,
  parseTags,
  uniqBy,
  vendorKey,
  googleDE,
  googleMapsDE,
  pickThreeFromLibrary,
} from "./lib/utils";

/**
 * ToolStack — Quote-It — module-ready MVP
 * Apply Netto-It Master UI (accent + buttons + inputs + help icon + print-from-preview)
 * Paste into: src/App.jsx
 * Requires: Tailwind v4 configured.
 */

const APP_ID = "quoteit";
const APP_VERSION = "v1";

// Per-module storage namespace
const KEY = `toolstack.${APP_ID}.${APP_VERSION}`;

// Shared profile (used by all modules later)
const PROFILE_KEY = "toolstack.profile.v1";

// Vendor Library key (cross-procurement)
const VENDOR_LIBRARY_KEY = "toolstack.quoteit.vendorLibrary.v1";

// TODO: Replace with your actual Wix Hub URL or internal dashboard link
const HUB_URL = "https://YOUR-WIX-HUB-URL-HERE";

// Netto-It master accent
const ACCENT = "#D5FF00";

/* Helpers extracted to src/lib/utils.js */

function loadProfile() {
  return (
    safeParse(localStorage.getItem(PROFILE_KEY), null) || {
      org: "",
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
    tags: "", // comma-separated (optional)
    category: "",
    city: "",
    country: "DE",
    inactive: false,
    contactMethod: "",
  });

  return {
    meta: { appId: APP_ID, version: APP_VERSION, updatedAt: new Date().toISOString() },
    ui: { step: 0 },
    request: {
      title: "",
      category: "",
      brand: "",
      reference: "",
      neededBy: "",
      deliveryTo: "",
      spec: "",
      notes: "",
      priceCheck: "",
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

const loadVendorLibrary = () => {
  try {
    const raw = localStorage.getItem(VENDOR_LIBRARY_KEY);
    const parsed = raw ? JSON.parse(raw) : [];
    return Array.isArray(parsed) ? parsed : [];
  } catch {
    return [];
  }
};

const saveVendorLibrary = (list) => {
  try {
    localStorage.setItem(VENDOR_LIBRARY_KEY, JSON.stringify(list));
  } catch {
    // ignore
  }
};

// -------------------- ToolStack UI (Netto-It master) --------------------
const card = "rounded-2xl bg-white border border-neutral-200 shadow-sm";
const cardHead = "px-4 py-3 border-b border-neutral-100";
const cardPad = "p-4";

const inputBase =
  "mt-2 w-full rounded-xl border border-neutral-200 bg-white px-3 py-2 text-sm text-neutral-800 focus:outline-none focus:ring-2 focus:ring-[rgb(var(--ts-accent-rgb)/0.25)] focus:border-[var(--ts-accent)]";

const ACTION_BASE =
  "print:hidden h-10 w-full rounded-xl text-sm font-medium border transition shadow-sm active:translate-y-[1px] disabled:opacity-50 disabled:cursor-not-allowed flex items-center justify-center";

function ActionButton({ children, onClick, tone = "default", disabled, title, className = "" }) {
  const cls =
    tone === "primary"
      ? "bg-neutral-700 text-white border-neutral-700 hover:ring-2 hover:ring-[rgb(var(--ts-accent-rgb)/0.25)] hover:border-[var(--ts-accent)]"
      : tone === "danger"
        ? "bg-red-50 text-red-700 border-red-200 hover:bg-[rgb(var(--ts-accent-rgb)/0.15)] hover:border-[var(--ts-accent)]"
        : "bg-white text-neutral-700 border-neutral-200 hover:bg-[rgb(var(--ts-accent-rgb)/0.25)] hover:border-[var(--ts-accent)]";

  return (
    <button type="button" onClick={onClick} disabled={disabled} title={title} className={`${ACTION_BASE} ${cls} ${className}`}>
      {children}
    </button>
  );
}

function ActionFileButton({ children, onFile, accept = "application/json", tone = "primary", title, className = "" }) {
  const cls =
    tone === "primary"
      ? "bg-neutral-700 text-white border-neutral-700 hover:ring-2 hover:ring-[rgb(var(--ts-accent-rgb)/0.25)] hover:border-[var(--ts-accent)]"
      : "bg-white text-neutral-700 border-neutral-200 hover:bg-[rgb(var(--ts-accent-rgb)/0.25)] hover:border-[var(--ts-accent)]";

  return (
    <label title={title} className={`${ACTION_BASE} ${cls} ${className} cursor-pointer`}>
      <span>{children}</span>
      <input
        type="file"
        accept={accept}
        className="hidden"
        onChange={(e) => onFile?.(e.target.files?.[0] || null)}
      />
    </label>
  );
}

const btnSecondary =
  "print:hidden px-3 py-2 rounded-xl text-sm font-medium border border-neutral-200 bg-white shadow-sm hover:bg-[rgb(var(--ts-accent-rgb)/0.25)] hover:border-[var(--ts-accent)] active:translate-y-[1px] transition disabled:opacity-50 disabled:cursor-not-allowed text-neutral-800";
const btnPrimary =
  "print:hidden px-3 py-2 rounded-xl text-sm font-medium border border-neutral-700 bg-neutral-700 text-white shadow-sm hover:ring-2 hover:ring-[rgb(var(--ts-accent-rgb)/0.25)] hover:border-[var(--ts-accent)] active:translate-y-[1px] transition disabled:opacity-50 disabled:cursor-not-allowed";
const btnDanger =
  "print:hidden px-3 py-2 rounded-xl text-sm font-medium border border-red-200 bg-red-50 text-red-700 shadow-sm hover:bg-[rgb(var(--ts-accent-rgb)/0.15)] hover:border-[var(--ts-accent)] active:translate-y-[1px] transition disabled:opacity-50 disabled:cursor-not-allowed";

function SmallButton({ children, onClick, tone = "default", disabled, title, className = "" }) {
  const cls = tone === "primary" ? btnPrimary : tone === "danger" ? btnDanger : btnSecondary;
  return (
    <button type="button" onClick={onClick} disabled={disabled} title={title} className={`${cls} ${className}`}>
      {children}
    </button>
  );
}

function Pill({ children, tone = "default" }) {
  const cls =
    tone === "accent"
      ? "border-[rgb(var(--ts-accent-rgb)/0.55)] bg-[rgb(var(--ts-accent-rgb)/0.18)] text-neutral-800"
      : tone === "warn"
        ? "border-amber-200 bg-amber-50 text-neutral-800"
        : "border-neutral-200 bg-white text-neutral-800";

  return (
    <span className={`inline-flex items-center px-2.5 py-1 rounded-full text-xs font-medium border ${cls}`}>
      {children}
    </span>
  );
}

function StepPill({ label, active, done, onClick, disabled }) {
  return (
    <button
      type="button"
      onClick={onClick}
      disabled={disabled}
      className={`print:hidden px-3 py-2 rounded-xl text-sm font-medium border shadow-sm transition ${
        active
          ? "border-neutral-700 bg-neutral-700 text-white hover:ring-2 hover:ring-[rgb(var(--ts-accent-rgb)/0.25)] hover:border-[var(--ts-accent)]"
          : "border-neutral-200 bg-white hover:bg-[rgb(var(--ts-accent-rgb)/0.25)] hover:border-[var(--ts-accent)] text-neutral-800"
      } disabled:opacity-50 disabled:cursor-not-allowed`}
      title={done ? "Done" : ""}
    >
      <span className="inline-flex items-center gap-2">
        <span>{label}</span>
        {done ? <span className="text-xs opacity-90">✓</span> : null}
      </span>
    </button>
  );
}

function HelpModal({ open, onClose }) {
  if (!open) return null;

  return (
    <div className="fixed inset-0 z-50 flex items-center justify-center p-4 sm:p-8">
      <div className="absolute inset-0 bg-black/40" onClick={onClose} />
      <div className="relative w-full max-w-2xl rounded-2xl bg-white border border-neutral-200 shadow-xl overflow-hidden">
        <div className="p-4 border-b border-neutral-100 flex items-start justify-between gap-4">
          <div>
            <div className="text-lg font-semibold text-neutral-800">Help</div>
            <div className="text-sm text-neutral-700 mt-1">How saving works in ToolStack apps.</div>
            <div className="mt-3 h-[2px] w-52 rounded-full bg-[var(--ts-accent)]" />
          </div>
          <button type="button" className={btnSecondary} onClick={onClose}>
            Close
          </button>
        </div>

        <div className="p-4 space-y-4 text-sm text-neutral-700">
          <div className="rounded-2xl border border-neutral-200 p-4">
            <div className="font-semibold text-neutral-800">Autosave</div>
            <p className="mt-1 text-neutral-700">
              Your data saves automatically in this browser on this device (localStorage). If you clear browser data or
              switch devices, it won’t follow automatically.
            </p>
          </div>

          <div className="rounded-2xl border border-neutral-200 p-4">
            <div className="font-semibold text-neutral-800">Export</div>
            <p className="mt-1 text-neutral-700">
              Use <span className="font-medium">Export</span> to download a JSON backup file. Save it somewhere safe.
            </p>
          </div>

          <div className="rounded-2xl border border-neutral-200 p-4">
            <div className="font-semibold text-neutral-800">Import</div>
            <p className="mt-1 text-neutral-700">
              Use <span className="font-medium">Import</span> to load a previous JSON backup and continue.
            </p>
          </div>

          <div className="text-xs text-neutral-600">Tip: Export once a week (or after big updates).</div>
        </div>

        <div className="p-4 border-t border-neutral-100 flex items-center justify-end">
          <button type="button" className={btnPrimary} onClick={onClose}>
            Got it
          </button>
        </div>
      </div>
    </div>
  );
}

function EditVendorModal({ vendor, onClose, onSave }) {
  const [data, setData] = useState(vendor || {});

  useEffect(() => {
    if (vendor) setData(vendor);
  }, [vendor]);

  if (!vendor) return null;

  const handleChange = (field, value) => setData((prev) => ({ ...prev, [field]: value }));

  return (
    <div className="fixed inset-0 z-50 flex items-center justify-center p-4 sm:p-8">
      <div className="absolute inset-0 bg-black/40" onClick={onClose} />
      <div className="relative w-full max-w-lg rounded-2xl bg-white border border-neutral-200 shadow-xl overflow-hidden flex flex-col max-h-[90vh]">
        <div className="p-4 border-b border-neutral-100 flex items-center justify-between">
          <div className="font-semibold text-neutral-800">Edit Library Vendor</div>
          <button type="button" className={btnSecondary} onClick={onClose}>
            Close
          </button>
        </div>
        <div className="p-4 overflow-y-auto space-y-3">
          <div className="text-xs text-neutral-500 text-right">* Required</div>
          <div>
            <label className="text-sm text-neutral-700 font-medium">Name *</label>
            <input className={inputBase} value={data.name || ""} onChange={(e) => handleChange("name", e.target.value)} />
          </div>
          <div className="grid grid-cols-2 gap-3">
            <div>
              <label className="text-sm text-neutral-700 font-medium">Email *</label>
              <input className={inputBase} value={data.email || ""} onChange={(e) => handleChange("email", e.target.value)} />
            </div>
            <div>
              <label className="text-sm text-neutral-700 font-medium">Phone *</label>
              <input className={inputBase} value={data.phone || ""} onChange={(e) => handleChange("phone", e.target.value)} />
            </div>
          </div>
          <div>
            <label className="text-sm text-neutral-700 font-medium">Website</label>
            <input className={inputBase} value={data.website || ""} onChange={(e) => handleChange("website", e.target.value)} />
          </div>
          <div className="grid grid-cols-2 gap-3">
            <div>
              <label className="text-sm text-neutral-700 font-medium">City</label>
              <input className={inputBase} value={data.city || ""} onChange={(e) => handleChange("city", e.target.value)} />
            </div>
            <div>
              <label className="text-sm text-neutral-700 font-medium">Category</label>
              <input className={inputBase} value={data.category || ""} onChange={(e) => handleChange("category", e.target.value)} />
            </div>
          </div>
          <div>
            <label className="text-sm text-neutral-700 font-medium">Tags (comma-separated)</label>
            <input
              className={inputBase}
              value={Array.isArray(data.tags) ? data.tags.join(", ") : data.tags || ""}
              onChange={(e) => handleChange("tags", e.target.value)}
            />
          </div>
          <div>
            <label className="text-sm text-neutral-700 font-medium">Notes</label>
            <textarea
              className={`${inputBase} min-h-[80px]`}
              value={data.notes || ""}
              onChange={(e) => handleChange("notes", e.target.value)}
            />
          </div>
        </div>
        <div className="p-4 border-t border-neutral-100 flex justify-end gap-2">
          <button type="button" className={btnSecondary} onClick={onClose}>
            Cancel
          </button>
          <button
            type="button"
            className={btnPrimary}
            onClick={() => {
              if (!data.name) {
                alert("Name is required");
                return;
              }
              if (!data.email) {
                alert("Email is required");
                return;
              }
              if (!isEmail(data.email)) {
                alert("Invalid email address");
                return;
              }
              if (!data.phone) {
                alert("Phone is required");
                return;
              }
              onSave({
                ...data,
                tags: typeof data.tags === "string" ? parseTags(data.tags) : data.tags,
                updatedAt: new Date().toISOString(),
              });
            }}
          >
            Save Changes
          </button>
        </div>
      </div>
    </div>
  );
}

function ManageVendorsModal({ open, onClose, vendors, quotes, onUpdate, onDelete }) {
  const [selectedId, setSelectedId] = useState(null);
  const [search, setSearch] = useState("");
  const [data, setData] = useState({});

  useEffect(() => {
    if (open && !selectedId && vendors.length > 0) {
      setSelectedId(vendors[0].id);
    }
  }, [open, vendors]);

  useEffect(() => {
    const v = vendors.find((x) => x.id === selectedId);
    if (v) setData({ ...v });
    else setData({});
  }, [selectedId, vendors]);

  const filtered = useMemo(() => {
    const s = search.toLowerCase();
    return vendors.filter((v) => (v.name || "").toLowerCase().includes(s) || (v.category || "").toLowerCase().includes(s));
  }, [vendors, search]);

  const grouped = useMemo(() => {
    const g = {};
    for (const v of filtered) {
      const cat = v.category || "Uncategorized";
      if (!g[cat]) g[cat] = [];
      g[cat].push(v);
    }
    return g;
  }, [filtered]);

  const sortedCats = useMemo(() => Object.keys(grouped).sort((a, b) => {
    if (a === "Uncategorized") return 1;
    if (b === "Uncategorized") return -1;
    return a.localeCompare(b);
  }), [grouped]);

  if (!open) return null;

  const handleChange = (field, val) => setData((p) => ({ ...p, [field]: val }));

  const handleSave = () => {
    if (!data.name) return alert("Name is required");
    if (!data.email) return alert("Email is required");
    if (!isEmail(data.email)) return alert("Invalid email address");
    if (!data.phone) return alert("Phone is required");
    onUpdate(data.id, data);
    alert("Saved.");
  };

  const handleDelete = () => {
    const isReferenced = quotes.some((q) => q.vendorId === data.id);
    if (isReferenced) {
      if (confirm("Vendor is used in quotes. Mark as inactive instead?")) {
        onUpdate(data.id, { inactive: true });
      }
    } else {
      if (confirm("Delete this vendor permanently?")) {
        onDelete(data.id);
        if (filtered.length > 1) setSelectedId(filtered.find((v) => v.id !== data.id)?.id || null);
        else setSelectedId(null);
      }
    }
  };

  return (
    <div className="fixed inset-0 z-50 flex items-center justify-center p-4 sm:p-8">
      <div className="absolute inset-0 bg-black/40" onClick={onClose} />
      <div className="relative w-full max-w-4xl rounded-2xl bg-white border border-neutral-200 shadow-xl overflow-hidden flex flex-col max-h-[90vh]">
        <div className="p-4 border-b border-neutral-100 flex items-center justify-between">
          <div className="font-semibold text-neutral-800">Manage Vendors</div>
          <button type="button" className={btnSecondary} onClick={onClose}>
            Close
          </button>
        </div>
        <div className="flex-1 flex overflow-hidden">
          {/* Left: List */}
          <div className="w-1/3 border-r border-neutral-100 flex flex-col bg-neutral-50">
            <div className="p-3 border-b border-neutral-100">
              <input
                className="w-full rounded-lg border border-neutral-200 bg-white px-3 py-2 text-sm"
                placeholder="Search vendors..."
                value={search}
                onChange={(e) => setSearch(e.target.value)}
              />
            </div>
            <div className="flex-1 overflow-y-auto p-2 space-y-4">
              {sortedCats.map((cat) => (
                <div key={cat}>
                  <div className="px-2 py-1 text-xs font-bold text-neutral-400 uppercase tracking-wider">{cat}</div>
                  <div className="space-y-1">
                    {grouped[cat].map((v) => (
                      <button
                        key={v.id}
                        onClick={() => setSelectedId(v.id)}
                        className={`w-full text-left px-3 py-2 rounded-lg text-sm flex items-center justify-between ${
                          selectedId === v.id ? "bg-white shadow-sm ring-1 ring-neutral-200 font-medium" : "hover:bg-neutral-100 text-neutral-600"
                        }`}
                      >
                        <span className="truncate">{v.name || "Unnamed"}</span>
                        {v.inactive && <span className="text-[10px] bg-neutral-200 text-neutral-600 px-1.5 py-0.5 rounded-full">Inactive</span>}
                      </button>
                    ))}
                  </div>
                </div>
              ))}
              {filtered.length === 0 && <div className="p-4 text-center text-xs text-neutral-500">No vendors found.</div>}
            </div>
          </div>

          {/* Right: Form */}
          <div className="w-2/3 flex flex-col bg-white">
            {selectedId && data.id ? (
              <>
                <div className="flex-1 overflow-y-auto p-6 space-y-4">
                  <div className="flex items-center justify-between">
                    <div className="text-lg font-bold text-neutral-800">{data.name}</div>
                    <label className="flex items-center gap-2 text-sm cursor-pointer">
                      <input type="checkbox" checked={!!data.inactive} onChange={(e) => handleChange("inactive", e.target.checked)} />
                      <span className="text-neutral-600">Inactive</span>
                    </label>
                  </div>
                  <div className="text-xs text-neutral-500 text-right">* Required</div>

                  <div>
                    <label className="text-sm text-neutral-700 font-medium">Name *</label>
                    <input className={inputBase} value={data.name || ""} onChange={(e) => handleChange("name", e.target.value)} />
                  </div>
                  <div className="grid grid-cols-2 gap-4">
                    <div>
                      <label className="text-sm text-neutral-700 font-medium">Email *</label>
                      <input className={inputBase} value={data.email || ""} onChange={(e) => handleChange("email", e.target.value)} />
                    </div>
                    <div>
                      <label className="text-sm text-neutral-700 font-medium">Phone *</label>
                      <input className={inputBase} value={data.phone || ""} onChange={(e) => handleChange("phone", e.target.value)} />
                    </div>
                  </div>
                  <div>
                    <label className="text-sm text-neutral-700 font-medium">Website</label>
                    <input className={inputBase} value={data.website || ""} onChange={(e) => handleChange("website", e.target.value)} />
                  </div>
                  <div className="grid grid-cols-2 gap-4">
                    <div>
                      <label className="text-sm text-neutral-700 font-medium">City</label>
                      <input className={inputBase} value={data.city || ""} onChange={(e) => handleChange("city", e.target.value)} />
                    </div>
                    <div>
                      <label className="text-sm text-neutral-700 font-medium">Category</label>
                      <input className={inputBase} value={data.category || ""} onChange={(e) => handleChange("category", e.target.value)} />
                    </div>
                  </div>
                  <div>
                    <label className="text-sm text-neutral-700 font-medium">Tags</label>
                    <input className={inputBase} value={data.tags || ""} onChange={(e) => handleChange("tags", e.target.value)} />
                  </div>
                  <div>
                    <label className="text-sm text-neutral-700 font-medium">Notes</label>
                    <textarea
                      className={`${inputBase} min-h-[80px]`}
                      value={data.notes || ""}
                      onChange={(e) => handleChange("notes", e.target.value)}
                    />
                  </div>
                </div>
                <div className="p-4 border-t border-neutral-100 flex justify-between bg-neutral-50">
                  <button type="button" className={btnDanger} onClick={handleDelete}>
                    Delete Vendor
                  </button>
                  <button type="button" className={btnPrimary} onClick={handleSave}>
                    Save Changes
                  </button>
                </div>
              </>
            ) : (
              <div className="flex-1 flex items-center justify-center text-neutral-400 text-sm">Select a vendor to edit</div>
            )}
          </div>
        </div>
      </div>
    </div>
  );
}

const VendorSchema = z.object({
  name: z.string().min(1, "Name is required"),
  email: z.string().min(1, "Email is required").email("Invalid email address"),
  website: z.string().url("Invalid URL (must start with http/https)").optional().or(z.literal("")),
  phone: z.string().min(1, "Phone is required"),
  notes: z.string().optional(),
  tags: z.string().optional(),
  city: z.string().optional(),
  category: z.string().optional(),
  inactive: z.boolean().optional(),
  contactMethod: z.string().optional(),
});

const RequestSchema = z.object({
  title: z.string().min(1, "Title is required"),
  category: z.string().optional(),
  brand: z.string().optional(),
  reference: z.string().optional(),
  neededBy: z.string().optional(),
  deliveryTo: z.string().optional(),
  spec: z.string().min(1, "Specification is required"),
  notes: z.string().optional(),
  priceCheck: z.string().min(1, "Estimated cost is required").refine((val) => !isNaN(parseFloat(val)) && parseFloat(val) >= 0, "Must be a valid positive number"),
});

export default function App() {
  const [profile, setProfile] = useState(loadProfile());
  const [state, setState] = useState(loadState());

  const [previewOpen, setPreviewOpen] = useState(false);
  const [helpOpen, setHelpOpen] = useState(false);
  const [manageVendorsOpen, setManageVendorsOpen] = useState(false);
  const [manageLibraryOpen, setManageLibraryOpen] = useState(false);
  const [editingLibraryVendor, setEditingLibraryVendor] = useState(null);
  const [rfqLanguage, setRfqLanguage] = useState("EN");
  const [newQuoteAmount, setNewQuoteAmount] = useState("");
  const [newQuoteLeadTime, setNewQuoteLeadTime] = useState("");
  const [newQuoteValidity, setNewQuoteValidity] = useState("");
  const [newQuotePaymentTerms, setNewQuotePaymentTerms] = useState("");
  const [newQuoteVendorId, setNewQuoteVendorId] = useState("");

  // Vendor Finder + Library state
  const [vendorLibrary, setVendorLibrary] = useState(() => loadVendorLibrary());
  const [vendorLibSearch, setVendorLibSearch] = useState("");
  const [vendorFinder, setVendorFinder] = useState({
    city: "Germany",
    category: "",
    requiredTags: "",
    quick: { name: "", email: "", website: "", phone: "", tags: "", notes: "" },
    saveToLibrary: true,
  });

  const [showInactiveInQuoteDropdown, setShowInactiveInQuoteDropdown] = useState(false);

  // Migration logic for legacy quotes
  useEffect(() => {
    let changed = false;
    const newVendors = [...state.vendors].map((v) => {
      if (v.rfqSent === true && !v.contactMethod) {
        changed = true;
        return { ...v, contactMethod: "email", rfqSent: undefined };
      }
      return v;
    });

    const newQuotes = (state.quotes || []).map((q) => {
      if (q.vendorId) return q;
      if (!q.vendorName) return q;

      let v = newVendors.find((vn) => norm(vn.name) === norm(q.vendorName));
      if (!v) {
        v = {
          id: uid("v"),
          name: q.vendorName,
          email: "",
          phone: "",
          website: "",
          notes: "",
          tags: "",
          category: "",
          city: "",
          country: "DE",
          inactive: false,
          contactMethod: "",
        };
        newVendors.push(v);
        changed = true;
      }
      const { vendorName, ...rest } = q;
      return { ...rest, vendorId: v.id };
    });

    if (changed || JSON.stringify(newQuotes) !== JSON.stringify(state.quotes) || JSON.stringify(newVendors) !== JSON.stringify(state.vendors)) {
      setState((prev) => saveState({ ...prev, vendors: newVendors, quotes: newQuotes }));
    }
  }, []);

  // ✅ Debounced profile persist
  useEffect(() => {
    const t = setTimeout(() => {
      localStorage.setItem(PROFILE_KEY, JSON.stringify(profile));
    }, 300);
    return () => clearTimeout(t);
  }, [profile]);

  // ✅ Debounced state persist
  useEffect(() => {
    const t = setTimeout(() => {
      localStorage.setItem(KEY, JSON.stringify(state));
    }, 350);
    return () => clearTimeout(t);
  }, [state]);

  // Persist vendor library
  useEffect(() => {
    const t = setTimeout(() => saveVendorLibrary(vendorLibrary), 250);
    return () => clearTimeout(t);
  }, [vendorLibrary]);

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

  const step = state.ui.step;

  const vendors = state.vendors || [];
  const activeVendors = vendors.filter((v) => !v.inactive);
  const vendorCount = activeVendors.filter((v) => String(v.name || "").trim() && String(v.email || "").trim() && String(v.phone || "").trim()).length;
  const emailCount = activeVendors.filter((v) => isEmail(v.email)).length;
  const sentCount = activeVendors.filter((v) => !!v.contactMethod).length;

  const priceCheckVal = parseFloat(state.request.priceCheck);
  const requiredQuotes = useMemo(() => {
    if (!state.request.priceCheck || isNaN(priceCheckVal)) return 3; // Default to 3 if not set or invalid
    if (priceCheckVal < 100) return 1;
    if (priceCheckVal < 200) return 2;
    return 3;
  }, [state.request.priceCheck, priceCheckVal]);

  // Auto-adjust vendor count based on requirements
  useEffect(() => {
    setState((prev) => {
      const active = prev.vendors.filter((v) => !v.inactive);
      const inactive = prev.vendors.filter((v) => v.inactive);
      const currentCount = active.length;

      if (currentCount === requiredQuotes) return prev;

      if (currentCount < requiredQuotes) {
        const needed = requiredQuotes - currentCount;
        const newVendors = Array.from({ length: needed }).map(() => ({
          id: uid("v"),
          name: "",
          email: "",
          phone: "",
          website: "",
          notes: "",
          tags: "",
          category: "",
          city: "",
          country: "DE",
          inactive: false,
          contactMethod: "",
        }));
        return saveState({ ...prev, vendors: [...prev.vendors, ...newVendors] });
      }

      if (currentCount > requiredQuotes) {
        let toRemove = currentCount - requiredQuotes;
        const newActive = [];
        // Iterate backwards to remove empty ones from the end
        for (let i = active.length - 1; i >= 0; i--) {
          const v = active[i];
          const isEmpty = !v.name && !v.email && !v.phone && !v.website && !v.notes;
          if (toRemove > 0 && isEmpty) {
            toRemove--;
          } else {
            newActive.unshift(v);
          }
        }

        if (newActive.length === active.length) return prev;

        return saveState({ ...prev, vendors: [...newActive, ...inactive] });
      }

      return prev;
    });
  }, [requiredQuotes, state.vendors]);

  const ruleDescription = useMemo(() => {
    if (requiredQuotes === 1) return "1 written quote";
    if (requiredQuotes === 2) return "1 written quote + 1 email (authorized business email)";
    return "3 written quotes";
  }, [requiredQuotes]);

  const quotesByVendor = useMemo(() => {
    const m = new Map();
    for (const q of state.quotes || []) m.set(q.vendorId, q);
    return m;
  }, [state.quotes]);

  const quoteRows = useMemo(() => {
    return (state.quotes || [])
      .map((q) => {
        const v = vendors.find((x) => x.id === q.vendorId);
        if (!v) return null;
        return {
          vendorId: v.id,
          vendorName: v.name,
          email: v.email,
          amount: toNumberOrNull(q.amount),
          leadTime: q.leadTime || "",
          validity: q.validity || "",
          paymentTerms: q.paymentTerms || "",
          proof: q.proof || "",
          notes: q.notes || "",
          inactive: v.inactive,
        };
      })
      .filter(Boolean)
      .sort((a, b) => {
        const ax = a.amount === null ? Number.POSITIVE_INFINITY : a.amount;
        const bx = b.amount === null ? Number.POSITIVE_INFINITY : b.amount;
        return ax - bx;
      });
  }, [vendors, state.quotes]);

  const quotesWithAmounts = useMemo(() => quoteRows.filter((x) => x.amount !== null).length, [quoteRows]);

  const stepDone = useMemo(() => {
    const requestOk = RequestSchema.safeParse(state.request).success;
    const vendorsOk = vendorCount >= requiredQuotes;
    const rfqOk = vendorsOk && sentCount >= requiredQuotes;
    const quotesOk = quotesWithAmounts >= requiredQuotes;
    const packOk = quotesOk && !!state.compliance.selectedVendorId;
    return { requestOk, vendorsOk, rfqOk, quotesOk, packOk };
  }, [state.request, vendorCount, emailCount, quotesWithAmounts, state.compliance.selectedVendorId, requiredQuotes]);

  const canProceed =
    (step === 0 && stepDone.requestOk) ||
    (step === 1 && stepDone.vendorsOk) ||
    (step === 2 && stepDone.rfqOk) ||
    (step === 3 && stepDone.quotesOk) ||
    step === 4;

  function setStep(n) {
    setState((prev) =>
      saveState({
        ...prev,
        ui: { ...prev.ui, step: Math.max(0, Math.min(steps.length - 1, n)) },
      })
    );
  }

  function resetForm() {
    if (confirm("Are you sure you want to reset the form? This will clear all data.")) {
      setState(saveState(defaultState()));
    }
  }

  function updateRequest(patch) {
    setState((prev) => saveState({ ...prev, request: { ...prev.request, ...patch } }));
  }

  function updateRFQ(patch) {
    setState((prev) => saveState({ ...prev, rfq: { ...prev.rfq, ...patch } }));
  }

  function addVendor() {
    const v = {
      id: uid("v"),
      name: "",
      email: "",
      phone: "",
      website: "",
      notes: "",
      tags: "",
      category: "",
      city: "",
      country: "DE",
      inactive: false,
    };
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

  function addQuoteForVendor(vendorId, overrides = {}) {
    if (state.quotes.some((q) => q.vendorId === vendorId)) return;
    const newQuote = {
      vendorId,
      amount: "",
      leadTime: "",
      validity: "",
      paymentTerms: "",
      proof: "",
      notes: "",
      ...overrides,
    };
    setState((prev) => saveState({ ...prev, quotes: [...prev.quotes, newQuote] }));
  }

  function handleAddQuote() {
    if (!newQuoteVendorId) return;
    addQuoteForVendor(newQuoteVendorId, {
      amount: newQuoteAmount,
      leadTime: newQuoteLeadTime,
      validity: newQuoteValidity,
      paymentTerms: newQuotePaymentTerms,
      proof: "",
    });
    setNewQuoteAmount("");
    setNewQuoteLeadTime("");
    setNewQuoteValidity("");
    setNewQuotePaymentTerms("");
    setNewQuoteVendorId("");
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
    setState((prev) => saveState({ ...prev, compliance: { ...prev.compliance, selectedVendorId: vendorId } }));
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
    if (!file) return;
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

  function openHub() {
    try {
      if (!HUB_URL || HUB_URL.includes("YOUR-WIX-HUB-URL")) {
        alert("Set HUB_URL first (top of the file).");
        return;
      }
      window.open(HUB_URL, "_blank", "noopener,noreferrer");
    } catch {
      // ignore
    }
  }

  function modulePrint() {
    setTimeout(() => window.print(), 50);
  }

  const rfqTextByVendor = useMemo(() => {
    const out = new Map();
    for (const v of activeVendors) {
      if (!String(v.name || "").trim()) continue;
      let subject, body;

      if (rfqLanguage === "DE") {
        // German generation logic
        subject = `Preisanfrage: ${state.request.title || ""} ${state.request.reference ? `(Ref: ${state.request.reference})` : ""}`;
        
        const items = state.request.spec || "";
        const delivery = state.request.deliveryTo ? `Lieferung an: ${state.request.deliveryTo}` : "";
        const needed = state.request.neededBy ? `Benötigt bis: ${state.request.neededBy}` : "";
        
        const reqs = [];
        if (state.rfq.include?.leadTime) reqs.push("- Lieferzeit");
        if (state.rfq.include?.validity) reqs.push("- Gültigkeit des Angebots");
        if (state.rfq.include?.delivery) reqs.push("- Versandkosten");
        if (state.rfq.include?.payment) reqs.push("- Zahlungsbedingungen");
        
        const reqBlock = reqs.length ? `Bitte bestätigen Sie:\n${reqs.join("\n")}` : "";
        const notes = state.request.notes ? `Anmerkungen:\n${state.request.notes}` : "";
        const signature = state.rfq.signatureName || profile.user || "";
        const org = profile.org || "";

        body = `Sehr geehrte Damen und Herren,\n\nbitte senden Sie uns ein Angebot für:\n\n${items}\n\n${delivery}\n${needed}\n\n${reqBlock}\n\n${notes}\n\nMit freundlichen Grüßen\n\n${signature}\n${org}`
          .replace(/\n{3,}/g, "\n\n") // Clean up excessive newlines
          .trim();

      } else {
        // Default English logic
        subject = buildRFQSubject({ rfq: state.rfq, request: state.request, vendor: v });
        body = buildRFQBody({ profile, rfq: state.rfq, request: state.request, vendor: v });
      }

      out.set(v.id, { subject, body });
    }
    return out;
  }, [activeVendors, state.rfq, state.request, profile, rfqLanguage]);

  // ----- Vendor Finder + Library actions -----
  const effectiveFinderCategory = norm(vendorFinder.category) || norm(state.request.category);
  const searchSuggestions = useMemo(() => {
    const c = effectiveFinderCategory || "vendors";
    const l = vendorFinder.city || "Germany";
    const b = (state.request.brand || "").trim();
    const s = (state.request.spec || "").replace(/\n/g, " ").trim();
    const queryBase = b ? `${b} ${c}` : (s || c);

    return [
      {
        type: "AI List",
        icon: "✨",
        query: `List 5 ${b ? b + " " : ""}vendors for ${c} in ${l} with email, phone, and website`,
        action: (q) => window.open(`https://www.perplexity.ai/search?q=${encodeURIComponent(q)}`, "_blank"),
        label: "Ask AI",
      },
      {
        type: "Google Maps",
        icon: "📍",
        query: `${queryBase} in ${l}`,
        action: (q) => window.open(googleMapsDE(q), "_blank"),
        label: "Open Maps",
      },
      {
        type: "Google Search",
        icon: "🔍",
        query: `${queryBase} in ${l} contact info`,
        action: (q) => window.open(googleDE(q), "_blank"),
        label: "Google",
      },
    ];
  }, [effectiveFinderCategory, vendorFinder.city, state.request.spec, state.request.brand]);

  const addVendorToLibrary = (vendorLike) => {
    const v = {
      id: vendorLike.id || uid("libv"),
      name: norm(vendorLike.name),
      email: norm(vendorLike.email),
      phone: norm(vendorLike.phone),
      website: norm(vendorLike.website),
      notes: norm(vendorLike.notes),
      tags: Array.isArray(vendorLike.tags) ? vendorLike.tags : parseTags(vendorLike.tags),
      category: norm(vendorLike.category) || effectiveFinderCategory || "",
      city: norm(vendorLike.city) || norm(vendorFinder.city) || "",
      country: "DE",
      updatedAt: new Date().toISOString(),
    };

    if (!v.name) return;

    setVendorLibrary((prev) => {
      const merged = [...prev];
      const k = vendorKey(v);
      const idx = merged.findIndex((x) => vendorKey(x) === k);
      if (idx >= 0) merged[idx] = { ...merged[idx], ...v, id: merged[idx].id };
      else merged.push(v);
      return merged;
    });
  };

  const removeVendorFromLibrary = (id) => {
    setVendorLibrary((prev) => prev.filter((v) => v.id !== id));
  };

  const updateLibraryVendor = (id, patch) => {
    setVendorLibrary((prev) => prev.map((v) => (v.id === id ? { ...v, ...patch } : v)));
  };

  const saveLibraryVendor = (updated) => {
    setVendorLibrary((prev) => prev.map((v) => (v.id === updated.id ? updated : v)));
    setEditingLibraryVendor(null);
  };

  const addLibraryVendorToCurrent = (libVendor) => {
    const next = {
      id: uid("v"),
      name: norm(libVendor.name),
      email: norm(libVendor.email),
      phone: norm(libVendor.phone),
      website: norm(libVendor.website),
      notes: norm(libVendor.notes),
      tags: (libVendor.tags || []).join(", "),
      category: norm(libVendor.category) || "",
      city: norm(libVendor.city) || "",
      country: "DE",
      inactive: false,
    };

    const nextKey = vendorKey(next);
    const exists = vendors.some((x) => vendorKey(x) === nextKey);
    if (exists) return;

    setState((prev) => saveState({ ...prev, vendors: [...prev.vendors, next] }));
  };

  const autoPick3VendorsFromLibrary = () => {
    const reqTags = parseTags(vendorFinder.requiredTags);
    const picks = pickThreeFromLibrary({
      library: vendorLibrary,
      category: effectiveFinderCategory,
      requiredTags: reqTags,
    });

    if (picks.length === 0) return;

    for (const p of picks) addLibraryVendorToCurrent(p);
  };

  const addQuickVendor = () => {
    const q = vendorFinder.quick;
    const v = {
      id: uid("v"),
      name: norm(q.name),
      email: norm(q.email),
      website: norm(q.website),
      phone: norm(q.phone),
      notes: norm(q.notes),
      tags: norm(q.tags),
      category: effectiveFinderCategory || "",
      city: norm(vendorFinder.city),
      country: "DE",
      inactive: false,
    };

    // Zod Validation
    const result = VendorSchema.safeParse(v);
    if (!result.success) {
      alert(fromZodError(result.error).message);
      return;
    }

    const k = vendorKey(v);
    if (vendors.some((x) => vendorKey(x) === k)) return;

    setState((prev) => saveState({ ...prev, vendors: [...prev.vendors, v] }));

    if (vendorFinder.saveToLibrary) {
      addVendorToLibrary({
        ...v,
        tags: parseTags(v.tags),
      });
    }

    setVendorFinder((prev) => ({
      ...prev,
      quick: { name: "", email: "", website: "", phone: "", tags: "", notes: "" },
    }));
  };

  const filteredLibrary = useMemo(() => {
    const q = norm(vendorLibSearch).toLowerCase();
    if (!q) return vendorLibrary;
    return vendorLibrary.filter((v) => {
      const hay = [
        v.name,
        v.email,
        v.website,
        v.phone,
        v.category,
        v.city,
        (v.tags || []).join(" "),
        v.notes,
      ]
        .join(" ")
        .toLowerCase();
      return hay.includes(q);
    });
  }, [vendorLibrary, vendorLibSearch]);

  const availableVendorsForQuote = useMemo(() => {
    const quotedIds = new Set(state.quotes.map((q) => q.vendorId));
    return vendors.filter((v) => {
      if (quotedIds.has(v.id)) return false;
      if (v.inactive && !showInactiveInQuoteDropdown) return false;
      return true;
    });
  }, [vendors, state.quotes, showInactiveInQuoteDropdown]);

  return (
    <div className="min-h-screen bg-neutral-50 text-neutral-800" style={{ ["--ts-accent"]: ACCENT, ["--ts-accent-rgb"]: "213 255 0" }}>
      {/* Print rules */}
      <style>{`
        :root{ --ts-accent:${ACCENT}; --ts-accent-rgb:213 255 0; }
        @media print { .print\\:hidden { display: none !important; } }

        /* Subtle scrollbar for horizontal steps row */
        .steps-scrollbar {
          -ms-overflow-style: none; /* IE/Edge */
          scrollbar-width: thin; /* Firefox */
          scrollbar-color: rgba(0,0,0,0.08) transparent;
        }
        .steps-scrollbar::-webkit-scrollbar {
          height: 8px;
        }
        .steps-scrollbar::-webkit-scrollbar-track {
          background: transparent;
        }
        .steps-scrollbar::-webkit-scrollbar-thumb {
          background: rgba(0,0,0,0.08);
          border-radius: 9999px;
        }
      `}</style>

      {previewOpen ? (
        <style>{`
          @media print {
            body * { visibility: hidden !important; }
            #quoteit-print, #quoteit-print * { visibility: visible !important; }
            #quoteit-print { position: absolute !important; left: 0; top: 0; width: 100%; }
          }
        `}</style>
      ) : null}

      <HelpModal open={helpOpen} onClose={() => setHelpOpen(false)} />
      <EditVendorModal vendor={editingLibraryVendor} onClose={() => setEditingLibraryVendor(null)} onSave={saveLibraryVendor} />
      <ManageVendorsModal
        open={manageVendorsOpen}
        onClose={() => setManageVendorsOpen(false)}
        vendors={vendors}
        quotes={state.quotes}
        onUpdate={updateVendor}
        onDelete={deleteVendor}
      />
      <ManageVendorsModal
        open={manageLibraryOpen}
        onClose={() => setManageLibraryOpen(false)}
        vendors={vendorLibrary}
        quotes={[]}
        onUpdate={updateLibraryVendor}
        onDelete={removeVendorFromLibrary}
      />

      {/* Preview Modal */}
      {previewOpen ? (
        <div className="fixed inset-0 z-50 flex items-center justify-center p-4 sm:p-8">
          <div className="absolute inset-0 bg-black/40" onClick={() => setPreviewOpen(false)} />
          <div className="relative w-full max-w-5xl">
            <div className="mb-3 rounded-2xl bg-white border border-neutral-200 shadow-sm p-3 flex items-center justify-between gap-3">
              <div>
                <div className="text-lg font-semibold text-neutral-800">Print preview</div>
                <div className="mt-2 h-[2px] w-48 rounded-full bg-[var(--ts-accent)]" />
              </div>
              <div className="flex items-center gap-2">
                <button className={btnSecondary} onClick={modulePrint}>
                  Print / Save PDF
                </button>
                <button className={btnPrimary} onClick={() => setPreviewOpen(false)}>
                  Close
                </button>
              </div>
            </div>

            <div className="rounded-2xl bg-white border border-neutral-200 shadow-xl overflow-auto max-h-[80vh]">
              <div id="quoteit-print" className="p-6">
                <div className="flex items-start justify-between gap-4">
                  <div>
                    <div className="text-2xl font-bold tracking-tight text-neutral-800">
                      {profile.org} — Three Quotes Pack
                    </div>
                    <div className="text-sm text-neutral-700">
                      Reference: {state.request.reference || "-"} • Date: {isoToday()}
                    </div>
                    <div className="mt-3 h-[2px] w-72 rounded-full bg-[var(--ts-accent)]" />
                  </div>
                  <div className="text-sm text-neutral-700">Generated: {new Date().toLocaleString()}</div>
                </div>

                <div className="mt-5 space-y-5 text-sm">
                  <div className="rounded-2xl border border-neutral-200 p-4">
                    <div className="font-semibold text-neutral-800">Prepared by</div>
                    <div className="mt-1 text-neutral-700">{profile.user || state.rfq.signatureName || "-"}</div>
                  </div>

                  <div className="rounded-2xl border border-neutral-200 p-4">
                    <div className="font-semibold text-neutral-800">Request summary</div>
                    <div className="mt-2 text-neutral-700 space-y-1">
                      <div>
                        <span className="text-neutral-600">Title:</span> {state.request.title || "-"}
                      </div>
                      <div>
                        <span className="text-neutral-600">Category:</span> {state.request.category || "-"}
                      </div>
                      <div>
                        <span className="text-neutral-600">Needed by:</span> {state.request.neededBy || "-"}
                      </div>
                      <div>
                        <span className="text-neutral-600">Delivery to:</span> {state.request.deliveryTo || "-"}
                      </div>
                    </div>

                    <div className="mt-3">
                      <div className="font-semibold text-neutral-800">Specification / items</div>
                      <div className="text-neutral-700 whitespace-pre-wrap mt-1">{state.request.spec || "-"}</div>
                    </div>

                    {state.request.notes ? (
                      <div className="mt-3">
                        <div className="font-semibold text-neutral-800">Notes</div>
                        <div className="text-neutral-700 whitespace-pre-wrap mt-1">{state.request.notes}</div>
                      </div>
                    ) : null}
                  </div>

                  <div className="rounded-2xl border border-neutral-200 p-4">
                    <div className="font-semibold text-neutral-800">Vendors contacted</div>
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
                          {activeVendors
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

                  <div className="rounded-2xl border border-neutral-200 p-4">
                    <div className="font-semibold text-neutral-800">Quotes comparison</div>
                    <div className="mt-2 overflow-auto">
                      <table className="w-full text-sm">
                        <thead className="text-left text-neutral-600">
                          <tr className="border-b">
                            <th className="py-2 pr-2">Selected</th>
                            <th className="py-2 pr-2">Vendor</th>
                            <th className="py-2 pr-2">Amount</th>
                            <th className="py-2 pr-2">Lead time</th>
                            <th className="py-2 pr-2">Validity</th>
                          </tr>
                        </thead>
                        <tbody>
                          {quoteRows.length === 0 ? (
                            <tr>
                              <td colSpan={5} className="py-3 text-neutral-500">
                                No quote rows.
                              </td>
                            </tr>
                          ) : (
                            quoteRows.map((r) => (
                              <tr key={r.vendorId} className="border-b last:border-b-0">
                                <td className="py-2 pr-2">{state.compliance.selectedVendorId === r.vendorId ? "✓" : ""}</td>
                                <td className="py-2 pr-2 font-medium">
                                  {r.vendorName} {r.inactive ? "(Inactive)" : ""}
                                </td>
                                <td className="py-2 pr-2">{r.amount === null ? "-" : moneyFmt(r.amount)}</td>
                                <td className="py-2 pr-2">{r.leadTime || "-"}</td>
                                <td className="py-2 pr-2">{r.validity || "-"}</td>
                              </tr>
                            ))
                          )}
                        </tbody>
                      </table>
                    </div>
                  </div>

                  <div className="rounded-2xl border border-neutral-200 p-4">
                    <div className="font-semibold text-neutral-800">Justification</div>
                    <div className="text-neutral-700 whitespace-pre-wrap mt-1">{state.compliance.justification || "-"}</div>
                  </div>

                  <div className="mt-2 grid grid-cols-2 gap-6 text-sm">
                    <div>
                      <div className="text-neutral-600">Prepared by</div>
                      <div className="mt-8 border-t pt-2">Signature</div>
                    </div>
                    <div>
                      <div className="text-neutral-600">Approved by</div>
                      <div className="mt-8 border-t pt-2">Signature</div>
                    </div>
                  </div>

                  <div className="text-xs text-neutral-600 mt-2">
                    ToolStack • Quote-It • Storage key: <span className="font-mono">{KEY}</span>
                  </div>
                </div>
              </div>
            </div>
          </div>
        </div>
      ) : null}

      <div className="max-w-6xl mx-auto p-4 sm:p-6">
        {/* Header */}
        <div className="flex flex-col gap-3 sm:flex-row sm:items-start sm:justify-between">
          <div>
            <div className="text-4xl sm:text-5xl font-black tracking-tight text-neutral-800">
              <span>Quote</span>
              <span style={{ color: ACCENT }}>It</span>
            </div>
            <div className="text-sm text-neutral-700">Make procurement easy with the 3 quote system</div>
            <div className="mt-3 h-[2px] w-80 rounded-full bg-[var(--ts-accent)]" />

            <div className="mt-3 flex items-center justify-between gap-2">
              <div className="flex gap-2 overflow-x-auto whitespace-nowrap steps-scrollbar">
                <StepPill label="1. Request" active={step === 0} done={stepDone.requestOk} onClick={() => setStep(0)} />
                <StepPill
                  label="2. Vendors"
                  active={step === 1}
                  done={stepDone.vendorsOk}
                  onClick={() => setStep(1)}
                  disabled={!stepDone.requestOk}
                />
                <StepPill
                  label="3. RFQs"
                  active={step === 2}
                  done={stepDone.rfqOk}
                  onClick={() => setStep(2)}
                  disabled={!stepDone.requestOk || !stepDone.vendorsOk}
                />
                <StepPill
                  label="4. Quotes"
                  active={step === 3}
                  done={stepDone.quotesOk}
                  onClick={() => setStep(3)}
                  disabled={!stepDone.requestOk || !stepDone.vendorsOk || !stepDone.rfqOk}
                />
                <StepPill
                  label="5. Pack"
                  active={step === 4}
                  done={stepDone.packOk}
                  onClick={() => setStep(4)}
                  disabled={!stepDone.requestOk || !stepDone.vendorsOk || !stepDone.rfqOk || !stepDone.quotesOk}
                />
              </div>
              <button
                type="button"
                onClick={resetForm}
                className="px-3 py-2 rounded-xl text-sm font-medium bg-red-500/30 text-red-900 hover:bg-red-500/40 transition shrink-0"
              >
                Reset
              </button>
            </div>
          </div>

          {/* Normalized top actions + pinned Help icon */}
          <div className="w-full sm:w-[680px]">
            <div className="relative">
              <div className="grid grid-cols-2 gap-2 sm:grid-cols-4 pr-12">
                <ActionButton onClick={openHub} title="Return to ToolStack hub">Hub</ActionButton>
                <ActionButton onClick={() => setPreviewOpen(true)}>Preview</ActionButton>
                <ActionButton onClick={exportJSON}>Export</ActionButton>
                <ActionFileButton onFile={(f) => importJSON(f)} tone="primary" title="Import JSON backup">
                  Import
                </ActionFileButton>
              </div>

              <button
                type="button"
                title="Help"
                onClick={() => setHelpOpen(true)}
                className="print:hidden absolute right-0 top-0 h-10 w-10 rounded-xl border border-neutral-200 bg-white hover:bg-[rgb(var(--ts-accent-rgb)/0.25)] hover:border-[var(--ts-accent)] shadow-sm flex items-center justify-center font-black text-neutral-800"
                aria-label="Help"
              >
                ?
              </button>
            </div>
          </div>
        </div>

        {/* Main layout */}
        <div className="mt-5 grid grid-cols-1 lg:grid-cols-4 gap-3">
          <div className="space-y-3">
            {/* Profile */}
            <div className={card}>
              <div className={cardHead}>
                <div className="font-semibold text-neutral-800">Profile</div>
                <div className="text-xs text-neutral-600 mt-1">Stored at {PROFILE_KEY}</div>
              </div>
              <div className={`${cardPad} space-y-3`}>
                <div>
                  <label className="text-sm text-neutral-700 font-medium">Organization</label>
                  <input className={inputBase} value={profile.org} onChange={(e) => setProfile({ ...profile, org: e.target.value })} />
                </div>
                <div>
                  <label className="text-sm text-neutral-700 font-medium">User</label>
                  <input className={inputBase} value={profile.user} onChange={(e) => setProfile({ ...profile, user: e.target.value })} />
                </div>

                <div className="text-xs text-neutral-600">
                  Module key: <span className="font-mono">{KEY}</span>
                </div>
                <div className="text-xs text-neutral-600">
                  Vendor library: <span className="font-mono">{VENDOR_LIBRARY_KEY}</span>
                </div>
              </div>
            </div>

            {/* Status */}
            <div className={card}>
              <div className={cardHead}>
                <div className="font-semibold text-neutral-800">Status</div>
              </div>
              <div className={cardPad}>
                <div className="flex flex-col gap-2">
                  <div className="p-2 rounded-xl border border-[rgb(var(--ts-accent-rgb)/0.5)] bg-[rgb(var(--ts-accent-rgb)/0.1)] shadow-sm text-xs text-neutral-800">
                    <span className="font-semibold">Requirements:</span> {ruleDescription}
                  </div>
                  <div className="flex justify-between items-center">
                    <span className="text-sm text-neutral-600">Vendors</span>
                    <Pill tone="accent">{vendorCount} / {requiredQuotes}</Pill>
                  </div>
                  <div className="flex justify-between items-center">
                    <span className="text-sm text-neutral-600">RFQs Sent</span>
                    <Pill>{sentCount} / {requiredQuotes}</Pill>
                  </div>
                  <div className="flex justify-between items-center">
                    <span className="text-sm text-neutral-600">Quotes</span>
                    <Pill>{quotesWithAmounts} / {requiredQuotes}</Pill>
                  </div>
                  <div className="mt-2 pt-2 border-t border-neutral-100 flex justify-between items-center">
                    <span className="text-sm font-medium text-neutral-800">Pack Status</span>
                    {stepDone.packOk ? <Pill tone="accent">Ready</Pill> : <Pill>In progress</Pill>}
                  </div>
                </div>
              </div>
            </div>
          </div>

          {/* Main step panel */}
          <div className={`${card} lg:col-span-3`}>
            <div className={`${cardHead} flex items-end justify-between gap-3 flex-wrap`}>
              <div>
                <div className="font-semibold text-neutral-800">{steps[step]?.label || "Quote-It"}</div>
                <div className="text-xs text-neutral-600 mt-1">
                  Vendors named: {vendorCount} • Valid emails: {emailCount} • Quotes with amounts: {quotesWithAmounts}
                </div>
              </div>
              <div className="flex items-center gap-2">
                <SmallButton onClick={() => setStep(step - 1)} disabled={step === 0}>
                  ← Back
                </SmallButton>
                <SmallButton tone="primary" onClick={() => setStep(step + 1)} disabled={step === steps.length - 1 || !canProceed}>
                  Next →
                </SmallButton>
              </div>
            </div>

            <div className={cardPad}>
              {/* STEP 1: Request */}
              {step === 0 ? (
                <div className="space-y-3">
                  <div className="text-xs text-neutral-500 text-right">* Required</div>
                  <div className="grid grid-cols-1 md:grid-cols-2 gap-3">
                    <div>
                      <label className="text-sm text-neutral-700 font-medium">Title *</label>
                      <input className={inputBase} value={state.request.title} onChange={(e) => updateRequest({ title: e.target.value })} />
                    </div>
                    <div>
                      <label className="text-sm text-neutral-700 font-medium">Category</label>
                      <input
                        className={inputBase}
                        value={state.request.category}
                        onChange={(e) => updateRequest({ category: e.target.value })}
                        placeholder="e.g., Vehicle service, IT, Office supplies"
                      />
                    </div>
                    <div>
                      <label className="text-sm text-neutral-700 font-medium">Brand</label>
                      <input
                        className={inputBase}
                        value={state.request.brand || ""}
                        onChange={(e) => updateRequest({ brand: e.target.value })}
                        placeholder="e.g., BMW, Dell, Stihl"
                      />
                    </div>
                    <div>
                      <label className="text-sm text-neutral-700 font-medium">Reference</label>
                      <input
                        className={inputBase}
                        value={state.request.reference}
                        onChange={(e) => updateRequest({ reference: e.target.value })}
                        placeholder="e.g., PR-2025-001"
                      />
                    </div>
                    <div>
                      <label className="text-sm text-neutral-700 font-medium">Estimated Cost (€) *</label>
                      <input
                        type="number"
                        className={inputBase}
                        value={state.request.priceCheck}
                        onChange={(e) => updateRequest({ priceCheck: e.target.value })}
                        placeholder="e.g. 150"
                      />
                      <div className="mt-2 p-2 rounded-xl border border-[rgb(var(--ts-accent-rgb)/0.5)] bg-[rgb(var(--ts-accent-rgb)/0.1)] shadow-sm text-xs text-neutral-800">
                        <span className="font-semibold">Requirements:</span> {ruleDescription}
                      </div>
                    </div>
                    <div>
                      <label className="text-sm text-neutral-700 font-medium">Needed by</label>
                      <input type="date" className={inputBase} value={state.request.neededBy} onChange={(e) => updateRequest({ neededBy: e.target.value })} />
                    </div>
                    <div>
                      <label className="text-sm text-neutral-700 font-medium">Delivery to</label>
                      <input
                        className={inputBase}
                        value={state.request.deliveryTo}
                        onChange={(e) => updateRequest({ deliveryTo: e.target.value })}
                        placeholder="Address / office / pickup"
                      />
                    </div>
                  </div>

                  <div>
                    <div className="flex items-center justify-between">
                      <label className="text-sm text-neutral-700 font-medium">Specification / items *</label>
                      <div className="flex gap-2">
                        <button
                          type="button"
                          className="text-xs font-medium bg-white border border-neutral-200 text-neutral-600 hover:text-neutral-900 hover:border-[var(--ts-accent)] hover:ring-1 hover:ring-[var(--ts-accent)] px-3 py-1 rounded-full shadow-sm transition-all flex items-center gap-1.5"
                          onClick={() => {
                            const q = (state.request.spec || "").trim();
                            if (!q) return alert("Enter specs first");
                            window.open(`https://translate.google.com/?sl=auto&tl=de&text=${encodeURIComponent(q)}`, "_blank");
                          }}
                          title="Translate specification to German"
                        >
                          <span>🇩🇪</span>
                          <span>Translate</span>
                        </button>
                        <button
                          type="button"
                          className="text-xs font-medium bg-white border border-neutral-200 text-neutral-600 hover:text-neutral-900 hover:border-[var(--ts-accent)] hover:ring-1 hover:ring-[var(--ts-accent)] px-3 py-1 rounded-full shadow-sm transition-all flex items-center gap-1.5"
                          onClick={() => {
                            const q = (state.request.spec || "").trim();
                            if (!q) return alert("Enter specs first");
                            window.open(`https://www.perplexity.ai/search?q=${encodeURIComponent(q + " price in germany euro")}`, "_blank");
                          }}
                        >
                          <span>✨</span>
                          <span>AI Price Check</span>
                        </button>
                      </div>
                    </div>
                    <textarea
                      className={`${inputBase} min-h-[140px]`}
                      value={state.request.spec}
                      onChange={(e) => updateRequest({ spec: e.target.value })}
                      placeholder="Describe exact items/services needed. Include Brand, Model, quantities, scope, etc."
                    />
                  </div>

                  <div>
                    <label className="text-sm text-neutral-700 font-medium">Notes</label>
                    <textarea
                      className={`${inputBase} min-h-[100px]`}
                      value={state.request.notes}
                      onChange={(e) => updateRequest({ notes: e.target.value })}
                      placeholder="Constraints, preferred brands, budget notes, etc."
                    />
                  </div>
                </div>
              ) : null}

              {/* STEP 2: Vendors */}
              {step === 1 ? (
                <div className="space-y-4">
                  <div className="grid grid-cols-1 lg:grid-cols-2 gap-3">
                    {/* Vendor Finder */}
                    <div className="rounded-2xl border border-neutral-200 bg-white">
                      <div className="px-4 py-3 border-b border-neutral-100 flex items-start justify-between gap-3 flex-wrap">
                        <div>
                          <div className="font-semibold text-neutral-800">Vendor Finder</div>
                          <div className="text-xs text-neutral-600 mt-1">One-click searches → quick add → optional save to your library.</div>
                        </div>
                        <SmallButton onClick={autoPick3VendorsFromLibrary} title="Pick 3 best matches from your saved library">
                          Auto-pick 3
                        </SmallButton>
                      </div>

                      <div className="p-4 space-y-3">
                        <div>
                          <div>
                            <label className="text-sm text-neutral-700 font-medium">Required tags</label>
                            <input
                              className={inputBase}
                              value={vendorFinder.requiredTags}
                              onChange={(e) => setVendorFinder((p) => ({ ...p, requiredTags: e.target.value }))}
                              placeholder="e.g., local, approved, online"
                            />
                          </div>
                        </div>

                        <div className="rounded-2xl border border-neutral-200 bg-neutral-50 p-3">
                          <div className="font-semibold text-neutral-800 text-sm">Search suggestions</div>
                          <div className="mt-2 space-y-2">
                            {searchSuggestions.map((item, i) => (
                              <div key={i} className="rounded-2xl border border-neutral-200 bg-white p-3">
                                <div className="flex items-center gap-2 mb-1">
                                  <span className="text-lg">{item.icon}</span>
                                  <span className="text-xs font-bold text-neutral-500 uppercase tracking-wider">{item.type}</span>
                                </div>
                                <div className="text-sm text-neutral-800 break-words font-medium">{item.query}</div>
                                <div className="mt-2 flex gap-2">
                                  <button
                                    type="button"
                                    className="flex-1 text-xs font-medium bg-neutral-800 text-white hover:bg-neutral-900 px-3 py-2 rounded-lg shadow-sm transition-all flex items-center justify-center gap-1.5"
                                    onClick={() => item.action(item.query)}
                                  >
                                    <span>{item.icon}</span>
                                    <span>{item.label}</span>
                                  </button>
                                  <button
                                    type="button"
                                    className="text-xs font-medium bg-white border border-neutral-200 text-neutral-600 hover:text-neutral-900 hover:border-[var(--ts-accent)] hover:ring-1 hover:ring-[var(--ts-accent)] px-3 py-2 rounded-lg shadow-sm transition-all"
                                    onClick={() => copyText(item.query)}
                                    title="Copy query"
                                  >
                                    📋
                                  </button>
                                </div>
                              </div>
                            ))}
                          </div>
                        </div>

                        <div className="rounded-2xl border border-neutral-200 bg-neutral-50 p-3">
                          <div className="flex justify-between items-center">
                            <div className="font-semibold text-neutral-800 text-sm">Quick add vendor</div>
                            <div className="text-xs text-neutral-500">* Required</div>
                          </div>

                          <div className="mt-2 grid grid-cols-1 md:grid-cols-2 gap-3">
                            <div>
                              <label className="text-sm text-neutral-700 font-medium">Name *</label>
                              <input
                                className={inputBase}
                                value={vendorFinder.quick.name}
                                onChange={(e) => setVendorFinder((p) => ({ ...p, quick: { ...p.quick, name: e.target.value } }))}
                              />
                            </div>
                            <div>
                              <label className="text-sm text-neutral-700 font-medium">Email *</label>
                              <input
                                className={inputBase}
                                value={vendorFinder.quick.email}
                                onChange={(e) => setVendorFinder((p) => ({ ...p, quick: { ...p.quick, email: e.target.value } }))}
                                placeholder="quotes@vendor.de"
                              />
                            </div>
                            <div>
                              <label className="text-sm text-neutral-700 font-medium">Phone *</label>
                              <input
                                className={inputBase}
                                value={vendorFinder.quick.phone}
                                onChange={(e) => setVendorFinder((p) => ({ ...p, quick: { ...p.quick, phone: e.target.value } }))}
                              />
                            </div>
                            <div>
                              <label className="text-sm text-neutral-700 font-medium">Website</label>
                              <input
                                className={inputBase}
                                value={vendorFinder.quick.website}
                                onChange={(e) => setVendorFinder((p) => ({ ...p, quick: { ...p.quick, website: e.target.value } }))}
                                placeholder="https://"
                              />
                            </div>
                            <div className="md:col-span-2">
                              <label className="text-sm text-neutral-700 font-medium">Tags (comma-separated)</label>
                              <input
                                className={inputBase}
                                value={vendorFinder.quick.tags}
                                onChange={(e) => setVendorFinder((p) => ({ ...p, quick: { ...p.quick, tags: e.target.value } }))}
                                placeholder="local, approved, fast"
                              />
                            </div>
                            <div className="md:col-span-2">
                              <label className="text-sm text-neutral-700 font-medium">Notes</label>
                              <input
                                className={inputBase}
                                value={vendorFinder.quick.notes}
                                onChange={(e) => setVendorFinder((p) => ({ ...p, quick: { ...p.quick, notes: e.target.value } }))}
                                placeholder="Any helpful notes"
                              />
                            </div>
                          </div>

                          <div className="mt-3 flex items-center justify-between gap-2 flex-wrap">
                            <label className="flex items-center gap-2 text-sm bg-white border border-neutral-200 rounded-full px-3 py-2">
                              <input
                                type="checkbox"
                                checked={!!vendorFinder.saveToLibrary}
                                onChange={(e) => setVendorFinder((p) => ({ ...p, saveToLibrary: e.target.checked }))}
                              />
                              <span>Save to library</span>
                            </label>

                            <SmallButton tone="primary" onClick={addQuickVendor} disabled={!norm(vendorFinder.quick.name) || !norm(vendorFinder.quick.email) || !norm(vendorFinder.quick.phone)}>
                              + Add vendor
                            </SmallButton>
                          </div>
                        </div>
                      </div>
                    </div>

                    {/* Vendor Library */}
                    <div className="rounded-2xl border border-neutral-200 bg-white">
                      <div className="px-4 py-3 border-b border-neutral-100 flex items-start justify-between gap-2 flex-wrap">
                        <div>
                          <div className="font-semibold text-neutral-800">Vendor Library</div>
                          <div className="text-xs text-neutral-600 mt-1">Reusable vendors saved across procurements.</div>
                        </div>
                        <SmallButton onClick={() => setManageLibraryOpen(true)}>Manage Vendors</SmallButton>
                      </div>

                      <div className="p-4 space-y-3">
                        <div>
                          <label className="text-sm text-neutral-700 font-medium">Search library</label>
                          <input
                            className={inputBase}
                            value={vendorLibSearch}
                            onChange={(e) => setVendorLibSearch(e.target.value)}
                            placeholder="name, email, website, tags, city..."
                          />
                        </div>

                        <div className="overflow-auto rounded-2xl border border-neutral-200">
                          <table className="w-full text-sm">
                            <thead className="text-left text-neutral-600">
                              <tr className="border-b">
                                <th className="py-2 px-3">Vendor</th>
                                <th className="py-2 px-3">City</th>
                                <th className="py-2 px-3">Category</th>
                                <th className="py-2 px-3">Tags</th>
                                <th className="py-2 px-3">Actions</th>
                              </tr>
                            </thead>
                            <tbody>
                              {filteredLibrary.length === 0 ? (
                                <tr>
                                  <td colSpan={5} className="py-3 px-3 text-neutral-500">
                                    No saved vendors yet.
                                  </td>
                                </tr>
                              ) : (
                                filteredLibrary.slice(0, 50).map((v) => (
                                  <tr key={v.id} className="border-b last:border-b-0">
                                    <td className="py-2 px-3">
                                      <div className="font-medium">{v.name || "-"}</div>
                                      <div className="text-xs text-neutral-600">{v.email || v.website || ""}</div>
                                    </td>
                                    <td className="py-2 px-3">{v.city || "-"}</td>
                                    <td className="py-2 px-3">{v.category || "-"}</td>
                                    <td className="py-2 px-3">{(v.tags || []).join(", ") || "-"}</td>
                                    <td className="py-2 px-3">
                                      <div className="flex gap-2 flex-wrap">
                                        <SmallButton onClick={() => addLibraryVendorToCurrent(v)}>+ Add</SmallButton>
                                        <SmallButton onClick={() => setEditingLibraryVendor(v)}>Edit</SmallButton>
                                        <SmallButton tone="danger" onClick={() => removeVendorFromLibrary(v.id)}>
                                          Delete
                                        </SmallButton>
                                      </div>
                                    </td>
                                  </tr>
                                ))
                              )}
                            </tbody>
                          </table>
                        </div>

                        <div className="text-xs text-neutral-600">Tip: “Auto-pick 3” uses category + tags to shortlist vendors.</div>
                      </div>
                    </div>
                  </div>

                  <div className="flex items-center justify-between gap-3 flex-wrap">
                    <div className="flex gap-2">
                      <SmallButton onClick={addVendor}>+ Vendor</SmallButton>
                      <SmallButton onClick={() => setManageVendorsOpen(true)}>Manage Vendors</SmallButton>
                    </div>
                    <div className="text-xs text-neutral-600">Add at least {requiredQuotes} vendor{requiredQuotes > 1 ? "s" : ""} for compliance. * Required</div>
                  </div>

                  <div className="space-y-3">
                    {activeVendors.map((v, idx) => (
                      <div key={v.id} className="rounded-2xl border border-neutral-200 bg-white">
                        <div className="px-4 py-3 border-b border-neutral-100 flex items-center justify-between gap-2 flex-wrap">
                          <div className="font-semibold text-neutral-800">Vendor {idx + 1}</div>
                          <div className="flex gap-2 flex-wrap">
                            <SmallButton
                              onClick={() =>
                                addVendorToLibrary({
                                  name: v.name,
                                  email: v.email,
                                  phone: v.phone,
                                  website: v.website,
                                  notes: v.notes,
                                  tags: parseTags(v.tags),
                                  category: v.category || effectiveFinderCategory || "",
                                  city: v.city || vendorFinder.city || "",
                                })
                              }
                              disabled={!norm(v.name)}
                              title={!norm(v.name) ? "Add a vendor name first" : "Save this vendor to your library"}
                            >
                              Save to library
                            </SmallButton>

                            <SmallButton
                              tone="danger"
                              onClick={() => deleteVendor(v.id)}
                              disabled={vendors.length <= 1}
                              title={vendors.length <= 1 ? "Keep at least one vendor" : "Delete vendor"}
                            >
                              Delete
                            </SmallButton>
                          </div>
                        </div>

                        <div className="p-4 space-y-3">
                          <div className="grid grid-cols-1 md:grid-cols-2 gap-3">
                            <div>
                              <label className="text-sm text-neutral-700 font-medium">Name *</label>
                              <input className={inputBase} value={v.name} onChange={(e) => updateVendor(v.id, { name: e.target.value })} />
                            </div>
                            <div>
                              <label className="text-sm text-neutral-700 font-medium">Email *</label>
                              <input
                                className={inputBase}
                                value={v.email}
                                onChange={(e) => updateVendor(v.id, { email: e.target.value })}
                                placeholder="quotes@vendor.de"
                              />
                            </div>
                            <div>
                              <label className="text-sm text-neutral-700 font-medium">Phone *</label>
                              <input className={inputBase} value={v.phone} onChange={(e) => updateVendor(v.id, { phone: e.target.value })} />
                            </div>
                            <div>
                              <label className="text-sm text-neutral-700 font-medium">Website</label>
                              <input
                                className={inputBase}
                                value={v.website}
                                onChange={(e) => updateVendor(v.id, { website: e.target.value })}
                                placeholder="https://"
                              />
                            </div>
                            <div>
                              <label className="text-sm text-neutral-700 font-medium">City</label>
                              <input
                                className={inputBase}
                                value={v.city || ""}
                                onChange={(e) => updateVendor(v.id, { city: e.target.value })}
                                placeholder={vendorFinder.city || "e.g., München"}
                              />
                            </div>
                            <div>
                              <label className="text-sm text-neutral-700 font-medium">Tags</label>
                              <input
                                className={inputBase}
                                value={v.tags || ""}
                                onChange={(e) => updateVendor(v.id, { tags: e.target.value })}
                                placeholder="local, approved, fast"
                              />
                            </div>
                          </div>

                          <div>
                            <label className="text-sm text-neutral-700 font-medium">Notes</label>
                            <input
                              className={inputBase}
                              value={v.notes}
                              onChange={(e) => updateVendor(v.id, { notes: e.target.value })}
                              placeholder="e.g., preferred / fast / local"
                            />
                          </div>
                        </div>
                      </div>
                    ))}
                  </div>
                </div>
              ) : null}

              {/* STEP 3: RFQs */}
              {step === 2 ? (
                <div className="space-y-4">
                  <div className="flex flex-wrap items-center justify-between gap-3">
                    <div className="text-xs text-neutral-600">
                      Mark at least {requiredQuotes} vendor{requiredQuotes > 1 ? "s" : ""} as contacted to proceed. * Required
                    </div>
                    <div className="flex items-center gap-3">
                    {rfqLanguage === "DE" && (
                      <button
                        type="button"
                        className="text-xs text-neutral-500 hover:text-neutral-800 underline"
                        onClick={() => {
                          const q = (state.request.spec || "").trim();
                          if (!q) return alert("No specs to translate");
                          window.open(`https://translate.google.com/?sl=auto&tl=de&text=${encodeURIComponent(q)}`, "_blank");
                        }}
                      >
                        Translate spec to German?
                      </button>
                    )}
                    <div className="inline-flex bg-neutral-100 p-1 rounded-lg border border-neutral-200">
                      <button
                        className={`px-3 py-1 text-xs font-medium rounded-md transition ${rfqLanguage === "EN" ? "bg-white shadow-sm text-neutral-900" : "text-neutral-500 hover:text-neutral-700"}`}
                        onClick={() => setRfqLanguage("EN")}
                      >
                        English
                      </button>
                      <button
                        className={`px-3 py-1 text-xs font-medium rounded-md transition ${rfqLanguage === "DE" ? "bg-white shadow-sm text-neutral-900" : "text-neutral-500 hover:text-neutral-700"}`}
                        onClick={() => setRfqLanguage("DE")}
                      >
                        German
                      </button>
                    </div>
                    </div>
                  </div>

                  <div className="grid grid-cols-1 md:grid-cols-2 gap-3">
                    <div>
                      <label className="text-sm text-neutral-700 font-medium">Subject prefix</label>
                      <input className={inputBase} value={state.rfq.subjectPrefix} onChange={(e) => updateRFQ({ subjectPrefix: e.target.value })} />
                    </div>
                    <div>
                      <label className="text-sm text-neutral-700 font-medium">Greeting</label>
                      <input className={inputBase} value={state.rfq.greeting} onChange={(e) => updateRFQ({ greeting: e.target.value })} />
                    </div>
                    <div>
                      <label className="text-sm text-neutral-700 font-medium">Closing</label>
                      <input className={inputBase} value={state.rfq.closing} onChange={(e) => updateRFQ({ closing: e.target.value })} />
                    </div>
                    <div>
                      <label className="text-sm text-neutral-700 font-medium">Signature name</label>
                      <input
                        className={inputBase}
                        value={state.rfq.signatureName}
                        onChange={(e) => updateRFQ({ signatureName: e.target.value })}
                        placeholder="If profile user is blank"
                      />
                    </div>
                    <div className="md:col-span-2">
                      <label className="text-sm text-neutral-700 font-medium">Payment line</label>
                      <input className={inputBase} value={state.rfq.paymentLine} onChange={(e) => updateRFQ({ paymentLine: e.target.value })} />
                    </div>
                  </div>

                  <div className="flex flex-wrap gap-2 text-sm">
                    {[
                      ["leadTime", "Lead time"],
                      ["validity", "Validity"],
                      ["delivery", "Delivery"],
                      ["payment", "Payment terms"],
                    ].map(([k, label]) => (
                      <label key={k} className="flex items-center gap-2 bg-white border border-neutral-200 rounded-full px-3 py-2">
                        <input
                          type="checkbox"
                          checked={!!state.rfq.include?.[k]}
                          onChange={(e) => updateRFQ({ include: { ...(state.rfq.include || {}), [k]: e.target.checked } })}
                        />
                        <span>{label}</span>
                      </label>
                    ))}
                  </div>

                  <div className="space-y-3">
                    {activeVendors
                      .filter((v) => String(v.name || "").trim())
                      .map((v) => {
                        const t = rfqTextByVendor.get(v.id);
                        const subject = t?.subject || "";
                        const body = t?.body || "";
                        const canMail = isEmail(v.email);

                        return (
                          <div key={v.id} className="rounded-2xl border border-neutral-200 bg-white">
                            <div className="px-4 py-3 border-b border-neutral-100">
                              <div className="font-semibold text-neutral-800">{v.name}</div>
                              <div className="text-xs text-neutral-600 mt-1">{v.email || "No email"}</div>
                            </div>
                            <div className="px-4 py-2 border-b border-neutral-100 bg-neutral-50 flex items-center gap-3 flex-wrap">
                                <select
                                  className="rounded-lg border border-neutral-200 bg-white px-2 py-1.5 text-sm text-neutral-800 focus:outline-none focus:ring-2 focus:ring-[rgb(var(--ts-accent-rgb)/0.25)] focus:border-[var(--ts-accent)]"
                                  value={v.contactMethod || ""}
                                  onChange={(e) => updateVendor(v.id, { contactMethod: e.target.value })}
                                >
                                  <option value="">Not sent</option>
                                  <option value="email">Email</option>
                                  <option value="phone">Phone</option>
                                  <option value="meeting">Meeting</option>
                                  <option value="portal">Portal</option>
                                  <option value="other">Other</option>
                                </select>
                                <SmallButton onClick={() => copyText(subject)}>Copy subject</SmallButton>
                                <SmallButton onClick={() => copyText(body)}>Copy body</SmallButton>
                                <a
                                  className={canMail ? btnPrimary : `${btnSecondary} pointer-events-none opacity-60`}
                                  href={canMail ? buildMailto(v.email, subject, body) : undefined}
                                  onClick={() => updateVendor(v.id, { contactMethod: "email" })}
                                >
                                  Email (mailto)
                                </a>
                            </div>

                            <div className="p-4 grid grid-cols-1 md:grid-cols-2 gap-3">
                              <div className="rounded-2xl border border-neutral-200 p-3">
                                <div className="text-xs text-neutral-600">Subject</div>
                                <div className="text-sm text-neutral-800 break-words mt-1">{subject || "-"}</div>
                              </div>
                              <div className="rounded-2xl border border-neutral-200 p-3">
                                <div className="text-xs text-neutral-600">Body (preview)</div>
                                <pre className="text-xs whitespace-pre-wrap break-words mt-1 text-neutral-800">{body || "-"}</pre>
                              </div>
                            </div>
                          </div>
                        );
                      })}
                  </div>
                </div>
              ) : null}

              {/* STEP 4: Quotes */}
              {step === 3 ? (
                <div className="space-y-4">
                  <div className="flex items-center gap-3 flex-wrap bg-neutral-50 p-3 rounded-xl border border-neutral-200">
                    <div className="text-sm font-medium text-neutral-700">Add Quote:</div>
                    
                    <input
                      className="w-28 rounded-lg border border-neutral-200 bg-white px-3 py-2 text-sm text-neutral-800 focus:outline-none focus:ring-2 focus:ring-[rgb(var(--ts-accent-rgb)/0.25)] focus:border-[var(--ts-accent)]"
                      placeholder="Price (€)"
                      type="number"
                      step="0.01"
                      value={newQuoteAmount}
                      onChange={(e) => setNewQuoteAmount(e.target.value)}
                    />
                    <input
                      className="w-32 rounded-lg border border-neutral-200 bg-white px-3 py-2 text-sm text-neutral-800 focus:outline-none focus:ring-2 focus:ring-[rgb(var(--ts-accent-rgb)/0.25)] focus:border-[var(--ts-accent)]"
                      placeholder="Lead time"
                      value={newQuoteLeadTime}
                      onChange={(e) => setNewQuoteLeadTime(e.target.value)}
                    />
                    <input
                      className="w-32 rounded-lg border border-neutral-200 bg-white px-3 py-2 text-sm text-neutral-800 focus:outline-none focus:ring-2 focus:ring-[rgb(var(--ts-accent-rgb)/0.25)] focus:border-[var(--ts-accent)]"
                      placeholder="Validity"
                      value={newQuoteValidity}
                      onChange={(e) => setNewQuoteValidity(e.target.value)}
                    />
                    <select
                      className="w-36 rounded-lg border border-neutral-200 bg-white px-3 py-2 text-sm text-neutral-800 focus:outline-none focus:ring-2 focus:ring-[rgb(var(--ts-accent-rgb)/0.25)] focus:border-[var(--ts-accent)]"
                      value={newQuotePaymentTerms}
                      onChange={(e) => setNewQuotePaymentTerms(e.target.value)}
                    >
                      <option value="" disabled>Payment Terms</option>
                      <option value="Cash">Cash</option>
                      <option value="Account">Account</option>
                      <option value="Invoice 30 days">Invoice 30 days</option>
                    </select>

                    <select
                      className="rounded-lg border border-neutral-200 bg-white px-3 py-2 text-sm text-neutral-800 focus:outline-none focus:ring-2 focus:ring-[rgb(var(--ts-accent-rgb)/0.25)] focus:border-[var(--ts-accent)]"
                      value={newQuoteVendorId}
                      onChange={(e) => setNewQuoteVendorId(e.target.value)}
                    >
                      <option value="" disabled>
                        Select a vendor...
                      </option>
                      {availableVendorsForQuote.map((v) => (
                        <option key={v.id} value={v.id}>
                          {v.name} {v.inactive ? "(Inactive)" : ""}
                        </option>
                      ))}
                    </select>
                    <button
                      type="button"
                      className={btnPrimary}
                      onClick={handleAddQuote}
                      disabled={!newQuoteVendorId}
                    >
                      + Add Quote
                    </button>
                    <label className="flex items-center gap-2 text-sm cursor-pointer ml-auto">
                      <input
                        type="checkbox"
                        checked={showInactiveInQuoteDropdown}
                        onChange={(e) => setShowInactiveInQuoteDropdown(e.target.checked)}
                      />
                      <span className="text-neutral-600">Show inactive vendors</span>
                    </label>
                  </div>

                  <div className="space-y-3">
                    {quoteRows.map((r) => (
                      <div key={r.vendorId} className="rounded-2xl border border-neutral-200 bg-white">
                            <div className="px-4 py-3 border-b border-neutral-100 flex items-start justify-between gap-3 flex-wrap">
                              <div>
                            <div className="font-semibold text-neutral-800">
                              {r.vendorName} {r.inactive ? "(Inactive)" : ""}
                            </div>
                            <div className="text-xs text-neutral-600 mt-1">{r.email || ""}</div>
                              </div>
                          <div className="flex items-center gap-2">
                            <div className="text-xs text-neutral-600 mr-2">
                              Amount: <span className="font-semibold text-neutral-800">{r.amount !== null ? moneyFmt(r.amount) : "-"}</span>
                            </div>
                            <SmallButton tone="danger" onClick={() => deleteQuote(r.vendorId)}>
                              Remove
                            </SmallButton>
                          </div>
                        </div>

                            <div className="p-4 space-y-3">
                              <div className="grid grid-cols-1 md:grid-cols-2 gap-3">
                                <div>
                                  <label className="text-sm text-neutral-700 font-medium">Total amount</label>
                              <input
                                type="number"
                                step="0.01"
                                className={inputBase}
                                value={r.amount ?? ""}
                                onChange={(e) => upsertQuote(r.vendorId, { amount: e.target.value })}
                                placeholder="e.g., 199.99"
                              />
                                </div>
                                <div>
                                  <label className="text-sm text-neutral-700 font-medium">Lead time</label>
                              <input
                                className={inputBase}
                                value={r.leadTime}
                                onChange={(e) => upsertQuote(r.vendorId, { leadTime: e.target.value })}
                                placeholder="e.g., 3–5 business days"
                              />
                                </div>
                                <div>
                                  <label className="text-sm text-neutral-700 font-medium">Validity</label>
                              <input
                                className={inputBase}
                                value={r.validity}
                                onChange={(e) => upsertQuote(r.vendorId, { validity: e.target.value })}
                                placeholder="e.g., valid 14 days"
                              />
                                </div>
                                <div>
                                  <label className="text-sm text-neutral-700 font-medium">Payment Terms</label>
                                  <select
                                    className={inputBase}
                                    value={r.paymentTerms}
                                    onChange={(e) => upsertQuote(r.vendorId, { paymentTerms: e.target.value })}
                                  >
                                    <option value="">Select...</option>
                                    <option value="Cash">Cash</option>
                                    <option value="Account">Account</option>
                                    <option value="Invoice 30 days">Invoice 30 days</option>
                                  </select>
                                </div>
                                <div>
                                  <label className="text-sm text-neutral-700 font-medium">Proof reference</label>
                                  <div className="relative">
                                    <input
                                      className={`${inputBase} pr-8`}
                                      value={r.proof}
                                      onChange={(e) => upsertQuote(r.vendorId, { proof: e.target.value })}
                                      placeholder="e.g., email 24.12 / PDF filename"
                                    />
                                    <label className="absolute right-2 top-1/2 -translate-y-1/2 cursor-pointer text-neutral-400 hover:text-[var(--ts-accent)] p-1" title="Attach file">
                                      📎
                                      <input
                                        type="file"
                                        className="hidden"
                                        onChange={(e) => {
                                          const f = e.target.files?.[0];
                                          if (f) upsertQuote(r.vendorId, { proof: f.name });
                                        }}
                                      />
                                    </label>
                                  </div>
                                </div>
                              </div>

                              <div>
                                <label className="text-sm text-neutral-700 font-medium">Notes</label>
                            <input
                              className={inputBase}
                              value={r.notes}
                              onChange={(e) => upsertQuote(r.vendorId, { notes: e.target.value })}
                              placeholder="Any special terms / observations"
                            />
                              </div>
                            </div>
                          </div>
                    ))}

                    {quoteRows.length === 0 && (
                      <div className="text-center py-8 text-neutral-500 text-sm">
                        No quotes added yet. Add a vendor above.
                      </div>
                    )}
                  </div>

                  <div className="rounded-2xl border border-neutral-200 bg-white">
                    <div className="px-4 py-3 border-b border-neutral-100">
                      <div className="font-semibold text-neutral-800">Comparison</div>
                      <div className="text-xs text-neutral-600 mt-1">Auto-sorted by amount. Select the winning vendor here.</div>
                    </div>
                    <div className="p-4 overflow-auto">
                      <table className="w-full text-sm">
                        <thead className="text-left text-neutral-600">
                          <tr className="border-b">
                            <th className="py-2 pr-2">Select</th>
                            <th className="py-2 pr-2">Vendor</th>
                            <th className="py-2 pr-2">Amount</th>
                            <th className="py-2 pr-2">Lead time</th>
                            <th className="py-2 pr-2">Validity</th>
                            <th className="py-2 pr-2">Payment Terms</th>
                          </tr>
                        </thead>
                        <tbody>
                          {quoteRows.length === 0 ? (
                            <tr>
                              <td colSpan={6} className="py-3 text-neutral-500">Add vendor names first.</td>
                            </tr>
                          ) : (
                            quoteRows.map((r) => (
                              <tr key={r.vendorId} className="border-b last:border-b-0">
                                <td className="py-2 pr-2">
                                  <input type="radio" name="selectedVendor" checked={state.compliance.selectedVendorId === r.vendorId} onChange={() => selectVendor(r.vendorId)} />
                                </td>
                                <td className="py-2 pr-2 font-medium">
                                  {r.vendorName} {r.inactive ? "(Inactive)" : ""}
                                </td>
                                <td className="py-2 pr-2">{r.amount === null ? "-" : moneyFmt(r.amount)}</td>
                                <td className="py-2 pr-2">{r.leadTime || "-"}</td>
                                <td className="py-2 pr-2">{r.validity || "-"}</td>
                                <td className="py-2 pr-2">{r.paymentTerms || "-"}</td>
                              </tr>
                            ))
                          )}
                        </tbody>
                      </table>
                    </div>
                  </div>
                </div>
              ) : null}

              {/* STEP 5: Pack */}
              {step === 4 ? (
                <div className="space-y-4">
                  <div className="grid grid-cols-1 md:grid-cols-2 gap-3">
                    <div className="rounded-2xl border border-neutral-200 p-4">
                      <div className="font-semibold text-neutral-800">Selected vendor</div>
                      <div className="mt-2 text-sm text-neutral-800">
                        {state.compliance.selectedVendorId
                          ? vendors.find((v) => v.id === state.compliance.selectedVendorId)?.name || "-"
                          : "Not selected"}
                      </div>
                      <div className="mt-2 text-xs text-neutral-600">Tip: select vendor in the Quotes comparison table.</div>
                    </div>

                    <div className="rounded-2xl border border-neutral-200 p-4">
                      <div className="font-semibold text-neutral-800">Compliance checklist</div>
                      <ul className="mt-2 text-sm text-neutral-700 list-disc pl-5 space-y-1">
                        <li>Request documented (title + specification)</li>
                      <li>At least {requiredQuotes} vendor{requiredQuotes > 1 ? "s" : ""} contacted</li>
                        <li>
                          At least {requiredQuotes} quote{requiredQuotes > 1 ? "s" : ""} recorded
                          <div className="text-xs text-neutral-500 mt-0.5">({ruleDescription})</div>
                        </li>
                        <li>Selection justified</li>
                      </ul>
                    </div>
                  </div>

                  <div>
                    <label className="text-sm text-neutral-700 font-medium">Justification</label>
                    <textarea
                      className={`${inputBase} min-h-[140px]`}
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
                  </div>

                  <div className="flex items-center justify-between gap-2 flex-wrap">
                    <SmallButton onClick={() => setStep(3)}>Back to quotes</SmallButton>
                    <SmallButton tone="primary" onClick={() => setPreviewOpen(true)}>
                      Open preview
                    </SmallButton>
                  </div>
                </div>
              ) : null}
            </div>
          </div>
        </div>

        {/* Footer link */}
        <div className="mt-6 text-sm text-neutral-600 print:hidden">
          <a className="underline hover:text-neutral-900" href={HUB_URL} target="_blank" rel="noreferrer">
            Return to ToolStack hub
          </a>
        </div>
      </div>
    </div>
  );
}
