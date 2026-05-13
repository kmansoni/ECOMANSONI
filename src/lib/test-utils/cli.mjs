#!/usr/bin/env node
import { mansoniBrowser } from './mansoni-browser.js';

const args = process.argv.slice(2);
const command = args[0];
const param = args[1];

async function main() {
  try {
    switch (command) {
      case 'open': {
        if (!param) {
          console.error('Usage: mansoni-browser open <url> [session]');
          process.exit(1);
        }
        const session = args[2] || 'default';
        const result = await mansoniBrowser.open(param, session);
        console.log(JSON.stringify(result));
        break;
      }

      case 'screenshot': {
        const result = await mansoniBrowser.screenshot(param);
        console.log(JSON.stringify(result));
        break;
      }

      case 'click': {
        if (!param) {
          console.error('Usage: mansoni-browser click <selector>');
          process.exit(1);
        }
        const result = await mansoniBrowser.click(param);
        console.log(JSON.stringify(result));
        break;
      }

      case 'fill': {
        if (!param || !args[2]) {
          console.error('Usage: mansoni-browser fill <selector> <value>');
          process.exit(1);
        }
        const result = await mansoniBrowser.fill(param, args[2]);
        console.log(JSON.stringify(result));
        break;
      }

      case 'type': {
        if (!param) {
          console.error('Usage: mansoni-browser type <text>');
          process.exit(1);
        }
        const result = await mansoniBrowser.type(param);
        console.log(JSON.stringify(result));
        break;
      }

      case 'press': {
        if (!param) {
          console.error('Usage: mansoni-browser press <key>');
          process.exit(1);
        }
        const result = await mansoniBrowser.press(param);
        console.log(JSON.stringify(result));
        break;
      }

      case 'text': {
        if (!param) {
          console.error('Usage: mansoni-browser text <selector>');
          process.exit(1);
        }
        const result = await mansoniBrowser.getText(param);
        console.log(JSON.stringify(result));
        break;
      }

      case 'url': {
        const result = await mansoniBrowser.getUrl();
        console.log(JSON.stringify(result));
        break;
      }

      case 'title': {
        const result = await mansoniBrowser.getTitle();
        console.log(JSON.stringify(result));
        break;
      }

      case 'wait': {
        if (!param) {
          console.error('Usage: mansoni-browser wait <selector> [timeout]');
          process.exit(1);
        }
        const timeout = args[2] ? parseInt(args[2]) : 30000;
        const result = await mansoniBrowser.waitForSelector(param, timeout);
        console.log(JSON.stringify(result));
        break;
      }

      case 'scroll': {
        const direction = param || 'down';
        const amount = args[2] ? parseInt(args[2]) : 500;
        const result = await mansoniBrowser.scroll(direction, amount);
        console.log(JSON.stringify(result));
        break;
      }

      case 'snapshot': {
        const interactive = param === 'interactive';
        const result = await mansoniBrowser.getSnapshot(interactive);
        console.log(JSON.stringify(result));
        break;
      }

      case 'back':
      case 'forward':
      case 'reload': {
        const result = command === 'back' ? await mansoniBrowser.back()
          : command === 'forward' ? await mansoniBrowser.forward()
          : await mansoniBrowser.reload();
        console.log(JSON.stringify(result));
        break;
      }

      case 'eval': {
        if (!param) {
          console.error('Usage: mansoni-browser eval <script>');
          process.exit(1);
        }
        const result = await mansoniBrowser.evaluate(param);
        console.log(JSON.stringify(result));
        break;
      }

      case 'close': {
        const result = await mansoniBrowser.close();
        console.log(JSON.stringify(result));
        break;
      }

      case 'status': {
        console.log(JSON.stringify({ open: mansoniBrowser.isOpen() }));
        break;
      }

      default:
        console.error(`
Mansoni Browser Controller
===========================
Usage: mansoni-browser <command> [args]

Commands:
  open <url> [session]   Open URL
  screenshot [path]      Take screenshot
  click <selector>       Click element
  fill <selector> <val>  Fill input
  type <text>            Type text
  press <key>            Press key (Enter, Tab, Escape, etc.)
  text <selector>        Get text content
  url                    Get current URL
  title                  Get page title
  wait <selector> [ms]   Wait for selector
  scroll <dir> [px]      Scroll (up|down|left|right, default 500)
  snapshot [interactive] Get DOM snapshot
  back                   Go back
  forward                Go forward
  reload                 Reload page
  eval <script>          Execute JS
  close                  Close browser
  status                 Check if open
`);
        process.exit(1);
    }
  } catch (error) {
    console.error(JSON.stringify({ success: false, error: String(error) }));
    process.exit(1);
  }
}

main();