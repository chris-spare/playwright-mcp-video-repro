# `@playwright/mcp` recordVideo → misleading "chrome is not installed"

Minimal reproduction for a bug in `@playwright/mcp` where launching the browser
with `recordVideo` configured produces the error:

> `Browser "chrome" is not installed. Run \`npx @playwright/mcp install-browser chrome\` to install`

even though Google Chrome **is** installed correctly. The real missing
executable is **ffmpeg**, which Playwright requires for video recording.

## Reproduce

```bash
docker build --platform=linux/amd64 -t pw-mcp-video-repro .
docker run --rm --platform=linux/amd64 pw-mcp-video-repro
```

Observed output (truncated):

```
=== Pre-flight state ===
system google-chrome: Google Chrome 148.0.7778.167
playwright cache (/root/.cache/ms-playwright): (missing)

=== Connecting to @playwright/mcp ===
=== Calling browser_navigate to about:blank ===
NAVIGATE RESULT:
{
  "content": [
    { "type": "text",
      "text": "### Error\nError: Browser \"chrome\" is not installed. Run `npx @playwright/mcp install-browser chrome` to install" }
  ],
  "isError": true
}
```

## Confirmation that ffmpeg is the real missing piece

```bash
docker run --rm --platform=linux/amd64 --entrypoint sh pw-mcp-video-repro \
    -c 'cd /repro && npx playwright install ffmpeg && node repro.mjs'
```

After installing ffmpeg, the cache contains `ffmpeg-1011` and the same MCP
invocation **succeeds**:

```
playwright cache (/root/.cache/ms-playwright): [ '.links', 'ffmpeg-1011' ]
...
NAVIGATE RESULT:
{ "content": [ { "type": "text", "text": "... await page.goto('about:blank') ..." } ] }
=== NOT reproduced — navigate succeeded ===
```

## What the repro does

1. Starts from `ubuntu:24.04` with **system Google Chrome** installed (so the
   `chrome` channel resolves correctly).
2. Does **not** run `npx playwright install` — so the per-user Playwright cache
   at `~/.cache/ms-playwright/` is empty and ffmpeg is not present.
3. Launches `@playwright/mcp` with `--browser=chrome --headless --no-sandbox`
   and a `--config` that sets `contextOptions.recordVideo`.
4. Drives the MCP server via stdio (`@modelcontextprotocol/sdk`) and calls
   `browser_navigate`.
5. Captures the error response.

## Root cause

In `packages/playwright-core/src/tools/mcp/browserFactory.ts`, both
`createIsolatedBrowser` and `createPersistentBrowser` catch errors from
`launchPersistentContext(...)` / `launch(...)` and substring-match
`"Executable doesn't exist"`:

```ts
} catch (error: any) {
  if (error.message.includes('Executable doesn\'t exist'))
    throwBrowserIsNotInstalledError(config);
  ...
```

`throwBrowserIsNotInstalledError` then unconditionally reports the channel from
config:

```ts
function throwBrowserIsNotInstalledError(config: FullConfig): never {
  const channel = config.browser.launchOptions?.channel ?? config.browser.browserName;
  throw new Error(`Browser "${channel}" is not installed. Run \`npx @playwright/mcp install-browser ${channel}\` to install`);
}
```

But `"Executable doesn't exist"` is the message Playwright's registry throws
for **any** managed executable, including ffmpeg. When `recordVideo` is set,
ffmpeg is required; if it's missing the user sees a chrome-install hint that
doesn't match the actual problem.

## Related

- microsoft/playwright-mcp#1134 — earlier duplicate, closed with a workaround
  suggestion ("run `npx playwright install ffmpeg`") but not a fix to the
  misleading error.
- microsoft/playwright#37997 — added a pre-flight `checkFfmpeg()` in
  `program.ts` for the `--save-video` CLI flag. As of `main` the check is no
  longer present (lost during the refactor that moved MCP source from
  `packages/playwright/src/mcp/` to `packages/playwright-core/src/tools/mcp/`),
  so neither the CLI flag nor the config-file path are currently guarded.

## Environment

```
System:
  OS: Linux 6.12 Ubuntu 24.04.4 LTS 24.04.4 LTS (Noble Numbat)
  CPU: (14) x64 VirtualApple @ 2.50GHz
  Memory: 3.52 GB / 7.65 GB
  Container: Yes
Binaries:
  Node: 22.22.2 - /usr/bin/node
  npm: 10.9.7 - /usr/bin/npm
Languages:
  Bash: 5.2.21 - /usr/bin/bash
npmPackages:
  @playwright/mcp: 0.0.75 => 0.0.75
```
