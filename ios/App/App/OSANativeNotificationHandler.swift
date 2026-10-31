import Foundation
import UserNotifications

/**
 * OSA Native iOS Notification Center Delegate.
 * - Handles APNs message notifications with conversation threadIdentifier grouping
 * - Prevents duplicate banners for CallKit calls or silent Remote Camera / Remote Location signals
 * - Deep-links into the exact OSA conversation when tapped and clears delivered notifications for that thread
 */
class OSANativeNotificationHandler: NSObject, UNUserNotificationCenterDelegate {
    static let shared = OSANativeNotificationHandler()
    weak var appDelegate: AppDelegate?

    func userNotificationCenter(
        _ center: UNUserNotificationCenter,
        willPresent notification: UNNotification,
        withCompletionHandler completionHandler: @escaping (UNNotificationPresentationOptions) -> Void
    ) {
        let userInfo = notification.request.content.userInfo
        let pushType = ((userInfo["type"] as? String) ?? "message").lowercased()

        // Never show normal banner notifications for Remote Camera or Remote Location background signals
        if pushType == "remote_camera" || pushType == "remote_location" || pushType == "cancel_call" || pushType == "call_cancel" {
            completionHandler([])
            return
        }

        // Avoid duplicate banner if CallKit is already presenting this incoming call
        if (pushType == "incoming_call" || pushType == "call"),
           let callId = userInfo["callId"] as? String,
           OSACallKitManager.shared.hasActiveCall(callId: callId) {
            completionHandler([])
            return
        }

        completionHandler([.banner, .list, .sound, .badge])
    }

    func userNotificationCenter(
        _ center: UNUserNotificationCenter,
        didReceive response: UNNotificationResponse,
        withCompletionHandler completionHandler: @escaping () -> Void
    ) {
        let userInfo = response.notification.request.content.userInfo
        let chatId = (userInfo["conversationId"] as? String) ?? (userInfo["chatId"] as? String)
        let callId = userInfo["callId"] as? String

        if let cid = chatId, !cid.isEmpty {
            clearDeliveredNotifications(forConversationId: cid)
        }

        appDelegate?.dispatchDeepLinkToWeb(
            chatId: chatId,
            callId: callId,
            callAction: "open"
        )
        completionHandler()
    }

    func clearDeliveredNotifications(forConversationId conversationId: String) {
        guard !conversationId.isEmpty else { return }
        let center = UNUserNotificationCenter.current()
        center.getDeliveredNotifications { notifications in
            var identifiersToRemove: [String] = []
            for notif in notifications {
                let req = notif.request
                let info = req.content.userInfo
                let cid = (info["conversationId"] as? String) ?? (info["chatId"] as? String) ?? req.content.threadIdentifier
                if cid == conversationId {
                    identifiersToRemove.append(req.identifier)
                }
            }
            if !identifiersToRemove.isEmpty {
                center.removeDeliveredNotifications(withIdentifiers: identifiersToRemove)
            }
        }
    }
}
