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
import { SESSION_DURATION_MS } from "../config.js";
import {
  deleteSession,
  getSession,
  isOnCooldown,
  setCooldown,
  setSession,
} from "../store.js";
import { checkUsername, sleep } from "../username-checker.js";
import { CHAR_SETS } from "../config.js";

const SESSION_MINUTES = SESSION_DURATION_MS / 60000;

function formatTimeLeft(startedAt: number): string {
  const elapsed = Date.now() - startedAt;
  const left = Math.max(0, SESSION_DURATION_MS - elapsed);
  const m = Math.floor(left / 60000);
  const s = Math.floor((left % 60000) / 1000);
  return `${m}:${s.toString().padStart(2, "0")}`;
}

export async function handleStartHunt(interaction: ButtonInteraction): Promise<void> {
  const userId = interaction.user.id;
  const guild = interaction.guild as Guild;

  const { onCooldown, remainingMs } = isOnCooldown(userId);
  if (onCooldown) {
    const hours = Math.floor(remainingMs / 3600000);
    const minutes = Math.floor((remainingMs % 3600000) / 60000);
    await interaction.reply({
      content: `⏳ أنت في cooldown! انتظر **${hours}h ${minutes}m** قبل جلسة جديدة.`,
      ephemeral: true,
    });
    return;
  }

  const existing = getSession(userId);
  if (existing) {
    await interaction.reply({
      content: "⚠️ لديك جلسة نشطة بالفعل!",
      ephemeral: true,
    });
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
  const selectMenu = new StringSelectMenuBuilder()
    .setCustomId(`select_length:${userId}`)
    .setPlaceholder("اختر عدد الحروف")
    .addOptions([
      { label: "3 حروف", value: "3" },
      { label: "4 حروف", value: "4" },
      { label: "5 حروف", value: "5" },
      { label: "6 حروف", value: "6" },
    ]);

  const row = new ActionRowBuilder<StringSelectMenuBuilder>().addComponents(selectMenu);

  await channel.send({
    content: `<@${userId}> — ⏱️ **الوقت المتبقي: ${formatTimeLeft(startedAt)}**\n\nاختر طول اليوزر:`,
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

  const session = getSession(ownerId);
  const timeStr = session ? formatTimeLeft(session.startedAt) : "?";
  const length = parseInt(interaction.values[0], 10);

  const selectMenu = new StringSelectMenuBuilder()
    .setCustomId(`select_charset:${ownerId}:${length}`)
    .setPlaceholder("اختر نوع الحروف")
    .addOptions([
      { label: "حروف فقط (a-z)", value: "letters", emoji: "🔡" },
      { label: "أرقام فقط (0-9)", value: "numbers", emoji: "🔢" },
      { label: "حروف وأرقام", value: "all", emoji: "🔣" },
    ]);

  const row = new ActionRowBuilder<StringSelectMenuBuilder>().addComponents(selectMenu);

  await interaction.update({
    content: `⏱️ **${timeStr}** — اخترت **${length} حروف**. اختر نوع الحروف:`,
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

  const session = getSession(ownerId);
  const timeStr = session ? formatTimeLeft(session.startedAt) : "?";
  const length = parseInt(lengthStr, 10);
  const charSetKey = interaction.values[0] as keyof typeof CHAR_SETS;

  const customBtn = new ButtonBuilder()
    .setCustomId(`custom_affix:${ownerId}:${length}:${charSetKey}`)
    .setLabel("✏️ بادئة/لاحقة")
    .setStyle(ButtonStyle.Secondary);

  const startBtn = new ButtonBuilder()
    .setCustomId(`start_scan:${ownerId}:${length}:${charSetKey}::`)
    .setLabel("🚀 ابدأ الآن")
    .setStyle(ButtonStyle.Success);

  const row = new ActionRowBuilder<ButtonBuilder>().addComponents(customBtn, startBtn);

  await interaction.update({
    content: `⏱️ **${timeStr}** — **${length} حروف** | **${charSetKey}**\n\nبادئة/لاحقة؟ أو ابدأ مباشرة:`,
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

  const prefixInput = new TextInputBuilder()
    .setCustomId("prefix")
    .setLabel("البادئة (اختياري)")
    .setStyle(TextInputStyle.Short)
    .setRequired(false)
    .setMaxLength(10)
    .setPlaceholder("مثال: pro");

  const suffixInput = new TextInputBuilder()
    .setCustomId("suffix")
    .setLabel("اللاحقة (اختياري)")
    .setStyle(TextInputStyle.Short)
    .setRequired(false)
    .setMaxLength(10)
    .setPlaceholder("مثال: _gg");

  modal.addComponents(
    new ActionRowBuilder<TextInputBuilder>().addComponents(prefixInput),
    new ActionRowBuilder<TextInputBuilder>().addComponents(suffixInput),
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
  const timeStr = session ? formatTimeLeft(session.startedAt) : "?";

  const startBtn = new ButtonBuilder()
    .setCustomId(`start_scan:${ownerId}:${length}:${charSetKey}:${prefix}:${suffix}`)
    .setLabel("🚀 ابدأ الصيد")
    .setStyle(ButtonStyle.Success);

  const row = new ActionRowBuilder<ButtonBuilder>().addComponents(startBtn);

  const affixInfo = [prefix && `بادئة: \`${prefix}\``, suffix && `لاحقة: \`${suffix}\``]
    .filter(Boolean)
    .join(" | ");

  await interaction.reply({
    content: `⏱️ **${timeStr}** — **${length} حروف** | **${charSetKey}** | ${affixInfo}\n\nجاهز؟`,
    components: [row],
  });
}

export async function handleStartScan(interaction: ButtonInteraction): Promise<void> {
  const parts = interaction.customId.split(":");
  const ownerId = parts[1];
  const length = parseInt(parts[2], 10);
  const charSetKey = parts[3] as keyof typeof CHAR_SETS;
  const prefix = parts[4] || "";
  const suffix = parts[5] || "";

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
  await interaction.update({ components: [] });

  const channel = interaction.channel as TextChannel;
  const found: string[] = [];
  let checked = 0;
  let liveText = "";

  const buildStatusLine = () => {
    const timeStr = formatTimeLeft(session.startedAt);
    return `⏱️ **${timeStr}** | فحص: **${checked}** | متاح: **${found.length}**`;
  };

  const stopRow = new ActionRowBuilder<ButtonBuilder>().addComponents(
    new ButtonBuilder()
      .setCustomId(`stop_scan:${ownerId}`)
      .setLabel("⏹️ إيقاف وأخذ الملف")
      .setStyle(ButtonStyle.Danger),
  );

  const liveMsg = await channel.send({
    content: `${buildStatusLine()}\n\`\`\`\nجاري البدء...\n\`\`\``,
    components: [stopRow],
  });

  const RATE_LIMIT_DELAY = 500;
  const MAX_FOUND = 20;
  const LIVE_LINES = 10;

  const recentLines: string[] = [];

  const { generateUsernames } = await import("../username-checker.js");
  const generator = generateUsernames({ length, charSet, prefix, suffix });

  for (const username of generator) {
    if (session.stopRequested || !getSession(ownerId)) break;
    if (found.length >= MAX_FOUND) break;

    const available = await checkUsername(username);
    checked++;

    const mark = available ? "✅" : "❌";
    recentLines.push(`${mark} ${username}`);
    if (recentLines.length > LIVE_LINES) recentLines.shift();

    if (available) {
      found.push(username);
      session.results.push(username);
    }

    liveText = recentLines.join("\n");
    await liveMsg
      .edit({
        content: `${buildStatusLine()}\n\`\`\`\n${liveText}\n\`\`\``,
        components: [stopRow],
      })
      .catch(() => {});

    await sleep(RATE_LIMIT_DELAY);
  }

  session.running = false;

  if (!getSession(ownerId)) return;

  await liveMsg.edit({ content: buildStatusLine(), components: [] }).catch(() => {});
  await finishScan(channel, ownerId, found, checked);
}

export async function handleStopScan(interaction: ButtonInteraction): Promise<void> {
  const [, ownerId] = interaction.customId.split(":");
  if (interaction.user.id !== ownerId) {
    await interaction.reply({ content: "❌ هذا الروم ليس لك.", ephemeral: true });
    return;
  }

  const session = getSession(ownerId);
  if (!session) {
    await interaction.reply({ content: "⚠️ لا يوجد جلسة نشطة.", ephemeral: true });
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
): Promise<void> {
  if (found.length === 0) {
    await channel.send(`❌ تم فحص **${checked}** يوزر — لم يُعثر على أي متاح.`);
    setCooldown(userId);
    await closeSession(userId, channel, "done");
    return;
  }

  const jsonBtn = new ButtonBuilder()
    .setCustomId(`send_results:${userId}:json`)
    .setLabel("📄 JSON")
    .setStyle(ButtonStyle.Primary);

  const txtBtn = new ButtonBuilder()
    .setCustomId(`send_results:${userId}:txt`)
    .setLabel("📝 TXT")
    .setStyle(ButtonStyle.Secondary);

  const skipBtn = new ButtonBuilder()
    .setCustomId(`skip_results:${userId}`)
    .setLabel("تخطي")
    .setStyle(ButtonStyle.Danger);

  const row = new ActionRowBuilder<ButtonBuilder>().addComponents(jsonBtn, txtBtn, skipBtn);

  await channel.send({
    content: [
      `🎉 انتهى الصيد! فحصت **${checked}** — وجدت **${found.length}** متاح ✅`,
      "",
      "استلم النتائج:",
      "📄 **JSON** — للبرامج والأكواد",
      "📝 **TXT** — نص واضح تقرأه مباشرة",
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
      { available_usernames: results, count: results.length, at: new Date().toISOString() },
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
      const fileContent = results.join("\n");
      await channel
        .send({
          content: `⏰ انتهى وقت جلستك! إليك ما وجدناه (${results.length} يوزر):`,
          files: [{ attachment: Buffer.from(fileContent, "utf-8"), name: "usernames.txt" }],
        })
        .catch(() => {});
    } else {
      await channel.send("⏰ انتهى وقت جلستك.").catch(() => {});
    }
    setCooldown(userId);
  }

  deleteSession(userId);
  setTimeout(() => channel.delete().catch(() => {}), 3000);
}
