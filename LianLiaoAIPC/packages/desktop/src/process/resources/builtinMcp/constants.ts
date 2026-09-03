/**
 * @license
 * Copyright 2025 AionUi (aionui.com)
 * SPDX-License-Identifier: Apache-2.0
 */

// Keep this constant local to avoid pulling in common/config/storage side effects
// when the built-in MCP server boots in a standalone stdio process.
export const BUILTIN_IMAGE_GEN_ID = 'builtin-image-gen';
export const BUILTIN_IMAGE_GEN_NAME = 'aionui-image-generation';
export const BUILTIN_IMAGE_GEN_LEGACY_NAMES = ['AionUi Image Generation', BUILTIN_IMAGE_GEN_ID] as const;
export const BUILTIN_INDUSTRY_SEARCH_ID = 'builtin-industry-search';
export const BUILTIN_INDUSTRY_SEARCH_NAME = 'lianliao-industry-search';

export function isBuiltinIndustrySearchName(name?: string | null): boolean {
  return name === BUILTIN_INDUSTRY_SEARCH_NAME || name === BUILTIN_INDUSTRY_SEARCH_ID;
}

export function isBuiltinIndustrySearchTransport(transport?: {
  type?: string;
  command?: string;
  args?: string[] | null;
}): boolean {
  return Boolean(
    transport?.type === 'stdio' &&
    transport.command === 'node' &&
    transport.args?.some((arg) => arg.includes('builtin-mcp-industry-search.js'))
  );
}

export function isBuiltinImageGenName(name?: string | null): boolean {
  if (!name) return false;
  return (
    name === BUILTIN_IMAGE_GEN_NAME ||
    BUILTIN_IMAGE_GEN_LEGACY_NAMES.includes(name as (typeof BUILTIN_IMAGE_GEN_LEGACY_NAMES)[number])
  );
}

export function isBuiltinImageGenTransport(transport?: {
  type?: string;
  command?: string;
  args?: string[] | null;
}): boolean {
  if (!transport || transport.type !== 'stdio' || transport.command !== 'node') {
    return false;
  }

  return (transport.args || []).some((arg) => typeof arg === 'string' && arg.includes('builtin-mcp-image-gen.js'));
}
