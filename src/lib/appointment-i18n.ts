export type ApptLocale = "nl" | "en" | "de";

export const APPT_LOCALES: { code: ApptLocale; label: string; flag: string }[] = [
  { code: "nl", label: "Nederlands", flag: "🇳🇱" },
  { code: "en", label: "English", flag: "🇬🇧" },
  { code: "de", label: "Deutsch", flag: "🇩🇪" },
];

export function normalizeLocale(input: string | null | undefined): ApptLocale {
  if (input === "en" || input === "de" || input === "nl") return input;
  return "nl";
}

type Dict = {
  bcp47: string;
  headingConfirm: string;
  headingCancelled: string;
  headingRescheduled: string;
  introConfirm: (name: string) => string;
  introCancelled: (name: string) => string;
  introRescheduled: (name: string) => string;
  fallbackName: string;
  btnConfirm: string;
  btnReschedule: string;
  cancelledFootnote: string;
  linkFallback: string;
  signature: string;
  footerFrom: string;
  subjectPrefixCancel: string;
  locationLabel: string;
  publicPageTitle: string;
  publicDescription: string;
  publicWhoLabel: string;
  publicLocationLabel: string;
  publicButtonConfirmed: string;
  publicButtonWorking: string;
  publicButtonConfirm: string;
  publicButtonReschedule: string;
  publicRescheduleQuestion: string;
  publicReschedulePlaceholder: string;
  publicRescheduleSubmit: string;
  publicRescheduleBusy: string;
  publicRescheduleBack: string;
  publicToast_confirmed: string;
  publicToast_rescheduleSent: string;
  publicToast_generic: string;
  bannerCancelled: string;
  bannerConfirmedAt: (dt: string) => string;
  bannerRescheduleReceived: (dt: string) => string;
  bannerRescheduleFollowup: string;
  footerContact: string;
  footerMadeWith: (org: string) => string;
  errorTitle: string;
  errorMessage: string;
  notFoundTitle: string;
  notFoundMessage: string;
  metaTitle: string;
  metaDescription: string;
};

const nl: Dict = {
  bcp47: "nl-NL",
  headingConfirm: "Bevestig je afspraak",
  headingCancelled: "Afspraak geannuleerd",
  headingRescheduled: "Afspraak verplaatst",
  introConfirm: (n) =>
    `Beste ${n}, we kijken uit naar onderstaande afspraak. Laat even weten of het schikt met de knop hieronder.`,
  introCancelled: (n) => `Beste ${n}, hierbij bevestigen we dat onderstaande afspraak is geannuleerd.`,
  introRescheduled: (n) =>
    `Beste ${n}, de datum/tijd van onze afspraak is aangepast. Deze uitnodiging vervangt de vorige — bevestig graag onderstaand nieuwe moment.`,
  fallbackName: "relatie",
  btnConfirm: "✓ Bevestigen",
  btnReschedule: "↻ Verzetten",
  cancelledFootnote: "Deze afspraak staat als geannuleerd in je agenda.",
  linkFallback: "Werkt de knop niet? Open dan deze link:",
  signature: "Met vriendelijke groet,",
  footerFrom: "Deze mail is verzonden vanuit",
  subjectPrefixCancel: "[Geannuleerd]",
  locationLabel: "Locatie",
  publicPageTitle: "Afspraakbevestiging",
  publicDescription: "Bevestig of verzet je geplande afspraak.",
  publicWhoLabel: "Voor",
  publicLocationLabel: "Locatie",
  publicButtonConfirmed: "Bevestigd",
  publicButtonWorking: "Bezig…",
  publicButtonConfirm: "Bevestigen",
  publicButtonReschedule: "Verzetten",
  publicRescheduleQuestion: "Op welke momenten kan het wél?",
  publicReschedulePlaceholder: "Bijv. woensdag na 15:00 of donderdagochtend",
  publicRescheduleSubmit: "Verstuur verzoek",
  publicRescheduleBusy: "Bezig…",
  publicRescheduleBack: "Terug",
  publicToast_confirmed: "Bedankt! Je afspraak is bevestigd.",
  publicToast_rescheduleSent: "Verzoek tot verzetten verstuurd",
  publicToast_generic: "Er ging iets mis",
  bannerCancelled: "Deze afspraak is geannuleerd.",
  bannerConfirmedAt: (dt) => `Bevestigd op ${dt}.`,
  bannerRescheduleReceived: (dt) => `Verzoek tot verzetten ontvangen op ${dt}.`,
  bannerRescheduleFollowup: " We nemen zo snel mogelijk contact op met een nieuw voorstel.",
  footerContact: "Vragen? Antwoord direct op de bevestigingsmail — dan komt je bericht bij ons binnen.",
  footerMadeWith: (org) => `Gemaakt met ♥ door ${org}`,
  errorTitle: "Link niet geldig",
  errorMessage: "Deze afspraaklink werkt niet meer. Neem contact op met de organisator.",
  notFoundTitle: "Afspraak niet gevonden",
  notFoundMessage: "Deze afspraaklink is ongeldig of ingetrokken.",
  metaTitle: "Afspraakbevestiging — AI van Columbus",
  metaDescription: "Bevestig of verzet je geplande afspraak.",
};

