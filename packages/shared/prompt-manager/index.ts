import fs from 'fs/promises';
import path from 'path';
import Handlebars, { type HelperOptions, type SafeString } from 'handlebars';
import { loadPrompt } from 'braintrust';
import { Config } from '@kloudi/shared/config';

/** Template data object */
type TemplateData = Record<string, unknown>;

/** Braintrust message */
interface BraintrustMessage {
  content: string;
}

/** Braintrust built prompt */
interface BraintrustBuiltPrompt {
  messages: BraintrustMessage[];
}

/** Braintrust prompt */
interface BraintrustPrompt {
  build: (
    data: TemplateData,
    options: { flavor: string }
  ) => BraintrustBuiltPrompt;
}

/** Filesystem error with code */
interface FsError extends Error {
  code?: string;
}

/**
 * PromptManager - Shared template system for LLM prompts across all tools
 */
export class PromptManager {
  private promptsBaseDir: string | null;

  constructor(promptsBaseDir?: string) {
    this.promptsBaseDir = promptsBaseDir ?? null;

    // Register common helpers
    this.registerDefaultHelpers();
  }

  /**
   * Register default Handlebars helpers used across all tools
   */
  registerDefaultHelpers(): void {
    Handlebars.registerHelper(
      'json',
      (context?: unknown): string | SafeString =>
        JSON.stringify(context, null, 2)
    );

    Handlebars.registerHelper(
      'truncate',
      (context?: unknown, options?: HelperOptions): string | SafeString => {
        const text = typeof context === 'string' ? context : '';
        const length =
          typeof options?.hash?.['length'] === 'number'
            ? options.hash['length']
            : 2000;
        return text.length > length
          ? text.slice(0, length) + '\n...[truncated]'
          : text;
      }
    );

    Handlebars.registerHelper(
      'unless',
      function (
        this: unknown,
        conditional?: unknown,
        options?: HelperOptions
      ): string | SafeString {
        if (!conditional && options) {
          return options.fn(this);
        } else if (options) {
          return options.inverse(this);
        }
        return '';
      }
    );

    // Equality helper for conditionals
    Handlebars.registerHelper(
      'eq',
      function (
        context?: unknown,
        options?: HelperOptions
      ): string | SafeString {
        const compareValue = options?.hash?.['value'];
        return context === compareValue ? 'true' : '';
      }
    );
  }

  /**
   * Register partials from a partials directory
   * @param partialsDir - Directory containing partial templates
   */
  async registerPartials(partialsDir: string): Promise<void> {
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
      const fsError = error as FsError;
      if (fsError.code !== 'ENOENT') {
        throw error;
      }
    }
  }

  /**
   * Render a template with data
   * @param templateName - Name of the template file (without .hbs)
   * @param data - Data to pass to the template
   */
  async render(templateName: string, data: TemplateData = {}): Promise<string> {
    try {
      if (!this.promptsBaseDir) {
        throw new Error('promptsBaseDir is not set');
      }

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
      const errorMessage =
        error instanceof Error ? error.message : String(error);
      throw new Error(
        `Failed to render template ${templateName}: ${errorMessage}`
      );
    }
  }

  /**
   * Render a template by name from a specific directory
   * @param templateName - Name of template file (without .hbs)
   * @param promptsDir - Directory containing the templates
   * @param data - Data to pass to the template
   */
  async renderFromDir(
    templateName: string,
    promptsDir: string,
    data: TemplateData = {}
  ): Promise<string> {
    const templatePath = path.join(promptsDir, `${templateName}.hbs`);
    const templateSource = await fs.readFile(templatePath, 'utf8');
    const template = Handlebars.compile(templateSource);
    return template(data);
  }

  /**
   * Render using Braintrust prompt by slug
   * @param slug - Braintrust prompt slug (e.g., 'architectural-story')
   * @param data - Template variables
   */
  async renderFromBraintrust(
    slug: string,
    data: TemplateData = {}
  ): Promise<string> {
    const projectName = Config.get(
      'promptManagement.braintrust.projectName'
    ) as string | null;
    const apiKey = Config.get('promptManagement.braintrust.apiKey') as
      | string
      | null;

    if (!projectName || !apiKey) {
      throw new Error(
        'Braintrust not configured. Set promptManagement.braintrust.projectName and apiKey'
      );
    }

    const prompt = (await loadPrompt({
      projectName,
      slug,
    })) as BraintrustPrompt;
    const builtPrompt = prompt.build(data, { flavor: 'chat' });
    return builtPrompt.messages.map((m) => m.content).join('\n');
  }
}
