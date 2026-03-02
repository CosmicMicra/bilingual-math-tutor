from fastapi import FastAPI, HTTPException
from fastapi.middleware.cors import CORSMiddleware
from fastapi.staticfiles import StaticFiles
from pydantic import BaseModel
from typing import Optional
import random
from datetime import datetime
import numpy as np
from sklearn.linear_model import LogisticRegression
from sklearn.preprocessing import StandardScaler
import os

# ── BART Model ────────────────────────────────────────────────────────────────
from transformers import BartForConditionalGeneration, BartTokenizer

MODEL_PATH = "./final_model"

print("Loading BART model...")
bart_tokenizer = BartTokenizer.from_pretrained(MODEL_PATH)
bart_model = BartForConditionalGeneration.from_pretrained(MODEL_PATH)
print("✅ BART model loaded!")

def generate(text: str, level: str = "simplify", max_length: int = 128) -> str:
    """Generate scaffolded version of a math problem.
    level: 'simplify' | 'cognate' | 'translate'
    """
    prefixed = f"{level}: {text}"
    inputs = bart_tokenizer(prefixed, return_tensors='pt', max_length=max_length, truncation=True)
    outputs = bart_model.generate(
        inputs['input_ids'],
        max_length=max_length,
        num_beams=4,
        early_stopping=True
    )
    return bart_tokenizer.decode(outputs[0], skip_special_tokens=True)

# ── Question Bank ─────────────────────────────────────────────────────────────
QUESTION_BANK = {
    "grade_6": {
        "fractions": [
            {
                "id": "g6_f1",
                "original": "Calculate the sum of 3/4 and 2/5. Express your answer as a fraction in lowest terms.",
                "answer": "23/20 or 1 3/20",
                "topic": "fractions",
                "difficulty": 2
            },
            {
                "id": "g6_f2",
                "original": "If you multiply 2/3 by 3/8, what fraction do you get?",
                "answer": "1/4",
                "topic": "fractions",
                "difficulty": 1
            }
        ],
        "geometry": [
            {
                "id": "g6_g1",
                "original": "Calculate the perimeter of a rectangle with length 8 cm and width 5 cm.",
                "answer": "26 cm",
                "topic": "geometry",
                "difficulty": 1
            },
            {
                "id": "g6_g2",
                "original": "Determine the area of a triangle with base 10 meters and height 6 meters.",
                "answer": "30 square meters",
                "topic": "geometry",
                "difficulty": 1
            }
        ]
    },
    "grade_7": {
        "algebra": [
            {
                "id": "g7_a1",
                "original": "Solve for x: 3x + 7 = 22",
                "answer": "x = 5",
                "topic": "algebra",
                "difficulty": 2
            },
            {
                "id": "g7_a2",
                "original": "If 2(x - 4) = 10, what is the value of x?",
                "answer": "x = 9",
                "topic": "algebra",
                "difficulty": 2
            }
        ],
        "ratios": [
            {
                "id": "g7_r1",
                "original": "A recipe requires a ratio of 2 cups of flour to 3 cups of sugar. If you use 8 cups of flour, how many cups of sugar do you need?",
                "answer": "12 cups",
                "topic": "ratios",
                "difficulty": 2
            }
        ]
    },
    "grade_8": {
        "algebra": [
            {
                "id": "g8_a1",
                "original": "Solve the system of equations: 2x + y = 10 and x - y = 2",
                "answer": "x = 4, y = 2",
                "topic": "algebra",
                "difficulty": 3
            },
            {
                "id": "g8_a2",
                "original": "Expand and simplify: (x + 3)(x - 5)",
                "answer": "x² - 2x - 15",
                "topic": "algebra",
                "difficulty": 3
            }
        ],
        "geometry": [
            {
                "id": "g8_g1",
                "original": "Using the Pythagorean theorem, find the length of the hypotenuse of a right triangle with legs of 6 cm and 8 cm.",
                "answer": "10 cm",
                "topic": "geometry",
                "difficulty": 2
            }
        ]
    }
}

# ── App Setup ─────────────────────────────────────────────────────────────────
app = FastAPI()

