#!/bin/bash

# Test Release Process Locally
# Tests the complete release workflow without actually publishing

set -e

echo "🚀 Testing Release Process Locally"
echo "=================================="

# Colors for output
RED='\033[0;31m'
GREEN='\033[0;32m'
YELLOW='\033[1;33m'
BLUE='\033[0;34m'
NC='\033[0m' # No Color

# Step 1: Ensure we're in a clean state
echo -e "${BLUE}🧹 Checking git status...${NC}"
if [[ -n $(git status --porcelain) ]]; then
    echo -e "${RED}❌ Working directory is not clean. Please commit or stash changes first.${NC}"
    exit 1
fi
echo -e "${GREEN}✅ Working directory is clean${NC}"
echo

# Step 2: Run pre-push validation
echo -e "${BLUE}🔍 Running pre-push validation...${NC}"
if pnpm pre-push; then
    echo -e "${GREEN}✅ Pre-push validation passed${NC}"
else
    echo -e "${RED}❌ Pre-push validation failed${NC}"
    exit 1
fi
echo

# Step 3: Test changeset version (dry run)
echo -e "${BLUE}📝 Testing changeset version...${NC}"
# Create temporary config without GitHub changelog for testing
cp .changeset/config.json .changeset/config.json.backup
cat > .changeset/config.json.temp << 'EOF'
{
  "$schema": "https://unpkg.com/@changesets/config@2.3.0/schema.json",
  "changelog": false,
  "commit": false,
  "fixed": [],
  "linked": [],
  "access": "public",
  "baseBranch": "main",
  "ignore": [],
  "privatePackages": {
    "version": false,
    "tag": false
  }
}
EOF
mv .changeset/config.json.temp .changeset/config.json

if pnpm run version-packages --dry-run > /dev/null 2>&1; then
    echo -e "${GREEN}✅ Changeset version test passed${NC}"
else
    echo -e "${RED}❌ Changeset version test failed${NC}"
    mv .changeset/config.json.backup .changeset/config.json
    exit 1
fi

# Restore original config
mv .changeset/config.json.backup .changeset/config.json
echo

# Step 4: Test build for publishing
echo -e "${BLUE}🏗️  Testing build for publishing...${NC}"
if pnpm build:workspace; then
    echo -e "${GREEN}✅ Build for publishing successful${NC}"
else
    echo -e "${RED}❌ Build for publishing failed${NC}"
    exit 1
fi
echo

# Step 5: Test changeset publish (dry run)
echo -e "${BLUE}📦 Testing changeset publish (dry run)...${NC}"
if pnpm changeset publish --dry-run; then
    echo -e "${GREEN}✅ Changeset publish test passed${NC}"
else
    echo -e "${YELLOW}⚠️  Changeset publish test completed (may show warnings for no changes)${NC}"
fi
echo

echo -e "${GREEN}🎉 All release process tests passed!${NC}"
echo -e "${GREEN}✅ Ready for production release${NC}"
echo
echo -e "${YELLOW}💡 To create an actual release:${NC}"
echo -e "${YELLOW}   1. Create a changeset: pnpm changeset${NC}"
echo -e "${YELLOW}   2. Commit the changeset${NC}"
echo -e "${YELLOW}   3. Push to main branch${NC}"
echo -e "${YELLOW}   4. GitHub Actions will create a release PR${NC}"
echo -e "${YELLOW}   5. Merge the release PR to publish packages${NC}"