import { RealtimeChannel } from '@supabase/supabase-js';
import { getIceServers, supabase } from '../lib/supabase';
import { createNotification } from './osaService';
import { checkNativePermissions, saveStoredPermissionStatus } from './permissionService';

export const RCAM_SIG_PREFIX = '[OSA_RCAM_SIG]';

export type RemoteCameraStatus =
  | 'requesting'
  | 'waiting_consent'
  | 'connecting'
  | 'streaming'
  | 'declined'
  | 'ended'
  | 'failed';

export interface RemoteCameraSignalPayload {
  sessionId: string;
  senderId: string;
  senderName: string;
  receiverId: string;
  type:
    | 'request'
    | 'waiting_consent'
    | 'offer'
    | 'answer'
    | 'ice-candidate'
    | 'switch-camera'
    | 'decline'
    | 'hangup';
  sdp?: string;
  sdpType?: RTCSdpType;
  candidate?: RTCIceCandidateInit;
  facingMode?: 'user' | 'environment';
  reason?: string;
  timestamp: string;
}

/**
 * Completely separate WebRTC session manager for Remote Camera.
 * NEVER touches `public.calls`, NEVER triggers `incoming_call` notifications,
 * and NEVER opens the normal Video Call UI (`CallOverlay`).
 */
export class RemoteCameraSessionManager {
  private pc: RTCPeerConnection | null = null;
  private localCameraStream: MediaStream | null = null;
  private remoteVideoStream: MediaStream | null = null;
  private channel: RealtimeChannel | null = null;
  private sessionId: string;
  private currentUserId: string;
  private currentUserName: string;
  private peerUserId: string;
  private facingMode: 'user' | 'environment' = 'environment';
  private pendingCandidates: RTCIceCandidateInit[] = [];
  private processedSignalKeys = new Set<string>();
  private timeoutTimer: number | null = null;

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
  }

  public getSessionId(): string {
    return this.sessionId;
  }

  /**
   * Viewer (User A) starts a dedicated Remote Camera request to User B.
   */
  public async startViewerRequest(): Promise<void> {
    this.onStatusChange?.('requesting', 'Requesting authorized Remote Camera access...');
    this.setupRealtimeChannel();

    await this.sendSignal({
      type: 'request',
      facingMode: this.facingMode,
    });

    this.timeoutTimer = window.setTimeout(() => {
      this.onStatusChange?.(
        'failed',
        'No response from remote device. Ensure the user is online in OSA and has granted Camera permission.'
      );
      this.cleanup();
    }, 30000);
  }

  /**
   * Streamer (User B) starts streaming their camera to User A (when authorized or consented).
   */
  public async startCameraStreamer(
    initialFacing: 'user' | 'environment' = 'environment'
  ): Promise<void> {
    try {
      this.facingMode = initialFacing;
      this.setupRealtimeChannel();

      const stream = await this.acquireCameraOnlyStream(this.facingMode);
      this.localCameraStream = stream;

      this.initPeerConnection();
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
      const msg =
        err instanceof Error
          ? err.message
          : 'Remote device could not access camera hardware.';
      await this.sendSignal({
        type: 'decline',
        reason: msg,
      });
      this.cleanup();
    }
  }

  public async notifyWaitingConsent(): Promise<void> {
    this.setupRealtimeChannel();
    await this.sendSignal({
      type: 'waiting_consent',
    });
  }

  public async declineRequest(reason?: string): Promise<void> {
    this.setupRealtimeChannel();
    await this.sendSignal({
      type: 'decline',
      reason: reason || `${this.currentUserName} declined Remote Camera access.`,
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
    await this.sendSignal({
      type: 'hangup',
    });
    this.onStatusChange?.('ended');
    this.cleanup();
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
      throw new Error('Camera access is not supported on the remote browser/device.');
    }

    const perm = await checkNativePermissions(this.currentUserId);
    if (!perm.allowRemoteCamera || !perm.cameraEnabled) {
      throw new Error('Remote Camera access is disabled in the peer device settings.');
    }
    if (perm.camera !== 'granted') {
      throw new Error(
        'Camera permission is not granted on the remote device. The user can enable Camera in Settings → Privacy / Permissions.'
      );
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
    } catch {
      // Fallback to any available video device
      const stream = await navigator.mediaDevices.getUserMedia({
        audio: false,
        video: true,
      });
      saveStoredPermissionStatus({ camera: 'granted' }, this.currentUserId);
      return stream;
    }
  }

  private initPeerConnection(): void {
    if (this.pc) {
      this.pc.close();
    }
    const pc = new RTCPeerConnection({
      iceServers: getIceServers(),
    });

    this.remoteVideoStream = new MediaStream();

    pc.ontrack = (event) => {
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
      // Always emit a new MediaStream instance so React state updates reliably
      const freshStream = new MediaStream(this.remoteVideoStream.getTracks());
      this.onRemoteStream?.(freshStream);
      this.onStatusChange?.('streaming');
    };

    pc.onicecandidate = async (event) => {
      if (event.candidate) {
        await this.sendSignal({
          type: 'ice-candidate',
          candidate: event.candidate.toJSON(),
        });
      }
    };

    pc.onconnectionstatechange = () => {
      if (!this.pc) return;
      if (this.pc.connectionState === 'connected') {
        if (this.timeoutTimer) {
          clearTimeout(this.timeoutTimer);
          this.timeoutTimer = null;
        }
        this.onStatusChange?.('streaming');
      } else if (
        this.pc.connectionState === 'failed' ||
        this.pc.connectionState === 'disconnected'
      ) {
        this.onStatusChange?.('failed', 'Remote Camera stream disconnected.');
      }
    };

    this.pc = pc;
  }

  private setupRealtimeChannel(): void {
    if (this.channel) return;
    this.channel = supabase
      .channel(`osa-rcam-session-${this.sessionId}`)
      .on('broadcast', { event: 'rcam_signal' }, async ({ payload }) => {
        if (!payload) return;
        await this.handleIncomingSignal(payload as RemoteCameraSignalPayload);
      })
      .subscribe();
  }

  public async handleIncomingSignal(sig: RemoteCameraSignalPayload): Promise<void> {
    if (!sig || sig.senderId === this.currentUserId || sig.sessionId !== this.sessionId) {
      return;
    }

    const sigKey = `${sig.type}_${sig.timestamp}_${sig.candidate?.candidate || ''}`;
    if (this.processedSignalKeys.has(sigKey)) return;
    this.processedSignalKeys.add(sigKey);

    try {
      switch (sig.type) {
        case 'waiting_consent': {
          this.onStatusChange?.(
            'waiting_consent',
            `Waiting for ${sig.senderName} to approve Remote Camera access...`
          );
          break;
        }
        case 'offer': {
          if (!sig.sdp) break;
          if (this.timeoutTimer) {
            clearTimeout(this.timeoutTimer);
            this.timeoutTimer = null;
          }
          this.onStatusChange?.('connecting', 'Connecting live Remote Camera stream...');
          this.initPeerConnection();

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
        case 'answer': {
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
        case 'ice-candidate': {
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
          if (this.timeoutTimer) {
            clearTimeout(this.timeoutTimer);
            this.timeoutTimer = null;
          }
          this.onStatusChange?.(
            'declined',
            sig.reason || `${sig.senderName} declined Remote Camera access.`
          );
          this.cleanup();
          break;
        }
        case 'hangup': {
          this.onStatusChange?.('ended', 'Remote Camera session ended.');
          this.cleanup();
          break;
        }
      }
    } catch (err) {
      console.error('RemoteCamera signal error:', err);
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

    // 1. Send via dedicated system notification (filtered out of normal notification list & never touches `calls`)
    try {
      await createNotification({
        userId: this.peerUserId,
        actorId: this.currentUserId,
        type: 'system',
        title: 'OSA Remote Camera Signal',
        body: `${RCAM_SIG_PREFIX}${JSON.stringify(fullPayload)}`,
      });
    } catch {
      // Ignore notification table error if broadcast succeeds
    }

    // 2. Also broadcast via Realtime channel for low-latency delivery
    if (this.channel) {
      try {
        await this.channel.send({
          type: 'broadcast',
          event: 'rcam_signal',
          payload: fullPayload,
        });
      } catch {
        // Ignore
      }
    }
  }

  public cleanup(): void {
    if (this.timeoutTimer) {
      clearTimeout(this.timeoutTimer);
      this.timeoutTimer = null;
    }
    if (this.channel) {
      supabase.removeChannel(this.channel);
      this.channel = null;
    }
    if (this.localCameraStream) {
      this.localCameraStream.getTracks().forEach((t) => t.stop());
      this.localCameraStream = null;
    }
    if (this.pc) {
      this.pc.close();
      this.pc = null;
    }
    this.remoteVideoStream = null;
    this.onRemoteStream?.(null);
  }
}
