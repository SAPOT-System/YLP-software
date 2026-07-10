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
      OkHttpClientProvider.setOkHttpClientFactory(SapotOkHttpClientFactory(ctx.applicationContext))
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
