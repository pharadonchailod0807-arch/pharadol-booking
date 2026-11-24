BEGIN;

CREATE TABLE public.purchase_number_sequences (
  day date PRIMARY KEY,
  last_number bigint NOT NULL CHECK (last_number > 0)
);
CREATE TABLE public.purchase_requisitions (
  id uuid PRIMARY KEY,
  brand text NOT NULL CHECK (brand IN ('pharadol', 'adisorn')),
  number text NOT NULL UNIQUE,
  proposer_id text NOT NULL,
  proposer text NOT NULL,
  proposer_email text NOT NULL,
  purpose text NOT NULL,
  reason text NOT NULL,
  needed_on date,
  notes text NOT NULL DEFAULT '',
  items_total numeric(18,2) NOT NULL CHECK (items_total >= 0),
  shipping numeric(18,2) NOT NULL CHECK (shipping >= 0),
  discount numeric(18,2) NOT NULL CHECK (discount >= 0),
  vat numeric(18,2) NOT NULL CHECK (vat >= 0),
  total numeric(18,2) GENERATED ALWAYS AS (items_total + shipping - discount + vat) STORED CHECK (total >= 0),
  approved_total numeric(18,2),
  status text NOT NULL DEFAULT 'draft' CHECK (status IN
    ('draft','pending','returned','rejected','approved','purchasing','overage_pending','completed','cancelled')),
  version integer NOT NULL DEFAULT 1,
  round integer NOT NULL DEFAULT 0,
  current_level integer,
  current_approver text,
  created_at timestamptz NOT NULL DEFAULT now(),
  updated_at timestamptz NOT NULL DEFAULT now(),
  UNIQUE (id, brand)
);
CREATE INDEX purchase_date_idx ON public.purchase_requisitions(brand, created_at DESC, id);
CREATE INDEX purchase_status_idx ON public.purchase_requisitions(brand, status, created_at DESC);
CREATE INDEX purchase_amount_idx ON public.purchase_requisitions(brand, total, id);
CREATE INDEX purchase_number_idx ON public.purchase_requisitions(brand, number);
CREATE EXTENSION IF NOT EXISTS pg_trgm;
DO $$
DECLARE opclass text;
BEGIN
  SELECT format('%I.gin_trgm_ops', n.nspname) INTO STRICT opclass
  FROM pg_extension e JOIN pg_namespace n ON n.oid=e.extnamespace WHERE e.extname='pg_trgm';
  EXECUTE format('CREATE INDEX purchase_search_idx ON public.purchase_requisitions USING gin
    ((number || '' '' || proposer || '' '' || purpose) %s)', opclass);
END $$;

CREATE TABLE public.purchase_requisition_items (
  requisition_id uuid NOT NULL REFERENCES public.purchase_requisitions(id),
  id uuid NOT NULL,
  position integer NOT NULL CHECK (position > 0),
  name text NOT NULL CHECK (length(trim(name)) > 0),
  description text NOT NULL,
  quantity numeric(12,3) NOT NULL CHECK (quantity > 0),
  unit text NOT NULL CHECK (length(trim(unit)) > 0),
  unit_price numeric(14,2) NOT NULL CHECK (unit_price >= 0),
  line_total numeric(18,2) GENERATED ALWAYS AS (round(quantity * unit_price, 2)) STORED,
  vendor text NOT NULL,
  url text NOT NULL,
  notes text NOT NULL,
  PRIMARY KEY (requisition_id, id),
  UNIQUE (requisition_id, position)
);
CREATE TABLE public.purchase_approvers (
  id uuid PRIMARY KEY DEFAULT gen_random_uuid(),
  brand text NOT NULL CHECK (brand IN ('pharadol', 'adisorn')),
  level integer NOT NULL CHECK (level BETWEEN 1 AND 20),
  name text NOT NULL,
  position text NOT NULL,
  email text NOT NULL,
  active boolean NOT NULL DEFAULT true,
  updated_at timestamptz NOT NULL DEFAULT now()
);
CREATE UNIQUE INDEX purchase_active_level_idx ON public.purchase_approvers(brand, level) WHERE active;
CREATE TABLE public.purchase_attachments (
  id uuid PRIMARY KEY,
  requisition_id uuid NOT NULL REFERENCES public.purchase_requisitions(id),
  item_id uuid,
  kind text NOT NULL CHECK (kind IN ('product','quotation','receipt')),
  name text NOT NULL,
  mime text NOT NULL CHECK (mime IN ('image/jpeg','image/png','image/webp','application/pdf')),
  bytes integer NOT NULL CHECK (bytes BETWEEN 1 AND 3145728),
  active boolean NOT NULL DEFAULT true,
  created_at timestamptz NOT NULL DEFAULT now(),
  CHECK ((kind='product')=(item_id IS NOT NULL)),
  CHECK (kind<>'product' OR mime LIKE 'image/%')
);
CREATE INDEX purchase_attachments_req_idx ON public.purchase_attachments(requisition_id, active);
CREATE TABLE public.purchase_payments (
  id uuid PRIMARY KEY DEFAULT gen_random_uuid(),
  requisition_id uuid NOT NULL REFERENCES public.purchase_requisitions(id),
  purchased_on date NOT NULL,
  vendor text NOT NULL,
  previous_approved_total numeric(18,2) NOT NULL,
  actual_total numeric(18,2) NOT NULL CHECK (actual_total > 0),
  difference numeric(18,2) GENERATED ALWAYS AS (actual_total - previous_approved_total) STORED,
  method text NOT NULL,
  paid_on date NOT NULL,
  receipt_number text NOT NULL,
  receipt_id uuid REFERENCES public.purchase_attachments(id),
  notes text NOT NULL,
  status text NOT NULL CHECK (status IN ('pending','accepted','rejected','returned')),
  created_at timestamptz NOT NULL DEFAULT now(),
  UNIQUE (requisition_id, id)
);
CREATE UNIQUE INDEX purchase_current_payment_idx ON public.purchase_payments(requisition_id)
  WHERE status IN ('pending','accepted');

CREATE TABLE public.purchase_approval_rounds (
  requisition_id uuid NOT NULL REFERENCES public.purchase_requisitions(id),
  round integer NOT NULL CHECK (round > 0),
  kind text NOT NULL CHECK (kind IN ('requisition','overage')),
  snapshot jsonb NOT NULL,
  payment_id uuid,
  created_at timestamptz NOT NULL DEFAULT now(),
  PRIMARY KEY (requisition_id, round),
  FOREIGN KEY (requisition_id, payment_id) REFERENCES public.purchase_payments(requisition_id, id),
  CHECK ((kind='overage')=(payment_id IS NOT NULL))
);
CREATE TABLE public.purchase_approval_steps (
  id uuid PRIMARY KEY DEFAULT gen_random_uuid(),
  requisition_id uuid NOT NULL REFERENCES public.purchase_requisitions(id),
  round integer NOT NULL,
  level integer NOT NULL,
  approver_id uuid NOT NULL REFERENCES public.purchase_approvers(id),
  name text NOT NULL,
  position text NOT NULL,
  email text NOT NULL,
  status text NOT NULL CHECK (status IN ('queued','pending','approved','rejected','returned','cancelled')),
  invite_expires_at timestamptz,
  acted_at timestamptz,
  comment text NOT NULL DEFAULT '',
  FOREIGN KEY (requisition_id, round) REFERENCES public.purchase_approval_rounds(requisition_id, round),
  UNIQUE (requisition_id, round, level)
);
CREATE TABLE public.purchase_otp_challenges (
  step_id uuid PRIMARY KEY REFERENCES public.purchase_approval_steps(id),
  otp_hash text NOT NULL,
  sent_at timestamptz NOT NULL,
  expires_at timestamptz NOT NULL,
  requests integer NOT NULL CHECK (requests BETWEEN 1 AND 5),
  attempts integer NOT NULL DEFAULT 0 CHECK (attempts BETWEEN 0 AND 5),
  used_at timestamptz
);
CREATE TABLE public.purchase_approval_sessions (
  session_hash text PRIMARY KEY,
  step_id uuid NOT NULL REFERENCES public.purchase_approval_steps(id),
  expires_at timestamptz NOT NULL
);
CREATE INDEX purchase_session_step_idx ON public.purchase_approval_sessions(step_id);
CREATE TABLE public.purchase_email_outbox (
  id uuid PRIMARY KEY DEFAULT gen_random_uuid(),
  requisition_id uuid NOT NULL REFERENCES public.purchase_requisitions(id),
  step_id uuid NOT NULL REFERENCES public.purchase_approval_steps(id),
  kind text NOT NULL CHECK (kind IN ('invite','result')),
  recipient text NOT NULL,
  message jsonb,
  invite_expires_at timestamptz,
  status text NOT NULL DEFAULT 'pending' CHECK (status IN ('pending','sending','failed','sent','needs_review','cancelled')),
  attempts integer NOT NULL DEFAULT 0,
  attempt_key uuid,
  first_attempt_at timestamptz,
  next_attempt_at timestamptz NOT NULL DEFAULT now(),
  sent_at timestamptz,
  provider_id text,
  failure text
);
CREATE UNIQUE INDEX purchase_result_email_unique ON public.purchase_email_outbox(step_id) WHERE kind='result';
CREATE INDEX purchase_outbox_due_idx ON public.purchase_email_outbox(next_attempt_at)
  WHERE status IN ('pending','failed','sending');
CREATE TABLE public.purchase_audit_logs (
  id uuid PRIMARY KEY DEFAULT gen_random_uuid(),
  requisition_id uuid REFERENCES public.purchase_requisitions(id),
  brand text NOT NULL CHECK (brand IN ('pharadol','adisorn')),
  actor text NOT NULL,
  action text NOT NULL,
  detail jsonb NOT NULL DEFAULT '{}',
  created_at timestamptz NOT NULL DEFAULT now()
);
CREATE INDEX purchase_audit_req_idx ON public.purchase_audit_logs(requisition_id, created_at DESC);

CREATE FUNCTION public.purchase_snapshot(p_id uuid) RETURNS jsonb
LANGUAGE sql STABLE SET search_path=public, pg_temp AS $$
  SELECT jsonb_build_object(
    'document', to_jsonb(r) - 'proposer_id' - 'proposer_email' || jsonb_build_object(
      'items_total',r.items_total::text,'shipping',r.shipping::text,'discount',r.discount::text,
      'vat',r.vat::text,'total',r.total::text,'approved_total',r.approved_total::text),
    'items', coalesce((SELECT jsonb_agg(to_jsonb(i) || jsonb_build_object(
      'quantity',i.quantity::text,'unit_price',i.unit_price::text,'line_total',i.line_total::text) ORDER BY position)
      FROM purchase_requisition_items i WHERE i.requisition_id=r.id), '[]'::jsonb),
    'files', coalesce((SELECT jsonb_agg(to_jsonb(f) ORDER BY created_at)
      FROM purchase_attachments f WHERE f.requisition_id=r.id AND f.active AND f.kind<>'receipt'), '[]'::jsonb)
  ) FROM purchase_requisitions r WHERE r.id=p_id
$$;

CREATE FUNCTION public.purchase_open_round(p_id uuid, p_kind text, p_payment uuid)
RETURNS integer LANGUAGE plpgsql SET search_path=public, pg_temp AS $$
DECLARE
  r purchase_requisitions;
  first_step purchase_approval_steps;
  levels integer[];
  route jsonb;
BEGIN
  SELECT * INTO STRICT r FROM purchase_requisitions WHERE id=p_id FOR UPDATE;
  SELECT array_agg(a.level ORDER BY a.level), jsonb_agg(to_jsonb(a) ORDER BY a.level)
    INTO levels, route FROM purchase_approvers a WHERE a.brand=r.brand AND a.active;
  IF coalesce(cardinality(levels),0)<2 OR levels<>ARRAY(SELECT generate_series(1,cardinality(levels))) THEN
    RAISE EXCEPTION 'กำหนดผู้อนุมัติที่เปิดใช้งานต่อเนื่องตั้งแต่ระดับ 1 อย่างน้อย 2 ระดับ' USING ERRCODE='23514';
  END IF;
  IF EXISTS (SELECT 1 FROM jsonb_array_elements(route) a GROUP BY a->>'email' HAVING count(*)>1) THEN
    RAISE EXCEPTION 'ใช้อีเมลผู้อนุมัติคนละบัญชีในแต่ละระดับ' USING ERRCODE='23514';
  END IF;
  r.round := r.round + 1;
  INSERT INTO purchase_approval_rounds(requisition_id,round,kind,snapshot,payment_id)
  VALUES(p_id,r.round,p_kind,purchase_snapshot(p_id),p_payment);
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

CREATE FUNCTION public.purchase_save(p_brand text, p_id uuid, p_actor text, p_name text, p_email text, p_data jsonb)
RETURNS uuid LANGUAGE plpgsql SET search_path=public, pg_temp AS $$
DECLARE
  r purchase_requisitions;
  today date := (now() AT TIME ZONE 'Asia/Bangkok')::date;
  seq bigint;
  subtotal numeric(18,2);
  item_count integer;
BEGIN
  SELECT count(*), sum(round(quantity*unit_price,2)) INTO item_count, subtotal
  FROM jsonb_to_recordset(p_data->'items') AS i(quantity numeric,unit_price numeric);
  IF item_count NOT BETWEEN 1 AND 60 OR subtotal IS NULL THEN
    RAISE EXCEPTION 'เพิ่มรายการสินค้า 1 ถึง 60 รายการ' USING ERRCODE='23514';
  END IF;
  IF NOT p_data ? 'version' THEN
    -- A client-generated document ID safely ties retries to the first successful create.
    PERFORM pg_advisory_xact_lock(hashtextextended(p_id::text,20261124));
    SELECT * INTO r FROM purchase_requisitions WHERE id=p_id;
    IF FOUND THEN
      IF r.brand=p_brand AND r.proposer_id=p_actor THEN RETURN r.id; END IF;
      RAISE EXCEPTION 'ไม่พบเอกสาร' USING ERRCODE='P0002';
    END IF;
    INSERT INTO purchase_number_sequences AS s(day,last_number) VALUES(today,1)
    ON CONFLICT(day) DO UPDATE SET last_number=s.last_number+1 RETURNING last_number INTO seq;
    INSERT INTO purchase_requisitions(id,brand,number,proposer_id,proposer,proposer_email,purpose,reason,needed_on,notes,
      items_total,shipping,discount,vat)
    VALUES(p_id,p_brand,'PR-'||to_char(today,'YYYYMMDD')||'-'||lpad(seq::text,greatest(4,length(seq::text)),'0'),
      p_actor,p_name,p_email,p_data->>'purpose',p_data->>'reason',nullif(p_data->>'needed_on','')::date,
      p_data->>'notes',subtotal,(p_data->>'shipping')::numeric,(p_data->>'discount')::numeric,(p_data->>'vat')::numeric);
  ELSE
    SELECT * INTO r FROM purchase_requisitions WHERE id=p_id AND brand=p_brand FOR UPDATE;
    IF NOT FOUND THEN RAISE EXCEPTION 'ไม่พบเอกสาร' USING ERRCODE='P0002'; END IF;
    IF r.version<>(p_data->>'version')::int OR r.status NOT IN ('draft','returned') THEN
      RAISE EXCEPTION 'เอกสารถูกอัปเดตหรือไม่อยู่ในสถานะที่แก้ไขได้' USING ERRCODE='40001';
    END IF;
    UPDATE purchase_requisitions SET purpose=p_data->>'purpose',reason=p_data->>'reason',
      needed_on=nullif(p_data->>'needed_on','')::date,notes=p_data->>'notes',items_total=subtotal,
      proposer_email=CASE WHEN r.proposer_id=p_actor THEN p_email ELSE r.proposer_email END,
      shipping=(p_data->>'shipping')::numeric,discount=(p_data->>'discount')::numeric,vat=(p_data->>'vat')::numeric,
      version=version+1,updated_at=now() WHERE id=p_id;
    DELETE FROM purchase_requisition_items WHERE requisition_id=p_id;
  END IF;
  INSERT INTO purchase_requisition_items(requisition_id,id,position,name,description,quantity,unit,unit_price,vendor,url,notes)
  SELECT p_id,id,position,name,description,quantity,unit,unit_price,vendor,url,notes
  FROM jsonb_to_recordset(p_data->'items') AS i(id uuid,position integer,name text,description text,quantity numeric,
    unit text,unit_price numeric,vendor text,url text,notes text);
  UPDATE purchase_attachments f SET active=false WHERE f.requisition_id=p_id AND f.kind='product' AND f.active
    AND NOT EXISTS(SELECT 1 FROM purchase_requisition_items i WHERE i.requisition_id=p_id AND i.id=f.item_id);
  INSERT INTO purchase_audit_logs(requisition_id,brand,actor,action)
  VALUES(p_id,p_brand,p_actor,CASE WHEN p_data ? 'version' THEN 'edited' ELSE 'created' END);
  RETURN p_id;
END $$;

CREATE FUNCTION public.purchase_mutate(p_brand text,p_id uuid,p_actor text,p_action text,p_data jsonb)
RETURNS jsonb LANGUAGE plpgsql SET search_path=public, pg_temp AS $$
DECLARE
  r purchase_requisitions;
  pay purchase_payments;
  f purchase_attachments;
  new_round integer;
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
    new_round := purchase_open_round(p_id,'requisition',NULL);
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
      new_round := purchase_open_round(p_id,'overage',pay.id);
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
  END IF;
  INSERT INTO purchase_audit_logs(requisition_id,brand,actor,action,detail)
  VALUES(p_id,p_brand,p_actor,p_action,jsonb_strip_nulls(jsonb_build_object(
    'round',new_round,'payment_id',pay.id,'file_id',f.id,'previous_round',CASE WHEN p_action='revise' THEN r.round END)));
  RETURN jsonb_build_object('round',new_round,'file_id',f.id,'payment_id',pay.id,'version',r.version+1);
END $$;

CREATE FUNCTION public.purchase_approver_save(p_brand text,p_actor text,p_data jsonb)
RETURNS uuid LANGUAGE plpgsql SET search_path=public, pg_temp AS $$
DECLARE saved uuid;
BEGIN
  IF p_data->>'id' IS NULL THEN
    INSERT INTO purchase_approvers(brand,level,name,position,email,active)
    VALUES(p_brand,(p_data->>'level')::int,p_data->>'name',p_data->>'position',p_data->>'email',(p_data->>'active')::boolean)
    RETURNING id INTO saved;
  ELSE
    UPDATE purchase_approvers SET level=(p_data->>'level')::int,name=p_data->>'name',position=p_data->>'position',
      email=p_data->>'email',active=(p_data->>'active')::boolean,updated_at=now()
    WHERE id=(p_data->>'id')::uuid AND brand=p_brand RETURNING id INTO saved;
  END IF;
  IF saved IS NULL THEN RAISE EXCEPTION 'ไม่พบผู้อนุมัติ' USING ERRCODE='P0002'; END IF;
  INSERT INTO purchase_audit_logs(brand,actor,action,detail)
  VALUES(p_brand,p_actor,'approver_saved',jsonb_build_object('approver_id',saved,'level',p_data->>'level','active',p_data->'active'));
  RETURN saved;
END $$;

CREATE FUNCTION public.purchase_otp(p_step uuid,p_invite_expires timestamptz,p_action text,p_hash text,p_session text DEFAULT NULL)
RETURNS text LANGUAGE plpgsql SET search_path=public, pg_temp AS $$
DECLARE
  s purchase_approval_steps;
  r purchase_requisitions;
  c purchase_otp_challenges;
BEGIN
  SELECT * INTO s FROM purchase_approval_steps WHERE id=p_step;
  IF NOT FOUND THEN RETURN 'invalid'; END IF;
  SELECT * INTO r FROM purchase_requisitions WHERE id=s.requisition_id FOR UPDATE;
  SELECT * INTO s FROM purchase_approval_steps WHERE id=p_step;
  IF s.status<>'pending' OR r.status NOT IN ('pending','overage_pending') OR s.round<>r.round
    OR s.level IS DISTINCT FROM r.current_level OR s.invite_expires_at IS DISTINCT FROM p_invite_expires
    OR s.invite_expires_at<=now() THEN RETURN 'invalid'; END IF;
  SELECT * INTO c FROM purchase_otp_challenges WHERE step_id=p_step;
  IF p_action='request' THEN
    IF c.requests>=5 OR c.sent_at>now()-interval '60 seconds' THEN RETURN 'limited'; END IF;
    INSERT INTO purchase_otp_challenges(step_id,otp_hash,sent_at,expires_at,requests)
    VALUES(p_step,p_hash,now(),now()+interval '5 minutes',1)
    ON CONFLICT(step_id) DO UPDATE SET otp_hash=excluded.otp_hash,sent_at=excluded.sent_at,
      expires_at=excluded.expires_at,requests=purchase_otp_challenges.requests+1,attempts=0,used_at=NULL;
    INSERT INTO purchase_audit_logs(requisition_id,brand,actor,action,detail)
    VALUES(r.id,r.brand,s.name,'otp_requested',jsonb_build_object('step_id',s.id));
    RETURN 'sent';
  END IF;
  IF p_action<>'verify' THEN RETURN 'invalid'; END IF;
  IF c.step_id IS NULL OR c.expires_at<=now() OR c.used_at IS NOT NULL THEN RETURN 'expired'; END IF;
  IF c.attempts>=5 THEN RETURN 'limited'; END IF;
  IF c.otp_hash<>p_hash THEN
    UPDATE purchase_otp_challenges SET attempts=attempts+1 WHERE step_id=p_step;
    INSERT INTO purchase_audit_logs(requisition_id,brand,actor,action,detail)
    VALUES(r.id,r.brand,s.name,'otp_failed',jsonb_build_object('step_id',s.id));
    RETURN 'wrong';
  END IF;
  UPDATE purchase_otp_challenges SET used_at=now() WHERE step_id=p_step;
  DELETE FROM purchase_approval_sessions WHERE step_id=p_step;
  INSERT INTO purchase_approval_sessions(session_hash,step_id,expires_at)
  VALUES(p_session,p_step,least(s.invite_expires_at,now()+interval '30 minutes'));
  INSERT INTO purchase_audit_logs(requisition_id,brand,actor,action,detail)
  VALUES(r.id,r.brand,s.name,'otp_verified',jsonb_build_object('step_id',s.id));
  RETURN 'verified';
END $$;

CREATE FUNCTION public.purchase_review(p_session text,p_decision text,p_comment text)
RETURNS uuid LANGUAGE plpgsql SET search_path=public, pg_temp AS $$
DECLARE
  r purchase_requisitions;
  s purchase_approval_steps;
  next_step purchase_approval_steps;
  review_round purchase_approval_rounds;
  payment_status text;
BEGIN
  SELECT s1.* INTO s FROM purchase_approval_sessions ses
    JOIN purchase_approval_steps s1 ON s1.id=ses.step_id
    WHERE ses.session_hash=p_session AND ses.expires_at>now();
  IF NOT FOUND THEN RAISE EXCEPTION 'กรุณายืนยัน OTP ใหม่' USING ERRCODE='42501'; END IF;
  SELECT * INTO STRICT r FROM purchase_requisitions WHERE id=s.requisition_id FOR UPDATE;
  SELECT * INTO STRICT s FROM purchase_approval_steps WHERE id=s.id;
  IF r.status NOT IN ('pending','overage_pending') OR s.status<>'pending' OR s.round<>r.round
    OR s.level IS DISTINCT FROM r.current_level OR s.invite_expires_at<=now()
    OR NOT EXISTS(SELECT 1 FROM purchase_approval_sessions WHERE session_hash=p_session AND expires_at>now()) THEN
    RAISE EXCEPTION 'ขั้นตอนอนุมัติหมดอายุหรือดำเนินการแล้ว' USING ERRCODE='42501';
  END IF;
  IF p_decision NOT IN ('approved','rejected','returned') OR p_comment IS NULL
    OR (p_decision<>'approved' AND trim(p_comment)='') OR length(p_comment)>2000 THEN
    RAISE EXCEPTION 'ระบุผลและความคิดเห็นให้ถูกต้อง' USING ERRCODE='23514';
  END IF;
  SELECT * INTO STRICT review_round FROM purchase_approval_rounds WHERE requisition_id=r.id AND round=r.round;
  UPDATE purchase_approval_steps SET status=p_decision,acted_at=now(),comment=p_comment WHERE id=s.id;
  DELETE FROM purchase_approval_sessions WHERE step_id=s.id;
  IF p_decision='approved' THEN
    UPDATE purchase_approval_steps SET status='pending',invite_expires_at=date_trunc('second',now())+interval '3 days'
    WHERE requisition_id=r.id AND round=r.round AND level=s.level+1 AND status='queued'
    RETURNING * INTO next_step;
    IF FOUND THEN
      INSERT INTO purchase_email_outbox(requisition_id,step_id,kind,recipient,invite_expires_at)
      VALUES(r.id,next_step.id,'invite',next_step.email,next_step.invite_expires_at);
    END IF;
  ELSE
    UPDATE purchase_approval_steps SET status='cancelled'
    WHERE requisition_id=r.id AND round=r.round AND status='queued';
  END IF;

  IF next_step.id IS NULL THEN
    IF review_round.kind='overage' THEN
      payment_status := CASE WHEN p_decision='approved' THEN 'accepted' ELSE p_decision END;
      UPDATE purchase_payments SET status=payment_status WHERE id=review_round.payment_id;
      IF p_decision='approved' THEN
        UPDATE purchase_requisitions SET approved_total=(SELECT actual_total FROM purchase_payments WHERE id=review_round.payment_id),
          status='completed' WHERE id=r.id;
      ELSE
        UPDATE purchase_requisitions SET status='purchasing' WHERE id=r.id;
      END IF;
    ELSE
      UPDATE purchase_requisitions SET approved_total=CASE WHEN p_decision='approved' THEN total END,
        status=p_decision WHERE id=r.id;
    END IF;
  END IF;
  UPDATE purchase_requisitions SET current_level=next_step.level,current_approver=next_step.name,
    version=version+1,updated_at=now() WHERE id=r.id;
  INSERT INTO purchase_email_outbox(requisition_id,step_id,kind,recipient)
  VALUES(r.id,s.id,'result',r.proposer_email);
  INSERT INTO purchase_audit_logs(requisition_id,brand,actor,action,detail)
  VALUES(r.id,r.brand,s.name,p_decision,jsonb_build_object('round',r.round,'step_id',s.id,'level',s.level,'comment',p_comment));
  RETURN r.id;
END $$;

CREATE FUNCTION public.purchase_list(p_brand text,p_query text,p_status text,p_from timestamptz,p_until timestamptz,
  p_sort text,p_asc boolean,p_page int) RETURNS jsonb
LANGUAGE sql STABLE SET search_path=public, pg_temp AS $$
  WITH filtered AS MATERIALIZED (
    SELECT id,number,proposer,purpose,total,status,current_approver,current_level,created_at,updated_at
    FROM purchase_requisitions
    WHERE brand=p_brand AND (p_status IS NULL OR status=p_status)
      AND (p_from IS NULL OR created_at>=p_from) AND (p_until IS NULL OR created_at<p_until)
      AND (p_query='' OR number || ' ' || proposer || ' ' || purpose ILIKE
        '%' || replace(replace(replace(p_query, chr(92), chr(92)||chr(92)), '%', chr(92)||'%'), '_', chr(92)||'_') || '%')
  ), page AS (
    SELECT * FROM filtered ORDER BY
      CASE WHEN p_sort='number' AND p_asc THEN number END,
      CASE WHEN p_sort='number' AND NOT p_asc THEN number END DESC,
      CASE WHEN p_sort='total' AND p_asc THEN total END,
      CASE WHEN p_sort='total' AND NOT p_asc THEN total END DESC,
      CASE WHEN p_asc THEN created_at END, created_at DESC,id
    LIMIT 20 OFFSET (p_page-1)*20
  )
  SELECT jsonb_build_object('count',(SELECT count(*) FROM filtered),
    'pending',(SELECT count(*) FROM purchase_requisitions WHERE brand=p_brand AND status IN ('pending','overage_pending')),
    'items',coalesce((SELECT jsonb_agg(to_jsonb(page)||jsonb_build_object('total',page.total::text)) FROM page),'[]'::jsonb))
$$;

-- The stored provider payload is fixed for retries under the same idempotency key.
CREATE FUNCTION public.purchase_email_claim(p_job uuid,p_message jsonb,p_now boolean)
RETURNS jsonb LANGUAGE plpgsql SET search_path=public, pg_temp AS $$
DECLARE j purchase_email_outbox;
BEGIN
  SELECT * INTO j FROM purchase_email_outbox WHERE id=p_job FOR UPDATE SKIP LOCKED;
  IF NOT FOUND OR j.status NOT IN ('pending','failed','sending')
    OR (j.next_attempt_at>now() AND (NOT p_now OR j.status='sending')) THEN RETURN NULL; END IF;
  IF j.kind='invite' AND NOT EXISTS(SELECT 1 FROM purchase_approval_steps s WHERE s.id=j.step_id AND s.status='pending'
    AND s.invite_expires_at=j.invite_expires_at AND s.invite_expires_at>now()) THEN
    UPDATE purchase_email_outbox SET status='cancelled' WHERE id=p_job;
    RETURN NULL;
  END IF;
  -- Resend retains idempotency keys for 24 hours. Stop before the window closes.
  IF j.first_attempt_at<=now()-interval '23 hours' THEN
    UPDATE purchase_email_outbox SET status='needs_review' WHERE id=p_job;
    RETURN NULL;
  END IF;
  IF j.message IS NULL AND p_message IS NULL THEN RETURN NULL; END IF;
  UPDATE purchase_email_outbox SET status='sending',attempts=attempts+1,attempt_key=gen_random_uuid(),
    message=coalesce(message,p_message),first_attempt_at=coalesce(first_attempt_at,now()),
    next_attempt_at=now()+interval '2 minutes'
  WHERE id=p_job RETURNING * INTO j;
  RETURN jsonb_build_object('attempt_key',j.attempt_key,'message',j.message);
END $$;

CREATE FUNCTION public.purchase_email_finish(p_job uuid,p_attempt uuid,p_provider text,p_failure text)
RETURNS void LANGUAGE sql SET search_path=public, pg_temp AS $$
  UPDATE purchase_email_outbox SET status=CASE WHEN p_provider IS NULL THEN 'failed' ELSE 'sent' END,
    provider_id=p_provider,failure=p_failure,sent_at=CASE WHEN p_provider IS NOT NULL THEN now() END,
    next_attempt_at=now()+make_interval(mins=>least(60, greatest(1,attempts)*2))
  WHERE id=p_job AND attempt_key=p_attempt AND status='sending'
$$;

CREATE FUNCTION public.purchase_email_block(p_job uuid) RETURNS void
LANGUAGE sql SET search_path=public, pg_temp AS $$
  UPDATE purchase_email_outbox SET status='failed',failure='configuration',next_attempt_at=now()+interval '5 minutes'
  WHERE id=p_job AND status IN ('pending','failed') AND (failure IS DISTINCT FROM 'configuration' OR next_attempt_at<=now())
$$;

DO $$
DECLARE t text;
BEGIN
  FOREACH t IN ARRAY ARRAY['purchase_number_sequences','purchase_requisitions','purchase_requisition_items',
    'purchase_approvers','purchase_attachments','purchase_payments','purchase_approval_rounds','purchase_approval_steps',
    'purchase_otp_challenges','purchase_approval_sessions','purchase_email_outbox','purchase_audit_logs'] LOOP
    EXECUTE format('ALTER TABLE public.%I ENABLE ROW LEVEL SECURITY',t);
    EXECUTE format('REVOKE ALL ON public.%I FROM PUBLIC,anon,authenticated,service_role',t);
    EXECUTE format('CREATE POLICY purchase_deny_client ON public.%I AS RESTRICTIVE FOR ALL TO anon,authenticated USING(false) WITH CHECK(false)',t);
    IF t NOT IN ('purchase_number_sequences','purchase_otp_challenges') THEN
      EXECUTE format('GRANT SELECT ON public.%I TO service_role',t);
    END IF;
  END LOOP;
END $$;

-- All RPCs execute as the migration owner, expose no client grants and use a fixed search path.
DO $$
DECLARE f regprocedure;
BEGIN
  FOR f IN SELECT p.oid::regprocedure FROM pg_proc p JOIN pg_namespace n ON n.oid=p.pronamespace
    WHERE n.nspname='public' AND p.proname IN ('purchase_snapshot','purchase_open_round','purchase_save','purchase_mutate',
      'purchase_approver_save','purchase_otp','purchase_review','purchase_list','purchase_email_claim','purchase_email_finish','purchase_email_block') LOOP
    EXECUTE format('REVOKE ALL ON FUNCTION %s FROM PUBLIC,anon,authenticated,service_role',f);
    IF f::text NOT LIKE 'purchase_open_round(%' THEN
      EXECUTE format('ALTER FUNCTION %s SECURITY DEFINER',f);
      EXECUTE format('GRANT EXECUTE ON FUNCTION %s TO service_role',f);
    END IF;
  END LOOP;
END $$;
INSERT INTO storage.buckets(id,name,public,file_size_limit,allowed_mime_types)
  VALUES('purchase-private','purchase-private',false,3145728,ARRAY['image/jpeg','image/png','image/webp','application/pdf']);
CREATE POLICY purchase_private_deny_clients ON storage.objects AS RESTRICTIVE FOR ALL TO anon,authenticated
  USING(bucket_id<>'purchase-private') WITH CHECK(bucket_id<>'purchase-private');
COMMIT;
