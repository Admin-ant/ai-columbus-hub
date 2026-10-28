-- Sjabloon "Afspraak bevestiging AVC": huisstijl-mail als bewerkbaar e-mailsjabloon.
-- Wordt gegenereerd door scripts/seed-appointment-template.mjs (niet handmatig aanpassen).
ALTER TABLE public.mail_settings ADD COLUMN IF NOT EXISTS appointment_template_id uuid;
COMMENT ON COLUMN public.mail_settings.appointment_template_id IS 'Sjabloon dat de afspraakbevestiging als HTML verstuurt; leeg = standaardontwerp van de app.';

DO $avcdoc$
BEGIN
  EXECUTE $avc$UPDATE public.outreach_message_templates
     SET subject = 'Afspraak {{appointment_title}} — {{appointment_date}}',
         body = $avc$<!DOCTYPE html>
<html lang="nl" xmlns="http://www.w3.org/1999/xhtml">
<head>
<meta charset="utf-8">
<meta name="viewport" content="width=device-width, initial-scale=1">
<meta http-equiv="X-UA-Compatible" content="IE=edge">
<title>Je afspraak is bevestigd</title>
<style>
@media only screen and (max-width:620px){
  .container{width:100% !important;}
  .px{padding-left:20px !important;padding-right:20px !important;}
  .stack{display:block !important;width:100% !important;padding:0 0 10px 0 !important;}
}
</style>
</head>
<body style="margin:0;padding:0;background:#F4F4F4;">
<table role="presentation" width="100%" cellspacing="0" cellpadding="0" border="0" bgcolor="#F4F4F4" style="background:#F4F4F4;">
<tr><td align="center" style="padding:24px 10px;">
<table role="presentation" class="container" width="600" cellspacing="0" cellpadding="0" border="0" style="width:600px;max-width:600px;background:#ffffff;">
<tr><td bgcolor="#000000" class="px" style="background:#000000;padding:22px 40px;" align="left">
<img src="https://aiqloud.nl/__l5e/assets-v1/afb26d67-4d31-4dd8-a480-e635069a59ce/logo-wit.png" width="200" height="52" alt="AI van Columbus" style="display:block;max-width:100%;height:auto;border:0;outline:none;text-decoration:none;">
</td></tr>
<tr><td height="4" bgcolor="#F2620C" style="background:#F2620C;font-size:0;line-height:0;">&nbsp;</td></tr>
<tr><td class="px" style="padding:40px 40px 8px;">
<h1 style="margin:0 0 24px;font-family:Arial, Helvetica, sans-serif;font-size:26px;line-height:32px;color:#111111;">Je afspraak is bevestigd</h1>
<p style="margin:0 0 16px;font-family:Arial, Helvetica, sans-serif;font-size:15px;line-height:24px;color:#333333;">Beste {{contact_name}},</p>
<p style="margin:0 0 16px;font-family:Arial, Helvetica, sans-serif;font-size:15px;line-height:24px;color:#333333;">Dank je wel voor het fijne gesprek. Hierbij bevestig ik onze afspraak. Ik kijk ernaar uit!</p>

