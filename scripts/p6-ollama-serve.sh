#!/bin/sh
set -eu

script_dir=$(CDPATH= cd -- "$(dirname -- "$0")" && pwd)
repo_dir=$(CDPATH= cd -- "$script_dir/.." && pwd)
local_dir="$repo_dir/.local/ollama"
archive="$local_dir/downloads/ollama-darwin-v0.40.4.tgz"
binary="$local_dir/runtime/ollama"
binary_checksum="$local_dir/runtime/ollama.sha256"
expected_archive_sha256="a4ceae4b2aaf18df37ebcbfb56ba3a37a87838631112d66c2be07268693c8d58"

if [ ! -x "$binary" ] || [ ! -f "$archive" ] || [ ! -f "$binary_checksum" ]; then
  echo "P6 runtime is not prepared; download and extraction require the separate reviewed step." >&2
  exit 64
fi

actual_archive_sha256=$(/usr/bin/shasum -a 256 "$archive" | /usr/bin/awk '{print $1}')
if [ "$actual_archive_sha256" != "$expected_archive_sha256" ]; then
  echo "P6 runtime archive checksum mismatch." >&2
  exit 65
fi

expected_binary_sha256=$(/usr/bin/awk 'NR == 1 { print $1 }' "$binary_checksum")
case "$expected_binary_sha256" in
  *[!0-9a-f]*|'')
    echo "P6 runtime binary checksum metadata is invalid." >&2
    exit 65
    ;;
esac
if [ "${#expected_binary_sha256}" -ne 64 ]; then
  echo "P6 runtime binary checksum metadata is invalid." >&2
  exit 65
fi
actual_binary_sha256=$(/usr/bin/shasum -a 256 "$binary" | /usr/bin/awk '{print $1}')
if [ "$actual_binary_sha256" != "$expected_binary_sha256" ]; then
  echo "P6 runtime binary checksum mismatch." >&2
  exit 65
fi

user_name=$(/usr/bin/id -un)
home_record=$(/usr/bin/dscl . -read "/Users/$user_name" NFSHomeDirectory)
real_home=${home_record#NFSHomeDirectory: }
if [ -z "$real_home" ] || [ "$real_home" = "$home_record" ] || [ ! -d "$real_home" ]; then
  echo "P6 could not resolve the real user home safely." >&2
  exit 66
fi

identity_private="$real_home/.ollama/id_ed25519"
identity_public="$real_home/.ollama/id_ed25519.pub"
if [ -e "$identity_private" ] || [ -L "$identity_private" ] || [ -e "$identity_public" ] || [ -L "$identity_public" ]; then
  echo "P6 refuses to read or reuse an existing Ollama identity." >&2
  exit 67
fi
if [ ! -d "$real_home/.ollama" ]; then
  echo "P6 requires the preapproved empty ~/.ollama directory to exist before guarded start." >&2
  exit 68
fi

/bin/mkdir -p "$local_dir/models" "$local_dir/tmp"

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
  OLLAMA_CONTEXT_LENGTH=4096 \
  /usr/bin/sandbox-exec \
    -f "$script_dir/p6-ollama.sb" \
    -D "HOME_OLLAMA=$real_home/.ollama" \
    -D "IDENTITY_PRIVATE=$identity_private" \
    -D "IDENTITY_PUBLIC=$identity_public" \
    "$binary" serve \
    1>/dev/null
