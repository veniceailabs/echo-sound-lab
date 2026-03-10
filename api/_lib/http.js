const ALLOWED_ORIGIN_METHODS = 'GET,POST,DELETE,OPTIONS';

export function setCors(res) {
  res.setHeader('Access-Control-Allow-Origin', '*');
  res.setHeader('Access-Control-Allow-Methods', ALLOWED_ORIGIN_METHODS);
  res.setHeader('Access-Control-Allow-Headers', 'Content-Type, Authorization, X-ESL-Actor-Id');
}

export function handleOptions(req, res) {
  setCors(res);
  if (req.method === 'OPTIONS') {
    res.statusCode = 204;
    res.end();
    return true;
  }
  return false;
}

export function sendJson(res, statusCode, payload) {
  setCors(res);
  res.statusCode = statusCode;
  res.setHeader('Content-Type', 'application/json; charset=utf-8');
  res.end(JSON.stringify(payload));
}

export async function readRawBody(req) {
  if (Buffer.isBuffer(req.body)) {
    return req.body;
  }

  if (typeof req.body === 'string') {
    return Buffer.from(req.body);
  }

  if (req.body && typeof req.body === 'object' && !Array.isArray(req.body)) {
    return Buffer.from(JSON.stringify(req.body));
  }

  const chunks = [];
  for await (const chunk of req) {
    chunks.push(Buffer.isBuffer(chunk) ? chunk : Buffer.from(chunk));
  }
  return Buffer.concat(chunks);
}

export async function readJsonBody(req) {
  if (req.body && typeof req.body === 'object' && !Buffer.isBuffer(req.body)) {
    return req.body;
  }

  const raw = await readRawBody(req);
  if (!raw.length) {
    return {};
  }

  try {
    return JSON.parse(raw.toString('utf-8'));
  } catch (error) {
    throw new Error('Invalid JSON body');
  }
}

export async function proxyJson(req, res, options) {
  const {
    url,
    method = req.method || 'GET',
    headers = {},
    body,
    transformResponse,
  } = options;

  const upstream = await fetch(url, {
    method,
    headers,
    body,
  });

  const text = await upstream.text();
  let payload = null;

  try {
    payload = text ? JSON.parse(text) : null;
  } catch {
    payload = null;
  }

  if (!upstream.ok) {
    return sendJson(res, upstream.status, {
      error: payload?.error || payload?.message || upstream.statusText || 'Upstream request failed',
      details: payload || text || null,
    });
  }

  const finalPayload = transformResponse ? transformResponse(payload ?? text) : (payload ?? { ok: true });
  return sendJson(res, upstream.status, finalPayload);
}

export async function parseMultipartForm(req) {
  const contentType = req.headers['content-type'] || '';
  const boundaryMatch = contentType.match(/boundary=(?:"([^"]+)"|([^;]+))/i);
  if (!boundaryMatch) {
    throw new Error('Missing multipart boundary');
  }

  const boundary = `--${boundaryMatch[1] || boundaryMatch[2]}`;
  const raw = await readRawBody(req);
  const binary = raw.toString('binary');
  const segments = binary.split(boundary).slice(1, -1);
  const files = [];
  const fields = {};

  for (const segment of segments) {
    const part = segment.replace(/^\r\n/, '').replace(/\r\n$/, '');
    if (!part) continue;

    const headerEnd = part.indexOf('\r\n\r\n');
    if (headerEnd === -1) continue;

    const headerText = part.slice(0, headerEnd);
    const bodyBinary = part.slice(headerEnd + 4);
    const bodyBuffer = Buffer.from(bodyBinary, 'binary');

    const headers = headerText.split('\r\n');
    const disposition = headers.find((line) => line.toLowerCase().startsWith('content-disposition:')) || '';
    const contentTypeHeader = headers.find((line) => line.toLowerCase().startsWith('content-type:')) || '';

    const nameMatch = disposition.match(/name="([^"]+)"/i);
    const filenameMatch = disposition.match(/filename="([^"]*)"/i);
    const fieldName = nameMatch?.[1];

    if (!fieldName) continue;

    if (filenameMatch) {
      files.push({
        fieldName,
        filename: filenameMatch[1] || 'upload.bin',
        contentType: contentTypeHeader.split(':')[1]?.trim() || 'application/octet-stream',
        buffer: bodyBuffer,
      });
    } else {
      fields[fieldName] = bodyBuffer.toString('utf-8');
    }
  }

  return { files, fields };
}
