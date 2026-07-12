package expo.modules.sapottrust

import com.facebook.react.modules.network.OkHttpClientProvider
import expo.modules.kotlin.modules.Module
import expo.modules.kotlin.modules.ModuleDefinition

class SapotTrustModule : Module() {
  private val ctx get() = requireNotNull(appContext.reactContext)

  override fun definition() = ModuleDefinition {
    // The module will be accessible from `requireNativeModule('SapotTrust')` in JavaScript.
    Name("SapotTrust")

    OnCreate {
      SapotTrustStore.init(ctx)
      // Only install the pinned networking stack in field/release builds. In debug
      // builds this replaces React Native's global OkHttpClientProvider factory, which
      // the Expo dev client also uses to reach Metro — breaking the dev-server
      // connection. It is also unnecessary in debug: the custom Dns is inert there
      // (setServerAddress is only called when !__DEV__) and backend CA trust is already
      // provided app-wide by the debug network_security_config (@raw/server_ca anchor).
      if (!BuildConfig.DEBUG) {
        val baseClient = OkHttpClientProvider.getOkHttpClient()
        OkHttpClientProvider.setOkHttpClientFactory(SapotOkHttpClientFactory(ctx.applicationContext, baseClient))
      }
    }

    Constant("isReleaseBuild") { !BuildConfig.DEBUG }

    AsyncFunction("setServerAddress") { host: String, ip: String ->
      SapotTrustStore.setAddress(ctx, host, ip)
    }

    AsyncFunction("getServerAddress") {
      SapotTrustStore.getAddress()?.let { mapOf("hostname" to it.first, "ip" to it.second) }
    }

    AsyncFunction("setCaPem") { pem: String ->
      if (!BuildConfig.DEBUG) throw Exception("runtime CA ignored in release")
      SapotTrustStore.setRuntimeCa(ctx, pem)
    }

    AsyncFunction("clearCaPem") {
      SapotTrustStore.clearRuntimeCa(ctx)
    }

    AsyncFunction("getActiveFingerprint") {
      SapotTrustStore.activeFingerprintHex(ctx)
    }
  }
}