app.add_middleware(
    CORSMiddleware,
    allow_origins=["*"],
    allow_credentials=True,
    allow_methods=["*"],
    allow_headers=["*"],
)

# ── Student ML Model ──────────────────────────────────────────────────────────
class StudentModel:
    def __init__(self):
        self.model = LogisticRegression()
        self.scaler = StandardScaler()
        self.is_trained = False

    def extract_features(self, interaction_data):
        features = [
            interaction_data.get('time_spent', 0),
            interaction_data.get('simplification_requested', 0),
            interaction_data.get('translation_requested', 0),
            interaction_data.get('difficulty_level', 1),
            interaction_data.get('attempts', 1),
            interaction_data.get('previous_correct_rate', 0.5)
        ]
        return np.array(features).reshape(1, -1)

    def predict_comprehension(self, interaction_data):
        if not self.is_trained:
            score = 0.5
            if interaction_data.get('simplification_requested', 0) == 1:
                score -= 0.2
            if interaction_data.get('translation_requested', 0) == 1:
                score -= 0.3
            if interaction_data.get('time_spent', 0) > 120:
                score -= 0.2
            return max(0.0, min(1.0, score))
        features = self.extract_features(interaction_data)
        features_scaled = self.scaler.transform(features)
        return self.model.predict_proba(features_scaled)[0][1]

    def train(self, training_data):
        if len(training_data) < 5:
            return False
        X = [self.extract_features(d)[0] for d in training_data]
        y = [d.get('understood', 0) for d in training_data]
        X, y = np.array(X), np.array(y)
        if len(np.unique(y)) < 2:
            return False
        self.scaler.fit(X)
        self.model.fit(self.scaler.transform(X), y)
        self.is_trained = True
        return True

student_model = StudentModel()
student_sessions = {}

# ── Pydantic Models ───────────────────────────────────────────────────────────
class QuestionRequest(BaseModel):
    student_id: str
    grade_level: int
    topic: Optional[str] = None

class SimplificationRequest(BaseModel):
    student_id: str
    question_id: str
    current_level: str  # "original" | "simplified" | "cognate" | "spanish"

class AnswerSubmission(BaseModel):
    student_id: str
    question_id: str
    answer: str
    time_spent: float

class CustomProblemRequest(BaseModel):
    text: str

# ── Helpers ───────────────────────────────────────────────────────────────────
def get_random_question(grade_level: int, topic: Optional[str] = None):
    grade_key = f"grade_{grade_level}"
    if grade_key not in QUESTION_BANK:
        return None
    if topic and topic in QUESTION_BANK[grade_key]:
        questions = QUESTION_BANK[grade_key][topic]
    else:
        questions = []
        for qs in QUESTION_BANK[grade_key].values():
            questions.extend(qs)
    return random.choice(questions) if questions else None

def init_student_session(student_id: str):
    if student_id not in student_sessions:
        student_sessions[student_id] = {
            'interactions': [],
            'current_question': None,
            'stats': {
                'total_questions': 0,
                'correct_answers': 0,
                'simplifications_used': 0,
                'translations_used': 0
            }
        }

# ── Endpoints ─────────────────────────────────────────────────────────────────
@app.get("/")
def read_root():
    return {"message": "Bilingual Math Tutor API", "status": "active", "model": "BART"}

@app.post("/api/get_question")
def get_question(request: QuestionRequest):
    init_student_session(request.student_id)
    question = get_random_question(request.grade_level, request.topic)
    if not question:
        raise HTTPException(status_code=404, detail="No questions found")

    student_sessions[request.student_id]['current_question'] = {
        'question': question,
        'start_time': datetime.now().isoformat(),
        'level_shown': 'original'
    }

    return {
        "question_id": question['id'],
        "text": question['original'],
        "topic": question['topic'],
        "difficulty": question['difficulty'],
        "level": "original"
    }

