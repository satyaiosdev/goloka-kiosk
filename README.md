# Goloka Sanctuary — Sign-up, Blessings & Donation Kiosk

A touch-friendly web app for the event table (iPad) that also works on visitors' phones through a QR code.
Vedic Preservation Initiative · Goloka Sanctuary (DBA)

**Three entries on the welcome screen**, over a slideshow of the sanctuary's cows:

* 🪷 **Stay Connected**: name → phone & city (+ text/WhatsApp opt-in) → interests → daily chanting pledge.
* 🌼 **Goseva & Blessings**: the paper *Blessings & Goseva Form* as steps: details → special occasions → offering (one-time/monthly) → signature → **payment**.
* 💛 **Give with Love**: quick donation: toward (most needed / feed / medical / sponsor a cow) → amount (one-time/monthly) → name & phone → **payment**.

Both Goseva and Give with Love lead to the same payment step. **Card is shown first** (Recommended), then Zelle and Cash. Venmo, PayPal and Cash App are under "More ways to give", and a note invites people to ask a volunteer for help.

On the payment screen each method shows:

| Method | What the visitor sees |
|---|---|
| Card / Apple Pay | QR code + "Pay on this device" → **Square checkout for the exact amount** (once Square is set up), otherwise your Donorbox page. Plus "or tap your card with a volunteer". |
| Zelle | Official Zelle QR + **donate@vedicpi.org** (Vedic Preservation Initiative) |
| Cash | "Please hand your offering to a volunteer" |
| PayPal | Your PayPal QR link |
| Venmo / Cash App | QR (amount pre-filled) + **@goloka** / **$golokacows** |

Entries go to a **Google Sheet** (tabs `Sign-ups`, `Goseva`, `Donations`, `Occasions`, `Card Checkouts`). Signatures are saved as images in your Google Drive. The kiosk keeps working when Wi-Fi drops and returns to the welcome screen after 90 seconds without a touch.

---

## 1. Settings: `config.js`

| Setting | What to put |
|---|---|
| `sheetEndpoint` | Apps Script URL from step 2. Empty = demo mode (entries stay on the device). |
| `payments[]` | Card fallback (Donorbox), Zelle, PayPal, Venmo (@goloka) and Cash App ($golokacows) are filled in. `link` may use `{amount}` and `{note}`. |
| `volunteerNote` | The "Prefer some help?…" line on the payment screens. |
| `offerings`, `donation` | Suggested amounts and "Toward" options. |
| `interests` | Stay Connected tiles. |
| `photos` | Background slideshow (in `assets/photos/`, taken from golokasanctuary.org). |
| `adminPin` | **Change it from 1008.** |
| `eventName` | Not shown on screen; saved with each entry. Per event, add `?event=Diwali%20Mela` to the URL. |

## 2. Connect the Google Sheet (about 5 min, under your Google account)

1. Create a Google Sheet, e.g. *Goloka Kiosk*.
2. **Extensions → Apps Script**, replace the sample code with all of `apps-script/Code.gs`, and save.
3. **Deploy → New deployment** → **Web app** · Execute as **Me** · Who has access **Anyone**.
4. Authorize (Sheets, plus Drive for signature images, plus external requests for Square).
5. Copy the `/exec` URL into `config.js → sheetEndpoint`. Opening it in a browser should show `{"ok":true,...}`.

After editing `Code.gs`: **Deploy → Manage deployments → Edit → Version: New version** (the URL stays the same).

## 3. Square card payments (optional, recommended)

Without this step, the Card button uses your Donorbox page (the visitor types the amount there). With it, every person gets a **Square checkout for their exact amount**, and comes back to a "Payment received!" screen.

1. Sign in at **developer.squareup.com** with your Square account → **Create an app** (any name, e.g. *Goloka Kiosk*).
2. Switch to **Production** → **Credentials** → copy the **Production Access token**.
3. **Locations** (left menu) → copy your **Location ID**.
4. In Apps Script: ⚙️ **Project Settings → Script Properties → Add**:
   * `SQUARE_ACCESS_TOKEN` = the token
   * `SQUARE_LOCATION_ID` = the location ID
   * `SQUARE_ENV` = `production`
   * `KIOSK_URL` = your kiosk address from step 4 (e.g. `https://yourname.github.io/goloka-kiosk/`)
5. Deploy a new version (see above).

> 🔒 The token lives only in your Apps Script settings. Never put it in `config.js`, the repo, or a chat.
> Test first with `SQUARE_ENV` = `sandbox` and the **Sandbox** token and location if you like.

Matching payments: each checkout is logged in the **Card Checkouts** tab with its Square order ID. Mark "Payment received?" in the Goseva / Donations tabs as payments come in.
Monthly gifts by card take the first month through Square. A volunteer then sets up the recurring gift (or point monthly donors to Donorbox, which supports recurring).

## 4. Host it (free) on GitHub Pages

```bash
cd ~/Documents/Claude/goloka-sankirtan-kiosk
git init && git add . && git commit -m "Goloka kiosk"
gh repo create goloka-kiosk --public --source=. --push
gh api -X POST repos/{owner}/goloka-kiosk/pages -f "source[branch]=main" -f "source[path]=/"
```

The site is at `https://<your-github-username>.github.io/goloka-kiosk/` about a minute later.
After any change, bump `VERSION` in `sw.js` so the iPads pick up the update.

## 5. Set up the iPad

1. Safari → open the site → Share → **Add to Home Screen**. Launch from the icon (full screen).
2. Settings → Display & Brightness → Auto-Lock → **Never** (keep it plugged in).
3. Settings → Safari → AutoFill → turn **off** Credit Cards and Contact Info, so one donor's details are never offered to the next.
4. Settings → Accessibility → **Guided Access** → On. Open the kiosk and triple-click the side button to lock it.
5. Print a QR code of the site URL for the table, so people in line can use their own phones.

## 6. At the event: admin panel

Tap the **logo 5 times** → PIN. It shows today's sign-ups, Goseva, donations and total pledged, plus entries waiting to upload. You can also **Upload now** and **Download backup (CSV)**.

## Testing locally

```bash
cd ~/Documents/Claude/goloka-sankirtan-kiosk && python3 -m http.server 8765
```

## Ideas for later

* Weekly email listing upcoming birthdays and anniversaries from the `Occasions` tab, so Go Puja is scheduled on time.
* Square webhook to mark "Payment received?" automatically.
* Automatic thank-you text or email after a gift.
