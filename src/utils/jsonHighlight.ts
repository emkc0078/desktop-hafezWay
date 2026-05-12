import { escapeHtml } from './escapeHtml';

export function highlightJSON(jsonString: unknown, isError = false): string {
  try {
    const obj = typeof jsonString === 'string' ? JSON.parse(jsonString) : jsonString;
    return formatJSONObject(obj, 0, isError);
  } catch {
    return escapeHtml(String(jsonString));
  }
}

function formatJSONObject(obj: unknown, indent = 0, isError = false): string {
  const indentStr = '  '.repeat(indent);
  const nextIndentStr = '  '.repeat(indent + 1);

  if (obj === null) {
    return '<span class="json-null">null</span>';
  }
  if (typeof obj === 'boolean') {
    return `<span class="json-boolean">${obj}</span>`;
  }
  if (typeof obj === 'number') {
    return `<span class="json-number">${obj}</span>`;
  }
  if (typeof obj === 'string') {
    return `<span class="json-string">"${escapeHtml(obj)}"</span>`;
  }
  if (Array.isArray(obj)) {
    if (obj.length === 0) return '<span class="json-brace">[]</span>';
    let result = '<span class="json-brace">[</span>\n';
    obj.forEach((item, index) => {
      result += nextIndentStr + formatJSONObject(item, indent + 1, isError);
      if (index < obj.length - 1) result += '<span class="json-punctuation">,</span>';
      result += '\n';
    });
    result += indentStr + '<span class="json-brace">]</span>';
    return result;
  }
  if (typeof obj === 'object') {
    const keys = Object.keys(obj as object);
    if (keys.length === 0) return '<span class="json-brace">{}</span>';
    let result = '<span class="json-brace">{</span>\n';
    keys.forEach((key, index) => {
      const keyClass = getKeyClass(key, isError);
      const valueClass = getValueClass(key, isError);
      const val = (obj as Record<string, unknown>)[key];
      result += nextIndentStr + `<span class="${keyClass}">"${escapeHtml(key)}"</span><span class="json-punctuation">: </span>`;
      if (valueClass && typeof val === 'string') {
        result += `<span class="${valueClass}">"${escapeHtml(val)}"</span>`;
      } else {
        result += formatJSONObject(val, indent + 1, isError);
      }
      if (index < keys.length - 1) result += '<span class="json-punctuation">,</span>';
      result += '\n';
    });
    result += indentStr + '<span class="json-brace">}</span>';
    return result;
  }
  return escapeHtml(String(obj));
}

function getKeyClass(key: string, isError: boolean) {
  if (isError) {
    if (key === 'message') return 'error-message-key';
    if (key === 'stack') return 'error-stack-key';
  }
  return 'json-key';
}

function getValueClass(key: string, isError: boolean) {
  if (isError) {
    if (key === 'message') return 'error-message-value';
    if (key === 'stack') return 'error-stack-value';
  }
  return '';
}

export function generateCurlCommand(
  log: {
    url: string;
    method?: string;
    requestHeaders?: Record<string, string>;
    requestBody?: unknown;
  },
  apiBase: string,
  serverUrl: string,
  adminToken: string,
): string {
  const baseUrl = apiBase.replace('/api', '') || serverUrl;
  const url = log.url.startsWith('http') ? log.url : `${baseUrl}${log.url}`;
  const method = log.method || 'GET';
  let curlCommand = `curl -X ${method} "${url}"`;
  if (log.requestHeaders && Object.keys(log.requestHeaders).length > 0) {
    Object.entries(log.requestHeaders).forEach(([key, value]) => {
      if (key.toLowerCase() !== 'host' && key.toLowerCase() !== 'content-length') {
        curlCommand += ` \\\n  -H "${key}: ${value}"`;
      }
    });
  } else if (
    log.requestBody &&
    typeof log.requestBody === 'object' &&
    log.requestBody !== null &&
    Object.keys(log.requestBody as object).length > 0
  ) {
    curlCommand += ` \\\n  -H "Content-Type: application/json"`;
  }
  if (adminToken) {
    const hasAuth =
      log.requestHeaders &&
      Object.keys(log.requestHeaders).some((k) => k.toLowerCase() === 'authorization');
    if (!hasAuth) {
      curlCommand += ` \\\n  -H "Authorization: admin ${adminToken}"`;
    }
  }
  if (
    ['POST', 'PUT', 'PATCH'].includes(method.toUpperCase()) &&
    log.requestBody &&
    typeof log.requestBody === 'object' &&
    log.requestBody !== null &&
    Object.keys(log.requestBody as object).length > 0
  ) {
    const bodyStr = JSON.stringify(log.requestBody);
    const escapedBody = bodyStr.replace(/\\/g, '\\\\').replace(/'/g, "'\\''");
    curlCommand += ` \\\n  -d '${escapedBody}'`;
  }
  return curlCommand;
}
