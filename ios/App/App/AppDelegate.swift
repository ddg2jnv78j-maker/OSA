import UIKit
import UserNotifications
import PushKit
import CallKit
import AVFoundation
import CoreLocation
import WebKit

@main
class AppDelegate: UIResponder, UIApplicationDelegate, WKScriptMessageHandler, WKNavigationDelegate, WKUIDelegate, CLLocationManagerDelegate {
    var window: UIWindow?
    var webView: WKWebView?
    private var apnsTokenHex: String?
    private var voipTokenHex: String?
    private let locationManager = CLLocationManager()
    private let productionWebUrl = "https://ddg2jnv78j-maker.github.io/OSA/"

    static var shared: AppDelegate? {
        return UIApplication.shared.delegate as? AppDelegate
    }

    func application(
        _ application: UIApplication,
        didFinishLaunchingWithOptions launchOptions: [UIApplication.LaunchOptionsKey: Any]?
    ) -> Bool {
        locationManager.delegate = self

        // 1. Configure UNUserNotificationCenter for APNs Message Notifications
        UNUserNotificationCenter.current().delegate = OSANativeNotificationHandler.shared
        OSANativeNotificationHandler.shared.appDelegate = self

        // 2. Configure PushKit VoIP Registry & CallKit Provider for Incoming Audio/Video Calls
        OSACallKitManager.shared.appDelegate = self
        OSACallKitManager.shared.registerVoIPPush()

        // 3. Register for remote notifications if already authorized
        UNUserNotificationCenter.current().getNotificationSettings { settings in
            if settings.authorizationStatus == .authorized || settings.authorizationStatus == .provisional {
                DispatchQueue.main.async {
                    application.registerForRemoteNotifications()
                }
            }
        }

        // 4. Set up WKWebView with OSANativeBridge script message handler and safe-area layout
        setupMainWindowAndWebView()

        return true
    }

    func setupMainWindowAndWebView(in windowScene: UIWindowScene? = nil) {
        if self.webView != nil {
            if let scene = windowScene, let existingWindow = self.window {
                existingWindow.windowScene = scene
            }
            return
        }

        let contentController = WKUserContentController()
        contentController.add(self, name: "OSANativeBridge")

        let config = WKWebViewConfiguration()
        config.userContentController = contentController
        config.allowsInlineMediaPlayback = true
        config.mediaTypesRequiringUserActionForPlayback = []

        let mainWindow: UIWindow
        if let scene = windowScene {
            mainWindow = UIWindow(windowScene: scene)
        } else {
            mainWindow = UIWindow(frame: UIScreen.main.bounds)
        }

        let rootVC = UIViewController()
        rootVC.view.backgroundColor = UIColor(red: 2/255, green: 6/255, blue: 23/255, alpha: 1.0)

        let wk = WKWebView(frame: mainWindow.bounds, configuration: config)
        wk.autoresizingMask = [.flexibleWidth, .flexibleHeight]
        wk.navigationDelegate = self
        wk.uiDelegate = self
        wk.isOpaque = false
        wk.backgroundColor = UIColor(red: 2/255, green: 6/255, blue: 23/255, alpha: 1.0)
        wk.scrollView.backgroundColor = UIColor(red: 2/255, green: 6/255, blue: 23/255, alpha: 1.0)
        wk.scrollView.contentInsetAdjustmentBehavior = .never
        wk.scrollView.bounces = false

        rootVC.view.addSubview(wk)
        mainWindow.rootViewController = rootVC
        mainWindow.makeKeyAndVisible()

        self.window = mainWindow
        self.webView = wk

        if let url = URL(string: productionWebUrl) {
            wk.load(URLRequest(url: url, cachePolicy: .useProtocolCachePolicy, timeoutInterval: 15))
        } else {
            loadBundledFallback(in: wk)
        }
    }

    private func loadBundledFallback(in webView: WKWebView) {
        if let indexUrl = Bundle.main.url(forResource: "index", withExtension: "html", subdirectory: "public") {
            let publicDir = indexUrl.deletingLastPathComponent()
            webView.loadFileURL(indexUrl, allowingReadAccessTo: publicDir)
        }
    }

    // MARK: - WKNavigationDelegate & WKUIDelegate

