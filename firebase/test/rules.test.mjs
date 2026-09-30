// Firestore security rules tests. They run only against the local Firebase Emulator (never the
// live project): `npm test` in this folder. Each case writes data the same way the real apps do.
import { readFileSync } from "node:fs";
import { test, before, after, beforeEach } from "node:test";
import { initializeTestEnvironment, assertSucceeds, assertFails } from "@firebase/rules-unit-testing";
import { doc, getDoc, setDoc, updateDoc, deleteDoc, collection, getDocs, Timestamp, increment, serverTimestamp } from "firebase/firestore";

const ADMIN = "vbqJe9D5IAYSBytSzM850motekm2";
const LEGACY_ID = "ffe5a55d2c34804c295003af2d6f0a7974d5fcee";
const OLD_SYNC = "0123456789abcdef0123456789abcdef0123";            // someone's old private sync code (36 chars)
let env;

before(async () => {
  env = await initializeTestEnvironment({
    projectId: "demo-hv-rules",
    firestore: { rules: readFileSync(new URL("../firestore.rules", import.meta.url), "utf8"), host: "127.0.0.1", port: 8089 },
  });
});
after(async () => { await env.cleanup(); });
beforeEach(async () => {
  await env.clearFirestore();
  await env.withSecurityRulesDisabled(async (c) => {
    const db = c.firestore();
    await setDoc(doc(db, "users/alice/data/vault"), { value: "{}", updatedAt: 1 });
    await setDoc(doc(db, "reset", LEGACY_ID), { json: "{\"days\":{}}", updatedAt: 1 });
    await setDoc(doc(db, "reset", OLD_SYNC), { json: "{\"days\":{}}", updatedAt: 1 });
    await setDoc(doc(db, "scorecards/HVT-MA-2345-6789"), card("HVT-MA-2345-6789"));
    await setDoc(doc(db, "stats/career-fit_2026-10-01"), { completed: 3 });
    await setDoc(doc(db, "config/site"), { json: "{}", updatedAt: 1, by: "admin" });
    await setDoc(doc(db, "config/other"), { json: "{}" });
    await setDoc(doc(db, "secret/x"), { a: 1 });
  });
});

const anon = () => env.unauthenticatedContext().firestore();
const as = (uid) => env.authenticatedContext(uid).firestore();
// A record built exactly the way tests/maturity-assessment builds one (computeResults + scorecardSummary)
const DIMS = ["Emotional Control", "Accountability", "Self-Awareness", "Handling Conflict", "Relationships",
  "Decision-Making", "Patience", "Empathy", "Responsibility", "Long-Term Thinking"];
const TIERS = [[40, "Developing"], [65, "Emerging"], [85, "Grounded"], [101, "Highly Consistent"]];
function realRecord(dimScores, adj, total) {
  const base = Math.round(dimScores.reduce((a, b) => a + b, 0) / DIMS.length);
  const overall = Math.max(0, Math.min(100, base + adj));
  const sorted = DIMS.map((name, i) => ({ name, score: dimScores[i] })).sort((a, b) => b.score - a.score);
  return { test: "maturity-assessment", testTitle: "Maturity Assessment", category: "Personal Growth", completedAt: Timestamp.now(),
    score: overall, level: TIERS.find((t) => overall <= t[0])[1], answered: total, total,
    skills: DIMS.map((name, i) => ({ name, score: Math.round(dimScores[i] / 10) })),
    strengths: sorted.slice(0, 3).map((d) => d.name), focus: sorted.slice(-3).reverse().map((d) => d.name) };
}
function card(id, over) {
  return Object.assign({ v: 1, id, name: "Riya" }, realRecord([72, 80, 65, 70, 90, 55, 60, 85, 75, 68], 0, 29), over || {});
}

/* ---------- users/{uid}: HV Vault, HV Reset, HV AI history ---------- */
test("users: owner can read and write their own data", async () => {
  await assertSucceeds(getDoc(doc(as("alice"), "users/alice/data/vault")));
  await assertSucceeds(setDoc(doc(as("alice"), "users/alice/reset/state"), { value: "{}", updatedAt: 2 }));
  await assertSucceeds(setDoc(doc(as("alice"), "users/alice/apps/inbox"), { a_1: "{}" }, { merge: true }));
  await assertSucceeds(deleteDoc(doc(as("alice"), "users/alice/data/vault")));
});
test("users: nobody else can read, write or list someone's data", async () => {
  await assertFails(getDoc(doc(as("bob"), "users/alice/data/vault")));
  await assertFails(setDoc(doc(as("bob"), "users/alice/data/vault"), { value: "x" }));
  await assertFails(getDoc(doc(anon(), "users/alice/data/vault")));
  await assertFails(getDocs(collection(anon(), "users")));
  await assertFails(getDocs(collection(as("bob"), "users/alice/data")));
  await assertFails(getDoc(doc(as(ADMIN), "users/alice/data/vault")));     // not even the admin
});

