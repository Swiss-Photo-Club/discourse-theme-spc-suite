// Canvas drawing for the critique workspace's visual notes.
//
// Annotations store coordinates normalised to 0..1 of the image box, so the
// same data renders correctly at any display size - and later, in commit 6,
// at the image's natural size when the notes are composited for posting.
// Every shape is drawn twice: a wide casing stroke in the page background
// colour underneath, the accent colour on top, so notes stay legible on any
// photo regardless of its tones.

export const ANNOTATION_TOOLS = [
  { id: "point", icon: "location-dot", labelKey: "tool_point" },
  { id: "arrow", icon: "arrow-right", labelKey: "tool_arrow" },
  { id: "rect", icon: "vector-square", labelKey: "tool_rect" },
  { id: "path", icon: "pencil", labelKey: "tool_path" },
];

function baseStrokeWidth(width) {
  return Math.max(2, width * 0.004);
}

export function renderAnnotations(ctx, annotations, width, height, colors) {
  ctx.clearRect(0, 0, width, height);
  const line = baseStrokeWidth(width);
  for (const annotation of annotations) {
    drawOnce(ctx, annotation, width, height, colors.casing, line * 2.4);
    drawOnce(ctx, annotation, width, height, colors.accent, line);
  }
}

function drawOnce(ctx, annotation, width, height, stroke, lineWidth) {
  const points = annotation.points;
  if (!points?.length) {
    return;
  }

  ctx.strokeStyle = stroke;
  ctx.fillStyle = stroke;
  ctx.lineWidth = lineWidth;
  ctx.lineJoin = "round";
  ctx.lineCap = "round";

  const p = points.map((pt) => [pt.x * width, pt.y * height]);
  const first = p[0];
  const last = p[p.length - 1];

  switch (annotation.tool) {
    case "point": {
      const radius = Math.max(8, width * 0.014);
      ctx.beginPath();
      ctx.arc(first[0], first[1], radius, 0, Math.PI * 2);
      ctx.stroke();
      ctx.beginPath();
      ctx.arc(first[0], first[1], lineWidth, 0, Math.PI * 2);
      ctx.fill();
      break;
    }
    case "arrow": {
      ctx.beginPath();
      ctx.moveTo(first[0], first[1]);
      ctx.lineTo(last[0], last[1]);
      ctx.stroke();

      const angle = Math.atan2(last[1] - first[1], last[0] - first[0]);
      const size = lineWidth * 4 + 6;
      ctx.beginPath();
      for (const side of [-1, 1]) {
        ctx.moveTo(last[0], last[1]);
        ctx.lineTo(
          last[0] - size * Math.cos(angle + side * 0.45),
          last[1] - size * Math.sin(angle + side * 0.45)
        );
      }
      ctx.stroke();
      break;
    }
    case "rect": {
      ctx.strokeRect(
        Math.min(first[0], last[0]),
        Math.min(first[1], last[1]),
        Math.abs(last[0] - first[0]),
        Math.abs(last[1] - first[1])
      );
      break;
    }
    case "path": {
      ctx.beginPath();
      ctx.moveTo(first[0], first[1]);
      for (const [x, y] of p.slice(1)) {
        ctx.lineTo(x, y);
      }
      ctx.stroke();
      break;
    }
  }
}
