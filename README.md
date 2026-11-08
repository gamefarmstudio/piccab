# Piccab — Picture Vocab

ฝึกคำศัพท์ภาษาอังกฤษจากภาพ: แตะของในภาพเพื่อดูคำและฟังเสียง ทบทวนด้วยการพิมพ์ หรือฟังแล้วหา
ครูและผู้เรียนสร้างฉากเองจากรูปถ่ายได้ โดยมี AI ช่วยตีกรอบและใส่คำศัพท์

เว็บไซต์: https://piccab.com

## สถานะ

พร้อมให้ทดลองใช้แบบวงปิด (พฤศจิกายน 2569) — หน้าแอปอยู่ใน `public/app.html` ไฟล์เดียว (เปิดที่ `/app`) ส่วน `/` เป็นหน้าแนะนำ (landing page) ไม่ต้อง build
Cloudflare Worker (`src/worker.js`) เป็นหลังบ้าน: AI (Gemini), รูปใน R2, ลิงก์แชร์, ห้องเรียน, เพื่อน, หน้าดูแลระบบ และอีเมล · บัญชีและฐานข้อมูลอยู่ใน Supabase

## โครงสร้าง

```
public/vendor/     ไลบรารี supabase-js (UMD) เก็บไว้ในเว็บเอง
public/fonts/      ฟอนต์ Sarabun + Fredoka (OFL) เก็บในเว็บเอง ไม่โหลดจาก Google Fonts
public/sw.js       service worker: เปิดแอปได้แม้ออฟไลน์ (หน้าเว็บ network-first, ไฟล์ static จาก cache, ไม่ cache /api/*) — แก้รายการไฟล์แล้วเปลี่ยน VERSION
public/privacy.html, public/terms.html, public/legal.css  นโยบายความเป็นส่วนตัว / ข้อตกลงการใช้งาน (/privacy, /terms)
public/index.html, public/en/  หน้าแนะนำ (landing page) ไทยที่ piccab.com/ และอังกฤษที่ /en/ (สร้างจาก tools/landing*.tpl.html) — คนที่เคยเปิดแอปแล้วจะถูกพาไป /app อัตโนมัติ (ดูหน้าแนะนำได้ที่ /?home)
public/app.html    แอปทั้งหมด (HTML + CSS + JavaScript) รวมภาพฉากตัวอย่าง Afternoon tea แบบ SVG — เปิดที่ /app
public/landing/    รูปหน้าจอแอปที่ใช้ในหน้าแนะนำ
src/worker.js      Cloudflare Worker: เสิร์ฟไฟล์ใน public/ และ API ของ AI
                     GET  /api/health  → { ai, needCode, credits, monthly, captcha }
                     POST /api/scan    → ส่งรูปให้ Gemini หรือ Claude แล้วคืนรายการคำศัพท์ + กรอบ
                     POST /api/wordlist → อ่านรายการคำจากรูปชีทคำศัพท์
                     POST /api/feedback → 💬 ความเห็นจากผู้ใช้ (บันทึก + อีเมลแจ้ง ADMIN_NOTIFY_EMAIL)
                     POST /api/log, /api/usage → ข้อผิดพลาดของแอป และยอดการใช้งานรายวัน (ไม่ระบุตัวตน)
                     GET|PUT|DELETE /api/img/<id> → รูปฉากใน R2 (เฉพาะเจ้าของที่ล็อกอิน)
supabase/schema.sql  ตารางฐานข้อมูล + สิทธิ์ (RLS) + เครดิต AI — รันใน Supabase SQL Editor
supabase/2026-11-decks.sql  เพิ่มตาราง decks (ชุดคำ) สำหรับโปรเจกต์ที่รัน schema.sql ไปก่อนหน้านี้แล้ว
supabase/2026-11-shares.sql เพิ่มตาราง shares (ลิงก์แชร์ /s/<id>) — ไม่มีสิทธิ์อ่านจากเบราว์เซอร์ อ่านผ่าน Worker เท่านั้น
supabase/2026-11-classes.sql เพิ่มตารางห้องเรียน (classes, class_members, class_items, class_progress) — ต้องรันหลัง shares; เปิด Anonymous sign-ins ใน Supabase ให้นักเรียนเข้าด้วยรหัส+ชื่อเล่น
supabase/2026-11-leaderboard.sql เพิ่มสวิตช์ตารางอันดับในห้องเรียน
supabase/2026-11-friends.sql ระบบเพื่อน (ไม่มีค้นหา/แชต, นักเรียนเป็นเพื่อนได้เฉพาะเพื่อนร่วมห้อง) — รายงานอยู่ในตาราง friend_reports
supabase/2026-11-admin.sql  คอลัมน์ติดตามรายงาน (share_id, resolved_at, note) สำหรับหน้า 🛡️ ดูแลระบบ (/admin) — ตั้งตัวแปร ADMIN_EMAILS ใน Cloudflare
supabase/2026-11-ai-usage.sql  ตัวนับการใช้ AI (ตาราง ai_usage) สำหรับแท็บ ✨ การใช้ AI ในหน้า 🛡️ ดูแลระบบ — นับเฉพาะจำนวนครั้ง รุ่น ผลลัพธ์ และ token ไม่เก็บรูป คำ หรือผู้ใช้ · ยังไม่รันก็ใช้ AI ได้ตามปกติ แค่ไม่ถูกนับ
supabase/2026-11-scene-meta.sql  คอลัมน์ scenes.meta สำหรับชีทคำศัพท์ (วันสอบ)
supabase/2026-11-trial.sql  เครื่องมือช่วงทดลองใช้: ตาราง feedback (💬 ส่งความเห็น), client_errors (ข้อผิดพลาดของแอปบนเครื่องผู้ใช้), usage_daily (ยอดการใช้งานรายวันแบบรวม ไม่มีรหัสเครื่องหรือผู้ใช้) + ฟังก์ชัน trial_stats — แสดงในแท็บ 💬 / 📊 / 🐞 ของหน้า 🛡️ ดูแลระบบ · ยังไม่รันแอปก็ใช้ได้ตามปกติ แค่ส่งความเห็นในแอปไม่ได้และไม่มีตัวเลข
supabase/2026-11-class-lang.sql  ภาษาของงานในห้องเรียน (class_items.lang: en / de) — ครูเลือกภาษาตอนมอบหมาย · ยังไม่รันก็มอบหมายภาษาอังกฤษได้ตามเดิม
public/vendor/qrcode-generator-2.0.4.js  QR (MIT) โหลดเฉพาะตอนเปิดหน้าเพื่อน
wrangler.jsonc     ตั้งค่า Worker (ชื่อ piccab, โฟลเดอร์ public, จำกัด 6 ครั้ง/นาที/IP)
tests/             เทสต์ (ดูหัวข้อ "เทสต์") — แยก package.json ไว้ในนี้ Cloudflare จะได้ไม่ติดตั้งตอน build
.github/workflows/tests.yml  รันเทสต์ทุก PR
README.md          ไฟล์นี้
```

