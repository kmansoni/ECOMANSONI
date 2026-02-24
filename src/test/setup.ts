import "@testing-library/jest-dom";

// Node 22 prints DEP0040 (`punycode`) from transitive dependencies used by test tooling.
// Keep other warnings visible and suppress only this known deprecation in test output.
const originalEmitWarning = process.emitWarning.bind(process);
process.emitWarning = ((warning: any, ...args: any[]) => {
  const code =
    typeof warning === "object" && warning !== null
      ? (warning as NodeJS.ErrnoException).code
      : args[1];

  if (code === "DEP0040") {
    return;
  }

  return (originalEmitWarning as any)(warning, ...args);
}) as typeof process.emitWarning;

const originalConsoleError = console.error.bind(console);
console.error = (...args: any[]) => {
  const message = args.map((arg) => String(arg)).join(" ");
  if (message.includes("Camera access denied")) return;
  if (message.includes("[Chat] get_or_create_dm unavailable")) return;
  if (message.includes("Error creating reel: Error: timeout")) return;
  originalConsoleError(...args);
};

const originalConsoleLog = console.log.bind(console);
const originalConsoleInfo = console.info.bind(console);

const shouldSuppressLog = (message: string) => {
  return (
    message.includes("[useReels]") ||
    message.includes("[Env] Supabase") ||
    message.includes("[ChatSchemaProbe]") ||
    message.includes("arbiter.") ||
    message.includes("\"msg\":\"arbiter.") ||
    message.includes("Camera access denied")
  );
};

console.log = (...args: any[]) => {
  const message = args.map((arg) => String(arg)).join(" ");
  if (shouldSuppressLog(message)) return;
  originalConsoleLog(...args);
};

console.info = (...args: any[]) => {
  const message = args.map((arg) => String(arg)).join(" ");
  if (shouldSuppressLog(message)) return;
  originalConsoleInfo(...args);
};

Object.defineProperty(window, "matchMedia", {
  writable: true,
  value: (query: string) => ({
    matches: false,
    media: query,
    onchange: null,
    addListener: () => {},
    removeListener: () => {},
    addEventListener: () => {},
    removeEventListener: () => {},
    dispatchEvent: () => {},
  }),
});