const en: Dict = {
  bcp47: "en-GB",
  headingConfirm: "Confirm your appointment",
  headingCancelled: "Appointment cancelled",
  headingRescheduled: "Appointment rescheduled",
  introConfirm: (n) =>
    `Hi ${n}, we're looking forward to the appointment below. Please let us know it works for you via the button.`,
  introCancelled: (n) => `Hi ${n}, this confirms that the appointment below has been cancelled.`,
  introRescheduled: (n) =>
    `Hi ${n}, the date/time of our appointment has changed. This invitation replaces the previous one — please confirm the new slot below.`,
  fallbackName: "there",
  btnConfirm: "✓ Confirm",
  btnReschedule: "↻ Reschedule",
  cancelledFootnote: "This appointment is marked as cancelled in your calendar.",
  linkFallback: "Button not working? Open this link:",
  signature: "Kind regards,",
  footerFrom: "This email was sent by",
  subjectPrefixCancel: "[Cancelled]",
  locationLabel: "Location",
  publicPageTitle: "Appointment confirmation",
  publicDescription: "Confirm or reschedule your appointment.",
  publicWhoLabel: "For",
  publicLocationLabel: "Location",
  publicButtonConfirmed: "Confirmed",
  publicButtonWorking: "Working…",
  publicButtonConfirm: "Confirm",
  publicButtonReschedule: "Reschedule",
  publicRescheduleQuestion: "When would suit you better?",
  publicReschedulePlaceholder: "e.g. Wednesday after 3pm or Thursday morning",
  publicRescheduleSubmit: "Send request",
  publicRescheduleBusy: "Sending…",
  publicRescheduleBack: "Back",
  publicToast_confirmed: "Thanks! Your appointment is confirmed.",
  publicToast_rescheduleSent: "Reschedule request sent",
  publicToast_generic: "Something went wrong",
  bannerCancelled: "This appointment has been cancelled.",
  bannerConfirmedAt: (dt) => `Confirmed on ${dt}.`,
  bannerRescheduleReceived: (dt) => `Reschedule request received on ${dt}.`,
  bannerRescheduleFollowup: " We'll get back to you shortly with a new proposal.",
  footerContact: "Questions? Just reply to the confirmation email and we'll pick it up.",
  footerMadeWith: (org) => `Made with ♥ by ${org}`,
  errorTitle: "Link no longer valid",
  errorMessage: "This appointment link doesn't work anymore. Please contact the organiser.",
  notFoundTitle: "Appointment not found",
  notFoundMessage: "This appointment link is invalid or has been revoked.",
  metaTitle: "Appointment confirmation — AI van Columbus",
  metaDescription: "Confirm or reschedule your appointment.",
};

const de: Dict = {
  bcp47: "de-DE",
  headingConfirm: "Bestätige deinen Termin",
  headingCancelled: "Termin abgesagt",
  headingRescheduled: "Termin verschoben",
  introConfirm: (n) =>
    `Hallo ${n}, wir freuen uns auf den untenstehenden Termin. Bitte bestätige ihn kurz über den Button.`,
  introCancelled: (n) => `Hallo ${n}, hiermit bestätigen wir, dass der untenstehende Termin abgesagt wurde.`,
  introRescheduled: (n) =>
    `Hallo ${n}, das Datum/die Uhrzeit unseres Termins hat sich geändert. Diese Einladung ersetzt die vorherige – bitte bestätige den neuen Zeitpunkt unten.`,
  fallbackName: "zusammen",
  btnConfirm: "✓ Bestätigen",
  btnReschedule: "↻ Verschieben",
  cancelledFootnote: "Dieser Termin ist in deinem Kalender als abgesagt markiert.",
  linkFallback: "Button funktioniert nicht? Öffne diesen Link:",
  signature: "Mit freundlichen Grüßen,",
  footerFrom: "Diese E-Mail wurde gesendet von",
  subjectPrefixCancel: "[Abgesagt]",
  locationLabel: "Ort",
  publicPageTitle: "Terminbestätigung",
  publicDescription: "Bestätige oder verschiebe deinen Termin.",
  publicWhoLabel: "Für",
  publicLocationLabel: "Ort",
  publicButtonConfirmed: "Bestätigt",
  publicButtonWorking: "Bitte warten…",
  publicButtonConfirm: "Bestätigen",
  publicButtonReschedule: "Verschieben",
  publicRescheduleQuestion: "Wann würde es dir besser passen?",
  publicReschedulePlaceholder: "z. B. Mittwoch nach 15:00 oder Donnerstagmorgen",
  publicRescheduleSubmit: "Anfrage senden",
  publicRescheduleBusy: "Sende…",
  publicRescheduleBack: "Zurück",
  publicToast_confirmed: "Danke! Dein Termin ist bestätigt.",
  publicToast_rescheduleSent: "Verschiebungsanfrage gesendet",
  publicToast_generic: "Etwas ist schiefgelaufen",
  bannerCancelled: "Dieser Termin wurde abgesagt.",
  bannerConfirmedAt: (dt) => `Bestätigt am ${dt}.`,
  bannerRescheduleReceived: (dt) => `Verschiebungsanfrage erhalten am ${dt}.`,
  bannerRescheduleFollowup: " Wir melden uns umgehend mit einem neuen Vorschlag.",
  footerContact: "Fragen? Antworte einfach auf die Bestätigungs-E-Mail, dann melden wir uns.",
  footerMadeWith: (org) => `Erstellt mit ♥ von ${org}`,
  errorTitle: "Link nicht gültig",
  errorMessage: "Dieser Terminlink funktioniert nicht mehr. Bitte kontaktiere den Organisator.",
  notFoundTitle: "Termin nicht gefunden",
  notFoundMessage: "Dieser Terminlink ist ungültig oder wurde zurückgezogen.",
  metaTitle: "Terminbestätigung — AI van Columbus",
  metaDescription: "Bestätige oder verschiebe deinen Termin.",
};

const DICT: Record<ApptLocale, Dict> = { nl, en, de };

export function apptDict(locale: string | null | undefined): Dict {
  return DICT[normalizeLocale(locale)];
}
