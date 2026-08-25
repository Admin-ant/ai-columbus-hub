import { createFileRoute } from "@tanstack/react-router";
import { MessageSquare } from "lucide-react";
import { TelnyxMessagingPage } from "@/components/messaging/telnyx-messaging-page";

export const Route = createFileRoute("/_authenticated/sms")({
  head: () => ({
    meta: [
      { title: "SMS — tekstberichten versturen via AI van Columbus" },
      {
        name: "description",
        content: "Verstuur en bekijk SMS-berichten van je organisatie met AI van Columbus.",
      },
      { property: "og:title", content: "SMS — tekstberichten versturen via AI van Columbus" },
      {
        property: "og:description",
        content: "Verstuur en bekijk SMS-berichten van je organisatie via AI van Columbus.",
      },
      { property: "og:type", content: "website" },
      { name: "twitter:card", content: "summary" },
    ],
  }),
  component: SmsPage,
});

function SmsPage() {
  return (
    <TelnyxMessagingPage
      channel="sms"
      title="SMS"
      description="verstuur en ontvang SMS-berichten via AI van Columbus"
      icon={<MessageSquare className="h-6 w-6 text-brand" />}
    />
  );
}
