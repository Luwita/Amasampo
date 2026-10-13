// Zed Market for iPhone and Android (Expo). The screens are the phone layout of the Zed Market web app
// (bottom tabs, search header, buy bar), shown full-screen from the Zed Market server; this file adds what a
// phone app needs around it: safe areas, a launch screen, the Android back button, the phone's share sheet and
// printing, links that leave the app, and a "can't connect" screen.
import { useCallback, useEffect, useRef, useState } from 'react';
import { ActivityIndicator, BackHandler, Platform, Pressable, Share, StyleSheet, Text, View } from 'react-native';
import Constants from 'expo-constants';
import * as Linking from 'expo-linking';
import * as Print from 'expo-print';
import { StatusBar } from 'expo-status-bar';
import { SafeAreaProvider, SafeAreaView } from 'react-native-safe-area-context';
import { WebView } from 'react-native-webview';

const PORT = 4000;

// Where the Zed Market server runs. Published apps set EXPO_PUBLIC_WEB_URL (see .env.example).
// While developing, it is the computer running `npx expo start`, which must also run `npm run server`.
function serverUrl() {
  const fixed = process.env.EXPO_PUBLIC_WEB_URL;
  if (fixed) return fixed.replace(/\/+$/, '');
  // In a computer's browser (pressing w in Expo) the server is on the computer showing this page.
  const pageHost = Platform.OS === 'web' ? window.location.hostname : '';
  const host = pageHost || (Constants.expoConfig?.hostUri ?? Constants.expoGoConfig?.debuggerHost ?? '').split(':')[0];
  return host ? `http://${host}:${PORT}` : null;
}

const SITE = serverUrl();

// Runs inside the web app before it starts.
//  - Marks the page as being inside this app (html.in-app in src/mobile.css), so it doesn't leave space for the
//    notch and home bar a second time.
//  - Hands "Share" and "Print" to the phone: a web view has no share sheet on Android and cannot print.
const BRIDGE = `(function () {
  var mark = function () {
    if (document.documentElement) document.documentElement.classList.add('in-app');
  };
  mark();
  document.addEventListener('DOMContentLoaded', mark);
  var send = function (message) {
    window.ReactNativeWebView.postMessage(JSON.stringify(message));
  };
  if (!navigator.share) {
    navigator.share = function (data) {
      send({ type: 'share', title: data && data.title, text: data && data.text, url: data && data.url });
      return Promise.resolve();
    };
  }
  window.print = function () {
    send({ type: 'print', html: document.documentElement.outerHTML });
  };
})();
true;`;

// The page as printed: no scripts (the page is already drawn), and styles loaded from the server.
const printable = (html) =>
  `<!doctype html>${html
    .replace(/<script[\s\S]*?<\/script>/gi, '')
    .replace(/<head([^>]*)>/i, `<head$1><base href="${SITE}/">`)}`;

// This app is for phones. Opened in a computer's browser, it goes straight to the website instead.
if (Platform.OS === 'web' && SITE) window.location.replace(SITE);

function Logo() {
  return <Text style={styles.logo}>Z</Text>;
}

