#!/bin/bash
# Cross-platform notification script
# Usage: ./scripts/notify.sh "Title" "Message"

TITLE="$1"
MESSAGE="$2"

if [[ "$OSTYPE" == "linux-gnu"* ]]; then
    # Linux
    if command -v notify-send &> /dev/null; then
        notify-send "$TITLE" "$MESSAGE"
    fi
elif [[ "$OSTYPE" == "darwin"* ]]; then
    # macOS
    osascript -e "display notification \"$MESSAGE\" with title \"$TITLE\""
elif [[ "$OSTYPE" == "msys" || "$OSTYPE" == "win32" ]]; then
    # Windows
    powershell -Command "Add-Type -AssemblyName System.Windows.Forms; [System.Windows.Forms.MessageBox]::Show('$MESSAGE', '$TITLE')"
fi
