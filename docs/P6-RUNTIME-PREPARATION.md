# P6 pinned runtime preparation

Prepared: 2026-10-24  
Verified runtime and model: 2026-10-25

No model inference or benchmark was part of the runtime preparation or download. OpenAI, API keys, ledgers, Amsel systems, and cloud inference were not accessed.

## Verified local artifacts

- Official archive: Ollama v0.40.4 `ollama-darwin.tgz`
- Stored only at ignored project path `.local/ollama/downloads/ollama-darwin-v0.40.4.tgz`
- Size: 167,884,528 bytes
- SHA-256: `a4ceae4b2aaf18df37ebcbfb56ba3a37a87838631112d66c2be07268693c8d58`
- Archive inventory before extraction: 59 entries, comprising 47 files, 2 directories, 10 relative symlinks, and no hardlinks
- No absolute path, `..` path, or symlink escape was found before or after extraction
- Extracted only into ignored project path `.local/ollama/runtime`
- Derived binary size: 52,241,008 bytes
- Derived binary SHA-256: `61e3067857f23046338a3d1a14360ce749fbe0aa0b6168e728b7d11c1e219619`

The wrapper verifies both the public archive digest and the binary digest derived immediately from that verified archive. A sidecar alone is not treated as provenance.

## Guarded start evidence

The first guarded start used a clean child environment, real `HOME`, `OLLAMA_NO_CLOUD=1`, `127.0.0.1:11435`, and project-local model and temporary directories. The profile denied the entire real `~/.ollama` subtree. Ollama attempted its upstream identity initialization and stopped when directory creation was denied. This produced no listener, model files, or inference and had no unguarded retry.

That first error alone did not prove whether a key existed because a denied metadata operation can differ from a normal absence result. After the human explicitly allowed a metadata-only check, `~/.ollama`, `id_ed25519`, and `id_ed25519.pub` were each confirmed absent without reading contents.

The human then allowed first creation of the directory and exactly the two upstream key files. Four synthetic `/tmp` policy variants were rejected before touching the real path:

| Variant | Synthetic child operations | Observed result |
| --- | --- | --- |
| `deny file-read* file-write*` with `require-all(subpath, require-not directory/key literals)` | Create `.ollama`, write both approved names, then write `server.json` | Child exit 91, the test's deliberate signal that the third write unexpectedly succeeded |
| Deny subtree, then allow read/write on the directory literal and both key literals | Same three writes | Child exit 91; private=1, public=1, other=1 |
| Deny subtree, allow only read on the directory and read/write on both exact key literals | Parent directory pre-created outside the sandbox; write both approved names, then `server.json` | Child exit 91; private=1, public=1, other=1 |
| Deny `file-write-create` on subtree, then allow create on both exact key literals | Parent pre-created; shell reported the three individual create exits | Individual exits `0 0 0`; verification harness exit 1 because the third file existed |

The independent review identified a test-method error in those four failures: the fixtures passed `/tmp/...` while the kernel evaluated canonical `/private/tmp/...` paths. One authorized corrected run used `/private/tmp` consistently for the base, subtree, literals, and all three writes. The two approved names were created, `server.json` was denied with `Operation not permitted`, the child exited 0, and verification reported `private=1`, `public=1`, `other=0`. All canonical fixtures were removed.

The checked-in profile contains that exact `require-all`/`require-not` form. After independent acceptance and explicit authorization, the real directory was created with mode 0755 and the guarded wrapper was started. It created exactly `id_ed25519` with mode 0600 and `id_ed25519.pub` with mode 0644. Their contents were not read. No other entry existed in the real `~/.ollama` directory after first start.

The runtime reported version 0.40.4, `OLLAMA_NO_CLOUD:true`, `Ollama cloud disabled: true`, and `Listening on 127.0.0.1:11435`. The loopback version endpoint returned 0.40.4 and the model list was initially empty. There was no fallback to an unguarded process and no larger custom sandbox architecture was introduced.

## Verified pinned model

The exact tag `qwen3:4b-instruct-2507-q4_K_M` was pulled through the guarded loopback service. The installed tag reports digest `0edcdef34593eac1aa2be9c7d06c432dcf81945adca5eca2f27662c18f168ba0` and total model size 2,497,293,803 bytes.

Every referenced file was hashed locally after download:

| Artifact | Bytes | SHA-256 |
| --- | ---: | --- |
| model | 2,497,280,480 | `85e4a5b7b8ef0e48af0e8658f5aaab9c2324c76c1641493f4d1e25fce54b18b9` |
| template | 1,379 | `eade0a07cac7712787bbce23d12f9306adb4781d873d1df6e16f7840fa37afec` |
| license | 11,338 | `d18a5cc71b84bc4af394a31116bd3932b42241de70c77d2b76d69a314ec8aa12` |
| parameters | 119 | `0914c7781e001948488d937994217538375b4fd8c1466c5e7a625221abd3ea7a` |
| config | 487 | `b72accf9724e93698c57cbd3b1af2d3341b3d05ec2089d86d273d97964853cd2` |
| canonical v2 manifest | 859 | `0edcdef34593eac1aa2be9c7d06c432dcf81945adca5eca2f27662c18f168ba0` |

Ollama also created a 1,022-byte registry wrapper manifest with SHA-256 `6214d088d3846e16c9fe00adcbabdbfddc61ce4a70daacc46cb2310c38603054`. It references the same config, four content layers, and pinned canonical v2 manifest. All six content files matched their digest filenames. Approximately 1.08 TB of filesystem space remained after installation.

All runtime and model files live below the ignored project path `.local/ollama`. This verification proves the checked version, local bind, cloud-disabled runtime configuration, and installed file integrity. It does not claim general network isolation or model suitability; those require their separately controlled checks.
