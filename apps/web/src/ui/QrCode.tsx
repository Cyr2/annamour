import QRCode from "qrcode";
import { useEffect, useRef } from "react";
import { cx } from "./cx.ts";

interface QrCodeProps {
  value: string;
  /** What the code opens, for screen readers. */
  label: string;
  className?: string;
}

/** Reads a colour token as the hex string the QR renderer wants. */
function token(name: string): string {
  return getComputedStyle(document.documentElement).getPropertyValue(name).trim();
}

/** A scannable QR code, night on milk, drawn crisp at any size. */
export function QrCode({ value, label, className }: QrCodeProps) {
  const canvasRef = useRef<HTMLCanvasElement>(null);

  useEffect(() => {
    const canvas = canvasRef.current;
    if (!canvas) return;
    QRCode.toCanvas(canvas, value, {
      margin: 0,
      scale: 1,
      errorCorrectionLevel: "M",
      color: { dark: token("--am-night"), light: token("--am-milk") },
    }).catch(() => {
      // A value too long for a QR code: the link stays available through the copy button.
    });
  }, [value]);

  return (
    <div className={cx("rounded-[18px] bg-palette-milk p-2.5", className)}>
      <canvas ref={canvasRef} role="img" aria-label={label} className="block size-full [image-rendering:pixelated]" />
    </div>
  );
}
