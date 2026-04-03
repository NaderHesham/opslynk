'use strict';

const CONTROL_ROLE = 'super_admin';
const CONTROL_USERNAME = 'Local Operator';

const WINDOW_MODES = {
  main: { width: 1180, height: 740, minWidth: 920, minHeight: 600, resizable: true }
};

function getWindowModeConfig(modeName) {
  return WINDOW_MODES[modeName] || null;
}

module.exports = {
  CONTROL_ROLE,
  CONTROL_USERNAME,
  WINDOW_MODES,
  getWindowModeConfig
};

