import React, { useState, useEffect, useMemo, useRef, useCallback } from "react";
import {
  BarChart, Bar, XAxis, YAxis, Tooltip, ResponsiveContainer, LineChart, Line, CartesianGrid, Cell, PieChart, Pie, Legend,
} from "recharts";
import {
  LayoutDashboard, Building2, Briefcase, KanbanSquare, BellRing, FolderOpen,
  BarChart3, Settings, Search, Plus, X, Pencil, Trash2, ExternalLink, Download,
  Upload, ChevronRight, ChevronDown, Clock, CheckCircle2, AlertTriangle, Copy,
  Tag as TagIcon, Moon, Sun, FileText, Star, BookOpen, ListTodo, MessageSquareText,
  Sparkles, Eye, Files, AlarmClock, CircleDot, GraduationCap, Zap, User, Wand2, Image as ImageIcon, CalendarDays, ChevronLeft, RotateCcw, Cloud, Info, RefreshCw, LogOut, ShieldCheck, FileDown, FileUp, Archive,
} from "lucide-react";
import { signInError, GoogleG } from "./auth-gate.jsx";
import "./shared/apply-rule.js";   // window.HVApplyRule: the 2-minute apply rule shared with HV Reset
import "./shared/hv-ai.js";        // window.HVAI: the HV AI assistant shared with HV Reset
import "./shared/hv-ai-tests.js";  // window.HVAI_TESTS: HV AI command test set (Settings > self-test)
import * as pdfjsLib from "pdfjs-dist";
import pdfWorkerUrl from "pdfjs-dist/build/pdf.worker.min.mjs?url";
import mammoth from "mammoth/mammoth.browser";
pdfjsLib.GlobalWorkerOptions.workerSrc = pdfWorkerUrl;

/* ================================================================== */
/* Constants                                                           */
/* ================================================================== */

const STORAGE_KEY = "jobhunthub-data-v1"; // same key so existing data carries over
const FILE_KEY = (id) => "hvv-file-" + id;

const STAGES = [
  "Wishlist", "Saved", "Preparing", "Applied", "Follow-up Needed",
  "Recruiter Responded", "Interview", "Assignment", "Final Round",
  "Offer", "Rejected", "Closed",
];
const APPLIED_STAGES = ["Applied", "Follow-up Needed", "Recruiter Responded", "Interview", "Assignment", "Final Round", "Offer", "Rejected", "Closed"];
const RESPONSE_STAGES = ["Recruiter Responded", "Interview", "Assignment", "Final Round", "Offer"];
const PRE_APPLY = ["Wishlist", "Saved", "Preparing"];
const INTERVIEW_STAGES = ["Interview", "Assignment", "Final Round"];

const STAGE_COLORS = {
  "Wishlist": "#97A1B4", "Saved": "#7E8BA3", "Preparing": "#8E7FD0",
  "Applied": "#5B7CC4", "Follow-up Needed": "#D9A03D", "Recruiter Responded": "#4B9FAD",
  "Interview": "#7E6FC9", "Assignment": "#C08A4A", "Final Round": "#5F6FC9",
  "Offer": "#3E9B72", "Rejected": "#CD6A6A", "Closed": "#8A8F9C",
};

const SOURCES = ["LinkedIn", "Naukri", "Indeed", "Wellfound", "Cutshort", "Instahyre", "Company Website", "Referral", "Email", "Other"];
const WORK_MODES = ["Remote", "Hybrid", "On-site"];
const JOB_TYPES = ["Full-time", "Part-time", "Internship", "Contract", "Freelance"];
const PRIORITIES = ["High", "Medium", "Low"];
const PRIORITY_COLORS = { High: "#CD6A6A", Medium: "#D9A03D", Low: "#7E8BA3" };
const HIRING_STATUSES = ["Actively hiring", "Maybe hiring", "Not hiring", "Unknown"];
const COMPANY_STATUSES = ["To Research", "Researched", "Applied", "Follow-up", "Interview", "Rejected", "Offer"];
const FOLLOWUP_TYPES = ["Email", "LinkedIn", "Call", "Referral", "WhatsApp", "Other"];
const FU_STATUSES = ["Pending", "Sent", "Done", "Skipped", "No Reply", "Closed"];
const FU_COLORS = {
  Pending: "#D9A03D", Sent: "#3E9B72", Done: "#3E9B72", Skipped: "#8A8F9C",
  "No Reply": "#6B7A99", Closed: "#8A8F9C", Late: "#CD6A6A", Overdue: "#CD6A6A",
  "Due Today": "#D9A03D", Upcoming: "#5B7CC4", Waiting: "#6B7A99",
};
const DOC_TYPES = ["Resume", "Cover letter", "Portfolio", "Certificate", "Other"];
const DOC_STATUSES = ["Active", "Draft", "Final", "Archived"];
const DOC_STATUS_COLORS = { Active: "#3E9B72", Draft: "#D9A03D", Final: "#5B7CC4", Archived: "#8A8F9C" };
const MAX_FILE_MB = 3.5;

const RESEARCH_CHECKLIST = [
  "What does the company do?", "Products / services", "Company culture", "Tech stack",
  "Recent news / funding", "Open roles", "Interview process", "Salary research",
  "People to contact", "Why I want to work here", "Questions to ask in interview",
];
const PREP_CHECKLIST = [
  "Read job description fully", "Match resume bullets to JD", "Customize resume version",
  "Customize cover letter", "Prepare portfolio links", "Prepare answers to likely questions",
  "Apply", "Set follow-up reminder",
];

/* ---- Message templates (placeholders auto-filled on Templates page) ---- */
const TEMPLATES = [
  { name: "Recruiter LinkedIn message", purpose: "First touch with a recruiter at a target company",
    text: "Hi {recruiter_name}, I saw {company_name} is hiring for {job_title}. Quick intro: [one line about your current role] — [your 2–3 strongest numbers, e.g. deals closed, projects shipped, growth driven]. Would love to be considered — happy to share my resume right away. — {my_name}" },
  { name: "Referral request", purpose: "Ask an employee for a referral without being awkward",
    text: "Hi {recruiter_name}, I'm applying for the {job_title} role at {company_name}. Given your experience there, would you be open to referring me if my background fits? Quick summary: [2 lines — current role, strongest achievement with a number]. Resume here: {resume_link}. Totally understand if not. — {my_name}" },
  { name: "First follow-up (after applying)", purpose: "Send 7 days after applying if no reply",
    text: "Hi {recruiter_name}, I applied for the {job_title} role at {company_name} on {applied_date}. [One line on why you're a strong fit, with a number]. Would love 15 minutes to walk you through how my experience maps to this role. — {my_name}" },
  { name: "Second follow-up (no reply)", purpose: "Send ~10 days after the first follow-up; add new value",
    text: "Hi {recruiter_name}, following up on my application for {job_title}. One quick observation about {company_name} I noticed: [your one-line observation about their product, positioning, or market]. Happy to share the full thought — worth a quick 15 mins? — {my_name}" },
  { name: "Thank-you email (after interview)", purpose: "Send within 24 hours of any interview round",
    text: "Hi {recruiter_name}, thank you for the conversation about the {job_title} role today. The point about [topic discussed] stayed with me — here's one idea I'd bring in the first 30 days: [idea]. Looking forward to next steps. — {my_name}" },
  { name: "Interview follow-up (no feedback)", purpose: "Send 5+ days after an interview with no update",
    text: "Hi {recruiter_name}, hope your week is going well. Following up on the {job_title} interview at {company_name} — is there any update on next steps, or anything else you need from my side? Still very interested. — {my_name}" },
  { name: "Cold email to hiring manager", purpose: "Skip the ATS pile — email the person the role reports to",
    text: "Subject: {job_title} — [your sharpest number or proof point]\n\nHi {recruiter_name},\n\nI applied for {job_title} at {company_name}, and wanted to reach you directly. [2–3 lines: what you own in your current role and your strongest measurable results].\n\n[One line connecting your experience to their company or product]. 15 minutes to show you how I'd apply it at {company_name}?\n\nResume: {resume_link}\n{my_name}" },
  { name: "Short WhatsApp-style follow-up", purpose: "For contacts who share their number — keep it light",
    text: "Hi {recruiter_name}! {my_name} here — I'd applied for the {job_title} role at {company_name} on {applied_date}. Just checking if there's any update. Happy to share anything else you need. Thanks!" },
  { name: "Naukri / Indeed application note", purpose: "Paste into the note box while applying on portals",
    text: "[One line: current role and years of experience]. [2 lines: your strongest quantified achievements — numbers make recruiters stop scrolling]. Targeting {job_title} roles — resume attached, available for immediate conversation." },
];

/* ---- Master Resume Data (fill in your own career data) ---- */
const MASTER_SEED = [
  { id: "m1", title: "How this section works (read once, then edit)", content:
"This is your raw career data bank — the single source of truth you pull from when customizing any resume.\n\nHOW TO USE IT\n1. Create one section per job, internship, or major project (use the Add Section button below).\n2. In each section, write RESPONSIBILITIES (what you owned) and IMPACT (what changed, with numbers).\n3. When customizing a resume for a job, open this tab, pick the bullets that answer that JD's top 3 requirements, and paste them into your resume.\n\nRULES FOR GOOD ENTRIES\n• Every impact line needs a number: revenue, volume, %, rank, team size, time saved.\n• Write more here than any single resume will use — this is the warehouse, resumes are the shop window.\n• Update this within a week of any new win, while the numbers are fresh." },
  { id: "m2", title: "Experience — [Company Name]", content:
"ROLE: [Your title — add your real charter in brackets if the title undersells it]\n\nRESPONSIBILITIES\n• [What you owned end-to-end]\n• [Key workflows or projects you ran]\n• [Tools and processes you used]\n\nIMPACT\n• [Achievement with a number, e.g. Generated X leads / Closed Y deals / Grew Z by N%]\n• [Another quantified result]\n• [Scope claim if numbers are hard: first hire for X, sole owner of Y]" },
  { id: "m3", title: "Education, Skills & Projects", content:
"EDUCATION\n• [Degree, institution, year — add scholarships or rank if notable]\n\nTOOLS & SKILLS\n• [List the exact tool names recruiters search for: Excel, SQL, HubSpot, Figma…]\n\nPROJECTS & ACHIEVEMENTS\n• [Project + outcome with a number]\n• [Competition wins, certifications, notable coursework]" },
];

/* ---- Default weekly hygiene tasks ---- */
const PROFILE_TASKS_SEED = [
  { id: "p1", label: "Touch Naukri profile (edit one field — refresh boosts recruiter-search ranking)", done: false },
  { id: "p2", label: "Post or comment meaningfully on LinkedIn this week", done: false },
  { id: "p3", label: "Reach out to two new people at target companies", done: false },
  { id: "p4", label: "Check LinkedIn headline still matches target role", done: false },
];

/* ---- Resume Guide content ---- */
const RESUME_GUIDE = [
  { t: "How to make an ATS-friendly resume", c: "• Use a single-column layout, standard fonts, no tables, text boxes, images, or icons — most ATS (Naukri RMS, Zoho Recruit, Keka, Darwinbox, Workday) parse plain text.\n• Use standard section headers: Summary, Experience, Skills, Education. Creative headers break parsing.\n• Mirror the JD's exact vocabulary: if the JD says 'demand generation', write 'demand generation', not a synonym.\n• Save as PDF unless the portal asks for DOC. Name it FirstName_Role_Company.pdf.\n• If your official title undersells your actual work, add the charter in brackets: 'Analyst (Growth & Marketing Charter)'.\n• Skills section = keyword bank: list tools explicitly — recruiter filters match on exact names." },
  { t: "How to write strong bullet points", c: "• Formula: Action verb + what you did + measurable outcome. 'Executed 300+ outbound calls over 2 months, generating 12 qualified leads and 2 closed deals.'\n• One idea per bullet, max 2 lines. 4–6 bullets per role.\n• Start with your strongest, most quantified bullet — recruiters read the first two only.\n• Kill weak verbs: 'responsible for', 'worked on', 'helped with'. Use: launched, closed, converted, rebuilt, drove, owned.\n• Never stack two achievements in one bullet — split them." },
  { t: "How to write achievement-based experience", c: "• Convert every duty into an outcome. Duty: 'Handled outbound calling.' Achievement: 'Ran 25 calls/day for 90 days; codified the top objections into a script that improved lead quality.'\n• Use the So-What test: after each bullet ask 'so what changed?' If nothing changed, cut or rewrite.\n• Pair activity metrics with result metrics: calls → leads → deals. Activity alone reads junior.\n• If you can't quantify, qualify: 'first hire for', 'sole owner of', 'zero-to-one launch'." },
  { t: "How to use numbers in resume points", c: "• Every role needs 3+ numbers: volume (calls, projects, customers), results (revenue, leads, conversions), scope (team size, budget), rank (top 3, 1st place).\n• Use ranges or approximations honestly (10+, ~90 days) — precise-looking fake numbers get probed in interviews.\n• Convert raw numbers into rates where stronger: 10 leads → 2 closes = 20% close rate.\n• Format consistently: 1,500+ not 1500 plus — pick one style and stick to it." },
  { t: "How to customize resume for each company", c: "• 80/20 rule: keep the base fixed, swap only (1) headline, (2) top 3 bullets, (3) skills order.\n• Copy the JD's top 3 requirements, then pick bullets from your Master Resume Data that answer each one.\n• Rename the resume version in HV Vault (e.g. 'Sales_v2_fintech') and link it to the application — the Vault tracks which version performs.\n• Time-box it: 6 minutes max. Beyond that you're procrastinating, not customizing." },
  { t: "Resume for SALES roles (BD/SDR/AE)", c: "• Lead with volume + conversion: calls/day, demos delivered, lead-to-close %, quota attainment.\n• Add process skills: objection handling, CRM discipline, pipeline reviews, demo delivery.\n• Keyword bank: outbound, prospecting, cold calling, discovery, SQL/MQL, pipeline, quota, closing." },
  { t: "Resume for MARKETING roles", c: "• Lead with funnel + content outcomes: campaigns run, SEO results, content shipped, audience grown.\n• Reframe sales experience as research: 'customer conversations → codified objections → rewrote messaging'.\n• Keyword bank: GTM, positioning, demand gen, SEO, content strategy, performance marketing, CAC, funnel." },
  { t: "Resume for BUSINESS DEVELOPMENT roles", c: "• Lead with partnerships and deals: partnerships closed, institutions prospected, revenue through partners.\n• Show full-cycle ownership: prospect → pitch → negotiate → onboard → grow.\n• Keyword bank: partnerships, alliances, institutional sales, B2B, account growth, stakeholder management." },
  { t: "Resume for PRODUCT / GROWTH roles", c: "• Lead with the feedback loop: customer insights you gathered and how they changed the product or messaging.\n• Add experiment framing: what you tested, what moved.\n• Keyword bank: voice of customer, experimentation, activation, retention, growth loops, analytics (SQL, GA4, Mixpanel)." },
  { t: "Resume for ANALYST roles", c: "• Lead with tools + decisions: name the exact tools (Excel, SQL, Python, Tableau, Power BI) and what decisions your analysis changed.\n• Every analysis bullet needs the downstream effect: 'analyzed X → decision Y → result Z'.\n• Keyword bank: SQL, dashboarding, cohort analysis, funnel analysis, reporting automation." },
  { t: "Common resume mistakes", c: "• Listing duties instead of outcomes.\n• One generic resume for every application.\n• Burying your best metric in bullet #5.\n• Fancy design that breaks ATS parsing.\n• 'Passionate, driven, hardworking' — adjectives are claims; numbers are proof.\n• Unexplained title mismatch (fix: add your real charter in brackets after the title).\n• Hobbies/soft-skills sections eating space that numbers could use.\n• Typos in company names — instant rejection signal." },
  { t: "Resume checklist before applying", c: "☐ Headline mirrors the JD title\n☐ Top 3 bullets answer the JD's top 3 requirements\n☐ Every bullet has a number or a scope claim\n☐ Skills section contains the JD's exact tool names\n☐ One page, single column, PDF\n☐ File named FirstName_Role_Company.pdf\n☐ Version logged in Resume Vault and linked to this application\n☐ No typos (read it aloud once)" },
  { t: "How to select the correct resume version", c: "• Read the JD's first 3 requirements — they tell you the archetype: pipeline numbers → Sales version; content/positioning → Marketing version; partnerships → BD version; roadmap/experiments → Product/Growth version.\n• When mixed, match the TITLE of the role to your closest version.\n• Check the Vault's Performance tab — if one version has a clearly better reply rate for a role type, default to it." },
];

const RESUME_TEMPLATES_GUIDE = [
  { t: "Sales resume template (BD/SDR/AE)", c: "SUMMARY — '[Role] with [X years] of [domain] experience. [Volume metric], [conversion metric], [deals closed].'\nSKILLS — Outbound prospecting, discovery calls, demo delivery, objection handling, CRM hygiene, pipeline management, negotiation.\nEXPERIENCE STRUCTURE — Company | Title (charter) | Dates → 5 bullets: volume, conversion, deal closed, process built, tool used.\nCHECKLIST — every bullet has a number; conversion rates present; quota-style framing; CRM named." },
  { t: "Marketing resume template", c: "SUMMARY — '[Role] who [strongest marketing outcome]. [Proof point with a number].'\nSKILLS — Positioning, messaging, SEO, content strategy, demand gen, GTM planning, analytics tools you actually used.\nEXPERIENCE STRUCTURE — Lead with messaging/content/SEO bullets, then funnel numbers as supporting proof.\nCHECKLIST — no bullet reads pure-sales; positioning vocabulary present; portfolio link in header." },
  { t: "Business development resume template", c: "SUMMARY — '[Domain] partnerships and institutional sales: [prospecting volume], [deals closed], [revenue or outcomes driven].'\nSKILLS — Partnership development, institutional sales, stakeholder management, pitch design, onboarding, account growth.\nCHECKLIST — full-cycle ownership visible; partner outcomes quantified." },
  { t: "Product / growth resume template", c: "SUMMARY — 'Growth-minded operator at the customer-product boundary: [insight-gathering volume] turned into [product/messaging outcomes].'\nSKILLS — Voice of customer, growth experiments, funnel analytics, SQL/Excel, activation, A/B thinking.\nCHECKLIST — feedback-loop story explicit; at least one experiment framed as hypothesis → result." },
  { t: "Analyst resume template", c: "SUMMARY — 'Analytics-focused [background] with [tools list] applied to [domain] data.'\nSKILLS — SQL, Excel (advanced), Python, Tableau/Power BI, dashboarding, cohort/funnel analysis.\nCHECKLIST — tools listed exactly; each analysis tied to a decision or metric moved." },
  { t: "Fresher / early-career template", c: "SUMMARY — 2 lines: education + strongest proof point. Never 'seeking opportunities to learn'.\nORDER — Summary → Experience (even internships) → Skills → Education → Projects. Education above experience only if the college brand is stronger than the work.\nBULLET SOURCE — competition wins, college-fair sales, club leadership — all framed with numbers.\nCHECKLIST — one page; zero hobby/soft-skill sections; every project has an outcome line." },
  { t: "Startup experience template", c: "SUMMARY — Scope-first framing: 'First [function] hire' beats any title at startups.\nSTRUCTURE — Add a one-line charter under the title: '[Official title] (operated as [real scope] — sole owner of X)'.\nBULLET FOCUS — zero-to-one launches, multi-hat ownership, founder-adjacent decisions.\nCHECKLIST — breadth shown WITHOUT reading scattered: group bullets by theme; every claim has a number." },
];

/* ---- Job Platform Guides ---- */
const PLATFORM_GUIDES = [
  { group: "LinkedIn", items: [
    { t: "Optimize your profile", c: "• Photo: plain background, professional, smiling. Banner: simple statement of your space.\n• Turn ON 'Open to Work' (recruiters-only mode if currently employed).\n• Featured section: pin your best post and portfolio link.\n• Experience section = resume bullets, but slightly more conversational. Same numbers.\n• Get 3–5 recommendations: one manager, one colleague, one professor or client." },
    { t: "Write a good headline", c: "• Formula: Role target | Proof | Space. Example: 'Growth Marketing | Drove 40% pipeline growth at a B2B startup | SaaS'.\n• Never just your current title — the headline is search real estate; recruiters search by role keywords.\n• Avoid 'aspiring', 'seeking', emoji-heavy headlines." },
    { t: "Write the About section", c: "• 3 short paragraphs: (1) who you are + strongest metric, (2) what you've actually done, (3) what you're looking for + how to reach you.\n• First 2 lines show before 'see more' — put your best number there.\n• Write in first person. No third-person corporate bios early in your career." },
    { t: "Message recruiters", c: "• Keep under 280 characters for connection notes. Use the 'Recruiter LinkedIn message' template in Templates.\n• Reference something specific: their post, the JD line, the company's launch.\n• Never ask for a job in message #1 — ask a question or offer an observation.\n• Follow up once after 4 days, then move on." },
    { t: "Ask for referrals", c: "• Target 2nd-degree connections and your college alumni at the company (search: company + your college name).\n• Make it a 30-second yes: attach resume link, the exact job URL, and a 3-line summary they can forward.\n• Use the 'Referral request' template. Offer an out ('totally understand if not').\n• Referral converts far better than cold ATS — always attempt one before applying to High-priority companies." },
    { t: "Find hiring managers", c: "• Search: company name + the function head title ('head of marketing', 'sales director', 'founder'). For early-stage startups, message the founder directly.\n• Check who posted the job — 'Posted by' on the listing is your first target.\n• Second target: someone already in the role you want (they know the hiring loop and can refer)." },
    { t: "Use search filters", c: "• Jobs search: title keywords in quotes, your locations + Remote, Date posted = past week, Experience = your level.\n• Save 3 searches with alerts for your top target titles.\n• People search: filter by company + school for warm referral paths." },
    { t: "Post and comment for visibility", c: "• Weekly post (300–400 words, one image): an observation about your target industry, a company teardown, or a lesson from your work.\n• Comment substantively on 3 posts/week from leaders in your function and target-company founders — comments get you profile visits.\n• Consistency > virality: 6 solid posts = a portfolio." },
    { t: "Track LinkedIn jobs in HV Vault", c: "• When you save a job on LinkedIn, add it here the same minute: source = LinkedIn, paste URL, set deadline and fit score.\n• After messaging someone, log a Follow-up with type = LinkedIn and the actual message sent.\n• Weekly: check Analytics → Sources to see if LinkedIn replies justify the time spent." } ]},
  { group: "Indeed", items: [
    { t: "Search effectively", c: "• Use quotes and title variants — run separate searches for each target title.\n• Sort by Date, not Relevance. Fresh postings (48h) get far more recruiter attention on applications.\n• Set location = your target cities + 'Remote' as a separate saved search." },
    { t: "Use filters", c: "• Date posted: last 3 days. Experience level: match yours. Job type: Full-time.\n• Salary filter cautiously — many posts omit salary and get excluded by the filter." },
    { t: "Identify good posts", c: "• Good signs: named company, specific responsibilities, salary range, direct 'apply on company site' link.\n• Check the company exists: website + LinkedIn page + named employees." },
    { t: "Avoid low-quality posts", c: "• Red flags: consultancy reposts, 'urgent hiring' + WhatsApp numbers, registration fees (ALWAYS a scam), vague titles, salary ranges too good for the role.\n• Never pay anyone to apply. Never share OTPs or documents before an offer letter from a verifiable domain." },
    { t: "Track Indeed applications in HV Vault", c: "• Log every application here with source = Indeed the moment you apply — Indeed's own tracker loses reposts.\n• Check your Sources chart monthly and cap time on channels that don't reply." } ]},
  { group: "Naukri", items: [
    { t: "Improve profile ranking", c: "• Naukri ranks by freshness + completeness + keyword match. Edit any field every 2–3 days (even re-saving the headline) — 'active in last 7 days' profiles surface first in recruiter search.\n• Completeness to 100%: photo, headline, key skills (15), summary, project details, notice period.\n• Headline formula same as LinkedIn: role + proof + space." },
    { t: "Update regularly", c: "• The Pending Work page has a weekly 'Touch Naukri profile' task — do it Mondays.\n• Refresh your resume file monthly even if unchanged (re-upload resets freshness)." },
    { t: "Use keywords", c: "• Key Skills field is the search index: list every role keyword and tool name recruiters would search for your target role.\n• Repeat critical keywords in headline + summary + skills — Naukri weights repetition." },
    { t: "Apply smartly", c: "• Apply within 24h of posting; Naukri shows recruiters applicant order.\n• Use the application note box — paste the 'Naukri/Indeed application note' template.\n• Skip posts with 500+ applicants older than a week unless High priority — your time converts better in outreach." },
    { t: "Track Naukri applications in HV Vault", c: "• Source = Naukri on every job you save here.\n• Naukri recruiters often call directly: after any call, log it as a Follow-up (type = Call, status = Sent) with notes — this keeps your timeline complete." } ]},
  { group: "Strategy & Prep", items: [
    { t: "Referral strategy", c: "• Order of attack for High-priority companies: (1) your college alumni, (2) 2nd-degree connections, (3) person in the target role, (4) recruiter, (5) founder.\n• Ask AFTER you've engaged once (comment/DM), not cold. Attach job URL + resume + 3-line summary.\n• Track every ask as a Follow-up (type = Referral). One referral attempt per company minimum before cold-applying." },
    { t: "Recruiter outreach messages", c: "See Templates → 'Recruiter LinkedIn message' and 'Cold email to hiring manager'. Rules: under 120 words, one specific company reference, one metric, one clear ask, zero flattery." },
    { t: "Follow-up messages", c: "See Templates → first follow-up (day 7), second follow-up (day 10, add a new observation), interview follow-up (day 5 post-interview). The Action Center computes these timings automatically per application." },
    { t: "Cold email essentials", c: "• Find emails: firstname@company.com pattern, or tools like Hunter (free tier).\n• Subject = role + your sharpest number. Body under 120 words. One ask: 15 minutes.\n• Send Tue–Thu, 9–11am. One bump after 4 days, then stop." },
    { t: "Interview preparation checklist", c: "☐ Company research checklist complete (Companies → open company)\n☐ Re-read the exact JD + your submitted resume version\n☐ 5 stories ready in STAR format from your own experience: a grind you sustained, a deal or project you closed, something you built, a time you influenced a decision, a measurable win\n☐ 3 questions to ask them (from research checklist)\n☐ Salary answer ready: range, not a number; deflect to 'role fit first'\n☐ Tech check for virtual rounds; reach 10 min early for in-person\n☐ Thank-you message drafted — send within 24h (Action Center will remind you)" } ]},
];

/* ================================================================== */
/* Helpers                                                             */
/* ================================================================== */

const uid = () => Math.random().toString(36).slice(2, 10) + Date.now().toString(36).slice(-4);
// Local calendar date (YYYY-MM-DD). toISOString() is UTC, which is still "yesterday" before 5:30 AM in India.
const localISO = (d) => d.getFullYear() + "-" + String(d.getMonth() + 1).padStart(2, "0") + "-" + String(d.getDate()).padStart(2, "0");
const todayISO = () => localISO(new Date());
const addDays = (iso, n) => { const d = new Date(iso + "T00:00:00"); d.setDate(d.getDate() + n); return localISO(d); };
const daysBetween = (a, b) => Math.round((new Date(b + "T00:00:00") - new Date(a + "T00:00:00")) / 86400000);
const fmtTime = (t) => { const m = /^(\d{1,2}):(\d{2})/.exec(t || ""); if (!m) return t || ""; const h = +m[1]; return (h % 12 || 12) + ":" + m[2] + " " + (h >= 12 ? "PM" : "AM"); };   // "16:00" -> "4:00 PM"
const fmtDate = (iso) => { if (!iso) return "—"; const d = new Date(iso + "T00:00:00"); return d.toLocaleDateString("en-IN", { day: "numeric", month: "short", year: "numeric" }); };
const weekKey = (iso) => { const d = new Date(iso + "T00:00:00"); const day = (d.getDay() + 6) % 7; d.setDate(d.getDate() - day); return localISO(d); };
const parseTags = (s) => (s || "").split(",").map((t) => t.trim()).filter(Boolean);

function toCSV(rows, headers) {
  const esc = (v) => { const s = v == null ? "" : String(v); return /[",\n]/.test(s) ? '"' + s.replace(/"/g, '""') + '"' : s; };
  return [headers.join(","), ...rows.map((r) => headers.map((h) => esc(r[h])).join(","))].join("\n");
}
function parseCSV(text) {
  const rows = []; let row = [], cur = "", inQ = false;
  for (let i = 0; i < text.length; i++) {
    const c = text[i];
    if (inQ) { if (c === '"') { if (text[i + 1] === '"') { cur += '"'; i++; } else inQ = false; } else cur += c; }
    else if (c === '"') inQ = true;
    else if (c === ",") { row.push(cur); cur = ""; }
    else if (c === "\n" || c === "\r") { if (cur !== "" || row.length) { row.push(cur); rows.push(row); row = []; cur = ""; } if (c === "\r" && text[i + 1] === "\n") i++; }
    else cur += c;
  }
  if (cur !== "" || row.length) { row.push(cur); rows.push(row); }
  if (!rows.length) return [];
  const headers = rows[0].map((h) => h.trim().toLowerCase());
  return rows.slice(1).filter((r) => r.some((c) => c.trim() !== "")).map((r) => { const o = {}; headers.forEach((h, i) => (o[h] = (r[i] || "").trim())); return o; });
}
function download(filename, text) {
  const blob = new Blob([text], { type: "text/csv;charset=utf-8" });
  const url = URL.createObjectURL(blob);
  const a = document.createElement("a"); a.href = url; a.download = filename; a.click();
  URL.revokeObjectURL(url);
}
function b64ToBlob(b64, mime) {
  const bytes = atob(b64); const arr = new Uint8Array(bytes.length);
  for (let i = 0; i < bytes.length; i++) arr[i] = bytes.charCodeAt(i);
  return new Blob([arr], { type: mime });
}

/* ---- Data migrations: old saved data -> current format ----
   Rule: NEVER delete user fields. Only fill missing ones or transform in place.
   When the data format changes in a future version, bump CURRENT_SCHEMA and
   add an `if (v < N) { ... }` block below. Old installs stay safe. */
const CURRENT_SCHEMA = 4;
function migrateData(p) {
  const v = p.schema || 1;
  // v1 -> v2: no structural changes; new fields are filled by the defaults-merge below.
  // v2 -> v3: profile gains structured arrays (work_experience, internships) + total_experience.
  if (v < 3 && p.profile) {
    p.profile.work_experience = Array.isArray(p.profile.work_experience) ? p.profile.work_experience : [];
    p.profile.internships = Array.isArray(p.profile.internships) ? p.profile.internships : [];
    p.profile.total_experience = p.profile.total_experience || "";
  }
  // v3 -> v4: Calendar + Analytics. NEVER deletes user fields — only fills safe defaults.
  if (v < 4) {
    p.calendarEvents = Array.isArray(p.calendarEvents) ? p.calendarEvents : [];
    p.analyticsPrefs = p.analyticsPrefs || { metric: "applications", groupBy: "week", chartType: "bar", range: "90" };
    (p.calendarEvents || []).forEach((ev) => { if (!ev.id) ev.id = Math.random().toString(36).slice(2, 12); });
    (p.jobs || []).forEach((j) => {
      if (!j.source) j.source = "Other";
      if (j.date_applied === undefined) j.date_applied = "";
      if (j.interview_date === undefined) j.interview_date = "";
      if (!j.response_date) {
        // derive first-response date from the job's own timeline if it exists
        const t = (j.timeline || []).find((x) => ["Moved to Recruiter Responded", "Moved to Interview", "Moved to Assignment", "Moved to Final Round", "Moved to Offer"].includes(x.event));
        j.response_date = t ? t.date : "";
      }
    });
  }
  p.schema = CURRENT_SCHEMA;
  return p;
}

const hydrateData = (raw) => {
  const p = migrateData(JSON.parse(raw));
  const base = emptyData();
  return {
    ...base, ...p,
    resumes: p.resumes || [], master: p.master && p.master.length ? p.master : MASTER_SEED,
    profileTasks: p.profileTasks || PROFILE_TASKS_SEED, snoozes: p.snoozes || {},
    settings: { ...base.settings, ...(p.settings || {}) },
  };
};
const emptyData = () => ({
  schema: CURRENT_SCHEMA, profile: null, calendarEvents: [],
  analyticsPrefs: { metric: "applications", groupBy: "week", chartType: "bar", range: "90" },
  companies: [], jobs: [], followups: [], files: [], resumes: [],
  master: MASTER_SEED, profileTasks: PROFILE_TASKS_SEED, snoozes: {},
  settings: {
    myName: "", targetRole: "",
    locations: "", remotePref: "Hybrid", expectedSalary: "",
    skills: "",
    linkedin: "", portfolio: "", resumeLink: "", followupGap: 7, theme: "light", aiProvider: "off", aiKey: "", aiModel: "",
    lastSeenVersion: "",
  },
});

/* ---- Next Best Action engine ---- */
function jobNextAction(job, followups, today) {
  const fus = followups.filter((f) => f.job_id === job.id);
  const overdueFU = fus.find((f) => f.status === "Pending" && f.due_date && f.due_date < today);
  if (overdueFU) return { text: "Send the overdue follow-up", tone: "late", why: "A planned follow-up is past its due date" };
  if (job.status === "Offer") return { text: "Compare offer and prepare negotiation notes", tone: "good", why: "Offer received 🎉" };
  if (job.status === "Rejected") return { text: "Save learnings and archive", tone: "neutral", why: "Application was rejected — capture what you'd change" };
  if (job.status === "Closed") return null;
  if (INTERVIEW_STAGES.includes(job.status)) {
    if (job.interview_date && job.interview_date <= today) {
      const d = daysBetween(job.interview_date, today);
      if (d <= 1) return { text: "Send thank-you message within 24 hours", tone: "warn", why: "Interview just happened" };
      if (d >= 5) return { text: "Send interview follow-up", tone: "warn", why: d + " days since interview with no update" };
      return { text: "Wait for feedback — prep next round", tone: "neutral", why: "Interview done " + d + " days ago" };
    }
    return { text: "Prepare for interview", tone: "info", why: "You're in the " + job.status + " stage" };
  }
  if (PRE_APPLY.includes(job.status)) {
    if (job.deadline && daysBetween(today, job.deadline) <= 3 && job.deadline >= today)
      return { text: "Apply before deadline (" + fmtDate(job.deadline) + ")", tone: "late", why: "Deadline is close and you haven't applied" };
    return { text: "Customize resume and apply", tone: "info", why: "Saved but not yet applied" };
  }
  // Applied / waiting states
  const sentDates = fus.filter((f) => f.sent_date).map((f) => f.sent_date);
  const replyDates = fus.filter((f) => f.reply_date).map((f) => f.reply_date);
  const lastTouch = [job.date_applied, ...sentDates, ...replyDates].filter(Boolean).sort().pop();
  if (!lastTouch) return { text: "Log your applied date", tone: "neutral", why: "Stage says applied but no date recorded" };
  const replied = RESPONSE_STAGES.includes(job.status) || fus.some((f) => f.reply_received === "Yes");
  const d = daysBetween(lastTouch, today);
  if (!replied) {
    if (d >= 21) return { text: "Mark as no response — close, keep company for future", tone: "late", why: d + " days of silence since last touch" };
    if (d >= 15) return { text: "Try a referral, or move to low priority", tone: "warn", why: d + " days without a reply" };
    if (d >= 10) return { text: "Send second follow-up or LinkedIn recruiter message", tone: "warn", why: d + " days without a reply" };
    if (d >= 7) return { text: "Send first follow-up", tone: "warn", why: d + " days since applying" };
    return { text: "Waiting — response window still open", tone: "neutral", why: "Only " + d + " day(s) since last touch" };
  }
  if (d >= 7) return { text: "Nudge — ask about next steps", tone: "warn", why: "They replied earlier but " + d + " days have passed" };
  return { text: "In conversation — respond promptly", tone: "neutral", why: "Active thread" };
}

const fuBadgeState = (f, today) => {
  if (f.status !== "Pending") return f.status;
  if (f.due_date && f.due_date < today) return "Late";
  if (f.due_date === today) return "Due Today";
  return "Upcoming";
};
/* ---- Calendar event types & helpers ---- */
const EVENT_TYPES = [
  ["application", "Application submitted"], ["followup", "Follow-up due"], ["interview", "Interview"],
  ["assignment", "Assignment / deadline"], ["networking", "Networking call"], ["recruiter", "Recruiter call"],
  ["research", "Company research"], ["custom", "Custom"],
];
const EVENT_TYPE_LABEL = Object.fromEntries(EVENT_TYPES);
const EVENT_COLORS = {
  application: "#5B7CC4", followup: "#D9A03D", interview: "#7E6FC9", assignment: "#C08A4A",
  networking: "#4B9FAD", recruiter: "#3E9B72", research: "#8E7FD0", custom: "#8A8F9C",
};
const EVENT_STATUSES = ["upcoming", "done", "missed", "cancelled"];
const EVENT_STATUS_COLORS = { upcoming: "#5B7CC4", done: "#3E9B72", missed: "#CD6A6A", cancelled: "#8A8F9C" };
const REMINDER_OPTS = [["none", "No reminder"], ["same", "Same day"], ["1d", "1 day before"], ["3d", "3 days before"], ["1w", "1 week before"]];
const REMINDER_DAYS = { none: -1, same: 0, "1d": 1, "3d": 3, "1w": 7 };
const PALETTE = ["#5B7CC4", "#3E9B72", "#8E7FD0", "#D9A03D", "#CD6A6A", "#4B9FAD", "#7E8BA3", "#C08A4A", "#5F6FC9", "#97A1B4"];

/* First date a job entered a given stage (from its timeline) */
function stageDate(job, stage) {
  const t = (job.timeline || []).find((x) => x.event === "Moved to " + stage);
  if (t) return t.date;
  if (stage === "Applied") return job.date_applied || "";
  return "";
}

const monthKey = (iso) => iso.slice(0, 7);
const bucketKey = (iso, mode) => (mode === "day" ? iso : mode === "month" ? monthKey(iso) : weekKey(iso));
function bucketLabel(key, mode) {
  if (mode === "month") { const d = new Date(key + "-01T00:00:00"); return d.toLocaleDateString("en-IN", { month: "short", year: "2-digit" }); }
  return fmtDate(mode === "day" ? key : key).replace(/ \d{4}$/, "");
}

/* All calendar entries: manual events + auto-derived from followups/jobs/companies.
   Derived events mean existing data appears in the calendar instantly — no sync bugs. */
function deriveEvents(data, today) {
  const out = [];
  (data.calendarEvents || []).forEach((ev) => {
    if (!ev.date) return;
    const dstatus = ev.status === "upcoming" && ev.date < today ? "missed" : ev.status;
    out.push({ id: "ev-" + ev.id, raw_id: ev.id, source: "manual", type: ev.type || "custom", title: ev.title || "Event",
      date: ev.date, time: ev.time || "", dstatus, priority: ev.priority || "Medium",
      company_id: ev.company_id || "", job_id: ev.job_id || "", contact: ev.contact || "", notes: ev.notes || "", reminder: ev.reminder || "same" });
  });
  data.followups.forEach((f) => {
    if (f.status !== "Pending" || !f.due_date) return;
    out.push({ id: "fu-" + f.id, raw_id: f.id, source: "fu", type: "followup", title: f.title || (f.type + " follow-up"),
      date: f.due_date, time: "", dstatus: f.due_date < today ? "missed" : "upcoming", priority: "Medium",
      company_id: f.company_id || "", job_id: f.job_id || "", contact: f.contact_name || "", notes: "" });
  });
  data.jobs.forEach((j) => {
    if (j.interview_date) out.push({ id: "int-" + j.id, raw_id: j.id, source: "job", type: "interview",
      title: "Interview — " + j.title, date: j.interview_date, time: "", dstatus: j.interview_date < today ? "done" : "upcoming",
      priority: "High", company_id: j.company_id, job_id: j.id, contact: "", notes: "" });
    if (j.date_applied) out.push({ id: "app-" + j.id, raw_id: j.id, source: "job", type: "application",
      title: "Applied — " + j.title, date: j.date_applied, time: "", dstatus: "done",
      priority: "Low", company_id: j.company_id, job_id: j.id, contact: "", notes: "" });
    if (j.deadline && PRE_APPLY.includes(j.status)) out.push({ id: "dl-" + j.id, raw_id: j.id, source: "job", type: "assignment",
      title: "Apply by deadline — " + j.title, date: j.deadline, time: "", dstatus: j.deadline < today ? "missed" : "upcoming",
      priority: "High", company_id: j.company_id, job_id: j.id, contact: "", notes: "" });
  });
  data.companies.forEach((c) => {
    if (c.next_check_date) out.push({ id: "co-" + c.id, raw_id: c.id, source: "company", type: "research",
      title: "Re-check " + c.name, date: c.next_check_date, time: "", dstatus: c.next_check_date < today ? "missed" : "upcoming",
      priority: "Low", company_id: c.id, job_id: "", contact: "", notes: "" });
  });
  return out;
}

/* Core analytics numbers used by the Analytics page, Settings export, and insights */
function analyticsSummary(data) {
  const today = todayISO();
  const jobs = data.jobs;
  const apps = jobs.filter((j) => APPLIED_STAGES.includes(j.status));
  const resp = jobs.filter((j) => RESPONSE_STAGES.includes(j.status) || j.response_date);
  const ints = jobs.filter((j) => [...INTERVIEW_STAGES, "Offer"].includes(j.status) || j.interview_date);
  const offers = jobs.filter((j) => j.status === "Offer");
  const rej = jobs.filter((j) => j.status === "Rejected");
  const fuDue = data.followups.filter((f) => f.status === "Pending" && f.due_date && f.due_date <= today).length;
  const fuLate = data.followups.filter((f) => f.status === "Pending" && f.due_date && f.due_date < today).length;
  const rts = jobs.map((j) => (j.date_applied && j.response_date ? daysBetween(j.date_applied, j.response_date) : null)).filter((x) => x !== null && x >= 0);
  const avgResp = rts.length ? Math.round(rts.reduce((a, b) => a + b, 0) / rts.length) : null;
  const wk = jobs.filter((j) => j.date_applied && weekKey(j.date_applied) === weekKey(today)).length;
  const mo = jobs.filter((j) => j.date_applied && j.date_applied.slice(0, 7) === today.slice(0, 7)).length;
  const ghosted = jobs.filter((j) => ["Applied", "Follow-up Needed"].includes(j.status) && j.date_applied && !j.response_date && daysBetween(j.date_applied, today) >= 21).length;
  return {
    companies: data.companies.length, jobs: jobs.length, apps: apps.length, resp: resp.length,
    respRate: apps.length ? Math.round((resp.length / apps.length) * 100) : 0,
    ints: ints.length, intRate: apps.length ? Math.round((ints.length / apps.length) * 100) : 0,
    offers: offers.length, rej: rej.length, fuDue, fuLate, avgResp, wk, mo, ghosted,
  };
}

function analyticsSummaryRows(data) {
  const m = analyticsSummary(data);
  const rows = [
    { metric: "Companies tracked", value: m.companies }, { metric: "Jobs added", value: m.jobs },
    { metric: "Applications submitted", value: m.apps }, { metric: "Responses received", value: m.resp },
    { metric: "Response rate %", value: m.respRate }, { metric: "Interviews scheduled", value: m.ints },
    { metric: "Interview rate %", value: m.intRate }, { metric: "Offers", value: m.offers },
    { metric: "Rejections", value: m.rej }, { metric: "Follow-ups due", value: m.fuDue },
    { metric: "Overdue follow-ups", value: m.fuLate }, { metric: "Avg days to response", value: m.avgResp === null ? "" : m.avgResp },
    { metric: "Applications this week", value: m.wk }, { metric: "Applications this month", value: m.mo },
  ];
  STAGES.forEach((s) => rows.push({ metric: "Pipeline: " + s, value: data.jobs.filter((j) => j.status === s).length }));
  rows.push({ metric: "Pipeline: Ghosted (21d+ silent)", value: m.ghosted });
  return rows;
}

function buildInsights(data) {
  const m = analyticsSummary(data);
  const out = [];
  out.push("You applied to " + m.mo + " job" + (m.mo === 1 ? "" : "s") + " this month" + (m.wk ? " (" + m.wk + " this week)" : "") + ".");
  if (m.apps > 0) out.push("Your response rate is " + m.respRate + "%.");
  if (m.fuLate > 0) out.push("You have " + m.fuLate + " overdue follow-up" + (m.fuLate > 1 ? "s" : "") + " — clear these first.");
  const bySrc = {};
  data.jobs.forEach((j) => { if (j.source && (RESPONSE_STAGES.includes(j.status) || j.response_date)) bySrc[j.source] = (bySrc[j.source] || 0) + 1; });
  const best = Object.entries(bySrc).sort((a, b) => b[1] - a[1])[0];
  if (best) out.push("Your best response source is " + best[0] + " (" + best[1] + " response" + (best[1] > 1 ? "s" : "") + ").");
  const byInt = {};
  data.jobs.forEach((j) => { if (j.source && ([...INTERVIEW_STAGES, "Offer"].includes(j.status) || j.interview_date)) byInt[j.source] = (byInt[j.source] || 0) + 1; });
  const bi = Object.entries(byInt).sort((a, b) => b[1] - a[1])[0];
  if (bi) out.push("Most interviews came from " + bi[0] + ".");
  const counts = STAGES.map((s) => [s, data.jobs.filter((j) => j.status === s).length]).filter((x) => x[1] > 0);
  if (counts.length >= 2) {
    const sorted = [...counts].sort((a, b) => b[1] - a[1]);
    out.push("Your strongest pipeline stage is " + sorted[0][0] + " (" + sorted[0][1] + "), thinnest is " + sorted[sorted.length - 1][0] + " (" + sorted[sorted.length - 1][1] + ").");
  }
  if (m.avgResp !== null) out.push("Companies take about " + m.avgResp + " day" + (m.avgResp === 1 ? "" : "s") + " to respond to you on average.");
  if (m.ghosted > 0) out.push(m.ghosted + " application" + (m.ghosted > 1 ? "s have" : " has") + " gone 21+ days with no reply — consider closing them.");
  return out;
}

/* Filters for the Analytics page */
function rangeBounds(f, today) {
  if (f.range === "7") return [addDays(today, -6), today];
  if (f.range === "30") return [addDays(today, -29), today];
  if (f.range === "90") return [addDays(today, -89), today];
  if (f.range === "month") return [today.slice(0, 8) + "01", today];
  if (f.range === "custom") return [f.from || "", f.to || ""];
  return ["", ""];
}
function jobMatchesFilter(j, f) {
  if (f.company && j.company_id !== f.company) return false;
  if (f.status && j.status !== f.status) return false;
  if (f.source && j.source !== f.source) return false;
  if (f.mode && j.work_mode !== f.mode) return false;
  if (f.priority && j.priority !== f.priority) return false;
  if (f.location && !(j.location || "").toLowerCase().includes(f.location.toLowerCase())) return false;
  if (f.role && !(j.title || "").toLowerCase().includes(f.role.toLowerCase())) return false;
  if (f.tag && !(j.tags || []).some((t) => t.toLowerCase().includes(f.tag.toLowerCase()))) return false;
  return true;
}
const inDateRange = (iso, from, to) => !!iso && (!from || iso >= from) && (!to || iso <= to);

/* ---- Resume text extraction (local, no internet needed) ---- */
async function extractResumeText(file) {
  const buf = await file.arrayBuffer();
  const name = (file.name || "").toLowerCase();
  if (name.endsWith(".pdf") || file.type === "application/pdf") {
    const pdf = await pdfjsLib.getDocument({ data: buf }).promise;
    let out = "";
    const pages = Math.min(pdf.numPages, 12);
    for (let p = 1; p <= pages; p++) {
      const page = await pdf.getPage(p);
      const tc = await page.getTextContent();
      out += tc.items.map((i) => i.str).join(" ") + "\n";
    }
    return out.trim();
  }
  if (name.endsWith(".docx")) {
    const r = await mammoth.extractRawText({ arrayBuffer: buf });
    return (r.value || "").trim();
  }
  return ""; // old .doc / scanned PDFs: paste text manually in the review screen
}

const PARSE_FIELDS = ["name", "email", "phone", "linkedin", "portfolio", "location", "target_role", "skills", "education", "experience", "projects", "summary"];

/* ---- Local rule-based resume parser (works without any API key) ---- */
function localParseResume(text) {
  const t = text || "";
  const lines = t.split(/\r?\n/).map((l) => l.trim()).filter(Boolean);
  const email = (t.match(/[\w.+-]+@[\w-]+\.[\w.-]+/) || [""])[0];
  const phone = ((t.match(/(\+?\d[\d\s().-]{8,14}\d)/) || [""])[0] || "").trim();
  const linkedin = (t.match(/(?:https?:\/\/)?(?:www\.)?linkedin\.com\/[^\s|,;)]+/i) || [""])[0];
  const urls = t.match(/https?:\/\/[^\s|,;)]+/gi) || [];
  const portfolio = urls.find((u) => !/linkedin\.com/i.test(u)) || "";
  let name = "";
  for (const l of lines.slice(0, 6)) {
    if (l.includes("@") || /\d{5,}/.test(l)) continue;
    const words = l.split(/\s+/);
    if (words.length >= 2 && words.length <= 4 && /^[A-Za-z .'-]+$/.test(l) && !/resume|curriculum|vitae/i.test(l)) { name = l; break; }
  }
  let location = "";
  let target_role = "";
  const ROLE_WORDS = /(manager|engineer|developer|analyst|marketing|sales|designer|consultant|executive|specialist|lead|intern|associate|officer|accountant|architect|founder)/i;
  for (const l of lines.slice(0, 8)) {
    if (!location && /^[A-Za-z .()\-]+,\s*[A-Za-z .()\-]+$/.test(l) && l.length < 45) location = l;
    if (!target_role && l !== name && (l.includes("|") || ROLE_WORDS.test(l)) && !l.includes("@") && l.length < 90 && !/\d{4}/.test(l)) target_role = l;
  }
  const HEADS = {
    skills: /^(technical\s+)?skills?(\s*&\s*tools)?\b/i,
    education: /^(education|academic)/i,
    experience: /^((work|professional)\s+)?(experience|employment)\b/i,
    projects: /^projects?\b/i,
    summary: /^(summary|objective|profile|about)\b/i,
  };
  const sections = { skills: "", education: "", experience: "", projects: "", summary: "" };
  let current = null;
  for (const l of lines) {
    let matched = null;
    if (l.length < 40) { for (const [k, re] of Object.entries(HEADS)) { if (re.test(l)) { matched = k; break; } } }
    if (matched) { current = matched; continue; }
    if (current) sections[current] += (sections[current] ? "\n" : "") + l;
  }
  const skills = sections.skills
    ? sections.skills.split(/[,•|;\n]+/).map((s) => s.trim()).filter((s) => s && s.length < 40).slice(0, 30).join(", ")
    : "";
  return {
    name, email, phone, linkedin, portfolio, location, target_role, skills,
    education: sections.education.slice(0, 2000), experience: sections.experience.slice(0, 4000),
    projects: sections.projects.slice(0, 2000), summary: sections.summary.slice(0, 1000),
  };
}


/* ================================================================== */
/* UI atoms                                                            */
/* ================================================================== */

const Badge = ({ children, color, solid }) => (
  <span className="badge" style={solid
    ? { color: "#fff", background: color }
    : { color, background: color + "1c", border: "1px solid " + color + "33" }}>
    {children}
  </span>
);
const StageBadge = ({ stage }) => <Badge color={STAGE_COLORS[stage] || "#8A8F9C"}>{stage}</Badge>;
const PriorityBadge = ({ p }) => (p ? <Badge color={PRIORITY_COLORS[p]}>{p}</Badge> : null);
const TagChip = ({ t }) => <span className="tagchip"><TagIcon size={10} /> {t}</span>;

const Field = ({ label, children, span }) => (
  <label className={"field " + (span ? "field-span" : "")}>
    <span className="field-label">{label}</span>
    {children}
  </label>
);

const Modal = ({ title, onClose, children, wide }) => (
  <div className="modal-overlay" onMouseDown={(e) => e.target === e.currentTarget && onClose()}>
    <div className={"modal " + (wide ? "modal-wide" : "")}>
      <div className="modal-head">
        <h3>{title}</h3>
        <button className="icon-btn" onClick={onClose} aria-label="Close"><X size={18} /></button>
      </div>
      <div className="modal-body">{children}</div>
    </div>
  </div>
);

const Empty = ({ icon: Icon, title, hint, action }) => (
  <div className="empty">
    <div className="empty-icon"><Icon size={24} strokeWidth={1.6} /></div>
    <div className="empty-title">{title}</div>
    <div className="empty-hint">{hint}</div>
    {action}
  </div>
);

/* Sunrise sky behind the glass: gradient, drifting orbs, horizon glow, stars in dark mode. */
const Sky = () => (
  <div className="hv-sky" aria-hidden="true"><i className="o1" /><i className="o2" /><i className="o3" /><i className="horizon" /><i className="stars" /></div>
);

const PageHead = ({ title, sub, right }) => (
  <div className="page-head">
    <div>
      <h1>{title}</h1>
      {sub && <p className="page-sub">{sub}</p>}
    </div>
    {right}
  </div>
);

const Accordion = ({ items }) => {
  const [open, setOpen] = useState(null);
  return (
    <div className="acc">
      {items.map((it, i) => (
        <div key={i} className={"acc-item " + (open === i ? "open" : "")}>
          <button className="acc-head" onClick={() => setOpen(open === i ? null : i)}>
            <span>{it.t}</span><ChevronDown size={15} className="acc-chev" />
          </button>
          {open === i && <div className="acc-body prewrap">{it.c}</div>}
        </div>
      ))}
    </div>
  );
};

/* ================================================================== */
/* App shell                                                           */
/* ================================================================== */

export default function HVVault() {
  const [data, setData] = useState(null);
  const dataRef = useRef(null); dataRef.current = data;
  const aiRef = useRef(null);
  const [page, setPage] = useState("dashboard");
  const [globalQuery, setGlobalQuery] = useState("");
  const [toast, setToast] = useState(null);
  const [modal, setModal] = useState(null);
  const [companyDetail, setCompanyDetail] = useState(null);
  const [jobDetail, setJobDetail] = useState(null);
  const [preview, setPreview] = useState(null); // {name, url, mime}
  const [showOnboarding, setShowOnboarding] = useState(false);
  const [setupLater, setSetupLater] = useState(false);
  const [setupCelebrating, setSetupCelebrating] = useState(false);   // keep the setup open for its "all set" screen after saving
  const [whatsNew, setWhatsNew] = useState(null); // version string when update was just installed
  const versionChecked = useRef(false);
  const saveTimer = useRef(null);
  const toastTimer = useRef(null);

  /* First launch after an update? Compare the version stored in settings with
     the version actually running. Differ => user just updated => show What's New.
     First-ever run (nothing stored) records silently — the Setup Wizard handles welcome. */
  useEffect(() => {
    if (!data || versionChecked.current) return;
    versionChecked.current = true;
    const hv = typeof window !== "undefined" ? window.hv : null;
    if (!hv || !hv.getAppVersion) return;
    hv.getAppVersion().then((v) => {
      if (!v) return;
      const seen = data.settings.lastSeenVersion;
      if (!seen) {
        setData((d) => ({ ...d, settings: { ...d.settings, lastSeenVersion: v } }));
      } else if (seen !== v) {
        setWhatsNew(v);
      }
    }).catch(() => {});
  }, [data]);

  useEffect(() => {
    (async () => {
      try {
        const res = await window.storage.get(STORAGE_KEY);
        if (res && res.value) { setData(hydrateData(res.value)); return; }
      } catch (e) { /* first run */ }
      setData(emptyData());
      setShowOnboarding(true);
    })();
  }, []);

  // HV Reset inbox: the sync engine hands over queued actions; apply them to the data, save, then it clears them.
  const hasData = !!data;

  // HV AI: floating assistant. It only proposes; confirmed actions are applied here via applyAIActions.
  useEffect(() => {
    if (!hasData || !IS_WEB() || !window.HVAI || aiRef.current) return;
    const commit = async (fn) => {
      let out;
      await new Promise((res) => setData((d) => { out = fn(d); res(); return out.data; }));
      await window.storage.set(STORAGE_KEY, JSON.stringify(out.data));
      return out;
    };
    aiRef.current = window.HVAI.mount({
      app: "vault", logoSVG: HV_LOGO_SVG, keyHelp: IS_WEB() ? HVAI_WEB_HELP : HVAI_KEY_HELP, canPlan: false,
      getData: () => dataRef.current,
      getSettings: () => window.HVAI.pickConfig(dataRef.current.settings),   // the built-in AI on the website; a key only on desktop
      getContext: () => window.HVAI.buildContext(dataRef.current, null),
      userName: () => dataRef.current.settings.myName || "Harsh",
      isDark: () => dataRef.current.settings.theme === "dark",
      execute: async (actions) => {
        const out = await commit((d) => applyAIActions(d, actions, todayISO()));
        return {
          messages: out.messages,
          undo: async () => { await commit((d) => ({ data: revertAI(d, out.undo) })); return "Undone. That change is reverted."; },
        };
      },
    });
    aiRef.current.setVisible(!!dataRef.current.profile || IS_GUEST());   // hidden during profile setup; render keeps it in sync after
    return () => { if (aiRef.current && aiRef.current.destroy) aiRef.current.destroy(); aiRef.current = null; };   // the app remounts after sign-in
  }, [hasData]);
  useEffect(() => {
    const cloud = typeof window !== "undefined" && window.hv && window.hv.cloud;
    if (!hasData || !cloud || !cloud.setInboxHandler) return;
    cloud.setInboxHandler(async (actions) => {
      const next = await new Promise((res) => setData((d) => { const n = applyInbox(d, actions); res(n); return n; }));
      await window.storage.set(STORAGE_KEY, JSON.stringify(next));
      const n = actions.filter((a) => a && (a.type === "log" || a.type === "applied")).length;
      if (n) notify(n === 1 ? "HV Reset logged an application" : "HV Reset logged " + n + " applications");
    });
    return () => cloud.setInboxHandler(null);
  }, [hasData]);

  // Cloud sync: another device changed the data -> reload it here without a page refresh.
  useEffect(() => {
    const onRemote = async (e) => {
      if (!e.detail || !e.detail.main) return;
      try { const res = await window.storage.get(STORAGE_KEY); if (res && res.value) { setData(hydrateData(res.value)); setShowOnboarding(false); } } catch (err) {}
    };
    window.addEventListener("hv-remote-update", onRemote);
    return () => window.removeEventListener("hv-remote-update", onRemote);
  }, []);

  useEffect(() => {
    if (!data) return;
    clearTimeout(saveTimer.current);
    saveTimer.current = setTimeout(async () => {
      try { await window.storage.set(STORAGE_KEY, JSON.stringify(data)); }
      catch (e) { console.error("Save failed", e); notify((typeof window !== "undefined" && window.hv && window.hv.isWeb) ? "⚠ Could not save in this browser — storage may be full or blocked (private/incognito mode?)" : "⚠ Could not save to disk — check that your Documents folder is accessible"); }
    }, 500);
    return () => clearTimeout(saveTimer.current);
  }, [data]);

  const notify = useCallback((msg) => {
    setToast(msg);
    clearTimeout(toastTimer.current);
    toastTimer.current = setTimeout(() => setToast(null), 3200);
  }, []);

  const upsert = (key, item) => {
    setData((d) => {
      const list = d[key];
      const i = list.findIndex((x) => x.id === item.id);
      const next = i >= 0 ? list.map((x) => (x.id === item.id ? { ...item, updated_at: todayISO() } : x)) : [...list, item];
      return { ...d, [key]: next };
    });
  };
  const remove = (key, id) => setData((d) => ({ ...d, [key]: d[key].filter((x) => x.id !== id) }));
  const companyName = (id) => data.companies.find((c) => c.id === id)?.name || "—";

  const moveJob = (jobId, stage) => {
    setData((d) => stageJob(d, jobId, stage));
    if (stage === "Applied") notify("Applied — follow-up reminder set. Keep the pipeline moving.");
    else if (stage === "Offer") notify("Offer! 🎉 Prepare your negotiation notes.");
    else notify("Moved to " + stage);
  };

  const snoozeItem = (kind, id) => {
    if (kind === "fu") {
      setData((d) => ({ ...d, followups: d.followups.map((f) => f.id === id ? { ...f, due_date: addDays(todayISO(), 3) } : f) }));
    } else {
      setData((d) => ({ ...d, snoozes: { ...d.snoozes, [id]: addDays(todayISO(), 3) } }));
    }
    notify("Snoozed for 3 days");
  };
  const addNoteTo = (kind, id) => {
    const note = prompt("Add a note:");
    if (!note) return;
    if (kind === "job") setData((d) => ({ ...d, jobs: d.jobs.map((j) => j.id === id ? { ...j, notes: ((j.notes || "") + "\n[" + fmtDate(todayISO()) + "] " + note).trim() } : j) }));
    if (kind === "fu") setData((d) => ({ ...d, followups: d.followups.map((f) => f.id === id ? { ...f, notes: ((f.notes || "") + "\n[" + fmtDate(todayISO()) + "] " + note).trim() } : f) }));
    if (kind === "company") setData((d) => ({ ...d, companies: d.companies.map((c) => c.id === id ? { ...c, notes: ((c.notes || "") + "\n[" + fmtDate(todayISO()) + "] " + note).trim() } : c) }));
    notify("Note added");
  };

  const openPreview = async (resume) => {
    try {
      const res = await window.storage.get(FILE_KEY(resume.id));
      const payload = JSON.parse(res.value);
      const blob = b64ToBlob(payload.data, payload.mime);
      const url = URL.createObjectURL(blob);
      if (payload.mime === "application/pdf") setPreview({ name: resume.title, url, mime: payload.mime });
      else { const a = document.createElement("a"); a.href = url; a.download = payload.name || resume.title; a.click(); notify("Downloaded — preview is available for PDFs only"); }
    } catch (e) { notify("No file stored for this entry"); }
  };
  const downloadResume = async (resume) => {
    try {
      const res = await window.storage.get(FILE_KEY(resume.id));
      const payload = JSON.parse(res.value);
      const blob = b64ToBlob(payload.data, payload.mime);
      const url = URL.createObjectURL(blob);
      const a = document.createElement("a"); a.href = url; a.download = payload.name || resume.title; a.click();
      URL.revokeObjectURL(url);
    } catch (e) { notify("No file stored for this entry"); }
  };

  if (!data) return (<div className="app" data-theme="light"><StyleBlock /><Sky /><div className="loading-screen"><div className="loading-mark"><BrandMark size={52} /></div>Opening your vault…</div></div>);

  const theme = data.settings.theme || "light";
  const needsProfile = IS_WEB() && !IS_GUEST() && !setupLater && (!data.profile || setupCelebrating);   // guests explore first; setup comes after sign-in
  if (aiRef.current) aiRef.current.setVisible(!needsProfile);
  const toggleTheme = () => setData((d) => ({ ...d, settings: { ...d.settings, theme: theme === "light" ? "dark" : "light" } }));

  const pages = {
    dashboard: <Dashboard data={data} setPage={setPage} setModal={setModal} openJob={setJobDetail} moveJob={moveJob} upsert={upsert} snoozeItem={snoozeItem} addNoteTo={addNoteTo} notify={notify} />,
    profile: <ProfilePage data={data} setData={setData} notify={notify} onStartSetup={IS_WEB() ? () => setSetupLater(false) : null} />,
    pipeline: <PipelinePage data={data} moveJob={moveJob} companyName={companyName} openDetail={setJobDetail} setModal={setModal} />,
    jobs: <JobsPage data={data} setModal={setModal} remove={remove} openDetail={setJobDetail} companyName={companyName} />,
    companies: <CompaniesPage data={data} setModal={setModal} remove={remove} openDetail={setCompanyDetail} notify={notify} />,
    followups: <FollowupsPage data={data} setModal={setModal} upsert={upsert} remove={remove} companyName={companyName} notify={notify} />,
    pending: <PendingPage data={data} setData={setData} openJob={setJobDetail} openCompany={setCompanyDetail} companyName={companyName} setPage={setPage} notify={notify} />,
    vault: <ResumeVault data={data} setData={setData} upsert={upsert} remove={remove} notify={notify} companyName={companyName} openPreview={openPreview} downloadResume={downloadResume} setModal={setModal} />,
    templates: <TemplatesPage data={data} notify={notify} />,
    guides: <GuidesPage />,
    analytics: <AnalyticsPage data={data} setData={setData} setModal={setModal} notify={notify} />,
    calendar: <CalendarPage data={data} upsert={upsert} remove={remove} notify={notify} openJob={setJobDetail} openCompany={setCompanyDetail} setPage={setPage} companyName={companyName} />,
    settings: <SettingsPage data={data} setData={setData} notify={notify} />,
  };

  const NAV = [
    ["dashboard", "Dashboard", LayoutDashboard],
    ["profile", "Profile", User],
    ["calendar", "Calendar", CalendarDays],
    ["pipeline", "Pipeline", KanbanSquare],
    ["jobs", "Jobs", Briefcase],
    ["companies", "Companies", Building2],
    ["followups", "Follow-ups", BellRing],
    ["pending", "Pending Work", ListTodo],
    ["vault", "Resume Vault", FolderOpen],
    ["templates", "Templates", MessageSquareText],
    ["guides", "Guides", BookOpen],
    ["analytics", "Analytics", BarChart3],
    ["settings", "Settings", Settings],
  ];

  const today = todayISO();
  const dueCount = data.followups.filter((f) => f.status === "Pending" && f.due_date && f.due_date <= today).length;

  return (
    <div className="app" data-theme={theme}>
      <StyleBlock />
      <Sky />
      <aside className="sidebar">
        <div className="brand">
          <div className="brand-mark"><BrandMark size={38} /></div>
          <div className="brand-text">
            <div className="brand-name">HV Vault</div>
            <div className="brand-sub">Job-hunt command center</div>
          </div>
        </div>
        <nav>
          {NAV.map(([key, label, Icon]) => (
            <button key={key} className={"nav-item " + (page === key ? "active" : "")} onClick={() => { setPage(key); setCompanyDetail(null); setJobDetail(null); }}>
              <Icon size={17} strokeWidth={1.75} />
              <span>{label}</span>
              {key === "followups" && dueCount > 0 && <span className="nav-count">{dueCount}</span>}
            </button>
          ))}
        </nav>
        {IS_WEB() && (
          <a className="nav-item" href="../harsh-reset/" style={{ textDecoration: "none", marginTop: 6 }}>
            <RotateCcw size={17} strokeWidth={1.75} />
            <span>HV Reset</span>
          </a>
        )}
        <div className="sidebar-foot">Small actions compound.</div>
      </aside>

      <main className="main">
        <header className="topbar">
          <div className="searchwrap">
            <Search size={16} />
            <input placeholder="Search jobs, companies, resumes, notes…" value={globalQuery} onChange={(e) => setGlobalQuery(e.target.value)} />
            {globalQuery && <button className="icon-btn" onClick={() => setGlobalQuery("")}><X size={14} /></button>}
          </div>
          <div className="topbar-actions">
            <AccountButton notify={notify} />
            <button className="icon-btn theme-toggle" onClick={toggleTheme} title={theme === "light" ? "Switch to dark mode" : "Switch to light mode"}>
              {theme === "light" ? <Moon size={17} /> : <Sun size={17} />}
            </button>
            <button className="btn btn-ghost" onClick={() => setModal({ type: "company" })}><Plus size={15} /><span> Company</span></button>
            <button className="btn btn-primary" onClick={() => setModal({ type: "job" })}><Plus size={15} /><span> Job</span></button>
          </div>
        </header>

        <div className="content">
          {globalQuery.trim()
            ? <GlobalSearch data={data} query={globalQuery} openJob={setJobDetail} openCompany={setCompanyDetail} clear={() => setGlobalQuery("")} companyName={companyName} setPage={setPage} />
            : pages[page]}
        </div>
      </main>

      {companyDetail && (
        <CompanyDrawer company={data.companies.find((c) => c.id === companyDetail)} data={data}
          onClose={() => setCompanyDetail(null)} setModal={setModal} openJob={setJobDetail} upsert={upsert} />
      )}
      {jobDetail && (
        <JobDrawer job={data.jobs.find((j) => j.id === jobDetail)} data={data}
          onClose={() => setJobDetail(null)} setModal={setModal} companyName={companyName}
          upsert={upsert} moveJob={moveJob} openPreview={openPreview} downloadResume={downloadResume} />
      )}

      {modal?.type === "company" && (
        <CompanyModal initial={modal.payload} settings={data.settings} notify={notify}
          onSave={(c) => { upsert("companies", c); setModal(null); notify(modal.payload ? "Company updated" : "Company added"); }}
          onClose={() => setModal(null)} />
      )}
      {modal?.type === "job" && (
        <JobModal initial={modal.payload} companies={data.companies} resumes={data.resumes} settings={data.settings} notify={notify}
          onSave={(j, newCompany) => { if (newCompany) upsert("companies", newCompany); upsert("jobs", j); setModal(null); notify(modal.payload ? "Job updated" : "Job saved"); }}
          onClose={() => setModal(null)} />
      )}
      {modal?.type === "followup" && (
        <FollowupModal initial={modal.payload} data={data}
          onSave={(f) => { upsert("followups", f); setModal(null); notify("Follow-up saved"); }}
          onClose={() => setModal(null)} />
      )}
      {modal?.type === "resume" && (
        <ResumeMetaModal initial={modal.payload} data={data}
          onSave={(r) => { upsert("resumes", r); setModal(null); notify("Saved"); }}
          onClose={() => setModal(null)} />
      )}

      {modal?.type === "parsedView" && (
        <ParsedDataViewer resume={modal.payload} notify={notify}
          onClose={() => setModal(null)}
          onApplyToProfile={(p) => setData((d) => {
            const st = { ...d.settings };
            if (p.name) st.myName = p.name;
            if (p.target_role) st.targetRole = p.target_role;
            if (p.location) st.locations = p.location;
            if (p.linkedin) st.linkedin = p.linkedin;
            if (p.portfolio) st.portfolio = p.portfolio;
            if (p.skills) st.skills = p.skills;
            return { ...d, settings: st, profile: { ...p, saved_at: todayISO() } };
          })} />
      )}
      {modal?.type === "parseReview" && (
        <ParseReviewModal payload={modal.payload} settings={data.settings} notify={notify}
          onSave={(resumePatch, masterSection) => {
            upsert("resumes", resumePatch);
            if (masterSection) setData((d) => ({ ...d, master: [...d.master, masterSection] }));
            setModal(null); notify("Parsed data saved ✓");
          }}
          onClose={() => setModal(null)} />
      )}

      {preview && (
        <div className="modal-overlay" onMouseDown={(e) => e.target === e.currentTarget && setPreview(null)}>
          <div className="modal modal-preview">
            <div className="modal-head"><h3>{preview.name}</h3><button className="icon-btn" onClick={() => setPreview(null)}><X size={18} /></button></div>
            <iframe title="Resume preview" src={preview.url} className="preview-frame" />
          </div>
        </div>
      )}

      {needsProfile && <ProfileSetup data={data} setData={setData} upsert={upsert} notify={notify} onLater={() => setSetupLater(true)} onSaved={() => setSetupCelebrating(true)} />}
      {showOnboarding && !IS_WEB() && <SetupWizard data={data} setData={setData} upsert={upsert} notify={notify} onClose={() => setShowOnboarding(false)} />}
      {whatsNew && !showOnboarding && !needsProfile && (
        <WhatsNewModal version={whatsNew} onClose={() => {
          setData((d) => ({ ...d, settings: { ...d.settings, lastSeenVersion: whatsNew } }));
          setWhatsNew(null);
        }} />
      )}

      <GuestSave notify={notify} />
      {toast && <div className="toast"><CheckCircle2 size={15} /> {toast}</div>}
    </div>
  );
}


/* Move a job to a stage (pure). Moving to Applied stamps the date and creates the first
   follow-up. Used by moveJob and by actions from HV Reset (day = the local date it happened). */
function stageJob(d, jobId, stage, day, via) {
  const job = d.jobs.find((j) => j.id === jobId);
  if (!job || job.status === stage) return d;
  const on = day || todayISO();
  const timeline = [...(job.timeline || []), { date: on, event: "Moved to " + stage + (via ? " (" + via + ")" : "") }];
  const updated = { ...job, status: stage, timeline, updated_at: todayISO() };
  if (RESPONSE_STAGES.includes(stage) && !updated.response_date) updated.response_date = on;
  let followups = d.followups;
  if (stage === "Applied") {
    updated.date_applied = updated.date_applied || on;
    const gap = Number(d.settings.followupGap) || 7;
    followups = [...followups, {
      id: uid(), title: "First follow-up", job_id: job.id, company_id: job.company_id,
      contact_name: "", type: "Email", due_date: addDays(on, gap), status: "Pending",
      message_draft: "", notes: "Auto-created: follow up " + gap + " days after applying.",
    }];
  }
  return { ...d, jobs: d.jobs.map((j) => (j.id === jobId ? updated : j)), followups };
}

/* ---- HV Reset inbox ----
   Reset never writes HV Vault's data. It appends actions to users/{uid}/apps/inbox (or the
   same-browser localStorage "hv-inbox" when signed out); HV Vault applies them here and the
   sync engine clears them. Applied action ids are remembered, so an action can't apply twice. */
const normLink = (u) => String(u || "").trim().toLowerCase()
  .replace(/^https?:\/\//, "").replace(/^www\./, "").replace(/#.*$/, "")
  .replace(/([?&])(utm_[^=&]*|trk[^=&]*|refid|trackingid|ref|src)=[^&]*/g, "$1").replace(/[?&]+$/, "").replace(/\/+$/, "");
const sameText = (a, b) => String(a || "").trim().toLowerCase() === String(b || "").trim().toLowerCase();
function applyInbox(d0, actions) {
  const seen = new Set(d0.settings.inboxDone || []);
  const aiUndo = { ...(d0.settings.aiUndo || {}) };
  let d = d0, applied = 0;
  const toApplied = (dd, job, day) => (PRE_APPLY.includes(job.status) || !job.status ? stageJob(dd, job.id, "Applied", day, "from HV Reset") : dd);
  for (const a of actions) {
    if (!a || !a.id || seen.has(a.id)) continue;
    seen.add(a.id);
    const day = /^\d{4}-\d{2}-\d{2}$/.test(a.date || "") ? a.date : todayISO();
    if (a.type === "log") {
      const link = normLink(a.link);
      const company = d.companies.find((c) => sameText(c.name, a.company));
      let job = (link && d.jobs.find((j) => normLink(j.job_link) === link))
        || (company && a.role && d.jobs.find((j) => j.company_id === company.id && sameText(j.title, a.role)));
      if (job) {                                                      // update instead of duplicating
        const patch = {};
        if (!job.job_link && a.link) patch.job_link = a.link;
        if (!job.source && a.source) patch.source = a.source;
        if (Object.keys(patch).length) { d = { ...d, jobs: d.jobs.map((j) => (j.id === job.id ? { ...j, ...patch } : j)) }; job = { ...job, ...patch }; }
        d = toApplied(d, job, day);
      } else {
        let companyId = company && company.id;
        if (!companyId) {
          companyId = uid();
          d = { ...d, companies: [...d.companies, {
            id: companyId, name: String(a.company || "Unknown company").trim(), website: "", career_page: "", linkedin: "", location: "", industry: "",
            size: "", hiring_status: "Unknown", priority: "Medium", status: "To Research", tags: [], notes: "Added from HV Reset.",
            contact_name: "", contact_email: "", recruiter_linkedin: "", last_checked_date: day, next_check_date: "", rating: "", created_at: day,
          }] };
        }
        const id = uid();
        d = { ...d, jobs: [...d.jobs, {
          id, company_id: companyId, title: String(a.role || "Untitled role").trim(), source: a.source || "", job_link: a.link || "", location: "",
          work_mode: "", job_type: "Full-time", salary_range: "", experience_required: "", skills_required: "", description: "", deadline: "",
          priority: "Medium", fit_score: "", excitement_score: "", status: "Saved", tags: [], notes: "Logged from HV Reset.",
          date_saved: day, date_applied: "", interview_date: "", resume_id: "", cover_id: "", resume_attached_date: "", resume_verdict: "",
          timeline: [{ date: day, event: "Job saved (HV Reset)" }], prep_done: [],
        }] };
        d = stageJob(d, id, "Applied", day, "from HV Reset");
      }
      applied++;
    } else if (a.type === "applied") {
      const job = d.jobs.find((j) => j.id === a.jobId);
      if (job) { d = toApplied(d, job, day); applied++; }
    } else if (a.type === "fu_done") {
      const f = d.followups.find((x) => x.id === a.followupId);
      if (f && f.status !== "Done") d = { ...d, followups: d.followups.map((x) => (x.id === f.id ? { ...x, status: "Done", sent_date: x.sent_date || day, completed_date: day } : x)) };
    } else if (a.type === "ai" && Array.isArray(a.actions)) {        // HV AI batch confirmed in HV Reset
      const r = applyAIActions(d, a.actions, day);
      d = r.data; if (a.batch) aiUndo[a.batch] = r.undo;
    } else if (a.type === "ai_undo" && a.batch && aiUndo[a.batch]) {
      d = revertAI(d, aiUndo[a.batch]); delete aiUndo[a.batch];
    }
  }
  if (d === d0 && seen.size === (d0.settings.inboxDone || []).length) return d0;
  const keep = Object.keys(aiUndo).slice(-5), undoKept = {}; keep.forEach((k) => { undoKept[k] = aiUndo[k]; });
  return { ...d, settings: { ...d.settings, inboxDone: [...seen].slice(-400), aiUndo: undoKept } };
}

/* ---- HV AI: apply confirmed actions (pure). Returns the new data, an undo record (the
   previous version of every touched item, or null for items it created) and plain messages
   describing exactly what was done. Stage changes go through stageJob, i.e. moveJob's logic. */
function applyAIActions(d0, actions, day) {
  let d = d0; const undo = {}, messages = [], autoFU = {};
  const on = day || todayISO();
  const touch = (coll, id) => { undo[coll] = undo[coll] || {}; if (!(id in undo[coll])) undo[coll][id] = (d[coll] || []).find((x) => x.id === id) || null; };
  const cname = (id) => (d.companies.find((c) => c.id === id) || {}).name || "";
  const jl = (j) => (j.title || "Role") + " at " + (cname(j.company_id) || "unknown company");
  const findJob = (id) => d.jobs.find((j) => j.id === id);
  const move = (job, stage) => {
    const before = new Set(d.followups.map((f) => f.id));
    touch("jobs", job.id);
    d = stageJob(d, job.id, stage, on, "HV AI");
    d.followups.filter((f) => !before.has(f.id)).forEach((f) => {           // created by this batch: undo removes it
      undo.followups = undo.followups || {}; if (!(f.id in undo.followups)) undo.followups[f.id] = null; autoFU[job.id] = f.id;
    });
  };
  for (const act of actions || []) {
    const a = act.args || {}, t = act.type;
    if (t === "addJob") {
      let company = d.companies.find((c) => sameText(c.name, a.company));
      if (!company) {
        company = { id: uid(), name: String(a.company).trim(), website: "", career_page: "", linkedin: "", location: "", industry: "", size: "", hiring_status: "Unknown", priority: "Medium", status: "To Research", tags: [], notes: "Added by HV AI.", contact_name: "", contact_email: "", recruiter_linkedin: "", last_checked_date: on, next_check_date: "", rating: "", created_at: on };
        touch("companies", company.id); d = { ...d, companies: [...d.companies, company] };
      }
      const job = { id: uid(), company_id: company.id, title: String(a.role).trim(), source: a.source || "", job_link: a.link || "", location: a.location || "", work_mode: "", job_type: "Full-time", salary_range: "", experience_required: "", skills_required: "", description: "", deadline: "", priority: "Medium", fit_score: "", excitement_score: "", status: "Saved", tags: [], notes: a.notes || "", date_saved: on, date_applied: "", interview_date: "", resume_id: "", cover_id: "", resume_attached_date: "", resume_verdict: "", timeline: [{ date: on, event: "Job saved (HV AI)" }], prep_done: [] };
      touch("jobs", job.id); d = { ...d, jobs: [...d.jobs, job] };
      if (a.stage && a.stage !== "Saved") move(findJob(job.id), a.stage);
      messages.push("Added " + jl(job) + (a.stage && a.stage !== "Saved" ? " in " + a.stage : "") + ".");
    } else if (t === "updateJob" || t === "moveStage" || t === "deleteJob") {
      const job = findJob(a.job_id);
      if (!job) { messages.push("Skipped: that job no longer exists."); continue; }
      if (t === "moveStage") {
        if (job.status === a.stage) { messages.push(jl(job) + " is already in " + a.stage + "."); continue; }
        move(job, a.stage);
        const fu = autoFU[job.id] && d.followups.find((f) => f.id === autoFU[job.id]);
        messages.push("Moved " + jl(job) + " to " + a.stage + "." + (fu ? " Follow-up set for " + fmtDate(fu.due_date) + "." : ""));
      } else if (t === "deleteJob") {
        touch("jobs", job.id); d = { ...d, jobs: d.jobs.filter((j) => j.id !== job.id) };
        messages.push("Deleted " + jl(job) + ".");
      } else {
        const patch = {};
        if (a.new_title) patch.title = a.new_title;
        if (a.link) patch.job_link = a.link;
        ["source", "location", "priority", "deadline"].forEach((k) => { if (a[k]) patch[k] = a[k]; });
        if (a.notes) patch.notes = ((job.notes || "") + "\n[" + fmtDate(on) + "] " + a.notes).trim();
        touch("jobs", job.id); d = { ...d, jobs: d.jobs.map((j) => (j.id === job.id ? { ...j, ...patch, updated_at: todayISO() } : j)) };
        messages.push("Updated " + jl(job) + " (" + Object.keys(patch).map((k) => (k === "job_link" ? "link" : k)).join(", ") + ").");
      }
    } else if (t === "addFollowUp") {
      const job = findJob(a.job_id);
      if (!job) { messages.push("Skipped follow-up: that job no longer exists."); continue; }
      const auto = autoFU[job.id] && d.followups.find((f) => f.id === autoFU[job.id]);
      if (auto) {                                                     // same batch moved it to Applied: adjust that follow-up instead of adding a second
        d = { ...d, followups: d.followups.map((f) => (f.id === auto.id ? { ...f, due_date: a.due_date, title: a.title || f.title, type: a.type || f.type, notes: a.notes || f.notes } : f)) };
        messages.push("Follow-up for " + jl(job) + " set to " + fmtDate(a.due_date) + ".");
      } else {
        const f = { id: uid(), title: a.title || "Follow up", job_id: job.id, company_id: job.company_id, contact_name: "", type: a.type || "Email", due_date: a.due_date, status: "Pending", message_draft: "", notes: a.notes || "Added by HV AI." };
        touch("followups", f.id); d = { ...d, followups: [...d.followups, f] };
        messages.push("Follow-up for " + jl(job) + " on " + fmtDate(a.due_date) + ".");
      }
    } else if (t === "completeFollowUp") {
      const f = d.followups.find((x) => x.id === a.followup_id);
      if (!f || f.status === "Done") { messages.push("Skipped: that follow-up isn't pending."); continue; }
      touch("followups", f.id); d = { ...d, followups: d.followups.map((x) => (x.id === f.id ? { ...x, status: "Done", sent_date: x.sent_date || on, completed_date: on } : x)) };
      messages.push("Marked done: " + (f.title || "follow-up") + (cname(f.company_id) ? " (" + cname(f.company_id) + ")" : "") + ".");
    } else if (t === "addEvent") {
      const job = a.job_id && findJob(a.job_id);
      const ev = { id: uid(), title: a.title, type: a.type || "custom", date: a.date, time: a.time || "", company_id: job ? job.company_id : "", job_id: job ? job.id : "", contact: "", notes: a.notes || (a.duration_min ? a.duration_min + " min" : ""), status: "upcoming", priority: "Medium", reminder: "same" };
      touch("calendarEvents", ev.id); d = { ...d, calendarEvents: [...(d.calendarEvents || []), ev] };
      messages.push("Added to calendar: " + ev.title + ", " + fmtDate(ev.date) + (ev.time ? " at " + fmtTime(ev.time) : "") + ".");
    }
  }
  return { data: d, undo, messages };
}
function revertAI(d0, undo) {
  let d = d0;
  Object.keys(undo || {}).forEach((coll) => {
    let list = [...(d[coll] || [])];
    Object.entries(undo[coll]).forEach(([id, before]) => {
      const i = list.findIndex((x) => x.id === id);
      if (before === null) { if (i >= 0) list.splice(i, 1); }
      else if (i >= 0) list[i] = before; else list.push(before);
    });
    d = { ...d, [coll]: list };
  });
  return d;
}

/* Save a parsed/entered profile into the data: settings used across the app, the profile
   record, and (optionally) a master-resume entry with the long sections. */
function withProfile(d, f, addToMaster) {
  const st = { ...d.settings };
  if (f.name) st.myName = f.name;
  if (f.target_role) st.targetRole = f.target_role;
  if (f.location) st.locations = f.location;
  if (f.linkedin) st.linkedin = f.linkedin;
  if (f.portfolio) st.portfolio = f.portfolio;
  if (f.skills) st.skills = f.skills;
  let master = d.master;
  if (addToMaster && (f.experience || f.education || f.projects || f.summary)) {
    master = [...master, {
      id: uid(), title: "My profile — " + (f.name || "imported"),
      content: ["SUMMARY", f.summary || "—", "", "SKILLS", f.skills || "—", "", "EXPERIENCE", f.experience || "—", "", "EDUCATION", f.education || "—", "", "PROJECTS / CERTIFICATIONS", f.projects || "—"].join("\n"),
    }];
  }
  return { ...d, settings: st, profile: { ...f, saved_at: todayISO() }, master };
}

/* ================================================================== */
/* Profile setup (web): shown after Google sign-in until a profile exists.
   One question per screen, or upload a resume and the site's own Gemini
   (Firebase AI Logic) fills what it can; only missing fields are asked. */
/* ================================================================== */
const PS_STEPS = [
  { k: "name", q: "First things first. What's your name?", ph: "Your full name", req: true },
  { k: "target_role", q: "What role are you going after?", ph: "e.g. Growth Associate", req: true,
    chips: ["Growth", "Founder's Office", "Business Development", "Partnerships", "GTM", "Revenue Ops", "Product", "Marketing"] },
  { k: "location", q: "Where do you want to work?", ph: "e.g. Delhi NCR, Remote", multi: true,
    chips: ["Delhi NCR", "Remote", "Bengaluru", "Pune", "Mumbai", "Hyderabad", "Jaipur"] },
  { k: "email", q: "Which email do you use for applications?", ph: "you@example.com", type: "email" },
  { k: "phone", q: "Your phone number?", ph: "+91 …", type: "tel", optional: true },
  { k: "linkedin", q: "Your LinkedIn profile link?", ph: "linkedin.com/in/…", optional: true },
  { k: "portfolio", q: "A portfolio or personal website?", ph: "https://…", optional: true },
  { k: "skills", q: "What are your top skills?", ph: "Comma separated, e.g. SQL, outreach, Notion", optional: true },
  { k: "summary", q: "In two lines, who are you professionally?", ph: "What you do and what you're great at", long: true, optional: true },
  { k: "experience", q: "Your work experience", ph: "Company · role · dates · one line on what you did", long: true, optional: true },
  { k: "education", q: "Your education", ph: "College · degree · year", long: true, optional: true },
];
const PS_LABEL = { name: "Name", target_role: "Target role", location: "Location", email: "Email", phone: "Phone", linkedin: "LinkedIn", portfolio: "Portfolio", skills: "Skills", summary: "Summary", experience: "Experience", education: "Education", projects: "Projects & certifications" };

function ProfileSetup({ data, setData, upsert, notify, onLater, onSaved }) {
  const cloudUser = (typeof window !== "undefined" && window.hv && window.hv.cloud && window.hv.cloud.user) || null;
  const [phase, setPhase] = useState("welcome");          // welcome | upload | reading | ask | review | done
  const [f, setF] = useState(() => ({ name: data.settings.myName || (cloudUser && cloudUser.name) || "", email: (cloudUser && cloudUser.email) || "" }));
  const [queue, setQueue] = useState([]);
  const [qi, setQi] = useState(0);
  const [fromResume, setFromResume] = useState(null);     // { found, total, ai }
  const [resumeRec, setResumeRec] = useState(null);
  const [aiNote, setAiNote] = useState("");
  const fileRef = useRef(null), inputRef = useRef(null);
  const first = (f.name || (cloudUser && cloudUser.name) || "").trim().split(/\s+/)[0];

  useEffect(() => { if (inputRef.current) inputRef.current.focus(); }, [phase, qi]);

  const startManual = () => { setQueue(PS_STEPS); setQi(0); setFromResume(null); setPhase("ask"); };
  const setVal = (k, v) => setF((x) => ({ ...x, [k]: v }));

  const onFile = async (file) => {
    if (!file) return;
    if (!/\.(pdf|doc|docx)$/i.test(file.name)) return notify("Please upload a PDF or Word (.docx) file");
    if (file.size > MAX_FILE_MB * 1024 * 1024) return notify("File too large — keep it under " + MAX_FILE_MB + " MB");
    setPhase("reading");
    try {
      const b64 = await new Promise((res, rej) => { const r = new FileReader(); r.onload = () => res(String(r.result).split(",")[1]); r.onerror = () => rej(new Error("read failed")); r.readAsDataURL(file); });
      const id = uid();
      try { await window.storage.set(FILE_KEY(id), JSON.stringify({ name: file.name, mime: file.type || "application/octet-stream", data: b64 })); } catch (e) {}
      const rec = {
        id, title: file.name.replace(/\.(pdf|doc|docx)$/i, ""), file_name: file.name,
        doc_type: "Resume", version: "", target_role: "", target_company: "", target_industry: "",
        skills_highlighted: "", experience_highlighted: "", notes: "", tags: [],
        status: "Active", is_master: true, has_file: true, uploaded_at: todayISO(), updated_at: todayISO(),
      };
      upsert("resumes", rec); setResumeRec(rec);
      let text = "";
      try { text = await extractResumeText(file); } catch (e) {}
      const isPdf = /\.pdf$/i.test(file.name);
      let parsed = localParseResume(text), ai = false, note = "";
      const hv = window.hv || {};
      if (hv.aiParseProject && (text.trim() || isPdf)) {
        const r = await hv.aiParseProject({ text, pdfBase64: isPdf ? b64 : null });
        if (r && r.ok && r.data) { PARSE_FIELDS.forEach((k) => { if (r.data[k]) parsed[k] = String(r.data[k]).trim(); }); ai = true; }
        else note = (r && r.error) || "AI reading failed";
      }
      const st = data.settings;
      if (!ai && st.aiProvider && st.aiProvider !== "off" && st.aiKey && text && hv.aiParse) {       // the user's own key, if they set one
        const r = await hv.aiParse({ provider: st.aiProvider, apiKey: st.aiKey, model: st.aiModel || "", text });
        if (r && r.ok && r.data) { PARSE_FIELDS.forEach((k) => { if (r.data[k]) parsed[k] = String(r.data[k]).trim(); }); ai = true; note = ""; }
      }
      const merged = { ...f };
      PARSE_FIELDS.forEach((k) => { if (parsed[k] && String(parsed[k]).trim()) merged[k] = String(parsed[k]).trim(); });
      const missing = PS_STEPS.filter((s) => !String(merged[s.k] || "").trim());
      const found = PS_STEPS.length - missing.length;
      setF(merged); setFromResume({ found, total: PS_STEPS.length, ai });
      setAiNote(ai ? "" : (note ? note + " — used the basic reader instead." : "Used the basic reader."));
      if (!text.trim() && !ai) notify("Couldn't read text from this file — let's fill it in together");
      setQueue(missing); setQi(0); setPhase(missing.length ? "ask" : "review");
    } catch (e) {
      notify("Something went wrong reading that file — let's fill it in together");
      startManual();
    }
  };

  const step = queue[qi];
  const val = step ? (f[step.k] || "") : "";
  const canNext = step && (!step.req || String(val).trim());
  const next = () => { if (!canNext) return; if (qi + 1 < queue.length) setQi(qi + 1); else setPhase("review"); };
  const skip = () => { if (step) setVal(step.k, ""); if (qi + 1 < queue.length) setQi(qi + 1); else setPhase("review"); };
  const back = () => { if (qi > 0) setQi(qi - 1); else setPhase(fromResume ? "upload" : "welcome"); };
  const toggleChip = (c) => {
    if (!step.multi) { setVal(step.k, c); return; }
    const cur = String(val).split(",").map((x) => x.trim()).filter(Boolean);
    setVal(step.k, (cur.includes(c) ? cur.filter((x) => x !== c) : [...cur, c]).join(", "));
  };

  const save = () => {
    const clean = {};
    Object.keys(f).forEach((k) => { if (String(f[k] || "").trim()) clean[k] = String(f[k]).trim(); });
    setData((d) => withProfile(d, clean, true));
    if (resumeRec) upsert("resumes", { ...resumeRec, parsed: { ...clean }, skills_highlighted: clean.skills || "", target_role: clean.target_role || "" });
    onSaved(); setPhase("done");
  };

  const progress = phase === "ask" ? (qi + 1) / Math.max(queue.length, 1) : phase === "review" || phase === "done" ? 1 : 0;

  return (
    <div className="ps" role="dialog" aria-modal="true" aria-label="Set up your profile">
      <div className="ps-hair"><i style={{ transform: "scaleX(" + progress + ")" }} /></div>
      <div className="ps-card" key={phase + ":" + qi}>
        {phase === "welcome" && (
          <>
            <div className="ps-eyebrow">{first ? "Welcome, " + first : "Welcome"}</div>
            <h1 className="ps-q">Let's set up your profile.</h1>
            <p className="ps-sub">It powers your greetings, templates and resume tailoring. About two minutes.</p>
            <div className="ps-options">
              <button className="ps-opt" onClick={() => setPhase("upload")}>
                <span className="ps-opt-ico"><Sparkles size={20} /></span>
                <strong>Upload my resume</strong>
                <span>AI reads it and fills everything. You only answer what's missing.</span>
              </button>
              <button className="ps-opt" onClick={startManual}>
                <span className="ps-opt-ico"><Pencil size={19} /></span>
                <strong>Answer step by step</strong>
                <span>A few quick questions, one at a time.</span>
              </button>
            </div>
            <button className="ps-link" onClick={onLater}>I'll do it later</button>
          </>
        )}

        {phase === "upload" && (
          <>
            <div className="ps-eyebrow">Fastest way</div>
            <h1 className="ps-q">Drop in your resume.</h1>
            <p className="ps-sub">We'll pull out your details and only ask about anything we can't find.</p>
            <div className="ps-drop" onClick={() => fileRef.current && fileRef.current.click()}
              onDragOver={(e) => e.preventDefault()} onDrop={(e) => { e.preventDefault(); onFile(e.dataTransfer.files && e.dataTransfer.files[0]); }}>
              <Upload size={26} strokeWidth={1.6} />
              <strong>Choose your resume</strong>
              <span>PDF or Word · up to {MAX_FILE_MB} MB · LinkedIn "Save to PDF" works too</span>
              <input ref={fileRef} type="file" accept=".pdf,.doc,.docx" style={{ display: "none" }} onChange={(e) => { onFile(e.target.files && e.target.files[0]); e.target.value = ""; }} />
            </div>
            <div className="ps-row">
              <button className="btn btn-ghost" onClick={() => setPhase("welcome")}>Back</button>
              <button className="ps-link" onClick={startManual}>No resume? Answer step by step</button>
            </div>
          </>
        )}

        {phase === "reading" && (
          <div className="ps-reading">
            <div className="ps-orb" />
            <h1 className="ps-q">Reading your resume…</h1>
            <p className="ps-sub">Pulling out your name, role, skills and experience.</p>
          </div>
        )}

        {phase === "ask" && step && (
          <>
            <div className="ps-eyebrow">
              {fromResume ? (qi === 0 ? "Found " + fromResume.found + " of " + fromResume.total + " in your resume · a few left" : "Almost there") : "Step " + (qi + 1) + " of " + queue.length}
            </div>
            <h1 className="ps-q">{step.q}</h1>
            {fromResume && qi === 0 && aiNote && <p className="ps-note">{aiNote}</p>}
            {step.long
              ? <textarea ref={inputRef} className="ps-input ps-area" value={val} placeholder={step.ph} rows={5} onChange={(e) => setVal(step.k, e.target.value)} />
              : <input ref={inputRef} className="ps-input" type={step.type || "text"} value={val} placeholder={step.ph}
                  onChange={(e) => setVal(step.k, e.target.value)} onKeyDown={(e) => { if (e.key === "Enter") { e.preventDefault(); next(); } }} />}
            {step.chips && (
              <div className="ps-chips">
                {step.chips.map((c) => {
                  const on = step.multi ? String(val).split(",").map((x) => x.trim()).includes(c) : val === c;
                  return <button key={c} className={"ps-chip" + (on ? " on" : "")} onClick={() => toggleChip(c)}>{c}</button>;
                })}
              </div>
            )}
            <div className="ps-row">
              <button className="btn btn-ghost" onClick={back}>Back</button>
              <span style={{ flex: 1 }} />
              {step.optional && <button className="ps-link" onClick={skip}>Skip</button>}
              <button className="btn btn-primary ps-next" disabled={!canNext} onClick={next}>{qi + 1 < queue.length ? "Continue" : "Review"}</button>
            </div>
          </>
        )}

        {phase === "review" && (
          <>
            <div className="ps-eyebrow">{fromResume && fromResume.ai ? "Filled with AI · check it over" : "Last step"}</div>
            <h1 className="ps-q">Does this look right?</h1>
            <div className="ps-review">
              {[...PS_STEPS.map((x) => x.k), ...(f.projects ? ["projects"] : [])].map((k) => {
                const long = ["summary", "experience", "education", "projects"].includes(k);
                return (
                  <label key={k} className={"ps-field" + (long ? " wide" : "")}>
                    <span>{PS_LABEL[k]}</span>
                    {long ? <textarea className="ps-input ps-sm" rows={3} value={f[k] || ""} onChange={(e) => setVal(k, e.target.value)} />
                          : <input className="ps-input ps-sm" value={f[k] || ""} onChange={(e) => setVal(k, e.target.value)} />}
                  </label>
                );
              })}
            </div>
            <div className="ps-row">
              <button className="btn btn-ghost" onClick={() => { if (queue.length) { setQi(queue.length - 1); setPhase("ask"); } else setPhase(fromResume ? "upload" : "welcome"); }}>Back</button>
              <span style={{ flex: 1 }} />
              <button className="btn btn-primary ps-next" disabled={!String(f.name || "").trim()} onClick={save}>Save my profile</button>
            </div>
          </>
        )}

        {phase === "done" && (
          <div className="ps-reading">
            <div className="ps-orb done"><CheckCircle2 size={34} /></div>
            <h1 className="ps-q">You're all set{first ? ", " + first : ""}.</h1>
            <p className="ps-sub">Your profile is saved to your account. Let's find your next role.</p>
            <button className="btn btn-primary ps-next" onClick={onLater}>Open my dashboard</button>
          </div>
        )}
      </div>
    </div>
  );
}

function SetupWizard({ data, setData, upsert, notify, onClose }) {
  const [step, setStep] = useState("choose"); // choose | ai | upload | review | manual
  const [prov, setProv] = useState("gemini");
  const [key, setKey] = useState("");
  const [testing, setTesting] = useState(false);
  const [testMsg, setTestMsg] = useState(null);
  const [busy, setBusy] = useState(false);
  const [raw, setRaw] = useState("");
  const [showRaw, setShowRaw] = useState(false);
  const [usedAI, setUsedAI] = useState(false);
  const [uploadedResume, setUploadedResume] = useState(null);
  const [f, setF] = useState({});
  const [addToMaster, setAddToMaster] = useState(true);
  const fileRef = useRef(null);
  const set = (k) => (e) => setF({ ...f, [k]: e.target.value });
  const aiConnected = data.settings.aiProvider && data.settings.aiProvider !== "off" && data.settings.aiKey;

  const testConnection = async () => {
    if (!(typeof window !== "undefined" && window.hv && window.hv.aiTest)) { setTestMsg({ ok: false, text: "Connection testing works in the desktop app" }); return; }
    setTesting(true); setTestMsg(null);
    const r = await window.hv.aiTest({ provider: prov, apiKey: key.trim(), model: "" });
    setTesting(false);
    if (r && r.ok) {
      setTestMsg({ ok: true, text: "Connected! AI-assisted parsing is ready." });
      setData((d) => ({ ...d, settings: { ...d.settings, aiProvider: prov, aiKey: key.trim() } }));
    } else setTestMsg({ ok: false, text: (r && r.error) || "Connection failed" });
  };

  const runParse = async (text) => {
    let parsed = localParseResume(text);
    let ai = false;
    const st = data.settings;
    if (st.aiProvider && st.aiProvider !== "off" && st.aiKey && text && typeof window !== "undefined" && window.hv && window.hv.aiParse) {
      try {
        const r = await window.hv.aiParse({ provider: st.aiProvider, apiKey: st.aiKey, model: st.aiModel || "", text });
        if (r && r.ok && r.data) { PARSE_FIELDS.forEach((k) => { if (r.data[k]) parsed[k] = String(r.data[k]); }); ai = true; }
        else if (r && r.error) notify("AI failed (" + r.error + ") — using local parse");
      } catch (e) { notify("AI failed — using local parse"); }
    }
    return { parsed, ai };
  };

  const onFile = async (file) => {
    if (!file) return;
    if (!/\.(pdf|doc|docx)$/i.test(file.name)) return notify("Please upload a PDF, DOC, or DOCX file");
    if (file.size > MAX_FILE_MB * 1024 * 1024) return notify("File too large — keep it under " + MAX_FILE_MB + " MB");
    setBusy(true);
    try {
      const b64 = await new Promise((res, rej) => {
        const r = new FileReader();
        r.onload = () => res(String(r.result).split(",")[1]);
        r.onerror = () => rej(new Error("read failed"));
        r.readAsDataURL(file);
      });
      const id = uid();
      try { await window.storage.set(FILE_KEY(id), JSON.stringify({ name: file.name, mime: file.type || "application/octet-stream", data: b64 })); } catch (e) {}
      const rec = {
        id, title: file.name.replace(/\.(pdf|doc|docx)$/i, ""), file_name: file.name,
        doc_type: "Resume", version: "", target_role: "", target_company: "", target_industry: "",
        skills_highlighted: "", experience_highlighted: "", notes: "", tags: [],
        status: "Active", is_master: true, has_file: true, uploaded_at: todayISO(), updated_at: todayISO(),
      };
      upsert("resumes", rec);
      setUploadedResume(rec);
      let text = "";
      try { text = await extractResumeText(file); } catch (e) { text = ""; }
      setRaw(text); setShowRaw(!text.trim());
      if (!text.trim()) notify("Couldn't read text from this file — paste it manually in the next screen");
      const res = await runParse(text);
      setF(res.parsed); setUsedAI(res.ai); setStep("review");
    } catch (e) {
      notify("Something went wrong reading that file — try another file or set up manually");
    } finally { setBusy(false); }
  };

  const rerunLocal = () => { setF({ ...localParseResume(raw) }); setUsedAI(false); notify("Local parse re-run"); };
  const rerunAI = async () => { setBusy(true); const r = await runParse(raw); setF(r.parsed); setUsedAI(r.ai); setBusy(false); };

  const saveProfile = () => {
    setData((d) => withProfile(d, f, addToMaster));
    if (uploadedResume) upsert("resumes", { ...uploadedResume, parsed: { ...f }, skills_highlighted: f.skills || "", target_role: f.target_role || "" });
    notify("Profile saved — welcome, " + (f.name ? f.name.split(" ")[0] : "aboard") + "! 🎉");
    onClose();
  };

  const TITLES = {
    choose: "Welcome to HV Vault 👋", ai: "Connect AI (optional)",
    upload: "Auto-fill from your resume", review: "Review your profile " + (usedAI ? "(AI-assisted)" : "(local parser)"),
    manual: "Your details",
  };

  return (
    <Modal title={TITLES[step]} onClose={onClose} wide>
      {step === "choose" && (
        <div>
          <p style={{ marginBottom: 4 }}>Your personal job-hunt command center — no account, no cloud, everything stays {ON_DEVICE()}.</p>
          <p className="muted small" style={{ marginBottom: 10 }}>How would you like to set up your profile?</p>
          <div className="setup-options">
            <button className="setup-opt" onClick={() => setStep("manual")}>
              <Pencil size={17} /><strong>Manual setup</strong>
              <span>Type your details yourself. 2 minutes, fully offline.</span>
            </button>
            <button className="setup-opt" onClick={() => setStep("upload")}>
              <Upload size={17} /><strong>Upload resume / LinkedIn PDF</strong>
              <span>The built-in local parser auto-fills your profile. Offline, no key needed.</span>
            </button>
            <button className="setup-opt" onClick={() => setStep("ai")}>
              <Sparkles size={17} /><strong>Connect AI for smarter auto-fill</strong>
              <span>Use your own free Gemini or OpenRouter key for cleaner extraction. Optional — off by default.</span>
            </button>
          </div>
          <button className="text-link" onClick={onClose}>Skip for now — explore the app first</button>
          <WizardCloudLink onClose={onClose} />
        </div>
      )}

      {step === "ai" && (
        <div>
          <p className="hint-strip" style={{ alignItems: "flex-start" }}><Sparkles size={15} style={{ marginTop: 2 }} />
            <span>AI is optional. If enabled, resume/profile text will be sent only to the selected AI provider to extract structured profile information. Your API key is stored locally {ON_DEVICE()}. You can skip this and use HV Vault offline.</span>
          </p>
          <div className="form-grid">
            <Field label="AI provider">
              <select className="input" value={prov} onChange={(e) => { setProv(e.target.value); setTestMsg(null); }}>
                <option value="gemini">Gemini API (Google)</option>
                <option value="openrouter">OpenRouter API</option>
              </select>
            </Field>
            <Field label="API key">
              <input className="input" type="password" value={key} onChange={(e) => { setKey(e.target.value); setTestMsg(null); }} placeholder="Paste your key here" />
            </Field>
          </div>
          <p className="muted small" style={{ marginTop: 8 }}>Free keys: Gemini — aistudio.google.com → "Get API key" · OpenRouter — openrouter.ai → Keys.</p>
          <div className="btn-row" style={{ marginTop: 10 }}>
            <button className="btn btn-primary" disabled={testing || !key.trim()} onClick={testConnection}>{testing ? "Testing…" : "Test connection"}</button>
          </div>
          {testMsg && <div className={"test-msg " + (testMsg.ok ? "ok" : "bad")}>{testMsg.ok ? "✓ " : "✕ "}{testMsg.text}{!testMsg.ok && " — you can continue without AI and enable it later in Settings."}</div>}
          <div className="modal-foot">
            <button className="btn btn-ghost" onClick={() => setStep("choose")}>Back</button>
            <button className="btn btn-ghost" onClick={() => setStep("upload")}>Continue without AI</button>
            <button className="btn btn-primary" disabled={!(testMsg && testMsg.ok)} onClick={() => setStep("upload")}>Continue</button>
          </div>
        </div>
      )}

      {step === "upload" && (
        <div>
          <p className="muted small" style={{ marginBottom: 10 }}>
            {aiConnected ? "✓ AI connected — parsing will be AI-enhanced." : "Using the built-in local parser (offline)."}
          </p>
          <div className="dropzone" style={{ marginBottom: 12 }} onClick={() => !busy && fileRef.current && fileRef.current.click()}
            onDragOver={(e) => e.preventDefault()} onDrop={(e) => { e.preventDefault(); if (!busy) onFile(e.dataTransfer.files && e.dataTransfer.files[0]); }}>
            <Upload size={22} strokeWidth={1.6} />
            <div><strong>{busy ? "Reading your resume…" : "Drop your resume or LinkedIn PDF here"}</strong>{!busy && " or click to browse"}</div>
            <div className="muted small">PDF, DOC, DOCX · up to {MAX_FILE_MB} MB · saved to your vault</div>
            <input ref={fileRef} type="file" accept=".pdf,.doc,.docx" style={{ display: "none" }}
              onChange={(e) => { onFile(e.target.files && e.target.files[0]); e.target.value = ""; }} />
          </div>
          <p className="muted small">LinkedIn users: open your profile → <strong>More → Save to PDF</strong>, then upload that file here. HV Vault never fetches anything from LinkedIn URLs — a URL is only saved as a link on your profile.</p>
          <div className="modal-foot">
            <button className="btn btn-ghost" onClick={() => setStep("choose")}>Back</button>
            <button className="btn btn-ghost" onClick={() => setStep("manual")}>Set up manually instead</button>
          </div>
        </div>
      )}

      {step === "review" && (
        <div>
          <p className="muted small" style={{ marginBottom: 12 }}>Parsers make mistakes — check and fix everything below. Nothing is saved until you click Save Profile.</p>
          <div className="form-grid">
            <Field label="Name"><input className="input" value={f.name || ""} onChange={set("name")} /></Field>
            <Field label="Email"><input className="input" value={f.email || ""} onChange={set("email")} /></Field>
            <Field label="Phone"><input className="input" value={f.phone || ""} onChange={set("phone")} /></Field>
            <Field label="Location"><input className="input" value={f.location || ""} onChange={set("location")} /></Field>
            <Field label="LinkedIn URL (saved as a link only)"><input className="input" value={f.linkedin || ""} onChange={set("linkedin")} /></Field>
            <Field label="Portfolio URL"><input className="input" value={f.portfolio || ""} onChange={set("portfolio")} /></Field>
            <Field label="Target role / headline" span><input className="input" value={f.target_role || ""} onChange={set("target_role")} /></Field>
            <Field label="Skills (comma separated)" span><input className="input" value={f.skills || ""} onChange={set("skills")} /></Field>
            <Field label="Summary" span><textarea className="input" rows={2} value={f.summary || ""} onChange={set("summary")} /></Field>
            <Field label="Experience" span><textarea className="input" rows={4} value={f.experience || ""} onChange={set("experience")} /></Field>
            <Field label="Education" span><textarea className="input" rows={2} value={f.education || ""} onChange={set("education")} /></Field>
            <Field label="Projects / certifications" span><textarea className="input" rows={2} value={f.projects || ""} onChange={set("projects")} /></Field>
          </div>
          <label className="check-item" style={{ marginTop: 12 }}>
            <input type="checkbox" checked={addToMaster} onChange={() => setAddToMaster(!addToMaster)} />
            <span>Also save experience/education/projects into Master Resume Data</span>
          </label>
          <div style={{ marginTop: 12 }}>
            <button className="text-link" onClick={() => setShowRaw(!showRaw)}>{showRaw ? "Hide extracted text" : "Show / edit extracted text"}</button>
            {showRaw && (
              <div>
                <textarea className="input" rows={5} style={{ width: "100%", marginTop: 8 }} value={raw} onChange={(e) => setRaw(e.target.value)}
                  placeholder="If extraction failed (scanned PDF or old .doc), paste your resume text here and re-run." />
                <div className="btn-row" style={{ marginTop: 8 }}>
                  <button className="btn btn-ghost btn-sm" onClick={rerunLocal}>Re-run local parse</button>
                  <button className="btn btn-ghost btn-sm" disabled={busy} onClick={rerunAI}>{busy ? "Asking AI…" : "Re-run with AI"}</button>
                </div>
              </div>
            )}
          </div>
          <div className="modal-foot">
            <button className="btn btn-ghost" onClick={() => setStep("upload")}>Back</button>
            <button className="btn btn-primary" onClick={saveProfile}>Save Profile</button>
          </div>
        </div>
      )}

      {step === "manual" && (
        <div>
          <p className="muted small" style={{ marginBottom: 12 }}>Just the basics — everything can be changed later on the Profile page.</p>
          <div className="form-grid">
            <Field label="Name"><input className="input" value={f.name || ""} onChange={set("name")} autoFocus /></Field>
            <Field label="Target role / headline"><input className="input" value={f.target_role || ""} onChange={set("target_role")} placeholder="e.g. Growth Marketing Associate" /></Field>
            <Field label="Location"><input className="input" value={f.location || ""} onChange={set("location")} /></Field>
            <Field label="Email"><input className="input" value={f.email || ""} onChange={set("email")} /></Field>
            <Field label="LinkedIn URL (saved as a link only)"><input className="input" value={f.linkedin || ""} onChange={set("linkedin")} /></Field>
            <Field label="Portfolio URL"><input className="input" value={f.portfolio || ""} onChange={set("portfolio")} /></Field>
            <Field label="Key skills (comma separated)" span><input className="input" value={f.skills || ""} onChange={set("skills")} /></Field>
          </div>
          <div className="modal-foot">
            <button className="btn btn-ghost" onClick={() => setStep("choose")}>Back</button>
            <button className="btn btn-primary" onClick={saveProfile}>Save Profile</button>
          </div>
        </div>
      )}
    </Modal>
  );
}

/* ================================================================== */
/* Dashboard + Action Center                                           */
/* ================================================================== */

function buildActions(data, today) {
  const { jobs, companies, followups, resumes, snoozes } = data;
  const cname = (id) => companies.find((c) => c.id === id)?.name || "";
  const actions = [];
  const notSnoozed = (key) => !snoozes[key] || snoozes[key] <= today;

  followups.filter((f) => f.status === "Pending" && f.due_date && f.due_date <= today).forEach((f) => {
    const j = jobs.find((x) => x.id === f.job_id);
    actions.push({
      key: "fu-" + f.id, kind: "fu", id: f.id, jobId: f.job_id,
      company: cname(f.company_id) || (j ? cname(j.company_id) : "General"),
      title: f.title || (f.type + " follow-up"), status: j ? j.status : "",
      reason: f.due_date < today ? "Follow-up overdue since " + fmtDate(f.due_date) : "Follow-up due today",
      suggestion: "Send it now — use a template, personalize one line",
      tone: f.due_date < today ? "late" : "warn",
    });
  });

  jobs.forEach((j) => {
    if (["Closed", "Rejected"].includes(j.status)) return;
    if (!notSnoozed("job-" + j.id)) return;
    const na = jobNextAction(j, followups, today);
    if (!na || na.tone === "neutral") return;
    if (na.tone === "info" && !(j.deadline && j.deadline >= today && daysBetween(today, j.deadline) <= 5) && !INTERVIEW_STAGES.includes(j.status)) return;
    if (actions.some((a) => a.jobId === j.id)) return;
    actions.push({
      key: "job-" + j.id, kind: "job", id: j.id, jobId: j.id,
      company: cname(j.company_id), title: j.title, status: j.status,
      reason: na.why, suggestion: na.text, tone: na.tone,
    });
  });

  companies.filter((c) => c.next_check_date && c.next_check_date <= today && notSnoozed("co-" + c.id)).forEach((c) => {
    actions.push({
      key: "co-" + c.id, kind: "company", id: c.id, company: c.name, title: "Company check due",
      status: c.status || "", reason: "You planned to re-check this company on " + fmtDate(c.next_check_date),
      suggestion: "Scan their careers page for new roles", tone: "info",
    });
  });

  (data.calendarEvents || []).forEach((ev) => {
    if (ev.status !== "upcoming" || !ev.date) return;
    if (!notSnoozed("ev-" + ev.id)) return;
    const lead = REMINDER_DAYS[ev.reminder || "same"];
    const overdue = ev.date < today;
    const inWindow = lead >= 0 && ev.date >= today && daysBetween(today, ev.date) <= lead;
    if (!overdue && !inWindow) return;
    actions.push({
      key: "ev-" + ev.id, kind: "event", id: ev.id, jobId: ev.job_id || null,
      company: ev.company_id ? cname(ev.company_id) : "Calendar", title: ev.title || "Event", status: "",
      reason: overdue ? "Event date passed (" + fmtDate(ev.date) + ")" : (EVENT_TYPE_LABEL[ev.type] || "Event") + " on " + fmtDate(ev.date) + (ev.time ? " at " + fmtTime(ev.time) : ""),
      suggestion: overdue ? "Mark done, reschedule, or cancel it" : "Prepare — it's coming up",
      tone: overdue ? "late" : "info",
    });
  });

  const master = resumes.find((r) => r.is_master);
  if (resumes.length > 0 && !master && notSnoozed("resume-master")) {
    actions.push({ key: "resume-master", kind: "vault", id: "master", company: "Resume Vault", title: "No master resume set",
      reason: "A master resume anchors all your versions", suggestion: "Open the Vault and star one resume as Master", tone: "info" });
  }
  if (master && master.updated_at && daysBetween(master.updated_at, today) >= 45 && notSnoozed("resume-fresh")) {
    actions.push({ key: "resume-fresh", kind: "vault", id: "fresh", company: "Resume Vault", title: "Master resume is getting stale",
      reason: "Last updated " + fmtDate(master.updated_at), suggestion: "Refresh it with your latest wins", tone: "warn" });
  }

  const order = { late: 0, warn: 1, info: 2, good: 3 };
  return actions.sort((a, b) => (order[a.tone] ?? 9) - (order[b.tone] ?? 9));
}

/* Dashboard hero: time-of-day greeting, a rotating job-hunt line, and this week's momentum. */
const HERO_LINES = [
  "You only need one yes. Every application is another shot at it.",
  "Rejections are data, not verdicts. Adjust and send the next one.",
  "Follow up today. Most people don't, and that's your edge.",
  "One tailored application beats ten rushed ones.",
  "Your next team is looking for someone like you right now.",
  "Show up for twenty minutes. Momentum does the rest.",
  "Small steps every day add up to an offer letter.",
  "Talk to two humans today. Referrals open doors that portals don't.",
];
function DashHero({ name, sub, thisWeek, responseRate, inPlay }) {
  const [i, setI] = useState(() => Math.floor(Math.random() * HERO_LINES.length));
  const [fade, setFade] = useState(false);
  useEffect(() => {
    const t = setInterval(() => { setFade(true); setTimeout(() => { setI((x) => (x + 1) % HERO_LINES.length); setFade(false); }, 900); }, 10000);
    return () => clearInterval(t);
  }, []);
  const now = new Date(), h = now.getHours();
  const greet = h >= 5 && h < 12 ? "Good morning" : h >= 12 && h < 17 ? "Good afternoon" : h >= 17 && h < 22 ? "Good evening" : "Late-night grind";
  const date = now.toLocaleDateString("en-IN", { weekday: "long", day: "numeric", month: "long" });
  return (
    <section className="hero">
      <div className="hero-date">{date}</div>
      <h1>{greet}, <b>{name}</b>.</h1>
      <p className="hero-sub">{sub}</p>
      <p className={"hero-quote" + (fade ? " fade" : "")}>{HERO_LINES[i]}</p>
      <div className="hero-chips">
        <span className="hero-chip"><Zap size={15} /><strong>{thisWeek}</strong> applied this week</span>
        <span className="hero-chip"><Star size={15} /><strong>{inPlay}</strong> in interviews</span>
        <span className="hero-chip gold"><Sparkles size={15} /><strong>{responseRate}%</strong> response rate</span>
      </div>
    </section>
  );
}

function Dashboard({ data, setPage, setModal, openJob, moveJob, upsert, snoozeItem, addNoteTo, notify }) {
  const { jobs, companies, followups, resumes } = data;
  const today = todayISO();

  const applied = jobs.filter((j) => APPLIED_STAGES.includes(j.status));
  const responded = jobs.filter((j) => RESPONSE_STAGES.includes(j.status));
  const waiting = jobs.filter((j) => ["Applied", "Follow-up Needed"].includes(j.status));
  const responseRate = applied.length ? Math.round((responded.length / applied.length) * 100) : 0;
  const thisWeek = jobs.filter((j) => j.date_applied && weekKey(j.date_applied) === weekKey(today)).length;
  const lateFUs = followups.filter((f) => f.status === "Pending" && f.due_date && f.due_date < today).length;
  const dueFUs = followups.filter((f) => f.status === "Pending" && f.due_date === today).length;

  const resumeStats = resumes.map((r) => {
    const used = jobs.filter((j) => j.resume_id === r.id && APPLIED_STAGES.includes(j.status));
    const replies = used.filter((j) => RESPONSE_STAGES.includes(j.status));
    return { r, apps: used.length, replies: replies.length, rate: used.length ? replies.length / used.length : 0 };
  }).filter((s) => s.apps > 0).sort((a, b) => b.rate - a.rate || b.apps - a.apps);
  const bestResume = resumeStats[0];

  const sourceCounts = {};
  jobs.forEach((j) => { if (j.source) sourceCounts[j.source] = (sourceCounts[j.source] || 0) + 1; });
  const topSource = Object.entries(sourceCounts).sort((a, b) => b[1] - a[1])[0];

  const actions = buildActions(data, today);
  const micro = lateFUs > 0
    ? "Clear the red first — no missed opportunities."
    : actions.length > 0
      ? "Follow-ups due today. Small actions compound."
      : "Pipeline is clean. You're building momentum.";

  const byStatus = STAGES.map((s) => ({ name: s, count: jobs.filter((j) => j.status === s).length })).filter((r) => r.count > 0);
  const weeks = {};
  jobs.forEach((j) => { if (j.date_applied) { const k = weekKey(j.date_applied); weeks[k] = (weeks[k] || 0) + 1; } });
  const byWeek = Object.entries(weeks).sort(([a], [b]) => a.localeCompare(b)).slice(-8)
    .map(([k, v]) => ({ week: fmtDate(k).replace(/ \d{4}$/, ""), apps: v }));

  const markActionDone = (a) => {
    if (a.kind === "fu") {
      const f = followups.find((x) => x.id === a.id);
      upsert("followups", { ...f, status: "Done", sent_date: f.sent_date || today, completed_date: today });
      notify("Nice. Marked done ✓");
    } else if (a.kind === "company") {
      const c = companies.find((x) => x.id === a.id);
      upsert("companies", { ...c, last_checked_date: today, next_check_date: addDays(today, 14) });
      notify("Checked — next check in 14 days");
    } else if (a.kind === "event") {
      const ev = (data.calendarEvents || []).find((x) => x.id === a.id);
      if (ev) { upsert("calendarEvents", { ...ev, status: "done" }); notify("Event marked done ✓"); }
    } else if (a.kind === "job") {
      openJob(a.id);
    } else { setPage("vault"); }
  };

  return (
    <div>
      <DashHero name={data.settings.myName || "there"} sub={micro} thisWeek={thisWeek} responseRate={responseRate}
        inPlay={jobs.filter((j) => ["Interview", "Assignment", "Final Round"].includes(j.status)).length} />

      {/* Action Center */}
      <section className="action-center">
        <div className="ac-head">
          <div className="ac-title"><Zap size={16} /> Action Center</div>
          <span className="ac-count">{actions.length === 0 ? "All clear" : actions.length + " action" + (actions.length > 1 ? "s" : "") + " waiting"}</span>
        </div>
        {actions.length === 0 ? (
          <p className="ac-clear">Nothing needs you right now. Today's move: source one fresh role, customize, apply, message two humans. Done in 10 minutes.</p>
        ) : (
          <div className="ac-list">
            {actions.slice(0, 6).map((a) => (
              <div key={a.key} className={"ac-item tone-" + a.tone}>
                <div className="ac-main">
                  <div className="ac-row1">
                    <strong>{a.company}</strong>
                    {a.title && <span className="ac-jobtitle">{a.title}</span>}
                    {a.status && <StageBadge stage={a.status} />}
                  </div>
                  <div className="ac-reason">{a.reason}</div>
                  <div className="ac-suggest"><ChevronRight size={13} /> {a.suggestion}</div>
                </div>
                <div className="ac-btns">
                  {a.kind === "fu" && <button className="btn btn-good btn-sm" onClick={() => markActionDone(a)}><CheckCircle2 size={13} /> Done</button>}
                  {a.kind !== "fu" && <button className={"btn btn-sm " + (a.kind === "event" ? "btn-good" : "btn-ghost")} onClick={() => markActionDone(a)}>{a.kind === "job" ? "Open" : a.kind === "company" ? "✓ Checked" : a.kind === "event" ? "✓ Done" : "Open Vault"}</button>}
                  <button className="btn btn-ghost btn-sm" onClick={() => snoozeItem(a.kind === "fu" ? "fu" : "generic", a.kind === "fu" ? a.id : a.key)}><AlarmClock size={13} /> Snooze</button>
                  {(a.kind === "fu" || a.kind === "job" || a.kind === "company") &&
                    <button className="btn btn-ghost btn-sm" onClick={() => addNoteTo(a.kind === "fu" ? "fu" : a.kind === "company" ? "company" : "job", a.id)}>Note</button>}
                  {a.jobId && <button className="btn btn-ghost btn-sm" onClick={() => openJob(a.jobId)}>Move stage</button>}
                </div>
              </div>
            ))}
            {actions.length > 6 && <button className="text-link" onClick={() => setPage("pending")}>See all {actions.length} in Pending Work →</button>}
          </div>
        )}
      </section>

      {/* Stats */}
      <div className="stat-grid">
        <StatCard label="Jobs saved" value={jobs.length} onClick={() => setPage("jobs")} />
        <StatCard label="Applied" value={applied.length} accent onClick={() => setPage("pipeline")} />
        <StatCard label="Companies" value={companies.length} onClick={() => setPage("companies")} />
        <StatCard label="Resumes" value={resumes.length} onClick={() => setPage("vault")} />
        <StatCard label="Waiting for reply" value={waiting.length} />
        <StatCard label="Due today" value={dueFUs} onClick={() => setPage("followups")} />
        <StatCard label="Late follow-ups" value={lateFUs} bad={lateFUs > 0} onClick={() => setPage("followups")} />
        <StatCard label="Interviews" value={jobs.filter((j) => INTERVIEW_STAGES.includes(j.status)).length} />
        <StatCard label="Offers" value={jobs.filter((j) => j.status === "Offer").length} good />
        <StatCard label="Rejections" value={jobs.filter((j) => j.status === "Rejected").length} />
        <StatCard label="This week" value={thisWeek} />
        <StatCard label="Response rate" value={responseRate + "%"} accent />
        <StatCard label="Upcoming events" value={deriveEvents(data, today).filter((e) => e.dstatus === "upcoming" && e.date >= today).length} onClick={() => setPage("calendar")} />
      </div>

      <div className="dash-strip">
        <div className="strip-item"><Star size={14} /><span><strong>Best resume:</strong> {bestResume ? bestResume.r.title + " (" + Math.round(bestResume.rate * 100) + "% replies)" : "link resumes to applications to find out"}</span></div>
        <div className="strip-item"><Sparkles size={14} /><span><strong>Most active source:</strong> {topSource ? topSource[0] + " (" + topSource[1] + " jobs)" : "add jobs with sources"}</span></div>
      </div>

      <div className="quick-actions">
        <button className="btn btn-primary" onClick={() => setModal({ type: "job" })}><Plus size={15} /> Add job</button>
        <button className="btn btn-ghost" onClick={() => setModal({ type: "company" })}><Plus size={15} /> Add company</button>
        <button className="btn btn-ghost" onClick={() => setModal({ type: "followup" })}><BellRing size={14} /> Add follow-up</button>
        <button className="btn btn-ghost" onClick={() => setPage("calendar")}><CalendarDays size={14} /> Add Calendar Event</button>
        <button className="btn btn-ghost" onClick={() => setPage("vault")}><Upload size={14} /> Upload resume</button>
        <button className="btn btn-ghost" onClick={() => setPage("settings")}><Download size={14} /> Import / export</button>
      </div>

      <div className="dash-cols">
        <div className="card">
          <div className="card-title-row">
            <h3 className="card-title">Upcoming events</h3>
            <button className="btn btn-ghost btn-sm" onClick={() => setPage("calendar")}><CalendarDays size={13} /> Open calendar</button>
          </div>
          {(() => {
            const evs = deriveEvents(data, today).filter((e) => e.dstatus === "upcoming" && e.date >= today)
              .sort((a, b) => a.date.localeCompare(b.date) || (a.time || "99").localeCompare(b.time || "99")).slice(0, 5);
            return evs.length ? (
              <ul className="mini-list">
                {evs.map((e) => (
                  <li key={e.id}>
                    <CalendarDays size={13} />
                    <div style={{ flex: 1 }}>
                      <div className="mini-title">{e.title} <Badge color={EVENT_COLORS[e.type]}>{EVENT_TYPE_LABEL[e.type]}</Badge></div>
                      <div className="mini-sub">{fmtDate(e.date)}{e.time ? " · " + fmtTime(e.time) : ""}</div>
                    </div>
                  </li>
                ))}
              </ul>
            ) : <p className="muted small">No upcoming events. Interviews and follow-ups from your pipeline appear here automatically.</p>;
          })()}
        </div>
        <div className="card">
          <h3 className="card-title">Pipeline funnel snapshot</h3>
          {(() => {
            const fapps = jobs.filter((j) => APPLIED_STAGES.includes(j.status)).length;
            const fresp = jobs.filter((j) => RESPONSE_STAGES.includes(j.status)).length;
            const fint = jobs.filter((j) => [...INTERVIEW_STAGES, "Offer"].includes(j.status)).length;
            const foff = jobs.filter((j) => j.status === "Offer").length;
            const fn = [["Saved", jobs.length], ["Applied", fapps], ["Response", fresp], ["Interview", fint], ["Offer", foff]];
            return jobs.length ? (
              <div className="funnel">
                {fn.map(([label, n], i) => (
                  <React.Fragment key={label}>
                    <div className="funnel-step"><span className="funnel-n">{n}</span><span className="funnel-label">{label}</span></div>
                    {i < fn.length - 1 && <ChevronRight size={16} className="funnel-arrow" />}
                  </React.Fragment>
                ))}
              </div>
            ) : <p className="muted small">Add jobs to see your funnel take shape.</p>;
          })()}
        </div>
      </div>

      <div className="dash-cols">
        <div className="card">
          <h3 className="card-title">Applications by status</h3>
          {byStatus.length ? (
            <ResponsiveContainer width="100%" height={220}>
              <BarChart data={byStatus} margin={{ top: 4, right: 8, left: -18, bottom: 4 }}>
                <CartesianGrid strokeDasharray="3 3" stroke="var(--chart-grid)" vertical={false} />
                <XAxis dataKey="name" tick={{ fontSize: 10, fill: "var(--slate2)" }} interval={0} angle={-28} textAnchor="end" height={58} />
                <YAxis allowDecimals={false} tick={{ fontSize: 11, fill: "var(--slate2)" }} />
                <Tooltip cursor={{ fill: "#5B7CC414" }} contentStyle={{ fontSize: 12, borderRadius: 10, border: "1px solid var(--line)", background: "var(--card)", color: "var(--text)" }} />
                <Bar dataKey="count" radius={[4, 4, 0, 0]}>
                  {byStatus.map((r) => <Cell key={r.name} fill={STAGE_COLORS[r.name]} />)}
                </Bar>
              </BarChart>
            </ResponsiveContainer>
          ) : <p className="muted">No jobs yet — add your first target role and watch this fill up.</p>}
        </div>
        <div className="card">
          <h3 className="card-title">Applications per week</h3>
          {byWeek.length ? (
            <ResponsiveContainer width="100%" height={220}>
              <LineChart data={byWeek} margin={{ top: 8, right: 12, left: -18, bottom: 4 }}>
                <CartesianGrid strokeDasharray="3 3" stroke="var(--chart-grid)" vertical={false} />
                <XAxis dataKey="week" tick={{ fontSize: 11, fill: "var(--slate2)" }} />
                <YAxis allowDecimals={false} tick={{ fontSize: 11, fill: "var(--slate2)" }} />
                <Tooltip contentStyle={{ fontSize: 12, borderRadius: 10, border: "1px solid var(--line)", background: "var(--card)", color: "var(--text)" }} />
                <Line type="monotone" dataKey="apps" stroke="#5B7CC4" strokeWidth={2.5} dot={{ r: 3.5, fill: "#3E9B72" }} />
              </LineChart>
            </ResponsiveContainer>
          ) : <p className="muted">Your first application starts the trend line. One a day is plenty.</p>}
        </div>
      </div>
    </div>
  );
}

const StatCard = ({ label, value, accent, good, bad, onClick }) => (
  <button className={"stat" + (accent ? " stat-accent" : "") + (good ? " stat-good" : "") + (bad ? " stat-bad" : "")} onClick={onClick} disabled={!onClick}>
    <span className="stat-value">{value}</span>
    <span className="stat-label">{label}</span>
  </button>
);

/* ================================================================== */
/* Global search                                                       */
/* ================================================================== */

function GlobalSearch({ data, query, openJob, openCompany, clear, companyName, setPage }) {
  const q = query.toLowerCase();
  const m = (s) => (s || "").toLowerCase().includes(q);
  const jobs = data.jobs.filter((j) => m(j.title) || m(companyName(j.company_id)) || m(j.location) || (j.tags || []).some(m) || m(j.notes) || m(j.skills_required));
  const companies = data.companies.filter((c) => m(c.name) || m(c.location) || m(c.industry) || (c.tags || []).some(m) || m(c.notes) || m(c.contact_name));
  const resumes = data.resumes.filter((r) => m(r.title) || m(r.target_role) || m(r.version) || (r.tags || []).some(m) || m(r.notes));

  return (
    <div>
      <PageHead title={'Results for "' + query + '"'} sub={jobs.length + " jobs · " + companies.length + " companies · " + resumes.length + " resumes"}
        right={<button className="btn btn-ghost" onClick={clear}>Clear search</button>} />
      {jobs.length > 0 && (
        <div className="card">
          <h3 className="card-title">Jobs</h3>
          {jobs.map((j) => (
            <button key={j.id} className="result-row" onClick={() => { clear(); openJob(j.id); }}>
              <span className="result-main">{j.title}</span>
              <span className="result-sub">{companyName(j.company_id)}</span>
              <StageBadge stage={j.status} />
            </button>
          ))}
        </div>
      )}
      {companies.length > 0 && (
        <div className="card">
          <h3 className="card-title">Companies</h3>
          {companies.map((c) => (
            <button key={c.id} className="result-row" onClick={() => { clear(); openCompany(c.id); }}>
              <span className="result-main">{c.name}</span>
              <span className="result-sub">{c.industry || c.location || ""}</span>
              {c.priority && <PriorityBadge p={c.priority} />}
            </button>
          ))}
        </div>
      )}
      {resumes.length > 0 && (
        <div className="card">
          <h3 className="card-title">Resumes</h3>
          {resumes.map((r) => (
            <button key={r.id} className="result-row" onClick={() => { clear(); setPage("vault"); }}>
              <span className="result-main">{r.title}</span>
              <span className="result-sub">{r.target_role || r.version || ""}</span>
              <Badge color={DOC_STATUS_COLORS[r.status] || "#8A8F9C"}>{r.status}</Badge>
            </button>
          ))}
        </div>
      )}
      {jobs.length + companies.length + resumes.length === 0 && (
        <Empty icon={Search} title="No matches" hint="Try a company name, job title, tag, or skill." />
      )}
    </div>
  );
}

/* ================================================================== */
/* Companies                                                           */
/* ================================================================== */

function CompaniesPage({ data, setModal, remove, openDetail, notify }) {
  const [filter, setFilter] = useState({ status: "", priority: "", q: "" });
  const list = data.companies.filter((c) =>
    (!filter.status || c.status === filter.status) &&
    (!filter.priority || c.priority === filter.priority) &&
    (!filter.q || c.name.toLowerCase().includes(filter.q.toLowerCase())));

  return (
    <div>
      <PageHead title="Companies" sub={data.companies.length + " tracked"}
        right={<button className="btn btn-primary" onClick={() => setModal({ type: "company" })}><Plus size={15} /> Add company</button>} />
      <div className="filter-bar">
        <input className="input" placeholder="Filter by name…" value={filter.q} onChange={(e) => setFilter({ ...filter, q: e.target.value })} />
        <select className="input" value={filter.status} onChange={(e) => setFilter({ ...filter, status: e.target.value })}>
          <option value="">All statuses</option>{COMPANY_STATUSES.map((s) => <option key={s}>{s}</option>)}
        </select>
        <select className="input" value={filter.priority} onChange={(e) => setFilter({ ...filter, priority: e.target.value })}>
          <option value="">All priorities</option>{PRIORITIES.map((s) => <option key={s}>{s}</option>)}
        </select>
      </div>
      {list.length === 0 ? (
        <Empty icon={Building2} title="No companies yet" hint="Start with 10 target companies you would genuinely want to work at, then research them one by one."
          action={<button className="btn btn-primary" onClick={() => setModal({ type: "company" })}><Plus size={15} /> Add your first company</button>} />
      ) : (
        <div className="table-card">
          <table>
            <thead><tr><th>Company</th><th>Industry</th><th>Location</th><th>Hiring</th><th>Priority</th><th>Status</th><th>Jobs</th><th>Next check</th><th></th></tr></thead>
            <tbody>
              {list.map((c) => {
                const jobCount = data.jobs.filter((j) => j.company_id === c.id).length;
                return (
                  <tr key={c.id}>
                    <td>
                      <button className="link-cell" onClick={() => openDetail(c.id)}>{c.name}</button>
                      {c.website && <a className="ext" href={c.website} target="_blank" rel="noreferrer"><ExternalLink size={12} /></a>}
                    </td>
                    <td className="muted">{c.industry || "—"}</td>
                    <td className="muted">{c.location || "—"}</td>
                    <td className="muted">{c.hiring_status || "—"}</td>
                    <td><PriorityBadge p={c.priority} /></td>
                    <td>{c.status ? <Badge color="#5B7CC4">{c.status}</Badge> : "—"}</td>
                    <td className="mono">{jobCount}</td>
                    <td className="mono muted">{fmtDate(c.next_check_date)}</td>
                    <td className="row-actions">
                      <button className="icon-btn" onClick={() => setModal({ type: "company", payload: c })} title="Edit"><Pencil size={14} /></button>
                      <button className="icon-btn danger" onClick={() => { if (confirm("Delete " + c.name + "? Jobs linked to it will remain.")) { remove("companies", c.id); notify("Company deleted"); } }} title="Delete"><Trash2 size={14} /></button>
                    </td>
                  </tr>
                );
              })}
            </tbody>
          </table>
        </div>
      )}
    </div>
  );
}

function CompanyModal({ initial, onSave, onClose, settings, notify }) {
  const [f, setF] = useState(initial || {
    id: uid(), name: "", website: "", career_page: "", linkedin: "", location: "", industry: "",
    size: "", hiring_status: "Unknown", priority: "Medium", status: "To Research",
    tags: [], notes: "", contact_name: "", contact_email: "", recruiter_linkedin: "",
    last_checked_date: todayISO(), next_check_date: "", rating: "", created_at: todayISO(),
  });
  const set = (k) => (e) => setF({ ...f, [k]: e.target.value });
  const [showAutofill, setShowAutofill] = useState(false);
  const applyAutofill = (d) => {
    const next = { ...f };
    if (d.name) next.name = d.name;
    if (d.industry) next.industry = d.industry;
    if (d.location) next.location = d.location;
    if (d.website) next.website = d.website;
    if (d.career_page) next.career_page = d.career_page;
    if (d.size) next.size = d.size;
    if (d.notes) next.notes = (next.notes ? next.notes + "\n" : "") + d.notes;
    setF(next);
  };
  return (
    <Modal title={initial ? "Edit company" : "Add company"} onClose={onClose} wide>
      <button className="btn autofill-btn" onClick={() => setShowAutofill(true)}><Wand2 size={14} /> Auto-fill with AI</button>
      {showAutofill && (
        <AutofillModal kind="company" settings={settings} notify={notify}
          onClose={() => setShowAutofill(false)}
          onExtract={(d) => { applyAutofill(d); setShowAutofill(false); }} />
      )}
      <div className="form-grid">
        <Field label="Company name *"><input className="input" value={f.name} onChange={set("name")} autoFocus /></Field>
        <Field label="Industry"><input className="input" value={f.industry} onChange={set("industry")} placeholder="B2B SaaS, Fintech…" /></Field>
        <Field label="Website"><input className="input" value={f.website} onChange={set("website")} placeholder="https://…" /></Field>
        <Field label="Career page"><input className="input" value={f.career_page} onChange={set("career_page")} placeholder="https://…" /></Field>
        <Field label="LinkedIn page"><input className="input" value={f.linkedin} onChange={set("linkedin")} /></Field>
        <Field label="Location"><input className="input" value={f.location} onChange={set("location")} /></Field>
        <Field label="Company size"><input className="input" value={f.size} onChange={set("size")} placeholder="e.g. 51–200" /></Field>
        <Field label="My rating (1–10)"><input className="input" type="number" min="1" max="10" value={f.rating} onChange={set("rating")} /></Field>
        <Field label="Hiring status"><select className="input" value={f.hiring_status} onChange={set("hiring_status")}>{HIRING_STATUSES.map((s) => <option key={s}>{s}</option>)}</select></Field>
        <Field label="Priority"><select className="input" value={f.priority} onChange={set("priority")}>{PRIORITIES.map((s) => <option key={s}>{s}</option>)}</select></Field>
        <Field label="Status"><select className="input" value={f.status} onChange={set("status")}>{COMPANY_STATUSES.map((s) => <option key={s}>{s}</option>)}</select></Field>
        <Field label="Tags (comma separated)"><input className="input" value={(f.tags || []).join(", ")} onChange={(e) => setF({ ...f, tags: parseTags(e.target.value) })} placeholder="dream company, fintech, referral" /></Field>
        <Field label="Contact person"><input className="input" value={f.contact_name} onChange={set("contact_name")} /></Field>
        <Field label="Contact email"><input className="input" value={f.contact_email} onChange={set("contact_email")} /></Field>
        <Field label="Recruiter LinkedIn"><input className="input" value={f.recruiter_linkedin} onChange={set("recruiter_linkedin")} /></Field>
        <Field label="Next check date"><input className="input" type="date" value={f.next_check_date} onChange={set("next_check_date")} /></Field>
        <Field label="Notes" span><textarea className="input" rows={3} value={f.notes} onChange={set("notes")} placeholder="Positioning observations, funding, who to contact…" /></Field>
      </div>
      <div className="modal-foot">
        <button className="btn btn-ghost" onClick={onClose}>Cancel</button>
        <button className="btn btn-primary" disabled={!f.name.trim()} onClick={() => onSave(f)}>{initial ? "Save changes" : "Add company"}</button>
      </div>
    </Modal>
  );
}

function CompanyDrawer({ company, data, onClose, setModal, openJob, upsert }) {
  if (!company) return null;
  const jobs = data.jobs.filter((j) => j.company_id === company.id);
  const followups = data.followups.filter((f) => f.company_id === company.id);
  const resumesUsed = data.resumes.filter((r) => jobs.some((j) => j.resume_id === r.id));
  const checklist = company.research_done || [];
  const toggleCheck = (item) => {
    const next = checklist.includes(item) ? checklist.filter((x) => x !== item) : [...checklist, item];
    upsert("companies", { ...company, research_done: next });
  };
  return (
    <div className="drawer-overlay" onMouseDown={(e) => e.target === e.currentTarget && onClose()}>
      <div className="drawer">
        <div className="drawer-head">
          <div>
            <div className="drawer-eyebrow">Company</div>
            <h2>{company.name}</h2>
            <div className="drawer-meta">
              {company.industry && <span>{company.industry}</span>}
              {company.location && <span>{company.location}</span>}
              {company.priority && <PriorityBadge p={company.priority} />}
              {company.status && <Badge color="#5B7CC4">{company.status}</Badge>}
            </div>
          </div>
          <div className="drawer-actions">
            <button className="btn btn-ghost" onClick={() => setModal({ type: "company", payload: company })}><Pencil size={14} /> Edit</button>
            <button className="icon-btn" onClick={onClose}><X size={18} /></button>
          </div>
        </div>
        <div className="drawer-body">
          <div className="link-row">
            {company.website && <a href={company.website} target="_blank" rel="noreferrer" className="btn btn-ghost"><ExternalLink size={13} /> Website</a>}
            {company.career_page && <a href={company.career_page} target="_blank" rel="noreferrer" className="btn btn-ghost"><ExternalLink size={13} /> Careers</a>}
            {company.linkedin && <a href={company.linkedin} target="_blank" rel="noreferrer" className="btn btn-ghost"><ExternalLink size={13} /> LinkedIn</a>}
          </div>
          {(company.contact_name || company.contact_email) && (
            <div className="card">
              <h3 className="card-title">Contact</h3>
              <p>{company.contact_name} {company.contact_email && <span className="muted">· {company.contact_email}</span>}</p>
              {company.recruiter_linkedin && <a className="text-link" href={company.recruiter_linkedin} target="_blank" rel="noreferrer">Recruiter LinkedIn ↗</a>}
            </div>
          )}
          <div className="card">
            <div className="card-title-row">
              <h3 className="card-title">Jobs here ({jobs.length})</h3>
              <button className="btn btn-ghost btn-sm" onClick={() => setModal({ type: "job", payload: { id: uid(), company_id: company.id, title: "", status: "Saved", tags: [], timeline: [{ date: todayISO(), event: "Job saved" }], date_saved: todayISO() } })}><Plus size={13} /> Add</button>
            </div>
            {jobs.length ? jobs.map((j) => (
              <button key={j.id} className="result-row" onClick={() => { onClose(); openJob(j.id); }}>
                <span className="result-main">{j.title}</span>
                <span className="result-sub">{j.location || j.work_mode || ""}</span>
                <StageBadge stage={j.status} />
              </button>
            )) : <p className="muted">No jobs saved yet.</p>}
          </div>
          {resumesUsed.length > 0 && (
            <div className="card">
              <h3 className="card-title">Resumes this company has seen</h3>
              {resumesUsed.map((r) => <p key={r.id}><FileText size={13} style={{ verticalAlign: "-2px" }} /> {r.title} <span className="muted">· {r.version || ""}</span></p>)}
            </div>
          )}
          <div className="card">
            <h3 className="card-title">Research checklist ({checklist.length}/{RESEARCH_CHECKLIST.length})</h3>
            <div className="check-grid">
              {RESEARCH_CHECKLIST.map((item) => (
                <label key={item} className="check-item">
                  <input type="checkbox" checked={checklist.includes(item)} onChange={() => toggleCheck(item)} />
                  <span>{item}</span>
                </label>
              ))}
            </div>
          </div>
          {followups.length > 0 && (
            <div className="card">
              <h3 className="card-title">Follow-up history</h3>
              <ul className="mini-list">
                {followups.map((f) => (
                  <li key={f.id}><BellRing size={13} /><div><div className="mini-title">{f.title || f.type} · {f.status}</div><div className="mini-sub">{fmtDate(f.due_date)} {f.contact_name && "· " + f.contact_name}</div></div></li>
                ))}
              </ul>
            </div>
          )}
          {company.notes && (
            <div className="card"><h3 className="card-title">Notes</h3><p className="prewrap">{company.notes}</p></div>
          )}
        </div>
      </div>
    </div>
  );
}

/* ================================================================== */
/* Jobs                                                                */
/* ================================================================== */

function JobsPage({ data, setModal, remove, openDetail, companyName }) {
  const [f, setF] = useState({ q: "", status: "", mode: "", priority: "", source: "", sort: "newest" });
  const list = useMemo(() => {
    let l = data.jobs.filter((j) => {
      const q = f.q.toLowerCase();
      return (!q || j.title.toLowerCase().includes(q) || companyName(j.company_id).toLowerCase().includes(q) ||
        (j.location || "").toLowerCase().includes(q) || (j.tags || []).some((t) => t.toLowerCase().includes(q)) ||
        (j.skills_required || "").toLowerCase().includes(q)) &&
        (!f.status || j.status === f.status) && (!f.mode || j.work_mode === f.mode) &&
        (!f.priority || j.priority === f.priority) && (!f.source || j.source === f.source);
    });
    const cmp = {
      newest: (a, b) => (b.date_saved || "").localeCompare(a.date_saved || ""),
      priority: (a, b) => PRIORITIES.indexOf(a.priority || "Low") - PRIORITIES.indexOf(b.priority || "Low"),
      deadline: (a, b) => (a.deadline || "9999").localeCompare(b.deadline || "9999"),
      fit: (a, b) => (b.fit_score || 0) - (a.fit_score || 0),
      excitement: (a, b) => (b.excitement_score || 0) - (a.excitement_score || 0),
    };
    return [...l].sort(cmp[f.sort]);
  }, [data.jobs, f, companyName]);

  const today = todayISO();

  return (
    <div>
      <PageHead title="Jobs" sub={data.jobs.length + " saved · fresh postings (48h) convert best"}
        right={<button className="btn btn-primary" onClick={() => setModal({ type: "job" })}><Plus size={15} /> Add job</button>} />
      <div className="filter-bar">
        <input className="input grow" placeholder="Search title, company, skill, tag…" value={f.q} onChange={(e) => setF({ ...f, q: e.target.value })} />
        <select className="input" value={f.status} onChange={(e) => setF({ ...f, status: e.target.value })}><option value="">All stages</option>{STAGES.map((s) => <option key={s}>{s}</option>)}</select>
        <select className="input" value={f.mode} onChange={(e) => setF({ ...f, mode: e.target.value })}><option value="">Any mode</option>{WORK_MODES.map((s) => <option key={s}>{s}</option>)}</select>
        <select className="input" value={f.priority} onChange={(e) => setF({ ...f, priority: e.target.value })}><option value="">Any priority</option>{PRIORITIES.map((s) => <option key={s}>{s}</option>)}</select>
        <select className="input" value={f.source} onChange={(e) => setF({ ...f, source: e.target.value })}><option value="">Any source</option>{SOURCES.map((s) => <option key={s}>{s}</option>)}</select>
        <select className="input" value={f.sort} onChange={(e) => setF({ ...f, sort: e.target.value })}>
          <option value="newest">Newest first</option><option value="priority">Priority</option>
          <option value="deadline">Deadline</option><option value="fit">Fit score</option><option value="excitement">Excitement</option>
        </select>
      </div>
      {list.length === 0 ? (
        <Empty icon={Briefcase} title={data.jobs.length ? "No jobs match these filters" : "No jobs saved yet"}
          hint={data.jobs.length ? "Loosen a filter or clear the search." : "One fresh role a day. That's the whole system."}
          action={!data.jobs.length && <button className="btn btn-primary" onClick={() => setModal({ type: "job" })}><Plus size={15} /> Save your first job</button>} />
      ) : (
        <div className="table-card">
          <table>
            <thead><tr><th>Role</th><th>Company</th><th>Stage</th><th>Next action</th><th>Resume</th><th>Fit</th><th>Priority</th><th>Deadline</th><th></th></tr></thead>
            <tbody>
              {list.map((j) => {
                const na = jobNextAction(j, data.followups, today);
                const resume = data.resumes.find((r) => r.id === j.resume_id);
                return (
                  <tr key={j.id}>
                    <td>
                      <button className="link-cell" onClick={() => openDetail(j.id)}>{j.title}</button>
                      {j.job_link && <a className="ext" href={j.job_link} target="_blank" rel="noreferrer"><ExternalLink size={12} /></a>}
                    </td>
                    <td className="muted">{companyName(j.company_id)}</td>
                    <td><StageBadge stage={j.status} /></td>
                    <td>{na ? <span className={"na-inline tone-" + na.tone}><CircleDot size={10} /> {na.text}</span> : <span className="muted">—</span>}</td>
                    <td className="muted small">{resume ? resume.title : "—"}</td>
                    <td className="mono">{j.fit_score ? j.fit_score + "/10" : "—"}</td>
                    <td><PriorityBadge p={j.priority} /></td>
                    <td className="mono muted">{fmtDate(j.deadline)}</td>
                    <td className="row-actions">
                      <button className="icon-btn" onClick={() => setModal({ type: "job", payload: j })} title="Edit"><Pencil size={14} /></button>
                      <button className="icon-btn danger" onClick={() => confirm('Delete "' + j.title + '"?') && remove("jobs", j.id)} title="Delete"><Trash2 size={14} /></button>
                    </td>
                  </tr>
                );
              })}
            </tbody>
          </table>
        </div>
      )}
    </div>
  );
}

/* HV Reset link. Reset lives on the same site (harshvittori.github.io/harsh-reset),
   so when it has been used in this browser its data is visible here. The apply rule
   below mirrors Reset's "2-minute apply rule" and only appears when Reset is present. */
const HAS_RESET = () => { try { return IS_WEB() && (localStorage.getItem("harsh-reset-v1") !== null || localStorage.getItem("hv-reset-linked") === "1"); } catch (e) { return false; } };
function resetRuleCheck(f) { return window.HVApplyRule.check(f); }   // defined once in shared/apply-rule.js
function ResetRuleCheck({ job }) {
  if (!HAS_RESET()) return null;
  const { rows, verdict } = resetRuleCheck(job);
  const col = { pass: "var(--green)", warn: "var(--amber)", fail: "var(--red)" };
  const mark = { pass: "✓", warn: "?", fail: "✕" };
  const head = verdict === "fail" ? "Skip it. Breaks your Reset apply rule" : verdict === "pass" ? "Fits your Reset apply rule" : "Check the ? items before applying";
  return (
    <div className="reset-check" style={{ border: "1px solid var(--line)", borderLeft: "3px solid " + col[verdict], borderRadius: 10, padding: "10px 14px", margin: "12px 0 4px" }}>
      <div style={{ fontWeight: 700, fontSize: 13, color: col[verdict], marginBottom: 6 }}>2-minute apply rule · {head}</div>
      {rows.map(([k, st, msg]) => (
        <div key={k} style={{ display: "flex", gap: 8, fontSize: 12.5, lineHeight: 1.6 }}>
          <span style={{ color: col[st], fontWeight: 700, width: 12 }}>{mark[st]}</span>
          <span style={{ width: 82, color: "var(--slate)" }}>{k}</span>
          <span>{msg}</span>
        </div>
      ))}
    </div>
  );
}

function JobModal({ initial, companies, resumes, onSave, onClose, settings, notify }) {
  const [f, setF] = useState(initial || {
    id: uid(), company_id: "", title: "", source: "LinkedIn", job_link: "", location: "",
    work_mode: "Hybrid", job_type: "Full-time", salary_range: "", experience_required: "",
    skills_required: "", description: "", deadline: "", priority: "Medium",
    fit_score: "", excitement_score: "", status: "Saved", tags: [], notes: "",
    date_saved: todayISO(), date_applied: "", interview_date: "", resume_id: "", cover_id: "",
    resume_attached_date: "", resume_verdict: "",
    timeline: [{ date: todayISO(), event: "Job saved" }], prep_done: [],
  });
  const [newCompany, setNewCompany] = useState("");
  const [showAutofill, setShowAutofill] = useState(false);
  const applyAutofill = (d) => {
    const next = { ...f };
    if (d.job_title) next.title = d.job_title;
    if (d.location) next.location = d.location;
    if (d.salary_range) next.salary_range = d.salary_range;
    if (d.experience_required) next.experience_required = d.experience_required;
    if (d.skills_required) next.skills_required = d.skills_required;
    if (d.job_link) next.job_link = d.job_link;
    if (d.work_mode && WORK_MODES.includes(d.work_mode)) next.work_mode = d.work_mode;
    if (d.job_type && JOB_TYPES.includes(d.job_type)) next.job_type = d.job_type;
    if (d.deadline && /^\d{4}-\d{2}-\d{2}$/.test(d.deadline)) next.deadline = d.deadline;
    if (d.description) next.description = d.description;
    if (d.company_name) {
      const match = companies.find((c) => c.name.toLowerCase() === d.company_name.toLowerCase());
      if (match) next.company_id = match.id;
      else { next.company_id = "__new__"; setNewCompany(d.company_name); }
    }
    setF(next);
  };
  const set = (k) => (e) => setF({ ...f, [k]: e.target.value });
  const covers = resumes.filter((r) => r.doc_type === "Cover letter");
  const cvs = resumes.filter((r) => r.doc_type !== "Cover letter");

  const save = () => {
    let companyRecord = null;
    let job = { ...f };
    if (f.company_id === "__new__" && newCompany.trim()) {
      companyRecord = { id: uid(), name: newCompany.trim(), priority: "Medium", status: "To Research", hiring_status: "Unknown", tags: [], created_at: todayISO() };
      job.company_id = companyRecord.id;
    }
    if (job.resume_id && job.resume_id !== (initial?.resume_id || "")) job.resume_attached_date = todayISO();
    onSave(job, companyRecord);
  };

  return (
    <Modal title={initial ? "Edit job" : "Add job"} onClose={onClose} wide>
      <button className="btn autofill-btn" onClick={() => setShowAutofill(true)}><Wand2 size={14} /> Auto-fill with AI — paste JD, PDF, or screenshot</button>
      {showAutofill && (
        <AutofillModal kind="job" settings={settings} notify={notify}
          onClose={() => setShowAutofill(false)}
          onExtract={(d) => { applyAutofill(d); setShowAutofill(false); }} />
      )}
      <div className="form-grid">
        <Field label="Job title *"><input className="input" value={f.title} onChange={set("title")} autoFocus placeholder="Associate Product Marketing Manager" /></Field>
        <Field label="Company *">
          <select className="input" value={f.company_id} onChange={set("company_id")}>
            <option value="">Select company…</option>
            {companies.map((c) => <option key={c.id} value={c.id}>{c.name}</option>)}
            <option value="__new__">+ New company…</option>
          </select>
        </Field>
        {f.company_id === "__new__" && (<Field label="New company name"><input className="input" value={newCompany} onChange={(e) => setNewCompany(e.target.value)} /></Field>)}
        <Field label="Job link"><input className="input" value={f.job_link} onChange={set("job_link")} placeholder="https://…" /></Field>
        <Field label="Source"><select className="input" value={f.source} onChange={set("source")}>{SOURCES.map((s) => <option key={s}>{s}</option>)}</select></Field>
        <Field label="Location"><input className="input" value={f.location} onChange={set("location")} /></Field>
        <Field label="Work mode"><select className="input" value={f.work_mode} onChange={set("work_mode")}>{WORK_MODES.map((s) => <option key={s}>{s}</option>)}</select></Field>
        <Field label="Job type"><select className="input" value={f.job_type} onChange={set("job_type")}>{JOB_TYPES.map((s) => <option key={s}>{s}</option>)}</select></Field>
        <Field label="Salary range"><input className="input" value={f.salary_range} onChange={set("salary_range")} placeholder="₹8–12 LPA" /></Field>
        <Field label="Deadline"><input className="input" type="date" value={f.deadline} onChange={set("deadline")} /></Field>
        <Field label="Stage"><select className="input" value={f.status} onChange={set("status")}>{STAGES.map((s) => <option key={s}>{s}</option>)}</select></Field>
        <Field label="Priority"><select className="input" value={f.priority} onChange={set("priority")}>{PRIORITIES.map((s) => <option key={s}>{s}</option>)}</select></Field>
        <Field label="Resume used">
          <select className="input" value={f.resume_id} onChange={set("resume_id")}>
            <option value="">None yet</option>
            {cvs.map((r) => <option key={r.id} value={r.id}>{r.title}{r.version ? " · " + r.version : ""}</option>)}
          </select>
        </Field>
        <Field label="Cover letter used">
          <select className="input" value={f.cover_id} onChange={set("cover_id")}>
            <option value="">None</option>
            {covers.map((r) => <option key={r.id} value={r.id}>{r.title}</option>)}
          </select>
        </Field>
        <Field label="Interview date"><input className="input" type="date" value={f.interview_date} onChange={set("interview_date")} /></Field>
        <Field label="Fit score (1–10)"><input className="input" type="number" min="1" max="10" value={f.fit_score} onChange={set("fit_score")} /></Field>
        <Field label="Excitement (1–10)"><input className="input" type="number" min="1" max="10" value={f.excitement_score} onChange={set("excitement_score")} /></Field>
        <Field label="Skills required"><input className="input" value={f.skills_required} onChange={set("skills_required")} placeholder="Positioning, GTM, HubSpot…" /></Field>
        <Field label="Tags (comma separated)"><input className="input" value={(f.tags || []).join(", ")} onChange={(e) => setF({ ...f, tags: parseTags(e.target.value) })} placeholder="pmm, fintech, urgent, referral" /></Field>
        <Field label="Job description" span><textarea className="input" rows={3} value={f.description} onChange={set("description")} placeholder="Paste the JD or the top requirements…" /></Field>
        <Field label="Notes" span><textarea className="input" rows={2} value={f.notes} onChange={set("notes")} placeholder="Who did I message? What did they say?" /></Field>
      </div>
      <ResetRuleCheck job={f} />
      <div className="modal-foot">
        <button className="btn btn-ghost" onClick={onClose}>Cancel</button>
        <button className="btn btn-primary" disabled={!f.title.trim() || !f.company_id || (f.company_id === "__new__" && !newCompany.trim())} onClick={save}>
          {initial ? "Save changes" : "Save job"}
        </button>
      </div>
    </Modal>
  );
}

function JobDrawer({ job, data, onClose, setModal, companyName, upsert, moveJob, openPreview, downloadResume }) {
  if (!job) return null;
  const today = todayISO();
  const company = data.companies.find((c) => c.id === job.company_id);
  const followups = data.followups.filter((f) => f.job_id === job.id)
    .sort((a, b) => (a.due_date || "").localeCompare(b.due_date || ""));
  const resume = data.resumes.find((r) => r.id === job.resume_id);
  const cover = data.resumes.find((r) => r.id === job.cover_id);
  const prep = job.prep_done || [];
  const na = jobNextAction(job, data.followups, today);
  const cvs = data.resumes.filter((r) => r.doc_type !== "Cover letter");

  const togglePrep = (item) => {
    const next = prep.includes(item) ? prep.filter((x) => x !== item) : [...prep, item];
    upsert("jobs", { ...job, prep_done: next });
  };
  const setResume = (rid) => upsert("jobs", { ...job, resume_id: rid, resume_attached_date: rid ? todayISO() : "" });
  const setVerdict = (v) => upsert("jobs", { ...job, resume_verdict: job.resume_verdict === v ? "" : v });
  const lastAction = (job.timeline || []).slice(-1)[0];

  return (
    <div className="drawer-overlay" onMouseDown={(e) => e.target === e.currentTarget && onClose()}>
      <div className="drawer">
        <div className="drawer-head">
          <div>
            <div className="drawer-eyebrow">{companyName(job.company_id)}</div>
            <h2>{job.title}</h2>
            <div className="drawer-meta">
              <StageBadge stage={job.status} />
              {job.priority && <PriorityBadge p={job.priority} />}
              {job.work_mode && <span>{job.work_mode}</span>}
              {job.location && <span>{job.location}</span>}
              {job.salary_range && <span className="mono">{job.salary_range}</span>}
            </div>
          </div>
          <div className="drawer-actions">
            <button className="btn btn-ghost" onClick={() => setModal({ type: "job", payload: job })}><Pencil size={14} /> Edit</button>
            <button className="icon-btn" onClick={onClose}><X size={18} /></button>
          </div>
        </div>
        <div className="drawer-body">
          {na && (
            <div className={"nba tone-" + na.tone}>
              <div className="nba-label"><Zap size={13} /> Next best action</div>
              <div className="nba-text">{na.text}</div>
              <div className="nba-why">{na.why}</div>
            </div>
          )}

          <div className="card">
            <h3 className="card-title">Move stage</h3>
            <div className="stage-row">
              {STAGES.map((s) => (
                <button key={s} className={"stage-pill " + (job.status === s ? "active" : "")}
                  style={job.status === s ? { background: STAGE_COLORS[s], borderColor: STAGE_COLORS[s] } : {}}
                  onClick={() => moveJob(job.id, s)}>{s}</button>
              ))}
            </div>
          </div>

          <div className="card">
            <h3 className="card-title">Resume & cover letter for this application</h3>
            <div className="resume-attach">
              <select className="input" value={job.resume_id || ""} onChange={(e) => setResume(e.target.value)}>
                <option value="">No resume linked yet</option>
                {cvs.map((r) => <option key={r.id} value={r.id}>{r.title}{r.version ? " · " + r.version : ""}</option>)}
              </select>
              {resume && (
                <div className="resume-attach-row">
                  <FileText size={14} />
                  <span>{resume.title} {job.resume_attached_date && <span className="muted">· attached {fmtDate(job.resume_attached_date)}</span>}</span>
                  <button className="btn btn-ghost btn-sm" onClick={() => openPreview(resume)}><Eye size={12} /> View</button>
                  <button className="btn btn-ghost btn-sm" onClick={() => downloadResume(resume)}><Download size={12} /> Download</button>
                </div>
              )}
              {cover && <div className="resume-attach-row"><Files size={14} /><span>Cover letter: {cover.title}</span></div>}
              {resume && APPLIED_STAGES.includes(job.status) && (
                <div className="verdict-row">
                  <span className="muted small">Did this resume work here?</span>
                  <button className={"chip-btn " + (job.resume_verdict === "worked" ? "on good" : "")} onClick={() => setVerdict("worked")}>👍 Got a response</button>
                  <button className={"chip-btn " + (job.resume_verdict === "no_response" ? "on bad" : "")} onClick={() => setVerdict("no_response")}>👎 No response</button>
                </div>
              )}
            </div>
          </div>

          <div className="two-col">
            <div className="card">
              <h3 className="card-title">Details</h3>
              <dl className="dl">
                <dt>Source</dt><dd>{job.source || "—"}</dd>
                <dt>Saved</dt><dd>{fmtDate(job.date_saved)}</dd>
                <dt>Applied</dt><dd>{fmtDate(job.date_applied)}</dd>
                <dt>Deadline</dt><dd>{fmtDate(job.deadline)}</dd>
                <dt>Interview</dt><dd>{fmtDate(job.interview_date)}</dd>
                <dt>Last action</dt><dd>{lastAction ? lastAction.event + " (" + fmtDate(lastAction.date) + ")" : "—"}</dd>
                <dt>Fit</dt><dd className="mono">{job.fit_score ? job.fit_score + "/10" : "—"}</dd>
              </dl>
              {job.job_link && <a className="text-link" href={job.job_link} target="_blank" rel="noreferrer">Open job posting ↗</a>}
              {(job.tags || []).length > 0 && <div className="tag-row">{job.tags.map((t) => <TagChip key={t} t={t} />)}</div>}
            </div>
            <div className="card">
              <h3 className="card-title">Prep checklist ({prep.length}/{PREP_CHECKLIST.length})</h3>
              <div className="check-grid one">
                {PREP_CHECKLIST.map((item) => (
                  <label key={item} className="check-item">
                    <input type="checkbox" checked={prep.includes(item)} onChange={() => togglePrep(item)} />
                    <span>{item}</span>
                  </label>
                ))}
              </div>
            </div>
          </div>

          <div className="card">
            <h3 className="card-title">Follow-ups & message history</h3>
            {followups.length ? (
              <ul className="mini-list">
                {followups.map((f) => (
                  <li key={f.id}>
                    <BellRing size={13} />
                    <div style={{ flex: 1 }}>
                      <div className="mini-title">{f.title || f.type} <Badge color={FU_COLORS[fuBadgeState(f, today)] || "#8A8F9C"}>{fuBadgeState(f, today)}</Badge></div>
                      <div className="mini-sub">Due {fmtDate(f.due_date)}{f.sent_date && " · sent " + fmtDate(f.sent_date)}{f.reply_received === "Yes" && " · replied " + fmtDate(f.reply_date)}</div>
                      {f.actual_message && <div className="fu-draft small">{f.actual_message}</div>}
                    </div>
                  </li>
                ))}
              </ul>
            ) : <p className="muted">No follow-ups yet. Moving this job to Applied auto-creates one.</p>}
          </div>

          <div className="card">
            <h3 className="card-title">Timeline</h3>
            {(job.timeline || []).length ? (
              <ul className="timeline">
                {[...job.timeline].reverse().map((t, i) => (
                  <li key={i}><span className="mono muted">{fmtDate(t.date)}</span><span>{t.event}</span></li>
                ))}
              </ul>
            ) : <p className="muted">No events yet.</p>}
          </div>

          {job.skills_required && (<div className="card"><h3 className="card-title">Skills required</h3><p>{job.skills_required}</p></div>)}
          {job.description && (<div className="card"><h3 className="card-title">Job description</h3><p className="prewrap muted">{job.description}</p></div>)}
          {job.notes && (<div className="card"><h3 className="card-title">Notes</h3><p className="prewrap">{job.notes}</p></div>)}
          {company?.contact_name && (<div className="card"><h3 className="card-title">Company contact</h3><p>{company.contact_name} {company.contact_email && <span className="muted">· {company.contact_email}</span>}</p></div>)}
        </div>
      </div>
    </div>
  );
}

/* ================================================================== */
/* Pipeline (Kanban)                                                   */
/* ================================================================== */

function PipelinePage({ data, moveJob, companyName, openDetail, setModal }) {
  const [dragId, setDragId] = useState(null);
  const [over, setOver] = useState(null);
  const today = todayISO();
  const boardRef = useRef(null);
  const pointerX = useRef(null);
  const rafRef = useRef(null);

  /* Mouse wheel over the board = horizontal scroll.
     Exception: if the cursor is over a column whose own card list can scroll
     vertically, let that column scroll instead (premium behavior). */
  useEffect(() => {
    const el = boardRef.current;
    if (!el) return;
    const onWheel = (e) => {
      if (Math.abs(e.deltaY) <= Math.abs(e.deltaX)) return; // trackpad horizontal already works natively
      const list = e.target.closest ? e.target.closest(".kanban-cards") : null;
      if (list && list.scrollHeight > list.clientHeight + 4) {
        const atTop = list.scrollTop <= 0 && e.deltaY < 0;
        const atBottom = list.scrollTop + list.clientHeight >= list.scrollHeight - 1 && e.deltaY > 0;
        if (!atTop && !atBottom) return; // column consumes the scroll
      }
      e.preventDefault();
      el.scrollLeft += e.deltaY;
    };
    el.addEventListener("wheel", onWheel, { passive: false });
    return () => el.removeEventListener("wheel", onWheel);
  }, []);

  /* Edge auto-scroll while dragging: a requestAnimationFrame loop reads the
     last pointer position and nudges scrollLeft when near either edge.
     Speed ramps up the closer the pointer gets to the edge. */
  useEffect(() => {
    if (!dragId) { pointerX.current = null; return; }
    const MAX_SPEED = 26;
    const step = () => {
      const el = boardRef.current;
      const x = pointerX.current;
      if (el && x !== null) {
        const r = el.getBoundingClientRect();
        const ZONE = Math.min(130, r.width * 0.12);   // narrow phone screens get a slimmer edge zone
        if (x < r.left + ZONE) {
          const depth = (r.left + ZONE - x) / ZONE;
          el.scrollLeft -= Math.max(4, Math.round(depth * MAX_SPEED));
        } else if (x > r.right - ZONE) {
          const depth = (x - (r.right - ZONE)) / ZONE;
          el.scrollLeft += Math.max(4, Math.round(depth * MAX_SPEED));
        }
      }
      rafRef.current = requestAnimationFrame(step);
    };
    rafRef.current = requestAnimationFrame(step);
    return () => cancelAnimationFrame(rafRef.current);
  }, [dragId]);

  /* Touch drag (phones): HTML5 drag-and-drop doesn't fire on touch screens.
     Long-press a card to pick it up, drag it across columns (the board auto-scrolls
     at the edges), release to drop. A quick swipe still scrolls; a tap still opens. */
  const touch = useRef({});
  const moveRef = useRef(moveJob);
  moveRef.current = moveJob;
  useEffect(() => {
    const el = boardRef.current;
    if (!el) return;
    const HOLD = 350, SLOP = 10;
    const t = touch.current;
    const stageAt = (x, y) => { const col = document.elementsFromPoint(x, y).map((n) => n.closest && n.closest(".kanban-col")).find(Boolean); return col ? col.getAttribute("data-stage") : null; };   // looks through floating layers (e.g. the HV AI button)
    const reset = () => {
      clearTimeout(t.timer);
      if (t.ghost) t.ghost.remove();
      if (t.card) t.card.classList.remove("touch-pending");
      const was = t.active;
      Object.assign(t, { timer: null, ghost: null, card: null, id: null, active: false, stage: null });
      pointerX.current = null;
      if (was) { setDragId(null); setOver(null); }
    };
    const onStart = (e) => {
      if (e.touches.length !== 1) return reset();
      const card = e.target.closest ? e.target.closest(".kcard") : null;
      if (!card) return;
      const p = e.touches[0];
      Object.assign(t, { card, id: card.getAttribute("data-id"), x0: p.clientX, y0: p.clientY, active: false });
      card.classList.add("touch-pending");
      t.timer = setTimeout(() => {
        card.classList.remove("touch-pending");
        card.style.transition = "none"; card.style.transform = "none";   // measure the card at rest, not mid "press" shrink
        const r = card.getBoundingClientRect();
        card.style.transition = card.style.transform = "";
        const g = card.cloneNode(true);
        g.classList.remove("touch-pending");
        g.classList.add("kcard-ghost");
        // The ghost lives on <body> (outside .app), so give it .app's theme variables, font and zoom.
        const app = el.closest(".app"), cs = app ? getComputedStyle(app) : null;
        const z = (cs && parseFloat(cs.zoom)) || 1;
        if (cs) {
          for (let i = 0; i < cs.length; i++) if (cs[i].startsWith("--")) g.style.setProperty(cs[i], cs.getPropertyValue(cs[i]));
          Object.assign(g.style, { fontFamily: cs.fontFamily, fontSize: cs.fontSize, lineHeight: cs.lineHeight, color: cs.color, zoom: String(z) });
        }
        Object.assign(g.style, { width: r.width / z + "px", left: r.left / z + "px", top: r.top / z + "px" });
        document.body.appendChild(g);
        Object.assign(t, { ghost: g, z, dx: t.x0 - r.left, dy: t.y0 - r.top, active: true, stage: stageAt(t.x0, t.y0) });
        try { navigator.vibrate && navigator.vibrate(15); } catch (err) {}
        setDragId(t.id); setOver(t.stage);
      }, HOLD);
    };
    const onMove = (e) => {
      if (!t.card) return;
      const p = e.touches[0];
      if (!t.active) {                                   // moved before the hold finished: it's a scroll
        if (Math.abs(p.clientX - t.x0) > SLOP || Math.abs(p.clientY - t.y0) > SLOP) reset();
        return;
      }
      e.preventDefault();                                 // keep the page still while dragging
      t.ghost.style.left = (p.clientX - t.dx) / t.z + "px";
      t.ghost.style.top = (p.clientY - t.dy) / t.z + "px";
      pointerX.current = p.clientX;
      const st = stageAt(p.clientX, p.clientY);
      if (st !== t.stage) { t.stage = st; setOver(st); }
    };
    const onEnd = (e) => {
      if (!t.card) return;
      if (t.active) {
        e.preventDefault();                               // no click / detail drawer after a drop
        if (t.stage) moveRef.current(t.id, t.stage);
      }
      reset();
    };
    const onMenu = (e) => { if (t.card) e.preventDefault(); };   // long-press must not open the context menu
    el.addEventListener("touchstart", onStart, { passive: true });
    el.addEventListener("touchmove", onMove, { passive: false });
    el.addEventListener("touchend", onEnd, { passive: false });
    el.addEventListener("touchcancel", reset);
    el.addEventListener("contextmenu", onMenu);
    return () => {
      reset();
      el.removeEventListener("touchstart", onStart);
      el.removeEventListener("touchmove", onMove);
      el.removeEventListener("touchend", onEnd);
      el.removeEventListener("touchcancel", reset);
      el.removeEventListener("contextmenu", onMenu);
    };
  }, []);

  return (
    <div>
      <PageHead title="Pipeline" sub="Drag cards between stages (on a phone: press and hold a card, then drag) — moving to Applied auto-sets a follow-up. Tip: hover the board and use your mouse wheel to glide sideways."
        right={<button className="btn btn-primary" onClick={() => setModal({ type: "job" })}><Plus size={15} /> Add job</button>} />
      <div className="kanban" ref={boardRef}
        onDragOver={(e) => { pointerX.current = e.clientX; }}
        onDrop={() => { pointerX.current = null; }}>
        {STAGES.map((stage) => {
          const cards = data.jobs.filter((j) => j.status === stage);
          return (
            <div key={stage} data-stage={stage} className={"kanban-col " + (over === stage ? "over" : "")}
              onDragOver={(e) => { e.preventDefault(); setOver(stage); }}
              onDragLeave={() => setOver(null)}
              onDrop={(e) => { e.preventDefault(); setOver(null); if (dragId) moveJob(dragId, stage); setDragId(null); }}>
              <div className="kanban-head" style={{ borderTopColor: STAGE_COLORS[stage] }}>
                <span>{stage}</span><span className="mono kanban-count">{cards.length}</span>
              </div>
              <div className="kanban-cards">
                {cards.map((j) => {
                  const na = jobNextAction(j, data.followups, today);
                  return (
                    <div key={j.id} data-id={j.id} className={"kcard" + (dragId === j.id ? " dragging" : "")} draggable
                      onDragStart={() => setDragId(j.id)} onDragEnd={() => { setDragId(null); setOver(null); }}
                      onClick={() => openDetail(j.id)}>
                      <div className="kcard-title">{j.title}</div>
                      <div className="kcard-company">{companyName(j.company_id)}</div>
                      <div className="kcard-meta">
                        {j.priority && <PriorityBadge p={j.priority} />}
                        {j.location && <span className="muted">{j.location}</span>}
                      </div>
                      {na && na.tone !== "neutral" && <div className={"kcard-na tone-" + na.tone}><CircleDot size={9} /> {na.text}</div>}
                      {(j.date_applied || j.deadline) && (
                        <div className="kcard-dates mono">{j.date_applied ? "Applied " + fmtDate(j.date_applied) : "Due " + fmtDate(j.deadline)}</div>
                      )}
                      {(j.tags || []).length > 0 && <div className="tag-row">{j.tags.slice(0, 2).map((t) => <TagChip key={t} t={t} />)}</div>}
                    </div>
                  );
                })}
                {cards.length === 0 && <div className="kanban-empty">{over === stage ? "Release to drop" : "Drop here"}</div>}
              </div>
            </div>
          );
        })}
      </div>
    </div>
  );
}

/* ================================================================== */
/* Follow-ups                                                          */
/* ================================================================== */

function FollowupsPage({ data, setModal, upsert, remove, companyName, notify }) {
  const today = todayISO();
  const [tab, setTab] = useState("open");
  const enriched = data.followups.map((f) => ({ ...f, badge: fuBadgeState(f, today) }));
  const openList = enriched.filter((f) => ["Pending", "Sent", "No Reply"].includes(f.status))
    .sort((a, b) => (a.due_date || "").localeCompare(b.due_date || ""));
  const closedList = enriched.filter((f) => ["Done", "Skipped", "Closed"].includes(f.status))
    .sort((a, b) => (b.completed_date || b.due_date || "").localeCompare(a.completed_date || a.due_date || ""));
  const list = tab === "open" ? openList : closedList;

  const markSent = (f) => {
    const msg = f.actual_message || f.message_draft;
    upsert("followups", { ...f, status: "Sent", sent_date: today, actual_message: msg });
    notify("Marked sent ✓ — reply window is open");
  };
  const markReplied = (f) => {
    upsert("followups", { ...f, reply_received: "Yes", reply_date: today, status: "Done", completed_date: today });
    notify("Reply logged 🎉 Keep the thread warm");
  };

  return (
    <div>
      <PageHead title="Follow-ups" sub="Silence is normal. The follow-up is where replies happen."
        right={<button className="btn btn-primary" onClick={() => setModal({ type: "followup" })}><Plus size={15} /> Add follow-up</button>} />
      <div className="tabs">
        <button className={"tab " + (tab === "open" ? "active" : "")} onClick={() => setTab("open")}>Open ({openList.length})</button>
        <button className={"tab " + (tab === "closed" ? "active" : "")} onClick={() => setTab("closed")}>Completed</button>
      </div>
      {list.length === 0 ? (
        <Empty icon={BellRing} title={tab === "open" ? "No open follow-ups" : "Nothing completed yet"}
          hint="Follow up 4–7 days after applying or connecting. HV Vault creates these automatically when you mark a job Applied." />
      ) : (
        <div className="fu-list">
          {list.map((f) => {
            const job = data.jobs.find((j) => j.id === f.job_id);
            return (
              <div key={f.id} className={"fu-card edge-" + (f.badge === "Late" ? "late" : f.badge === "Due Today" ? "due" : f.badge === "Sent" ? "sent" : "none")}>
                <div className="fu-main">
                  <div className="fu-top">
                    <Badge color={FU_COLORS[f.badge] || "#8A8F9C"}>{f.badge}</Badge>
                    <span className="fu-type">{f.type}</span>
                    <span className="mono muted">{fmtDate(f.due_date)}</span>
                    {f.reply_received === "Yes" && <Badge color="#3E9B72">Replied</Badge>}
                  </div>
                  <div className="fu-title">
                    {f.title || "Follow-up"} · {companyName(f.company_id) !== "—" ? companyName(f.company_id) : "General"}
                    {job && <span className="muted"> · {job.title}</span>}
                    {f.contact_name && <span className="muted"> · {f.contact_name}</span>}
                  </div>
                  {f.next_action && <div className="fu-next"><ChevronRight size={12} /> Next: {f.next_action}</div>}
                  {(f.actual_message || f.message_draft) && <div className="fu-draft">{f.actual_message || f.message_draft}</div>}
                  {f.notes && <div className="fu-notes muted">{f.notes}</div>}
                </div>
                <div className="fu-actions">
                  {f.status === "Pending" && <button className="btn btn-good btn-sm" onClick={() => markSent(f)}><CheckCircle2 size={13} /> Sent</button>}
                  {["Sent", "No Reply"].includes(f.status) && <button className="btn btn-good btn-sm" onClick={() => markReplied(f)}>Got reply</button>}
                  {f.status === "Sent" && <button className="btn btn-ghost btn-sm" onClick={() => upsert("followups", { ...f, status: "No Reply" })}>No reply</button>}
                  {["Pending", "No Reply"].includes(f.status) && <button className="btn btn-ghost btn-sm" onClick={() => upsert("followups", { ...f, status: "Skipped" })}>Skip</button>}
                  <button className="icon-btn" onClick={() => setModal({ type: "followup", payload: f })}><Pencil size={14} /></button>
                  <button className="icon-btn danger" onClick={() => remove("followups", f.id)}><Trash2 size={14} /></button>
                </div>
              </div>
            );
          })}
        </div>
      )}
      <p className="muted small">Need words? All message templates live in <strong>Templates</strong> — placeholders auto-fill from your companies and jobs.</p>
    </div>
  );
}

function FollowupModal({ initial, data, onSave, onClose }) {
  const [f, setF] = useState(initial || {
    id: uid(), title: "", company_id: "", job_id: "", contact_name: "", contact_email: "",
    type: "Email", due_date: addDays(todayISO(), 4), status: "Pending",
    message_draft: "", actual_message: "", sent_date: "", reply_received: "No", reply_date: "",
    next_action: "", notes: "",
  });
  const set = (k) => (e) => setF({ ...f, [k]: e.target.value });
  const jobsForCompany = f.company_id ? data.jobs.filter((j) => j.company_id === f.company_id) : data.jobs;

  return (
    <Modal title={initial ? "Edit follow-up" : "Add follow-up"} onClose={onClose} wide>
      <div className="form-grid">
        <Field label="Title"><input className="input" value={f.title} onChange={set("title")} placeholder="First follow-up / Referral ask…" /></Field>
        <Field label="Type"><select className="input" value={f.type} onChange={set("type")}>{FOLLOWUP_TYPES.map((t) => <option key={t}>{t}</option>)}</select></Field>
        <Field label="Company">
          <select className="input" value={f.company_id} onChange={(e) => setF({ ...f, company_id: e.target.value, job_id: "" })}>
            <option value="">None / general</option>
            {data.companies.map((c) => <option key={c.id} value={c.id}>{c.name}</option>)}
          </select>
        </Field>
        <Field label="Job">
          <select className="input" value={f.job_id} onChange={set("job_id")}>
            <option value="">None</option>
            {jobsForCompany.map((j) => <option key={j.id} value={j.id}>{j.title}</option>)}
          </select>
        </Field>
        <Field label="Contact person"><input className="input" value={f.contact_name} onChange={set("contact_name")} /></Field>
        <Field label="Due date"><input className="input" type="date" value={f.due_date} onChange={set("due_date")} /></Field>
        <Field label="Status"><select className="input" value={f.status} onChange={set("status")}>{FU_STATUSES.map((t) => <option key={t}>{t}</option>)}</select></Field>
        <Field label="Sent date"><input className="input" type="date" value={f.sent_date} onChange={set("sent_date")} /></Field>
        <Field label="Reply received?"><select className="input" value={f.reply_received} onChange={set("reply_received")}><option>No</option><option>Yes</option></select></Field>
        <Field label="Reply date"><input className="input" type="date" value={f.reply_date} onChange={set("reply_date")} /></Field>
        <Field label="Next action" span><input className="input" value={f.next_action} onChange={set("next_action")} placeholder="e.g. If no reply by Friday, try LinkedIn DM" /></Field>
        <Field label="Message draft" span><textarea className="input" rows={3} value={f.message_draft} onChange={set("message_draft")} placeholder="Draft the exact message you'll send…" /></Field>
        <Field label="Actual message sent" span><textarea className="input" rows={3} value={f.actual_message} onChange={set("actual_message")} placeholder="Paste what you actually sent (keeps your history honest)" /></Field>
        <Field label="Notes" span><textarea className="input" rows={2} value={f.notes} onChange={set("notes")} /></Field>
      </div>
      <div className="modal-foot">
        <button className="btn btn-ghost" onClick={onClose}>Cancel</button>
        <button className="btn btn-primary" onClick={() => onSave(f)}>{initial ? "Save changes" : "Add follow-up"}</button>
      </div>
    </Modal>
  );
}

/* ================================================================== */
/* Pending Work                                                        */
/* ================================================================== */

function PendingPage({ data, setData, openJob, openCompany, companyName, setPage, notify }) {
  const today = todayISO();
  const { jobs, companies, followups, profileTasks } = data;

  const pendingApps = jobs.filter((j) => PRE_APPLY.includes(j.status));
  const pendingFUs = followups.filter((f) => f.status === "Pending");
  const noReply = jobs.filter((j) => {
    if (!["Applied", "Follow-up Needed"].includes(j.status)) return false;
    const na = jobNextAction(j, followups, today);
    return na && (na.tone === "warn" || na.tone === "late");
  });
  const waiting = jobs.filter((j) => ["Applied", "Follow-up Needed"].includes(j.status) && !noReply.includes(j));
  const interviewPrep = jobs.filter((j) => INTERVIEW_STAGES.includes(j.status));
  const researchPending = companies.filter((c) => c.status === "To Research");

  const label = (text, color) => <Badge color={color}>{text}</Badge>;
  const toggleTask = (id) => setData((d) => ({ ...d, profileTasks: d.profileTasks.map((t) => t.id === id ? { ...t, done: !t.done } : t) }));
  const resetWeek = () => { setData((d) => ({ ...d, profileTasks: d.profileTasks.map((t) => ({ ...t, done: false })) })); notify("Weekly tasks reset — fresh week, fresh reps"); };

  const Section = ({ title, count, children, emptyMsg }) => (
    <div className="card">
      <h3 className="card-title">{title} {count > 0 && <span className="count-pill">{count}</span>}</h3>
      {count === 0 ? <p className="muted small">{emptyMsg}</p> : children}
    </div>
  );

  return (
    <div>
      <PageHead title="Pending Work" sub="Everything waiting on you, in one place — clear red first, then yellow" />

      <Section title="Late & pending follow-ups" count={pendingFUs.length} emptyMsg="No pending follow-ups. ✓">
        <ul className="mini-list">
          {pendingFUs.sort((a, b) => (a.due_date || "").localeCompare(b.due_date || "")).map((f) => {
            const j = jobs.find((x) => x.id === f.job_id);
            const b = fuBadgeState(f, today);
            return (
              <li key={f.id}>
                <BellRing size={13} />
                <div style={{ flex: 1 }}>
                  <div className="mini-title">{f.title || f.type + " follow-up"} · {companyName(f.company_id) !== "—" ? companyName(f.company_id) : (j ? companyName(j.company_id) : "General")} {label(b, FU_COLORS[b])}</div>
                  <div className="mini-sub">Due {fmtDate(f.due_date)}{j ? " · " + j.title : ""}</div>
                </div>
                <button className="btn btn-ghost btn-sm" onClick={() => setPage("followups")}>Open</button>
              </li>
            );
          })}
        </ul>
      </Section>

      <Section title="Jobs waiting for your application" count={pendingApps.length} emptyMsg="Nothing sitting unapplied. ✓">
        <ul className="mini-list">
          {pendingApps.map((j) => (
            <li key={j.id}>
              <Briefcase size={13} />
              <div style={{ flex: 1 }}>
                <div className="mini-title">{j.title} · {companyName(j.company_id)} {j.deadline && j.deadline >= today && daysBetween(today, j.deadline) <= 3 ? label("Deadline near", "#CD6A6A") : label("Needs Action", "#D9A03D")}</div>
                <div className="mini-sub">{j.status}{j.deadline ? " · deadline " + fmtDate(j.deadline) : ""}</div>
              </div>
              <button className="btn btn-ghost btn-sm" onClick={() => openJob(j.id)}>Open</button>
            </li>
          ))}
        </ul>
      </Section>

      <Section title="No reply — action needed" count={noReply.length} emptyMsg="No stale applications. ✓">
        <ul className="mini-list">
          {noReply.map((j) => {
            const na = jobNextAction(j, followups, today);
            return (
              <li key={j.id}>
                <AlertTriangle size={13} />
                <div style={{ flex: 1 }}>
                  <div className="mini-title">{j.title} · {companyName(j.company_id)} {label(na.tone === "late" ? "Late" : "No Reply", na.tone === "late" ? "#CD6A6A" : "#6B7A99")}</div>
                  <div className="mini-sub">{na.why} → {na.text}</div>
                </div>
                <button className="btn btn-ghost btn-sm" onClick={() => openJob(j.id)}>Open</button>
              </li>
            );
          })}
        </ul>
      </Section>

      <Section title="Waiting for reply (window still open)" count={waiting.length} emptyMsg="Nothing in the quiet zone.">
        <ul className="mini-list">
          {waiting.map((j) => (
            <li key={j.id}>
              <Clock size={13} />
              <div style={{ flex: 1 }}>
                <div className="mini-title">{j.title} · {companyName(j.company_id)} {label("Waiting", "#6B7A99")}</div>
                <div className="mini-sub">Applied {fmtDate(j.date_applied)}</div>
              </div>
              <button className="btn btn-ghost btn-sm" onClick={() => openJob(j.id)}>Open</button>
            </li>
          ))}
        </ul>
      </Section>

      <Section title="Interview preparation" count={interviewPrep.length} emptyMsg="No interviews scheduled — outreach fills this section.">
        <ul className="mini-list">
          {interviewPrep.map((j) => (
            <li key={j.id}>
              <GraduationCap size={13} />
              <div style={{ flex: 1 }}>
                <div className="mini-title">{j.title} · {companyName(j.company_id)} {label(j.status, STAGE_COLORS[j.status])}</div>
                <div className="mini-sub">{j.interview_date ? "Interview " + fmtDate(j.interview_date) : "Date not set"} · prep checklist in Guides → Strategy & Prep</div>
              </div>
              <button className="btn btn-ghost btn-sm" onClick={() => openJob(j.id)}>Open</button>
            </li>
          ))}
        </ul>
      </Section>

      <Section title="Company research pending" count={researchPending.length} emptyMsg="All tracked companies researched. ✓">
        <ul className="mini-list">
          {researchPending.map((c) => (
            <li key={c.id}>
              <Building2 size={13} />
              <div style={{ flex: 1 }}>
                <div className="mini-title">{c.name} {label("Pending", "#D9A03D")}</div>
                <div className="mini-sub">Open the company and run the research checklist</div>
              </div>
              <button className="btn btn-ghost btn-sm" onClick={() => openCompany(c.id)}>Open</button>
            </li>
          ))}
        </ul>
      </Section>

      <div className="card">
        <div className="card-title-row">
          <h3 className="card-title">Weekly platform hygiene</h3>
          <button className="btn btn-ghost btn-sm" onClick={resetWeek}>Reset for new week</button>
        </div>
        <div className="check-grid one">
          {profileTasks.map((t) => (
            <label key={t.id} className="check-item">
              <input type="checkbox" checked={t.done} onChange={() => toggleTask(t.id)} />
              <span>{t.label}</span>
            </label>
          ))}
        </div>
      </div>
    </div>
  );
}

/* ================================================================== */
/* Resume Vault                                                        */
/* ================================================================== */

function ResumeVault({ data, setData, upsert, remove, notify, companyName, openPreview, downloadResume, setModal }) {
  const [tab, setTab] = useState("vault");
  const [dragOver, setDragOver] = useState(false);
  const inputRef = useRef(null);
  const today = todayISO();

  const acceptFile = async (file) => {
    if (!file) return;
    const okTypes = ["application/pdf", "application/msword", "application/vnd.openxmlformats-officedocument.wordprocessingml.document"];
    const okExt = /\.(pdf|doc|docx)$/i.test(file.name);
    if (!okTypes.includes(file.type) && !okExt) return notify("Please upload a PDF, DOC, or DOCX file");
    if (file.size > MAX_FILE_MB * 1024 * 1024) return notify("File too large — keep it under " + MAX_FILE_MB + " MB");
    const b64 = await new Promise((res, rej) => {
      const r = new FileReader();
      r.onload = () => res(String(r.result).split(",")[1]);
      r.onerror = () => rej(new Error("read failed"));
      r.readAsDataURL(file);
    });
    const id = uid();
    try {
      await window.storage.set(FILE_KEY(id), JSON.stringify({ name: file.name, mime: file.type || "application/octet-stream", data: b64 }));
    } catch (e) { return notify("Upload failed — storage error"); }
    const rec = {
      id, title: file.name.replace(/\.(pdf|doc|docx)$/i, ""), file_name: file.name,
      doc_type: /cover/i.test(file.name) ? "Cover letter" : "Resume",
      version: "", target_role: "", target_company: "", target_industry: "",
      skills_highlighted: "", experience_highlighted: "", notes: "", tags: [],
      status: "Active", is_master: false, has_file: true,
      uploaded_at: today, updated_at: today,
    };
    upsert("resumes", rec);
    notify("Uploaded — reading resume…");
    let rawText = "";
    try { rawText = await extractResumeText(file); } catch (err) { rawText = ""; }
    if (!rawText.trim()) notify("Couldn't read text from this file (scanned PDF or old .doc?) — you can paste the text manually in the review screen");
    let parsed = localParseResume(rawText);
    let usedAI = false;
    const ai = data.settings || {};
    if (aiAvailable(ai) && rawText) {
      notify("Reading the resume with AI…");
      let r = null;
      try { r = await runParse(ai, rawText); }
      catch (err) { r = { error: "Unexpected error talking to AI" }; }
      if (r && r.ok && r.data) {
        const merged = { ...parsed };
        PARSE_FIELDS.forEach((k) => { if (r.data[k]) merged[k] = String(r.data[k]); });
        parsed = merged; usedAI = true;
      } else if (r && r.error) notify("AI failed (" + r.error + ") — showing local parse instead");
    }
    setModal({ type: "parseReview", payload: { resume: rec, parsed, rawText, usedAI } });
  };

  const onDrop = (e) => {
    e.preventDefault(); setDragOver(false);
    const files = Array.from(e.dataTransfer.files || []);
    files.forEach(acceptFile);
  };

  const setMaster = (r) => {
    setData((d) => ({ ...d, resumes: d.resumes.map((x) => ({ ...x, is_master: x.id === r.id ? !r.is_master : false })) }));
    notify(r.is_master ? "Master unset" : '"' + r.title + '" is now your Master Resume');
  };

  const duplicate = async (r) => {
    const id = uid();
    try {
      const res = await window.storage.get(FILE_KEY(r.id));
      if (res && res.value) await window.storage.set(FILE_KEY(id), res.value);
    } catch (e) { /* metadata-only duplicate */ }
    upsert("resumes", { ...r, id, title: r.title + " (copy)", is_master: false, uploaded_at: today, updated_at: today });
    notify("Duplicated — rename the copy for its new target");
  };

  const deleteResume = async (r) => {
    if (!confirm('Delete "' + r.title + '"? Applications that used it keep the record name.')) return;
    try { await window.storage.delete(FILE_KEY(r.id)); } catch (e) { /* no file */ }
    remove("resumes", r.id);
    notify("Deleted");
  };

  const usage = (r) => {
    const used = data.jobs.filter((j) => j.resume_id === r.id);
    const appliedJobs = used.filter((j) => APPLIED_STAGES.includes(j.status));
    const replies = appliedJobs.filter((j) => RESPONSE_STAGES.includes(j.status) || j.resume_verdict === "worked");
    const interviews = appliedJobs.filter((j) => INTERVIEW_STAGES.includes(j.status) || ["Offer"].includes(j.status));
    return { used, apps: appliedJobs.length, replies: replies.length, interviews: interviews.length, rate: appliedJobs.length ? Math.round((replies.length / appliedJobs.length) * 100) : null };
  };

  const perf = data.resumes.filter((r) => r.doc_type !== "Cover letter").map((r) => ({ r, ...usage(r) }))
    .sort((a, b) => (b.rate ?? -1) - (a.rate ?? -1) || b.apps - a.apps);
  const best = perf.find((p) => p.apps > 0 && p.rate !== null);

  /* Master data handlers */
  const updateSection = (id, patch) => setData((d) => ({ ...d, master: d.master.map((m) => m.id === id ? { ...m, ...patch } : m) }));
  const addSection = () => setData((d) => ({ ...d, master: [...d.master, { id: uid(), title: "New section", content: "" }] }));
  const removeSection = (id) => { if (confirm("Remove this section?")) setData((d) => ({ ...d, master: d.master.filter((m) => m.id !== id) })); };

  return (
    <div>
      <PageHead title="Resume Vault" sub="Every version, where it went, and which one actually gets replies" />

      <div className="tabs">
        <button className={"tab " + (tab === "vault" ? "active" : "")} onClick={() => setTab("vault")}>Vault ({data.resumes.length})</button>
        <button className={"tab " + (tab === "perf" ? "active" : "")} onClick={() => setTab("perf")}>Performance</button>
        <button className={"tab " + (tab === "master" ? "active" : "")} onClick={() => setTab("master")}>Master Resume Data</button>
      </div>

      {tab === "vault" && (
        <div>
          <div className={"dropzone " + (dragOver ? "over" : "")}
            onDragOver={(e) => { e.preventDefault(); setDragOver(true); }}
            onDragLeave={() => setDragOver(false)} onDrop={onDrop}
            onClick={() => inputRef.current?.click()}>
            <Upload size={22} strokeWidth={1.6} />
            <div><strong>Drop your resume here</strong> or click to browse</div>
            <div className="muted small">PDF, DOC, DOCX · up to {MAX_FILE_MB} MB · stored privately in your vault</div>
            <input ref={inputRef} type="file" accept=".pdf,.doc,.docx" multiple style={{ display: "none" }}
              onChange={(e) => { Array.from(e.target.files || []).forEach(acceptFile); e.target.value = ""; }} />
          </div>

          {data.resumes.length === 0 ? (
            <Empty icon={FolderOpen} title="Your vault is empty" hint="Upload your resume versions — one per role type — then link each application to the version you sent." />
          ) : (
            <div className="resume-grid">
              {data.resumes.map((r) => {
                const u = usage(r);
                return (
                  <div key={r.id} className={"resume-card " + (r.is_master ? "master" : "")}>
                    <div className="resume-card-head">
                      <div className="resume-icon"><FileText size={17} /></div>
                      <div className="resume-titlewrap">
                        <div className="resume-title">{r.title}{r.is_master && <span className="master-tag"><Star size={10} /> Master</span>}</div>
                        <div className="resume-sub muted">{r.doc_type}{r.version ? " · " + r.version : ""}{r.target_role ? " · " + r.target_role : ""}</div>
                      </div>
                      <Badge color={DOC_STATUS_COLORS[r.status] || "#8A8F9C"}>{r.status}</Badge>
                    </div>
                    {(r.skills_highlighted || r.target_industry) && (
                      <div className="resume-line muted small">{[r.target_industry, r.skills_highlighted].filter(Boolean).join(" · ")}</div>
                    )}
                    <div className="resume-usage">
                      <span><strong>{u.apps}</strong> applications</span>
                      <span><strong>{u.replies}</strong> replies</span>
                      <span><strong>{u.interviews}</strong> interviews</span>
                      {u.rate !== null && <span className={u.rate >= 20 ? "good-text" : ""}><strong>{u.rate}%</strong> reply rate</span>}
                    </div>
                    {u.used.length > 0 && (
                      <div className="resume-used muted small">Used at: {u.used.slice(0, 3).map((j) => companyName(j.company_id)).join(", ")}{u.used.length > 3 ? " +" + (u.used.length - 3) : ""}</div>
                    )}
                    {(r.tags || []).length > 0 && <div className="tag-row">{r.tags.map((t) => <TagChip key={t} t={t} />)}</div>}
                    <div className="resume-meta muted small">Uploaded {fmtDate(r.uploaded_at)} · Updated {fmtDate(r.updated_at)}</div>
                    {r.parsed && (
                      <button className="btn btn-ghost btn-sm parsed-btn" onClick={() => setModal({ type: "parsedView", payload: r })}>
                        <Sparkles size={12} /> View extracted data
                      </button>
                    )}
                    <div className="resume-actions">
                      {r.has_file && <button className="btn btn-ghost btn-sm" onClick={() => openPreview(r)}><Eye size={12} /> View</button>}
                      {r.has_file && <button className="btn btn-ghost btn-sm" onClick={() => downloadResume(r)}><Download size={12} /></button>}
                      <button className="btn btn-ghost btn-sm" onClick={() => setModal({ type: "resume", payload: r })}><Pencil size={12} /> Edit</button>
                      <button className="btn btn-ghost btn-sm" onClick={() => duplicate(r)}><Copy size={12} /></button>
                      {r.doc_type !== "Cover letter" && (
                        <button className={"btn btn-sm " + (r.is_master ? "btn-primary" : "btn-ghost")} onClick={() => setMaster(r)} title="Mark as Master Resume"><Star size={12} /></button>
                      )}
                      <button className="icon-btn danger" onClick={() => deleteResume(r)}><Trash2 size={13} /></button>
                    </div>
                  </div>
                );
              })}
            </div>
          )}

          {data.files && data.files.length > 0 && (
            <div className="card">
              <h3 className="card-title">Older file records (links only)</h3>
              {data.files.map((f) => (
                <div key={f.id} className="result-row" style={{ cursor: "default" }}>
                  <span className="result-main">{f.file_url ? <a className="text-link" href={f.file_url} target="_blank" rel="noreferrer">{f.file_name} ↗</a> : f.file_name}</span>
                  <span className="result-sub">{f.file_type} {f.version_name ? "· " + f.version_name : ""}</span>
                  <button className="icon-btn danger" onClick={() => remove("files", f.id)}><Trash2 size={13} /></button>
                </div>
              ))}
            </div>
          )}
        </div>
      )}

      {tab === "perf" && (
        <div>
          {best && (
            <div className="best-banner">
              <Star size={15} />
              <span><strong>Best performer:</strong> {best.r.title} — {best.rate}% reply rate across {best.apps} applications. Default to it when unsure.</span>
            </div>
          )}
          {perf.filter((p) => p.apps > 0).length === 0 ? (
            <Empty icon={BarChart3} title="No performance data yet" hint="Link a resume to each application (in the job's detail page). Once applications go out, reply and interview rates appear here per version." />
          ) : (
            <div className="table-card">
              <table>
                <thead><tr><th>Resume</th><th>Version</th><th>Target role</th><th>Applications</th><th>Replies</th><th>Interviews</th><th>Reply rate</th><th>Verdicts</th></tr></thead>
                <tbody>
                  {perf.filter((p) => p.apps > 0).map(({ r, apps, replies, interviews, rate, used }) => {
                    const good = used.filter((j) => j.resume_verdict === "worked").length;
                    const bad = used.filter((j) => j.resume_verdict === "no_response").length;
                    return (
                      <tr key={r.id}>
                        <td><strong>{r.title}</strong>{r.is_master && <span className="master-tag"><Star size={9} /> Master</span>}</td>
                        <td className="muted">{r.version || "—"}</td>
                        <td className="muted">{r.target_role || "—"}</td>
                        <td className="mono">{apps}</td>
                        <td className="mono">{replies}</td>
                        <td className="mono">{interviews}</td>
                        <td>{rate !== null ? <Badge color={rate >= 20 ? "#3E9B72" : rate >= 10 ? "#D9A03D" : "#CD6A6A"}>{rate}%</Badge> : "—"}</td>
                        <td className="muted small">👍 {good} · 👎 {bad}</td>
                      </tr>
                    );
                  })}
                </tbody>
              </table>
            </div>
          )}
          <p className="muted small">Reply = the application reached Recruiter Responded or beyond, or you marked "👍 Got a response" on the job. Small samples mislead — trust rates only after 8–10 applications per version.</p>
        </div>
      )}

      {tab === "master" && (
        <div>
          <p className="hint-strip"><Sparkles size={14} /> Your full raw career data. When customizing a resume, pull bullets from here — never write from memory. Edit freely; it saves automatically.</p>
          {data.master.map((m) => (
            <div key={m.id} className="card master-section">
              <div className="card-title-row">
                <input className="input master-title" value={m.title} onChange={(e) => updateSection(m.id, { title: e.target.value })} />
                <button className="icon-btn danger" onClick={() => removeSection(m.id)}><Trash2 size={14} /></button>
              </div>
              <textarea className="input master-text" rows={Math.min(16, Math.max(5, m.content.split("\n").length + 1))}
                value={m.content} onChange={(e) => updateSection(m.id, { content: e.target.value })} />
            </div>
          ))}
          <button className="btn btn-ghost" onClick={addSection}><Plus size={14} /> Add section</button>
        </div>
      )}
    </div>
  );
}

function ResumeMetaModal({ initial, data, onSave, onClose }) {
  const [f, setF] = useState(initial);
  const set = (k) => (e) => setF({ ...f, [k]: e.target.value });
  if (!f) return null;
  return (
    <Modal title="Resume details" onClose={onClose} wide>
      <div className="form-grid">
        <Field label="Title *"><input className="input" value={f.title} onChange={set("title")} autoFocus /></Field>
        <Field label="Document type"><select className="input" value={f.doc_type} onChange={set("doc_type")}>{DOC_TYPES.map((t) => <option key={t}>{t}</option>)}</select></Field>
        <Field label="Version name"><input className="input" value={f.version} onChange={set("version")} placeholder="v3 sales-heavy" /></Field>
        <Field label="Status"><select className="input" value={f.status} onChange={set("status")}>{DOC_STATUSES.map((t) => <option key={t}>{t}</option>)}</select></Field>
        <Field label="Target role"><input className="input" value={f.target_role} onChange={set("target_role")} placeholder="APMM / GTM Associate" /></Field>
        <Field label="Target company"><input className="input" value={f.target_company} onChange={set("target_company")} /></Field>
        <Field label="Target industry"><input className="input" value={f.target_industry} onChange={set("target_industry")} placeholder="Fintech SaaS" /></Field>
        <Field label="Tags (comma separated)"><input className="input" value={(f.tags || []).join(", ")} onChange={(e) => setF({ ...f, tags: parseTags(e.target.value) })} /></Field>
        <Field label="Skills highlighted" span><input className="input" value={f.skills_highlighted} onChange={set("skills_highlighted")} placeholder="GTM, positioning, SEO, partnerships" /></Field>
        <Field label="Experience highlighted" span><input className="input" value={f.experience_highlighted} onChange={set("experience_highlighted")} placeholder="e.g. Startup GTM ownership, top-3 sales rank" /></Field>
        <Field label="Notes" span><textarea className="input" rows={2} value={f.notes} onChange={set("notes")} /></Field>
      </div>
      <div className="modal-foot">
        <button className="btn btn-ghost" onClick={onClose}>Cancel</button>
        <button className="btn btn-primary" disabled={!f.title.trim()} onClick={() => onSave({ ...f, updated_at: todayISO() })}>Save</button>
      </div>
    </Modal>
  );
}


function ParseReviewModal({ payload, settings, onSave, onClose, notify }) {
  const { resume, usedAI } = payload;
  const [f, setF] = useState({ ...payload.parsed });
  const [raw, setRaw] = useState(payload.rawText || "");
  const [showRaw, setShowRaw] = useState(!(payload.rawText || "").trim());
  const [addToMaster, setAddToMaster] = useState(true);
  const [busy, setBusy] = useState(false);
  const set = (k) => (e) => setF({ ...f, [k]: e.target.value });

  const rerunLocal = () => { setF({ ...localParseResume(raw) }); notify("Local parse re-run — review below"); };
  const rerunAI = async () => {
    if (!aiAvailable(settings)) return notify(AI_OFF_MSG());
    setBusy(true);
    const r = await runParse(settings, raw);
    setBusy(false);
    if (r && r.ok && r.data) {
      const m = { ...f };
      PARSE_FIELDS.forEach((k) => { if (r.data[k]) m[k] = String(r.data[k]); });
      setF(m); notify("AI parse done — review before saving");
    } else notify("AI failed: " + ((r && r.error) || "unknown error"));
  };

  const save = () => {
    const patch = { ...resume, parsed: { ...f }, skills_highlighted: f.skills || resume.skills_highlighted || "", updated_at: todayISO() };
    let section = null;
    if (addToMaster) {
      section = {
        id: uid(), title: "Parsed resume — " + (f.name || resume.title),
        content: ["SUMMARY", f.summary || "—", "", "SKILLS", f.skills || "—", "", "EXPERIENCE", f.experience || "—", "", "EDUCATION", f.education || "—", "", "PROJECTS", f.projects || "—"].join("\n"),
      };
    }
    onSave(patch, section);
  };

  return (
    <Modal title={"Review parsed resume " + (usedAI ? "(AI-assisted)" : "(local parser)")} onClose={onClose} wide>
      <p className="muted small" style={{ marginBottom: 12 }}>Parsers make mistakes — check and fix the fields below before saving. Nothing is saved until you click the button.</p>
      <div className="form-grid">
        <Field label="Name"><input className="input" value={f.name || ""} onChange={set("name")} /></Field>
        <Field label="Email"><input className="input" value={f.email || ""} onChange={set("email")} /></Field>
        <Field label="Phone"><input className="input" value={f.phone || ""} onChange={set("phone")} /></Field>
        <Field label="LinkedIn"><input className="input" value={f.linkedin || ""} onChange={set("linkedin")} /></Field>
        <Field label="Portfolio"><input className="input" value={f.portfolio || ""} onChange={set("portfolio")} /></Field>
        <Field label="Location"><input className="input" value={f.location || ""} onChange={set("location")} /></Field>
        <Field label="Target role / headline"><input className="input" value={f.target_role || ""} onChange={set("target_role")} /></Field>
        <Field label="Skills (comma separated)"><input className="input" value={f.skills || ""} onChange={set("skills")} /></Field>
        <Field label="Summary" span><textarea className="input" rows={2} value={f.summary || ""} onChange={set("summary")} /></Field>
        <Field label="Experience" span><textarea className="input" rows={4} value={f.experience || ""} onChange={set("experience")} /></Field>
        <Field label="Education" span><textarea className="input" rows={2} value={f.education || ""} onChange={set("education")} /></Field>
        <Field label="Projects" span><textarea className="input" rows={2} value={f.projects || ""} onChange={set("projects")} /></Field>
      </div>
      <label className="check-item" style={{ marginTop: 12 }}>
        <input type="checkbox" checked={addToMaster} onChange={() => setAddToMaster(!addToMaster)} />
        <span>Also add this as a new section in Master Resume Data</span>
      </label>
      <div style={{ marginTop: 12 }}>
        <button className="text-link" onClick={() => setShowRaw(!showRaw)}>{showRaw ? "Hide extracted text" : "Show / edit extracted text"}</button>
        {showRaw && (
          <div>
            <textarea className="input" rows={6} style={{ width: "100%", marginTop: 8 }} value={raw} onChange={(e) => setRaw(e.target.value)}
              placeholder="If extraction failed (scanned PDF or old .doc file), paste your resume text here and re-run." />
            <div className="btn-row" style={{ marginTop: 8 }}>
              <button className="btn btn-ghost btn-sm" onClick={rerunLocal}>Re-run local parse</button>
              <button className="btn btn-ghost btn-sm" disabled={busy} onClick={rerunAI}>{busy ? "Asking AI…" : "Re-run with AI"}</button>
            </div>
          </div>
        )}
      </div>
      <div className="modal-foot">
        <button className="btn btn-ghost" onClick={onClose}>Skip</button>
        <button className="btn btn-primary" onClick={save}>Save parsed data</button>
      </div>
    </Modal>
  );
}


/* ================================================================== */
/* Profile page                                                        */
/* ================================================================== */

function ProfilePage({ data, setData, notify, onStartSetup }) {
  const p = data.profile;
  const s = data.settings;
  const [edit, setEdit] = useState(null);
  const [busy, setBusy] = useState(false);
  const fileRef = useRef(null);

  const emptyProfile = () => ({
    name: s.myName || "", email: "", phone: "", location: s.locations || "", target_role: s.targetRole || "",
    linkedin: s.linkedin || "", portfolio: s.portfolio || "", skills: s.skills || "",
    total_experience: "", summary: "", education: "", experience: "", projects: "",
    work_experience: [], internships: [],
    remote_pref: s.remotePref || "Hybrid", expected_salary: s.expectedSalary || "", resume_link: s.resumeLink || "",
  });

  const saveProfile = (prof) => {
    setData((d) => {
      const st = { ...d.settings };
      if (prof.name) st.myName = prof.name;
      if (prof.target_role) st.targetRole = prof.target_role;
      if (prof.location) st.locations = prof.location;
      if (prof.linkedin) st.linkedin = prof.linkedin;
      if (prof.portfolio) st.portfolio = prof.portfolio;
      if (prof.skills) st.skills = prof.skills;
      if (prof.remote_pref !== undefined) st.remotePref = prof.remote_pref;          // job-search preferences live on the Profile page now
      if (prof.expected_salary !== undefined) st.expectedSalary = prof.expected_salary;
      if (prof.resume_link !== undefined) st.resumeLink = prof.resume_link;
      return { ...d, settings: st, profile: { ...prof, saved_at: todayISO() } };
    });
    notify("Profile saved ✓");
    setEdit(null);
  };

  const reupload = async (file) => {
    if (!file) return;
    if (!/\.(pdf|docx)$/i.test(file.name)) return notify("Please upload a PDF or DOCX resume");
    if (file.size > MAX_FILE_MB * 1024 * 1024) return notify("File too large — keep it under " + MAX_FILE_MB + " MB");
    setBusy(true);
    try {
      let text = "";
      try { text = await extractResumeText(file); } catch (e) {}
      if (!text.trim()) notify("Couldn't read text from this file — you can still edit fields manually");
      const flat = localParseResume(text);
      let prof = { ...emptyProfile(), ...(p || {}) };
      PARSE_FIELDS.forEach((k) => { if (flat[k]) prof[k] = flat[k]; });
      const hv = (typeof window !== "undefined" && window.hv) || {};
      let siteAI = false;
      if (hv.aiParseProject) {                                         // the site's built-in AI: no key needed
        const isPdf = /\.pdf$/i.test(file.name);
        let b64 = null;
        if (isPdf && text.trim().length < 200) { try { b64 = await new Promise((res, rej) => { const r = new FileReader(); r.onload = () => res(String(r.result).split(",")[1]); r.onerror = () => rej(new Error("read failed")); r.readAsDataURL(file); }); } catch (e) {} }
        if (text.trim() || b64) {
          notify("Reading your resume…");
          const r = await hv.aiParseProject({ text, pdfBase64: b64 });
          if (r && r.ok && r.data) { PARSE_FIELDS.forEach((k) => { if (r.data[k]) prof[k] = String(r.data[k]).trim(); }); siteAI = true; }
        }
      }
      if (!siteAI && s.aiProvider && s.aiProvider !== "off" && s.aiKey && text.trim() && typeof window !== "undefined" && window.hv && window.hv.aiExtract) {
        notify("Asking AI to structure your profile…");
        const r = await window.hv.aiExtract({ provider: s.aiProvider, apiKey: s.aiKey, model: s.aiModel || "", kind: "profile", text, imageBase64: "", imageMime: "" });
        if (r && r.ok && r.data) {
          const d = r.data;
          ["name", "email", "phone", "linkedin", "portfolio", "location", "target_role", "total_experience", "skills", "summary", "education", "projects", "experience"].forEach((k) => { if (d[k]) prof[k] = String(d[k]); });
          if (Array.isArray(d.work_experience)) prof.work_experience = d.work_experience.map((w) => ({ company: w.company || "", role: w.role || "", duration: w.duration || "" }));
          if (Array.isArray(d.internships)) prof.internships = d.internships.map((w) => ({ company: w.company || "", role: w.role || "", duration: w.duration || "" }));
        } else if (r && r.error) notify("AI failed (" + r.error + ") — showing local parse");
      }
      setEdit(prof); // review before save — nothing persists until Save Profile
    } finally { setBusy(false); }
  };

  // no profile yet: open the guided setup (reads the resume with the site's AI); desktop falls back to the file picker
  const createFromResume = () => (onStartSetup ? onStartSetup() : fileRef.current && fileRef.current.click());

  return (
    <div>
      <PageHead title="Profile" sub="Your career data — powers greetings, templates, and resume customization"
        right={<div className="btn-row">
          {p ? (<>
            <button className="btn btn-ghost" disabled={busy} onClick={() => fileRef.current && fileRef.current.click()}><Upload size={14} /> {busy ? "Reading…" : "Re-upload resume"}</button>
            <button className="btn btn-primary" onClick={() => setEdit({ ...emptyProfile(), ...(p || {}) })}><Pencil size={14} /> Update profile</button>
          </>) : (
            <button className="btn btn-primary" disabled={busy} onClick={createFromResume}><Plus size={14} /> Create profile</button>
          )}
          <input ref={fileRef} type="file" accept=".pdf,.docx" style={{ display: "none" }} onChange={(e) => { reupload(e.target.files && e.target.files[0]); e.target.value = ""; }} />
        </div>} />

      {!p ? (
        <Empty icon={User} title="Create your profile"
          hint="Upload your resume and your profile is filled in automatically. Or answer a few quick questions instead. About two minutes."
          action={<div className="btn-row" style={{ justifyContent: "center", marginTop: 8 }}>
            <button className="btn btn-primary" disabled={busy} onClick={createFromResume}><Upload size={14} /> {busy ? "Reading…" : "Upload resume"}</button>
            <button className="btn btn-ghost" onClick={() => setEdit(emptyProfile())}><Pencil size={14} /> Fill it in myself</button>
          </div>} />
      ) : (
        <div>
          <div className="card profile-head">
            <div className="profile-avatar">{(p.name || "?").split(" ").map((w) => w[0]).join("").slice(0, 2).toUpperCase()}</div>
            <div style={{ flex: 1 }}>
              <h2 style={{ marginBottom: 2 }}>{p.name || "—"}</h2>
              <div className="muted">{p.target_role || "Add your target role"}</div>
              <div className="profile-chips">
                {p.total_experience && <Badge color="#5B7CC4">{p.total_experience} experience</Badge>}
                {p.location && <span className="tagchip">📍 {p.location}</span>}
                {p.email && <span className="tagchip">✉ {p.email}</span>}
                {s.remotePref && <span className="tagchip">🏢 {s.remotePref}</span>}
                {s.expectedSalary && <span className="tagchip">💰 {s.expectedSalary}</span>}
                {p.phone && <span className="tagchip">📞 {p.phone}</span>}
              </div>
              <div className="link-row" style={{ marginTop: 8, marginBottom: 0 }}>
                {p.linkedin && <a className="text-link" href={p.linkedin.startsWith("http") ? p.linkedin : "https://" + p.linkedin} target="_blank" rel="noreferrer">LinkedIn ↗</a>}
                {p.portfolio && <a className="text-link" href={p.portfolio.startsWith("http") ? p.portfolio : "https://" + p.portfolio} target="_blank" rel="noreferrer">Portfolio ↗</a>}
                {s.resumeLink && <a className="text-link" href={s.resumeLink.startsWith("http") ? s.resumeLink : "https://" + s.resumeLink} target="_blank" rel="noreferrer">Resume ↗</a>}
              </div>
            </div>
          </div>

          {p.skills && (
            <div className="card">
              <h3 className="card-title">Skills</h3>
              <div className="tag-row" style={{ marginTop: 0 }}>
                {p.skills.split(",").map((sk) => sk.trim()).filter(Boolean).map((sk) => <span key={sk} className="tagchip">{sk}</span>)}
              </div>
            </div>
          )}

          {(p.work_experience || []).length > 0 && (
            <div className="card">
              <h3 className="card-title">Work experience</h3>
              <ul className="mini-list">
                {p.work_experience.map((w, i) => (
                  <li key={i}><Briefcase size={13} /><div><div className="mini-title">{w.role || "—"} · {w.company || "—"}</div><div className="mini-sub">{w.duration || ""}</div></div></li>
                ))}
              </ul>
            </div>
          )}

          {(p.internships || []).length > 0 && (
            <div className="card">
              <h3 className="card-title">Internships</h3>
              <ul className="mini-list">
                {p.internships.map((w, i) => (
                  <li key={i}><GraduationCap size={13} /><div><div className="mini-title">{w.role || "—"} · {w.company || "—"}</div><div className="mini-sub">{w.duration || ""}</div></div></li>
                ))}
              </ul>
            </div>
          )}

          {(p.work_experience || []).length === 0 && p.experience && (
            <div className="card"><h3 className="card-title">Experience (from resume)</h3><p className="prewrap muted small">{p.experience}</p></div>
          )}
          {p.summary && <div className="card"><h3 className="card-title">Summary</h3><p className="prewrap">{p.summary}</p></div>}
          {p.education && <div className="card"><h3 className="card-title">Education</h3><p className="prewrap muted small">{p.education}</p></div>}
          {p.projects && <div className="card"><h3 className="card-title">Projects / certifications</h3><p className="prewrap muted small">{p.projects}</p></div>}
        </div>
      )}

      {edit && <ProfileEditModal initial={{ remote_pref: s.remotePref || "Hybrid", expected_salary: s.expectedSalary || "", resume_link: s.resumeLink || "", ...edit }} onSave={saveProfile} onClose={() => setEdit(null)} />}
    </div>
  );
}

function ProfileEditModal({ initial, onSave, onClose }) {
  const [f, setF] = useState(initial);
  const set = (k) => (e) => setF({ ...f, [k]: e.target.value });
  const rows = (k) => f[k] || [];
  const setRow = (k, i, field, val) => setF({ ...f, [k]: rows(k).map((r, x) => (x === i ? { ...r, [field]: val } : r)) });
  const addRow = (k) => setF({ ...f, [k]: [...rows(k), { company: "", role: "", duration: "" }] });
  const delRow = (k, i) => setF({ ...f, [k]: rows(k).filter((_, x) => x !== i) });

  const renderRows = (label, k) => (
    <div className="field-span">
      <div className="card-title-row" style={{ marginBottom: 6 }}>
        <span className="field-label">{label}</span>
        <button className="btn btn-ghost btn-sm" onClick={() => addRow(k)}><Plus size={12} /> Add</button>
      </div>
      {rows(k).map((r, i) => (
        <div key={i} className="exp-row">
          <input className="input" placeholder="Company" value={r.company} onChange={(e) => setRow(k, i, "company", e.target.value)} />
          <input className="input" placeholder="Role" value={r.role} onChange={(e) => setRow(k, i, "role", e.target.value)} />
          <input className="input" placeholder="Duration (e.g. Jul 2025 – Present)" value={r.duration} onChange={(e) => setRow(k, i, "duration", e.target.value)} />
          <button className="icon-btn danger" onClick={() => delRow(k, i)}><Trash2 size={13} /></button>
        </div>
      ))}
      {rows(k).length === 0 && <p className="muted small">None added yet.</p>}
    </div>
  );

  return (
    <Modal title="Profile — review & edit" onClose={onClose} wide>
      <p className="muted small" style={{ marginBottom: 12 }}>Nothing is saved until you click Save Profile.</p>
      <div className="form-grid">
        <Field label="Name"><input className="input" value={f.name || ""} onChange={set("name")} /></Field>
        <Field label="Total experience"><input className="input" value={f.total_experience || ""} onChange={set("total_experience")} placeholder="e.g. 1 year 2 months" /></Field>
        <Field label="Target role / headline"><input className="input" value={f.target_role || ""} onChange={set("target_role")} /></Field>
        <Field label="Location"><input className="input" value={f.location || ""} onChange={set("location")} /></Field>
        <Field label="Email"><input className="input" value={f.email || ""} onChange={set("email")} /></Field>
        <Field label="Phone"><input className="input" value={f.phone || ""} onChange={set("phone")} /></Field>
        <Field label="LinkedIn URL"><input className="input" value={f.linkedin || ""} onChange={set("linkedin")} /></Field>
        <Field label="Portfolio URL"><input className="input" value={f.portfolio || ""} onChange={set("portfolio")} /></Field>
        <Field label="Skills (comma separated)" span><input className="input" value={f.skills || ""} onChange={set("skills")} /></Field>
        <Field label="Work mode preference"><select className="input" value={f.remote_pref || "Hybrid"} onChange={set("remote_pref")}>{WORK_MODES.map((m) => <option key={m}>{m}</option>)}</select></Field>
        <Field label="Expected salary"><input className="input" value={f.expected_salary || ""} onChange={set("expected_salary")} placeholder="₹8–12 LPA" /></Field>
        <Field label="Resume link (used as {resume_link} in templates)" span><input className="input" value={f.resume_link || ""} onChange={set("resume_link")} placeholder="Drive/Dropbox share link" /></Field>
        {renderRows("Work experience", "work_experience")}
        {renderRows("Internships", "internships")}
        <Field label="Summary" span><textarea className="input" rows={2} value={f.summary || ""} onChange={set("summary")} /></Field>
        <Field label="Education" span><textarea className="input" rows={2} value={f.education || ""} onChange={set("education")} /></Field>
        <Field label="Projects / certifications" span><textarea className="input" rows={2} value={f.projects || ""} onChange={set("projects")} /></Field>
      </div>
      <div className="modal-foot">
        <button className="btn btn-ghost" onClick={onClose}>Cancel</button>
        <button className="btn btn-primary" onClick={() => onSave(f)}>Save Profile</button>
      </div>
    </Modal>
  );
}

/* ================================================================== */
/* AI Auto-fill modal (Jobs & Companies)                               */
/* ================================================================== */

function AutofillModal({ kind, settings, notify, onClose, onExtract }) {
  const toast = notify || (() => {});
  const st = settings || {};
  const [tab, setTab] = useState("paste");
  const [text, setText] = useState("");
  const [img, setImg] = useState(null);
  const [busy, setBusy] = useState(false);
  const pdfRef = useRef(null);
  const imgRef = useRef(null);
  const aiReady = aiAvailable(st);

  const onPdf = async (file) => {
    if (!file) return;
    setBusy(true);
    try {
      const t = await extractResumeText(file);
      if (!t.trim()) toast("Couldn't read text from this PDF — try paste or a screenshot instead");
      else { setText(t); setTab("paste"); toast("PDF text loaded — review it, then click Extract"); }
    } catch (e) { toast("Could not read that PDF"); }
    finally { setBusy(false); }
  };
  const onImg = async (file) => {
    if (!file) return;
    if (!/^image\//.test(file.type)) return toast("Please choose an image file (PNG/JPG)");
    if (file.size > 4 * 1024 * 1024) return toast("Image too large — keep it under 4 MB");
    const b64 = await new Promise((res, rej) => {
      const r = new FileReader();
      r.onload = () => res(String(r.result).split(",")[1]);
      r.onerror = () => rej(new Error("read failed"));
      r.readAsDataURL(file);
    });
    setImg({ data: b64, mime: file.type, name: file.name });
    toast("Screenshot added — click Extract");
  };
  const run = async () => {
    if (!aiReady) return toast(AI_OFF_MSG());
    if (!text.trim() && !img) return toast("Paste the JD, upload a PDF, or add a screenshot first");
    setBusy(true);
    const r = await runExtract(st, { kind, text: text.trim(), imageBase64: img ? img.data : "", imageMime: img ? img.mime : "" });
    setBusy(false);
    if (r && r.ok && r.data) { toast("Extracted ✓ — review every field before saving"); onExtract(r.data); }
    else toast("AI failed: " + ((r && r.error) || "unknown error"));
  };

  return (
    <Modal title={"Auto-fill " + (kind === "company" ? "company" : "job") + " with AI"} onClose={onClose}>
      {!aiReady && (
        <p className="hint-strip"><Sparkles size={14} /><span>{IS_WEB() ? "AI isn't available right now. Reload the page and try again." : "AI is off. Add your Gemini or OpenRouter key in Settings > HV AI to use auto-fill. Nothing is sent anywhere until you click Extract."}</span></p>
      )}
      <div className="tabs" style={{ marginBottom: 12 }}>
        <button className={"tab " + (tab === "paste" ? "active" : "")} onClick={() => setTab("paste")}>Paste text</button>
        <button className={"tab " + (tab === "pdf" ? "active" : "")} onClick={() => setTab("pdf")}>Upload PDF</button>
        <button className={"tab " + (tab === "img" ? "active" : "")} onClick={() => setTab("img")}>Screenshot</button>
      </div>
      {tab === "paste" && (
        <textarea className="input" rows={8} style={{ width: "100%" }} value={text} onChange={(e) => setText(e.target.value)}
          placeholder={kind === "company" ? "Paste the company's About / description text here…" : "Paste the full job description here…"} />
      )}
      {tab === "pdf" && (
        <div className="dropzone" style={{ marginBottom: 0 }} onClick={() => !busy && pdfRef.current && pdfRef.current.click()}>
          <FileText size={20} strokeWidth={1.6} />
          <div><strong>{busy ? "Reading PDF…" : "Click to choose a PDF"}</strong></div>
          <input ref={pdfRef} type="file" accept=".pdf" style={{ display: "none" }} onChange={(e) => { onPdf(e.target.files && e.target.files[0]); e.target.value = ""; }} />
        </div>
      )}
      {tab === "img" && (
        <div className="dropzone" style={{ marginBottom: 0 }} onClick={() => imgRef.current && imgRef.current.click()}>
          <ImageIcon size={20} strokeWidth={1.6} />
          <div><strong>{img ? "✓ " + img.name : "Click to choose a screenshot (PNG/JPG)"}</strong></div>
          <div className="muted small">Sent to your AI provider only when you click Extract</div>
          <input ref={imgRef} type="file" accept="image/*" style={{ display: "none" }} onChange={(e) => { onImg(e.target.files && e.target.files[0]); e.target.value = ""; }} />
        </div>
      )}
      {text.trim() && tab !== "paste" && <p className="muted small" style={{ marginTop: 8 }}>✓ Text loaded ({text.length} chars) — switch to "Paste text" to view or edit it.</p>}
      <div className="modal-foot">
        <button className="btn btn-ghost" onClick={onClose}>Cancel</button>
        <button className="btn btn-primary" disabled={busy} onClick={run}>{busy ? "Extracting…" : "Extract with AI"}</button>
      </div>
    </Modal>
  );
}

function ParsedDataViewer({ resume, onClose, onApplyToProfile, notify }) {
  const p = resume.parsed || {};
  const rows = [
    ["Name", p.name], ["Email", p.email], ["Phone", p.phone], ["Location", p.location],
    ["Target role / headline", p.target_role], ["LinkedIn", p.linkedin], ["Portfolio", p.portfolio],
    ["Skills", p.skills],
  ];
  const blocks = [["Summary", p.summary], ["Experience", p.experience], ["Education", p.education], ["Projects / certifications", p.projects]];
  return (
    <Modal title={"Extracted data — " + resume.title} onClose={onClose} wide>
      <p className="muted small" style={{ marginBottom: 12 }}>This is what was pulled from this resume file. It's stored here, not shown elsewhere automatically — use "Apply to my profile" below to push it into Settings and Dashboard.</p>
      <div className="dl" style={{ marginBottom: 14 }}>
        {rows.map(([label, val]) => (val ? <React.Fragment key={label}><dt>{label}</dt><dd>{val}</dd></React.Fragment> : null))}
      </div>
      {blocks.map(([label, val]) => val ? (
        <div key={label} className="card" style={{ boxShadow: "none", border: "1px solid var(--line2)" }}>
          <h3 className="card-title">{label}</h3>
          <p className="prewrap muted small">{val}</p>
        </div>
      ) : null)}
      {!rows.some((r) => r[1]) && !blocks.some((b) => b[1]) && <p className="muted">No extracted fields on this resume yet.</p>}
      <div className="modal-foot">
        <button className="btn btn-ghost" onClick={onClose}>Close</button>
        <button className="btn btn-primary" onClick={() => { onApplyToProfile(p); notify("Applied to your profile — check Settings and the Dashboard greeting"); onClose(); }}>Apply to my profile</button>
      </div>
    </Modal>
  );
}

/* ================================================================== */
/* Templates                                                           */
/* ================================================================== */

function TemplatesPage({ data, notify }) {
  const [companyId, setCompanyId] = useState("");
  const [jobId, setJobId] = useState("");
  const [recruiter, setRecruiter] = useState("");
  const [copied, setCopied] = useState(null);
  const [edits, setEdits] = useState({});

  const company = data.companies.find((c) => c.id === companyId);
  const jobsForCompany = companyId ? data.jobs.filter((j) => j.company_id === companyId) : data.jobs;
  const job = data.jobs.find((j) => j.id === jobId);

  const fill = (text) => text
    .replace(/\{company_name\}/g, company?.name || "{company_name}")
    .replace(/\{job_title\}/g, job?.title || "{job_title}")
    .replace(/\{recruiter_name\}/g, recruiter || company?.contact_name || "{recruiter_name}")
    .replace(/\{my_name\}/g, data.settings.myName || "{my_name}")
    .replace(/\{applied_date\}/g, job?.date_applied ? fmtDate(job.date_applied) : "{applied_date}")
    .replace(/\{resume_link\}/g, data.settings.resumeLink || data.settings.portfolio || "{resume_link}");

  const copyIt = (name, text) => {
    navigator.clipboard?.writeText(text).then(() => {
      setCopied(name); setTimeout(() => setCopied(null), 2000);
    }).catch(() => notify("Copy failed — select and copy manually"));
  };

  return (
    <div>
      <PageHead title="Message Templates" sub="Pick a company and job — placeholders fill themselves. Personalize one line before sending." />

      <div className="card">
        <h3 className="card-title">Fill placeholders from your pipeline</h3>
        <div className="filter-bar" style={{ marginBottom: 0 }}>
          <select className="input" value={companyId} onChange={(e) => { setCompanyId(e.target.value); setJobId(""); }}>
            <option value="">Choose company…</option>
            {data.companies.map((c) => <option key={c.id} value={c.id}>{c.name}</option>)}
          </select>
          <select className="input" value={jobId} onChange={(e) => setJobId(e.target.value)}>
            <option value="">Choose job…</option>
            {jobsForCompany.map((j) => <option key={j.id} value={j.id}>{j.title}</option>)}
          </select>
          <input className="input" placeholder="Recruiter / contact name" value={recruiter} onChange={(e) => setRecruiter(e.target.value)} />
        </div>
        <p className="muted small" style={{ marginTop: 8 }}>{"{my_name}"} and {"{resume_link}"} come from Settings. Unfilled placeholders stay visible so you never send a broken message by accident.</p>
      </div>

      <div className="template-grid">
        {TEMPLATES.map((t) => {
          const text = edits[t.name] !== undefined ? edits[t.name] : fill(t.text);
          return (
            <div key={t.name} className="template">
              <div className="template-head">
                <div>
                  <strong>{t.name}</strong>
                  <div className="muted small">{t.purpose}</div>
                </div>
                <button className="btn btn-primary btn-sm" onClick={() => copyIt(t.name, text)}>
                  <Copy size={12} /> {copied === t.name ? "Copied!" : "Copy"}
                </button>
              </div>
              <textarea className="input template-edit" rows={Math.min(10, text.split("\n").length + 2)}
                value={text} onChange={(e) => setEdits({ ...edits, [t.name]: e.target.value })} />
            </div>
          );
        })}
      </div>
    </div>
  );
}

/* ================================================================== */
/* Guides                                                              */
/* ================================================================== */

function GuidesPage() {
  const [tab, setTab] = useState("resume");
  return (
    <div>
      <PageHead title="Guides" sub="Read while applying — everything tuned for the Indian market and your profile" />
      <div className="tabs">
        <button className={"tab " + (tab === "resume" ? "active" : "")} onClick={() => setTab("resume")}>Resume Guide</button>
        <button className={"tab " + (tab === "templates" ? "active" : "")} onClick={() => setTab("templates")}>Resume Templates</button>
        <button className={"tab " + (tab === "platforms" ? "active" : "")} onClick={() => setTab("platforms")}>Job Platform Guides</button>
      </div>

      {tab === "resume" && (
        <div className="card guide-card">
          <h3 className="card-title">How to build resumes that get replies</h3>
          <Accordion items={RESUME_GUIDE} />
        </div>
      )}
      {tab === "templates" && (
        <div className="card guide-card">
          <h3 className="card-title">Role-specific resume templates</h3>
          <p className="muted small">Each template maps YOUR verified experience to a role archetype. Pull raw bullets from Resume Vault → Master Resume Data.</p>
          <Accordion items={RESUME_TEMPLATES_GUIDE} />
        </div>
      )}
      {tab === "platforms" && (
        <div>
          {PLATFORM_GUIDES.map((g) => (
            <div key={g.group} className="card guide-card">
              <h3 className="card-title">{g.group}</h3>
              <Accordion items={g.items} />
            </div>
          ))}
        </div>
      )}
    </div>
  );
}

/* ================================================================== */
/* Analytics                                                           */
/* ================================================================== */

function AnalyticsPage({ data, setData, setModal, notify }) {
  const today = todayISO();
  const [flt, setFlt] = useState({ range: "all", from: "", to: "", company: "", status: "", source: "", location: "", role: "", priority: "", mode: "", tag: "" });
  const prefs = data.analyticsPrefs || { metric: "applications", groupBy: "week", chartType: "bar", range: "90" };
  const setPrefs = (patch) => setData((d) => ({ ...d, analyticsPrefs: { ...(d.analyticsPrefs || prefs), ...patch } }));

  const [from, to] = rangeBounds(flt, today);
  const jf = useMemo(() => data.jobs.filter((j) => jobMatchesFilter(j, flt)), [data.jobs, flt]);
  const scoped = useMemo(() => jf.filter((j) => !from || inDateRange(j.date_applied || j.date_saved, from, to || today)), [jf, from, to, today]);
  const jobIds = useMemo(() => new Set(scoped.map((j) => j.id)), [scoped]);
  const fus = data.followups.filter((f) => !f.job_id || jobIds.has(f.job_id) || !flt.company);

  const apps = scoped.filter((j) => j.date_applied ? inDateRange(j.date_applied, from, to || (from ? today : "")) || !from : APPLIED_STAGES.includes(j.status));
  const appJobs = scoped.filter((j) => (j.date_applied && (!from || inDateRange(j.date_applied, from, to || today))) || (!j.date_applied && APPLIED_STAGES.includes(j.status)));
  const respJobs = scoped.filter((j) => RESPONSE_STAGES.includes(j.status) || j.response_date);
  const intJobs = scoped.filter((j) => [...INTERVIEW_STAGES, "Offer"].includes(j.status) || j.interview_date);
  const offers = scoped.filter((j) => j.status === "Offer");
  const rejected = scoped.filter((j) => j.status === "Rejected");
  const fuDue = fus.filter((f) => f.status === "Pending" && f.due_date && f.due_date <= today);
  const fuLate = fus.filter((f) => f.status === "Pending" && f.due_date && f.due_date < today);
  const rts = scoped.map((j) => (j.date_applied && j.response_date ? daysBetween(j.date_applied, j.response_date) : null)).filter((x) => x !== null && x >= 0);
  const avgResp = rts.length ? Math.round(rts.reduce((a, b) => a + b, 0) / rts.length) : null;
  const wkApps = scoped.filter((j) => j.date_applied && weekKey(j.date_applied) === weekKey(today)).length;
  const moApps = scoped.filter((j) => j.date_applied && j.date_applied.slice(0, 7) === today.slice(0, 7)).length;
  const pct = (a, b) => (b ? Math.round((a / b) * 100) : 0);
  const ghosted = scoped.filter((j) => ["Applied", "Follow-up Needed"].includes(j.status) && j.date_applied && !j.response_date && daysBetween(j.date_applied, today) >= 21).length;
  const companiesTracked = flt.company ? 1 : new Set([...data.companies.map((c) => c.id)]).size;

  /* ---- chart datasets ---- */
  const [appMode, setAppMode] = useState("week");
  const seriesFromDates = (dates, mode) => {
    const counts = {};
    dates.filter(Boolean).forEach((d) => { if (from && !inDateRange(d, from, to || today)) return; const k = bucketKey(d, mode); counts[k] = (counts[k] || 0) + 1; });
    return Object.entries(counts).sort(([a], [b]) => a.localeCompare(b)).slice(-24)
      .map(([k, v]) => ({ name: bucketLabel(k, mode), count: v }));
  };
  const appsOverTime = seriesFromDates(scoped.map((j) => j.date_applied), appMode);
  const intsOverTime = seriesFromDates(scoped.map((j) => j.interview_date), "week");

  const respRateOverTime = (() => {
    const buckets = {};
    scoped.forEach((j) => {
      if (!j.date_applied) return;
      if (from && !inDateRange(j.date_applied, from, to || today)) return;
      const k = weekKey(j.date_applied);
      buckets[k] = buckets[k] || { a: 0, r: 0 };
      buckets[k].a++;
      if (RESPONSE_STAGES.includes(j.status) || j.response_date) buckets[k].r++;
    });
    return Object.entries(buckets).sort(([a], [b]) => a.localeCompare(b)).slice(-16)
      .map(([k, v]) => ({ name: bucketLabel(k, "week"), rate: Math.round((v.r / v.a) * 100) }));
  })();

  const rejVsResp = (() => {
    const buckets = {};
    scoped.forEach((j) => {
      const rd = j.response_date; const xd = stageDate(j, "Rejected");
      if (rd && (!from || inDateRange(rd, from, to || today))) { const k = weekKey(rd); (buckets[k] = buckets[k] || { responses: 0, rejections: 0 }).responses++; }
      if (xd && (!from || inDateRange(xd, from, to || today))) { const k = weekKey(xd); (buckets[k] = buckets[k] || { responses: 0, rejections: 0 }).rejections++; }
    });
    return Object.entries(buckets).sort(([a], [b]) => a.localeCompare(b)).slice(-16)
      .map(([k, v]) => ({ name: bucketLabel(k, "week"), ...v }));
  })();

  const byStatus = STAGES.map((s) => ({ name: s, count: scoped.filter((j) => j.status === s).length })).filter((r) => r.count > 0);
  const bySource = SOURCES.map((s) => ({
    name: s, applications: scoped.filter((j) => j.source === s && APPLIED_STAGES.includes(j.status)).length,
    responses: scoped.filter((j) => j.source === s && (RESPONSE_STAGES.includes(j.status) || j.response_date)).length,
  })).filter((r) => r.applications > 0);
  const topN = (keyFn) => {
    const c = {};
    scoped.forEach((j) => { const k = keyFn(j); if (k) c[k] = (c[k] || 0) + 1; });
    return Object.entries(c).sort((a, b) => b[1] - a[1]).slice(0, 8).map(([name, count]) => ({ name, count }));
  };
  const byLocation = topN((j) => (j.location || "").trim() || null);
  const byRole = topN((j) => (j.title || "").trim() || null);

  const fuTimeline = (() => {
    const days = [];
    for (let i = 0; i < 14; i++) {
      const d = addDays(today, i);
      days.push({ name: fmtDate(d).replace(/ \d{4}$/, ""), count: fus.filter((f) => f.status === "Pending" && f.due_date === d).length });
    }
    return days;
  })();

  const funnel = [
    { label: "Saved", n: scoped.length }, { label: "Applied", n: appJobs.length },
    { label: "Response", n: respJobs.length }, { label: "Interview", n: intJobs.length }, { label: "Offer", n: offers.length },
  ];

  /* ---- custom chart ---- */
  const customRows = (() => {
    const p = prefs;
    const [cf, ct] = rangeBounds({ range: p.range || "90", from: p.from, to: p.to }, today);
    const evs = [];
    const push = (date, key) => { if (!date) return; if (cf && !inDateRange(date, cf, ct || today)) return; evs.push({ date, key }); };
    if (p.metric === "followups") {
      data.followups.forEach((f) => push(f.due_date, p.groupBy === "status" ? f.status : f.type));
    } else {
      const keyOf = (j) => p.groupBy === "status" ? j.status : p.groupBy === "source" ? (j.source || "Other")
        : p.groupBy === "location" ? ((j.location || "").trim() || "Unknown") : p.groupBy === "role" ? (j.title || "Untitled")
        : p.groupBy === "company" ? j.company_id : null;
      data.jobs.forEach((j) => {
        const d = p.metric === "applications" ? j.date_applied : p.metric === "responses" ? j.response_date
          : p.metric === "interviews" ? j.interview_date : p.metric === "offers" ? stageDate(j, "Offer") : stageDate(j, "Rejected");
        push(d, keyOf(j));
      });
    }
    const counts = {};
    const timeMode = ["day", "week", "month"].includes(p.groupBy);
    evs.forEach((e) => { const k = timeMode ? bucketKey(e.date, p.groupBy) : (e.key || "—"); counts[k] = (counts[k] || 0) + 1; });
    let rows = Object.entries(counts).map(([name, value]) => ({ name, value }));
    if (timeMode) { rows.sort((a, b) => a.name.localeCompare(b.name)); rows = rows.slice(-24).map((r) => ({ ...r, name: bucketLabel(r.name, p.groupBy) })); }
    else { rows.sort((a, b) => b.value - a.value); rows = rows.slice(0, 10); }
    if (p.groupBy === "company") rows = rows.map((r) => ({ ...r, name: (data.companies.find((c) => c.id === r.name) || {}).name || "—" }));
    return rows;
  })();

  const insights = buildInsights(data);

  const exportSummary = () => {
    download("hv-vault-analytics.csv", toCSV(analyticsSummaryRows(data), ["metric", "value"]));
    notify("Analytics summary exported");
  };

  const tooltipStyle = { fontSize: 12, borderRadius: 10, border: "1px solid var(--line)", background: "var(--card)", color: "var(--text)" };
  const ChartCard = ({ title, children, empty }) => (
    <div className="card">
      <h3 className="card-title">{title}</h3>
      {empty ? <p className="muted small">No data matches this filter.</p> : children}
    </div>
  );

  if (data.jobs.length === 0) {
    return (
      <div>
        <PageHead title="Analytics" sub="Your job-search performance, in one place" />
        <Empty icon={BarChart3} title="No analytics yet" hint="Add jobs or applications to see charts, funnels, and insights."
          action={<button className="btn btn-primary" onClick={() => setModal({ type: "job" })}><Plus size={14} /> Add Job</button>} />
      </div>
    );
  }

  return (
    <div>
      <PageHead title="Analytics" sub={IS_WEB() ? "Calculated from your own data, which syncs privately to your Google account" : "Everything is calculated locally on your PC — nothing leaves this device"}
        right={<button className="btn btn-ghost" onClick={exportSummary}><Download size={14} /> Export Analytics</button>} />

      {/* Filters */}
      <div className="card afilters">
        <div className="filter-bar" style={{ marginBottom: 8 }}>
          <select className="input" value={flt.range} onChange={(e) => setFlt({ ...flt, range: e.target.value })}>
            <option value="all">All time</option><option value="7">Last 7 days</option><option value="30">Last 30 days</option>
            <option value="90">Last 90 days</option><option value="month">This month</option><option value="custom">Custom range</option>
          </select>
          {flt.range === "custom" && (<>
            <input className="input" type="date" value={flt.from} onChange={(e) => setFlt({ ...flt, from: e.target.value })} />
            <input className="input" type="date" value={flt.to} onChange={(e) => setFlt({ ...flt, to: e.target.value })} />
          </>)}
          <select className="input" value={flt.company} onChange={(e) => setFlt({ ...flt, company: e.target.value })}>
            <option value="">All companies</option>{data.companies.map((c) => <option key={c.id} value={c.id}>{c.name}</option>)}
          </select>
          <select className="input" value={flt.status} onChange={(e) => setFlt({ ...flt, status: e.target.value })}>
            <option value="">All statuses</option>{STAGES.map((s) => <option key={s}>{s}</option>)}
          </select>
          <select className="input" value={flt.source} onChange={(e) => setFlt({ ...flt, source: e.target.value })}>
            <option value="">All sources</option>{SOURCES.map((s) => <option key={s}>{s}</option>)}
          </select>
        </div>
        <div className="filter-bar" style={{ marginBottom: 0 }}>
          <input className="input" placeholder="Location contains…" value={flt.location} onChange={(e) => setFlt({ ...flt, location: e.target.value })} />
          <input className="input" placeholder="Role/title contains…" value={flt.role} onChange={(e) => setFlt({ ...flt, role: e.target.value })} />
          <select className="input" value={flt.priority} onChange={(e) => setFlt({ ...flt, priority: e.target.value })}>
            <option value="">Any priority</option>{PRIORITIES.map((s) => <option key={s}>{s}</option>)}
          </select>
          <select className="input" value={flt.mode} onChange={(e) => setFlt({ ...flt, mode: e.target.value })}>
            <option value="">Any mode</option>{WORK_MODES.map((s) => <option key={s}>{s}</option>)}
          </select>
          <input className="input" placeholder="Tag contains…" value={flt.tag} onChange={(e) => setFlt({ ...flt, tag: e.target.value })} />
          <button className="btn btn-ghost btn-sm" onClick={() => setFlt({ range: "all", from: "", to: "", company: "", status: "", source: "", location: "", role: "", priority: "", mode: "", tag: "" })}>Clear</button>
        </div>
      </div>

      {/* Metrics */}
      <div className="stat-grid">
        <StatCard label="Companies tracked" value={companiesTracked} />
        <StatCard label="Jobs added" value={scoped.length} />
        <StatCard label="Applications" value={appJobs.length} accent />
        <StatCard label="Responses" value={respJobs.length} />
        <StatCard label="Response rate" value={pct(respJobs.length, appJobs.length) + "%"} accent />
        <StatCard label="Interviews" value={intJobs.length} />
        <StatCard label="Interview rate" value={pct(intJobs.length, appJobs.length) + "%"} />
        <StatCard label="Offers" value={offers.length} good />
        <StatCard label="Rejections" value={rejected.length} />
        <StatCard label="Follow-ups due" value={fuDue.length} />
        <StatCard label="Overdue follow-ups" value={fuLate.length} bad={fuLate.length > 0} />
        <StatCard label="Avg days to response" value={avgResp === null ? "—" : avgResp} />
        <StatCard label="This week" value={wkApps} />
        <StatCard label="This month" value={moApps} />
        <StatCard label="Ghosted (21d+)" value={ghosted} bad={ghosted > 0} />
      </div>

      {/* Insights */}
      <div className="card">
        <h3 className="card-title">Insights</h3>
        <div className="insight-grid">
          {insights.map((t, i) => <div key={i} className="insight"><Sparkles size={13} /> <span>{t}</span></div>)}
        </div>
        <p className="muted small" style={{ marginTop: 8 }}>Computed locally from your data — no AI involved.</p>
      </div>

      {/* Funnel */}
      <div className="card">
        <h3 className="card-title">Pipeline funnel</h3>
        <div className="funnel">
          {funnel.map((s, i) => (
            <React.Fragment key={s.label}>
              <div className="funnel-step">
                <span className="funnel-n">{s.n}</span><span className="funnel-label">{s.label}</span>
                {i > 0 && <span className="funnel-pct mono">{pct(s.n, funnel[i - 1].n)}%</span>}
              </div>
              {i < funnel.length - 1 && <ChevronRight size={16} className="funnel-arrow" />}
            </React.Fragment>
          ))}
        </div>
      </div>

      <div className="dash-cols">
        <ChartCard title={<span>Applications over time
          <span className="chart-toggle">
            {["day", "week", "month"].map((m) => <button key={m} className={"chip-btn " + (appMode === m ? "on good" : "")} onClick={() => setAppMode(m)}>{m}</button>)}
          </span></span>} empty={!appsOverTime.length}>
          <ResponsiveContainer width="100%" height={220}>
            <LineChart data={appsOverTime} margin={{ top: 8, right: 12, left: -20, bottom: 4 }}>
              <CartesianGrid strokeDasharray="3 3" stroke="var(--chart-grid)" vertical={false} />
              <XAxis dataKey="name" tick={{ fontSize: 10, fill: "var(--slate2)" }} />
              <YAxis allowDecimals={false} tick={{ fontSize: 11, fill: "var(--slate2)" }} />
              <Tooltip contentStyle={tooltipStyle} />
              <Line type="monotone" dataKey="count" stroke="#5B7CC4" strokeWidth={2.5} dot={{ r: 3 }} name="Applications" />
            </LineChart>
          </ResponsiveContainer>
        </ChartCard>

        <ChartCard title="Status distribution" empty={!byStatus.length}>
          <ResponsiveContainer width="100%" height={220}>
            <BarChart data={byStatus} margin={{ top: 4, right: 8, left: -18, bottom: 4 }}>
              <CartesianGrid strokeDasharray="3 3" stroke="var(--chart-grid)" vertical={false} />
              <XAxis dataKey="name" tick={{ fontSize: 9.5, fill: "var(--slate2)" }} interval={0} angle={-28} textAnchor="end" height={58} />
              <YAxis allowDecimals={false} tick={{ fontSize: 11, fill: "var(--slate2)" }} />
              <Tooltip cursor={{ fill: "#5B7CC414" }} contentStyle={tooltipStyle} />
              <Bar dataKey="count" radius={[4, 4, 0, 0]}>{byStatus.map((r) => <Cell key={r.name} fill={STAGE_COLORS[r.name]} />)}</Bar>
            </BarChart>
          </ResponsiveContainer>
        </ChartCard>

        <ChartCard title="Response rate over time (weekly cohorts)" empty={!respRateOverTime.length}>
          <ResponsiveContainer width="100%" height={220}>
            <LineChart data={respRateOverTime} margin={{ top: 8, right: 12, left: -16, bottom: 4 }}>
              <CartesianGrid strokeDasharray="3 3" stroke="var(--chart-grid)" vertical={false} />
              <XAxis dataKey="name" tick={{ fontSize: 10, fill: "var(--slate2)" }} />
              <YAxis unit="%" tick={{ fontSize: 11, fill: "var(--slate2)" }} />
              <Tooltip contentStyle={tooltipStyle} />
              <Line type="monotone" dataKey="rate" stroke="#3E9B72" strokeWidth={2.5} dot={{ r: 3 }} name="Response %" />
            </LineChart>
          </ResponsiveContainer>
        </ChartCard>

        <ChartCard title="Source performance — applications vs responses" empty={!bySource.length}>
          <ResponsiveContainer width="100%" height={220}>
            <BarChart data={bySource} margin={{ top: 4, right: 8, left: -20, bottom: 4 }}>
              <CartesianGrid strokeDasharray="3 3" stroke="var(--chart-grid)" vertical={false} />
              <XAxis dataKey="name" tick={{ fontSize: 10, fill: "var(--slate2)" }} interval={0} angle={-24} textAnchor="end" height={52} />
              <YAxis allowDecimals={false} tick={{ fontSize: 11, fill: "var(--slate2)" }} />
              <Tooltip contentStyle={tooltipStyle} />
              <Legend wrapperStyle={{ fontSize: 11 }} />
              <Bar dataKey="applications" fill="#97A1B4" radius={[4, 4, 0, 0]} name="Applications" />
              <Bar dataKey="responses" fill="#3E9B72" radius={[4, 4, 0, 0]} name="Responses" />
            </BarChart>
          </ResponsiveContainer>
        </ChartCard>

        <ChartCard title="Applications by location" empty={!byLocation.length}>
          <ResponsiveContainer width="100%" height={220}>
            <BarChart data={byLocation} layout="vertical" margin={{ top: 4, right: 16, left: 30, bottom: 4 }}>
              <CartesianGrid strokeDasharray="3 3" stroke="var(--chart-grid)" horizontal={false} />
              <XAxis type="number" allowDecimals={false} tick={{ fontSize: 11, fill: "var(--slate2)" }} />
              <YAxis type="category" dataKey="name" width={90} tick={{ fontSize: 10, fill: "var(--slate2)" }} />
              <Tooltip contentStyle={tooltipStyle} />
              <Bar dataKey="count" fill="#4B9FAD" radius={[0, 4, 4, 0]} name="Jobs" />
            </BarChart>
          </ResponsiveContainer>
        </ChartCard>

        <ChartCard title="Applications by role / title" empty={!byRole.length}>
          <ResponsiveContainer width="100%" height={220}>
            <BarChart data={byRole} layout="vertical" margin={{ top: 4, right: 16, left: 40, bottom: 4 }}>
              <CartesianGrid strokeDasharray="3 3" stroke="var(--chart-grid)" horizontal={false} />
              <XAxis type="number" allowDecimals={false} tick={{ fontSize: 11, fill: "var(--slate2)" }} />
              <YAxis type="category" dataKey="name" width={120} tick={{ fontSize: 9.5, fill: "var(--slate2)" }} />
              <Tooltip contentStyle={tooltipStyle} />
              <Bar dataKey="count" fill="#8E7FD0" radius={[0, 4, 4, 0]} name="Jobs" />
            </BarChart>
          </ResponsiveContainer>
        </ChartCard>

        <ChartCard title="Follow-ups due — next 14 days" empty={!fuTimeline.some((d) => d.count > 0)}>
          <ResponsiveContainer width="100%" height={220}>
            <BarChart data={fuTimeline} margin={{ top: 4, right: 8, left: -20, bottom: 4 }}>
              <CartesianGrid strokeDasharray="3 3" stroke="var(--chart-grid)" vertical={false} />
              <XAxis dataKey="name" tick={{ fontSize: 9, fill: "var(--slate2)" }} interval={1} angle={-30} textAnchor="end" height={46} />
              <YAxis allowDecimals={false} tick={{ fontSize: 11, fill: "var(--slate2)" }} />
              <Tooltip contentStyle={tooltipStyle} />
              <Bar dataKey="count" fill="#D9A03D" radius={[4, 4, 0, 0]} name="Due" />
            </BarChart>
          </ResponsiveContainer>
        </ChartCard>

        <ChartCard title="Interviews over time (weekly)" empty={!intsOverTime.length}>
          <ResponsiveContainer width="100%" height={220}>
            <LineChart data={intsOverTime} margin={{ top: 8, right: 12, left: -20, bottom: 4 }}>
              <CartesianGrid strokeDasharray="3 3" stroke="var(--chart-grid)" vertical={false} />
              <XAxis dataKey="name" tick={{ fontSize: 10, fill: "var(--slate2)" }} />
              <YAxis allowDecimals={false} tick={{ fontSize: 11, fill: "var(--slate2)" }} />
              <Tooltip contentStyle={tooltipStyle} />
              <Line type="monotone" dataKey="count" stroke="#7E6FC9" strokeWidth={2.5} dot={{ r: 3 }} name="Interviews" />
            </LineChart>
          </ResponsiveContainer>
        </ChartCard>

        <ChartCard title="Responses vs rejections (weekly)" empty={!rejVsResp.length}>
          <ResponsiveContainer width="100%" height={220}>
            <LineChart data={rejVsResp} margin={{ top: 8, right: 12, left: -20, bottom: 4 }}>
              <CartesianGrid strokeDasharray="3 3" stroke="var(--chart-grid)" vertical={false} />
              <XAxis dataKey="name" tick={{ fontSize: 10, fill: "var(--slate2)" }} />
              <YAxis allowDecimals={false} tick={{ fontSize: 11, fill: "var(--slate2)" }} />
              <Tooltip contentStyle={tooltipStyle} />
              <Legend wrapperStyle={{ fontSize: 11 }} />
              <Line type="monotone" dataKey="responses" stroke="#3E9B72" strokeWidth={2.2} dot={{ r: 2.5 }} name="Responses" />
              <Line type="monotone" dataKey="rejections" stroke="#CD6A6A" strokeWidth={2.2} dot={{ r: 2.5 }} name="Rejections" />
            </LineChart>
          </ResponsiveContainer>
        </ChartCard>

        {/* Custom chart builder */}
        <ChartCard title="Custom Chart — build your own view">
          <div className="filter-bar" style={{ marginBottom: 10 }}>
            <select className="input" value={prefs.metric} onChange={(e) => setPrefs({ metric: e.target.value })}>
              {["applications", "responses", "interviews", "offers", "rejections", "followups"].map((m) => <option key={m} value={m}>{m}</option>)}
            </select>
            <select className="input" value={prefs.groupBy} onChange={(e) => setPrefs({ groupBy: e.target.value })}>
              {["day", "week", "month", "status", "source", "location", "role", "company"].map((m) => <option key={m} value={m}>by {m}</option>)}
            </select>
            <select className="input" value={prefs.chartType} onChange={(e) => setPrefs({ chartType: e.target.value })}>
              <option value="line">line</option><option value="bar">bar</option><option value="pie">pie</option>
            </select>
            <select className="input" value={prefs.range || "90"} onChange={(e) => setPrefs({ range: e.target.value })}>
              <option value="7">Last 7 days</option><option value="30">Last 30 days</option><option value="90">Last 90 days</option>
              <option value="month">This month</option><option value="all">All time</option>
            </select>
          </div>
          {!customRows.length ? <p className="muted small">No data matches this filter.</p> : (
            <ResponsiveContainer width="100%" height={230}>
              {prefs.chartType === "pie" ? (
                <PieChart>
                  <Pie data={customRows} dataKey="value" nameKey="name" cx="50%" cy="50%" outerRadius={80} label={{ fontSize: 10 }}>
                    {customRows.map((r, i) => <Cell key={i} fill={PALETTE[i % PALETTE.length]} />)}
                  </Pie>
                  <Tooltip contentStyle={tooltipStyle} />
                  <Legend wrapperStyle={{ fontSize: 10 }} />
                </PieChart>
              ) : prefs.chartType === "line" ? (
                <LineChart data={customRows} margin={{ top: 8, right: 12, left: -20, bottom: 4 }}>
                  <CartesianGrid strokeDasharray="3 3" stroke="var(--chart-grid)" vertical={false} />
                  <XAxis dataKey="name" tick={{ fontSize: 9.5, fill: "var(--slate2)" }} />
                  <YAxis allowDecimals={false} tick={{ fontSize: 11, fill: "var(--slate2)" }} />
                  <Tooltip contentStyle={tooltipStyle} />
                  <Line type="monotone" dataKey="value" stroke="#5B7CC4" strokeWidth={2.5} dot={{ r: 3 }} name={prefs.metric} />
                </LineChart>
              ) : (
                <BarChart data={customRows} margin={{ top: 4, right: 8, left: -18, bottom: 4 }}>
                  <CartesianGrid strokeDasharray="3 3" stroke="var(--chart-grid)" vertical={false} />
                  <XAxis dataKey="name" tick={{ fontSize: 9.5, fill: "var(--slate2)" }} interval={0} angle={-24} textAnchor="end" height={54} />
                  <YAxis allowDecimals={false} tick={{ fontSize: 11, fill: "var(--slate2)" }} />
                  <Tooltip contentStyle={tooltipStyle} />
                  <Bar dataKey="value" radius={[4, 4, 0, 0]} name={prefs.metric}>
                    {customRows.map((r, i) => <Cell key={i} fill={PALETTE[i % PALETTE.length]} />)}
                  </Bar>
                </BarChart>
              )}
            </ResponsiveContainer>
          )}
          <p className="muted small">Your chart choices are saved automatically.</p>
        </ChartCard>
      </div>
    </div>
  );
}

/* ================================================================== */
/* Calendar Center                                                     */
/* ================================================================== */

function CalendarPage({ data, upsert, remove, notify, openJob, openCompany, setPage, companyName }) {
  const today = todayISO();
  const [view, setView] = useState("month");
  const [cursor, setCursor] = useState(() => new Date());
  const [flt, setFlt] = useState({ type: "", status: "", company: "" });
  const [editing, setEditing] = useState(null);

  const events = useMemo(() => deriveEvents(data, today), [data, today]);
  const filtered = events.filter((e) =>
    (!flt.type || e.type === flt.type) && (!flt.status || e.dstatus === flt.status) && (!flt.company || e.company_id === flt.company));
  const byDate = useMemo(() => {
    const m = {};
    filtered.forEach((e) => { (m[e.date] = m[e.date] || []).push(e); });
    Object.values(m).forEach((l) => l.sort((a, b) => (a.time || "99").localeCompare(b.time || "99")));
    return m;
  }, [filtered]);

  const fmtLocal = (d) => d.getFullYear() + "-" + String(d.getMonth() + 1).padStart(2, "0") + "-" + String(d.getDate()).padStart(2, "0");
  const monthCells = useMemo(() => {
    const y = cursor.getFullYear(), m = cursor.getMonth();
    const offset = (new Date(y, m, 1).getDay() + 6) % 7;
    return Array.from({ length: 42 }, (_, i) => {
      const d = new Date(y, m, 1 - offset + i);
      return { iso: fmtLocal(d), day: d.getDate(), inMonth: d.getMonth() === m };
    });
  }, [cursor]);
  const weekDays = useMemo(() => {
    const d = new Date(cursor); d.setDate(d.getDate() - ((d.getDay() + 6) % 7));
    return Array.from({ length: 7 }, (_, i) => {
      const x = new Date(d); x.setDate(d.getDate() + i);
      return { iso: fmtLocal(x), label: x.toLocaleDateString("en-IN", { weekday: "short", day: "numeric", month: "short" }) };
    });
  }, [cursor]);
  const nav = (dir) => setCursor((c) => { const d = new Date(c); if (view === "week") d.setDate(d.getDate() + dir * 7); else d.setMonth(d.getMonth() + dir); return d; });
  const monthLabel = cursor.toLocaleDateString("en-IN", { month: "long", year: "numeric" });

  const clickEvent = (e) => {
    if (e.source === "manual") { const ev = (data.calendarEvents || []).find((x) => x.id === e.raw_id); if (ev) setEditing(ev); }
    else if (e.job_id) openJob(e.job_id);
    else if (e.source === "fu") setPage("followups");
    else if (e.company_id) openCompany(e.company_id);
  };
  const markDone = (e) => {
    if (e.source === "manual") {
      const ev = (data.calendarEvents || []).find((x) => x.id === e.raw_id);
      if (ev) { upsert("calendarEvents", { ...ev, status: "done" }); notify("Event marked done ✓"); }
    } else if (e.source === "fu") {
      const fu = data.followups.find((x) => x.id === e.raw_id);
      if (fu) { upsert("followups", { ...fu, status: "Done", sent_date: fu.sent_date || today, completed_date: today }); notify("Follow-up marked done ✓"); }
    }
  };

  const EventChip = ({ e, full }) => (
    <button className={"cal-chip" + (e.dstatus === "done" ? " done" : "") + (e.dstatus === "missed" ? " missed" : "") + (e.dstatus === "cancelled" ? " cancelled" : "")}
      style={{ borderLeftColor: EVENT_COLORS[e.type] || "#8A8F9C" }}
      title={e.title + (e.company_id ? " · " + companyName(e.company_id) : "")}
      onClick={(ev) => { ev.stopPropagation(); clickEvent(e); }}>
      {e.time && <span className="mono">{fmtTime(e.time)} </span>}{full ? e.title : (e.title.length > 22 ? e.title.slice(0, 21) + "…" : e.title)}
    </button>
  );

  const agenda = useMemo(() => {
    const list = filtered.filter((e) => e.date >= addDays(today, -30)).sort((a, b) => a.date.localeCompare(b.date) || (a.time || "99").localeCompare(b.time || "99"));
    const groups = [];
    list.forEach((e) => {
      const g = groups.find((x) => x.date === e.date);
      if (g) g.items.push(e); else groups.push({ date: e.date, items: [e] });
    });
    return groups;
  }, [filtered, today]);

  return (
    <div>
      <PageHead title="Calendar" sub="Applications, interviews, follow-ups, deadlines — every date in one place"
        right={<button className="btn btn-primary" onClick={() => setEditing({ __new: true, date: today })}><Plus size={15} /> Add Calendar Event</button>} />

      <div className="cal-toolbar">
        <div className="btn-row">
          <button className="icon-btn" onClick={() => nav(-1)}><ChevronLeft size={17} /></button>
          <button className="btn btn-ghost btn-sm" onClick={() => setCursor(new Date())}>Today</button>
          <button className="icon-btn" onClick={() => nav(1)}><ChevronRight size={17} /></button>
          <span className="cal-month serif-strong">{monthLabel}</span>
        </div>
        <div className="btn-row">
          <div className="tabs" style={{ border: 0, margin: 0 }}>
            {["month", "week", "agenda"].map((v) => (
              <button key={v} className={"tab " + (view === v ? "active" : "")} onClick={() => setView(v)}>{v[0].toUpperCase() + v.slice(1)}</button>
            ))}
          </div>
        </div>
      </div>

      <div className="filter-bar">
        <select className="input" value={flt.type} onChange={(e) => setFlt({ ...flt, type: e.target.value })}>
          <option value="">All types</option>{EVENT_TYPES.map(([v, l]) => <option key={v} value={v}>{l}</option>)}
        </select>
        <select className="input" value={flt.status} onChange={(e) => setFlt({ ...flt, status: e.target.value })}>
          <option value="">All statuses</option>{EVENT_STATUSES.map((s) => <option key={s} value={s}>{s}</option>)}
        </select>
        <select className="input" value={flt.company} onChange={(e) => setFlt({ ...flt, company: e.target.value })}>
          <option value="">All companies</option>{data.companies.map((c) => <option key={c.id} value={c.id}>{c.name}</option>)}
        </select>
      </div>

      {filtered.length === 0 && (
        <Empty icon={CalendarDays} title="No calendar events yet"
          hint="Add your first interview or follow-up — applications, follow-up due dates, and interview dates from your pipeline appear here automatically."
          action={<button className="btn btn-primary" onClick={() => setEditing({ __new: true, date: today })}><Plus size={14} /> Add your first event</button>} />
      )}

      {filtered.length > 0 && view === "month" && (
        <div className="table-card" style={{ overflow: "hidden" }}>
          <div className="cal-grid cal-head-row">
            {["Mon", "Tue", "Wed", "Thu", "Fri", "Sat", "Sun"].map((d) => <div key={d} className="cal-headcell">{d}</div>)}
          </div>
          <div className="cal-grid">
            {monthCells.map((c) => (
              <div key={c.iso} className={"cal-cell" + (c.inMonth ? "" : " cal-out") + (c.iso === today ? " cal-today" : "")}
                onClick={() => setEditing({ __new: true, date: c.iso })} title="Click to add an event">
                <div className="cal-daynum">{c.day}</div>
                {(byDate[c.iso] || []).slice(0, 3).map((e) => <EventChip key={e.id} e={e} />)}
                {(byDate[c.iso] || []).length > 3 && <div className="cal-more muted">+{byDate[c.iso].length - 3} more</div>}
              </div>
            ))}
          </div>
        </div>
      )}

      {filtered.length > 0 && view === "week" && (
        <div className="week-grid">
          {weekDays.map((d) => (
            <div key={d.iso} className={"week-col" + (d.iso === today ? " cal-today" : "")} onClick={() => setEditing({ __new: true, date: d.iso })}>
              <div className="week-head">{d.label}</div>
              {(byDate[d.iso] || []).map((e) => <EventChip key={e.id} e={e} full />)}
              {!(byDate[d.iso] || []).length && <div className="muted small" style={{ padding: "6px 4px" }}>—</div>}
            </div>
          ))}
        </div>
      )}

      {filtered.length > 0 && view === "agenda" && (
        <div>
          {agenda.length === 0 ? <Empty icon={CalendarDays} title="No data matches this filter" hint="Loosen a filter to see more events." /> :
            agenda.map((g) => (
              <div key={g.date} className="card agenda-day">
                <div className="agenda-date">{fmtDate(g.date)} {g.date === today && <Badge color="#5B7CC4">Today</Badge>}</div>
                {g.items.map((e) => (
                  <div key={e.id} className="agenda-row">
                    <Badge color={EVENT_COLORS[e.type]}>{EVENT_TYPE_LABEL[e.type]}</Badge>
                    <button className="link-cell" onClick={() => clickEvent(e)}>{e.title}</button>
                    <span className="muted small">{e.company_id ? companyName(e.company_id) : ""}{e.time ? " · " + fmtTime(e.time) : ""}{e.contact ? " · " + e.contact : ""}</span>
                    <span className="agenda-right">
                      <Badge color={EVENT_STATUS_COLORS[e.dstatus]}>{e.dstatus}</Badge>
                      {e.dstatus !== "done" && e.dstatus !== "cancelled" && (e.source === "manual" || e.source === "fu") &&
                        <button className="btn btn-good btn-sm" onClick={() => markDone(e)}><CheckCircle2 size={12} /> Done</button>}
                      {e.source === "manual" && <button className="icon-btn" onClick={() => clickEvent(e)}><Pencil size={13} /></button>}
                    </span>
                  </div>
                ))}
              </div>
            ))}
        </div>
      )}

      <p className="muted small">Colored chips are auto-linked: applications 🔵, follow-ups 🟡, interviews 🟣 come straight from your pipeline. Click any chip to open the linked job or company. Click an empty day to add an event.</p>

      {editing && (
        <EventModal initial={editing} data={data}
          onSave={(ev) => { upsert("calendarEvents", ev); setEditing(null); notify(editing.__new ? "Event added ✓" : "Event updated ✓"); }}
          onDelete={(id) => { remove("calendarEvents", id); setEditing(null); notify("Event deleted"); }}
          onClose={() => setEditing(null)} />
      )}
    </div>
  );
}

function EventModal({ initial, data, onSave, onDelete, onClose }) {
  const [f, setF] = useState(initial.__new
    ? { id: uid(), title: "", type: "custom", date: initial.date || todayISO(), time: "", company_id: "", job_id: "", contact: "", notes: "", status: "upcoming", priority: "Medium", reminder: "same" }
    : { ...initial });
  const set = (k) => (e) => setF({ ...f, [k]: e.target.value });
  const jobsForCompany = f.company_id ? data.jobs.filter((j) => j.company_id === f.company_id) : data.jobs;
  return (
    <Modal title={initial.__new ? "Add calendar event" : "Edit calendar event"} onClose={onClose} wide>
      <div className="form-grid">
        <Field label="Event title *"><input className="input" value={f.title} onChange={set("title")} autoFocus placeholder="Interview with Acme / Networking call…" /></Field>
        <Field label="Event type"><select className="input" value={f.type} onChange={set("type")}>{EVENT_TYPES.map(([v, l]) => <option key={v} value={v}>{l}</option>)}</select></Field>
        <Field label="Date *"><input className="input" type="date" value={f.date} onChange={set("date")} /></Field>
        <Field label="Time (optional)"><input className="input" type="time" value={f.time} onChange={set("time")} /></Field>
        <Field label="Company (optional)">
          <select className="input" value={f.company_id} onChange={(e) => setF({ ...f, company_id: e.target.value, job_id: "" })}>
            <option value="">None</option>{data.companies.map((c) => <option key={c.id} value={c.id}>{c.name}</option>)}
          </select>
        </Field>
        <Field label="Job (optional)">
          <select className="input" value={f.job_id} onChange={set("job_id")}>
            <option value="">None</option>{jobsForCompany.map((j) => <option key={j.id} value={j.id}>{j.title}</option>)}
          </select>
        </Field>
        <Field label="Contact / recruiter"><input className="input" value={f.contact} onChange={set("contact")} /></Field>
        <Field label="Status"><select className="input" value={f.status} onChange={set("status")}>{EVENT_STATUSES.map((s) => <option key={s}>{s}</option>)}</select></Field>
        <Field label="Priority"><select className="input" value={f.priority} onChange={set("priority")}>{PRIORITIES.map((p) => <option key={p}>{p}</option>)}</select></Field>
        <Field label="Reminder"><select className="input" value={f.reminder} onChange={set("reminder")}>{REMINDER_OPTS.map(([v, l]) => <option key={v} value={v}>{l}</option>)}</select></Field>
        <Field label="Notes" span><textarea className="input" rows={3} value={f.notes} onChange={set("notes")} placeholder="Meeting link, prep points, who referred…" /></Field>
      </div>
      <div className="modal-foot" style={{ justifyContent: "space-between" }}>
        <span>{!initial.__new && <button className="btn btn-danger" onClick={() => confirm("Delete this event?") && onDelete(f.id)}><Trash2 size={14} /> Delete</button>}</span>
        <span className="btn-row">
          <button className="btn btn-ghost" onClick={onClose}>Cancel</button>
          <button className="btn btn-primary" disabled={!f.title.trim() || !f.date} onClick={() => onSave(f)}>{initial.__new ? "Add event" : "Save changes"}</button>
        </span>
      </div>
    </Modal>
  );
}

/* ================================================================== */
/* Settings                                                            */
/* ================================================================== */

/* In-app changelog. Two sources feed "what's new":
   1. The GitHub release description (arrives live via electron-updater) —
      write good notes when publishing and users see them BEFORE updating.
   2. This local map — shown on first launch AFTER an update installs,
      and as a fallback if a release was published with an empty body.
   Add an entry here for every release. */
/* Web vs desktop wording. The same App.jsx ships as the Windows app and the website. */
const IS_WEB = () => typeof window !== "undefined" && !!(window.hv && window.hv.isWeb);
const IS_GUEST = () => IS_WEB() && !!(window.hv.cloud && window.hv.cloud.guest);   // using HV Vault without an account
/* AI: on the website every AI feature uses the site's built-in AI (no key, ever). The desktop app has no
   built-in AI, so there it uses the key saved in Settings. */
const AI_BUILTIN = () => typeof window !== "undefined" && !!(window.hv && window.hv.aiBuiltIn);
const ownKeyOn = (st) => !!(st && st.aiProvider && st.aiProvider !== "off" && st.aiKey);
const aiAvailable = (st) => AI_BUILTIN() || (ownKeyOn(st) && typeof window !== "undefined" && !!window.hv);
const AI_OFF_MSG = () => (IS_WEB() ? "AI isn't available right now. Reload the page and try again" : "Add your AI key in Settings > HV AI first");
function runExtract(st, req) {       // job / company / profile details from text or a screenshot
  if (AI_BUILTIN()) return window.hv.aiExtractProject(req);
  return window.hv.aiExtract({ provider: st.aiProvider, apiKey: st.aiKey, model: st.aiModel || "", ...req });
}
function runParse(st, text) {        // resume text → profile fields
  if (AI_BUILTIN()) return window.hv.aiParseProject({ text, pdfBase64: null });
  return window.hv.aiParse({ provider: st.aiProvider, apiKey: st.aiKey, model: st.aiModel || "", text });
}
const ON_DEVICE = () => (IS_WEB() ? "in this browser" : "on your PC");

const APP_CHANGELOG = {
  "2.10.0": {
    title: "Try it first, sign in to save",
    points: [
      "Anyone can use HV Vault without an account. Sign in with Google only when you want to save",
      "A Sign in button and your account menu sit at the top of the page",
      "HV AI chat history is saved to your account, so it's the same on your phone and laptop",
    ],
  },
  "2.9.3": {
    title: "Your times stay yours",
    points: [
      "Day plans keep the exact times you say: \"2 se 3 outreach\" is always 2:00 to 3:00 PM, and breaks and meals fit around it",
      "\"Shaam 7 ke baad free\" means no work after 7 PM",
    ],
  },
  "2.9.2": {
    title: "HV AI keeps going when it's busy",
    points: [
      "No more \"busy\" errors: when the free AI is full for the minute, HV AI quietly switches to its second model or waits a few seconds and tries again",
      "The HV AI Full check runs at a steady pace (about 2 minutes) so it stays within the free limit",
    ],
  },
  "2.9.1": {
    title: "HV AI, sharper",
    points: [
      "HV AI never guesses a date: \"Cred ke saath interview schedule karo\" now asks when, instead of picking a day",
      "Day plans keep every work block to 90 minutes at most, with a short break in between",
      "HV AI knows \"is hafte\" (this week, from Monday) and \"pichle 7 din\" (the last 7 days) apart",
      "Fixed: pop-up messages (like \"Jobs exported\") were blank in dark mode",
    ],
  },
  "2.9.0": {
    title: "HV AI, ready out of the box",
    points: [
      "Every AI feature now runs on HV Vault's built-in AI: the HV AI chat and voice (here and in HV Reset), resume reading, and job and company auto-fill. No key to paste, ever",
      "A cleaner Settings page: simple grouped rows for account, HV AI, follow-ups, your data and about, with the long explanations and extra boxes gone",
    ],
  },
  "2.8.3": {
    title: "A cleaner Profile and Settings",
    points: [
      "No profile yet? The Profile page now says \"Create your profile\": upload your resume to fill it in automatically, or answer a few quick questions",
      "\"Re-upload resume\" appears only once your profile exists, and it now reads your resume with HV Vault's built-in AI (no key needed)",
      "Name, target role, locations, skills, links, work mode, expected salary and resume link now live only on the Profile page",
      "Settings has a simple HV AI card: paste one free Gemini key to turn the assistant on. On the website, About no longer shows an update button: the site updates itself",
    ],
  },
  "2.8.2": {
    title: "Say hello to HV Reset",
    points: [
      "Harsh Reset is now HV Reset, with its own logo: a sunrise inside a reset arrow. Same app, same link, same data",
      "In HV Reset, the HV AI button and chat now wear HV Reset's own glass look and follow its day and night sky",
    ],
  },
  "2.8.1": {
    title: "HV AI, polished",
    points: [
      "A cleaner HV AI chat: one tidy message box with the mic and Send inside it, in the same look as the rest of the app",
      "All times now show in 12-hour format with AM and PM, in HV AI's replies and across the app",
      "\"Sab 7:30 PM se shuru karo\" now shifts your whole day plan: finished blocks stay put, meals are kept, and a late plan is fitted before midnight",
    ],
  },
  "2.8.0": {
    title: "Meet HV AI",
    points: [
      "HV AI, your assistant in HV Vault and HV Reset: tap the HV AI button, type or hold the mic, in Hindi, English or Hinglish",
      "Add, update, move or delete jobs, set follow-ups and interviews, or ask what's pending. Try: \"Cred ko applied mark karo aur 5 din baad follow-up laga do\"",
      "Every change shows as a card first: Confirm, Edit or Cancel. Deletes always ask, unclear names get a question, and the last change can be undone",
      "In HV Reset it also builds and edits your day plan, keeping meals and core blocks",
    ],
  },
  "2.7.0": {
    title: "HV Vault and HV Reset, one system",
    points: [
      "Log an application in HV Reset and it lands here as Applied, with its first follow-up",
      "Reset shows your saved jobs as an apply queue, sorted by the 2-minute apply rule",
      "Mark follow-ups done from Reset; its counter and weekly review read from HV Vault",
      "One apply rule for both apps, so the rule text and the check always agree",
    ],
  },
  "2.6.0": {
    title: "Guided profile setup",
    points: [
      "New accounts set up their profile one question at a time right after Google sign-in",
      "Upload your resume and AI fills in your details; you only answer what's missing",
      "Name and email come from your Google account, and you can review everything before saving",
    ],
  },
  "2.5.0": {
    title: "A new sunrise look",
    points: [
      "Liquid-glass design: a dawn sky in light mode, a starry pre-dawn night in dark mode",
      "Big, calm dashboard that greets you by time of day, with a fresh job-hunt line and your week's momentum",
      "Larger numbers, roomier pages and pill buttons, matching HV Reset",
      "Privacy and backup text updated to match Google sign-in and sync",
    ],
  },
  "2.4.0": {
    title: "Your vault, on every device",
    points: [
      "Sign in with Google and your jobs, companies and resumes sync across your phone and laptop",
      "HV Reset link in the sidebar, plus a 2-minute apply-rule check on each job",
      "Dates are now your local date, so nothing shows as yesterday after midnight",
      "Drag cards in the Pipeline on your phone: press and hold a card, then drag",
    ],
  },
  "2.3.0": {
    title: "A brand-new look",
    points: [
      "New HV Vault logo — 'The Alignment' — across the app, installer, and every Windows icon",
      "Fully branded professional installer experience",
      "Sharper, crisper logo rendering at every size",
      "Windows shows proper product details (publisher, copyright, version)",
    ],
  },
  "2.2.0": {
    title: "Update system hardening",
    points: [
      "Reliable update filenames — updates can no longer break from a name mismatch",
      "Automatic release verification before anything ships",
    ],
  },
  "2.1.0": {
    title: "Analytics, Calendar & auto-update",
    points: [
      "Full Analytics dashboard — 15 metrics, 10 charts, filters, and a custom chart builder",
      "Calendar Center — every interview, follow-up, and deadline in one place",
      "In-app updates — check, download, and install new versions from Settings",
    ],
  },
};

const cleanReleaseNotes = (raw) =>
  String(raw || "")
    .replace(/<[^>]+>/g, " ")
    .split(/\r?\n/)
    .map((l) => l.replace(/^[#>*\-•\s]+/, "").trim())
    .filter((l) => l && !/^-{3,}$/.test(l))
    .slice(0, 8);

function ReleaseNotesBox({ version, notes }) {
  const lines = cleanReleaseNotes(notes);
  const fallback = APP_CHANGELOG[version];
  const points = lines.length ? lines : fallback ? fallback.points : ["Improvements and fixes throughout the app."];
  return (
    <div className="release-notes">
      <div className="release-notes-title"><Sparkles size={13} /> What&rsquo;s new in v{version}{!lines.length && fallback ? " — " + fallback.title : ""}</div>
      <ul>{points.map((t, i) => <li key={i}>{t}</li>)}</ul>
    </div>
  );
}

/* Shown once, on the first launch after an update has installed. */
function WhatsNewModal({ version, onClose }) {
  const info = APP_CHANGELOG[version];
  return (
    <Modal title="" onClose={onClose}>
      <div style={{ textAlign: "center", padding: "6px 4px 2px" }}>
        <div style={{ display: "flex", justifyContent: "center", marginBottom: 14 }}><BrandMark size={64} /></div>
        <h2 className="serif-strong" style={{ fontSize: 22, marginBottom: 4 }}>You&rsquo;re updated to v{version}</h2>
        <p className="muted" style={{ marginBottom: 14 }}>{info ? info.title : "Here's what changed"}</p>
      </div>
      <div className="release-notes" style={{ marginTop: 0 }}>
        <ul>{(info ? info.points : ["Improvements and fixes throughout the app."]).map((t, i) => <li key={i}>{t}</li>)}</ul>
      </div>
      <p className="muted small" style={{ textAlign: "center", marginTop: 10 }}>Your data was untouched by this update — everything is exactly where you left it.</p>
      <div className="modal-foot" style={{ justifyContent: "center" }}>
        <button className="btn btn-primary" onClick={onClose} autoFocus><Sparkles size={14} /> Let&rsquo;s go</button>
      </div>
    </Modal>
  );
}

/* Cloud sync controls (web only). Sign in with Google once per device; everything then
   stays in sync across phone and laptop, and with HV Reset on the same account. */
function useCloud() {
  const cloud = typeof window !== "undefined" && window.hv && window.hv.cloud;
  const [user, setUser] = useState(cloud ? cloud.user : null);
  const [st, setSt] = useState(cloud ? cloud.status() : { state: "off" });
  useEffect(() => {
    if (!cloud) return;
    const a = cloud.onUser((u) => setUser(u)), b = cloud.onStatus(setSt);
    return () => { a(); b(); };
  }, []);
  return { cloud, user, st };
}
/* Account button (top bar). Guests: "Sign in" with Google. Signed in: avatar with a menu. */
async function signInWithGoogle(notify) {
  try { await window.hv.cloud.signIn(); } catch (e) { const m = signInError(e); if (m) notify(m); }
}
function Avatar({ user, size }) {
  const [bad, setBad] = useState(false);
  const ini = ((user && (user.name || user.email)) || "?").trim()[0].toUpperCase();
  return (
    <span className="acc-av" style={{ width: size, height: size, fontSize: size * .45 }}>
      {user && user.photo && !bad ? <img src={user.photo} alt="" referrerPolicy="no-referrer" onError={() => setBad(true)} /> : ini}
    </span>
  );
}
function AccountButton({ notify }) {
  const { cloud, user, st } = useCloud();
  const [open, setOpen] = useState(false);
  const ref = useRef(null);
  useEffect(() => {
    if (!open) return;
    const off = (e) => { if (ref.current && !ref.current.contains(e.target)) setOpen(false); };
    const esc = (e) => { if (e.key === "Escape") setOpen(false); };
    document.addEventListener("mousedown", off); document.addEventListener("keydown", esc);
    return () => { document.removeEventListener("mousedown", off); document.removeEventListener("keydown", esc); };
  }, [open]);
  if (!IS_WEB() || !cloud || !cloud.configured) return null;
  if (!user) return (
    <button className="acc-signin" onClick={() => signInWithGoogle(notify)} title="Sign in with Google to save your data">
      <span className="acc-g">{GoogleG}</span><span className="acc-lbl">Sign in</span>
    </button>
  );
  const since = st.last ? fmtTime(new Date(st.last).toTimeString().slice(0, 5)) : "";
  return (
    <div className="acc-wrap" ref={ref}>
      <button className="acc-btn" onClick={() => setOpen((o) => !o)} aria-haspopup="true" aria-expanded={open} aria-label={"Account: " + (user.email || user.name)}>
        <Avatar user={user} size={32} />
      </button>
      {open && (
        <div className="acc-menu" role="menu">
          <div className="acc-who">
            <Avatar user={user} size={44} />
            <div><b>{user.name || user.email}</b><small>{user.name ? user.email : "Google account"}</small></div>
          </div>
          <p className="acc-note">{st.state === "error" ? "Sync problem. Retrying." : st.state === "syncing" ? "Saving…" : "Saved to your account" + (since ? " · " + since : "")}. Only you can see your data.</p>
          <div className="acc-row">
            <button className="btn btn-ghost btn-sm" onClick={() => { setOpen(false); cloud.signOut(); }}><LogOut size={13} /> Sign out</button>
          </div>
        </div>
      )}
    </div>
  );
}
/* Guests: the first real change brings up a "Sign in to save" card; after "Not now", a pill stays. */
function GuestSave({ notify }) {
  const cloud = IS_WEB() && window.hv.cloud;
  const [dirty, setDirty] = useState(!!(cloud && cloud.guestDirty));
  const [card, setCard] = useState(false);
  useEffect(() => {
    if (!cloud) return;
    let shown = false;
    const on = () => { setDirty(true); if (!shown) { shown = true; setCard(true); } };
    const leave = (e) => { if (cloud.guestDirty) { e.preventDefault(); e.returnValue = ""; } };
    window.addEventListener("hv-guest-change", on); window.addEventListener("beforeunload", leave);
    return () => { window.removeEventListener("hv-guest-change", on); window.removeEventListener("beforeunload", leave); };
  }, []);
  if (!cloud || !cloud.guest || !dirty) return null;
  if (!card) return (
    <button className="guest-pill" onClick={() => signInWithGoogle(notify)}><i /> Not saved · Sign in</button>
  );
  return (
    <div className="guest-card" role="dialog" aria-label="Save your data">
      <b>Want to keep this?</b>
      <p>You can use HV Vault freely. To save your jobs, companies and follow-ups, sign in with Google. Only you can see your data.</p>
      <div className="guest-row">
        <button className="btn btn-primary guest-go" onClick={() => signInWithGoogle(notify)}><span className="acc-g">{GoogleG}</span> Sign in to save</button>
        <button className="btn btn-ghost" onClick={() => setCard(false)}>Not now</button>
      </div>
    </div>
  );
}
function CloudSyncCard({ notify }) {
  const { cloud, user, st } = useCloud();
  if (!cloud) return null;
  const since = st.last ? fmtTime(new Date(st.last).toTimeString().slice(0, 5)) : "";
  const signIn = async () => { try { await cloud.signIn(); } catch (e) { notify("Sign-in failed: " + (e.message || e)); } };
  return (
    <SetGroup title="Account">
      {!cloud.configured ? (
        <SetRow icon={Cloud} title="Saved in this browser only" sub="Cloud sync isn't set up for this site." />
      ) : !user ? (
        <SetRow icon={Cloud} title="Not signed in" sub="You can use HV Vault freely, but nothing is saved. Sign in to save your data and use it on your phone and laptop.">
          <button className="btn btn-primary btn-sm" onClick={() => signInWithGoogle(notify)}>Sign in with Google</button>
        </SetRow>
      ) : (<>
        <SetRow icon={User} title={user.email || user.name}
          sub={st.state === "syncing" ? "Syncing…" : st.state === "error" ? "Sync problem: " + st.error + ". Retrying" : since ? "Synced at " + since : "Connected"}>
          <button className="btn btn-ghost btn-sm" onClick={() => cloud.syncNow()}><RefreshCw size={13} /> Sync now</button>
          <button className="btn btn-ghost btn-sm" onClick={() => cloud.signOut()}><LogOut size={13} /> Sign out</button>
        </SetRow>
        <SetRow icon={ShieldCheck} title="Private to your Google account" sub="Only you can see your data. Signing out clears this browser; your data stays in your account." />
      </>)}
    </SetGroup>
  );
}

function UpdatesCard() {
  const [ver, setVer] = useState("");
  const [st, setSt] = useState({ phase: "idle" });
  const hv = typeof window !== "undefined" ? window.hv : null;

  useEffect(() => {
    if (!hv || !hv.getAppVersion) return;
    hv.getAppVersion().then((v) => setVer(v || "")).catch(() => {});
    const off = hv.onUpdateStatus ? hv.onUpdateStatus((p) => {
      if (p.status === "checking") setSt({ phase: "checking" });
      else if (p.status === "available") setSt({ phase: "available", latest: p.version, notes: p.notes || "" });
      else if (p.status === "not-available") setSt({ phase: "latest" });
      else if (p.status === "progress") setSt((s) => ({ phase: "progress", latest: s.latest, notes: s.notes, percent: p.percent, transferredMB: p.transferredMB, totalMB: p.totalMB }));
      else if (p.status === "downloaded") setSt((s) => ({ phase: "downloaded", latest: p.version, notes: p.notes || s.notes || "" }));
      else if (p.status === "error") setSt({ phase: "error", message: p.message });
    }) : null;
    return () => { if (off) off(); };
  }, []);

  const check = async () => {
    if (!hv || !hv.checkForUpdates) { setSt({ phase: "dev" }); return; }
    setSt({ phase: "checking" });
    const r = await hv.checkForUpdates();
    if (r && r.web) setSt({ phase: "web" });
    else if (r && r.dev) setSt({ phase: "dev" });
    else if (r && r.error) setSt({ phase: "error", message: r.error });
    // success case: events (available / not-available) drive the UI
  };
  const startDownload = async () => {
    setSt((s) => ({ phase: "progress", latest: s.latest, percent: 0 }));
    const r = await hv.downloadUpdate();
    if (r && r.error) setSt({ phase: "error", message: r.error });
  };
  const install = async () => {
    const r = await hv.installUpdate();
    if (r && r.error) setSt({ phase: "error", message: r.error });
  };

  return (
    <div className="card">
      <h3 className="card-title">{IS_WEB() ? "About" : "About & Updates"}</h3>
      <p style={{ marginBottom: 10 }}>HV Vault <strong className="mono">v{ver || "—"}</strong>
        {st.phase === "available" || st.phase === "progress" || st.phase === "downloaded"
          ? <span className="muted"> → latest available: <strong className="mono">v{st.latest}</strong></span> : null}
      </p>

      {st.phase === "idle" && (IS_WEB()
        ? <p className="muted small"><CheckCircle2 size={14} style={{ verticalAlign: "-2px" }} /> The website updates itself: you always have the latest version.</p>
        : <button className="btn btn-primary" onClick={check}><Download size={14} /> Check for Updates</button>
      )}
      {st.phase === "checking" && <p className="muted"><Clock size={13} style={{ verticalAlign: "-2px" }} /> Checking for updates…</p>}
      {st.phase === "latest" && (
        <div>
          <p className="good-text" style={{ marginBottom: 8 }}><CheckCircle2 size={14} style={{ verticalAlign: "-2px" }} /> You are using the latest version.</p>
          <button className="btn btn-ghost btn-sm" onClick={check}>Check again</button>
        </div>
      )}
      {st.phase === "available" && (
        <div>
          <p style={{ marginBottom: 10 }}>A new version <strong className="mono">v{st.latest}</strong> is available. Your data in <span className="mono">Documents\HV-Vault</span> is never touched by updates.</p>
          <ReleaseNotesBox version={st.latest} notes={st.notes} />
          <div className="btn-row">
            <button className="btn btn-primary" onClick={startDownload}><Download size={14} /> Download Update</button>
            <button className="btn btn-ghost" onClick={() => setSt({ phase: "idle" })}>Not now</button>
          </div>
        </div>
      )}
      {st.phase === "progress" && (
        <div>
          <p style={{ marginBottom: 8 }}>Downloading v{st.latest}… <strong className="mono">{st.percent || 0}%</strong>
            {st.totalMB ? <span className="muted"> ({st.transferredMB || 0} / {st.totalMB} MB)</span> : null}</p>
          <div className="update-bar"><div className="update-bar-fill" style={{ width: (st.percent || 0) + "%" }} /></div>
        </div>
      )}
      {st.phase === "downloaded" && (
        <div>
          <p style={{ marginBottom: 10 }}><CheckCircle2 size={14} style={{ verticalAlign: "-2px", color: "var(--green)" }} /> v{st.latest} downloaded and ready to install.</p>
          <ReleaseNotesBox version={st.latest} notes={st.notes} />
          <div className="btn-row">
            <button className="btn btn-good" onClick={install}>Install and Restart</button>
            <button className="btn btn-ghost" onClick={() => setSt({ phase: "idle" })}>Later</button>
          </div>
          <p className="muted small" style={{ marginTop: 8 }}>The app will close, update, and reopen. All your data stays exactly where it is.</p>
        </div>
      )}
      {st.phase === "error" && (
        <div>
          <p style={{ color: "var(--red)", marginBottom: 8 }}>✕ {st.message || "Update check failed"}</p>
          <button className="btn btn-ghost btn-sm" onClick={check}>Try again</button>
        </div>
      )}
      {st.phase === "web" && (
        <p className="muted">You're using the web version — it always runs the latest release. Just refresh the page to get new updates.</p>
      )}
      {st.phase === "dev" && (
        <p className="muted">Auto-update works only in the installed app. Build the installer with <span className="mono">npm run makeexe</span> and install it to test updates.</p>
      )}
    </div>
  );
}

/* First screen on a new phone/laptop: one tap to pull everything from the cloud. */
function WizardCloudLink({ onClose }) {
  const cloud = typeof window !== "undefined" && window.hv && window.hv.cloud;
  if (!cloud || !cloud.configured || cloud.user) return null;
  return (
    <div style={{ marginTop: 10 }}>
      <button className="text-link" onClick={async () => { try { await cloud.signIn(); onClose(); } catch (e) {} }}>
        Already use HV Vault on another device? Sign in to sync
      </button>
    </div>
  );
}

function HVAISelfTest({ settings }) {
  const [rows, setRows] = useState([]);
  const [running, setRunning] = useState(false);
  const [open, setOpen] = useState(false);
  const T = typeof window !== "undefined" && window.HVAI_TESTS;
  const cfg = window.HVAI ? window.HVAI.pickConfig(settings) : {};
  const hasKey = !!(window.HVAI && window.HVAI.hasAI(cfg));
  const run = async () => {
    setRunning(true); setRows([]); setOpen(true);
    const out = [];
    for (const [i, t] of T.TESTS.entries()) {
      if (i) await new Promise((res) => setTimeout(res, 4000));        // spaced out so the free AI's per-minute limit is never hit
      let r; try { r = await T.runOne(window.HVAI, cfg, t); } catch (e) { r = { ok: false, why: String(e && e.message || e), actions: [] }; }
      out.push({ t, r }); setRows([...out]);
    }
    setRunning(false);
  };
  const passed = rows.filter((x) => x.r.ok).length;
  if (!T || !hasKey) return null;
  return (<>
    <SetRow icon={CheckCircle2} title="Full check" sub={running ? "Checking " + rows.length + "/" + T.TESTS.length + " (about 2 minutes, paced for the free AI)" : rows.length ? passed + "/" + rows.length + " commands passed" : "Tries " + T.TESTS.length + " sample commands on sample data (about 2 minutes). Changes nothing."}>
      {rows.length > 0 && !running && <button className="btn btn-ghost btn-sm" onClick={() => setOpen((x) => !x)}>{open ? "Hide" : "Details"}</button>}
      <button className="btn btn-ghost btn-sm" disabled={running} onClick={run}>{running ? "Running…" : rows.length ? "Run again" : "Run"}</button>
    </SetRow>
    {open && rows.length > 0 && (
      <div className="set-detail">
        {rows.map(({ t, r }, i) => (
          <div key={i} style={{ borderTop: i ? "1px solid var(--line)" : 0, padding: "7px 0", fontSize: 13 }}>
            <div><span style={{ color: r.ok ? "var(--green)" : "var(--red)", fontWeight: 700 }}>{r.ok ? "PASS" : "FAIL"}</span> <span className="muted">[{t.lang}]</span> {t.cmd}</div>
            <div className="muted">Expected: {r.why}{r.ms ? " · " + (r.ms / 1000).toFixed(1) + "s" : ""}</div>
            <div className="muted mono" style={{ fontSize: 11.5 }}>{(r.actions || []).map((a) => a.action.type + "(" + a.status + ")" + (a.action.args ? " " + JSON.stringify(a.action.args).slice(0, 700) : "")).join(" ; ")}</div>
          </div>
        ))}
      </div>
    )}
  </>);
}

/* HV AI key. Resume reading uses the site's built-in AI (web) and needs nothing here;
   this key is only for the HV AI assistant in HV Vault and HV Reset. */
function HVAIKeyCard({ s, set, setData, notify }) {
  const [adv, setAdv] = useState(false);
  const [testing, setTesting] = useState(false);
  if (IS_WEB()) {                                        // website: the built-in AI, nothing to set up
    const on = AI_BUILTIN();
    const test = async () => {
      setTesting(true);
      const r = window.hv.aiTestProject ? await window.hv.aiTestProject() : { error: "Not available" };
      setTesting(false);
      notify(r && r.ok ? "✓ HV AI is working" : "✕ " + ((r && r.error) || "HV AI didn't answer"));
    };
    return (
      <SetGroup title="HV AI">
        <SetRow icon={Sparkles} title={on ? "On, built in" : "Not available right now"}
          sub={on ? "Chat, voice, resume reading and job auto-fill, here and in HV Reset. No key needed." : "Reload the page and try again."}>
          {on && <button className="btn btn-ghost btn-sm" disabled={testing} onClick={test}>{testing ? "Checking…" : "Test"}</button>}
        </SetRow>
        <HVAISelfTest settings={s} />
      </SetGroup>
    );
  }
  const web = IS_WEB();
  const on = !!(s.aiKey && s.aiProvider && s.aiProvider !== "off");
  const test = async () => {
    if (!(typeof window !== "undefined" && window.hv && window.hv.aiTest)) return notify("Testing isn't available here");
    if (!on) return notify("Paste your key first");
    notify("Checking your key…");
    const r = await window.hv.aiTest({ provider: s.aiProvider, apiKey: s.aiKey, model: s.aiModel || "" });
    notify(r && r.ok ? "✓ Key works. HV AI is ready" : "✕ " + ((r && r.error) || "That key didn't work"));
  };
  const setKey = (e) => { const v = e.target.value; setData((d) => ({ ...d, settings: { ...d.settings, aiKey: v, aiProvider: v && (!d.settings.aiProvider || d.settings.aiProvider === "off") ? "gemini" : d.settings.aiProvider } })); };
  return (
    <div className="card">
      <h3 className="card-title">HV AI</h3>
      <p style={{ marginBottom: 12 }}>
        <span className={on ? "good-text" : "muted"}>{on ? <><CheckCircle2 size={14} style={{ verticalAlign: "-2px" }} /> HV AI is on</> : "HV AI is off: add a free key to turn it on"}</span>
      </p>
      <div className="form-grid">
        <Field label="Your Gemini key"><input className="input" type="password" value={s.aiKey || ""} onChange={setKey} placeholder="Paste your key (free from aistudio.google.com)" /></Field>
        <div style={{ display: "flex", alignItems: "flex-end", gap: 8, flexWrap: "wrap" }}>
          <button className="btn btn-ghost" onClick={test}>Test key</button>
          {on && <button className="btn btn-ghost" onClick={() => { setData((d) => ({ ...d, settings: { ...d.settings, aiKey: "", aiProvider: "off" } })); notify("Key removed. HV AI is off"); }}>Remove key</button>}
        </div>
      </div>
      <p className="muted small" style={{ marginTop: 10 }}>
        The key powers the HV AI assistant here and in HV Reset. {web ? "Reading your resume doesn't need it: that uses HV Vault's built-in AI. " : ""}
        Get one free: open <strong>aistudio.google.com</strong>, sign in, tap <strong>Get API key</strong>, copy it and paste it above. {web ? "It's saved privately with your account." : "It's saved only on this PC."}
      </p>
      <button className="btn btn-ghost btn-sm" style={{ marginTop: 4 }} onClick={() => setAdv((x) => !x)}>{adv ? "Hide advanced" : "Advanced"}</button>
      {adv && (
        <div className="form-grid" style={{ marginTop: 10 }}>
          <Field label="Provider">
            <select className="input" value={s.aiProvider || "off"} onChange={set("aiProvider")}>
              <option value="off">Off</option>
              <option value="gemini">Gemini (Google)</option>
              <option value="openrouter">OpenRouter</option>
            </select>
          </Field>
          <Field label="Model (optional)"><input className="input" value={s.aiModel || ""} onChange={set("aiModel")} placeholder={s.aiProvider === "openrouter" ? "leave empty for the default" : "leave empty for the default"} /></Field>
        </div>
      )}
    </div>
  );
}

/* Settings layout: grouped rows, like a phone's settings app */
function SetGroup({ title, danger, children }) {
  return (
    <section className={"set-group" + (danger ? " danger" : "")}>
      {title && <h3 className="set-group-title">{title}</h3>}
      <div className="card set-list">{children}</div>
    </section>
  );
}
function SetRow({ icon: I, title, sub, children }) {
  return (
    <div className="set-row">
      {I && <span className="set-ic"><I size={17} strokeWidth={1.9} /></span>}
      <div className="set-text"><div className="set-title">{title}</div>{sub && <div className="set-sub">{sub}</div>}</div>
      {children && <div className="set-right">{children}</div>}
    </div>
  );
}

function AboutRow() {
  const [ver, setVer] = useState("");
  useEffect(() => { const hv = typeof window !== "undefined" && window.hv; if (hv && hv.getAppVersion) hv.getAppVersion().then((v) => setVer(v || "")).catch(() => {}); }, []);
  return <SetRow icon={Info} title={"HV Vault" + (ver ? " v" + ver : "")} sub="Updates automatically. You always have the latest version." />;
}

function SettingsPage({ data, setData, notify }) {
  const s = data.settings;
  const set = (k) => (e) => setData((d) => ({ ...d, settings: { ...d.settings, [k]: e.target.value } }));
  const importRef = useRef(null);
  const importKindRef = useRef("jobs");
  const [exportKind, setExportKind] = useState("jobs");

  const exportJobs = () => {
    const rows = data.jobs.map((j) => ({
      title: j.title, company: data.companies.find((c) => c.id === j.company_id)?.name || "",
      status: j.status, source: j.source, location: j.location, work_mode: j.work_mode,
      job_type: j.job_type, salary_range: j.salary_range, priority: j.priority,
      fit_score: j.fit_score, excitement_score: j.excitement_score, deadline: j.deadline,
      date_saved: j.date_saved, date_applied: j.date_applied, interview_date: j.interview_date,
      resume: data.resumes.find((r) => r.id === j.resume_id)?.title || "",
      job_link: j.job_link, skills_required: j.skills_required, tags: (j.tags || []).join("; "), notes: j.notes,
    }));
    download("hv-vault-jobs.csv", toCSV(rows, ["title", "company", "status", "source", "location", "work_mode", "job_type", "salary_range", "priority", "fit_score", "excitement_score", "deadline", "date_saved", "date_applied", "interview_date", "resume", "job_link", "skills_required", "tags", "notes"]));
    notify("Jobs exported");
  };
  const exportCompanies = () => {
    const rows = data.companies.map((c) => ({
      name: c.name, industry: c.industry, location: c.location, website: c.website,
      career_page: c.career_page, linkedin: c.linkedin, size: c.size, hiring_status: c.hiring_status,
      priority: c.priority, status: c.status, rating: c.rating, contact_name: c.contact_name,
      contact_email: c.contact_email, tags: (c.tags || []).join("; "), notes: c.notes,
    }));
    download("hv-vault-companies.csv", toCSV(rows, ["name", "industry", "location", "website", "career_page", "linkedin", "size", "hiring_status", "priority", "status", "rating", "contact_name", "contact_email", "tags", "notes"]));
    notify("Companies exported");
  };
  const exportFollowups = () => {
    const rows = data.followups.map((f) => ({
      title: f.title, type: f.type, status: f.status, due_date: f.due_date, sent_date: f.sent_date,
      reply_received: f.reply_received, reply_date: f.reply_date,
      company: data.companies.find((c) => c.id === f.company_id)?.name || "",
      job: data.jobs.find((j) => j.id === f.job_id)?.title || "",
      contact_name: f.contact_name, next_action: f.next_action, notes: f.notes,
    }));
    download("hv-vault-followups.csv", toCSV(rows, ["title", "type", "status", "due_date", "sent_date", "reply_received", "reply_date", "company", "job", "contact_name", "next_action", "notes"]));
    notify("Follow-ups exported");
  };

  const exportEvents = () => {
    const rows = (data.calendarEvents || []).map((ev) => ({
      title: ev.title, type: ev.type, date: ev.date, time: ev.time, status: ev.status, priority: ev.priority,
      reminder: ev.reminder, company: data.companies.find((c) => c.id === ev.company_id)?.name || "",
      job: data.jobs.find((j) => j.id === ev.job_id)?.title || "", contact: ev.contact, notes: ev.notes,
    }));
    download("hv-vault-calendar-events.csv", toCSV(rows, ["title", "type", "date", "time", "status", "priority", "reminder", "company", "job", "contact", "notes"]));
    notify("Calendar events exported");
  };
  const exportAnalytics = () => {
    download("hv-vault-analytics.csv", toCSV(analyticsSummaryRows(data), ["metric", "value"]));
    notify("Analytics summary exported");
  };

  const startImport = (kind) => { importKindRef.current = kind; importRef.current?.click(); };
  const handleImport = (e) => {
    const file = e.target.files?.[0];
    if (!file) return;
    const reader = new FileReader();
    reader.onload = () => {
      try {
        const rows = parseCSV(String(reader.result));
        if (!rows.length) return notify("No rows found in that CSV");
        if (importKindRef.current === "companies") {
          const items = rows.map((r) => ({
            id: uid(), name: r.name || r.company || "Unnamed", industry: r.industry || "",
            location: r.location || "", website: r.website || "", career_page: r.career_page || "",
            linkedin: r.linkedin || "", size: r.size || "", hiring_status: r.hiring_status || "Unknown",
            priority: r.priority || "Medium", status: r.status || "To Research", rating: r.rating || "",
            contact_name: r.contact_name || "", contact_email: r.contact_email || "",
            tags: (r.tags || "").split(";").map((t) => t.trim()).filter(Boolean), notes: r.notes || "",
            created_at: todayISO(),
          }));
          setData((d) => ({ ...d, companies: [...d.companies, ...items] }));
          notify("Imported " + items.length + " companies");
        } else {
          setData((d) => {
            let companies = [...d.companies];
            const jobs = rows.map((r) => {
              let cid = "";
              const cname = (r.company || "").trim();
              if (cname) {
                let c = companies.find((x) => x.name.toLowerCase() === cname.toLowerCase());
                if (!c) { c = { id: uid(), name: cname, priority: "Medium", status: "To Research", hiring_status: "Unknown", tags: [], created_at: todayISO() }; companies.push(c); }
                cid = c.id;
              }
              return {
                id: uid(), title: r.title || r.role || "Untitled role", company_id: cid,
                status: STAGES.includes(r.status) ? r.status : "Saved", source: r.source || "Other",
                location: r.location || "", work_mode: WORK_MODES.includes(r.work_mode) ? r.work_mode : "Hybrid",
                job_type: JOB_TYPES.includes(r.job_type) ? r.job_type : "Full-time",
                salary_range: r.salary_range || "", priority: PRIORITIES.includes(r.priority) ? r.priority : "Medium",
                fit_score: r.fit_score || "", excitement_score: r.excitement_score || "",
                deadline: r.deadline || "", date_saved: r.date_saved || todayISO(), date_applied: r.date_applied || "",
                interview_date: r.interview_date || "", job_link: r.job_link || "", skills_required: r.skills_required || "",
                tags: (r.tags || "").split(";").map((t) => t.trim()).filter(Boolean), notes: r.notes || "",
                resume_id: "", cover_id: "", resume_verdict: "",
                timeline: [{ date: todayISO(), event: "Imported from CSV" }], prep_done: [],
              };
            });
            notify("Imported " + jobs.length + " jobs");
            return { ...d, companies, jobs: [...d.jobs, ...jobs] };
          });
        }
      } catch (err) { notify("Import failed — check the CSV format"); }
      e.target.value = "";
    };
    reader.readAsText(file);
  };

  const resetAll = async () => {
    if (!confirm("Reset EVERYTHING? All companies, jobs, follow-ups, resumes, and settings will be deleted. This cannot be undone.")) return;
    if (!confirm("Really sure? Consider exporting CSVs first.")) return;
    for (const r of data.resumes) { try { await window.storage.delete(FILE_KEY(r.id)); } catch (e) {} }
    setData(emptyData());
    notify("Vault reset — fresh start");
  };

  return (
    <div>
      <PageHead title="Settings" />
      <div className="set-wrap">
        <CloudSyncCard notify={notify} />

        <HVAIKeyCard s={s} set={set} setData={setData} notify={notify} />

        <SetGroup title="Follow-ups">
          <SetRow icon={AlarmClock} title="Default follow-up gap" sub="Days after applying until the first follow-up">
            <input className="input set-num" type="number" min="1" max="30" value={s.followupGap} onChange={set("followupGap")} aria-label="Default follow-up gap in days" />
          </SetRow>
        </SetGroup>

        <SetGroup title="Your data">
          <SetRow icon={FileDown} title="Export to Excel (CSV)" sub="Opens in Excel or Google Sheets">
            <select className="input set-sel" value={exportKind} onChange={(e) => setExportKind(e.target.value)} aria-label="What to export">
              <option value="jobs">Jobs</option><option value="companies">Companies</option><option value="followups">Follow-ups</option>
              <option value="events">Calendar events</option><option value="analytics">Analytics summary</option>
            </select>
            <button className="btn btn-ghost btn-sm" onClick={() => ({ jobs: exportJobs, companies: exportCompanies, followups: exportFollowups, events: exportEvents, analytics: exportAnalytics }[exportKind])()}><Download size={13} /> Export</button>
          </SetRow>
          <SetRow icon={FileUp} title="Import from CSV" sub="New companies are created automatically">
            <button className="btn btn-ghost btn-sm" onClick={() => startImport("jobs")}>Jobs</button>
            <button className="btn btn-ghost btn-sm" onClick={() => startImport("companies")}>Companies</button>
            <input ref={importRef} type="file" accept=".csv" style={{ display: "none" }} onChange={handleImport} />
          </SetRow>
          {typeof window !== "undefined" && window.hv && (
            <SetRow icon={Archive} title="Full backup" sub="Everything, including resume files, in one .json file">
              <button className="btn btn-ghost btn-sm" onClick={async () => { const r = await window.hv.exportBackup(); if (r && r.path) notify("Backup saved: " + r.path); }}><Download size={13} /> Download</button>
              <button className="btn btn-ghost btn-sm" onClick={async () => {
                const r = await window.hv.importBackup();
                if (r && r.count) { notify("Imported " + r.count + " records — reloading…"); setTimeout(() => window.location.reload(), 900); }
                else if (r && r.error) notify("Import failed: " + r.error);
              }}><Upload size={13} /> Restore</button>
            </SetRow>
          )}
        </SetGroup>

        {IS_WEB() ? (
          <SetGroup title="About">
            <AboutRow />
          </SetGroup>
        ) : <UpdatesCard />}

        <SetGroup title="Danger zone" danger>
          <SetRow icon={Trash2} title="Delete all data" sub="Removes everything, including resume files. Download a backup first.">
            <button className="btn btn-danger btn-sm" onClick={resetAll}>Delete</button>
          </SetRow>
        </SetGroup>
      </div>
    </div>
  );
}

/* ================================================================== */
/* Styles                                                              */
/* ================================================================== */

/* Official HV Vault mark — "The Alignment": vault rings whose gaps line
   up into a single channel reaching the core.

   Two detail tiers on purpose — this is standard icon-design practice
   (macOS/iOS app icons work the same way): fine detail that looks
   premium at large sizes turns into a blurry smudge once a browser or
   OS has to anti-alias sub-2px strokes at small sizes. So:
     - COMPACT (2 rings, thick strokes, wide gaps) → used at ≤52px,
       i.e. every place this renders INSIDE the app (sidebar, loading
       screen). Stays crisp even on a 38px tile.
     - FULL (3 rings, fine detail) → used only ≥64px, i.e. the actual
       app icon / installer graphics / marketing. Do not use FULL below
       ~64px — it will blur. Do not use COMPACT above ~96px — it will
       look chunky instead of premium. */
const HV_LOGO_SVG = '<svg viewBox="0 0 1024 1024" aria-hidden="true"><defs><linearGradient id="hvaimk" x1="0" y1="0" x2="1" y2="1"><stop offset="0" stop-color="#1B3157"/><stop offset=".5" stop-color="#152647"/><stop offset="1" stop-color="#0C1830"/></linearGradient></defs><rect width="1024" height="1024" rx="230" fill="url(#hvaimk)"/><path d="M 608.00 360.68 A 179.2 179.2 0 1 1 416.00 360.68" fill="none" stroke="#DFC18A" stroke-width="96" stroke-linecap="round"/><path d="M 608.00 206.74 A 320 320 0 1 1 416.00 206.74" fill="none" stroke="#C9A45E" stroke-width="83.2" stroke-linecap="round"/><circle cx="512" cy="512" r="96" fill="#EAD9B0"/></svg>';
const HVAI_WEB_HELP = "HV AI couldn't start: the site's built-in AI isn't reachable right now. Reload the page, check your internet, and turn off ad or tracker blockers for this site.";
const HVAI_KEY_HELP = "HV AI needs your AI key once. Open Settings > HV AI, paste your Gemini key (free: aistudio.google.com > Get API key) and save. HV Reset then uses the same key automatically.";

function BrandMark({ size = 38 }) {
  const compact = size <= 52;
  return (
    <svg width={size} height={size} viewBox="0 0 1024 1024" style={{ flexShrink: 0 }}>
      <defs>
        <linearGradient id="hvmarkbg" x1="0" y1="0" x2="1" y2="1">
          <stop offset="0" stopColor="#1B3157" /><stop offset=".5" stopColor="#152647" /><stop offset="1" stopColor="#0C1830" />
        </linearGradient>
      </defs>
      <rect width="1024" height="1024" rx="230" fill="url(#hvmarkbg)" />
      {compact ? (
        <>
          <path d="M 608.00 360.68 A 179.2 179.2 0 1 1 416.00 360.68" fill="none" stroke="#DFC18A" strokeWidth="96" strokeLinecap="round" />
          <path d="M 608.00 206.74 A 320 320 0 1 1 416.00 206.74" fill="none" stroke="#C9A45E" strokeWidth="83.2" strokeLinecap="round" />
          <circle cx="512" cy="512" r="96" fill="#EAD9B0" />
        </>
      ) : (
        <>
          <path d="M 569.00 373.25 A 150 150 0 1 1 455.00 373.25" fill="none" stroke="#EAD9B0" strokeWidth="62" strokeLinecap="round" />
          <path d="M 569.00 281.96 A 237 237 0 1 1 455.00 281.96" fill="none" stroke="#C9A45E" strokeWidth="56" strokeLinecap="round" />
          <path d="M 569.00 197.12 A 320 320 0 1 1 455.00 197.12" fill="none" stroke="#B08A47" strokeWidth="50" strokeLinecap="round" />
          <circle cx="512" cy="512" r="60" fill="#EAD9B0" />
        </>
      )}
    </svg>
  );
}

function StyleBlock() {
  return (
    <style>{`
@import url('https://fonts.googleapis.com/css2?family=Sora:wght@200;300;400;500;600;700&family=Atkinson+Hyperlegible:ital,wght@0,400;0,700;1,400&family=Inter:wght@400;500;600&family=IBM+Plex+Mono:wght@400;500&display=swap');

.app{
  /* Sunrise glass: light = dawn sky, dark = pre-dawn night. Surfaces are translucent glass. */
  --sky1:#D9E3F4; --sky2:#E9E1F1; --sky3:#F8E4D2;
  --orb1:#A9BCEB; --orb2:#F6C79A; --orb3:#B3DDD4; --horizon:rgba(255,190,110,.42); --stars:0;
  --bg:rgba(255,255,255,.42); --card:rgba(255,255,255,.56); --glass-strong:rgba(250,251,255,.9); --field:rgba(255,255,255,.74);
  --glass-border:rgba(255,255,255,.8); --glass-hi:rgba(255,255,255,.95); --overlay:rgba(22,28,52,.26);
  --line:rgba(30,42,80,.11); --line2:rgba(30,42,80,.07);
  --text:#16202E; --slate:#46516A; --slate2:#6F7A92;
  --accent:#4058C8; --accent-deep:#3043A8; --green:#2E9A63; --lav:#7C63D6; --gold:#C98A1B;
  --amber:#C98A1B; --red:#C85454; --teal:#2F8F9D;
  --grad:linear-gradient(135deg,#4F66E0 0%,#7C5CE0 100%);
  --chart-grid:rgba(30,42,80,.08); --shadow:0 12px 32px -14px rgba(40,50,90,.22),0 2px 6px rgba(40,50,90,.05);
  --shadow-lg:0 30px 80px -24px rgba(40,50,80,.38); --focus:#4058C8;
  --hover:rgba(255,255,255,.62); --sidebar-bg:rgba(255,255,255,.34); --card-touch:rgba(255,255,255,.7);
  --scroll-thumb:rgba(40,52,90,.22); --scroll-thumb-hover:rgba(40,52,90,.36); --scroll-track:rgba(40,52,90,.04);
}
.app[data-theme="dark"]{
  --sky1:#070C1A; --sky2:#141A38; --sky3:#2E2342;
  --orb1:#3346A0; --orb2:#9A6440; --orb3:#1F6468; --horizon:rgba(242,164,90,.26); --stars:1;
  --bg:rgba(255,255,255,.04); --card:rgba(255,255,255,.065); --glass-strong:rgba(17,21,42,.9); --field:rgba(8,12,26,.5);
  --glass-border:rgba(255,255,255,.14); --glass-hi:rgba(255,255,255,.18); --overlay:rgba(2,4,12,.5);
  --line:rgba(255,255,255,.11); --line2:rgba(255,255,255,.07);
  --text:#EEF1F7; --slate:#C3CADB; --slate2:#98A2B8;
  --accent:#A3B6FF; --accent-deep:#7F95F0; --green:#6FD6A0; --lav:#B9A6FF; --gold:#F2C063;
  --amber:#F2B35E; --red:#F08A8A; --teal:#72C9D4;
  --chart-grid:rgba(255,255,255,.08); --shadow:0 16px 40px -16px rgba(0,0,0,.6);
  --shadow-lg:0 40px 90px -20px rgba(0,0,0,.65); --hover:rgba(255,255,255,.09); --sidebar-bg:rgba(8,12,28,.34); --card-touch:rgba(32,38,70,.6);
  --scroll-thumb:rgba(255,255,255,.18); --scroll-thumb-hover:rgba(255,255,255,.3); --scroll-track:rgba(255,255,255,.035);
}
*{box-sizing:border-box;margin:0;padding:0}
html,body{width:100%;min-height:100vh;margin:0;padding:0;display:block;background:#E6E3F0}
body:has(.app[data-theme="dark"]){background:#0B1024}
#root{width:100%;max-width:none;margin:0;padding:0;text-align:left}
.app{display:flex;width:100%;min-height:100vh;background:var(--bg);color:var(--text);
  font-family:'Inter',system-ui,sans-serif;font-size:15.5px;line-height:1.55;zoom:1.08;
  transition:background .25s ease,color .25s ease}
h1,h2,h3,.brand-name,.stat-value{font-family:'Sora','Inter',sans-serif}
.mono{font-family:'IBM Plex Mono',monospace;font-size:.85em}
.muted{color:var(--slate2)} .small{font-size:12.5px} .prewrap{white-space:pre-wrap}
.good-text{color:var(--green)}
button{font-family:inherit;cursor:pointer}
:focus-visible{outline:2px solid var(--focus);outline-offset:2px;border-radius:6px}

/* ---- Global themed scrollbars (fixes white scrollbars in dark mode) ---- */
.app *{scrollbar-width:thin;scrollbar-color:var(--scroll-thumb) var(--scroll-track)}
.app *::-webkit-scrollbar{width:11px;height:11px}
.app *::-webkit-scrollbar-track{background:var(--scroll-track);border-radius:8px}
.app *::-webkit-scrollbar-thumb{background:var(--scroll-thumb);border-radius:8px;border:2px solid transparent;background-clip:padding-box}
.app *::-webkit-scrollbar-thumb:hover{background:var(--scroll-thumb-hover);background-clip:padding-box}
.app *::-webkit-scrollbar-thumb:active{background:var(--accent);background-clip:padding-box}
.app *::-webkit-scrollbar-corner{background:transparent}

/* Sidebar */
.sidebar{width:222px;background:var(--sidebar-bg);border-right:1px solid var(--line);
  display:flex;flex-direction:column;position:sticky;top:0;height:100vh;flex-shrink:0;transition:background .25s}
.brand{display:flex;gap:10px;align-items:center;padding:20px 18px 16px}
.brand-mark{display:flex;align-items:center;justify-content:center;flex-shrink:0}
.brand-mark svg{border-radius:11px;box-shadow:var(--shadow)}
.brand-name{font-size:16px;font-weight:700}
.brand-sub{font-size:11px;color:var(--slate2)}
.sidebar nav{flex:1;padding:6px 10px;overflow-y:auto}
.nav-item{display:flex;align-items:center;gap:10px;width:100%;padding:8.5px 11px;border:0;background:none;
  color:var(--slate);font-size:13.5px;font-weight:500;border-radius:9px;margin-bottom:1px;text-align:left;transition:all .15s}
.nav-item:hover{background:var(--hover);color:var(--text)}
.nav-item.active{background:var(--accent);color:#fff}
.app[data-theme="dark"] .nav-item.active{background:var(--accent-deep)}
.nav-count{margin-left:auto;background:var(--red);color:#fff;font-size:10.5px;font-weight:600;
  min-width:18px;height:18px;border-radius:9px;display:flex;align-items:center;justify-content:center;padding:0 5px}
.nav-item.active .nav-count{background:rgba(255,255,255,.28)}
.sidebar-foot{padding:14px 18px;font-size:11.5px;color:var(--slate2);border-top:1px solid var(--line);font-style:italic}

/* Main + topbar */
.main{flex:1;display:flex;flex-direction:column;min-width:0}
.topbar{display:flex;align-items:center;gap:12px;padding:12px 26px;background:var(--card);
  border-bottom:1px solid var(--line);position:sticky;top:0;z-index:30;transition:background .25s}
.searchwrap{flex:1;max-width:460px;display:flex;align-items:center;gap:8px;background:var(--bg);
  border:1px solid var(--line);border-radius:10px;padding:7px 12px;color:var(--slate2)}
.searchwrap input{flex:1;border:0;background:none;font-size:13.5px;color:var(--text);outline:none}
.topbar-actions{display:flex;gap:8px;margin-left:auto;align-items:center}
.acc-signin{display:inline-flex;align-items:center;gap:8px;border-radius:999px;padding:4px 14px 4px 4px;border:1px solid var(--line,rgba(120,130,160,.3));background:var(--card);color:var(--text);font-weight:700;font-size:14px;cursor:pointer;box-shadow:0 1px 2px rgba(20,30,60,.08)}
.acc-signin:hover{background:var(--field)}
.acc-g{width:26px;height:26px;border-radius:50%;background:#fff;display:inline-grid;place-items:center;flex:none;box-shadow:0 1px 3px rgba(0,0,0,.18)}
.acc-g svg{width:16px;height:16px}
.acc-wrap{position:relative}
.acc-btn{border:0;background:none;padding:2px;border-radius:50%;cursor:pointer;display:inline-flex}
.acc-btn:focus-visible{outline:2px solid var(--accent);outline-offset:2px}
.acc-av{border-radius:50%;display:inline-grid;place-items:center;flex:none;overflow:hidden;background:linear-gradient(135deg,#4F66E0,#7C5CE0);color:#fff;font-weight:700;box-shadow:0 0 0 2px var(--card)}
.acc-av img{width:100%;height:100%;object-fit:cover}
.acc-menu{position:absolute;right:0;top:calc(100% + 10px);z-index:60;width:min(320px,calc(100vw - 24px));background:var(--glass-strong);-webkit-backdrop-filter:blur(24px);backdrop-filter:blur(24px);border:1px solid var(--line,rgba(120,130,160,.3));border-radius:18px;padding:16px;box-shadow:0 24px 60px -18px rgba(20,30,70,.45);color:var(--text)}
.acc-who{display:flex;gap:12px;align-items:center;margin-bottom:10px}
.acc-who b{display:block;font-size:15px}
.acc-who small{display:block;color:var(--slate2);font-size:13px;max-width:210px;overflow:hidden;text-overflow:ellipsis;white-space:nowrap}
.acc-note{margin:0 0 12px;color:var(--slate);font-size:13.5px;line-height:1.45}
.acc-row{display:flex;gap:8px;flex-wrap:wrap}.acc-row a{text-decoration:none}
.guest-card{position:fixed;left:50%;bottom:max(20px,env(safe-area-inset-bottom));transform:translateX(-50%);z-index:90;width:min(460px,calc(100% - 32px));background:var(--glass-strong);-webkit-backdrop-filter:blur(24px);backdrop-filter:blur(24px);border:1px solid var(--line,rgba(120,130,160,.3));border-radius:22px;padding:20px;box-shadow:0 28px 70px -20px rgba(20,30,70,.5);color:var(--text);animation:gcin .45s cubic-bezier(.22,1,.36,1)}
@keyframes gcin{from{opacity:0;transform:translate(-50%,16px)}}
.guest-card b{font-size:18px}
.guest-card p{margin:6px 0 14px;color:var(--slate);font-size:14.5px;line-height:1.5}
.guest-row{display:flex;gap:10px;align-items:center}
.guest-go{flex:1;justify-content:center}
.guest-pill{position:fixed;left:max(16px,env(safe-area-inset-left));bottom:max(18px,env(safe-area-inset-bottom));z-index:80;display:inline-flex;align-items:center;gap:8px;border-radius:999px;padding:10px 16px;background:var(--glass-strong);-webkit-backdrop-filter:blur(24px);backdrop-filter:blur(24px);border:1px solid var(--line,rgba(120,130,160,.3));color:var(--text);font-weight:700;font-size:14px;cursor:pointer;box-shadow:0 12px 30px -12px rgba(20,30,70,.4)}
.guest-pill i{width:8px;height:8px;border-radius:50%;background:var(--gold)}
body:has(.guest-card) .hvai-fab{opacity:0;pointer-events:none}
body:has(.guest-card) .toast{bottom:calc(230px + env(safe-area-inset-bottom,0px))}
@media (max-width:560px){.acc-signin .acc-lbl{display:none}.acc-signin{padding:4px}}
.theme-toggle{border:1px solid var(--line)!important;border-radius:9px!important;width:34px;height:34px}
.content{padding:24px 26px 60px;width:100%}

/* Page head */
.page-head{display:flex;align-items:flex-start;justify-content:space-between;gap:16px;margin-bottom:18px}
.page-head h1{font-size:21px;font-weight:700;letter-spacing:-.3px}
.page-sub{color:var(--slate2);font-size:13px;margin-top:3px}

/* Buttons */
.btn{display:inline-flex;align-items:center;gap:6px;border-radius:9px;font-size:13px;font-weight:600;
  padding:8px 14px;border:1px solid transparent;transition:all .15s;text-decoration:none}
.btn-primary{background:var(--accent);color:#fff}
.btn-primary:hover{background:var(--accent-deep)}
.btn-primary:disabled{opacity:.45;cursor:not-allowed}
.btn-ghost{background:var(--card);color:var(--slate);border-color:var(--line)}
.btn-ghost:hover{color:var(--text);background:var(--hover)}
.btn-good{background:var(--green);color:#fff}
.btn-good:hover{filter:brightness(1.06)}
.btn-danger{background:var(--red);color:#fff}
.btn-sm{padding:5px 10px;font-size:12px;border-radius:7px}
.btn-row{display:flex;gap:8px;flex-wrap:wrap}
.icon-btn{background:none;border:0;color:var(--slate2);padding:6px;border-radius:7px;display:inline-flex;transition:all .15s}
.icon-btn:hover{background:var(--hover);color:var(--text)}
.icon-btn.danger:hover{color:var(--red);background:color-mix(in srgb,var(--red) 12%,transparent)}
.text-link{background:none;border:0;color:var(--accent);font-size:13px;font-weight:600;padding:6px 0;text-decoration:none}
.text-link:hover{text-decoration:underline}

/* Badges/chips */
.badge{display:inline-flex;align-items:center;font-size:11px;font-weight:600;border-radius:999px;
  padding:2.5px 9px;white-space:nowrap;letter-spacing:.1px}
.tagchip{display:inline-flex;align-items:center;gap:4px;font-size:11px;background:var(--hover);
  color:var(--slate);border-radius:6px;padding:2.5px 7px;border:1px solid var(--line)}
.tag-row{display:flex;gap:5px;flex-wrap:wrap;margin-top:8px}
.count-pill{display:inline-flex;background:var(--hover);border:1px solid var(--line);color:var(--slate);
  font-size:11px;font-weight:600;border-radius:999px;padding:1px 8px;vertical-align:2px;margin-left:6px}

/* Action Center */
.action-center{background:var(--card);border:1px solid var(--line);border-radius:16px;box-shadow:var(--shadow);
  padding:16px 18px;margin-bottom:20px;position:relative;overflow:hidden}
.action-center:before{content:"";position:absolute;inset:0 auto 0 0;width:4px;
  background:linear-gradient(180deg,var(--accent),var(--lav))}
.ac-head{display:flex;align-items:center;justify-content:space-between;margin-bottom:10px}
.ac-title{display:flex;align-items:center;gap:7px;font-family:'Sora';font-weight:700;font-size:15px}
.ac-count{font-size:12px;color:var(--slate2);font-weight:600}
.ac-clear{color:var(--slate);font-size:13.5px}
.ac-list{display:flex;flex-direction:column;gap:8px}
.ac-item{display:flex;gap:12px;align-items:flex-start;justify-content:space-between;flex-wrap:wrap;
  border:1px solid var(--line2);border-radius:12px;padding:11px 13px;background:var(--bg)}
.ac-item.tone-late{border-left:3px solid var(--red)}
.ac-item.tone-warn{border-left:3px solid var(--amber)}
.ac-item.tone-info{border-left:3px solid var(--accent)}
.ac-item.tone-good{border-left:3px solid var(--green)}
.ac-main{flex:1;min-width:230px}
.ac-row1{display:flex;align-items:center;gap:8px;flex-wrap:wrap;font-size:13.5px}
.ac-jobtitle{color:var(--slate)}
.ac-reason{font-size:12.5px;color:var(--slate2);margin-top:2px}
.ac-suggest{display:flex;align-items:center;gap:4px;font-size:13px;font-weight:600;color:var(--accent);margin-top:4px}
.tone-late .ac-suggest{color:var(--red)} .tone-warn .ac-suggest{color:var(--amber)} .tone-good .ac-suggest{color:var(--green)}
.ac-btns{display:flex;gap:6px;flex-wrap:wrap;align-items:center}

/* Stats */
.stat-grid{display:grid;grid-template-columns:repeat(auto-fill,minmax(128px,1fr));gap:10px;margin-bottom:14px}
.stat{background:var(--card);border:1px solid var(--line);border-radius:13px;padding:13px 8px 11px;
  display:flex;flex-direction:column;align-items:center;gap:2px;box-shadow:var(--shadow);transition:all .15s}
.stat:not(:disabled):hover{transform:translateY(-1.5px);box-shadow:var(--shadow-lg);border-color:var(--accent)}
.stat:disabled{cursor:default}
.stat-value{font-size:21px;font-weight:700;letter-spacing:-.4px}
.stat-label{font-size:11px;color:var(--slate);font-weight:600;text-transform:uppercase;letter-spacing:.4px;text-align:center}
.stat-accent .stat-value{color:var(--accent)}
.stat-good .stat-value{color:var(--green)}
.stat-bad .stat-value{color:var(--red)}
.dash-strip{display:flex;gap:10px;flex-wrap:wrap;margin-bottom:14px}
.strip-item{display:flex;align-items:center;gap:8px;background:var(--card);border:1px solid var(--line);
  border-radius:11px;padding:9px 13px;font-size:12.5px;color:var(--slate);box-shadow:var(--shadow)}
.strip-item svg{color:var(--amber);flex-shrink:0}
.quick-actions{display:flex;gap:8px;flex-wrap:wrap;margin-bottom:18px}

/* Cards & layout */
.card{background:var(--card);border:1px solid var(--line);border-radius:15px;padding:16px 18px;
  margin-bottom:14px;box-shadow:var(--shadow)}
.card-title{font-size:13.5px;font-weight:700;margin-bottom:10px;letter-spacing:-.1px}
.card-title-row{display:flex;align-items:center;justify-content:space-between;margin-bottom:8px;gap:10px}
.card-title-row .card-title{margin-bottom:0}
.dash-cols{display:grid;grid-template-columns:1fr 1fr;gap:14px}
.dash-cols.two{grid-template-columns:1fr 1fr}
.two-col{display:grid;grid-template-columns:1fr 1fr;gap:14px}
@media(max-width:980px){.dash-cols,.two-col{grid-template-columns:1fr}}

/* Filters, inputs */
.filter-bar{display:flex;gap:8px;flex-wrap:wrap;margin-bottom:14px}
.input{background:var(--card);border:1px solid var(--line);border-radius:9px;padding:8px 11px;
  font-size:13.5px;color:var(--text);font-family:inherit;transition:border .15s}
.input:focus{outline:none;border-color:var(--accent)}
.input::placeholder{color:var(--slate2);opacity:1}
.input.grow{flex:1;min-width:190px}
select.input{cursor:pointer}
textarea.input{resize:vertical}
.form-grid{display:grid;grid-template-columns:1fr 1fr;gap:12px}
@media(max-width:640px){.form-grid{grid-template-columns:1fr}}
.field{display:flex;flex-direction:column;gap:5px}
.field-span{grid-column:1/-1}
.field-label{font-size:11.5px;font-weight:600;color:var(--slate);text-transform:uppercase;letter-spacing:.4px}

/* Tables */
.table-card{background:var(--card);border:1px solid var(--line);border-radius:15px;overflow-x:auto;box-shadow:var(--shadow)}
table{width:100%;border-collapse:collapse;font-size:13.5px}
th{Text-align:left;font-size:11px;text-transform:uppercase;letter-spacing:.5px;color:var(--slate2);
  padding:11px 14px;border-bottom:1px solid var(--line);white-space:nowrap;text-align:left}
td{padding:10.5px 14px;border-bottom:1px solid var(--line2);vertical-align:middle}
tr:last-child td{border-bottom:0}
tr:hover td{background:var(--hover)}
.link-cell{background:none;border:0;color:var(--text);font-weight:600;font-size:13.5px;padding:0;text-align:left}
.link-cell:hover{color:var(--accent)}
.ext{color:var(--slate2);margin-left:6px;vertical-align:middle}
.row-actions{white-space:nowrap;text-align:right}
.na-inline{display:inline-flex;align-items:center;gap:5px;font-size:12px;font-weight:600;color:var(--slate)}
.na-inline.tone-late{color:var(--red)} .na-inline.tone-warn{color:var(--amber)}
.na-inline.tone-info{color:var(--accent)} .na-inline.tone-good{color:var(--green)}

/* Kanban */
.kanban{display:flex;gap:13px;overflow-x:auto;overflow-y:hidden;align-items:stretch;
  height:calc(100vh - 215px);min-height:430px;padding:2px 2px 14px;scrollbar-width:thin}
.kanban::-webkit-scrollbar{height:11px}
.kanban::-webkit-scrollbar-track{background:var(--scroll-track);border-radius:8px}
.kanban::-webkit-scrollbar-thumb{background:var(--scroll-thumb);border-radius:8px;border:2px solid transparent;background-clip:padding-box}
.kanban::-webkit-scrollbar-thumb:hover{background:var(--scroll-thumb-hover);background-clip:padding-box}
.kanban-col{min-width:252px;width:252px;background:var(--sidebar-bg);border:1px solid var(--line);
  border-radius:14px;flex-shrink:0;display:flex;flex-direction:column;
  transition:border-color .15s,box-shadow .15s,background .15s}
.kanban-col.over{border-color:var(--accent);background:color-mix(in srgb,var(--accent) 7%,var(--sidebar-bg));
  box-shadow:0 0 0 2px color-mix(in srgb,var(--accent) 30%,transparent)}
.kanban-head{display:flex;justify-content:space-between;align-items:center;padding:10px 13px;font-size:11.5px;
  font-weight:700;text-transform:uppercase;letter-spacing:.5px;color:var(--slate);
  border-top:3px solid;border-radius:14px 14px 0 0;flex-shrink:0}
.kanban-count{color:var(--slate2);background:var(--hover);border-radius:999px;padding:1px 8px;font-size:10.5px}
.kanban-cards{padding:8px;display:flex;flex-direction:column;gap:8px;flex:1;overflow-y:auto;min-height:60px}
.kanban-cards::-webkit-scrollbar{width:7px}
.kanban-cards::-webkit-scrollbar-track{background:transparent}
.kanban-cards::-webkit-scrollbar-thumb{background:var(--scroll-thumb);border-radius:6px}
.kcard{background:var(--card);border:1px solid var(--line);border-radius:12px;padding:11px 12px;cursor:grab;
  box-shadow:var(--shadow);transition:all .15s}
.kcard:hover{border-color:var(--accent);transform:translateY(-2px);box-shadow:var(--shadow-lg)}
.kcard:active{cursor:grabbing}
.kcard.dragging{opacity:.45;transform:rotate(1.5deg) scale(.98);border-style:dashed;border-color:var(--accent)}
.kcard{-webkit-touch-callout:none;-webkit-user-select:none;user-select:none}
.kcard.touch-pending{transform:scale(.97);transition:transform .35s ease}
.kcard-ghost{position:fixed;z-index:9999;pointer-events:none;margin:0;opacity:.95;transform:rotate(2deg) scale(1.03);box-shadow:0 12px 30px rgba(20,30,50,.25)}
.kcard-title{font-weight:600;font-size:13px;line-height:1.35}
.kcard-company{font-size:12px;color:var(--slate2);margin-top:1px}
.kcard-meta{display:flex;gap:6px;align-items:center;margin-top:6px;flex-wrap:wrap;font-size:11.5px}
.kcard-na{display:flex;align-items:center;gap:4px;font-size:11px;font-weight:600;margin-top:6px}
.kcard-na.tone-late{color:var(--red)} .kcard-na.tone-warn{color:var(--amber)}
.kcard-na.tone-info{color:var(--accent)} .kcard-na.tone-good{color:var(--green)}
.kcard-dates{font-size:10.5px;color:var(--slate2);margin-top:5px}
.kanban-empty{border:1.5px dashed var(--line);border-radius:10px;padding:16px 10px;text-align:center;
  font-size:12px;color:var(--slate2);flex:1;display:flex;align-items:center;justify-content:center;
  transition:all .15s}
.kanban-col.over .kanban-empty{border-color:var(--accent);color:var(--accent);background:color-mix(in srgb,var(--accent) 6%,transparent)}
@media(max-width:900px){
  .kanban{height:auto;min-height:0;overflow-y:visible}
  .kanban-cards{max-height:340px}
}

/* Tabs */
.tabs{display:flex;gap:4px;border-bottom:1px solid var(--line);margin-bottom:16px;flex-wrap:wrap}
.tab{background:none;border:0;border-bottom:2px solid transparent;padding:8px 14px;font-size:13.5px;
  font-weight:600;color:var(--slate2);margin-bottom:-1px;transition:all .15s}
.tab:hover{color:var(--text)}
.tab.active{color:var(--accent);border-bottom-color:var(--accent)}

/* Follow-ups */
.fu-list{display:flex;flex-direction:column;gap:9px;margin-bottom:14px}
.fu-card{display:flex;justify-content:space-between;gap:14px;background:var(--card);border:1px solid var(--line);
  border-radius:13px;padding:13px 15px;box-shadow:var(--shadow);border-left-width:4px;flex-wrap:wrap}
.fu-card.edge-late{border-left-color:var(--red)}
.fu-card.edge-due{border-left-color:var(--amber)}
.fu-card.edge-sent{border-left-color:var(--green)}
.fu-card.edge-none{border-left-color:var(--line)}
.fu-main{flex:1;min-width:240px}
.fu-top{display:flex;align-items:center;gap:9px;flex-wrap:wrap}
.fu-type{font-size:11.5px;font-weight:700;color:var(--slate2);text-transform:uppercase;letter-spacing:.4px}
.fu-title{font-weight:600;font-size:13.5px;margin-top:5px}
.fu-next{display:flex;align-items:center;gap:4px;font-size:12.5px;color:var(--accent);font-weight:600;margin-top:4px}
.fu-draft{font-size:12.5px;color:var(--slate);background:var(--bg);border:1px solid var(--line2);
  border-radius:9px;padding:8px 10px;margin-top:7px;white-space:pre-wrap}
.fu-notes{font-size:12px;margin-top:5px;white-space:pre-wrap}
.fu-actions{display:flex;gap:6px;align-items:flex-start;flex-wrap:wrap}

/* Drawer */
.drawer-overlay{position:fixed;inset:0;background:rgba(23,28,38,.42);z-index:50;display:flex;justify-content:flex-end;
  backdrop-filter:blur(2px)}
.drawer{width:min(660px,94vw);background:var(--bg);height:100vh;overflow-y:auto;
  box-shadow:-14px 0 44px rgba(0,0,0,.16);animation:slideIn .22s ease}
@keyframes slideIn{from{transform:translateX(36px);opacity:0}to{transform:none;opacity:1}}
.drawer-head{display:flex;justify-content:space-between;gap:14px;padding:20px 22px 14px;background:var(--card);
  border-bottom:1px solid var(--line);position:sticky;top:0;z-index:5}
.drawer-eyebrow{font-size:11px;font-weight:700;text-transform:uppercase;letter-spacing:.8px;color:var(--accent)}
.drawer-head h2{font-size:19px;margin:3px 0 7px;letter-spacing:-.3px}
.drawer-meta{display:flex;gap:9px;align-items:center;flex-wrap:wrap;font-size:12.5px;color:var(--slate)}
.drawer-actions{display:flex;gap:8px;align-items:flex-start;flex-shrink:0}
.drawer-body{padding:16px 22px 44px}
.link-row{display:flex;gap:8px;flex-wrap:wrap;margin-bottom:14px}
.dl{display:grid;grid-template-columns:auto 1fr;gap:5px 14px;font-size:13px}
.dl dt{color:var(--slate2);font-weight:600}
.stage-row{display:flex;gap:6px;flex-wrap:wrap}
.stage-pill{border:1px solid var(--line);background:var(--card);color:var(--slate);border-radius:999px;
  font-size:11.5px;font-weight:600;padding:4.5px 11px;transition:all .15s}
.stage-pill:hover{border-color:var(--accent);color:var(--accent)}
.stage-pill.active{color:#fff}

/* Next best action box */
.nba{border-radius:13px;padding:13px 15px;margin-bottom:14px;border:1px solid var(--line);
  background:var(--card);border-left-width:4px;border-left-color:var(--accent)}
.nba.tone-late{border-left-color:var(--red)} .nba.tone-warn{border-left-color:var(--amber)}
.nba.tone-good{border-left-color:var(--green)}
.nba-label{display:flex;align-items:center;gap:6px;font-size:11px;font-weight:700;text-transform:uppercase;
  letter-spacing:.6px;color:var(--slate2)}
.nba-text{font-family:'Sora';font-weight:600;font-size:15px;margin-top:4px}
.nba-why{font-size:12.5px;color:var(--slate2);margin-top:2px}

/* Checklists, lists, timeline */
.check-grid{display:grid;grid-template-columns:1fr 1fr;gap:7px}
.check-grid.one{grid-template-columns:1fr}
@media(max-width:640px){.check-grid{grid-template-columns:1fr}}
.check-item{display:flex;gap:9px;align-items:flex-start;font-size:13px;cursor:pointer;color:var(--slate)}
.check-item input{accent-color:var(--green);margin-top:2.5px;cursor:pointer}
.check-item input:checked+span{text-decoration:line-through;color:var(--slate2)}
.timeline{list-style:none;display:flex;flex-direction:column;gap:7px}
.timeline li{display:flex;gap:13px;font-size:13px;align-items:baseline}
.mini-list{list-style:none;display:flex;flex-direction:column;gap:9px}
.mini-list li{display:flex;gap:10px;align-items:flex-start}
.mini-list svg{margin-top:2.5px;color:var(--slate2);flex-shrink:0}
.mini-title{font-weight:600;font-size:13px;display:flex;align-items:center;gap:7px;flex-wrap:wrap}
.mini-sub{font-size:12px;color:var(--slate2)}
.result-row{display:flex;align-items:center;gap:11px;width:100%;padding:9px 11px;background:none;border:0;
  border-radius:9px;text-align:left;transition:background .12s}
.result-row:hover{background:var(--hover)}
.result-main{font-weight:600;font-size:13.5px;color:var(--text)}
.result-sub{color:var(--slate2);font-size:12.5px;flex:1}

/* Resume vault */
.dropzone{display:flex;flex-direction:column;align-items:center;gap:7px;border:2px dashed var(--line);
  border-radius:16px;background:var(--card);padding:26px 18px;text-align:center;color:var(--slate);
  cursor:pointer;transition:all .18s;margin-bottom:16px}
.dropzone:hover,.dropzone.over{border-color:var(--accent);background:color-mix(in srgb,var(--accent) 6%,var(--card));color:var(--accent)}
.dropzone svg{color:var(--accent)}
.resume-grid{display:grid;grid-template-columns:repeat(auto-fill,minmax(310px,1fr));gap:12px;margin-bottom:14px}
.resume-card{background:var(--card);border:1px solid var(--line);border-radius:14px;padding:14px 15px;
  box-shadow:var(--shadow);display:flex;flex-direction:column;gap:8px}
.resume-card.master{border-color:color-mix(in srgb,var(--amber) 55%,var(--line))}
.resume-card-head{display:flex;gap:10px;align-items:flex-start}
.resume-icon{width:36px;height:36px;border-radius:10px;background:color-mix(in srgb,var(--accent) 13%,transparent);
  color:var(--accent);display:flex;align-items:center;justify-content:center;flex-shrink:0}
.resume-titlewrap{flex:1;min-width:0}
.resume-title{font-weight:700;font-size:14px;display:flex;align-items:center;gap:7px;flex-wrap:wrap}
.master-tag{display:inline-flex;align-items:center;gap:3px;font-size:10px;font-weight:700;color:var(--amber);
  background:color-mix(in srgb,var(--amber) 14%,transparent);border-radius:999px;padding:1.5px 7px;text-transform:uppercase;letter-spacing:.4px}
.resume-sub{font-size:12px}
.resume-usage{display:flex;gap:13px;flex-wrap:wrap;font-size:12px;color:var(--slate)}
.resume-usage strong{font-size:13px;color:var(--text)}
.resume-used{font-size:11.5px}
.resume-meta{font-size:11px}
.resume-actions{display:flex;gap:5px;flex-wrap:wrap;margin-top:2px}
.parsed-btn{align-self:flex-start;color:var(--lav);border-color:color-mix(in srgb,var(--lav) 40%,var(--line))}
.resume-attach{display:flex;flex-direction:column;gap:9px}
.resume-attach-row{display:flex;align-items:center;gap:8px;font-size:13px;flex-wrap:wrap}
.resume-attach-row svg{color:var(--accent)}
.verdict-row{display:flex;align-items:center;gap:8px;flex-wrap:wrap}
.chip-btn{border:1px solid var(--line);background:var(--card);color:var(--slate);border-radius:999px;
  font-size:12px;font-weight:600;padding:4.5px 11px;transition:all .15s}
.chip-btn:hover{border-color:var(--accent)}
.chip-btn.on.good{background:color-mix(in srgb,var(--green) 15%,transparent);border-color:var(--green);color:var(--green)}
.chip-btn.on.bad{background:color-mix(in srgb,var(--red) 13%,transparent);border-color:var(--red);color:var(--red)}
.best-banner{display:flex;gap:9px;align-items:center;background:color-mix(in srgb,var(--amber) 11%,var(--card));
  border:1px solid color-mix(in srgb,var(--amber) 40%,var(--line));border-radius:12px;padding:11px 14px;
  font-size:13px;margin-bottom:14px}
.best-banner svg{color:var(--amber);flex-shrink:0}
.master-section .master-title{font-weight:700;font-family:'Sora';flex:1}
.master-text{font-size:13px;line-height:1.6;width:100%}
.hint-strip{display:flex;gap:8px;align-items:center;font-size:13px;color:var(--slate);background:var(--card);
  border:1px dashed var(--line);border-radius:11px;padding:10px 13px;margin-bottom:13px}
.hint-strip svg{color:var(--lav);flex-shrink:0}

/* Templates */
.template-grid{display:grid;grid-template-columns:1fr 1fr;gap:12px}
@media(max-width:980px){.template-grid{grid-template-columns:1fr}}
.template{background:var(--card);border:1px solid var(--line);border-radius:14px;padding:13px 15px;box-shadow:var(--shadow)}
.template-head{display:flex;justify-content:space-between;gap:10px;align-items:flex-start;margin-bottom:9px}
.template-edit{width:100%;font-size:12.5px;line-height:1.55}

/* Guides */
.guide-card{padding-bottom:8px}
.acc{display:flex;flex-direction:column}
.acc-item{border-bottom:1px solid var(--line2)}
.acc-item:last-child{border-bottom:0}
.acc-head{display:flex;justify-content:space-between;align-items:center;gap:10px;width:100%;background:none;
  border:0;padding:11px 2px;font-size:13.5px;font-weight:600;color:var(--text);text-align:left}
.acc-head:hover{color:var(--accent)}
.acc-chev{color:var(--slate2);transition:transform .18s;flex-shrink:0}
.acc-item.open .acc-chev{transform:rotate(180deg)}
.acc-body{padding:2px 2px 13px;font-size:13px;color:var(--slate);line-height:1.65}

/* Analytics */
.funnel{display:flex;align-items:center;gap:9px;flex-wrap:wrap}
.funnel-step{display:flex;flex-direction:column;align-items:center;background:var(--bg);
  border:1px solid var(--line);border-radius:12px;padding:11px 17px;min-width:86px;position:relative}
.funnel-n{font-family:'Sora';font-size:19px;font-weight:700}
.funnel-label{font-size:11px;color:var(--slate2);font-weight:600;text-transform:uppercase;letter-spacing:.4px}
.funnel-pct{font-size:10.5px;color:var(--green);margin-top:2px}
.funnel-arrow{color:var(--slate2)}
.skill-list{list-style:none;display:flex;flex-direction:column;gap:7px}
.skill-list li{display:grid;grid-template-columns:150px 1fr auto;gap:11px;align-items:center;font-size:13px}
.skill-bar{height:7px;background:linear-gradient(90deg,var(--accent),var(--lav));border-radius:4px;min-width:5px}

/* Modals */
.modal-overlay{position:fixed;inset:0;background:rgba(23,28,38,.44);z-index:60;display:flex;
  align-items:center;justify-content:center;padding:18px;backdrop-filter:blur(2px)}
.modal{background:var(--bg);border-radius:17px;width:min(500px,94vw);max-height:88vh;display:flex;
  flex-direction:column;box-shadow:var(--shadow-lg);animation:pop .16s ease}
.modal-wide{width:min(690px,94vw)}
.modal-preview{width:min(860px,96vw);height:88vh}
@keyframes pop{from{transform:scale(.97);opacity:0}to{transform:none;opacity:1}}
.modal-head{display:flex;justify-content:space-between;align-items:center;padding:15px 19px;
  border-bottom:1px solid var(--line);background:var(--card);border-radius:17px 17px 0 0}
.modal-head h3{font-size:15.5px}
.modal-body{padding:17px 19px;overflow-y:auto}
.modal-foot{display:flex;justify-content:flex-end;gap:9px;margin-top:17px}
.preview-frame{flex:1;border:0;width:100%;border-radius:0 0 17px 17px;background:#fff}

/* Calendar */
.cal-toolbar{display:flex;align-items:center;justify-content:space-between;flex-wrap:wrap;gap:10px;margin-bottom:12px}
.cal-month{font-family:'Sora';font-weight:700;font-size:15px;margin-left:10px}
.cal-grid{display:grid;grid-template-columns:repeat(7,1fr)}
.cal-head-row{border-bottom:1px solid var(--line)}
.cal-headcell{padding:8px 10px;font-size:10.5px;font-weight:700;text-transform:uppercase;letter-spacing:.6px;color:var(--slate2);text-align:left}
.cal-cell{min-height:96px;border-right:1px solid var(--line2);border-bottom:1px solid var(--line2);padding:6px;cursor:pointer;transition:background .12s;display:flex;flex-direction:column;gap:3px;overflow:hidden}
.cal-cell:nth-child(7n){border-right:0}
.cal-cell:hover{background:var(--hover)}
.cal-cell.cal-out{background:var(--bg);opacity:.55}
.cal-cell.cal-today{background:color-mix(in srgb,var(--accent) 8%,var(--card))}
.cal-cell.cal-today .cal-daynum{color:#fff;background:var(--accent)}
.cal-daynum{font-size:11px;font-weight:700;color:var(--slate);width:20px;height:20px;border-radius:6px;display:flex;align-items:center;justify-content:center;flex-shrink:0}
.cal-chip{display:block;width:100%;text-align:left;font-size:10.5px;font-weight:600;color:var(--text);background:var(--bg);border:1px solid var(--line2);border-left:3px solid;border-radius:6px;padding:2.5px 6px;white-space:nowrap;overflow:hidden;text-overflow:ellipsis;transition:all .12s}
.cal-chip:hover{border-color:var(--accent)}
.cal-chip.done{opacity:.55;text-decoration:line-through}
.cal-chip.missed{background:color-mix(in srgb,var(--red) 10%,var(--bg))}
.cal-chip.cancelled{opacity:.4;text-decoration:line-through}
.cal-more{font-size:10px;padding-left:4px}
.week-grid{display:grid;grid-template-columns:repeat(7,1fr);gap:8px}
@media(max-width:980px){.week-grid{grid-template-columns:1fr 1fr}}
.week-col{background:var(--card);border:1px solid var(--line);border-radius:12px;padding:8px;min-height:140px;display:flex;flex-direction:column;gap:5px;box-shadow:var(--shadow);cursor:pointer}
.week-col.cal-today{border-color:var(--accent)}
.week-head{font-size:11px;font-weight:700;color:var(--slate);text-transform:uppercase;letter-spacing:.4px;margin-bottom:2px}
.agenda-day{padding:12px 16px}
.agenda-date{font-family:'Sora';font-weight:700;font-size:13.5px;margin-bottom:8px;display:flex;align-items:center;gap:8px}
.agenda-row{display:flex;align-items:center;gap:10px;padding:6px 0;border-top:1px solid var(--line2);flex-wrap:wrap}
.agenda-right{margin-left:auto;display:flex;gap:6px;align-items:center}

/* Analytics */
.afilters{padding-bottom:12px}
.insight-grid{display:grid;grid-template-columns:1fr 1fr;gap:8px}
@media(max-width:900px){.insight-grid{grid-template-columns:1fr}}
.insight{display:flex;gap:8px;align-items:flex-start;background:var(--bg);border:1px solid var(--line2);border-radius:10px;padding:9px 12px;font-size:12.5px;color:var(--slate)}
.insight svg{color:var(--amber);flex-shrink:0;margin-top:2px}
.insight span strong{color:var(--text)}
.chart-toggle{float:right;display:inline-flex;gap:4px}
.chart-toggle .chip-btn{padding:2px 9px;font-size:10.5px}

/* Profile page + autofill */
.profile-head{display:flex;gap:16px;align-items:flex-start}
.profile-avatar{width:62px;height:62px;border-radius:18px;background:linear-gradient(135deg,var(--accent),var(--lav));
  color:#fff;display:flex;align-items:center;justify-content:center;font-family:'Sora';font-weight:700;font-size:21px;flex-shrink:0}
.profile-chips{display:flex;gap:6px;flex-wrap:wrap;margin-top:8px}
.exp-row{display:grid;grid-template-columns:1fr 1fr 1.2fr auto;gap:8px;margin-bottom:8px;align-items:center}
@media(max-width:640px){.exp-row{grid-template-columns:1fr}}
.autofill-btn{background:linear-gradient(135deg,var(--accent),var(--lav));color:#fff;margin-bottom:14px;width:100%;justify-content:center}
.autofill-btn:hover{filter:brightness(1.07)}

/* Release notes / what's new */
.release-notes{background:var(--bg);border:1px solid var(--line2);border-radius:12px;padding:12px 16px;margin:10px 0;max-width:560px}
.release-notes-title{display:flex;align-items:center;gap:6px;font-weight:700;font-size:12.5px;color:var(--accent);margin-bottom:8px;letter-spacing:.2px}
.release-notes ul{margin:0;padding:0;list-style:none}
.release-notes li{position:relative;padding-left:20px;margin-bottom:6px;font-size:13px;color:var(--slate);line-height:1.5}
.release-notes li::before{content:"";position:absolute;left:4px;top:8px;width:6px;height:6px;border-radius:50%;background:var(--amber)}
.release-notes li:last-child{margin-bottom:0}

/* Update progress bar */
.update-bar{height:9px;background:var(--hover);border:1px solid var(--line);border-radius:999px;overflow:hidden;max-width:420px}
.update-bar-fill{height:100%;background:linear-gradient(90deg,var(--accent),var(--green));border-radius:999px;transition:width .25s ease}

/* Setup wizard */
.setup-options{display:grid;grid-template-columns:1fr;gap:10px;margin:6px 0 14px}
.setup-opt{display:flex;flex-direction:column;align-items:flex-start;gap:3px;text-align:left;
  background:var(--bg);border:1px solid var(--line);border-radius:13px;padding:13px 15px;transition:all .15s}
.setup-opt:hover{border-color:var(--accent);transform:translateY(-1px)}
.setup-opt strong{font-size:14px;color:var(--text)}
.setup-opt span{font-size:12.5px;color:var(--slate2)}
.setup-opt svg{color:var(--accent)}
.test-msg{font-size:13px;margin-top:10px;font-weight:600}
.test-msg.ok{color:var(--green)} .test-msg.bad{color:var(--red)}

/* Empty, toast, misc */
.empty{display:flex;flex-direction:column;align-items:center;gap:7px;padding:44px 18px;text-align:center;
  background:var(--card);border:1.5px dashed var(--line);border-radius:16px}
.empty-icon{width:46px;height:46px;border-radius:14px;background:var(--hover);color:var(--slate2);
  display:flex;align-items:center;justify-content:center}
.empty-title{font-weight:700;font-family:'Sora';font-size:14.5px}
.empty-hint{color:var(--slate2);font-size:13px;max-width:400px}
.toast{position:fixed;bottom:22px;left:50%;transform:translateX(-50%);background:#16202E;color:#fff;max-width:calc(100vw - 32px);
  border-radius:11px;padding:10px 17px;font-size:13px;font-weight:600;display:flex;gap:8px;align-items:center;
  box-shadow:var(--shadow-lg);z-index:100;animation:toastIn .2s ease}
@keyframes toastIn{from{transform:translate(-50%,10px);opacity:0}to{transform:translate(-50%,0);opacity:1}}
.toast svg{color:#6FD6A0;flex:none}
.app[data-theme="dark"] .toast{background:#EEF1F7;color:#16202E}   /* solid colours: the theme's --bg is see-through */
.app[data-theme="dark"] .toast svg{color:#2E9A63}
.set-wrap{max-width:780px}
.set-group{margin-bottom:22px}
.set-group-title{font-size:12px;font-weight:700;letter-spacing:.08em;text-transform:uppercase;color:var(--slate2);margin:0 0 8px 8px}
.card.set-list{padding:0;margin-bottom:0;overflow:hidden;border-radius:20px}
.set-row{display:flex;align-items:center;gap:14px;padding:14px 18px;min-height:62px}
.set-row+.set-row,.set-detail+.set-row,.set-row+.set-detail{border-top:1px solid var(--line)}
.set-ic{width:34px;height:34px;border-radius:11px;display:grid;place-items:center;flex:none;background:color-mix(in srgb,var(--accent) 12%,transparent);color:var(--accent)}
.set-text{flex:1;min-width:0}
.set-title{font-weight:700;overflow-wrap:anywhere}
.set-sub{font-size:13px;color:var(--slate2);margin-top:2px}
.set-right{display:flex;gap:8px;align-items:center;flex-wrap:wrap;justify-content:flex-end}
.set-num{width:84px;text-align:center}
.set-sel{width:auto;min-width:150px}
.set-detail{padding:4px 18px 12px 66px;max-height:420px;overflow:auto}
.set-group.danger .set-ic{background:color-mix(in srgb,var(--red) 12%,transparent);color:var(--red)}
.set-group.danger .set-list{border-color:color-mix(in srgb,var(--red) 30%,var(--line))}
@media(max-width:640px){.set-row{flex-wrap:wrap}.set-right{width:100%;justify-content:flex-start;padding-left:48px}.set-detail{padding-left:18px}}
.danger-card{border-color:color-mix(in srgb,var(--red) 35%,var(--line))}
.loading-screen{display:flex;flex-direction:column;gap:13px;align-items:center;justify-content:center;
  width:100%;min-height:100vh;color:var(--slate2);font-size:14px}
.loading-mark{display:flex;align-items:center;justify-content:center;animation:pulse 1.2s ease infinite}
.loading-mark svg{border-radius:15px;box-shadow:var(--shadow-lg)}
@keyframes pulse{0%,100%{opacity:1}50%{opacity:.55}}

/* ================= Sunrise glass theme ================= */
.app{background:transparent;font-family:'Atkinson Hyperlegible','Inter',system-ui,sans-serif}
h1,h2,h3,.brand-name,.stat-value,.ac-title,.card-title{font-family:'Sora','Inter',system-ui,sans-serif}
.main,.loading-screen{position:relative}
.sidebar,.main,.loading-screen{z-index:1}
::selection{background:var(--accent);color:#fff}

/* sky */
.hv-sky{position:fixed;inset:0;z-index:0;pointer-events:none;overflow:hidden;
  background:linear-gradient(180deg,var(--sky1) 0%,var(--sky2) 56%,var(--sky3) 100%)}
.hv-sky i{position:absolute;display:block;border-radius:50%;will-change:transform}
.hv-sky .o1{width:72%;aspect-ratio:1;left:-22%;top:-38%;opacity:.8;background:radial-gradient(circle,var(--orb1) 0%,transparent 68%);animation:hvDrift1 80s ease-in-out infinite alternate}
.hv-sky .o2{width:58%;aspect-ratio:1;right:-16%;bottom:-34%;opacity:.78;background:radial-gradient(circle,var(--orb2) 0%,transparent 68%);animation:hvDrift2 95s ease-in-out infinite alternate}
.hv-sky .o3{width:40%;aspect-ratio:1;left:42%;top:22%;opacity:.45;background:radial-gradient(circle,var(--orb3) 0%,transparent 68%);animation:hvDrift3 120s ease-in-out infinite alternate}
.hv-sky .horizon{left:-15%;right:-15%;bottom:-22%;height:46%;background:radial-gradient(ellipse at 50% 100%,var(--horizon) 0%,transparent 70%)}
.hv-sky .stars{inset:0;border-radius:0;opacity:calc(var(--stars) * .55);background-image:
  radial-gradient(1px 1px at 12% 18%,#fff 50%,transparent 51%),radial-gradient(1px 1px at 28% 8%,#fff 50%,transparent 51%),
  radial-gradient(1.2px 1.2px at 44% 22%,#fff 50%,transparent 51%),radial-gradient(1px 1px at 63% 12%,#fff 50%,transparent 51%),
  radial-gradient(1px 1px at 78% 26%,#fff 50%,transparent 51%),radial-gradient(1.3px 1.3px at 89% 9%,#fff 50%,transparent 51%),
  radial-gradient(1px 1px at 7% 36%,#fff 50%,transparent 51%),radial-gradient(1px 1px at 55% 34%,#fff 50%,transparent 51%),
  radial-gradient(1px 1px at 35% 44%,#fff 50%,transparent 51%),radial-gradient(1px 1px at 94% 40%,#fff 50%,transparent 51%),
  radial-gradient(1px 1px at 20% 60%,#fff 50%,transparent 51%),radial-gradient(1.2px 1.2px at 70% 52%,#fff 50%,transparent 51%);
  animation:hvTwinkle 9s ease-in-out infinite alternate}
@keyframes hvDrift1{to{transform:translate3d(12%,10%,0) scale(1.1)}}
@keyframes hvDrift2{to{transform:translate3d(-10%,-8%,0) scale(1.08)}}
@keyframes hvDrift3{to{transform:translate3d(-18%,12%,0) scale(.9)}}
@keyframes hvTwinkle{from{opacity:calc(var(--stars) * .3)}to{opacity:calc(var(--stars) * .6)}}

/* glass surfaces */
.sidebar,.topbar,.action-center,.card,.table-card,.kanban-col,.stat,.strip-item,.fu-card,.resume-card,.template,.hint-strip,.week-col,.btn-ghost,.chip-btn,.stage-pill{
  -webkit-backdrop-filter:blur(26px) saturate(165%);backdrop-filter:blur(26px) saturate(165%);
  background-image:linear-gradient(140deg,rgba(255,255,255,.16) 0%,transparent 36%,transparent 74%,rgba(255,255,255,.05) 100%)}
.action-center,.card,.table-card,.kanban-col,.stat,.strip-item,.fu-card,.resume-card,.template,.hint-strip,.week-col,.kcard{
  border-color:var(--glass-border);box-shadow:var(--shadow),inset 0 1px 0 var(--glass-hi)}
.sidebar{border-right:1px solid var(--glass-border)}
.topbar{background:var(--sidebar-bg);border-bottom:1px solid var(--glass-border)}
.card,.action-center,.table-card{border-radius:24px}
.card{padding:22px 24px}
.action-center{padding:22px 24px;margin-bottom:28px}
.action-center:before{width:4px;background:linear-gradient(180deg,var(--accent),var(--lav) 55%,var(--gold))}
.card-title{font-size:15.5px;font-weight:600;letter-spacing:-.01em;margin-bottom:14px}
.ac-title{font-weight:600;font-size:18px}
.kanban-col{border-radius:22px}
.kcard{border-radius:16px;padding:13px 14px;transition:transform .35s cubic-bezier(.22,1,.36,1),box-shadow .35s}
.kcard:hover{transform:translateY(-2px);box-shadow:var(--shadow-lg),inset 0 1px 0 var(--glass-hi)}
.kcard-ghost{background:var(--glass-strong)}
.table-card th{background:transparent}

/* big, airy layout */
.content{padding:38px 46px 96px;max-width:1520px;margin:0 auto}
.page-head{margin-bottom:28px;align-items:flex-end}
.page-head h1{font-family:'Sora',sans-serif;font-weight:300;font-size:clamp(28px,2.6vw,40px);letter-spacing:-.025em;line-height:1.12}
.page-sub{font-size:15.5px;color:var(--slate);margin-top:8px;max-width:880px}
.stat-grid{grid-template-columns:repeat(auto-fill,minmax(152px,1fr));gap:14px;margin-bottom:22px}
.stat{border-radius:22px;padding:22px 12px 18px;gap:8px;transition:transform .35s cubic-bezier(.22,1,.36,1),box-shadow .35s}
.stat:not(:disabled):hover{transform:translateY(-3px);box-shadow:var(--shadow-lg),inset 0 1px 0 var(--glass-hi)}
.stat-value{font-weight:200;font-size:42px;letter-spacing:-.03em;line-height:1}
.stat-label{font-size:11px;letter-spacing:.13em;color:var(--slate2);font-weight:700}
.stat,.stat:disabled{color:var(--text);cursor:default}
.stat:not(:disabled){cursor:pointer}
.btn{white-space:nowrap}

/* brand + nav */
.sidebar{width:236px}
.brand{padding:26px 20px 20px}
.brand-name{font-weight:600;font-size:17px;letter-spacing:-.01em}
.brand-mark svg{border-radius:13px;box-shadow:0 10px 24px -10px rgba(40,50,90,.55)}
.nav-item{border-radius:999px;padding:10px 15px;font-size:14.5px;margin-bottom:3px;transition:background .25s,color .25s,transform .3s cubic-bezier(.22,1,.36,1)}
.nav-item:hover{transform:translateX(2px)}
.nav-item.active,.app[data-theme="dark"] .nav-item.active{background:var(--grad);color:#fff;box-shadow:0 10px 24px -10px rgba(79,102,224,.8),inset 0 1px 0 rgba(255,255,255,.25)}

/* controls */
.btn{border-radius:999px;font-size:13.5px;padding:9px 18px;transition:transform .3s cubic-bezier(.22,1,.36,1),box-shadow .3s,background .25s,color .2s}
.btn-sm{border-radius:999px;padding:6px 13px}
.btn-primary{background:var(--grad);color:#fff;box-shadow:0 10px 24px -10px rgba(79,102,224,.8),inset 0 1px 0 rgba(255,255,255,.25)}
.btn-primary:hover:not(:disabled){background:linear-gradient(135deg,#5A71EA 0%,#8A6BEA 100%);transform:translateY(-1px);box-shadow:0 14px 30px -10px rgba(79,102,224,.9),inset 0 1px 0 rgba(255,255,255,.3)}
.btn-ghost{background-color:var(--card);border-color:var(--glass-border);color:var(--text)}
.btn-ghost:hover{background-color:var(--hover);transform:translateY(-1px)}
.icon-btn{border-radius:999px}
.theme-toggle{border-radius:999px!important;border-color:var(--glass-border)!important;background:var(--card)!important;width:38px;height:38px}
.searchwrap{background:var(--field);border-color:var(--glass-border);border-radius:999px;padding:9px 16px}
.input{background:var(--field);border-radius:12px;padding:9px 12px}
.input:focus{border-color:var(--accent);box-shadow:0 0 0 4px color-mix(in srgb,var(--accent) 18%,transparent)}
.app[data-theme="dark"] select.input option{background:#141A30;color:#EEF1F7}
.tagchip,.count-pill,.kanban-count{background:var(--hover)}

/* overlays */
.modal-overlay,.drawer-overlay{background:var(--overlay);-webkit-backdrop-filter:blur(6px);backdrop-filter:blur(6px)}
.modal{background:var(--glass-strong);border:1px solid var(--glass-border);border-radius:26px;box-shadow:var(--shadow-lg),inset 0 1px 0 var(--glass-hi);
  -webkit-backdrop-filter:blur(30px) saturate(165%);backdrop-filter:blur(30px) saturate(165%)}
.drawer{background:var(--glass-strong);border-left:1px solid var(--glass-border);-webkit-backdrop-filter:blur(30px) saturate(165%);backdrop-filter:blur(30px) saturate(165%)}
.drawer-head{background:transparent}
.recharts-default-tooltip{background:var(--glass-strong)!important;border:1px solid var(--glass-border)!important;border-radius:14px!important;-webkit-backdrop-filter:blur(16px);backdrop-filter:blur(16px)}

/* dashboard hero */
.hero{margin:6px 0 34px}
.hero-date{font-size:13px;letter-spacing:.16em;text-transform:uppercase;color:var(--slate2);font-weight:700;margin-bottom:12px}
.hero h1{font-family:'Sora',sans-serif;font-weight:200;font-size:clamp(38px,4.8vw,66px);line-height:1.04;letter-spacing:-.035em}
.hero h1 b{font-weight:500;background:linear-gradient(120deg,var(--accent) 0%,var(--lav) 55%,var(--gold) 100%);-webkit-background-clip:text;background-clip:text;color:transparent}
.hero-sub{font-size:16.5px;color:var(--slate);margin-top:14px}
.hero-quote{font-family:'Sora',sans-serif;font-weight:300;font-size:clamp(16px,1.35vw,20px);color:var(--text);opacity:.82;margin-top:16px;min-height:1.5em;transition:opacity .9s ease,filter .9s ease}
.hero-quote.fade{opacity:0;filter:blur(4px)}
.hero-chips{display:flex;gap:10px;flex-wrap:wrap;margin-top:22px}
.hero-chip{display:inline-flex;align-items:center;gap:8px;padding:9px 17px;border-radius:999px;font-size:14px;color:var(--slate);
  background:var(--card);border:1px solid var(--glass-border);box-shadow:inset 0 1px 0 var(--glass-hi);
  -webkit-backdrop-filter:blur(20px) saturate(150%);backdrop-filter:blur(20px) saturate(150%)}
.hero-chip strong{font-family:'Sora',sans-serif;font-weight:500;font-size:15px;color:var(--text)}
.hero-chip.gold strong{color:var(--gold)}
.hero-chip svg{color:var(--accent)}
.hero-chip.gold svg{color:var(--gold)}

.loading-screen{color:var(--slate);font-family:'Sora',sans-serif;font-weight:300;font-size:16px}

/* profile setup */
.ps{position:fixed;inset:0;z-index:80;display:grid;place-items:center;padding:28px 16px;overflow-y:auto;
  background:linear-gradient(180deg,color-mix(in srgb,var(--sky1) 72%,transparent),color-mix(in srgb,var(--sky3) 72%,transparent));
  -webkit-backdrop-filter:blur(22px) saturate(150%);backdrop-filter:blur(22px) saturate(150%)}
.ps-hair{position:fixed;top:0;left:0;right:0;height:3px;background:rgba(255,255,255,.12);z-index:81}
.ps-hair i{display:block;height:100%;transform-origin:left;background:linear-gradient(90deg,var(--accent),var(--lav),var(--gold));transition:transform .8s cubic-bezier(.22,1,.36,1)}
.ps-card{width:min(660px,100%);background:var(--glass-strong);border:1px solid var(--glass-border);border-radius:32px;padding:44px 42px 34px;
  box-shadow:var(--shadow-lg),inset 0 1px 0 var(--glass-hi);animation:psIn .55s cubic-bezier(.22,1,.36,1) both}
@keyframes psIn{from{opacity:0;transform:translateY(14px) scale(.985);filter:blur(4px)}to{opacity:1;transform:none;filter:none}}
.ps-eyebrow{font-size:12.5px;letter-spacing:.16em;text-transform:uppercase;color:var(--slate2);font-weight:700;margin-bottom:12px}
.ps-q{font-family:'Sora',sans-serif;font-weight:300;font-size:clamp(26px,3.4vw,40px);line-height:1.12;letter-spacing:-.025em;color:var(--text)}
.ps-sub{color:var(--slate);font-size:16px;margin-top:12px}
.ps-note{color:var(--amber);font-size:13.5px;margin-top:10px}
.ps-options{display:grid;grid-template-columns:1fr 1fr;gap:14px;margin:28px 0 18px}
.ps-opt{display:flex;flex-direction:column;align-items:flex-start;gap:8px;text-align:left;padding:22px 20px;border-radius:22px;border:1px solid var(--glass-border);
  background:var(--card);color:var(--text);box-shadow:var(--shadow),inset 0 1px 0 var(--glass-hi);transition:transform .35s cubic-bezier(.22,1,.36,1),box-shadow .35s,border-color .25s}
.ps-opt:hover{transform:translateY(-3px);border-color:color-mix(in srgb,var(--accent) 45%,var(--glass-border));box-shadow:var(--shadow-lg),inset 0 1px 0 var(--glass-hi)}
.ps-opt strong{font-family:'Sora',sans-serif;font-weight:500;font-size:17px}
.ps-opt span:last-child{color:var(--slate);font-size:14px;line-height:1.45}
.ps-opt-ico{display:grid;place-items:center;width:42px;height:42px;border-radius:14px;background:var(--grad);color:#fff;box-shadow:0 10px 22px -10px rgba(79,102,224,.8)}
.ps-link{background:none;border:0;color:var(--slate);font:inherit;font-size:14.5px;text-decoration:underline;text-underline-offset:3px;cursor:pointer;padding:6px 4px}
.ps-link:hover{color:var(--text)}
.ps-input{width:100%;margin-top:24px;font:inherit;font-size:19px;color:var(--text);background:var(--field);border:1px solid var(--glass-border);border-radius:18px;padding:16px 18px;outline:none;
  box-shadow:inset 0 1px 2px rgba(20,30,60,.06);transition:border-color .2s,box-shadow .2s}
.ps-input:focus{border-color:var(--accent);box-shadow:0 0 0 5px color-mix(in srgb,var(--accent) 16%,transparent)}
.ps-area{resize:vertical;min-height:130px;line-height:1.5}
.ps-chips{display:flex;flex-wrap:wrap;gap:8px;margin-top:14px}
.ps-chip{border:1px solid var(--glass-border);background:var(--card);color:var(--slate);border-radius:999px;padding:7px 14px;font:inherit;font-size:14px;cursor:pointer;transition:all .2s}
.ps-chip:hover{color:var(--text)}
.ps-chip.on{background:var(--grad);color:#fff;border-color:transparent}
.ps-row{display:flex;align-items:center;gap:10px;margin-top:28px;flex-wrap:wrap}
.ps-next{padding:12px 26px;font-size:15px}
.ps-drop{display:flex;flex-direction:column;align-items:center;gap:8px;text-align:center;margin-top:26px;padding:38px 20px;border-radius:24px;cursor:pointer;
  border:1.5px dashed color-mix(in srgb,var(--accent) 45%,var(--glass-border));background:var(--card);color:var(--accent);transition:transform .3s cubic-bezier(.22,1,.36,1),background .2s}
.ps-drop:hover{transform:translateY(-2px);background:var(--hover)}
.ps-drop strong{font-family:'Sora',sans-serif;font-weight:500;font-size:18px;color:var(--text)}
.ps-drop span{color:var(--slate);font-size:14px}
.ps-reading{display:flex;flex-direction:column;align-items:center;text-align:center;gap:6px;padding:16px 0 6px}
.ps-reading .btn{margin-top:22px}
.ps-orb{width:84px;height:84px;border-radius:50%;margin-bottom:18px;background:conic-gradient(from 0deg,var(--accent),var(--lav),var(--gold),var(--accent));
  -webkit-mask:radial-gradient(circle,transparent 52%,#000 54%);mask:radial-gradient(circle,transparent 52%,#000 54%);animation:psSpin 1.4s linear infinite}
.ps-orb.done{-webkit-mask:none;mask:none;animation:psPop .6s cubic-bezier(.22,1,.36,1) both;display:grid;place-items:center;color:#fff;background:var(--grad);box-shadow:0 16px 36px -14px rgba(79,102,224,.9)}
@keyframes psSpin{to{transform:rotate(360deg)}}
@keyframes psPop{from{transform:scale(.6);opacity:0}to{transform:none;opacity:1}}
.ps-review{display:grid;grid-template-columns:1fr 1fr;gap:12px 14px;margin-top:22px;max-height:52vh;overflow-y:auto;padding:2px 4px 2px 2px}
.ps-field{display:flex;flex-direction:column;gap:5px}
.ps-field.wide{grid-column:1/-1}
.ps-field span{font-size:11.5px;letter-spacing:.12em;text-transform:uppercase;color:var(--slate2);font-weight:700}
.ps-input.ps-sm{margin-top:0;font-size:15.5px;padding:10px 13px;border-radius:12px}
@media(max-width:640px){
  .ps{padding:16px 12px;place-items:start center}
  .ps-card{padding:30px 22px 24px;border-radius:26px;margin-top:18px}
  .ps-options,.ps-review{grid-template-columns:1fr}
  .ps-input{font-size:17px}
  .ps-review{max-height:none}
}
@media (hover:none),(max-width:900px){ .ps{-webkit-backdrop-filter:blur(10px);backdrop-filter:blur(10px)} .ps-opt:hover,.ps-drop:hover{transform:none} }

/* Phones and touch screens: blur is re-rendered every scroll frame, so repeated tiles use
   more opaque glass without blur, the sky stops drifting, and the sky is sized to the large
   viewport so the collapsing address bar doesn't make it jump. */
@media (hover:none),(max-width:900px){
  .hv-sky{bottom:auto;height:100vh;height:100lvh;transform:translateZ(0)}
  .hv-sky i{animation:none!important;will-change:auto}
  .sidebar,.action-center,.card,.table-card,.kanban-col,.stat,.strip-item,.fu-card,.resume-card,.template,.hint-strip,.week-col,.btn-ghost,.chip-btn,.stage-pill,.hero-chip{
    -webkit-backdrop-filter:none;backdrop-filter:none;background-color:var(--card-touch)}
  .topbar{-webkit-backdrop-filter:blur(16px) saturate(150%);backdrop-filter:blur(16px) saturate(150%)}
  .stat:not(:disabled):hover,.kcard:hover,.nav-item:hover,.btn-ghost:hover,.btn-primary:hover:not(:disabled){transform:none}
}
@media(max-width:640px){
  .stat-value{font-size:34px}
  .stat{padding:18px 10px 14px}
  .hero{margin-bottom:26px}
  .card,.action-center{padding:18px}
}

@media(max-width:900px){
  .app{flex-direction:column}
  .sidebar{width:100%;height:auto;position:static;border-right:0;border-bottom:1px solid var(--line)}
  .sidebar nav{display:flex;overflow-x:auto;padding:4px 10px 10px}
  .nav-item{white-space:nowrap;width:auto}
  .sidebar-foot{display:none}
  .content{padding:16px 14px 50px}
}
@media(max-width:640px){
  /* The desktop 1.08 zoom multiplies vw-sized modals and drawers past the screen edge on phones. */
  .app{zoom:1}
  .topbar{flex-wrap:wrap;gap:8px;padding:10px 14px}
  .searchwrap{flex:1 1 100%;max-width:none}
  .topbar-actions{width:100%;justify-content:flex-end}
}
@media(prefers-reduced-motion:reduce){*{animation:none!important;transition:none!important}}
`}</style>
  );
}
