# Pharadol Equipment Management

สถานะ: พัฒนาและทดสอบแล้ว ติดตั้ง Migration บน Supabase จริงแล้ววันที่ 10 พฤศจิกายน 2569; บันทึก Secret เฉพาะ Vercel Production แล้ว กำลังเผยแพร่โค้ดผ่าน main

## ฟังก์ชัน

- เส้นทาง `/pharadol/equipment` และเมนู Equipment / คลังอุปกรณ์เฉพาะ Pharadol
- Overview 6 การ์ด นับจำนวนชิ้นจริงและมูลค่าซื้อต่อหน่วยคูณจำนวน ไม่ใช่จำนวนแถว; ค่าซ่อมแสดงแยก
- คลังอุปกรณ์ ค้นหา หมวดหมู่ สถานะ เรียงขึ้น/ลง 6 แบบ แบ่งหน้า และมุมมอง Mobile
- เพิ่ม/แก้ไขอุปกรณ์ ข้อมูลซื้อ ประกัน ที่จัดเก็บ Serial Number และไฟล์แนบส่วนตัว
- Serial Number หนึ่งหมายเลขต่อหนึ่งแถว จำนวน 1; อุปกรณ์แบบรวมจัดเก็บจำนวนทุกสถานะแยกกัน
- เบิกหลายรายการ รับคืนบางส่วน รับคืนปกติ/ชำรุด/ส่งซ่อม และแสดงยอดค้าง
- ประวัติซ่อม ค่าใช้จ่าย ผู้ให้บริการ สถานะ และเอกสารการซ่อม; ผู้ดูแลยืนยันก่อนกลับเป็น Available
- หมวดหมู่เริ่มต้น 11 หมวด เพิ่ม/เปลี่ยนชื่อ/ปิดใช้งาน โดยไม่ลบประวัติ
- Archive / Restore พร้อมยืนยัน และป้องกัน Archive ขณะค้างเบิกหรือซ่อม
- Activity Log เก็บผู้ทำรายการ เวลา ค่าก่อนและหลัง; ไม่เปิด API ลบประวัติ
- Excel และ PDF ภาษาไทย ตามตัวกรองปัจจุบัน; PDF ฝัง Noto Sans Thai พร้อมใบอนุญาต OFL
- Loading / Empty / Error / Retry; อัปเดตหลังทำรายการและ polling ทุก 30 วินาทีเมื่อเปิดหน้า

## การออกแบบฐานข้อมูลและความปลอดภัย

Migration: `supabase/migrations/202611090001_equipment.sql`

สร้างตารางใหม่ 9 ตาราง:

1. `equipment_categories`
2. `equipment`
3. `equipment_checkouts`
4. `equipment_checkout_items`
5. `equipment_returns`
6. `equipment_maintenance`
7. `equipment_documents`
8. `equipment_activity_logs`
9. `equipment_operations` — บันทึก idempotency ของคำขอ

สร้าง view `equipment_inventory`, sequences สำหรับ EQ/CO/MT, RPC `equipment_mutate`, `equipment_summary`, `equipment_maintenance_total`, `equipment_return_history` และ trigger สำหรับประวัติ/ความถูกต้องของยอด

