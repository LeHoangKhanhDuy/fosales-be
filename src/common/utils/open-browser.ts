import { spawn } from 'node:child_process';
import { existsSync, writeFileSync } from 'node:fs';
import { tmpdir } from 'node:os';
import { join } from 'node:path';

function command(url: string): [string, string[]] {
  if (process.platform === 'win32') return ['cmd', ['/c', 'start', '""', url]];
  if (process.platform === 'darwin') return ['open', [url]];
  return ['xdg-open', [url]];
}

export function openBrowserOnce(url: string): boolean {
  const marker = join(tmpdir(), `fosales-api-browser-${process.ppid}`);
  if (existsSync(marker)) return false;
  try {
    writeFileSync(marker, url);
    const [bin, args] = command(url);
    const child = spawn(bin, args, {
      detached: true,
      stdio: 'ignore',
      windowsHide: true,
      windowsVerbatimArguments: process.platform === 'win32',
    });
    child.on('error', () => undefined);
    child.unref();
    return true;
  } catch {
    return false;
  }
}
