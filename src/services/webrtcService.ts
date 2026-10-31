import { RealtimeChannel } from '@supabase/supabase-js';
import { getIceServers, supabase } from '../lib/supabase';
import { CallRecord, CallSignal, CallStatus, CallType, SignalType } from '../types/osa';
import { createCallRecord, createNotification, updateCallRecordStatus } from './osaService';
import {
  notifyNativeCallConnected,
  reportNativeActiveCallState,
  setNativeCallAudioRoute,
} from './nativeMobileBridge';
import {
  checkNativePermissions,
  saveStoredPermissionStatus,
} from './permissionService';
import {
  dismissIncomingCallSystemNotification,
  dispatchWebPushNotification,
} from './pushNotificationService';
import {
  startCallerRingbackTone,
  stopCallerRingbackTone,
  stopIncomingCallRingtone,
} from './ringtoneService';

export interface WebRTCCallCallbacks {
  onLocalStream: (stream: MediaStream | null) => void;
  onRemoteStream: (stream: MediaStream | null) => void;
  onStatusChange: (status: CallStatus, errorMessage?: string) => void;
}

/**
 * Configure WebRTC audio SDP parameters:
 * Enables Opus in-band FEC (forward error correction) and comfortable 32 kbps voice bitrate,
 * ensuring natural, clear human voice without packet-loss artifacts or robotic clipping.
 */
function enhanceSdpAudio(sdp: string): string {
  if (!sdp) return sdp;
  return sdp.replace(/a=fmtp:(\d+) (.*)/g, (match, pt, params) => {
    if (params.includes('minptime=') || sdp.includes(`a=rtpmap:${pt} opus/`)) {
      let updated = params;
      if (!updated.includes('useinbandfec=1')) {
        updated += ';useinbandfec=1';
      }
      if (!updated.includes('maxaveragebitrate=')) {
        updated += ';maxaveragebitrate=32000';
      }
      return `a=fmtp:${pt} ${updated}`;
    }
    return match;
  });
}

export class WebRTCCallManager {
  private peerConnection: RTCPeerConnection | null = null;
  private localStream: MediaStream | null = null;
  private remoteStream: MediaStream | null = null;
  private signalChannel: RealtimeChannel | null = null;
  private currentCall: CallRecord | null = null;
  private currentUserId: string;
  private callbacks: WebRTCCallCallbacks;
  private pendingCandidates: RTCIceCandidateInit[] = [];
  private processedSignalIds: Set<string> = new Set();
  private cachedOffer: CallSignal | null = null;
  private callTimeoutTimer: number | null = null;
  private connectConfirmTimer: number | null = null;
  private signalPollTimer: number | null = null;
  private connectedAtMs: number | null = null;
  private isEndingCall = false;
  private isAcceptedOrConnecting = false;
  private isSpeakerOn = false;
  private facingMode: 'user' | 'environment' = 'user';
  private screenStream: MediaStream | null = null;
  private preScreenVideoTrack: MediaStreamTrack | null = null;

  constructor(currentUserId: string, callbacks: WebRTCCallCallbacks) {
    this.currentUserId = currentUserId;
    this.callbacks = callbacks;
  }

  public getCallRecord(): CallRecord | null {
    return this.currentCall;
  }

  public async startOutgoingCall(params: {
    receiverId: string;
    receiverName: string;
    chatId?: string | null;
    callType: CallType;
  }): Promise<CallRecord> {
    try {
      this.callbacks.onStatusChange('calling');
      this.isSpeakerOn = params.callType === 'video';
      setNativeCallAudioRoute(this.isSpeakerOn ? 'speaker' : 'earpiece');

      // 1. Acquire local microphone (and camera if normal video call) in parallel with creating the call record
      const [stream, callRecord] = await Promise.all([
        this.acquireMediaStream(params.callType),
        createCallRecord({
          callerId: this.currentUserId,
          receiverId: params.receiverId,
          chatId: params.chatId || null,
          callType: params.callType,
        }),
      ]);
      this.localStream = stream;
      this.callbacks.onLocalStream(new MediaStream(stream.getTracks()));
      this.currentCall = callRecord;

      reportNativeActiveCallState({
        active: true,
        callId: callRecord.id,
        callType: params.callType,
      });

      // 2. Initialize RTCPeerConnection, add local tracks, and subscribe to signaling
      this.initPeerConnection(callRecord.id, params.receiverId);
      const subscribePromise = this.subscribeToCallSignals(callRecord.id);

      // 3. Create SDP Offer and store in `call_signals` BEFORE notifying receiver
      const offer = await this.peerConnection!.createOffer({
        offerToReceiveAudio: true,
        offerToReceiveVideo: params.callType === 'video',
      });
      offer.sdp = enhanceSdpAudio(offer.sdp || '');
      await Promise.all([
        this.peerConnection!.setLocalDescription(offer),
        subscribePromise,
      ]);

      await this.sendSignal(callRecord.id, params.receiverId, 'offer', {
        sdp: offer.sdp,
        type: offer.type,
        callType: params.callType,
      });

      // 5. Notify receiver in notifications table & Web Push
      await createNotification({
        userId: params.receiverId,
        actorId: this.currentUserId,
        type: 'incoming_call',
        title: `Incoming ${params.callType === 'video' ? 'Video' : 'Audio'} Call`,
        body: `Incoming ${params.callType} call on OSA`,
        referenceId: callRecord.id,
        chatId: params.chatId || null,
        callType: params.callType,
      });

      // 6. Set 45-second unanswered timeout
      this.callTimeoutTimer = window.setTimeout(async () => {
        if (
          this.currentCall &&
          (this.currentCall.status === 'calling' || this.currentCall.status === 'ringing')
        ) {
          await updateCallRecordStatus(callRecord.id, 'missed', {
            ended_at: new Date().toISOString(),
          });
          dispatchWebPushNotification({
            senderId: this.currentUserId,
            recipientIds: [params.receiverId],
            type: 'cancel_call',
            title: 'Call Missed',
            body: 'Call ended',
            chatId: params.chatId || null,
            callId: callRecord.id,
            callType: params.callType,
          }).catch(() => {});
          await createNotification({
            userId: params.receiverId,
            actorId: this.currentUserId,
            type: 'missed_call',
            title: 'Missed Call',
            body: `You missed a ${params.callType} call on OSA`,
            referenceId: callRecord.id,
            chatId: params.chatId || null,
          });
          this.callbacks.onStatusChange('missed', 'User did not answer in time.');
          this.cleanup();
        }
      }, 45000);

      return callRecord;
    } catch (err) {
      const msg = this.describeMediaOrNetworkError(err);
      if (this.currentCall) {
        await updateCallRecordStatus(this.currentCall.id, 'failed', {
          ended_at: new Date().toISOString(),
        });
      }
      this.callbacks.onStatusChange('failed', msg);
      this.cleanup();
      throw new Error(msg);
    }
  }