## วิธีเปิดดูบนเครื่อง

```bash
npx wrangler dev
# แล้วเปิด http://localhost:8787
```

ถ้าจะทดสอบ AI บนเครื่อง ให้สร้างไฟล์ `.dev.vars` (อยู่ใน .gitignore แล้ว) ใส่ `ANTHROPIC_API_KEY=...`
หรือเปิด `public/app.html` ตรงๆ ในเบราว์เซอร์ก็ได้ (ปุ่ม AI จะซ่อน)

## เทสต์ (รันเองทุก PR)

GitHub Actions (`.github/workflows/tests.yml`) รันทุกครั้งที่เปิดหรืออัปเดต PR และหลัง merge เข้า main — ถ้ามีอะไรพัง PR จะขึ้น ✗ ที่ช่อง **Tests**

| ชุด | ไฟล์ | ตรวจอะไร |
|---|---|---|
| Worker + translations | `tests/worker.test.mjs`, `tests/i18n-check.mjs` | API ทั้งหมดของ Worker (AI, เครดิต, แชร์, ห้องเรียน, เพื่อน, แอดมิน, อีเมล, ตัวนับ AI) และข้อความไทยทุกข้อความมีคำแปลอังกฤษ |
| Browser | `tests/browser/test_*.py` | เปิดแอปใน Chrome จริง: เยอรมัน, เมนูอังกฤษ, ฝึกพูด, ทบทวนตามรอบ, วาดกรอบ, CAPTCHA, หน้าแรก, ลบบัญชี/นโยบาย และกับ Worker จริง (`wrangler dev`) + Supabase จำลอง (`tests/fake_supabase.py`): ห้องเรียน (อังกฤษ/เยอรมัน), แอดมิน, ตัวนับ AI, เว็บภาษาอังกฤษ, ติดตั้งแอป/ออฟไลน์, ความเห็น/ข้อผิดพลาด/ยอดการใช้งาน |

