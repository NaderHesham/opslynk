# OpsLynk Domain Deployment

## Package
- Preferred package for Active Directory rollout: `dist\*.msi`
- Build command: `npm.cmd run build-msi`
- The app runtime is bundled with Electron, so client machines do not need Node.js.

## GPO Software Installation
- Copy the generated `.msi` to a shared UNC path that domain computers can read.
- Use Group Policy Software Installation to assign the MSI to target computers.
- Prefer computer-assigned deployment instead of user-assigned deployment.

## Firewall Rules
Publish these inbound rules through Group Policy:

### UDP discovery
- Protocol: UDP
- Local port: `45678`
- Scope: domain profile
- Purpose: peer auto-discovery on the LAN

### TCP messaging
- Protocol: TCP
- Local ports: `45679-45700`
- Scope: domain profile
- Purpose: direct peer WebSocket communication

## Build Machine Notes
- If MSI packaging fails with a symbolic link or privilege error, build from an elevated terminal.
- Windows Developer Mode can also help with tooling that extracts symbolic links.
- Ensure `assets\icon.ico` is present before packaging.

## Runtime Notes
- No Google Fonts or remote web assets are required at runtime.
- The application is intended to run fully inside the internal network.
