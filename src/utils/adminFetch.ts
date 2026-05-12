/** Matches back-hafezway admin HTML: `Authorization: admin <JWT>` */
export async function adminFetchJson<T = unknown>(
  url: string,
  adminToken: string,
  options: RequestInit = {},
): Promise<T> {
  if (!adminToken) {
    throw new Error('Admin token not set');
  }
  const headers: HeadersInit = {
    'Content-Type': 'application/json',
    Authorization: `admin ${adminToken}`,
    ...(options.headers || {}),
  };
  const response = await fetch(url, {
    cache: 'no-store',
    ...options,
    headers,
  });
  if (!response.ok) {
    let errorData: { message?: string; error?: string };
    try {
      errorData = await response.json();
    } catch {
      errorData = { message: `HTTP ${response.status}: ${response.statusText}` };
    }
    if (response.status === 404) {
      const serverMsg = errorData.message || errorData.error;
      throw new Error(`404: ${serverMsg ?? 'Route not found'}. URL: ${url}`);
    }
    throw new Error(errorData.message || errorData.error || `HTTP ${response.status}: ${response.statusText}`);
  }
  return response.json() as Promise<T>;
}

/** Logs viewer authFetch returns Response for blob/text flows */
export async function adminFetchResponse(
  url: string,
  adminToken: string,
  options: RequestInit = {},
): Promise<Response> {
  if (!adminToken) {
    throw new Error('Admin token not set');
  }
  const headers: HeadersInit = {
    Authorization: `admin ${adminToken}`,
    ...(options.headers || {}),
  };
  try {
    const response = await fetch(url, { ...options, headers });
    if (!response.ok) {
      let errorMessage = `HTTP ${response.status}: ${response.statusText}`;
      try {
        const errorData = await response.json();
        if (errorData.message) errorMessage = errorData.message;
      } catch {
        /* ignore */
      }
      switch (response.status) {
        case 401:
          errorMessage =
            'Unauthorized: Invalid or expired admin token. Please check your token and try again.';
          break;
        case 403:
          errorMessage =
            'Forbidden: Your token does not have admin privileges required for this operation.';
          break;
        case 404:
          errorMessage = 'API endpoint not found. Please check if the server is running correctly.';
          break;
        case 500:
          errorMessage = `Server error: ${errorMessage}`;
          break;
        default:
          break;
      }
      throw new Error(errorMessage);
    }
    return response;
  } catch (fetchError: unknown) {
    const err = fetchError as Error;
    if (err.name === 'TypeError' && err.message.includes('fetch')) {
      throw new Error(`Cannot connect to server. Please ensure the API server is running.`);
    }
    throw fetchError;
  }
}
