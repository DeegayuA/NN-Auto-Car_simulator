class LidarArray{
    constructor(vehicle){
        this.vehicle=vehicle;
        this.beamCount=5;
        this.beamLength=150;
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
        for(let i=0;i<this.beamCount;i++){
            let end=this.beams[i][1];
            if(this.returns[i]){
                end=this.returns[i];
            }

            ctx.beginPath();
            ctx.lineWidth=2;
            ctx.strokeStyle="#ff00aa"; // Neon hit
            ctx.moveTo(
                this.beams[i][0].x,
                this.beams[i][0].y
            );
            ctx.lineTo(
                end.x,
                end.y
            );
            ctx.stroke();

            ctx.beginPath();
            ctx.lineWidth=2;
            ctx.strokeStyle="#0a0b10"; // Dark pass-through
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
