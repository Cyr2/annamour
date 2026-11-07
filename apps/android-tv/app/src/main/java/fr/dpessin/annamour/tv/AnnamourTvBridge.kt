package fr.dpessin.annamour.tv

import android.webkit.JavascriptInterface

/**
 * Exposed to the page as `window.AnnamourTV` (see README.md, "Contrat avec la page").
 *
 * Methods run on a WebView background thread: callbacks must hop back to the main thread.
 */
class AnnamourTvBridge(private val onBackHandled: () -> Unit) {

    /** The page consumed the `Escape` sent for the remote's BACK key: the app must do nothing more. */
    @JavascriptInterface
    fun backHandled() = onBackHandled()

    /** Lets the page detect the Android TV app, besides the `?tv=1` parameter. */
    @JavascriptInterface
    fun isTv(): Boolean = true

    companion object {
        const val NAME = "AnnamourTV"
    }
}
