import { logger } from '../utils/logger.js';
import { RateLimiter } from '../utils/logger.js';
import { handleButton, handleModal, handleSelectMenu } from '../handlers/interactions.js';
import { errorEmbed } from '../utils/embeds.js';

const rateLimiter = new RateLimiter();

export default {
  name: 'interactionCreate',
  async execute(client, interaction) {
    try {
      if (interaction.isChatInputCommand()) {
        const command = client.commands.get(interaction.commandName);
        if (!command) return;

        const key = `${interaction.guildId}:${interaction.user.id}:${interaction.commandName}`;
        if (!rateLimiter.check(key, 5, 60000)) {
          return interaction.reply({ embeds: [errorEmbed('Você está usando comandos muito rápido! Aguarde alguns segundos.')], ephemeral: true });
        }

        logger.info('CMD', `/${interaction.commandName} por ${interaction.user.tag}`, { guildId: interaction.guildId });
        await command.execute(interaction, client);
      }

      else if (interaction.isAutocomplete()) {
        const command = client.commands.get(interaction.commandName);
        if (command?.autocomplete) {
          await command.autocomplete(interaction, client);
        } else {
          await interaction.respond([]).catch(() => {});
        }
      }

      else if (interaction.isStringSelectMenu()) {
        await handleSelectMenu(client, interaction);
      }

      else if (interaction.isButton()) {
        await handleButton(client, interaction);
      }

      else if (interaction.isModalSubmit()) {
        await handleModal(client, interaction);
      }

    } catch (error) {
      logger.error('INTERACTION', 'Erro na interação', {
        error: error.message,
        stack: error.stack,
        id: interaction.customId || interaction.commandName,
      });

      if (interaction.isAutocomplete()) {
        await interaction.respond([]).catch(() => {});
        return;
      }

      const reply = { embeds: [errorEmbed(`Erro inesperado: ${error.message}`)], ephemeral: true };
      try {
        if (interaction.replied || interaction.deferred) await interaction.followUp(reply);
        else await interaction.reply(reply);
      } catch {}
    }
  }
};
