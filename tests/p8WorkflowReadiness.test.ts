import assert from "node:assert/strict";
import test from "node:test";
import {
  P8_PINNED_MANIFEST_FILE_SHA256,
  P8_PINNED_MODEL_MANIFEST_SHA256,
  P8_PINNED_RUNTIME_SHA256,
  verifyP8LoopbackRuntimeReady,
} from "../src/p8WorkflowReadiness.js";

const ready = (now: number) => ({
  schemaVersion: 1,
  runtimePid: 4242,
  listenerPid: 4242,
  listenerHost: "127.0.0.1",
  listenerPort: 11435,
  observedAt: new Date(now - 100).toISOString(),
  runtimeVersion: "0.40.4",
  runtimeSha256: P8_PINNED_RUNTIME_SHA256,
  manifestFileSha256: P8_PINNED_MANIFEST_FILE_SHA256,
  modelManifestSha256: P8_PINNED_MODEL_MANIFEST_SHA256,
  sandboxVerified: true,
});

test("P8 readiness accepts only a fresh pinned runtime whose own PID listens on fixed loopback", () => {
  const now = Date.now();
  assert.doesNotThrow(() => verifyP8LoopbackRuntimeReady(ready(now), now));
  for (const change of [
    { listenerPid: 9999 }, { listenerHost: "0.0.0.0" }, { listenerPort: 11434 }, { runtimeVersion: "latest" },
    { sandboxVerified: false }, { observedAt: new Date(now - 30_001).toISOString() }, { extra: "probe" },
  ]) assert.throws(() => verifyP8LoopbackRuntimeReady({ ...ready(now), ...change }, now));
});
