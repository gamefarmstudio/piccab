# Piccab — Picture Vocab

ฝึกคำศัพท์ภาษาอังกฤษจากภาพ: แตะของในภาพเพื่อดูคำและฟังเสียง ทบทวนด้วยการพิมพ์ หรือฟังแล้วหา
ครูและผู้เรียนสร้างฉากเองจากรูปถ่ายได้ โดยมี AI ช่วยตีกรอบและใส่คำศัพท์

เว็บไซต์: https://piccab.com

## สถานะ

ต้นแบบที่ใช้งานได้ (prototype) — หน้าแอปอยู่ใน `public/index.html` ไฟล์เดียว ไม่ต้อง build
มี Cloudflare Worker เล็กๆ (`src/worker.js`) เป็นหลังบ้านสำหรับ AI หาคำศัพท์

## โครงสร้าง

```
public/vendor/     ไลบรารี supabase-js (UMD) เก็บไว้ในเว็บเอง
public/fonts/      ฟอนต์ Sarabun + Fredoka (OFL) เก็บในเว็บเอง ไม่โหลดจาก Google Fonts
public/sw.js       service worker: เปิดแอปได้แม้ออฟไลน์ (หน้าเว็บ network-first, ไฟล์ static จาก cache, ไม่ cache /api/*) — แก้รายการไฟล์แล้วเปลี่ยน VERSION
public/privacy.html, public/terms.html, public/legal.css  นโยบายความเป็นส่วนตัว / ข้อตกลงการใช้งาน (/privacy, /terms)
public/index.html  แอปทั้งหมด (HTML + CSS + JavaScript) รวมภาพฉากตัวอย่าง Afternoon tea แบบ SVG
src/worker.js      Cloudflare Worker: เสิร์ฟไฟล์ใน public/ และ API ของ AI
                     GET  /api/health  → { ai, needCode }
                     POST /api/scan    → ส่งรูปให้ Gemini หรือ Claude แล้วคืนรายการคำศัพท์ + กรอบ
                     GET|PUT|DELETE /api/img/<id> → รูปฉากใน R2 (เฉพาะเจ้าของที่ล็อกอิน)
supabase/schema.sql  ตารางฐานข้อมูล + สิทธิ์ (RLS) + เครดิต AI — รันใน Supabase SQL Editor
supabase/2026-11-decks.sql  เพิ่มตาราง decks (ชุดคำ) สำหรับโปรเจกต์ที่รัน schema.sql ไปก่อนหน้านี้แล้ว
supabase/2026-11-shares.sql เพิ่มตาราง shares (ลิงก์แชร์ /s/<id>) — ไม่มีสิทธิ์อ่านจากเบราว์เซอร์ อ่านผ่าน Worker เท่านั้น
wrangler.jsonc     ตั้งค่า Worker (ชื่อ piccab, โฟลเดอร์ public, จำกัด 6 ครั้ง/นาที/IP)
README.md          ไฟล์นี้
```

## วิธีเปิดดูบนเครื่อง

```bash
npx wrangler dev
# แล้วเปิด http://localhost:8787
```

ถ้าจะทดสอบ AI บนเครื่อง ให้สร้างไฟล์ `.dev.vars` (อยู่ใน .gitignore แล้ว) ใส่ `ANTHROPIC_API_KEY=...`
หรือเปิด `public/index.html` ตรงๆ ในเบราว์เซอร์ก็ได้ (ปุ่ม AI จะซ่อน)

## การนำขึ้นเว็บ (Cloudflare Workers)

- Deploy command: `npx wrangler deploy` (อ่านค่าจาก `wrangler.jsonc`)
- ทุกครั้งที่ merge เข้า `main` เว็บจะอัปเดตอัตโนมัติ

ตั้งค่าใน Cloudflare → Workers & Pages → piccab → Settings → Variables and Secrets:

