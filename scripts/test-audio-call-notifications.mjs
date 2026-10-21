import assert from 'node:assert/strict';
import fs from 'node:fs';
import path from 'node:path';
import { fileURLToPath } from 'node:url';

const __dirname = path.dirname(fileURLToPath(import.meta.url));
const rootDir = path.resolve(__dirname, '..');

function readFile(relPath) {
  return fs.readFileSync(path.join(rootDir, relPath), 'utf8');
}

console.log('=== OSA Android Incoming & Ongoing Audio Call Notification Test Suite ===\n');

// 1. Verify AndroidManifest.xml declarations
const manifest = readFile('android/app/src/main/AndroidManifest.xml');
assert.match(
  manifest,
  /android:name="\.OSAAudioCallAcceptActivity"/,
  'OSAAudioCallAcceptActivity must be registered in AndroidManifest.xml'
);
assert.match(
  manifest,
  /android:theme="@android:style\/Theme\.Translucent\.NoTitleBar"/,
  'OSAAudioCallAcceptActivity must use translucent theme so OSA UI is never shown'
);
assert.match(
  manifest,
  /app\.osa\.messaging\.ACTION_TOGGLE_MUTE_CALL/,
  'OSACallActionReceiver must declare ACTION_TOGGLE_MUTE_CALL'
);
assert.match(
  manifest,
  /app\.osa\.messaging\.ACTION_TOGGLE_SPEAKER_CALL/,
  'OSACallActionReceiver must declare ACTION_TOGGLE_SPEAKER_CALL'
);
assert.match(
  manifest,
  /app\.osa\.messaging\.ACTION_END_CALL/,
  'OSACallActionReceiver must declare ACTION_END_CALL'
);
console.log('[PASS] 1. AndroidManifest.xml declares OSAAudioCallAcceptActivity and all call actions');

