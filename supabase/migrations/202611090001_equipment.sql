-- Additive module. Does not alter any existing business table or authentication.
BEGIN;
CREATE SEQUENCE public.equipment_code_seq;
CREATE SEQUENCE public.equipment_checkout_code_seq;
CREATE SEQUENCE public.equipment_maintenance_code_seq;
CREATE TABLE public.equipment_categories (
 id uuid PRIMARY KEY DEFAULT gen_random_uuid(), brand text NOT NULL DEFAULT 'pharadol',
 name text NOT NULL CHECK (length(trim(name)) BETWEEN 1 AND 120), active boolean NOT NULL DEFAULT true,
 created_at timestamptz NOT NULL DEFAULT now(), UNIQUE(brand,name), UNIQUE(id,brand)
);
CREATE TABLE public.equipment (
 id uuid PRIMARY KEY DEFAULT gen_random_uuid(), brand text NOT NULL DEFAULT 'pharadol',
 sequence_number bigint NOT NULL DEFAULT nextval('public.equipment_code_seq'),
 equipment_code text GENERATED ALWAYS AS ('EQ-' || lpad(sequence_number::text,greatest(4,length(sequence_number::text)),'0')) STORED,
 name text NOT NULL CHECK(length(trim(name)) BETWEEN 1 AND 200), category_id uuid NOT NULL,
 manufacturer text NOT NULL DEFAULT '', model text NOT NULL DEFAULT '', serial_number text,
 description text NOT NULL DEFAULT '', quantity integer NOT NULL CHECK(quantity BETWEEN 1 AND 1000000),
 available integer NOT NULL DEFAULT 0 CHECK(available>=0), in_use integer NOT NULL DEFAULT 0 CHECK(in_use>=0),
 maintenance integer NOT NULL DEFAULT 0 CHECK(maintenance>=0), damaged integer NOT NULL DEFAULT 0 CHECK(damaged>=0),
 retired integer NOT NULL DEFAULT 0 CHECK(retired>=0), unit text NOT NULL DEFAULT 'ชิ้น', storage_location text NOT NULL DEFAULT '',
 purchase_date date, purchase_price numeric(16,2) NOT NULL DEFAULT 0 CHECK(purchase_price>=0), supplier text NOT NULL DEFAULT '', warranty_expiration date,
 version integer NOT NULL DEFAULT 1, archived_at timestamptz,
 created_at timestamptz NOT NULL DEFAULT now(), updated_at timestamptz NOT NULL DEFAULT now(),
 created_by text NOT NULL, updated_by text NOT NULL,
 status text GENERATED ALWAYS AS (CASE WHEN retired=quantity THEN 'retired' WHEN in_use>0 THEN 'in_use' WHEN maintenance>0 THEN 'maintenance' WHEN damaged>0 THEN 'damaged' ELSE 'available' END) STORED,
 UNIQUE(brand,equipment_code), UNIQUE(id,brand),
 FOREIGN KEY(category_id,brand) REFERENCES public.equipment_categories(id,brand),
 CHECK(available::bigint+in_use+maintenance+damaged+retired=quantity),
 CHECK(serial_number IS NULL OR (length(trim(serial_number))>0 AND quantity=1)),
 CHECK(warranty_expiration IS NULL OR purchase_date IS NULL OR warranty_expiration>=purchase_date)
);
CREATE UNIQUE INDEX equipment_serial_unique ON public.equipment(brand,lower(serial_number)) WHERE serial_number IS NOT NULL;
CREATE INDEX equipment_inventory_idx ON public.equipment(brand,archived_at,category_id);
CREATE INDEX equipment_name_idx ON public.equipment(brand,name);
CREATE INDEX equipment_status_idx ON public.equipment(brand,status);
CREATE INDEX equipment_purchase_date_idx ON public.equipment(brand,purchase_date);
CREATE TABLE public.equipment_checkouts (
 id uuid PRIMARY KEY DEFAULT gen_random_uuid(), brand text NOT NULL DEFAULT 'pharadol',
 sequence_number bigint NOT NULL DEFAULT nextval('public.equipment_checkout_code_seq'),
 checkout_code text GENERATED ALWAYS AS ('CO-' || lpad(sequence_number::text,greatest(4,length(sequence_number::text)),'0')) STORED,
 borrower text NOT NULL CHECK(length(trim(borrower)) BETWEEN 1 AND 200), related_booking text,
 checkout_date date NOT NULL, expected_return_date date NOT NULL, notes text NOT NULL DEFAULT '',
 created_by text NOT NULL, created_at timestamptz NOT NULL DEFAULT now(), UNIQUE(id,brand), UNIQUE(brand,checkout_code),
 CHECK(expected_return_date>=checkout_date)
);
CREATE INDEX equipment_checkout_history_idx ON public.equipment_checkouts(brand,created_at DESC);
-- related_booking is an optional external reference string; no writes/FK to legacy bookings.
CREATE TABLE public.equipment_checkout_items (
 id uuid PRIMARY KEY DEFAULT gen_random_uuid(), brand text NOT NULL DEFAULT 'pharadol', checkout_id uuid NOT NULL, equipment_id uuid NOT NULL,
 quantity integer NOT NULL CHECK(quantity>0), returned_quantity integer NOT NULL DEFAULT 0 CHECK(returned_quantity>=0 AND returned_quantity<=quantity),
 UNIQUE(checkout_id,equipment_id), UNIQUE(id,brand),
 FOREIGN KEY(checkout_id,brand) REFERENCES public.equipment_checkouts(id,brand), FOREIGN KEY(equipment_id,brand) REFERENCES public.equipment(id,brand)
);
CREATE INDEX equipment_checkout_equipment_idx ON public.equipment_checkout_items(equipment_id,checkout_id);
CREATE TABLE public.equipment_returns (
 id uuid PRIMARY KEY DEFAULT gen_random_uuid(), brand text NOT NULL DEFAULT 'pharadol', item_id uuid NOT NULL,
 quantity integer NOT NULL CHECK(quantity>0), condition text NOT NULL CHECK(condition IN ('available','damaged','maintenance')),
 return_date date NOT NULL, notes text NOT NULL DEFAULT '', created_by text NOT NULL, created_at timestamptz NOT NULL DEFAULT now(),
 FOREIGN KEY(item_id,brand) REFERENCES public.equipment_checkout_items(id,brand)
);
CREATE INDEX equipment_return_history_idx ON public.equipment_returns(brand,item_id,created_at DESC);
CREATE TABLE public.equipment_maintenance (
 id uuid PRIMARY KEY DEFAULT gen_random_uuid(), brand text NOT NULL DEFAULT 'pharadol', equipment_id uuid NOT NULL,
 sequence_number bigint NOT NULL DEFAULT nextval('public.equipment_maintenance_code_seq'),
 maintenance_code text GENERATED ALWAYS AS ('MT-' || lpad(sequence_number::text,greatest(4,length(sequence_number::text)),'0')) STORED,
 quantity integer NOT NULL CHECK(quantity>0), source_condition text NOT NULL CHECK(source_condition IN ('available','damaged')),
 issue text NOT NULL CHECK(length(trim(issue))>0), reported_date date NOT NULL,
 start_date date, completion_date date, service_provider text NOT NULL DEFAULT '', cost numeric(16,2) NOT NULL DEFAULT 0 CHECK(cost>=0),
 status text NOT NULL DEFAULT 'pending' CHECK(status IN ('pending','in_progress','completed','cancelled')),
 notes text NOT NULL DEFAULT '', confirmed_by text, created_by text NOT NULL, created_at timestamptz NOT NULL DEFAULT now(),
 UNIQUE(id,brand), FOREIGN KEY(equipment_id,brand) REFERENCES public.equipment(id,brand),
 CHECK(start_date IS NULL OR start_date>=reported_date), CHECK(completion_date IS NULL OR completion_date>=coalesce(start_date,reported_date)),
 CHECK(status<>'completed' OR (confirmed_by IS NOT NULL AND completion_date IS NOT NULL))
);
CREATE INDEX equipment_maintenance_equipment_idx ON public.equipment_maintenance(equipment_id,created_at DESC);
CREATE TABLE public.equipment_documents (
 id uuid PRIMARY KEY DEFAULT gen_random_uuid(), brand text NOT NULL DEFAULT 'pharadol', equipment_id uuid NOT NULL, maintenance_id uuid,
 kind text NOT NULL CHECK(kind IN ('image','additional_image','receipt','document','maintenance')),
 filename text NOT NULL, mime_type text NOT NULL CHECK(mime_type IN ('image/jpeg','image/png','image/webp','application/pdf')),
 storage_path text NOT NULL UNIQUE, size integer NOT NULL CHECK(size BETWEEN 1 AND 3145728),
 created_by text NOT NULL, created_at timestamptz NOT NULL DEFAULT now(),
 FOREIGN KEY(equipment_id,brand) REFERENCES public.equipment(id,brand), FOREIGN KEY(maintenance_id,brand) REFERENCES public.equipment_maintenance(id,brand)
);
CREATE INDEX equipment_documents_equipment_idx ON public.equipment_documents(equipment_id);
CREATE TABLE public.equipment_activity_logs (
 id bigint GENERATED ALWAYS AS IDENTITY PRIMARY KEY, brand text NOT NULL DEFAULT 'pharadol', equipment_id uuid,
 action text NOT NULL, actor text NOT NULL, created_at timestamptz NOT NULL DEFAULT now(), previous_value jsonb, new_value jsonb,
 FOREIGN KEY(equipment_id,brand) REFERENCES public.equipment(id,brand)
);
CREATE INDEX equipment_activity_equipment_idx ON public.equipment_activity_logs(brand,equipment_id,created_at DESC);
CREATE TABLE public.equipment_operations (
 request_id uuid PRIMARY KEY, brand text NOT NULL DEFAULT 'pharadol', actor text NOT NULL, action text NOT NULL, payload jsonb NOT NULL,
 result jsonb NOT NULL, created_at timestamptz NOT NULL DEFAULT now()
);
CREATE VIEW public.equipment_inventory WITH (security_invoker=true) AS
 SELECT e.*,c.name AS category_name FROM public.equipment e JOIN public.equipment_categories c ON c.id=e.category_id AND c.brand=e.brand;

