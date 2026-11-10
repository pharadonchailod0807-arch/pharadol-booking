# Equipment Images — Pharadol Production

Adds an image editor at the top of Add/Edit Equipment, up to five images, immediate local previews, drag and drop, mobile file selection, replacement, removal, ordering and one cover. Inventory shows a cover thumbnail on desktop and mobile. Details has an accessible gallery/lightbox with next, previous, Escape and close controls.

## Storage and validation

- New private bucket `equipment-images`: 10 MiB per original upload, JPEG/PNG/WebP only. HEIC is explicitly rejected with Thai conversion guidance; no unsupported decoder or external conversion service is used.
- The authenticated Equipment API issues a signed upload capability for a generated UUID path. The browser uploads directly to Supabase, avoiding Vercel's request body limit, with upload progress.
- Uncommitted source files are never served. The server downloads and decodes the image using Sharp, rejects corrupt/spoofed/animated or over-64-megapixel content, applies orientation, strips metadata and generates WebP (maximum 2560 × 2560) and a 240-pixel thumbnail.
- Display uses authenticated API authorization followed by a 60-second signed Storage URL. No public bucket or service credential is exposed to the browser.
- Paths use stable draft/image UUIDs and `upsert=false`; original filenames do not influence storage paths.

## Database and atomic saves

Migration: `supabase/migrations/202611100001_equipment_images.sql` (run once).

- `equipment_image_uploads` tracks ownership, target equipment/draft, generated paths, validation state and expiry.
- `equipment_images` stores attached photos, cover, order and soft deletion. Partial unique indexes allow at most five active positions and one active cover.
- `equipment_save_images` wraps the existing inventory mutation and image manifest in the same transaction. Failed validation/version/ownership rolls back both. The entire manifest participates in the existing idempotency check.
- The image transaction preserves ID, stock counters, checkout and maintenance ledgers. Existing edit permissions and optimistic version checks still apply.
- Both new tables enable RLS and deny browser roles. RPC execution is service-role only. A restrictive Storage policy prevents permissive legacy policies from opening the image bucket.
- Existing image documents are retained; at most five per equipment become gallery images without copying or deleting their files. Existing buckets and documents remain available.

## Cancellation, failure and retention

Selecting/removing images does not reset form fields. Native file-picker cancellation is prevented from closing the Equipment dialog. Existing photos remain unchanged until a successful save. Removing or replacing an attached image soft-deletes the gallery association and retains the private object, preserving Production data.

New disposable uploads are cancelled and removed when removed from the form or when the form closes. Cancel requests cannot delete attached photos. Failed database saves keep the validated uploads available for retry. If the browser disappears, uploads remain tracked until their signed-upload capabilities expire; a ten-minute processing grace prevents racing an in-flight image decoder. Expired disposable objects/records are swept after authenticated inventory requests and before a new upload. Cleanup retries on later activity, so a quiet site can retain expired temporary objects until the next Equipment visit. No new cron or secret is required.

## Verification

- 45 automated tests, including 17 browser/API groups, pass against a separate native PostgreSQL test cluster and test-only Supabase protocol adapter.
- Covers one/multiple/five images, overflow, unsupported/oversized/HEIC/spoofed files, a valid upload exceeding 4.5 MB, cover changes and automatic replacement, reorder/remove/replace, cancelled file picker and edits, create/edit atomicity, idempotency, private access, inventory/details/lightbox, mobile and equipment without photos.
- The local storage adapter uses a loopback origin; the browser fixture bypasses CSP only for that adapter. Production must verify the actual existing Supabase domain, Storage CORS, policies and Sharp Linux runtime.
- TypeScript, ESLint and Production Build pass. Restore verification covers the current 15-table Production backup, preserves all row hashes and applies the image migration to the isolated restore. The earlier six-table backup restore also still passes.
- Private backup: `/Users/bpc872/pharadol-backups/equipment-images-20261110`, outside Git, restricted directory/files. CSV SHA-256: `0a4e887f80970e2c19f456d53f5ee09eece0e46082fcfb1dbdc67597e80c31da`.

## Deployment

Uses the existing Vercel project `booking-management-studio`, Production branch `main`, Supabase project `kwkxxyhwnkkchkqwiavw` and existing server environment. URL stays https://www.pharadolproduction.com/pharadol/equipment . No Booking, Calendar, Customer, Finance, Adisorn or shared Authentication change is included.

Production smoke testing uses an unsaved draft: upload, validate, display the private stored image, then cancel. Do not create a permanent test equipment record or alter an existing equipment's images. Capture the deployment ID/status, request results and post-cancellation counts before reporting completion.

Migration applied to Production on 10 November 2026 after the verified backup/restore. Post-check: both new tables have RLS, client-role table grants = 0, image bucket private with 10,485,760-byte limit, image/upload/equipment counts = 0. Existing 15-table data XML MD5 stayed `67d68a73c1134fdc3f24a987b0af30e2`. Migration file SHA-256: `7b00c297534cdaef56116aea504f9153e37601f8316ecfc200443ec0d8912b48`. Do not run this create-only migration again.
