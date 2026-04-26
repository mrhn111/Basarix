# Başarıx — CLAUDE.md

## Project Overview
Başarıx is a Turkish exam tracking and AI-powered study recommendation web app for middle and high school students (grades 7-12). Students log their exam results, and the app detects weak topics and tells them exactly what to study each day.

**Target users:** Turkish students preparing for LGS, TYT, AYT, and regular school yazılı exams.
**Language:** Turkish (all UI text must be in Turkish)
**Platform:** Mobile-first web app (no app store)

---

## Tech Stack
- **Framework:** Next.js (App Router)
- **Styling:** Tailwind CSS
- **Database + Auth:** Supabase
- **AI:** Gemini API (gemini-flash, free tier)
- **Deployment:** Netlify

---

## Core Features

### 1. Exam Logging
- User creates an exam and picks a type: `yazılı`, `deneme`, `lgs`, `tyt`, `ayt`
- User selects subjects and topics from the MEB müfredat
- User sets a date (past or future)
  - Past date → immediately log results
  - Future date → saved as upcoming, banner shown after date passes
- Results logged per topic: doğru / yanlış / boş counts
- Each wrong answer tagged as either `bilgi_eksikliği` or `dikkat_hatası`

### 2. Weak Topic Detection
- AI (Gemini) analyzes exam history
- Only flags `bilgi_eksikliği` wrongs as topics to study
- `dikkat_hatası` wrongs are tracked separately — not pushed as study topics
- Runs once per day per user to stay within free API limits

### 3. Daily Study Recommendation
- Shown on home screen as an AI card
- Lists top weak topics to focus on today
- Based on cumulative exam history, not just latest exam

---

## Exam Types
- **Yazılı** — school written exam, custom topic selection
- **Deneme** — practice exam, custom topic selection
- **LGS** — only available for grade 8 students
- **TYT** — only available for grade 12 students
- **AYT** — only available for grade 12 students, requires alan selection (Sayısal / Sözel / EA / Dil)

Alan selection for 12th graders happens at first TYT/AYT exam creation, not during onboarding.

---

## Database Schema

```sql
-- Users
users (id, email, grade int, alan text nullable, is_guest bool, created_at)

-- MEB Müfredat (populated manually)
mufredat (id, grade int, subject text, unit text, topic text)

-- Exams
exams (id, user_id fk users, type text, date date, is_completed bool)

-- Topics selected for each exam
exam_topics (id, exam_id fk exams, mufredat_topic_id fk mufredat)

-- Results per topic
exam_results (id, exam_topic_id fk exam_topics, dogru int, yanlis int, bos int)

-- Wrong answer tags
wrong_tags (id, exam_result_id fk exam_results, tag text, count int)
```

RLS must be enabled on all tables. Users can only access their own data.

---

## App Structure

### Pages
- `/` — Home (greeting, AI study card, stats, recent exams, add exam button)
- `/exam/new` — Add exam flow (type → topics → date → results if past)
- `/exam/[id]` — Exam detail and result logging
- `/analysis` — Topic-by-topic breakdown with success rates, filterable by exam type
- `/topics` — All müfredat topics with stats (doğru/yanlış/boş, bilgi eksikliği vs dikkat hatası)
- `/settings` — Grade/alan, theme, account (sign in / sign up / log out)

### Bottom Navbar
Ana Sayfa / Analiz / Konular / Ayarlar

---

## Auth
- Guest mode is supported — users can use the app without signing in
- Guest data is stored locally
- Users are nudged to create an account to back up their data
- Sign in / create account is in Settings, not forced on first open
- Onboarding only asks for grade after account creation or guest start

---

## UI Rules
- Mobile-first, designed for phone browsers
- All text in Turkish
- Light theme by default (#f8f8f8 background), theme customizable in settings
- Keep UI clean and focused — no clutter
- In-app banner shown when an upcoming exam's date has passed: "Sınavın geçti! Sonuçları gir →"

---

## AI Rules
- Gemini Flash only (free tier)
- Max 1 AI call per user per day for recommendations
- Cache results where possible
- Only analyze `bilgi_eksikliği` wrongs for study recommendations
- Do not generate quizzes — tracking and recommendations only

---

## Important Notes
- Never add features not listed here without asking
- Keep the codebase simple and readable
- Always use Turkish for UI copy
- Do not use paid APIs or services
- Müfredat data will be added to Supabase manually later — build UI assuming it exists