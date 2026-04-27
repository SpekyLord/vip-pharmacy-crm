# BDM Offline Field Guide

> **Last Updated**: April 27, 2026 — Phase N (Offline Visit + CLM Merge + Public Deck) + Offline-First Sprint
> **Audience**: Business Development Managers (BDMs) running field visits with weak Globe signal
> **Where to find this**: in-app at `/bdm/field-guide`, and in the repo at `docs/BDM-OFFLINE-FIELD-GUIDE.md`

This guide explains the offline-capable workflow for logging VIP Client visits, running partnership presentations, and recovering from sync errors. Read it once before your next field day, and revisit anytime via Sidebar → BDM → Field Guide.

---

## 1. Offline Visit Logging

You can now log visits **even with no Globe signal** at the clinic.

### Before you leave the office (or hotspot)

1. Open the **BDM Dashboard** once while you have signal. This downloads your VIP Client list onto your phone.
2. Tap each VIP Client you plan to visit today, even just once, while online. This makes sure their profile is saved locally for offline pickup.
3. You can close the app between clinics to save battery — you will stay logged in (cached profile rehydrates automatically).

### At the clinic (no signal? no problem)

1. Tap **Log Visit**. The page now opens normally even when offline.
2. Take your **at least 1 photo proof** as usual (1–10 photos). Photos auto-save to your phone immediately — even if your phone reboots before sync, your photos are not lost.
3. Pick the products you discussed. Add notes. Tap **Submit Visit**.
4. You will see a quick "queued" confirmation. The visit is safely stored on your phone and will sync automatically when you get signal back.
5. Move to the next clinic. Repeat. Close the app between visits to save battery if you want.

### When you get back on WiFi or signal

1. Open the app. Sync runs **automatically** in the background — you don't need to tap anything.
2. You will see a green toast at the top: **"Synced 3 visits (~5.4 MB)"**. That tells you how many visits were sent and roughly how much mobile data was used.
3. A copy of that confirmation also lands in your **Inbox** folder, so you can review later "how much data did I use this week."
4. Your **My Visits** history will now show all the offline visits you logged, with their photos and timestamps preserved exactly.

---

## 2. Visit + Partnership Presentation are now ONE flow

When you visit a VIP Client and want to walk them through the partnership deck, you don't need to log it twice anymore. The visit and the presentation are connected automatically through a shared encounter ID.

### In-person at the clinic

1. Open **New Visit**, pick the VIP Client you're meeting.
2. Take your proof photos (1–10).
3. Pick the products you plan to feature in the pitch.
4. Tap **Start Presentation** (the button below the products list).
   - The deck opens **full-screen** — the VIP Client can hold your tablet and swipe.
   - The doctor's name + your selected products are already on the slides — no retyping.
5. Walk them through the slides. Time per slide is tracked silently in the background.
6. When done, tap **End Session**. You'll be asked:
   - **Interest level** (1 to 5)
   - **Outcome** (e.g., agreed to follow up, not interested, asked for samples)
   - **Follow-up date** if there is one
7. You're returned to the Visit page → tap **Submit Visit**.

The visit, the photos, and the CLM session are now permanently linked. Admin sees them as one encounter in reports.

> ⚠️ **If you skip Start Presentation:** that's fine. Just submit the visit normally. Only do the presentation when you actually walk them through the deck — fake CLM sessions inflate your stats and admin will notice.

### Remote (sending the deck via Messenger / Viber / WhatsApp / email)

If you cannot visit in person but you want to share the partnership deck:

1. Open **Communication Log** page.
2. Tap **Generate Deck Link**.
3. The system creates a special public link (looks like `https://app.viosintegrated.net/clm/deck/abc123`) and **automatically copies it to your clipboard**.
4. Open Messenger / Viber / WhatsApp → paste the link → send to your VIP Client.
5. Log a **Communication Log** entry as proof you sent it (channel = Messenger/Viber/etc., attach a screenshot).
6. Done. The deck and your message are linked automatically.

**What the VIP Client sees:** they tap the link, the deck opens in their browser (no login needed). They can swipe through. We see in our reports when they opened it and how many times. They never see your phone number, email, or GPS — only the deck content + your first name.

---

## 3. Photo proof — what's different now

Nothing has changed for you, but here's how it works in case anyone asks:

- Your photos save to your phone the **second** you take them (not when you submit). So even if your phone dies or the app crashes mid-visit, the photos are safe.
- When the visit syncs (automatically, when you reconnect), the photos go up with it. They don't sync separately or get lost in transit.
- The photo, the visit, and the CLM session are all stamped with the **same encounter ID**, so when admin reviews proof of work they see the full picture together.

---

## 4. If you see a red "Sync errors (N)" badge next to your name on the dashboard

1. **Tap it.** A drawer opens listing what failed.
2. The usual cause is "Visit photos lost" — your phone cleared its temporary storage (this is rare, more common on aggressive battery-saver phones).
3. Tap **Discard** to clear the error from your dashboard. A copy stays in your Inbox so admin still has the record.
4. Then go back to **Log Visit** and **re-capture** that visit (new photos, GPS, products). There is no automatic retry because the original photos are gone.

---

## 5. What still needs WiFi or cellular

These pages CANNOT be used offline — they need a server round-trip:

- Expenses
- Approvals
- Per-Diem / SMER
- Car Logbook / Fuel
- Settings / Control Center
- Sales / GRN / Collections / any financial entry

If you try to open these offline you'll see an orange panel saying **"This page needs WiFi or cellular."** That's by design — financial postings must run live to keep the books accurate. Tap **Back to Dashboard** and continue logging visits.

---

## 6. Tips to save Globe data

- Stay offline at the clinic. Only sync when you're at home or on WiFi if you're tight on data.
- The toast `(~X MB)` is your **data audit trail** — review it weekly.
- Photos are the biggest data cost. We'll be adding photo compression in a future update — for now, take only the photos you actually need (1 is the minimum, more if needed).

---

## 7. Common questions

| Question | Answer |
|---|---|
| Can I do CLM without a Visit? | Yes — open Partnership CLM directly. But if you DID actually visit, do it through New Visit so you get one linked record instead of two unlinked ones. |
| Can I do a Visit without CLM? | Yes — just don't tap Start Presentation. Visit logs as a normal proof-of-call. |
| What if my deck times out mid-presentation? | The session saves whatever you completed. If you didn't tap End Session, it stays as a partial session and admin can review it. |
| The remote link is public — can anyone see our pricing? | The deck only shows what's on your slide content (no internal pricing, no BDM contact). It's rate-limited so people can't scrape it. Only `mode: 'remote'` sessions appear publicly — your in-person sessions are private. |
| Will my visit get rejected for being a duplicate? | The system enforces 1 visit per VIP Client per week. If you accidentally submit twice (e.g., once offline, once online), the database silently rejects the duplicate. Your offline draft will be cleaned up automatically. |
| What if I see a glitch? | Take a screenshot of the screen + the red badge if any. Note the time + your location (signal strength). Send to admin via Comm Log or message. |

---

## 8. What to expect from admin this rollout week

We're piloting this with 3 BDMs first. If you're one of the pilots:

- Log normally and send feedback after each clinic day.
- Anything that feels different from this guide → screenshot it and tell admin.
- Pay attention to the **"Synced N visits"** toast. If you go a whole field day with no toast, sync is broken — tell us.

Once the pilot is clean for 1 week, we'll roll wide.
