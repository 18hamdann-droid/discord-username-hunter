import {
  ActionRowBuilder,
  ButtonBuilder,
  ButtonInteraction,
  ButtonStyle,
  ChannelType,
  Guild,
  ModalBuilder,
  ModalSubmitInteraction,
  PermissionFlagsBits,
  StringSelectMenuBuilder,
  StringSelectMenuInteraction,
  TextChannel,
  TextInputBuilder,
  TextInputStyle,
} from "discord.js";
import {
  CHAR_SETS,
  MAX_CHECKED,
  MAX_FOUND,
  RATE_LIMIT_DELAY_MS,
  SESSION_DURATION_MS,
  UPDATE_EVERY,
} from "../config.js";
import {
  deleteSession,
  getSession,
  isOnCooldown,
  setCooldown,
  setSession,
} from "../store.js";
import {
  checkUsername,
  generateRandomUsernames,
  sleep,
  totalCombinations,
} from "../username-checker.js";

const R = "\x1b[0m";
const BOLD = "\x1b[1m";
const GREEN = "\x1b[32m";
const YELLOW = "\x1b[33m";
const CYAN = "\x1b[36m";
const WHITE = "\x1b[37m";
const GRAY = "\x1b[2;37m";
const BOLD_GREEN = "\x1b[1;32m";
const BOLD_CYAN = "\x1b[1;36m";
const BOLD_YELLOW = "\x1b[1;33m";
const DIM_RED = "\x1b[2;31m";

function nowStr(): string {
  return new Date().toLocaleTimeString("en-GB", { hour12: false });
}

function formatTimeLeft(startedAt: number): string {
  const left = Math.max(0, SESSION_DURATION_MS - (Date.now() - startedAt));
  const m = Math.floor(left / 60000);
  const s = Math.floor((left % 60000) / 1000);
  return `${m}:${s.toString().padStart(2, "0")}`;
}

function formatSpeed(checked: number, scanStart: number): string {
  const elapsed = (Date.now() - scanStart) / 1000;
  return elapsed > 1 ? (checked / elapsed).toFixed(1) : "—";
}

function fmtTotal(n: number): string {
  if (n >= 1_000_000) return `${(n / 1_000_000).toFixed(1)}M`;
  if (n >= 1000) return `${(n / 1000).toFixed(1)}K`;
  return `${n}`;
}

interface ScanConfig {
  length: number;
  charSetKey: string;
  prefix: string;
  suffix: string;
}

interface ScanStats {
  checked: number;
  found: number;
  startedAt: number;
  scanStart: number;
  total: number;
}

function buildTerminal(cfg: ScanConfig, lines: string[], stats: ScanStats): string {
  const parts = [
    `${BOLD_YELLOW}${cfg.length} حروف${R}`,
    `${BOLD_YELLOW}${cfg.charSetKey}${R}`,
    cfg.prefix ? `بادئة: ${BOLD}${cfg.prefix}${R}` : null,
    cfg.suffix ? `لاحقة: ${BOLD}${cfg.suffix}${R}` : null,
  ].filter(Boolean);

  const cfgLine = parts.join(`  ${GRAY}│${R}  `);
  const W = 44;
  const sep = `${BOLD_CYAN}${"─".repeat(W)}${R}`;

  const header = [
    `${BOLD_CYAN}╔${"═".repeat(W)}╗${R}`,
    `${BOLD_CYAN}║${R}  ${BOLD}${WHITE}DISCORD USERNAME HUNTER${R}  ${GRAY}v2.0${R}  ${BOLD_CYAN}║${R}`,
    `${BOLD_CYAN}╠${"═".repeat(W)}╣${R}`,
    `${BOLD_CYAN}║${R}  ${cfgLine}`,
    `${BOLD_CYAN}╚${"═".repeat(W)}╝${R}`,
    "",
  ].join("\n");

  const body = lines.join("\n");

  const footer = [
    "",
    sep,
    [
      `${BOLD}⚡ ${formatSpeed(stats.checked, stats.scanStart)}/ث${R}`,
      `${CYAN}فحص: ${BOLD}${stats.checked}${R}`,
      `${GREEN}وجدنا: ${BOLD_GREEN}${stats.found}${R}${GREEN}/${MAX_FOUND}${R}`,
      `${YELLOW}⏱ ${formatTimeLeft(stats.startedAt)}${R}`,
      `${GRAY}مجموع: ${fmtTotal(stats.total)}${R}`,
    ].join(`  ${GRAY}│${R}  `),
  ].join("\n");

  return `\`\`\`ansi\n${header}${body}${footer}\n\`\`\``;
}

