/**
 * OSA Native Mobile Layer Configuration (Capacitor — Android & iOS)
 * Isolated from the existing Web/PWA build so GitHub Pages and Web Push remain 100% intact.
 */
const config = {
  appId: 'app.osa.messaging',
  appName: 'OSA',
  webDir: 'dist',
  bundledWebRuntime: false,
  server: {
    androidScheme: 'https',
    iosScheme: 'capacitor',
  },
  plugins: {
    PushNotifications: {
      presentationOptions: ['badge', 'sound', 'alert'],
    },
  },
};

export default config;
