// services/eventBus.js
// Internal typed Event Bus — replaces scattered broadcastToRenderer calls.
//
// Usage (main process):
//   const bus = require('./services/eventBus');
//   bus.emit('network:message', { peerId, message });
//   bus.on('system:deviceJoined', peer => { ... });
//
// The bus also bridges to the Electron renderer via a registered
// "renderer bridge" callback (set once in main.js bootstrap).

const EventEmitter = require('events');

// ── EVENT CATALOGUE ───────────────────────────────────────────────────────────
// Every valid event name lives here.  Typos become loud errors at emit time.
const EVENTS = {
  // Network — peer lifecycle
  DEVICE_JOINED    : 'system:deviceJoined',
  DEVICE_LEFT      : 'system:deviceLeft',
  DEVICE_UPDATED   : 'system:deviceUpdated',

  // Network — messaging
  NETWORK_MESSAGE  : 'network:message',
  NETWORK_FILE     : 'network:file',
  NETWORK_BROADCAST: 'network:broadcast',
  NETWORK_ACK      : 'network:ack',
  NETWORK_REPLY    : 'network:broadcastReply',
  NETWORK_STATUS   : 'network:status',

  // User actions
  HELP_REQUEST     : 'user:helpRequest',
  HELP_ACKED       : 'user:helpAcked',

  // Admin actions
  SCREEN_LOCKED    : 'admin:screenLocked',
  SCREEN_UNLOCKED  : 'admin:screenUnlocked',
  ADMIN_SIGNED_IN  : 'admin:signedIn',
  ADMIN_SIGNED_OUT : 'admin:signedOut',

  // UI navigation
  GOTO_TAB         : 'ui:gotoTab',
  FOCUS_HELP       : 'ui:focusHelpRequest',

  // Sound
  PLAY_SOUND       : 'ui:playSound',

  // Profile
  PROFILE_UPDATED  : 'system:profileUpdated',
};

// ── BUS INSTANCE ──────────────────────────────────────────────────────────────
class OpsLynkBus extends EventEmitter {
  constructor() {
    super();
    this.setMaxListeners(40);
    this._rendererBridge = null;    // set by main.js after window creation
    this._validEvents    = new Set(Object.values(EVENTS));
  }

  /**
   * Register the renderer bridge callback.
   * Called once in main.js:  bus.setRendererBridge((event, data) => mainWindow.webContents.send(event, data))
   */
  setRendererBridge(fn) {
    this._rendererBridge = fn;
  }

  /**
   * Emit a typed event.
   * @param {string} event  — must be one of EVENTS values
   * @param {*}      data
   * @param {boolean} toRenderer — also forward to Electron renderer (default true)
   */
  emit(event, data, toRenderer = true) {
    if (!this._validEvents.has(event)) {
      console.warn(`[EventBus] Unknown event: "${event}". Add it to EVENTS catalogue.`);
    }
    // Internal listeners (main process)
    super.emit(event, data);

    // Forward to renderer window
    if (toRenderer && this._rendererBridge) {
      try { this._rendererBridge(event, data); } catch {}
    }
    return this;
  }

  /**
   * Convenience: emit without forwarding to renderer.
   */
  emitInternal(event, data) {
    return this.emit(event, data, false);
  }
}

const bus = new OpsLynkBus();

module.exports = { bus, EVENTS };
