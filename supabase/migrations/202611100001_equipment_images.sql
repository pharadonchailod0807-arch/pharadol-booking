-- Equipment-only, additive. Existing inventory, ledgers, authentication and buckets are untouched.
BEGIN;
CREATE TABLE public.equipment_image_uploads (
 id uuid PRIMARY KEY, brand text NOT NULL DEFAULT 'pharadol' CHECK(brand='pharadol'),
 draft_id uuid NOT NULL, target_equipment_id uuid REFERENCES public.equipment(id), actor text NOT NULL,
 raw_path text NOT NULL UNIQUE, storage_path text NOT NULL UNIQUE, thumbnail_path text NOT NULL UNIQUE,
 filename text NOT NULL, original_size integer NOT NULL CHECK(original_size BETWEEN 1 AND 10485760),
 mime_type text NOT NULL CHECK(mime_type IN ('image/jpeg','image/png','image/webp')),
 status text NOT NULL DEFAULT 'pending' CHECK(status IN ('pending','processing','ready','attached','cancelled')),
 width integer, height integer, created_at timestamptz NOT NULL DEFAULT now(),
 expires_at timestamptz NOT NULL DEFAULT now()+interval '2 hours 10 minutes'
);
CREATE INDEX equipment_upload_expiry_idx ON public.equipment_image_uploads(expires_at);
CREATE INDEX equipment_upload_actor_idx ON public.equipment_image_uploads(actor,created_at);
CREATE TABLE public.equipment_images (
 id uuid PRIMARY KEY DEFAULT gen_random_uuid(), brand text NOT NULL DEFAULT 'pharadol' CHECK(brand='pharadol'),
 equipment_id uuid NOT NULL, bucket_id text NOT NULL DEFAULT 'equipment-images' CHECK(bucket_id IN ('equipment-images','equipment-private')),
 storage_path text NOT NULL, thumbnail_path text NOT NULL, filename text NOT NULL,
 is_cover boolean NOT NULL DEFAULT false, sort_order integer NOT NULL CHECK(sort_order BETWEEN 0 AND 4),
 created_by text NOT NULL, created_at timestamptz NOT NULL DEFAULT now(), deleted_at timestamptz,
 FOREIGN KEY(equipment_id,brand) REFERENCES public.equipment(id,brand), UNIQUE(bucket_id,storage_path),
 CHECK(deleted_at IS NULL OR NOT is_cover)
);
CREATE UNIQUE INDEX equipment_image_cover_idx ON public.equipment_images(equipment_id) WHERE is_cover AND deleted_at IS NULL;
CREATE UNIQUE INDEX equipment_image_order_idx ON public.equipment_images(equipment_id,sort_order) WHERE deleted_at IS NULL;
CREATE INDEX equipment_images_inventory_idx ON public.equipment_images(equipment_id,deleted_at);
-- Preserve legacy files and document records. At most five become gallery photos; others remain Documents.
INSERT INTO public.equipment_images(id,brand,equipment_id,bucket_id,storage_path,thumbnail_path,filename,is_cover,sort_order,created_by,created_at)
 SELECT id,brand,equipment_id,'equipment-private',storage_path,storage_path,filename,n=1,n-1,created_by,created_at FROM (
 SELECT d.*,row_number() OVER(PARTITION BY equipment_id ORDER BY (kind='image') DESC,created_at DESC,id)::integer n
 FROM public.equipment_documents d WHERE brand='pharadol' AND kind IN ('image','additional_image')
 ) legacy WHERE n<=5;
ALTER TABLE public.equipment_images ENABLE ROW LEVEL SECURITY;
ALTER TABLE public.equipment_image_uploads ENABLE ROW LEVEL SECURITY;
REVOKE ALL ON public.equipment_images,public.equipment_image_uploads FROM PUBLIC,anon,authenticated;
CREATE POLICY equipment_images_deny_clients ON public.equipment_images AS RESTRICTIVE FOR ALL TO anon,authenticated USING(false) WITH CHECK(false);
CREATE POLICY equipment_uploads_deny_clients ON public.equipment_image_uploads AS RESTRICTIVE FOR ALL TO anon,authenticated USING(false) WITH CHECK(false);
GRANT SELECT,INSERT,UPDATE ON public.equipment_images TO service_role;
GRANT SELECT,INSERT,UPDATE,DELETE ON public.equipment_image_uploads TO service_role;

CREATE FUNCTION public.equipment_image_cancel(p_id uuid,p_actor text) RETURNS jsonb
LANGUAGE plpgsql SECURITY INVOKER SET search_path=public,pg_temp AS $$
DECLARE u equipment_image_uploads%ROWTYPE;
BEGIN
 PERFORM pg_advisory_xact_lock(739210,1);
 UPDATE equipment_image_uploads SET status='cancelled' WHERE id=p_id AND actor=p_actor AND status<>'attached' RETURNING * INTO u;
 IF NOT FOUND THEN RETURN NULL; END IF;
 RETURN to_jsonb(u);
END $$;

