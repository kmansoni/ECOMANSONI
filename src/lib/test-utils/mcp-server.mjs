import { chromium } from 'playwright';

let browser = null;
let page = null;

const tools = {
  browser_open: {
    description: 'Open a URL in browser',
    input: {
      type: 'object',
      properties: {
        url: { type: 'string', description: 'URL to open' },
        session: { type: 'string', description: 'Session ID (optional)' },
        waitUntil: { type: 'string', enum: ['load', 'domcontentloaded', 'networkidle'], description: 'Wait condition' }
      },
      required: ['url']
    }
  },
  browser_screenshot: {
    description: 'Take screenshot of current page',
    input: {
      type: 'object',
      properties: {
        path: { type: 'string', description: 'Save path (optional)' },
        fullPage: { type: 'boolean', description: 'Full page screenshot' }
      }
    }
  },
  browser_click: {
    description: 'Click an element',
    input: {
      type: 'object',
      properties: {
        target: { type: 'string', description: 'CSS selector or @eref' }
      },
      required: ['target']
    }
  },
  browser_fill: {
    description: 'Fill an input field',
    input: {
      type: 'object',
      properties: {
        target: { type: 'string', description: 'Input selector' },
        value: { type: 'string', description: 'Value to fill' }
      },
      required: ['target', 'value']
    }
  },
  browser_type: {
    description: 'Type text character by character',
    input: {
      type: 'object',
      properties: {
        target: { type: 'string', description: 'Element selector' },
        text: { type: 'string', description: 'Text to type' },
        delay: { type: 'number', description: 'Delay between keystrokes' }
      },
      required: ['text']
    }
  },
  browser_press: {
    description: 'Press a keyboard key',
    input: {
      type: 'object',
      properties: {
        key: { type: 'string', description: 'Key name (Enter, Tab, Escape, etc.)' }
      },
      required: ['key']
    }
  },
  browser_get_text: {
    description: 'Get text content of element',
    input: {
      type: 'object',
      properties: {
        target: { type: 'string', description: 'Element selector' }
      },
      required: ['target']
    }
  },
  browser_get_value: {
    description: 'Get input value',
    input: {
      type: 'object',
      properties: {
        target: { type: 'string', description: 'Input selector' }
      },
      required: ['target']
    }
  },
  browser_url: {
    description: 'Get current URL'
  },
  browser_title: {
    description: 'Get page title'
  },
  browser_wait: {
    description: 'Wait for selector',
    input: {
      type: 'object',
      properties: {
        selector: { type: 'string', description: 'Element to wait for' },
        timeout: { type: 'number', description: 'Timeout in ms' }
      },
      required: ['selector']
    }
  },
  browser_scroll: {
    description: 'Scroll page',
    input: {
      type: 'object',
      properties: {
        direction: { type: 'string', enum: ['up', 'down', 'left', 'right'], description: 'Direction' },
        amount: { type: 'number', description: 'Pixels to scroll' }
      }
    }
  },
  browser_snapshot: {
    description: 'Get DOM snapshot with interactive elements',
    input: {
      type: 'object',
      properties: {
        interactive: { type: 'boolean', description: 'Only interactive elements' }
      }
    }
  },
  browser_back: { description: 'Navigate back' },
  browser_forward: { description: 'Navigate forward' },
  browser_reload: { description: 'Reload page' },
  browser_eval: {
    description: 'Execute JavaScript',
    input: {
      type: 'object',
      properties: {
        script: { type: 'string', description: 'JavaScript code' }
      },
      required: ['script']
    }
  },
  browser_close: { description: 'Close browser' }
};