- ไม่ ALTER ตาราง Booking/Calendar/Customer/Finance/Auth เดิม ไม่สร้างอุปกรณ์ตัวอย่าง
- มี PK, composite FK รวม brand, unique code/serial, constraint จำนวนไม่ติดลบและผลรวมทุกสถานะเท่าจำนวนทั้งหมด
- Deferred constraint triggers ตรวจยอด In Use ตรงกับใบเบิกค้าง ยอด Maintenance ตรงกับงานซ่อมเปิด และยอดคืนตรงกับประวัติรับคืนเมื่อ commit
- Sequence ออกรหัสอย่างปลอดภัยเมื่อทำพร้อมกัน (รหัสอาจมีช่องว่างหลัง rollback ซึ่งเป็นพฤติกรรมปกติ)
- RPC ทำทุกการเปลี่ยนยอดและการบันทึกประวัติใน transaction เดียว; module advisory lock จัดลำดับการเขียนของ Pharadol ป้องกันการแข่งขันและ deadlock ระหว่างหลายรายการ โดยไม่ล็อกตารางระบบอื่น
- Idempotency key เดิม/actor เดิม/payload เดิมไม่ตัดสต็อกซ้ำ; payload ที่เปลี่ยนต้องใช้ key ใหม่
- Optimistic version ป้องกันแก้ไขทับข้อมูลใหม่ของผู้ใช้อื่น
- Authentication ใช้ `booking_session` และการตรวจ session revocation เดิม; Equipment ต้องมี AUTH_SECRET ส่วนตัวอย่างน้อย 32 ตัวอักษร และไม่ยอมใช้ public anon key เป็น signing secret
- RLS + REVOKE ปิด anon และ Supabase authenticated ทั้งตาราง view และ RPC; เว็บไซต์ใช้ custom session ไม่ใช่ Supabase Auth JWT จึงเข้าข้อมูลผ่าน Equipment API ที่ตรวจสิทธิ์และใช้ service_role เท่านั้น
- สิทธิ์อ่าน: SUPER_ADMIN / BRAND_ADMIN / MANAGER / STAFF / VIEWER ที่เข้าถึง Pharadol; สิทธิ์เขียน: ทุกบทบาทข้างต้นยกเว้น VIEWER; สิทธิ์จัดหมวดหมู่/Archive/Restore/ปรับจำนวน/เปลี่ยนสถานะ/ตรวจรับงานซ่อม: SUPER_ADMIN / BRAND_ADMIN / MANAGER
- รองรับ explicit `equipment.view`, `equipment.write`, `equipment.admin` และ deniedPermissions ของระบบเดิม โดยไม่แก้ permission matrix ของระบบอื่น
- Private bucket `equipment-private`, จำกัดชนิด/ขนาดและตรวจ file signature; restrictive Storage policy ห้าม browser เข้า bucket นี้แม้มี legacy policy ที่ permissive โดยไม่ปิด bucket อื่น
- ดาวน์โหลดผ่าน API ที่ตรวจ session/brand ทุกครั้ง; ไม่มี public URL ของใบเสร็จหรือ Serial Number
- Related Booking เป็นข้อความอ้างอิงที่ผู้ใช้ระบุเอง ไม่อ่านหรือแก้ไข Booking เดิม และไม่ยืนยันว่าเลขใบจองนั้นมีอยู่

## ไฟล์ที่เพิ่มและแก้ไข

- `app/pharadol/equipment/{page.tsx,EquipmentManager.tsx,ui.tsx,forms.tsx,detail.tsx}`
- `app/api/equipment/route.ts`, `app/api/equipment/files/route.ts`, `app/api/equipment/export/route.ts`
- `lib/equipment/{types.ts,validation.ts,access.ts,server.ts,session.ts,export.ts}`
- `supabase/migrations/202611090001_equipment.sql`
- `public/equipment/{NotoSansThai.ttf,OFL.txt}`
- `tests/equipment/{database.test.mjs,validation.test.mjs}`
- `scripts/equipment-{test-db,test-api,browser-test,preflight,backup}.mjs`
- `tsconfig.json` แทน `jsconfig.json` โดยคง path alias เดิมและไม่เปิด checkJs สำหรับระบบเดิม
- `package.json`, `package-lock.json`: server-only, TypeScript/types และ dependencies สำหรับ PostgreSQL ทดสอบ (dev only)
- `app/components/BrandAppShell.js`: เพิ่มไอคอนและเมนูเฉพาะเมื่อ brandId เป็น pharadol เท่านั้น
- `next.config.mjs`: เพิ่ม file tracing เฉพาะ Equipment PDF route สำหรับฟอนต์ไทยและ Chromium pack เดิม

