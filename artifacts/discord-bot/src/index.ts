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

const TOKEN = process.env.DISCORD_BOT_TOKEN;
if (!TOKEN) {
  console.error("❌ DISCORD_BOT_TOKEN is not set!");
  process.exit(1);
}

const commands = [
  new SlashCommandBuilder()
    .setName("setup")
    .setDescription("إعداد بوت الصيد في هذا الروم (للأونر فقط)")
    .toJSON(),
];

const client = new Client({
  intents: [
    GatewayIntentBits.Guilds,
    GatewayIntentBits.GuildMessages,
  ],
  partials: [Partials.Channel],
});

client.once(Events.ClientReady, async (c) => {
  console.log(`✅ البوت جاهز! تسجيل دخول بـ: ${c.user.tag}`);

  const rest = new REST({ version: "10" }).setToken(TOKEN!);

  try {
    console.log("📝 يتم تسجيل الأوامر...");
    await rest.put(Routes.applicationCommands(c.user.id), { body: commands });
    console.log("✅ تم تسجيل الأوامر بنجاح!");
  } catch (error) {
    console.error("❌ خطأ في تسجيل الأوامر:", error);
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
  } catch (error) {
    console.error("❌ خطأ في معالجة التفاعل:", error);
    try {
      const reply = { content: "❌ حدث خطأ. الرجاء المحاولة مرة أخرى.", ephemeral: true };
      if (interaction.isRepliable()) {
        if ("replied" in interaction && interaction.replied) {
          await (interaction as ChatInputCommandInteraction).followUp(reply);
        } else if ("deferred" in interaction && interaction.deferred) {
          await (interaction as ChatInputCommandInteraction).editReply(reply);
        } else {
          await (interaction as ChatInputCommandInteraction).reply(reply);
        }
      }
    } catch {}
  }
});

async function handleCommand(interaction: ChatInputCommandInteraction): Promise<void> {
  if (interaction.commandName === "setup") {
    await handleSetup(interaction);
  }
}

async function handleButton(interaction: ButtonInteraction): Promise<void> {
  const id = interaction.customId;

  if (id === "start_hunt") {
    await handleStartHunt(interaction);
  } else if (id.startsWith("custom_affix:")) {
    await handleCustomAffix(interaction);
  } else if (id.startsWith("start_scan:")) {
    await handleStartScan(interaction);
  } else if (id.startsWith("stop_scan:")) {
    await handleStopScan(interaction);
  } else if (id.startsWith("send_results:")) {
    await handleSendResults(interaction);
  } else if (id.startsWith("skip_results:")) {
    await handleSkipResults(interaction);
  }
}

async function handleSelectMenu(interaction: StringSelectMenuInteraction): Promise<void> {
  const id = interaction.customId;

  if (id.startsWith("select_length:")) {
    await handleSelectLength(interaction);
  } else if (id.startsWith("select_charset:")) {
    await handleSelectCharset(interaction);
  }
}

async function handleModal(interaction: ModalSubmitInteraction): Promise<void> {
  const id = interaction.customId;

  if (id.startsWith("affix_modal:")) {
    await handleAffixModal(interaction);
  }
}

console.log("🚀 يتم تشغيل البوت...");
client.login(TOKEN);
