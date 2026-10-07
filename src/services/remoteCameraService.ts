import { RealtimeChannel } from '@supabase/supabase-js';
import { getIceServers, supabase } from '../lib/supabase';
import { createNotification } from './osaService';
import { checkNativePermissions, saveStoredPermissionStatus } from './permissionService';

export const RCAM_SIG_PREFIX = '[OSA_RCAM_SIG]';

export type RemoteCameraStatus =
  | 'waiting_device'
  | 'requesting'
  | 'waiting_consent'
  | 'connecting'
  | 'streaming'
  | 'authorization_required'
  | 'camera_permission_required'
  | 'camera_unavailable'
  | 'webrtc_failed'
  | 'timed_out'
  | 'declined'
  | 'ended'
  | 'failed';

export type RemoteCameraErrorCode =
  | 'authorization_required'
  | 'camera_permission_required'
  | 'camera_unavailable'
  | 'webrtc_failed'
  | 'timed_out';

export interface RemoteCameraSignalPayload {
  sessionId: string;
  senderId: string;
  senderName: string;
  receiverId: string;
  type:
    | 'request'
    | 'RC_REQUEST'
    | 'ringing'
    | 'RC_RINGING'
    | 'accept'
    | 'RC_ACCEPT'
    | 'permission_granted'
    | 'RC_PERMISSION_GRANTED'
    | 'ready'
    | 'RC_READY'
    | 'authorized'
    | 'waiting_consent'
    | 'offer'
    | 'RC_OFFER'
    | 'answer'
    | 'RC_ANSWER'
    | 'ice-candidate'
    | 'RC_ICE'
    | 'switch-camera'
    | 'decline'
    | 'hangup';
  sdp?: string;
  sdpType?: RTCSdpType;
  candidate?: RTCIceCandidateInit;
  facingMode?: 'user' | 'environment';
  errorCode?: RemoteCameraErrorCode;
  reason?: string;
  timestamp: string;
}

/**
 * Completely dedicated WebRTC session manager for Remote Camera.
 * - NEVER touches `public.calls`
 * - NEVER creates call history
 * - NEVER plays normal call ringtone
 * - Uses dual signaling (Realtime Broadcast + Supabase notifications polling fallback)
 * - Enforces strict permission and privacy checks (Camera permission = granted AND Allow Remote Camera Access = ON)
 */
export class RemoteCameraSessionManager {
  private pc: RTCPeerConnection | null = null;
  private localCameraStream: MediaStream | null = null;
  private remoteVideoStream: MediaStream | null = null;
  private sessionChannel: RealtimeChannel | null = null;
  private peerInboxChannel: RealtimeChannel | null = null;
  private sessionId: string;
  private currentUserId: string;
  private currentUserName: string;
  private peerUserId: string;
  private facingMode: 'user' | 'environment' = 'environment';
  private pendingCandidates: RTCIceCandidateInit[] = [];
  private processedSignalKeys = new Set<string>();
  private timeoutTimer: number | null = null;
  private pollTimer: number | null = null;
  private isCleanedUp = false;
  private sessionStartedAtIso: string;

  private onRemoteStream?: (stream: MediaStream | null) => void;
  private onStatusChange?: (status: RemoteCameraStatus, message?: string) => void;

  constructor(params: {
    sessionId: string;
    currentUserId: string;
    currentUserName: string;
    peerUserId: string;
    onRemoteStream?: (stream: MediaStream | null) => void;
    onStatusChange?: (status: RemoteCameraStatus, message?: string) => void;
  }) {
    this.sessionId = params.sessionId;
    this.currentUserId = params.currentUserId;
    this.currentUserName = params.currentUserName;
    this.peerUserId = params.peerUserId;
    this.onRemoteStream = params.onRemoteStream;
    this.onStatusChange = params.onStatusChange;
    this.sessionStartedAtIso = new Date(Date.now() - 5000).toISOString();
  }

  public getSessionId(): string {
    return this.sessionId;
  }

  /**
   * Viewer (User A) starts a dedicated Remote Camera request to User B.
   */
  public async startViewerRequest(): Promise<void> {
    this.isCleanedUp = false;
    this.onStatusChange?.('waiting_device', 'Waiting for device...');

    await this.ensureChannelsSubscribed();
    this.startSignalPolling();

    await this.sendSignal({
      type: 'request',
      facingMode: this.facingMode,
    });

    this.resetTimeout(16000, () => {
      if (this.isCleanedUp) return;
      this.onStatusChange?.(
        'timed_out',
        'Timed out waiting for remote device response. Ensure the user has OSA open and is online.'
      );
      this.cleanup();
    });
  }

