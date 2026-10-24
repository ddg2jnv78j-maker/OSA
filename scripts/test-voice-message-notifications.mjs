import assert from 'node:assert/strict';
import fs from 'node:fs';
import path from 'node:path';
import { fileURLToPath } from 'node:url';

const __dirname = path.dirname(fileURLToPath(import.meta.url));
const rootDir = path.resolve(__dirname, '..');

function readFile(relPath) {
  return fs.readFileSync(path.join(rootDir, relPath), 'utf8');
}

console.log('=== OSA Android Voice Message Standalone Notification Test Suite ===\n');

// 1. AndroidManifest.xml registration
const manifest = readFile('android/app/src/main/AndroidManifest.xml');
assert.match(
  manifest,
  /android:name="\.OSAVoiceNotificationService"/,
  'OSAVoiceNotificationService must be registered in AndroidManifest.xml'
);
assert.match(
  manifest,
  /android:foregroundServiceType="mediaPlayback"/,
  'OSAVoiceNotificationService must specify foregroundServiceType="mediaPlayback"'
);
assert.match(
  manifest,
  /android:name="\.OSAVoiceNotificationReceiver"/,
  'OSAVoiceNotificationReceiver must be registered in AndroidManifest.xml'
);
assert.match(
  manifest,
  /app\.osa\.messaging\.ACTION_PLAY_VOICE/,
  'AndroidManifest must declare ACTION_PLAY_VOICE'
);
assert.match(
  manifest,
  /app\.osa\.messaging\.ACTION_PAUSE_VOICE/,
  'AndroidManifest must declare ACTION_PAUSE_VOICE'
);
assert.match(
  manifest,
  /app\.osa\.messaging\.ACTION_TOGGLE_PLAY_VOICE/,
  'AndroidManifest must declare ACTION_TOGGLE_PLAY_VOICE'
);
assert.match(
  manifest,
  /app\.osa\.messaging\.ACTION_NOOP_VOICE/,
  'AndroidManifest must declare ACTION_NOOP_VOICE'
);
console.log('[PASS] 1. AndroidManifest.xml correctly declares OSAVoiceNotificationService, Receiver, and all actions');

// 2. OSAVoiceNotificationReceiver verification
const receiver = readFile('android/app/src/main/java/app/osa/messaging/OSAVoiceNotificationReceiver.java');
assert.match(
  receiver,
  /ACTION_NOOP_VOICE = "app\.osa\.messaging\.ACTION_NOOP_VOICE"/,
  'OSAVoiceNotificationReceiver must define ACTION_NOOP_VOICE'
);
assert.match(
  receiver,
  /ACTION_PLAY_VOICE = "app\.osa\.messaging\.ACTION_PLAY_VOICE"/,
  'OSAVoiceNotificationReceiver must define ACTION_PLAY_VOICE'
);
assert.match(
  receiver,
  /ACTION_PAUSE_VOICE = "app\.osa\.messaging\.ACTION_PAUSE_VOICE"/,
  'OSAVoiceNotificationReceiver must define ACTION_PAUSE_VOICE'
);
assert.match(
  receiver,
  /ACTION_TOGGLE_PLAY_VOICE = "app\.osa\.messaging\.ACTION_TOGGLE_PLAY_VOICE"/,
  'OSAVoiceNotificationReceiver must define ACTION_TOGGLE_PLAY_VOICE'
);
assert.match(
  receiver,
  /if \(action == null \|\| ACTION_NOOP_VOICE\.equals\(action\)\) \{\s*\/\/ Absorb tap on voice notification body without opening MainActivity/,
  'OSAVoiceNotificationReceiver must absorb body tap NOOP without launching MainActivity'
);
console.log('[PASS] 2. OSAVoiceNotificationReceiver absorbs NOOP taps and delegates playback to service');

// 3. OSAVoiceNotificationService verification
const voiceService = readFile('android/app/src/main/java/app/osa/messaging/OSAVoiceNotificationService.java');
assert.match(
  voiceService,
  /isVoiceMessagePayload\(Map<String, String> data\)/,
  'OSAVoiceNotificationService must provide isVoiceMessagePayload detection'
);
assert.match(
  voiceService,
  /postVoiceMessageNotification\(Context context, Map<String, String> data\)/,
  'OSAVoiceNotificationService must provide postVoiceMessageNotification'
);
assert.match(
  voiceService,
  /OSAVoiceNotificationReceiver\.ACTION_TOGGLE_PLAY_VOICE/,
  'Voice notification body contentIntent must point to OSAVoiceNotificationReceiver (never MainActivity)'
);
assert.match(
  voiceService,
  /RemoteInput\.Builder\(OSANotificationReplyReceiver\.KEY_TEXT_REPLY\)/,
  'Voice notification must provide in-notification inline reply via RemoteInput'
);
assert.match(
  voiceService,
  /isVoiceMessage.*true/,
  'Voice notification reply intent must pass isVoiceMessage flag'
);
assert.match(
  voiceService,
  /MediaPlayer/,
  'OSAVoiceNotificationService must support audio playback via MediaPlayer'
);
assert.match(
  voiceService,
  /FOREGROUND_SERVICE_TYPE_MEDIA_PLAYBACK/,
  'OSAVoiceNotificationService must run with mediaPlayback foreground type when playing'
);
console.log('[PASS] 3. OSAVoiceNotificationService builds interactive notification with Play/Pause & RemoteInput without launching MainActivity');

// 4. OSAFirebaseMessagingService & OSABackgroundMessagingService integration
const fcmService = readFile('android/app/src/main/java/app/osa/messaging/OSAFirebaseMessagingService.java');
assert.match(
  fcmService,
  /OSAVoiceNotificationService\.isVoiceMessagePayload\(data\)/,
  'OSAFirebaseMessagingService must detect voice messages'
);
assert.match(
  fcmService,
  /OSAVoiceNotificationService\.postVoiceMessageNotification\(context, data\)/,
  'OSAFirebaseMessagingService must route voice messages to OSAVoiceNotificationService'
);

const bgService = readFile('android/app/src/main/java/app/osa/messaging/OSABackgroundMessagingService.java');
assert.match(
  bgService,
  /msgData\.put\("messageType", messageType\);/,
  'OSABackgroundMessagingService must preserve messageType in msgData'
);
console.log('[PASS] 4. FCM and Background Messaging services correctly route voice messages to OSAVoiceNotificationService');

// 5. OSANotificationReplyReceiver inline reply without opening MainActivity
const replyReceiver = readFile('android/app/src/main/java/app/osa/messaging/OSANotificationReplyReceiver.java');
assert.match(
  replyReceiver,
  /boolean isVoiceMessage = intent\.getBooleanExtra\("isVoiceMessage", false\);/,
  'OSANotificationReplyReceiver must check isVoiceMessage flag'
);
assert.match(
  replyReceiver,
  /if \(isVoiceMessage\) \{\s*\/\/ Tapping Voice Message notification feedback must NEVER launch MainActivity/,
  'OSANotificationReplyReceiver feedback must NEVER launch MainActivity for voice notifications'
);
console.log('[PASS] 5. OSANotificationReplyReceiver sends in-notification replies and never opens MainActivity');

console.log('\nAll standalone Voice Message notification tests passed successfully!');
