#!/bin/bash
set -e

# Install Bun if not present
if ! command -v bun &> /dev/null; then
    echo "Bun not found. Installing Bun..."
    curl -fsSL https://bun.sh/install | bash
    export PATH="$HOME/.bun/bin:$PATH"
    # Also add to .bashrc for future sessions
    echo 'export PATH="$HOME/.bun/bin:$PATH"' >> ~/.bashrc
fi

# Install dependencies
echo "Installing dependencies..."
bun install

# Build the project
echo "Building the project..."
# We need to build the SDK first as core/opencode depend on it
cd packages/sdk/js && bun run script/build.ts && cd ../../..
# Now build the main opencode package
cd packages/opencode && bun run build && cd ../..

# Link the binary
echo "Linking opencode binary..."
# The binary is defined in packages/opencode/package.json
sudo ln -sf "$(pwd)/packages/opencode/bin/opencode" /usr/local/bin/opencode

echo "Installation complete! You can now run 'opencode' from anywhere."
echo "If you're using Ollama on this VPS, make sure it's running and set OLLAMA_HOST if it's not on localhost:11434."
