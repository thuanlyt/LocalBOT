import assert from 'node:assert/strict';
import { createServer } from 'node:http';
import { mkdtemp, readFile, rm, writeFile } from 'node:fs/promises';
import os from 'node:os';
import path from 'node:path';
import test from 'node:test';
import { OllamaRequestError, OllamaStore } from './ollama.js';

test('Ollama settings are disabled by default and persist only bounded non-secret fields', async () => {
  const root = await mkdtemp(path.join(os.tmpdir(), 'localbot-ollama-'));
  try {
    const store = new OllamaStore(path.join(root, 'ollama.json'));
    await store.load();
    assert.deepEqual(await store.get(), { enabled: false, baseUrl: 'http://127.0.0.1:11434', model: '', timeoutMs: 5_000 });
    const updated = await store.update({ enabled: true, model: 'qwen2.5:7b', timeoutMs: 2_000 });
    assert.deepEqual(updated, { enabled: true, baseUrl: 'http://127.0.0.1:11434', model: 'qwen2.5:7b', timeoutMs: 2_000 });
    assert.equal((await readFile(path.join(root, 'ollama.json'), 'utf8')).includes('apiKey'), false);
  } finally {
    await rm(root, { recursive: true, force: true });
  }
});

test('Ollama settings reject unsafe endpoints and invalid timeouts without mutation', async () => {
  const root = await mkdtemp(path.join(os.tmpdir(), 'localbot-ollama-invalid-'));
  try {
    const store = new OllamaStore(path.join(root, 'ollama.json'));
    await store.load();
    await assert.rejects(() => store.update({ baseUrl: 'http://user:secret@example.test' }), /credential/);
    await assert.rejects(() => store.update({ timeoutMs: 31_000 }), /timeout/);
    assert.equal((await store.get()).baseUrl, 'http://127.0.0.1:11434');
  } finally {
    await rm(root, { recursive: true, force: true });
  }
});

test('Ollama health distinguishes disabled, unavailable model, ready, and offline states', async () => {
  const root = await mkdtemp(path.join(os.tmpdir(), 'localbot-ollama-health-'));
  const server = createServer((request, response) => {
    if (request.url === '/api/tags') {
      response.writeHead(200, { 'content-type': 'application/json' });
      response.end(JSON.stringify({ models: [{ name: 'qwen2.5:7b' }] }));
      return;
    }
    response.writeHead(404);
    response.end();
  });
  try {
    const unused = new OllamaStore(path.join(root, 'unused.json'));
    await unused.load();
    assert.deepEqual(await unused.health(), { status: 'disabled', reachable: false, modelAvailable: null });

    await new Promise<void>((resolve) => server.listen(0, '127.0.0.1', () => resolve()));
    const address = server.address();
    assert.ok(address && typeof address !== 'string');
    const store = new OllamaStore(path.join(root, 'ollama.json'));
    await store.load();
    await store.update({ enabled: true, baseUrl: `http://127.0.0.1:${address.port}`, model: 'qwen2.5:7b', timeoutMs: 2_000 });
    assert.deepEqual(await store.health(), { status: 'ready', reachable: true, modelAvailable: true });
    await store.update({ model: 'missing-model' });
    assert.deepEqual(await store.health(), { status: 'model_unavailable', reachable: true, modelAvailable: false });
    await store.update({ baseUrl: 'http://127.0.0.1:1' });
    assert.deepEqual(await store.health(), { status: 'offline', reachable: false, modelAvailable: null });
  } finally {
    await new Promise<void>((resolve) => server.close(() => resolve()));
    await rm(root, { recursive: true, force: true });
  }
});

test('Ollama suggestions are bounded, read-only, and never expose the raw provider payload', async () => {
  const root = await mkdtemp(path.join(os.tmpdir(), 'localbot-ollama-suggest-'));
  let receivedPrompt = '';
  const server = createServer(async (request, response) => {
    if (request.url !== '/api/generate' || request.method !== 'POST') {
      response.writeHead(404);
      response.end();
      return;
    }
    const chunks: Buffer[] = [];
    for await (const chunk of request) chunks.push(Buffer.from(chunk));
    const body = JSON.parse(Buffer.concat(chunks).toString('utf8')) as { prompt?: string; stream?: boolean; options?: { num_predict?: number } };
    receivedPrompt = body.prompt ?? '';
    assert.equal(body.stream, false);
    assert.equal(body.options?.num_predict, 256);
    response.writeHead(200, { 'content-type': 'application/json' });
    response.end(JSON.stringify({ response: 'gợi ý '.repeat(600), ignoredRawField: 'must not cross boundary' }));
  });
  try {
    await new Promise<void>((resolve) => server.listen(0, '127.0.0.1', () => resolve()));
    const address = server.address();
    assert.ok(address && typeof address !== 'string');
    const store = new OllamaStore(path.join(root, 'ollama.json'));
    await store.load();
    await store.update({ enabled: true, baseUrl: `http://127.0.0.1:${address.port}`, model: 'qwen2.5:7b', timeoutMs: 2_000 });
    const result = await store.suggest('Làm sao thêm bài?', 'music');
    assert.equal(result.surface, 'music');
    assert.equal(result.suggestion.length, 2_000);
    assert.equal(JSON.stringify(result).includes('ignoredRawField'), false);
    assert.match(receivedPrompt, /Làm sao thêm bài/);
    assert.match(receivedPrompt, /untrusted data/);
    await assert.rejects(() => store.suggest('x'.repeat(513), 'help'), (error: unknown) => error instanceof OllamaRequestError && error.code === 'OLLAMA_INVALID_INPUT');
  } finally {
    await new Promise<void>((resolve) => server.close(() => resolve()));
    await rm(root, { recursive: true, force: true });
  }
});

test('Ollama suggestions fail safely when disabled or unconfigured', async () => {
  const root = await mkdtemp(path.join(os.tmpdir(), 'localbot-ollama-suggest-state-'));
  try {
    const store = new OllamaStore(path.join(root, 'ollama.json'));
    await store.load();
    await assert.rejects(() => store.suggest('help', 'help'), (error: unknown) => error instanceof OllamaRequestError && error.code === 'OLLAMA_DISABLED');
    await store.update({ enabled: true });
    await assert.rejects(() => store.suggest('help', 'help'), (error: unknown) => error instanceof OllamaRequestError && error.code === 'OLLAMA_NOT_CONFIGURED');
  } finally {
    await rm(root, { recursive: true, force: true });
  }
});

test('Ollama corruption is quarantined and replaced with a disabled default', async () => {
  const root = await mkdtemp(path.join(os.tmpdir(), 'localbot-ollama-corrupt-'));
  try {
    const filePath = path.join(root, 'ollama.json');
    await writeFile(filePath, '{ broken', 'utf8');
    const store = new OllamaStore(filePath);
    await store.load();
    assert.equal((await store.get()).enabled, false);
    const files = await import('node:fs/promises').then(({ readdir }) => readdir(root));
    assert.ok(files.some((file) => file.startsWith('ollama.json.corrupt-')));
  } finally {
    await rm(root, { recursive: true, force: true });
  }
});
