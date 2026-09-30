# HV World security audit — 30 Sep 2026

Scope: the four GitHub Pages sites (harshvittori.github.io, hv-tests, harsh-reset, hv-vault-web) and the
Firebase project `harsh-reset` they share.

Status labels used below:
- **[VERIFIED]**: implemented and checked with a test or a browser run.
- **[NOT VERIFIED]**: implemented, but it can only be checked on the live site or project.
- **[MANUAL]**: needs a change in the Firebase console, Google Cloud or GitHub settings.
- **[FUTURE]**: recommended for a later phase.

## How the system actually works (what was audited)

| Part | What exists |
|---|---|
| Hosting | GitHub Pages, static files only. No server code, no Cloud Functions, no Firebase Storage. |
| Auth | Firebase Auth, **Google sign-in only**, popup. No email/password, no registration form, no password reset. |
| Database | Firestore via REST, from the browser. Paths: `users/{uid}/…` (HV Vault, HV Reset, HV AI history, the cross-app inbox), `scorecards/{id}` (HV Test), `stats/{key}` (HV Test anonymous counter), `config/site` (HV World live settings), and legacy `reset/{id}` (the old Reset sync from before accounts). |
| Admin | One Firebase account ID, checked inside the Firestore rules (`isAdmin()`). Admin pages: `/admin/` (HV World) and `/hv-tests/admin/`. |
| AI | Firebase AI Logic (Gemini), protected by App Check (reCAPTCHA Enterprise, restricted to harshvittori.github.io). |
| Public config | The Firebase web `apiKey`, `appId` and the reCAPTCHA site key are in the pages. These are public client identifiers by design, not secrets. |

## 1. Existing vulnerabilities identified

| # | Severity | Finding |
|---|---|---|
| V1 | **High** | `reset/{syncId}` allowed **anyone, signed in or not, to create or overwrite** any document with a 32+ character ID, up to 500 KB each. No code writes there any more, so it was only an abuse and cost risk: free storage for anyone, and overwriting old sync data. |
| V2 | **Medium** | The owner's old plan (`reset/ffe5a55d…`) was **readable by anyone**, because its ID is in the public page code. |
| V3 | Low | `config/{doc}` allowed reading any config document, not just `site`. |
| V4 | Low | Admin pages could be framed by another site (clickjacking). GitHub Pages can't send `X-Frame-Options` or CSP headers. |
| V5 | Low | Firestore does not enforce App Check, so the database accepts REST calls from scripts outside the site. Data is still protected by the rules. |
| V6 | Info | `esc()` in HV AI and HV Reset did not escape `'`. No exploitable use: every attribute uses double quotes. Hardened anyway. |
| V7 | Info | Dev-only advisories in `vite`/`esbuild`: they affect the local dev server only, not the built site. Production dependencies: **0 vulnerabilities** (`npm audit --omit=dev`). |
| V8 | Info | The workflow gave `pages: write` and `id-token: write` to the build job too. |

Checked and found **fine**:
- `users/{uid}` is owner-only.
- Scorecards are validated field by field and can't be edited after creation.
- The stats counter can only go up by +1.
- `config/site` is admin-only for writes.
- Everything else is closed by default.
- HTML rendering in HV Reset, the Reset dashboard, HV AI and HV Test verify escapes user and AI text.
- No `dangerouslySetInnerHTML` in HV Vault.

**No real secrets found.**
- A full git-history scan of all four repos looked for private keys, service-account JSON, GitHub, OpenAI, OpenRouter and AWS tokens, and `.env` files.
- The only key found is the public Firebase web key.
- **No rotation needed.**

## 2. Security issues fixed

- V1, V2, V3: **new Firestore rules**: `firebase/firestore.rules` [VERIFIED in the emulator] [MANUAL: publish in the console, see section 10].
- V4: frame-busting plus `object-src 'none'; base-uri 'self'` and a strict referrer policy on both admin pages [VERIFIED in the browser].
- V6: `esc()` now escapes `'` too [VERIFIED: build passes, Reset loads with no errors].
- V8: least-privilege workflow [NOT VERIFIED: runs on the next push to main].

## 3. New security controls

- An emulator test suite for the rules: `firebase/test/rules.test.mjs`, 19 tests [VERIFIED].
- Dependabot for npm and GitHub Actions: `hv-vault-web`, and Actions for `hv-tests` [NOT VERIFIED: GitHub starts it after merge].

