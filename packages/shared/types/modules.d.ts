/**
 * Type declarations for external modules without proper TypeScript support
 */

declare module 'handlebars' {
  export interface HelperDelegate {
    (context?: unknown, options?: HelperOptions): SafeString | string;
  }

  export interface HelperOptions {
    fn: (context?: unknown) => string;
    inverse: (context?: unknown) => string;
    hash: Record<string, unknown>;
    data?: Record<string, unknown>;
  }

  export class SafeString {
    constructor(str: string);
    toString(): string;
    toHTML(): string;
  }

  export interface TemplateDelegate<T = unknown> {
    (context: T, options?: RuntimeOptions): string;
  }

  export interface RuntimeOptions {
    data?: Record<string, unknown>;
    helpers?: Record<string, HelperDelegate>;
    partials?: Record<string, HandlebarsTemplateDelegate>;
    decorators?: Record<
      string,
      (
        fn: HelperDelegate,
        props: Record<string, unknown>,
        container: unknown,
        options: HelperOptions
      ) => HelperDelegate
    >;
  }

  export type HandlebarsTemplateDelegate<T = unknown> = TemplateDelegate<T>;

  export function registerHelper(name: string, fn: HelperDelegate): void;
  export function registerPartial(
    name: string,
    partial: string | TemplateDelegate
  ): void;
  export function compile<T = unknown>(
    input: string,
    options?: CompileOptions
  ): TemplateDelegate<T>;
  export function template<T = unknown>(
    precompilation: TemplateSpecification
  ): TemplateDelegate<T>;

  export interface CompileOptions {
    data?: boolean;
    compat?: boolean;
    knownHelpers?: Record<string, boolean>;
    knownHelpersOnly?: boolean;
    noEscape?: boolean;
    strict?: boolean;
    assumeObjects?: boolean;
    preventIndent?: boolean;
    ignoreStandalone?: boolean;
    explicitPartialContext?: boolean;
  }

  export interface TemplateSpecification {
    main: (
      container: unknown,
      depth0: unknown,
      helpers: unknown,
      partials: unknown,
      data: unknown
    ) => string;
    main_d?: (
      container: unknown,
      depth0: unknown,
      helpers: unknown,
      partials: unknown,
      data: unknown,
      blockParams: unknown,
      depths: unknown
    ) => string;
    useData?: boolean;
    useDepths?: boolean;
    usePartial?: boolean;
    useBlockParams?: boolean;
  }

  const Handlebars: {
    registerHelper: typeof registerHelper;
    registerPartial: typeof registerPartial;
    compile: typeof compile;
    template: typeof template;
    SafeString: typeof SafeString;
  };

  export default Handlebars;
}

declare module 'braintrust' {
  export interface LoadPromptOptions {
    projectName: string;
    slug: string;
    version?: string;
  }

  export interface PromptMessage {
    role: string;
    content: string;
  }

  export interface BuiltPrompt {
    messages: PromptMessage[];
    model?: string;
    params?: Record<string, unknown>;
  }

  export interface Prompt {
    build(
      data: Record<string, unknown>,
      options?: { flavor?: string }
    ): BuiltPrompt;
    render(data: Record<string, unknown>): string;
  }

  export function loadPrompt(options: LoadPromptOptions): Promise<Prompt>;
}