CREATE FUNCTION public.equipment_log_change() RETURNS trigger LANGUAGE plpgsql SET search_path=public,pg_temp AS $$
BEGIN
 INSERT INTO equipment_activity_logs(brand,equipment_id,action,actor,previous_value,new_value)
 VALUES(NEW.brand,CASE WHEN TG_TABLE_NAME='equipment' THEN NEW.id ELSE NULL END,
 coalesce(nullif(current_setting('equipment.action',true),''),TG_OP||':'||TG_TABLE_NAME),
 coalesce(nullif(current_setting('equipment.actor',true),''),'database'),
 CASE WHEN TG_OP='UPDATE' THEN to_jsonb(OLD) ELSE NULL END,to_jsonb(NEW));
 RETURN NEW;
END $$;
CREATE TRIGGER equipment_audit AFTER INSERT OR UPDATE ON public.equipment FOR EACH ROW EXECUTE FUNCTION public.equipment_log_change();
CREATE TRIGGER equipment_category_audit AFTER INSERT OR UPDATE ON public.equipment_categories FOR EACH ROW EXECUTE FUNCTION public.equipment_log_change();
CREATE FUNCTION public.equipment_immutable_history() RETURNS trigger LANGUAGE plpgsql AS $$
BEGIN RAISE EXCEPTION 'Equipment history is immutable' USING ERRCODE='23514'; END $$;
CREATE TRIGGER equipment_logs_immutable BEFORE UPDATE OR DELETE ON public.equipment_activity_logs FOR EACH ROW EXECUTE FUNCTION public.equipment_immutable_history();
CREATE TRIGGER equipment_returns_immutable BEFORE UPDATE OR DELETE ON public.equipment_returns FOR EACH ROW EXECUTE FUNCTION public.equipment_immutable_history();
CREATE TRIGGER equipment_no_delete BEFORE DELETE ON public.equipment FOR EACH ROW EXECUTE FUNCTION public.equipment_immutable_history();
CREATE TRIGGER equipment_checkout_no_delete BEFORE DELETE ON public.equipment_checkouts FOR EACH ROW EXECUTE FUNCTION public.equipment_immutable_history();
CREATE TRIGGER equipment_item_no_delete BEFORE DELETE ON public.equipment_checkout_items FOR EACH ROW EXECUTE FUNCTION public.equipment_immutable_history();
CREATE TRIGGER equipment_maintenance_no_delete BEFORE DELETE ON public.equipment_maintenance FOR EACH ROW EXECUTE FUNCTION public.equipment_immutable_history();

