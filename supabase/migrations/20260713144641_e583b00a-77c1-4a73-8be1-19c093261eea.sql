INSERT INTO public.outreach_message_templates (organization_id, channel, name, description, subject, body, is_default)
SELECT
  o.id,
  'email',
  'Afspraak bevestiging',
  'Bevestiging van een geplande afspraak met datum, tijd en locatie',
  'Bevestiging afspraak — {{appointment_title}} op {{appointment_date}}',
  E'Hi {{contact_name}},\n\nBij dezen bevestig ik onze afspraak:\n\n📅 {{appointment_title}}\n🕒 {{appointment_date}} · {{appointment_time}}\n📍 {{appointment_location}}\n\n{{appointment_description}}\n\nJe kunt de afspraak bevestigen of verzetten via onderstaande link:\n{{appointment_link}}\n\nDe uitnodiging (.ics) zit als bijlage bij deze mail, zodat je hem direct in je agenda kunt zetten.\n\nTot dan!\n\nMet vriendelijke groet,\n{{sender_name}}',
  false
FROM public.organizations o
WHERE NOT EXISTS (
  SELECT 1 FROM public.outreach_message_templates t
  WHERE t.organization_id = o.id
    AND t.channel = 'email'
    AND lower(t.name) = 'afspraak bevestiging'
);