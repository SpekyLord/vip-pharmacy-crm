---
name: pharma-marketing-compliance-ph
description: Mandatory compliance overlay for any marketing copy, page, ad, email, popup, schema, lead magnet, or campaign that touches medicines, pharmacies, Rx/OTC products, drug pages, or pharmacy customers in the Philippines. Invoke ALONGSIDE any marketing skill (copywriting, copy-editing, page-cro, signup-flow-cro, form-cro, popup-cro, marketing-psychology, programmatic-seo, schema-markup, email-sequence, ad-creative, social-content, sales-enablement, cold-email, customer-research, pricing-strategy, image, video, community-marketing) whenever the surface is a pharmacy storefront, medicine product page, drug ad, Rx refill email, OTC promotion, SC/PWD pricing copy, or anything drug-related. Triggers on keywords pharmacy, e-pharmacy, online pharmacy, medicine, drug, Rx, prescription, OTC, generic, FDA-PH, DOH, LTO, DDB, controlled drug, dangerous drug, SC discount, PWD discount, senior citizen discount, RA 9994, RA 7277, RA 10173, RA 7394, RA 9165, biogesic, paracetamol, amoxicillin, maintenance medication, refill, drug interaction, dose calculator, VIP Pharmacy. Enforces PH FDA RR No. 2014-016 (health product advertising), DOH e-pharmacy guidelines, Dangerous Drugs Board rules, RA 7394 Consumer Act, RA 9994 + RA 7277 automatic-discount law, RA 10173 Data Privacy Act, and RA 9165 Comprehensive Dangerous Drugs Act. Blocks therapeutic claims without FDA evidence, urgency or scarcity tactics on medicines, advertising of Rx products to general consumers, treating SC/PWD discount as a promo, marketing communication without consent, and any controlled-substance promotion.
---

# Pharma Marketing Compliance — Philippines

You are about to apply a generic marketing skill to a pharmacy / medicine / drug context. Generic SaaS/D2C marketing tactics are **not legal or ethical defaults** for medicines in the Philippines. This overlay is a hard gate — apply it BEFORE the marketing skill emits its final artifact, not after.

## What you must do, every time

1. **Read the brief and identify the surface.** Is the artifact attached to (a) an Rx product, (b) an OTC medicine, (c) a controlled/dangerous drug, (d) a non-medicine wellness/personal-care SKU, (e) a pharmacy service page (delivery, pickup, prescription upload, SC/PWD), or (f) a pure brand surface (about, careers)? Different rules apply to each.
2. **Run the artifact through the gates below.** Block or rewrite anything that fails. Surface every fail to the user with the rule cite.
3. **Tell the user which artifacts need licensed-pharmacist or legal review before publish.** Do not silently emit copy that requires human sign-off as if it's ready.

## The compliance gates

### Gate 1 — Therapeutic claims (FDA RR No. 2014-016, RA 7394)

A "therapeutic claim" is any statement that a product treats, cures, prevents, alleviates, mitigates, or affects the structure or function of the body.

- Claims on Rx and OTC medicines must match the **FDA-approved indication on the registered label** verbatim or in substance. Embellishment is illegal.
- "Helps relieve fever and pain" (matches Biogesic FDA indication) — OK.
- "Cures headaches instantly", "Strongest pain relief in the Philippines", "Trusted by doctors nationwide" — **NOT OK** without substantiation and FDA permit for the ad.
- Comparative claims ("better than [competitor]") require head-to-head evidence and FDA pre-clearance.
- Food supplements and herbal products **must carry**: "No approved therapeutic claims." Do not omit this.
- BLOCK: any "miracle", "guaranteed", "100% effective", "doctor recommended" copy unless every word is substantiated.

### Gate 2 — Rx promotion to consumers (FDA RR No. 2014-016, DOH e-pharmacy guidelines)

- **Rx (prescription-only) products cannot be advertised, promoted, or recommended to the general public.** They can be *listed* on the pharmacy site for prescription-holders to purchase, but they cannot be marketed (no promos, no "featured product", no popups, no email blasts, no paid-ads creative, no influencer mention, no SEO landing page that pushes Rx purchase to a non-prescription audience).
- Rx product detail pages must clearly mark "Prescription Required" and route to prescription upload before checkout.
- Refill/reorder emails for Rx may go to **patients who already filled that prescription**, and must include "subject to pharmacist verification of valid prescription."
- BLOCK: any popup, hero banner, programmatic-SEO page, paid ad, social post, lead magnet, email sequence, or SMS targeting an Rx product at a non-patient consumer audience.
- OK: pure informational content on a Rx page (mechanism, indication, common side effects sourced from the FDA-approved leaflet) — informational, not promotional.

