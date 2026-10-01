# HV analytics: how it works, setup, privacy, tests

Status labels: **[VERIFIED]** tested here · **[NOT VERIFIED]** needs the live site · **[MANUAL]** you must do it.

## 1. Architecture of the four products (as audited)

| Product | Where | Stack | Accounts / data |
|---|---|---|---|
| HV World | harshvittori.github.io (repo `harshvittori.github.io`) | Static pages built by `src/site.py`, SPA router (`history.pushState`) | No accounts. Live settings in Firestore `config/site` |
| HV Test | /hv-tests/ (repo `hv-tests`) | Static pages; live test: Maturity Assessment (Personal Growth redirects to it) | No accounts. Optional scorecards in Firestore `scorecards`, anonymous counter `stats` |
| HV Reset | /hv-reset/ (repo `harsh-reset`) | Single page app, plain JS | Google sign-in (Firebase Auth); plan in `users/{uid}/…`; guests keep data on the device |
| HV Vault (web) | /hv-vault-web/ (repo `hv-vault-web`) | React + Vite, deployed by GitHub Actions | Google sign-in; data in IndexedDB, synced to `users/{uid}/…` |
| HV Vault (desktop) | Electron app | Not in these repos | Local data only. **Not instrumented** (see limitations) |

All four share one Firebase project (`harsh-reset`, Spark/free plan) and one script that runs first on every page: `/status.js`.

## 2. Solution chosen and why

**First-party, aggregate-only counters in Firestore** (`/a.js`, loaded by `/status.js`).

- **Already there:** Firebase is already in use. No new vendor, no new bill (free plan).
- **Privacy:**
  - No cookies and no third-party scripts.
  - Nothing is sent that identifies a person: no user ID, email, name, IP location or content.
  - So no consent banner is needed. It is disclosed in the Privacy Policy, section 13, with an opt-out.
- **Fits a static site:** no server needed. Each event is one +1 increment on a daily document.
- **Separate per product:** every document is prefixed with its product (`world_`, `test_`, `reset_`, `vault_`).
- **Not chosen: GA4 / Firebase Analytics / GTM.**
  - They need cookies or device IDs and a consent banner.
  - They would add a third-party tracker, against the stated privacy promise.
  - They overlap with this system.
  - GA4 can be added later if you need ad-platform integrations (see limitations).

### Data model (Firestore collection `analytics`, admin-read only)

| Document | Holds |
|---|---|
| `{product}_d_{YYYY-MM-DD}` | Daily counters (India date) |
| `{product}_w_{YYYY-Www}` | `wau`: devices active this ISO week |
| `{product}_m_{YYYY-MM}` | `mau`: devices active this month |
| `{product}_c_{YYYY-MM-DD}` | First-visit cohort: `n` new devices; `d1`, `d7`, `d14`, `d30` = came back exactly on that day; `r7` / `r30` = came back within 7 / 8–30 days |

Daily counter fields (all integers):

| Field | Meaning |
|---|---|
| `pv` | page views |
| `ss` | sessions |
| `uv` | devices active today |
| `nu` | new devices |
| `ru` | returning devices today |
| `es` | engaged sessions |
| `sec` | visible seconds |
| `err` | script errors |
| `ch_<channel>` | sessions by last-touch channel |
| `ft_<channel>` | new devices by first-touch channel |
| `cmp_<utm_campaign>`, `cnt_<utm_content>` | campaign sessions |
| `dev_`, `br_`, `os_`, `geo_` | device, browser, OS, region (from time zone) |
| `pg_<page>` | page views per page |
| `ev_<event>` | event count |
| `ue_<event>` | devices doing it that day (use for funnels) |
| `fe_<event>` | first time ever on a device |
| `cv_<event>_<channel>` / `cf_<event>_<channel>` | conversions, last / first touch |
| `sd50`, `sd90` | scroll depth (HV World) |
| `imp_<app>` | app-link impressions (HV World) |

Device state lives only in the browser:
- `localStorage hva:<product>`: first-seen day, last active day / week / month, first-touch channel, events seen today.
- `sessionStorage hva:s:<product>`: session; it ends after 30 minutes idle.

## 3. What is tracked

See [EVENTS.md](EVENTS.md) for the full list per product, and [METRICS.md](METRICS.md) for definitions and formulas.

## 4. Dashboards

- **`/admin/analytics/`** (link "Analytics →" in `/admin/`).
  - Admin only: Google sign-in, plus the Firestore rule `isAdmin()`. Any other account sees "Access denied".
  - Tabs: **Ecosystem**, **HV World**, **HV Test**, **HV Reset**, **HV Vault**.
  - Range: 7 / 30 / 90 days. Attribution: last touch / first touch.
- **Per product:**
  - Visitors, sessions, page views, new / returning, engaged rate, engaged time, WAU, MAU, stickiness, errors.
  - Daily chart with hover and a table view.
  - Product funnel, channels (last and first touch), conversions by channel, campaigns, top pages.
  - Retention (D1 / D7 / D14 / D30 + cohort table).
  - Devices, browsers, OS, region, and every event.
