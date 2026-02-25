#!/bin/bash
# Run E2E tests in background after commit
# Opens report on failure, shows clear terminal notification on completion

cd "$(dirname "$0")/../frontend" || exit 1

# Create unique files for this test run
LOG_FILE="/tmp/e2e-tests-$(date +%s).log"
STATUS_FILE="/tmp/e2e-tests-status-$(date +%s)"

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
        echo "PASSED" > '"'$STATUS_FILE'"'
        
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
        echo "FAILED:$EXIT_CODE" > '"'$STATUS_FILE'"'
        
        # Send failure notification
        if command -v notify-send &> /dev/null; then
            notify-send "❌ E2E Tests Failed" "Check log file or Playwright report" -u critical
        fi
        
        # Open report
        xdg-open playwright-report/index.html 2>/dev/null || \
        open playwright-report/index.html 2>/dev/null || true
    fi
' > /dev/null 2>&1 &

BG_PID=$!
echo "✓ E2E tests launched (PID: $BG_PID)"
echo "   To monitor: tail -f $LOG_FILE"
echo "   Results will appear in this terminal when tests complete"

# Launch a monitoring process that will show terminal notification when complete
(
    # Wait for tests to complete (max 5 minutes)
    for i in {1..300}; do
        if [ -f "$STATUS_FILE" ]; then
            STATUS=$(cat "$STATUS_FILE")
            
            # Prepare notification message
            if [[ "$STATUS" == "PASSED" ]]; then
                MESSAGE="
════════════════════════════════════════════════════
  ✅ E2E TESTS PASSED
════════════════════════════════════════════════════
"
            else
                EXIT_CODE="${STATUS#FAILED:}"
                MESSAGE="
════════════════════════════════════════════════════
  ❌ E2E TESTS FAILED (exit code: $EXIT_CODE)
  Report: frontend/playwright-report/index.html
  Log: $LOG_FILE
════════════════════════════════════════════════════
"
            fi
            
            # Write notification to all accessible terminals for this user
            for tty in /dev/pts/*; do
                if [ -w "$tty" ] 2>/dev/null; then
                    echo "$MESSAGE" > "$tty" 2>/dev/null || true
                fi
            done
            
            # Clean up status file
            rm -f "$STATUS_FILE"
            break
        fi
        sleep 1
    done
) &

echo ""
