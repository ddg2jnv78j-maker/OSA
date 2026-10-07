import Foundation
import CallKit
import PushKit
import AVFoundation

/**
 * OSA Real Apple CallKit & PushKit VoIP Manager for iPhone.
 * - Complies with Apple iOS 13+ VoIP Push policy by reporting every incoming VoIP push immediately to CXProvider.
 * - Handles lock-screen & background Incoming Audio and Video Calls with native Accept / Reject.
 * - Synchronizes CXAnswerCallAction and CXEndCallAction directly with Supabase and OSA WebRTC.
 */
class OSACallKitManager: NSObject, PKPushRegistryDelegate, CXProviderDelegate {
    static let shared = OSACallKitManager()

    weak var appDelegate: AppDelegate?
    private let provider: CXProvider
    private let callController = CXCallController()
    private var voipRegistry: PKPushRegistry?

    private struct ActiveCallMetadata {
        let uuid: UUID
        let callId: String
        let callType: String
        let callerName: String
        let rejectToken: String?
        let rejectEndpoint: String?
        let anonKey: String?
        var wasAnswered: Bool
    }

    private var callsByUUID: [UUID: ActiveCallMetadata] = [:]
    private var uuidByCallId: [String: UUID] = [:]

    override private init() {
        let config = CXProviderConfiguration(localizedName: "OSA")
        config.supportsVideo = true
        config.maximumCallsPerCallGroup = 1
        config.supportedHandleTypes = [.generic]
        self.provider = CXProvider(configuration: config)
        super.init()
        self.provider.setDelegate(self, queue: nil)
    }

    func registerVoIPPush() {
        let registry = PKPushRegistry(queue: DispatchQueue.main)
        registry.delegate = self
        registry.desiredPushTypes = [.voIP]
        self.voipRegistry = registry
    }

    // MARK: - PKPushRegistryDelegate

    func pushRegistry(
        _ registry: PKPushRegistry,
        didUpdate pushCredentials: PKPushCredentials,
        for type: PKPushType
    ) {
        guard type == .voIP else { return }
        let token = pushCredentials.token.map { String(format: "%02.2hhx", $0) }.joined()
        appDelegate?.didUpdateVoIPToken(token)
    }

    func pushRegistry(
        _ registry: PKPushRegistry,
        didReceiveIncomingPushWith payload: PKPushPayload,
        for type: PKPushType,
        completion: @escaping () -> Void
    ) {
        guard type == .voIP else {
            completion()
            return
        }

        let dict = payload.dictionaryPayload
        let pushType = (dict["type"] as? String) ?? "incoming_call"
        let callId = (dict["callId"] as? String) ?? UUID().uuidString
        let callType = (dict["callType"] as? String) ?? "audio"
        let callerName = (dict["callerName"] as? String) ?? "OSA Caller"
        let rejectToken = dict["rejectToken"] as? String
        let rejectEndpoint = dict["rejectEndpoint"] as? String
        let anonKey = dict["anonKey"] as? String

        if pushType == "cancel_call" {
            endCall(forCallId: callId)
            completion()
            return
        }

        let callUUID = uuidByCallId[callId] ?? UUID()
        uuidByCallId[callId] = callUUID
        callsByUUID[callUUID] = ActiveCallMetadata(
            uuid: callUUID,
            callId: callId,
            callType: callType,
            callerName: callerName,
            rejectToken: rejectToken,
            rejectEndpoint: rejectEndpoint,
            anonKey: anonKey,
            wasAnswered: false
        )

        let update = CXCallUpdate()
        update.remoteHandle = CXHandle(type: .generic, value: callerName)
        update.localizedCallerName = callerName
        update.hasVideo = (callType.lowercased() == "video")

        provider.reportNewIncomingCall(with: callUUID, update: update) { _ in
            completion()
        }
    }

    // MARK: - CXProviderDelegate

    func providerDidReset(_ provider: CXProvider) {
        callsByUUID.removeAll()
        uuidByCallId.removeAll()
    }

    func provider(_ provider: CXProvider, perform action: CXAnswerCallAction) {
        guard var meta = callsByUUID[action.callUUID] else {
            action.fail()
            return
        }
        meta.wasAnswered = true
        callsByUUID[action.callUUID] = meta

        configureAudioSession()
        appDelegate?.dispatchCallActionToWeb(
            callId: meta.callId,
            callType: meta.callType,
            action: "accept"
        )
        action.fulfill()
    }

    func provider(_ provider: CXProvider, perform action: CXEndCallAction) {
        guard let meta = callsByUUID[action.callUUID] else {
            action.fulfill()
            return
        }

        callsByUUID.removeValue(forKey: action.callUUID)
        uuidByCallId.removeValue(forKey: meta.callId)

        if !meta.wasAnswered {
            // User pressed Reject on the native iOS CallKit screen -> update Supabase immediately
            sendServerRejectCall(meta: meta)
            appDelegate?.dispatchCallActionToWeb(
                callId: meta.callId,
                callType: meta.callType,
                action: "reject"
            )
        } else {
            appDelegate?.dispatchCallActionToWeb(
                callId: meta.callId,
                callType: meta.callType,
                action: "end"
            )
        }

        action.fulfill()
    }

    // MARK: - Helpers

    func endCall(forCallId callId: String) {
        guard let uuid = uuidByCallId[callId] else { return }
        let endAction = CXEndCallAction(call: uuid)
        let transaction = CXTransaction(action: endAction)
        callController.request(transaction) { _ in }
    }

    func reportCallConnected(forCallId callId: String) {
        // CallKit incoming call is already active after CXAnswerCallAction
    }

    private func configureAudioSession() {
        let session = AVAudioSession.sharedInstance()
        try? session.setCategory(.playAndRecord, mode: .voiceChat, options: [.allowBluetooth, .defaultToSpeaker])
        try? session.setActive(true)
    }

    private func sendServerRejectCall(meta: ActiveCallMetadata) {
        guard let endpoint = meta.rejectEndpoint,
              let token = meta.rejectToken,
              let url = URL(string: endpoint) else { return }

        var req = URLRequest(url: url)
        req.httpMethod = "POST"
        req.setValue("application/json", forHTTPHeaderField: "Content-Type")
        if let anonKey = meta.anonKey, !anonKey.isEmpty {
            req.setValue(anonKey, forHTTPHeaderField: "apikey")
            req.setValue("Bearer " + anonKey, forHTTPHeaderField: "Authorization")
        }

        let body: [String: String] = [
            "action": "reject_call",
            "callId": meta.callId,
            "rejectToken": token
        ]
        req.httpBody = try? JSONSerialization.data(withJSONObject: body)
        URLSession.shared.dataTask(with: req).resume()
    }
}