export async function handleStartHunt(interaction: ButtonInteraction): Promise<void> {
  const userId = interaction.user.id;
  const guild = interaction.guild as Guild;

  const { onCooldown, remainingMs } = isOnCooldown(userId);
  if (onCooldown) {
    const h = Math.floor(remainingMs / 3_600_000);
    const m = Math.floor((remainingMs % 3_600_000) / 60_000);
    await interaction.reply({
      content: `⏳ أنت في cooldown — انتظر **${h}س ${m}د** قبل جلسة جديدة.`,
      ephemeral: true,
    });
    return;
  }

  if (getSession(userId)) {
    await interaction.reply({ content: "⚠️ لديك جلسة نشطة بالفعل!", ephemeral: true });
    return;
  }

  await interaction.deferReply({ ephemeral: true });

  const channel = await guild.channels.create({
    name: `hunt-${interaction.user.username}`,
    type: ChannelType.GuildText,
    permissionOverwrites: [
      { id: guild.roles.everyone.id, deny: [PermissionFlagsBits.ViewChannel] },
      {
        id: userId,
        allow: [
          PermissionFlagsBits.ViewChannel,
          PermissionFlagsBits.SendMessages,
          PermissionFlagsBits.ReadMessageHistory,
        ],
      },
      {
        id: interaction.client.user!.id,
        allow: [
          PermissionFlagsBits.ViewChannel,
          PermissionFlagsBits.SendMessages,
          PermissionFlagsBits.ManageChannels,
          PermissionFlagsBits.EmbedLinks,
          PermissionFlagsBits.AttachFiles,
        ],
      },
    ],
  });

  const startedAt = Date.now();
  const timeoutHandle = setTimeout(async () => {
    await closeSession(userId, channel as TextChannel, "timeout");
  }, SESSION_DURATION_MS);

  setSession(userId, {
    channelId: channel.id,
    guildId: guild.id,
    timeoutHandle,
    startedAt,
    results: [],
    running: false,
    stopRequested: false,
  });

  await interaction.editReply({ content: `✅ رومك جاهز! ${channel}` });
  await sendHuntSetup(channel as TextChannel, userId, startedAt);
}

async function sendHuntSetup(
  channel: TextChannel,
  userId: string,
  startedAt: number,
): Promise<void> {
  const row = new ActionRowBuilder<StringSelectMenuBuilder>().addComponents(
    new StringSelectMenuBuilder()
      .setCustomId(`select_length:${userId}`)
      .setPlaceholder("اختر عدد الحروف")
      .addOptions([
        { label: "3 حروف", value: "3", description: "أسرع — مجال صغير" },
        { label: "4 حروف", value: "4", description: "متوازن ومريح" },
        { label: "5 حروف", value: "5", description: "أطول — احتمال أعلى" },
        { label: "6 حروف", value: "6", description: "فرصة كبيرة" },
      ]),
  );

  await channel.send({
    content: `<@${userId}>  ⏱️ **${formatTimeLeft(startedAt)}**\n\n### اختر طول اليوزر:`,
    components: [row],
  });
}

export async function handleSelectLength(
  interaction: StringSelectMenuInteraction,
): Promise<void> {
  const [, ownerId] = interaction.customId.split(":");
  if (interaction.user.id !== ownerId) {
    await interaction.reply({ content: "❌ هذا الروم ليس لك.", ephemeral: true });
    return;
  }

  const length = parseInt(interaction.values[0]!, 10);
  const session = getSession(ownerId);

  const row = new ActionRowBuilder<StringSelectMenuBuilder>().addComponents(
    new StringSelectMenuBuilder()
      .setCustomId(`select_charset:${ownerId}:${length}`)
      .setPlaceholder("اختر نوع الحروف")
      .addOptions([
        { label: "حروف فقط  (a–z)", value: "letters", emoji: "🔡" },
        { label: "أرقام فقط  (0–9)", value: "numbers", emoji: "🔢" },
        { label: "حروف وأرقام", value: "all", emoji: "🔣" },
      ]),
  );

  await interaction.update({
    content: `⏱️ **${session ? formatTimeLeft(session.startedAt) : "?"}**  —  **${length} حروف**\n\n### اختر نوع الحروف:`,
    components: [row],
  });
}

