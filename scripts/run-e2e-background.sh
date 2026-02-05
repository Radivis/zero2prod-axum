#!/bin/bash
# Run E2E tests in background after commit
# Opens report on failure, doesn't block terminal

cd "$(dirname "$0")/../frontend" || exit 1

echo "🧪 Running E2E tests in background..."

# Run tests, capture exit code
if npx playwright test --reporter=list 2>&1 | tee /tmp/e2e-tests-$$.log; then
    echo "✅ E2E tests passed"
else
    echo "❌ E2E tests failed - opening report..."
    # Open report without starting server (just open the HTML file)
    xdg-open playwright-report/index.html 2>/dev/null || \
    open playwright-report/index.html 2>/dev/null || \
    echo "Report available at: $(pwd)/playwright-report/index.html"
fi

# Clean up log after 1 minute
(sleep 60 && rm -f /tmp/e2e-tests-$$.log) &
