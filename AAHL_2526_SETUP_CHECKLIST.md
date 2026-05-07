# AAHL 2025-26 — Commissioner Setup Checklist

Complete these in order. Each section unlocks the next.

---

## PHASE 1 — Firebase / Firestore

- [ ] Go to https://console.firebase.google.com
- [ ] Click **Add project** → name it `aahl-2526`
- [ ] Disable Google Analytics (not needed) → **Create project**
- [ ] In left sidebar → **Build → Firestore Database**
- [ ] Click **Create database**
  - Mode: **Native mode**
  - Location: **us-central1**
- [ ] In left sidebar → **Project Settings** (gear icon) 
- [ ] Copy your **Project ID** — looks like `aahl-2526-xxxxx` → save it somewhere Project ID aahl-2526 Project number 293365274832

---

## PHASE 2 — Service Account (Apps Script → Firestore auth)

- [ ] In Firebase console → **Project Settings → Service accounts** tab
- [ ] Click **Generate new private key** → **Generate key**
- [ ] A JSON file downloads — **keep this safe, treat like a password**
- [ ] Open the JSON file in a text editor — you'll need the full contents in Phase 4

---

## PHASE 3 — Firestore Security Rules

- [ ] In Firebase console → **Firestore → Rules** tab
- [ ] Replace the default rules with:

```
rules_version = '2';
service cloud.firestore {
  match /databases/{database}/documents {
    match /entries/{doc}        { allow read: if true; allow write: if false; }
    match /players/{doc}        { allow read: if true; allow write: if false; }
    match /hatTricks/{doc}      { allow read: if true; allow write: if false; }
    match /config/{doc}         { allow read: if true; allow write: if false; }
    match /agentStatus/{doc}    { allow read: if true; allow write: if false; }
    match /ir/{doc}             { allow read: if true; allow write: if false; }
    match /processedGames/{doc} { allow read: if false; allow write: if false; }
  }
}
```

- [ ] Click **Publish**

> All writes go through Apps Script using the service account key — bypasses these rules securely.

---

## PHASE 4 — Google Apps Script Project

- [ ] Go to https://script.google.com
- [ ] Click **New project**
- [ ] Rename it: `AAHL-2526-Agents`
- [ ] Click **Project Settings** (gear icon, left sidebar)
- [ ] Scroll to **Script Properties** → click **Add script property**
- [ ] Add property 1:
  - Name: `FIREBASE_PROJECT_ID`
  - Value: *(your Project ID from Phase 1)*
- [ ] Add property 2:
  - Name: `SERVICE_ACCOUNT_KEY`
  - Value: *(paste the entire contents of the JSON file from Phase 2 — all on one line)*
- [ ] Click **Save script properties**

---

## PHASE 5 — Paste & Test AGT-001

- [ ] In the Apps Script editor, rename `Code.gs` to `AGT-001-EntryReceiver.gs`
- [ ] Paste the full AGT-001 code into that file
- [ ] Click **Save** (floppy disk or Ctrl+S)
- [ ] Run `testFirestoreConnection` from the function dropdown → click **Run**
  - First run will ask for permissions — click **Review permissions → Allow**
  - Should log `Response code: 404` (doc doesn't exist yet — that's correct)
  - Any 200 or 404 = connection working ✅
  - A 401 or 403 = service account key issue → recheck Phase 2/4
- [ ] Run `testEntryFlow` → confirm it logs a valid entry doc (no Firestore write yet)

---

## PHASE 6 — Deploy AGT-001 as Web App

- [ ] In Apps Script → top right → **Deploy → New deployment**
- [ ] Click the gear icon beside "Select type" → choose **Web app**
- [ ] Settings:
  - Description: `AAHL 2526 Entry Receiver`
  - Execute as: **Me**
  - Who has access: **Anyone**
- [ ] Click **Deploy**
- [ ] Copy the **Web app URL** — looks like `https://script.google.com/macros/s/ABC.../exec`
- [ ] Save that URL — goes into `main.js` as `APPS_SCRIPT_URL`

> Every time you update the Apps Script code, you must **Deploy → Manage deployments → edit → New version** to push changes live.

