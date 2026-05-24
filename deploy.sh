#!/bin/bash
# Build and deploy the Procap Accelerator UI to GitHub Pages.
# Usage: ./deploy.sh [--build-only]

set -euo pipefail

SCRIPT_DIR="$(cd "$(dirname "$0")" && pwd)"

BUILD_ONLY=false
for arg in "$@"; do
  [[ "$arg" == "--build-only" ]] && BUILD_ONLY=true
done

echo "=== Build Procap Accelerator UI ==="
cd "$SCRIPT_DIR"

npm run build
echo "Build complete."

# Copy built files to project root (GitHub Pages serves from root)
cp -r dist/procap-accelerator/browser/* .

if $BUILD_ONLY; then
  echo "Build-only mode — skipping deploy."
  exit 0
fi

echo ""
echo "=== Deploy to GitHub Pages ==="
git add -A
git commit -m "Deploy: $(date '+%Y-%m-%d %H:%M')" || echo "Nothing to commit."
git push origin main

echo ""
echo "Deployed to https://app.procap.ai (may take ~1 min to propagate)."