async function handleTool(name, args) {
  try {
    switch (name) {
      case 'browser_open': {
        browser = await chromium.launch({
          headless: true,
          args: ['--no-sandbox', '--disable-setuid-sandbox']
        });
        page = await browser.newPage();
        await page.goto(args.url, {
          waitUntil: args.waitUntil || 'domcontentloaded',
          timeout: 30000
        });
        return {
          content: [{ type: 'text', text: JSON.stringify({
            success: true,
            url: page.url(),
            title: await page.title()
          })]
        };
      }

      case 'browser_screenshot': {
        if (!page) return { content: [{ type: 'text', text: JSON.stringify({ success: false, error: 'No page open' }) }] };
        const buffer = await page.screenshot({ path: args.path, fullPage: args.fullPage });
        const base64 = buffer.toString('base64');
        return {
          content: [{ type: 'text', text: JSON.stringify({ success: true, base64: base64.slice(0, 100) + '...', path: args.path }) }]
        };
      }

      case 'browser_click': {
        if (!page) return { content: [{ type: 'text', text: JSON.stringify({ success: false, error: 'No page open' }) }] };
        await page.click(args.target);
        return { content: [{ type: 'text', text: JSON.stringify({ success: true }) }] };
      }

      case 'browser_fill': {
        if (!page) return { content: [{ type: 'text', text: JSON.stringify({ success: false, error: 'No page open' }) }] };
        await page.fill(args.target, args.value);
        return { content: [{ type: 'text', text: JSON.stringify({ success: true }) }] };
      }

      case 'browser_type': {
        if (!page) return { content: [{ type: 'text', text: JSON.stringify({ success: false, error: 'No page open' }) }] };
        if (args.target) await page.click(args.target);
        await page.keyboard.type(args.text, { delay: args.delay });
        return { content: [{ type: 'text', text: JSON.stringify({ success: true }) }] };
      }

      case 'browser_press': {
        if (!page) return { content: [{ type: 'text', text: JSON.stringify({ success: false, error: 'No page open' }) }] };
        await page.keyboard.press(args.key);
        return { content: [{ type: 'text', text: JSON.stringify({ success: true }) }] };
      }

      case 'browser_get_text': {
        if (!page) return { content: [{ type: 'text', text: JSON.stringify({ success: false, error: 'No page open' }) }] };
        const text = await page.textContent(args.target);
        return { content: [{ type: 'text', text: JSON.stringify({ success: true, text }) }] };
      }

      case 'browser_get_value': {
        if (!page) return { content: [{ type: 'text', text: JSON.stringify({ success: false, error: 'No page open' }) }] };
        const value = await page.inputValue(args.target);
        return { content: [{ type: 'text', text: JSON.stringify({ success: true, value }) }] };
      }

      case 'browser_url': {
        if (!page) return { content: [{ type: 'text', text: JSON.stringify({ success: false, error: 'No page open' }) }] };
        return { content: [{ type: 'text', text: JSON.stringify({ success: true, url: page.url() }) }] };
      }

      case 'browser_title': {
        if (!page) return { content: [{ type: 'text', text: JSON.stringify({ success: false, error: 'No page open' }) }] };
        return { content: [{ type: 'text', text: JSON.stringify({ success: true, title: await page.title() }) }] };
      }

      case 'browser_wait': {
        if (!page) return { content: [{ type: 'text', text: JSON.stringify({ success: false, error: 'No page open' }) }] };
        await page.waitForSelector(args.selector, { timeout: args.timeout || 30000 });
        return { content: [{ type: 'text', text: JSON.stringify({ success: true }) }] };
      }

      case 'browser_scroll': {
        if (!page) return { content: [{ type: 'text', text: JSON.stringify({ success: false, error: 'No page open' }) }] };
        const amount = args.amount || 500;
        const direction = args.direction || 'down';
        const scrollMap = { up: -amount, down: amount, left: -amount, right: amount };
        const scrollX = direction === 'left' || direction === 'right' ? scrollMap[direction] : 0;
        const scrollY = direction === 'up' || direction === 'down' ? scrollMap[direction] : 0;
        await page.evaluate(({ x, y }) => window.scrollBy(x, y), { x: scrollX, y: scrollY });
        return { content: [{ type: 'text', text: JSON.stringify({ success: true }) }] };
      }

      case 'browser_snapshot': {
        if (!page) return { content: [{ type: 'text', text: JSON.stringify({ success: false, error: 'No page open' }) }] };
        const elements = await page.evaluate((interactiveOnly) => {
          const result = [];
          const selectors = 'a, button, input, select, textarea, [role="button"], [role="link"], [onclick]';
          const all = document.querySelectorAll(selectors);
          all.forEach((el, idx) => {
            const rect = el.getBoundingClientRect();
            if (rect.width > 0 && rect.height > 0 && rect.top >= 0) {
              result.push({
                ref: `@e${idx + 1}`,
                tag: el.tagName.toLowerCase(),
                id: el.id || null,
                role: el.getAttribute('role') || null,
                text: el.textContent?.trim().slice(0, 80) || null,
                href: el.getAttribute('href') || null,
                type: (el).type || null
              });
            }
          });
          return { title: document.title, url: location.href, elements: result };
        }, args.interactiveOnly);
        return { content: [{ type: 'text', text: JSON.stringify({ success: true, ...elements }) }] };
      }

      case 'browser_back': {
        if (!page) return { content: [{ type: 'text', text: JSON.stringify({ success: false, error: 'No page open' }) }] };
        await page.goBack();
        return { content: [{ type: 'text', text: JSON.stringify({ success: true }) }] };
      }

      case 'browser_forward': {
        if (!page) return { content: [{ type: 'text', text: JSON.stringify({ success: false, error: 'No page open' }) }] };
        await page.goForward();
        return { content: [{ type: 'text', text: JSON.stringify({ success: true }) }] };
      }

      case 'browser_reload': {
        if (!page) return { content: [{ type: 'text', text: JSON.stringify({ success: false, error: 'No page open' }) }] };
        await page.reload();
        return { content: [{ type: 'text', text: JSON.stringify({ success: true }) }] };
      }

      case 'browser_eval': {
        if (!page) return { content: [{ type: 'text', text: JSON.stringify({ success: false, error: 'No page open' }) }] };
        const result = await page.evaluate(args.script);
        return { content: [{ type: 'text', text: JSON.stringify({ success: true, result }) }] };
      }

      case 'browser_close': {
        if (page) await page.close();
        if (browser) await browser.close();
        page = null;
        browser = null;
        return { content: [{ type: 'text', text: JSON.stringify({ success: true }) }] };
      }

      default:
        return { content: [{ type: 'text', text: JSON.stringify({ error: 'Unknown tool' }) }] };
    }
  } catch (error) {
    return { content: [{ type: 'text', text: JSON.stringify({ success: false, error: error.message }) }] };
  }
}

// Simple MCP stdio server
const readline = require('readline');

const rl = readline.createInterface({
  input: process.stdin,
  output: process.stdout,
  terminal: false
});

let buffer = '';

rl.on('line', async (line) => {
  try {
    const msg = JSON.parse(line);
    if (msg.method === 'tools/list') {
      process.stdout.write(JSON.stringify({
        jsonrpc: '2.0',
        id: msg.id,
        result: { tools: Object.entries(tools).map(([name, t]) => ({ name, ...t })) }
      }) + '\n');
    } else if (msg.method === 'tools/call') {
      const { name, arguments: args } = msg.params;
      const result = await handleTool(name, args || {});
      process.stdout.write(JSON.stringify({
        jsonrpc: '2.0',
        id: msg.id,
        result: { content: result.content }
      }) + '\n');
    }
  } catch (e) {
    // ignore parse errors
  }
});