-- Deferred checks enforce agreement between the stock counters and their ledgers,
-- including writes made outside the application RPC. All parts settle at COMMIT.
CREATE FUNCTION public.equipment_assert_balances() RETURNS trigger LANGUAGE plpgsql SET search_path=public,pg_temp AS $$
DECLARE eid uuid; ids uuid[]; e equipment%ROWTYPE; borrowed bigint; repairing bigint;
BEGIN
 IF TG_TABLE_NAME='equipment' THEN ids:=ARRAY[NEW.id]; ELSE
  ids:=ARRAY[NEW.equipment_id];
  IF TG_OP='UPDATE' AND OLD.equipment_id<>NEW.equipment_id THEN ids:=array_append(ids,OLD.equipment_id); END IF;
 END IF;
 FOREACH eid IN ARRAY ids LOOP
 SELECT * INTO e FROM equipment WHERE id=eid;
 SELECT coalesce(sum(quantity-returned_quantity),0) INTO borrowed FROM equipment_checkout_items WHERE equipment_id=eid AND brand=e.brand;
 SELECT coalesce(sum(quantity),0) INTO repairing FROM equipment_maintenance WHERE equipment_id=eid AND brand=e.brand AND status IN ('pending','in_progress');
 IF e.in_use<>borrowed OR e.maintenance<>repairing THEN
  RAISE EXCEPTION 'Equipment stock and ledgers disagree' USING ERRCODE='23514';
 END IF;
 END LOOP;
 RETURN NULL;
