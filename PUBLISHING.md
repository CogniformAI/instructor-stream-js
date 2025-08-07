# Publishing Guide

This document outlines the publishing process for the instructor-stream-js monorepo packages.

## Overview

This monorepo contains two main packages:
- `@cogniformai/instructor-stream` - Core streaming functionality
- `@cogniformai/providers` - Universal LLM client

## Prerequisites

### 1. Authentication

Set up npm authentication using one of these methods:

**Option A: Environment Variable (Recommended)**
```bash
export NPM_TOKEN=npm_your_token_here
```

**Option B: Direct Login**
```bash
npm login
```

**Option C: Manual .npmrc (Development Only)**
```bash
echo "//registry.npmjs.org/:_authToken=npm_your_token_here" > ~/.npmrc
```

### 2. Verify Authentication

```bash
npm whoami
# Should return: david-cogniformai
```

## Publishing Methods

### Method 1: Interactive Publishing Script (Recommended)

The `publish-now.sh` script provides an interactive, comprehensive publishing workflow:

```bash
# Run the interactive publish script
pnpm run publish

# Or directly
./publish-now.sh
```

**What it does:**
1. ✅ Checks authentication
2. ✅ Runs linting, type-checking, and tests
3. ✅ Builds all packages
4. 📋 Interactive version management
5. 📤 Publishes packages with confirmation
6. 💡 Provides next steps guidance

### Method 2: Automated Version Bumping

Use bumpp for automated version management:

```bash
# Patch release (0.0.1 -> 0.0.2)
pnpm run release:patch

# Minor release (0.0.1 -> 0.1.0)  
pnpm run release:minor

# Major release (0.0.1 -> 1.0.0)
pnpm run release:major
```

### Method 3: Manual Version Management

```bash
# Bump versions manually
pnpm run version:bump

# Then publish
pnpm run publish:local
```

## Version Management

### Bumpp Configuration

The project uses `bumpp` for version management with the following configuration (`.bumpp.config.ts`):

```typescript
{
  tag: true,        // Create git tags
  commit: 'release: v%s', // Commit message format
  push: false,      // Don't auto-push (manual control)
  all: true,        // Update all workspace packages
}
```

### Version Strategies

**Pre-1.0 (Current State)**
- Breaking changes are acceptable
- Use semantic versioning with `0.x.y` format
- `0.x.0` for minor features and breaking changes
- `0.x.y` for patches and fixes

**Post-1.0 (Future)**
- Strict semantic versioning
- `x.0.0` for breaking changes
- `x.y.0` for new features
- `x.y.z` for patches

## Package-Specific Notes

### @cogniformai/instructor-stream

Main streaming library:
- Contains core functionality
- Should be published first if both packages change
- Version increments drive overall release versions

### @cogniformai/providers

Universal LLM client:
- Can be versioned independently
- Contains provider adapters (OpenAI, Anthropic, Google)
- May have different release cadence

## Release Workflow

### Standard Release Process

1. **Prepare Release Branch**
   ```bash
   git checkout -b release/v0.x.y
   ```

2. **Run Pre-Release Checks**
   ```bash
   pnpm run publish:dry-run
   ```

3. **Interactive Publishing**
   ```bash
   pnpm run publish
   ```

4. **Post-Release Actions**
   ```bash
   # Commit version changes
   git add -A
   git commit -m "release: v0.x.y"
   
   # Create tags
   git tag v0.x.y
   
   # Push changes
   git push origin release/v0.x.y
   git push --tags
   
   # Create PR to main
   ```

5. **GitHub Release**
   - Create release from tag on GitHub
   - Use generated changelog
   - Mark as pre-release if version < 1.0.0

### Emergency/Hotfix Release

1. **Create Hotfix Branch**
   ```bash
   git checkout -b hotfix/fix-critical-issue
   ```

2. **Make Minimal Changes**
   - Fix only the critical issue
   - Avoid feature additions

3. **Patch Release**
   ```bash
   pnpm run release:patch
   ```

4. **Fast-Track Review**
   - Create PR with urgent label
   - Get required approvals
   - Merge and release

## Common Scenarios

### Publishing Only One Package

If you need to publish just one package:

```bash
# Navigate to specific package
cd packages/instructor-stream
# or
cd packages/providers

# Publish directly
npm publish --access public
```

### Handling Failed Publishes

If a publish fails:

1. **Check Error Type**
   - Authentication: Verify npm login
   - Version conflict: Bump version
   - Network: Retry after delay

2. **Common Fixes**
   ```bash
   # Re-authenticate
   npm login
   
   # Bump version if conflict
   pnpm run version:patch
   
   # Clean and rebuild
   pnpm run clean && pnpm run build
   ```

### Unpublishing (Use with Caution)

⚠️ **Warning**: Only unpublish if absolutely necessary and within 72 hours.

```bash
# Unpublish specific version
npm unpublish @cogniformai/package-name@version --force

# Unpublish entire package (blocks re-publishing for 24 hours)
npm unpublish @cogniformai/package-name --force
```

## Environment Setup

### Development Environment

```bash
# Install dependencies
pnpm install

# Set up environment
cp .env.example .env
# Edit .env with your tokens

# Verify setup
pnpm run test
pnpm run build
```

### CI/CD Environment

The project uses GitHub Actions for automated releases:

- **Trigger**: Merge to main with version changes
- **Process**: Build → Test → Publish
- **Artifacts**: NPM packages, GitHub releases

## Troubleshooting

### Common Issues

1. **Authentication Failures**
   ```bash
   Error: 401 Unauthorized
   ```
   **Solution**: Check NPM_TOKEN or re-run `npm login`

2. **Version Conflicts**
   ```bash
   Error: Version already exists
   ```
   **Solution**: Bump version with `pnpm run version:patch`

3. **Build Failures**
   ```bash
   Error: Build failed
   ```
   **Solution**: Run `pnpm run clean && pnpm install && pnpm run build`

4. **Peer Dependency Warnings**
   ```bash
   Warning: Unmet peer dependency
   ```
   **Solution**: Usually safe to ignore, or update peer dependencies

### Getting Help

1. **Check Logs**: Review npm publish logs for specific errors
2. **Verify Setup**: Ensure all prerequisites are met
3. **Clean State**: Try with fresh build and dependencies
4. **GitHub Issues**: Create issue if problem persists

## Security Notes

- ✅ Never commit NPM tokens to git
- ✅ Use environment variables for tokens
- ✅ Rotate tokens periodically
- ✅ Use npm 2FA when available
- ⚠️ Review package contents before publishing

## Monitoring

After publishing, verify:

- ✅ Package appears on npm: https://www.npmjs.com/package/@cogniformai/instructor-stream
- ✅ Package appears on npm: https://www.npmjs.com/package/@cogniformai/providers
- ✅ Installation works: `npm install @cogniformai/instructor-stream`
- ✅ Types are exported correctly
- ✅ Documentation is up to date

---

**Last Updated**: 2025-08-07  
**Maintainer**: David Robertson (@daver987)  
**Repository**: https://github.com/cogniformai/instructor-stream-js