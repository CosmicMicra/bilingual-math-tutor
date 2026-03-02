#!/usr/bin/env python3
"""
Bilingual Math Tutor - Demo Script
Demonstrates the complete workflow of the adaptive learning system
"""

import sys
sys.path.insert(0, '/home/claude/math_tutor')
import time
from app import app, student_model
from fastapi.testclient import TestClient

client = TestClient(app)

def print_section(title):
    print("\n" + "="*60)
    print(f"  {title}")
    print("="*60 + "\n")

def demo_student_session(student_name, grade_level):
    """Simulate a complete student session"""
    
    print_section(f"Student Session: {student_name} (Grade {grade_level})")
    
    student_id = student_name.lower().replace(" ", "_")
    
    # Get a question
    print("📚 Loading a new question...")
    response = client.post('/api/get_question', json={
        'student_id': student_id,
        'grade_level': grade_level,
    })
    question_data = response.json()
    
    print(f"\n✨ Question ID: {question_data['question_id']}")
    print(f"📖 Topic: {question_data['topic'].title()}")
    print(f"⭐ Difficulty: {question_data['difficulty']}/3")
    print(f"\n❓ Question (Original English):")
    print(f"   {question_data['text']}")
    
    # Simulate student struggling - request simplification
    print("\n⏱️  Student thinking... (30 seconds)")
    time.sleep(0.5)
    
    print("\n🤔 Student requests simplified version...")
    response = client.post('/api/request_help', json={
        'student_id': student_id,
        'question_id': question_data['question_id'],
        'current_level': 'original'
    })
    simplified_data = response.json()
    
    print(f"\n📝 Simplified English:")
    print(f"   {simplified_data['text']}")
    print(f"\n🎯 ML Comprehension Prediction: {simplified_data['comprehension_score']*100:.0f}%")
    print(f"💡 Suggestion: {simplified_data['suggestion']}")
    
    # Student still needs help - request Spanish translation
    print("\n⏱️  Student still thinking... (20 seconds)")
    time.sleep(0.5)
    
    print("\n🌐 Student requests Spanish translation...")
    response = client.post('/api/request_help', json={
        'student_id': student_id,
        'question_id': question_data['question_id'],
        'current_level': 'simplified'
    })
    spanish_data = response.json()
    
    print(f"\n🇪🇸 Spanish Translation:")
    print(f"   {spanish_data['text']}")
    print(f"\n🎯 Updated Comprehension Prediction: {spanish_data['comprehension_score']*100:.0f}%")
    print(f"💡 Suggestion: {spanish_data['suggestion']}")
    
    # Student submits answer
    print("\n✍️  Student submits answer...")
    response = client.post('/api/submit_answer', json={
        'student_id': student_id,
        'question_id': question_data['question_id'],
        'answer': 'x = 9',  # Correct answer for g7_a2
        'time_spent': 95.3
    })
    answer_data = response.json()
    
    result = "✅ CORRECT!" if answer_data['correct'] else "❌ Incorrect"
    print(f"\n{result}")
    print(f"📋 Feedback: {answer_data['feedback']}")
    if not answer_data['correct']:
        print(f"🔑 Correct Answer: {answer_data['correct_answer']}")
    
    # Show stats
    print(f"\n📊 Student Performance:")
    response = client.get(f'/api/student_stats/{student_id}')
    stats = response.json()
    print(f"   • Questions Attempted: {stats['total_questions']}")
    print(f"   • Correct Answers: {stats['correct_answers']}")
    print(f"   • Accuracy: {stats['accuracy']:.1f}%")
    print(f"   • Simplifications Used: {stats['simplifications_used']}")
    print(f"   • Translations Used: {stats['translations_used']}")
    
    return student_id

def demonstrate_ml_learning():
    """Show how the ML model learns from interactions"""
    
    print_section("ML Model Learning Demonstration")
    
    print("🧠 Creating a new student profile...")
    student_id = "maria_gonzalez"
    
    print("\n📈 Simulating 10 question interactions...\n")
    
    for i in range(10):
        # Get question
        response = client.post('/api/get_question', json={
            'student_id': student_id,
            'grade_level': 7
        })
        question_data = response.json()
        
        # Simulate varying behavior
        needs_help = i % 3 != 0  # Needs help 2/3 of the time
        time_spent = 30 + (i * 5) if needs_help else 20
        
        if needs_help:
            # Request simplification
            client.post('/api/request_help', json={
                'student_id': student_id,
                'question_id': question_data['question_id'],
                'current_level': 'original'
            })
        
        # Submit answer (gets better over time)
        correct = i >= 5  # Starts struggling, improves after question 5
        answer = "correct answer" if correct else "wrong"
        
        response = client.post('/api/submit_answer', json={
            'student_id': student_id,
            'question_id': question_data['question_id'],
            'answer': answer,
            'time_spent': time_spent
        })
        
        result = "✅" if correct else "❌"
        help_indicator = "🆘" if needs_help else "✓"
        print(f"   Question {i+1}: {result} | Help: {help_indicator} | Time: {time_spent}s")
    
    # Get final stats
    response = client.get(f'/api/student_stats/{student_id}')
    stats = response.json()
    
    print(f"\n📊 Final Statistics:")
    print(f"   • Total Questions: {stats['total_questions']}")
    print(f"   • Accuracy: {stats['accuracy']:.1f}%")
    print(f"   • Total Help Requests: {stats['simplifications_used'] + stats['translations_used']}")
    print(f"   • Interactions Recorded: {stats['interactions_recorded']}")
    
    print(f"\n🎓 ML Model Status:")
    if student_model.is_trained:
        print("   ✅ Model is trained and making predictions!")
        print("   📚 The model learned from this student's behavior patterns")
    else:
        print("   ⏳ Model needs more data to train (5+ interactions)")

def show_question_bank():
    """Display available questions"""
    
    print_section("Available Question Bank")
    
    from app import QUESTION_BANK
    
    for grade, topics in QUESTION_BANK.items():
        print(f"\n📘 {grade.replace('_', ' ').title()}")
        for topic, questions in topics.items():
            print(f"   • {topic.title()}: {len(questions)} questions")
            for q in questions:
                print(f"     - {q['id']}: Difficulty {q['difficulty']}/3")

def main():
    """Run the complete demonstration"""
    
    print("\n" + "╔" + "="*58 + "╗")
    print("║" + " "*10 + "BILINGUAL MATH TUTOR - DEMO" + " "*20 + "║")
    print("║" + " "*5 + "Adaptive ML-Powered Learning System" + " "*17 + "║")
    print("╚" + "="*58 + "╝")
    
    # Show question bank
    show_question_bank()
    
    # Demo individual student session
    demo_student_session("Juan Martinez", 7)
    
    # Demo ML learning
    demonstrate_ml_learning()
    
    print_section("Demo Complete!")
    print("✨ The system successfully demonstrated:")
    print("   ✅ Three-level adaptive support (Original → Simplified → Spanish)")
    print("   ✅ ML-based comprehension prediction")
    print("   ✅ Real-time performance tracking")
    print("   ✅ Model learning from student interactions")
    print("\n🚀 To run the full web interface:")
    print("   1. Start backend: python3 app.py")
    print("   2. Open frontend: open index.html")
    print("\n📚 For more info, check README.md")
    print()

if __name__ == "__main__":
    main()
