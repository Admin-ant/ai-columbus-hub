import { describe, expect, test } from "bun:test";
import { appointmentMailTime, prepareAppointmentTemplate, renderAppointmentMail } from "../src/lib/appointment-email-template";
import { APPOINTMENT_TEMPLATE_HTML } from "../src/lib/appointment-mail-template";
import { renderTokens } from "../src/lib/outreach-templates";

const values = {
  heading: "Appointment", firstName: "Alex", intro: "Hello Alex,", dateStr: "30 October 2026",
  dateUrl: "30%20October%202026", timeStr: "14:00 – 14:30", location: "Meet", subject: "Consultation",
  agendaLink: "https://example.com/calendar", agendaPoints: ["Planning"], confirmUrl: "https://example.com/confirm",
};
const template = renderTokens(APPOINTMENT_TEMPLATE_HTML, {
  contact_name: "Alex", appointment_date: "30 October 2026", appointment_time: "14:00 – 14:30",
  appointment_location: "Meet", appointment_title: "Consultation", appointment_link: "https://example.com/confirm",
});

describe("appointment locale and customer message rules", () => {
  for (const locale of ["nl", "en", "de"] as const) {
    test(`${locale}: built-in and saved AVC emails use the selected language`, () => {
      const builtin = renderAppointmentMail({ ...values, locale });
      const saved = prepareAppointmentTemplate(template, { locale, attendeeName: "Alex", customMessage: "" });
      expect(builtin.match(/<html lang="([^"]+)"/)?.[1]).toBe(locale);
      expect(saved.match(/<html lang="([^"]+)"/)?.[1]).toBe(locale);
      const link = builtin.match(/mailto:info@aivancolumbus.com\?subject=([^"]+)/)?.[1];
      const savedLink = saved.match(/mailto:info@aivancolumbus.com\?subject=([^"]+)/)?.[1];
      expect(decodeURIComponent(savedLink ?? "")).toBe(decodeURIComponent(link ?? ""));
    });
  }
  test("English times have no Dutch unit; German and Dutch use their own unit", () => {
    expect(appointmentMailTime("14:00 – 14:30 uur", "en")).toBe("14:00 – 14:30");
    expect(appointmentMailTime("14:00 – 14:30 uur", "de")).toBe("14:00 – 14:30 Uhr");
    expect(appointmentMailTime("14:00 – 14:30", "nl")).toBe("14:00 – 14:30 uur");
  });
  test("rescheduling preserves the customer's message in HTML, safely, without editing the template", () => {
    const original = template;
    const note = 'Bring <contract> & "ID"\nUse the side entrance';
    const result = prepareAppointmentTemplate(template, { locale: "en", attendeeName: "Alex", customMessage: note, rescheduled: true });
    expect(result).toContain("Bring &lt;contract&gt; &amp; &quot;ID&quot;<br>Use the side entrance");
    expect(result).not.toContain("<contract>");
    expect(result).toContain('src="https://aiqloud.nl');
    expect(template).toBe(original);
    // The same note must not be silently lost in templates without an h1 or a table.
    expect(prepareAppointmentTemplate("<html><body>Custom</body></html>", { locale: "nl", attendeeName: "Alex", customMessage: note })).toContain("Use the side entrance</p></body>");
  });
  test("rescheduled intent differs from an ordinary confirmation, including when no message is supplied", () => {
    const opts = { locale: "de" as const, attendeeName: "Alex", customMessage: "" };
    const confirmation = prepareAppointmentTemplate(template, opts);
    const rescheduled = prepareAppointmentTemplate(template, { ...opts, rescheduled: true });
    expect(rescheduled).not.toBe(confirmation);
    expect(rescheduled.length).toBeGreaterThan(confirmation.length);
    expect(prepareAppointmentTemplate(template, { locale: "nl", attendeeName: "Alex", customMessage: "" })).toBe(template);
  });
});