const u = new URL(document.location.href);
const ws = new WebSocket(`wss:localhost:${u.port}`);
ws.onmessage = (_ev): void => {
  // TODO: see if this really applies to us.
  window.location.reload();
};
ws.onerror = (ev): void => {
  console.error('WebSocket error', ev);
};

/** Shut down the server. */
(globalThis as any).hostLocalSendShutdown = (): void => {
  ws.send(JSON.stringify({
    type: 'shutdown',
    url: window.location.href,
  }));
};
