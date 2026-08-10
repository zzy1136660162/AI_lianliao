export type DesktopDiagnosticAttachmentInput = {
  filename: string;
  contentType: string;
  data: number[];
};

/** Renderer-owned report content. Identity and runtime metadata are main-process only. */
export type DesktopDiagnosticSubmitRequest = {
  reportType?: 'USER_FEEDBACK' | 'STARTUP_FAILURE' | 'DATA_MIGRATION';
  module: string;
  description: string;
  diagnostic?: unknown;
  attachments?: DesktopDiagnosticAttachmentInput[];
};

export type DesktopDiagnosticSubmitResult = {
  reportNo: string;
  status: 'SUBMITTED' | 'PARTIAL';
  attachmentCount: number;
  uploadedCount: number;
  failedCount: number;
};
