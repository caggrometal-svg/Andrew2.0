import { spawnSync } from "node:child_process";
import { existsSync } from "node:fs";
import { platform } from "node:os";
import { resolve } from "node:path";

const root = resolve(import.meta.dirname, "..");
const npm = platform() === "win32" ? "npm.cmd" : "npm";
const cap = platform() === "win32" ? "npx.cmd" : "npx";

const run = (command: string, args: string[], cwd = root): void => {
  const result = spawnSync(command, args, { cwd, stdio: "inherit", shell: false });
  if (result.error) throw result.error;
  if (result.status !== 0) process.exit(result.status ?? 1);
};

run(npm, ["test", "--", "--run"]);
run(npm, ["run", "build"]);
run(cap, ["cap", "sync", "android"]);

const gradlew = resolve(root, "android", platform() === "win32" ? "gradlew.bat" : "gradlew");
if (!existsSync(gradlew)) {
  throw new Error("android/gradlew não existe. O projeto Android precisa ser criado com npx cap add android.");
}

run(gradlew, ["assembleDebug", "--no-daemon"], resolve(root, "android"));

const apk = resolve(root, "android", "app/build/outputs/apk/debug/app-debug.apk");
if (!existsSync(apk)) throw new Error(`APK não encontrada: ${apk}`);

console.log(`APK OK: ${apk}`);
