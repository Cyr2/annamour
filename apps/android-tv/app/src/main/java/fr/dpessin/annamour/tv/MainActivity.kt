package fr.dpessin.annamour.tv

import android.annotation.SuppressLint
import android.app.Activity
import android.content.ActivityNotFoundException
import android.content.Intent
import android.content.pm.ApplicationInfo
import android.graphics.Bitmap
import android.graphics.Color
import android.net.ConnectivityManager
import android.net.Network
import android.net.Uri
import android.os.Build
import android.os.Bundle
import android.os.Handler
import android.os.Looper
import android.os.SystemClock
import android.view.KeyEvent
import android.view.View
import android.view.ViewGroup
import android.view.WindowInsets
import android.view.WindowInsetsController
import android.view.WindowManager
import android.webkit.CookieManager
import android.webkit.RenderProcessGoneDetail
import android.webkit.WebChromeClient
import android.webkit.WebResourceError
import android.webkit.WebResourceRequest
import android.webkit.WebResourceResponse
import android.webkit.WebSettings
import android.webkit.WebView
import android.webkit.WebViewClient
import android.widget.Button
import android.widget.FrameLayout

class MainActivity : Activity() {

    private val handler = Handler(Looper.getMainLooper())

    private lateinit var webView: WebView
    private lateinit var splash: View
    private lateinit var fullscreen: FrameLayout
    private lateinit var errorScreen: View
    private lateinit var retryButton: Button

    private var customView: View? = null
    private var customViewCallback: WebChromeClient.CustomViewCallback? = null

    /** Pending fallback for the BACK key, cancelled if the page calls `AnnamourTV.backHandled()` in time. */
    private var backFallback: Runnable? = null

    private var failedUrl: String? = null

    /**
     * The page to open: production, or in a debug build the `url` extra (a local server through
     * `adb reverse`, to measure a version on the TV before it ships).
     */
    private val startUrl: String by lazy {
        intent.getStringExtra(EXTRA_URL)?.takeIf { BuildConfig.DEBUG } ?: START_URL
    }
    private val startHost: String by lazy { Uri.parse(startUrl).host ?: START_HOST }
    private var networkCallback: ConnectivityManager.NetworkCallback? = null

    override fun onCreate(savedInstanceState: Bundle?) {
        super.onCreate(savedInstanceState)
        window.addFlags(WindowManager.LayoutParams.FLAG_KEEP_SCREEN_ON)
        setContentView(R.layout.activity_main)

        webView = findViewById(R.id.web)
        splash = findViewById(R.id.splash)
        fullscreen = findViewById(R.id.fullscreen)
        errorScreen = findViewById(R.id.error)
        retryButton = findViewById(R.id.retry)
        retryButton.setOnClickListener { retry() }

        setUpWebView()
        if (savedInstanceState == null || webView.restoreState(savedInstanceState) == null) {
            webView.loadUrl(startUrl)
        }
        webView.requestFocus()
    }

    @SuppressLint("SetJavaScriptEnabled", "JavascriptInterface")
    private fun setUpWebView() {
        if (applicationInfo.flags and ApplicationInfo.FLAG_DEBUGGABLE != 0) {
            WebView.setWebContentsDebuggingEnabled(true)
        }
        webView.setBackgroundColor(Color.TRANSPARENT)

        with(webView.settings) {
            javaScriptEnabled = true
            domStorageEnabled = true
            mediaPlaybackRequiresUserGesture = false
            mixedContentMode = WebSettings.MIXED_CONTENT_NEVER_ALLOW
            allowFileAccess = false
            allowContentAccess = false
            setSupportZoom(false)
            builtInZoomControls = false
            displayZoomControls = false
            // The TV's font scale would break the 10-foot layout the page computes itself.
            textZoom = 100
            userAgentString = "$userAgentString $USER_AGENT_SUFFIX/${versionName()}"
        }

        CookieManager.getInstance().apply {
            setAcceptCookie(true)
            setAcceptThirdPartyCookies(webView, true)
        }

        webView.addJavascriptInterface(AnnamourTvBridge(::onPageHandledBack), AnnamourTvBridge.NAME)
        webView.webViewClient = Client()
        webView.webChromeClient = ChromeClient()
    }

