import {
  ActionRowBuilder,
  ButtonBuilder,
  ButtonStyle,
  ChatInputCommandInteraction,
  EmbedBuilder,
  PermissionFlagsBits,
} from "discord.js";

export async function handleSetup(interaction: ChatInputCommandInteraction): Promise<void> {
  if (!interaction.memberPermissions?.has(PermissionFlagsBits.Administrator)) {
    await interaction.reply({
      content: "❌ هذا الأمر متاح للأونر والأدمن فقط.",
      ephemeral: true,
    });
    return;
  }

  const embed = new EmbedBuilder()
    .setColor(0x5865f2)
    .setTitle("🎯 بوت صيد اليوزرات")
    .setDescription(
      [
        "**مرحباً! هذا البوت يساعدك في إيجاد يوزرات Discord المتاحة.**",
        "",
        "**كيف يعمل؟**",
        "• اضغط على الزر أدناه لتبدأ جلسة صيد خاصة بك",
        "• سيُنشأ لك روم خاص تختار فيه إعدادات البحث",
        "• البوت يجرب اليوزرات واحداً تلو الآخر حتى يجد المتاح",
        "• عند الانتهاء يمكنك استلام النتائج كملف",
        "",
        "**القيود:**",
        "• ⏱️ كل جلسة مدتها **10 دقائق** فقط",
        "• ⏳ cooldown **4 ساعات** بين كل جلسة وأخرى",
        "",
        "**جاهز؟ اضغط الزر! 👇**",
      ].join("\n"),
    )
    .setFooter({ text: "Discord Username Hunter" })
    .setTimestamp();

  const button = new ButtonBuilder()
    .setCustomId("start_hunt")
    .setLabel("🚀 ابدأ الصيد")
    .setStyle(ButtonStyle.Primary);

  const row = new ActionRowBuilder<ButtonBuilder>().addComponents(button);

  await interaction.reply({ embeds: [embed], components: [row] });
}
