#!/bin/bash
set -e

echo "🚀 Building and publishing packages to npm..."

# Build everything
echo "📦 Building packages..."
pnpm run build

# Publish instructor-stream
echo "📤 Publishing @cogniformai/instructor-stream..."
cd packages/instructor-stream
npm publish --access public

# Publish providers  
echo "📤 Publishing @cogniformai/providers..."
cd ../providers
npm publish --access public

cd ../..

echo "✅ Both packages published successfully!"
echo "🔗 Check: https://www.npmjs.com/package/@cogniformai/instructor-stream"
echo "🔗 Check: https://www.npmjs.com/package/@cogniformai/providers"