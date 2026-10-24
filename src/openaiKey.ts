import { lstat, readFile } from "node:fs/promises";
import { resolve } from "node:path";

const KEY_FILE_NAME = ".env.openai.local";

export async function loadProtectedLocalOpenAIKey(workingDirectory = process.cwd()): Promise<string> {
  const keyFile = resolve(workingDirectory, KEY_FILE_NAME);
  const stat = await lstat(keyFile);
  if (!stat.isFile() || stat.isSymbolicLink() || (stat.mode & 0o777) !== 0o600) {
    throw new Error("The local OpenAI key file must be a regular non-symlink file with mode 0600");
  }
  const text = await readFile(keyFile, "utf8");
  const lines = text.split(/\r?\n/).filter((line) => line.trim().length > 0);
  if (lines.length !== 1 || !lines[0]!.startsWith("OPENAI_API_KEY=") || lines[0]!.includes("\r")) {
    throw new Error("The local OpenAI key file must contain exactly OPENAI_API_KEY=<value>");
  }
  const key = lines[0]!.slice("OPENAI_API_KEY=".length);
  if (!key || /\s/.test(key)) throw new Error("The local OpenAI key file is invalid");
  return key;
}
