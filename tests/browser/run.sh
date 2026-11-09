#!/usr/bin/env bash
# Runs every browser test and reports which failed.
#   Needs: python3 with Playwright (pip install playwright && python -m playwright install chromium)
#          and the test packages for wrangler (npm ci --prefix tests).
#   Optional: CHROME=/path/to/chrome (else Playwright's Chromium), SHOTS=folder for screenshots, VERBOSE=1.
#   Run some only:  bash tests/browser/run.sh test_speak.py test_german.py
set -u
cd "$(dirname "$0")"
ROOT=$(cd ../.. && pwd)
export SHOTS=${SHOTS:-/tmp/piccab-shots}
OFFLINE="test_cozy_home.py test_wordsheet.py test_fullscreen_tall.py test_german.py test_english_ui.py test_speak.py test_spaced_review.py test_draw.py test_captcha.py test_landing.py test_account_policies.py"
SERVER_TESTS="test_classes.py test_classes_german.py test_admin.py test_ai_usage.py test_english_web.py test_pwa.py test_trial.py test_gallery.py"
WANT="${*:-$OFFLINE $SERVER_TESTS}"
failed=()
run() { echo "▶ $1"; if ! timeout 300 python3 "$1"; then failed+=("$1"); fi; }

for t in $OFFLINE; do [[ " $WANT " == *" $t "* ]] && run "$t"; done

need_server=0; for t in $SERVER_TESTS; do [[ " $WANT " == *" $t "* ]] && need_server=1; done
if [ $need_server = 1 ]; then
  # The Worker on wrangler dev, talking to the fake Supabase (restarted before each test, so each starts empty)
  export SERVER=http://127.0.0.1:8788 FAKE_SUPABASE=http://127.0.0.1:54321
  start_fake() { [ -n "${FAKE_PID:-}" ] && kill "$FAKE_PID" 2>/dev/null && wait "$FAKE_PID" 2>/dev/null; python3 ../fake_supabase.py 54321 >> "$SHOTS/fake-supabase.log" 2>&1 & FAKE_PID=$!; sleep 0.7; }
  start_fake
  ( cd "$ROOT" && WRANGLER_SEND_METRICS=false exec ./tests/node_modules/.bin/wrangler dev --port 8788 --ip 127.0.0.1 \
      --var SUPABASE_URL:http://127.0.0.1:54321 --var SUPABASE_SECRET_KEY:sb_secret_test \
      --var ADMIN_EMAILS:boss@piccab.th --var GEMINI_API_KEY:test-key ) > "$SHOTS/wrangler.log" 2>&1 &
  WR_PID=$!
  trap 'kill $FAKE_PID $WR_PID 2>/dev/null; pkill -f "workerd" 2>/dev/null' EXIT
  for i in $(seq 1 90); do curl -s -m 2 "$SERVER/api/health" >/dev/null && break; sleep 1; done
  curl -s -m 2 "$SERVER/api/health" >/dev/null || { echo "wrangler dev did not start:"; tail -30 "$SHOTS/wrangler.log"; exit 1; }
  for t in $SERVER_TESTS; do [[ " $WANT " == *" $t "* ]] && { start_fake; run "$t"; }; done
fi

echo
if [ ${#failed[@]} -eq 0 ]; then echo "All browser tests passed."; else echo "Failed: ${failed[*]}"; exit 1; fi
