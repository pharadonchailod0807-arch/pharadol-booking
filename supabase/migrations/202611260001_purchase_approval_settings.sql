BEGIN;

SET LOCAL lock_timeout = '5s';

ALTER TABLE public.purchase_approval_rounds
  ADD COLUMN sender_message text NOT NULL DEFAULT '' CHECK (length(sender_message)<=2000);
ALTER TABLE public.purchase_approvers ALTER COLUMN level SET DEFAULT 1;
DROP INDEX public.purchase_active_level_idx;
CREATE UNIQUE INDEX purchase_active_candidate_idx
  ON public.purchase_approvers(brand, level, lower(email)) WHERE active;

CREATE FUNCTION public.purchase_open_round(p_id uuid, p_kind text, p_payment uuid, p_data jsonb)
RETURNS integer LANGUAGE plpgsql SET search_path=public, pg_temp AS $$
DECLARE
  r purchase_requisitions;
  first_step purchase_approval_steps;
  levels integer[];
  chosen jsonb := p_data->'approval_route';
  route jsonb;
BEGIN
  SELECT * INTO STRICT r FROM purchase_requisitions WHERE id=p_id FOR UPDATE;
  IF p_kind='overage' THEN
    -- Keep the saved route for additional spend on an already submitted document.
    SELECT jsonb_agg(jsonb_build_object('id',s.approver_id,'level',s.level,'name',s.name,
      'position',s.position,'email',s.email) ORDER BY s.level) INTO route
    FROM purchase_approval_steps s WHERE s.requisition_id=p_id AND s.round=r.round;
    IF route IS NULL THEN
      RAISE EXCEPTION 'ไม่พบลำดับการอนุมัติเดิมของเอกสาร' USING ERRCODE='23514';
    END IF;
  ELSE
    -- Serialize settings changes and the snapshot of the approvers a sender confirmed.
    PERFORM pg_advisory_xact_lock(739218, CASE WHEN r.brand='pharadol' THEN 1 ELSE 2 END);
    SELECT array_agg(DISTINCT a.level ORDER BY a.level) INTO levels
    FROM purchase_approvers a WHERE a.brand=r.brand AND a.active;
    IF levels IS NULL THEN
      RAISE EXCEPTION 'ยังไม่ได้ตั้งค่าผู้อนุมัติ กรุณาตั้งค่าผู้อนุมัติระดับ 1 ก่อนส่ง' USING ERRCODE='23514';
    END IF;
    IF levels<>ARRAY(SELECT generate_series(1,cardinality(levels))) THEN
      RAISE EXCEPTION 'เปิดใช้งานผู้อนุมัติให้ครบทุกระดับต่อเนื่องตั้งแต่ระดับ 1' USING ERRCODE='23514';
    END IF;
    IF chosen IS NULL THEN
      -- Accept old clients during rollout only when every level has an unambiguous recipient.
      SELECT jsonb_agg(to_jsonb(a) ORDER BY a.level) INTO route
      FROM purchase_approvers a WHERE a.brand=r.brand AND a.active;
    ELSE
      IF jsonb_typeof(chosen)<>'array' OR jsonb_array_length(chosen)<>cardinality(levels) THEN
        RAISE EXCEPTION 'กรุณาเลือกผู้อนุมัติให้ครบทุกระดับที่ตั้งค่าไว้' USING ERRCODE='23514';
      END IF;
      SELECT jsonb_agg(to_jsonb(a) ORDER BY a.level) INTO route
      FROM jsonb_array_elements(chosen) WITH ORDINALITY AS selected(entry, level)
      JOIN purchase_approvers a ON a.id=(selected.entry->>'id')::uuid AND a.level=selected.level
        AND a.brand=r.brand AND a.active AND a.updated_at=(selected.entry->>'updated_at')::timestamptz;
    END IF;
    IF coalesce(jsonb_array_length(route),0)<>cardinality(levels) THEN
      RAISE EXCEPTION 'รายชื่อผู้อนุมัติเปลี่ยนแปลง กรุณาเปิดหน้าตรวจสอบใหม่แล้วเลือกอีกครั้ง' USING ERRCODE='23514';
    END IF;
  END IF;
  IF EXISTS (SELECT 1 FROM jsonb_array_elements(route) a GROUP BY lower(a->>'email') HAVING count(*)>1) THEN
    RAISE EXCEPTION 'ใช้อีเมลผู้อนุมัติคนละบัญชีในแต่ละระดับ' USING ERRCODE='23514';
  END IF;
  r.round := r.round + 1;
  INSERT INTO purchase_approval_rounds(requisition_id,round,kind,snapshot,payment_id,sender_message)
  VALUES(p_id,r.round,p_kind,purchase_snapshot(p_id),p_payment,
    CASE WHEN p_kind='requisition' THEN coalesce(p_data->>'sender_message','') ELSE '' END);
  INSERT INTO purchase_approval_steps(requisition_id,round,level,approver_id,name,position,email,status,invite_expires_at)
  SELECT p_id,r.round,a.level,a.id,a.name,a.position,a.email,
    CASE WHEN a.level=1 THEN 'pending' ELSE 'queued' END,
    CASE WHEN a.level=1 THEN date_trunc('second',now())+interval '3 days' END
  FROM jsonb_populate_recordset(NULL::purchase_approvers,route) a;
  SELECT * INTO STRICT first_step FROM purchase_approval_steps WHERE requisition_id=p_id AND round=r.round AND level=1;
  INSERT INTO purchase_email_outbox(requisition_id,step_id,kind,recipient,invite_expires_at)
  VALUES (p_id,first_step.id,'invite',first_step.email,first_step.invite_expires_at);
  UPDATE purchase_requisitions SET round=r.round, current_level=1,current_approver=first_step.name,
    status=CASE WHEN p_kind='overage' THEN 'overage_pending' ELSE 'pending' END,
    version=version+1,updated_at=now() WHERE id=p_id;
  RETURN r.round;