/* ---------- reset/{id}: old sync, now read-only ---------- */
test("reset: an old private sync code can still be opened by its ID", async () => {
  await assertSucceeds(getDoc(doc(anon(), "reset", OLD_SYNC)));
});
test("reset: the owner's old shared plan only opens for the admin", async () => {
  await assertFails(getDoc(doc(anon(), "reset", LEGACY_ID)));
  await assertFails(getDoc(doc(as("bob"), "reset", LEGACY_ID)));
  await assertSucceeds(getDoc(doc(as(ADMIN), "reset", LEGACY_ID)));
});
test("reset: no listing, no short IDs and no writes for anyone", async () => {
  await assertFails(getDocs(collection(anon(), "reset")));
  await assertFails(getDocs(collection(as(ADMIN), "reset")));
  await assertFails(getDoc(doc(anon(), "reset/short")));
  await assertFails(setDoc(doc(anon(), "reset", "f".repeat(40)), { json: "{}", updatedAt: 1 }));
  await assertFails(setDoc(doc(anon(), "reset", OLD_SYNC), { json: "{}", updatedAt: 9 }));
  await assertFails(setDoc(doc(as(ADMIN), "reset", LEGACY_ID), { json: "{}", updatedAt: 9 }));
  await assertFails(deleteDoc(doc(anon(), "reset", OLD_SYNC)));
});

/* ---------- scorecards: HV Test ---------- */
test("scorecards: anyone can create a valid one and check it by ID", async () => {
  await assertSucceeds(setDoc(doc(anon(), "scorecards/HVT-MA-ABCD-EFGH"), card("HVT-MA-ABCD-EFGH")));
  await assertSucceeds(getDoc(doc(anon(), "scorecards/HVT-MA-2345-6789")));
});
test("scorecards: bad or changed records are refused", async () => {
  await assertFails(setDoc(doc(anon(), "scorecards/HVT-MA-ABCD-EFGJ"), card("HVT-MA-ABCD-EFGJ", { score: 101 })));
  await assertFails(setDoc(doc(anon(), "scorecards/HVT-MA-ABCD-EFGK"), card("HVT-MA-ABCD-EFGK", { admin: true })));
  await assertFails(setDoc(doc(anon(), "scorecards/HVT-MA-ABCD-EFGL"), card("HVT-MA-ABCD-XXXX")));      // id mismatch
  await assertFails(setDoc(doc(anon(), "scorecards/not-an-id"), card("not-an-id")));
  await assertFails(setDoc(doc(anon(), "scorecards/HVT-MA-ABCD-EFGM"), card("HVT-MA-ABCD-EFGM", { name: "x".repeat(61) })));
  await assertFails(setDoc(doc(anon(), "scorecards/HVT-MA-ABCD-EFGN"), card("HVT-MA-ABCD-EFGN", { completedAt: Timestamp.fromMillis(Date.now() - 5 * 864e5) })));
  await assertFails(updateDoc(doc(anon(), "scorecards/HVT-MA-2345-6789"), { score: 100 }));
  await assertFails(updateDoc(doc(as(ADMIN), "scorecards/HVT-MA-2345-6789"), { score: 100 }));
  await assertFails(deleteDoc(doc(anon(), "scorecards/HVT-MA-2345-6789")));
  await assertFails(getDocs(collection(anon(), "scorecards")));
});
test("scorecards: only the admin can list and delete", async () => {
  await assertSucceeds(getDocs(collection(as(ADMIN), "scorecards")));
  await assertSucceeds(deleteDoc(doc(as(ADMIN), "scorecards/HVT-MA-2345-6789")));
});

/* ---------- stats: anonymous +1 counter ---------- */
test("stats: +1 works (new day and existing day), only the admin can read", async () => {
  await assertSucceeds(setDoc(doc(anon(), "stats/career-fit_2026-10-02"), { completed: increment(1) }, { merge: true }));
  await assertSucceeds(setDoc(doc(anon(), "stats/career-fit_2026-10-01"), { completed: increment(1) }, { merge: true }));
  await assertFails(getDoc(doc(anon(), "stats/career-fit_2026-10-01")));
  await assertFails(getDocs(collection(as("bob"), "stats")));
  await assertSucceeds(getDocs(collection(as(ADMIN), "stats")));
});
test("stats: counts can't be set, jumped, reset or deleted", async () => {
  await assertFails(setDoc(doc(anon(), "stats/career-fit_2026-10-01"), { completed: 999 }));
  await assertFails(setDoc(doc(anon(), "stats/career-fit_2026-10-01"), { completed: 0 }));
  await assertFails(setDoc(doc(anon(), "stats/career-fit_2026-10-03"), { completed: 50 }));
  await assertFails(setDoc(doc(anon(), "stats/Bad Key"), { completed: 1 }));
  await assertFails(setDoc(doc(anon(), "stats/career-fit_2026-10-01"), { completed: increment(1), x: 1 }, { merge: true }));
  await assertFails(deleteDoc(doc(anon(), "stats/career-fit_2026-10-01")));
});