    @Suppress("DEPRECATION")
    private fun versionName(): String = packageManager.getPackageInfo(packageName, 0).versionName ?: "0"

    // region Remote control

    override fun dispatchKeyEvent(event: KeyEvent): Boolean {
        if (errorScreen.visibility == View.VISIBLE) {
            if (event.keyCode == KeyEvent.KEYCODE_BACK) {
                if (event.action == KeyEvent.ACTION_UP) finish()
                return true
            }
            return super.dispatchKeyEvent(event)
        }

        if (event.keyCode == KeyEvent.KEYCODE_BACK) {
            if (event.action == KeyEvent.ACTION_DOWN && event.repeatCount == 0) onRemoteBack()
            return true
        }

        val remapped = RemoteKeys.remapped(event) ?: return super.dispatchKeyEvent(event)
        pageTarget().dispatchKeyEvent(remapped)
        return true
    }

    /** The view that receives the page's key events: the fullscreen element when there is one. */
    private fun pageTarget(): View = customView ?: webView

    /**
     * BACK contract: send `Escape` to the page and give it [BACK_TIMEOUT_MS] to call `AnnamourTV.backHandled()`.
     * Otherwise leave fullscreen, then go back in history, then quit.
     */
    private fun onRemoteBack() {
        if (backFallback != null) return
        val now = SystemClock.uptimeMillis()
        val target = pageTarget()
        target.dispatchKeyEvent(RemoteKeys.synthetic(KeyEvent.KEYCODE_ESCAPE, KeyEvent.ACTION_DOWN, now))
        target.dispatchKeyEvent(RemoteKeys.synthetic(KeyEvent.KEYCODE_ESCAPE, KeyEvent.ACTION_UP, now))

        val fallback = Runnable {
            backFallback = null
            when {
                customView != null -> exitFullscreen()
                webView.canGoBack() -> webView.goBack()
                else -> finish()
            }
        }
        backFallback = fallback
        handler.postDelayed(fallback, BACK_TIMEOUT_MS)
    }

    /** Called from the JavaBridge thread. */
    private fun onPageHandledBack() {
        handler.post {
            backFallback?.let { handler.removeCallbacks(it) }
            backFallback = null
        }
    }

    // endregion

    // region Error screen

    private fun showError(url: String?) {
        failedUrl = url ?: failedUrl ?: startUrl
        splash.visibility = View.GONE
        errorScreen.visibility = View.VISIBLE
        retryButton.requestFocus()
        retryWhenOnline()
    }

    private fun retry() {
        stopWatchingNetwork()
        errorScreen.visibility = View.GONE
        splash.visibility = View.VISIBLE
        webView.loadUrl(failedUrl ?: startUrl)
        failedUrl = null
        webView.requestFocus()
    }

    /** Reload by itself as soon as the network comes back (Wi-Fi of the projector waking up, for example). */
    private fun retryWhenOnline() {
        if (networkCallback != null) return
        val connectivity = getSystemService(ConnectivityManager::class.java) ?: return
        val callback = object : ConnectivityManager.NetworkCallback() {
            override fun onAvailable(network: Network) {
                handler.postDelayed({ if (errorScreen.visibility == View.VISIBLE) retry() }, 1_000)
            }
        }
        runCatching { connectivity.registerDefaultNetworkCallback(callback) }
            .onSuccess { networkCallback = callback }
    }

    private fun stopWatchingNetwork() {
        val callback = networkCallback ?: return
        networkCallback = null
        runCatching { getSystemService(ConnectivityManager::class.java)?.unregisterNetworkCallback(callback) }
    }

    // endregion

    // region Fullscreen

    private fun exitFullscreen() {
        customViewCallback?.onCustomViewHidden()
        hideCustomView()
    }

    private fun hideCustomView() {
        customView ?: return
        fullscreen.removeAllViews()
        fullscreen.visibility = View.GONE
        customView = null
        customViewCallback = null
        webView.requestFocus()
    }

