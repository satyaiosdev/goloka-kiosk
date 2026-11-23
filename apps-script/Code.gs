/**
 * Goloka Sanctuary kiosk → Google Sheet receiver (+ optional Square card checkout).
 *
 * Setup: Extensions → Apps Script in your Google Sheet, paste this file, then
 * Deploy → New deployment → Web app (Execute as: Me, Who has access: Anyone).
 * Copy the /exec URL into config.js → sheetEndpoint.
 *
 * Tabs are created automatically:
 *   Sign-ups        – Stay Connected entries
 *   Goseva          – Blessings & Goseva pledges
 *   Donations       – Give with Love gifts
 *   Occasions       – one row per birthday/anniversary, for scheduling Go Puja
 *   Card Checkouts  – every Square checkout link created (to match against Square payments)
 *
 * Square (optional): Project Settings → Script Properties → add
 *   SQUARE_ACCESS_TOKEN  – from developer.squareup.com → your app → Credentials (Production)
 *   SQUARE_LOCATION_ID   – same page → Locations
 *   SQUARE_ENV           – "production" (or "sandbox" while testing)
 *   KIOSK_URL            – your kiosk address, e.g. https://you.github.io/goloka-kiosk/
 * Keep the token only here. Never put it in config.js or share it.
 */

const SIGNATURE_FOLDER = "Goloka Kiosk Signatures";
const SQUARE_VERSION = "2025-01-23";
const MAX_AMOUNT = 50000;

const TABS = {
  connect: {
    name: "Sign-ups",
    headers: ["Timestamp", "Name", "Phone", "City", "Text/WhatsApp OK", "Interests", "Chanting pledge", "Event", "Device", "Person ID", "Entry ID"],
    row: (d) => [new Date(d.ts), d.name, txt(d.phone), d.city, d.consent ? "Yes" : "No", d.interests, d.chanting, d.event, d.device, d.personId, d.id],
  },
  goseva: {
    name: "Goseva",
    headers: ["Timestamp", "Name", "Phone", "Email", "Address", "City", "Amount", "Frequency", "Payment method", "Payment received?", "Occasions", "Signature", "Event", "Device", "Person ID", "Entry ID"],
    row: (d, sigUrl) => [new Date(d.ts), d.name, txt(d.phone), d.email, d.address, d.city, Number(d.amount) || 0, d.frequency, d.payment, "",
      d.occasionsText, sigUrl, d.event, d.device, d.personId, d.id],
  },
  donation: {
    name: "Donations",
    headers: ["Timestamp", "Name", "Phone", "Email", "City", "Amount", "Frequency", "Toward", "Payment method", "Payment received?", "Event", "Device", "Person ID", "Entry ID"],
    row: (d) => [new Date(d.ts), d.name, txt(d.phone), d.email, d.city, Number(d.amount) || 0, d.frequency, d.purpose, d.payment, "",
      d.event, d.device, d.personId, d.id],
  },
};
const OCC_HEADERS = ["Month-Day", "Occasion", "For", "Date", "Donor", "Phone", "Email", "Entry ID"];
const CHECKOUT_HEADERS = ["Timestamp", "Kind", "Name", "Email", "Amount", "Monthly?", "Square order ID", "Checkout link", "Entry ID"];

// ── Kiosk entries (POST) ──
function doPost(e) {
  const lock = LockService.getScriptLock();
  lock.waitLock(20000);
  try {
    const d = JSON.parse(e.postData.contents);
    const tab = TABS[d.type];
    if (!tab || !d.id) return out({ ok: false, error: "bad payload" });

    const sheet = getSheet(tab.name, tab.headers);
    if (alreadySaved(sheet, tab.headers.length, d.id)) return out({ ok: true, duplicate: true });

    let sigUrl = "";
    if (d.type === "goseva" && d.signature) sigUrl = saveSignature(d);
    sheet.appendRow(tab.row(d, sigUrl));

    if (d.type === "goseva" && Array.isArray(d.occasions)) {
      const occ = getSheet("Occasions", OCC_HEADERS);
      d.occasions.forEach((o) => {
        occ.appendRow([txt(o.date ? o.date.slice(5) : ""), o.occasion, o.name, o.date, d.name, txt(d.phone), d.email, d.id]);
      });
    }
    return out({ ok: true });
  } catch (err) {
    return out({ ok: false, error: String(err) });
  } finally {
    lock.releaseLock();
  }
}

