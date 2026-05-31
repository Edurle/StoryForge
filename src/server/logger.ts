import { createWriteStream, mkdirSync, existsSync } from "node:fs";
import { join } from "node:path";
import { stdout } from "node:process";

function timestamp(): string {
  return new Date().toISOString().replace("T", " ").slice(0, 19);
}

function dateStr(): string {
  return new Date().toISOString().slice(0, 10);
}

export function createLogger(logsDir: string) {
  if (!existsSync(logsDir)) mkdirSync(logsDir, { recursive: true });

  let stream = createWriteStream(join(logsDir, `${dateStr()}.log`), { flags: "a" });
  let currentDate = dateStr();

  function write(msg: string) {
    const now = dateStr();
    if (now !== currentDate) {
      stream.end();
      currentDate = now;
      stream = createWriteStream(join(logsDir, `${currentDate}.log`), { flags: "a" });
    }
    const line = `[${timestamp()}] ${msg}\n`;
    stdout.write(line);
    stream.write(line);
  }

  return {
    log(msg: string) { write(msg); },
    error(msg: string) { write(`[ERROR] ${msg}`); },
  };
}