ไฟล์อื่นที่มีการแก้ไขค้างอยู่ก่อนเริ่มงานนี้ถูกเก็บไว้ ไม่ควร commit ทุกไฟล์ใน working tree รวมกันโดยไม่ได้ตรวจทาน

## การทดสอบและหลักฐาน

```sh
npm test
npx tsc --noEmit
npm run lint
npm run build
node scripts/equipment-browser-test.mjs
node scripts/equipment-preflight.mjs
```

- ชุด unit/integration ทั้งโปรเจกต์ผ่าน 47 tests ใน working tree เดิม; ชุด release ที่แยกจาก Production ล่าสุดผ่าน 40 tests รวม regression เดิม 11 tests และ Equipment/browser entrypoint 29 tests
- PostgreSQL ทดสอบเป็น native embedded PostgreSQL ใน temporary directory ไม่ใช่ Production; ใช้หลาย connection จริงสำหรับ concurrent create/checkout/return/idempotent retry
- ครอบคลุม create/serial/duplicate/negative quantity, edit/version, multi-item checkout/oversell/rollback, partial/full/double/concurrent return, damaged return, maintenance/confirmation/cancellation/cost, Archive/Restore, categories, brand isolation, immutable logs, RLS และ Storage policies
- Browser/API checks 12 ชุด: สิทธิ์/CSRF, create/search/filter/sort/pagination, checkout/partial return/maintenance/details, XLSX, PDF, private attachments, Desktop, browser form -> API -> PostgreSQL -> table, Mobile 390px, ไม่มีเมนูใน Adisorn
- Browser test ใช้ Supabase SDK จริงเรียก test-only HTTP adapter ที่ส่งต่อไปยัง PostgreSQL ทดสอบ; adapter จำลอง PostgREST/Storage protocol เท่านั้น ไม่ได้อ้างว่าแทนการทดสอบ Supabase จริงทั้งหมด
- ภาพตรวจสอบอยู่ `/tmp/pharadol-equipment-qa/`; PDF ผ่านการ render และตรวจข้อความภาษาไทยแล้ว
- จำเป็นต้องทำ smoke test กับ Supabase staging และ Vercel ก่อนยืนยันความพร้อม Production โดยเฉพาะ PostgREST relationship/schema cache และ Chromium บน Linux

เครื่องมือสำรองเฉพาะการติดตั้งนี้: `node scripts/equipment-backup.mjs` จาก working tree เดิม หลังตั้ง SUPABASE_DB_URL; เก็บ archive ไว้นอก repository พร้อม checksum และตรวจรายการ object โดยไม่แสดง credentials ต้องทดสอบ restore แยกก่อน Migration

## ข้อจำกัดที่ตั้งใจไว้

- อุปกรณ์มี Serial Number ต้องบันทึกแยกชิ้น; ไม่มีการ import serial หลายชิ้นในครั้งเดียว
- สถานะ In Use และ Maintenance ต้องเปลี่ยนผ่านการเบิกหรือส่งซ่อม เพื่อรักษาหลักฐาน ไม่ตั้งจำนวนสถานะเหล่านี้ตรง ๆ ในฟอร์มเพิ่มอุปกรณ์
- รองรับ JPEG, PNG, WebP, PDF สูงสุด 3 MB ต่อไฟล์ เพื่ออยู่ภายในขีดจำกัด request ของ Vercel
- Excel สูงสุด 10,000 แถว, PDF สูงสุด 2,000 แถวต่อครั้ง; มากกว่านั้นต้องใช้ตัวกรอง แทนการตัดข้อมูลโดยไม่แจ้ง
- ประวัติ/เอกสารแบ่งหน้า 20 รายการ; Overview แสดงรูปภาพล่าสุดไม่เกิน 20 รูป และดูไฟล์ที่เหลือได้ใน Documents
- การเขียน Equipment ของ Pharadol เรียงผ่าน module lock เพื่อความถูกต้อง; หากมีปริมาณเขียนสูงมาก ควรวัด throughput ก่อนเปลี่ยนเป็น row locks ที่รักษาลำดับแบบเดียวกัน
- ไม่มี Estimated Current Value (เป็น optional); มูลค่าที่แสดงคือมูลค่าซื้อ
- ไม่ได้แก้ช่องโหว่ dependency เดิมนอกขอบเขตงาน: npm audit ระหว่างติดตั้งรายงาน 35 รายการ จึงไม่ได้รัน audit fix ที่อาจอัปเกรดระบบอื่น

