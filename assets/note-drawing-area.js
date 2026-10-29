// Coordinates stay in canvas pixels, independently of zoom and touch input.
export function drawingRect(start, end, width, height) {
  const x = Math.max(0, Math.min(width, Math.floor(Math.min(start.x, end.x))));
  const y = Math.max(0, Math.min(height, Math.floor(Math.min(start.y, end.y))));
  const right = Math.max(x, Math.min(width, Math.ceil(Math.max(start.x, end.x))));
  const bottom = Math.max(y, Math.min(height, Math.ceil(Math.max(start.y, end.y))));
  return {x, y, width: right - x, height: bottom - y};
}

export function containsDrawingPoint(rect, point) {
  return !!rect && point.x >= rect.x && point.x <= rect.x + rect.width
    && point.y >= rect.y && point.y <= rect.y + rect.height;
}

export function drawingSize(value) {
  return Number.isInteger(value) && value >= 1 && value <= 4096 ? value : null;
}
