class AutonomousVehicle{
    constructor(x,y,width,height,controlType,angle=0,maxSpeed=3,color="#00ffd5"){
        this.startX = x;
        this.startY = y;
        this.center = new GeoPoint(x,y);
        this.width=width;
        this.height=height;

        this.speed=0;
        this.acceleration=0.2;
        this.maxSpeed=maxSpeed;
        this.friction=0.05;
        this.angle=angle;
        this.damaged=false;

        this.survivalScore = 0;
        this.maxForwardDisplacement = 0;

        // Optimized Background Stuck Detection
        this.fitnessHistory = [];
        this.stuckCheckCounter = 0;
        this.isStagnant = false;

        // Velocity Oscillation Detection (forward/backward loop)
        this.velocitySignHistory = [];
        this.oscillationCounter = 0;

        this.hasAI=controlType=="AI";

        if(controlType!="DUMMY"){
            this.lidar=new LidarArray(this);
            this.brain=new BrainArchitecture(
                [this.lidar.beamCount,12,10,4] 
            );
        }
        this.steering=new SteeringModule(controlType);

        this.img=new Image();
        this.img.src="assets/vehicleSprite.png"

        this.mask=document.createElement("canvas");
        this.mask.width=width;
        this.mask.height=height;

        const maskCtx=this.mask.getContext("2d");
        this.img.onload=()=>{
            maskCtx.fillStyle=color;
            maskCtx.rect(0,0,this.width,this.height);
            maskCtx.fill();

            maskCtx.globalCompositeOperation="destination-atop";
            maskCtx.drawImage(this.img,0,0,this.width,this.height);
        }
    }

    update(roadBorders,traffic){
        if(!this.damaged){
            this.#move();
            
            // ROUTE-BASED FITNESS: Use pathfinding distance along the road
            const distFromOrigin = calcDist(this.center, new GeoPoint(this.startX, this.startY));
            
            if (typeof routeDiscovery !== 'undefined' && routeDiscovery) {
                const navScore = routeDiscovery.getScoreAtLocation(this.center);
                // Use navScore if available, else fallback to physical distance from start
                this.survivalScore = navScore > 0 ? navScore : distFromOrigin;
            } else {
                this.survivalScore = distFromOrigin; 
            }
            
            // Tracking peak progress
            if(this.survivalScore > this.maxForwardDisplacement){
                this.maxForwardDisplacement = this.survivalScore;
            }

            // VELOCITY OSCILLATION DETECTION: +/-/+/- means looping
            const currentSign = this.speed > 0.1 ? 1 : (this.speed < -0.1 ? -1 : 0);
            if (currentSign !== 0) {
                this.velocitySignHistory.push(currentSign);
                if (this.velocitySignHistory.length > 20) this.velocitySignHistory.shift();

                if (this.velocitySignHistory.length >= 8) {
                    let signChanges = 0;
                    for (let k = 1; k < this.velocitySignHistory.length; k++) {
                        if (this.velocitySignHistory[k] !== this.velocitySignHistory[k-1]) signChanges++;
                    }
                    // 4+ sign changes in 20 frames = oscillating
                    if (signChanges >= 4) {
                        this.damaged = true;
                        this.isStagnant = true;
                    }
                }
            }

            // ZERO-VELOCITY IMMEDIATE ELIMINATION
            // 0.5 speed = 5.0 km/h on UI. If it's crawling slower than this for 15 frames, kill it.
            if (Math.abs(this.speed) < 0.5) {
                this.zeroSpeedCounter = (this.zeroSpeedCounter || 0) + 1;
                if (this.zeroSpeedCounter > 15) {
                    this.damaged = true;
                    this.isStagnant = true;
                }
            } else {
                this.zeroSpeedCounter = 0;
            }

            // ULTRA-FAST STUCK DETECTION (Every 30 frames)
            this.stuckCheckCounter++;
            if (this.stuckCheckCounter >= 30) { 
                this.stuckCheckCounter = 0;
                
                this.fitnessHistory.push(this.survivalScore);
                
                if (this.fitnessHistory.length > 2) { 
                    const pastScore = this.fitnessHistory.shift();
                    // PROGRESS CHECK: Must make strictly positive forward progress (> 15 units in 0.5s)
                    const progressMade = this.survivalScore - pastScore;
                    if (progressMade < 15) {
                        this.damaged = true; 
                        this.isStagnant = true;
                    }
                }
            }

            this.polygon=this.#createPolygon();
            
            // Only check for new collision damage if not already damaged by stuck/loop detection
            if (!this.damaged) {
                this.damaged=this.#assessDamage(roadBorders,traffic);
            }
        }
        if(this.lidar){
            this.lidar.scanEnvironment(roadBorders,traffic);
            const offsets=this.lidar.returns.map(
                s=>s==null?0:1-s.offset
            );
            const outputs=BrainArchitecture.processSignals(offsets,this.brain);

            if(this.hasAI){
                let fwd = outputs[0];
                let lft = outputs[1];
                let rgt = outputs[2];
                let rev = outputs[3];

                if (lft && rgt) { lft = 0; rgt = 0; }
                if (fwd && rev) { rev = 0; } 

                this.steering.forward = fwd;
                this.steering.left = lft;
                this.steering.right = rgt;
                this.steering.reverse = rev;
            }
        }
    }

