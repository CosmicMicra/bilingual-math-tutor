#!/bin/bash

echo "🎓 Starting Bilingual Math Tutor..."
echo ""

# Check if Python is installed
if ! command -v python3 &> /dev/null; then
    echo "❌ Python 3 is not installed. Please install Python 3.8 or higher."
    exit 1
fi

# Check if pip packages are installed
echo "📦 Checking dependencies..."
if ! python3 -c "import fastapi" &> /dev/null; then
    echo "Installing dependencies..."
    pip install -r requirements.txt
fi

echo ""
echo "🚀 Starting backend server..."
echo "Backend will be available at: http://localhost:8000"
echo ""

# Start backend in background
python3 app.py &
BACKEND_PID=$!

# Wait for backend to start
sleep 3

echo ""
echo "✅ Backend started successfully!"
echo ""
echo "🌐 Opening frontend..."
echo "Frontend will be available at: http://localhost:8080"
echo ""

# Start simple HTTP server for frontend
python3 -m http.server 8080 &
FRONTEND_PID=$!

sleep 2

echo ""
echo "✅ Frontend started successfully!"
echo ""
echo "================================================"
echo "🎉 Bilingual Math Tutor is now running!"
echo "================================================"
echo ""
echo "📱 Open your browser to: http://localhost:8080"
echo ""
echo "To stop the application:"
echo "  Press Ctrl+C or run: kill $BACKEND_PID $FRONTEND_PID"
echo ""
echo "API Documentation: http://localhost:8000/docs"
echo ""

# Wait for user interrupt
trap "kill $BACKEND_PID $FRONTEND_PID; echo ''; echo '👋 Shutting down...'; exit 0" INT

# Keep script running
wait
