-- Execute in a transaction and roll back: no test data is retained.
BEGIN;
DO $$
DECLARE org uuid; other_org uuid; client uuid; contact uuid; mail uuid; linked uuid;
BEGIN
 SELECT id INTO org FROM public.organizations ORDER BY created_at LIMIT 1;
 SELECT id INTO other_org FROM public.organizations WHERE id<>org LIMIT 1;
 INSERT INTO public.clients(organization_id,name) VALUES(org,'Mail koppeling test') RETURNING id INTO client;
 INSERT INTO public.mail_messages(organization_id,folder,from_email,subject,status)
 VALUES(org,'inbox','secondary@mail-link-test.invalid','Historische mail','received') RETURNING id INTO mail;
 INSERT INTO public.client_contacts(organization_id,client_id,first_name,email,secondary_email)
 VALUES(org,client,'Mailtest','primary@mail-link-test.invalid','secondary@mail-link-test.invalid') RETURNING id INTO contact;
 SELECT client_id INTO linked FROM public.mail_messages WHERE id=mail;
 IF linked IS DISTINCT FROM client THEN RAISE EXCEPTION 'Earlier secondary-address mail was not linked'; END IF;
 INSERT INTO public.mail_messages(organization_id,folder,from_email,status)
 VALUES(org,'inbox','Mailtest <PRIMARY@mail-link-test.invalid>','received') RETURNING client_id INTO linked;
 IF linked IS DISTINCT FROM client THEN RAISE EXCEPTION 'Primary address was not linked'; END IF;
 UPDATE public.client_contacts SET is_active=false WHERE id=contact;
 INSERT INTO public.mail_messages(organization_id,folder,from_email,status)
 VALUES(org,'inbox','primary@mail-link-test.invalid','received') RETURNING client_id INTO linked;
 IF linked IS NOT NULL THEN RAISE EXCEPTION 'Inactive contact was linked'; END IF;
 UPDATE public.client_contacts SET is_active=true WHERE id=contact;
 IF other_org IS NOT NULL THEN
 INSERT INTO public.mail_messages(organization_id,folder,from_email,status)
 VALUES(other_org,'inbox','primary@mail-link-test.invalid','received') RETURNING client_id INTO linked;
 IF linked IS NOT NULL THEN RAISE EXCEPTION 'Cross-organization mail was linked'; END IF;
 END IF;
END $$;
ROLLBACK;