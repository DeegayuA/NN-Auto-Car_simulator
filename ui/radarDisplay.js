class RadarDisplay {
   constructor(canvas, graph, size) {
      this.canvas = canvas;
      this.graph = graph;
      this.size = size;

      canvas.width = size;
      canvas.height = size;
      this.ctx = canvas.getContext("2d");
   }

   update(viewPoint) {
      this.ctx.clearRect(0, 0, this.size, this.size);

      const scaler = 0.05;
      const scaledViewPoint = scalePoint(viewPoint, -scaler);
      this.ctx.save();
      this.ctx.translate(
         scaledViewPoint.x + this.size / 2, 
         scaledViewPoint.y + this.size / 2
      );
      this.ctx.scale(scaler, scaler);
      const radarColor = getThemeColor("--border-sidebar");
      const pingColor = getThemeColor("--neon-magenta");

      for (const seg of this.graph.segments) {
         seg.draw(this.ctx, { width: 3 / scaler, color: radarColor }); 
      }
      this.ctx.restore();
      new GeoPoint(this.size / 2, this.size / 2)
         .draw(this.ctx, { color: pingColor, outline: true });
   }
}
