import { fail } from './util.mjs';
export const str = (maxLength = 256, extra = {}) => ({ type: 'string', minLength: 1, maxLength, ...extra });
export const en = values => ({ type: 'string', enum: values });
export const obj = (properties, required = Object.keys(properties)) => ({ type: 'object', properties, required, additionalProperties: false });
export const arr = (items, maxItems = 50) => ({ type: 'array', items, minItems: 1, maxItems });
export const optional = schema => ({ ...schema });
const bad = path => fail('INVALID_ARGUMENT', `Invalid or unsupported value at ${path}.`);
/** Small, closed JSON Schema subset. It is also compiled into official SDK Zod schemas. */
export function validate(schema, value, path = 'arguments') {
  if (schema.oneOf) {
    let count = 0;
    for (const branch of schema.oneOf) { try { validate(branch, value, path); count++; } catch {} }
    if (count !== 1) bad(path); return value;
  }
  if (schema.enum && !schema.enum.includes(value)) bad(path);
  if ('const' in schema && value !== schema.const) bad(path);
  if (schema.type === 'object') {
    if (!value || typeof value !== 'object' || Array.isArray(value)) bad(path);
    for (const key of schema.required || []) if (!Object.hasOwn(value, key)) bad(`${path}.${key}`);
    for (const [key, val] of Object.entries(value)) {
      if (!Object.hasOwn(schema.properties, key)) bad(`${path}.${key}`);
      validate(schema.properties[key], val, `${path}.${key}`);
    }
  } else if (schema.type === 'array') {
    if (!Array.isArray(value) || value.length < (schema.minItems || 0) || value.length > schema.maxItems) bad(path);
    value.forEach((v, i) => validate(schema.items, v, `${path}[${i}]`));
  } else if (schema.type === 'string') {
    if (typeof value !== 'string' || value.length < (schema.minLength || 0) || value.length > (schema.maxLength || Infinity) || /[\x00-\x08\x0b\x0c\x0e-\x1f\x7f]/.test(value) || (schema.pattern && !new RegExp(schema.pattern).test(value))) bad(path);
  } else if (schema.type === 'boolean') {
    if (typeof value !== 'boolean') bad(path);
  } else if (schema.type === 'integer') {
    if (!Number.isSafeInteger(value) || value < schema.minimum || value > schema.maximum) bad(path);
  }
  return value;
}
export function toZod(schema, z) {
  let out;
  if (schema.oneOf) return z.union(schema.oneOf.map(s => toZod(s, z)));
  if ('const' in schema) return z.literal(schema.const);
  if (schema.enum) return z.enum(schema.enum);
  if (schema.type === 'object') {
    const shape = {};
    for (const [key, child] of Object.entries(schema.properties)) shape[key] = (schema.required || []).includes(key) ? toZod(child, z) : toZod(child, z).optional();
    return z.object(shape).strict();
  }
  if (schema.type === 'array') return z.array(toZod(schema.items, z)).min(schema.minItems || 0).max(schema.maxItems);
  if (schema.type === 'boolean') return z.boolean();
  if (schema.type === 'integer') return z.number().int().min(schema.minimum).max(schema.maximum);
  out = z.string();
  if (schema.minLength) out = out.min(schema.minLength);
  if (schema.maxLength) out = out.max(schema.maxLength);
  if (schema.pattern) out = out.regex(new RegExp(schema.pattern));
  return out;
}