รันบนเครื่อง:
```
npm ci --prefix tests
node tests/worker.test.mjs && node tests/i18n-check.mjs
pip install playwright && python -m playwright install chromium
bash tests/browser/run.sh                 # ทั้งหมด (~5 นาที) หรือระบุไฟล์ เช่น bash tests/browser/run.sh test_speak.py
```
ภาพหน้าจอจากเทสต์อยู่ใน `/tmp/piccab-shots` (บน GitHub ถ้าเทสต์ไม่ผ่าน ดาวน์โหลดได้จาก Artifacts ของรอบนั้น)

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
| `CLAUDE_EFFORT` | Text | – | `low` / `medium` / `high` (มี `xhigh`, `max` แต่ไม่แนะนำ) — ให้ Claude คิดมากแค่ไหนก่อนตอบ ยิ่งสูงยิ่งช้าและแพง · ไม่ตั้ง = ค่าเริ่มต้นของรุ่น (Haiku 5.5 = medium) |
| `SUPABASE_SECRET_KEY` | Secret | แนะนำ | Supabase secret key (`sb_secret_…`) → สมาชิกที่ล็อกอินได้เครดิต AI รายเดือน |
| `AI_MONTHLY_CREDITS` | Text | – | เครดิต AI ต่อคนต่อเดือน (ค่าเริ่มต้น 30) |
| `GEMINI_FREE_RPD` | Text | – | โควตาฟรีต่อวันของแต่ละรุ่น สำหรับแถบในแท็บ ✨ การใช้ AI เมื่อ Google เปลี่ยนตัวเลข เช่น `gemini-3.8-flash:20,gemini-3.5-flash-lite:500` (ค่าเริ่มต้นตามที่ Google ประกาศ พ.ย. 2026) |
| `SCAN_CODE` | Secret | – | รหัสทดสอบ: ใช้ AI ได้โดยไม่ต้องล็อกอิน (ไม่ใช้เครดิต) — ลบออกเพื่อบังคับให้ล็อกอิน |
| `SEND_EMAIL_HOOK_SECRET` | Secret | ล็อกอิน | secret ของ Supabase Send Email hook (`v1,whsec_…`) → URL `https://piccab.com/api/auth-email` |
| `RESEND_API_KEY` | Secret | ล็อกอิน | คีย์ Resend (`re_…`) ส่งอีเมลรหัสเข้าสู่ระบบภาษาไทยจาก `no-reply@piccab.com` |
| `ADMIN_EMAILS` | Text | – | อีเมลผู้ดูแล (คั่นด้วย ,) ที่เปิดหน้า /admin ได้ |
| `ADMIN_NOTIFY_EMAIL` | Text | – | อีเมลที่รับแจ้งรายงานและ 💬 ความเห็นจากผู้ใช้ (ค่าเริ่มต้น contact@piccab.com) |
| `TURNSTILE_SITE_KEY` | Text | – | Site key ของ Cloudflare Turnstile (ตรวจว่าไม่ใช่บอตตอนส่งรหัสเข้าอีเมล / นักเรียนเข้าห้องแบบไม่ใช้อีเมล) — Secret key ใส่ใน Supabase → Authentication → Attack Protection → CAPTCHA (ตั้ง site key และ merge ก่อน แล้วค่อยเปิดใน Supabase) |

