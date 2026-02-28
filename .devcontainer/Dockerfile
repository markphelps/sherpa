FROM mcr.microsoft.com/devcontainers/base:ubuntu

# Install Chromium for extension testing/loading
RUN apt-get update \
    && apt-get install -y --no-install-recommends chromium-browser \
    && rm -rf /var/lib/apt/lists/*

# Set Chromium path for WXT/Puppeteer if needed
ENV CHROME_PATH=/usr/bin/chromium-browser

# Install mise
RUN curl https://mise.jdx.dev/install.sh | sh \
    && echo 'eval "$(~/.local/bin/mise activate bash)"' >> /home/vscode/.bashrc
ENV PATH="/home/vscode/.local/share/mise/shims:${PATH}"

# Install Homebrew (linuxbrew) for the vscode user
RUN NONINTERACTIVE=1 bash -c "$(curl -fsSL https://raw.githubusercontent.com/Homebrew/install/HEAD/install.sh)" \
    && echo 'eval "$(/home/linuxbrew/.linuxbrew/bin/brew shellenv)"' >> /home/vscode/.bashrc
ENV PATH="/home/linuxbrew/.linuxbrew/bin:/home/linuxbrew/.linuxbrew/sbin:${PATH}"

# Install Claude Code CLI (will use mise-managed npm after mise install)
RUN npm install -g @anthropic-ai/claude-code