| ชื่อ | ชนิด | จำเป็น | ความหมาย |
|---|---|---|---|
| `GEMINI_API_KEY` | Secret | อย่างน้อย 1 คีย์ | คีย์จาก aistudio.google.com (ที่ใช้อยู่ตอนนี้) — หมายเหตุ: เงื่อนไข Gemini API กำหนดผู้ใช้อายุ 18+ และระดับฟรี Google อาจนำข้อมูลไปพัฒนาผลิตภัณฑ์ (ระบุไว้ใน /privacy แล้ว) |
| `ANTHROPIC_API_KEY` | Secret | อย่างน้อย 1 คีย์ | คีย์จาก console.anthropic.com — ทางเลือก (ถ้ามีคีย์นี้ จะใช้ Claude แทน Gemini เว้นแต่ตั้ง `AI_PROVIDER=gemini`) ไม่มีคีย์เลย = ซ่อนปุ่ม AI |
| `AI_PROVIDER` | Text | – | `gemini` หรือ `claude` ใช้เมื่อใส่ทั้ง 2 คีย์ (ค่าเริ่มต้น claude) |
| `GEMINI_MODEL` | Text | – | รุ่นเดียว หรือหลายรุ่นคั่นด้วย , (ลองตามลำดับเมื่อโควตาหมด) ค่าเริ่มต้น `gemini-3.8-flash,gemini-3.6-flash,gemini-3.5-flash-lite` |
| `CLAUDE_MODEL` | Text | – | ค่าเริ่มต้น `claude-haiku-5-5` (ถูกที่สุด) ถ้ากรอบไม่แม่นเปลี่ยนเป็น `claude-sonnet-5-5` |
| `SUPABASE_SECRET_KEY` | Secret | แนะนำ | Supabase secret key (`sb_secret_…`) → สมาชิกที่ล็อกอินได้เครดิต AI รายเดือน |
| `AI_MONTHLY_CREDITS` | Text | – | เครดิต AI ต่อคนต่อเดือน (ค่าเริ่มต้น 30) |
| `SCAN_CODE` | Secret | – | รหัสทดสอบ: ใช้ AI ได้โดยไม่ต้องล็อกอิน (ไม่ใช้เครดิต) — ลบออกเพื่อบังคับให้ล็อกอิน |
| `SEND_EMAIL_HOOK_SECRET` | Secret | ล็อกอิน | secret ของ Supabase Send Email hook (`v1,whsec_…`) → URL `https://piccab.com/api/auth-email` |
| `RESEND_API_KEY` | Secret | ล็อกอิน | คีย์ Resend (`re_…`) ส่งอีเมลรหัสเข้าสู่ระบบภาษาไทยจาก `no-reply@piccab.com` |

ควรตั้ง **วงเงินใช้จ่ายรายเดือน** ใน console.anthropic.com → Settings → Limits ด้วย

## ฟีเจอร์ในต้นแบบ

- หน้าแรก: เรียนต่อ, ทบทวนวันนี้, ถ่ายรูป/เลือกรูป, ฉากล่าสุด
- คลังฉาก: ค้นหาจากชื่อฉากหรือคำศัพท์, กรอง, เรียงลำดับ
- โหมดเรียน: ดูคำศัพท์ (Manual / Auto), ทบทวน (พิมพ์), ฟังแล้วหา
- สร้างและแก้ไขฉาก: ตีกรอบ เลือก ย้าย ปรับขนาด กรอบซ้อน คำแปล คำตอบอื่น
- เสียงอ่าน: Web Speech API (สำเนียง UK/US, พูดช้า)

## Supabase (บัญชีผู้ใช้)

- โปรเจกต์: `piccab` (Singapore) — URL และ publishable key อยู่ใน `public/index.html` (ใช้ในเบราว์เซอร์ได้ ข้อมูลป้องกันด้วย RLS)
- ล็อกอินด้วยอีเมล + รหัสครั้งเดียว (OTP) — ต้องใส่ `{{ .Token }}` ในเทมเพลตอีเมล Magic Link / Confirm signup
- Authentication → URL Configuration: Site URL `https://piccab.com`, Redirect URLs `https://piccab.com/**` และ `https://*-piccab.itthanun-s.workers.dev/**`
- Sync: ฉาก + ความคืบหน้าเก็บใน Supabase (ใหม่กว่าชนะ), รูปเก็บใน **Cloudflare R2** bucket `piccab-images` (binding `IMAGES`)
- ในเครื่อง: ข้อมูลฉากใน localStorage (`pv-scenes2`), รูปใน IndexedDB (`piccab` → `img`)
- **ห้าม** ใส่ secret / service_role key ในโค้ด — ใช้เป็น Secret ใน Cloudflare เท่านั้น

## ข้อจำกัดที่ควรรู้

- **ข้อมูลเก็บใน localStorage ของเบราว์เซอร์** — ยังไม่มีบัญชีผู้ใช้หรือเซิร์ฟเวอร์ (แผนถัดไป: Supabase)
- **AI หาคำศัพท์** เรียก Claude API ผ่าน Worker ใช้เครดิตของเจ้าของเว็บ ป้องกันด้วยรหัส `SCAN_CODE`
  และจำกัดความถี่ต่อ IP เท่านั้น ยังไม่มีเครดิตรายผู้ใช้ (แผนถัดไป: ผูกกับบัญชีผู้ใช้ + ระบบเครดิต)
- เมนู "คำของฉัน" และ "ห้องเรียน" ยังเป็นปุ่มตัวอย่าง (เร็วๆ นี้)

## แผนพัฒนา

1. ~~นำขึ้น piccab.com ด้วย Cloudflare Workers~~ ✅ และ AI ผ่าน Worker ✅
2. ต่อ Supabase: ล็อกอิน (Google / อีเมล), เก็บฉากและความคืบหน้า, เก็บรูปใน Storage, ลิงก์แชร์ให้นักเรียน
3. ระบบเครดิต AI รายผู้ใช้ (นับใน Supabase ตรวจใน Worker)
4. ย้ายไป Vite + React + TypeScript เมื่อเริ่มทำหน้าครูและระบบชำระเงิน