END $$;
CREATE CONSTRAINT TRIGGER equipment_balance_guard AFTER INSERT OR UPDATE ON public.equipment DEFERRABLE INITIALLY DEFERRED FOR EACH ROW EXECUTE FUNCTION public.equipment_assert_balances();
CREATE CONSTRAINT TRIGGER equipment_checkout_balance_guard AFTER INSERT OR UPDATE ON public.equipment_checkout_items DEFERRABLE INITIALLY DEFERRED FOR EACH ROW EXECUTE FUNCTION public.equipment_assert_balances();
CREATE CONSTRAINT TRIGGER equipment_maintenance_balance_guard AFTER INSERT OR UPDATE ON public.equipment_maintenance DEFERRABLE INITIALLY DEFERRED FOR EACH ROW EXECUTE FUNCTION public.equipment_assert_balances();
REVOKE ALL ON FUNCTION public.equipment_assert_balances() FROM PUBLIC,anon,authenticated;

CREATE FUNCTION public.equipment_assert_return_balance() RETURNS trigger LANGUAGE plpgsql SET search_path=public,pg_temp AS $$
DECLARE iid uuid; recorded integer; actual bigint;
BEGIN
 IF TG_TABLE_NAME='equipment_returns' THEN iid:=NEW.item_id; ELSE iid:=NEW.id; END IF;
 SELECT returned_quantity INTO recorded FROM equipment_checkout_items WHERE id=iid;
 SELECT coalesce(sum(quantity),0) INTO actual FROM equipment_returns WHERE item_id=iid;
 IF recorded<>actual THEN RAISE EXCEPTION 'Return ledger and checkout item disagree' USING ERRCODE='23514'; END IF;
 RETURN NULL;
END $$;
CREATE CONSTRAINT TRIGGER equipment_return_ledger_guard AFTER INSERT ON public.equipment_returns DEFERRABLE INITIALLY DEFERRED FOR EACH ROW EXECUTE FUNCTION public.equipment_assert_return_balance();
CREATE CONSTRAINT TRIGGER equipment_item_return_guard AFTER INSERT OR UPDATE ON public.equipment_checkout_items DEFERRABLE INITIALLY DEFERRED FOR EACH ROW EXECUTE FUNCTION public.equipment_assert_return_balance();
REVOKE ALL ON FUNCTION public.equipment_assert_return_balance() FROM PUBLIC,anon,authenticated;

CREATE FUNCTION public.equipment_mutate(p_action text,p_payload jsonb,p_actor text,p_request_id uuid,p_admin boolean DEFAULT false)
RETURNS jsonb LANGUAGE plpgsql SECURITY INVOKER SET search_path=public,pg_temp AS $$
DECLARE e equipment%ROWTYPE; old_e jsonb; c equipment_checkouts%ROWTYPE; i equipment_checkout_items%ROWTYPE;
 m equipment_maintenance%ROWTYPE; op equipment_operations%ROWTYPE; v jsonb; result jsonb; eid uuid;
 q integer; cond text; source text; target_id uuid; cat equipment_categories%ROWTYPE;
