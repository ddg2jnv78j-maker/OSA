import UIKit

class SceneDelegate: UIResponder, UIWindowSceneDelegate {
    var window: UIWindow?

    func scene(
        _ scene: UIScene,
        willConnectTo session: UISceneSession,
        options connectionOptions: UIScene.ConnectionOptions
    ) {
        guard let windowScene = scene as? UIWindowScene else { return }
        AppDelegate.shared?.setupMainWindowAndWebView(in: windowScene)
        self.window = AppDelegate.shared?.window
    }

    func sceneDidBecomeActive(_ scene: UIScene) {
        AppDelegate.shared?.handleAppDidBecomeActive()
    }

    func sceneWillResignActive(_ scene: UIScene) {
        AppDelegate.shared?.handleAppWillResignActive()
    }

    func sceneWillEnterForeground(_ scene: UIScene) {
        AppDelegate.shared?.handleAppDidBecomeActive()
    }

    func sceneDidEnterBackground(_ scene: UIScene) {
        AppDelegate.shared?.handleAppDidEnterBackground()
    }
}