ควรตั้ง **วงเงินใช้จ่ายรายเดือน** ใน console.anthropic.com → Settings → Limits ด้วย

## ฟีเจอร์

- หน้าแรก: เรียนต่อ, ทบทวนวันนี้ (ตามรอบเวลา + 🔥 วันต่อเนื่อง), คำใหม่, นับถอยหลังวันสอบ, ถ่ายรูป/เลือกรูป, ชีทคำศัพท์จากครู
- 4 โหมดในฉาก: ดูคำศัพท์ (Manual / Auto), ทบทวน (พิมพ์), ฟังแล้วหา, 🎤 ฝึกพูด
- คลังฉาก, คำของฉัน + ชุดคำ, ชีทคำศัพท์ (พิมพ์หรือถ่ายรูปให้ AI อ่าน) + สอบจำลอง
- สร้างและแก้ไขฉาก: AI หาคำ (Gemini) หรือตีกรอบเอง, คำแปล, คำตอบอื่น
- ฝึกภาษาอังกฤษหรือเยอรมัน · เมนูไทยหรืออังกฤษ · เสียงอ่าน Web Speech API (UK/US, พูดช้า)
- บัญชี (รหัสทางอีเมล / Google), ซิงค์ข้ามเครื่อง, ลบบัญชีเอง, เครดิต AI รายเดือน
- ลิงก์แชร์ + QR, ห้องเรียน (นักเรียนเข้าด้วยรหัส + ชื่อเล่น), เพื่อน + กระดานคะแนน, รายงานเนื้อหา
- ติดตั้งเป็นแอป (PWA) และใช้ออฟไลน์ได้
- ช่วงทดลองใช้: 💬 ส่งความเห็นในแอป (หน้าแรก, ท้ายแอป, บัญชีของฉัน), ข้อผิดพลาดของแอป และยอดการใช้งานรายวัน ดูได้ใน 🛡️ ดูแลระบบ

## Supabase (บัญชีผู้ใช้)

- โปรเจกต์: `piccab` (Singapore) — URL และ publishable key อยู่ใน `public/app.html` (ใช้ในเบราว์เซอร์ได้ ข้อมูลป้องกันด้วย RLS)
- ล็อกอินด้วยอีเมล + รหัสครั้งเดียว (OTP) — ต้องใส่ `{{ .Token }}` ในเทมเพลตอีเมล Magic Link / Confirm signup
- Authentication → URL Configuration: Site URL `https://piccab.com`, Redirect URLs `https://piccab.com/**` และ `https://*-piccab.itthanun-s.workers.dev/**`
- Sync: ฉาก + ความคืบหน้าเก็บใน Supabase (ใหม่กว่าชนะ), รูปเก็บใน **Cloudflare R2** bucket `piccab-images` (binding `IMAGES`)
- ในเครื่อง: ข้อมูลฉากใน localStorage (`pv-scenes2`), รูปใน IndexedDB (`piccab` → `img`)
- **ห้าม** ใส่ secret / service_role key ในโค้ด — ใช้เป็น Secret ใน Cloudflare เท่านั้น

## ข้อจำกัดที่ควรรู้