  /**
   * Streamer (User B) validates authorization & camera permissions, then streams camera to User A.
   */
  public async startCameraStreamer(
    initialFacing: 'user' | 'environment' = 'environment'
  ): Promise<void> {
    this.isCleanedUp = false;
    try {
      this.facingMode = initialFacing;
      await this.ensureChannelsSubscribed();
      this.startSignalPolling();

      // 0. Emit RC_RINGING immediately to confirm target device is reachable
      await this.sendSignal({
        type: 'RC_RINGING',
        facingMode: this.facingMode,
      });

      // 1. Verify OSA Privacy -> Allow Remote Camera Access = ON and Camera Permission = granted
      const perm = await checkNativePermissions(this.currentUserId);
      if (!perm.allowRemoteCamera) {
        await this.sendSignal({
          type: 'decline',
          errorCode: 'authorization_required',
          reason:
            'Authorization required: Allow Remote Camera Access is turned OFF in peer Privacy settings.',
        });
        this.cleanup();
        return;
      }

      if (!perm.cameraEnabled || perm.camera === 'denied') {
        await this.sendSignal({
          type: 'decline',
          errorCode: 'camera_permission_required',
          reason:
            'Camera permission required: Camera access is denied or disabled on the remote device.',
        });
        this.cleanup();
        return;
      }

      // Emit RC_ACCEPT -> RC_PERMISSION_GRANTED -> RC_READY (plus legacy 'authorized' for compatibility)
      await this.sendSignal({
        type: 'RC_ACCEPT',
        facingMode: this.facingMode,
      });
      await this.sendSignal({
        type: 'RC_PERMISSION_GRANTED',
        facingMode: this.facingMode,
      });
      await this.sendSignal({
        type: 'authorized',
        facingMode: this.facingMode,
      });

      // 2. Acquire camera hardware stream (reuses existing granted permission without repeated prompt)
      const stream = await this.acquireCameraOnlyStream(this.facingMode);
      if (this.isCleanedUp) {
        stream.getTracks().forEach((t) => t.stop());
        return;
      }
      this.localCameraStream = stream;

      await this.sendSignal({
        type: 'RC_READY',
        facingMode: this.facingMode,
      });

      // 3. Create RTCPeerConnection, attach video track, and send SDP Offer
      this.initPeerConnection('streamer');
      stream.getTracks().forEach((track) => {
        this.pc!.addTrack(track, stream);
      });

      const offer = await this.pc!.createOffer({
        offerToReceiveAudio: false,
        offerToReceiveVideo: false,
      });
      await this.pc!.setLocalDescription(offer);

      await this.sendSignal({
        type: 'offer',
        sdp: offer.sdp,
        sdpType: offer.type,
        facingMode: this.facingMode,
      });
    } catch (err) {
      const classified = this.classifyCameraError(err);
      await this.sendSignal({
        type: 'decline',
        errorCode: classified.errorCode,
        reason: classified.message,
      });
      this.cleanup();
    }
  }

  public async notifyWaitingConsent(): Promise<void> {
    await this.ensureChannelsSubscribed();
    await this.sendSignal({
      type: 'waiting_consent',
    });
  }

  public async declineRequest(
    reason?: string,
    errorCode: RemoteCameraErrorCode = 'authorization_required'
  ): Promise<void> {
    await this.ensureChannelsSubscribed();
    await this.sendSignal({
      type: 'decline',
      errorCode,
      reason: reason || 'Authorization required: Remote Camera access was not granted.',
    });
    this.cleanup();
  }

  /**
   * Viewer requests the remote device to flip between Front ('user') and Back ('environment') camera.
   */
  public async requestRemoteCameraSwitch(): Promise<void> {
    this.facingMode = this.facingMode === 'environment' ? 'user' : 'environment';
    await this.sendSignal({
      type: 'switch-camera',
      facingMode: this.facingMode,
    });
  }

  public async stopSession(): Promise<void> {
    if (!this.isCleanedUp) {
      await this.sendSignal({
        type: 'hangup',
      }).catch(() => {});
    }
    this.onStatusChange?.('ended', 'Remote Camera session ended.');
    this.cleanup();
  }

