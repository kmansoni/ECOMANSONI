import { chromium, Browser, Page, BrowserContext } from 'playwright';

class MansoniBrowser {
  private browser: Browser | null = null;
  private context: BrowserContext | null = null;
  private page: Page | null = null;
  private sessionId: string = '';

  async open(url: string, sessionId: string = 'default'): Promise<{ success: boolean; error?: string; url?: string; title?: string }> {
    try {
      this.sessionId = sessionId;

      if (!this.browser) {
        this.browser = await chromium.launch({
          headless: true,
          args: ['--no-sandbox', '--disable-setuid-sandbox']
        });
      }

      this.context = await this.browser.newContext({
        viewport: { width: 1280, height: 720 },
        userAgent: 'Mozilla/5.0 (Windows NT 10.0; Win64; x64) AppleWebKit/537.36'
      });

      this.page = await this.context.newPage();
      await this.page.goto(url, { waitUntil: 'domcontentloaded', timeout: 30000 });

      const finalUrl = this.page.url();
      const title = await this.page.title();

      return { success: true, url: finalUrl, title };
    } catch (error) {
      return { success: false, error: String(error) };
    }
  }

  async screenshot(savePath?: string): Promise<{ success: boolean; path?: string; base64?: string; error?: string }> {
    try {
      if (!this.page) {
        return { success: false, error: 'No page open' };
      }

      const buffer = await this.page.screenshot({ type: 'png' });
      const base64 = buffer.toString('base64');

      if (savePath) {
        const fs = await import('fs');
        fs.writeFileSync(savePath, buffer);
        return { success: true, path: savePath };
      }

      return { success: true, base64 };
    } catch (error) {
      return { success: false, error: String(error) };
    }
  }

  async click(selector: string): Promise<{ success: boolean; error?: string }> {
    try {
      if (!this.page) return { success: false, error: 'No page open' };
      await this.page.click(selector);
      return { success: true };
    } catch (error) {
      return { success: false, error: String(error) };
    }
  }

  async fill(selector: string, value: string): Promise<{ success: boolean; error?: string }> {
    try {
      if (!this.page) return { success: false, error: 'No page open' };
      await this.page.fill(selector, value);
      return { success: true };
    } catch (error) {
      return { success: false, error: String(error) };
    }
  }

  async type(text: string, delay?: number): Promise<{ success: boolean; error?: string }> {
    try {
      if (!this.page) return { success: false, error: 'No page open' };
      await this.page.keyboard.type(text, { delay });
      return { success: true };
    } catch (error) {
      return { success: false, error: String(error) };
    }
  }

  async press(key: string): Promise<{ success: boolean; error?: string }> {
    try {
      if (!this.page) return { success: false, error: 'No page open' };
      await this.page.keyboard.press(key);
      return { success: true };
    } catch (error) {
      return { success: false, error: String(error) };
    }
  }

  async getText(selector: string): Promise<{ success: boolean; text?: string; error?: string }> {
    try {
      if (!this.page) return { success: false, error: 'No page open' };
      const text = await this.page.textContent(selector);
      return { success: true, text: text ?? undefined };
    } catch (error) {
      return { success: false, error: String(error) };
    }
  }

  async getValue(selector: string): Promise<{ success: boolean; value?: string; error?: string }> {
    try {
      if (!this.page) return { success: false, error: 'No page open' };
      const value = await this.page.inputValue(selector);
      return { success: true, value };
    } catch (error) {
      return { success: false, error: String(error) };
    }
  }

  async getUrl(): Promise<{ success: boolean; url?: string; error?: string }> {
    try {
      if (!this.page) return { success: false, error: 'No page open' };
      return { success: true, url: this.page.url() };
    } catch (error) {
      return { success: false, error: String(error) };
    }
  }

  async getTitle(): Promise<{ success: boolean; title?: string; error?: string }> {
    try {
      if (!this.page) return { success: false, error: 'No page open' };
      return { success: true, title: await this.page.title() };
    } catch (error) {
      return { success: false, error: String(error) };
    }
  }