---

## PHASE 7 — GitHub Repo

- [ ] Go to https://github.com/matthope001-hub/AAHL---Angry-Alpaha-Hockey-League
- [ ] Create a new branch: `2526-season` (or work on main — your call)
- [ ] Confirm GitHub Pages is enabled:
  - Repo → **Settings → Pages**
  - Source: **Deploy from a branch** → `main` → `/ (root)`

---

## PHASE 8 — Firebase SDK Config (for frontend reads)

- [ ] In Firebase console → **Project Settings → General** tab
- [ ] Scroll to **Your apps** → click **Add app → Web (</>)**
- [ ] App nickname: `aahl-frontend` → **Register app**
- [ ] Copy the `firebaseConfig` object — looks like:
```js
const firebaseConfig = {
  apiKey: "AIza...",
  authDomain: "aahl-2526-xxxxx.firebaseapp.com",
  projectId: "aahl-2526-xxxxx",
  storageBucket: "...",
  messagingSenderId: "...",
  appId: "..."
};
```
- [ ] This goes into `main.js` — Claude will add the placeholder, you fill in the values

---

## PHASE 9 — Paste Remaining Agents

As each agent is built, add a new `.gs` file in Apps Script:

- [ ] `AGT-002-StatFetcher.gs` — paste when ready
- [ ] `AGT-003-StandingsCalc.gs` — paste when ready
- [ ] `AGT-004-AnomalyDetector.gs` — paste when ready
- [ ] `AGT-005-Comms.gs` — paste when ready

---

## PHASE 10 — Set Up Time Triggers

Once all agents are pasted:

- [ ] In Apps Script → left sidebar → **Triggers (clock icon)**
- [ ] Add trigger 1:
  - Function: `runAGT002` | Event: **Time-driven** | Type: **Day timer** | Time: **6am–7am ET**
- [ ] Add trigger 2:
  - Function: `runAGT003` | Event: **Time-driven** | Type: **Day timer** | Time: **7am–8am ET**
- [ ] Add trigger 3:
  - Function: `runAGT004` | Event: **Time-driven** | Type: **Day timer** | Time: **7am–8am ET**
- [ ] Add trigger 4:
  - Function: `runAGT005Digest` | Event: **Time-driven** | Type: **Week timer** | Day: **Monday** | Time: **9am–10am ET**

---

## PHASE 11 — Upload Frontend Files

As each frontend file is built:

- [ ] `styles.css`
- [ ] `main.js` ← fill in `APPS_SCRIPT_URL` and `firebaseConfig` before uploading
- [ ] `index.html`
- [ ] `picks.html`
- [ ] `standings.html`
- [ ] `rules.html`
- [ ] `admin.html`
- [ ] `aahl-logo.png` (reuse from existing repo)

Upload via GitHub → **Add file → Upload files**

---

## PHASE 12 — Smoke Test End-to-End

- [ ] Visit live site → go to picks page
- [ ] Submit a test entry (use your own email)
- [ ] Check Firebase console → Firestore → `entries` collection → doc appears ✅
- [ ] Check `players` collection → ownershipCount incremented ✅
- [ ] Check your email → confirmation email received ✅
- [ ] Check `agentStatus` collection → AGT-001 ✅ log entry ✅
- [ ] Manually run `runAGT002` in Apps Script → check `players` stats update ✅
- [ ] Check live standings page → data renders ✅

---

## Quick Reference — Key Values to Track

| Item | Value |
|------|-------|
| Firebase Project ID | *(fill in after Phase 1)* |
| Apps Script Web App URL | *(fill in after Phase 6)* |
| Firebase apiKey | *(fill in after Phase 8)* |
| E-transfer address | matt.hope@rocketmail.com |
| Pool entry fee | $50 |
| Entry cutoff | October 7, 2025 (11:59 PM ET) |
| Opening night | October 8, 2025 |
| Max entries per person | 3 |
| Live site URL | https://matthope001-hub.github.io/AAHL---Angry-Alpaha-Hockey-League/ |
| GitHub repo | https://github.com/matthope001-hub/AAHL---Angry-Alpaha-Hockey-League |
