export type EchoPluginCategory = 'utility' | 'dynamics' | 'eq' | 'delay' | 'reverb' | 'modulation' | 'other';

export type EchoPluginParamType = 'float' | 'int' | 'boolean' | 'enum';

export interface EchoPluginParameterOption {
  label: string;
  value: string;
}

export interface EchoPluginParameterSchema {
  id: string;
  label: string;
  type: EchoPluginParamType;
  min?: number;
  max?: number;
  step?: number;
  defaultValue: number | boolean | string;
  unit?: string;
  options?: EchoPluginParameterOption[];
}

export interface EchoPluginManifest {
  manifestId: string;
  pluginId: string;
  displayName: string;
  version: string;
  vendor: string;
  category: EchoPluginCategory;
  parameters: EchoPluginParameterSchema[];
}

export interface EchoPluginInstance {
  instanceId: string;
  manifestId: string;
  enabled: boolean;
  mix: number;
  parameters: Record<string, number | boolean | string>;
}

function clamp(value: number, min: number, max: number): number {
  return Math.min(max, Math.max(min, value));
}

function coerceNumber(value: unknown, fallback: number): number {
  if (typeof value === 'number' && Number.isFinite(value)) return value;
  if (typeof value === 'string') {
    const parsed = Number(value);
    if (Number.isFinite(parsed)) return parsed;
  }
  return fallback;
}

function coerceBoolean(value: unknown, fallback: boolean): boolean {
  if (typeof value === 'boolean') return value;
  if (typeof value === 'number') return value !== 0;
  if (typeof value === 'string') {
    const normalized = value.trim().toLowerCase();
    if (normalized === 'true' || normalized === '1' || normalized === 'on') return true;
    if (normalized === 'false' || normalized === '0' || normalized === 'off') return false;
  }
  return fallback;
}

function coerceEnum(
  value: unknown,
  fallback: string,
  options: EchoPluginParameterOption[] = []
): string {
  const normalized = typeof value === 'string' ? value : String(value ?? '');
  if (options.some((option) => option.value === normalized)) {
    return normalized;
  }
  return fallback;
}

export function sanitizePluginParameterValue(
  schema: EchoPluginParameterSchema,
  value: unknown
): number | boolean | string {
  switch (schema.type) {
    case 'float': {
      const fallback = coerceNumber(schema.defaultValue, 0);
      const numeric = coerceNumber(value, fallback);
      const min = schema.min ?? -Number.MAX_SAFE_INTEGER;
      const max = schema.max ?? Number.MAX_SAFE_INTEGER;
      const clamped = clamp(numeric, min, max);
      return Number(clamped.toFixed(6));
    }
    case 'int': {
      const fallback = Math.round(coerceNumber(schema.defaultValue, 0));
      const numeric = Math.round(coerceNumber(value, fallback));
      const min = schema.min ?? -Number.MAX_SAFE_INTEGER;
      const max = schema.max ?? Number.MAX_SAFE_INTEGER;
      return Math.trunc(clamp(numeric, min, max));
    }
    case 'boolean':
      return coerceBoolean(value, Boolean(schema.defaultValue));
    case 'enum':
      return coerceEnum(value, String(schema.defaultValue), schema.options || []);
    default:
      return schema.defaultValue;
  }
}

export function buildDefaultPluginParameters(
  manifest: EchoPluginManifest
): Record<string, number | boolean | string> {
  const params: Record<string, number | boolean | string> = {};
  for (const schema of manifest.parameters) {
    params[schema.id] = sanitizePluginParameterValue(schema, schema.defaultValue);
  }
  return params;
}