export async function handleSelectCharset(
  interaction: StringSelectMenuInteraction,
): Promise<void> {
  const [, ownerId, lengthStr] = interaction.customId.split(":");
  if (interaction.user.id !== ownerId) {
    await interaction.reply({ content: "❌ هذا الروم ليس لك.", ephemeral: true });
    return;
  }

  const length = parseInt(lengthStr!, 10);
  const charSetKey = interaction.values[0] as keyof typeof CHAR_SETS;
  const session = getSession(ownerId);
  const total = totalCombinations({ length, charSet: CHAR_SETS[charSetKey] });

  const row = new ActionRowBuilder<ButtonBuilder>().addComponents(
    new ButtonBuilder()
      .setCustomId(`custom_affix:${ownerId}:${length}:${charSetKey}`)
      .setLabel("✏️ بادئة / لاحقة")
      .setStyle(ButtonStyle.Secondary),
    new ButtonBuilder()
      .setCustomId(`start_scan:${ownerId}:${length}:${charSetKey}::`)
      .setLabel("🚀 ابدأ الصيد")
      .setStyle(ButtonStyle.Success),
  );

  await interaction.update({
    content: [
      `⏱️ **${session ? formatTimeLeft(session.startedAt) : "?"}**  —  **${length} حروف**  |  **${charSetKey}**  |  مجموع: **${fmtTotal(total)}** تركيبة`,
      "",
      "أضف بادئة/لاحقة أو ابدأ مباشرة:",
    ].join("\n"),
    components: [row],
  });
}

export async function handleCustomAffix(interaction: ButtonInteraction): Promise<void> {
  const [, ownerId, length, charSetKey] = interaction.customId.split(":");
  if (interaction.user.id !== ownerId) {
    await interaction.reply({ content: "❌ هذا الروم ليس لك.", ephemeral: true });
    return;
  }

  const modal = new ModalBuilder()
    .setCustomId(`affix_modal:${ownerId}:${length}:${charSetKey}`)
    .setTitle("بادئة / لاحقة");

  modal.addComponents(
    new ActionRowBuilder<TextInputBuilder>().addComponents(
      new TextInputBuilder()
        .setCustomId("prefix")
        .setLabel("البادئة (اختياري)")
        .setStyle(TextInputStyle.Short)
        .setRequired(false)
        .setMaxLength(10)
        .setPlaceholder("مثال: pro"),
    ),
    new ActionRowBuilder<TextInputBuilder>().addComponents(
      new TextInputBuilder()
        .setCustomId("suffix")
        .setLabel("اللاحقة (اختياري)")
        .setStyle(TextInputStyle.Short)
        .setRequired(false)
        .setMaxLength(10)
        .setPlaceholder("مثال: _gg"),
    ),
  );

  await interaction.showModal(modal);
}

export async function handleAffixModal(interaction: ModalSubmitInteraction): Promise<void> {
  const [, ownerId, length, charSetKey] = interaction.customId.split(":");
  if (interaction.user.id !== ownerId) {
    await interaction.reply({ content: "❌ هذا الروم ليس لك.", ephemeral: true });
    return;
  }

  const prefix = interaction.fields.getTextInputValue("prefix").trim();
  const suffix = interaction.fields.getTextInputValue("suffix").trim();
  const session = getSession(ownerId);
  const affixInfo = [prefix && `بادئة: \`${prefix}\``, suffix && `لاحقة: \`${suffix}\``]
    .filter(Boolean)
    .join("  |  ");

  const row = new ActionRowBuilder<ButtonBuilder>().addComponents(
    new ButtonBuilder()
      .setCustomId(`start_scan:${ownerId}:${length}:${charSetKey}:${prefix}:${suffix}`)
      .setLabel("🚀 ابدأ الصيد")
      .setStyle(ButtonStyle.Success),
  );

  await interaction.reply({
    content: `⏱️ **${session ? formatTimeLeft(session.startedAt) : "?"}**  —  **${length} حروف**  |  **${charSetKey}**  |  ${affixInfo}\n\nجاهز؟`,
    components: [row],
  });
}

