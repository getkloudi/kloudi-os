import fs from 'fs/promises';
import path from 'path';
import Handlebars from 'handlebars';
import { loadPrompt } from 'braintrust';
import { Config } from '@kloudi/shared/config';

/**
 * PromptManager - Shared template system for LLM prompts across all tools
 */
export class PromptManager {
  constructor(promptsBaseDir) {
    this.promptsBaseDir = promptsBaseDir || null;

    // Register common helpers
    this.registerDefaultHelpers();
  }

  /**
   * Register default Handlebars helpers used across all tools
   */
  registerDefaultHelpers() {
    Handlebars.registerHelper('json', (context) =>
      JSON.stringify(context, null, 2)
    );

    Handlebars.registerHelper('truncate', (text, length = 2000) =>
      text?.length > length
        ? text.slice(0, length) + '\n...[truncated]'
        : text || ''
    );

    Handlebars.registerHelper('unless', function (conditional, options) {
      if (!conditional) {
        return options.fn(this);
      } else {
        return options.inverse(this);
      }
    });

    // Equality helper for conditionals
    Handlebars.registerHelper('eq', function (a, b) {
      return a === b;
    });
  }

  /**
   * Register partials from a partials directory
   * @param {string} partialsDir - Directory containing partial templates
   */
  async registerPartials(partialsDir) {
    try {
      const files = await fs.readdir(partialsDir);
      for (const file of files) {
        if (file.endsWith('.hbs')) {
          const partialName = file.replace('.hbs', '');
          const partialPath = path.join(partialsDir, file);
          const partialSource = await fs.readFile(partialPath, 'utf8');
          Handlebars.registerPartial(partialName, partialSource);
        }
      }
    } catch (error) {
      // Partials directory may not exist, which is fine
      if (error.code !== 'ENOENT') {
        throw error;
      }
    }
  }

  /**
   * Render a template with data
   * @param {string} templatePath - Full path to the template file
   * @param {object} data - Data to pass to the template
   */
  async render(templateName, data = {}) {
    try {
      // Register partials if they exist
      const partialsDir = path.join(this.promptsBaseDir, 'partials');
      await this.registerPartials(partialsDir);

      const templatePath = path.join(
        this.promptsBaseDir,
        `${templateName}.hbs`
      );
      const templateSource = await fs.readFile(templatePath, 'utf8');
      const template = Handlebars.compile(templateSource);
      return template(data);
    } catch (error) {
      throw new Error(
        `Failed to render template ${templateName}: ${error.message}`
      );
    }
  }

  /**
   * Render a template by name from a specific directory
   * @param {string} templateName - Name of template file (without .hbs)
   * @param {string} promptsDir - Directory containing the templates
   * @param {object} data - Data to pass to the template
   */
  async renderFromDir(templateName, promptsDir, data = {}) {
    const templatePath = path.join(promptsDir, `${templateName}.hbs`);
    return await super.render(templatePath, data);
  }

  /**
   * Render using Braintrust prompt by slug
   * @param {string} slug - Braintrust prompt slug (e.g., 'architectural-story')
   * @param {object} data - Template variables
   */
  async renderFromBraintrust(slug, data = {}) {
    const projectName = Config.get('promptManagement.braintrust.projectName');
    const apiKey = Config.get('promptManagement.braintrust.apiKey');

    if (!projectName || !apiKey) {
      throw new Error(
        'Braintrust not configured. Set promptManagement.braintrust.projectName and apiKey'
      );
    }

    const prompt = await loadPrompt({ projectName, slug });
    const builtPrompt = prompt.build(data, { flavor: 'chat' });
    return builtPrompt.messages.map((m) => m.content).join('\n');
  }
}
