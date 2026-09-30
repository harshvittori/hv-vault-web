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
    await setDoc(doc(db, "scorecards/HVT-AB-2345-6789"), card("HVT-AB-2345-6789"));
    await setDoc(doc(db, "stats/career-fit_2026-10-01"), { completed: 3 });
    await setDoc(doc(db, "config/site"), { json: "{}", updatedAt: 1, by: "admin" });
    await setDoc(doc(db, "config/other"), { json: "{}" });
    await setDoc(doc(db, "secret/x"), { a: 1 });
  });
});

const anon = () => env.unauthenticatedContext().firestore();
const as = (uid) => env.authenticatedContext(uid).firestore();
function card(id, over) {
  return Object.assign({ v: 1, id, name: "Riya", test: "career-fit", testTitle: "Career fit", category: "Career", completedAt: Timestamp.now(),
    score: 72, level: "Grounded", answered: 20, total: 20, skills: [], strengths: [], focus: [] }, over || {});
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
  await assertSucceeds(setDoc(doc(anon(), "scorecards/HVT-CF-ABCD-EFGH"), card("HVT-CF-ABCD-EFGH")));
  await assertSucceeds(getDoc(doc(anon(), "scorecards/HVT-AB-2345-6789")));
});
test("scorecards: bad or changed records are refused", async () => {
  await assertFails(setDoc(doc(anon(), "scorecards/HVT-CF-ABCD-EFGJ"), card("HVT-CF-ABCD-EFGJ", { score: 101 })));
  await assertFails(setDoc(doc(anon(), "scorecards/HVT-CF-ABCD-EFGK"), card("HVT-CF-ABCD-EFGK", { admin: true })));
  await assertFails(setDoc(doc(anon(), "scorecards/HVT-CF-ABCD-EFGL"), card("HVT-CF-ABCD-XXXX")));      // id mismatch
  await assertFails(setDoc(doc(anon(), "scorecards/not-an-id"), card("not-an-id")));
  await assertFails(setDoc(doc(anon(), "scorecards/HVT-CF-ABCD-EFGM"), card("HVT-CF-ABCD-EFGM", { name: "x".repeat(61) })));
  await assertFails(setDoc(doc(anon(), "scorecards/HVT-CF-ABCD-EFGN"), card("HVT-CF-ABCD-EFGN", { completedAt: Timestamp.fromMillis(Date.now() - 5 * 864e5) })));
  await assertFails(updateDoc(doc(anon(), "scorecards/HVT-AB-2345-6789"), { score: 100 }));
  await assertFails(updateDoc(doc(as(ADMIN), "scorecards/HVT-AB-2345-6789"), { score: 100 }));
  await assertFails(deleteDoc(doc(anon(), "scorecards/HVT-AB-2345-6789")));
  await assertFails(getDocs(collection(anon(), "scorecards")));
});
test("scorecards: only the admin can list and delete", async () => {
  await assertSucceeds(getDocs(collection(as(ADMIN), "scorecards")));
  await assertSucceeds(deleteDoc(doc(as(ADMIN), "scorecards/HVT-AB-2345-6789")));
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
  await assertFails(setDoc(doc(anon(), "scorecards/HVT-CF-ABCD-EFGP"), card("HVT-CF-ABCD-EFGP", { score: "72" })));
  await assertFails(setDoc(doc(anon(), "scorecards/HVT-CF-ABCD-EFGQ"), card("HVT-CF-ABCD-EFGQ", { score: 72.5 })));
  await assertFails(setDoc(doc(anon(), "scorecards/HVT-CF-ABCD-EFGR"), card("HVT-CF-ABCD-EFGR", { skills: "all" })));
  await assertFails(setDoc(doc(anon(), "scorecards/HVT-CF-ABCD-EFGS"), card("HVT-CF-ABCD-EFGS", { completedAt: "2026-10-01" })));
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