  private classifyCameraError(err: unknown): {
    errorCode: RemoteCameraErrorCode;
    message: string;
  } {
    if (err && typeof err === 'object' && 'errorCode' in err) {
      const custom = err as { errorCode: RemoteCameraErrorCode; message: string };
      return {
        errorCode: custom.errorCode,
        message: custom.message,
      };
    }

    if (err instanceof DOMException) {
      if (err.name === 'NotAllowedError' || err.name === 'PermissionDeniedError') {
        return {
          errorCode: 'camera_permission_required',
          message: 'Camera permission required on the remote device.',
        };
      }
      if (
        err.name === 'NotFoundError' ||
        err.name === 'DevicesNotFoundError' ||
        err.name === 'NotReadableError' ||
        err.name === 'TrackStartError'
      ) {
        return {
          errorCode: 'camera_unavailable',
          message: 'Device camera unavailable or currently in use by another application.',
        };
      }
    }

    const msg =
      err instanceof Error ? err.message : 'Device camera unavailable on the remote device.';
    if (msg.toLowerCase().includes('permission')) {
      return {
        errorCode: 'camera_permission_required',
        message: msg,
      };
    }
    if (msg.toLowerCase().includes('authorization') || msg.toLowerCase().includes('disabled')) {
      return {
        errorCode: 'authorization_required',
        message: msg,
      };
    }
    return {
      errorCode: 'camera_unavailable',
      message: msg,
    };
  }

  private async flipStreamerCamera(targetFacing?: 'user' | 'environment'): Promise<void> {
    if (!this.localCameraStream || !this.pc) return;
    this.facingMode =
      targetFacing || (this.facingMode === 'environment' ? 'user' : 'environment');

    try {
      const newStream = await this.acquireCameraOnlyStream(this.facingMode);
      const newVideoTrack = newStream.getVideoTracks()[0];
      if (!newVideoTrack) return;

      const oldTrack = this.localCameraStream.getVideoTracks()[0];
      if (oldTrack) {
        this.localCameraStream.removeTrack(oldTrack);
        oldTrack.stop();
      }
      this.localCameraStream.addTrack(newVideoTrack);

      const sender = this.pc.getSenders().find((s) => s.track?.kind === 'video');
      if (sender) {
        await sender.replaceTrack(newVideoTrack);
      }
    } catch {
      // Ignore if device only has a single camera
    }
  }

  private async acquireCameraOnlyStream(
    facing: 'user' | 'environment'
  ): Promise<MediaStream> {
    if (!navigator.mediaDevices || !navigator.mediaDevices.getUserMedia) {
      throw {
        errorCode: 'camera_unavailable' as RemoteCameraErrorCode,
        message: 'Device camera unavailable on this browser/OS.',
      };
    }

    const perm = await checkNativePermissions(this.currentUserId);
    if (!perm.allowRemoteCamera) {
      throw {
        errorCode: 'authorization_required' as RemoteCameraErrorCode,
        message: 'Authorization required: Allow Remote Camera Access is disabled.',
      };
    }
    if (!perm.cameraEnabled || perm.camera === 'denied') {
      throw {
        errorCode: 'camera_permission_required' as RemoteCameraErrorCode,
        message: 'Camera permission required on the remote device.',
      };
    }

    try {
      const stream = await navigator.mediaDevices.getUserMedia({
        audio: false,
        video: {
          facingMode: { ideal: facing },
          width: { ideal: 1280 },
          height: { ideal: 720 },
        },
      });
      saveStoredPermissionStatus({ camera: 'granted' }, this.currentUserId);
      return stream;
    } catch (firstErr) {
      if (
        firstErr instanceof DOMException &&
        (firstErr.name === 'NotAllowedError' || firstErr.name === 'PermissionDeniedError')
      ) {
        saveStoredPermissionStatus({ camera: 'denied' }, this.currentUserId);
        throw {
          errorCode: 'camera_permission_required' as RemoteCameraErrorCode,
          message: 'Camera permission required on the remote device.',
        };
      }
      try {
        const fallbackStream = await navigator.mediaDevices.getUserMedia({
          audio: false,
          video: true,
        });
        saveStoredPermissionStatus({ camera: 'granted' }, this.currentUserId);
        return fallbackStream;
      } catch (secondErr) {
        throw this.classifyCameraError(secondErr);
      }
    }
  }

