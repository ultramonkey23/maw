/**
 * Shared AST-grep utilities for all tools that use @ast-grep/napi.
 * Single source of truth for language mapping, parsing, and error normalization.
 *
 * Native core and grammar addons load on first real AST operation.
 * Importing this module performs no native dlopen, so CLI startup and language
 * mapping remain available even if @ast-grep/napi has no Android binding.
 * parseSource and isAstGrepAvailable report missing core bindings safely.
 *
 * @plan PLAN-20260211-ASTGREP.P03
 */

import { createRequire } from 'node:module';
import * as path from 'node:path';
import type {
  DynamicLangRegistrations,
  Lang as NativeLang,
} from '@ast-grep/napi';

// @ast-grep/napi and the dynamic grammar packages contain native bindings.
// Keep these out of the import graph (including --help and pure language
// mapping consumers). All AST operations retain their synchronous API.
const requireNative = createRequire(import.meta.url);
type NativeAstGrep = typeof import('@ast-grep/napi');
let nativeBinding: NativeAstGrep | undefined;

function getNativeBinding(): NativeAstGrep {
  // Do not cache failures: a repaired binding may become loadable later.
  nativeBinding ??= requireNative('@ast-grep/napi') as NativeAstGrep;
  return nativeBinding;
}

function loadGrammar(specifier: string): unknown {
  const module = requireNative(specifier) as { default?: unknown };
  return module.default ?? module;
}

// These are string-valued const-enum members in @ast-grep/napi. Re-declaring
// the public values is essential: re-exporting Lang from the native package
// would eagerly resolve the binding on import even when no AST tool runs.
export const Lang = {
  TypeScript: 'TypeScript' as NativeLang,
  JavaScript: 'JavaScript' as NativeLang,
  Tsx: 'Tsx' as NativeLang,
  Html: 'Html' as NativeLang,
  Css: 'Css' as NativeLang,
} as const;
export type Lang = NativeLang;

let dynamicLanguagesRegistered = false;
let dynamicLanguagesAvailable = false;

/**
 * Register the dynamic grammar addons (python, go, rust, ...) on first use.
 *
 * Lazy and fault-tolerant: a native load failure (e.g. Windows Smart App
 * Control blocking the unsigned .node grammar DLLs) is caught and recorded so
 * AST tooling can degrade to "unavailable" instead of panicking the process.
 */
function ensureDynamicLanguages(): void {
  if (dynamicLanguagesRegistered) return;
  try {
    getNativeBinding().registerDynamicLanguage({
      python: loadGrammar('@ast-grep/lang-python'),
      go: loadGrammar('@ast-grep/lang-go'),
      rust: loadGrammar('@ast-grep/lang-rust'),
      java: loadGrammar('@ast-grep/lang-java'),
      cpp: loadGrammar('@ast-grep/lang-cpp'),
      c: loadGrammar('@ast-grep/lang-c'),
      json: loadGrammar('@ast-grep/lang-json'),
      ruby: loadGrammar('@ast-grep/lang-ruby'),
    } as unknown as DynamicLangRegistrations);
    dynamicLanguagesAvailable = true;
  } catch {
    dynamicLanguagesAvailable = false;
  }
  dynamicLanguagesRegistered = true;
}

/**
 * File extension to ast-grep language mapping.
 * Single source of truth across all AST tools.
 */
export const LANGUAGE_MAP: Record<string, string | Lang> = {
  ts: Lang.TypeScript,
  js: Lang.JavaScript,
  tsx: Lang.Tsx,
  jsx: Lang.Tsx,
  py: 'python',
  rb: 'ruby',
  go: 'go',
  rs: 'rust',
  java: 'java',
  cpp: 'cpp',
  c: 'c',
  h: 'c',
  html: Lang.Html,
  css: Lang.Css,
  json: 'json',
};

/**
 * Reverse mapping from full language names to Lang/string values.
 */
const LANGUAGE_NAME_MAP: Record<string, string | Lang> = {
  typescript: Lang.TypeScript,
  javascript: Lang.JavaScript,
  tsx: Lang.Tsx,
  jsx: Lang.Tsx,
  python: 'python',
  ruby: 'ruby',
  go: 'go',
  rust: 'rust',
  java: 'java',
  cpp: 'cpp',
  c: 'c',
  html: Lang.Html,
  css: Lang.Css,
  json: 'json',
};

/**
 * File extensions that belong to the JavaScript/TypeScript language family.
 */