BEGIN
 IF nullif(trim(p_actor),'') IS NULL OR p_request_id IS NULL OR coalesce(p_payload->>'brand','pharadol')<>'pharadol' THEN
 RAISE EXCEPTION 'Invalid actor or brand' USING ERRCODE='42501'; END IF;
 -- Short module-only lock orders all stock/category/idempotency transitions consistently.
 -- No legacy business tables are locked. Sequence allocation itself is atomic.
 PERFORM pg_advisory_xact_lock(739210,1);
 SELECT * INTO op FROM equipment_operations WHERE request_id=p_request_id;
 IF FOUND THEN
  IF op.actor<>p_actor OR op.action<>p_action OR op.payload<>p_payload THEN RAISE EXCEPTION 'Idempotency conflict' USING ERRCODE='23514'; END IF;
  RETURN op.result;
 END IF;
 PERFORM set_config('equipment.actor',p_actor,true); PERFORM set_config('equipment.action',p_action,true);
 IF p_action IN ('category_save','archive','restore','maintenance_update','stock_adjust') AND NOT p_admin THEN
 RAISE EXCEPTION 'Administrator required' USING ERRCODE='42501'; END IF;
 IF p_action='category_save' THEN
  IF nullif(p_payload->>'id','') IS NULL THEN
   INSERT INTO equipment_categories(brand,name) VALUES('pharadol',p_payload->>'name') RETURNING to_jsonb(equipment_categories.*) INTO result;
  ELSE
   UPDATE equipment_categories SET name=p_payload->>'name',active=(p_payload->>'active')::boolean WHERE id=(p_payload->>'id')::uuid AND brand='pharadol' RETURNING to_jsonb(equipment_categories.*) INTO result;
   IF NOT FOUND THEN RAISE EXCEPTION 'Category not found' USING ERRCODE='P0002'; END IF;
  END IF;
 ELSIF p_action IN ('create','update') THEN
  SELECT * INTO cat FROM equipment_categories WHERE id=(p_payload->>'category_id')::uuid AND brand='pharadol';
  IF NOT FOUND THEN RAISE EXCEPTION 'Category not found' USING ERRCODE='23514'; END IF;
  IF p_action='create' THEN
   IF NOT cat.active THEN RAISE EXCEPTION 'Category is inactive' USING ERRCODE='23514'; END IF;
   q:=(p_payload->>'quantity')::integer; cond:=p_payload->>'initial_status';
   IF cond NOT IN ('available','damaged','retired') THEN RAISE EXCEPTION 'Use checkout or maintenance workflow for this status' USING ERRCODE='23514'; END IF;
   INSERT INTO equipment(brand,name,category_id,manufacturer,model,serial_number,description,quantity,available,damaged,retired,unit,storage_location,purchase_date,purchase_price,supplier,warranty_expiration,created_by,updated_by)
   VALUES('pharadol',p_payload->>'name',cat.id,p_payload->>'manufacturer',p_payload->>'model',nullif(p_payload->>'serial_number',''),p_payload->>'description',q,
    CASE WHEN cond='available' THEN q ELSE 0 END,CASE WHEN cond='damaged' THEN q ELSE 0 END,CASE WHEN cond='retired' THEN q ELSE 0 END,
    p_payload->>'unit',p_payload->>'storage_location',nullif(p_payload->>'purchase_date','')::date,(p_payload->>'purchase_price')::numeric,p_payload->>'supplier',nullif(p_payload->>'warranty_expiration','')::date,p_actor,p_actor) RETURNING * INTO e;
  ELSE
   SELECT * INTO e FROM equipment WHERE id=(p_payload->>'id')::uuid AND brand='pharadol' FOR UPDATE;
   IF NOT FOUND OR e.archived_at IS NOT NULL THEN RAISE EXCEPTION 'Equipment not found or archived' USING ERRCODE='P0002'; END IF;
   IF e.version<>(p_payload->>'version')::integer THEN RAISE EXCEPTION 'Equipment changed; reload before editing' USING ERRCODE='40001'; END IF;
   IF NOT cat.active AND cat.id<>e.category_id THEN RAISE EXCEPTION 'Category is inactive' USING ERRCODE='23514'; END IF;
   q:=(p_payload->>'quantity')::integer;
   IF q<>e.quantity AND NOT p_admin THEN RAISE EXCEPTION 'Administrator required to adjust quantity' USING ERRCODE='42501'; END IF;
   UPDATE equipment SET name=p_payload->>'name',category_id=cat.id,manufacturer=p_payload->>'manufacturer',model=p_payload->>'model',serial_number=nullif(p_payload->>'serial_number',''),description=p_payload->>'description',
    quantity=q,available=available+q-quantity,unit=p_payload->>'unit',storage_location=p_payload->>'storage_location',purchase_date=nullif(p_payload->>'purchase_date','')::date,purchase_price=(p_payload->>'purchase_price')::numeric,supplier=p_payload->>'supplier',warranty_expiration=nullif(p_payload->>'warranty_expiration','')::date,
    version=version+1,updated_at=now(),updated_by=p_actor WHERE id=e.id RETURNING * INTO e;
  END IF;
  result:=to_jsonb(e);
 ELSIF p_action IN ('archive','restore','stock_adjust') THEN
  SELECT * INTO e FROM equipment WHERE id=(p_payload->>'id')::uuid AND brand='pharadol' FOR UPDATE;
  IF NOT FOUND THEN RAISE EXCEPTION 'Equipment not found' USING ERRCODE='P0002'; END IF;
  IF p_action='archive' THEN
   IF e.in_use>0 OR e.maintenance>0 THEN RAISE EXCEPTION 'Outstanding checkout or maintenance prevents archive' USING ERRCODE='23514'; END IF;
   UPDATE equipment SET archived_at=now(),version=version+1,updated_by=p_actor,updated_at=now() WHERE id=e.id RETURNING * INTO e;
  ELSIF p_action='restore' THEN
   UPDATE equipment SET archived_at=NULL,version=version+1,updated_by=p_actor,updated_at=now() WHERE id=e.id RETURNING * INTO e;
  ELSE
   q:=(p_payload->>'quantity')::integer; source:=p_payload->>'source'; cond:=p_payload->>'condition';
   IF e.archived_at IS NOT NULL OR q<=0 OR source=cond OR source NOT IN ('available','damaged','retired') OR cond NOT IN ('available','damaged','retired') THEN RAISE EXCEPTION 'Invalid stock adjustment' USING ERRCODE='23514'; END IF;
   EXECUTE format('UPDATE public.equipment SET %I=%I-$1,%I=%I+$1,version=version+1,updated_at=now(),updated_by=$2 WHERE id=$3 RETURNING *',source,source,cond,cond) INTO e USING q,p_actor,e.id;
  END IF;
  result:=to_jsonb(e);
 ELSIF p_action='checkout' THEN
  IF jsonb_array_length(p_payload->'items') NOT BETWEEN 1 AND 100 THEN RAISE EXCEPTION 'Invalid checkout items' USING ERRCODE='23514'; END IF;
  INSERT INTO equipment_checkouts(brand,borrower,related_booking,checkout_date,expected_return_date,notes,created_by)
  VALUES('pharadol',p_payload->>'borrower',nullif(p_payload->>'related_booking',''),(p_payload->>'checkout_date')::date,(p_payload->>'expected_return_date')::date,p_payload->>'notes',p_actor) RETURNING * INTO c;
  FOR v IN SELECT value FROM jsonb_array_elements(p_payload->'items') LOOP
   q:=(v->>'quantity')::integer;
   SELECT * INTO e FROM equipment WHERE id=(v->>'equipment_id')::uuid AND brand='pharadol' FOR UPDATE;
   IF NOT FOUND OR e.archived_at IS NOT NULL OR q<=0 OR e.available<q THEN RAISE EXCEPTION 'Insufficient available quantity' USING ERRCODE='23514'; END IF;
   INSERT INTO equipment_checkout_items(brand,checkout_id,equipment_id,quantity) VALUES('pharadol',c.id,e.id,q);
   UPDATE equipment SET available=available-q,in_use=in_use+q,version=version+1,updated_at=now(),updated_by=p_actor WHERE id=e.id;
  END LOOP;
  result:=to_jsonb(c);
 ELSIF p_action='return' THEN
  SELECT * INTO i FROM equipment_checkout_items WHERE id=(p_payload->>'item_id')::uuid AND brand='pharadol' FOR UPDATE;
  IF NOT FOUND THEN RAISE EXCEPTION 'Checkout item not found' USING ERRCODE='P0002'; END IF;
  SELECT * INTO c FROM equipment_checkouts WHERE id=i.checkout_id;
  q:=(p_payload->>'quantity')::integer; cond:=p_payload->>'condition';
  IF q<=0 OR i.returned_quantity+q>i.quantity OR cond NOT IN ('available','damaged','maintenance') OR (p_payload->>'return_date')::date<c.checkout_date THEN RAISE EXCEPTION 'Invalid return quantity, condition or date' USING ERRCODE='23514'; END IF;
  SELECT * INTO e FROM equipment WHERE id=i.equipment_id AND brand='pharadol' FOR UPDATE;
  UPDATE equipment_checkout_items SET returned_quantity=returned_quantity+q WHERE id=i.id;
  INSERT INTO equipment_returns(brand,item_id,quantity,condition,return_date,notes,created_by)
   VALUES('pharadol',i.id,q,cond,(p_payload->>'return_date')::date,p_payload->>'notes',p_actor) RETURNING to_jsonb(equipment_returns.*) INTO result;
  UPDATE equipment SET in_use=in_use-q,available=available+CASE WHEN cond='available' THEN q ELSE 0 END,
   damaged=damaged+CASE WHEN cond='damaged' THEN q ELSE 0 END,maintenance=maintenance+CASE WHEN cond='maintenance' THEN q ELSE 0 END,
   version=version+1,updated_at=now(),updated_by=p_actor WHERE id=e.id;
  IF cond='maintenance' THEN
   INSERT INTO equipment_maintenance(brand,equipment_id,quantity,source_condition,issue,reported_date,notes,created_by)
    VALUES('pharadol',e.id,q,'damaged',coalesce(nullif(p_payload->>'notes',''),'ตรวจสอบอุปกรณ์ที่รับคืน'),(p_payload->>'return_date')::date,p_payload->>'notes',p_actor);
  END IF;
 ELSIF p_action='maintenance_create' THEN
  SELECT * INTO e FROM equipment WHERE id=(p_payload->>'equipment_id')::uuid AND brand='pharadol' FOR UPDATE;
  IF NOT FOUND OR e.archived_at IS NOT NULL THEN RAISE EXCEPTION 'Equipment not found or archived' USING ERRCODE='P0002'; END IF;
  q:=(p_payload->>'quantity')::integer; source:=p_payload->>'source';
  IF q<=0 OR source NOT IN ('available','damaged') THEN RAISE EXCEPTION 'Invalid maintenance quantity or source' USING ERRCODE='23514'; END IF;
  INSERT INTO equipment_maintenance(brand,equipment_id,quantity,source_condition,issue,reported_date,start_date,service_provider,notes,created_by)
   VALUES('pharadol',e.id,q,source,p_payload->>'issue',(p_payload->>'reported_date')::date,nullif(p_payload->>'start_date','')::date,p_payload->>'service_provider',p_payload->>'notes',p_actor) RETURNING to_jsonb(equipment_maintenance.*) INTO result;
  EXECUTE format('UPDATE public.equipment SET %I=%I-$1,maintenance=maintenance+$1,version=version+1,updated_at=now(),updated_by=$2 WHERE id=$3',source,source) USING q,p_actor,e.id;
 ELSIF p_action='maintenance_update' THEN
  SELECT * INTO m FROM equipment_maintenance WHERE id=(p_payload->>'id')::uuid AND brand='pharadol' FOR UPDATE;
  IF NOT FOUND THEN RAISE EXCEPTION 'Maintenance not found' USING ERRCODE='P0002'; END IF;
  IF m.status IN ('completed','cancelled') THEN RAISE EXCEPTION 'Maintenance already closed' USING ERRCODE='23514'; END IF;
  cond:=p_payload->>'status';
  IF cond NOT IN ('pending','in_progress','completed','cancelled') THEN RAISE EXCEPTION 'Invalid maintenance status' USING ERRCODE='23514'; END IF;
  IF cond IN ('completed','cancelled') THEN
   SELECT * INTO e FROM equipment WHERE id=m.equipment_id FOR UPDATE;
   source:=CASE WHEN cond='completed' THEN 'available' ELSE m.source_condition END;
   EXECUTE format('UPDATE public.equipment SET maintenance=maintenance-$1,%I=%I+$1,version=version+1,updated_at=now(),updated_by=$2 WHERE id=$3',source,source) USING m.quantity,p_actor,m.equipment_id;
  END IF;
  UPDATE equipment_maintenance SET status=cond,start_date=nullif(p_payload->>'start_date','')::date,completion_date=nullif(p_payload->>'completion_date','')::date,
   service_provider=p_payload->>'service_provider',cost=(p_payload->>'cost')::numeric,notes=p_payload->>'notes',confirmed_by=CASE WHEN cond='completed' THEN p_actor ELSE NULL END WHERE id=m.id RETURNING to_jsonb(equipment_maintenance.*) INTO result;
  INSERT INTO equipment_activity_logs(brand,equipment_id,action,actor,previous_value,new_value) VALUES('pharadol',m.equipment_id,p_action,p_actor,to_jsonb(m),result);
 ELSIF p_action='document_add' THEN
  SELECT * INTO e FROM equipment WHERE id=(p_payload->>'equipment_id')::uuid AND brand='pharadol' FOR UPDATE;
  IF NOT FOUND THEN RAISE EXCEPTION 'Equipment not found' USING ERRCODE='P0002'; END IF;
  IF p_payload->>'storage_path' NOT LIKE 'pharadol/'||e.id::text||'/%' THEN RAISE EXCEPTION 'Invalid document path' USING ERRCODE='23514'; END IF;
  IF nullif(p_payload->>'maintenance_id','') IS NOT NULL AND NOT EXISTS(SELECT 1 FROM equipment_maintenance WHERE id=(p_payload->>'maintenance_id')::uuid AND equipment_id=e.id AND brand='pharadol') THEN RAISE EXCEPTION 'Invalid maintenance reference' USING ERRCODE='23514'; END IF;
  INSERT INTO equipment_documents(brand,equipment_id,maintenance_id,kind,filename,mime_type,storage_path,size,created_by)
   VALUES('pharadol',e.id,nullif(p_payload->>'maintenance_id','')::uuid,p_payload->>'kind',p_payload->>'filename',p_payload->>'mime_type',p_payload->>'storage_path',(p_payload->>'size')::integer,p_actor) RETURNING to_jsonb(equipment_documents.*) INTO result;
  INSERT INTO equipment_activity_logs(brand,equipment_id,action,actor,new_value) VALUES('pharadol',e.id,p_action,p_actor,result);
 ELSE RAISE EXCEPTION 'Unknown equipment action' USING ERRCODE='23514';
 END IF;
 INSERT INTO equipment_operations(request_id,brand,actor,action,payload,result) VALUES(p_request_id,'pharadol',p_actor,p_action,p_payload,result);
 RETURN result;
