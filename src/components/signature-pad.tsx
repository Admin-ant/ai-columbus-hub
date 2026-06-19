import { useEffect, useRef, useState } from "react";
import { Button } from "@/components/ui/button";
import { Eraser } from "lucide-react";
import { useTranslation } from "react-i18next";

interface Props {
  onChange: (svg: string | null) => void;
  width?: number;
  height?: number;
}

type Point = { x: number; y: number };

export function SignaturePad({ onChange, width = 600, height = 180 }: Props) {
  const { t } = useTranslation();
  const canvasRef = useRef<HTMLCanvasElement | null>(null);
  const [strokes, setStrokes] = useState<Point[][]>([]);
  const drawing = useRef(false);
  const current = useRef<Point[]>([]);

  function redraw() {
    const c = canvasRef.current;
    if (!c) return;
    const ctx = c.getContext("2d");
    if (!ctx) return;
    ctx.clearRect(0, 0, c.width, c.height);
    ctx.strokeStyle = "#0f172a";
    ctx.lineWidth = 2;
    ctx.lineCap = "round";
    ctx.lineJoin = "round";
    const all = [...strokes, current.current];
    all.forEach((s) => {
      if (s.length < 2) return;
      ctx.beginPath();
      ctx.moveTo(s[0].x, s[0].y);
      for (let i = 1; i < s.length; i++) ctx.lineTo(s[i].x, s[i].y);
      ctx.stroke();
    });
  }

  useEffect(redraw, [strokes]);

  function getPoint(e: React.PointerEvent): Point {
    const c = canvasRef.current!;
    const r = c.getBoundingClientRect();
    return { x: ((e.clientX - r.left) * c.width) / r.width, y: ((e.clientY - r.top) * c.height) / r.height };
  }

  function start(e: React.PointerEvent) {
    drawing.current = true;
    current.current = [getPoint(e)];
    (e.target as Element).setPointerCapture(e.pointerId);
  }
  function move(e: React.PointerEvent) {
    if (!drawing.current) return;
    current.current.push(getPoint(e));
    redraw();
  }
  function end() {
    if (!drawing.current) return;
    drawing.current = false;
    if (current.current.length > 1) {
      const next = [...strokes, current.current];
      setStrokes(next);
      onChange(toSvg(next, width, height));
    }
    current.current = [];
  }

  function clear() {
    setStrokes([]);
    current.current = [];
    onChange(null);
  }

  return (
    <div className="space-y-2">
      <div className="rounded-md border bg-white">
        <canvas
          ref={canvasRef}
          width={width}
          height={height}
          className="block h-[180px] w-full touch-none rounded-md"
          onPointerDown={start}
          onPointerMove={move}
          onPointerUp={end}
          onPointerLeave={end}
        />
      </div>
      <div className="flex justify-between text-xs text-muted-foreground">
        <span>{t("accept.sign_hint")}</span>
        <Button type="button" size="sm" variant="ghost" onClick={clear}>
          <Eraser className="mr-1 h-3 w-3" /> {t("accept.clear")}
        </Button>
      </div>
    </div>
  );
}

function toSvg(strokes: Point[][], w: number, h: number): string {
  const paths = strokes
    .filter((s) => s.length > 1)
    .map((s) => {
      const d = s.map((p, i) => `${i === 0 ? "M" : "L"}${p.x.toFixed(1)} ${p.y.toFixed(1)}`).join(" ");
      return `<path d="${d}" fill="none" stroke="#0f172a" stroke-width="2" stroke-linecap="round" stroke-linejoin="round"/>`;
    })
    .join("");
  return `<svg xmlns="http://www.w3.org/2000/svg" viewBox="0 0 ${w} ${h}" width="${w}" height="${h}">${paths}</svg>`;
}
