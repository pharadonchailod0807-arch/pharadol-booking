BEGIN;

SET LOCAL lock_timeout = '5s';

ALTER TABLE public.purchase_approvers ADD COLUMN one_time boolean NOT NULL DEFAULT false
  CHECK (NOT one_time OR NOT active);

CREATE OR REPLACE FUNCTION public.purchase_open_round(p_id uuid, p_kind text, p_payment uuid, p_data jsonb)
RETURNS integer LANGUAGE plpgsql SET search_path=public, pg_temp AS $$
DECLARE
  r purchase_requisitions;
  first_step purchase_approval_steps;
  levels integer[];
  chosen jsonb := p_data->'approval_route';
  route jsonb;
  inline_candidate jsonb := p_data->'inline_approver';
  inline_level integer;
  inline_id uuid;
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
    IF inline_candidate IS NOT NULL THEN
      IF jsonb_typeof(inline_candidate)<>'object'
        OR (inline_candidate->>'level')::int IS NULL
        OR (inline_candidate->>'level')::int NOT BETWEEN 1 AND coalesce(levels[cardinality(levels)],1)
        OR jsonb_typeof(inline_candidate->'remember') IS DISTINCT FROM 'boolean'
        OR nullif(trim(inline_candidate->>'name'),'') IS NULL OR length(inline_candidate->>'name')>160
        OR nullif(trim(inline_candidate->>'position'),'') IS NULL OR length(inline_candidate->>'position')>160
        OR coalesce(inline_candidate->>'email','') !~ '^[^[:space:]<>@]+@[^[:space:]<>@]+[.][^[:space:]<>@]+$'
        OR length(inline_candidate->>'email')>254 THEN
        RAISE EXCEPTION 'ตรวจสอบข้อมูลผู้อนุมัติใหม่' USING ERRCODE='23514';
      END IF;
      inline_level := (inline_candidate->>'level')::int;
      SELECT ARRAY(SELECT DISTINCT level FROM unnest(array_append(levels, inline_level)) level ORDER BY level) INTO levels;
    END IF;
    IF levels IS NULL THEN
      RAISE EXCEPTION 'ยังไม่ได้ตั้งค่าผู้อนุมัติ กรุณาตั้งค่าผู้อนุมัติระดับ 1 ก่อนส่ง' USING ERRCODE='23514';
    END IF;
    IF levels<>ARRAY(SELECT generate_series(1,cardinality(levels))) THEN
      RAISE EXCEPTION 'เปิดใช้งานผู้อนุมัติให้ครบทุกระดับต่อเนื่องตั้งแต่ระดับ 1' USING ERRCODE='23514';
    END IF;
    IF inline_level IS NOT NULL THEN
      IF jsonb_typeof(chosen) IS DISTINCT FROM 'array'
        OR chosen->(inline_level-1) IS DISTINCT FROM 'null'::jsonb THEN
        RAISE EXCEPTION 'เลือกตำแหน่งในลำดับสำหรับผู้อนุมัติใหม่' USING ERRCODE='23514';
      END IF;
      IF EXISTS (SELECT 1 FROM purchase_approvers a WHERE a.brand=r.brand AND a.active AND a.level=inline_level
        AND lower(a.email)=lower(inline_candidate->>'email')) THEN
        RAISE EXCEPTION 'มีอีเมลนี้ในรายชื่อแล้ว กรุณาเลือกจากรายการ' USING ERRCODE='23514';
      END IF;
      INSERT INTO purchase_approvers(brand,level,name,position,email,active,one_time)
      VALUES(r.brand,inline_level,inline_candidate->>'name',inline_candidate->>'position',lower(inline_candidate->>'email'),
        (inline_candidate->>'remember')::boolean,NOT (inline_candidate->>'remember')::boolean)
      RETURNING id INTO inline_id;
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
      JOIN purchase_approvers a ON a.level=selected.level AND a.brand=r.brand AND (
        (selected.level=inline_level AND a.id=inline_id) OR
        (a.id=(selected.entry->>'id')::uuid AND a.active AND a.updated_at=(selected.entry->>'updated_at')::timestamptz));
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
    WHERE id=(p_data->>'id')::uuid AND brand=p_brand AND NOT one_time RETURNING id INTO saved;
  END IF;
  IF saved IS NULL THEN RAISE EXCEPTION 'ไม่พบผู้อนุมัติ' USING ERRCODE='P0002'; END IF;
  INSERT INTO purchase_audit_logs(brand,actor,action,detail)
  VALUES(p_brand,p_actor,'approver_saved',jsonb_build_object('approver_id',saved,'level',p_data->>'level','active',p_data->'active'));
  RETURN saved;
END $$;

NOTIFY pgrst, 'reload schema';

COMMIT;