END $$;

REVOKE ALL ON FUNCTION public.purchase_open_round(uuid,text,uuid,jsonb)
  FROM PUBLIC,anon,authenticated,service_role;

CREATE OR REPLACE FUNCTION public.purchase_open_round(p_id uuid,p_kind text,p_payment uuid)
RETURNS integer LANGUAGE sql SET search_path=public, pg_temp AS $$
  SELECT purchase_open_round(p_id,p_kind,p_payment,'{}'::jsonb)
$$;

CREATE OR REPLACE FUNCTION public.purchase_mutate(p_brand text,p_id uuid,p_actor text,p_action text,p_data jsonb)
RETURNS jsonb LANGUAGE plpgsql SECURITY DEFINER SET search_path=public, pg_temp AS $$
DECLARE
  r purchase_requisitions;
  pay purchase_payments;
  f purchase_attachments;
  new_round integer;
  invite_job uuid;
BEGIN
  SELECT * INTO r FROM purchase_requisitions WHERE id=p_id AND brand=p_brand FOR UPDATE;
  IF NOT FOUND THEN RAISE EXCEPTION 'ไม่พบเอกสาร' USING ERRCODE='P0002'; END IF;
  IF r.version IS DISTINCT FROM (p_data->>'version')::int THEN
    RAISE EXCEPTION 'เอกสารถูกอัปเดต กรุณาโหลดใหม่' USING ERRCODE='40001';
  END IF;
  IF p_action='submit' AND r.status IN ('draft','returned') THEN
    IF r.total<=0 OR r.proposer_email !~ '^[^[:space:]@]+@[^[:space:]@]+[.][^[:space:]@]+$' THEN
      RAISE EXCEPTION 'ยอดขออนุมัติและอีเมลผู้เสนอต้องถูกต้อง' USING ERRCODE='23514';
    END IF;
    new_round := purchase_open_round(p_id,'requisition',NULL,p_data);
  ELSIF p_action='revise' AND r.status='approved' THEN
    UPDATE purchase_requisitions SET status='draft',approved_total=NULL WHERE id=p_id;
  ELSIF p_action='renew' AND r.status IN ('pending','overage_pending') THEN
    UPDATE purchase_approval_steps SET invite_expires_at=date_trunc('second',now())+interval '3 days'
    WHERE requisition_id=p_id AND round=r.round AND level=r.current_level AND status='pending'
      AND invite_expires_at<=now();
    IF NOT FOUND THEN RAISE EXCEPTION 'ต่ออายุได้เมื่อลิงก์เดิมหมดอายุ' USING ERRCODE='23514'; END IF;
    DELETE FROM purchase_otp_challenges c USING purchase_approval_steps s WHERE c.step_id=s.id
      AND s.requisition_id=p_id AND s.round=r.round AND s.level=r.current_level;
    INSERT INTO purchase_email_outbox(requisition_id,step_id,kind,recipient,invite_expires_at)
    SELECT p_id,id,'invite',email,invite_expires_at FROM purchase_approval_steps
      WHERE requisition_id=p_id AND round=r.round AND level=r.current_level;
  ELSIF p_action='cancel' AND r.status IN ('draft','returned','pending','rejected') THEN
    UPDATE purchase_approval_steps SET status='cancelled' WHERE requisition_id=p_id AND round=r.round AND status IN ('pending','queued');
    UPDATE purchase_email_outbox o SET status='cancelled' WHERE o.requisition_id=p_id AND o.kind='invite'
      AND o.status IN ('pending','failed') AND EXISTS (SELECT 1 FROM purchase_approval_steps s WHERE s.id=o.step_id AND s.status='cancelled');
    UPDATE purchase_requisitions SET status='cancelled',current_level=NULL,current_approver=NULL WHERE id=p_id;
  ELSIF p_action='start' AND r.status='approved' THEN
    UPDATE purchase_requisitions SET status='purchasing' WHERE id=p_id;
  ELSIF p_action='payment' AND r.status='purchasing' THEN
    IF p_data->>'receipt_id' IS NOT NULL AND NOT EXISTS (
      SELECT 1 FROM purchase_attachments WHERE id=(p_data->>'receipt_id')::uuid
        AND requisition_id=p_id AND active AND kind='receipt'
    ) THEN RAISE EXCEPTION 'ไม่พบไฟล์ใบเสร็จ' USING ERRCODE='23514'; END IF;
    INSERT INTO purchase_payments(requisition_id,purchased_on,vendor,previous_approved_total,actual_total,
      method,paid_on,receipt_number,receipt_id,notes,status)
    VALUES(p_id,(p_data->>'purchased_on')::date,p_data->>'vendor',r.approved_total,(p_data->>'actual_total')::numeric,
      p_data->>'method',(p_data->>'paid_on')::date,p_data->>'receipt_number',(p_data->>'receipt_id')::uuid,
      p_data->>'notes',CASE WHEN (p_data->>'actual_total')::numeric>r.approved_total THEN 'pending' ELSE 'accepted' END)
    RETURNING * INTO pay;
    IF pay.status='pending' THEN
      new_round := purchase_open_round(p_id,'overage',pay.id,'{}'::jsonb);
    ELSE
      UPDATE purchase_requisitions SET status='completed' WHERE id=p_id;
    END IF;
  ELSIF p_action='file_add' AND (
    (r.status IN ('draft','returned') AND p_data->>'kind' IN ('quotation','product')) OR
    (r.status='purchasing' AND p_data->>'kind'='receipt')
  ) THEN
    IF p_data->>'kind'='product' AND NOT EXISTS (
      SELECT 1 FROM purchase_requisition_items WHERE requisition_id=p_id AND id=(p_data->>'item_id')::uuid
    ) THEN RAISE EXCEPTION 'ไม่พบรายการสินค้า' USING ERRCODE='P0002'; END IF;
    IF (SELECT count(*) FROM purchase_attachments WHERE requisition_id=p_id AND active)>=80 THEN
      RAISE EXCEPTION 'แนบไฟล์ได้สูงสุด 80 ไฟล์ต่อเอกสาร' USING ERRCODE='23514';
    END IF;
    IF p_data->>'kind'='product' THEN
      UPDATE purchase_attachments SET active=false WHERE requisition_id=p_id AND active AND item_id=(p_data->>'item_id')::uuid;
    END IF;
    INSERT INTO purchase_attachments(id,requisition_id,item_id,kind,name,mime,bytes)
    VALUES((p_data->>'id')::uuid,p_id,(p_data->>'item_id')::uuid,p_data->>'kind',p_data->>'name',
      p_data->>'mime',(p_data->>'bytes')::int) RETURNING * INTO f;
  ELSIF p_action='file_remove' THEN
    UPDATE purchase_attachments a SET active=false
    WHERE a.id=(p_data->>'id')::uuid AND a.requisition_id=p_id AND a.active AND (
      (r.status IN ('draft','returned') AND a.kind<>'receipt') OR
      (r.status='purchasing' AND a.kind='receipt' AND NOT EXISTS (
        SELECT 1 FROM purchase_payments p WHERE p.receipt_id=a.id
      ))
    ) RETURNING * INTO f;
    IF NOT FOUND THEN RAISE EXCEPTION 'ไม่สามารถนำไฟล์แนบออกได้' USING ERRCODE='23514'; END IF;
  ELSE
    RAISE EXCEPTION 'ไม่สามารถทำรายการในสถานะปัจจุบัน' USING ERRCODE='23514';
  END IF;

  IF new_round IS NULL THEN
    UPDATE purchase_requisitions SET updated_at=now(),version=version+1 WHERE id=p_id;
  ELSE
    SELECT o.id INTO STRICT invite_job FROM purchase_email_outbox o
    JOIN purchase_approval_steps s ON s.id=o.step_id
    WHERE o.requisition_id=p_id AND o.kind='invite' AND s.round=new_round AND s.level=1;
  END IF;
  INSERT INTO purchase_audit_logs(requisition_id,brand,actor,action,detail)
  VALUES(p_id,p_brand,p_actor,p_action,jsonb_strip_nulls(jsonb_build_object(
    'round',new_round,'payment_id',pay.id,'file_id',f.id,'previous_round',CASE WHEN p_action='revise' THEN r.round END)));
  RETURN jsonb_build_object('round',new_round,'file_id',f.id,'payment_id',pay.id,'version',r.version+1,'invite_job',invite_job);