- **ถ้าไม่เข้าสู่ระบบ** ข้อมูลอยู่ในเบราว์เซอร์ (localStorage + IndexedDB) เท่านั้น ล้างข้อมูลเบราว์เซอร์แล้วหาย
- **AI** ใช้ Gemini API แบบฟรีเป็นหลัก (โควตารายวันต่อรุ่น ดูได้ใน ✨ การใช้ AI) — ผู้ใช้ที่เข้าสู่ระบบได้เครดิตรายเดือน (`AI_MONTHLY_CREDITS`) และจำกัด 6 ครั้ง/นาที/IP
- **Supabase แบบฟรี** ไม่มีสำรองข้อมูลอัตโนมัติ และพักโปรเจกต์ถ้าไม่มีการใช้งานนาน — ควรอัปเป็น Pro ก่อนมีผู้ใช้จริงจำนวนมาก
- เทสต์อัตโนมัติรันใน Chrome — ควรลองบน iPhone (Safari) และ Android จริงก่อนเปิดกว้าง (กล้อง, ฝึกพูด, เสียงอ่าน, ติดตั้งแอป)

## แผนพัฒนา

1. ทดลองใช้แบบวงปิด เก็บความเห็นและตัวเลขการใช้งาน
2. แผนเสียเงิน (Plus) เมื่อโควตา AI ฟรีไม่พอ
3. ย้ายไป Vite + TypeScript เมื่อแอปไฟล์เดียวใหญ่เกินดูแล

## ภาษาที่ฝึก (อังกฤษ / เยอรมัน)

- ปุ่มธงที่หัวแอปเลือกภาษาที่ฝึก (`pv-lang`) — กรอบในรูปใช้ร่วมกันทุกภาษา
- คำภาษาอังกฤษอยู่ที่ `item.word / alts / say` (เหมือนเดิม) ภาษาอื่นอยู่ที่ `item.l.<lang> = {w, a, alts}` (a = der/die/das)
- ความคืบหน้าภาษาอื่นเก็บในตาราง progress เดิม คีย์ `<item>@<lang>` (เช่น `teapot@de`) — ไม่ต้องรัน SQL
- `POST /api/translate {lang, words:[{k,en,th}]}` แปลคำในฉากด้วย AI (ส่งเฉพาะคำ ไม่ส่งรูป, ไม่ใช้เครดิต) — แอปเรียกเองเมื่อเปลี่ยนภาษา เปิดฉากที่ยังไม่มีคำภาษานั้น หรือเพิ่มคำอังกฤษใหม่ · `/api/scan` รับ `langs` (ภาษาที่ผู้ใช้ฝึก `pv-langs`) เพื่อได้คำทุกภาษามาพร้อมกันในครั้งเดียว
- เพิ่มภาษาใหม่: ใส่ใน `LANGS` (app.html) และ `AI_LANGS` (worker.js) + กฎตรวจคำตอบใน `check()`

## ภาษาของฉัน (เมนูไทย / อังกฤษ)

- `pv-ui` = `th` หรือ `en` คุมเมนูและความหมายใต้คำ — สคริปต์แรกใน `app.html` เลือกให้: คนที่เคยใช้แอปแล้ว (มีคีย์ `pv-*`/`sb-*`) = ไทยเหมือนเดิม, คนใหม่ที่เบราว์เซอร์มีภาษาไทย = ไทย, นอกนั้น = อังกฤษ และเห็นหน้าต้อนรับให้เลือกภาษาของฉัน + ภาษาที่ฝึก (ภาษาอังกฤษเป็นเบราว์เซอร์หลัก → แนะนำเยอรมัน, ภาษาอื่น → แนะนำอังกฤษ)
- เปลี่ยนได้ที่ปุ่มธงหัวแอป → “🗣 ภาษาของฉัน” (โหลดหน้าใหม่)
- แอปเขียนข้อความเป็นภาษาไทย; เมื่อเป็น `en` จะโหลด `public/i18n/en.js` (พจนานุกรม ไทย → อังกฤษ + ตัวแปลข้อความบนจอ) — คนไทยไม่ได้โหลดไฟล์นี้
- เพิ่มหรือแก้ข้อความในแอป: เพิ่มคู่คำใน `D` ของ `en.js` แล้วตรวจด้วย `npm ci --prefix tests && node tests/i18n-check.mjs` (บอกข้อความที่ยังไม่มีคำแปล · รันเองทุก PR ด้วย)
- ความหมายใต้คำ: ไทย → ความหมายไทย (ฝึกภาษาอื่น = ไทย · อังกฤษ) · อังกฤษ → คำอังกฤษเมื่อฝึกภาษาอื่น, ไม่แสดงเมื่อฝึกอังกฤษ
- หน้าเว็บภาษาอังกฤษ: `/en/` (landing, สร้างจาก `tools/landing.en.tpl.html` ด้วย `python3 tools/build-landing.py` — ใช้ CSS ร่วมกับหน้าไทย), `/en/privacy`, `/en/terms` (ฉบับแปล ถ้าต่างกันให้ถือฉบับไทย)
  - หน้าแรก `/` ส่งเบราว์เซอร์ที่ไม่มีภาษาไทย (หรือคนที่ตั้ง `pv-ui` = en) ไป `/en/` · ปุ่ม EN / ไทย สลับหน้า (`/?hl=th` อยู่หน้าไทย)
  - ลิงก์เข้าแอปจากหน้าแรกมี `?hl=th|en` → แอปใช้เป็นภาษาแรกของคนใหม่ (ไม่ทับภาษาที่เลือกไว้แล้ว) แล้วลบออกจาก URL
  - ในแอปเมนูอังกฤษ ลิงก์ `/privacy`, `/terms` เปลี่ยนเป็น `/en/…` อัตโนมัติ (`en.js`)
