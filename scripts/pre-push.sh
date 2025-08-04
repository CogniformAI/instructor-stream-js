#!/bin/bash

# Comprehensive Pre-Push Testing Script
# Runs all checks locally to ensure CI/CD will pass

set -e

echo "🚀 Pre-Push Testing Suite"
echo "========================="

# Colors for output
RED='\033[0;31m'
GREEN='\033[0;32m'
YELLOW='\033[1;33m'
BLUE='\033[0;34m'
NC='\033[0m' # No Color

# Step 1: Check dependencies
echo -e "${BLUE}📦 Checking dependencies...${NC}"
if pnpm install --frozen-lockfile; then
    echo -e "${GREEN}✅ Dependencies up to date${NC}"
else
    echo -e "${RED}❌ Dependency installation failed${NC}"
    exit 1
fi

echo

# Step 2: Linting
echo -e "${BLUE}🔍 Running linter...${NC}"
if pnpm lint; then
    echo -e "${GREEN}✅ Linting passed${NC}"
else
    echo -e "${RED}❌ Linting failed${NC}"
    exit 1
fi

echo

# Step 3: Type checking (focus on instructor-stream package)
echo -e "${BLUE}🔧 Type checking...${NC}"
if cd packages/instructor-stream && pnpm type-check && cd ../..; then
    echo -e "${GREEN}✅ Type checking passed${NC}"
else
    echo -e "${RED}❌ Type checking failed${NC}"
    cd ../.. 2>/dev/null || true
    exit 1
fi

echo

# Step 4: Building (focus on instructor-stream and providers)
echo -e "${BLUE}🏗️  Building packages...${NC}"
if cd packages/instructor-stream && pnpm build && cd ../providers && pnpm build && cd ../..; then
    echo -e "${GREEN}✅ Build successful${NC}"
else
    echo -e "${RED}❌ Build failed${NC}"
    cd ../.. 2>/dev/null || true
    exit 1
fi

echo

# Step 5: Testing
echo -e "${BLUE}🧪 Running tests...${NC}"
if pnpm test; then
    echo -e "${GREEN}✅ All tests passed${NC}"
else
    echo -e "${RED}❌ Tests failed${NC}"
    exit 1
fi

echo

# Step 6: Changeset validation (if changesets exist)
if [ -d ".changeset" ] && [ "$(ls -A .changeset/*.md 2>/dev/null | head -1)" ]; then
    echo -e "${BLUE}📝 Validating changesets...${NC}"
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
        echo -e "${GREEN}✅ Changeset validation passed${NC}"
    else
        echo -e "${RED}❌ Changeset validation failed${NC}"
        mv .changeset/config.json.backup .changeset/config.json
        exit 1
    fi
    
    # Restore original config
    mv .changeset/config.json.backup .changeset/config.json
else
    echo -e "${YELLOW}⚠️  No changesets found - skipping changeset validation${NC}"
fi

echo

# Step 7: GitHub Actions validation
echo -e "${BLUE}⚙️  Validating GitHub Actions...${NC}"
if ./scripts/test-actions.sh; then
    echo -e "${GREEN}✅ GitHub Actions validation passed${NC}"
else
    echo -e "${RED}❌ GitHub Actions validation failed${NC}"
    exit 1
fi

echo
echo -e "${GREEN}🎉 All pre-push checks passed!${NC}"
echo -e "${GREEN}✅ Ready to push to remote${NC}"
echo
echo -e "${YELLOW}💡 Run 'git push' to deploy your changes${NC}"