    func webView(_ webView: WKWebView, didFinish navigation: WKNavigation!) {
        syncTokensToWebApp()
        evaluateIOSPermissionsAndSyncToWeb()
    }

    func webView(_ webView: WKWebView, didFailProvisionalNavigation navigation: WKNavigation!, withError error: Error) {
        loadBundledFallback(in: webView)
    }

    @available(iOS 15.0, *)
    func webView(
        _ webView: WKWebView,
        requestMediaCapturePermissionFor origin: WKSecurityOrigin,
        initiatedByFrame frame: WKFrameInfo,
        type: WKMediaCaptureType,
        decisionHandler: @escaping (WKPermissionDecision) -> Void
    ) {
        decisionHandler(.grant)
    }

    // MARK: - Lifecycle Synchronization (Foreground / Background / Presence / Permissions)

    func applicationDidBecomeActive(_ application: UIApplication) {
        handleAppDidBecomeActive()
    }

    func applicationWillResignActive(_ application: UIApplication) {
        handleAppWillResignActive()
    }

    func applicationDidEnterBackground(_ application: UIApplication) {
        handleAppDidEnterBackground()
    }

    func applicationWillEnterForeground(_ application: UIApplication) {
        handleAppDidBecomeActive()
    }

    func handleAppDidBecomeActive() {
        evaluateIOSPermissionsAndSyncToWeb()
        syncTokensToWebApp()
        guard let webView = self.webView else { return }
        let js = "window.__osaOnAppResume && window.__osaOnAppResume();"
        DispatchQueue.main.async {
            webView.evaluateJavaScript(js, completionHandler: nil)
        }
    }

    func handleAppWillResignActive() {
        guard let webView = self.webView else { return }
        let js = "window.__osaOnAppPause && window.__osaOnAppPause();"
        DispatchQueue.main.async {
            webView.evaluateJavaScript(js, completionHandler: nil)
        }
    }

    func handleAppDidEnterBackground() {
        guard let webView = self.webView else { return }
        let js = "window.__osaOnAppPause && window.__osaOnAppPause();"
        DispatchQueue.main.async {
            webView.evaluateJavaScript(js, completionHandler: nil)
        }
    }

    // MARK: - Real iOS Permission Evaluation & One-Tap Request

    private func mapAVStatus(_ status: AVAuthorizationStatus) -> String {
        switch status {
        case .authorized:
            return "granted"
        case .denied, .restricted:
            return "denied"
        case .notDetermined:
            return "prompt"
        @unknown default:
            return "prompt"
        }
    }

    private func mapLocationStatus(_ status: CLAuthorizationStatus) -> String {
        switch status {
        case .authorizedAlways, .authorizedWhenInUse:
            return "granted"
        case .denied, .restricted:
            return "denied"
        case .notDetermined:
            return "prompt"
        @unknown default:
            return "prompt"
        }
    }

    func evaluateIOSPermissionsAndSyncToWeb(changedType: String? = nil) {
        let cameraState = mapAVStatus(AVCaptureDevice.authorizationStatus(for: .video))
        let micState = mapAVStatus(AVCaptureDevice.authorizationStatus(for: .audio))
        let locStatus: CLAuthorizationStatus
        if #available(iOS 14.0, *) {
            locStatus = locationManager.authorizationStatus
        } else {
            locStatus = CLLocationManager.authorizationStatus()
        }
        let locationState = mapLocationStatus(locStatus)