  public async prepareIncomingCall(callRecord: CallRecord): Promise<void> {
    if (
      this.isAcceptedOrConnecting ||
      this.currentCall?.status === 'accepted' ||
      this.currentCall?.status === 'connected'
    ) {
      return;
    }
    this.currentCall = callRecord;
    await this.subscribeToCallSignals(callRecord.id);

    if (
      this.isAcceptedOrConnecting ||
      this.currentCall?.status === 'accepted' ||
      this.currentCall?.status === 'connected'
    ) {
      return;
    }

    // Only transition to RINGING and notify the caller when this device is online and reachable
    if (typeof navigator !== 'undefined' && !navigator.onLine) {
      return;
    }

    this.currentCall.status = 'ringing';
    this.callbacks.onStatusChange('ringing');
    await updateCallRecordStatus(callRecord.id, 'ringing');
    if (this.isAcceptedOrConnecting) {
      return;
    }
    await this.sendSignal(callRecord.id, callRecord.caller_id, 'ringing', {
      reachable: true,
      timestamp: new Date().toISOString(),
    });
  }

  public async acceptIncomingCall(callRecord: CallRecord): Promise<void> {
    if (this.isAcceptedOrConnecting && this.currentCall?.id === callRecord.id) {
      return;
    }
    this.isAcceptedOrConnecting = true;
    try {
      stopIncomingCallRingtone();
      stopCallerRingbackTone();

      this.currentCall = {
        ...callRecord,
        status: 'accepted',
      };
      this.callbacks.onStatusChange('accepted');

      // Configure default audio route immediately: earpiece for audio calls, speakerphone for video calls
      this.isSpeakerOn = callRecord.call_type === 'video';
      setNativeCallAudioRoute(this.isSpeakerOn ? 'speaker' : 'earpiece');
      reportNativeActiveCallState({
        active: true,
        callId: callRecord.id,
        callType: callRecord.call_type,
      });

      // Transition Android notification into an Ongoing Call Notification (stops ringtone immediately, keeps End Call action)
      notifyNativeCallConnected(callRecord.id, {
        callType: callRecord.call_type,
        peerId: callRecord.caller_id,
        peerName: callRecord.caller?.full_name || 'OSA Call',
        chatId: callRecord.chat_id,
      });

      // Pre-initialize RTCPeerConnection before media acquisition so local ICE host/STUN candidate gathering runs in parallel with camera/mic hardware startup
      if (this.peerConnection) {
        this.peerConnection.close();
        this.peerConnection = null;
      }
      this.initPeerConnection(callRecord.id, callRecord.caller_id);

      // Fire status update & renegotiate signal non-blockingly so they never delay media or SDP negotiation
      updateCallRecordStatus(callRecord.id, 'accepted').catch(() => {});
      this.sendSignal(callRecord.id, callRecord.caller_id, 'renegotiate', {
        status: 'accepted',
      }).catch(() => {});

      const fetchInitialSignalsAndCall = async (): Promise<{
        latestStatus: CallStatus | null;
        offerSignal?: CallSignal;
        callerCandidates: CallSignal[];
      }> => {
        const { data: latestCall } = await supabase
          .from('calls')
          .select('id, status, caller_id, receiver_id, call_type')
          .eq('id', callRecord.id)
          .maybeSingle();

        if (
          latestCall &&
          (latestCall.status === 'ended' ||
            latestCall.status === 'rejected' ||
            latestCall.status === 'missed' ||
            latestCall.status === 'failed')
        ) {
          return {
            latestStatus: latestCall.status as CallStatus,
            callerCandidates: [],
          };
        }

        let offerSignal: CallSignal | undefined = this.cachedOffer || undefined;
        let allSignals: CallSignal[] = [];

        if (!offerSignal) {
          for (let attempt = 0; attempt < 8; attempt++) {
            const { data: signals } = await supabase
              .from('call_signals')
              .select('*')
              .eq('call_id', callRecord.id)
              .order('created_at', { ascending: true });

            allSignals = (signals || []) as CallSignal[];
            offerSignal = allSignals.find(
              (s) => s.signal_type === 'offer' && Boolean(s.payload?.sdp)
            );
            if (offerSignal) break;
            await new Promise((r) => setTimeout(r, 120));
          }
        } else {
          // If cached offer exists, do one quick fetch for ICE candidates without waiting in loop
          const { data: signals } = await supabase
            .from('call_signals')
            .select('*')
            .eq('call_id', callRecord.id)
            .order('created_at', { ascending: true });
          allSignals = (signals || []) as CallSignal[];
        }

        const callerCandidates = allSignals.filter(
          (s) => s.signal_type === 'ice-candidate' && s.sender_id === callRecord.caller_id
        );

        return {
          latestStatus: (latestCall?.status as CallStatus) || 'accepted',
          offerSignal,
          callerCandidates,
        };
      };

      // Run camera/mic stream acquisition, Realtime channel subscription, and offer/ICE fetch concurrently!
      const [stream, signalFetchResult] = await Promise.all([
        this.acquireMediaStream(callRecord.call_type).then((mediaStream) => {
          this.localStream = mediaStream;
          this.callbacks.onLocalStream(new MediaStream(mediaStream.getTracks()));
          if (this.peerConnection) {
            mediaStream.getTracks().forEach((track) => {
              const alreadyAdded = this.peerConnection!
                .getSenders()
                .some((s) => s.track?.id === track.id);
              if (!alreadyAdded) {
                this.peerConnection!.addTrack(track, mediaStream);
              }
            });
          }
          return mediaStream;
        }),
        fetchInitialSignalsAndCall(),
        this.subscribeToCallSignals(callRecord.id),
      ]);

      // Ensure local tracks are attached to peerConnection
      if (this.peerConnection && stream) {
        stream.getTracks().forEach((track) => {
          const alreadyAdded = this.peerConnection!
            .getSenders()
            .some((s) => s.track?.id === track.id);
          if (!alreadyAdded) {
            this.peerConnection!.addTrack(track, stream);
          }
        });
      }

      if (
        signalFetchResult.latestStatus === 'ended' ||
        signalFetchResult.latestStatus === 'rejected' ||
        signalFetchResult.latestStatus === 'missed' ||
        signalFetchResult.latestStatus === 'failed'
      ) {
        await dismissIncomingCallSystemNotification(callRecord.id);
        this.callbacks.onStatusChange(
          signalFetchResult.latestStatus,
          'This call has already ended.'
        );
        this.cleanup();
        return;
      }

      const offerSignal = signalFetchResult.offerSignal;
      if (!offerSignal || !offerSignal.payload?.sdp) {
        throw new Error('Call offer signal not found or expired.');
      }
      this.processedSignalIds.add(offerSignal.id);

      await this.peerConnection!.setRemoteDescription(
        new RTCSessionDescription({
          type: (offerSignal.payload.type as RTCSdpType) || 'offer',
          sdp: offerSignal.payload.sdp as string,
        })
      );

      // Apply all caller ICE candidates fetched in parallel + any Realtime candidates queued while camera was opening
      for (const sig of signalFetchResult.callerCandidates) {
        this.processedSignalIds.add(sig.id);
        if (sig.payload?.candidate) {
          this.pendingCandidates.push(sig.payload.candidate as RTCIceCandidateInit);
        }
      }

      const candidatesToApply = [...this.pendingCandidates];
      this.pendingCandidates = [];
      await Promise.all(
        candidatesToApply.map(async (candidate) => {
          try {
            await this.peerConnection?.addIceCandidate(new RTCIceCandidate(candidate));
          } catch {
            // Ignore duplicate candidate
          }
        })
      );

      const answer = await this.peerConnection!.createAnswer();
      answer.sdp = enhanceSdpAudio(answer.sdp || '');
      await this.peerConnection!.setLocalDescription(answer);

      await this.sendSignal(callRecord.id, callRecord.caller_id, 'answer', {
        sdp: answer.sdp,
        type: answer.type,
      });

      // Only transition to 'connected' when the actual WebRTC peer connection / ICE succeeds.
      // Never falsely mark a call as connected before the connection succeeds.
      const activePc = this.peerConnection as RTCPeerConnection | null;
      const iceState = activePc?.iceConnectionState;
      const connState = activePc?.connectionState;
      if (
        iceState === 'connected' ||
        iceState === 'completed' ||
        connState === 'connected'
      ) {
        const nowIso = new Date().toISOString();
        this.connectedAtMs = Date.now();
        if (this.currentCall) {
          this.currentCall.status = 'connected';
        }
        await updateCallRecordStatus(callRecord.id, 'connected', {
          answered_at: nowIso,
        });
        notifyNativeCallConnected(callRecord.id, {
          callType: callRecord.call_type,
          peerId: callRecord.caller_id,
          peerName: callRecord.caller?.full_name || 'OSA Call',
          chatId: callRecord.chat_id,
        });
        this.callbacks.onStatusChange('connected');
      } else {
        if (this.connectConfirmTimer) {
          clearTimeout(this.connectConfirmTimer);
        }
        this.connectConfirmTimer = window.setTimeout(async () => {
          this.connectConfirmTimer = null;
          const pcNow = this.peerConnection;
          const iceNow = pcNow?.iceConnectionState;
          const connNow = pcNow?.connectionState;
          if (
            iceNow === 'connected' ||
            iceNow === 'completed' ||
            connNow === 'connected'
          ) {
            if (this.currentCall && this.currentCall.status === 'accepted') {
              this.connectedAtMs = this.connectedAtMs || Date.now();
              this.currentCall.status = 'connected';
              await updateCallRecordStatus(callRecord.id, 'connected', {
                answered_at: new Date().toISOString(),
              });
              this.callbacks.onStatusChange('connected');
              this.emitUpdatedRemoteStream();
            }
          } else if (this.currentCall && this.currentCall.status === 'accepted') {
            await updateCallRecordStatus(callRecord.id, 'failed', {
              ended_at: new Date().toISOString(),
            });
            this.callbacks.onStatusChange(
              'failed',
              'Could not establish audio/video connection with peer.'
            );
            this.cleanup();
          }
        }, 25000);
      }
    } catch (err) {
      const msg = this.describeMediaOrNetworkError(err);
      await dismissIncomingCallSystemNotification(callRecord.id);
      await updateCallRecordStatus(callRecord.id, 'failed', {
        ended_at: new Date().toISOString(),
      });
      this.callbacks.onStatusChange('failed', msg);
      this.cleanup();
      throw new Error(msg);
    }
  }

