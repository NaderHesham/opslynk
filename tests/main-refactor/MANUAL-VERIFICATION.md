# Main-Process Refactor Manual Verification

These checks validate behavior parity in real LAN runtime (not just unit tests).

## Required setup
- Two machines on same LAN.
- One machine running as control device profile.
- One machine running as peer/client.

## Behavior-parity checks
1. Startup and discovery:
- Launch both apps.
- Confirm peers appear online on control side.

2. Urgent broadcast / urgent overlay:
- Send urgent broadcast from control.
- Confirm urgent fullscreen overlay appears on peer.
- Confirm ACK and reply paths close overlay and reach control timeline.

3. Forced video broadcast:
- Select valid video and send forced playback.
- Confirm forced fullscreen player appears on peer and stays on top.
- Send stop command and confirm forced player closes.

4. Lock screen:
- Execute lock-all-screens from control.
- Confirm peer lock screen appears and cannot be dismissed locally.
- Execute unlock-all-screens and confirm peer unlocks.

5. Help workflow:
- Submit help request from peer.
- Confirm popup/notification on control.
- Ack help request from control and verify focus jump to help tab.

6. Shutdown/cleanup:
- Quit app from tray/action.
- Reopen app and verify profile/state persistence still loads.
