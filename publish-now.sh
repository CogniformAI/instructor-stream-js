#!/bin/bash
set -e

# Colors for output
RED='\033[0;31m'
GREEN='\033[0;32m'
YELLOW='\033[1;33m'
BLUE='\033[0;34m'
NC='\033[0m' # No Color

# Function to print colored output
print_status() {
    echo -e "${BLUE}🔵 $1${NC}"
}

print_success() {
    echo -e "${GREEN}✅ $1${NC}"
}

print_warning() {
    echo -e "${YELLOW}⚠️  $1${NC}"
}

print_error() {
    echo -e "${RED}❌ $1${NC}"
}

# Function to bump version
bump_version() {
    local package_path=$1
    local current_version=$(node -p "require('$package_path/package.json').version")

    echo
    print_status "Current version in $package_path: $current_version"
    echo "How would you like to bump the version?"
    echo "1) patch (0.0.1 -> 0.0.2)"
    echo "2) minor (0.0.1 -> 0.1.0)"
    echo "3) major (0.0.1 -> 1.0.0)"
    echo "4) custom version"
    echo "5) skip version bump"

    read -p "Choose option (1-5): " choice

    case $choice in
        1)
            new_version=$(node -p "
                const semver = require('semver');
                const pkg = require('$package_path/package.json');
                semver.inc(pkg.version, 'patch');
            " 2>/dev/null || {
                # Fallback if semver not available
                IFS='.' read -ra ADDR <<< "$current_version"
                echo "${ADDR[0]}.${ADDR[1]}.$((${ADDR[2]} + 1))"
            })
            ;;
        2)
            new_version=$(node -p "
                const semver = require('semver');
                const pkg = require('$package_path/package.json');
                semver.inc(pkg.version, 'minor');
            " 2>/dev/null || {
                # Fallback if semver not available
                IFS='.' read -ra ADDR <<< "$current_version"
                echo "${ADDR[0]}.$((${ADDR[1]} + 1)).0"
            })
            ;;
        3)
            new_version=$(node -p "
                const semver = require('semver');
                const pkg = require('$package_path/package.json');
                semver.inc(pkg.version, 'major');
            " 2>/dev/null || {
                # Fallback if semver not available
                IFS='.' read -ra ADDR <<< "$current_version"
                echo "$((${ADDR[0]} + 1)).0.0"
            })
            ;;
        4)
            read -p "Enter custom version: " new_version
            ;;
        5)
            print_warning "Skipping version bump for $package_path"
            return 0
            ;;
        *)
            print_error "Invalid choice. Skipping version bump."
            return 0
            ;;
    esac

    # Update package.json
    node -e "
        const fs = require('fs');
        const path = '$package_path/package.json';
        const pkg = JSON.parse(fs.readFileSync(path, 'utf8'));
        pkg.version = '$new_version';
        fs.writeFileSync(path, JSON.stringify(pkg, null, 2) + '\n');
    "

    print_success "Bumped $package_path version: $current_version -> $new_version"
}

# Check if NPM_TOKEN is set
if [[ -z "${NPM_TOKEN}" ]]; then
    print_warning "NPM_TOKEN environment variable not set."
    print_status "Make sure your .npmrc has the auth token or set NPM_TOKEN"
fi

# Check authentication
print_status "Checking npm authentication..."
if ! npm whoami > /dev/null 2>&1; then
    print_error "Not authenticated with npm. Please run 'npm login' or check your .npmrc file."
    exit 1
fi

npm_user=$(npm whoami)
print_success "Authenticated as: $npm_user"

echo
print_status "🚀 Starting build and publish process..."

# Run pre-publish checks
print_status "Running pre-publish checks..."
echo "  • Linting..."
pnpm run lint

echo "  • Type checking..."
pnpm run typecheck

echo "  • Running tests..."
pnpm run test

print_success "All checks passed!"

# Build everything
print_status "📦 Building packages..."
pnpm run build
print_success "Build completed!"

echo
print_status "📋 Package Version Management"

# Ask if user wants to bump versions
echo "Would you like to bump package versions before publishing?"
read -p "Bump versions? (y/N): " bump_choice

if [[ $bump_choice =~ ^[Yy]$ ]]; then
    # Bump instructor-stream version
    print_status "Managing instructor-stream version..."
    bump_version "packages/instructor-stream"

    # Bump providers version
    print_status "Managing providers version..."
    bump_version "packages/providers"
fi

echo
print_status "📋 Publishing Summary"
echo "About to publish:"
echo "  • @cogniformai/instructor-stream@$(node -p "require('./packages/instructor-stream/package.json').version")"
echo "  • @cogniformai/providers@$(node -p "require('./packages/providers/package.json').version")"

echo
read -p "Continue with publishing? (y/N): " confirm

if [[ ! $confirm =~ ^[Yy]$ ]]; then
    print_warning "Publishing cancelled by user"
    exit 0
fi

echo
print_status "📤 Publishing packages..."

# Publish instructor-stream
print_status "Publishing @cogniformai/instructor-stream..."
cd packages/instructor-stream
npm publish --access public
cd ../..
print_success "@cogniformai/instructor-stream published!"

# Publish providers
print_status "Publishing @cogniformai/providers..."
cd packages/providers
npm publish --access public
cd ../..
print_success "@cogniformai/providers published!"

echo
print_success "🎉 Both packages published successfully!"
echo
echo "📋 Published versions:"
echo "  🔗 https://www.npmjs.com/package/@cogniformai/instructor-stream"
echo "  🔗 https://www.npmjs.com/package/@cogniformai/providers"

# Suggest next steps
echo
print_status "💡 Suggested next steps:"
echo "  1. Commit version changes: git add -A && git commit -m 'release: bump versions'"
echo "  2. Create tags: git tag v$(node -p "require('./packages/instructor-stream/package.json').version")"
echo "  3. Push changes: git push && git push --tags"
echo "  4. Create GitHub release"

print_success "Publish complete! 🚀"
