-- Read-only logical backup for the verified Pharadol project. Export the result as CSV.
-- Contains private business records: keep the exported file outside the repository.
WITH tables AS (
 SELECT c.oid,c.relname,c.relrowsecurity,c.relforcerowsecurity
 FROM pg_class c JOIN pg_namespace n ON n.oid=c.relnamespace WHERE n.nspname='public' AND c.relkind='r'
), columns AS (
 SELECT t.relname,jsonb_agg(jsonb_build_object('name',a.attname,'type',format_type(a.atttypid,a.atttypmod),'not_null',a.attnotnull,'identity',a.attidentity,'generated',a.attgenerated,'default',pg_get_expr(d.adbin,d.adrelid)) ORDER BY a.attnum) cols
 FROM tables t JOIN pg_attribute a ON a.attrelid=t.oid LEFT JOIN pg_attrdef d ON d.adrelid=a.attrelid AND d.adnum=a.attnum WHERE a.attnum>0 AND NOT a.attisdropped GROUP BY t.relname
)
SELECT jsonb_build_object(
 'format','pharadol-public-logical-v1','captured_at',now(),'server_version',current_setting('server_version'),
 'tables',(SELECT jsonb_agg(jsonb_build_object('name',t.relname,'rls',t.relrowsecurity,'force_rls',t.relforcerowsecurity,'columns',c.cols) ORDER BY t.relname) FROM tables t JOIN columns c USING(relname)),
 'constraints',(SELECT coalesce(jsonb_agg(jsonb_build_object('table',t.relname,'name',x.conname,'definition',pg_get_constraintdef(x.oid,true))),'[]'::jsonb) FROM pg_constraint x JOIN tables t ON t.oid=x.conrelid),
 'functions',(SELECT coalesce(jsonb_agg(pg_get_functiondef(p.oid)),'[]'::jsonb) FROM pg_proc p JOIN pg_namespace n ON n.oid=p.pronamespace WHERE n.nspname='public' AND p.prokind IN ('f','p') AND NOT EXISTS(SELECT 1 FROM pg_depend d WHERE d.classid='pg_proc'::regclass AND d.objid=p.oid AND d.deptype='e')),
 'indexes',(SELECT coalesce(jsonb_agg(pg_get_indexdef(i.indexrelid)),'[]'::jsonb) FROM pg_index i JOIN tables t ON t.oid=i.indrelid WHERE NOT EXISTS(SELECT 1 FROM pg_constraint c WHERE c.conindid=i.indexrelid)),
 'triggers',(SELECT coalesce(jsonb_agg(pg_get_triggerdef(g.oid,true)),'[]'::jsonb) FROM pg_trigger g JOIN tables t ON t.oid=g.tgrelid WHERE NOT g.tgisinternal),
 'sequences',(SELECT coalesce(jsonb_agg(to_jsonb(s)),'[]'::jsonb) FROM pg_sequences s WHERE schemaname='public'),
 'policies',(SELECT coalesce(jsonb_agg(to_jsonb(p)),'[]'::jsonb) FROM pg_policies p WHERE schemaname='public'),
 'grants',(SELECT coalesce(jsonb_agg(to_jsonb(g)),'[]'::jsonb) FROM information_schema.table_privileges g WHERE table_schema='public'),
 'storage_policies',(SELECT coalesce(jsonb_agg(to_jsonb(p)),'[]'::jsonb) FROM pg_policies p WHERE schemaname='storage' AND tablename='objects'),
 'storage_buckets',(SELECT coalesce(jsonb_agg(to_jsonb(b)),'[]'::jsonb) FROM storage.buckets b),
 'data_xml',query_to_xml((SELECT string_agg(format('SELECT %L AS table_name,coalesce(jsonb_agg(to_jsonb(t)),''[]''::jsonb)::text AS data FROM public.%I t',relname,relname),' UNION ALL ' ORDER BY relname) FROM tables),true,false,'')::text
)::text AS backup_json;
