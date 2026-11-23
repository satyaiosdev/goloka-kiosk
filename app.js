/* Goloka Sanctuary — sign-up, blessings & donation kiosk
 * Plain JS, no build step. All settings live in config.js. */
(() => {
  "use strict";
  const C = window.KIOSK_CONFIG;
  const params = new URLSearchParams(location.search);
  const EVENT = params.get("event") || C.eventName;
  const app = document.getElementById("app");
  const modalRoot = document.getElementById("modal-root");

  // ── Helpers ──
  const store = {
    get(k, d) { try { const v = localStorage.getItem(k); return v ? JSON.parse(v) : d; } catch { return d; } },
    set(k, v) { try { localStorage.setItem(k, JSON.stringify(v)); return true; } catch { return false; } },
  };
  const DEVICE = store.get("gk_device") || (() => { const id = "kiosk-" + Math.random().toString(36).slice(2, 7); store.set("gk_device", id); return id; })();
  const uid = () => Date.now().toString(36) + Math.random().toString(36).slice(2, 8);
  const esc = (s) => String(s ?? "").replace(/[&<>"']/g, (c) => ({ "&": "&amp;", "<": "&lt;", ">": "&gt;", '"': "&quot;", "'": "&#39;" }[c]));
  const money = (n) => "$" + Number(n).toLocaleString("en-US", { maximumFractionDigits: 2 });
  const digits = (s) => String(s || "").replace(/\D/g, "");
  const fmtPhone = (s) => {
    const d = digits(s);
    if (s.trim().startsWith("+") || d.length > 10) return s;
    if (d.length <= 3) return d;
    if (d.length <= 6) return `(${d.slice(0, 3)}) ${d.slice(3)}`;
    return `(${d.slice(0, 3)}) ${d.slice(3, 6)}-${d.slice(6, 10)}`;
  };
  const allInterests = Object.values(C.interests).flat();
  const firstName = () => (S.person.name || "").trim().split(/\s+/)[0] || "friend";
  const pay = (id) => C.payments.find((p) => p.id === id);

  // ── State ──
  let S;
  function freshState() {
    return {
      screen: "welcome", flow: null, idx: 0, fromConnect: false,
      person: { name: "", phone: "", city: "", email: "", address: "", consent: false },
      interests: [], chant: null, chantOther: "",
      occasions: [{ type: "self", name: "", date: "" }],
      amount: null, customAmount: "", freq: "once", tier: null, payment: null,
      signature: null, personId: uid(), entryId: null, pending: null, errors: {},
      checkout: null, // { state: "loading"|"ready"|"fallback", url }
    };
  }

  const FLOWS = {
    connect: ["qc-name", "qc-contact", "qc-interests", "chant"],
    goseva: ["gs-contact", "gs-occasions", "gs-offering", "gs-sign", "pay-method"],
    gosevaAfterConnect: ["gs-contact", "gs-occasions", "gs-offering", "gs-sign", "pay-method"],
    give: ["dn-amount", "dn-contact", "pay-method"],
    giveAfterConnect: ["dn-amount", "dn-contact", "pay-method"],
  };
  const isGoseva = () => S.flow && S.flow.startsWith("goseva");
  const OCC_TYPES = [
    { id: "self", label: "My birthday", ph: "Your name" },
    { id: "spouse", label: "Spouse's birthday", ph: "Spouse's name" },
    { id: "child", label: "Child's birthday", ph: "Child's name" },
    { id: "anniv", label: "Wedding anniversary", ph: "Couple's names" },
    { id: "other", label: "Other occasion", ph: "What are we celebrating?" },
  ];

  // ── Navigation ──
  function go(screen) {
    if (screen === "gs-occasions") S.occasions.forEach((o) => { if (o.type === "self" && !o.name) o.name = S.person.name.trim(); });
    S.screen = screen; S.errors = {}; render(); window.scrollTo(0, 0);
  }
  function startFlow(name) { S.flow = name; S.idx = 0; go(FLOWS[name][0]); }
  function next() {
    const f = FLOWS[S.flow];
    if (S.idx < f.length - 1) { S.idx++; go(f[S.idx]); } else finish();
  }
  function back() {
    if (S.screen === "pay") { S.pending = null; S.checkout = null; return go("pay-method"); }
    if (S.idx > 0) { S.idx--; go(FLOWS[S.flow][S.idx]); } else reset();
  }

  // ── Building blocks ──
  function topbar() {
    const f = FLOWS[S.flow] || [];
    const dots = f.map((_, i) => `<i class="${i <= S.idx ? "on" : ""}"></i>`).join("");
    return `<div class="topbar">
      <button class="back" data-a="back">← Back</button>
      <div class="brand"><img src="assets/logo.png" alt="" /> ${esc(C.org.dba)}</div>
      <div class="progress" aria-label="Step ${S.idx + 1} of ${f.length}">${dots}</div>
    </div>`;
  }
  const cta = (label = "Continue", cls = "") => `<div class="cta-bar"><button class="btn ${cls}" data-a="next">${label}</button></div>`;
  const err = (k) => `<div class="err">${S.errors[k] ? esc(S.errors[k]) : ""}</div>`;
  const field = (k, label, attrs = "", opt = false) => `
    <div class="field"><label for="f-${k}">${label}${opt ? ' <span class="opt">(optional)</span>' : ""}</label>
      <input class="input ${S.errors[k] ? "bad" : ""}" id="f-${k}" data-p="${k}" value="${esc(S.person[k])}"
        autocomplete="off" autocorrect="off" spellcheck="false" ${attrs} />${err(k)}</div>`;
  const freqSeg = () => `<div class="seg">
      <button class="${S.freq === "once" ? "on" : ""}" data-a="freq" data-v="once">One-time</button>
      <button class="${S.freq === "monthly" ? "on" : ""}" data-a="freq" data-v="monthly">Monthly</button></div>`;
  const amountTiles = (list) => `<div class="tiles">
      ${list.map((o) => `<button class="tile amount ${S.amount === o.amount ? "on" : ""}" data-a="amount" data-v="${o.amount}">
        ${money(o.amount)}${o.note ? `<span class="sm">${esc(o.note)}</span>` : ""}</button>`).join("")}
      <button class="tile ${S.amount === "custom" ? "on" : ""}" data-a="amount" data-v="custom"><span class="em">✏️</span>Other amount</button>
    </div>
    ${S.amount === "custom" ? `<div class="card"><div class="field" style="margin:0"><label for="f-custom">Amount (USD)</label>
      <input class="input ${S.errors.amount ? "bad" : ""}" id="f-custom" data-s="customAmount" inputmode="decimal" placeholder="$" value="${esc(S.customAmount)}" autocomplete="off" /></div></div>` : ""}
    ${err("amount")}`;
  const volunteerNote = () => (C.volunteerNote ? `<div class="vol-note">🙋 ${esc(C.volunteerNote)}</div>` : "");
  const perMonth = () => (S.freq === "monthly" ? " / month" : "");

  // ── Screens ──
  const SCREENS = {
    welcome: () => `
      <section class="screen welcome">
        <img class="logo" src="assets/logo.png" alt="Goloka Sanctuary" data-a="logo" />
        ${C.org.tagline ? `<div class="eyebrow">${esc(C.org.tagline)}</div>` : ""}
        <h1>Hare Krishna! 🙏</h1>
        <p class="sub">Welcome to ${esc(C.org.dba)}. We'd love to stay connected with you.</p>
        ${C.org.stat ? `<div class="stat">🐄 ${esc(C.org.stat)}</div>` : ""}
        <div class="mantra" id="mantra">Hare Krishna Hare Krishna, Krishna Krishna Hare Hare</div>
        <div class="choices">
          <button class="choice primary wide" data-a="start" data-flow="connect">
            <span class="ic">🪷</span><b>Stay Connected</b>
            <span>Hear about kirtans, classes, visits &amp; seva. Takes 30 seconds.</span>
          </button>
          <button class="choice gold" data-a="start" data-flow="goseva">
            <span class="ic">🌼</span><b>Goseva &amp; Blessings</b>
            <span>Cow Seva &amp; Go Puja offered on your family's special days.</span>
          </button>
          <button class="choice love" data-a="start" data-flow="give">
            <span class="ic">💛</span><b>Give with Love</b>
            <span>Feed, shelter &amp; care for our rescued cows.</span>
          </button>
        </div>
        <div class="org-foot"><b>${esc(C.org.dba)}</b> · ${esc(C.org.legalName)} · ${esc(C.org.nonprofitNote)}
          ${C.org.address ? `<br>📍 ${esc(C.org.address)}${C.org.phone ? ` · 📞 ${esc(C.org.phone)}` : ""}` : ""}
          ${C.org.social ? `<br>${esc(C.org.social)}` : ""}</div>
      </section>`,

    "qc-name": () => `
      <section class="screen step">${topbar()}
        <h2>What's your name?</h2>
        <p class="hint">So we can greet you properly next time.</p>
        <div class="card">${field("name", "Full name", 'enterkeyhint="next" autocapitalize="words" placeholder="e.g. Radha Sharma"')}</div>
        ${cta()}
      </section>`,

    "qc-contact": () => `
      <section class="screen step">${topbar()}
        <h2>Nice to meet you, ${esc(firstName())}!</h2>
        <p class="hint">How can we reach you about upcoming programs?</p>
        <div class="card">
          ${field("phone", "Phone number", 'type="tel" inputmode="tel" placeholder="(555) 123-4567"')}
          ${field("city", "City", 'autocapitalize="words" placeholder="Your city"')}
          <div class="toggle ${S.person.consent ? "on" : ""}" data-a="consent" role="switch" aria-checked="${S.person.consent}">
            <div class="sw"></div>
            <div>Text / WhatsApp me about programs<small>Occasional updates only. Reply STOP anytime.</small></div>
          </div>
        </div>
        ${cta()}
      </section>`,

    "qc-interests": () => `
      <section class="screen step">${topbar()}
        <h2>What touches your heart?</h2>
        <p class="hint">Tap everything that interests you.</p>
        ${Object.entries(C.interests).map(([g, items]) => `
          <div class="group-title">${esc(g)}</div>
          <div class="tiles">${items.map((it) => `
            <button class="tile ${S.interests.includes(it.id) ? "on" : ""}" data-a="interest" data-id="${it.id}">
              <span class="em">${it.emoji}</span>${esc(it.label)}</button>`).join("")}
          </div>`).join("")}
        ${cta(S.interests.length ? `Continue (${S.interests.length} selected)` : "Continue")}
      </section>`,

    chant: () => `
      <section class="screen step">${topbar()}
        <h2>Daily chanting pledge 📿</h2>
        <p class="hint">Would you like to commit to chanting the Hare Krishna Maha-Mantra daily?<br>
          <small>One round = 108 repetitions.</small></p>
        <div class="tiles">
          ${C.chantingOptions.map((n) => `
            <button class="tile amount ${S.chant === n ? "on" : ""}" data-a="chant" data-v="${n}">${n}
              <span class="sm">${n === 1 ? "round" : "rounds"} / day</span></button>`).join("")}
          <button class="tile ${S.chant === "other" ? "on" : ""}" data-a="chant" data-v="other"><span class="em">✏️</span>Other</button>
        </div>
        ${S.chant === "other" ? `<div class="card" style="margin-bottom:12px"><div class="field" style="margin:0">
          <label for="f-chantOther">My commitment</label>
          <input class="input" id="f-chantOther" data-s="chantOther" value="${esc(S.chantOther)}" placeholder="e.g. 8 rounds, or 15 minutes" autocomplete="off" /></div></div>` : ""}
        <div class="cta-bar">
          <button class="btn ghost" data-a="chant-skip">Maybe later</button>
          <button class="btn" data-a="next" ${S.chant == null ? "disabled" : ""}>Finish 🙏</button>
        </div>
      </section>`,

    "qc-thanks": () => `
      <section class="screen thanks">
        <div class="big">🌸</div>
        <h2>Hare Krishna, ${esc(firstName())}!</h2>
        <p>Thank you for joining us. We'll be in touch about ${S.interests.length ? "the programs you chose" : "upcoming programs"}.</p>
        ${S.chant != null ? `<div class="pledge-badge">📿 Chanting pledge: ${esc(chantText())}</div>` : ""}
        <div class="upsell">
          <button class="choice gold" data-a="upsell" data-flow="gosevaAfterConnect">
            <span class="ic">🌼</span><b>Goseva &amp; Blessings</b>
            <span>Cow Seva on your family's birthdays &amp; anniversaries.</span>
          </button>
          <button class="choice love" data-a="upsell" data-flow="giveAfterConnect">
            <span class="ic">💛</span><b>Give with Love</b>
            <span>Feed &amp; care for our rescued cows.</span>
          </button>
        </div>
        <div class="countdown" id="countdown"></div>
        <div class="cta-bar narrow"><button class="btn ghost" style="flex:1" data-a="reset">Done</button></div>
      </section>`,

    "gs-contact": () => `
      <section class="screen step">${topbar()}
        <h2>${S.fromConnect ? "Just a few more details" : "Your details"}</h2>
        <p class="hint">So we can send your blessings and receipt.</p>
        <div class="card">
          ${field("name", "Full name", 'autocapitalize="words"')}
          <div class="row2">
            ${field("phone", "Phone number", 'type="tel" inputmode="tel"')}
            ${field("email", "Email", 'type="email" inputmode="email" autocapitalize="off" placeholder="you@email.com"')}
          </div>
          ${field("address", "Mailing address", 'autocapitalize="words" placeholder="Street, City, State, ZIP"', true)}
          ${S.fromConnect ? "" : field("city", "City", 'autocapitalize="words"')}
        </div>
        ${cta()}
      </section>`,

    "gs-occasions": () => `
      <section class="screen step">${topbar()}
        <h2>Special occasions</h2>
        <p class="hint">On each of these days, Cow Seva &amp; Go Puja will be offered on your behalf.</p>
        ${S.occasions.map((o, i) => {
          const t = OCC_TYPES.find((x) => x.id === o.type) || OCC_TYPES[4];
          return `<div class="occ">
            ${S.occasions.length > 1 ? `<button class="rm" data-a="occ-rm" data-i="${i}" aria-label="Remove">✕</button>` : ""}
            <div><span class="mini">Occasion</span><select class="input" data-occ="${i}" data-k="type">
              ${OCC_TYPES.map((x) => `<option value="${x.id}" ${x.id === o.type ? "selected" : ""}>${x.label}</option>`).join("")}
            </select></div>
            <div><span class="mini">Name</span><input class="input" data-occ="${i}" data-k="name" value="${esc(o.name)}" placeholder="${esc(t.ph)}" autocomplete="off" autocapitalize="words" /></div>
            <div><span class="mini">Date</span><input class="input" type="date" data-occ="${i}" data-k="date" value="${esc(o.date)}" /></div>
          </div>`;
        }).join("")}
        ${S.occasions.length < 8 ? `<button class="add" data-a="occ-add">＋ Add another occasion</button>` : ""}
        ${err("occasions")}
        <div class="promise">🙏 On the above-mentioned special occasions, Cow Seva will be offered on your behalf at ${esc(C.org.dba)}.</div>
        ${cta()}
      </section>`,

    "gs-offering": () => `
      <section class="screen step">${topbar()}
        <h2>Cow Seva offering</h2>
        <p class="hint">Celebrate your special occasions by rescuing and adopting a cow, and receive their blessings.</p>
        ${freqSeg()}${amountTiles(C.offerings)}
        ${cta()}
      </section>`,

    "gs-sign": () => `
      <section class="screen step">${topbar()}
        <h2>Please review &amp; sign</h2>
        <div class="card">
          <div class="summary">
            <div><span>Name</span><b>${esc(S.person.name)}</b></div>
            <div><span>Cow Seva offering</span><b>${money(amountValue())}${perMonth()}</b></div>
            <div><span>Occasions</span><b>${filledOccasions().length || "None"}</b></div>
          </div>
          <div class="sig-wrap"><canvas id="sig"></canvas><div class="ph" id="sig-ph">Sign here with your finger</div>
            <button class="clear" data-a="sig-clear">Clear</button></div>
          ${err("signature")}
        </div>
        ${cta("Continue to payment")}
      </section>`,

    "dn-amount": () => `
      <section class="screen step">${topbar()}
        <h2>Give with Love 💛</h2>
        <p class="hint">${esc(C.donation.impact)}</p>
        ${freqSeg()}
        <div class="tiers">${C.donation.tiers.map((t) => `
          <button class="tier ${S.tier === t.id ? "on" : ""}" data-a="tier" data-v="${t.id}" style="--tier:${t.color};--tier-ink:${t.ink || "#2b2b25"}">
            <span class="tier-name">${esc(t.name)}</span><span class="tier-amt">${money(t.amount)}</span>
            <span class="tier-desc">${esc(t.desc)}</span></button>`).join("")}
        </div>
        <div class="group-title" style="margin-top:6px">Or give any amount</div>
        <div class="chips">
          ${C.donation.quickAmounts.map((a) => `<button class="chip ${!S.tier && S.amount === a ? "on" : ""}" data-a="amount" data-v="${a}">${money(a)}</button>`).join("")}
          <button class="chip ${S.amount === "custom" ? "on" : ""}" data-a="amount" data-v="custom">✏️ Other</button>
        </div>
        ${S.amount === "custom" ? `<div class="card"><div class="field" style="margin:0"><label for="f-custom">Amount (USD)</label>
          <input class="input ${S.errors.amount ? "bad" : ""}" id="f-custom" data-s="customAmount" inputmode="decimal" placeholder="$" value="${esc(S.customAmount)}" autocomplete="off" /></div></div>` : ""}
        ${err("amount")}
        ${C.donation.quote ? `<p class="quote">${esc(C.donation.quote)}</p>` : ""}
        ${cta()}
      </section>`,

    "dn-contact": () => `
      <section class="screen step">${topbar()}
        <h2>Who's the gift from?</h2>
        <p class="hint">So we can thank you and send your tax receipt.</p>
        <div class="card">
          ${field("name", "Full name", 'autocapitalize="words"')}
          <div class="row2">
            ${field("phone", "Phone number", 'type="tel" inputmode="tel"')}
            ${field("email", "Email", 'type="email" inputmode="email" autocapitalize="off" placeholder="For your receipt"', true)}
          </div>
        </div>
        ${cta()}
      </section>`,

    "pay-method": () => {
      const feat = C.payments.filter((p) => p.featured), more = C.payments.filter((p) => !p.featured);
      const t = (p) => `<button class="tile ${S.payment === p.id ? "on" : ""}" data-a="pay" data-v="${p.id}">
        ${p.badge ? `<span class="badge">${esc(p.badge)}</span>` : ""}<span class="em">${p.emoji}</span>${esc(p.label)}${p.sub ? `<span class="sm">${esc(p.sub)}</span>` : ""}</button>`;
      return `<section class="screen step">${topbar()}
        <h2>How would you like to give?</h2>
        <p class="hint">${isGoseva() ? "Cow Seva offering" : "Your gift"}: <b>${money(amountValue())}${perMonth()}</b></p>
        <div class="pay-featured">${feat.map(t).join("")}</div>
        <div class="more-label">More ways to give</div>
        <div class="pay-more">${more.map(t).join("")}</div>
        ${isGoseva() ? `<button class="pay-later ${S.payment === "pledge" ? "on" : ""}" data-a="pay" data-v="pledge">
          ${S.payment === "pledge" ? "✓ " : ""}I'll pledge now and pay later</button>` : ""}
        ${err("payment")}
        ${volunteerNote()}
        ${cta("Continue")}
      </section>`;
    },

    pay: () => {
      const p = pay(S.payment), amt = `${money(amountValue())}${perMonth()}`;
      let box = "";
      if (S.payment === "pledge") {
        box = `<div class="pay-box"><h3>Pledge received</h3><div class="amt">${amt}</div>
          <p class="muted">Our team will reach out with simple ways to complete your offering.</p></div>`;
      } else if (p) {
        const url = methodUrl(p);
        const loading = p.id === "card" && S.checkout?.state === "loading";
        const nothing = !url && !p.handle && !p.atTable && !loading;
        box = `<div class="pay-box"><h3>${p.emoji} ${esc(p.label)}</h3><div class="amt">${amt}</div>
          ${p.tapFirst && p.atTable ? `<div class="tap-first"><div class="tap-ic">💳</div>
              <div><b>${esc(p.atTable)}</b>${p.atTableSub ? `<span>${esc(p.atTableSub)}</span>` : ""}</div></div>
            <div class="or-line"><span>or pay yourself</span></div>` : ""}
          ${loading ? `<div class="qr-wait">Preparing secure checkout…</div>` : ""}
          ${url ? `<div class="pay-split">
              <div><div class="qr" id="qr"></div><div class="cap">Scan with your phone camera</div></div>
              ${p.payHere === false ? "" : `<div class="or">or</div>
              <div><button class="btn" data-a="pay-here">Pay on this device →</button>
                ${p.id === "card" ? `<div class="cap">Card or Apple Pay · ${S.checkout?.state === "ready" ? "secured by Square" : "secure checkout"}</div>` : ""}</div>`}
            </div>` : ""}
          ${p.handle ? `<div class="handle">${esc(p.handle)}</div>${p.holder ? `<div class="cap">${esc(p.holder)}</div>` : ""}` : ""}
          ${p.atTable && !p.tapFirst ? `<div class="at-table">${esc(p.atTable)}</div>` : ""}
          ${nothing ? `<div class="at-table">Please see a volunteer at the table to complete your gift.</div>` : ""}
          ${p.id !== "cash" ? `<div class="cap" style="margin-top:10px">Memo: “${esc(memo())}”</div>` : ""}
        </div>`;
      }
      return `<section class="screen thanks">
        <div class="topbar plain"><button class="back" data-a="back">← Change method</button></div>
        <div class="big">${isGoseva() ? "🐄🌼" : "🐄💛"}</div>
        <h2>Thank you, ${esc(firstName())}!</h2>
        <p>${isGoseva() ? "May Gomata bless you and your family. Cow Seva will be offered on your special days." : "Your love keeps our rescued cows fed, safe and cared for."}</p>
        ${!isGoseva() && tierObj() ? `<div class="pledge-badge">🐄 ${esc(tierObj().name)} – ${esc(tierObj().desc)}${S.freq === "monthly" ? ", every month" : ""}</div>` : ""}
        ${box}
        ${S.payment !== "pledge" ? volunteerNote() : ""}
        <div class="cta-bar narrow"><button class="btn ${S.payment === "card" ? "ghost" : ""}" style="flex:1" data-a="done">Done 🙏</button></div>
      </section>`;
    },

    paid: () => `
      <section class="screen thanks">
        <div class="big">🙏</div>
        <h2>Payment received!</h2>
        <p>Hare Krishna, and thank you. Your gift is already caring for our cows. A receipt is on its way to your email.</p>
        <div class="countdown" id="countdown"></div>
        <div class="cta-bar narrow"><button class="btn" style="flex:1" data-a="reset">Done</button></div>
      </section>`,
  };

  // ── Derived values ──
  function chantText() {
    if (S.chant === "other") return S.chantOther.trim() || "Other";
    if (S.chant == null) return "";
    return `${S.chant} ${S.chant === 1 ? "round" : "rounds"} daily`;
  }
  function amountValue() {
    if (S.amount === "custom") return Number(String(S.customAmount).replace(/[^0-9.]/g, "")) || 0;
    return S.amount || 0;
  }
  const payLabel = () => (S.payment === "pledge" ? "Pledge – pay later" : (pay(S.payment) || {}).label || "");
  const tierObj = () => C.donation.tiers.find((t) => t.id === S.tier);
  const purposeLabel = () => { const t = tierObj(); return t ? `${t.name} – ${t.desc}` : "Any amount"; };
  const filledOccasions = () => S.occasions.filter((o) => o.date);
  const memo = () => `${isGoseva() ? "Goseva" : "Donation"} – ${S.person.name.trim()}`;
  function methodUrl(p) {
    if (p.id === "card") {
      if (S.checkout?.state === "loading") return "";
      if (S.checkout?.state === "ready") return S.checkout.url;
    }
    if (!p.link) return "";
    return p.link.replace("{amount}", encodeURIComponent(amountValue())).replace("{note}", encodeURIComponent(memo()));
  }

  // ── Render ──
  let countdownTimer = null;
  function render() {
    clearInterval(countdownTimer);
    app.innerHTML = SCREENS[S.screen]();
    document.body.dataset.screen = S.screen;
    if (S.screen === "welcome") startMantra(); else stopMantra();
    if (S.screen === "gs-sign") setupSignature();
    if (S.screen === "pay") drawQR();
    if (S.screen === "qc-thanks") startCountdown(20);
    if (S.screen === "paid") startCountdown(12);
    const f = [...app.querySelectorAll("input.input[data-p]")].find((x) => !x.value);
    if (f) setTimeout(() => f.focus(), 350);
  }

  // ── Validation ──
  const emailOk = (e) => /^\S+@\S+\.\S+$/.test(e.trim());
  function validate() {
    const e = {}, p = S.person;
    switch (S.screen) {
      case "qc-name": if (p.name.trim().length < 2) e.name = "Please enter your name"; break;
      case "qc-contact":
        if (digits(p.phone).length < 10) e.phone = "Please enter a valid phone number";
        if (!p.city.trim()) e.city = "Please enter your city";
        break;
      case "gs-contact":
        if (p.name.trim().length < 2) e.name = "Please enter your name";
        if (digits(p.phone).length < 10) e.phone = "Please enter a valid phone number";
        if (!emailOk(p.email)) e.email = "Please enter a valid email for your receipt";
        if (!S.fromConnect && !p.city.trim()) e.city = "Please enter your city";
        break;
      case "dn-contact":
        if (p.name.trim().length < 2) e.name = "Please enter your name";
        if (digits(p.phone).length < 10) e.phone = "Please enter a valid phone number";
        if (p.email.trim() && !emailOk(p.email)) e.email = "That email doesn't look right";
        break;
      case "gs-occasions":
        if (S.occasions.some((o) => o.type !== "self" && o.name.trim() && !o.date)) e.occasions = "Please add a date for each occasion";
        break;
      case "gs-offering": case "dn-amount": if (!(amountValue() > 0)) e.amount = "Please choose an amount"; break;
      case "pay-method": if (!S.payment) e.payment = "Please choose how you'd like to give"; break;
      case "gs-sign": if (!S.signature) e.signature = "Please sign above to confirm your offering"; break;
    }
    S.errors = e;
    if (Object.keys(e).length) { const y = window.scrollY; render(); window.scrollTo(0, y); return false; }
    return true;
  }

  // ── Events ──
  app.addEventListener("click", (ev) => {
    const el = ev.target.closest("[data-a]"); if (!el) return;
    const a = el.dataset.a, v = el.dataset.v;
    switch (a) {
      case "logo": return adminTap();
      case "start": return startFlow(el.dataset.flow);
      case "back": return back();
      case "next": if (validate()) next(); return;
      case "reset": return reset();
      case "done": commit(); return reset();
      case "consent": S.person.consent = !S.person.consent; el.classList.toggle("on", S.person.consent); el.setAttribute("aria-checked", S.person.consent); return;
      case "interest": {
        const id = el.dataset.id, i = S.interests.indexOf(id);
        i >= 0 ? S.interests.splice(i, 1) : S.interests.push(id);
        el.classList.toggle("on", i < 0);
        app.querySelector('[data-a="next"]').textContent = S.interests.length ? `Continue (${S.interests.length} selected)` : "Continue";
        return;
      }
      case "chant": S.chant = v === "other" ? "other" : Number(v); render(); if (v === "other") app.querySelector("#f-chantOther")?.focus(); return;
      case "chant-skip": S.chant = null; S.chantOther = ""; return next();
      case "upsell": S.fromConnect = true; S.amount = null; S.payment = null; return startFlow(el.dataset.flow);
      case "occ-add": S.occasions.push({ type: S.occasions.length === 1 ? "spouse" : "child", name: "", date: "" }); render(); return;
      case "occ-rm": S.occasions.splice(Number(el.dataset.i), 1); render(); return;
      case "freq": S.freq = v; render(); return;
      case "tier": { const t = C.donation.tiers.find((x) => x.id === v); S.tier = v; S.amount = t.amount; S.errors = {}; render(); return; }
      case "amount": S.tier = null; S.amount = v === "custom" ? "custom" : Number(v); S.errors = {}; render(); if (v === "custom") app.querySelector("#f-custom")?.focus(); return;
      case "pay": S.payment = v; S.errors = {}; render(); return;
      case "pay-here": return payHere();
      case "sig-clear": clearSignature(); return;
    }
  });
  app.addEventListener("input", (ev) => {
    const t = ev.target;
    if (t.dataset.p) {
      let val = t.value;
      if (t.dataset.p === "phone") { val = fmtPhone(val); if (val !== t.value) t.value = val; }
      S.person[t.dataset.p] = val;
      if (S.errors[t.dataset.p]) { t.classList.remove("bad"); t.nextElementSibling.textContent = ""; }
    } else if (t.dataset.s) {
      S[t.dataset.s] = t.value;
    } else if (t.dataset.occ != null) {
      S.occasions[Number(t.dataset.occ)][t.dataset.k] = t.value;
    }
  });
  app.addEventListener("change", (ev) => {
    const t = ev.target;
    if (t.dataset.occ != null && t.dataset.k === "type") {
      const o = S.occasions[Number(t.dataset.occ)]; o.type = t.value;
      if (t.value === "self" && !o.name) o.name = S.person.name;
      render();
    }
  });
  app.addEventListener("keydown", (ev) => {
    if (ev.key === "Enter" && ev.target.matches("input.input")) {
      ev.preventDefault();
      const inputs = [...app.querySelectorAll("input.input")], i = inputs.indexOf(ev.target);
      if (i < inputs.length - 1) inputs[i + 1].focus(); else app.querySelector('[data-a="next"]')?.click();
    }
  });

  // ── Finish a flow ──
  function baseRecord() {
    return { personId: S.personId, ts: new Date().toISOString(), event: EVENT, device: DEVICE,
      name: S.person.name.trim(), phone: S.person.phone.trim(), city: S.person.city.trim() };
  }
  function finish() {
    if (S.flow === "connect") {
      enqueue({ type: "connect", id: uid(), ...baseRecord(), consent: S.person.consent,
        interests: S.interests.map((id) => (allInterests.find((x) => x.id === id) || {}).label || id).join(", "),
        chanting: chantText() });
      celebrate(); return go("qc-thanks");
    }
    // Goseva or donation: hold the entry until the person leaves the payment screen,
    // so changing the payment method doesn't create duplicate rows.
    S.entryId = uid();
    const common = { id: S.entryId, ...baseRecord(), email: S.person.email.trim(),
      amount: amountValue(), frequency: S.freq, payment: payLabel() };
    if (isGoseva()) {
      const occ = filledOccasions().map((o) => ({ occasion: (OCC_TYPES.find((x) => x.id === o.type) || {}).label, name: o.name.trim(), date: o.date }));
      S.pending = { type: "goseva", ...common, address: S.person.address.trim(), occasions: occ,
        occasionsText: occ.map((o) => `${o.occasion}${o.name ? " – " + o.name : ""}: ${o.date}`).join("\n"), signature: S.signature };
    } else {
      S.pending = { type: "donation", ...common, purpose: purposeLabel() };
    }
    S.checkout = null;
    if (S.payment === "card") startCheckout();
    celebrate(); go("pay");
  }
  function commit() { if (S.pending) { enqueue(S.pending); S.pending = null; } }
  window.addEventListener("pagehide", commit);

  // ── Card: exact-amount Square checkout via the Apps Script (falls back to config link) ──
  async function startCheckout() {
    const card = pay("card");
    if (!C.sheetEndpoint || !card?.squareCheckout) return;
    S.checkout = { state: "loading" };
    const q = new URLSearchParams({ action: "checkout", amount: amountValue(), ref: S.entryId,
      kind: isGoseva() ? "Goseva & Blessings" : "Donation", name: S.person.name.trim(), email: S.person.email.trim(),
      monthly: S.freq === "monthly" ? "1" : "", back: location.origin + location.pathname + "?paid=1" });
    try {
      const r = await fetch(`${C.sheetEndpoint}?${q}`, { method: "GET" });
      const j = await r.json();
      S.checkout = j.ok && j.url ? { state: "ready", url: j.url } : { state: "fallback" };
    } catch { S.checkout = { state: "fallback" }; }
    if (S.screen === "pay") render();
  }
  function payHere() {
    const p = pay(S.payment), url = p && methodUrl(p);
    if (!url) return;
    commit(); flush();
    setTimeout(() => { location.href = url; }, 250);
  }

  // ── Offline-safe queue → Google Sheet ──
  function enqueue(rec) {
    const log = store.get("gk_log", []);
    const { signature, ...light } = rec;
    log.push({ ...light, signed: !!signature }); store.set("gk_log", log.slice(-2000));
    if (!C.sheetEndpoint) return;
    const q = store.get("gk_queue", []); q.push(rec);
    if (!store.set("gk_queue", q)) { send(rec).catch(() => {}); return; }
    flush();
  }
  const send = (rec) => fetch(C.sheetEndpoint, { method: "POST", mode: "no-cors", keepalive: JSON.stringify(rec).length < 60000,
    headers: { "Content-Type": "text/plain;charset=utf-8" }, body: JSON.stringify(rec) });
  let flushing = false;
  async function flush() {
    if (flushing || !C.sheetEndpoint || !navigator.onLine) return;
    flushing = true;
    try {
      let q = store.get("gk_queue", []);
      while (q.length) {
        await send(q[0]); // server ignores duplicate ids, so retries are safe
        q = store.get("gk_queue", []); q.shift(); store.set("gk_queue", q);
      }
    } catch { /* offline — retry later */ }
    flushing = false;
  }
  window.addEventListener("online", flush);
  setInterval(flush, 30000);

  // ── Signature pad ──
  let sigCtx, sigCanvas;
  function setupSignature() {
    sigCanvas = document.getElementById("sig");
    const r = sigCanvas.getBoundingClientRect(), dpr = window.devicePixelRatio || 1;
    sigCanvas.width = r.width * dpr; sigCanvas.height = r.height * dpr;
    sigCtx = sigCanvas.getContext("2d"); sigCtx.scale(dpr, dpr);
    sigCtx.lineWidth = 3; sigCtx.lineCap = "round"; sigCtx.lineJoin = "round"; sigCtx.strokeStyle = "#2f4420";
    let drawing = false, last = null, dirty = false;
    const pt = (e) => { const b = sigCanvas.getBoundingClientRect(); return { x: e.clientX - b.left, y: e.clientY - b.top }; };
    sigCanvas.addEventListener("pointerdown", (e) => { drawing = true; last = pt(e); sigCanvas.setPointerCapture(e.pointerId); document.getElementById("sig-ph").style.display = "none"; });
    sigCanvas.addEventListener("pointermove", (e) => {
      if (!drawing) return; const p = pt(e);
      sigCtx.beginPath(); sigCtx.moveTo(last.x, last.y); sigCtx.lineTo(p.x, p.y); sigCtx.stroke(); last = p; dirty = true;
    });
    const end = () => { if (drawing && dirty) S.signature = exportSignature(); drawing = false; };
    sigCanvas.addEventListener("pointerup", end); sigCanvas.addEventListener("pointercancel", end);
    if (S.signature) {
      const img = new Image(); img.onload = () => sigCtx.drawImage(img, 0, 0, r.width, r.height);
      img.src = S.signature; document.getElementById("sig-ph").style.display = "none";
    }
  }
  function exportSignature() {
    const out = document.createElement("canvas"), w = 480, h = Math.round(480 * sigCanvas.height / sigCanvas.width);
    out.width = w; out.height = h; const c = out.getContext("2d");
    c.fillStyle = "#fff"; c.fillRect(0, 0, w, h); c.drawImage(sigCanvas, 0, 0, w, h);
    return out.toDataURL("image/png");
  }
  function clearSignature() {
    if (!sigCtx) return; const r = sigCanvas.getBoundingClientRect();
    sigCtx.clearRect(0, 0, r.width, r.height); S.signature = null;
    document.getElementById("sig-ph").style.display = "";
  }

  // ── QR code ──
  function drawQR() {
    const el = document.getElementById("qr"), p = pay(S.payment), url = p && methodUrl(p);
    if (!el || !url) return;
    if (window.QRCode) new QRCode(el, { text: url, width: 400, height: 400, colorDark: "#2f4420", colorLight: "#ffffff", correctLevel: QRCode.CorrectLevel.M });
    else el.innerHTML = `<div style="padding:20px;max-width:200px;word-break:break-all">${esc(url)}</div>`;
  }

  // ── Background photo slideshow ──
  const bg = document.querySelector(".bg-photos");
  const photos = (C.photos || []).map((src, i) => {
    const d = document.createElement("div"); d.className = "bg-photo" + (i === 0 ? " show" : "");
    d.style.backgroundImage = `url("${src}")`; bg.appendChild(d); return d;
  });
  let photoI = 0;
  if (photos.length > 1) setInterval(() => {
    photos[photoI].classList.remove("show"); photoI = (photoI + 1) % photos.length; photos[photoI].classList.add("show");
  }, 7000);

  // ── Welcome mantra ──
  const MANTRA = ["Hare Krishna Hare Krishna, Krishna Krishna Hare Hare", "Hare Rama Hare Rama, Rama Rama Hare Hare"];
  let mantraTimer = null, mantraI = 0;
  function startMantra() {
    stopMantra();
    mantraTimer = setInterval(() => {
      const m = document.getElementById("mantra"); if (!m) return;
      m.style.opacity = 0; setTimeout(() => { mantraI = (mantraI + 1) % 2; m.textContent = MANTRA[mantraI]; m.style.opacity = 1; }, 800);
    }, 4500);
  }
  function stopMantra() { clearInterval(mantraTimer); }

  // ── Petals ──
  const petals = document.querySelector(".petal-field");
  for (let i = 0; i < 14; i++) {
    const p = document.createElement("i"); p.className = "petal" + (i % 3 === 0 ? " pink" : "");
    p.style.left = Math.random() * 100 + "%";
    p.style.animationDuration = 12 + Math.random() * 12 + "s";
    p.style.animationDelay = -Math.random() * 20 + "s";
    petals.appendChild(p);
  }
  function celebrate() { petals.classList.add("celebrate"); setTimeout(() => petals.classList.remove("celebrate"), 4000); }

  // ── Countdown & idle reset ──
  function startCountdown(sec) {
    let n = sec; const el = () => document.getElementById("countdown");
    const tick = () => { if (el()) el().textContent = `Returning to the welcome screen in ${n}s`; if (n-- <= 0) reset(); };
    tick(); countdownTimer = setInterval(tick, 1000);
  }
  let lastTouch = Date.now(), idleModal = false;
  ["pointerdown", "keydown", "input"].forEach((t) => document.addEventListener(t, () => {
    lastTouch = Date.now();
    if ((S.screen === "qc-thanks" || S.screen === "paid") && countdownTimer) {
      clearInterval(countdownTimer); countdownTimer = null; const c = document.getElementById("countdown"); if (c) c.textContent = "";
    }
  }, true));
  setInterval(() => {
    if (S.screen === "welcome" || idleModal || modalRoot.innerHTML) return;
    if (Date.now() - lastTouch > C.idleSeconds * 1000) showIdle();
  }, 1000);
  function showIdle() {
    idleModal = true; let n = 15;
    modalRoot.innerHTML = `<div class="modal-bg"><div class="modal"><div class="ring" id="idle-n">${n}</div>
      <h3>Still there?</h3><p>For privacy, we'll clear this screen soon.</p>
      <button class="btn" id="idle-stay">I'm still here</button></div></div>`;
    const t = setInterval(() => { n--; const e = document.getElementById("idle-n"); if (e) e.textContent = n; if (n <= 0) { clearInterval(t); closeModal(); reset(); } }, 1000);
    document.getElementById("idle-stay").onclick = () => { clearInterval(t); closeModal(); lastTouch = Date.now(); };
  }
  function closeModal() { modalRoot.innerHTML = ""; idleModal = false; }

  function reset() {
    if (S) commit(); // a Goseva/donation entry on the payment screen is saved even if they walk away
    clearInterval(countdownTimer); closeModal();
    document.activeElement?.blur?.();
    S = freshState(); render(); window.scrollTo(0, 0);
  }

  // ── Hidden admin panel (tap logo 5×) ──
  let taps = [];
  function adminTap() {
    const now = Date.now(); taps = taps.filter((t) => now - t < 3000); taps.push(now);
    if (taps.length >= 5) { taps = []; askPin(); }
  }
  function askPin() {
    modalRoot.innerHTML = `<div class="modal-bg"><div class="modal"><h3>Volunteer access</h3><p>Enter PIN</p>
      <input class="input" id="pin" type="password" inputmode="numeric" autocomplete="off" style="text-align:center;letter-spacing:.4em" />
      <div class="err" id="pin-err"></div>
      <button class="btn" id="pin-ok">Open</button><button class="btn ghost" id="pin-x">Cancel</button></div></div>`;
    const pin = document.getElementById("pin"); setTimeout(() => pin.focus(), 50);
    const ok = () => (pin.value === String(C.adminPin) ? adminPanel() : (document.getElementById("pin-err").textContent = "Incorrect PIN"));
    document.getElementById("pin-ok").onclick = ok; pin.onkeydown = (e) => e.key === "Enter" && ok();
    document.getElementById("pin-x").onclick = closeModal;
  }
  function adminPanel() {
    const log = store.get("gk_log", []), q = store.get("gk_queue", []);
    const today = new Date().toDateString(), t = log.filter((r) => new Date(r.ts).toDateString() === today);
    const sum = t.filter((r) => r.type !== "connect").reduce((s, r) => s + (Number(r.amount) || 0), 0);
    modalRoot.innerHTML = `<div class="modal-bg"><div class="modal" style="max-width:480px"><h3>Kiosk admin</h3>
      <div class="admin-mode ${C.sheetEndpoint ? "live" : "demo"}">${C.sheetEndpoint ? "● Connected to Google Sheet" : "● Demo mode: saving on this device only"}</div>
      <div class="admin-stats">
        <div><b>${t.filter((r) => r.type === "connect").length}</b><small>Sign-ups today</small></div>
        <div><b>${t.filter((r) => r.type === "goseva").length}</b><small>Goseva today</small></div>
        <div><b>${t.filter((r) => r.type === "donation").length}</b><small>Donations today</small></div>
        <div><b>${money(sum)}</b><small>Pledged today</small></div>
        <div><b>${q.length}</b><small>Waiting to upload</small></div>
        <div><b>${log.length}</b><small>Saved on device</small></div>
      </div>
      <p style="font-size:13px">Device: ${esc(DEVICE)} · Event tag: ${esc(EVENT)}</p>
      <button class="btn" id="ad-sync">Upload now</button>
      <button class="btn ghost" id="ad-csv" style="width:100%">Download backup (CSV)</button>
      <button class="btn ghost" id="ad-clear" style="width:100%;color:var(--danger)">Clear device backup</button>
      <button class="btn ghost" id="ad-x" style="width:100%">Close</button></div></div>`;
    document.getElementById("ad-sync").onclick = async () => {
      if (!C.sheetEndpoint) return toast("Demo mode: add sheetEndpoint in config.js first");
      await flush(); toast(store.get("gk_queue", []).length ? "Still offline — will retry automatically" : "All entries uploaded ✓"); adminPanel();
    };
    document.getElementById("ad-csv").onclick = () => downloadCSV(log);
    document.getElementById("ad-clear").onclick = () => {
      if (store.get("gk_queue", []).length) return toast("Upload pending entries first");
      if (confirm("Clear the backup copy on this device? Entries already in the Google Sheet are not affected.")) { store.set("gk_log", []); adminPanel(); }
    };
    document.getElementById("ad-x").onclick = closeModal;
  }
  function downloadCSV(rows) {
    const cols = ["type", "ts", "event", "name", "phone", "city", "email", "address", "consent", "interests", "chanting", "occasionsText", "purpose", "amount", "frequency", "payment", "signed", "device", "id", "personId"];
    const cell = (v) => `"${String(v ?? "").replace(/"/g, '""')}"`;
    const csv = [cols.join(","), ...rows.map((r) => cols.map((c) => cell(r[c])).join(","))].join("\n");
    const a = document.createElement("a"); a.href = URL.createObjectURL(new Blob([csv], { type: "text/csv" }));
    a.download = `goloka-kiosk-${new Date().toISOString().slice(0, 10)}.csv`; a.click();
  }
  function toast(msg) { const t = document.getElementById("toast"); t.textContent = msg; t.classList.add("show"); setTimeout(() => t.classList.remove("show"), 2600); }

  if ("serviceWorker" in navigator && location.protocol.startsWith("http")) navigator.serviceWorker.register("sw.js").catch(() => {});

  // ── Start ──
  S = freshState();
  if (params.has("paid")) { // returning from Square checkout
    history.replaceState(null, "", location.pathname + (params.get("event") ? `?event=${encodeURIComponent(params.get("event"))}` : ""));
    S.screen = "paid"; celebrate();
  }
  render(); flush();
})();
