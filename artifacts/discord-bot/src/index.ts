import {
  Client,
  GatewayIntentBits,
  Partials,
  REST,
  Routes,
  SlashCommandBuilder,
  Events,
  ChatInputCommandInteraction,
  ButtonInteraction,
  StringSelectMenuInteraction,
  ModalSubmitInteraction,
} from "discord.js";
import { handleSetup } from "./commands/setup.js";
import {
  handleStartHunt,
  handleSelectLength,
  handleSelectCharset,
  handleCustomAffix,
  handleAffixModal,
  handleStartScan,
  handleStopScan,
  handleSendResults,
  handleSkipResults,
} from "./commands/hunt.js";
import { getSession, isOnCooldown } from "./store.js";
import { COOLDOWN_MS, SESSION_DURATION_MS } from "./config.js";

const TOKEN = process.env.DISCORD_BOT_TOKEN;
if (!TOKEN) {
  console.error("❌ DISCORD_BOT_TOKEN is not set!");
  process.exit(1);
}

const commands = [
  new SlashCommandBuilder()
    .setName("setup")
    .setDescription("إعداد بوت الصيد في هذا الروم (للأدمن فقط)")
    .toJSON(),
  new SlashCommandBuilder()
    .setName("status")
    .setDescription("تحقق من حالة جلستك والـ cooldown")
    .toJSON(),
  new SlashCommandBuilder()
    .setName("help")
    .setDescription("شرح كيفية استخدام البوت")
    .toJSON(),
];

const client = new Client({
  intents: [GatewayIntentBits.Guilds, GatewayIntentBits.GuildMessages],
  partials: [Partials.Channel],
});

client.once(Events.ClientReady, async (c) => {
  console.log(`✅ البوت جاهز: ${c.user.tag}`);
  const rest = new REST({ version: "10" }).setToken(TOKEN!);
  try {
    console.log("📝 تسجيل الأوامر...");
    await rest.put(Routes.applicationCommands(c.user.id), { body: commands });
    console.log("✅ تم تسجيل الأوامر!");
  } catch (err) {
    console.error("❌ خطأ في تسجيل الأوامر:", err);
  }
});

client.on(Events.InteractionCreate, async (interaction) => {
  try {
    if (interaction.isChatInputCommand()) {
      await handleCommand(interaction as ChatInputCommandInteraction);
    } else if (interaction.isButton()) {
      await handleButton(interaction as ButtonInteraction);
    } else if (interaction.isStringSelectMenu()) {
      await handleSelectMenu(interaction as StringSelectMenuInteraction);
    } else if (interaction.isModalSubmit()) {
      await handleModal(interaction as ModalSubmitInteraction);
    }
  } catch (err) {
    console.error("❌ خطأ في التفاعل:", err);
    try {
      const msg = { content: "❌ حدث خطأ. الرجاء المحاولة مرة أخرى.", ephemeral: true };
      if (interaction.isRepliable()) {
        if ("replied" in interaction && interaction.replied) {
          await (interaction as ChatInputCommandInteraction).followUp(msg);
        } else if ("deferred" in interaction && interaction.deferred) {
          await (interaction as ChatInputCommandInteraction).editReply(msg);
        } else {
          await (interaction as ChatInputCommandInteraction).reply(msg);
        }
      }
    } catch {}
  }
});

async function handleCommand(interaction: ChatInputCommandInteraction): Promise<void> {
  if (interaction.commandName === "setup") {
    await handleSetup(interaction);
    return;
  }

  if (interaction.commandName === "status") {
    const userId = interaction.user.id;
    const session = getSession(userId);
    const { onCooldown, remainingMs } = isOnCooldown(userId);
    const lines: string[] = [];

    if (session) {
      const elapsed = Date.now() - session.startedAt;
      const left = Math.max(0, SESSION_DURATION_MS - elapsed);
      const m = Math.floor(left / 60000);
      const s = Math.floor((left % 60000) / 1000);
      lines.push(`🟢 **جلسة نشطة** — وقت متبقٍ: **${m}:${s.toString().padStart(2, "0")}**`);
      lines.push(`> وجدنا حتى الآن: **${session.results.length}** يوزر`);
      lines.push(`> الحالة: ${session.running ? "⚡ يصيد الآن" : "⏸️ متوقف"}`);
    } else if (onCooldown) {
      const h = Math.floor(remainingMs / 3_600_000);
      const m = Math.floor((remainingMs % 3_600_000) / 60_000);
      lines.push(`🔴 **Cooldown نشط** — انتظر **${h}س ${m}د** للجلسة التالية`);
    } else {
      lines.push("✅ **جاهز!** لا يوجد cooldown — يمكنك بدء جلسة جديدة.");
    }

    const cooldownHours = COOLDOWN_MS / 3_600_000;
    const sessionMins = SESSION_DURATION_MS / 60_000;
    lines.push("");
    lines.push(`> مدة الجلسة: **${sessionMins}د**  |  Cooldown: **${cooldownHours}س**`);

    await interaction.reply({ content: lines.join("\n"), ephemeral: true });
    return;
  }

  if (interaction.commandName === "help") {
    await interaction.reply({
      content: [
        "## 📖 كيفية الاستخدام",
        "",
        "**الأوامر المتاحة:**",
        "> `/setup` — ينشر رسالة الصيد في الروم (أدمن فقط)",
        "> `/status` — يعرض حالة جلستك والـ cooldown",
        "> `/help` — هذه الرسالة",
        "",
        "**خطوات الصيد:**",
        "> ١. أدمن يشغّل `/setup` في أي روم",
        "> ٢. اضغط **🚀 ابدأ الصيد**",
        "> ٣. اختر طول اليوزر (3–6)",
        "> ٤. اختر نوع الحروف",
        "> ٥. أضف بادئة/لاحقة اختياري",
        "> ٦. شاهد الفحص مباشرة كـ terminal",
        "> ٧. استلم الملف بعد الانتهاء",
        "",
        "**ملاحظات:**",
        "> الفحص عشوائي — لا نمط ثابت",
        "> Cooldown 4 ساعات بين كل جلسة",
        "> أقصى 20 يوزر لكل جلسة",
      ].join("\n"),
      ephemeral: true,
    });
  }
}

async function handleButton(interaction: ButtonInteraction): Promise<void> {
  const id = interaction.customId;
  if (id === "start_hunt") await handleStartHunt(interaction);
  else if (id.startsWith("custom_affix:")) await handleCustomAffix(interaction);
  else if (id.startsWith("start_scan:")) await handleStartScan(interaction);
  else if (id.startsWith("stop_scan:")) await handleStopScan(interaction);
  else if (id.startsWith("send_results:")) await handleSendResults(interaction);
  else if (id.startsWith("skip_results:")) await handleSkipResults(interaction);
}

async function handleSelectMenu(interaction: StringSelectMenuInteraction): Promise<void> {
  const id = interaction.customId;
  if (id.startsWith("select_length:")) await handleSelectLength(interaction);
  else if (id.startsWith("select_charset:")) await handleSelectCharset(interaction);
}

async function handleModal(interaction: ModalSubmitInteraction): Promise<void> {
  if (interaction.customId.startsWith("affix_modal:")) await handleAffixModal(interaction);
}

console.log("🚀 يتم تشغيل البوت...");
client.login(TOKEN);