export async function handleStartScan(interaction: ButtonInteraction): Promise<void> {
  const parts = interaction.customId.split(":");
  const ownerId = parts[1]!;
  const length = parseInt(parts[2]!, 10);
  const charSetKey = parts[3] as keyof typeof CHAR_SETS;
  const prefix = parts[4] ?? "";
  const suffix = parts[5] ?? "";

  if (interaction.user.id !== ownerId) {
    await interaction.reply({ content: "❌ هذا الروم ليس لك.", ephemeral: true });
    return;
  }

  const session = getSession(ownerId);
  if (!session) {
    await interaction.reply({ content: "❌ انتهت جلستك.", ephemeral: true });
    return;
  }
  if (session.running) {
    await interaction.reply({ content: "⚠️ الصيد جارٍ بالفعل!", ephemeral: true });
    return;
  }

  session.running = true;
  session.results = [];
  session.stopRequested = false;

  const charSet = CHAR_SETS[charSetKey];
  const total = totalCombinations({ length, charSet, prefix, suffix });

  await interaction.update({ components: [] });

  const channel = interaction.channel as TextChannel;
  const found: string[] = [];
  let checked = 0;
  const scanStart = Date.now();
  const recentLines: string[] = [];

  const cfg: ScanConfig = { length, charSetKey, prefix, suffix };
  const mkStats = (): ScanStats => ({
    checked,
    found: found.length,
    startedAt: session.startedAt,
    scanStart,
    total,
  });

  const stopRow = new ActionRowBuilder<ButtonBuilder>().addComponents(
    new ButtonBuilder()
      .setCustomId(`stop_scan:${ownerId}`)
      .setLabel("⏹️ إيقاف")
      .setStyle(ButtonStyle.Danger),
  );

  const liveMsg = await channel.send({
    content: buildTerminal(cfg, [`${GRAY}[${nowStr()}]${R}  ${YELLOW}جاري التهيئة...${R}`], mkStats()),
    components: [stopRow],
  });

  const generator = generateRandomUsernames({ length, charSet, prefix, suffix });

  for (const username of generator) {
    if (session.stopRequested || !getSession(ownerId)) break;
    if (found.length >= MAX_FOUND || checked >= MAX_CHECKED) break;

    const available = await checkUsername(username);
    checked++;

    if (available) {
      found.push(username);
      session.results.push(username);
      recentLines.push(
        `${GRAY}[${nowStr()}]${R}  ${BOLD_GREEN}✓  ${username}${R}  ${GREEN}→ متاح! ⭐${R}`,
      );
    } else {
      recentLines.push(`${GRAY}[${nowStr()}]${R}  ${DIM_RED}✗  ${username}${R}`);
    }

    if (recentLines.length > 12) recentLines.shift();

    if (checked % UPDATE_EVERY === 0) {
      await liveMsg
        .edit({ content: buildTerminal(cfg, [...recentLines], mkStats()), components: [stopRow] })
        .catch(() => {});
    }

    await sleep(RATE_LIMIT_DELAY_MS);
  }

  session.running = false;
  if (!getSession(ownerId)) return;

  await liveMsg
    .edit({ content: buildTerminal(cfg, [...recentLines], mkStats()), components: [] })
    .catch(() => {});

  await finishScan(channel, ownerId, found, checked, scanStart);
}

export async function handleStopScan(interaction: ButtonInteraction): Promise<void> {
  const [, ownerId] = interaction.customId.split(":");
  if (interaction.user.id !== ownerId) {
    await interaction.reply({ content: "❌ هذا الروم ليس لك.", ephemeral: true });
    return;
  }

  const session = getSession(ownerId);
  if (!session) {
    await interaction.reply({ content: "⚠️ لا توجد جلسة نشطة.", ephemeral: true });
    return;
  }

  session.stopRequested = true;
  await interaction.reply({ content: "⏹️ جاري الإيقاف..." });
}

