import type {
  EnterpriseIpcResult,
  EnterpriseLoginPollResult,
  EnterpriseLoginSession,
  EnterpriseRequest,
  EnterpriseResponse,
  EnterpriseUserContext,
} from '../../enterprise/contracts';
import type {
  CustomerServiceCloseRequest,
  CustomerServiceConnectionSnapshot,
  CustomerServiceConversation,
  CustomerServiceConversationIdRequest,
  CustomerServiceConversationListRequest,
  CustomerServiceImage,
  CustomerServiceIpcResult,
  CustomerServiceMarkReadRequest,
  CustomerServiceMessage,
  CustomerServiceMessageHistoryRequest,
  CustomerServicePage,
  CustomerServiceReadResult,
  CustomerServiceSendMessageRequest,
  CustomerServiceServerEnvelope,
  CustomerServiceStaffCandidate,
  CustomerServiceStaffCandidatesRequest,
  CustomerServiceTransferRequest,
  CustomerServiceUploadImageRequest,
} from '../../enterprise/customer-service/contracts';
import type {
  DesktopNotificationChangedResult,
  DesktopNotificationConnectionSnapshot,
  DesktopNotificationIpcResult,
  DesktopNotificationListRequest,
  DesktopNotificationMarkAllReadResult,
  DesktopNotificationPage,
  DesktopNotificationServerEnvelope,
  DesktopNotificationUnreadCount,
} from '../../enterprise/desktop-notification/contracts';
import type {
  DesktopVersionCheckResult,
  DesktopVersionDownloadResult,
  DesktopVersionIpcResult,
  DesktopVersionOpenDownloadedResult,
} from '../../enterprise/desktop-version/contracts';
import type { DesktopManagedAiSyncResult } from '../../enterprise/managed-ai-model/contracts';

// WebUI 状态接口 / WebUI status interface
export interface WebUIStatus {
  running: boolean;
  port: number;
  allowRemote: boolean;
  localUrl: string;
  networkUrl?: string;
  lanIP?: string;
  adminUsername: string;
  initialPassword?: string;
}