- อีเมลรหัสเข้าสู่ระบบ: แอปส่ง `emailRedirectTo: /app?hl=<ภาษา>` และ `data.lang` (บัญชีใหม่) → `/api/auth-email` เลือกอีเมลไทย/อังกฤษ (`mailLang`)
- ลิงก์แชร์ / ห้องเรียน / เพื่อน ที่สร้างจากเมนูอังกฤษมี `?hl=en` → ตัวอย่างลิงก์ (Line, Facebook) เป็นภาษาอังกฤษ (`pageLang`) · ไม่มี hl = ไทยเหมือนเดิม
- ยังเป็นภาษาไทย: อีเมลแจ้งผู้ดูแลระบบ และหน้า 🛡️ ดูแลระบบ

## ห้องเรียนหลายภาษา

- ครูเลือก "นักเรียนฝึกเป็นภาษา" ตอนมอบหมายงาน — ภาษาอื่นนอกจากอังกฤษ แอปจะแปลคำที่ยังขาดให้ก่อนสร้างลิงก์ (นักเรียนใช้ AI ไม่ได้)
- คำทั้งหมดของงานภาษาอื่น = เฉพาะคำที่มีภาษานั้น (`shareTotal(sh, lang)`) · นักเรียนกดเริ่มแล้วแอปสลับเป็นภาษานั้นเอง และส่งความคืบหน้าของคีย์ `<item>@<lang>`
- งานเดียวกันมอบหมายได้ภาษาเดียวต่อห้อง (`other_lang`)

## 🎤 ฝึกพูด

- โหมดที่ 4 ในหน้าฉาก: แอปไฮไลต์ของในรูป ผู้ใช้กด 🎤 แล้วพูดคำ — ใช้ SpeechRecognition ของเบราว์เซอร์ (Chrome / Edge / Safari) ไม่ใช้ AI ของเรา ไม่ใช้เครดิต
- ภาษาที่ฟัง: อังกฤษตามสำเนียงที่เลือก (en-GB / en-US), เยอรมัน de-DE · เทียบคำแบบไม่สนตัวพิมพ์/วรรค/a, the · เยอรมันพูด der/die/das ถูกได้ ★
- ไม่บันทึกความคืบหน้า (เป็นการฝึกรอบต่อรอบ) แต่นับเป็นการฝึกของวันนั้น (🔥)
- เบราว์เซอร์ที่ไม่มี (เช่น Firefox) จะบอกให้เปิดด้วย Chrome หรือ Safari · นโยบายความเป็นส่วนตัวข้อ 4.5

