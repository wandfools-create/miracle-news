export type AdminAiActionResult =
  | { ok: true; message: string }
  | { ok: false; error: string; step?: string };