  public async rejectIncomingCall(callRecord: CallRecord): Promise<void> {
    await dismissIncomingCallSystemNotification(callRecord.id);
    await updateCallRecordStatus(callRecord.id, 'rejected', {
      ended_at: new Date().toISOString(),
    });
    await this.sendSignal(callRecord.id, callRecord.caller_id, 'reject', {});
    this.callbacks.onStatusChange('rejected');
    this.cleanup();
  }

  public async endCall(): Promise<void> {
    if (this.isEndingCall) return;
    this.isEndingCall = true;
    const callToEnd = this.currentCall;
    this.currentCall = null;
    try {
      if (callToEnd) {
        await dismissIncomingCallSystemNotification(callToEnd.id);
        const isCaller = callToEnd.caller_id === this.currentUserId;
        const peerId = isCaller ? callToEnd.receiver_id : callToEnd.caller_id;

        const wasUnanswered =
          !this.connectedAtMs &&
          (callToEnd.status === 'calling' || callToEnd.status === 'ringing');

        const durationSeconds = this.connectedAtMs
          ? Math.max(1, Math.round((Date.now() - this.connectedAtMs) / 1000))
          : 0;

        await updateCallRecordStatus(callToEnd.id, 'ended', {
          ended_at: new Date().toISOString(),
          duration_seconds: durationSeconds,
        });

        await this.sendSignal(callToEnd.id, peerId, 'hangup', {
          duration_seconds: durationSeconds,
        });

        if (isCaller && wasUnanswered) {
          dispatchWebPushNotification({
            senderId: this.currentUserId,
            recipientIds: [peerId],
            type: 'cancel_call',
            title: 'Call Ended',
            body: 'Caller ended the call',
            chatId: callToEnd.chat_id || null,
            callId: callToEnd.id,
            callType: callToEnd.call_type,
          }).catch(() => {});
        }
      }
    } finally {
      this.callbacks.onStatusChange('ended');
      this.cleanup();
    }
  }

