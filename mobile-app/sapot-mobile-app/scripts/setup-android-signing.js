/**
 * setup-android-signing.js
 *
 * Idempotent Android signing setup for Expo prebuild.
 * - Copies keystore
 * - Safely updates gradle.properties
 * - Injects signingConfigs into build.gradle (no duplicates)
 */
import "dotenv/config";
import fs from "fs";
import path from "path";

import { fileURLToPath } from "url";

const __filename = fileURLToPath(import.meta.url);
const __dirname = path.dirname(__filename);

const ROOT = path.resolve(__dirname, "..");
const ANDROID_PATH = path.join(ROOT, "android");
const APP_PATH = path.join(ANDROID_PATH, "app");

// ===== ENV VARS (REQUIRED) =====
const {
  ANDROID_KEYSTORE_PATH,
  ANDROID_KEYSTORE_PASSWORD,
  ANDROID_KEY_ALIAS,
  ANDROID_KEY_PASSWORD,
} = process.env;

function fail(msg) {
  console.error(`❌ ${msg}`);
  process.exit(1);
}

function log(msg) {
  console.log(`🔧 ${msg}`);
}

// ===== VALIDATION =====
if (!ANDROID_KEY_ALIAS) fail("Missing ANDROID_KEY_ALIAS");
if (!ANDROID_KEY_PASSWORD) fail("Missing ANDROID_KEY_PASSWORD");
if (!ANDROID_KEYSTORE_PATH) fail("Missing ANDROID_KEYSTORE_PATH");
if (!ANDROID_KEYSTORE_PASSWORD) fail("Missing ANDROID_KEYSTORE_PASSWORD");

const keystoreSource = path.resolve(ROOT, ANDROID_KEYSTORE_PATH);
if (!fs.existsSync(keystoreSource)) {
  fail(`Keystore not found at ${keystoreSource}`);
}

// ===== 1. COPY KEYSTORE =====
const keystoreFilename = "@android.jks";
const keystoreDest = path.join(APP_PATH, keystoreFilename);

if (!fs.existsSync(keystoreDest)) {
  fs.copyFileSync(keystoreSource, keystoreDest);
  log("Keystore copied");
} else {
  log("Keystore already exists (skipped)");
}

// ===== 2. UPDATE gradle.properties =====
const gradlePropsPath = path.join(ANDROID_PATH, "gradle.properties");

let gradleProps = fs.existsSync(gradlePropsPath)
  ? fs.readFileSync(gradlePropsPath, "utf8")
  : "";

const propsToEnsure = {
  MYAPP_UPLOAD_STORE_FILE: keystoreFilename,
  MYAPP_UPLOAD_STORE_PASSWORD: ANDROID_KEYSTORE_PASSWORD,
  MYAPP_UPLOAD_KEY_ALIAS: ANDROID_KEY_ALIAS,
  MYAPP_UPLOAD_KEY_PASSWORD: ANDROID_KEY_PASSWORD,
};

let updated = false;

for (const [key, value] of Object.entries(propsToEnsure)) {
  const regex = new RegExp(`^${key}=.*$`, "m");
  if (gradleProps.match(regex)) {
    gradleProps = gradleProps.replace(regex, `${key}=${value}`);
  } else {
    gradleProps += `\n${key}=${value}`;
  }
  updated = true;
}

if (updated) {
  fs.writeFileSync(gradlePropsPath, gradleProps.trim() + "\n");
  log("gradle.properties updated");
}

// ===== 3. PATCH build.gradle =====
const buildGradlePath = path.join(APP_PATH, "build.gradle");
let buildGradle = fs.readFileSync(buildGradlePath, "utf8");
let modified = false;

