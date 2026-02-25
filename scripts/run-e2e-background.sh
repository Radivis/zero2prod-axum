#!/bin/bash
# Run E2E tests in background after commit
# Opens report on failure, doesn't block terminal

cd "$(dirname "$0")/../frontend" || exit 1

# Create a unique log file
LOG_FILE="/tmp/e2e-tests-$(date +%s).log"
MARKER_FILE="/tmp/e2e-tests-running-$(date +%s)"

# Show immediate feedback
echo "🧪 Starting E2E tests in background..."
echo "   Log file: $LOG_FILE"

# Run tests in truly independent background process using nohup
nohup bash -c '
    echo "════════════════════════════════════════════════════" > '"'$LOG_FILE'"'
    echo "  🧪 E2E TESTS STARTED at $(date)" >> '"'$LOG_FILE'"'
    echo "════════════════════════════════════════════════════" >> '"'$LOG_FILE'"'
    echo "" >> '"'$LOG_FILE'"'
    
    if npx playwright test --reporter=list >> '"'$LOG_FILE'"' 2>&1; then
        echo "" >> '"'$LOG_FILE'"'
        echo "════════════════════════════════════════════════════" >> '"'$LOG_FILE'"'
        echo "  ✅ E2E TESTS PASSED at $(date)" >> '"'$LOG_FILE'"'
        echo "════════════════════════════════════════════════════" >> '"'$LOG_FILE'"'
        
        # Send success notification
        if command -v notify-send &> /dev/null; then
            notify-send "✅ E2E Tests" "All tests passed!" -u low
        fi
    else
        EXIT_CODE=$?
        echo "" >> '"'$LOG_FILE'"'
        echo "════════════════════════════════════════════════════" >> '"'$LOG_FILE'"'
        echo "  ❌ E2E TESTS FAILED at $(date) (exit code: $EXIT_CODE)" >> '"'$LOG_FILE'"'
        echo "════════════════════════════════════════════════════" >> '"'$LOG_FILE'"'
        
        # Send failure notification
        if command -v notify-send &> /dev/null; then
            notify-send "❌ E2E Tests Failed" "Check log file or Playwright report" -u critical
        fi
        
        # Open report
        xdg-open playwright-report/index.html 2>/dev/null || \
        open playwright-report/index.html 2>/dev/null || true
    fi
    
    rm -f '"'$MARKER_FILE'"'
' > /dev/null 2>&1 &

BG_PID=$!
echo "✓ E2E tests launched in background (PID: $BG_PID)"
echo "   To monitor: tail -f $LOG_FILE"

# Optionally, open the log file in a terminal for live viewing
# Uncomment if you want automatic log viewing:
# (sleep 2 && xterm -e "tail -f $LOG_FILE" &) &