// ── Health check + Square checkout link (GET) ──
function doGet(e) {
  const p = (e && e.parameter) || {};
  if (p.action === "checkout") return out(createSquareCheckout(p));
  return out({ ok: true, message: "Goloka kiosk endpoint is running." });
}

function createSquareCheckout(p) {
  const props = PropertiesService.getScriptProperties();
  const token = props.getProperty("SQUARE_ACCESS_TOKEN");
  const location = props.getProperty("SQUARE_LOCATION_ID");
  if (!token || !location) return { ok: false, error: "square not configured" };

  const amount = Math.round(Number(p.amount) * 100);
  if (!(amount >= 100 && amount <= MAX_AMOUNT * 100)) return { ok: false, error: "bad amount" };
  const ref = String(p.ref || "").slice(0, 40);
  if (!ref) return { ok: false, error: "missing ref" };

  // Only send people back to your own kiosk after paying.
  const kioskUrl = props.getProperty("KIOSK_URL") || "";
  const back = kioskUrl && String(p.back || "").indexOf(kioskUrl) === 0 ? p.back : (kioskUrl ? kioskUrl + "?paid=1" : "");

  const kind = String(p.kind || "Donation").slice(0, 60);
  const name = String(p.name || "").slice(0, 80);
  const monthly = p.monthly === "1";
  const body = {
    idempotency_key: ref,
    quick_pay: {
      name: `${kind} – Goloka Sanctuary`,
      price_money: { amount: amount, currency: "USD" },
      location_id: location,
    },
    payment_note: `${kind}${monthly ? " (monthly pledge – first gift)" : ""} – ${name} – ${ref}`.slice(0, 500),
    checkout_options: Object.assign({ ask_for_shipping_address: false }, back ? { redirect_url: back } : {}),
  };
  if (/^\S+@\S+\.\S+$/.test(p.email || "")) body.pre_populated_data = { buyer_email: p.email };

  const base = props.getProperty("SQUARE_ENV") === "sandbox" ? "https://connect.squareupsandbox.com" : "https://connect.squareup.com";
  const res = UrlFetchApp.fetch(base + "/v2/online-checkout/payment-links", {
    method: "post",
    contentType: "application/json",
    headers: { Authorization: "Bearer " + token, "Square-Version": SQUARE_VERSION },
    payload: JSON.stringify(body),
    muteHttpExceptions: true,
  });
  const j = JSON.parse(res.getContentText() || "{}");
  if (res.getResponseCode() >= 300 || !j.payment_link) {
    console.error("Square error", res.getResponseCode(), res.getContentText());
    return { ok: false, error: "square error" };
  }
  const link = j.payment_link;
  getSheet("Card Checkouts", CHECKOUT_HEADERS)
    .appendRow([new Date(), kind, name, p.email || "", amount / 100, monthly ? "Yes" : "No", link.order_id, link.url, ref]);
  return { ok: true, url: link.url };
}

// ── helpers ──
function getSheet(name, headers) {
  const ss = SpreadsheetApp.getActiveSpreadsheet();
  let sh = ss.getSheetByName(name);
  if (!sh) {
    sh = ss.insertSheet(name);
    sh.appendRow(headers);
    sh.getRange(1, 1, 1, headers.length).setFontWeight("bold").setBackground("#eef3e6");
    sh.setFrozenRows(1);
  }
  return sh;
}

// Entry ID is always the last column. Check recent rows so kiosk retries never double-count.
function alreadySaved(sheet, idCol, id) {
  const last = sheet.getLastRow();
  if (last < 2) return false;
  const start = Math.max(2, last - 500);
  const ids = sheet.getRange(start, idCol, last - start + 1, 1).getValues().flat();
  return ids.indexOf(id) !== -1;
}

function saveSignature(d) {
  try {
    const it = DriveApp.getFoldersByName(SIGNATURE_FOLDER);
    const folder = it.hasNext() ? it.next() : DriveApp.createFolder(SIGNATURE_FOLDER);
    const b64 = String(d.signature).split(",")[1];
    const blob = Utilities.newBlob(Utilities.base64Decode(b64), "image/png", `${d.ts.slice(0, 10)} ${d.name} ${d.id}.png`);
    return folder.createFile(blob).getUrl(); // stays private to your Google account
  } catch (err) {
    return "signature save failed: " + err;
  }
}

const txt = (v) => (v ? "'" + v : ""); // keep phone numbers / dates as text
const out = (o) => ContentService.createTextOutput(JSON.stringify(o)).setMimeType(ContentService.MimeType.JSON);