export const JAVASCRIPT_FAMILY_EXTENSIONS: readonly string[] = [
  'ts',
  'js',
  'tsx',
  'jsx',
];

/**
 * Resolve a file extension or language name to an ast-grep language.
 * Accepts both extensions ('ts', 'py') and full names ('typescript', 'python').
 * Returns undefined for unrecognized inputs.
 */
export function getAstLanguage(extOrName: string): string | Lang | undefined {
  // Try extension first
  if (extOrName in LANGUAGE_MAP) {
    return LANGUAGE_MAP[extOrName];
  }

  // Try full name (case-insensitive)
  const lower = extOrName.toLowerCase();
  if (lower in LANGUAGE_NAME_MAP) {
    return LANGUAGE_NAME_MAP[lower];
  }

  return undefined;
}

/**
 * Detect the ast-grep language from a file path's extension.
 * Returns undefined if the extension is not recognized.
 */
export function resolveLanguageFromPath(
  filePath: string,
): string | Lang | undefined {
  const ext = path.extname(filePath).slice(1); // remove the dot
  if (!ext) return undefined;
  return LANGUAGE_MAP[ext];
}

/**
 * Languages built into @ast-grep/napi that do NOT require dynamic registration.
 * Dynamic addons (python, go, rust, …) need `registerDynamicLanguage` first.
 */
const BUILTIN_LANG_VALUES = new Set<string | Lang>([
  Lang.TypeScript,
  Lang.JavaScript,
  Lang.Tsx,
  Lang.Html,
  Lang.Css,
]);

function isBuiltinLang(language: string | Lang): boolean {
  return BUILTIN_LANG_VALUES.has(language);
}

/**
 * Check if @ast-grep/napi is available and usable.
 *
 * Reports whether the core napi binding loaded successfully (parse / findInFiles
 * are callable). Does NOT conflate this with dynamic grammar registration:
 * built-in languages (TypeScript, JavaScript, …) work regardless of addon load
 * outcome, so a dynamic registration failure must not hide core capability.
 */
export function isAstGrepAvailable(): boolean {
  try {
    return (
      typeof getNativeBinding().parse === 'function' &&
      typeof getNativeBinding().findInFiles === 'function'
    );
  } catch {
    return false;
  }
}

/**
 * Parse source code with error normalization.
 * Returns { root } on success or { error } on failure.
 * Does not throw. Triggers lazy grammar registration on first call.
 */
export function parseSource(
  language: string | Lang,
  content: string,
): { root: ReturnType<NativeAstGrep['parse']> } | { error: string } {
  try {
    ensureDynamicLanguages();
    if (!dynamicLanguagesAvailable && !isBuiltinLang(language)) {
      return {
        error:
          'ast-grep dynamic grammars are unavailable (native addon load failed)',
      };
    }
    const result = getNativeBinding().parse(language as NativeLang, content);
    return { root: result };
  } catch (err) {
    const message = err instanceof Error ? err.message : String(err);
    return { error: `Failed to parse source: ${message}` };
  }
}

/**
 * Wrapped `parse` that ensures dynamic grammars are registered before parsing.
 * Routes through the lazy registration path so direct callers benefit from the
 * same lazy-init + graceful-degradation behavior as `parseSource`.
 *
 * Built-in languages (TypeScript, JavaScript, …) always work; a dynamic
 * language throws a clear error when addon registration failed rather than
 * an opaque napi binding error.
 */
export function parse(
  language: string | Lang,
  content: string,
): ReturnType<NativeAstGrep['parse']> {
  ensureDynamicLanguages();
  if (!dynamicLanguagesAvailable && !isBuiltinLang(language)) {
    throw new Error(
      'ast-grep dynamic grammars are unavailable (native addon load failed)',
    );
  }
  return getNativeBinding().parse(language as NativeLang, content);
}

/**
 * Wrapped `findInFiles` that ensures dynamic grammars are registered first.
 *
 * Callers (e.g. cross-file-analyzer.ts) catch errors from findInFiles and
 * degrade to empty results, so a dynamic-language napi error is already
 * handled gracefully. The explicit guard in `parse` / `parseSource` covers
 * the primary parse path where a clearer message is most valuable.
 */
export function findInFiles(
  ...args: Parameters<NativeAstGrep['findInFiles']>
): ReturnType<NativeAstGrep['findInFiles']> {
  ensureDynamicLanguages();
  return getNativeBinding().findInFiles(...args);
}

