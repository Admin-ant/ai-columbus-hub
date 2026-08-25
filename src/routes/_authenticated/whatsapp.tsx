import { createFileRoute } from "@tanstack/react-router";
import { MessageCircle } from "lucide-react";
import { TelnyxMessagingPage } from "@/components/messaging/telnyx-messaging-page";

export const Route = createFileRoute("/_authenticated/whatsapp")({
  head: () => ({
    meta: [
      { title: "WhatsApp — berichten versturen via Telnyx" },
      {
        name: "description",
        content:
          "Verstuur en bekijk WhatsApp-berichten van je organisatie, gekoppeld aan Telnyx.",
      },
      { property: "og:title", content: "WhatsApp — berichten versturen via Telnyx" },
      {
        property: "og:description",
        content: "Verstuur en bekijk WhatsApp-berichten van je organisatie via Telnyx.",
      },
      { property: "og:type", content: "website" },
      { name: "twitter:card", content: "summary" },
    ],
  }),
  component: WhatsAppPage,
});

function WhatsAppPage() {
  return (
    <TelnyxMessagingPage
      channel="whatsapp"
      title="WhatsApp"
      description="verstuur en ontvang WhatsApp-berichten via Telnyx"
      icon={<MessageCircle className="h-6 w-6 text-brand" />}
    />
  );
}