    private fun hideSystemBars() {
        if (Build.VERSION.SDK_INT >= Build.VERSION_CODES.R) {
            window.insetsController?.let {
                it.hide(WindowInsets.Type.systemBars())
                it.systemBarsBehavior = WindowInsetsController.BEHAVIOR_SHOW_TRANSIENT_BARS_BY_SWIPE
            }
        } else {
            @Suppress("DEPRECATION")
            window.decorView.systemUiVisibility = (
                View.SYSTEM_UI_FLAG_IMMERSIVE_STICKY or
                    View.SYSTEM_UI_FLAG_FULLSCREEN or
                    View.SYSTEM_UI_FLAG_HIDE_NAVIGATION or
                    View.SYSTEM_UI_FLAG_LAYOUT_STABLE or
                    View.SYSTEM_UI_FLAG_LAYOUT_FULLSCREEN or
                    View.SYSTEM_UI_FLAG_LAYOUT_HIDE_NAVIGATION
                )
        }
    }

    // endregion

    // region Lifecycle

    override fun onWindowFocusChanged(hasFocus: Boolean) {
        super.onWindowFocusChanged(hasFocus)
        if (hasFocus) hideSystemBars()
    }

    override fun onResume() {
        super.onResume()
        if (!webViewDestroyed) webView.onResume()
    }

    override fun onPause() {
        if (!webViewDestroyed) webView.onPause()
        CookieManager.getInstance().flush()
        super.onPause()
    }

    override fun onSaveInstanceState(outState: Bundle) {
        super.onSaveInstanceState(outState)
        if (!webViewDestroyed) webView.saveState(outState)
    }

    override fun onDestroy() {
        stopWatchingNetwork()
        handler.removeCallbacksAndMessages(null)
        destroyWebView()
        super.onDestroy()
    }

    private var webViewDestroyed = false

    private fun destroyWebView() {
        if (webViewDestroyed) return
        webViewDestroyed = true
        (webView.parent as? ViewGroup)?.removeView(webView)
        webView.destroy()
    }

    // endregion

    private inner class Client : WebViewClient() {

        override fun shouldOverrideUrlLoading(view: WebView, request: WebResourceRequest): Boolean {
            if (request.url.host == startHost) return false
            // Other sites open outside the app, if the TV has something to open them with.
            try {
                startActivity(Intent(Intent.ACTION_VIEW, request.url))
            } catch (_: ActivityNotFoundException) {
                // Nothing to open it with: stay on Annamour.
            }
            return true
        }

        override fun onPageCommitVisible(view: WebView, url: String?) {
            splash.visibility = View.GONE
        }

        override fun onPageFinished(view: WebView, url: String?) {
            if (errorScreen.visibility != View.VISIBLE) splash.visibility = View.GONE
        }

        override fun onReceivedError(view: WebView, request: WebResourceRequest, error: WebResourceError) {
            if (request.isForMainFrame) showError(request.url.toString())
        }

        override fun onReceivedHttpError(view: WebView, request: WebResourceRequest, response: WebResourceResponse) {
            // 5xx on the page itself: the server is down or redeploying.
            if (request.isForMainFrame && response.statusCode >= 500) showError(request.url.toString())
        }

        override fun onRenderProcessGone(view: WebView, detail: RenderProcessGoneDetail): Boolean {
            // The page's renderer crashed or was killed for memory: start over with a fresh WebView.
            destroyWebView()
            recreate()
            return true
        }
    }

    private inner class ChromeClient : WebChromeClient() {

        override fun onShowCustomView(view: View, callback: CustomViewCallback) {
            if (customView != null) {
                callback.onCustomViewHidden()
                return
            }
            customView = view
            customViewCallback = callback
            fullscreen.addView(
                view,
                FrameLayout.LayoutParams(ViewGroup.LayoutParams.MATCH_PARENT, ViewGroup.LayoutParams.MATCH_PARENT),
            )
            fullscreen.visibility = View.VISIBLE
            view.isFocusable = true
            view.requestFocus()
        }

        override fun onHideCustomView() = hideCustomView()

        /** No grey "play" placeholder over videos without a poster. */
        override fun getDefaultVideoPoster(): Bitmap = Bitmap.createBitmap(1, 1, Bitmap.Config.ARGB_8888)
    }

    companion object {
        const val START_HOST = "annamour.dpessin.fr"
        const val START_URL = "https://$START_HOST/?tv=1"
        const val EXTRA_URL = "url"
        const val USER_AGENT_SUFFIX = "AnnamourTV"
        const val BACK_TIMEOUT_MS = 200L
    }
}
