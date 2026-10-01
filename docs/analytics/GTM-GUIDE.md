# GTM measurement guide

## 1. UTM convention (use it for every link you share)

`https://harshvittori.github.io/<page>?utm_source=<source>&utm_medium=<medium>&utm_campaign=<campaign>&utm_content=<content>`

Use lowercase, words joined by `_`, no spaces.

| Param | Allowed values | Example |
|---|---|---|
| `utm_source` | `linkedin`, `instagram`, `youtube`, `whatsapp`, `x`, `facebook`, `email`, `college_<name>`, `friend` | `linkedin` |
| `utm_medium` | `social` (organic post), `dm`, `community` (groups/clubs), `email`, `referral`, `video`, `paid` | `social` |
| `utm_campaign` | `<yyyymm>_<goal>_<product>` | `202610_launch_test` |
| `utm_content` | the specific post / creative | `reel1`, `post_carousel2`, `bio_link` |
| `utm_term` | optional: audience or keyword | `final_year` |

Channel mapping in the dashboard:
- **Medium decides first:** `email` → Email, `community` → Communities, `referral` → Referral, `paid` → Paid.
- **Otherwise source decides:** `linkedin`, `instagram`, `youtube`, `whatsapp`, `facebook`, `x`.
- **Anything else** → "Other campaigns".

Links without UTM are classified from the referrer:
- Search engines, AI assistants, GitHub, other websites.
- "Direct" when there is no referrer (WhatsApp and Instagram apps often hide it, so always tag those links).

**Link log** (keep in a sheet):

| Date | Product | Channel | Campaign | Content | Full URL | Posted where |
|---|---|---|---|---|---|---|

## 2. Launch measurement framework (one row per campaign)

| Field | Fill in |
|---|---|
| Objective | e.g. 100 completed HV Tests in 14 days |
| Target audience | e.g. final-year students + freshers job hunting in India |
| Positioning / message | e.g. "Know your strengths in 10 minutes, free" |
| Channels | LinkedIn post, college WhatsApp groups, Instagram reel |
| Campaign names | `202610_launch_test` |
| UTM links | from the link log |
| Hypothesis | "Students from community groups complete more often than LinkedIn visitors" |
| Success metric | completion rate per channel (dashboard → HV Test → Conversions by channel) |
| Result | numbers + date range |
| Learning | what you now believe |
| Next action | what you'll change |

## 3. Experiment log

| # | Date | Product | What I changed | Why (hypothesis) | Metric | Before | After | Sample (devices) | Result | Learning | Next |
|---|---|---|---|---|---|---|---|---|---|---|---|

Rules:
- One change at a time.
- Run a test for at least 7 days or 100 visitors.
- Compare the same weekdays.
- With fewer than ~30 conversions per side, call it "directional", not proven.
- Channel differences show **association**. Only a controlled split (same audience, one change) suggests cause.

## 4. Experiments worth running (fit to each product)

**HV World**
1. Hero CTA wording: "Take the free test" vs "Explore the apps". Metric: `open_app` CTR.
2. Order of products on the home page. Metric: `imp_x → open_x` CTR per app.
3. Watch film on the home page vs only on /watch/. Metric: `video_play`, then `open_app`.

**HV Test**
1. LinkedIn post with a sample scorecard image vs plain text. Metric: test_start per session by `utm_content`.
2. "10 minutes" vs "28 questions" in the landing copy. Metric: `test_intro → test_start`.
3. Community groups vs LinkedIn. Metric: completion rate and scorecard rate per channel.

**HV Reset**
1. Prompt "Plan your day in one sentence with HV AI" vs the manual planner first. Metric: `plan_saved` per visitor, `activation`.
2. Share a Reset screenshot routine on Instagram vs LinkedIn. Metric: D7 retention of each cohort's first-touch channel.

**HV Vault**
1. "Paste a LinkedIn job, AI fills it" demo reel vs a feature list post. Metric: `first_job` rate of new visitors.
2. Placement-cell / student community partnership link. Metric: sign-ups and `stage_applied` per visitor.

## 5. How to read the dashboard to decide

- **Weekly, Monday:**
  1. Ecosystem tab: which product grew, and from which channel.
  2. Each product's funnel: find the biggest drop. That's the next thing to fix.
  3. Conversions by channel: put more effort into channels with high conversion per session, not just high traffic.
  4. Retention: are D1 and D7 improving for newer cohorts?
- **After each post:**
  1. Campaigns card: sessions for that `utm_campaign`.
  2. Content performance: same campaign, different `utm_content`.

## 6. Launch measurement checklist

**All products**
- [ ] Firestore rules with `analytics` published
- [ ] PRs merged and live (wait 10 min for the cache)
- [ ] Private-window visit with a test UTM shows up in `/admin/analytics/`
- [ ] Every shared link is UTM-tagged and in the link log
- [ ] Daily check of errors (`err`) during launch week

**HV World**
- [ ] home → product page → "open app" clicks appear (`open_*`)
- [ ] video_play counts on /watch/

**HV Test**
- [ ] One full test run shows the funnel intro → start → complete → results
- [ ] Scorecard save shows `scorecard`

**HV Reset**
- [ ] Sign-in shows `signin_start` and `sign_in` / `signup`
- [ ] Saving a plan and completing a task show `plan_saved` and `activation`

**HV Vault (web)**
- [ ] Adding a job shows `job_added` and `first_job`; moving it to Applied shows `stage_applied`
- [ ] Desktop app: not tracked (decide later)
