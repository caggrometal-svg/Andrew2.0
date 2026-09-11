import fs from 'node:fs';
import path from 'node:path';

const androidRoot = path.resolve('android');
const gradlePath = path.join(androidRoot, 'app', 'build.gradle');
if (!fs.existsSync(gradlePath)) throw new Error('android/app/build.gradle not found');

const gradle = fs.readFileSync(gradlePath, 'utf8');
const namespace = gradle.match(/\bnamespace\s*(?:=\s*)?['\"]([^'\"]+)['\"]/)?.[1]
  ?? gradle.match(/\bapplicationId\s*(?:=\s*)?['\"]([^'\"]+)['\"]/)?.[1]
  ?? fs.readFileSync(path.join(androidRoot, 'app', 'src', 'main', 'AndroidManifest.xml'), 'utf8')
    .match(/\bpackage\s*=\s*['\"]([^'\"]+)['\"]/)?.[1];
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

    static {
        ALLOWED_PARAMETERS.add("model");
        ALLOWED_PARAMETERS.add("timeoutMs");
        ALLOWED_PARAMETERS.add("pollIntervalMs");
        ALLOWED_PARAMETERS.add("syncEnabled");
    }

    public AndrewBridge(Context context) {
        this.context = context.getApplicationContext();
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
            result.put("runtime", new JSONObject(prefs.getAll()).toString());
            return result.toString();
        } catch (Exception ignored) {
            return "{\"bridge\":\"android-v23\",\"native\":true}";
        }
    }

    @JavascriptInterface
    public void syncNow() {
        context.getSharedPreferences(PREFS, Context.MODE_PRIVATE).edit().putLong("lastSyncAt", System.currentTimeMillis()).apply();
    }
}
`;
fs.writeFileSync(path.join(sourceDir, 'AndrewBridge.java'), bridgeSource);

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
console.log(`Installed Phase 23 native bridge for ${namespace}`);
