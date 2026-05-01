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

        this.hasAI=controlType=="AI";

        if(controlType!="DUMMY"){
            this.lidar=new LidarArray(this);
            this.brain=new BrainArchitecture(
                [this.lidar.beamCount,8,4] 
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
            
            // DISPLACEMENT-BASED FITNESS: No reward for forward/backward looping
            // We calculate how far the car has traveled from its start point in the map's forward direction
            const dist = calcDist(this.center, new GeoPoint(this.startX, this.startY));
            
            // Reverse penalty: If speed is negative, survivalScore decreases
            this.survivalScore += this.speed; 
            
            // Tracking peak progress to reward actual advancement
            if(this.survivalScore > this.maxForwardDisplacement){
                this.maxForwardDisplacement = this.survivalScore;
            }

            this.polygon=this.#createPolygon();
            this.damaged=this.#assessDamage(roadBorders,traffic);
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
