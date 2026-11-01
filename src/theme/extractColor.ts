// Extract the dominant saturated accent color from an image.
// Samples a 64x64 grid on an off-screen canvas, filters out near-black,
// near-white, and unsaturated pixels, boosts saturation, and returns a hex color.

function rgbToHex(r: number, g: number, b: number): string {
  const clamp = (v: number) => Math.max(0, Math.min(255, Math.round(v)));
  return `#${((1 << 24) + (clamp(r) << 16) + (clamp(g) << 8) + clamp(b)).toString(16).slice(1)}`;
}

export function extractDominantColor(imgSrc: string): Promise<string> {
  return new Promise((resolve) => {
    const img = new Image();
    img.crossOrigin = "anonymous";
    img.onload = () => {
      try {
        const canvas = document.createElement("canvas");
        canvas.width = 64;
        canvas.height = 64;
        const ctx = canvas.getContext("2d");
        if (!ctx) {
          resolve("#e8562a");
          return;
        }
        ctx.drawImage(img, 0, 0, 64, 64);
        const data = ctx.getImageData(0, 0, 64, 64).data;

        let rSum = 0;
        let gSum = 0;
        let bSum = 0;
        let count = 0;

        for (let i = 0; i < data.length; i += 8) {
          const pr = data[i];
          const pg = data[i + 1];
          const pb = data[i + 2];
          const a = data[i + 3];

          if (a < 128) continue;

          // Skip near-black and near-white
          const lum = 0.299 * pr + 0.587 * pg + 0.114 * pb;
          if (lum < 35 || lum > 225) continue;

          // Skip low-saturation greys
          const max = Math.max(pr, pg, pb);
          const min = Math.min(pr, pg, pb);
          if (max - min < 18) continue;

          rSum += pr;
          gSum += pg;
          bSum += pb;
          count++;
        }

        if (count === 0) {
          resolve("#e8562a");
          return;
        }

        let r = rSum / count;
        let g = gSum / count;
        let b = bSum / count;

        // Boost saturation away from the average grey
        const max = Math.max(r, g, b);
        const avg = (r + g + b) / 3;
        const boost = 1.35;
        r = avg + (r - avg) * boost;
        g = avg + (g - avg) * boost;
        b = avg + (b - avg) * boost;

        resolve(rgbToHex(r, g, b));
      } catch {
        resolve("#e8562a");
      }
    };
    img.onerror = () => resolve("#e8562a");
    img.src = imgSrc;
  });
}
