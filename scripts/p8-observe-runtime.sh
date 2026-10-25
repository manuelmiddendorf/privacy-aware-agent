#!/bin/sh
set -eu

script_dir=$(CDPATH= cd -- "$(dirname -- "$0")" && pwd)
repo_dir=$(CDPATH= cd -- "$script_dir/.." && pwd)
pid_file="$repo_dir/.local/p8/ollama.pid"
output=${1:-"$repo_dir/.local/p8/runtime-ready.json"}

"$script_dir/p7-verify-ollama-sandbox.sh" >/dev/null
"$script_dir/p7-ollama-serve.sh" --preflight >/dev/null

if [ ! -f "$pid_file" ]; then
  echo "P8 runtime PID metadata missing." >&2
  exit 70
fi
runtime_pid=$(/bin/cat "$pid_file")
case "$runtime_pid" in *[!0-9]*|'') echo "P8 runtime PID metadata invalid." >&2; exit 70;; esac
expected_command="$repo_dir/.local/ollama/runtime/ollama serve"

attempt=0
listener_pid=""
while [ "$attempt" -lt 60 ]; do
  if ! /bin/ps -p "$runtime_pid" -o pid= >/dev/null 2>&1; then
    echo "P8 runtime exited before listener readiness." >&2
    exit 71
  fi
  observed_command=$(/bin/ps -p "$runtime_pid" -o command= | /usr/bin/sed 's/^[[:space:]]*//;s/[[:space:]]*$//')
  if [ "$observed_command" != "$expected_command" ]; then
    attempt=$((attempt + 1))
    /bin/sleep 0.25
    continue
  fi
  listener_pid=$(/usr/sbin/lsof -nP -a -p "$runtime_pid" -iTCP@127.0.0.1:11435 -sTCP:LISTEN -Fp 2>/dev/null | /usr/bin/sed -n 's/^p//p' | /usr/bin/head -1)
  [ "$listener_pid" = "$runtime_pid" ] && break
  attempt=$((attempt + 1))
  /bin/sleep 0.25
done
if [ "$listener_pid" != "$runtime_pid" ]; then
  echo "P8 fixed loopback listener was not observed for the runtime PID." >&2
  exit 72
fi

observed_at=$(/bin/date -u +'%Y-%m-%dT%H:%M:%SZ')
/bin/mkdir -p -m 700 "$(dirname -- "$output")"
umask 077
temporary="$output.$$"
/bin/cat >"$temporary" <<EOF
{"schemaVersion":1,"runtimePid":$runtime_pid,"listenerPid":$listener_pid,"listenerHost":"127.0.0.1","listenerPort":11435,"observedAt":"$observed_at","runtimeVersion":"0.40.4","runtimeSha256":"61e3067857f23046338a3d1a14360ce749fbe0aa0b6168e728b7d11c1e219619","manifestFileSha256":"6214d088d3846e16c9fe00adcbabdbfddc61ce4a70daacc46cb2310c38603054","modelManifestSha256":"0edcdef34593eac1aa2be9c7d06c432dcf81945adca5eca2f27662c18f168ba0","sandboxVerified":true}
EOF
/bin/chmod 600 "$temporary"
/bin/mv "$temporary" "$output"
echo "P8 pinned runtime readiness metadata recorded without an inference request."
