# 🌉 Bilingual Math Tutor

> *To help students learn mathematics without language being a barrier!*

---

## 💡 Why We Built This

Math is a universal language but math *word problems* are not. Many Spanish-speaking students who are strong in math struggle with word problems simply because of unfamiliar English vocabulary — not because of the math itself. Take a quesition "A car travels 60 miles per hour. How many miles will it travel in 3 hours?", A student who knows that 60 × 3 = 180 shouldn't fail because the words *"travels"* or *"per hour"* are unfamiliar. Mathematical ability and English proficiency are two separate things and our system treats them that way.

The Bilingual Math Tutor gives Spanish-speaking students access to math problems at the language level they need, so they can focus on the math.

---

## 🤖 Why BART?

We fine-tuned **BART (Bidirectional and Auto-Regressive Transformer)**, a sequence-to-sequence model originally developed by Facebook AI. BART was designed for text generation and paraphrasing tasks — which makes it a natural fit for our problem: taking a complex English math sentence and rewriting it in a simpler, more accessible form while preserving the mathematical meaning. Unlike pure translation models, BART understands sentence structure and can generate fluent, coherent rewrites rather than word-for-word substitutions. We fine-tuned it on our own scaffolded math dataset so it learns the specific simplification patterns relevant to grade 6–8 math content.

---

## 🧠 Our Approach

We frame the problem as **controlled text generation with scaffolding levels**. Instead of giving students a direct translation (which removes the opportunity to learn English), we designed a three-step scaffolding system that meets students where they are and progressively bridges them toward the original English:

- **Level 1 — Simplified English:** The same problem, rewritten with simpler vocabulary and shorter sentences. The math is identical; the language complexity is reduced.
- **Level 2 — Cognate Bridge:** English sentences with key Spanish math terms mixed in (*Millas*, *Área*, *Promedio*). Students leverage their Spanish vocabulary as a foothold into the English sentence structure.
- **Level 3 — Full Spanish:** A complete, natural Spanish translation for students who need full language support to access the math content.

Each input problem is prefixed with a control token (`simplify:`, `cognate:`, `translate:`) so the model learns to generate the appropriate level on demand. Students only see the next hint when they ask for it — preserving the learning challenge while removing the language barrier.

---

## 📊 Model Performance

**Base model:** `facebook/bart-base` · Fine-tuned on bilingual math scaffolding dataset

| Metric  | Score  |
|---------|--------|
| ROUGE-1 | 0.6371 |
| ROUGE-2 | 0.4590 |
| ROUGE-L | 0.6321 |
| BLEU    | 0.4384 |

**Per-level breakdown:**

| Level     | ROUGE-L | BLEU   |
|-----------|---------|--------|
| Simplify  | 0.6310  | 0.4181 |
| Cognate   | 0.7546  | 0.5567 |
| Translate | 0.4655  | 0.2751 |

The cognate level scores highest — the model learns well to introduce Spanish math terms into English sentences. Translate scores lowest because full Spanish has more surface variation, which BLEU penalizes even for correct translations. This supports our hypothesis that **cognate scaffolding is the most learnable intermediate step** for bilingual learners.

---

## 🏗️ Directory Structure

```
bilingual-math-tutor/
├── model_server.py                      # FastAPI backend serving the BART model
├── index.html                           # Student-facing frontend UI
├── requirements.txt                     # Python dependencies
├── math_simplification_labeled.jsonl    # Training dataset
├── bilingual_math_tutor.ipynb           # Google Colab training notebook
└── README.md
```

> ⚠️ `final_model/` (~516MB) is excluded from the repo. Download link below.

---

## 🚀 Quick Start

```bash
# 1. Clone
git clone https://github.com/CosmicMicra/bilingual-math-tutor/
cd bilingual-math-tutor

# 2. Set up environment
python3.11 -m venv venv
source venv/bin/activate
pip install -r requirements.txt

# 3. Download trained model
# Unzip final_model.zip into the project root
unzip "final_model.zip"

# 4. Run backend
python model_server.py

# 5. Open frontend
open index.html
```

---

## ⚙️ API

### `POST /generate`
```json
// Request
{ "text": "A car travels 60 miles per hour. How many miles will it travel in 3 hours?" }

// Response
{
  "original":  "A car travels 60 miles per hour. How many miles will it travel in 3 hours?",
  "simplify":  "A car goes 60 miles each hour. How many miles in 3 hours?",
  "cognate":   "A car goes 60 Millas each hour. How many Millas in 3 hours?",
  "translate": "Un carro viaja 60 millas por hora. ¿Cuántas millas recorrerá en 3 horas?"
}
```

---

## 🔬 Research Context

This project is part of NLP research at Santa Clara University, Frugal Innovation Hub exploring cognate-scaffolded bilingual math generation and whether linguistically-structured data outperforms direct translation for Spanish-speaking learners.

**Built by:** Soniya Phaltane & Pinaki Raj 
