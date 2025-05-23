const u = new URL(document.location.href);
let ws: WebSocket | null = null;
let timer: NodeJS.Timeout | null = null;
let warning: HTMLDivElement | null = null;
let reconnect = true;

function getWarning(): HTMLDivElement {
  if (!warning) {
    warning = document.createElement('div');
    warning.innerText = 'Server down.  Reconnecting...';
    warning.classList.add('hostlocalWarning');
    warning.style.backgroundColor = 'red';
    warning.style.color = '#ddd';
    warning.style.fontSize = '2em';
    warning.style.position = 'fixed';
    warning.style.top = '0';
    warning.style.right = '0';
    warning.style.zIndex = '1000';
    warning.style.border = 'solid white';
    warning.style.padding = '3px 10px';
    warning.style.margin = '8px';

    document.body.appendChild(warning);
  }
  warning.hidden = false;
  return warning;
}

function randTime(): number {
  getWarning();

  // 1-2s.
  return 1000 + Math.floor(Math.random() * 1000);
}

function connect(): void {
  if (ws) {
    // Already trying to connect
    return;
  }

  const url = `wss:${u.hostname}:${u.port}`;
  ws = new WebSocket(url);
  ws.onopen = (_ev): void => {
    if (timer) {
      clearTimeout(timer);
      timer = null;
    }
    if (warning) {
      warning.hidden = true;
    }
  };

  ws.onmessage = (_ev): void => {
    // TODO: see if this really applies to us.
    window.location.reload();
  };

  // Failed trying to connect.
  ws.onerror = (_ev): void => {
    ws = null;
    if (reconnect) {
      timer = setTimeout(connect, randTime());
    }
  };

  // Server shutdown
  ws.onclose = (_ev): void => {
    ws = null;
    if (reconnect) {
      timer = setTimeout(connect, randTime());
    }
  };
}

connect();

/** Shut down the server.  Called from playwright tests. */
(globalThis as any).hostLocalSendShutdown = (): void => {
  // We're trying to shut down the server, so don't just reconnect
  reconnect = false;
  getWarning().innerText = 'Server shutting down.';

  ws?.send(JSON.stringify({
    type: 'shutdown',
    url: window.location.href,
  }));
};