CREATE FUNCTION public.equipment_save_images(p_action text,p_payload jsonb,p_actor text,p_request_id uuid,p_admin boolean DEFAULT false)
RETURNS jsonb LANGUAGE plpgsql SECURITY INVOKER SET search_path=public,pg_temp AS $$
DECLARE manifest jsonb:=p_payload->'image_manifest'; ids uuid[]; cover uuid; draft uuid; eid uuid;
 result jsonb; u equipment_image_uploads%ROWTYPE; old_images jsonb; pos integer:=0; image_id uuid;
BEGIN
 IF p_action NOT IN ('create','update') OR jsonb_typeof(manifest->'ids')<>'array' OR jsonb_array_length(manifest->'ids')>5 THEN
  RAISE EXCEPTION 'Invalid image manifest' USING ERRCODE='23514';
 END IF;
 ids:=ARRAY(SELECT value::uuid FROM jsonb_array_elements_text(manifest->'ids'));
 IF cardinality(ids)<>(SELECT count(DISTINCT x) FROM unnest(ids) x) THEN RAISE EXCEPTION 'Duplicate image' USING ERRCODE='23514'; END IF;
 draft:=(manifest->>'draft_id')::uuid; cover:=nullif(manifest->>'cover_id','')::uuid;
 IF cardinality(ids)>0 AND (cover IS NULL OR NOT cover=ANY(ids)) THEN RAISE EXCEPTION 'Invalid cover image' USING ERRCODE='23514'; END IF;
 IF draft IS NULL THEN RAISE EXCEPTION 'Missing image draft' USING ERRCODE='23514'; END IF;
 PERFORM pg_advisory_xact_lock(739210,1);
 -- The complete manifest is included in equipment_mutate's idempotency comparison.
 IF EXISTS(SELECT 1 FROM equipment_operations WHERE request_id=p_request_id) THEN
  RETURN equipment_mutate(p_action,p_payload,p_actor,p_request_id,p_admin);
 END IF;
 result:=equipment_mutate(p_action,p_payload,p_actor,p_request_id,p_admin); eid:=(result->>'id')::uuid;
 SELECT coalesce(jsonb_agg(to_jsonb(i) ORDER BY sort_order),'[]'::jsonb) INTO old_images FROM equipment_images i WHERE equipment_id=eid AND deleted_at IS NULL;
 FOREACH image_id IN ARRAY ids LOOP
  IF EXISTS(SELECT 1 FROM equipment_images WHERE id=image_id AND equipment_id=eid AND brand='pharadol' AND deleted_at IS NULL) THEN CONTINUE; END IF;
  SELECT * INTO u FROM equipment_image_uploads WHERE id=image_id FOR UPDATE;
  IF NOT FOUND OR u.actor<>p_actor OR u.draft_id<>draft OR u.status<>'ready' OR u.expires_at<=now()
   OR (u.target_equipment_id IS NOT NULL AND u.target_equipment_id<>eid) THEN
   RAISE EXCEPTION 'Image not ready, expired or belongs to another session' USING ERRCODE='42501';
  END IF;
 END LOOP;
 -- Deactivate before assigning positions to allow swaps without transient uniqueness failures.
 UPDATE equipment_images SET deleted_at=now(),is_cover=false WHERE equipment_id=eid AND deleted_at IS NULL;
 FOREACH image_id IN ARRAY ids LOOP
  UPDATE equipment_images SET deleted_at=NULL,is_cover=(id=cover),sort_order=pos WHERE id=image_id AND equipment_id=eid;
  IF NOT FOUND THEN
   SELECT * INTO u FROM equipment_image_uploads WHERE id=image_id;
   INSERT INTO equipment_images(id,equipment_id,storage_path,thumbnail_path,filename,is_cover,sort_order,created_by)
    VALUES(u.id,eid,u.storage_path,u.thumbnail_path,u.filename,u.id=cover,pos,p_actor);
   UPDATE equipment_image_uploads SET status='attached' WHERE id=image_id;
  END IF;
  pos:=pos+1;
 END LOOP;
 INSERT INTO equipment_activity_logs(brand,equipment_id,action,actor,previous_value,new_value)
 SELECT 'pharadol',eid,'images_save',p_actor,old_images,coalesce(jsonb_agg(to_jsonb(i) ORDER BY sort_order),'[]'::jsonb)
 FROM equipment_images i WHERE equipment_id=eid AND deleted_at IS NULL;
 RETURN result;
END $$;
REVOKE ALL ON FUNCTION public.equipment_image_cancel(uuid,text),public.equipment_save_images(text,jsonb,text,uuid,boolean) FROM PUBLIC,anon,authenticated;
GRANT EXECUTE ON FUNCTION public.equipment_image_cancel(uuid,text),public.equipment_save_images(text,jsonb,text,uuid,boolean) TO service_role;
INSERT INTO storage.buckets(id,name,public,file_size_limit,allowed_mime_types)
 VALUES('equipment-images','equipment-images',false,10485760,ARRAY['image/jpeg','image/png','image/webp']);
-- Signed uploads are scoped capabilities issued by the authorized server, never ordinary browser grants.
CREATE POLICY equipment_images_private_deny_clients ON storage.objects AS RESTRICTIVE FOR ALL TO anon,authenticated
 USING(bucket_id<>'equipment-images') WITH CHECK(bucket_id<>'equipment-images');
COMMIT;
