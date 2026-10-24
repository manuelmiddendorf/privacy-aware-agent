#!/bin/sh
set -eu

script_dir=$(CDPATH= cd -- "$(dirname -- "$0")" && pwd)
repo_dir=$(CDPATH= cd -- "$script_dir/.." && pwd)
local_dir="$repo_dir/.local/ollama"
archive="$local_dir/downloads/ollama-darwin-v0.40.4.tgz"
binary="$local_dir/runtime/ollama"
binary_checksum="$local_dir/runtime/ollama.sha256"
expected_archive_sha256="a4ceae4b2aaf18df37ebcbfb56ba3a37a87838631112d66c2be07268693c8d58"
expected_binary_sha256="61e3067857f23046338a3d1a14360ce749fbe0aa0b6168e728b7d11c1e219619"
manifest="$local_dir/models/manifests/registry.ollama.ai/library/qwen3/4b-instruct-2507-q4_K_M"
expected_manifest_sha256="6214d088d3846e16c9fe00adcbabdbfddc61ce4a70daacc46cb2310c38603054"

if [ ! -x "$binary" ] || [ ! -f "$archive" ] || [ ! -f "$binary_checksum" ] || [ ! -f "$manifest" ]; then
  echo "P7 pinned runtime or cached model is incomplete; no download is allowed." >&2
  exit 64
fi
if [ "$(/usr/bin/shasum -a 256 "$archive" | /usr/bin/awk '{print $1}')" != "$expected_archive_sha256" ] ||
   [ "$(/usr/bin/shasum -a 256 "$binary" | /usr/bin/awk '{print $1}')" != "$expected_binary_sha256" ] ||
   [ "$(/usr/bin/awk 'NR == 1 { print $1 }' "$binary_checksum")" != "$expected_binary_sha256" ] ||
   [ "$(/usr/bin/shasum -a 256 "$manifest" | /usr/bin/awk '{print $1}')" != "$expected_manifest_sha256" ]; then
  echo "P7 pinned runtime or manifest digest mismatch." >&2
  exit 65
fi

check_blob() {
  expected_size=$1
  expected_sha=$2
  blob="$local_dir/models/blobs/sha256-$expected_sha"
  if [ ! -f "$blob" ] || [ "$(/usr/bin/stat -f '%z' "$blob")" != "$expected_size" ] ||
     [ "$(/usr/bin/shasum -a 256 "$blob" | /usr/bin/awk '{print $1}')" != "$expected_sha" ]; then
    echo "P7 cached model blob mismatch." >&2
    exit 65
  fi
}
check_blob 2497280480 85e4a5b7b8ef0e48af0e8658f5aaab9c2324c76c1641493f4d1e25fce54b18b9
check_blob 1379 eade0a07cac7712787bbce23d12f9306adb4781d873d1df6e16f7840fa37afec
check_blob 11338 d18a5cc71b84bc4af394a31116bd3932b42241de70c77d2b76d69a314ec8aa12
check_blob 119 0914c7781e001948488d937994217538375b4fd8c1466c5e7a625221abd3ea7a
check_blob 487 b72accf9724e93698c57cbd3b1af2d3341b3d05ec2089d86d273d97964853cd2
check_blob 859 0edcdef34593eac1aa2be9c7d06c432dcf81945adca5eca2f27662c18f168ba0

user_name=$(/usr/bin/id -un)
home_record=$(/usr/bin/dscl . -read "/Users/$user_name" NFSHomeDirectory)
real_home=${home_record#NFSHomeDirectory: }
home_ollama="$real_home/.ollama"
identity_private="$home_ollama/id_ed25519"
identity_public="$home_ollama/id_ed25519.pub"
if [ -z "$real_home" ] || [ "$real_home" = "$home_record" ] || [ -L "$home_ollama" ] || [ ! -d "$home_ollama" ] ||
   [ -L "$identity_private" ] || [ -L "$identity_public" ] || [ ! -f "$identity_private" ] || [ ! -f "$identity_public" ]; then
  echo "P7 expected local identity metadata is invalid." >&2
  exit 66
fi
if [ "$(/usr/bin/stat -f '%Su:%Sp' "$home_ollama")" != "$user_name:drwxr-xr-x" ] ||
   [ "$(/usr/bin/stat -f '%Su:%Sp' "$identity_private")" != "$user_name:-rw-------" ] ||
   [ "$(/usr/bin/stat -f '%Su:%Sp' "$identity_public")" != "$user_name:-rw-r--r--" ]; then
  echo "P7 expected local identity ownership or mode is invalid." >&2
  exit 66
fi
if /usr/bin/find "$home_ollama" -mindepth 1 -maxdepth 1 ! -name id_ed25519 ! -name id_ed25519.pub -print -quit | /usr/bin/grep -q .; then
  echo "P7 refuses unexpected entries in the local identity directory." >&2
  exit 66
fi

runtime_version=$(/usr/bin/env -i \
  HOME="$real_home" \
  USER="$user_name" \
  PATH="/usr/bin:/bin:/usr/sbin:/sbin" \
  TMPDIR="$local_dir/tmp" \
  OLLAMA_NO_CLOUD=1 \
  OLLAMA_HOST=127.0.0.1:11435 \
  OLLAMA_MODELS="$local_dir/models" \
  OLLAMA_KEEP_ALIVE=0 \
  OLLAMA_NUM_PARALLEL=1 \
  OLLAMA_MAX_LOADED_MODELS=1 \
  OLLAMA_CONTEXT_LENGTH=16384 \
  /usr/bin/sandbox-exec \
    -f "$script_dir/p7-ollama-existing-identity.sb" \
    -D "HOME_OLLAMA=$home_ollama" \
    -D "IDENTITY_PRIVATE=$identity_private" \
    -D "IDENTITY_PUBLIC=$identity_public" \
    "$binary" --version 2>/dev/null)
case "$runtime_version" in
  *"0.40.4"*) ;;
  *) echo "P7 runtime version mismatch." >&2; exit 65 ;;
esac

if [ "${1:-}" = "--preflight" ]; then
  echo "P7 Ollama preflight passed: v0.40.4, pinned cached model, exact identity metadata, no key contents read."
  exit 0
fi
if [ "$#" -ne 0 ]; then
  echo "Use no argument to start, or --preflight to verify only." >&2
  exit 64
fi

exec /usr/bin/env -i \
  HOME="$real_home" \
  USER="$user_name" \
  PATH="/usr/bin:/bin:/usr/sbin:/sbin" \
  TMPDIR="$local_dir/tmp" \
  OLLAMA_NO_CLOUD=1 \
  OLLAMA_HOST=127.0.0.1:11435 \
  OLLAMA_MODELS="$local_dir/models" \
  OLLAMA_KEEP_ALIVE=0 \
  OLLAMA_NUM_PARALLEL=1 \
  OLLAMA_MAX_LOADED_MODELS=1 \
  OLLAMA_CONTEXT_LENGTH=16384 \
  /usr/bin/sandbox-exec \
    -f "$script_dir/p7-ollama-existing-identity.sb" \
    -D "HOME_OLLAMA=$home_ollama" \
    -D "IDENTITY_PRIVATE=$identity_private" \
    -D "IDENTITY_PUBLIC=$identity_public" \
    "$binary" serve \
    1>/dev/null 2>/dev/null