</td></tr>
<tr><td class="px" style="padding:8px 40px 24px;">
<table role="presentation" width="100%" cellspacing="0" cellpadding="0" border="0" style="border:1px solid #E5E5E5;border-left:4px solid #F2620C;background:#FAFAFA;">
<tr><td style="padding:18px 20px;">
<table role="presentation" width="100%" cellspacing="0" cellpadding="0" border="0">
<tr><td style="padding:4px 0;font-family:Arial, Helvetica, sans-serif;font-size:15px;color:#666666;width:110px;" valign="top">Datum</td><td style="padding:4px 0;font-family:Arial, Helvetica, sans-serif;font-size:15px;color:#111111;font-weight:bold;">{{appointment_date}}</td></tr><tr><td style="padding:4px 0;font-family:Arial, Helvetica, sans-serif;font-size:15px;color:#666666;width:110px;" valign="top">Tijd</td><td style="padding:4px 0;font-family:Arial, Helvetica, sans-serif;font-size:15px;color:#111111;font-weight:bold;">{{appointment_time}} uur</td></tr><tr><td style="padding:4px 0;font-family:Arial, Helvetica, sans-serif;font-size:15px;color:#666666;width:110px;" valign="top">Locatie</td><td style="padding:4px 0;font-family:Arial, Helvetica, sans-serif;font-size:15px;color:#111111;font-weight:bold;">{{appointment_location}}</td></tr><tr><td style="padding:4px 0;font-family:Arial, Helvetica, sans-serif;font-size:15px;color:#666666;width:110px;" valign="top">Onderwerp</td><td style="padding:4px 0;font-family:Arial, Helvetica, sans-serif;font-size:15px;color:#111111;font-weight:bold;">{{appointment_title}}</td></tr>
</table></td></tr></table>
</td></tr>
<tr><td class="px" align="center" style="padding:8px 40px 32px;"><table role="presentation" cellspacing="0" cellpadding="0" border="0" align="center"><tr>
<td align="center" bgcolor="#F2620C" style="border-radius:4px;background:#F2620C;">
<a href="{{appointment_link}}" target="_blank" style="display:inline-block;padding:16px 36px;font-family:Arial, Helvetica, sans-serif;font-size:17px;font-weight:bold;color:#ffffff;text-decoration:none;border-radius:4px;">Zet in mijn agenda</a>
</td></tr></table>
</td></tr>

