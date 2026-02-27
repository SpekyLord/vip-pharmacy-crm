---

# CPT DIG Excel Workbook — Complete Schema Documentation

## Purpose
This document describes the **exact structure** of the CPT (Call Planning Tool) Excel workbook used by VIOS Integrated Projects (VIP) Inc. for pharmaceutical BDM (Business Development Manager) call tracking. Your CRM must be able to **import this exact Excel format** and **export an identical Excel file** so the workflow is never broken.

---

## Workbook Overview

| # | Sheet Name | Purpose | Max Rows × Cols |
|---|-----------|---------|-----------------|
| 1 | WEEKLY SUMMARY | Aggregates engagement data from all 20 day sheets | 24 × 6 |
| 2 | README | Documents sheet linkage rules | 6 × 1 |
| 3 | CALL PLAN - VIP CPT | **Master doctor list** — the single source of truth | 159 × 39 (cols A–AM) |
| 4–23 | W1 D1 through W4 D5 | 20 Daily Call Report (DCR) sheets (4 weeks × 5 days) | ~56 × 20 |

---

## SHEET 1: WEEKLY SUMMARY (sheetId: 1)

### Layout
- **Row 1**: Title: `DCR SUMMARY – TOTAL ENGAGEMENTS, TARGETS, CALL RATE (W1–W4, D1–D5)` (merged A1:F1)
- **Row 2**: Empty
- **Row 3**: Headers (bold, green bg #C6EFCE)
- **Rows 4–23**: Data rows (one per day sheet, 20 total)
- **Row 24**: TOTAL row

### Columns
| Col | Header | Content |
|-----|--------|---------|
| A | Week | W1, W1, W1, W1, W1, W2, W2, ... W4 |
| B | Day | D1, D2, D3, D4, D5, D1, D2, ... D5 |
| C | Sheet | Sheet name: "W1 D1", "W1 D2", etc. |
| D | Total Engagements (L41) | Formula: `='W1 D1'!L41` (references each day sheet) |
| E | Target Engagements (L42) | Formula: `='W1 D1'!L42` |
| F | Call Rate (L43) | Formula: `='W1 D1'!L43` |

### Row 24 (Totals)
- D24: `=SUM(D4:D23)`
- E24: `=SUM(E4:E23)`
- F24: `=IF(E24=0,"",D24/E24)`

### Frozen: 3 rows frozen, all columns frozen

---

## SHEET 2: README (sheetId: 2)

Plain text documentation (5 rows in column A):

Row 1: "Merged and Interconnected Workbook (VIP CPT Flags E..X → DCR Day Sheets)"
Row 2: (empty)
Row 3: "Source: CALL PLAN - VIP CPT"
Row 4: "Rule: Day 1 uses Column E = 1; Day 2 uses Column F = 1; ... Day 20 uses Column X = 1"
Row 5: "Destination: W1 D1 (Day 1) ... W4 D5 (Day 20)"
Row 6: "Start cell per destination sheet: C11 (Lastname=C, Firstname=D, VIP Specialty=E)"

---

## SHEET 3: CALL PLAN - VIP CPT (sheetId: 3) — THE MASTER SHEET

This is the **most critical sheet**. It contains the complete doctor/VIP list and controls which doctors appear on which day sheets.

### Top Section (Rows 1–7): Metadata & Configuration

#### Rows 1–3: Counts (Columns A–D)
| Cell | Content | Formula/Value |
|------|---------|---------------|
| A1 | "Total No. Of 2X " | Label |
| C1 | Count | `=AB2` (count of VIPs with 2 visits) |
| A2 | "Total No. Of 4X " | Label |
| C2 | Count | `=AB3` (count of VIPs with 4 visits) |
| D2 | "Minimum of 20 VIP" | Validation note |
| A3 | "Total No. of VIP" | Label |
| C3 | Count | `=AB4` (total) |
| D3 | "Minimum of 130 VIP" | Validation note |

#### Row 4: Month/Year and Day Headers
| Cell | Content |
|------|---------|
| A4 | "CALL PLANNING TOOL (CPT) :" |
| C4 | "Month/Year:" |
| D4 | "mm/dd" (user inputs actual date) |
| E4 | "Day1" |
| F4 | "Day2" |
| ... | ... |
| X4 | "Day20" |

#### Row 5: VIP per Day Counts
| Cell | Formula |
|------|---------|
| C5 | "VIP CUSTOMER (VIP) per Day :" |
| E5 | `=COUNTIF(E9:E299,1)` |
| F5 | `=COUNTIF(F9:F299,1)` |
| ... | (same pattern for each day column) |
| X5 | `=COUNTIF(X9:X299,1)` |

#### Row 6: Territory
| Cell | Content |
|------|---------|
| A6 | "NAME:" |
| C6 | "Teritorry" (user fills this in) |

#### Row 7: Column type indicators
| Cols | Value | Meaning |
|------|-------|---------|
| A7 | "NO." | Row number |
| B7 | "In Alphabetical Order" | Sort instruction |
| C7–D7 | "Free Input" | User-typed data |
| E7–I7 | "mon", "tue", "wed", "thu", "fri" | Week 1 day labels |
| J7–N7 | "mon", "tue", "wed", "thu", "fri" | Week 2 day labels |
| O7–S7 | "mon", "tue", "wed", "thu", "fri" | Week 3 day labels |
| T7–X7 | "mon", "tue", "wed", "thu", "fri" | Week 4 day labels |
| Y7–Z7 | "Auto", "Auto" | Calculated columns |
| AA7–AB7 | "Free Input", "Free Input" | User data |
| AC7, AD7, AH7 | "DROP DOWN" | Dropdown selections |

### Row 8: Column Headers (the actual field names)

| Column | Header | Data Type | Description |
|--------|--------|-----------|-------------|
| A (col 1) | — (row numbers in data) | Integer | Sequential row number (1, 2, 3...) |
| B (col 2) | LASTNAME | Text | Doctor's last name |
| C (col 3) | FIRSTNAME | Text | Doctor's first name |
| D (col 4) | VIP SPECIALTY | Text | Medical specialty (e.g., "Im", "Surg", "Pedia", "Oby") |
| E (col 5) | — (Day 1) | 1 or blank | Put "1" if VIP should be visited on Day 1 |
| F (col 6) | — (Day 2) | 1 or blank | Put "1" if VIP should be visited on Day 2 |
| G (col 7) | — (Day 3) | 1 or blank | Day 3 flag |
| H (col 8) | — (Day 4) | 1 or blank | Day 4 flag |
| I (col 9) | — (Day 5) | 1 or blank | Day 5 flag |
| J (col 10) | — (Day 6) | 1 or blank | Day 6 flag |
| K (col 11) | — (Day 7) | 1 or blank | Day 7 flag |
| L (col 12) | — (Day 8) | 1 or blank | Day 8 flag |
| M (col 13) | — (Day 9) | 1 or blank | Day 9 flag |
| N (col 14) | — (Day 10) | 1 or blank | Day 10 flag |
| O (col 15) | — (Day 11) | 1 or blank | Day 11 flag |
| P (col 16) | — (Day 12) | 1 or blank | Day 12 flag |
| Q (col 17) | — (Day 13) | 1 or blank | Day 13 flag |
| R (col 18) | — (Day 14) | 1 or blank | Day 14 flag |
| S (col 19) | — (Day 15) | 1 or blank | Day 15 flag |
| T (col 20) | — (Day 16) | 1 or blank | Day 16 flag |
| U (col 21) | — (Day 17) | 1 or blank | Day 17 flag |
| V (col 22) | — (Day 18) | 1 or blank | Day 18 flag |
| W (col 23) | — (Day 19) | 1 or blank | Day 19 flag |
| X (col 24) | — (Day 20) | 1 or blank | Day 20 flag |
| Y (col 25) | Count of 1s (E:X) | Auto-calc | `=COUNTIF(E{row}:X{row},1)` — must be 2 or 4 |
| Z (col 26) | Status | Auto-calc | `=IF((COUNTIF(E{row}:X{row},"<>1")-COUNTBLANK(E{row}:X{row}))>0,"INVALID",IF(OR(Y{row}=2,Y{row}=4),"OK","CHECK"))` |
| AA (col 27) | CLINIC/ OFFICE ADDRESS | Text | Full address |
| AB (col 28) | OUTLET INDICATOR | Text | Hospital/outlet code (e.g., "MMC", "AMC", "IMH", "CDH", "PHC", "APMC, PHC") |
| AC (col 29) | PROGRAMS TO BE IMPLEMENTED | Dropdown | Options: "CME GRANT", "REBATES/ MONEY", "REST AND RECREATION ", "MED SOCIETY PARTICIPATION" |
| AD (col 30) | SUPPORT DURING COVERAGE | Dropdown | Options: "STARTER DOSES", "PROMATS", "FULL DOSE", "PATIENT DISCOUNT", "AIR FRESHENER" |
| AE (col 31) | TARGET PRODUCT 1 | Text | Product name |
| AF (col 32) | TARGET PRODUCT 2 | Text | Product name |
| AG (col 33) | TARGET PRODUCT 3 | Text | Product name |
| AH (col 34) | LEVEL OF ENGAGEMENT | Dropdown | See dropdown list below |
| AI (col 35) | NAME OF SECRETARY | Text | Secretary name |
| AJ (col 36) | CP # OF SECRETARY | Text | Secretary phone number |
| AK (col 37) | BIRTHDAY | Date/Text | Doctor's birthday |
| AL (col 38) | ANNIVERSARY | Date/Text | Doctor's anniversary |
| AM (col 39) | OTHER DETAILS | Text | Free-form notes |

### Data Rows (Row 9 onward)
- Data starts at **row 9**
- Each row = one VIP doctor
- Currently 67 doctors (rows 9–75)
- Rows 76–158 are empty placeholder rows (formulas in Y and Z still present, showing 0 and "CHECK")
- **Row 159**: Sentinel row — all cells in A–Z contain "END" (red background #FF0000)

### Day-to-Column Mapping (CRITICAL for import/export)

| Day | CPT Column | Day Sheet | Week | Day-of-Week |
|-----|-----------|-----------|------|-------------|
| Day 1 | E | W1 D1 | 1 | Monday |
| Day 2 | F | W1 D2 | 1 | Tuesday |
| Day 3 | G | W1 D3 | 1 | Wednesday |
| Day 4 | H | W1 D4 | 1 | Thursday |
| Day 5 | I | W1 D5 | 1 | Friday |
| Day 6 | J | W2 D1 | 2 | Monday |
| Day 7 | K | W2 D2 | 2 | Tuesday |
| Day 8 | L | W2 D3 | 2 | Wednesday |
| Day 9 | M | W2 D4 | 2 | Thursday |
| Day 10 | N | W2 D5 | 2 | Friday |
| Day 11 | O | W3 D1 | 3 | Monday |
| Day 12 | P | W3 D2 | 3 | Tuesday |
| Day 13 | Q | W3 D3 | 3 | Wednesday |
| Day 14 | R | W3 D4 | 3 | Thursday |
| Day 15 | S | W3 D5 | 3 | Friday |
| Day 16 | T | W4 D1 | 4 | Monday |
| Day 17 | U | W4 D2 | 4 | Tuesday |
| Day 18 | V | W4 D3 | 4 | Wednesday |
| Day 19 | W | W4 D4 | 4 | Thursday |
| Day 20 | X | W4 D5 | 4 | Friday |

### Visit Frequency Rules
- Each VIP must have EXACTLY **2** or **4** "1"s across columns E–X
- **2X VIPs**: Visited twice per month (2 ones spread across 20 days)
- **4X VIPs**: Visited four times per month (4 ones spread across 20 days, typically one per week on the same day-of-week)
- The pattern for 4X is usually: same day in each of the 4 weeks (e.g., Day1, Day6, Day11, Day16 = all Mondays)

### Summary Section (Columns AA–AB, Rows 1–4)
| Cell | Content |
|------|---------|
| AA1 | "SUMMARY" (bold) |
| AA2 | "C1: Count of VIPs with 2" |
| AB2 | `=COUNTIF($Y$9:$Y$158,2)` → Currently 0 |
| AA3 | "C2: Count of VIPs with 4" |
| AB3 | `=COUNTIF($Y$9:$Y$158,4)` → Currently 67 |
| AA4 | "C3: Total (2 or 4)" |
| AB4 | `=$AB$2+$AB$3` → Currently 67 |

### Dropdown Reference Lists (stored in the CPT sheet itself)

**Programs (AC column)** — values in AC2:AC5:
- CME GRANT
- REBATES/ MONEY
- REST AND RECREATION
- MED SOCIETY PARTICIPATION

**Support (AD column)** — values in AD2:AD6:
- STARTER DOSES
- PROMATS
- FULL DOSE
- PATIENT DISCOUNT
- AIR FRESHENER

**Level of Engagement (AH column)** — values in AH2:AH6:
- 1- The VIP was visited 4 times
- 2- The VIP knows the BDM or the product/s
- 3- The VIP tried the products
- 4- The VIP is in the group chat (GC)
- 5- The VIP is an active and established partner

### Color Coding (CPT Sheet)

| Area | Background Color | Meaning |
|------|-----------------|---------|
| Row numbers (col A) | #DDD9C4 (tan) | Row identifiers |
| Day columns E–I (Week 1) | #FFFF00 (yellow) | Week 1 schedule |
| Day columns J–N (Week 2) | #A6A6A6 (gray) | Week 2 schedule |
| Day columns O–S (Week 3) | #FFFF00 (yellow) | Week 3 schedule |
| Day columns T–X (Week 4) | #A6A6A6 (gray) | Week 4 schedule |
| Day headers E4:X4 | #8DB4E2 (blue) | Day number labels |
| Row 159 (END) | #FF0000 (red) | Sentinel/boundary row |
| Column headers row 8 | #FFFF00 (yellow) for AA–AM | Field names |
| Count/Status Y–Z | #FFFFFF (white) | Auto-calculated |
| Empty rows Y–Z with CHECK | #FFC7CE (light red) | Validation error indicator |
| Dropdown type indicators (row 7) | #FF0000 (red) for AC7, AD7, AH7 | "DROP DOWN" labels |

---

## SHEETS 4–23: DAILY CALL REPORT (DCR) — Day Sheets

All 20 day sheets share an **identical structure**. The only differences are:
1. Which doctors appear (based on CPT day flags)
2. The Week/Day number in the header

### Sheet Naming Convention
Format: `W{week} D{day}` where week = 1–4, day = 1–5

Sheet IDs: 4 (W1 D1), 5 (W1 D2), ..., 23 (W4 D5)
Formula: `sheetId = 3 + (week - 1) * 5 + day`

### Layout Structure

#### Header Section (Rows 1–10)
- Row 1: "VIOS INTEGRATED PROJECTS (VIP) INC." (bold, 16pt, merged A1:T1)
- Row 2: "DAILY CALL REPORT (DCR)" (bold, 14pt, merged A2:T2)
- Row 3: "BDM:" (bold) + user input
- Row 4: "Area:" (bold) + user input
- Row 5: "Week: " (bold) + {week#} in B5 + "Day: {day#}" in C5
- Row 6: "Date:" (bold) + user input
- Row 7: Red text instruction about typing "1"
- Row 8: "COUNT" | "Name of VIP Customer" | "Splty" | "FREQ" | "TYPE OF ENGAGEMENT" | "TOTAL" | "DM's Signature" | "DATE"
- Row 9: Sub-headers: "TXT/ PROMATS" | "MES/ VIBER GIF" | "PICTURE" | "SIGNED CALL" | "VOICE CALL" | | | "COVERED"
- Row 10: | | | | | | | | | "mm/dd/yy"

#### Column Structure (per day sheet)
| Column | Letter | Content |
|--------|--------|---------|
| Count/Row # | A | Sequential number (1, 2, 3...) |
| (empty) | B | Empty spacer |
| Lastname | C | Doctor's last name (from CPT col B) |
| Firstname | D | Doctor's first name (from CPT col C) |
| Specialty | E | VIP Specialty (from CPT col D) |
| Frequency | F | (FREQ — usually empty) |
| TXT/ PROMATS | G | Type "1" for this engagement type |
| MES/ VIBER GIF | H | Type "1" for this engagement type |
| PICTURE | I | Type "1" for this engagement type |
| SIGNED CALL | J | Type "1" for this engagement type |
| VOICE CALL | K | Type "1" for this engagement type |
| TOTAL | L | Formula: `=G{row}+H{row}+I{row}+J{row}+K{row}` |
| (empty) | M | Spacer |
| (empty) | N | Spacer / "Checked by:" label (row 12) |
| (empty) | O | Spacer |
| DM's Signature | P | Signature area (header only) |
| (empty) | Q–S | Spacer |
| DATE COVERED | T | "OK" or actual date (mm/dd/yy format) |

#### Data Section (Rows 11–40)
- Row 11: First doctor
- Doctors are listed based on which VIPs have a "1" in the corresponding CPT day column
- Row 11 to row (10 + number of VIPs for that day): Filled doctor rows
- Remaining rows through 40: Empty but with TOTAL formula in column L
- Max capacity: 30 doctors per day (rows 11–40)

#### Summary Section (Rows 41–43)
| Cell | Content | Formula |
|------|---------|---------|
| A41 | "TOTAL NUMBER OF ENGAGEMENTS:" | Label (bold, right-aligned) |
| L41 | Total | `=SUM(L11:L40)` |
| A42 | "TARGET NUMBER OF ENGAGEMENTS:" | Label (bold, right-aligned, RED background) |
| L42 | Target count | `=COUNTA(C11:C300)` (counts non-empty names) |
| A43 | "CALL RATE:" | Label (bold, right-aligned) |
| L43 | Rate | `=L41/L42` |

#### EXTRA CALL Section (Rows 44–50)
- Row 44: "EXTRA CALL (VIP NOT INCLUDED IN THE LIST)" header (bold, red bg) + "TYPE OF ENGAGEMENT"
- Row 45: "NO." + engagement type sub-headers (same as row 9)
- Rows 46–50: Empty rows for extra/unplanned calls

#### Notes Section (Rows 51–56)
- Row 53: "Note:"
- Row 54: "1. Type OK in the Date Covered portion if you covered the VIP Customer on target date"
- Row 55: "2. Input the correct date if you were not able to cover the VIP Customer on the target date"

### Date Covered Field (Column T, rows 11 onward)
- **"OK"** = VIP was covered on the target/planned date
- **"mm/dd/yy"** format (e.g., "01/12/26") = VIP was covered on a different date
- **Empty** = Not yet covered

### How Doctors Get Assigned to Day Sheets

**This is the critical linkage:**

1. In the CPT sheet, each doctor has "1" flags in columns E through X
2. Column E = Day 1 → doctors with E=1 appear on sheet "W1 D1"
3. Column F = Day 2 → doctors with F=1 appear on sheet "W1 D2"
4. ...and so on through Column X = Day 20

---

**The doctors in each day sheet are currently STATIC VALUES (not formulas).** They were manually placed or copied. The CRM should:
- On **IMPORT**: Read the CPT sheet's day flags (E–X) to know which doctor goes where, AND read the day sheets for engagement data (G–K columns) and date covered (T column)
- On **EXPORT**: 
  1. Write the CPT sheet with all doctor info and day flags
  2. Generate each day sheet by filtering doctors where the corresponding day column = 1
  3. Populate engagement data and date covered from CRM data

---

## DATA RELATIONSHIPS & IMPORT/EXPORT LOGIC

### Import Logic (Excel → CRM)

#### Step 1: Parse CPT Master Sheet (sheetId: 3)
Read rows 9 through the row BEFORE the "END" sentinel row (row 159):
```
For each row where column B (LASTNAME) is not empty:
  doctor = {
    row_number: col A (integer),
    lastname: col B,
    firstname: col C,
    specialty: col D,
    day_flags: [col E, col F, ..., col X],  // array of 20 values, each 1 or blank
    visit_count: col Y (auto-calculated, should be 2 or 4),
    status: col Z (should be "OK"),
    clinic_address: col AA,
    outlet_indicator: col AB,
    program: col AC,
    support: col AD,
    target_product_1: col AE,
    target_product_2: col AF,
    target_product_3: col AG,
    engagement_level: col AH,
    secretary_name: col AI,
    secretary_phone: col AJ,
    birthday: col AK,
    anniversary: col AL,
    other_details: col AM
  }
```

#### Step 2: Parse Day Sheets (sheetIds: 4–23)
For each day sheet (20 total):
```
For each row from 11 to 40 where column C is not empty:
  engagement = {
    lastname: col C,
    firstname: col D,
    specialty: col E,
    txt_promats: col G (1 or blank),
    mes_viber_gif: col H (1 or blank),
    picture: col I (1 or blank),
    signed_call: col J (1 or blank),
    voice_call: col K (1 or blank),
    total: col L (formula result),
    date_covered: col T ("OK" or date string)
  }
```

Also read Extra Calls from rows 46–50 if populated.

#### Step 3: Parse WEEKLY SUMMARY (sheetId: 1)
Read metadata:
- Row 4–23: One row per day sheet
- D column = Total Engagements
- E column = Target Engagements
- F column = Call Rate

### Export Logic (CRM → Excel)

The export must produce an **identical structure** to the original workbook.

#### Generate CPT Sheet:
1. Write header rows 1–8 exactly as documented above
2. Write doctor data starting at row 9, sorted alphabetically by LASTNAME
3. Fill day flag columns E–X based on CRM scheduling data
4. Include formulas in Y (COUNTIF) and Z (validation)
5. Fill AA–AM with doctor profile data
6. Fill empty rows with formulas through row 158
7. Write "END" sentinel row at row 159
8. Write summary formulas in AB2:AB4
9. Write dropdown reference values in AC2:AC5, AD2:AD6, AH2:AH6

#### Generate Day Sheets:
For each of the 20 days (dayIndex 0–19, CPT column = E + dayIndex):
1. Create sheet named `W{week} D{dayOfWeek}` where:
   - week = Math.floor(dayIndex / 5) + 1
   - dayOfWeek = (dayIndex % 5) + 1
2. Write header rows 1–10 (identical template, only B5 and C5 change)
3. Filter doctors from CPT where column (E + dayIndex) = 1
4. Write filtered doctors to rows 11+ (C=lastname, D=firstname, E=specialty)
5. Write engagement data from CRM (G–K columns)
6. Write TOTAL formula in L column: `=G{row}+H{row}+I{row}+J{row}+K{row}`
7. Write date covered in T column ("OK" or date)
8. Fill remaining rows through 40 with empty rows (but still include L formula)
9. Write summary rows 41–43 with formulas
10. Write EXTRA CALL section rows 44–50
11. Write Notes section rows 51–56

#### Generate WEEKLY SUMMARY:
1. Write header
2. Write 20 rows referencing each day sheet's L41, L42, L43
3. Write TOTAL row with SUM formulas

#### Generate README:
Write the 6 documentation rows.

---

## PRODUCT NAMES (found in data)
- Viptriaxone
- Viprazole
- Vitazol
- Vitral
- Vitaroxima
- Pantrex
- Losil
- Ceftazivit
- Cefazovit
- Merpenem
- Axagyl

## OUTLET INDICATORS (found in data)
- MMC
- AMC
- IMH
- CDH
- PHC
- APMC, PHC (can be comma-separated for multiple)

## SPECIALTIES (found in data)
- Im (Internal Medicine)
- Im Car (Internal Medicine - Cardiology)
- Im Diab (Internal Medicine - Diabetology)
- Im Pulmo (Internal Medicine - Pulmonology)
- Surg (Surgery)
- Coloretal Surg / Colorectal Surg
- Nuero Surg (Neurosurgery)
- Breast Surg
- Pediatric Surg / Pedia Surg
- Ftacsi Surg
- Pedia / Peda (Pediatrics)
- Pedia Hema (Pediatric Hematology)
- Oby (Obstetrics)
- Fm (Family Medicine)
- Anes (Anesthesiology)
- Pharmacist
- Purchaser / Puchaser
- Csr (Customer Service Representative)
- Medical Director/Surg
- (Hospital) President (e.g., "Sunga President", "Mabama President", "Matanao Hospital President")

---

## FORMATTING SPECIFICATIONS (for pixel-perfect export)

### Font
- Default: Arial, 10pt, black (#000000)
- Day sheet company name: Arial, 16pt, bold
- Day sheet DCR title: Arial, 14pt, bold
- Day sheet doctor names: Arial, 9pt
- Day sheet COUNT column: Arial, 7-8pt, center-aligned
- Day sheet engagement sub-headers: Arial, 8pt, bold

### Borders
- CPT data rows: thin solid #000000 on all sides
- CPT END row: top thin solid #000000
- Day sheet: medium solid #000000 on outer borders, thin solid #000000 on inner cells
- Summary cells: medium solid #000000

### Number Formatting
- Day flags: plain numbers (1 or empty)
- Call Rate (L43): decimal or percentage
- Dates: mm/dd/yy format

---

## KEY VALIDATION RULES
1. Each VIP must have exactly 2 or 4 "1"s in columns E–X (no other values allowed)
2. Column Y auto-counts the 1s; Column Z validates (OK/INVALID/CHECK)
3. The "END" row must always exist as the last row boundary
4. Day sheet L42 formula counts non-empty cells in C11:C300 (dynamic target count)
5. Day sheet L41 sums all engagement totals
6. WEEKLY SUMMARY references are hard-coded to specific sheet names — sheet names must be exact

---

## CRITICAL NOTES FOR IMPORT/EXPORT

1. **Doctor data in day sheets are STATIC VALUES, not formulas** — they were copy-pasted from CPT. Your export must write them as values too.

2. **The CPT is the single source of truth** for doctor info. Day sheets only contain: name, specialty, engagements, and date covered.

3. **Row ordering**: CPT is sorted alphabetically by LASTNAME. Day sheets list doctors in the same alphabetical order as they appear in the CPT (filtered for that day).

4. **Empty rows matter**: The CPT has 150 placeholder rows (9–158) even if only 67 are used. Day sheets have 30 slots (rows 11–40). The TOTAL formulas reference these full ranges.

5. **The "END" sentinel row** must be at a fixed position (row 159 = data row 151). Do NOT move it.

6. **Formulas in unused rows**: Even empty CPT rows have Y and Z formulas. These show 0 and "CHECK" respectively.

7. **Column T (Date Covered) in day sheets**: Can be "OK" (text), a date string, or empty. Not a formula.

8. **Week/Day in day sheet headers**: B5 = week number (integer), C5 = "Day: {number}" (text)

## IMPORT-TO-DATABASE MAPPING (Excel → CRM Models)

### The Full Admin Upload Flow

1. **BDM** fills out the Excel CPT (~quarterly) and gives it to Admin
2. **Admin** receives file (email or in person), reviews it manually
3. **Admin** uploads it in the CRM under a specific BDM's name
4. System stages it as an `ImportBatch` (status: `pending`)
5. **Admin** reviews the staged preview in the CRM
6. **Admin** clicks Approve (or Reject with reason)
7. On APPROVE → system writes to the database:
   - Creates/updates Doctor (VIP Client) records
   - Creates/updates Schedule records for that BDM
   - Links everything to the BDM the admin selected

### Excel Field → Doctor Model Mapping

| Excel Column | CPT Field | Doctor Model Field | Notes |
|---|---|---|---|
| Col B | LASTNAME | `lastName` | Split from old `name` field |
| Col C | FIRSTNAME | `firstName` | Split from old `name` field |
| Col D | VIP SPECIALTY | `specialization` | Free-form text |
| Col AA | CLINIC/ OFFICE ADDRESS | `clinicAddress` | |
| Col AB | OUTLET INDICATOR | `outletIndicator` | e.g. MMC, AMC, IMH |
| Col AC | PROGRAMS TO BE IMPLEMENTED | `programs` | Dropdown value |
| Col AD | SUPPORT DURING COVERAGE | `support` | Dropdown value |
| Col AE | TARGET PRODUCT 1 | `targetProducts[0]` | Product name string |
| Col AF | TARGET PRODUCT 2 | `targetProducts[1]` | Product name string |
| Col AG | TARGET PRODUCT 3 | `targetProducts[2]` | Product name string |
| Col AH | LEVEL OF ENGAGEMENT | `engagementLevel` | 1–5 integer (parse from "1- The VIP was visited..." → 1) |
| Col AI | NAME OF SECRETARY | `secretaryName` | |
| Col AJ | CP # OF SECRETARY | `secretaryPhone` | |
| Col AK | BIRTHDAY | `birthday` | |
| Col AL | ANNIVERSARY | `anniversary` | |
| Col AM | OTHER DETAILS | `otherDetails` | |
| Cols E–X count | visitFrequency | `visitFrequency` | Count of 1s per row: 2 = 2x, 4 = 4x |

### Excel Field → Schedule Model Mapping

| Excel Data | Schedule Field | Notes |
|---|---|---|
| Col B + C (name) | `doctor` (ObjectId) | Looked up by name match |
| BDM selected by admin | `assignedTo` (ObjectId) | The BDM this schedule belongs to |
| Cols E–X (day flags) | `dayFlags[0..19]` | Array of 20 booleans |
| Col Y (count) | `visitFrequency` | 2 or 4 |
| ImportBatch ID | `importBatch` | Reference to the batch |

### Duplicate Detection Rule
- Match by `lastName + firstName` (case-insensitive)
- If found: OVERWRITE all fields with warning shown to admin
- If not found: CREATE new Doctor record
- Doctor is then linked to the BDM (`assignedTo`)

### ImportBatch Model (needed for Phase C)
```javascript
{
  uploadedBy: ObjectId,      // Admin who uploaded
  assignedToBDM: ObjectId,   // BDM this CPT belongs to
  fileName: String,
  status: 'pending' | 'approved' | 'rejected',
  rejectionReason: String,
  doctorCount: Number,        // Total VIP Clients in file
  duplicateCount: Number,     // How many will be overwritten
  rawData: Array,             // Parsed Excel rows (staged)
  approvedAt: Date,
  createdAt: Date
}