  public toggleMute(muted: boolean): boolean {
    if (this.localStream) {
      this.localStream.getAudioTracks().forEach((track) => {
        track.enabled = !muted;
      });
    }
    if (this.currentCall?.id) {
      try {
        window.OSANativeAndroid?.setCallMuteState?.(this.currentCall.id, muted);
      } catch {
        // Ignore
      }
    }
    return muted;
  }

  public toggleCamera(cameraEnabled: boolean): boolean {
    if (!this.localStream) return false;
    this.localStream.getVideoTracks().forEach((track) => {
      track.enabled = cameraEnabled;
    });
    return cameraEnabled;
  }

  public toggleSpeakerphone(speakerEnabled: boolean): boolean {
    this.isSpeakerOn = speakerEnabled;
    setNativeCallAudioRoute(speakerEnabled ? 'speaker' : 'earpiece');
    return this.isSpeakerOn;
  }

  public isSpeakerphoneEnabled(): boolean {
    return this.isSpeakerOn;
  }

  public async switchCamera(): Promise<void> {
    if (!this.localStream || !this.currentCall || this.currentCall.call_type !== 'video') return;

    this.facingMode = this.facingMode === 'user' ? 'environment' : 'user';

    let newStream: MediaStream;
    try {
      newStream = await navigator.mediaDevices.getUserMedia({
        audio: false,
        video: {
          facingMode: this.facingMode,
          width: { ideal: 1280 },
          height: { ideal: 720 },
        },
      });
    } catch {
      newStream = await navigator.mediaDevices.getUserMedia({
        audio: false,
        video: { facingMode: this.facingMode },
      });
    }

    const newVideoTrack = newStream.getVideoTracks()[0];
    if (!newVideoTrack) return;

    const oldVideoTrack = this.localStream.getVideoTracks()[0];
    if (oldVideoTrack) {
      this.localStream.removeTrack(oldVideoTrack);
      oldVideoTrack.stop();
    }
    this.localStream.addTrack(newVideoTrack);

    if (this.peerConnection) {
      const sender = this.peerConnection.getSenders().find((s) => s.track?.kind === 'video');
      if (sender) {
        await sender.replaceTrack(newVideoTrack);
      }
    }
    this.callbacks.onLocalStream(new MediaStream(this.localStream.getTracks()));
  }

  public isScreenSharing(): boolean {
    return Boolean(this.screenStream);
  }

  public async toggleScreenShare(): Promise<boolean> {
    if (this.screenStream) {
      await this.stopScreenShare();
      return false;
    } else {
      return await this.startScreenShare();
    }
  }

