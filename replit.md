# Discord Username Hunter Bot

بوت Discord يساعد المستخدمين في إيجاد يوزرات Discord المتاحة بأطوال وأنواع مخصصة.

## Run & Operate

- `pnpm --filter @workspace/discord-bot run start` — تشغيل البوت
- `pnpm --filter @workspace/api-server run dev` — تشغيل API server (port 5000)
- `pnpm run typecheck` — فحص الأنواع
- Required env: `DISCORD_BOT_TOKEN` — توكن بوت Discord

## Stack

- pnpm workspaces, Node.js 24, TypeScript 5.9
- Bot: discord.js v14
- API: Express 5
- DB: PostgreSQL + Drizzle ORM
- Build: tsx (TypeScript runner)

## Where things live

- `artifacts/discord-bot/src/index.ts` — نقطة الدخول الرئيسية للبوت
- `artifacts/discord-bot/src/commands/` — معالجات الأوامر والتفاعلات
- `artifacts/discord-bot/src/store.ts` — إدارة الجلسات والـ cooldown
- `artifacts/discord-bot/src/username-checker.ts` — منطق فحص اليوزرات
- `artifacts/discord-bot/src/config.ts` — الإعدادات (مدة الجلسة، cooldown)

## Architecture decisions

- البوت يستخدم Discord API مباشرة لفحص اليوزرات عبر `/unique-username/username-attempt-unauthed`
- الجلسات تُخزن في الذاكرة (Map) لأنها مؤقتة (10 دقائق)
- كل مستخدم له روم خاص يُنشأ عند البدء ويُحذف عند الانتهاء
- Rate limiting: 500ms بين كل فحص لتجنب الحظر

## Product

- أمر `/setup` للأونر/أدمن ينشر رسالة مع زر في روم عام
- عند الضغط على الزر يُنشأ روم خاص للمستخدم
- المستخدم يختار: طول اليوزر (3-6)، نوع الحروف (حروف/أرقام/الاثنان)، بادئة/لاحقة اختيارية
- مؤقت 10 دقائق يظهر فوق الروم، cooldown 4 ساعات بين الجلسات
- عند الانتهاء يُرسل النتائج كملف JSON أو TXT مع شرح الفرق

## User preferences

- البوت يدعم العربية في جميع الرسائل
- الـ cooldown: 4 ساعات لكل مستخدم
- مدة الجلسة: 10 دقائق
- أقصى عدد يوزرات مُعادة: 20

## Gotchas

- `DISCORD_BOT_TOKEN` مطلوب في secrets
- البوت يسجّل الأوامر globally عند الإقلاع (قد يستغرق حتى ساعة للظهور في Discord)
- للتسجيل الفوري في سيرفر معين استخدم `Routes.applicationGuildCommands`

## Pointers

- See the `pnpm-workspace` skill for workspace structure
