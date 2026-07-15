export const NL_PROVINCES = [
  "Groningen",
  "Friesland",
  "Drenthe",
  "Overijssel",
  "Flevoland",
  "Gelderland",
  "Utrecht",
  "Noord-Holland",
  "Zuid-Holland",
  "Zeeland",
  "Noord-Brabant",
  "Limburg",
] as const;

export type Province = (typeof NL_PROVINCES)[number];

export const TEMPLATE_TOKENS = [
  "{{contact_name}}",
  "{{company}}",
  "{{province}}",
  "{{sender_name}}",
  "{{appointment_title}}",
  "{{appointment_date}}",
  "{{appointment_time}}",
  "{{appointment_location}}",
  "{{appointment_link}}",
] as const;

export type TemplateChannel = "email" | "linkedin" | "whatsapp";

export type OutreachTemplate = {
  id: string;
  organization_id: string;
  name: string;
  description: string | null;
  channel: TemplateChannel;
  subject: string | null;
  body: string;
  is_default: boolean;
  created_at: string;
  updated_at: string;
  background_color?: string | null;
  background_image_url?: string | null;
  header_html?: string | null;
  footer_html?: string | null;
  mail_background_id?: string | null;
};

export type MailBackground = {
  id: string;
  organization_id: string;
  name: string;
  background_color: string | null;
  background_image_url: string | null;
  header_html: string | null;
  footer_html: string | null;
  created_at: string;
  updated_at: string;
};

export type TokenVars = {
  contact_name?: string | null;
  company?: string | null;
  province?: string | null;
  sender_name?: string | null;
  appointment_title?: string | null;
  appointment_date?: string | null;
  appointment_time?: string | null;
  appointment_location?: string | null;
  appointment_link?: string | null;
};

export function renderTokens(text: string, vars: TokenVars): string {
  return text.replace(/\{\{\s*(\w+)\s*\}\}/g, (_, key: string) => {
    const v = (vars as Record<string, string | null | undefined>)[key];
    return v ?? "";
  });
}
