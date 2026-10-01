# Metric dictionary

Notation:
- `Σ` = sum over the selected days.
- Daily documents use the India date.
- "Device" = one browser on one device, for one product.

| Metric | What it measures | Formula | Needs | Period | Limits |
|---|---|---|---|---|---|
| **Visitors** | Active devices | Σ `uv` | auto | daily, summed | Summed daily uniques (device-days), not unique people over the range |
| **Sessions** | Visits | Σ `ss` | auto | range | 30-min idle timeout, per product |
| **New users** | First visits | Σ `nu` | auto | range | A cleared browser or a new device counts as new |
| **Returning** | Repeat activity | Σ `ru` | auto | range | Device-days |
| **Page views** | Pages seen | Σ `pv` | auto | range | SPA navigations included |
| **Traffic source distribution** | Where sessions come from | `ch_x ÷ Σ ch_*` | auto | range | Last touch per session; referrers can be hidden by some apps (shows as Direct) |
| **New-user source** | What first brought devices | `ft_x ÷ Σ ft_*` | auto | range | First touch per product |
| **Campaign traffic** | Sessions from a campaign | Σ `cmp_<name>` | UTM links | range | Only if links carry `utm_campaign` |
| **Engaged session rate** | Real visits | Σ `es` ÷ Σ `ss` | auto | range | 10 s visible, 2+ pages, or any action |
| **Avg engaged time** | Attention | Σ `sec` ÷ Σ `ss` | auto | range | Visible time only, capped per tick |
| **DAU** | Daily actives | `uv` that day | auto | day | Per device |
| **WAU / MAU** | Weekly / monthly actives | `wau` / `mau` of that week / month | auto | ISO week / month | True uniques per device, current period only |
| **Stickiness** | Habit | avg DAU ÷ MAU | auto | month | Meaningful only with 20+ MAU |
| **Sessions per active user** | Frequency | Σ `ss` ÷ Σ `uv` | auto | range | Per device-day |
| **Visitor → sign-up rate** | Account creation (Reset, Vault) | Σ `ue_signup` ÷ Σ `uv` | sign-in events | range | `signup` = account had no data yet |
| **Sign-up → activation** | First value | Σ `fe_activation` ÷ Σ `ev_signup` | events | range | Activation: Reset = first task done; Vault = first job added; Test = `test_complete` |
| **Landing → test start** (Test) | Intent | Σ `ue_test_start` ÷ Σ `uv` | Test events | range | |
| **Test completion rate** | Finishing | Σ `ue_test_complete` ÷ Σ `ue_test_start` | Test events | range | Same-day completions |
| **Abandonment** | Drop-off | 1 − completion; stage: `progress_25 / 50 / 75` | Test events | range | |
| **Completion → results / scorecard** | Value seen | `ue_results_view` ÷ `ue_test_complete`; `ue_scorecard` ÷ `ue_results_view` | Test events | range | |
| **Time to complete** | Effort | Distribution of `time_*` buckets | Test events | range | Buckets, not exact times |
| **Feature adoption** | Use of a feature | `ue_<feature>` ÷ Σ `uv` | events | range | Device-days |
| **Funnel completion / drop-off** | Steps | step N ÷ step 1; 1 − (step N ÷ step N−1) | events | range | Steps counted per device per day (cross-day journeys show as separate steps) |
| **Time to first meaningful action** | Speed to value | Not measured exactly | — | — | Approximation: share of new devices with `fe_activation` on day 0 vs later cohorts |
| **D1 / D7 / D14 / D30 retention** | Coming back | cohort `dN` ÷ cohort `n` (only cohorts at least N days old) | auto | cohort | "Exactly day N". `r7` / `r30` give "within" windows. Small cohorts are noisy |
| **Product discovery CTR** (World) | Interest in an app | Σ `ev_open_<app>` ÷ Σ `imp_<app>` | auto | range | Impressions = links ≥ 60% visible |
| **Sessions from HV World** | Ecosystem cross-traffic | app's Σ `ch_from_world` | auto | range | Same browser only |
| **Channel conversion** | Channel quality | `cv_<event>_<ch>` ÷ `ch_<ch>` | auto | range | Last touch; first-touch version uses `cf_` and `ft_` |
| **Referral performance** | Friends / partners | `ch_referral` + campaigns with `utm_medium=referral` | UTM | range | Website referrals are grouped as "Other websites" |
| **Errors** | Stability | Σ `err` (÷ Σ `pv` for rate) | auto | range | Counts only, no stack traces |
| **CPC, CPA, ROI, ROMI, revenue, ARPU, LTV** | Paid / business | — | cost or revenue data | — | **Not available**: no ads and no monetisation. Don't report zeros |

**Comparability:** "activation" and "sign-up" mean different things per product. Never add product rows to get "total users".
