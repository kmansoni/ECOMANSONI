import { test, expect } from "@playwright/test";

const PK = "sb_publishable_8I_R_P73-7XZ5Rgopqd7yQ_frSWuB5e";
const JK = "eyJhbGciOiJIUzI1NiIsInR5cCI6IkpXVCJ9.eyJpc3MiOiJzdXBhYmFzZSIsInJlZiI6Imxma2JnbmJqeHNrc3Bzb3dudmptIiwicm9sZSI6ImFub24iLCJpYXQiOjE3NzE0NDI0NTYsImV4cCI6MjA4NzAxODQ1Nn0.WNubMc1s9TA91aT_txY850x2rWJ1ayxiTs7Rq6Do21k";

test("WebSocket к SFU с патчем apikey", async ({ browser }) => {
  const ctx = await browser.newContext({ ignoreHTTPSErrors: true });
  await ctx.addInitScript({
    content: `(() => {
      const PK = ${JSON.stringify(PK)};
      const JK = ${JSON.stringify(JK)};
      const _fetch = window.fetch;
      window.fetch = function(input, init) {
        if (init && init.headers) {
          const h = (init.headers instanceof Headers) ? init.headers : new Headers(init.headers);
          if (h.get('apikey') === PK) h.set('apikey', JK);
          const auth = h.get('authorization');
          if (auth === 'Bearer ' + PK) h.set('authorization', 'Bearer ' + JK);
          init = Object.assign({}, init, { headers: h });
        }
        if (typeof input === 'string' && input.includes(PK)) input = input.split(PK).join(JK);
        return _fetch.call(this, input, init);
      };
      const _WS = window.WebSocket;
      window.WebSocket = function(url, protocols) {
        if (typeof url === 'string' && url.includes(PK)) url = url.split(PK).join(JK);
        return protocols !== undefined ? new _WS(url, protocols) : new _WS(url);
      };
      window.WebSocket.prototype = _WS.prototype;
      window.WebSocket.CONNECTING = _WS.CONNECTING;
      window.WebSocket.OPEN = _WS.OPEN;
      window.WebSocket.CLOSING = _WS.CLOSING;
      window.WebSocket.CLOSED = _WS.CLOSED;
    })();`,
  });
  const page = await ctx.newPage();
  await page.goto("http://127.0.0.1:8080/", { waitUntil: "commit" });
  const result = await page.evaluate(
    () =>
      new Promise<string>((resolve) => {
        const ws = new WebSocket("wss://sfu-ru.mansoni.ru/ws");
        ws.onopen = () => { ws.close(); resolve("connected"); };
        ws.onerror = () => resolve("error");
        setTimeout(() => resolve("timeout-15s"), 15000);
      }),
  );
  console.log("WS result with patch:", result);
  expect(result).toBe("connected");
  await ctx.close();
});
