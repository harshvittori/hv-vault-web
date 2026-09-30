# Firestore security rules (Firebase project `harsh-reset`)

`firestore.rules` is the single source of truth for the database rules used by all four sites
(HV World, HV Test, HV Reset, HV Vault). This folder is not published: the Pages workflow only
deploys `dist/`.

## Test (local emulator only, never the live project)

```
cd firebase/test
npm install
npm test        # starts the Firestore emulator (project demo-hv-rules), runs rules.test.mjs, stops it
```

Needs Java and `firebase-tools` (`npm i -g firebase-tools`).

## Publish to the live project

The rules are published by hand, after the tests pass:

1. Firebase console → project **harsh-reset** → Firestore Database → **Rules**.
2. Replace everything with the contents of `firestore.rules` → **Publish**.
3. Check: HV Vault sign-in + sync, HV Reset sign-in, an HV Test scorecard + verify, the HV World admin page.

Previous versions stay in the console's rules history, so a publish can be rolled back from there.

Keep the copies in `hv-tests/AGENTS.md` and `hv-tests/admin/admin.js` (the admin setup screen) in step
with this file.