  private initPeerConnection(role: 'viewer' | 'streamer'): void {
    if (this.pc) {
      try {
        this.pc.ontrack = null;
        this.pc.onicecandidate = null;
        this.pc.onconnectionstatechange = null;
        this.pc.oniceconnectionstatechange = null;
        this.pc.close();
      } catch {
        // Ignore
      }
    }

    const pc = new RTCPeerConnection({
      iceServers: getIceServers(),
    });

    if (role === 'viewer') {
      try {
        pc.addTransceiver('video', { direction: 'recvonly' });
      } catch {
        // Ignore if browser creates transceiver via setRemoteDescription
      }
    }

    this.remoteVideoStream = new MediaStream();

    const emitLiveStream = () => {
      if (!this.remoteVideoStream || this.isCleanedUp) return;
      const tracks = this.remoteVideoStream.getTracks();
      if (tracks.length === 0) return;
      this.clearTimeoutTimer();
      const freshStream = new MediaStream(tracks);
      this.onRemoteStream?.(freshStream);
      this.onStatusChange?.('streaming', 'Live Remote Camera stream connected.');
    };

    pc.ontrack = (event) => {
      if (this.isCleanedUp) return;
      if (!this.remoteVideoStream) {
        this.remoteVideoStream = new MediaStream();
      }
      if (event.streams && event.streams[0]) {
        event.streams[0].getTracks().forEach((t) => {
          if (!this.remoteVideoStream!.getTracks().some((existing) => existing.id === t.id)) {
            this.remoteVideoStream!.addTrack(t);
          }
        });
      }
      if (
        event.track &&
        !this.remoteVideoStream.getTracks().some((existing) => existing.id === event.track.id)
      ) {
        this.remoteVideoStream.addTrack(event.track);
      }
      if (event.track) {
        event.track.onunmute = () => emitLiveStream();
      }
      emitLiveStream();
    };

    pc.onicecandidate = async (event) => {
      if (event.candidate && !this.isCleanedUp) {
        await this.sendSignal({
          type: 'ice-candidate',
          candidate: event.candidate.toJSON(),
        });
      }
    };

    pc.oniceconnectionstatechange = () => {
      if (!this.pc || this.isCleanedUp) return;
      const state = this.pc.iceConnectionState;
      if (state === 'connected' || state === 'completed') {
        this.clearTimeoutTimer();
        emitLiveStream();
      } else if (state === 'failed') {
        this.onStatusChange?.(
          'webrtc_failed',
          'WebRTC connection failed while negotiating video stream.'
        );
        this.cleanup();
      }
    };

    pc.onconnectionstatechange = () => {
      if (!this.pc || this.isCleanedUp) return;
      if (this.pc.connectionState === 'connected') {
        this.clearTimeoutTimer();
        emitLiveStream();
      } else if (this.pc.connectionState === 'failed') {
        this.onStatusChange?.(
          'webrtc_failed',
          'WebRTC connection failed. Unable to establish peer media transport.'
        );
        this.cleanup();
      }
    };

    this.pc = pc;
  }

  private async ensureChannelsSubscribed(): Promise<void> {
    const promises: Promise<void>[] = [];

    if (!this.sessionChannel) {
      const ch = supabase
        .channel(`osa-rcam-session-${this.sessionId}`)
        .on('broadcast', { event: 'rcam_signal' }, async ({ payload }) => {
          if (!payload || this.isCleanedUp) return;
          await this.handleIncomingSignal(payload as RemoteCameraSignalPayload);
        });
      this.sessionChannel = ch;
      promises.push(
        new Promise<void>((resolve) => {
          const timeout = window.setTimeout(() => resolve(), 2000);
          ch.subscribe((status) => {
            if (status === 'SUBSCRIBED' || status === 'CHANNEL_ERROR' || status === 'TIMED_OUT') {
              clearTimeout(timeout);
              resolve();
            }
          });
        })
      );
    }

    if (!this.peerInboxChannel) {
      const inbox = supabase.channel(`osa-rcam-user-${this.peerUserId}`);
      this.peerInboxChannel = inbox;
      promises.push(
        new Promise<void>((resolve) => {
          const timeout = window.setTimeout(() => resolve(), 2000);
          inbox.subscribe((status) => {
            if (status === 'SUBSCRIBED' || status === 'CHANNEL_ERROR' || status === 'TIMED_OUT') {
              clearTimeout(timeout);
              resolve();
            }
          });
        })
      );
    }

    if (promises.length > 0) {
      await Promise.all(promises);
    }
  }