END $$;

CREATE FUNCTION public.equipment_summary() RETURNS jsonb LANGUAGE sql STABLE SECURITY INVOKER SET search_path=public,pg_temp AS $$
 SELECT jsonb_build_object('quantity',coalesce(sum(quantity),0),'available',coalesce(sum(available),0),'in_use',coalesce(sum(in_use),0),
 'maintenance',coalesce(sum(maintenance),0),'damaged',coalesce(sum(damaged),0),'retired',coalesce(sum(retired),0),
 'purchase_value',coalesce(sum(purchase_price*quantity),0),'maintenance_expenses',
 (SELECT coalesce(sum(cost),0) FROM equipment_maintenance WHERE brand='pharadol'))
 FROM equipment WHERE brand='pharadol' AND archived_at IS NULL;
$$;

CREATE FUNCTION public.equipment_maintenance_total(p_equipment_id uuid) RETURNS numeric LANGUAGE sql STABLE SECURITY INVOKER SET search_path=public,pg_temp AS $$
 SELECT coalesce(sum(cost),0) FROM equipment_maintenance WHERE brand='pharadol' AND equipment_id=p_equipment_id;
$$;
REVOKE ALL ON FUNCTION public.equipment_maintenance_total(uuid) FROM PUBLIC,anon,authenticated;
GRANT EXECUTE ON FUNCTION public.equipment_maintenance_total(uuid) TO service_role;

