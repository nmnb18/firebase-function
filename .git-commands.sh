#!/bin/bash
# Git commands to fix T1-01: Remove lib/ from git tracking
# Run this from the firebase-function/ directory

echo "🔧 Fixing T1-01: Removing compiled lib/ from git tracking..."
echo ""

# Remove lib/ from git tracking (keeps local files)
echo "Step 1: Removing functions/lib/ from git tracking..."
git rm -r --cached functions/lib/

echo ""
echo "Step 2: Checking git status..."
git status | head -20

echo ""
echo "Step 3: Ready to commit. Run:"
echo ""
echo "git commit -m \"fix(T1-01): Remove compiled lib/ output from git tracking"
echo ""
echo "- lib/ is TypeScript build output (src/ → lib/)"
echo "- Already in .gitignore but was committed before rule added"
echo "- Build output should not be version controlled"
echo "- All sources exist in functions/src/"
echo ""
echo "Resolves T1-01 in ARCH_TRACKER\""
echo ""
echo "✅ After commit, lib/ will no longer be tracked by git"
echo "✅ Local lib/ files remain (for local dev/builds)"
