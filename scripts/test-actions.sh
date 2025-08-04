#!/bin/bash

# Local GitHub Actions Testing Script
# Tests all workflows locally using act before pushing to remote

set -e

echo "🧪 Local GitHub Actions Testing"
echo "================================"

# Colors for output
RED='\033[0;31m'
GREEN='\033[0;32m'
YELLOW='\033[1;33m'
NC='\033[0m' # No Color

# Check if act is installed
if ! command -v act &> /dev/null; then
    echo -e "${RED}❌ act is not installed. Please install it with: brew install act${NC}"
    exit 1
fi

# Check if Docker is running
if ! docker ps &> /dev/null; then
    echo -e "${RED}❌ Docker is not running. Please start Docker first.${NC}"
    exit 1
fi

echo -e "${GREEN}✅ Prerequisites checked${NC}"
echo

# Test main workflow (test.yml)
echo -e "${YELLOW}🔍 Testing main workflow (test.yml)...${NC}"
if act -j test-main --container-architecture linux/amd64 --dryrun; then
    echo -e "${GREEN}✅ Main test workflow is valid${NC}"
else
    echo -e "${RED}❌ Main test workflow failed validation${NC}"
    exit 1
fi

echo

# Test PR workflow (test-pr.yml)
echo -e "${YELLOW}🔍 Testing PR workflow (test-pr.yml)...${NC}"
if act -j test-branch --container-architecture linux/amd64 --dryrun; then
    echo -e "${GREEN}✅ PR test workflow is valid${NC}"
else
    echo -e "${RED}❌ PR test workflow failed validation${NC}"
    exit 1
fi

echo

# Test release workflow (release-pr.yml) - dry run only
echo -e "${YELLOW}🔍 Testing release workflow (release-pr.yml)...${NC}"
if act -j release --container-architecture linux/amd64 --dryrun; then
    echo -e "${GREEN}✅ Release workflow is valid${NC}"
else
    echo -e "${RED}❌ Release workflow failed validation${NC}"
    exit 1
fi

echo

# Test publish workflow (publish.yml) - dry run only
echo -e "${YELLOW}🔍 Testing publish workflow (publish.yml)...${NC}"
if act -j publish --container-architecture linux/amd64 --dryrun; then
    echo -e "${GREEN}✅ Publish workflow is valid${NC}"
else
    echo -e "${RED}❌ Publish workflow failed validation${NC}"
    exit 1
fi

echo
echo -e "${GREEN}🎉 All GitHub Actions workflows validated successfully!${NC}"
echo -e "${GREEN}✅ Safe to push to remote${NC}"