class GeoPoint {
   constructor(x, y) {
      this.x = x;
      this.y = y;
   }

   equals(point) {
      return this.x == point.x && this.y == point.y;
   }

   draw(ctx, { size = 18, color = "black", outline = false, fill = false } = {}) {
      const rad = size / 2;
      ctx.beginPath();
      ctx.fillStyle = color;
      ctx.arc(this.x, this.y, rad, 0, Math.PI * 2);
      ctx.fill();
      if (outline) {
         ctx.beginPath();
         ctx.lineWidth = 2;
         ctx.strokeStyle = "#00ffd5"; // neon cyan
         ctx.arc(this.x, this.y, rad * 0.6, 0, Math.PI * 2);
         ctx.stroke();
      }
      if (fill) {
         ctx.beginPath();
         ctx.arc(this.x, this.y, rad * 0.4, 0, Math.PI * 2);
         ctx.fillStyle = "#ff00aa"; // neon pink
         ctx.fill();
      }
   }
}

class LineSegment {
   constructor(p1, p2, oneWay = false) {
      this.p1 = p1;
      this.p2 = p2;
      this.oneWay = oneWay;
   }

   length() {
      return calcDist(this.p1, this.p2);
   }

   directionVector() {
      return normalizeVector(subPoints(this.p2, this.p1));
   }

   equals(seg) {
      return this.includes(seg.p1) && this.includes(seg.p2);
   }

   includes(point) {
      return this.p1.equals(point) || this.p2.equals(point);
   }

   distanceToGeoPoint(point) {
      const proj = this.projectPoint(point);
      if (proj.offset > 0 && proj.offset < 1) {
         return calcDist(point, proj.point);
      }
      const distToP1 = calcDist(point, this.p1);
      const distToP2 = calcDist(point, this.p2);
      return Math.min(distToP1, distToP2);
   }

   projectPoint(point) {
      const a = subPoints(point, this.p1);
      const b = subPoints(this.p2, this.p1);
      const normB = normalizeVector(b);
      const scaler = dotProduct(a, normB);
      const proj = {
         point: addPoints(this.p1, scalePoint(normB, scaler)),
         offset: scaler / calcMagnitude(b),
      };
      return proj;
   }

   draw(ctx, { width = 2, color = "rgba(0, 255, 213, 0.8)", dash = [], cap = "butt" } = {}) {
      ctx.beginPath();
      ctx.lineWidth = width;
      ctx.strokeStyle = color;
      ctx.lineCap = cap;
      if (this.oneWay) {
         dash = [4, 4];
      }
      ctx.setLineDash(dash);
      ctx.moveTo(this.p1.x, this.p1.y);
      ctx.lineTo(this.p2.x, this.p2.y);
      ctx.stroke();
      ctx.setLineDash([]);
   }
}

class GeoPolygon {
   constructor(points) {
      this.points = points;
      this.segments = [];
      for (let i = 1; i <= points.length; i++) {
         this.segments.push(
            new LineSegment(points[i - 1], points[i % points.length])
         );
      }
   }

   static load(info) {
      return new GeoPolygon(
         info.points.map((i) => new GeoPoint(i.x, i.y))
      );
   }

   static union(polys) {
      GeoPolygon.multiBreak(polys);
      const keptSegments = [];
      for (let i = 0; i < polys.length; i++) {
         for (const seg of polys[i].segments) {
            let keep = true;
            for (let j = 0; j < polys.length; j++) {
               if (i != j) {
                  if (polys[j].containsSegment(seg)) {
                     keep = false;
                     break;
                  }
               }
            }
            if (keep) {
               keptSegments.push(seg);
            }
         }
      }
      return keptSegments;
   }

   static multiBreak(polys) {
      for (let i = 0; i < polys.length - 1; i++) {
         for (let j = i + 1; j < polys.length; j++) {
            GeoPolygon.break(polys[i], polys[j]);
         }
      }
   }

