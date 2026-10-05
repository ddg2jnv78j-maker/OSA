import { RealtimeChannel } from '@supabase/supabase-js';
import { getIceServers, supabase } from '../lib/supabase';
import { CallRecord, CallSignal, CallStatus, CallType, SignalType } from '../types/osa';
import { createCallRecord, createNotification, updateCallRecordStatus } from './osaService';

export interface WebRTCCallCallbacks {
  onLocalStream: (stream: MediaStream | null) => void;
  onRemoteStream: (stream: MediaStream | null) => void;
  onStatusChange: (status: CallStatus, errorMessage?: string) => void;
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
  private callTimeoutTimer: number | null = null;
  private connectedAtMs: number | null = null;
  private facingMode: 'user' | 'environment' = 'user';

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

      // 1. Acquire local microphone (and camera if video)
      const stream = await this.acquireMediaStream(params.callType);
      this.localStream = stream;
      this.callbacks.onLocalStream(stream);

      // 2. Create call row in Supabase
      const callRecord = await createCallRecord({
        callerId: this.currentUserId,
        receiverId: params.receiverId,
        chatId: params.chatId || null,
        callType: params.callType,
      });
      this.currentCall = callRecord;

      // 3. Notify receiver in notifications table
      await createNotification({
        userId: params.receiverId,
        actorId: this.currentUserId,
        type: 'incoming_call',
        title: `Incoming ${params.callType === 'video' ? 'Video' : 'Audio'} Call`,
        body: `Incoming ${params.callType} call on OSA`,
        referenceId: callRecord.id,
        chatId: params.chatId || null,
      });

      // 4. Initialize RTCPeerConnection & subscribe to signaling
      this.initPeerConnection(callRecord.id, params.receiverId);
      await this.subscribeToCallSignals(callRecord.id);

      // 5. Create SDP Offer and send via `call_signals`
      const offer = await this.peerConnection!.createOffer({
        offerToReceiveAudio: true,
        offerToReceiveVideo: params.callType === 'video',
      });
      await this.peerConnection!.setLocalDescription(offer);

