/**
 * Kotlin Android Project & Source Generator Service (lib/services/kotlinSourceGeneratorService.js)
 * Generates standard AndroidManifest.xml, strings.xml, and native Kotlin Activity/WebViewClient source files.
 */

import fs from 'node:fs/promises';
import path from 'node:path';
import { AD_BLOCK_HOSTS } from '../ads/adBlockRulesService.js';

function escapeXml(str) {
  return String(str || '')
    .replace(/&/g, '&amp;')
    .replace(/</g, '&lt;')
    .replace(/>/g, '&gt;')
    .replace(/"/g, '&quot;')
    .replace(/'/g, '&apos;');
}

function escapeKotlinString(str) {
  return String(str || '')
    .replace(/\\/g, '\\\\')
    .replace(/"/g, '\\"')
    .replace(/\$/g, '\\$')
    .replace(/\n/g, '\\n')
    .replace(/\r/g, '');
}

function buildManifestXml({ packageName, fullScreen }) {
  const theme = fullScreen
    ? '@android:style/Theme.DeviceDefault.NoActionBar.Fullscreen'
    : '@android:style/Theme.DeviceDefault.NoActionBar';

  return `<?xml version="1.0" encoding="utf-8"?>
<manifest xmlns:android="http://schemas.android.com/apk/res/android"
    package="${escapeXml(packageName)}"
    android:versionCode="1"
    android:versionName="1.0">

    <uses-sdk
        android:minSdkVersion="21"
        android:targetSdkVersion="34" />

    <uses-permission android:name="android.permission.INTERNET" />
    <uses-permission android:name="android.permission.ACCESS_NETWORK_STATE" />

    <application
        android:allowBackup="true"
        android:icon="@drawable/icon"
        android:label="@string/app_name"
        android:theme="${theme}"
        android:usesCleartextTraffic="true">

        <activity
            android:name=".MainActivity"
            android:configChanges="orientation|screenSize|keyboardHidden"
            android:exported="true"
            android:label="@string/app_name">
            <intent-filter>
                <action android:name="android.intent.action.MAIN" />
                <category android:name="android.intent.category.LAUNCHER" />
            </intent-filter>
        </activity>

    </application>
</manifest>
`;
}

function buildStringsXml(appName) {
  return `<?xml version="1.0" encoding="utf-8"?>
<resources>
    <string name="app_name">${escapeXml(appName)}</string>
</resources>
`;
}

function buildAppWebViewClientKt({
  packageName,
  targetHost,
  switches
}) {
  const hostLiteral = escapeKotlinString(String(targetHost || '').toLowerCase().replace(/^www\./, ''));
  const adHostsList = AD_BLOCK_HOSTS.map((h) => `"${escapeKotlinString(h)}"`).join(',\n        ');

  return `package ${packageName}

import android.content.Intent
import android.net.Uri
import android.os.Build
import android.webkit.WebResourceError
import android.webkit.WebResourceRequest
import android.webkit.WebResourceResponse
import android.webkit.WebView
import android.webkit.WebViewClient
import java.io.ByteArrayInputStream

class AppWebViewClient(
    private val runtimeJs: String
) : WebViewClient() {

    private val targetHost: String = "${hostLiteral}"
    private val adBlockerEnabled: Boolean = ${Boolean(switches.adBlocker)}
    private val redirectBlockerEnabled: Boolean = ${Boolean(switches.redirectBlocker)}
    private val offlineScreenEnabled: Boolean = ${Boolean(switches.offlineScreen)}

    private val adDomains: List<String> = listOf(
        ${adHostsList}
    )

    private fun isAdHost(host: String): Boolean {
        val clean = host.lowercase()
        for (ad in adDomains) {
            if (clean == ad || clean.endsWith(".$ad")) {
                return true
            }
        }
        return false
    }

    private fun isSameSite(host: String): Boolean {
        if (targetHost.isEmpty()) return true
        val clean = host.lowercase().removePrefix("www.")
        return clean == targetHost || clean.endsWith(".$targetHost")
    }

    private fun handleNavigation(view: WebView?, url: String): Boolean {
        if (url.startsWith("file:///android_asset/")) {
            return false
        }
        val uri = try {
            Uri.parse(url)
        } catch (_: Exception) {
            return false
        }
        val scheme = uri.scheme?.lowercase() ?: ""
        if (scheme != "http" && scheme != "https") {
            try {
                view?.context?.startActivity(Intent(Intent.ACTION_VIEW, uri))
            } catch (_: Exception) {
            }
            return true
        }
        val host = uri.host ?: ""
        if (adBlockerEnabled && host.isNotEmpty() && isAdHost(host)) {
            return true
        }
        if (redirectBlockerEnabled && host.isNotEmpty() && !isSameSite(host)) {
            return true
        }
        return false
    }

    override fun shouldInterceptRequest(
        view: WebView?,
        request: WebResourceRequest?
    ): WebResourceResponse? {
        if (adBlockerEnabled && request != null) {
            val host = request.url?.host ?: ""
            if (host.isNotEmpty() && isAdHost(host)) {
                return WebResourceResponse("text/plain", "utf-8", ByteArrayInputStream(ByteArray(0)))
            }
        }
        return super.shouldInterceptRequest(view, request)
    }

    override fun shouldOverrideUrlLoading(view: WebView?, request: WebResourceRequest?): Boolean {
        val url = request?.url?.toString() ?: return false
        return handleNavigation(view, url)
    }

    @Suppress("DEPRECATION")
    override fun shouldOverrideUrlLoading(view: WebView?, url: String?): Boolean {
        return handleNavigation(view, url ?: "")
    }

    override fun onPageFinished(view: WebView?, url: String?) {
        super.onPageFinished(view, url)
        if (url != null && !url.startsWith("file:///android_asset/") && runtimeJs.isNotEmpty()) {
            view?.evaluateJavascript(runtimeJs, null)
        }
    }

    override fun onReceivedError(
        view: WebView?,
        request: WebResourceRequest?,
        error: WebResourceError?
    ) {
        if (offlineScreenEnabled && request?.isForMainFrame == true) {
            view?.loadUrl("file:///android_asset/offline.html")
        } else {
            super.onReceivedError(view, request, error)
        }
    }

    @Suppress("DEPRECATION")
    override fun onReceivedError(
        view: WebView?,
        errorCode: Int,
        description: String?,
        failingUrl: String?
    ) {
        if (offlineScreenEnabled && Build.VERSION.SDK_INT < Build.VERSION_CODES.M) {
            view?.loadUrl("file:///android_asset/offline.html")
        } else {
            super.onReceivedError(view, errorCode, description, failingUrl)
        }
    }
}
`;
}

function buildMainActivityKt({
  packageName,
  targetUrl,
  themeColor,
  switches
}) {
  const safeUrl = escapeKotlinString(targetUrl);
  const safeColor = /^#[0-9a-f]{6}$/i.test(themeColor || '') ? themeColor : '#2563EB';
  const useWide = Boolean(switches.responsiveFit || switches.desktopMode);
  const fileSupport = Boolean(switches.fileSupport);
  const desktopMode = Boolean(switches.desktopMode);
  const fullScreen = Boolean(switches.fullScreen);

  return `package ${packageName}

import android.annotation.SuppressLint
import android.app.Activity
import android.app.DownloadManager
import android.content.Context
import android.content.Intent
import android.graphics.Color
import android.net.Uri
import android.os.Build
import android.os.Bundle
import android.os.Environment
import android.view.View
import android.view.WindowManager
import android.webkit.DownloadListener
import android.webkit.URLUtil
import android.webkit.ValueCallback
import android.webkit.WebChromeClient
import android.webkit.WebSettings
import android.webkit.WebView

class MainActivity : Activity() {

    private lateinit var webView: WebView
    private var filePathCallback: ValueCallback<Array<Uri>>? = null
    private val fileChooserRequestCode = 1001

    private fun readAssetText(assetName: String): String {
        return try {
            assets.open(assetName).bufferedReader().use { it.readText() }
        } catch (_: Exception) {
            ""
        }
    }

    @SuppressLint("SetJavaScriptEnabled")
    override fun onCreate(savedInstanceState: Bundle?) {
        super.onCreate(savedInstanceState)

        if (${fullScreen}) {
            @Suppress("DEPRECATION")
            window.setFlags(
                WindowManager.LayoutParams.FLAG_FULLSCREEN,
                WindowManager.LayoutParams.FLAG_FULLSCREEN
            )
            @Suppress("DEPRECATION")
            window.decorView.systemUiVisibility = (
                View.SYSTEM_UI_FLAG_FULLSCREEN
                    or View.SYSTEM_UI_FLAG_HIDE_NAVIGATION
                    or View.SYSTEM_UI_FLAG_IMMERSIVE_STICKY
            )
        } else if (Build.VERSION.SDK_INT >= Build.VERSION_CODES.LOLLIPOP) {
            window.statusBarColor = Color.parseColor("${safeColor}")
        }

        webView = WebView(this)
        val settings: WebSettings = webView.settings
        settings.javaScriptEnabled = true
        settings.domStorageEnabled = true
        settings.databaseEnabled = true
        settings.setSupportZoom(true)
        settings.builtInZoomControls = true
        settings.displayZoomControls = false
        settings.useWideViewPort = ${useWide}
        settings.loadWithOverviewMode = ${useWide}
        settings.allowFileAccess = ${fileSupport}
        settings.allowContentAccess = ${fileSupport}
        settings.mixedContentMode = WebSettings.MIXED_CONTENT_COMPATIBILITY_MODE

        if (${desktopMode}) {
            settings.userAgentString =
                "Mozilla/5.0 (X11; Linux x86_64) AppleWebKit/537.36 (KHTML, like Gecko) Chrome/125.0.0.0 Safari/537.36"
        }

        val runtimeJs = readAssetText("runtime_inject.js")
        webView.webViewClient = AppWebViewClient(runtimeJs)

        webView.webChromeClient = object : WebChromeClient() {
            override fun onShowFileChooser(
                webView: WebView?,
                filePathCallback: ValueCallback<Array<Uri>>?,
                fileChooserParams: FileChooserParams?
            ): Boolean {
                if (!${fileSupport}) return false
                this@MainActivity.filePathCallback?.onReceiveValue(null)
                this@MainActivity.filePathCallback = filePathCallback
                return try {
                    val intent = fileChooserParams?.createIntent() ?: Intent(Intent.ACTION_GET_CONTENT).apply {
                        addCategory(Intent.CATEGORY_OPENABLE)
                        type = "*/*"
                    }
                    @Suppress("DEPRECATION")
                    startActivityForResult(intent, fileChooserRequestCode)
                    true
                } catch (_: Exception) {
                    this@MainActivity.filePathCallback = null
                    false
                }
            }
        }

        if (${fileSupport}) {
            webView.setDownloadListener(DownloadListener { url, _, contentDisposition, mimeType, _ ->
                try {
                    val request = DownloadManager.Request(Uri.parse(url))
                    val fileName = URLUtil.guessFileName(url, contentDisposition, mimeType)
                    request.setMimeType(mimeType)
                    request.setTitle(fileName)
                    request.setNotificationVisibility(
                        DownloadManager.Request.VISIBILITY_VISIBLE_NOTIFY_COMPLETED
                    )
                    request.setDestinationInExternalPublicDir(Environment.DIRECTORY_DOWNLOADS, fileName)
                    val dm = getSystemService(Context.DOWNLOAD_SERVICE) as DownloadManager
                    dm.enqueue(request)
                } catch (_: Exception) {
                    try {
                        startActivity(Intent(Intent.ACTION_VIEW, Uri.parse(url)))
                    } catch (_: Exception) {
                    }
                }
            })
        }

        setContentView(webView)
        webView.loadUrl("${safeUrl}")
    }

    @Suppress("DEPRECATION")
    override fun onActivityResult(requestCode: Int, resultCode: Int, data: Intent?) {
        if (requestCode == fileChooserRequestCode) {
            val results = WebChromeClient.FileChooserParams.parseResult(resultCode, data)
            filePathCallback?.onReceiveValue(results)
            filePathCallback = null
            return
        }
        super.onActivityResult(requestCode, resultCode, data)
    }

    @Suppress("DEPRECATION")
    override fun onBackPressed() {
        if (::webView.isInitialized && webView.canGoBack()) {
            webView.goBack()
        } else {
            super.onBackPressed()
        }
    }
}
`;
}

export async function generateKotlinAndroidProject({
  projectDir,
  packageName,
  appName,
  targetUrl,
  targetHost,
  themeColor,
  iconPngBuf,
  offlineHtml,
  runtimeJs,
  appConfigJson,
  switches
}) {
  const pkgDirs = String(packageName).split('.');
  const srcPkgDir = path.join(projectDir, 'src', ...pkgDirs);
  const resValuesDir = path.join(projectDir, 'res', 'values');
  const resDrawableDir = path.join(projectDir, 'res', 'drawable');
  const assetsDir = path.join(projectDir, 'assets');

  await Promise.all([
    fs.mkdir(srcPkgDir, { recursive: true }),
    fs.mkdir(resValuesDir, { recursive: true }),
    fs.mkdir(resDrawableDir, { recursive: true }),
    fs.mkdir(assetsDir, { recursive: true })
  ]);

  await Promise.all([
    fs.writeFile(
      path.join(projectDir, 'AndroidManifest.xml'),
      buildManifestXml({ packageName, fullScreen: switches.fullScreen }),
      'utf8'
    ),
    fs.writeFile(path.join(resValuesDir, 'strings.xml'), buildStringsXml(appName), 'utf8'),
    fs.writeFile(path.join(resDrawableDir, 'icon.png'), iconPngBuf),
    fs.writeFile(path.join(assetsDir, 'offline.html'), offlineHtml, 'utf8'),
    fs.writeFile(path.join(assetsDir, 'runtime_inject.js'), runtimeJs, 'utf8'),
    fs.writeFile(path.join(assetsDir, 'app_config.json'), appConfigJson, 'utf8'),
    fs.writeFile(
      path.join(srcPkgDir, 'AppWebViewClient.kt'),
      buildAppWebViewClientKt({ packageName, targetHost, switches }),
      'utf8'
    ),
    fs.writeFile(
      path.join(srcPkgDir, 'MainActivity.kt'),
      buildMainActivityKt({ packageName, targetUrl, themeColor, switches }),
      'utf8'
    )
  ]);
}
