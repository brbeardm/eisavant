export class ApiError extends Error {
  constructor(
    public readonly status: number,
    message: string,
    public readonly details?: { field: string; message: string }[],
  ) {
    super(message);
  }
}

async function parse(res: Response) {
  const body = await res.json().catch(() => ({}));
  if (!res.ok) {
    throw new ApiError(res.status, body.error ?? `Request failed (${res.status})`, body.details);
  }
  return body;
}

export const api = {
  get: (url: string) => fetch(url, { credentials: 'same-origin' }).then(parse),

  post: (url: string, data?: unknown) =>
    fetch(url, {
      method: 'POST',
      credentials: 'same-origin',
      headers: data ? { 'Content-Type': 'application/json' } : undefined,
      body: data ? JSON.stringify(data) : undefined,
    }).then(parse),

  put: (url: string, data: unknown) =>
    fetch(url, {
      method: 'PUT',
      credentials: 'same-origin',
      headers: { 'Content-Type': 'application/json' },
      body: JSON.stringify(data),
    }).then(parse),

  patch: (url: string, data: unknown) =>
    fetch(url, {
      method: 'PATCH',
      credentials: 'same-origin',
      headers: { 'Content-Type': 'application/json' },
      body: JSON.stringify(data),
    }).then(parse),

  // multipart — browser sets the boundary header itself
  postForm: (url: string, form: FormData) =>
    fetch(url, { method: 'POST', credentials: 'same-origin', body: form }).then(parse),

  putForm: (url: string, form: FormData) =>
    fetch(url, { method: 'PUT', credentials: 'same-origin', body: form }).then(parse),
};
