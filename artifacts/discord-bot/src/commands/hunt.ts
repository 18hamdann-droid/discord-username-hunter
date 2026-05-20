import {
  ActionRowBuilder,
  ButtonBuilder,
  ButtonInteraction,
  ButtonStyle,
  ChannelType,
  EmbedBuilder,
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

export async function handleStartHunt(interaction: ButtonInteraction): Promise<void> {
  const userId = interaction.user.id;
  const guild = interaction.guild as Guild;

  const { onCooldown, remainingMs } = isOnCooldown(userId);
  if (onCooldown) {
    const hours = Math.floor(remainingMs / 3600000);
    const minutes = Math.floor((remainingMs % 3600000) / 60000);
    await interaction.reply({
      content: `⏳ أنت في cooldown! يجب الانتظار **${hours}h ${minutes}m** قبل جلسة جديدة.`,
      ephemeral: true,
    });
    return;
  }

  const existing = getSession(userId);
  if (existing) {
    await interaction.reply({
      content: "⚠️ لديك جلسة صيد نشطة بالفعل! اذهب للروم الخاص.",
      ephemeral: true,
    });
    return;
  }

  await interaction.deferReply({ ephemeral: true });

  const channel = await guild.channels.create({
    name: `hunt-${interaction.user.username}`,
    type: ChannelType.GuildText,
    permissionOverwrites: [
      {
        id: guild.roles.everyone.id,
        deny: [PermissionFlagsBits.ViewChannel],
      },
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

  const timeoutHandle = setTimeout(async () => {
    await closeSession(userId, channel as TextChannel, "timeout");
  }, SESSION_DURATION_MS);

  setSession(userId, {
    channelId: channel.id,
    guildId: guild.id,
    timeoutHandle,
    results: [],
    running: false,
    stopRequested: false,
  });

  await interaction.editReply({
    content: `✅ تم إنشاء رومك الخاص! اذهب إلى ${channel}`,
  });

  await sendHuntSetup(channel as TextChannel, interaction.user.id, interaction.user.username);
}

async function sendHuntSetup(
  channel: TextChannel,
  userId: string,
  username: string,
): Promise<void> {
  const embed = new EmbedBuilder()
    .setColor(0x57f287)
    .setTitle("🎯 إعداد جلسة الصيد")
    .setDescription(
      [
        `<@${userId}> مرحباً! جلستك جاهزة.`,
        "",
        "⏱️ **لديك 10 دقائق** قبل إغلاق هذا الروم تلقائياً.",
        "",
        "**اختر طول اليوزر المطلوب:**",
      ].join("\n"),
    )
    .setFooter({ text: `جلسة: ${username}` })
    .setTimestamp();

  const selectMenu = new StringSelectMenuBuilder()
    .setCustomId(`select_length:${userId}`)
    .setPlaceholder("اختر عدد الحروف")
    .addOptions([
      { label: "3 حروف", value: "3", description: "مثال: abc, xyz" },
      { label: "4 حروف", value: "4", description: "مثال: test, cool" },
      { label: "5 حروف", value: "5", description: "مثال: gamer, pixel" },
      { label: "6 حروف", value: "6", description: "مثال: hunter, finder" },
    ]);

  const row = new ActionRowBuilder<StringSelectMenuBuilder>().addComponents(selectMenu);

  await channel.send({ embeds: [embed], components: [row] });
}

export async function handleSelectLength(
  interaction: StringSelectMenuInteraction,
): Promise<void> {
  const [, ownerId] = interaction.customId.split(":");
  if (interaction.user.id !== ownerId) {
    await interaction.reply({ content: "❌ هذا الروم ليس لك.", ephemeral: true });
    return;
  }

  const length = parseInt(interaction.values[0], 10);

  const embed = new EmbedBuilder()
    .setColor(0x5865f2)
    .setTitle("🔤 اختر نوع الحروف")
    .setDescription(`اخترت **${length} حروف**. الآن اختر نوع الحروف المستخدمة:`);

  const selectMenu = new StringSelectMenuBuilder()
    .setCustomId(`select_charset:${ownerId}:${length}`)
    .setPlaceholder("اختر نوع الحروف")
    .addOptions([
      {
        label: "حروف فقط (a-z)",
        value: "letters",
        description: "مثال: abcd, wxyz",
        emoji: "🔡",
      },
      {
        label: "أرقام فقط (0-9)",
        value: "numbers",
        description: "مثال: 1234, 5678",
        emoji: "🔢",
      },
      {
        label: "حروف وأرقام",
        value: "all",
        description: "مثال: a1b2, x3y4",
        emoji: "🔣",
      },
    ]);

  const row = new ActionRowBuilder<StringSelectMenuBuilder>().addComponents(selectMenu);

  await interaction.update({ embeds: [embed], components: [row] });
}

export async function handleSelectCharset(
  interaction: StringSelectMenuInteraction,
): Promise<void> {
  const [, ownerId, lengthStr] = interaction.customId.split(":");
  if (interaction.user.id !== ownerId) {
    await interaction.reply({ content: "❌ هذا الروم ليس لك.", ephemeral: true });
    return;
  }

  const length = parseInt(lengthStr, 10);
  const charSetKey = interaction.values[0] as keyof typeof CHAR_SETS;
  const charSet = CHAR_SETS[charSetKey];

  const embed = new EmbedBuilder()
    .setColor(0x5865f2)
    .setTitle("✏️ بادئة أو لاحقة (اختياري)")
    .setDescription(
      [
        `اخترت: **${length} حروف** من نوع **${charSetKey}**`,
        "",
        "هل تريد تحديد بادئة أو لاحقة ثابتة؟",
        "مثال: بادئة `pro` → `proXX`",
        "",
        "اضغط **تخصيص** لإضافة بادئة/لاحقة، أو **ابدأ الآن** للبدء فوراً.",
      ].join("\n"),
    );

  const customBtn = new ButtonBuilder()
    .setCustomId(`custom_affix:${ownerId}:${length}:${charSetKey}`)
    .setLabel("✏️ تخصيص بادئة/لاحقة")
    .setStyle(ButtonStyle.Secondary);

  const startBtn = new ButtonBuilder()
    .setCustomId(`start_scan:${ownerId}:${length}:${charSetKey}::`)
    .setLabel("🚀 ابدأ الآن")
    .setStyle(ButtonStyle.Success);

  const row = new ActionRowBuilder<ButtonBuilder>().addComponents(customBtn, startBtn);

  await interaction.update({ embeds: [embed], components: [row] });
}

export async function handleCustomAffix(interaction: ButtonInteraction): Promise<void> {
  const [, ownerId, length, charSetKey] = interaction.customId.split(":");
  if (interaction.user.id !== ownerId) {
    await interaction.reply({ content: "❌ هذا الروم ليس لك.", ephemeral: true });
    return;
  }

  const modal = new ModalBuilder()
    .setCustomId(`affix_modal:${ownerId}:${length}:${charSetKey}`)
    .setTitle("تخصيص البادئة والاحقة");

  const prefixInput = new TextInputBuilder()
    .setCustomId("prefix")
    .setLabel("البادئة (اتركها فارغة إذا لم تريد)")
    .setStyle(TextInputStyle.Short)
    .setRequired(false)
    .setMaxLength(10)
    .setPlaceholder("مثال: pro");

  const suffixInput = new TextInputBuilder()
    .setCustomId("suffix")
    .setLabel("اللاحقة (اتركها فارغة إذا لم تريد)")
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

  const embed = new EmbedBuilder()
    .setColor(0x57f287)
    .setTitle("✅ الإعداد جاهز")
    .setDescription(
      [
        `**الطول:** ${length} حروف`,
        `**النوع:** ${charSetKey}`,
        prefix ? `**البادئة:** \`${prefix}\`` : "",
        suffix ? `**اللاحقة:** \`${suffix}\`` : "",
        "",
        "اضغط **ابدأ الصيد** للبدء!",
      ]
        .filter(Boolean)
        .join("\n"),
    );

  const startBtn = new ButtonBuilder()
    .setCustomId(`start_scan:${ownerId}:${length}:${charSetKey}:${prefix}:${suffix}`)
    .setLabel("🚀 ابدأ الصيد")
    .setStyle(ButtonStyle.Success);

  const row = new ActionRowBuilder<ButtonBuilder>().addComponents(startBtn);

  await interaction.reply({ embeds: [embed], components: [row] });
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
    await interaction.reply({ content: "❌ انتهت جلستك. الرجاء البدء من جديد.", ephemeral: true });
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

  const statusEmbed = new EmbedBuilder()
    .setColor(0xfee75c)
    .setTitle("🔍 جاري الصيد...")
    .setDescription(
      [
        `**الطول:** ${length} | **النوع:** ${charSetKey}`,
        prefix ? `**البادئة:** \`${prefix}\`` : "",
        suffix ? `**اللاحقة:** \`${suffix}\`` : "",
        "",
        "⏳ يبحث البوت عن اليوزرات المتاحة...",
        "سيظهر ✅ بجانب كل يوزر متاح.",
      ]
        .filter(Boolean)
        .join("\n"),
    );

  const stopBtn = new ButtonBuilder()
    .setCustomId(`stop_scan:${ownerId}`)
    .setLabel("⏹️ إيقاف")
    .setStyle(ButtonStyle.Danger);

  const stopRow = new ActionRowBuilder<ButtonBuilder>().addComponents(stopBtn);

  const statusMsg = await (interaction.channel as TextChannel).send({
    embeds: [statusEmbed],
    components: [stopRow],
  });

  const found: string[] = [];
  let checked = 0;

  const { generateUsernames } = await import("../username-checker.js");
  const generator = generateUsernames({ length, charSet, prefix, suffix });

  const RATE_LIMIT_DELAY = 500;
  const MAX_FOUND = 20;

  for (const username of generator) {
    if (session.stopRequested || !getSession(ownerId)) break;
    if (found.length >= MAX_FOUND) break;

    const available = await checkUsername(username);
    checked++;

    if (available) {
      found.push(username);
      session.results.push(username);

      await (interaction.channel as TextChannel).send(
        `✅ **متاح:** \`${username}\``,
      );
    }

    if (checked % 10 === 0) {
      const updatedEmbed = new EmbedBuilder()
        .setColor(0xfee75c)
        .setTitle("🔍 جاري الصيد...")
        .setDescription(
          [
            `**تم فحص:** ${checked} يوزر`,
            `**وجد:** ${found.length} متاح`,
            "",
            "⏳ لا يزال يبحث...",
          ].join("\n"),
        );

      await statusMsg.edit({ embeds: [updatedEmbed], components: [stopRow] }).catch(() => {});
    }

    await sleep(RATE_LIMIT_DELAY);
  }

  session.running = false;

  if (!getSession(ownerId)) return;

  await finishScan(interaction.channel as TextChannel, ownerId, found, checked);
}

export async function handleStopScan(interaction: ButtonInteraction): Promise<void> {
  const [, ownerId] = interaction.customId.split(":");
  if (interaction.user.id !== ownerId) {
    await interaction.reply({ content: "❌ هذا الروم ليس لك.", ephemeral: true });
    return;
  }

  const session = getSession(ownerId);
  if (!session || !session.running) {
    await interaction.reply({ content: "⚠️ لا يوجد صيد نشط.", ephemeral: true });
    return;
  }

  session.stopRequested = true;
  await interaction.reply({ content: "⏹️ جاري إيقاف الصيد..." });
}

async function finishScan(
  channel: TextChannel,
  userId: string,
  found: string[],
  checked: number,
): Promise<void> {
  if (found.length === 0) {
    const embed = new EmbedBuilder()
      .setColor(0xed4245)
      .setTitle("😔 لم يُعثر على يوزرات متاحة")
      .setDescription(
        `تم فحص **${checked}** يوزر ولم يُعثر على أي يوزر متاح.\nجرب إعدادات مختلفة!`,
      );

    await channel.send({ embeds: [embed] });
    setCooldown(userId);
    await closeSession(userId, channel, "done");
    return;
  }

  const embed = new EmbedBuilder()
    .setColor(0x57f287)
    .setTitle("🎉 انتهى الصيد!")
    .setDescription(
      [
        `تم فحص **${checked}** يوزر`,
        `وُجد **${found.length}** يوزر متاح ✅`,
        "",
        "**هل تريد استلام النتائج؟**",
        "",
        "📄 **JSON** — ملف بصيغة آلية مناسب للبرمجة والأتمتة",
        "📝 **TXT** — ملف نصي واضح تستطيع قراءته بسهولة",
      ].join("\n"),
    );

  const jsonBtn = new ButtonBuilder()
    .setCustomId(`send_results:${userId}:json`)
    .setLabel("📄 استلم JSON")
    .setStyle(ButtonStyle.Primary);

  const txtBtn = new ButtonBuilder()
    .setCustomId(`send_results:${userId}:txt`)
    .setLabel("📝 استلم TXT")
    .setStyle(ButtonStyle.Secondary);

  const skipBtn = new ButtonBuilder()
    .setCustomId(`skip_results:${userId}`)
    .setLabel("تخطي")
    .setStyle(ButtonStyle.Danger);

  const row = new ActionRowBuilder<ButtonBuilder>().addComponents(jsonBtn, txtBtn, skipBtn);

  await channel.send({ embeds: [embed], components: [row] });
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
    await interaction.reply({ content: "⚠️ لا توجد نتائج للإرسال.", ephemeral: true });
    return;
  }

  let fileContent: string;
  let fileName: string;
  let description: string;

  if (format === "json") {
    fileContent = JSON.stringify({ available_usernames: results, count: results.length, generated_at: new Date().toISOString() }, null, 2);
    fileName = "available_usernames.json";
    description = "📄 ملف **JSON** — يمكن استخدامه في البرمجة والأتمتة (`JSON.parse()`)";
  } else {
    fileContent = results.join("\n");
    fileName = "available_usernames.txt";
    description = "📝 ملف **TXT** — كل يوزر في سطر، سهل القراءة";
  }

  const buffer = Buffer.from(fileContent, "utf-8");

  await interaction.reply({
    content: `<@${ownerId}> إليك نتائجك!\n${description}`,
    files: [{ attachment: buffer, name: fileName }],
  });

  setCooldown(ownerId);

  setTimeout(async () => {
    const ch = interaction.channel as TextChannel;
    await closeSession(ownerId, ch, "done");
  }, 5000);
}

export async function handleSkipResults(interaction: ButtonInteraction): Promise<void> {
  const [, ownerId] = interaction.customId.split(":");
  if (interaction.user.id !== ownerId) {
    await interaction.reply({ content: "❌ هذا الروم ليس لك.", ephemeral: true });
    return;
  }

  await interaction.reply({ content: "سيتم إغلاق الروم خلال 5 ثواني..." });
  setCooldown(ownerId);

  setTimeout(async () => {
    const ch = interaction.channel as TextChannel;
    await closeSession(ownerId, ch, "done");
  }, 5000);
}

async function closeSession(
  userId: string,
  channel: TextChannel,
  reason: "timeout" | "done",
): Promise<void> {
  const msg =
    reason === "timeout"
      ? "⏰ انتهى وقت جلستك (10 دقائق). سيتم حذف هذا الروم تلقائياً."
      : "✅ تم إغلاق جلستك. شكراً لاستخدام بوت الصيد!";

  await channel.send(msg).catch(() => {});

  deleteSession(userId);

  setTimeout(async () => {
    await channel.delete().catch(() => {});
  }, 3000);
}
