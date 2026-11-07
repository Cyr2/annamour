package fr.dpessin.annamour.tv

import android.view.InputDevice
import android.view.KeyCharacterMap
import android.view.KeyEvent

/**
 * Remote control keys that the page should see as another key.
 *
 * Arrow keys are not listed: the WebView already turns them into `ArrowUp`/`ArrowDown`/`ArrowLeft`/`ArrowRight`.
 */
object RemoteKeys {

    private val remap = mapOf(
        // OK / centre of the D-pad, and the usual "select" buttons of remotes and gamepads -> "Enter".
        KeyEvent.KEYCODE_DPAD_CENTER to KeyEvent.KEYCODE_ENTER,
        KeyEvent.KEYCODE_NUMPAD_ENTER to KeyEvent.KEYCODE_ENTER,
        KeyEvent.KEYCODE_BUTTON_A to KeyEvent.KEYCODE_ENTER,
        KeyEvent.KEYCODE_BUTTON_SELECT to KeyEvent.KEYCODE_ENTER,
        // Media keys -> " " (space), the page toggles play/pause.
        KeyEvent.KEYCODE_MEDIA_PLAY_PAUSE to KeyEvent.KEYCODE_SPACE,
        KeyEvent.KEYCODE_MEDIA_PLAY to KeyEvent.KEYCODE_SPACE,
        KeyEvent.KEYCODE_MEDIA_PAUSE to KeyEvent.KEYCODE_SPACE,
        KeyEvent.KEYCODE_HEADSETHOOK to KeyEvent.KEYCODE_SPACE,
        // Rewind / fast-forward -> same as the D-pad (-10 s / +10 s in the TV player).
        KeyEvent.KEYCODE_MEDIA_REWIND to KeyEvent.KEYCODE_DPAD_LEFT,
        KeyEvent.KEYCODE_MEDIA_FAST_FORWARD to KeyEvent.KEYCODE_DPAD_RIGHT,
    )

    /** The key event the page should receive instead of [event], or null to deliver it unchanged. */
    fun remapped(event: KeyEvent): KeyEvent? {
        val code = remap[event.keyCode] ?: return null
        return synthetic(code, event.action, event.downTime, event.eventTime, event.repeatCount)
    }

    /**
     * A key event the WebView handles like a real keyboard press (trusted `keydown`/`keyup` on the page).
     * The virtual keyboard map guarantees `key` values such as " " even when the remote's map lacks them.
     */
    fun synthetic(
        code: Int,
        action: Int,
        downTime: Long,
        eventTime: Long = downTime,
        repeat: Int = 0,
    ): KeyEvent = KeyEvent(
        downTime,
        eventTime,
        action,
        code,
        repeat,
        0,
        KeyCharacterMap.VIRTUAL_KEYBOARD,
        0,
        KeyEvent.FLAG_FROM_SYSTEM,
        InputDevice.SOURCE_KEYBOARD,
    )
}
