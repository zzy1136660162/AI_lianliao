/**
 * @license
 * Copyright 2025 AionUi (aionui.com)
 * SPDX-License-Identifier: Apache-2.0
 */

export const removeStack = (...args: Array<() => void>) => {
  return () => {
    const list = args.slice();
    while (list.length) {
      list.pop()!();
    }
  };
};

export const stripHtmlTags = (html: string): string => {
  if (!html) return '';
  // Remove executable/non-content blocks together with their bodies before
  // flattening the remaining rich text. Keeping script text would expose
  // implementation fragments such as `window.foo=...` in company profiles.
  return html.replace(/<(script|style)\b[^>]*>[\s\S]*?<\/\1\s*>/gi, '').replace(/<[^>]*>/g, '');
};

/**
 * Tool confirmation outcome enum
 * This is a local copy to avoid importing the entire tools module from aioncli-core
 * which contains Node.js dependencies (node:crypto) that cannot be bundled in the renderer process.
 */
export enum ToolConfirmationOutcome {
  ProceedOnce = 'proceed_once',
  ProceedAlways = 'proceed_always',
  ProceedAlwaysServer = 'proceed_always_server',
  ProceedAlwaysTool = 'proceed_always_tool',
  ModifyWithEditor = 'modify_with_editor',
  Cancel = 'cancel',
}

export { uuid } from '@/common/utils';