  public async startScreenShare(): Promise<boolean> {
    if (!navigator.mediaDevices?.getDisplayMedia) {
      throw new Error('Screen sharing is not supported on this browser or platform.');
    }
    const screenStream = await navigator.mediaDevices.getDisplayMedia({
      video: { cursor: 'always' } as MediaTrackConstraints,
      audio: false,
    });
    const screenVideoTrack = screenStream.getVideoTracks()[0];
    if (!screenVideoTrack) return false;

    this.screenStream = screenStream;
    const oldVideoTrack = this.localStream?.getVideoTracks()[0];
    this.preScreenVideoTrack = oldVideoTrack || null;

    if (oldVideoTrack && this.localStream) {
      this.localStream.removeTrack(oldVideoTrack);
    }
    if (this.localStream) {
      this.localStream.addTrack(screenVideoTrack);
    }

    if (this.peerConnection) {
      const sender = this.peerConnection.getSenders().find((s) => s.track?.kind === 'video');
      if (sender) {
        await sender.replaceTrack(screenVideoTrack);
      }
    }
    if (this.localStream) {
      this.callbacks.onLocalStream(new MediaStream(this.localStream.getTracks()));
    }

    screenVideoTrack.onended = () => {
      this.stopScreenShare().catch(() => {});
    };

    return true;
  }

  public async stopScreenShare(): Promise<void> {
    if (!this.screenStream) return;
    this.screenStream.getTracks().forEach((t) => t.stop());
    this.screenStream = null;

    if (this.preScreenVideoTrack && this.localStream) {
      const currentTrack = this.localStream.getVideoTracks()[0];
      if (currentTrack) {
        this.localStream.removeTrack(currentTrack);
      }
      this.localStream.addTrack(this.preScreenVideoTrack);
      if (this.peerConnection) {
        const sender = this.peerConnection.getSenders().find((s) => s.track?.kind === 'video');
        if (sender) {
          await sender.replaceTrack(this.preScreenVideoTrack);
        }
      }
      this.callbacks.onLocalStream(new MediaStream(this.localStream.getTracks()));
    }
    this.preScreenVideoTrack = null;
  }

  private async acquireMediaStream(callType: CallType): Promise<MediaStream> {
    if (!navigator.mediaDevices || !navigator.mediaDevices.getUserMedia) {
      throw new Error('Your browser does not support WebRTC audio/video access (HTTPS is required).');
    }

    // Fast check for in-app privacy toggles
    const perm = await checkNativePermissions(this.currentUserId);
    if (!perm.microphoneEnabled) {
      throw new Error(
        'Microphone access is disabled in OSA Settings. Please enable Microphone in Settings → Privacy / Permissions.'
      );
    }
    if (callType === 'video' && !perm.cameraEnabled) {
      throw new Error(
        'Camera access is disabled in OSA Settings. Please enable Camera in Settings → Privacy / Permissions.'
      );
    }

    // High quality WebRTC audio constraints with natural speech processing (avoids harsh/robotic cutoff)
    const audioConstraints: MediaTrackConstraints = {
      echoCancellation: true,
      noiseSuppression: true,
      autoGainControl: true,
      channelCount: 1,
      sampleRate: 48000,
    };

    // Adaptive video constraints (HD 720p 30fps ideal, gracefully adaptive to bandwidth & device)
    const videoConstraints: MediaTrackConstraints | boolean =
      callType === 'video'
        ? {
            facingMode: this.facingMode,
            width: { ideal: 1280, max: 1920 },
            height: { ideal: 720, max: 1080 },
            frameRate: { ideal: 30, max: 30 },
          }
        : false;

    let stream: MediaStream;
    try {
      stream = await navigator.mediaDevices.getUserMedia({
        audio: audioConstraints,
        video: videoConstraints,
      });
    } catch (primaryErr) {
      // If hardware was overconstrained, fallback to flexible constraints
      if (callType === 'video') {
        try {
          stream = await navigator.mediaDevices.getUserMedia({
            audio: {
              echoCancellation: true,
              noiseSuppression: true,
              autoGainControl: true,
            },
            video: { facingMode: this.facingMode },
          });
        } catch {
          // Last fallback
          stream = await navigator.mediaDevices.getUserMedia({
            audio: true,
            video: true,
          });
        }
      } else {
        throw primaryErr;
      }
    }

    saveStoredPermissionStatus(
      {
        microphone: 'granted',
        ...(callType === 'video' ? { camera: 'granted' } : {}),
      },
      this.currentUserId
    );
    return stream;
  }

  private emitUpdatedRemoteStream(): void {
    if (!this.remoteStream) return;
    const freshStream = new MediaStream(this.remoteStream.getTracks());
    this.callbacks.onRemoteStream(freshStream);
  }

