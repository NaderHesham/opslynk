interface TrustStoreDeps {
  app: { getPath: (name: 'userData') => string };
  fs: {
    promises: {
      mkdir: (path: string, opts: { recursive: boolean }) => Promise<unknown>;
      readFile: (path: string, encoding: BufferEncoding) => Promise<string>;
      writeFile: (path: string, data: string, encoding: BufferEncoding) => Promise<unknown>;
    };
  };
  path: { join: (...parts: string[]) => string };
  hasAdminAccess: (role: string | undefined) => boolean;
}

interface TrustStoreSnapshot {
  trustedPeerIds: string[];
  blockedPeerIds: string[];
}

export function createTrustStore({ app, fs, path, hasAdminAccess }: TrustStoreDeps): {
  isTrustedPeer: (peerId: string, role?: string) => boolean;
  isBlockedPeer: (peerId: string) => boolean;
  rememberPeer: (peerId: string, role?: string) => void;
  blockPeer: (peerId: string) => void;
  unblockPeer: (peerId: string) => void;
  getSnapshot: () => TrustStoreSnapshot;
} {
  const trustedPeerIds = new Set<string>();
  const blockedPeerIds = new Set<string>();

  const trustDir = path.join(app.getPath('userData'), 'security');
  const trustFile = path.join(trustDir, 'trust-store.json');
  let persistScheduled = false;

  const persist = (): void => {
    if (persistScheduled) return;
    persistScheduled = true;
    queueMicrotask(() => {
      persistScheduled = false;
      const snapshot: TrustStoreSnapshot = {
        trustedPeerIds: [...trustedPeerIds],
        blockedPeerIds: [...blockedPeerIds]
      };
      void fs.promises
        .mkdir(trustDir, { recursive: true })
        .then(() => fs.promises.writeFile(trustFile, JSON.stringify(snapshot, null, 2), 'utf8'))
        .catch((err: unknown) => {
          console.error('[trust-store] Failed to persist trust data:', err);
        });
    });
  };

  const hydrate = (): void => {
    void fs.promises
      .readFile(trustFile, 'utf8')
      .then((raw) => {
        const data = JSON.parse(raw) as Partial<TrustStoreSnapshot>;
        for (const id of data.trustedPeerIds || []) {
          if (typeof id === 'string' && id.trim()) trustedPeerIds.add(id);
        }
        for (const id of data.blockedPeerIds || []) {
          if (typeof id === 'string' && id.trim()) blockedPeerIds.add(id);
        }
      })
      .catch(() => {});
  };

  const rememberPeer = (peerId: string, role?: string): void => {
    if (!peerId || blockedPeerIds.has(peerId)) return;
    if (hasAdminAccess(role)) {
      trustedPeerIds.add(peerId);
      persist();
    }
  };

  const isBlockedPeer = (peerId: string): boolean => blockedPeerIds.has(peerId);

  const isTrustedPeer = (peerId: string, role?: string): boolean => {
    if (!peerId || blockedPeerIds.has(peerId)) return false;
    if (hasAdminAccess(role)) {
      trustedPeerIds.add(peerId);
      persist();
      return true;
    }
    return trustedPeerIds.has(peerId);
  };

  const blockPeer = (peerId: string): void => {
    if (!peerId) return;
    blockedPeerIds.add(peerId);
    trustedPeerIds.delete(peerId);
    persist();
  };

  const unblockPeer = (peerId: string): void => {
    if (!peerId) return;
    blockedPeerIds.delete(peerId);
    persist();
  };

  hydrate();

  return {
    isTrustedPeer,
    isBlockedPeer,
    rememberPeer,
    blockPeer,
    unblockPeer,
    getSnapshot: () => ({ trustedPeerIds: [...trustedPeerIds], blockedPeerIds: [...blockedPeerIds] })
  };
}