## ขั้นตอนเปิดใช้งานจริง

1. ติดตั้งและเชื่อมต่อ Supabase plugin กับโปรเจกต์ที่ถูกต้อง หรือใช้ SQL Editor/CLI ของผู้ดูแลที่มีสิทธิ์ ก่อน apply ต้องตรวจ schema จริงว่าไม่มีชื่อชนกับตาราง Equipment ที่อาจมีอยู่แล้ว
2. สำรองฐานข้อมูลตาม workflow เดิมและทดสอบ restore ตาม `DEPLOYMENT.md` ก่อนปล่อย Production
3. รัน Migration นี้หนึ่งครั้งบน staging ก่อน ใน SQL Editor หรือ migration workflow ที่มีอยู่; Migration เป็น transaction เดียว ถ้าชื่อชนหรือคำสั่งใดผิดพลาดต้อง rollback ทั้งหมด ห้ามแก้ตารางเดิมเพื่อฝืนติดตั้ง
4. ตั้งค่า server environment โดยไม่ใส่ secret ในโค้ด/แชต:
   - `SUPABASE_SERVICE_ROLE_KEY`: secret service role ของ Supabase โปรเจกต์เป้าหมาย ใส่ใน Vercel Project -> Settings -> Environment Variables (Production และ Preview ต้องใช้ฐานข้อมูลคนละสภาพแวดล้อม)
   - `NEXT_PUBLIC_SUPABASE_URL`, `NEXT_PUBLIC_SUPABASE_ANON_KEY`: ใช้ค่าของฐานข้อมูลที่สัมพันธ์กับ key ข้างต้น
   - `AUTH_SECRET`: ใช้ค่าปลอดภัยเดิมของระบบ (อย่างน้อย 32 ตัวอักษร) ห้ามหมุนหรือเปลี่ยนค่า Production เพื่อ Equipment โดยไม่จำเป็น เพราะจะกระทบ session เดิม
   - ไม่ต้องเพิ่มชื่อ environment variable ใหม่อื่น
5. `node scripts/equipment-preflight.mjs` ต้องผ่าน ตรวจ RPC ตาราง และ private bucket แบบ read-only
6. ใช้ Preview ที่เชื่อม staging เพื่อทดสอบครบวงจร ตรวจไฟล์ภาษาไทย/รูป/สิทธิ์ทั้งสองแบรนด์ และยืนยัน Vercel Function bundle มี font/Chromium pack (มาจาก postinstall เดิม)
7. ตรวจ Git diff และ stage เฉพาะงานนี้อย่างระวัง เนื่องจากมีงานเดิมค้างอยู่หลายไฟล์ แล้วจึง commit/push ตาม workflow เดิม
8. หลังผ่าน staging และสำรองแล้วจึง apply additive Migration บน Production, ตรวจ preflight และ deploy; ห้ามสร้างอุปกรณ์ทดสอบใน Production
9. ตรวจ Deployment status เป็น READY และ smoke test แบบอ่านข้อมูลจริง ก่อนอ้างว่า deploy สำเร็จ

Rollback: ย้อน code deployment ไปก่อนมี Equipment แล้วเก็บตาราง/Storage ของโมดูลไว้ เพื่อรักษาประวัติ; ไม่ drop ตารางหรือไฟล์อัตโนมัติ ไม่มี migration ย้อนกลับที่ลบข้อมูล

## สถานะ Environment / Deploy ที่ตรวจพบ

