class RadarDisplay {
   constructor(canvas, graph, width, height) {
      this.canvas = canvas;
      this.graph = graph;
      this.width = width;
      this.height = height;

      this.canvas.width = width;
      this.canvas.height = height;
      this.ctx = this.canvas.getContext("2d");
   }

   resize(newWidth, newHeight) {
      this.width = newWidth;
      this.height = newHeight;
      this.canvas.width = newWidth;
      this.canvas.height = newHeight;
   }

   update(viewPoint, swarm = []) {
      this.ctx.clearRect(0, 0, this.width, this.height);

      const scaler = 0.05;
      const scaledViewPoint = scalePoint(viewPoint, -scaler);
      
      this.ctx.save();
      this.ctx.translate(
         scaledViewPoint.x + this.width / 2, 
         scaledViewPoint.y + this.height / 2
      );
      this.ctx.scale(scaler, scaler);
      
      // Using specific radar-line variable for better contrast in light mode
      const radarColor = getThemeColor("--radar-line");
      const swarmColor = "rgba(0, 255, 213, 0.4)";
      const pingColor = getThemeColor("--neon-magenta");

      this.ctx.beginPath();
      for (const seg of this.graph.segments) {
         this.ctx.moveTo(seg.p1.x, seg.p1.y);
         this.ctx.lineTo(seg.p2.x, seg.p2.y);
      }
      this.ctx.strokeStyle = radarColor;
      this.ctx.lineWidth = 4 / scaler;
      this.ctx.stroke();

      this.ctx.fillStyle = swarmColor;
      for (const car of swarm) {
         if (!car.damaged) {
            this.ctx.beginPath();
            this.ctx.arc(car.center.x, car.center.y, 12 / scaler, 0, Math.PI * 2);
            this.ctx.fill();
         }
      }

      this.ctx.restore();

      new GeoPoint(this.width / 2, this.height / 2)
         .draw(this.ctx, { color: pingColor, outline: true, size: 14 });
         
      this.#drawScanline();
   }

   #drawScanline() {
      this.ctx.save();
      this.ctx.strokeStyle = "rgba(0, 255, 213, 0.03)";
      this.ctx.lineWidth = 1;
      this.ctx.beginPath();
      for (let i = 0; i < this.height; i += 6) {
         this.ctx.moveTo(0, i);
         this.ctx.lineTo(this.width, i);
      }
      this.ctx.stroke();
      this.ctx.restore();
   }
}