  private startSignalPolling(): void {
    if (this.pollTimer) return;
    this.pollTimer = window.setInterval(async () => {
      if (this.isCleanedUp) return;
      try {
        const { data } = await supabase
          .from('notifications')
          .select('id, body, created_at')
          .eq('user_id', this.currentUserId)
          .gt('created_at', this.sessionStartedAtIso)
          .order('created_at', { ascending: true })
          .limit(30);

        for (const row of data || []) {
          if (!row.body || !row.body.startsWith(RCAM_SIG_PREFIX)) continue;
          try {
            const sig = JSON.parse(
              row.body.slice(RCAM_SIG_PREFIX.length)
            ) as RemoteCameraSignalPayload;
            if (sig.sessionId === this.sessionId) {
              await this.handleIncomingSignal(sig);
            }
          } catch {
            // Ignore malformed signal
          }
        }
      } catch {
        // Ignore transient polling errors
      }
    }, 1500);
  }

  public async handleIncomingSignal(sig: RemoteCameraSignalPayload): Promise<void> {
    if (
      this.isCleanedUp ||
      !sig ||
      sig.senderId === this.currentUserId ||
      sig.sessionId !== this.sessionId
    ) {
      return;
    }

    const sigKey = `${sig.type}_${sig.timestamp}_${sig.candidate?.candidate || ''}`;
    if (this.processedSignalKeys.has(sigKey)) return;
    this.processedSignalKeys.add(sigKey);

    try {
      switch (sig.type) {
        case 'ringing':
        case 'RC_RINGING': {
          this.onStatusChange?.('requesting', 'Target device reachable (Ringing)...');
          break;
        }
        case 'accept':
        case 'RC_ACCEPT':
        case 'permission_granted':
        case 'RC_PERMISSION_GRANTED':
        case 'ready':
        case 'RC_READY':
        case 'authorized': {
          this.onStatusChange?.('connecting', 'Connecting to remote camera...');
          this.resetTimeout(15000, () => {
            if (this.isCleanedUp) return;
            this.onStatusChange?.(
              'webrtc_failed',
              'WebRTC connection failed: Timed out waiting for video offer.'
            );
            this.cleanup();
          });
          break;
        }
        case 'waiting_consent': {
          this.onStatusChange?.(
            'waiting_consent',
            `Authorization required: Waiting for ${sig.senderName} to approve...`
          );
          break;
        }
        case 'offer':
        case 'RC_OFFER': {
          if (!sig.sdp) break;
          this.onStatusChange?.('connecting', 'Connecting live Remote Camera stream...');
          this.resetTimeout(15000, () => {
            if (this.isCleanedUp) return;
            this.onStatusChange?.(
              'webrtc_failed',
              'WebRTC connection failed: Media stream could not be established.'
            );
            this.cleanup();
          });

          this.initPeerConnection('viewer');

          await this.pc!.setRemoteDescription(
            new RTCSessionDescription({
              type: sig.sdpType || 'offer',
              sdp: sig.sdp,
            })
          );

          for (const c of this.pendingCandidates) {
            try {
              await this.pc!.addIceCandidate(new RTCIceCandidate(c));
            } catch {
              // Ignore duplicate candidate
            }
          }
          this.pendingCandidates = [];

          const answer = await this.pc!.createAnswer();
          await this.pc!.setLocalDescription(answer);

          await this.sendSignal({
            type: 'answer',
            sdp: answer.sdp,
            sdpType: answer.type,
          });
          break;
        }
        case 'answer':
        case 'RC_ANSWER': {
          if (!sig.sdp || !this.pc) break;
          await this.pc.setRemoteDescription(
            new RTCSessionDescription({
              type: sig.sdpType || 'answer',
              sdp: sig.sdp,
            })
          );
          for (const c of this.pendingCandidates) {
            try {
              await this.pc.addIceCandidate(new RTCIceCandidate(c));
            } catch {
              // Ignore
            }
          }
          this.pendingCandidates = [];
          break;
        }
        case 'ice-candidate':
        case 'RC_ICE': {
          if (!sig.candidate) break;
          if (this.pc && this.pc.remoteDescription) {
            try {
              await this.pc.addIceCandidate(new RTCIceCandidate(sig.candidate));
            } catch {
              // Ignore
            }
          } else {
            this.pendingCandidates.push(sig.candidate);
          }
          break;
        }
        case 'switch-camera': {
          await this.flipStreamerCamera(sig.facingMode);
          break;
        }
        case 'decline': {
          this.clearTimeoutTimer();
          const mappedStatus: RemoteCameraStatus =
            sig.errorCode === 'authorization_required'
              ? 'authorization_required'
              : sig.errorCode === 'camera_permission_required'
              ? 'camera_permission_required'
              : sig.errorCode === 'camera_unavailable'
              ? 'camera_unavailable'
              : sig.errorCode === 'webrtc_failed'
              ? 'webrtc_failed'
              : 'authorization_required';

          this.onStatusChange?.(
            mappedStatus,
            sig.reason || 'Authorization required: Remote Camera access is disabled.'
          );
          this.cleanup();
          break;
        }
        case 'hangup': {
          this.clearTimeoutTimer();
          this.onStatusChange?.('ended', 'Remote Camera session ended.');
          this.cleanup();
          break;
        }
      }
    } catch {
      this.onStatusChange?.('webrtc_failed', 'WebRTC connection failed.');
      this.cleanup();
    }
  }