CREATE FUNCTION public.equipment_return_history(p_equipment_id uuid,p_offset integer DEFAULT 0) RETURNS jsonb LANGUAGE sql STABLE SECURITY INVOKER SET search_path=public,pg_temp AS $$
 SELECT jsonb_build_object('total',(SELECT count(*) FROM equipment_returns r JOIN equipment_checkout_items i ON i.id=r.item_id AND i.brand=r.brand WHERE r.brand='pharadol' AND i.equipment_id=p_equipment_id),
 'rows',coalesce((SELECT jsonb_agg(to_jsonb(history)) FROM (
  SELECT r.*,c.checkout_code FROM equipment_returns r JOIN equipment_checkout_items i ON i.id=r.item_id AND i.brand=r.brand JOIN equipment_checkouts c ON c.id=i.checkout_id AND c.brand=i.brand
  WHERE r.brand='pharadol' AND i.equipment_id=p_equipment_id ORDER BY r.created_at DESC,r.id LIMIT 20 OFFSET greatest(0,p_offset)
 ) history),'[]'::jsonb));
$$;
REVOKE ALL ON FUNCTION public.equipment_return_history(uuid,integer) FROM PUBLIC,anon,authenticated;
GRANT EXECUTE ON FUNCTION public.equipment_return_history(uuid,integer) TO service_role;

