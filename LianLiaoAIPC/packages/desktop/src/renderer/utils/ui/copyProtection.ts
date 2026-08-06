type RendererCopyProtectionOptions = {
  isPackaged: boolean;
  window: Window;
  document: Document;
  navigator: Navigator;
};

type ClipboardWriteMethodName = 'write' | 'writeText';

const COPY_PROTECTION_ERROR_MESSAGE = 'Clipboard writes are disabled in packaged builds';
const installedWindows = new WeakSet<Window>();
const EDITABLE_INPUT_TYPES = new Set(['email', 'number', 'search', 'tel', 'text', 'url']);

export const createCopyProtectionError = (): DOMException =>
  new DOMException(COPY_PROTECTION_ERROR_MESSAGE, 'NotAllowedError');

const isCopyProtectionError = (reason: unknown): boolean =>
  reason instanceof DOMException &&
  reason.name === 'NotAllowedError' &&
  reason.message === COPY_PROTECTION_ERROR_MESSAGE;

const asElement = (target: EventTarget | null): Element | null =>
  target && typeof target === 'object' && 'closest' in target ? (target as Element) : null;

const isEditableTextElement = (element: Element | null): boolean => {
  if (!element) return false;
  if (element.tagName === 'TEXTAREA') {
    const textarea = element as HTMLTextAreaElement;
    return !textarea.disabled && !textarea.readOnly;
  }
  if (element.tagName === 'INPUT') {
    const input = element as HTMLInputElement;
    return !input.disabled && !input.readOnly && EDITABLE_INPUT_TYPES.has(input.type.toLowerCase());
  }
  return element.closest('[contenteditable]:not([contenteditable="false"])') !== null;
};

const isEditableClipboardEvent = (event: Event, targetDocument: Document): boolean =>
  isEditableTextElement(asElement(event.target)) || isEditableTextElement(targetDocument.activeElement);

const preventProtectedCopy = (event: Event, targetDocument: Document): void => {
  if (isEditableClipboardEvent(event, targetDocument)) return;
  event.preventDefault();
  event.stopImmediatePropagation();
};

const preventUnhandledCopyRejection = (event: PromiseRejectionEvent): void => {
  if (!isCopyProtectionError(event.reason)) return;
  event.preventDefault();
  event.stopImmediatePropagation();
};

const patchClipboardMethod = (clipboard: Clipboard, methodName: ClipboardWriteMethodName): (() => void) => {
  if (typeof clipboard[methodName] !== 'function') return () => {};

  const originalDescriptor = Object.getOwnPropertyDescriptor(clipboard, methodName);
  try {
    Object.defineProperty(clipboard, methodName, {
      configurable: true,
      value: () => Promise.reject(createCopyProtectionError()),
    });
  } catch {
    // Chromium may expose a non-configurable method; the main-process permission policy remains authoritative.
    return () => {};
  }

  return () => {
    if (originalDescriptor) {
      Object.defineProperty(clipboard, methodName, originalDescriptor);
      return;
    }
    Reflect.deleteProperty(clipboard, methodName);
  };
};

/**
 * Installs renderer-side defense in depth without disabling selection or paste.
 * Returns a disposer so DOM tests and future isolated renderers can restore native behavior.
 */
export const installRendererCopyProtection = ({
  isPackaged,
  window: targetWindow,
  document: targetDocument,
  navigator: targetNavigator,
}: RendererCopyProtectionOptions): (() => void) => {
  if (!isPackaged || installedWindows.has(targetWindow)) return () => {};

  const handleProtectedCopy = (event: Event): void => preventProtectedCopy(event, targetDocument);
  targetDocument.addEventListener('copy', handleProtectedCopy, true);
  targetDocument.addEventListener('cut', handleProtectedCopy, true);
  targetWindow.addEventListener('unhandledrejection', preventUnhandledCopyRejection, true);

  const originalExecCommand =
    typeof targetDocument.execCommand === 'function' ? targetDocument.execCommand.bind(targetDocument) : undefined;
  const hadOwnExecCommand = Object.prototype.hasOwnProperty.call(targetDocument, 'execCommand');
  targetDocument.execCommand = ((commandId: string, showUI?: boolean, value?: string) => {
    const normalizedCommand = commandId.toLowerCase();
    if (normalizedCommand === 'copy' || normalizedCommand === 'cut') return false;
    return originalExecCommand?.(commandId, showUI, value) ?? false;
  }) as typeof targetDocument.execCommand;

  const clipboard = targetNavigator.clipboard;
  const restoreWriteText = clipboard ? patchClipboardMethod(clipboard, 'writeText') : () => {};
  const restoreWrite = clipboard ? patchClipboardMethod(clipboard, 'write') : () => {};

  installedWindows.add(targetWindow);
  return () => {
    targetDocument.removeEventListener('copy', handleProtectedCopy, true);
    targetDocument.removeEventListener('cut', handleProtectedCopy, true);
    targetWindow.removeEventListener('unhandledrejection', preventUnhandledCopyRejection, true);
    if (hadOwnExecCommand && originalExecCommand) {
      targetDocument.execCommand = originalExecCommand;
    } else {
      Reflect.deleteProperty(targetDocument, 'execCommand');
    }
    restoreWriteText();
    restoreWrite();
    installedWindows.delete(targetWindow);
  };
};

export const installCurrentRendererCopyProtection = (): void => {
  if (typeof window === 'undefined' || typeof document === 'undefined') return;
  installRendererCopyProtection({
    isPackaged: window.__isPackaged === true,
    window,
    document,
    navigator,
  });
};
