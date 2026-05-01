class LidarArray{
    constructor(vehicle){
        this.vehicle=vehicle;
        this.beamCount=5;
        this.beamLength=220; // Increased range for better turn anticipation
        this.beamSpread=Math.PI/2;

        this.beams=[];
        this.returns=[];
    }

    scanEnvironment(roadBorders,traffic){
        this.#emitBeams();
        this.returns=[];
        for(let i=0;i<this.beams.length;i++){
            this.returns.push(
                this.#calculateHit(
                    this.beams[i],
                    roadBorders,
                    traffic
                )
            );
        }
    }

    #calculateHit(beam,roadBorders,traffic){
        let touches=[];

        for(let i=0;i<roadBorders.length;i++){
            const touch=calculateIntersection(
                beam[0],
                beam[1],
                roadBorders[i].p1,
                roadBorders[i].p2
            );
            if(touch){
                touches.push(touch);
            }
        }

        for(let i=0;i<traffic.length;i++){
            const polyPoints=traffic[i].polygon.points;
            for(let j=0;j<polyPoints.length;j++){
                const value=calculateIntersection(
                    beam[0],
                    beam[1],
                    polyPoints[j],
                    polyPoints[(j+1)%polyPoints.length]
                );
                if(value){
                    touches.push(value);
                }
            }
        }

        if(touches.length==0){
            return null;
        }else{
            const offsets=touches.map(e=>e.offset);
            const minOffset=Math.min(...offsets);
            return touches.find(e=>e.offset==minOffset);
        }
    }

    #emitBeams(){
        this.beams=[];
        for(let i=0;i<this.beamCount;i++){
            const beamAngle=linearInterpolation(
                this.beamSpread/2,
                -this.beamSpread/2,
                this.beamCount==1?0.5:i/(this.beamCount-1)
            )+this.vehicle.angle;

            const start=new GeoPoint(this.vehicle.center.x, this.vehicle.center.y);
            const end=new GeoPoint(
                this.vehicle.center.x-Math.sin(beamAngle)*this.beamLength,
                this.vehicle.center.y-Math.cos(beamAngle)*this.beamLength
            );
            this.beams.push([start,end]);
        }
    }

    draw(ctx){
        if(!this.beams || this.beams.length === 0) return;
        
        for(let i=0;i<this.beamCount;i++){
            if (!this.beams[i]) continue;
            let end=this.beams[i][1];
            if(this.returns[i]){
                end=this.returns[i];
            }

            ctx.beginPath();
            ctx.lineWidth=2;
            ctx.strokeStyle="rgba(0, 255, 213, 0.4)"; 
            ctx.moveTo(
                this.beams[i][0].x,
                this.beams[i][0].y
            );
            ctx.lineTo(
                end.x,
                end.y
            );
            ctx.stroke();

            if(this.returns[i]) {
                ctx.beginPath();
                ctx.arc(end.x, end.y, 4, 0, Math.PI * 2);
                ctx.fillStyle = "#ff00aa";
                ctx.fill();
                
                ctx.beginPath();
                ctx.arc(end.x, end.y, 8, 0, Math.PI * 2);
                ctx.fillStyle = "rgba(255, 0, 170, 0.2)";
                ctx.fill();
            }

            ctx.beginPath();
            ctx.lineWidth=2;
            ctx.strokeStyle="rgba(255, 255, 255, 0.05)"; 
            ctx.moveTo(
                this.beams[i][1].x,
                this.beams[i][1].y
            );
            ctx.lineTo(
                end.x,
                end.y
            );
            ctx.stroke();
        }
    }        
}
