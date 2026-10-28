// "Afspraak bevestiging AVC" — de afspraakbevestiging in AI van Columbus-huisstijl
// als variabel-sjabloon, zodat hij in Mail → Sjablonen bewerkt kan worden.
// De tokens worden ingevuld met dezelfde variabelen als de andere e-mailsjablonen.
import { renderAppointmentMail } from "@/lib/appointment-email-template";

export const APPOINTMENT_TEMPLATE_NAME = "Afspraak bevestiging AVC";
export const APPOINTMENT_TEMPLATE_DESCRIPTION =
  "Afspraakbevestiging in AI van Columbus-huisstijl: logo op zwarte balk, agendaknop en opties om te verzetten.";

/** Onderwerp van het sjabloon (platte tekst, tokens worden ingevuld bij verzenden). */
export const APPOINTMENT_TEMPLATE_SUBJECT = "Afspraak {{appointment_title}} — {{appointment_date}}";

/** Volledige HTML-mail met {{tokens}}; wordt bij verzenden/voorbeeld ingevuld. */
export const APPOINTMENT_TEMPLATE_HTML = renderAppointmentMail({
  heading: "Je afspraak is bevestigd",
  firstName: "{{contact_name}}",
  intro:
    "Dank je wel voor het fijne gesprek. Hierbij bevestig ik onze afspraak. Ik kijk ernaar uit!",
  dateStr: "{{appointment_date}}",
  // Wordt in mailto-/WhatsApp-links gezet: token bevat geen spaties of &-tekens.
  dateUrl: "{{appointment_date}}",
  timeStr: "{{appointment_time}} uur",
  location: "{{appointment_location}}",
  subject: "{{appointment_title}}",
  agendaLink: "{{appointment_link}}",
  agendaPoints: [],
  confirmUrl: null,
  cancelled: false,
});
