import assert from "node:assert/strict";
import { chmod, mkdtemp, symlink, writeFile } from "node:fs/promises";
import { tmpdir } from "node:os";
import { join } from "node:path";
import test from "node:test";
import { loadProtectedLocalOpenAIKey } from "../src/openaiKey.js";

test("the shared key loader accepts only a regular 0600 one-line local file", async () => {
  const directory = await mkdtemp(join(tmpdir(), "paa-openai-key-"));
  const keyPath = join(directory, ".env.openai.local");
  await writeFile(keyPath, "OPENAI_API_KEY=synthetic-test-key\n", { mode: 0o600 });
  assert.equal(await loadProtectedLocalOpenAIKey(directory), "synthetic-test-key");

  await chmod(keyPath, 0o644);
  await assert.rejects(() => loadProtectedLocalOpenAIKey(directory), /regular non-symlink file with mode 0600/);

  const linkedDirectory = await mkdtemp(join(tmpdir(), "paa-openai-key-link-"));
  await symlink(keyPath, join(linkedDirectory, ".env.openai.local"));
  await assert.rejects(() => loadProtectedLocalOpenAIKey(linkedDirectory), /regular non-symlink file with mode 0600/);
});
