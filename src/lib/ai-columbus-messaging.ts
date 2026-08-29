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

export const webhookSecretSchema = z.object({
  organization_id: z.string().uuid(),
  secret: z.string().min(16, "Gebruik minimaal 16 tekens").max(200),
});

export const messageTemplateSchema = z.object({
  id: z.string().uuid().optional(),
  organization_id: z.string().uuid(),
  channel: messageChannelSchema,
  name: z.string().trim().min(1).max(120),
  body: z.string().trim().min(1).max(2000),
});

export const messageTemplateDeleteSchema = z.object({
  id: z.string().uuid(),
  organization_id: z.string().uuid(),
});

export async function hashWebhookSecret(secret: string): Promise<string> {
  const bytes = new TextEncoder().encode(secret);
  const digest = await crypto.subtle.digest("SHA-256", bytes);
  return Array.from(new Uint8Array(digest), (byte) => byte.toString(16).padStart(2, "0")).join("");
}

export function normalizePhoneNumber(raw: string): string {
  const trimmed = raw.trim().replace(/[\s().-]/g, "");
  if (trimmed.startsWith("+")) return trimmed;
  if (trimmed.startsWith("00")) return `+${trimmed.slice(2)}`;
  if (trimmed.startsWith("0")) return `+31${trimmed.slice(1)}`;
  return `+${trimmed}`;
}
export const linkMessageClientSchema = z.object({
  organization_id: z.string().uuid(),
  client_id: z.string().uuid(),
  phone: z.string().min(5).max(30),
  name: z.string().trim().max(160).optional(),
  force: z.boolean().optional(),
});

export const createClientFromNumberSchema = z.object({
  organization_id: z.string().uuid(),
  name: z.string().trim().min(1).max(160),
  phone: z.string().min(5).max(30),
  email: z.string().trim().email().optional().or(z.literal("")),
  contact_person: z.string().trim().max(160).optional(),
});
