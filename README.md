# Bilingual Math Tutor - Adaptive Learning System

An ML-powered adaptive math tutoring system for Spanish-English bilingual students (Grades 6-8).

## 🎯 Features

### Core Functionality
- **Adaptive Question Difficulty**: Questions tailored to grades 6, 7, and 8
- **Three-Level Support System**:
  1. Original academic English
  2. Simplified English (reduced linguistic complexity)
  3. Spanish translation
- **ML-Based Comprehension Tracking**: Predicts student understanding based on interaction patterns
- **Real-time Performance Analytics**: Tracks accuracy, help requests, and time spent

### ML Model
The system uses a Logistic Regression model that learns from:
- Time spent on questions
- Simplification requests
- Translation requests
- Previous performance
- Question difficulty level

The model predicts student comprehension and adapts recommendations accordingly.

## 🚀 Quick Start

### Prerequisites
- Python 3.8+
- Modern web browser

### Installation

1. Install dependencies:
```bash
pip install -r requirements.txt
```

2. Start the backend server:
```bash
python app.py
```

The API will be available at `http://localhost:8000`

3. Open the frontend:
```bash
# Option 1: Open directly in browser
open index.html

# Option 2: Use Python's HTTP server
python -m http.server 8080
# Then navigate to http://localhost:8080
```

## 📊 How It Works

### Student Interaction Flow

1. **Initial Question**: Student sees question in academic English
2. **Struggle Detection**: If student struggles, they can:
   - Request simplified English (maintains math accuracy, reduces linguistic complexity)
   - Request Spanish translation (for native language support)
3. **ML Prediction**: System tracks interactions and predicts comprehension level
4. **Adaptive Feedback**: Provides encouragement and suggestions based on comprehension score

### Data Collection

Every interaction records:
- Time spent on question
- Help requests (simplification/translation)
- Answer correctness
- Difficulty level
- Historical performance

### ML Model Training

- **Initial Phase**: Rule-based predictions using heuristics
- **Training Threshold**: Begins learning after 5+ interactions
- **Continuous Learning**: Retrains every 5 new interactions
- **Features**: 6-dimensional feature vector per interaction

## 🎓 Question Bank

### Grade 6
- **Fractions**: Addition, multiplication, simplification
- **Geometry**: Perimeter, area (rectangles, triangles)

### Grade 7
- **Algebra**: Linear equations, solving for x
- **Ratios**: Proportional relationships, scaling

### Grade 8
- **Algebra**: Systems of equations, polynomial expansion
- **Geometry**: Pythagorean theorem, advanced area calculations

## 📈 API Endpoints

### Get Question
```http
POST /api/get_question
{
  "student_id": "john_doe_123",
  "grade_level": 7,
  "topic": "algebra"  // optional
}
```

### Request Help
```http
POST /api/request_help
{
  "student_id": "john_doe_123",
  "question_id": "g7_a1",
  "current_level": "original"
}
```

### Submit Answer
```http
POST /api/submit_answer
{
  "student_id": "john_doe_123",
  "question_id": "g7_a1",
  "answer": "x = 5",
  "time_spent": 45.2
}
```

### Get Stats
```http
GET /api/student_stats/{student_id}
```

## 🔬 Research Applications

This system is designed for research in:

1. **Bilingual Education**: How scaffolding affects learning outcomes
2. **Adaptive Learning**: ML-driven personalization effectiveness
3. **Linguistic Complexity**: Impact on math comprehension
4. **Student Engagement**: Interaction patterns with adaptive systems

### Data Export

Student interaction data is stored in memory during sessions. To export for analysis:

```python
# Access student_sessions dictionary in app.py
# Contains all interaction data, timestamps, and ML predictions
```

## 🛠️ Extending the System

### Adding Questions

Edit the `QUESTION_BANK` in `app.py`:

```python
"grade_X": {
    "topic_name": [
        {
            "id": "unique_id",
            "original": "Academic English version",
            "simplified": "Simplified English version",
            "spanish": "Spanish translation",
            "answer": "Expected answer",
            "topic": "topic_name",
            "difficulty": 1-3
        }
    ]
}
```

### Improving the ML Model

Current model: Logistic Regression with 6 features

To upgrade:
1. Add more features in `StudentModel.extract_features()`
2. Replace with neural network or ensemble model
3. Add more training data collection
4. Implement cross-validation

### Translation Enhancement

Current: Manual translations in question bank

To improve:
- Integrate Google Translate API
- Use specialized math translation models
- Add contextual translation based on student's region

## 📊 Sample Usage

```python
# Example: Analyzing student comprehension patterns
from app import student_sessions, student_model

student_id = "maria_garcia_456"
session = student_sessions[student_id]

# Get comprehension over time
comprehension_scores = []
for interaction in session['interactions']:
    score = student_model.predict_comprehension(interaction)
    comprehension_scores.append(score)

# Analyze: Did student improve with help?
print(f"Average comprehension: {np.mean(comprehension_scores)}")
```

## 🎯 Future Enhancements

1. **Advanced NLP**: Use transformer models for better simplification
2. **Speech Recognition**: Voice-based question delivery
3. **Adaptive Difficulty**: Dynamic question difficulty based on performance
4. **Peer Comparison**: Anonymous benchmarking
5. **Teacher Dashboard**: Progress tracking and insights
6. **Mobile App**: Native iOS/Android applications
7. **More Languages**: Support for other language pairs

## 📝 Research Paper Ideas

This system enables research on:
- "Impact of Linguistic Scaffolding on Bilingual Math Performance"
- "ML-Driven Adaptive Learning for Second Language Learners"
- "Comprehension Prediction Models in Educational Technology"
- "Optimal Support Timing in Computer-Assisted Learning"

## 🤝 Contributing

To add features:
1. Backend changes: Modify `app.py`
2. Frontend changes: Modify `index.html`
3. Questions: Update `QUESTION_BANK` dictionary
4. ML Model: Enhance `StudentModel` class

## 📄 License

This is a research prototype. Feel free to use and modify for educational purposes.

## 🙋 Support

For issues or questions:
- Check API is running: `curl http://localhost:8000`
- Check browser console for frontend errors
- Verify Python dependencies are installed

---

**Built for bilingual education research**
*Adaptive • Intelligent • Student-Centered*
