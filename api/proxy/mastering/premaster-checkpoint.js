import { tmpdir } from 'os';
import { join } from 'path';
import { writeFileSync } from 'fs';
import { v4 as uuidv4 } from 'uuid';
import { supabase } from '../../_lib/supabase.js';
import { parseMultipartForm, readJsonBody, sendJson } from '../../_lib/http.js';

const CORE_API_BASE = (
  process.env.CORE_API_URL ||
  process.env.NEXT_PUBLIC_CORE_API_URL ||
  process.env.VITE_CORE_API_URL ||
  ''
).trim().replace(/\/$/, '');

function parseMixState(rawValue, fallback = {}) {
  if (!rawValue) return fallback;
  if (typeof rawValue === 'object') return rawValue;
  if (typeof rawValue !== 'string') return fallback;
  try {
    return JSON.parse(rawValue);
  } catch {
    return fallback;
  }
}

async function uploadBufferToPublicUrl(jobId, fileBuffer, filename, contentType = 'audio/wav') {
  const objectPath = `public-ingest/${jobId}/${filename}`;
  const { error } = await supabase.storage.from('audio-files').upload(objectPath, fileBuffer, {
    contentType,
    upsert: true,
  });
  if (error) throw error;
  const { data } = supabase.storage.from('audio-files').getPublicUrl(objectPath);
  return data.publicUrl;
}

async function forwardToCore(payload) {
  if (!CORE_API_BASE) {
    throw new Error('CORE_API_URL is not configured');
  }

  const response = await fetch(`${CORE_API_BASE}/api/v1/process/premaster-checkpoint`, {
    method: 'POST',
    headers: {
      'Content-Type': 'application/json',
    },
    body: JSON.stringify(payload),
  });

  const text = await response.text();
  let parsed = null;
  try {
    parsed = text ? JSON.parse(text) : null;
  } catch {
    parsed = null;
  }

  if (!response.ok) {
    throw new Error(parsed?.detail || parsed?.error || text || `Upstream failed with ${response.status}`);
  }

  return parsed ?? {};
}

export default async function handler(req, res) {
  if (req.method !== 'POST') {
    return sendJson(res, 405, { error: 'Method not allowed' });
  }

  try {
    let fields = {};
    let files = [];
    if ((req.headers['content-type'] || '').includes('multipart/form-data')) {
      const parsed = await parseMultipartForm(req);
      fields = parsed.fields || {};
      files = parsed.files || [];
    } else {
      fields = await readJsonBody(req);
    }

    const requestId = fields.job_id || uuidv4();
    const mixState = parseMixState(fields.mix_state, {
      vocals: { volume_db: 0, pan: 0, mute: false, solo: false },
      drums: { volume_db: 0, pan: 0, mute: false, solo: false },
      bass: { volume_db: 0, pan: 0, mute: false, solo: false },
      other: { volume_db: 0, pan: 0, mute: false, solo: false },
    });
    const vocalFile = files.find((file) => ['vocal', 'audio', 'file'].includes(file.fieldName));
    let sourceUrl = fields.source_url || fields.sourceUrl || '';

    if (!sourceUrl && vocalFile?.buffer?.length) {
      const ext = (vocalFile.filename || 'vocal.wav').split('.').pop() || 'wav';
      const tempPath = join(tmpdir(), `${requestId}-premaster.${ext}`);
      writeFileSync(tempPath, vocalFile.buffer);
      sourceUrl = await uploadBufferToPublicUrl(
        requestId,
        vocalFile.buffer,
        `${requestId}-premaster.${ext}`,
        vocalFile.contentType || 'audio/wav',
      );
    }

    if (!sourceUrl) {
      return sendJson(res, 400, { error: 'Vocal file or source_url is required' });
    }

    const payload = {
      source_url: sourceUrl,
      target_profile: {
        genre: fields.genre || 'default',
        style: fields.style || 'balanced',
        target_lufs: Number(fields.targetLoudness ?? fields.target_loudness ?? -14),
      },
      mix_state: mixState,
      profile_name: fields.profile_name || 'mixed_by_ali_crisp',
    };

    const upstream = await forwardToCore(payload);
    return sendJson(res, 200, {
      ...upstream,
      source_url: sourceUrl,
    });
  } catch (error) {
    console.error('Premaster checkpoint proxy error:', error);
    return sendJson(res, 500, {
      error: 'Premaster checkpoint failed',
      message: error instanceof Error ? error.message : String(error),
    });
  }
}