  private initPeerConnection(callId: string, peerUserId: string): void {
    const pc = new RTCPeerConnection({
      iceServers: getIceServers(),
      iceCandidatePoolSize: 4,
    });

    this.remoteStream = new MediaStream();
    this.callbacks.onRemoteStream(this.remoteStream);

    if (this.localStream) {
      this.localStream.getTracks().forEach((track) => {
        pc.addTrack(track, this.localStream!);
      });
    }

    // Configure adaptive video bitrate (1.5 Mbps for smooth HD without buffer bloat)
    try {
      const videoSender = pc.getSenders().find((s) => s.track?.kind === 'video');
      if (videoSender && typeof videoSender.getParameters === 'function') {
        const params = videoSender.getParameters();
        if (!params.encodings || params.encodings.length === 0) {
          params.encodings = [{}];
        }
        params.encodings[0].maxBitrate = 1500000;
        params.encodings[0].networkPriority = 'high';
        if (typeof videoSender.setParameters === 'function') {
          videoSender.setParameters(params).catch(() => {});
        }
      }
    } catch {
      // Ignore
    }

    const handleConnectedState = async () => {
      stopCallerRingbackTone();
      stopIncomingCallRingtone();
      if (this.callTimeoutTimer) {
        clearTimeout(this.callTimeoutTimer);
        this.callTimeoutTimer = null;
      }
      if (this.connectConfirmTimer) {
        clearTimeout(this.connectConfirmTimer);
        this.connectConfirmTimer = null;
      }
      const wasAlreadyConnected = this.currentCall?.status === 'connected';
      if (!this.connectedAtMs) {
        this.connectedAtMs = Date.now();
      }
      if (this.currentCall) {
        this.currentCall.status = 'connected';
      }
      if (!wasAlreadyConnected) {
        updateCallRecordStatus(callId, 'connected', {
          answered_at: new Date().toISOString(),
        }).catch(() => {});
        notifyNativeCallConnected(callId, {
          callType: this.currentCall?.call_type,
          peerId: peerUserId,
          peerName:
            this.currentCall?.caller_id === this.currentUserId
              ? this.currentCall?.receiver?.full_name || 'OSA Call'
              : this.currentCall?.caller?.full_name || 'OSA Call',
          chatId: this.currentCall?.chat_id,
        });
        this.callbacks.onStatusChange('connected');
      }
      this.emitUpdatedRemoteStream();
    };

    pc.ontrack = (event) => {
      if (!this.remoteStream) {
        this.remoteStream = new MediaStream();
      }

      if (event.streams && event.streams[0]) {
        event.streams[0].getTracks().forEach((track) => {
          if (!this.remoteStream!.getTracks().some((t) => t.id === track.id)) {
            this.remoteStream!.addTrack(track);
          }
        });
      }

      if (
        event.track &&
        !this.remoteStream.getTracks().some((t) => t.id === event.track.id)
      ) {
        this.remoteStream.addTrack(event.track);
      }

      event.track.onunmute = () => {
        this.emitUpdatedRemoteStream();
        if (this.currentCall && this.currentCall.status === 'accepted') {
          handleConnectedState();
        }
      };

      this.emitUpdatedRemoteStream();
    };

    pc.onicecandidate = (event) => {
      if (event.candidate) {
        this.sendSignal(callId, peerUserId, 'ice-candidate', {
          candidate: event.candidate.toJSON(),
        }).catch(() => {});
      }
    };

    pc.oniceconnectionstatechange = () => {
      if (!pc) return;
      if (pc.iceConnectionState === 'connected' || pc.iceConnectionState === 'completed') {
        handleConnectedState();
      } else if (pc.iceConnectionState === 'disconnected') {
        // Handle temporary network changes without prematurely terminating the call
        if (this.currentCall && this.currentCall.status === 'connected') {
          this.callbacks.onStatusChange('connected', 'Reconnecting audio/video...');
        }
      } else if (pc.iceConnectionState === 'failed') {
        if (typeof (pc as any).restartIce === 'function') {
          try {
            (pc as any).restartIce();
            return;
          } catch {
            // Ignore
          }
        }
        stopCallerRingbackTone();
        this.callbacks.onStatusChange('failed', 'Call connection failed due to network restriction.');
      }
    };

    pc.onconnectionstatechange = async () => {
      if (!pc) return;
      if (pc.connectionState === 'connected') {
        await handleConnectedState();
      } else if (pc.connectionState === 'failed') {
        stopCallerRingbackTone();
        this.callbacks.onStatusChange('failed', 'Call connection lost due to network interruption.');
      }
    };

    this.peerConnection = pc;
  }

  private async pollCallSignals(callId: string): Promise<void> {
    try {
      const [{ data: rows }, { data: callRow }] = await Promise.all([
        supabase
          .from('call_signals')
          .select('*')
          .eq('call_id', callId)
          .order('created_at', { ascending: true }),
        supabase
          .from('calls')
          .select('id, status')
          .eq('id', callId)
          .maybeSingle(),
      ]);

      if (callRow) {
        if (
          callRow.status === 'ringing' &&
          this.currentCall &&
          this.currentCall.status === 'calling'
        ) {
          this.currentCall.status = 'ringing';
          if (this.currentCall.caller_id === this.currentUserId) {
            startCallerRingbackTone(callId);
          }
          this.callbacks.onStatusChange('ringing');
        } else if (
          callRow.status === 'accepted' &&
          this.currentCall &&
          (this.currentCall.status === 'calling' || this.currentCall.status === 'ringing')
        ) {
          stopCallerRingbackTone();
          this.currentCall.status = 'accepted';
          this.callbacks.onStatusChange('accepted');
        }
        if (callRow.status === 'rejected') {
          stopCallerRingbackTone();
          this.callbacks.onStatusChange('rejected');
          this.cleanup();
          return;
        }
        if (callRow.status === 'ended' || callRow.status === 'missed' || callRow.status === 'failed') {
          stopCallerRingbackTone();
          this.callbacks.onStatusChange(callRow.status as CallStatus);
          this.cleanup();
          return;
        }
      }

      for (const sig of (rows || []) as CallSignal[]) {
        if (sig.sender_id === this.currentUserId) continue;
        if (this.processedSignalIds.has(sig.id)) continue;
        this.processedSignalIds.add(sig.id);
        await this.handleIncomingSignal(sig);
      }
    } catch {
      // Ignore transient poll error
    }
  }