## 4. Firebase Authentication changes

- No changes to sign-in. Google sign-in is unchanged.
- Password, email-verification and reset-flow items don't apply: they don't exist.
- The HV Reset legacy read now sends the signed-in user's ID token, so the admin can still open the old plan under the new rules [NOT VERIFIED on live: it needs a real Google sign-in].
  - It is only used on the owner's first sign-in in a new browser.
  - If it fails, it is skipped; the account copy in `users/{uid}` already has the plan.

## 5. Firestore and Storage rules changes

| Path | Before | After |
|---|---|---|
| `users/{uid}/**` | owner only | unchanged |
| `reset/{id}` | anyone reads or writes (32+ character ID) | **get only** by ID (no listing), **no writes**; the owner's old plan: **admin only** |
| `scorecards/{id}` | validated create, public get, admin list/delete | unchanged |
| `stats/{key}` | +1 only, admin read | unchanged |
| `config/{doc}` | read all docs, admin writes `site` | **get `site` only**, no listing; admin writes `site` (unchanged) |
| anything else | denied | denied |

Storage: not used, so nothing to secure.

## 6. Admin and role changes

- Admin stays a single account ID checked in the rules. Tests show a custom claim (`admin: true`), a role field in your own data, or an email can't gain admin [VERIFIED].
- Admin pages now can't run inside another site's frame [VERIFIED].

## 7. GitHub and deployment changes

- `hv-vault-web/.github/workflows/pages.yml`: the build job gets `contents: read` only; `pages`/`id-token` only in the deploy job.
- `.github/dependabot.yml` added in hv-vault-web and hv-tests.
- `hv-tests` workflow: it needs `contents: write` (commits `tests.json`) and `pages: write` (requests a rebuild). Left as is.
- GitHub secret scanning via the API: not available ("GitHub Advanced Security not enabled"). The local history scan was done instead.

## 8. Backend and App Check

- No backend exists.
- **Since 30 Sep, every part of the site that talks to Firestore sends an App Check token:**
  - HV Vault and HV Reset (HVCloud).
  - HV Test scorecards and the HV Test admin (HVScorecard).
  - HV World admin page (new).
  - `status.js` on every page (new).
  - The HV Reset legacy read (new).
- **How `status.js` behaves:**
  - It first sends a token saved from an earlier page, if it has one.
  - Only when Firestore refuses the request does it get a token and retry.
  - It reuses the page's own Firebase (HV Vault, HV Reset, HV Test) and never loads a second copy.
  - It loads App Check itself only on pages with no Firebase at all.
  - Before enforcement nothing changes: no extra scripts, no token.
- Browser test with a stand-in Firebase and Firestore, pages served under the live domain: 16/16 checks pass, both before and after enforcement [VERIFIED with stand-ins].
  - Real reCAPTCHA tokens only work on the live domain, so the real flow is [NOT VERIFIED] until it runs there.
- **Turning on enforcement** [MANUAL]:
  1. Wait until these changes are live, plus 1–2 days.
  2. Firebase console → App Check → APIs → Cloud Firestore: check the request metrics.
     - "Verified" should be most of the traffic.
     - "Unverified: invalid requests" should be about 0.
     - "Outdated client" requests are the first `status.js` call on each page before it has a token; they are expected.
  3. Click **Enforce**. It takes effect within about 15 minutes.
  4. Check HV World maintenance/banner, HV Vault sync, HV Reset, an HV Test scorecard and verify page, and both admin pages.
  5. If anything breaks: App Check → Cloud Firestore → **Unenforce**.
- **Limits:**
  - After enforcement, a visitor whose browser blocks reCAPTCHA (some ad blockers or privacy settings) can't reach Firestore. For them, sync, scorecards and live settings stop working; the rest of the site still works.
  - reCAPTCHA Enterprise has a free monthly quota (10,000 assessments at the time of writing). Tokens are cached for about an hour per browser. Watch usage in Google Cloud → Security → reCAPTCHA.

## 9. Tests performed (actual results)