   static break(poly1, poly2) {
      const segs1 = poly1.segments;
      const segs2 = poly2.segments;
      for (let i = 0; i < segs1.length; i++) {
         for (let j = 0; j < segs2.length; j++) {
            const int = calculateIntersection(
               segs1[i].p1,
               segs1[i].p2,
               segs2[j].p1,
               segs2[j].p2
            );

            if (int && int.offset != 1 && int.offset != 0) {
               const point = new GeoPoint(int.x, int.y);
               let aux = segs1[i].p2;
               segs1[i].p2 = point;
               segs1.splice(i + 1, 0, new LineSegment(point, aux));
               aux = segs2[j].p2;
               segs2[j].p2 = point;
               segs2.splice(j + 1, 0, new LineSegment(point, aux));
            }
         }
      }
   }

   distanceToGeoPoint(point) {
      return Math.min(...this.segments.map((s) => s.distanceToGeoPoint(point)));
   }

   distanceToPoly(poly) {
      return Math.min(...this.points.map((p) => poly.distanceToGeoPoint(p)));
   }

   intersectsPoly(poly) {
      for (let s1 of this.segments) {
         for (let s2 of poly.segments) {
            if (calculateIntersection(s1.p1, s1.p2, s2.p1, s2.p2)) {
               return true;
            }
         }
      }
      return false;
   }

   containsSegment(seg) {
      const midpoint = calcAvg(seg.p1, seg.p2);
      return this.containsPoint(midpoint);
   }

   containsPoint(point) {
      const outerPoint = new GeoPoint(-1000, -1000);
      let intersectionCount = 0;
      for (const seg of this.segments) {
         const int = calculateIntersection(outerPoint, point, seg.p1, seg.p2);
         if(int){
            intersectionCount++;
         }
      }
      return intersectionCount % 2 == 1;
   }

   drawSegments(ctx) {
      for (const seg of this.segments) {
         seg.draw(ctx, { color: generateRandomColorTheme(), width: 5 });
      }
   }

   draw(ctx, { stroke, lineWidth = 2, fill, join = "miter" } = {}) {
      if (!this.points || this.points.length === 0) return;
      ctx.beginPath();
      ctx.lineJoin = join;
      ctx.moveTo(this.points[0].x, this.points[0].y);
      for (let i = 1; i < this.points.length; i++) {
         ctx.lineTo(this.points[i].x, this.points[i].y);
      }
      ctx.closePath();
      
      if (fill) {
         ctx.fillStyle = fill;
         ctx.fill();
      }
      if (stroke) {
         ctx.strokeStyle = stroke;
         ctx.lineWidth = lineWidth;
         ctx.stroke();
      }
   }
}


class GeoEnvelope {
   constructor(skeleton, width, roundness = 1) {
      if (skeleton) {
         this.skeleton = skeleton;
         this.poly = this.#generatePolygon(width, roundness);
      }
   }

   static load(info) {
      const env = new GeoEnvelope();
      env.skeleton = new LineSegment(
         new GeoPoint(info.skeleton.p1.x, info.skeleton.p1.y), 
         new GeoPoint(info.skeleton.p2.x, info.skeleton.p2.y)
      );
      env.poly = GeoPolygon.load(info.poly);
      return env;
   }

   #generatePolygon(width, roundness) {
      const { p1, p2 } = this.skeleton;

      const radius = width / 2;
      const alpha = getAngle(subPoints(p1, p2));
      const alpha_cw = alpha + Math.PI / 2;
      const alpha_ccw = alpha - Math.PI / 2;
      
      const points = [];
      const step = Math.PI / Math.max(1, roundness);
      const eps = step / 2;
      for (let i = alpha_ccw; i <= alpha_cw + eps; i += step) {
         points.push(translatePoint(p1, i, radius));
      }
      for (let i = alpha_ccw; i <= alpha_cw + eps; i += step) {
         points.push(translatePoint(p2, Math.PI + i, radius));
      }

      return new GeoPolygon(points);
   }

   draw(ctx, options) {
      this.poly.draw(ctx, options);
   }
}
