class WayPoint {
   constructor(center, directionVector, width, height) {
      this.center = center;
      this.directionVector = directionVector;
      this.width = width;
      this.height = height;

      this.support = new LineSegment(
         translatePoint(center, getAngle(directionVector), height / 2),
         translatePoint(center, getAngle(directionVector), -height / 2)
      );
      this.poly = new GeoEnvelope(this.support, width, 0).poly;

      this.type = "marking";
   }

   static load(info) {
      const point = new GeoPoint(info.center.x, info.center.y);
      const dir = new GeoPoint(info.directionVector.x, info.directionVector.y);
      switch (info.type) {
         case "crossing":
            return new ZebraCrossing(point, dir, info.width, info.height);
         case "light":
            return new TrafficLight(point, dir, info.width, info.height);
         case "marking":
            return new WayPoint(point, dir, info.width, info.height);
         case "parking":
            return new ParkingNode(point, dir, info.width, info.height);
         case "start":
            return new StartNode(point, dir, info.width, info.height);
         case "stop":
            return new HaltNode(point, dir, info.width, info.height);
         case "target":
            return new TargetNode(point, dir, info.width, info.height);
         case "yield":
            return new YieldNode(point, dir, info.width, info.height);
      }
   }

   draw(ctx) {
      this.poly.draw(ctx);
   }
}

class HaltNode extends WayPoint {
   constructor(center, directionVector, width, height) {
      super(center, directionVector, width, height);

      this.border = this.poly.segments[2];
      this.type = "stop";
   }

   draw(ctx) {
      this.border.draw(ctx, { width: 5, color: "#ff00aa" });
      ctx.save();
      ctx.translate(this.center.x, this.center.y);
      ctx.rotate(getAngle(this.directionVector) - Math.PI / 2);
      ctx.scale(1, 3);

      ctx.beginPath();
      ctx.textBaseline = "middle";
      ctx.textAlign = "center";
      ctx.fillStyle = "#ff00aa";
      ctx.font = "bold " + this.height * 0.3 + "px Arial";
      ctx.fillText("HALT", 0, 1);

      ctx.restore();
   }
}

class StartNode extends WayPoint {
   constructor(center, directionVector, width, height) {
      super(center, directionVector, width, height);

      this.img = new Image();
      this.img.src = "assets/vehicleSprite.png";
      this.type = "start";
   }

   draw(ctx) {
      ctx.save();
      ctx.translate(this.center.x, this.center.y);
      ctx.rotate(getAngle(this.directionVector) - Math.PI / 2);
      
      ctx.drawImage(this.img, -this.img.width / 2, -this.img.height / 2);

      ctx.restore();
   }
}

class ZebraCrossing extends WayPoint {
   constructor(center, directionVector, width, height) {
      super(center, directionVector, width, height);

      this.borders = [this.poly.segments[0], this.poly.segments[2]];
      this.type = "crossing";
   }

   draw(ctx) {
      const perp = getPerpendicular(this.directionVector);
      const line = new LineSegment(
         addPoints(this.center, scalePoint(perp, this.width / 2)),
         addPoints(this.center, scalePoint(perp, -this.width / 2))
      );
      line.draw(ctx, {
         width: this.height,
         color: "rgba(0, 255, 213, 0.5)",
         dash: [11, 11]
      });
   }
}

class ParkingNode extends WayPoint {
   constructor(center, directionVector, width, height) {
      super(center, directionVector, width, height);

      this.borders = [this.poly.segments[0], this.poly.segments[2]];
      this.type = "parking";
   }

   draw(ctx) {
      for (const border of this.borders) {
         border.draw(ctx, { width: 5, color: "#00ffd5" });
      }
      ctx.save();
      ctx.translate(this.center.x, this.center.y);
      ctx.rotate(getAngle(this.directionVector));

      ctx.beginPath();
      ctx.textBaseline = "middle";
      ctx.textAlign = "center";
      ctx.fillStyle = "#00ffd5";
      ctx.font = "bold " + this.height * 0.9 + "px Arial";
      ctx.fillText("P", 0, 3);

      ctx.restore();
   }
}

class TrafficLight extends WayPoint {
   constructor(center, directionVector, width, height) {
      super(center, directionVector, width, 18);

      this.state = "off";
      this.border = this.poly.segments[0];
      this.type = "light";
   }

   draw(ctx) {
      const perp = getPerpendicular(this.directionVector);
      const line = new LineSegment(
         addPoints(this.center, scalePoint(perp, this.width / 2)),
         addPoints(this.center, scalePoint(perp, -this.width / 2))
      );

      const green = lerp2DPoints(line.p1, line.p2, 0.2);
      const yellow = lerp2DPoints(line.p1, line.p2, 0.5);
      const red = lerp2DPoints(line.p1, line.p2, 0.8);

      new LineSegment(red, green).draw(ctx, {
         width: this.height,
         cap: "round",
         color: "#222"
      });

      green.draw(ctx, { size: this.height * 0.6, color: "#060" });
      yellow.draw(ctx, { size: this.height * 0.6, color: "#660" });
      red.draw(ctx, { size: this.height * 0.6, color: "#600" });

      switch (this.state) {
         case "green":
            green.draw(ctx, { size: this.height * 0.6, color: "#0F0" });
            break;
         case "yellow":
            yellow.draw(ctx, { size: this.height * 0.6, color: "#FF0" });
            break;
         case "red":
            red.draw(ctx, { size: this.height * 0.6, color: "#F00" });
            break;
      }
   }
}

class TargetNode extends WayPoint {
   constructor(center, directionVector, width, height) {
      super(center, directionVector, width, height);
      this.type = "target";
   }

   draw(ctx) {
      this.center.draw(ctx, { color: "#ff00aa", size: 30 });
      this.center.draw(ctx, { color: "#0a0b10", size: 20 });
      this.center.draw(ctx, { color: "#00ffd5", size: 10 });
   }
}

class YieldNode extends WayPoint {
   constructor(center, directionVector, width, height) {
      super(center, directionVector, width, height);

      this.border = this.poly.segments[2];
      this.type = "yield";
   }

   draw(ctx) {
      this.border.draw(ctx, { width: 5, color: "#ffea00" });
      ctx.save();
      ctx.translate(this.center.x, this.center.y);
      ctx.rotate(getAngle(this.directionVector) - Math.PI / 2);
      ctx.scale(1, 3);

      ctx.beginPath();
      ctx.textBaseline = "middle";
      ctx.textAlign = "center";
      ctx.fillStyle = "#ffea00";
      ctx.font = "bold " + this.height * 0.3 + "px Arial";
      ctx.fillText("YIELD", 0, 1);

      ctx.restore();
   }
}
