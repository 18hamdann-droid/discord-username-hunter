import {
  ActionRowBuilder,
  ButtonBuilder,
  ButtonStyle,
  ChatInputCommandInteraction,
  EmbedBuilder,
  PermissionFlagsBits,
} from "discord.js";
import { COOLDOWN_MS, MAX_FOUND, SESSION_DURATION_MS } from "../config.js";

export async function handleSetup(interaction: ChatInputCommandInteraction): Promise<void> {
  if (!interaction.memberPermissions?.has(PermissionFlagsBits.Administrator)) {
    await interaction.reply({
      content: "❌ هذا الأمر متاح للأونر والأدمن فقط.",
      ephemeral: true,
    });
    return;
  }

  const cooldownHours = COOLDOWN_MS / 3_600_000;
  const sessionMins = SESSION_DURATION_MS / 60_000;

  const embed = new EmbedBuilder()
    .setTitle("🎯  صيّاد يوزرات Discord")
    .setDescription(
      [
        "ابحث عن يوزرات Discord متاحة بشكل عشوائي وسريع.",
        "",
        "**كيف يعمل؟**",
        "> ١. اضغط الزر أدناه",
        "> ٢. اختر طول اليوزر ونوع الحروف",
        "> ٣. شاهد نتائج الفحص مباشرة كأنك في terminal",
        "> ٤. استلم اليوزرات المتاحة كملف JSON أو TXT",
      ].join("\n"),
    )
    .addFields(
      {
        name: "⚙️ الإعدادات",
        value: [
          `> ⏱️ مدة الجلسة: **${sessionMins} دقيقة**`,
          `> ⏳ Cooldown: **${cooldownHours} ساعات** بين كل جلسة`,
          `> 🎯 أقصى نتائج: **${MAX_FOUND} يوزر** لكل جلسة`,
        ].join("\n"),
        inline: false,
      },
      {
        name: "🔤 أطوال اليوزر",
        value: "> 3  •  4  •  5  •  6  حروف",
        inline: true,
      },
      {
        name: "🔣 أنواع الحروف",
        value: "> حروف  •  أرقام  •  الاثنان",
        inline: true,
      },
    )
    .setColor(0x5865f2)
    .setFooter({ text: "Discord Username Hunter v2.0 • عشوائي بالكامل" });

  const button = new ButtonBuilder()
    .setCustomId("start_hunt")
    .setLabel("🚀  ابدأ الصيد")
    .setStyle(ButtonStyle.Primary);

  const row = new ActionRowBuilder<ButtonBuilder>().addComponents(button);

  await interaction.reply({ embeds: [embed], components: [row] });
}