// 2. Verify OSACallActionReceiver background audio accept & control actions
const receiver = readFile('android/app/src/main/java/app/osa/messaging/OSACallActionReceiver.java');
assert.match(
  receiver,
  /ACTION_TOGGLE_SPEAKER_CALL = "app\.osa\.messaging\.ACTION_TOGGLE_SPEAKER_CALL"/,
  'OSACallActionReceiver must define ACTION_TOGGLE_SPEAKER_CALL'
);
assert.match(
  receiver,
  /OSACallNotificationService\.acceptIncomingAudioCallInBackground\(/,
  'OSACallActionReceiver must accept audio calls directly in the background without foregrounding MainActivity'
);
assert.match(
  receiver,
  /OSACallNotificationService\.toggleOngoingCallMuteState\(/,
  'OSACallActionReceiver must handle Mute/Unmute toggle directly from the notification'
);
assert.match(
  receiver,
  /OSACallNotificationService\.toggleOngoingCallSpeakerState\(/,
  'OSACallActionReceiver must handle Speaker ON/OFF toggle directly from the notification'
);
assert.match(
  receiver,
  /OSACallNotificationService\.endCallAndCleanup\(/,
  'OSACallActionReceiver must clean up all call resources on End/Reject'
);
console.log('[PASS] 2. OSACallActionReceiver handles background audio accept, Mute/Unmute, Speaker ON/OFF, and End Call');

// 3. Verify OSACallNotificationService background WebRTC audio engine & notification controls
const notifService = readFile(
  'android/app/src/main/java/app/osa/messaging/OSACallNotificationService.java'
);
assert.match(
  notifService,
  /if \(isVideo \|\| isDeviceLockedOrScreenOff\(context\)\)/,
  'OSACallNotificationService must not launch full-screen activity over other apps during unlocked audio calls'
);
assert.match(
  notifService,
  /String muteActionTitle = isMuted \? "Unmute" : "Mute"/,
  'Ongoing call notification must dynamically update Mute / Unmute label'
);
assert.match(
  notifService,
  /String speakerActionTitle = isSpeakerOn \? "Speaker OFF" : "Speaker ON"/,
  'Ongoing call notification must dynamically update Speaker ON / Speaker OFF label'
);
assert.match(
  notifService,
  /startBackgroundWebRtcAudioSession\(/,
  'OSACallNotificationService must establish and maintain the WebRTC audio session in the background'
);
assert.match(
  notifService,
  /AudioDeviceInfo\.TYPE_BUILTIN_EARPIECE/,
  'OSACallNotificationService must default to phone earpiece when available'
);
assert.match(
  notifService,
  /AudioDeviceInfo\.TYPE_BLUETOOTH_SCO/,
  'OSACallNotificationService must respect connected Bluetooth headsets'
);
assert.match(
  notifService,
  /AudioDeviceInfo\.TYPE_WIRED_HEADSET/,
  'OSACallNotificationService must respect connected wired headsets'
);
assert.match(
  notifService,
  /AudioDeviceInfo\.TYPE_BUILTIN_SPEAKER/,
  'OSACallNotificationService must support loudspeaker routing'
);
assert.match(
  notifService,
  /stopBackgroundWebRtcAudioSession\(/,
  'OSACallNotificationService must tear down background WebRTC tracks and peer connection on call end'
);
console.log('[PASS] 3. OSACallNotificationService implements background WebRTC audio session, audio routing, and 3-action ongoing notification');

// 4. Verify OSAIncomingCallActivity does not foreground MainActivity on audio call accept
const incomingActivity = readFile(
  'android/app/src/main/java/app/osa/messaging/OSAIncomingCallActivity.java'
);
assert.match(
  incomingActivity,
  /OSACallNotificationService\.acceptIncomingAudioCallInBackground\(getApplicationContext\(\), bgAcceptIntent\);/,
  'OSAIncomingCallActivity must accept audio calls in the background and finish without launching MainActivity'
);
console.log('[PASS] 4. OSAIncomingCallActivity accepts lock-screen audio calls in background without opening OSA UI');

// 5. Verify Web/Native Bridge & UI state synchronization
const bridgeTs = readFile('src/services/nativeMobileBridge.ts');
assert.match(bridgeTs, /'speaker_on'/, 'nativeMobileBridge must support speaker_on action');
assert.match(bridgeTs, /'speaker_off'/, 'nativeMobileBridge must support speaker_off action');
assert.match(bridgeTs, /'bg_audio_accepted'/, 'nativeMobileBridge must support bg_audio_accepted action');
assert.match(bridgeTs, /'bg_audio_connected'/, 'nativeMobileBridge must support bg_audio_connected action');
assert.match(bridgeTs, /export function isNativeCallMuted\(\)/, 'nativeMobileBridge must export isNativeCallMuted');
assert.match(
  bridgeTs,
  /export function isNativeBackgroundAudioCallActive\(/,
  'nativeMobileBridge must export isNativeBackgroundAudioCallActive'
);

const appTsx = readFile('src/App.tsx');
assert.match(
  appTsx,
  /detail\.action === 'bg_audio_accepted' \|\| detail\.action === 'bg_audio_connected'/,
  'App.tsx must synchronize background audio call acceptance and connection states'
);
assert.match(
  appTsx,
  /detail\.action === 'speaker_on' \|\| detail\.action === 'speaker_off'/,
  'App.tsx must synchronize notification Speaker ON/OFF toggles'
);

const callOverlayTsx = readFile('src/components/CallOverlay.tsx');
assert.match(
  callOverlayTsx,
  /osa:native-call-speaker-changed/,
  'CallOverlay.tsx must listen for osa:native-call-speaker-changed'
);
assert.match(
  callOverlayTsx,
  /osa:native-call-mute-changed/,
  'CallOverlay.tsx must listen for osa:native-call-mute-changed'
);
console.log('[PASS] 5. Web/Native bridge, App.tsx, and CallOverlay.tsx synchronize Mute, Speaker, and End Call');

console.log('\nAll audio call notification and control synchronization tests passed!');
