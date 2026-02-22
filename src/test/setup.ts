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
