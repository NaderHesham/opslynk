import type {
  AdminRuntimeState,
  AppRuntimeState,
  IpcRuntimeState,
  NetworkRuntimeState,
  RecordsRuntimeState,
  SessionRuntimeState,
  TrayRuntimeState,
  WindowRuntimeState
} from '../../shared/types/runtime';

export interface RuntimeStateOwners {
  sessionState: SessionRuntimeState;
  recordsState: RecordsRuntimeState;
  windowState: WindowRuntimeState;
  trayState: TrayRuntimeState;
  adminState: AdminRuntimeState;
  networkState: NetworkRuntimeState;
  ipcState: IpcRuntimeState;
  lifecycleState: AppRuntimeState;
}

export function createStateOwners(state: AppRuntimeState): RuntimeStateOwners {
  // Typed ownership views only; all views reference the same runtime object.
  return {
    sessionState: state as SessionRuntimeState,
    recordsState: state as RecordsRuntimeState,
    windowState: state as WindowRuntimeState,
    trayState: state as TrayRuntimeState,
    adminState: state as AdminRuntimeState,
    networkState: state as NetworkRuntimeState,
    ipcState: state as IpcRuntimeState,
    lifecycleState: state
  };
}