- Vercel project `booking-management-studio` มี AUTH_SECRET และ Supabase URL/anon key เดิม; บันทึก `SUPABASE_SERVICE_ROLE_KEY` เป็น Secret เฉพาะ Production หลังผู้ใช้ยืนยันแล้ว ไม่เพิ่มใน Preview/Development และไม่เปลี่ยน AUTH_SECRET
- เตรียมชุด release แยกที่ `/Users/bpc872/pharadol-equipment-release` บนสาขา `codex/pharadol-equipment` จาก Production commit `819e5a6`; ไม่รวมงานอื่นที่แก้ค้างไว้ใน working tree เดิม
- Equipment session check อยู่ภายในโมดูล รองรับ optional user_sessions โดยไม่ import หรือ deploy งาน Authentication ที่ยังไม่เผยแพร่
- Migration Production ติดตั้งแล้ว; ห้ามรันไฟล์ CREATE นี้ซ้ำ
- URL ถาวร: `https://www.pharadolproduction.com/pharadol/equipment`

## การแก้ไข QR Code และตรวจ Production วันที่ 10 พฤศจิกายน 2569

- URL ถาวรคือ https://www.pharadolproduction.com/pharadol/equipment และยังใช้ Login เดิม
- เพิ่มข้อยกเว้น redirect เฉพาะ Equipment สำหรับบัญชีที่มีสิทธิ์ Pharadol รวม Admin; เส้นทางระบบอื่นใช้กฎเดิม
- Equipment สามารถเลือก active brand เป็น Pharadol เมื่อเปิด QR โดยตรง โดยตรวจสิทธิ์จาก session และ API เหมือนเดิม
- เปลี่ยนชื่อเมนูหลักเป็น คลังอุปกรณ์ และแสดงเฉพาะ Sidebar Pharadol
- ตรวจ Production ก่อนแก้: หน้า Equipment เป็น 404 สำหรับ session ในเบราว์เซอร์ และ /api/equipment เป็น 404
- สำรองตารางงาน public ครบ 6 ตารางพร้อมโครงสร้าง ฟังก์ชัน ดัชนี constraints grants และนโยบาย Storage ผ่าน SQL Editor แบบอ่านอย่างเดียว เก็บไฟล์นอก repository แบบสิทธิ์ 600
- ทดสอบกู้คืนทุกตารางใน PostgreSQL แยก: hash เนื้อหาตรงกับสำรองทั้งหมด และลง Equipment Migration บนฐานกู้คืนแล้วข้อมูลเดิมไม่เปลี่ยน ไม่มีอุปกรณ์จำลอง
- ผ่าน 40 tests ในชุด release รวม Browser/API checks 12 กลุ่ม และ TypeScript, ESLint, Production Build
- ผู้ใช้ยืนยันแล้ว และ Vercel แสดง Added Environment Variable successfully สำหรับ SUPABASE_SERVICE_ROLE_KEY ชนิด Secret เป้าหมาย Production เท่านั้น


## สถานะล่าสุดก่อน Deploy

- Commit `3dab523` Push แล้วในสาขา `codex/pharadol-equipment`
- Migration Production สำเร็จ: 9 ตารางเปิด RLS, client roles ไม่มีสิทธิ์อ่านตาราง/เรียก RPC, Storage เป็น private
- จำนวนอุปกรณ์จริง 0 และหมวดหมู่เริ่มต้น 11 หมวด ไม่มีการ seed อุปกรณ์
- หลัง Migration จำนวนข้อมูลเดิมตรงก่อนติดตั้ง: bookings 117, customer_requests 37, members 3, admin_users 3, payment_receipts 0
- สำรองตารางงานและโครงสร้างไว้นอก git ที่ `/Users/bpc872/pharadol-backups/equipment-20261110-2db81f0a77fd` แบบจำกัดสิทธิ์ และตรวจ restore/hash แล้ว
- บันทึก Production Secret สำเร็จแล้ว กำลัง Push เข้า main เพื่อให้ Git integration ของ Vercel Deploy; ต้องตรวจสถานะ Ready และ smoke test ก่อนยืนยันเปิดใช้งาน