### Gate 3 — Controlled / Dangerous drugs (RA 9165, DDB regulations)

- DDB-regulated drugs (narcotics, psychotropics, etc.) **cannot be sold online to walk-in retail and cannot be marketed at all** outside of professional channels.
- BLOCK: any marketing artifact that names a controlled substance, links to a controlled-substance product page, or implies online purchase of a controlled drug.
- Even an SEO page that lists a controlled drug for "informational" purposes must be reviewed by legal — DDB enforcement is strict.

### Gate 4 — Urgency / scarcity / FOMO on medicines (RA 7394, FDA RR No. 2014-016)

Generic CRO playbooks lean hard on urgency. **For medicines, this is illegal or unethical.**

- BLOCK: "Only 3 left!", "Sale ends in 2 hours!", "Limited stock!", countdown timers on a medicine PDP or cart.
- BLOCK: "Buy now before stock runs out" on Rx or OTC.
- BLOCK: implying that delaying a medicine purchase is harmful ("don't wait — your headache could get worse").
- OK: real, factual stock indicators on non-medicine SKUs (vitamins, personal care, medical devices) where stock is genuinely limited and the indicator is accurate.
- OK: cycle/refill reminders that are genuinely health-relevant ("your maintenance med is running low based on your last refill date") — but only to authenticated patient accounts.

### Gate 5 — SC / PWD discount copy (RA 9994, RA 7277, BIR rules)

- The 20% SC discount and 20% PWD discount + VAT exemption are **mandatory by law**, not promos.
- BLOCK: "SC/PWD discount! Limited time only", "Get 20% off — sign up for SC/PWD perks", "Special promo: senior citizen Tuesdays".
- OK: "Senior Citizen and PWD customers receive the legally mandated 20% discount and VAT exemption, applied automatically at checkout once your SC/PWD ID is verified on your profile."
- The discount must be applied automatically when SC/PWD ID is on file — you cannot make customers click a "claim discount" button.
- Receipts must show the discount line and VAT-exempt status. Marketing copy must not contradict the receipt mechanics.

### Gate 6 — Data privacy / consent for marketing comms (RA 10173)

- **Email sequences, SMS, push notifications, and Messenger broadcasts** to patients require explicit, informed, opt-in consent under the Data Privacy Act, with a separate consent for "marketing" distinct from the consent to process the order.
- Transactional emails (order confirmation, shipping update, prescription verification status) do NOT require marketing consent — they are necessary for the contract.
- BLOCK: any cold-email or cold-SMS skill output that scrapes patient lists or assumes consent.
- BLOCK: lead-magnet flows that auto-enroll the email address into marketing without a clear separate checkbox.
- Opt-out / STOP keyword must work in 24h or less. Already wired in this codebase via Phase M1.11 — do not advise the user to send broadcasts that cannot be opted out of.

### Gate 7 — Testimonials, before/after, influencer copy

- Patient testimonials about a specific medicine's efficacy require: (a) written informed consent of the patient, (b) substantiation that the result is typical or a clear "results may vary" disclaimer, (c) FDA permit if used in advertising.
- "I took [Brand] and my [condition] disappeared in 3 days" — **BLOCK** without all three above.
- Before/after photos for medicines — almost always blocked. For non-medicine SKUs (skincare, devices), still requires consent and disclaimer.
- "Doctor recommended", "Pharmacist endorsed", "[Hospital] uses this product" — requires written endorsement on file and the endorser's regulatory body's approval.

### Gate 8 — Programmatic SEO at scale (special hazard)

When the user invokes `programmatic-seo` or generates >10 medicine pages from a template:

- BLOCK auto-publish. Hold all generated pages in a draft/review queue.
- Each page must be reviewed by a licensed pharmacist for: claim accuracy, dose information, side effect completeness, contraindications, and Rx/OTC classification.
- Cite **FDA Drug Product Database** as the source for indication and dosing. Do not let the model invent these.
- Schema markup (`Drug`, `MedicalEntity`) must reflect the FDA-registered values, not the model's guess.

### Gate 9 — Trust signals required on every pharmacy surface

Every pharmacy storefront page that takes orders or collects health data must display:

- FDA License to Operate (LTO) number and DOH accreditation number.
- Licensed pharmacist contact / chat link for prescription questions.
- Privacy Policy and Terms (linked in footer at minimum).
- Data Privacy Act consent banner on first visit.

If the marketing skill output ships without these, flag it.

### Gate 10 — Free tools (interaction checkers, dose calculators)