/* ---------- config/site: HV World live settings ---------- */
test("config: everyone can read the site settings", async () => {
  await assertSucceeds(getDoc(doc(anon(), "config/site")));
});
test("config: only the admin can change them, in the right shape", async () => {
  await assertFails(setDoc(doc(anon(), "config/site"), { json: "{}", updatedAt: 2, by: "x" }));
  await assertFails(setDoc(doc(as("bob"), "config/site"), { json: "{}", updatedAt: 2, by: "x" }));
  await assertSucceeds(setDoc(doc(as(ADMIN), "config/site"), { json: "{\"maintenance\":{}}", updatedAt: serverTimestamp(), by: "admin" }));
  await assertFails(setDoc(doc(as(ADMIN), "config/site"), { json: "{}", role: "x" }));
  await assertFails(setDoc(doc(as(ADMIN), "config/site"), { json: "x".repeat(100001) }));
  await assertFails(setDoc(doc(as(ADMIN), "config/other"), { json: "{}" }));
});
test("config: other config docs and listing stay closed", async () => {
  await assertFails(getDoc(doc(anon(), "config/other")));
  await assertFails(getDocs(collection(anon(), "config")));
});

/* ---------- everything else ---------- */
test("unknown collections are closed to everyone", async () => {
  await assertFails(getDoc(doc(anon(), "secret/x")));
  await assertFails(getDoc(doc(as(ADMIN), "secret/x")));
  await assertFails(setDoc(doc(as("alice"), "secret/y"), { a: 1 }));
  await assertFails(setDoc(doc(as("alice"), "apps/inbox"), { a: 1 }));
});

/* ---------- admin can't be claimed, bad types, forged tokens ---------- */
test("admin rights can't be claimed with a custom claim, a profile field or an email", async () => {
  const fake = env.authenticatedContext("mallory", { admin: true, role: "admin", email: "harsh@example.com", email_verified: true }).firestore();
  await assertFails(setDoc(doc(fake, "config/site"), { json: "{}", updatedAt: 1, by: "x" }));
  await assertFails(getDocs(collection(fake, "stats")));
  await assertFails(getDocs(collection(fake, "scorecards")));
  await assertSucceeds(setDoc(doc(as("mallory"), "users/mallory/profile/me"), { role: "admin", isAdmin: true }));   // their own data, but it grants nothing
  await assertFails(getDocs(collection(as("mallory"), "stats")));
});
test("wrong data types are refused", async () => {
  await assertFails(setDoc(doc(anon(), "scorecards/HVT-MA-ABCD-EFGP"), card("HVT-MA-ABCD-EFGP", { score: "72" })));
  await assertFails(setDoc(doc(anon(), "scorecards/HVT-MA-ABCD-EFGQ"), card("HVT-MA-ABCD-EFGQ", { score: 72.5 })));
  await assertFails(setDoc(doc(anon(), "scorecards/HVT-MA-ABCD-EFGR"), card("HVT-MA-ABCD-EFGR", { skills: "all" })));
  await assertFails(setDoc(doc(anon(), "scorecards/HVT-MA-ABCD-EFGS"), card("HVT-MA-ABCD-EFGS", { completedAt: "2026-10-01" })));
  await assertFails(setDoc(doc(as(ADMIN), "config/site"), { json: 5, updatedAt: 1, by: "admin" }));
  await assertFails(setDoc(doc(anon(), "stats/career-fit_2026-10-04"), { completed: "1" }));
});
test("REST (like the apps): another user's token and a garbage token can't read someone's data", async () => {
  // The emulator accepts unsigned tokens by design, so this checks what the rules do with the uid.
  // Checking Google's token signature is done by Firebase on the live project, not tested here.
  const b64 = (o) => Buffer.from(JSON.stringify(o)).toString("base64url");
  const tok = b64({ alg: "none", typ: "JWT" }) + "." + b64({ sub: "bob", user_id: "bob", aud: "demo-hv-rules", iss: "https://securetoken.google.com/demo-hv-rules", iat: 1, exp: 9999999999, auth_time: 1 }) + ".";
  const r = await fetch("http://127.0.0.1:8089/v1/projects/demo-hv-rules/databases/(default)/documents/users/alice/data/vault", { headers: { Authorization: "Bearer " + tok } });
  if (r.status !== 403) throw new Error("expected 403, got " + r.status);
  const garbage = await fetch("http://127.0.0.1:8089/v1/projects/demo-hv-rules/databases/(default)/documents/users/alice/data/vault", { headers: { Authorization: "Bearer not-a-token" } });
  if (garbage.ok) throw new Error("garbage token was accepted");
});

