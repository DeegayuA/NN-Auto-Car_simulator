class SimulationWorld {
   constructor(
      graph,
      roadWidth = 100,
      roadRoundness = 10,
      buildingWidth = 150,
      buildingMinLength = 150,
      spacing = 50,
      treeSize = 160
   ) {
      this.graph = graph;
      this.roadWidth = roadWidth;
      this.roadRoundness = roadRoundness;
      this.buildingWidth = buildingWidth;
      this.buildingMinLength = buildingMinLength;
      this.spacing = spacing;
      this.treeSize = treeSize;

      this.envelopes = [];
      this.roadBorders = [];
      this.buildings = [];
      this.trees = [];
      this.laneGuides = [];

      this.markings = [];

      this.cars = [];
      this.bestCar = null;

      this.frameCount = 0;

      this.generate();
   }

   static load(info){
      const world = new SimulationWorld(new NodeGraph());
      world.graph = NodeGraph.load(info.graph);
      world.roadWidth = info.roadWidth;
      world.roadRoundness = info.roadRoundness;
      world.buildingWidth = info.buildingWidth;
      world.buildingMinLength = info.buildingMinLength;
      world.spacing = info.spacing;
      world.treeSize = info.treeSize;
      world.envelopes = info.envelopes.map((e) => GeoEnvelope.load(e));
      world.roadBorders = info.roadBorders.map((b) => new LineSegment(
         new GeoPoint(b.p1.x, b.p1.y), 
         new GeoPoint(b.p2.x, b.p2.y)
      ));
      world.buildings = info.buildings.map((e) => Structure.load(e));
      world.trees = info.trees.map((t) => new ObstacleTree(new GeoPoint(t.center.x, t.center.y), info.treeSize));
      world.laneGuides = info.laneGuides.map((g) => new LineSegment(
         new GeoPoint(g.p1.x, g.p1.y), 
         new GeoPoint(g.p2.x, g.p2.y)
      ));
      world.markings = info.markings.map((m) => WayPoint.load(m));
      world.zoom = info.zoom;
      world.offset = info.offset;
      return world;
   }

   generate() {
      this.envelopes.length = 0;
      for (const seg of this.graph.segments) {
         this.envelopes.push(
            new GeoEnvelope(seg, this.roadWidth, this.roadRoundness)
         );
      }

      this.roadBorders = GeoPolygon.union(this.envelopes.map((e) => e.poly));
      this.buildings = this.#generateBuildings();
      this.trees = this.#generateTrees();

      this.laneGuides.length = 0;
      this.laneGuides.push(...this.#generateLaneGuides());
   }

   #generateLaneGuides() {
      const tmpEnvelopes = [];
      for (const seg of this.graph.segments) {
         tmpEnvelopes.push(
            new GeoEnvelope(seg, this.roadWidth / 2, this.roadRoundness)
         );
      }
      const segments = GeoPolygon.union(tmpEnvelopes.map((e) => e.poly));
      return segments;
   }

   #generateTrees() {
      const points = [
         ...this.roadBorders.map((s) => [s.p1, s.p2]).flat(),
         ...this.buildings.map((b) => b.base.points).flat(),
      ];
      const left = Math.min(...points.map((p) => p.x));
      const right = Math.max(...points.map((p) => p.x));
      const top = Math.min(...points.map((p) => p.y));
      const bottom = Math.max(...points.map((p) => p.y));

      const illegalPolys = [
         ...this.buildings.map((b) => b.base),
         ...this.envelopes.map((e) => e.poly),
      ];

      const trees = [];
      let tryCount = 0;
      while (tryCount < 100) {
         const p = new GeoPoint(
            linearInterpolation(left, right, Math.random()),
            linearInterpolation(bottom, top, Math.random())
         );

         let keep = true;
         for (const poly of illegalPolys) {
            if (
               poly.containsPoint(p) ||
               poly.distanceToGeoPoint(p) < this.treeSize / 2
            ) {
               keep = false;
               break;
            }
         }

         if (keep) {
            for (const tree of trees) {
               if (calcDist(tree.center, p) < this.treeSize) {
                  keep = false;
                  break;
               }
            }
         }

         if (keep) {
            let closeToSomething = false;
            for (const poly of illegalPolys) {
               if (poly.distanceToGeoPoint(p) < this.treeSize * 2) {
                  closeToSomething = true;
                  break;
               }
            }
            keep = closeToSomething;
         }

         if (keep) {
            trees.push(new ObstacleTree(p, this.treeSize));
            tryCount = 0;
         }
         tryCount++;
      }
      return trees;
   }

   #generateBuildings() {
      const tmpEnvelopes = [];
      for (const seg of this.graph.segments) {
         tmpEnvelopes.push(
            new GeoEnvelope(
               seg,
               this.roadWidth + this.buildingWidth + this.spacing * 2,
               this.roadRoundness
            )
         );
      }

      const guides = GeoPolygon.union(tmpEnvelopes.map((e) => e.poly));

      for (let i = 0; i < guides.length; i++) {
         const seg = guides[i];
         if (seg.length() < this.buildingMinLength) {
            guides.splice(i, 1);
            i--;
         }
      }

      const supports = [];
      for (let seg of guides) {
         const len = seg.length() + this.spacing;
         const buildingCount = Math.floor(
            len / (this.buildingMinLength + this.spacing)
         );
         const buildingLength = len / buildingCount - this.spacing;

         const dir = seg.directionVector();

         let q1 = seg.p1;
         let q2 = addPoints(q1, scalePoint(dir, buildingLength));
         supports.push(new LineSegment(q1, q2));

         for (let i = 2; i <= buildingCount; i++) {
            q1 = addPoints(q2, scalePoint(dir, this.spacing));
            q2 = addPoints(q1, scalePoint(dir, buildingLength));
            supports.push(new LineSegment(q1, q2));
         }
      }

      const bases = [];
      for (const seg of supports) {
         bases.push(new GeoEnvelope(seg, this.buildingWidth).poly);
      }

      const eps = 0.001;
      for (let i = 0; i < bases.length - 1; i++) {
         for (let j = i + 1; j < bases.length; j++) {
            if (
               bases[i].intersectsPoly(bases[j]) ||
               bases[i].distanceToPoly(bases[j]) < this.spacing - eps
            ) {
               bases.splice(j, 1);
               j--;
            }
         }
      }

      return bases.map((b) => new Structure(b));
   }

   #getIntersections() {
      const subset = [];
      for (const point of this.graph.points) {
         let degree = 0;
         for (const seg of this.graph.segments) {
            if (seg.includes(point)) {
               degree++;
            }
         }

         if (degree > 2) {
            subset.push(point);
         }
      }
      return subset;
   }

   #updateTrafficLights() {
      const lights = this.markings.filter((m) => m instanceof TrafficLight);
      const controlCenters = [];
      for (const light of lights) {
         const point = getNearestGeoPoint(light.center, this.#getIntersections());
         let controlCenter = controlCenters.find((c) => c.equals(point));
         if (!controlCenter) {
            controlCenter = new GeoPoint(point.x, point.y);
            controlCenter.lights = [light];
            controlCenters.push(controlCenter);
         } else {
            controlCenter.lights.push(light);
         }
      }
      const greenDuration = 2,
         yellowDuration = 1;
      for (const center of controlCenters) {
         center.ticks = center.lights.length * (greenDuration + yellowDuration);
      }
      const tick = Math.floor(this.frameCount / 60);
      for (const center of controlCenters) {
         const cTick = tick % center.ticks;
         const greenYellowIndex = Math.floor(
            cTick / (greenDuration + yellowDuration)
         );
         const greenYellowState =
            cTick % (greenDuration + yellowDuration) < greenDuration
               ? "green"
               : "yellow";
         for (let i = 0; i < center.lights.length; i++) {
            if (i == greenYellowIndex) {
               center.lights[i].state = greenYellowState;
            } else {
               center.lights[i].state = "red";
            }
         }
      }
      this.frameCount++;
   }

    draw(ctx, viewPoint, showStartMarkings = true, renderRadius = 1500) {
       if (!viewPoint) return;
       this.#updateTrafficLights();
 
       // THEME AWARE COLORS
       const mainColor = getThemeColor("--neon-cyan");
       const bgColor = getThemeColor("--bg-main");
       const gridOpacityFactor = isDarkTheme ? 1 : 0.6;
 
       // Draw Dynamic Background Grid
       ctx.save();
       const gridSize = 200;
       const startX = Math.floor((viewPoint.x - renderRadius) / gridSize) * gridSize;
       const startY = Math.floor((viewPoint.y - renderRadius) / gridSize) * gridSize;
       
       if (isDarkTheme) {
          // Dark Theme: Multi-layer neon glow
          ctx.strokeStyle = mainColor + "26"; // 15% opacity
          ctx.lineWidth = 10;
          for (let x = startX; x < viewPoint.x + renderRadius; x += gridSize) {
             ctx.beginPath(); ctx.moveTo(x, viewPoint.y - renderRadius); ctx.lineTo(x, viewPoint.y + renderRadius); ctx.stroke();
          }
          for (let y = startY; y < viewPoint.y + renderRadius; y += gridSize) {
             ctx.beginPath(); ctx.moveTo(viewPoint.x - renderRadius, y); ctx.lineTo(viewPoint.x + renderRadius, y); ctx.stroke();
          }
       }
 
       // Primary Grid
       ctx.strokeStyle = mainColor + (isDarkTheme ? "B3" : "4D"); // 70% vs 30%
       ctx.lineWidth = isDarkTheme ? 2 : 1;
       for (let x = startX; x < viewPoint.x + renderRadius; x += gridSize) {
          ctx.beginPath(); ctx.moveTo(x, viewPoint.y - renderRadius); ctx.lineTo(x, viewPoint.y + renderRadius); ctx.stroke();
       }
       for (let y = startY; y < viewPoint.y + renderRadius; y += gridSize) {
          ctx.beginPath(); ctx.moveTo(viewPoint.x - renderRadius, y); ctx.lineTo(viewPoint.x + renderRadius, y); ctx.stroke();
       }
       ctx.restore();
 
       for (const seg of this.graph.segments) {
          seg.draw(ctx, { color: mainColor + "66", width: 4, dash: [10, 10] });
       }
 
       for (const env of this.envelopes) {
          // Road fill adapts to background
          const roadFill = isDarkTheme ? "rgba(15, 16, 22, 0.95)" : "rgba(220, 225, 230, 0.95)";
          env.draw(ctx, { fill: roadFill });
       }
       
       for (const marking of this.markings) {
          if (marking.type != "start" || showStartMarkings) {
             marking.draw(ctx);
          }
       }
 
       for (const border of this.roadBorders) {
          border.draw(ctx, { color: mainColor, width: 5 });
       }

      ctx.globalAlpha = 0.2;
      for (const car of this.cars) {
         car.draw(ctx);
      }
      ctx.globalAlpha = 1;
      if(this.bestCar) {
         this.bestCar.draw(ctx, true);
      }

      const items = [...this.buildings, ...this.trees].filter(
         (i) => i.base.distanceToGeoPoint(viewPoint) < renderRadius
      );
      items.sort(
         (a, b) =>
            b.base.distanceToGeoPoint(viewPoint) -
            a.base.distanceToGeoPoint(viewPoint)
      );
      for (const item of items) {
         item.draw(ctx, viewPoint);
      }
   }
}
