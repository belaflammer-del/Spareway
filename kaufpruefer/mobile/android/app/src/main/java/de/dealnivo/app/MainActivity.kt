package de.dealnivo.app

import android.annotation.SuppressLint
import android.content.Intent
import android.graphics.Bitmap
import android.graphics.BitmapFactory
import android.net.Uri
import android.os.Build
import android.os.Bundle
import android.webkit.CookieManager
import android.webkit.WebView
import android.webkit.WebViewClient
import androidx.activity.ComponentActivity
import androidx.lifecycle.lifecycleScope
import kotlinx.coroutines.Dispatchers
import kotlinx.coroutines.launch
import kotlinx.coroutines.withContext
import java.io.ByteArrayOutputStream
import java.io.DataOutputStream
import java.net.HttpURLConnection
import java.net.URL
import java.net.URLEncoder
import java.util.UUID

/**
 * Schlanker nativer Rahmen um die DEAL-NIVO-Web-App mit Sharesheet-Anbindung.
 *
 * ACTION_SEND (text/plain): Link bzw. geteilter Text → /teilen?text=…
 * ACTION_SEND / ACTION_SEND_MULTIPLE (image/*): Bilder werden als JPEG neu
 * kodiert (entfernt EXIF/GPS) und an den Teilen-Eingang POST /share-target
 * gesendet; die Antwort-Weiterleitung /teilen?inbox=… wird geöffnet.
 *
 * Keine API-Schlüssel in der App. Es startet nie automatisch eine
 * kostenpflichtige Analyse – der Nutzer bestätigt in der Web-App.
 */
class MainActivity : ComponentActivity() {
    companion object {
        const val BASE = "https://dealnivo.onrender.com"
        const val MAX_IMAGES = 8
    }

    private lateinit var web: WebView

    @SuppressLint("SetJavaScriptEnabled")
    override fun onCreate(savedInstanceState: Bundle?) {
        super.onCreate(savedInstanceState)
        web = WebView(this).apply {
            settings.javaScriptEnabled = true
            settings.domStorageEnabled = true
            settings.allowFileAccess = false
            settings.allowContentAccess = false
            webViewClient = object : WebViewClient() {
                // Nur die eigene Domain in der App, alles andere im Browser
                override fun shouldOverrideUrlLoading(view: WebView, request: android.webkit.WebResourceRequest): Boolean {
                    if (request.url.host == Uri.parse(BASE).host) return false
                    startActivity(Intent(Intent.ACTION_VIEW, request.url))
                    return true
                }
            }
        }
        CookieManager.getInstance().setAcceptCookie(true)
        setContentView(web)
        if (!handleIntent(intent)) web.loadUrl(BASE)
    }

    override fun onNewIntent(intent: Intent) {
        super.onNewIntent(intent)
        handleIntent(intent)
    }

    private fun handleIntent(intent: Intent?): Boolean {
        intent ?: return false
        when (intent.action) {
            Intent.ACTION_SEND -> {
                if (intent.type?.startsWith("image/") == true) {
                    val uri = parcelableUri(intent) ?: return false
                    uploadImages(listOf(uri), intent.getStringExtra(Intent.EXTRA_TEXT))
                } else {
                    val text = intent.getStringExtra(Intent.EXTRA_TEXT) ?: return false
                    val subject = intent.getStringExtra(Intent.EXTRA_SUBJECT) ?: ""
                    web.loadUrl("$BASE/teilen?text=${enc(text.take(4000))}&title=${enc(subject.take(300))}")
                }
                return true
            }
            Intent.ACTION_SEND_MULTIPLE -> {
                val uris = parcelableUris(intent).take(MAX_IMAGES)
                if (uris.isEmpty()) return false
                uploadImages(uris, intent.getStringExtra(Intent.EXTRA_TEXT))
                return true
            }
            Intent.ACTION_VIEW -> {
                val data = intent.data ?: return false
                if (data.host == Uri.parse(BASE).host) web.loadUrl(data.toString()) else return false
                return true
            }
        }
        return false
    }

    private fun uploadImages(uris: List<Uri>, text: String?) {
        web.loadUrl("$BASE/teilen")
        lifecycleScope.launch {
            val location = withContext(Dispatchers.IO) { runCatching { postShare(uris, text) }.getOrNull() }
            if (location != null && Regex("^/teilen\\?inbox=sh_[a-z0-9]{6,32}").containsMatchIn(location)) {
                web.loadUrl(BASE + location)
            } else {
                web.loadUrl("$BASE/check?mode=screenshots")
            }
        }
    }

    /** multipart/form-data an /share-target; liefert den Location-Header der 303-Antwort. */
    private fun postShare(uris: List<Uri>, text: String?): String? {
        val boundary = "dn-" + UUID.randomUUID()
        val conn = (URL("$BASE/share-target").openConnection() as HttpURLConnection).apply {
            requestMethod = "POST"
            instanceFollowRedirects = false
            doOutput = true
            connectTimeout = 15000
            readTimeout = 60000
            setRequestProperty("Content-Type", "multipart/form-data; boundary=$boundary")
        }
        DataOutputStream(conn.outputStream).use { out ->
            if (!text.isNullOrBlank()) {
                out.writeBytes("--$boundary\r\nContent-Disposition: form-data; name=\"text\"\r\n\r\n")
                out.write(text.take(4000).toByteArray(Charsets.UTF_8))
                out.writeBytes("\r\n")
            }
            uris.forEachIndexed { i, uri ->
                val jpeg = reencode(uri) ?: return@forEachIndexed
                out.writeBytes("--$boundary\r\nContent-Disposition: form-data; name=\"files\"; filename=\"bild$i.jpg\"\r\nContent-Type: image/jpeg\r\n\r\n")
                out.write(jpeg)
                out.writeBytes("\r\n")
            }
            out.writeBytes("--$boundary--\r\n")
        }
        val code = conn.responseCode
        val loc = conn.getHeaderField("Location")
        conn.disconnect()
        return if (code == 303) loc else null
    }

    /** JPEG-Neukodierung (max. 2000 px) – entfernt EXIF/GPS-Metadaten. */
    private fun reencode(uri: Uri): ByteArray? = runCatching {
        val src = contentResolver.openInputStream(uri)?.use { BitmapFactory.decodeStream(it) } ?: return null
        val scale = minOf(1f, 2000f / maxOf(src.width, src.height))
        val bmp = if (scale < 1f) Bitmap.createScaledBitmap(src, (src.width * scale).toInt(), (src.height * scale).toInt(), true) else src
        ByteArrayOutputStream().also { bmp.compress(Bitmap.CompressFormat.JPEG, 85, it) }.toByteArray()
    }.getOrNull()

    @Suppress("DEPRECATION")
    private fun parcelableUri(i: Intent): Uri? =
        if (Build.VERSION.SDK_INT >= 33) i.getParcelableExtra(Intent.EXTRA_STREAM, Uri::class.java) else i.getParcelableExtra(Intent.EXTRA_STREAM)

    @Suppress("DEPRECATION")
    private fun parcelableUris(i: Intent): List<Uri> =
        (if (Build.VERSION.SDK_INT >= 33) i.getParcelableArrayListExtra(Intent.EXTRA_STREAM, Uri::class.java) else i.getParcelableArrayListExtra(Intent.EXTRA_STREAM)) ?: emptyList()

    private fun enc(s: String) = URLEncoder.encode(s, "UTF-8")

    @Deprecated("Deprecated in Java")
    override fun onBackPressed() {
        if (web.canGoBack()) web.goBack() else super.onBackPressed()
    }
}