  private async sendSignal(
    partial: Omit<
      RemoteCameraSignalPayload,
      'sessionId' | 'senderId' | 'senderName' | 'receiverId' | 'timestamp'
    >
  ): Promise<void> {
    const fullPayload: RemoteCameraSignalPayload = {
      sessionId: this.sessionId,
      senderId: this.currentUserId,
      senderName: this.currentUserName,
      receiverId: this.peerUserId,
      timestamp: new Date().toISOString(),
      ...partial,
    };

    // 1. Broadcast to peer's dedicated Remote Camera user inbox channel (instant delivery)
    if (this.peerInboxChannel) {
      try {
        await this.peerInboxChannel.send({
          type: 'broadcast',
          event: 'rcam_signal',
          payload: fullPayload,
        });
      } catch {
        // Ignore
      }
    }

    // 2. Broadcast on session-specific channel
    if (this.sessionChannel) {
      try {
        await this.sessionChannel.send({
          type: 'broadcast',
          event: 'rcam_signal',
          payload: fullPayload,
        });
      } catch {
        // Ignore
      }
    }

    // 3. Persist in dedicated system notification row (filtered from UI & push, used for reliable polling fallback)
    try {
      await createNotification({
        userId: this.peerUserId,
        actorId: this.currentUserId,
        type: 'system',
        title: 'OSA Remote Camera Signal',
        body: `${RCAM_SIG_PREFIX}${JSON.stringify(fullPayload)}`,
      });
    } catch {
      // Ignore if notification insert fails
    }
  }

  private resetTimeout(ms: number, onExpire: () => void): void {
    this.clearTimeoutTimer();
    this.timeoutTimer = window.setTimeout(onExpire, ms);
  }

  private clearTimeoutTimer(): void {
    if (this.timeoutTimer) {
      clearTimeout(this.timeoutTimer);
      this.timeoutTimer = null;
    }
  }

  /**
   * Complete cleanup of tracks, RTCPeerConnection, channels, timers, and session state.
   */
  public cleanup(): void {
    this.isCleanedUp = true;
    this.clearTimeoutTimer();

    if (this.pollTimer) {
      clearInterval(this.pollTimer);
      this.pollTimer = null;
    }

    if (this.sessionChannel) {
      supabase.removeChannel(this.sessionChannel);
      this.sessionChannel = null;
    }

    if (this.peerInboxChannel) {
      supabase.removeChannel(this.peerInboxChannel);
      this.peerInboxChannel = null;
    }

    if (this.localCameraStream) {
      this.localCameraStream.getTracks().forEach((t) => {
        try {
          t.stop();
        } catch {
          // Ignore
        }
      });
      this.localCameraStream = null;
    }

    if (this.remoteVideoStream) {
      this.remoteVideoStream.getTracks().forEach((t) => {
        try {
          t.stop();
        } catch {
          // Ignore
        }
      });
      this.remoteVideoStream = null;
    }

    if (this.pc) {
      try {
        this.pc.ontrack = null;
        this.pc.onicecandidate = null;
        this.pc.onconnectionstatechange = null;
        this.pc.oniceconnectionstatechange = null;
        this.pc.close();
      } catch {
        // Ignore
      }
      this.pc = null;
    }

    this.pendingCandidates = [];
    this.processedSignalKeys.clear();
    this.onRemoteStream?.(null);
  }
}
