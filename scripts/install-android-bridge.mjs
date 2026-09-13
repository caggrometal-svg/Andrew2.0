import fs from 'node:fs';
import path from 'node:path';

const androidRoot = path.resolve('android');
const gradlePath = path.join(androidRoot, 'app', 'build.gradle');
if (!fs.existsSync(gradlePath)) throw new Error('android/app/build.gradle not found');

const gradle = fs.readFileSync(gradlePath, 'utf8');
const namespace = gradle.match(/\bnamespace\s*(?:=\s*)?['"]([^'"]+)['"]/)?.[1]
  ?? gradle.match(/\bapplicationId\s*(?:=\s*)?['"]([^'"]+)['"]/)?.[1]
  ?? fs.readFileSync(path.join(androidRoot, 'app', 'src', 'main', 'AndroidManifest.xml'), 'utf8')
    .match(/\bpackage\s*=\s*['"]([^'"]+)['"]/)?.[1];
if (!namespace) throw new Error('Unable to determine Android namespace');

const packagePath = namespace.split('.').join(path.sep);
const sourceDir = path.join(androidRoot, 'app', 'src', 'main', 'java', packagePath);
fs.mkdirSync(sourceDir, { recursive: true });

const bridgeSource = `package ${namespace};

import android.content.Context;
import android.content.Intent;
import android.content.SharedPreferences;
import android.provider.Settings;
import android.webkit.JavascriptInterface;
import org.json.JSONObject;
import java.util.HashSet;
import java.util.Set;

public final class AndrewBridge {
    private static final String PREFS = "andrew_runtime";
    private static final Set<String> ALLOWED_PARAMETERS = new HashSet<>();
    private final Context context;
    private final AndroidKeyStoreManager keyStoreManager;

    static {
        ALLOWED_PARAMETERS.add("model");
        ALLOWED_PARAMETERS.add("timeoutMs");
        ALLOWED_PARAMETERS.add("pollIntervalMs");
        ALLOWED_PARAMETERS.add("syncEnabled");
    }

    public AndrewBridge(Context context) {
        this.context = context.getApplicationContext();
        this.keyStoreManager = new AndroidKeyStoreManager(this.context);
    }

    @JavascriptInterface
    public void openSettings() {
        Intent intent = new Intent(Settings.ACTION_SETTINGS);
        intent.addFlags(Intent.FLAG_ACTIVITY_NEW_TASK);
        context.startActivity(intent);
    }

    @JavascriptInterface
    public void setRuntimeParameter(String key, String value) {
        if (key == null || value == null || key.length() > 64 || value.length() > 256 || !ALLOWED_PARAMETERS.contains(key)) return;
        context.getSharedPreferences(PREFS, Context.MODE_PRIVATE).edit().putString(key, value).apply();
    }

    @JavascriptInterface
    public String requestStatus() {
        SharedPreferences prefs = context.getSharedPreferences(PREFS, Context.MODE_PRIVATE);
        try {
            JSONObject result = new JSONObject();
            result.put("bridge", "android-v23");
            result.put("native", true);
            result.put("crypto", "android-keystore-ed25519");
            result.put("runtime", new JSONObject(prefs.getAll()).toString());
            return result.toString();
        } catch (Exception ignored) {
            return "{}";
        }
    }

    @JavascriptInterface
    public void syncNow() {
        context.getSharedPreferences(PREFS, Context.MODE_PRIVATE).edit().putLong("lastSyncAt", System.currentTimeMillis()).apply();
    }

    @JavascriptInterface
    public String getBridgePublicKeyBase64() {
        return keyStoreManager.getPublicKeyBase64();
    }

    @JavascriptInterface
    public String signBridgePayload(String payload) {
        if (payload == null || payload.length() > 1_048_576) throw new IllegalArgumentException("invalid_signing_payload");
        return keyStoreManager.signBase64Url(payload);
    }
}
`;
fs.writeFileSync(path.join(sourceDir, 'AndrewBridge.java'), bridgeSource);

const keyStoreSource = `package ${namespace};

import android.content.Context;
import android.security.keystore.KeyGenParameterSpec;
import android.security.keystore.KeyProperties;
import java.nio.charset.StandardCharsets;
import java.security.KeyPair;
import java.security.KeyPairGenerator;
import java.security.KeyStore;
import java.security.PrivateKey;
import java.security.Signature;
import java.util.Base64;

public final class AndroidKeyStoreManager {
    private static final String KEYSTORE = "AndroidKeyStore";
    private static final String ALIAS = "andrew-bridge-ed25519-v1";
    private final Context context;

    public AndroidKeyStoreManager(Context context) {
        this.context = context.getApplicationContext();
    }

    private synchronized KeyStore loadKeyStore() throws Exception {
        KeyStore keyStore = KeyStore.getInstance(KEYSTORE);
        keyStore.load(null);
        if (!keyStore.containsAlias(ALIAS)) {
            KeyPairGenerator generator = KeyPairGenerator.getInstance("Ed25519", KEYSTORE);
            generator.initialize(new KeyGenParameterSpec.Builder(ALIAS, KeyProperties.PURPOSE_SIGN).build());
            generator.generateKeyPair();
        }
        return keyStore;
    }

    public synchronized String getPublicKeyBase64() {
        try {
            KeyStore keyStore = loadKeyStore();
            byte[] encoded = keyStore.getCertificate(ALIAS).getPublicKey().getEncoded();
            return Base64.getEncoder().encodeToString(encoded);
        } catch (Exception error) {
            throw new IllegalStateException("keystore_public_key_unavailable", error);
        }
    }

    public synchronized String signBase64Url(String payload) {
        try {
            KeyStore keyStore = loadKeyStore();
            PrivateKey privateKey = (PrivateKey) keyStore.getKey(ALIAS, null);
            if (privateKey == null) throw new IllegalStateException("keystore_private_key_unavailable");
            Signature signer = Signature.getInstance("Ed25519");
            signer.initSign(privateKey);
            signer.update(payload.getBytes(StandardCharsets.UTF_8));
            return Base64.getUrlEncoder().withoutPadding().encodeToString(signer.sign());
        } catch (Exception error) {
            throw new IllegalStateException("keystore_sign_failed", error);
        }
    }
}
`;
fs.writeFileSync(path.join(sourceDir, 'AndroidKeyStoreManager.java'), keyStoreSource);

const activitySource = `package ${namespace};

import android.os.Bundle;
import android.webkit.WebView;
import com.getcapacitor.BridgeActivity;

public class MainActivity extends BridgeActivity {
    @Override
    public void onCreate(Bundle savedInstanceState) {
        super.onCreate(savedInstanceState);
        WebView webView = getBridge().getWebView();
        webView.getSettings().setJavaScriptEnabled(true);
        webView.addJavascriptInterface(new AndrewBridge(this), "AndrewBridge");
    }
}
`;
fs.writeFileSync(path.join(sourceDir, 'MainActivity.java'), activitySource);
console.log(`Installed Phase 25 native security bridge for ${namespace}`);