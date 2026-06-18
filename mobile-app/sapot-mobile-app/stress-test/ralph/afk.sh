#!/bin/bash
set -eo pipefail

if [ -z "$1" ]; then
  echo "Usage: $0 <iterations>"
  exit 1
fi

# jq filter to extract streaming text from assistant messages
stream_text='select(.type == "assistant").message.content[]? | select(.type == "text").text // empty | gsub("\n"; "\r\n") | . + "\r\n\n"'

# jq filter to extract final result
final_result='select(.type == "result").result // empty'

# Create one tmpfile and set the trap OUTSIDE the loop
tmpfile=$(mktemp)
trap 'rm -f "$tmpfile"' EXIT

for ((i=1; i<=$1; i++)); do
  # Clear the tmpfile for the current iteration
  > "$tmpfile"

  commits=$(git log -n 5 --format="%H%n%ad%n%B---" --date=short 2>/dev/null || echo "No commits found")
  
  # Handle the edge case where no .md files exist to prevent literal "*.md" evaluation
  shopt -s nullglob
  issues_files=(docs/issues/*.md)
  if [ ${#issues_files[@]} -gt 0 ]; then
    issues=$(cat "${issues_files[@]}" 2>/dev/null)
  else
    issues="No issues found"
  fi
  shopt -u nullglob

  # Ensure prompt exists, otherwise fail gracefully
  prompt=$(cat ralph/prompt.md 2>/dev/null || echo "No prompt found")

  # Run the docker command. Added || true to grep to prevent pipefail crashes on non-JSON output.
  sbx run claude . -- \
    --verbose \
    --print \
    --output-format stream-json \
    "Previous commits: $commits Issues: $issues $prompt" \
  | { grep --line-buffered '^{' || test $? = 1; } \
  | tee "$tmpfile" \
  | jq --unbuffered -rj "$stream_text"

  result=$(jq -r "$final_result" "$tmpfile")

  if [[ "$result" == *"<promise>NO MORE TASKS</promise>"* ]]; then
    echo -e "\nRalph complete after $i iterations."
    exit 0
  fi
done

echo -e "\nRalph hit the iteration limit ($1) before completing all tasks."