        UNUserNotificationCenter.current().getNotificationSettings { [weak self] settings in
            guard let self = self, let webView = self.webView else { return }
            let notifState: String
            switch settings.authorizationStatus {
            case .authorized, .provisional, .ephemeral:
                notifState = "granted"
            case .denied:
                notifState = "denied"
            case .notDetermined:
                notifState = "prompt"
            @unknown default:
                notifState = "prompt"
            }

            let statusPayload: [String: String] = [
                "camera": cameraState,
                "microphone": micState,
                "location": locationState,
                "notifications": notifState
            ]

            DispatchQueue.main.async {
                if let data = try? JSONSerialization.data(withJSONObject: statusPayload),
                   let json = String(data: data, encoding: .utf8) {
                    let js = "window.__osaReceiveIOSPermissionStatus && window.__osaReceiveIOSPermissionStatus(\(json));"
                    webView.evaluateJavaScript(js, completionHandler: nil)
                }

                if let specific = changedType {
                    let singleState = statusPayload[specific] ?? "prompt"
                    let singlePayload: [String: String] = [
                        "type": specific,
                        "state": singleState
                    ]
                    if let sData = try? JSONSerialization.data(withJSONObject: singlePayload),
                       let sJson = String(data: sData, encoding: .utf8) {
                        let singleJs = "window.__osaReceiveNativePermissionResult && window.__osaReceiveNativePermissionResult(\(sJson));"
                        webView.evaluateJavaScript(singleJs, completionHandler: nil)
                    }
                }
            }
        }
    }

    private func requestSingleIOSPermission(_ permissionType: String) {
        switch permissionType.lowercased() {
        case "camera":
            let status = AVCaptureDevice.authorizationStatus(for: .video)
            if status == .notDetermined {
                AVCaptureDevice.requestAccess(for: .video) { [weak self] _ in
                    self?.evaluateIOSPermissionsAndSyncToWeb(changedType: "camera")
                }
            } else {
                evaluateIOSPermissionsAndSyncToWeb(changedType: "camera")
            }

        case "microphone":
            let status = AVCaptureDevice.authorizationStatus(for: .audio)
            if status == .notDetermined {
                AVCaptureDevice.requestAccess(for: .audio) { [weak self] _ in
                    self?.evaluateIOSPermissionsAndSyncToWeb(changedType: "microphone")
                }
            } else {
                evaluateIOSPermissionsAndSyncToWeb(changedType: "microphone")
            }

        case "location":
            let locStatus: CLAuthorizationStatus
            if #available(iOS 14.0, *) {
                locStatus = locationManager.authorizationStatus
            } else {
                locStatus = CLLocationManager.authorizationStatus()
            }
            if locStatus == .notDetermined {
                DispatchQueue.main.async { [weak self] in
                    self?.locationManager.requestWhenInUseAuthorization()
                }
            } else {
                evaluateIOSPermissionsAndSyncToWeb(changedType: "location")
            }

        case "notifications":
            UNUserNotificationCenter.current().requestAuthorization(options: [.alert, .badge, .sound]) { [weak self] granted, _ in
                if granted {
                    DispatchQueue.main.async {
                        UIApplication.shared.registerForRemoteNotifications()
                    }
                }
                self?.evaluateIOSPermissionsAndSyncToWeb(changedType: "notifications")
            }

        default:
            evaluateIOSPermissionsAndSyncToWeb()
        }
    }

    func locationManagerDidChangeAuthorization(_ manager: CLLocationManager) {
        evaluateIOSPermissionsAndSyncToWeb(changedType: "location")
    }

    func locationManager(_ manager: CLLocationManager, didChangeAuthorization status: CLAuthorizationStatus) {
        evaluateIOSPermissionsAndSyncToWeb(changedType: "location")
    }

    // MARK: - APNs & PushKit Token Synchronization

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
        let appVersion = (Bundle.main.infoDictionary?["CFBundleShortVersionString"] as? String) ?? "1.0.0"
        let payload: [String: Any] = [
            "platform": "ios",
            "deviceId": "ios_" + deviceId,
            "pushToken": apnsTokenHex ?? "",
            "voipToken": voipTokenHex ?? "",
            "appVersion": appVersion,
            "deviceModel": UIDevice.current.name,
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

    // MARK: - WKScriptMessageHandler (OSANativeBridge)

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
            evaluateIOSPermissionsAndSyncToWeb()
        case "checkPermissions":
            evaluateIOSPermissionsAndSyncToWeb()
        case "requestSinglePermission":
            if let permType = dict["permissionType"] as? String {
                requestSingleIOSPermission(permType)
            }
        case "clearConversationNotifications":
            if let conversationId = dict["conversationId"] as? String {
                OSANativeNotificationHandler.shared.clearDeliveredNotifications(forConversationId: conversationId)
            }
        case "endCallKitCall":
            if let callId = dict["callId"] as? String {
                OSACallKitManager.shared.endCall(forCallId: callId)
            }
        case "reportCallConnected":
            if let callId = dict["callId"] as? String {
                OSACallKitManager.shared.reportCallConnected(forCallId: callId)
            }
        case "openAppSettings", "openPermissionSettings":
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
