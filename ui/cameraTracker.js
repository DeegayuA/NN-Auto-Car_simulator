class CameraTracker {
   constructor(canvas, zoom = 1, offset = null) {
      this.canvas = canvas;
      this.ctx = canvas.getContext("2d");

      this.zoom = zoom;
      this.center = new GeoPoint(canvas.width / 2, canvas.height / 2);
      this.offset = offset ? offset : scalePoint(this.center, -1);

      this.drag = {
         start: new GeoPoint(0, 0),
         end: new GeoPoint(0, 0),
         offset: new GeoPoint(0, 0),
         active: false
      };

      this.ctx.save();
      this.#addEventListeners();
   }

   resize() {
      this.center = new GeoPoint(this.canvas.width / 2, this.canvas.height / 2);
   }

   reset() {
      this.ctx.restore();
      this.ctx.clearRect(0, 0, this.canvas.width, this.canvas.height);
      this.ctx.save();
      this.ctx.translate(this.center.x, this.center.y);
      this.ctx.scale(1 / this.zoom, 1 / this.zoom);
      const offset = this.getOffset();
      this.ctx.translate(offset.x, offset.y);
   }

   getMouse(evt, subtractDragOffset = false) {
      const p = new GeoPoint(
         (evt.offsetX - this.center.x) * this.zoom - this.offset.x,
         (evt.offsetY - this.center.y) * this.zoom - this.offset.y
      );
      return subtractDragOffset ? subPoints(p, this.drag.offset) : p;
   }

   getOffset() {
      return addPoints(this.offset, this.drag.offset);
   }

   #addEventListeners() {
      this.canvas.addEventListener("mousewheel", this.#handleMouseWheel.bind(this));
      this.canvas.addEventListener("mousedown", this.#handleMouseDown.bind(this));
      this.canvas.addEventListener("mousemove", this.#handleMouseMove.bind(this));
      this.canvas.addEventListener("mouseup", this.#handleMouseUp.bind(this));
   }

   #handleMouseDown(evt) {
      if (evt.button == 1) { // middle button
         this.drag.start = this.getMouse(evt);
         this.drag.active = true;
      }
   }

   #handleMouseMove(evt) {
      if (this.drag.active) {
         this.drag.end = this.getMouse(evt);
         this.drag.offset = subPoints(this.drag.end, this.drag.start);
      }
   }

   #handleMouseUp(evt) {
      if (this.drag.active) {
         this.offset = addPoints(this.offset, this.drag.offset);
         this.drag = {
            start: new GeoPoint(0, 0),
            end: new GeoPoint(0, 0),
            offset: new GeoPoint(0, 0),
            active: false
         };
      }
   }

   #handleMouseWheel(evt) {
      const dir = Math.sign(evt.deltaY);
      const step = 0.1;
      this.zoom += dir * step;
      this.zoom = Math.max(1, Math.min(5, this.zoom));
   }
}
