# Events by product

Every event adds to `ev_<name>` (count) and `ue_<name>` (devices doing it that day). Events marked **(first)** also add to `fe_<name>` the first time ever on a device.

Events marked **conv** are conversions. They are also split by channel:
- `cv_<name>_<channel>`: last touch.
- `cf_<name>_<channel>`: first touch.

## Automatic (all products, from `/a.js`)

| Event / field | When |
|---|---|
| page view `pv`, `pg_<page>` | Each page load and each SPA navigation (`pushState` / `popstate`). Hash and query changes alone don't count |
| session `ss` | First page after 30 min idle. Records channel, device, browser, OS, region, campaign |
| new / returning `nu` / `ru` / `uv` | First visit ever / first activity of the day |
| engaged `es` | A session with 10 s visible, 2+ pages, or any action |
| `sec` | Visible seconds (only while the tab is visible) |
| `err` | Script errors and unhandled promise errors (max 5 per page, no messages) |
| `out_<site>` | Click on an external link (for example `out_linkedin`) |

## HV World

| Event | Where | Notes |
|---|---|---|
| `open_test`, `open_reset`, `open_vault`, `open_app` (conv) | Any click on a link into an app | Product discovery |
| `imp_test` / `imp_reset` / `imp_vault` (field) | App link 60% visible on screen | Once per page view |
| `sd50`, `sd90` (field) | Scrolled 50% / 90% of a page | Once per page view |
| `video_play`, `video_complete` | Reveal film on /watch/ (YouTube player) | |

In-app channel `from_world` = a session that arrived in an app from an HV World page.

## HV Test (Maturity Assessment)

| Event | When |
|---|---|
| `test_intro` | "Start" on the landing screen (opens the intake form) |
| `test_start` (conv) | Intake done, questions generated |
| `progress_25` / `progress_50` / `progress_75` | Answered 25 / 50 / 75 % of the questions |
| `test_complete` (conv) | "See my results" |
| `time_lt5` / `time_5_10` / `time_10_20` / `time_gt20` | Time from start to complete |
| `results_view` | Results screen first shown |
| `scorecard` (conv) | Scorecard saved (an ID was issued) |
| `pdf_download`, `share_link`, `test_retake` | Buttons on the results screen |

Never sent: answers, scores, level, name, age, profession.

## HV Reset

| Event | When |
|---|---|
| `signin_start` | Google sign-in clicked (shared `hv-cloud.js`) |
| `sign_in` / `signup` (conv) | After sign-in; `signup` when the account had no saved plan |
| `plan_saved` (first), `tasks_planned_1_3` / `_4_6` / `_7_plus` | Plan saved, with the number of blocks bucketed |
| `timer_start` | A task timer started |
| `task_done` (first), `activation` (first, conv) | A task marked done. Activation = first task done on this device |
| `task_skip` | A task skipped |
| `dashboard_view` | Dashboard opened |
| `ai_message`, `ai_voice`, `ai_confirm` | HV AI used (shared `hv-ai.js`) |

Never sent: task titles, notes, plan contents, times, what you typed or said.

## HV Vault (web)

Events come from comparing counts before and after each save. No content is read.

| Event | When |
|---|---|
| `signin_start`, `sign_in` / `signup` (conv) | As in HV Reset (`signup` = cloud had no data yet) |
| `job_added` (max 5 per save), `first_job` (first), `activation` (first, conv) | Job count went up |
| `job_deleted` | Job count went down |
| `stage_<stage>` | A stage gained jobs (for example `stage_applied`, `stage_interview`, `stage_offer`) |
| `followup_added`, `followup_done`, `event_added`, `company_added`, `resume_added` | Those counts went up |
| `view_<screen>` | A screen was opened (dashboard, jobs, calendar, analytics…) |
| `export_jobs`, `export_summary` | Exports |
| `ai_message`, `ai_voice`, `ai_confirm` | HV AI used |

Changes synced from another device do not count as local actions. Never sent: job titles, companies, notes, contacts, files.
