FROM mcr.microsoft.com/devcontainers/javascript-node:20

# Install Chromium for extension testing/loading
RUN apt-get update \
    && apt-get install -y --no-install-recommends chromium \
    && rm -rf /var/lib/apt/lists/*

# Set Chromium path for WXT/Puppeteer if needed
ENV CHROME_PATH=/usr/bin/chromium

# Install Homebrew (linuxbrew) for the node user
RUN NONINTERACTIVE=1 bash -c "$(curl -fsSL https://raw.githubusercontent.com/Homebrew/install/HEAD/install.sh)" \
    && echo 'eval "$(/home/linuxbrew/.linuxbrew/bin/brew shellenv)"' >> /home/node/.bashrc
ENV PATH="/home/linuxbrew/.linuxbrew/bin:/home/linuxbrew/.linuxbrew/sbin:${PATH}"

# Install Claude Code CLI
RUN npm install -g @anthropic-ai/claude-code
