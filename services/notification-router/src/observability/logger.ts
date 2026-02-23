export function logInfo(message: string, extra?: Record<string, unknown>): void {
  console.log(JSON.stringify({ level: "info", message, ...extra }));
}

export function logError(message: string, extra?: Record<string, unknown>): void {
  console.error(JSON.stringify({ level: "error", message, ...extra }));
}
