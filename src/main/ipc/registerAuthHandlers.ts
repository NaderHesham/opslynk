import type { IpcMain } from 'electron';

interface AuthService {
  isFirstRun:       ()                                                    => boolean;
  createSuperAdmin: (username: string, password: string)                  => Promise<{ success: boolean; error?: string; user?: unknown }>;
  login:            (username: string, password: string)                  => Promise<{ success: boolean; error?: string; user?: unknown }>;
  createUser:       (username: string, password: string, role: string)    => Promise<{ success: boolean; error?: string; user?: unknown }>;
  changePassword:   (userId: string, current: string, next: string)       => Promise<{ success: boolean; error?: string }>;
  deleteUser:       (userId: string, requesterId: string)                 => { success: boolean; error?: string };
  listUsers:        ()                                                     => unknown[];
}

interface AuthDeps {
  ipcMain:        IpcMain;
  authService:    AuthService;
  onLoginSuccess: (user: unknown) => void;
}

export function registerAuthHandlers({ ipcMain, authService, onLoginSuccess }: AuthDeps): void {
  ipcMain.handle('auth:is-first-run', () => authService.isFirstRun());

  ipcMain.handle('auth:setup', async (_e, { username, password }: { username: string; password: string }) => {
    const result = await authService.createSuperAdmin(username, password);
    if (result.success) onLoginSuccess(result.user);
    return result;
  });

  ipcMain.handle('auth:login', async (_e, { username, password }: { username: string; password: string }) => {
    const result = await authService.login(username, password);
    if (result.success) onLoginSuccess(result.user);
    return result;
  });

  ipcMain.handle('auth:create-user',     async (_e, p: { username: string; password: string; role: string }) =>
    authService.createUser(p.username, p.password, p.role));

  ipcMain.handle('auth:change-password', async (_e, p: { userId: string; currentPassword: string; newPassword: string }) =>
    authService.changePassword(p.userId, p.currentPassword, p.newPassword));

  ipcMain.handle('auth:delete-user',     (_e, p: { userId: string; requesterId: string }) =>
    authService.deleteUser(p.userId, p.requesterId));

  ipcMain.handle('auth:list-users',      () => authService.listUsers());
}