export interface ElectronBridgeAPI {
  emit: (name: string, data: unknown) => Promise<unknown> | void;
  on: (callback: (event: { value: string }) => void) => void;
  // 获取拖拽文件/目录的绝对路径 / Get absolute path for dragged file/directory
  getPathForFile?: (file: File) => string;
  // Feedback log collection / 收集反馈日志
  collectFeedbackLogs?: () => Promise<{ filename: string; data: number[] } | null>;
  // Feedback screenshot capture / 反馈截图
  captureFeedbackScreenshot?: () => Promise<{ filename: string; data: number[] } | null>;
  // Forward feedback diagnostics logs to the main process console / 转发反馈诊断日志到主进程控制台
  logFeedbackEvent?: (payload: { details?: unknown; level: 'info' | 'warn' | 'error'; message: string }) => void;
  enterprise?: {
    createLoginSession: () => Promise<EnterpriseIpcResult<EnterpriseLoginSession>>;
    pollLoginSession: (loginKey: string) => Promise<EnterpriseIpcResult<EnterpriseLoginPollResult>>;
    completeRegistration: (openId: string) => Promise<EnterpriseIpcResult<EnterpriseUserContext>>;
    restoreSession: () => Promise<EnterpriseIpcResult<EnterpriseUserContext | null>>;
    clearSession: () => Promise<EnterpriseIpcResult<void>>;
    request: (request: EnterpriseRequest) => Promise<EnterpriseIpcResult<EnterpriseResponse>>;
  };
  /** Main-process synchronization for the centrally managed default AI model. */
  desktopManagedAi?: {
    sync: () => Promise<DesktopManagedAiSyncResult>;
  };
  customerService?: {
    connect: () => Promise<CustomerServiceIpcResult<CustomerServiceConnectionSnapshot>>;
    disconnect: () => Promise<CustomerServiceIpcResult<void>>;
    listConversations: (
      request: CustomerServiceConversationListRequest
    ) => Promise<CustomerServiceIpcResult<CustomerServicePage<CustomerServiceConversation>>>;
    getConversation: (
      request: CustomerServiceConversationIdRequest
    ) => Promise<CustomerServiceIpcResult<CustomerServiceConversation>>;
    getHistory: (
      request: CustomerServiceMessageHistoryRequest
    ) => Promise<CustomerServiceIpcResult<CustomerServicePage<CustomerServiceMessage>>>;
    sendMessage: (request: CustomerServiceSendMessageRequest) => Promise<CustomerServiceIpcResult<string>>;
    markRead: (request: CustomerServiceMarkReadRequest) => Promise<CustomerServiceIpcResult<CustomerServiceReadResult>>;
    uploadImage: (
      request: CustomerServiceUploadImageRequest
    ) => Promise<CustomerServiceIpcResult<CustomerServiceImage>>;
    listCandidates: (
      request: CustomerServiceStaffCandidatesRequest
    ) => Promise<CustomerServiceIpcResult<CustomerServicePage<CustomerServiceStaffCandidate>>>;
    transferConversation: (
      request: CustomerServiceTransferRequest
    ) => Promise<CustomerServiceIpcResult<CustomerServiceConversation>>;
    closeConversation: (
      request: CustomerServiceCloseRequest
    ) => Promise<CustomerServiceIpcResult<CustomerServiceConversation>>;
    onEvent: (callback: (event: CustomerServiceServerEnvelope) => void) => () => void;
  };
  /** Customer-only consultation bridge. Staff queue and transfer commands are intentionally absent. */
  customerConsultation?: {
    connect: () => Promise<CustomerServiceIpcResult<CustomerServiceConnectionSnapshot>>;
    disconnect: () => Promise<CustomerServiceIpcResult<void>>;
    openConversation: () => Promise<CustomerServiceIpcResult<CustomerServiceConversation>>;
    startConversation: () => Promise<CustomerServiceIpcResult<CustomerServiceConversation>>;
    getConversation: (
      request: CustomerServiceConversationIdRequest
    ) => Promise<CustomerServiceIpcResult<CustomerServiceConversation>>;
    getHistory: (
      request: CustomerServiceMessageHistoryRequest
    ) => Promise<CustomerServiceIpcResult<CustomerServicePage<CustomerServiceMessage>>>;
    sendMessage: (request: CustomerServiceSendMessageRequest) => Promise<CustomerServiceIpcResult<string>>;
    markRead: (request: CustomerServiceMarkReadRequest) => Promise<CustomerServiceIpcResult<CustomerServiceReadResult>>;
    uploadImage: (
      request: CustomerServiceUploadImageRequest
    ) => Promise<CustomerServiceIpcResult<CustomerServiceImage>>;
    closeConversation: (
      request: CustomerServiceCloseRequest
    ) => Promise<CustomerServiceIpcResult<CustomerServiceConversation>>;
    onEvent: (callback: (event: CustomerServiceServerEnvelope) => void) => () => void;
  };
  /** Electron-only business notification center. OpenID and websocket tickets remain in main process. */
  desktopNotifications?: {
    connect: () => Promise<DesktopNotificationIpcResult<DesktopNotificationConnectionSnapshot>>;
    disconnect: () => Promise<DesktopNotificationIpcResult<void>>;
    list: (request: DesktopNotificationListRequest) => Promise<DesktopNotificationIpcResult<DesktopNotificationPage>>;
    getUnreadCount: () => Promise<DesktopNotificationIpcResult<DesktopNotificationUnreadCount>>;
    markRead: (request: {
      notificationId: string;
    }) => Promise<DesktopNotificationIpcResult<DesktopNotificationChangedResult>>;
    markAllRead: () => Promise<DesktopNotificationIpcResult<DesktopNotificationMarkAllReadResult>>;
    onEvent: (callback: (event: DesktopNotificationServerEnvelope) => void) => () => void;
  };
  /** Main-process-only desktop release lookup and verified installer download. */
  desktopVersion?: {
    check: () => Promise<DesktopVersionIpcResult<DesktopVersionCheckResult>>;
    download: () => Promise<DesktopVersionIpcResult<DesktopVersionDownloadResult>>;
    openDownloaded: () => Promise<DesktopVersionIpcResult<DesktopVersionOpenDownloadedResult>>;
  };
}

export type BackendStartupFailureReason =
  | 'backend_incompatible_runtime'
  | 'backend_incomplete_installation'
  | 'backend_package_architecture_mismatch'
  | 'backend_data_migration_failed'
  | 'backend_local_data_repair_failed'
  | 'backend_startup_failed';

export type BackendIncompleteInstallationKind = 'missing_backend_binary' | 'missing_directory_resources';
export type BackendLocalDataIssueKind = 'agent_metadata_invalid_utf8';

export interface BackendStartupFailureInfo {
  incompleteInstallationKind?: BackendIncompleteInstallationKind;
  localDataIssueKind?: BackendLocalDataIssueKind;
  missingBackendBinary?: boolean;
  missingBundledAioncoreDir?: boolean;
  missingHubDir?: boolean;
  missingPetStatesDir?: boolean;
  missingPwaDir?: boolean;
  reason: BackendStartupFailureReason;
  backendBoundaryCode?: string;
  backendBoundaryStage?: string;
  runtime?: 'glibc';
  requiredVersions?: string[];
  missingResources?: string[];
  missingRuntimeDir?: boolean;
  packageArch?: string;
  deviceArch?: string;
  expectedDownloadArch?: string;
  isRosettaTranslated?: boolean;
}

declare global {
  interface Window {
    electronAPI?: ElectronBridgeAPI;
    readonly __isPackaged?: boolean;
    __initialLanguage?: string | null;
    __aionuiE2ETest?: boolean;
    __backendStartupFailed?: boolean;
    __backendStartupFailure?: BackendStartupFailureInfo | null;
    __installationIntegrityReportCount?: number;
    __lastInstallationIntegrityReportMessage?: string;
  }
}
