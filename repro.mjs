import { Client } from '@modelcontextprotocol/sdk/client/index.js';
import { StdioClientTransport } from '@modelcontextprotocol/sdk/client/stdio.js';
import { execFileSync } from 'node:child_process';
import { existsSync, readdirSync, mkdirSync } from 'node:fs';

mkdirSync('/tmp/video-out', { recursive: true });

console.log('=== Pre-flight state ===');
console.log('system google-chrome:', execFileSync('google-chrome', ['--version']).toString().trim());
const cache = '/root/.cache/ms-playwright';
console.log(`playwright cache (${cache}):`, existsSync(cache) ? readdirSync(cache) : '(missing)');
console.log('');

const transport = new StdioClientTransport({
  command: 'npx',
  args: [
    '@playwright/mcp',
    '--browser=chrome',
    '--headless',
    '--no-sandbox',
    '--config=/repro/video-config.json',
  ],
  stderr: 'pipe',
});

// Forward MCP stderr so we can see the underlying error.
transport.stderr?.on('data', (chunk) => process.stderr.write(`[mcp stderr] ${chunk}`));

const client = new Client(
  { name: 'video-repro', version: '1.0.0' },
  { capabilities: {} },
);

console.log('=== Connecting to @playwright/mcp ===');
await client.connect(transport);

console.log('=== Calling browser_navigate to about:blank ===');
try {
  const result = await client.callTool({
    name: 'browser_navigate',
    arguments: { url: 'about:blank' },
  });
  console.log('NAVIGATE RESULT:');
  console.log(JSON.stringify(result, null, 2));
  if (result.isError) {
    console.log('\n=== REPRODUCED: tool returned an error ===');
    process.exitCode = 2;
  } else {
    console.log('\n=== NOT reproduced — navigate succeeded ===');
  }
} catch (err) {
  console.error('THROWN:', err?.message ?? err);
  process.exitCode = 2;
} finally {
  await client.close().catch(() => {});
}
