// ─────────────────────────────────────────────────────────────
//  Kiosk settings — edit this file only. No other code changes needed.
// ─────────────────────────────────────────────────────────────
window.KIOSK_CONFIG = {
  org: {
    legalName: "Vedic Preservation Initiative",
    dba: "Goloka Sanctuary",
    nonprofitNote: "A non-profit organization · Maybee, Michigan",
    stat: "7 years · 10+ cows served",
    website: "golokasanctuary.org",
  },

  // Not shown on screen. Saved with each entry so you can tell events apart in the Sheet.
  // Override per event with ?event=Diwali%20Mela in the URL.
  eventName: "Kiosk",

  // Paste the Google Apps Script Web App URL here (see README → Google Sheet setup).
  // Leave empty to run in demo mode: entries are kept on this device only.
  sheetEndpoint: "",

  // PIN for the hidden admin panel (tap the logo 5 times on the welcome screen).
  adminPin: "1008",

  // Seconds of no touching before the kiosk returns to the welcome screen.
  idleSeconds: 90,

  // Background slideshow (photos from golokasanctuary.org). Add or remove files freely.
  photos: ["assets/photos/cow-1.jpg", "assets/photos/cow-2.jpg", "assets/photos/cow-3.jpg", "assets/photos/cow-4.jpg", "assets/photos/cow-5.jpg"],

  // Stay Connected interest tiles. Add, remove or rename freely; labels go to the sheet.
  interests: {
    "Learn & Experience": [
      { id: "kirtan", label: "Kirtan", emoji: "🪘" },
      { id: "gita", label: "Bhagavad Gita", emoji: "📖" },
      { id: "bhagavatam", label: "Srimad Bhagavatam", emoji: "🪷" },
      { id: "japa", label: "Japa / Chanting", emoji: "📿" },
      { id: "visit", label: "Visit the Sanctuary", emoji: "🌾" },
      { id: "festivals", label: "Festivals & Events", emoji: "🎉" },
    ],
    "Serve": [
      { id: "goseva", label: "Go Seva (cow care)", emoji: "🐄" },
      { id: "cooking", label: "Cooking / Prasadam", emoji: "🍲" },
      { id: "volunteer", label: "Volunteer Services", emoji: "🙌" },
      { id: "sponsor", label: "Sponsor a Cow", emoji: "💛" },
    ],
  },

  // Daily chanting pledge options (Stay Connected only).
  chantingOptions: [1, 2, 4, 16],

  // Goseva & Blessings suggested offering tiles.
  offerings: [
    { amount: 51, note: "" },
    { amount: 108, note: "Auspicious number" },
    { amount: 251, note: "" },
    { amount: 501, note: "" },
  ],

  // "Give with Love" donation screen.
  donation: {
    amounts: [25, 51, 108, 251, 501],
    purposes: [
      { id: "general", label: "Where most needed", emoji: "🙏" },
      { id: "feed", label: "Feed & nourishment", emoji: "🌾" },
      { id: "medical", label: "Medical care", emoji: "🩺" },
      { id: "sponsor", label: "Sponsor a cow", emoji: "🐄" },
    ],
  },

  // Shown on the payment screens.
  volunteerNote: "Prefer some help? A volunteer at the table can take your card or cash, or set up a monthly or one-time gift with you.",

  // Payment methods. `featured: true` = the three big options.
  //   link   → shown as a QR code + "Pay on this device" button. May contain {amount} and {note}.
  //   handle → shown as large text (Zelle email, @venmo, $cashtag).
  //   atTable→ instruction for paying in person.
  // Card: if Square is set up in Apps Script (README → Square), an exact-amount Square checkout
  // is created for each person. Otherwise the `link` below (your Donorbox page) is used.
  payments: [
    { id: "card", label: "Credit / Debit Card", sub: "Apple Pay too · secure", emoji: "💳", featured: true, badge: "Recommended",
      squareCheckout: true,
      link: "https://donorbox.org/goloka-eco-farm?amount={amount}",
      atTable: "Or tap your card with a volunteer at the table." },
    { id: "zelle", label: "Zelle", sub: "From your bank app", emoji: "🏦", featured: true,
      handle: "donate@vedicpi.org", holder: "Vedic Preservation Initiative", payHere: false, // Zelle is paid from the donor's own bank app
      link: "https://enroll.zellepay.com/qr-codes?data=ewogICAgInRva2VuIjogImRvbmF0ZUB2ZWRpY3BpLm9yZyIsCiAgICAibmFtZSI6ICJWRURJQyBQUkVTRVJWQVRJT04gSU5JVElBVElWRSIsCiAgICAiYWN0aW9uIjogInBheW1lbnQiCn0=" },
    { id: "cash", label: "Cash", sub: "At the table", emoji: "💵", featured: true,
      atTable: "Please hand your offering to a volunteer at the table. Ask for a receipt envelope." },
    { id: "paypal", label: "PayPal", emoji: "🅿️",
      link: "https://www.paypal.com/qrcodes/managed/7b6ceca2-dae4-4a62-aebb-89010d6760dc?utm_source=hawk_quick_link" },
    { id: "venmo", label: "Venmo", emoji: "🔵",
      link: "https://venmo.com/goloka?txn=pay&amount={amount}&note={note}", handle: "@goloka" },
    { id: "cashapp", label: "Cash App", emoji: "💲",
      link: "https://cash.app/$golokacows/{amount}", handle: "$golokacows" },
  ],
};
