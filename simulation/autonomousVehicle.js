class AutonomousVehicle{
    constructor(x,y,width,height,controlType,angle=0,maxSpeed=3,color="#00ffd5"){
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

        this.hasAI=controlType=="AI";

        if(controlType!="DUMMY"){
            this.lidar=new LidarArray(this);
            this.brain=new BrainArchitecture(
                [this.lidar.beamCount,6,4]
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
            this.survivalScore += this.speed;
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
                this.steering.forward=outputs[0];
                this.steering.left=outputs[1];
                this.steering.right=outputs[2];
                this.steering.reverse=outputs[3];
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
                this.angle+=0.03*flip;
            }
            if(this.steering.right){
                this.angle-=0.03*flip;
            }
        }

        this.center.x-=Math.sin(this.angle)*this.speed;
        this.center.y-=Math.cos(this.angle)*this.speed;
    }

    draw(ctx,drawLidar=false){
        if(this.lidar && drawLidar){
            this.lidar.draw(ctx);
        }

        ctx.save();
        ctx.translate(this.center.x,this.center.y);
        ctx.rotate(-this.angle);
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
        ctx.restore();
    }
}
