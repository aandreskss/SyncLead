import { z } from "zod"

// E.164 phone validation (e.g. +584141234567)
const e164 = z
  .string()
  .regex(/^\+[1-9]\d{6,14}$/, "Número de teléfono inválido (formato E.164, ej: +584141234567)")

export const CreateSalesRepSchema = z.object({
  clientId: z.string().uuid(),
  displayName: z.string().min(1).max(100),
  email: z.string().email().nullable().optional(),
  whatsappNumber: e164.nullable().optional(),
  userId: z.string().nullable().optional(),
})

export const UpdateSalesRepSchema = z.object({
  displayName: z.string().min(1).max(100).optional(),
  email: z.string().email().nullable().optional(),
  whatsappNumber: e164.nullable().optional(),
  userId: z.string().nullable().optional(),
  active: z.boolean().optional(),
})

export const AssignLeadSchema = z.object({
  leadId: z.string().uuid(),
  salesRepId: z.string().uuid().nullable(),
  reason: z.string().max(500).optional(),
  note: z.string().max(1000).optional(),
})

export type CreateSalesRepInput = z.infer<typeof CreateSalesRepSchema>
export type UpdateSalesRepInput = z.infer<typeof UpdateSalesRepSchema>
export type AssignLeadInput = z.infer<typeof AssignLeadSchema>

export interface AssignmentWithRep {
  id: string
  leadId: string
  salesRepId: string | null
  salesRep: {
    id: string
    displayName: string
    whatsappNumber: string | null
    active: boolean
  } | null
  assignedById: string | null
  reason: string | null
  note: string | null
  isCurrent: boolean
  assignedAt: Date
  unassignedAt: Date | null
}