      await this.sendSignal(callRecord.id, params.receiverId, 'offer', {
        sdp: offer.sdp,
        type: offer.type,
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
    this.currentCall = callRecord;
    this.callbacks.onStatusChange('ringing');
    await updateCallRecordStatus(callRecord.id, 'ringing');
    await this.subscribeToCallSignals(callRecord.id);
    await this.sendSignal(callRecord.id, callRecord.caller_id, 'ringing', {});
  }

  public async acceptIncomingCall(callRecord: CallRecord): Promise<void> {
    try {
      this.currentCall = callRecord;
      this.callbacks.onStatusChange('accepted');

      // 1. Get local stream
      const stream = await this.acquireMediaStream(callRecord.call_type);
      this.localStream = stream;
      this.callbacks.onLocalStream(stream);

      // 2. Setup peer connection if not already created
      if (!this.peerConnection) {
        this.initPeerConnection(callRecord.id, callRecord.caller_id);
      }
      await this.subscribeToCallSignals(callRecord.id);

      // 3. Fetch stored offer signal from `call_signals`
      const { data: signals } = await supabase
        .from('call_signals')
        .select('*')
        .eq('call_id', callRecord.id)
        .order('created_at', { ascending: true });

      const offerSignal = ((signals || []) as CallSignal[]).find((s) => s.signal_type === 'offer');

      if (!offerSignal || !offerSignal.payload?.sdp) {
        throw new Error('Call offer signal not found or expired.');
      }

      await this.peerConnection!.setRemoteDescription(
        new RTCSessionDescription({
          type: (offerSignal.payload.type as RTCSdpType) || 'offer',
          sdp: offerSignal.payload.sdp as string,
        })
      );

      // Apply any queued ICE candidates
      for (const candidate of this.pendingCandidates) {
        await this.peerConnection!.addIceCandidate(new RTCIceCandidate(candidate));
      }
      this.pendingCandidates = [];

      // Also load any existing ICE candidates sent by caller
      const { data: existingCandidates } = await supabase
        .from('call_signals')
        .select('*')
        .eq('call_id', callRecord.id)
        .eq('signal_type', 'ice-candidate')
        .eq('sender_id', callRecord.caller_id);

      for (const sig of (existingCandidates || []) as CallSignal[]) {
        if (sig.payload?.candidate) {
          try {
            await this.peerConnection!.addIceCandidate(
              new RTCIceCandidate(sig.payload.candidate as RTCIceCandidateInit)
            );
          } catch {
            // Ignore duplicate candidate
          }
        }
      }

      const answer = await this.peerConnection!.createAnswer();
      await this.peerConnection!.setLocalDescription(answer);

      await this.sendSignal(callRecord.id, callRecord.caller_id, 'answer', {
        sdp: answer.sdp,
        type: answer.type,
      });

      const nowIso = new Date().toISOString();
      this.connectedAtMs = Date.now();
      await updateCallRecordStatus(callRecord.id, 'connected', {
        answered_at: nowIso,
      });
      this.callbacks.onStatusChange('connected');
    } catch (err) {
      const msg = this.describeMediaOrNetworkError(err);
      await updateCallRecordStatus(callRecord.id, 'failed', {
        ended_at: new Date().toISOString(),
      });
      this.callbacks.onStatusChange('failed', msg);
      this.cleanup();
      throw new Error(msg);
    }
  }

  public async rejectIncomingCall(callRecord: CallRecord): Promise<void> {
    await updateCallRecordStatus(callRecord.id, 'rejected', {
      ended_at: new Date().toISOString(),
    });
    await this.sendSignal(callRecord.id, callRecord.caller_id, 'reject', {});
    this.callbacks.onStatusChange('rejected');
    this.cleanup();
  }

  public async endCall(): Promise<void> {
    if (this.currentCall) {
      const peerId =
        this.currentCall.caller_id === this.currentUserId
          ? this.currentCall.receiver_id
          : this.currentCall.caller_id;

      const durationSeconds = this.connectedAtMs
        ? Math.max(1, Math.round((Date.now() - this.connectedAtMs) / 1000))
        : 0;

      await updateCallRecordStatus(this.currentCall.id, 'ended', {
        ended_at: new Date().toISOString(),
        duration_seconds: durationSeconds,
      });

      await this.sendSignal(this.currentCall.id, peerId, 'hangup', {
        duration_seconds: durationSeconds,
      });
    }
    this.callbacks.onStatusChange('ended');
    this.cleanup();
  }

  public toggleMute(muted: boolean): boolean {
    if (!this.localStream) return false;
    this.localStream.getAudioTracks().forEach((track) => {
      track.enabled = !muted;
    });
    return muted;
  }

  public toggleCamera(cameraEnabled: boolean): boolean {
    if (!this.localStream) return false;
    this.localStream.getVideoTracks().forEach((track) => {
      track.enabled = cameraEnabled;
    });
    return cameraEnabled;
  }

  public async switchCamera(): Promise<void> {
    if (!this.localStream || !this.currentCall || this.currentCall.call_type !== 'video') return;
    this.facingMode = this.facingMode === 'user' ? 'environment' : 'user';

    const newStream = await navigator.mediaDevices.getUserMedia({
      audio: false,
      video: { facingMode: this.facingMode },
    });

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
    this.callbacks.onLocalStream(this.localStream);
  }

  private async acquireMediaStream(callType: CallType): Promise<MediaStream> {
    if (!navigator.mediaDevices || !navigator.mediaDevices.getUserMedia) {
      throw new Error('Your browser does not support WebRTC audio/video access (HTTPS is required).');
    }
    const constraints: MediaStreamConstraints = {
      audio: {
        echoCancellation: true,
        noiseSuppression: true,
        autoGainControl: true,
      },
      video:
        callType === 'video'
          ? {
              facingMode: this.facingMode,
              width: { ideal: 1280 },
              height: { ideal: 720 },
            }
          : false,
    };
    return await navigator.mediaDevices.getUserMedia(constraints);
  }

  private initPeerConnection(callId: string, peerUserId: string): void {
    const pc = new RTCPeerConnection({
      iceServers: getIceServers(),
    });

    this.remoteStream = new MediaStream();
    this.callbacks.onRemoteStream(this.remoteStream);

    if (this.localStream) {
      this.localStream.getTracks().forEach((track) => {
        pc.addTrack(track, this.localStream!);
      });
    }

    pc.ontrack = (event) => {
      if (event.streams && event.streams[0]) {
        this.remoteStream = event.streams[0];
        this.callbacks.onRemoteStream(this.remoteStream);
      } else if (this.remoteStream) {
        this.remoteStream.addTrack(event.track);
        this.callbacks.onRemoteStream(this.remoteStream);
      }
    };

    pc.onicecandidate = async (event) => {
      if (event.candidate) {
        await this.sendSignal(callId, peerUserId, 'ice-candidate', {
          candidate: event.candidate.toJSON(),
        });
      }
    };

    pc.onconnectionstatechange = async () => {
      if (!pc) return;
      if (pc.connectionState === 'connected') {
        if (this.callTimeoutTimer) {
          clearTimeout(this.callTimeoutTimer);
          this.callTimeoutTimer = null;
        }
        if (!this.connectedAtMs) {
          this.connectedAtMs = Date.now();
        }
        await updateCallRecordStatus(callId, 'connected', {
          answered_at: new Date().toISOString(),
        });
        this.callbacks.onStatusChange('connected');
      } else if (pc.connectionState === 'failed' || pc.connectionState === 'disconnected') {
        this.callbacks.onStatusChange('failed', 'Call connection lost due to network interruption.');
      }
    };

    this.peerConnection = pc;
  }

  private async subscribeToCallSignals(callId: string): Promise<void> {
    if (this.signalChannel) return;

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
          if (signal.sender_id === this.currentUserId) return;
          await this.handleIncomingSignal(signal);
        }
      )
      .subscribe();
  }

  private async handleIncomingSignal(signal: CallSignal): Promise<void> {
    try {
      switch (signal.signal_type) {
        case 'ringing': {
          if (this.currentCall) {
            this.currentCall.status = 'ringing';
          }
          this.callbacks.onStatusChange('ringing');
          break;
        }
        case 'answer': {
          if (this.peerConnection && signal.payload?.sdp) {
            await this.peerConnection.setRemoteDescription(
              new RTCSessionDescription({
                type: (signal.payload.type as RTCSdpType) || 'answer',
                sdp: signal.payload.sdp as string,
              })
            );
            for (const candidate of this.pendingCandidates) {
              await this.peerConnection.addIceCandidate(new RTCIceCandidate(candidate));
            }
            this.pendingCandidates = [];
            this.connectedAtMs = Date.now();
            this.callbacks.onStatusChange('connected');
          }
          break;
        }
        case 'ice-candidate': {
          const candidateInit = signal.payload?.candidate as RTCIceCandidateInit | undefined;
          if (!candidateInit) break;
          if (this.peerConnection && this.peerConnection.remoteDescription) {
            await this.peerConnection.addIceCandidate(new RTCIceCandidate(candidateInit));
          } else {
            this.pendingCandidates.push(candidateInit);
          }
          break;
        }
        case 'reject': {
          this.callbacks.onStatusChange('rejected', 'Call was declined.');
          this.cleanup();
          break;
        }
        case 'hangup': {
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
    await supabase.from('call_signals').insert({
      call_id: callId,
      sender_id: this.currentUserId,
      receiver_id: receiverId,
      signal_type: signalType,
      payload,
    });
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

  public cleanup(): void {
    if (this.callTimeoutTimer) {
      clearTimeout(this.callTimeoutTimer);
      this.callTimeoutTimer = null;
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
    this.callbacks.onLocalStream(null);
    this.callbacks.onRemoteStream(null);
  }
}