<tr><td class="px" style="padding:8px 40px 24px;border-top:1px solid #EEEEEE;">
<div style="height:16px;line-height:16px;font-size:0;">&nbsp;</div>
<h2 style="margin:0 0 12px;font-family:Arial, Helvetica, sans-serif;font-size:18px;line-height:24px;color:#F2620C;">Afspraak verzetten?</h2>
<p style="margin:0 0 16px;font-family:Arial, Helvetica, sans-serif;font-size:15px;line-height:24px;color:#333333;">Lukt het onverhoopt niet? Geen probleem. Laat het me even weten, dan plannen we een nieuw moment.</p>
<table role="presentation" width="100%" cellspacing="0" cellpadding="0" border="0"><tr>
<td class="stack" width="33%" style="padding-right:6px;" valign="top"><table role="presentation" cellspacing="0" cellpadding="0" border="0" width="100%"><tr>
<td align="center" bgcolor="#ffffff" style="border:2px solid #F2620C;border-radius:4px;">
<a href="mailto:info@aivancolumbus.com?subject=Afspraak%20verzetten%20{{appointment_date}}" target="_blank" style="display:block;padding:12px 8px;font-family:Arial, Helvetica, sans-serif;font-size:14px;font-weight:bold;color:#F2620C;text-decoration:none;">Mail om te verzetten</a>
</td></tr></table></td>
<td class="stack" width="33%" style="padding:0 3px;" valign="top"><table role="presentation" cellspacing="0" cellpadding="0" border="0" width="100%"><tr>
<td align="center" bgcolor="#ffffff" style="border:2px solid #F2620C;border-radius:4px;">
<a href="tel:+31639291340" target="_blank" style="display:block;padding:12px 8px;font-family:Arial, Helvetica, sans-serif;font-size:14px;font-weight:bold;color:#F2620C;text-decoration:none;">Bel mij</a>
</td></tr></table></td>
<td class="stack" width="33%" style="padding-left:6px;" valign="top"><table role="presentation" cellspacing="0" cellpadding="0" border="0" width="100%"><tr>
<td align="center" bgcolor="#ffffff" style="border:2px solid #F2620C;border-radius:4px;">
<a href="https://wa.me/31639291340?text=Hoi%20Anton%2C%20ik%20wil%20graag%20onze%20afspraak%20van%20{{appointment_date}}%20verzetten." target="_blank" style="display:block;padding:12px 8px;font-family:Arial, Helvetica, sans-serif;font-size:14px;font-weight:bold;color:#F2620C;text-decoration:none;">WhatsApp</a>
</td></tr></table></td>
</tr></table>
</td></tr>
<tr><td class="px" style="padding:16px 40px 24px;">
<p style="margin:0 0 16px;font-family:Arial, Helvetica, sans-serif;font-size:15px;line-height:24px;color:#333333;">Met vriendelijke groet,<br><strong>Anton Hogervorst</strong><br>AI van Columbus</p>
<table role="presentation" cellspacing="0" cellpadding="0" border="0" style="font-family:Arial, Helvetica, sans-serif;font-size:14px;line-height:22px;color:#333333;">
<tr><td style="padding-right:10px;color:#666666;">Mobiel</td><td><a href="tel:+31639291340" style="color:#111111;text-decoration:none;">+31 6 39 29 13 40</a></td></tr>
<tr><td style="padding-right:10px;color:#666666;">E-mail</td><td><a href="mailto:info@aivancolumbus.com" style="color:#F2620C;text-decoration:none;">info@aivancolumbus.com</a></td></tr>
<tr><td style="padding-right:10px;color:#666666;">Website</td><td><a href="https://aivancolumbus.com" style="color:#F2620C;text-decoration:none;">aivancolumbus.com</a></td></tr>
</table>
</td></tr>
<tr><td class="px" bgcolor="#F9F9F9" style="background:#F9F9F9;padding:18px 40px;border-top:1px solid #EEEEEE;font-family:Arial, Helvetica, sans-serif;font-size:12px;line-height:18px;color:#999999;" align="center">
AI van Columbus B.V. &middot; Ecu 23, 8305 BA Emmeloord &middot; KvK 42088548<br>
Je ontvangt deze mail omdat je een afspraak met ons hebt gemaakt.
</td></tr>
</table>
</td></tr></table>
</body></html>$avc$,
         is_html = true,
         description = 'Afspraakbevestiging in AI van Columbus-huisstijl: logo op zwarte balk, agendaknop en opties om te verzetten.',
         channel = 'email',
         updated_at = now()
   WHERE organization_id = 'd30d790a-7167-4ede-94b4-ad6b7d408a8a'::uuid
     AND name = 'Afspraak bevestiging AVC'$avc$;

  IF NOT FOUND THEN
    EXECUTE $avc$INSERT INTO public.outreach_message_templates
        (organization_id, name, description, channel, subject, body, is_default, is_html)
        VALUES ('d30d790a-7167-4ede-94b4-ad6b7d408a8a'::uuid, 'Afspraak bevestiging AVC', 'Afspraakbevestiging in AI van Columbus-huisstijl: logo op zwarte balk, agendaknop en opties om te verzetten.', 'email', 'Afspraak {{appointment_title}} — {{appointment_date}}',
                $avc$<!DOCTYPE html>
<html lang="nl" xmlns="http://www.w3.org/1999/xhtml">
<head>
<meta charset="utf-8">
<meta name="viewport" content="width=device-width, initial-scale=1">
<meta http-equiv="X-UA-Compatible" content="IE=edge">
<title>Je afspraak is bevestigd</title>
<style>
@media only screen and (max-width:620px){
  .container{width:100% !important;}
  .px{padding-left:20px !important;padding-right:20px !important;}
  .stack{display:block !important;width:100% !important;padding:0 0 10px 0 !important;}
}
</style>
</head>
<body style="margin:0;padding:0;background:#F4F4F4;">
<table role="presentation" width="100%" cellspacing="0" cellpadding="0" border="0" bgcolor="#F4F4F4" style="background:#F4F4F4;">
<tr><td align="center" style="padding:24px 10px;">
<table role="presentation" class="container" width="600" cellspacing="0" cellpadding="0" border="0" style="width:600px;max-width:600px;background:#ffffff;">
<tr><td bgcolor="#000000" class="px" style="background:#000000;padding:22px 40px;" align="left">
<img src="https://aiqloud.nl/__l5e/assets-v1/afb26d67-4d31-4dd8-a480-e635069a59ce/logo-wit.png" width="200" height="52" alt="AI van Columbus" style="display:block;max-width:100%;height:auto;border:0;outline:none;text-decoration:none;">
</td></tr>
<tr><td height="4" bgcolor="#F2620C" style="background:#F2620C;font-size:0;line-height:0;">&nbsp;</td></tr>
<tr><td class="px" style="padding:40px 40px 8px;">
<h1 style="margin:0 0 24px;font-family:Arial, Helvetica, sans-serif;font-size:26px;line-height:32px;color:#111111;">Je afspraak is bevestigd</h1>
<p style="margin:0 0 16px;font-family:Arial, Helvetica, sans-serif;font-size:15px;line-height:24px;color:#333333;">Beste {{contact_name}},</p>
<p style="margin:0 0 16px;font-family:Arial, Helvetica, sans-serif;font-size:15px;line-height:24px;color:#333333;">Dank je wel voor het fijne gesprek. Hierbij bevestig ik onze afspraak. Ik kijk ernaar uit!</p>

</td></tr>
<tr><td class="px" style="padding:8px 40px 24px;">
<table role="presentation" width="100%" cellspacing="0" cellpadding="0" border="0" style="border:1px solid #E5E5E5;border-left:4px solid #F2620C;background:#FAFAFA;">
<tr><td style="padding:18px 20px;">
<table role="presentation" width="100%" cellspacing="0" cellpadding="0" border="0">
<tr><td style="padding:4px 0;font-family:Arial, Helvetica, sans-serif;font-size:15px;color:#666666;width:110px;" valign="top">Datum</td><td style="padding:4px 0;font-family:Arial, Helvetica, sans-serif;font-size:15px;color:#111111;font-weight:bold;">{{appointment_date}}</td></tr><tr><td style="padding:4px 0;font-family:Arial, Helvetica, sans-serif;font-size:15px;color:#666666;width:110px;" valign="top">Tijd</td><td style="padding:4px 0;font-family:Arial, Helvetica, sans-serif;font-size:15px;color:#111111;font-weight:bold;">{{appointment_time}} uur</td></tr><tr><td style="padding:4px 0;font-family:Arial, Helvetica, sans-serif;font-size:15px;color:#666666;width:110px;" valign="top">Locatie</td><td style="padding:4px 0;font-family:Arial, Helvetica, sans-serif;font-size:15px;color:#111111;font-weight:bold;">{{appointment_location}}</td></tr><tr><td style="padding:4px 0;font-family:Arial, Helvetica, sans-serif;font-size:15px;color:#666666;width:110px;" valign="top">Onderwerp</td><td style="padding:4px 0;font-family:Arial, Helvetica, sans-serif;font-size:15px;color:#111111;font-weight:bold;">{{appointment_title}}</td></tr>
</table></td></tr></table>
</td></tr>
<tr><td class="px" align="center" style="padding:8px 40px 32px;"><table role="presentation" cellspacing="0" cellpadding="0" border="0" align="center"><tr>
<td align="center" bgcolor="#F2620C" style="border-radius:4px;background:#F2620C;">
<a href="{{appointment_link}}" target="_blank" style="display:inline-block;padding:16px 36px;font-family:Arial, Helvetica, sans-serif;font-size:17px;font-weight:bold;color:#ffffff;text-decoration:none;border-radius:4px;">Zet in mijn agenda</a>
</td></tr></table>
</td></tr>

<tr><td class="px" style="padding:8px 40px 24px;border-top:1px solid #EEEEEE;">
<div style="height:16px;line-height:16px;font-size:0;">&nbsp;</div>
<h2 style="margin:0 0 12px;font-family:Arial, Helvetica, sans-serif;font-size:18px;line-height:24px;color:#F2620C;">Afspraak verzetten?</h2>
<p style="margin:0 0 16px;font-family:Arial, Helvetica, sans-serif;font-size:15px;line-height:24px;color:#333333;">Lukt het onverhoopt niet? Geen probleem. Laat het me even weten, dan plannen we een nieuw moment.</p>
<table role="presentation" width="100%" cellspacing="0" cellpadding="0" border="0"><tr>
<td class="stack" width="33%" style="padding-right:6px;" valign="top"><table role="presentation" cellspacing="0" cellpadding="0" border="0" width="100%"><tr>
<td align="center" bgcolor="#ffffff" style="border:2px solid #F2620C;border-radius:4px;">
<a href="mailto:info@aivancolumbus.com?subject=Afspraak%20verzetten%20{{appointment_date}}" target="_blank" style="display:block;padding:12px 8px;font-family:Arial, Helvetica, sans-serif;font-size:14px;font-weight:bold;color:#F2620C;text-decoration:none;">Mail om te verzetten</a>
</td></tr></table></td>
<td class="stack" width="33%" style="padding:0 3px;" valign="top"><table role="presentation" cellspacing="0" cellpadding="0" border="0" width="100%"><tr>
<td align="center" bgcolor="#ffffff" style="border:2px solid #F2620C;border-radius:4px;">
<a href="tel:+31639291340" target="_blank" style="display:block;padding:12px 8px;font-family:Arial, Helvetica, sans-serif;font-size:14px;font-weight:bold;color:#F2620C;text-decoration:none;">Bel mij</a>
</td></tr></table></td>
<td class="stack" width="33%" style="padding-left:6px;" valign="top"><table role="presentation" cellspacing="0" cellpadding="0" border="0" width="100%"><tr>
<td align="center" bgcolor="#ffffff" style="border:2px solid #F2620C;border-radius:4px;">
<a href="https://wa.me/31639291340?text=Hoi%20Anton%2C%20ik%20wil%20graag%20onze%20afspraak%20van%20{{appointment_date}}%20verzetten." target="_blank" style="display:block;padding:12px 8px;font-family:Arial, Helvetica, sans-serif;font-size:14px;font-weight:bold;color:#F2620C;text-decoration:none;">WhatsApp</a>
</td></tr></table></td>
</tr></table>
</td></tr>
<tr><td class="px" style="padding:16px 40px 24px;">
<p style="margin:0 0 16px;font-family:Arial, Helvetica, sans-serif;font-size:15px;line-height:24px;color:#333333;">Met vriendelijke groet,<br><strong>Anton Hogervorst</strong><br>AI van Columbus</p>
<table role="presentation" cellspacing="0" cellpadding="0" border="0" style="font-family:Arial, Helvetica, sans-serif;font-size:14px;line-height:22px;color:#333333;">
<tr><td style="padding-right:10px;color:#666666;">Mobiel</td><td><a href="tel:+31639291340" style="color:#111111;text-decoration:none;">+31 6 39 29 13 40</a></td></tr>
<tr><td style="padding-right:10px;color:#666666;">E-mail</td><td><a href="mailto:info@aivancolumbus.com" style="color:#F2620C;text-decoration:none;">info@aivancolumbus.com</a></td></tr>
<tr><td style="padding-right:10px;color:#666666;">Website</td><td><a href="https://aivancolumbus.com" style="color:#F2620C;text-decoration:none;">aivancolumbus.com</a></td></tr>
</table>
</td></tr>
<tr><td class="px" bgcolor="#F9F9F9" style="background:#F9F9F9;padding:18px 40px;border-top:1px solid #EEEEEE;font-family:Arial, Helvetica, sans-serif;font-size:12px;line-height:18px;color:#999999;" align="center">
AI van Columbus B.V. &middot; Ecu 23, 8305 BA Emmeloord &middot; KvK 42088548<br>
Je ontvangt deze mail omdat je een afspraak met ons hebt gemaakt.
</td></tr>
</table>
</td></tr></table>
</body></html>$avc$, false, true)$avc$;
  END IF;
END
$avcdoc$;

-- Alleen voor AI van Columbus: dit sjabloon voortaan voor afspraakbevestigingen gebruiken.
UPDATE public.mail_settings
   SET appointment_template_id = (
         SELECT id FROM public.outreach_message_templates
          WHERE organization_id = 'd30d790a-7167-4ede-94b4-ad6b7d408a8a'::uuid AND name = 'Afspraak bevestiging AVC'
       )
 WHERE organization_id = 'd30d790a-7167-4ede-94b4-ad6b7d408a8a'::uuid;