END $$;

CREATE OR REPLACE FUNCTION public.purchase_approver_save(p_brand text,p_actor text,p_data jsonb)
RETURNS uuid LANGUAGE plpgsql SECURITY DEFINER SET search_path=public, pg_temp AS $$
DECLARE saved uuid;
BEGIN
  PERFORM pg_advisory_xact_lock(739218, CASE WHEN p_brand='pharadol' THEN 1 ELSE 2 END);
  IF p_data->>'id' IS NULL THEN
    INSERT INTO purchase_approvers(brand,level,name,position,email,active)
    VALUES(p_brand,coalesce((p_data->>'level')::int,1),p_data->>'name',p_data->>'position',p_data->>'email',(p_data->>'active')::boolean)
    RETURNING id INTO saved;
  ELSE
    UPDATE purchase_approvers SET level=coalesce((p_data->>'level')::int,1),name=p_data->>'name',position=p_data->>'position',
      email=p_data->>'email',active=(p_data->>'active')::boolean,updated_at=now()
    WHERE id=(p_data->>'id')::uuid AND brand=p_brand RETURNING id INTO saved;
  END IF;
  IF saved IS NULL THEN RAISE EXCEPTION 'ไม่พบผู้อนุมัติ' USING ERRCODE='P0002'; END IF;
  INSERT INTO purchase_audit_logs(brand,actor,action,detail)
  VALUES(p_brand,p_actor,'approver_saved',jsonb_build_object('approver_id',saved,'level',p_data->>'level','active',p_data->'active'));
  RETURN saved;
END $$;

NOTIFY pgrst, 'reload schema';

COMMIT;
