#!/bin/bash

# Release script for instructor-stream-js workspace
# Handles version bumping, changelog, git operations, and NPM publishing

set -e

echo "🚀 Starting release process..."
echo "================================"

# Colors for output
RED='\033[0;31m'
GREEN='\033[0;32m'
YELLOW='\033[1;33m'
BLUE='\033[0;34m'
NC='\033[0m' # No Color

# Step 1: Build all packages
echo -e "${BLUE}🏗️  Building workspace packages...${NC}"
if pnpm build:workspace; then
    echo -e "${GREEN}✅ Build successful${NC}"
else
    echo -e "${RED}❌ Build failed${NC}"
    exit 1
fi

echo

# Step 2: Handle version bumping, changelog, and git operations at root level
echo -e "${BLUE}📝 Updating version and changelog...${NC}"
if release-it --no-npm; then
    echo -e "${GREEN}✅ Version and changelog updated${NC}"
else
    echo -e "${RED}❌ Version update failed${NC}"
    exit 1
fi

echo

# Step 3: Publish instructor-stream package
echo -e "${BLUE}📦 Publishing @cogniformai/instructor-stream...${NC}"
cd packages/instructor-stream
if release-it --no-git --no-github; then
    echo -e "${GREEN}✅ @cogniformai/instructor-stream published${NC}"
else
    echo -e "${RED}❌ Failed to publish @cogniformai/instructor-stream${NC}"
    cd ../..
    exit 1
fi
cd ../..

echo

# Step 4: Publish providers package
echo -e "${BLUE}📦 Publishing @cogniformai/providers...${NC}"
cd packages/providers
if release-it --no-git --no-github; then
    echo -e "${GREEN}✅ @cogniformai/providers published${NC}"
else
    echo -e "${RED}❌ Failed to publish @cogniformai/providers${NC}"
    cd ../..
    exit 1
fi
cd ../..

echo
echo -e "${GREEN}🎉 Release process completed successfully!${NC}"
echo -e "${GREEN}✅ All packages published to NPM${NC}"
echo -e "${GREEN}✅ GitHub release created${NC}"
echo