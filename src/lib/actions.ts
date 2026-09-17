import "server-only";
import { z } from "zod";

/** Standard shape returned by server actions used with `useActionState`. */
export type ActionResult<T = undefined> = { ok: true; data?: T; message?: string } | { ok: false; error: string; fieldErrors?: Record<string, string> };

export function ok<T>(data?: T, message?: string): ActionResult<T> {
  return { ok: true, data, message };
}

export function fail(error: string, fieldErrors?: Record<string, string>): ActionResult<never> {
  return { ok: false, error, fieldErrors };
}

/** Converts FormData into a plain object; repeated keys become arrays, empty strings become undefined. */
export function formToObject(formData: FormData): Record<string, unknown> {
  const out: Record<string, unknown> = {};
  for (const [key, value] of formData.entries()) {
    if (key.startsWith("$ACTION")) continue;
    const v = typeof value === "string" ? (value.trim() === "" ? undefined : value.trim()) : value;
    if (key.endsWith("[]")) {
      const k = key.slice(0, -2);
      (out[k] ??= []) as unknown[];
      if (v !== undefined) (out[k] as unknown[]).push(v);
    } else if (key in out) {
      out[key] = Array.isArray(out[key]) ? [...(out[key] as unknown[]), v] : [out[key], v];
    } else {
      out[key] = v;
    }
  }
  return out;
}

/** Parses FormData with a zod schema and returns either data or an ActionResult failure. */
export function parseForm<S extends z.ZodTypeAny>(schema: S, formData: FormData): { data: z.infer<S>; error?: undefined } | { data?: undefined; error: ActionResult<never> } {
  const parsed = schema.safeParse(formToObject(formData));
  if (parsed.success) return { data: parsed.data };
  const fieldErrors: Record<string, string> = {};
  for (const issue of parsed.error.issues) {
    const k = issue.path.join(".");
    if (!fieldErrors[k]) fieldErrors[k] = issue.message;
  }
  const first = parsed.error.issues[0];
  return { error: fail(first ? `${first.path.join(".") || "form"}: ${first.message}` : "Invalid input", fieldErrors) };
}

// Reusable zod coercions for form fields
export const zNum = z.coerce.number();
export const zNumOpt = z.preprocess((v) => (v === undefined || v === null || v === "" ? undefined : v), z.coerce.number().optional());
export const zInt = z.coerce.number().int();
export const zDate = z.coerce.date();
export const zDateOpt = z.preprocess((v) => (v === undefined || v === null || v === "" ? undefined : v), z.coerce.date().optional());
export const zBool = z.preprocess((v) => v === "on" || v === "true" || v === true || v === "1", z.boolean());
export const zStr = z.string().min(1);
export const zStrOpt = z.string().optional();
export const zJson = <T extends z.ZodTypeAny>(inner: T) =>
  z.preprocess((v) => {
    if (typeof v !== "string") return v;
    try {
      return JSON.parse(v);
    } catch {
      return v;
    }
  }, inner);
