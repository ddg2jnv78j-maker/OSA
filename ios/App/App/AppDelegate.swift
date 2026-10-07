import UIKit
import UserNotifications
import PushKit
import CallKit
import WebKit

@main
class AppDelegate: UIResponder, UIApplicationDelegate, WKScriptMessageHandler {
    var window: UIWindow?
    var webView: WKWebView?
    private var apnsTokenHex: String?
    private var voipTokenHex: String?

    func application(
        _ application: UIApplication,
        didFinishLaunchingWithOptions launchOptions: [UIApplication.LaunchOptionsKey: Any]?
    ) -> Bool {
        // 1. Configure UNUserNotificationCenter for APNs Message Notifications
        UNUserNotificationCenter.current().delegate = OSANativeNotificationHandler.shared
        OSANativeNotificationHandler.shared.appDelegate = self

        // 2. Configure PushKit VoIP Registry & CallKit Provider for Incoming Audio/Video Calls
        OSACallKitManager.shared.appDelegate = self
        OSACallKitManager.shared.registerVoIPPush()

        // 3. Request Notification Authorization & Register for Remote Notifications
        UNUserNotificationCenter.current().requestAuthorization(options: [.alert, .Badge, .sound]) { granted, _ in
            if granted {
                DispatchQueue.main.async {
                    application.registerForRemoteNotifications()
                }
            }
        }

        // 4. Set up WKWebView with OSANativeBridge script message handler
        let contentController = WKUserContentController()
        contentController.add(self, name: "OSANativeBridge")

        let config = WKWebViewConfiguration()
        config.userContentController = contentController
        config.allowsInlineMediaPlayback = true
        config.mediaTypesRequiringUserActionForPlayback = []

        let mainWindow = UIWindow(frame: UIScreen.main.bounds)
        let rootVC = UIViewController()
        let wk = WKWebView(frame: mainWindow.bounds, configuration: config)
        wk.autoresizingMask = [.flexibleWidth, .flexibleHeight]
        rootVC.view.addSubview(wk)
        mainWindow.rootViewController = rootVC
        mainWindow.makeKeyAndVisible()

        self.window = mainWindow
        self.webView = wk

        if let url = URL(string: "https://ddg2jnv78j-maker.github.io/OSA/") {
            wk.load(URLRequest(url: url))
        }

        return true
    }

    func application(
        _ application: UIApplication,
        didRegisterForRemoteNotificationsWithDeviceToken deviceToken: Data
    ) {
        let tokenString = deviceToken.map { String(format: "%02.2hhx", $0) }.joined()
        self.apnsTokenHex = tokenString
        syncTokensToWebApp()
    }

    func didUpdateVoIPToken(_ token: String) {
        self.voipTokenHex = token
        syncTokensToWebApp()
    }

    func syncTokensToWebApp() {
        guard let webView = self.webView else { return }
        let deviceId = UIDevice.current.identifierForVendor?.uuidString ?? "ios_device"
        let payload: [String: Any] = [
            "platform": "ios",
            "deviceId": "ios_" + deviceId,
            "pushToken": apnsTokenHex ?? "",
            "voipToken": voipTokenHex ?? "",
            "appVersion": "1.0.0",
            "deviceModel": UIDevice.current.model,
            "osVersion": UIDevice.current.systemVersion
        ]
        if let data = try? JSONSerialization.data(withJSONObject: payload),
           let json = String(data: data, encoding: .utf8) {
            let js = "window.__osaReceiveNativePushToken && window.__osaReceiveNativePushToken(\(json));"
            DispatchQueue.main.async {
                webView.evaluateJavaScript(js, completionHandler: nil)
            }
        }
    }

    func dispatchCallActionToWeb(callId: String, callType: String, action: String) {
        guard let webView = self.webView else { return }
        let payload: [String: String] = [
            "callId": callId,
            "callType": callType,
            "action": action
        ]
        if let data = try? JSONSerialization.data(withJSONObject: payload),
           let json = String(data: data, encoding: .utf8) {
            let js = "window.__osaReceiveNativeCallAction && window.__osaReceiveNativeCallAction(\(json));"
            DispatchQueue.main.async {
                webView.evaluateJavaScript(js, completionHandler: nil)
            }
        }
    }

    func dispatchDeepLinkToWeb(chatId: String?, callId: String?, callAction: String?) {
        guard let webView = self.webView else { return }
        let payload: [String: String] = [
            "chatId": chatId ?? "",
            "callId": callId ?? "",
            "callAction": callAction ?? "open"
        ]
        if let data = try? JSONSerialization.data(withJSONObject: payload),
           let json = String(data: data, encoding: .utf8) {
            let js = "window.__osaReceiveNativeDeepLink && window.__osaReceiveNativeDeepLink(\(json));"
            DispatchQueue.main.async {
                webView.evaluateJavaScript(js, completionHandler: nil)
            }
        }
    }

    func userContentController(
        _ userContentController: WKUserContentController,
        didReceive message: WKScriptMessage
    ) {
        guard message.name == "OSANativeBridge",
              let dict = message.body as? [String: Any],
              let action = dict["action"] as? String else { return }

        switch action {
        case "registerTokens":
            syncTokensToWebApp()
        case "endCallKitCall":
            if let callId = dict["callId"] as? String {
                OSACallKitManager.shared.endCall(forCallId: callId)
            }
        case "reportCallConnected":
            if let callId = dict["callId"] as? String {
                OSACallKitManager.shared.reportCallConnected(forCallId: callId)
            }
        case "openAppSettings":
            if let settingsUrl = URL(string: UIApplication.openSettingsURLString) {
                DispatchQueue.main.async {
                    UIApplication.shared.open(settingsUrl)
                }
            }
        default:
            break
        }
    }
}
