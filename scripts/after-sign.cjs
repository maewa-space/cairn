// electron-builder afterSign hook.
//
// macOS Privacy & Security (TCC) keys permission grants to the app's codesign
// `Identifier`. Electron-builder's ad-hoc sign path leaves the identifier as
// the literal string "Electron", which means every Electron app on the
// machine collides under one TCC key — granting/denying Screen Recording or
// Microphone for one app affects all of them.
//
// Re-sign the freshly-packaged .app with the real bundle id so TCC tracks
// permission grants correctly across rebuilds.

const { execSync } = require('node:child_process');
const { existsSync } = require('node:fs');
const { join, resolve } = require('node:path');

exports.default = async function afterSign(context) {
  const { electronPlatformName, appOutDir, packager } = context;
  if (electronPlatformName !== 'darwin') return;

  const appName = packager.appInfo.productFilename;
  const appPath = join(appOutDir, `${appName}.app`);
  const bundleId = packager.appInfo.id;
  const entitlements = resolve(
    packager.projectDir,
    'build/entitlements.mac.plist',
  );

  if (!existsSync(entitlements)) {
    throw new Error(`[after-sign] entitlements not found at ${entitlements}`);
  }

  // Ad-hoc re-sign with the correct bundle identifier AND the audio-input
  // entitlements. Without --entitlements, electron-builder's earlier sign
  // gets stripped here. Without --identifier, TCC associates the bundle
  // with the literal string "Electron" and collides with every other
  // Electron app on the machine.
  console.log(
    `[after-sign] re-signing ${appPath} (id=${bundleId}, entitlements=${entitlements})`,
  );

  // Re-sign the bundled AudioTee Swift binary first so it inherits our
  // entitlements. extraResources binaries aren't covered by `--deep`.
  const audiotee = join(appPath, 'Contents/Resources/audiotee');
  if (existsSync(audiotee)) {
    console.log(`[after-sign] re-signing nested binary ${audiotee}`);
    execSync(
      `codesign --force --sign - --entitlements "${entitlements}" --options runtime "${audiotee}"`,
      { stdio: 'inherit' },
    );
  }

  execSync(
    `codesign --force --deep --sign - --identifier "${bundleId}" --entitlements "${entitlements}" --options runtime "${appPath}"`,
    { stdio: 'inherit' },
  );
  const verify = execSync(
    `codesign -dv --entitlements - "${appPath}" 2>&1 | head -20`,
    { encoding: 'utf-8' },
  );
  console.log(`[after-sign]\n${verify.trim()}`);
};