export default function App() {
  const web = useRef(null);
  const canGoBack = useRef(false);
  const [ready, setReady] = useState(false);
  const [failed, setFailed] = useState(false);
  const [attempt, setAttempt] = useState(0);

  // Android back button: back a page inside the app, and leave the app from the first page.
  useEffect(() => {
    const sub = BackHandler.addEventListener('hardwareBackPress', () => {
      if (!canGoBack.current) return false;
      web.current?.goBack();
      return true;
    });
    return () => sub.remove();
  }, []);

  // WhatsApp, phone, email, maps and other websites open in their own apps, not inside Zed Market.
  const stayInApp = useCallback((request) => {
    if (request.url.startsWith(SITE) || request.url.startsWith('about:')) return true;
    Linking.openURL(request.url).catch(() => {});
    return false;
  }, []);

  const onMessage = useCallback(({ nativeEvent }) => {
    let message;
    try {
      message = JSON.parse(nativeEvent.data);
    } catch {
      return;
    }
    if (message.type === 'share') {
      const text = [message.text, message.url].filter(Boolean).join(' ');
      Share.share({ title: message.title, message: text || message.title || '' }).catch(() => {});
    } else if (message.type === 'print' && typeof message.html === 'string') {
      Print.printAsync({ html: printable(message.html) }).catch(() => {});
    }
  }, []);

  const retry = () => {
    setFailed(false);
    setReady(false);
    setAttempt((n) => n + 1);
  };

  if (Platform.OS === 'web') return null;

  return (
    <SafeAreaProvider>
      <SafeAreaView style={styles.screen} edges={['top', 'bottom', 'left', 'right']}>
        <StatusBar style="dark" backgroundColor="#ffffff" />
        {!SITE || failed ? (
          <View style={styles.center}>
            <Logo />
            <Text style={styles.title}>Can't reach Zed Market</Text>
            <Text style={styles.text}>
              {SITE
                ? 'Check your internet connection and try again.'
                : 'No server address is set. Add EXPO_PUBLIC_WEB_URL to mobile/.env.'}
            </Text>
            {__DEV__ && SITE && <Text style={styles.hint}>Looking for the server at {SITE}</Text>}
            {SITE && (
              <Pressable style={styles.button} onPress={retry}>
                <Text style={styles.buttonText}>Try again</Text>
              </Pressable>
            )}
          </View>
        ) : (
          <>
            <WebView
              key={attempt}
              ref={web}
              source={{ uri: SITE }}
              style={styles.web}
              onNavigationStateChange={(state) => (canGoBack.current = state.canGoBack)}
              onShouldStartLoadWithRequest={stayInApp}
              onMessage={onMessage}
              onLoadEnd={() => setReady(true)}
              onError={() => setFailed(true)}
              onHttpError={({ nativeEvent }) => nativeEvent.url === `${SITE}/` && setFailed(true)}
              injectedJavaScriptBeforeContentLoaded={BRIDGE}
              injectedJavaScript={BRIDGE}
              allowsBackForwardNavigationGestures
              pullToRefreshEnabled
              domStorageEnabled
              sharedCookiesEnabled
              setSupportMultipleWindows={false}
              textZoom={100}
              overScrollMode="never"
              decelerationRate={Platform.OS === 'ios' ? 'normal' : undefined}
              contentInsetAdjustmentBehavior="never"
              automaticallyAdjustContentInsets={false}
            />
            {!ready && (
              <View style={[StyleSheet.absoluteFill, styles.launch]}>
                <Logo />
                <Text style={styles.brand}>Zed Market</Text>
                <ActivityIndicator color="#0e6b52" style={styles.spinner} />
              </View>
            )}
          </>
        )}
      </SafeAreaView>
    </SafeAreaProvider>
  );
}

const styles = StyleSheet.create({
  screen: { flex: 1, backgroundColor: '#ffffff' },
  web: { flex: 1, backgroundColor: '#f4f5f7' },
  center: { flex: 1, alignItems: 'center', justifyContent: 'center', padding: 32, backgroundColor: '#f4f5f7' },
  launch: { alignItems: 'center', justifyContent: 'center', backgroundColor: '#ffffff' },
  logo: {
    width: 72,
    height: 72,
    borderRadius: 18,
    overflow: 'hidden',
    backgroundColor: '#0e6b52',
    color: '#ffffff',
    fontSize: 40,
    fontWeight: '800',
    textAlign: 'center',
    lineHeight: 72,
    marginBottom: 16,
  },
  brand: { fontSize: 22, fontWeight: '800', color: '#111827', letterSpacing: -0.5 },
  spinner: { marginTop: 28 },
  title: { fontSize: 20, fontWeight: '700', color: '#111827', marginBottom: 8 },
  text: { fontSize: 15, color: '#6b7280', textAlign: 'center', lineHeight: 22 },
  hint: { fontSize: 12, color: '#6b7280', marginTop: 12 },
  button: { marginTop: 24, backgroundColor: '#0e6b52', borderRadius: 8, paddingVertical: 12, paddingHorizontal: 28 },
  buttonText: { color: '#ffffff', fontWeight: '600', fontSize: 15 },
});
