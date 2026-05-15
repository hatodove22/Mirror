import { existsSync, readFileSync } from "node:fs";
import { spawn } from "node:child_process";
import { join } from "node:path";

if (existsSync(".env")) {
  for (const line of readFileSync(".env", "utf8").split(/\r?\n/)) {
    if (!line.trim() || line.trimStart().startsWith("#") || !line.includes("=")) {
      continue;
    }

    const [name, ...rest] = line.split("=");
    process.env[name.trim()] ??= rest.join("=").trim();
  }
}

const python =
  process.env.PYTHON ||
  (process.platform === "win32" ? join(".venv", "Scripts", "python.exe") : join(".venv", "bin", "python"));
const appModule = process.env.API_APP_MODULE || "backend.app.main:app";
const host = process.env.API_HOST || "127.0.0.1";
const port = process.env.API_PORT || "8004";
const reload = (process.env.API_RELOAD || "true").toLowerCase();
const args = ["-m", "uvicorn", appModule, "--host", host, "--port", port];

if (["true", "1", "yes"].includes(reload)) {
  args.push("--reload");
}

const child = spawn(python, args, { stdio: "inherit", shell: process.platform === "win32" });
child.on("exit", (code, signal) => {
  if (signal) {
    process.kill(process.pid, signal);
  }
  process.exit(code ?? 0);
});