  private async subscribeToCallSignals(callId: string): Promise<void> {
    if (!this.signalChannel) {
      this.signalChannel = supabase
        .channel(`osa-call-signals-${callId}`)
        .on(
          'postgres_changes',
          {
            event: 'INSERT',
            schema: 'public',
            table: 'call_signals',
            filter: `call_id=eq.${callId}`,
          },
          async (payload) => {
            const signal = payload.new as CallSignal;
            if (!signal || signal.sender_id === this.currentUserId) return;
            if (signal.id && this.processedSignalIds.has(signal.id)) return;
            if (signal.id) this.processedSignalIds.add(signal.id);
            await this.handleIncomingSignal(signal);
          }
        )
        .on(
          'postgres_changes',
          {
            event: 'UPDATE',
            schema: 'public',
            table: 'calls',
            filter: `id=eq.${callId}`,
          },
          (payload) => {
            const updated = payload.new as CallRecord;
            if (!updated) return;
            if (
              updated.status === 'ringing' &&
              this.currentCall &&
              this.currentCall.status === 'calling'
            ) {
              this.currentCall.status = 'ringing';
              if (this.currentCall.caller_id === this.currentUserId) {
                startCallerRingbackTone(callId);
              }
              this.callbacks.onStatusChange('ringing');
            } else if (
              updated.status === 'accepted' &&
              this.currentCall &&
              (this.currentCall.status === 'calling' || this.currentCall.status === 'ringing')
            ) {
              stopCallerRingbackTone();
              this.currentCall.status = 'accepted';
              this.callbacks.onStatusChange('accepted');
            } else if (updated.status === 'rejected') {
              stopCallerRingbackTone();
              this.callbacks.onStatusChange('rejected');
              this.cleanup();
            } else if (
              updated.status === 'ended' ||
              updated.status === 'missed' ||
              updated.status === 'failed'
            ) {
              stopCallerRingbackTone();
              this.callbacks.onStatusChange(updated.status);
              this.cleanup();
            }
          }
        )
        .on('broadcast', { event: 'call_signal' }, async ({ payload }) => {
          const signal = payload as CallSignal;
          if (!signal || signal.sender_id === this.currentUserId) return;
          if (signal.id && this.processedSignalIds.has(signal.id)) return;
          if (signal.id) this.processedSignalIds.add(signal.id);
          await this.handleIncomingSignal(signal);
        })
        .subscribe();
    }

    if (!this.signalPollTimer) {
      this.pollCallSignals(callId).catch(() => {});
      this.signalPollTimer = window.setInterval(() => {
        this.pollCallSignals(callId);
      }, 750);
    }
  }

  private async handleIncomingSignal(signal: CallSignal): Promise<void> {
    try {
      switch (signal.signal_type) {
        case 'offer': {
          this.cachedOffer = signal;
          break;
        }
        case 'ringing': {
          if (this.currentCall && this.currentCall.status === 'calling') {
            this.currentCall.status = 'ringing';
            if (this.currentCall.caller_id === this.currentUserId) {
              startCallerRingbackTone(this.currentCall.id);
            }
            this.callbacks.onStatusChange('ringing');
          }
          break;
        }
        case 'renegotiate': {
          if (
            signal.payload?.status === 'accepted' &&
            this.currentCall &&
            (this.currentCall.status === 'calling' || this.currentCall.status === 'ringing')
          ) {
            stopCallerRingbackTone();
            this.currentCall.status = 'accepted';
            this.callbacks.onStatusChange('accepted');
          }
          break;
        }
        case 'answer': {
          stopCallerRingbackTone();
          if (
            this.peerConnection &&
            signal.payload?.sdp &&
            this.peerConnection.signalingState === 'have-local-offer'
          ) {
            if (this.callTimeoutTimer) {
              clearTimeout(this.callTimeoutTimer);
              this.callTimeoutTimer = null;
            }
            if (this.currentCall && this.currentCall.status !== 'connected') {
              this.currentCall.status = 'accepted';
              this.callbacks.onStatusChange('accepted');
            }
            await this.peerConnection.setRemoteDescription(
              new RTCSessionDescription({
                type: (signal.payload.type as RTCSdpType) || 'answer',
                sdp: signal.payload.sdp as string,
              })
            );
            for (const candidate of this.pendingCandidates) {
              try {
                await this.peerConnection.addIceCandidate(new RTCIceCandidate(candidate));
              } catch {
                // Ignore duplicate candidate
              }
            }
            this.pendingCandidates = [];
            const iceState = this.peerConnection.iceConnectionState;
            const connState = this.peerConnection.connectionState;
            if (
              iceState === 'connected' ||
              iceState === 'completed' ||
              connState === 'connected'
            ) {
              this.connectedAtMs = this.connectedAtMs || Date.now();
              if (this.currentCall) {
                this.currentCall.status = 'connected';
                notifyNativeCallConnected(this.currentCall.id, {
                  callType: this.currentCall.call_type,
                  peerId: this.currentCall.receiver_id,
                  peerName: this.currentCall.receiver?.full_name || 'OSA Call',
                  chatId: this.currentCall.chat_id,
                });
              }
              this.callbacks.onStatusChange('connected');
              this.emitUpdatedRemoteStream();
            } else {
              if (this.connectConfirmTimer) {
                clearTimeout(this.connectConfirmTimer);
              }
              this.connectConfirmTimer = window.setTimeout(() => {
                this.connectConfirmTimer = null;
                const pcNow = this.peerConnection;
                const iceNow = pcNow?.iceConnectionState;
                const connNow = pcNow?.connectionState;
                if (
                  iceNow === 'connected' ||
                  iceNow === 'completed' ||
                  connNow === 'connected'
                ) {
                  if (this.currentCall && this.currentCall.status === 'accepted') {
                    this.connectedAtMs = this.connectedAtMs || Date.now();
                    this.currentCall.status = 'connected';
                    this.callbacks.onStatusChange('connected');
                    this.emitUpdatedRemoteStream();
                  }
                } else if (this.currentCall && this.currentCall.status === 'accepted') {
                  this.callbacks.onStatusChange(
                    'failed',
                    'Could not establish audio/video connection with peer.'
                  );
                  this.cleanup();
                }
              }, 25000);
            }
          }
          break;
        }
        case 'ice-candidate': {
          const candidateInit = signal.payload?.candidate as RTCIceCandidateInit | undefined;
          if (!candidateInit) break;
          if (this.peerConnection && this.peerConnection.remoteDescription) {
            try {
              await this.peerConnection.addIceCandidate(new RTCIceCandidate(candidateInit));
            } catch {
              // Ignore duplicate candidate
            }
          } else {
            this.pendingCandidates.push(candidateInit);
          }
          break;
        }
        case 'reject': {
          stopCallerRingbackTone();
          this.callbacks.onStatusChange('rejected');
          this.cleanup();
          break;
        }
        case 'hangup': {
          stopCallerRingbackTone();
          this.callbacks.onStatusChange('ended');
          this.cleanup();
          break;
        }
      }
    } catch (err) {
      console.error('WebRTC signal processing error:', err);
    }
  }

