# User Study Plan — Decisions & Action Items

## Study Design Summary

**Type:** Within-subjects A/B comparison (each participant uses both systems)
**Conditions:**
- **System A (Baseline):** Plan visible (read-only), learner model hidden
- **System B (Full System):** Plan visible + editable, learner model visible + editable

**Topics:** Quantum Entanglement, CRISPR Gene Editing
**Counterbalancing:** Latin square, cycles every 4 participants
**Session length:** ~45 min (15 min per system)
**Participants:** ~10 university students
**Measures:** Perceived experience (Likert + open-ended), interaction logs. No learning gain measurement.

---

## Counterbalancing Matrix

| Group | Participants     | 1st System | 1st Topic | 2nd System | 2nd Topic |
|-------|-----------------|------------|-----------|------------|-----------|
| 1     | P1, P5, P9...   | Baseline   | Quantum   | Full       | CRISPR    |
| 2     | P2, P6, P10...  | Baseline   | CRISPR    | Full       | Quantum   |
| 3     | P3, P7, P11...  | Full       | Quantum   | Baseline   | CRISPR    |
| 4     | P4, P8, P12...  | Full       | CRISPR    | Baseline   | Quantum   |

Assignment: Group = ((participant_number - 1) mod 4) + 1

---

## Final Questionnaire

### Per-System (5-point Likert, after each system)

1. "I felt in control of my learning process." — perceived control
2. "I understood what the system was doing and why." — transparency
3. "I trusted the system to guide my learning effectively." — trust
4. "I felt like I was learning effectively." — perceived learning
5. "Using this system required a lot of mental effort." — cognitive load (reverse-scored)

Open-ended: "Any immediate reactions to this system?"

### Comparative (open-ended, end of session, funnel structure)

1. "Which system did you prefer for learning, and why?"
2. "What differences did you notice between the two systems?"
3. "One system let you modify the tutoring plan, while the other only let you view it. Did this matter to you? Why or why not?"
4. "One system showed you what it believed about your understanding of each topic. What did you think about that?"
5. "Would you use either of these systems for actual studying? How?"

Questions 1-2 are unprompted (capture unbiased impressions).
Questions 3-4 probe specific differentiating features.
No version-dependent wording needed.

---

## Microsoft Form Structure

Researcher fills: participant ID and system/topic fields.
Participant fills: everything else.

**Section 1 — Session Info**
- Participant ID (short text, required)
- Paste interaction traces from System 1 (long text, not required)

**Section 2 — System 1 Questionnaire**
- "Which system/topic did you just use?" (short text, researcher fills)
- 5 Likert items (rating scale 1-5 each)
- Open-ended: "Any immediate reactions to this system?" (long text, not required)

**Section 3 — Paste traces from System 2**
- Paste interaction traces from System 2 (long text, not required)

**Section 4 — System 2 Questionnaire**
- "Which system/topic did you just use?" (short text, researcher fills)
- Same 5 Likert items
- Same open-ended

**Section 5 — Comparative**
- 5 open-ended questions (long text each)

---

## Email to Supervisor

**Subject:** Recruitment email + booking link for user study

Hi [professor name],

Here's the recruitment email for the user study, ready for you to forward on Monday.

I've also set up a Microsoft Bookings page for scheduling: [booking link]. Participants pick a slot that works for them and I get notified.

One thing about the room: I can't book the same room for two full weeks in advance, so I left it out of the email. My plan is to book a room once I see which slots people have chosen, and email them the location the day before their session. If you think there's a better way to handle this, let me know.

The email is below. If it looks good, feel free to send it as is. If you'd like changes, just let me know.

Thanks,
Francesco

---

## Recruitment Email (Final)

**Subject:** Try two AI tutoring systems for my dissertation (~45 min, snacks provided)

Hi everyone,

I'm Francesco, a 4th year AI & CS student. For my dissertation I built an AI tutoring system and I need people to test it.

You'll try two different AI tutors that teach you about quantum entanglement or CRISPR gene editing (no prior knowledge needed). The session takes about 45 minutes, in person on campus, and I'll walk you through everything.

**Book a slot here:** [Bookings link]

Sessions run during Flexible Learning Week and the week after. I'll confirm the exact room once you've booked. Snacks provided.

Questions? Email me at [your email].

Thanks,
Francesco

---

## Session Procedure (Cheat Sheet)

| Time    | What to do |
|---------|-----------|
| 0-2 min | Welcome. Explain: "You'll try two AI tutoring systems and share your impressions. I'm evaluating the systems, not you. Honest feedback, including negative, is what I need." |
| 2-3 min | Consent. Review anonymisation, data handling, right to withdraw. |
| 3-4 min | Open Microsoft Form. Fill in participant ID and first system/topic. Hand prompt card. |
| 4-19 min | System 1 (15 min). Stay silent unless technical issue. |
| 19-22 min | Participant pastes traces. Fills System 1 questionnaire in MS Form. |
| 22-23 min | Break. Configure second system. Fill system/topic field in MS Form. |
| 23-38 min | System 2 (15 min). |
| 38-41 min | Participant pastes traces. Fills System 2 questionnaire in MS Form. |
| 41-45 min | Participant fills comparative questionnaire. Debrief. |

---

## Action Items (Manual)

### Before Monday 12:30 (email deadline)
- [ ] Set up Microsoft Bookings (outlook.office.com/bookings)
  - Service: "User Testing Session", 45 min + 15 min buffer
  - Availability: 10:00-17:00, Mon-Fri
  - Date range: Flexible Learning Week + week after
  - Add your classes to Outlook calendar so they block automatically
- [ ] Get the Bookings link
- [ ] Send email draft to professor with the Bookings link and your email filled in

### Before first participant
- [ ] Create Microsoft Form with the structure above
- [ ] Test the full flow end-to-end (both systems, copy-paste, form submission)
- [ ] Prepare two prompt cards (quantum entanglement, CRISPR)
- [ ] Print participant info sheet and consent form (appendices B and C in thesis)
- [ ] Buy snacks

### Ongoing
- [ ] Book a room for each confirmed slot (email participant the room the day before)
- [ ] After each session: verify form submission looks correct
- [ ] Collect all data by end of February

### Thesis writing
- [x] Human study protocol section (done, Section 5.7)
- [x] Fixed references to human study throughout thesis
- [x] Added Braun & Clarke and Wilcoxon citations
- [ ] Run automated evaluation (ablation study)
- [ ] Write Results chapter (Chapter 6)
- [ ] Write Conclusions chapter (Chapter 8)
- [ ] Trim to 40 pages
- [ ] Rename Overleaf project (done)
- [ ] First draft to professor by week 9 (mid-March)
- [ ] Final submission: April 2

---

## Timeline

| When | What |
|------|------|
| This weekend | Send email draft to professor. Set up Bookings + MS Form. |
| Monday 12:30 | Professor sends recruitment email. |
| Flexible Learning Week | Run sessions. Keep iterating on system. |
| Week after FLW | More sessions if needed. |
| End of February | All data collected. |
| Week 9 (mid-March) | First draft to professor. |
| April 2 | Final submission. |
