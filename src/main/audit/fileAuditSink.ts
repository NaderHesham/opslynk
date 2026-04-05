import type { App } from 'electron';
import type { WriteStream } from 'fs';

interface FileAuditSinkDeps {
  app: Pick<App, 'getPath'>;
  fs: {
    createWriteStream: (path: string, options?: { flags?: string; encoding?: BufferEncoding }) => WriteStream;
    promises: {
      mkdir: (path: string, opts: { recursive: boolean }) => Promise<unknown>;
    };
  };
  path: {
    join: (...parts: string[]) => string;
  };
  dirName?: string;
  fileName?: string;
  maxPendingLines?: number;
}

export function createFileAuditSink({
  app,
  fs,
  path,
  dirName = 'audit',
  fileName = 'admin-security-audit.jsonl',
  maxPendingLines = 2000
}: FileAuditSinkDeps): {
  onAuditEntry: (entry: Record<string, unknown>) => void;
} {
  const pending: string[] = [];
  let stream: WriteStream | null = null;
  let initStarted = false;

  const auditDir = path.join(app.getPath('userData'), dirName);
  const filePath = path.join(auditDir, fileName);

  const flushPending = (): void => {
    if (!stream || stream.destroyed || pending.length === 0) return;
    while (pending.length > 0) {
      const line = pending.shift();
      if (line == null) continue;
      stream.write(line);
    }
  };

  const init = (): void => {
    if (initStarted) return;
    initStarted = true;
    void fs.promises
      .mkdir(auditDir, { recursive: true })
      .then(() => {
        stream = fs.createWriteStream(filePath, { flags: 'a', encoding: 'utf8' });
        flushPending();
      })
      .catch((err: unknown) => {
        console.error('[audit] Failed to initialize audit sink:', err);
      });
  };

  const onAuditEntry = (entry: Record<string, unknown>): void => {
    const line = `${JSON.stringify(entry)}\n`;
    if (stream && !stream.destroyed) {
      stream.write(line);
      return;
    }
    pending.push(line);
    if (pending.length > maxPendingLines) pending.shift();
    init();
  };

  return { onAuditEntry };
}