  async waitForSelector(selector: string, timeout: number = 30000): Promise<{ success: boolean; error?: string }> {
    try {
      if (!this.page) return { success: false, error: 'No page open' };
      await this.page.waitForSelector(selector, { timeout });
      return { success: true };
    } catch (error) {
      return { success: false, error: String(error) };
    }
  }

  async scroll(direction: 'up' | 'down' | 'left' | 'right', amount: number = 500): Promise<{ success: boolean; error?: string }> {
    try {
      if (!this.page) return { success: false, error: 'No page open' };

      const scrollMap = { up: -amount, down: amount, left: -amount, right: amount };
      const scrollX = direction === 'left' || direction === 'right' ? scrollMap[direction] : 0;
      const scrollY = direction === 'up' || direction === 'down' ? scrollMap[direction] : 0;

      await this.page.evaluate(({ x, y }) => window.scrollBy(x, y), { x: scrollX, y: scrollY });
      return { success: true };
    } catch (error) {
      return { success: false, error: String(error) };
    }
  }

  async getSnapshot(interactive: boolean = false): Promise<{ success: boolean; elements?: any[]; error?: string }> {
    try {
      if (!this.page) return { success: false, error: 'No page open' };

      const elements = await this.page.evaluate((w) => {
        const getVisibleElements = (doc: Document) => {
          const result: any[] = [];
          const all = doc.querySelectorAll('a, button, input, select, textarea, [onclick], [role="button"], [role="link"]');

          all.forEach((el, idx) => {
            const rect = el.getBoundingClientRect();
            if (rect.width > 0 && rect.height > 0) {
              result.push({
                ref: `@e${idx + 1}`,
                tag: el.tagName.toLowerCase(),
                id: el.id || null,
                className: el.className || null,
                role: el.getAttribute('role') || null,
                text: el.textContent?.trim().slice(0, 100) || null,
                href: el.getAttribute('href') || null,
                type: (el as HTMLInputElement).type || null,
                visible: rect.top >= 0 && rect.left >= 0
              });
            }
          });
          return result;
        };

        return {
          interactive: getVisibleElements(w.document),
          title: w.document.title,
          url: w.location.href
        };
      }, {});

      return { success: true, elements: [elements] };
    } catch (error) {
      return { success: false, error: String(error) };
    }
  }

  async back(): Promise<{ success: boolean; error?: string }> {
    try {
      if (!this.page) return { success: false, error: 'No page open' };
      await this.page.goBack();
      return { success: true };
    } catch (error) {
      return { success: false, error: String(error) };
    }
  }

  async forward(): Promise<{ success: boolean; error?: string }> {
    try {
      if (!this.page) return { success: false, error: 'No page open' };
      await this.page.goForward();
      return { success: true };
    } catch (error) {
      return { success: false, error: String(error) };
    }
  }

  async reload(): Promise<{ success: boolean; error?: string }> {
    try {
      if (!this.page) return { success: false, error: 'No page open' };
      await this.page.reload();
      return { success: true };
    } catch (error) {
      return { success: false, error: String(error) };
    }
  }

  async evaluate(script: string): Promise<{ success: boolean; result?: any; error?: string }> {
    try {
      if (!this.page) return { success: false, error: 'No page open' };
      const result = await this.page.evaluate(script);
      return { success: true, result };
    } catch (error) {
      return { success: false, error: String(error) };
    }
  }

  async close(): Promise<{ success: boolean; error?: string }> {
    try {
      if (this.page) await this.page.close();
      if (this.context) await this.context.close();
      if (this.browser) await this.browser.close();
      this.page = null;
      this.context = null;
      this.browser = null;
      return { success: true };
    } catch (error) {
      return { success: false, error: String(error) };
    }
  }

  isOpen(): boolean {
    return this.page !== null;
  }
}

export const mansoniBrowser = new MansoniBrowser();
export default MansoniBrowser;
