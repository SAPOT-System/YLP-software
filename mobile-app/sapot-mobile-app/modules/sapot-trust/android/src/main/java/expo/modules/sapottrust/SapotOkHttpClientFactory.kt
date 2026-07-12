package expo.modules.sapottrust

import android.content.Context
import com.facebook.react.modules.network.OkHttpClientFactory
import com.facebook.react.modules.network.OkHttpClientProvider
import okhttp3.OkHttpClient

/**
 * [OkHttpClientFactory] that starts from React Native's default client builder and layers on
 * SapotTrust's pinned [okhttp3.Dns] resolution and [javax.net.ssl.X509TrustManager]/
 * [javax.net.ssl.SSLSocketFactory]. Default hostname verification is left untouched.
 */
class SapotOkHttpClientFactory(private val ctx: Context, private val baseClient: OkHttpClient) : OkHttpClientFactory {
  override fun createNewNetworkModuleClient(): OkHttpClient =
    baseClient.newBuilder()
      .sslSocketFactory(SapotTrustStore.sslSocketFactory(ctx), SapotTrustStore.trustManager(ctx))
      .dns(SapotTrustStore.dns())
      .build()
}