async function finishScan(
  channel: TextChannel,
  userId: string,
  found: string[],
  checked: number,
  scanStart: number,
): Promise<void> {
  const elapsed = ((Date.now() - scanStart) / 1000).toFixed(1);
  const speed = (checked / ((Date.now() - scanStart) / 1000)).toFixed(1);

  if (found.length === 0) {
    await channel.send(
      `❌ فحصت **${checked}** يوزر في **${elapsed}ث**  —  لم يُعثر على أي متاح.\n> جرب طول أو نوع حروف مختلف!`,
    );
    setCooldown(userId);
    await closeSession(userId, channel, "done");
    return;
  }

  const preview = found
    .slice(0, 5)
    .map((u) => `\`${u}\``)
    .join("  ");
  const more = found.length > 5 ? `  +${found.length - 5} أخرى` : "";

  const row = new ActionRowBuilder<ButtonBuilder>().addComponents(
    new ButtonBuilder()
      .setCustomId(`send_results:${userId}:json`)
      .setLabel("📄 JSON")
      .setStyle(ButtonStyle.Primary),
    new ButtonBuilder()
      .setCustomId(`send_results:${userId}:txt`)
      .setLabel("📝 TXT")
      .setStyle(ButtonStyle.Secondary),
    new ButtonBuilder()
      .setCustomId(`skip_results:${userId}`)
      .setLabel("تخطي")
      .setStyle(ButtonStyle.Danger),
  );

  await channel.send({
    content: [
      `## 🎉 انتهى الصيد!`,
      `> فحصت **${checked}** يوزر  •  سرعة **${speed}/ث**  •  وجدنا **${found.length}** متاح  •  وقت: **${elapsed}ث**`,
      "",
      `**معاينة:** ${preview}${more}`,
      "",
      "استلم النتائج:",
      "> 📄 **JSON** — للبرامج والأكواد",
      "> 📝 **TXT** — نص واضح تقرأه مباشرة",
    ].join("\n"),
    components: [row],
  });
}

export async function handleSendResults(interaction: ButtonInteraction): Promise<void> {
  const [, ownerId, format] = interaction.customId.split(":");
  if (interaction.user.id !== ownerId) {
    await interaction.reply({ content: "❌ هذا الروم ليس لك.", ephemeral: true });
    return;
  }

  const session = getSession(ownerId);
  const results = session?.results ?? [];

  if (results.length === 0) {
    await interaction.reply({ content: "⚠️ لا توجد نتائج.", ephemeral: true });
    return;
  }

  let fileContent: string;
  let fileName: string;
  let note: string;

  if (format === "json") {
    fileContent = JSON.stringify(
      {
        available_usernames: results,
        count: results.length,
        generated_at: new Date().toISOString(),
      },
      null,
      2,
    );
    fileName = "usernames.json";
    note = "📄 **JSON** — استخدمه في كودك بـ `JSON.parse()`";
  } else {
    fileContent = results.join("\n");
    fileName = "usernames.txt";
    note = "📝 **TXT** — كل يوزر في سطر، سهل القراءة";
  }

  await interaction.reply({
    content: `<@${ownerId}> ${note}`,
    files: [{ attachment: Buffer.from(fileContent, "utf-8"), name: fileName }],
  });

  setCooldown(ownerId);
  setTimeout(() => closeSession(ownerId, interaction.channel as TextChannel, "done"), 5000);
}

export async function handleSkipResults(interaction: ButtonInteraction): Promise<void> {
  const [, ownerId] = interaction.customId.split(":");
  if (interaction.user.id !== ownerId) {
    await interaction.reply({ content: "❌ هذا الروم ليس لك.", ephemeral: true });
    return;
  }

  await interaction.reply({ content: "سيتم إغلاق الروم خلال 5 ثواني..." });
  setCooldown(ownerId);
  setTimeout(() => closeSession(ownerId, interaction.channel as TextChannel, "done"), 5000);
}

async function closeSession(
  userId: string,
  channel: TextChannel,
  reason: "timeout" | "done",
): Promise<void> {
  if (reason === "timeout") {
    const session = getSession(userId);
    const results = session?.results ?? [];
    if (results.length > 0) {
      await channel
        .send({
          content: `⏰ انتهى وقت جلستك! وجدنا **${results.length}** يوزر متاح:`,
          files: [{ attachment: Buffer.from(results.join("\n"), "utf-8"), name: "usernames.txt" }],
        })
        .catch(() => {});
    } else {
      await channel.send("⏰ انتهى وقت جلستك بدون نتائج.").catch(() => {});
    }
    setCooldown(userId);
  }

  deleteSession(userId);
  setTimeout(() => channel.delete().catch(() => {}), 3000);
}
