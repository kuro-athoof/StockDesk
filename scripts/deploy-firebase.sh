#!/usr/bin/env bash
# StockDesk Pro — deploy Firestore rules, indexes, and Storage rules.
# Run from the project root on a machine with network access to Firebase.
#
#   chmod +x scripts/deploy-firebase.sh
#   ./scripts/deploy-firebase.sh
#
# Requires: firebase-tools (npm i -g firebase-tools) and `firebase login`.

set -euo pipefail
PROJECT="stockdesk-246ad"

echo "▶ Deploying Firestore rules…"
firebase deploy --only firestore:rules --project "$PROJECT"

echo "▶ Deploying Firestore indexes…"
firebase deploy --only firestore:indexes --project "$PROJECT"

echo "▶ Deploying Storage rules…"
firebase deploy --only storage --project "$PROJECT"

echo "✓ Done. (Hosting optional: firebase deploy --only hosting --project $PROJECT)"
