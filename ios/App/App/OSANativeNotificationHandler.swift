import Foundation
import UserNotifications

/**
 * OSA Native iOS Notification Center Delegate.
 * Handles APNs message notifications with conversation threadIdentifier grouping
 * and deep-links into the exact OSA conversation when tapped.
 */
class OSANativeNotificationHandler: NSObject, UNUserNotificationCenterDelegate {
    static let shared = OSANativeNotificationHandler()
    weak var appDelegate: AppDelegate?

    func userNotificationCenter(
        _ center: UNUserNotificationCenter,
        willPresent notification: UNNotification,
        withCompletionHandler completionHandler: @escaping (UNNotificationPresentationOptions) -> Void
    ) {
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

        appDelegate?.dispatchDeepLinkToWeb(
            chatId: chatId,
            callId: callId,
            callAction: "open"
        )
        completionHandler()
    }
}
