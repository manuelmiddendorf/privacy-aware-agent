#!/bin/sh
set -eu

script_dir=$(CDPATH= cd -- "$(dirname -- "$0")" && pwd)
repo_dir=$(CDPATH= cd -- "$script_dir/.." && pwd)
pid_file="$repo_dir/.local/p8/ollama.pid"
/bin/mkdir -p -m 700 "$(dirname -- "$pid_file")"
umask 077
temporary="$pid_file.$$"
/bin/echo "$$" >"$temporary"
/bin/chmod 600 "$temporary"
/bin/mv "$temporary" "$pid_file"
exec "$script_dir/p7-ollama-serve.sh"