/* ---------- scorecards: consistency checks (Maturity Assessment) ---------- */
test("scorecards: 300 random real results are all accepted (no real user is blocked)", async () => {
  let seed = 7; const rnd = () => ((seed = (seed * 1103515245 + 12345) % 2147483648) / 2147483648);
  const edge = [[0,0,0,0,0,0,0,0,0,0], [100,100,100,100,100,100,100,100,100,100], [45,45,45,45,45,45,45,45,45,45], [50,50,50,50,50,50,50,50,50,50], [41,41,41,41,41,41,41,41,41,41], [86,86,86,86,86,86,86,86,86,86], [5,15,25,35,45,55,65,75,85,95]];
  for (let n = 0; n < 300; n++) {
    const dims = n < edge.length ? edge[n] : DIMS.map(() => Math.round(rnd() * 100));
    const adj = [0, -1, -3, -5][n % 4], total = 28 + (n % 3);
    const A = "23456789ABCDEFGHJKLMNPQRSTUVWXYZ", id = "HVT-MA-" + A[n >> 5] + A[n & 31] + "22-ABCD";
    const rec = Object.assign({ v: 1, id, name: "User " + n }, realRecord(dims, adj, total));
    try { await assertSucceeds(setDoc(doc(anon(), "scorecards", id), rec)); }
    catch (e) { throw new Error("real record refused: " + JSON.stringify({ dims, adj, total, score: rec.score, level: rec.level, skills: rec.skills.map((x) => x.score) })); }
  }
});
test("scorecards: made-up or inconsistent records are refused", async () => {
  const bad = {
    "score 100, dims say ~70": { score: 100, level: "Highly Consistent" },
    "level doesn't match score": { level: "Highly Consistent" },
    "level for 40 is Developing": Object.assign({}, realRecord([40,40,40,40,40,40,40,40,40,40], 0, 29), { level: "Emerging" }),
    "unanswered questions": { answered: 20 },
    "too few questions": { answered: 10, total: 10 },
    "too many questions": { answered: 31, total: 31 },
    "other test name": { test: "career-fit" },
    "other test title": { testTitle: "Certified Leader" },
    "9 skills": { skills: realRecord([72,80,65,70,90,55,60,85,75,68], 0, 29).skills.slice(0, 9) },
    "skill over 10": { skills: realRecord([72,80,65,70,90,55,60,85,75,68], 0, 29).skills.map((x, i) => i ? x : { name: x.name, score: 11 }) },
    "renamed skill": { skills: realRecord([72,80,65,70,90,55,60,85,75,68], 0, 29).skills.map((x, i) => i ? x : { name: "Genius", score: x.score }) },
    "extra field in a skill": { skills: realRecord([72,80,65,70,90,55,60,85,75,68], 0, 29).skills.map((x, i) => i ? x : Object.assign({ verified: true }, x)) },
    "all skills 10, score 60": Object.assign({}, realRecord([100,100,100,100,100,100,100,100,100,100], 0, 29), { score: 60, level: "Emerging" }),
    "unknown strength": { strengths: ["Genius", "Empathy", "Patience"] },
    "4 strengths": { strengths: ["Empathy", "Patience", "Accountability", "Relationships"] },
    "strength also a focus": { strengths: ["Empathy", "Patience", "Accountability"], focus: ["Empathy", "Self-Awareness", "Decision-Making"] },
  };
  let n = 0;
  for (const [why, over] of Object.entries(bad)) {
    const id = "HVT-MA-BAD" + "ABCDEFGHJKLMNPQRSTUVWXYZ"[n++] + "-2345";
    try { await assertFails(setDoc(doc(anon(), "scorecards", id), card(id, over))); }
    catch (e) { throw new Error("accepted a bad record: " + why); }
  }
  // an MA record under another test's ID code
  await assertFails(setDoc(doc(anon(), "scorecards/HVT-XX-2345-6789"), card("HVT-XX-2345-6789")));
});
