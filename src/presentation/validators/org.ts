import { z } from 'zod'

export const updateOrgSchema = z.object({ name: z.string().min(1).max(255) })
export const updateSettingSchema = z.object({ value: z.string().max(5000) })
export const integrationTestSchema = z.object({ type: z.string().min(1), credentials: z.record(z.string().max(500)) })
export const providerTestSchema = z.object({ type: z.string().min(1), api_key: z.string().min(1) })