    #assessDamage(roadBorders,traffic){
        for(let i=0;i<roadBorders.length;i++){
            if(doPolygonSegmentIntersect(this.polygon.points, roadBorders[i])){
                return true;
            }
        }
        for(let i=0;i<traffic.length;i++){
            if(doPolygonsIntersect(this.polygon.points,traffic[i].polygon.points)){
                return true;
            }
        }
        return false;
    }

    #createPolygon(){
        const points=[];
        const rad=Math.hypot(this.width,this.height)/2;
        const alpha=Math.atan2(this.width,this.height);
        points.push(new GeoPoint(
            this.center.x-Math.sin(this.angle-alpha)*rad,
            this.center.y-Math.cos(this.angle-alpha)*rad
        ));
        points.push(new GeoPoint(
            this.center.x-Math.sin(this.angle+alpha)*rad,
            this.center.y-Math.cos(this.angle+alpha)*rad
        ));
        points.push(new GeoPoint(
            this.center.x-Math.sin(Math.PI+this.angle-alpha)*rad,
            this.center.y-Math.cos(Math.PI+this.angle-alpha)*rad
        ));
        points.push(new GeoPoint(
            this.center.x-Math.sin(Math.PI+this.angle+alpha)*rad,
            this.center.y-Math.cos(Math.PI+this.angle+alpha)*rad
        ));
        return new GeoPolygon(points);
    }

    #move(){
        if(this.steering.forward){
            this.speed+=this.acceleration;
        }
        if(this.steering.reverse){
            this.speed-=this.acceleration;
        }

        if(this.speed>this.maxSpeed){
            this.speed=this.maxSpeed;
        }
        if(this.speed<-this.maxSpeed/2){
            this.speed=-this.maxSpeed/2;
        }

        if(this.speed>0){
            this.speed-=this.friction;
        }
        if(this.speed<0){
            this.speed+=this.friction;
        }
        if(Math.abs(this.speed)<this.friction){
            this.speed=0;
        }

        if(this.speed!=0){
            const flip=this.speed>0?1:-1;
            if(this.steering.left){
                this.angle+=0.07*flip; 
            }
            if(this.steering.right){
                this.angle-=0.07*flip;
            }
        }

        this.center.x-=Math.sin(this.angle)*this.speed;
        this.center.y-=Math.cos(this.angle)*this.speed;
    }

    draw(ctx, drawLidar=false, isLead=false){
        if(this.lidar && drawLidar){
            this.lidar.draw(ctx);
        }

        ctx.save();
        ctx.translate(this.center.x,this.center.y);
        ctx.rotate(-this.angle);
        
        if(!isLead){
            ctx.fillStyle = this.damaged ? "rgba(255, 0, 170, 0.4)" : "rgba(0, 255, 213, 0.25)";
            ctx.beginPath();
            ctx.rect(-this.width/2, -this.height/2, this.width, this.height);
            ctx.fill();
            if(!this.damaged) {
                ctx.strokeStyle = "rgba(0, 255, 213, 0.5)";
                ctx.lineWidth = 1;
                ctx.stroke();
            }
        } else {
            if(!this.damaged){
                ctx.drawImage(this.mask,
                    -this.width/2,
                    -this.height/2,
                    this.width,
                    this.height);
                ctx.globalCompositeOperation="multiply";
            }
            ctx.drawImage(this.img,
                -this.width/2,
                -this.height/2,
                this.width,
                this.height);
        }
        ctx.restore();
    }
}
