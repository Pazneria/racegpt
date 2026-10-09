interface BridgeHooks {
  start(): boolean;
  post(message: object, targetOrigin: string): void;
}

/** Only an explicitly requested cabinet document accepts its own parent's start. */
export function createHostBridge(href: string, embedded: boolean, hooks: BridgeHooks) {
  const url = new URL(href), session = url.searchParams.get('arcadeSession');
  const rawOrigin = url.searchParams.get('arcadeParentOrigin');
  let parentOrigin: string;
  try {
    const parent = new URL(rawOrigin || '');
    if (!['http:', 'https:'].includes(parent.protocol) || parent.username || parent.password || parent.origin !== rawOrigin) return null;
    parentOrigin = parent.origin;
  } catch { return null; }
  if (!embedded || url.searchParams.get('arcadeStart') !== '1' || !session || session.length > 100) return null;
  let phase: 'booting' | 'ready' | 'started' | 'error' = 'booting';
  let escapeRequested = false;
  const post = (type: string) => hooks.post(Object.freeze({type, version: 1, session,
    trackId: url.searchParams.get('track')}), parentOrigin);
  const report = () => { if (phase !== 'booting') post('racegpt:cabinet:' + phase); };
  return {
    ready() { if (phase === 'booting') { phase = 'ready'; report(); } },
    error() { phase = 'error'; report(); },
    back() { if (phase === 'started') post('racegpt:cabinet:back'); },
    menu() { if (phase === 'started') post('racegpt:cabinet:menu'); },
    escape(event: Pick<KeyboardEvent, 'code' | 'repeat' | 'preventDefault' | 'stopImmediatePropagation'>) {
      if (event.code !== 'Escape' || phase !== 'started') return false;
      event.preventDefault(); event.stopImmediatePropagation();
      if (!event.repeat && !escapeRequested) { escapeRequested = true; post('racegpt:cabinet:back'); }
      return true;
    },
    receive(data: unknown, origin: string, sourceIsParent: boolean) {
      if (!sourceIsParent || origin !== parentOrigin || !data || typeof data !== 'object') return false;
      const message = data as {type?: string; version?: number; session?: string};
      if (message.version !== 1 || message.session !== session) return false;
      if (message.type === 'racegpt:cabinet:hello') { report(); return true; }
      if (message.type !== 'racegpt:cabinet:start') return false;
      if (phase === 'ready') {
        try { phase = hooks.start() ? 'started' : 'error'; } catch { phase = 'error'; }
      }
      report(); return true;
    },
    get phase() { return phase; }
  };
}