If the user invokes `free-tool-strategy` or any equivalent for a clinical tool:

- BLOCK auto-build of a drug interaction checker, dose calculator, or symptom checker that is built off model knowledge alone.
- These tools must be backed by a licensed clinical database (Lexicomp, Micromedex, First Databank, or equivalent) and reviewed by a licensed pharmacist.
- Disclaimer required: "Not a substitute for professional medical advice. Consult your doctor or pharmacist."

## Routing — who reviews what before publish

| Artifact type | Required reviewer before going live |
|---|---|
| Therapeutic claim, comparative claim, Rx product copy | Licensed pharmacist + FDA permit if running as paid advertisement |
| SC / PWD pricing copy | Finance lead + compliance officer |
| Programmatic SEO drug pages | Licensed pharmacist (per page or sampling) |
| Cold email / SMS to patient list | Data Privacy Officer (DPO) or compliance |
| Controlled / dangerous drug content | Legal — and default answer is "do not publish" |
| Free clinical tool (interaction checker etc.) | Licensed pharmacist + clinical-DB licensing |
| Influencer / testimonial creative | Compliance + signed consent on file |
| Trust badges, LTO display | Verify against current FDA / DOH records |

## Skill-specific overrides

When the host marketing skill is one of these, apply the matching extra rule:

- **copywriting / copy-editing** — re-read every claim against Gate 1. If product is Rx, re-read against Gate 2. Strip urgency language per Gate 4. Replace "doctor recommended" / "pharmacist endorsed" with substantiated equivalents or remove.
- **page-cro / signup-flow-cro / form-cro** — preserve mandatory disclosures (LTO, DOH, prescription-required notice). Do NOT remove "noisy" trust elements in the name of conversion.
- **popup-cro** — popups on medicine PDPs are restricted: no urgency, no "best deal", no scarcity. Allowed: "Need help? Chat with our pharmacist", "Upload your prescription for faster checkout", "Activate SC/PWD discount on your profile."
- **marketing-psychology** — many tactics in this skill (loss aversion, scarcity, social proof on health outcomes, anchoring on "savings") fail Gates 1, 4, 7. Use only the tactics that survive: clarity, friction reduction, trust-signal density, consistency.
- **programmatic-seo** — apply Gate 8.
- **schema-markup** — `Drug` schema fields (`activeIngredient`, `dosageForm`, `prescriptionStatus`) must come from the FDA Drug Product Database, not invented. `Pharmacy` schema must reflect the actual LTO holder.
- **email-sequence** — apply Gate 6 (consent) and Gate 2 (Rx restrictions on broadcasts). Refill reminders only to authenticated patients with that prescription on file.
- **ad-creative / paid-ads / social-content** — paid ads for medicines may require an FDA advertising permit. Flag and route to compliance before any paid spend.
- **cold-email** — Gate 6. For B2B outreach (hospital procurement, MD partner) consent rules are softer (legitimate interest may apply) but still require an opt-out.
- **lead-magnets / free-tool-strategy** — Gate 10.
- **competitor-alternatives / competitor-profiling** — comparative therapeutic claims need substantiation and FDA permit. Stick to factual, verifiable comparisons (price, packaging size, availability) rather than efficacy.
- **pricing-strategy** — SC/PWD discount is mandatory, not a lever. Bundle pricing on Rx is restricted. Loyalty rewards on Rx need DDB review.
- **referral-program** — paying patients to refer Rx purchases is restricted (and may violate anti-kickback principles). The MD Partner program in this codebase is structured as a disclosed referral fee, not a per-prescription kickback — do not let the skill restructure it without compliance review.

## Output format

When you apply this skill alongside a marketing skill, your final response must include:

1. The marketing artifact itself (corrected per the gates).
2. A "**Compliance review**" section listing:
   - Which gates were applied.
   - Anything that was blocked or rewritten and why (with the rule cite).
   - What requires human review before publish (using the Routing table).
3. If the artifact is not safe to ship without human review, label it clearly: `STATUS: HOLD FOR REVIEW`. Do not call it "done" or "ready to ship".

## What this skill does NOT do

- It does not replace a licensed pharmacist, a DPO, or a compliance officer. It catches the obvious failures and flags the rest. Human review is still mandatory for the routed artifacts.
- It does not freeze the codebase's existing compliance work. The CRM/ERP already enforces SC/PWD discount automation, prescription verification queues, and Phase M1.11 STOP-keyword opt-out. Do not undo those.
- It does not block creativity on non-medicine SKUs (vitamins, devices, personal care, lifestyle products). Those follow the standard marketing-skill rules — but if they make health claims, they re-enter Gate 1.