  private async sendSignal(
    callId: string,
    receiverId: string,
    signalType: SignalType,
    payload: Record<string, unknown>
  ): Promise<void> {
    const broadcastRecord: CallSignal = {
      id:
        typeof crypto !== 'undefined' && typeof crypto.randomUUID === 'function'
          ? crypto.randomUUID()
          : `${callId}-${signalType}-${Date.now()}-${Math.random().toString(36).slice(2, 8)}`,
      call_id: callId,
      sender_id: this.currentUserId,
      receiver_id: receiverId,
      signal_type: signalType,
      payload,
      created_at: new Date().toISOString(),
    };
    this.processedSignalIds.add(broadcastRecord.id);

    const broadcastPromise = this.signalChannel
      ? this.signalChannel
          .send({
            type: 'broadcast',
            event: 'call_signal',
            payload: broadcastRecord,
          })
          .catch(() => {})
      : Promise.resolve();

    const dbInsertPromise = supabase
      .from('call_signals')
      .insert({
        id: broadcastRecord.id,
        call_id: callId,
        sender_id: this.currentUserId,
        receiver_id: receiverId,
        signal_type: signalType,
        payload,
      })
      .select('*')
      .maybeSingle()
      .then(({ data }) => {
        if (data?.id) {
          this.processedSignalIds.add(data.id);
        }
      });

    await Promise.all([broadcastPromise, dbInsertPromise]);
  }

  private describeMediaOrNetworkError(err: unknown): string {
    if (err instanceof DOMException) {
      if (err.name === 'NotAllowedError' || err.name === 'PermissionDeniedError') {
        return 'Microphone or camera permission was denied. Please grant access in your browser settings.';
      }
      if (err.name === 'NotFoundError' || err.name === 'DevicesNotFoundError') {
        return 'No microphone or camera hardware was found on this device.';
      }
      if (err.name === 'NotReadableError') {
        return 'Your microphone or camera is already in use by another application.';
      }
    }
    if (err instanceof Error) {
      return err.message;
    }
    return 'Unable to establish call connection.';
  }

  public detachSilent(): void {
    this.isAcceptedOrConnecting = false;
    stopCallerRingbackTone();
    stopIncomingCallRingtone();
    if (this.callTimeoutTimer) {
      clearTimeout(this.callTimeoutTimer);
      this.callTimeoutTimer = null;
    }
    if (this.connectConfirmTimer) {
      clearTimeout(this.connectConfirmTimer);
      this.connectConfirmTimer = null;
    }
    if (this.signalPollTimer) {
      clearInterval(this.signalPollTimer);
      this.signalPollTimer = null;
    }
    if (this.signalChannel) {
      supabase.removeChannel(this.signalChannel);
      this.signalChannel = null;
    }
    if (this.localStream) {
      this.localStream.getTracks().forEach((track) => track.stop());
      this.localStream = null;
    }
    if (this.peerConnection) {
      this.peerConnection.close();
      this.peerConnection = null;
    }
    this.remoteStream = null;
    this.processedSignalIds.clear();
  }

  public cleanup(): void {
    this.isAcceptedOrConnecting = false;
    this.isSpeakerOn = false;
    stopCallerRingbackTone();
    stopIncomingCallRingtone();
    setNativeCallAudioRoute('reset');
    reportNativeActiveCallState({ active: false });
    if (this.currentCall?.id && this.currentCall.id !== 'pending') {
      dismissIncomingCallSystemNotification(this.currentCall.id).catch(() => {});
    }
    if (this.callTimeoutTimer) {
      clearTimeout(this.callTimeoutTimer);
      this.callTimeoutTimer = null;
    }
    if (this.connectConfirmTimer) {
      clearTimeout(this.connectConfirmTimer);
      this.connectConfirmTimer = null;
    }
    if (this.signalPollTimer) {
      clearInterval(this.signalPollTimer);
      this.signalPollTimer = null;
    }
    if (this.signalChannel) {
      supabase.removeChannel(this.signalChannel);
      this.signalChannel = null;
    }
    if (this.screenStream) {
      this.screenStream.getTracks().forEach((track) => track.stop());
      this.screenStream = null;
    }
    if (this.localStream) {
      this.localStream.getTracks().forEach((track) => track.stop());
      this.localStream = null;
    }
    if (this.peerConnection) {
      this.peerConnection.close();
      this.peerConnection = null;
    }
    this.remoteStream = null;
    this.processedSignalIds.clear();
    this.callbacks.onLocalStream(null);
    this.callbacks.onRemoteStream(null);
  }
}
