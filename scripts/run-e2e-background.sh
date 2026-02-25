#!/bin/bash
# Run E2E tests in background after commit
# Opens report on failure, doesn't block terminal

cd "$(dirname "$0")/../frontend" || exit 1

echo "🧪 Running E2E tests in background..."

# Run tests, capture exit code
if npx playwright test --reporter=list 2>&1 | tee /tmp/e2e-tests-$$.log; then
    echo "✅ E2E tests passed"
    # Send success notification if notify-send is available
    if command -v notify-send &> /dev/null; then
        notify-send "✅ E2E Tests" "All tests passed!" -u low
    fi
else
    EXIT_CODE=$?
    echo "❌ E2E tests failed (exit code: $EXIT_CODE) - opening report..."
    
    # Send failure notification
    if command -v notify-send &> /dev/null; then
        notify-send "❌ E2E Tests Failed" "Opening report... Click to view" -u critical
    fi
    
    # Open report without starting server (just open the HTML file)
    xdg-open playwright-report/index.html 2>/dev/null || \
    open playwright-report/index.html 2>/dev/null || \
    echo "Report available at: $(pwd)/playwright-report/index.html"
    
    # Also print a prominent error message
    echo ""
    echo "════════════════════════════════════════════════════"
    echo "  ❌ E2E TESTS FAILED - Check the Playwright report"
    echo "════════════════════════════════════════════════════"
    echo ""
fi

# Clean up log after 1 minute
(sleep 60 && rm -f /tmp/e2e-tests-$$.log) &
