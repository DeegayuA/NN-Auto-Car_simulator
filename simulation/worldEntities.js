class ObstacleTree {
   constructor(center, size, height = 200) {
      this.center = center;
      this.size = size; // size of the base
      this.height = height;
      this.base = this.#generateLevel(center, size);
   }

   #generateLevel(point, size) {
      const points = [];
      const rad = size / 2;
      for (let a = 0; a < Math.PI * 2; a += Math.PI / 16) {
         const kindOfRandom = Math.cos(((a + this.center.x) * size) % 17) ** 2;
         const noisyRadius = rad * linearInterpolation(0.5, 1, kindOfRandom);
         points.push(translatePoint(point, a, noisyRadius));
      }
      return new GeoPolygon(points);
   }

   draw(ctx, viewPoint) {
      const top = calcFake3dPoint(this.center, viewPoint, this.height);
      const levelCount = 7;
      
      const treeMainColor = isDarkTheme ? "#00ffd5" : "#27ae60";

      for (let level = 0; level < levelCount; level++) {
         const t = level / (levelCount - 1);
         const point = lerp2DPoints(this.center, top, t);
         
         const g = linearInterpolation(50, 150, t);
         const color = isDarkTheme 
            ? `rgb(15, ${g}, 150)` 
            : `rgb(39, ${linearInterpolation(120, 200, t)}, 96)`;
         
         const size = linearInterpolation(this.size, 40, t);
         const poly = this.#generateLevel(point, size);
         poly.draw(ctx, { fill: color, stroke: treeMainColor + "33" }); // 20% opacity
      }
   }
}

class Structure {
   constructor(poly, height = 200) {
      this.base = poly;
      this.height = height;
   }

   static load(info) {
      return new Structure(GeoPolygon.load(info.base), info.height);
   }

   draw(ctx, viewPoint) {
      const topPoints = this.base.points.map((p) =>
         calcFake3dPoint(p, viewPoint, this.height * 0.6)
      );
      const ceiling = new GeoPolygon(topPoints);

      const sides = [];
      for (let i = 0; i < this.base.points.length; i++) {
         const nextI = (i + 1) % this.base.points.length;
         const poly = new GeoPolygon([
            this.base.points[i], this.base.points[nextI],
            topPoints[nextI], topPoints[i]
         ]);
         sides.push(poly);
      }
      sides.sort(
         (a, b) =>
            b.distanceToGeoPoint(viewPoint) -
            a.distanceToGeoPoint(viewPoint)
      );

      const baseMidpoints = [
         calcAvg(this.base.points[0], this.base.points[1]),
         calcAvg(this.base.points[2], this.base.points[3])
      ];

      const topMidpoints = baseMidpoints.map((p) =>
         calcFake3dPoint(p, viewPoint, this.height)
      );

      const roofPolys = [
         new GeoPolygon([
            ceiling.points[0], ceiling.points[3],
            topMidpoints[1], topMidpoints[0]
         ]),
         new GeoPolygon([
            ceiling.points[2], ceiling.points[1],
            topMidpoints[0], topMidpoints[1]
         ])
      ];
      roofPolys.sort(
         (a, b) =>
            b.distanceToGeoPoint(viewPoint) -
            a.distanceToGeoPoint(viewPoint)
      );

      // THEME AWARE COLORS FOR STRUCTURES
      const wallColor = isDarkTheme ? "#0a0b10" : "#ffffff";
      const baseColor = isDarkTheme ? "#1a1a24" : "#dfe6e9";
      const roofColor = isDarkTheme ? "#14151f" : "#f1f2f6";
      
      const cyan = getThemeColor("--neon-cyan");
      const magenta = getThemeColor("--neon-magenta");
      const yellow = getThemeColor("--neon-yellow");

      this.base.draw(ctx, { fill: baseColor, stroke: cyan + "80", lineWidth: 15 });
      for (const side of sides) {
         side.draw(ctx, { fill: wallColor, stroke: cyan });
      }
      ceiling.draw(ctx, { fill: roofColor, stroke: magenta, lineWidth: 6 });
      for (const poly of roofPolys) {
         poly.draw(ctx, { fill: roofColor, stroke: yellow, lineWidth: 8, join: "round" });
      }
   }
}