| Test | Result |
|---|---|
| Firestore rules, emulator: 19 tests | **19/19 pass**. They cover owner vs. other users, signed-out users, deletes, protected fields, bad types, admin claims, listing, unknown collections, REST with another user's token or a garbage token, and valid app writes (Vault/Reset sync, cross-app inbox, scorecard, +1 counter, admin config publish). |
| The same tests against the **current live rules** | 14/17 pass. The 3 failures are exactly V1, V2 and V3, which shows the tests catch them. |
| HV Vault `npm run build` | pass |
| `npm audit --omit=dev` | 0 vulnerabilities |
| Admin pages loaded directly (Playwright) | shown, no script errors |
| Admin pages framed by another origin | page hidden (`display: none`) |
| HV Reset page load after the changes (clock set to after launch) | loads, no page errors |
| Git history secret scan (4 repos, all commits) | only the public Firebase web key |
| Scorecard consistency rules: 300 simulated real results (same maths as the test, including edge cases and the timing adjustment) | **all accepted** |
| Scorecard consistency rules: 16 kinds of made-up or inconsistent record | **all refused** |
| Real Maturity Assessment page (Playwright, clicked through like a user), real `scorecard.js` save, emulator | **18/18 scorecards issued** |

Not tested here: Google's token-signature checks (Firebase does these on the live project), and a live Google sign-in.

## 10. Manual Firebase / Google Cloud / GitHub steps

1. **Publish the new rules** [MANUAL]:
   - Firebase console → harsh-reset → Firestore → Rules → paste `firebase/firestore.rules` → Publish.
   - Then check Vault sync, Reset sign-in, an HV Test scorecard and the admin page.
   - Roll back from the rules history if anything is off.
2. **API key restrictions** [MANUAL]:
   - Google Cloud → APIs & Services → Credentials → the "Browser key" → Application restrictions: websites `https://harshvittori.github.io/*` and `https://harsh-reset.firebaseapp.com/*`.
   - Keep the API list to the Firebase APIs in use (Identity Toolkit, Token Service, Firestore, Firebase AI Logic, App Check, reCAPTCHA Enterprise).
3. **Authorized domains** [MANUAL]:
   - Firebase → Authentication → Settings.
   - Keep only `harshvittori.github.io`, `harsh-reset.firebaseapp.com` and `localhost`.
4. **Admin account** [MANUAL]:
   - Turn on 2-Step Verification for the admin Google account.
   - That is where MFA applies with Google sign-in.
5. **Budget alert** [MANUAL]: Google Cloud Billing → Budgets & alerts (e.g. ₹500/month) for early warning on abuse.
6. **GitHub** [MANUAL], for each repo:
   - Settings → Code security → enable Dependabot alerts and secret scanning / push protection (free for public repos).
   - Settings → Rules → protect `main`: block force pushes and deletion.

## 11. Remaining risks and limits

- HV Test scores are calculated in the browser.
  - **Since 30 Sep:** the rules also check that a scorecard is consistent with what the Maturity Assessment really produces:
    - Exact test, 28–30 questions, all answered.
    - The level matches the score.
    - The 10 dimensions are in order, each 0–10.
    - The overall score is in line with the dimensions.
    - Valid strengths and focus areas, with no overlap.
  - Random or inconsistent fake records are refused.
  - A carefully built consistent fake is still possible. Full protection needs server-side scoring (Cloud Function, Blaze plan).
  - These are self-assessments, so honest answers can't be enforced by any system.
- The stats counter can be inflated with repeated +1 calls. It is admin-only, anonymous and low impact.
- Without Firestore App Check enforcement, the rules are the only barrier. They are tested.
- `users/{uid}` documents are owner-only but not shape-validated. A user can only fill their own space, up to Firestore's 1 MB per-document limit.
- No HTTP security headers are possible on GitHub Pages. The meta and JS equivalents cover the admin pages only.
- Backups: Firestore point-in-time recovery or scheduled backups need the Blaze plan. None are set up now.

## 12. Required user actions

- **Publish the rules** (step 10.1). The fixes for V1, V2 and V3 are not live until then.
- **Credentials:** no rotation needed. No secret was exposed.
- **Admin account:** enable 2-Step Verification on it.

## 13. Ongoing maintenance

- Review Dependabot PRs weekly.
- Run `firebase/test` before every rules change.
- Look at App Check and Firestore usage monthly.
- [FUTURE]:
  - App Check in `status.js`, the admin page and Reset, then enforce on Firestore.
  - Commit `package-lock.json` and switch the workflow to `npm ci`.
  - Upgrade Vite to a patched major version.
  - Consider backups on Blaze.
