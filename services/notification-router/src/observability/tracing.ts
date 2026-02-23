export function traceSpan<T>(name: string, fn: () => Promise<T>): Promise<T> {
  // TODO: wire OpenTelemetry spans.
  void name;
  return fn();
}