@app.post("/api/request_help")
def request_help(request: SimplificationRequest):
    if request.student_id not in student_sessions:
        raise HTTPException(status_code=404, detail="Student session not found")

    session = student_sessions[request.student_id]
    if not session['current_question']:
        raise HTTPException(status_code=404, detail="No active question")

    question = session['current_question']['question']
    original_text = question['original']

    # Determine next level and generate with BART
    if request.current_level == 'original':
        session['stats']['simplifications_used'] += 1
        next_level = 'simplified'
        text = generate(original_text, level='simplify')
    elif request.current_level == 'simplified':
        next_level = 'cognate'
        text = generate(original_text, level='cognate')
    elif request.current_level == 'cognate':
        session['stats']['translations_used'] += 1
        next_level = 'spanish'
        text = generate(original_text, level='translate')
    else:
        next_level = 'spanish'
        text = generate(original_text, level='translate')

    session['current_question']['level_shown'] = next_level

    interaction_data = {
        'time_spent': (datetime.now() - datetime.fromisoformat(session['current_question']['start_time'])).seconds,
        'simplification_requested': 1 if next_level in ['simplified', 'cognate', 'spanish'] else 0,
        'translation_requested': 1 if next_level == 'spanish' else 0,
        'difficulty_level': question['difficulty'],
        'attempts': len(session['interactions']),
        'previous_correct_rate': session['stats']['correct_answers'] / max(1, session['stats']['total_questions'])
    }

    comprehension_score = student_model.predict_comprehension(interaction_data)

    return {
        "question_id": question['id'],
        "text": text,
        "level": next_level,
        "comprehension_score": round(comprehension_score, 2),
        "suggestion": "You're doing great!" if comprehension_score > 0.6 else "Take your time to understand the question."
    }

@app.post("/api/submit_answer")
def submit_answer(submission: AnswerSubmission):
    if submission.student_id not in student_sessions:
        raise HTTPException(status_code=404, detail="Student session not found")

    session = student_sessions[submission.student_id]
    if not session['current_question']:
        raise HTTPException(status_code=404, detail="No active question")

    question = session['current_question']['question']
    correct = submission.answer.strip().lower() in question['answer'].lower()

    session['stats']['total_questions'] += 1
    if correct:
        session['stats']['correct_answers'] += 1

    interaction = {
        'student_id': submission.student_id,
        'question_id': submission.question_id,
        'time_spent': submission.time_spent,
        'simplification_requested': session['current_question']['level_shown'] in ['simplified', 'cognate', 'spanish'],
        'translation_requested': session['current_question']['level_shown'] == 'spanish',
        'difficulty_level': question['difficulty'],
        'attempts': 1,
        'understood': correct,
        'previous_correct_rate': session['stats']['correct_answers'] / session['stats']['total_questions']
    }

    session['interactions'].append(interaction)

    if len(session['interactions']) >= 5 and len(session['interactions']) % 5 == 0:
        student_model.train(session['interactions'])

    return {
        "correct": correct,
        "correct_answer": question['answer'],
        "feedback": "¡Excelente! ¡Correcto!" if correct else "Not quite. Try again or let me help you understand.",
        "stats": session['stats']
    }

@app.get("/api/student_stats/{student_id}")
def get_student_stats(student_id: str):
    if student_id not in student_sessions:
        return {"error": "Student not found"}
    session = student_sessions[student_id]
    stats = session['stats']
    accuracy = (stats['correct_answers'] / max(1, stats['total_questions'])) * 100
    return {
        "total_questions": stats['total_questions'],
        "correct_answers": stats['correct_answers'],
        "accuracy": round(accuracy, 2),
        "simplifications_used": stats['simplifications_used'],
        "translations_used": stats['translations_used'],
        "interactions_recorded": len(session['interactions'])
    }

@app.post("/api/generate_all_levels")
def generate_all_levels(request: CustomProblemRequest):
    """Generate all 3 scaffolding levels for any custom problem using BART"""
    return {
        "original": request.text,
        "simplified": generate(request.text, "simplify"),
        "cognate": generate(request.text, "cognate"),
        "spanish": generate(request.text, "translate")
    }

if __name__ == "__main__":
    import uvicorn
    uvicorn.run(app, host="0.0.0.0", port=8000)