import {
  ActionRowBuilder,
  ButtonBuilder,
  ButtonStyle,
  ChatInputCommandInteraction,
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

  const button = new ButtonBuilder()
    .setCustomId("start_hunt")
    .setLabel("اضغط هنا للبدأ")
    .setStyle(ButtonStyle.Primary);

  const row = new ActionRowBuilder<ButtonBuilder>().addComponents(button);

  await interaction.reply({
    content: "## بوت صيد يوزرات ديسكورد",
    components: [row],
  });
}
