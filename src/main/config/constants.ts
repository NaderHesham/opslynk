export type AppMode = 'client' | 'admin';

export const APP_MODE: AppMode =
  (process.env.OPSLYNK_MODE as AppMode) === 'admin' ? 'admin' : 'client';

export interface WindowModeConfig {
  width: number;
  height: number;
  minWidth: number;
  minHeight: number;
  resizable: boolean;
}

export const CONTROL_ROLE = 'super_admin' as const;
export const CONTROL_USERNAME = 'Local Operator' as const;

export const WINDOW_MODES: Record<string, WindowModeConfig> = {
  main: { width: 1180, height: 740, minWidth: 920, minHeight: 600, resizable: true }
};

export function getWindowModeConfig(modeName: string): WindowModeConfig | null {
  return WINDOW_MODES[modeName] || null;
}

