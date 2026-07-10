package expo.modules.sapottrust

import android.content.Context
import java.io.File
import java.net.InetAddress
import java.security.KeyStore
import java.security.MessageDigest
import java.security.cert.CertificateFactory
import java.security.cert.X509Certificate
import javax.net.ssl.SSLContext
import javax.net.ssl.SSLSocketFactory
import javax.net.ssl.TrustManagerFactory
import javax.net.ssl.X509TrustManager
import okhttp3.Dns

/**
 * Singleton trust-anchor and server-address store for SapotTrust.
 *
 * Loads the bundled default CA from assets, an optional runtime CA persisted to
 * `filesDir` (debug builds only), and the pinned server hostname/IP persisted to
 * `filesDir`. Builds the [X509TrustManager], [SSLSocketFactory], and [Dns]
 * primitives consumed by [SapotOkHttpClientFactory].
 */
object SapotTrustStore {
  private const val RUNTIME_CA = "sapot_runtime_ca.pem"
  private const val ADDR_FILE = "sapot_server_addr.txt" // "hostname\nip"

  @Volatile private var addr: Pair<String, String>? = null

  fun init(ctx: Context) {
    addr = readAddr(ctx)
  }

  fun setAddress(ctx: Context, host: String, ip: String) {
    File(ctx.filesDir, ADDR_FILE).writeText("$host\n$ip")
    addr = host to ip
  }

  fun getAddress(): Pair<String, String>? = addr

  private fun readAddr(ctx: Context): Pair<String, String>? =
    File(ctx.filesDir, ADDR_FILE).takeIf { it.exists() }?.readText()
      ?.split("\n")?.let { if (it.size == 2) it[0] to it[1] else null }

  fun setRuntimeCa(ctx: Context, pem: String) { // caller enforces debug-only
    File(ctx.filesDir, RUNTIME_CA).writeText(pem)
  }

  fun clearRuntimeCa(ctx: Context) {
    File(ctx.filesDir, RUNTIME_CA).delete()
  }

  private fun anchors(ctx: Context): List<X509Certificate> {
    val cf = CertificateFactory.getInstance("X.509")
    val out = mutableListOf<X509Certificate>()
    ctx.assets.open("server_ca.pem").use { out += cf.generateCertificate(it) as X509Certificate }
    if (BuildConfig.DEBUG) {
      File(ctx.filesDir, RUNTIME_CA).takeIf { it.exists() }
        ?.inputStream()?.use { out += cf.generateCertificate(it) as X509Certificate }
    }
    return out
  }

  fun trustManager(ctx: Context): X509TrustManager {
    val ks = KeyStore.getInstance(KeyStore.getDefaultType()).apply {
      load(null)
      anchors(ctx).forEachIndexed { i, c -> setCertificateEntry("sapot-$i", c) }
    }
    val tmf = TrustManagerFactory.getInstance(TrustManagerFactory.getDefaultAlgorithm())
    tmf.init(ks)
    return tmf.trustManagers.first { it is X509TrustManager } as X509TrustManager
  }

  fun sslSocketFactory(ctx: Context): SSLSocketFactory =
    SSLContext.getInstance("TLS").apply { init(null, arrayOf(trustManager(ctx)), null) }.socketFactory

  fun dns(): Dns = Dns { hostname ->
    val a = addr
    if (a != null && hostname == a.first) InetAddress.getAllByName(a.second).toList()
    else Dns.SYSTEM.lookup(hostname)
  }

  fun activeFingerprintHex(ctx: Context): String? = anchors(ctx).lastOrNull()?.let {
    MessageDigest.getInstance("SHA-256").digest(it.encoded)
      .joinToString(":") { b -> "%02X".format(b) }
  }
}
