import { z } from "zod";

import { BUILD_IDS } from "./builds";
import { CHARACTER_IDS, MAX_ASCENSION } from "./ids";

export const BuildIdSchema = z.enum(BUILD_IDS);
export const CharacterIdSchema = z.enum(CHARACTER_IDS);
export const AscensionSchema = z.number().int().min(0).max(MAX_ASCENSION);
export const ActIndexSchema = z.union([z.literal(0), z.literal(1), z.literal(2)]);

/** Consistent error envelope for every API route (docs: 400 invalid input, 422 unsupported build/mode). */
export const ApiErrorCodeSchema = z.enum([
  "invalid_request",
  "unsupported_build",
  "unsupported_mode",
  "impossible_history",
  "payload_too_large",
  "rate_limited",
  "internal_error",
]);

export const ErrorEnvelopeSchema = z.object({
  error: z.object({
    code: ApiErrorCodeSchema,
    message: z.string(),
    details: z.array(z.object({ path: z.string(), message: z.string() })).optional(),
  }),
});
export type ErrorEnvelope = z.infer<typeof ErrorEnvelopeSchema>;
