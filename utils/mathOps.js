function getNearestGeoPoint(loc, points, threshold = Number.MAX_SAFE_INTEGER) {
   let minDist = Number.MAX_SAFE_INTEGER;
   let nearest = null;
   for (const point of points) {
      const dist = calcDist(point, loc);
      if (dist < minDist && dist < threshold) {
         minDist = dist;
         nearest = point;
      }
   }
   return nearest;
}

function getNearestLineSegment(loc, segments, threshold = Number.MAX_SAFE_INTEGER) {
   let minDist = Number.MAX_SAFE_INTEGER;
   let nearest = null;
   for (const seg of segments) {
      const dist = seg.distanceToGeoPoint(loc);
      if (dist < minDist && dist < threshold) {
         minDist = dist;
         nearest = seg;
      }
   }
   return nearest;
}

function calcDist(p1, p2) {
   return Math.hypot(p1.x - p2.x, p1.y - p2.y);
}

function calcAvg(p1, p2) {
   return new GeoPoint((p1.x + p2.x) / 2, (p1.y + p2.y) / 2);
}

function dotProduct(p1, p2) {
   return p1.x * p2.x + p1.y * p2.y;
}

function addPoints(p1, p2) {
   return new GeoPoint(p1.x + p2.x, p1.y + p2.y);
}

function subPoints(p1, p2) {
   return new GeoPoint(p1.x - p2.x, p1.y - p2.y);
}

function scalePoint(p, scaler) {
   return new GeoPoint(p.x * scaler, p.y * scaler);
}

function normalizeVector(p) {
   return scalePoint(p, 1 / calcMagnitude(p));
}

function calcMagnitude(p) {
   return Math.hypot(p.x, p.y);
}

function getPerpendicular(p) {
   return new GeoPoint(-p.y, p.x);
}

function translatePoint(loc, angle, offset) {
   return new GeoPoint(
      loc.x + Math.cos(angle) * offset,
      loc.y + Math.sin(angle) * offset
   );
}

function getAngle(p) {
   return Math.atan2(p.y, p.x);
}

function calculateIntersection(pointA, pointB, pointC, pointD) {
   const tTop = (pointD.x - pointC.x) * (pointA.y - pointC.y) - (pointD.y - pointC.y) * (pointA.x - pointC.x);
   const uTop = (pointC.y - pointA.y) * (pointA.x - pointB.x) - (pointC.x - pointA.x) * (pointA.y - pointB.y);
   const bottom = (pointD.y - pointC.y) * (pointB.x - pointA.x) - (pointD.x - pointC.x) * (pointB.y - pointA.y);

   const eps = 0.001;
   if (Math.abs(bottom) > eps) {
      const t = tTop / bottom;
      const u = uTop / bottom;
      if (t >= 0 && t <= 1 && u >= 0 && u <= 1) {
         return {
            x: linearInterpolation(pointA.x, pointB.x, t),
            y: linearInterpolation(pointA.y, pointB.y, t),
            offset: t,
         };
      }
   }

   return null;
}

function linearInterpolation(a, b, t) {
   return a + (b - a) * t;
}

function lerp2DPoints(pointA, pointB, t) {
   return new GeoPoint(linearInterpolation(pointA.x, pointB.x, t), linearInterpolation(pointA.y, pointB.y, t));
}

function inverseLerp(a, b, v) {
   return (v - a) / (b - a);
}

function degreesToRadians(degree) {
   return degree * Math.PI / 180;
}

function generateRandomColorTheme() {
   // Generate neon aesthetics
   const hues = [180, 300, 60, 330]; // cyan, magenta, yellow, pink
   const hue = hues[Math.floor(Math.random() * hues.length)] + (Math.random() * 20 - 10);
   return "hsl(" + hue + ", 100%, 65%)";
}

function calcFake3dPoint(point, viewPoint, height) {
   const dir = normalizeVector(subPoints(point, viewPoint));
   const dist = calcDist(point, viewPoint);
   const scaler = Math.atan(dist / 300) / (Math.PI / 2);
   return addPoints(point, scalePoint(dir, height * scaler));
}

function doPolygonsIntersect(polyA, polyB){
    for(let i=0;i<polyA.length;i++){
        for(let j=0;j<polyB.length;j++){
            const touch=calculateIntersection(
                polyA[i],
                polyA[(i+1)%polyA.length],
                polyB[j],
                polyB[(j+1)%polyB.length]
            );
            if(touch){
                return true;
            }
        }
    }
    return false;
}

function doPolygonSegmentIntersect(polyPoints, segment){
    for(let i=0;i<polyPoints.length;i++){
        const touch=calculateIntersection(
            polyPoints[i],
            polyPoints[(i+1)%polyPoints.length],
            segment.p1,
            segment.p2
        );
        if(touch){
            return true;
        }
    }
    return false;
}

function getNeonRGBA(value){
    const alpha=Math.abs(value);
    const R=value<0?0:0; // Cyan vs Magenta weights
    const G=value<0?255:0;
    const B=value<0?255:255;
    const r=value<0?0:255;
    const g=value<0?255:0;
    const b=value<0?255:255;
    return "rgba("+r+","+g+","+b+","+alpha+")";
}
