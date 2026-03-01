/**
 * Utility functions for Bot API Edge Function
 */

export function createSuccessResponse(data: unknown, status = 200): Response {
  const payload = (data && typeof data === 'object') ? data as Record<string, unknown> : { data };
  return new Response(JSON.stringify({ ok: true, ...payload }), {
    status,
    headers: { 'Content-Type': 'application/json' }
  });
}

export function createErrorResponse(message: string, status = 400): Response {
  return new Response(JSON.stringify({ ok: false, error: message }), {
    status,
    headers: { 'Content-Type': 'application/json' }
  });
}

export function createUnauthorizedResponse(): Response {
  return createErrorResponse('Unauthorized', 401);
}

export function createNotFoundResponse(message = 'Not found'): Response {
  return createErrorResponse(message, 404);
}
