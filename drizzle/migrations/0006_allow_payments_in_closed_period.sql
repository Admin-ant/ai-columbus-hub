CREATE OR REPLACE FUNCTION public.guard_closed_period()
RETURNS trigger LANGUAGE plpgsql SECURITY DEFINER SET search_path = public AS $$
DECLARE col text := TG_ARGV[0]; d_old date; d_new date;
  pay_keys text[] := ARRAY['status','paid_at','updated_at','mollie_payment_id','mollie_checkout_url','payment_link_url','preferred_payment_method','last_emailed_at','sent_at'];
BEGIN
  -- Facturen in een afgesloten kwartaal: alleen betalingsregistratie toestaan
  -- (status naar sent/paid/overdue + betaalvelden); bedragen/datums blijven vast.
  IF TG_OP = 'UPDATE' AND TG_TABLE_NAME = 'invoices'
     AND (to_jsonb(NEW) - pay_keys) = (to_jsonb(OLD) - pay_keys)
     AND (NEW.status = OLD.status OR NEW.status::text IN ('sent','paid','overdue')) THEN
    RETURN NEW;
  END IF;
  IF TG_OP IN ('UPDATE','DELETE') THEN
    EXECUTE format('SELECT ($1).%I::date', col) INTO d_old USING OLD;
    IF public.is_period_closed(OLD.organization_id, d_old) THEN
      RAISE EXCEPTION 'Dit kwartaal is afgesloten; wijzigen is niet meer mogelijk';
    END IF;
  END IF;
  IF TG_OP IN ('INSERT','UPDATE') THEN
    EXECUTE format('SELECT ($1).%I::date', col) INTO d_new USING NEW;
    IF public.is_period_closed(NEW.organization_id, d_new) THEN
      RAISE EXCEPTION 'Dit kwartaal is afgesloten; boeken in deze periode is niet meer mogelijk';
    END IF;
    RETURN NEW;
  END IF;
  RETURN OLD;
END $$;
REVOKE EXECUTE ON FUNCTION public.guard_closed_period() FROM PUBLIC, anon, authenticated;