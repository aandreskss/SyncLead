import { z } from "zod"

// ISO 4217 — three uppercase letters
const ISO_CURRENCY_RE = /^[A-Z]{3}$/

export const RegisterSaleSchema = z.object({
  amount: z
    .number()
    .positive("El monto debe ser mayor a cero")
    .finite(),
  currency: z
    .string()
    .regex(ISO_CURRENCY_RE, "Moneda debe ser código ISO 4217 (ej. USD)"),
  orderId: z
    .string()
    .min(1, "Order ID requerido")
    .max(255),
  convertedAt: z.coerce.date().optional().default(() => new Date()),
  notes: z.string().max(1000).optional(),
})

export type RegisterSaleInput = z.infer<typeof RegisterSaleSchema>
