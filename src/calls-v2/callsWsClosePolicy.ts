export const CALLS_WS_FATAL_CLOSE_CODES = new Set([
  1003, // unsupported data / protocol mismatch
  1008, // policy violation
  1009, // message too big / protocol payload error
  4001, // unauthorized
  4003, // forbidden
  4004, // room not found
  4401, // token invalid/expired
  4403, // membership rejected
]);

export function isCallsWsFatalCloseCode(code?: number): boolean {
  return typeof code === "number" && CALLS_WS_FATAL_CLOSE_CODES.has(code);
}
