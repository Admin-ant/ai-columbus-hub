import { z } from "zod";

export const messageChannelSchema = z.enum(["sms", "whatsapp"]);

export const sendMessageSchema = z.object({
  organization_id: z.string().uuid(),
  channel: messageChannelSchema,
  to: z.string().min(5).max(30),
  body: z.string().min(1).max(2000),
  client_id: z.string().uuid().nullable().optional(),
  lead_id: z.string().uuid().nullable().optional(),
});

export const messagingSettingsSchema = z.object({
  organization_id: z.string().uuid(),
  messaging_profile_id: z.string().max(120).nullable().optional(),
  sms_from_number: z.string().max(30).nullable().optional(),
  whatsapp_from_number: z.string().max(30).nullable().optional(),
  enabled: z.boolean().optional(),
});

export function normalizePhoneNumber(raw: string): string {
  const trimmed = raw.trim().replace(/[\s().-]/g, "");
  if (trimmed.startsWith("+")) return trimmed;
  if (trimmed.startsWith("00")) return `+${trimmed.slice(2)}`;
  if (trimmed.startsWith("0")) return `+31${trimmed.slice(1)}`;
  return `+${trimmed}`;
}