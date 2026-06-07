import { z } from "zod";

export const lspMcpConfigInputSchema = z
  .object({
    roots: z.array(z.string()).optional(),
    languages: z
      .object({
        typescript: z
          .object({
            enabled: z.boolean().optional(),
            command: z.array(z.string()).min(1).optional(),
            extensions: z.array(z.string()).optional(),
            projectMarkers: z.array(z.string()).optional(),
          })
          .strict()
          .optional(),
      })
      .strict()
      .optional(),
    sessions: z
      .object({
        idleTimeoutMs: z.number().int().positive().optional(),
        restartOnCrash: z.boolean().optional(),
      })
      .strict()
      .optional(),
    output: z
      .object({
        defaultLimit: z.number().int().positive().optional(),
      })
      .strict()
      .optional(),
  })
  .strict();