-- Custom application sessions are NOT Supabase Auth JWTs. Deny direct browser access;
-- all access is authenticated/brand-authorized by the Equipment API using service_role.
DO $$ DECLARE t text; BEGIN
 FOREACH t IN ARRAY ARRAY['equipment_categories','equipment','equipment_checkouts','equipment_checkout_items','equipment_returns','equipment_maintenance','equipment_documents','equipment_activity_logs','equipment_operations'] LOOP
  EXECUTE format('ALTER TABLE public.%I ENABLE ROW LEVEL SECURITY',t);
  EXECUTE format('REVOKE ALL ON public.%I FROM PUBLIC,anon,authenticated',t);
  EXECUTE format('CREATE POLICY equipment_deny_client ON public.%I AS RESTRICTIVE FOR ALL TO anon,authenticated USING (false) WITH CHECK (false)',t);
  EXECUTE format('GRANT SELECT ON public.%I TO service_role',t);
 END LOOP;
END $$;
GRANT INSERT,UPDATE ON public.equipment,public.equipment_categories,public.equipment_checkout_items,public.equipment_maintenance TO service_role;
GRANT INSERT ON public.equipment_checkouts,public.equipment_returns,public.equipment_documents,public.equipment_activity_logs,public.equipment_operations TO service_role;
REVOKE ALL ON public.equipment_inventory FROM PUBLIC,anon,authenticated;
GRANT SELECT ON public.equipment_inventory TO service_role;
GRANT USAGE,SELECT ON SEQUENCE public.equipment_code_seq,public.equipment_checkout_code_seq,public.equipment_maintenance_code_seq,public.equipment_activity_logs_id_seq TO service_role;
REVOKE ALL ON FUNCTION public.equipment_mutate(text,jsonb,text,uuid,boolean),public.equipment_summary(),public.equipment_log_change(),public.equipment_immutable_history() FROM PUBLIC,anon,authenticated;
GRANT EXECUTE ON FUNCTION public.equipment_mutate(text,jsonb,text,uuid,boolean),public.equipment_summary() TO service_role;

INSERT INTO public.equipment_categories(brand,name) VALUES
 ('pharadol','Camera — กล้อง'),('pharadol','Lens — เลนส์'),('pharadol','Battery — แบตเตอรี่'),('pharadol','Memory Card — การ์ดบันทึกข้อมูล'),
 ('pharadol','Audio — อุปกรณ์เสียง'),('pharadol','Lighting — อุปกรณ์ไฟ'),('pharadol','Stabilizer — อุปกรณ์กันสั่น'),('pharadol','Monitor — จอมอนิเตอร์'),
 ('pharadol','Computer & Storage — คอมพิวเตอร์และอุปกรณ์จัดเก็บข้อมูล'),('pharadol','Accessories — อุปกรณ์เสริม'),('pharadol','Other — อื่น ๆ');
-- Private bucket only. No permissive policies are added to storage.objects.
INSERT INTO storage.buckets(id,name,public,file_size_limit,allowed_mime_types)
 VALUES('equipment-private','equipment-private',false,3145728,ARRAY['image/jpeg','image/png','image/webp','application/pdf']);
CREATE POLICY equipment_private_deny_clients ON storage.objects AS RESTRICTIVE FOR ALL TO anon,authenticated
 USING(bucket_id<>'equipment-private') WITH CHECK(bucket_id<>'equipment-private');
COMMIT;