const sharedSigningConfig = `signingConfigs {
        debug {
            if (project.hasProperty('MYAPP_UPLOAD_STORE_FILE')) {
                storeFile file(MYAPP_UPLOAD_STORE_FILE)
                storePassword MYAPP_UPLOAD_STORE_PASSWORD
                keyAlias MYAPP_UPLOAD_KEY_ALIAS
                keyPassword MYAPP_UPLOAD_KEY_PASSWORD
            }
        }
        release {
            if (project.hasProperty('MYAPP_UPLOAD_STORE_FILE')) {
                storeFile file(MYAPP_UPLOAD_STORE_FILE)
                storePassword MYAPP_UPLOAD_STORE_PASSWORD
                keyAlias MYAPP_UPLOAD_KEY_ALIAS
                keyPassword MYAPP_UPLOAD_KEY_PASSWORD
            }
        }
    }`;

// ---- Step 1: Replace entire signingConfigs block to ensure proper structure ----
if (!buildGradle.match(/release\s*\{\s*if\s*\(\s*project\.hasProperty\('MYAPP_UPLOAD_STORE_FILE'\)/)) {
  log("Setting up signingConfigs block with debug and release...");
  
  // Replace any existing signingConfigs block (including extra braces)
  buildGradle = buildGradle.replace(
    /signingConfigs\s*\{[\s\S]*?\}\s*\}\s*buildTypes/,
    `${sharedSigningConfig}\n    buildTypes`
  );
  
  // Also handle case where there's only one closing brace
  buildGradle = buildGradle.replace(
    /signingConfigs\s*\{[\s\S]*?\}\s*buildTypes/,
    `${sharedSigningConfig}\n    buildTypes`
  );
  
  modified = true;
} else {
  log("signingConfigs already properly configured");
}

// ---- Step 2: Ensure buildTypes use signingConfigs.release ----
if (buildGradle.includes("signingConfig signingConfigs.debug")) {
  log("Updating buildTypes to use signingConfigs.release...");
  
  const buildTypesStart = buildGradle.indexOf("buildTypes {");
  const buildTypesEnd = buildGradle.indexOf("\n    }", buildTypesStart);
  
  if (buildTypesStart !== -1 && buildTypesEnd !== -1) {
    const before = buildGradle.slice(0, buildTypesStart);
    const buildTypesSection = buildGradle.slice(buildTypesStart, buildTypesEnd);
    const after = buildGradle.slice(buildTypesEnd);
    
    const updated = buildTypesSection.replace(
      /signingConfig\s+signingConfigs\.debug/g,
      "signingConfig signingConfigs.release"
    );
    
    buildGradle = before + updated + after;
    modified = true;
  }
}

// ---- Step 3: Add optimization properties to debug buildType if missing ----
if (buildGradle.includes("debug {") && !buildGradle.includes("debug {\n            signingConfig signingConfigs.release\n            def enableShrinkResources")) {
  log("Adding optimization properties to debug buildType...");
  
  const debugWithProps = `debug {
            signingConfig signingConfigs.release
            def enableShrinkResources = findProperty('android.enableShrinkResourcesInReleaseBuilds') ?: 'false'
            shrinkResources enableShrinkResources.toBoolean()
            minifyEnabled enableMinifyInReleaseBuilds
            proguardFiles getDefaultProguardFile("proguard-android.txt"), "proguard-rules.pro"
            def enablePngCrunchInRelease = findProperty('android.enablePngCrunchInReleaseBuilds') ?: 'true'
            crunchPngs enablePngCrunchInRelease.toBoolean()
        }`;
  
  buildGradle = buildGradle.replace(
    /buildTypes\s*\{[\s\S]*?(debug\s*\{[\s\S]*?\n\s*\})/,
    (match) => {
      if (match.includes("debug {") && !match.includes("enableShrinkResources")) {
        return match.replace(
          /debug\s*\{[\s\S]*?\n\s*\}/,
          debugWithProps
        );
      }
      return match;
    }
  );
  
  modified = true;
}

if (modified) {
  fs.writeFileSync(buildGradlePath, buildGradle);
  log("build.gradle successfully patched");
} else {
  log("build.gradle already properly configured");
}

// ===== DONE =====
log("✅ Android signing setup complete");