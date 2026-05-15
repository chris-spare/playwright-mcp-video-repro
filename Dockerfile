# Minimal reproduction of @playwright/mcp misleading error:
#   "Browser \"chrome\" is not installed"
# when the real missing executable is ffmpeg (required for recordVideo).
#
# Build:  docker build -t pw-mcp-video-repro .
# Run:    docker run --rm pw-mcp-video-repro

FROM --platform=linux/amd64 ubuntu:24.04

ENV DEBIAN_FRONTEND=noninteractive

# Node 22 + system Google Chrome (so the 'chrome' channel resolves).
# Deliberately do NOT pre-install Playwright browsers / ffmpeg.
RUN apt-get update && apt-get install -y --no-install-recommends \
        ca-certificates curl wget gnupg \
    && curl -fsSL https://deb.nodesource.com/setup_22.x | bash - \
    && apt-get install -y --no-install-recommends nodejs \
    && wget -q https://dl.google.com/linux/direct/google-chrome-stable_current_amd64.deb \
    && apt-get install -y ./google-chrome-stable_current_amd64.deb \
    && rm google-chrome-stable_current_amd64.deb \
    && rm -rf /var/lib/apt/lists/*

WORKDIR /repro
COPY package.json repro.mjs video-config.json ./
RUN npm install --omit=dev

# Make sure the per-user Playwright cache starts empty.
# (No `npx playwright install` here — that's the whole point of the repro.)
RUN rm -rf /root/.cache/ms-playwright

CMD ["node", "repro.mjs"]
