-- Apply after the existing PHARADOL Equipment migration. This bridge uses its public write contract.
BEGIN;
CREATE TABLE public.purchase_equipment_links (
  requisition_id uuid NOT NULL REFERENCES public.purchase_requisitions(id),
  item_id uuid NOT NULL,
  equipment_id uuid NOT NULL REFERENCES public.equipment(id),
  linked_at timestamptz NOT NULL DEFAULT now(),
  PRIMARY KEY (requisition_id,item_id),
  FOREIGN KEY (requisition_id,item_id) REFERENCES public.purchase_requisition_items(requisition_id,id)
);
ALTER TABLE public.purchase_equipment_links ENABLE ROW LEVEL SECURITY;
REVOKE ALL ON public.purchase_equipment_links FROM PUBLIC,anon,authenticated,service_role;
GRANT SELECT ON public.purchase_equipment_links TO service_role;

CREATE FUNCTION public.purchase_into_equipment(p_id uuid,p_actor text,p_items jsonb)
RETURNS jsonb LANGUAGE plpgsql SECURITY DEFINER SET search_path=public, pg_temp AS $$
DECLARE
  r purchase_requisitions;
  i purchase_requisition_items;
  entry jsonb;
  e equipment;
  p purchase_payments;
  created jsonb;
  matches uuid[];
BEGIN
  SELECT * INTO r FROM purchase_requisitions WHERE id=p_id AND brand='pharadol' FOR UPDATE;
  IF NOT FOUND THEN RAISE EXCEPTION 'ไม่พบเอกสาร' USING ERRCODE='P0002'; END IF;
  IF r.status<>'completed' THEN RAISE EXCEPTION 'บันทึกการจัดซื้อให้เสร็จก่อนเพิ่มเข้าคลัง' USING ERRCODE='23514'; END IF;
  SELECT * INTO STRICT p FROM purchase_payments WHERE requisition_id=p_id AND status='accepted';
  PERFORM pg_advisory_xact_lock(739210,1); -- same lock as equipment_mutate
  FOR entry IN SELECT * FROM jsonb_array_elements(p_items) LOOP
    SELECT * INTO i FROM purchase_requisition_items WHERE requisition_id=p_id AND id=(entry->>'item_id')::uuid;
    IF NOT FOUND THEN RAISE EXCEPTION 'ไม่พบรายการสินค้า' USING ERRCODE='P0002'; END IF;
    CONTINUE WHEN EXISTS (SELECT 1 FROM purchase_equipment_links WHERE requisition_id=p_id AND item_id=i.id);
    SELECT array_agg(id) INTO matches FROM equipment WHERE brand='pharadol' AND (
      lower(trim(name))=lower(trim(i.name)) OR
      (nullif(entry->>'serial_number','') IS NOT NULL AND lower(serial_number)=lower(entry->>'serial_number')));
    IF entry->>'equipment_id' IS NOT NULL THEN
      SELECT * INTO e FROM equipment WHERE id=(entry->>'equipment_id')::uuid AND brand='pharadol' AND archived_at IS NULL;
      IF NOT FOUND OR NOT coalesce(e.id=ANY(matches),false) THEN
        RAISE EXCEPTION 'เลือกรายการเดิมที่ตรงกับสินค้าหรือ Serial Number' USING ERRCODE='23514';
      END IF;
    ELSE
      IF (nullif(entry->>'serial_number','') IS NULL AND matches IS NOT NULL) OR EXISTS(
        SELECT 1 FROM equipment WHERE brand='pharadol' AND lower(serial_number)=lower(entry->>'serial_number')
      ) THEN
        RAISE EXCEPTION 'พบอุปกรณ์หรือ Serial Number ในคลังแล้ว กรุณาตรวจสอบรายการเดิม' USING ERRCODE='23505';
      END IF;
      IF i.quantity<>trunc(i.quantity) OR i.quantity>1000000 OR
        (nullif(entry->>'serial_number','') IS NOT NULL AND i.quantity<>1) THEN
        RAISE EXCEPTION 'คลังรองรับจำนวนเต็ม และหนึ่งชิ้นต่อ Serial Number' USING ERRCODE='23514';
      END IF;
      created := equipment_mutate('create',jsonb_build_object(
        'brand','pharadol','name',i.name,'category_id',entry->>'category_id','manufacturer','','model','',
        'serial_number',coalesce(entry->>'serial_number',''),'description',i.description,
        'quantity',i.quantity::integer,'unit',i.unit,'purchase_date',p.purchased_on,'purchase_price',entry->>'unit_price',
        'supplier',p.vendor,'storage_location','','warranty_expiration','','initial_status','available'
      ),p_actor,gen_random_uuid(),false);
      SELECT * INTO STRICT e FROM equipment WHERE id=(created->>'id')::uuid;
    END IF;
    INSERT INTO purchase_equipment_links(requisition_id,item_id,equipment_id) VALUES(p_id,i.id,e.id);
    INSERT INTO purchase_audit_logs(requisition_id,brand,actor,action,detail)
    VALUES(p_id,r.brand,p_actor,'equipment_linked',jsonb_build_object(
      'item_id',i.id,'equipment_id',e.id,'equipment_code',e.equipment_code,'existing',entry->>'equipment_id' IS NOT NULL));
  END LOOP;
  RETURN coalesce((SELECT jsonb_agg(jsonb_build_object('item_id',l.item_id,'equipment_id',l.equipment_id,'code',stock.equipment_code))
    FROM purchase_equipment_links l JOIN equipment stock ON stock.id=l.equipment_id WHERE l.requisition_id=p_id),'[]'::jsonb);
END $$;

CREATE FUNCTION public.purchase_equipment_options(p_id uuid,p_serial text DEFAULT '')
RETURNS jsonb LANGUAGE sql STABLE SET search_path=public, pg_temp AS $$
  SELECT jsonb_build_object(
    'categories',coalesce((SELECT jsonb_agg(jsonb_build_object('id',id,'name',name) ORDER BY name)
      FROM equipment_categories WHERE brand='pharadol' AND active),'[]'::jsonb),
    'matches',coalesce((SELECT jsonb_agg(jsonb_build_object('id',e.id,'name',e.name,'code',e.equipment_code,
      'serial',e.serial_number,'archived',e.archived_at IS NOT NULL,'item_id',i.id))
      FROM purchase_requisition_items i JOIN equipment e ON e.brand='pharadol'
        AND (lower(trim(e.name))=lower(trim(i.name)) OR (p_serial<>'' AND lower(e.serial_number)=lower(p_serial)))
      WHERE i.requisition_id=p_id),'[]'::jsonb),
    'links',coalesce((SELECT jsonb_agg(jsonb_build_object('item_id',l.item_id,'equipment_id',l.equipment_id,'code',e.equipment_code))
      FROM purchase_equipment_links l JOIN equipment e ON e.id=l.equipment_id WHERE l.requisition_id=p_id),'[]'::jsonb)
  )
  FROM purchase_requisitions r WHERE r.id=p_id AND r.brand='pharadol' AND r.status='completed'
$$;

REVOKE ALL ON FUNCTION public.purchase_into_equipment(uuid,text,jsonb),public.purchase_equipment_options(uuid,text)
  FROM PUBLIC,anon,authenticated;
GRANT EXECUTE ON FUNCTION public.purchase_into_equipment(uuid,text,jsonb),public.purchase_equipment_options(uuid,text) TO service_role;
COMMIT;
