# Bilingual Adaptive Math

An adaptive learning platform for bilingual math learners in grades 6–8. The core idea: when a student struggles, the system tries to figure out *why* — is this a math content gap, or an English language barrier? — instead of treating every wrong answer the same way. That distinction drives both what teachers see and what problem the student gets next.

## Why this exists

A bilingual student who misses a word problem might understand the math perfectly and just be stuck on the English. A traditional system would lower the difficulty, which is exactly the wrong move — it makes the math easier when the math was never the problem. This platform separates those two signals so it can respond to the actual cause.

Every problem is delivered with four scaffolding layers a student can choose to reveal:

1. **Simplified English** — clearer, easier phrasing of the same problem
2. **Bilingual key terms** — simplified English with key math/action words paired with their Spanish translation
3. **Full Spanish translation** — the complete problem in natural Spanish
4. **Step-by-step solution** — the worked answer

How a student moves through these layers is the primary diagnostic signal. Someone who jumps straight to the Spanish translation and then solves it correctly is telling us something very different from someone who reveals the full solution without engaging.

## The core idea

The central design idea is that **math difficulty and linguistic difficulty are separate dials.** Most adaptive systems collapse them into one — get it wrong, get something easier — which fails a bilingual learner whose math is fine but whose English isn't.

The system keeps the two apart with two diagnostic metrics, computed from how a student works through a problem: the **Language Dependency Score (LDS)** — how much they leaned on the language scaffolding — and the **Math Confidence Score (MCS)** — how confidently they handled the underlying math. Together they tell *which* dial is the obstacle. (Full detail in [Diagnose](#diagnose).)

The level numbering reflects the same split. A level like `2.3` encodes two things at once: the **first digit** is the math tier (1 = arithmetic and fractions, 2 = decimals, percentages, proportions, 3 = algebra, geometry, statistics), and the **second digit** is the language step — within a tier, `.1` through `.5` hold the math steady while the English grows denser.

|  | .1 *(simplest English)* | .2 | .3 | .4 | .5 *(hardest English)* |
|---|---|---|---|---|---|
| **Tier 1** · arithmetic, fractions | 1.1 | 1.2 | 1.3 | 1.4 | 1.5 |
| **Tier 2** · decimals, %, proportions | 2.1 | 2.2 | 2.3 | 2.4 | 2.5 |
| **Tier 3** · algebra, geometry, statistics | 3.1 | 3.2 | 3.3 | 3.4 | 3.5 |

Down a column the math gets harder; across a row the language does. Each level carries an Elo rating for its overall difficulty — math and language together — which the engine uses to match problems to a student's ability.

## The adaptive engine

Every time a student submits an answer, a three-part engine decides what problem comes next:

- **Elo rating** tracks the student's ability against per-level difficulty targets. The K-factor decays as more interactions accumulate (48 → 32 → 24), so early estimates move fast and later ones stabilize as confidence in the rating grows.
- **Bayesian Knowledge Tracing (BKT)** models mastery of each topic as a hidden state, letting the system reason probabilistically about what a student actually *knows* rather than reacting only to the last answer.
- **Thompson Sampling** picks the next difficulty level by sampling from what's known about each candidate, with a proximity bonus that keeps choices inside the student's Zone of Proximal Development. This balances reinforcing known strengths against exploring uncertain areas.

A **language-gap overlay** sits on top of the decision: if dependency and confidence are both high, the engine won't drop the difficulty just because the student leaned on language support — that would punish the wrong thing.

The full sequence on each submission — diagnosis first, then the selection engine:

```
LDS → MCS → Quadrant → Elo → BKT → Thompson Sampling
```

The first three steps are the diagnosis (covered in [Diagnose](#diagnose)); the last three pick the next problem.

## Student modes

A problem can enter the system two ways, and they use different backends.

**Manual mode** — the student supplies the problem: typed text, voice input (browser speech recognition), or an uploaded image (OCR via Tesseract, then Gemini translation into the four scaffolds). Best for homework, worksheets, or ad-hoc problems.

**Practice mode** — the app serves the next item from the curated question bank, chosen by the student's current level (1.1–3.5) and topic, skipping recently seen problems. These come with the four scaffolding layers pre-written. The student just clicks *Next Practice Question*; manual input is disabled because the bank drives the problem.

Both modes share the same four scaffolding layers, answer checking, LDS/MCS logging, and adaptive updates on submit.

## Diagnose

The two diagnostic scores are computed from the student's behavior on each problem:

- **Language Dependency Score (LDS)** — how much the student leaned on language scaffolding (0 = worked in English independently, 1 = fully dependent on Spanish support). It combines how deep they went into the scaffolds, how much of their time was spent in those layers, how quickly they escalated to needing help, and whether they revealed the full solution.
- **Math Confidence Score (MCS)** — how confidently they handled the underlying math (correctness, speed relative to the level's typical time, attempt efficiency, and how language-independent the work was).

Neither score is meaningful from a single behavior — they're built to triangulate several weak signals into one diagnostically useful read. Together they place the student in one of four quadrants:

| | Low language dependency | High language dependency |
|---|---|---|
| **High math confidence** | Thriving | Language gap |
| **Low math confidence** | Math struggle | Dual challenge |

This is the output teachers can act on. A "language gap" student needs language support, not easier math.

## Analysis view

The same diagnostic signals that drive a student's next problem also feed an **analysis view** for teachers and researchers — a feature that exists in the app today.

While a student works, a live sidebar shows what the engine is reading: their current level and ability, the language-dependency and math-confidence bars, and which diagnostic quadrant they're in right now.

Zoomed out, the analysis view summarizes across many interactions — for a single student or a whole cohort. It answers two questions a teacher actually has: *where is this student struggling*, and *what does the class as a whole find hard?* That second question is where the language lens earns its keep — it can surface which specific words or problem types trip students up, not just which topics, so a teacher can tell a vocabulary problem apart from a math problem at the group level.

## Tech stack

The system is built to be modular and interpretable: every decision traces to a specific score and rule, so a teacher can ask "why did it do that?" and get a real answer.

- **Frontend** — React + Vite + Tailwind. The adaptive engine (LDS, MCS, quadrant, Elo, BKT, Thompson Sampling) runs client-side.
- **Backend** — an Express server handling auth, scaffold generation, OCR, question selection, and saving each interaction.
- **Scaffold generation** — Google Gemini turns a word problem into the four bilingual layers.
- **OCR** — Tesseract.js reads problem text from a photographed worksheet.
- **Auth & storage** — Firebase Authentication and Firestore.

### Project structure

```
server.ts                  Express API: auth, scaffold generation, OCR, question selection, sessions
index.html
question_database.json     Curated practice bank (problems + scaffolds + level/Elo)
cefr_vocabulary.json       Word → CEFR level + type
textbook_synonym_map.json  Level-bucketed synonyms (built offline)
src/
  main.tsx                 App entry
  App.tsx                  Student UI, session loop, sidebar, adaptive state
  index.css
  lib/
    adaptive-engine.ts     LDS, MCS, quadrant, Elo, BKT, Thompson Sampling
    gemini.ts              Client calls for translate + OCR-translate
    api.ts                 Authenticated fetch + profile/question helpers
    firebase.ts            Firebase client init
```

## The CEFR layer & question generation (phase 3)

Today the question bank is hand-curated: each item's `level` already bundles math and English difficulty, as described above. The CEFR work is the foundation for the next phase — **automatic question generation** — and it layers on after the bank rather than being baked into it.

The idea: grade vocabulary by CEFR level, then map those CEFR levels onto the 1.1–3.5 ladder so the words and the levels share one scale. A word that's CEFR-C sits near the top of the ladder (≈3.5); A1 words sit at the bottom (≈1.1). Once words live on the same ladder as the problems, the system can generate a question at a target level by swapping vocabulary for harder or simpler synonyms — and write the result, with its CEFR grading, back into the bank.

Two assets support this:

- **A CEFR vocabulary map** grading ~564 words by CEFR level and type (math, general, story-context, name). Math terms from Common Core / NCTM (e.g. *area*, *ratio*, *median*) are protected — never swapped — so substitution never changes the mathematical meaning.
- **A textbook synonym map** grouping level-appropriate alternatives for each word, built from the bank's own vocabulary so substitutions stay in-domain.

The vocabulary grading already powers the analysis view's word-difficulty breakdown. The generation step — swapping words to hit a target level and updating the bank — is phase 3: designed, with the data in place, not yet wired into the live tutor.

## Getting started

You'll need Node.js, a Firebase project (Authentication + Firestore), and a Google Gemini API key.

```bash
npm install
npm run dev      # local dev server
npm run build    # production build
```

Configure a `.env` file with your Gemini key, a Firebase service account for the server, and the `VITE_FIREBASE_*` client keys. (Env files aren't committed — see `.gitignore`.)

## Notes

- Adaptive progress (level, Elo, topic mastery) is remembered per student between sessions; each interaction is logged so the analysis view can summarize it later.
- A problem counts as completed when it's solved or its answer is revealed, and progress is tracked in blocks of 20. The LDS/MCS bars smooth over the session rather than jumping on every answer.
- The synonym map's vocabulary currently leans grade 6–7, so grade-8 coverage is thinner — worth expanding before the generation phase.
