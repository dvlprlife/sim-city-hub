import { useCallback, useEffect, useRef, useState } from 'react';

// Auto-reconnecting WebSocket. Parses each frame as JSON and hands it to
// onMessage. Reconnects with capped exponential backoff.
export function useWebSocket(url, { onMessage } = {}) {
  const [status, setStatus] = useState('connecting');
  const wsRef = useRef(null);
  const onMessageRef = useRef(onMessage);
  onMessageRef.current = onMessage;

  useEffect(() => {
    let closedByUs = false;
    let retries = 0;
    let timer;

    function connect() {
      const ws = new WebSocket(url);
      wsRef.current = ws;
      setStatus('connecting');

      ws.onopen = () => {
        retries = 0;
        setStatus('open');
      };
      ws.onmessage = (e) => {
        try {
          onMessageRef.current?.(JSON.parse(e.data));
        } catch {
          /* ignore non-JSON frames */
        }
      };
      ws.onclose = () => {
        setStatus('closed');
        if (!closedByUs) {
          const delay = Math.min(1000 * 2 ** retries, 10000);
          retries += 1;
          timer = setTimeout(connect, delay);
        }
      };
      ws.onerror = () => ws.close();
    }

    connect();
    return () => {
      closedByUs = true;
      clearTimeout(timer);
      wsRef.current?.close();
    };
  }, [url]);

  const send = useCallback((obj) => {
    const ws = wsRef.current;
    if (ws && ws.readyState === WebSocket.OPEN) {
      ws.send(typeof obj === 'string' ? obj : JSON.stringify(obj));
    }
  }, []);

  return { status, send };
}
