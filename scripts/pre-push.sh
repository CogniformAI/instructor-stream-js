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
echo -e "${GREEN}🎉 All pre-push checks passed!${NC}"
echo -e "${GREEN}✅ Ready to push to remote${NC}"
echo
echo -e "${YELLOW}💡 Run 'pnpm push-pr' to push & open a PR, or 'git push' to deploy${NC}"