- **Product extras:**
  - HV World: product interest (seen → opened, CTR), scroll depth, outbound clicks.
  - HV Test: time to complete, completion and abandonment.
- **Ecosystem tab:**
  - Visitors per product (one line each).
  - Products side by side, with notes on which numbers can't be compared.
  - External channels and campaigns across products.
  - Discovery through HV World.
- **Empty states:** a product with no data says so. No number is ever made up.

## 5. Setup and deployment [MANUAL]

1. **Publish the updated Firestore rules.**
   - Copy `firebase/firestore.rules`, which adds `match /analytics/{doc}`.
   - Paste it into Firebase console → harsh-reset → Firestore → Rules → **Publish**.
   - Until you do this, every analytics write is refused (the pages keep working).
2. **Merge the PRs** in the four repos. GitHub Pages caches for 10 minutes.
3. **Check that it's working:**
   - Open the live home page in a private window, with `?utm_source=linkedin&utm_campaign=test_check`.
   - Within a minute, `/admin/analytics/` → HV World shows 1 visitor, channel LinkedIn, campaign `test_check`.
4. **Your own visits aren't counted.**
   - Devices where you signed in to `/admin/` are skipped (`hvadmin` flag).
   - To test from your own device, add `?hvadebug=1`: it counts and logs to the console.
5. **Optional:** Firebase console → Firestore → Usage. Watch writes stay well under 20,000/day.

## 6. Privacy and security measures

- **Aggregate counters only.**
  - Field names come from fixed vocabularies (events, channels, page slugs).
  - Free text (campaign names) is cut to 32 lowercase `[a-z0-9_]` characters.
- **Never sent:**
  - Names, emails, account IDs.
  - Task titles, notes, job / company details, files.
  - Test answers or scores. The scorecard event is just "scorecard saved".
  - The HV Vault diff logic reads counts only; the job title "Secret Role" in the test never left the page [VERIFIED].
- **Not counted:**
  - Browsers with Do Not Track or Global Privacy Control.
  - Devices that opted out (`/privacy/?hvoptout=1`).
  - Admin devices.
  - Local copies of the site.
- **Rules:**
  - Read: admin only. Delete: nobody.
  - Writes only to valid document names, at most 40 fields per write, at most 900 fields per document [VERIFIED in emulator].
- **Fails safe:** if Firestore is unreachable, every page works normally [VERIFIED].
- **Caps:** 300 documents per page load; errors counted at most 5 per page.
- **India (DPDP Act 2023):** no personal data is processed for analytics, and the processing is disclosed with an opt-out. Review again if you ever add identifiers or ad pixels.

## 7. Tests performed (actual results)

| Test | Result |
|---|---|
| Firestore rules, emulator (incl. 2 new analytics tests) | **21/21 pass** |
| End-to-end, Playwright + emulator (pages served as the live domain): LinkedIn campaign visit → SPA navigation → scroll → app link seen → open HV Test (new tab) → full test through the UI → reload → HV Vault data events → opt-out → admin device → Firestore down → dashboard (admin) → dashboard (non-admin) | **18/18 pass** |
| Duplicates: reload = +1 page view but not a new visitor; each funnel step counted once | pass |
| Attribution: campaign + content recorded; completion credited "from HV World" for last and first touch in HV Test | pass |
| No private content in any request (name, job title, company) | pass |
| HV Reset: page loads, real dashboard button sends `dashboard_view`, no errors | pass |
| HV Vault build (`npm run build`) | pass |
| Live production receipt | **[NOT VERIFIED]**: needs the rules published and the PRs live |

## 8. Limitations and work that needs your input

- **Unique people:** counts are per device per product. One person on phone + laptop = 2. One person using HV Test and HV Reset counts in both. The ecosystem table says so.
- **"Visitors" over a range** = daily unique devices summed (device-days). True unique visitors over 30 days are not available without IDs. WAU and MAU are true uniques for the current week and month.
- **Sign-up vs sign-in:** "signup" = a sign-in where the account had no saved data yet (best available signal without a backend).
- **Spam:** anyone can add +1 counts, as with any client-side analytics. Enforcing App Check later raises the bar.
- **Ad-blockers** that block `firestore.googleapis.com` won't be counted. This usually affects a few percent of visitors.
- **HV Vault desktop** is not instrumented: its code is not in these repos, and data stays local. If you want it, add an **opt-in** setting there that calls the same `:commit` endpoint with product `vault_desktop`. This needs a rules update and the desktop repo.
- **Revenue, ARPU, LTV, ROMI, CPC, CPA:** not shown. There is no monetisation and no ad spend data. Add them only when real cost or revenue exists.
- **GA4 / ad pixels:** not added. If you run paid ads later, you may need a pixel and a consent banner. Update the Privacy Policy first.
